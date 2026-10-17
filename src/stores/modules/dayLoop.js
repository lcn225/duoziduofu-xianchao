// 「桂冈的一天」的 store 侧接线 —— 纯函数在 plugins/dayLoop.js，这里只做副作用与状态托管。
//
// ⚠ 三条最容易踩的：
//   1. **advanceDayLoop 是每 tick 的唯一入口**，它取代了原来直接调 `gainSpirit` 的那一行。
//      注册点在 stores/modules/clock.js 的 startClock() 里（在 `if (!hooked)` 之内 ——
//      注册到某个页面的 onMounted 会让切页后循环冻在半路，而且看起来完全正常）。
//   2. **灵力只在练功切片给**。其余阶段一分不给 —— 这是「练功是主业」这条设计的前提。
//   3. **末尾必须 saveData()**。原来唯一每秒落盘的是 core.gainSpirit；现在非练功的 tick
//      没有它兜底，漏掉就是「刷新即丢」（CLAUDE.md 坑 §11）。
import {
  TUNING as DAY_TUNING,
  LOG_LIMIT,
  createDayState,
  rebaseDayState,
  stepDay,
  scheduleView,
  currentTaskView,
  daySummaryOf,
  setPatrolHours as setPatrolHoursPure,
  setBodyEnabled as setBodyEnabledPure,
  requestInterrupt as requestInterruptPure,
  requestStopInteracting as requestStopInteractingPure,
  GAME_SECONDS_PER_HOUR
} from '../../plugins/dayLoop'
import { pickAutoWives } from '../../plugins/innerCourt'
import { getCultivationCost, rollCultivationGain } from '../../plugins/cultivationMath'
import { nextWakeTime } from '../../plugins/dayLoop'
import { skipTo } from '../../plugins/gameClock'

/**
 * 防重入：`advanceDayLoop` → `sleepToDawn` → `advanceDayLoop` 会走一层嵌套。
 * 正常情况下第二层结束时 phase 已经是新一天的 patrol、不会再触发，
 * 但万一将来加了别的自动跳转，没这个闸就会转成死循环。
 */
let autoSkipping = false

/**
 * 打坐收益的累加器，**活在模块闭包里**（不进 state：它是过程值，不该进存档）。
 *
 * 为什么必须跨 tick 存活：一个练功轮 = 1 游戏小时 = 4 个 tick，
 * 而 `advanceDayLoop` 每个 tick 只调一次。放在函数体里的话每 tick 清零，
 * 流水账就会把一轮报成「0.25 小时」而不是「1 小时」（这个 bug 已经踩过一次）。
 * 按 `taskStart` 归属，任务收尾时清空。
 */
let medAcc = { taskStart: null, cultivation: 0, bodyCultivation: 0 }

// ---------- 流水账的文字 ----------

/** 数值：小的留一位小数，大的取整。流水里没人想看 11.520000000000001 */
const fmtNum = v => (Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10)
/** 带符号。0 附近的分项不显示，免得流水被「+0」淹没 */
const signed = (v, keep = 0.05) => (Math.abs(v) < keep ? null : `${v >= 0 ? '+' : '-'}${fmtNum(Math.abs(v))}`)

/**
 * 把一个环节的**结算结果**写成人话（放进流水账）。
 *
 * 例：`练功 1 小时 · 灵力 +11.5 · 修为 +1 · 精力 +10 · 体力 -3`
 *
 * ⚠ 灵力那一项是**产出量**，不是余额变化 —— 它紧接着就被打坐花掉了，
 *   看余额会永远是 0。修为/体魄同理，取的是掷出来的收益。
 */
const settlementText = s => {
  const bits = [
    ['灵力', signed(s.spirit)],
    ['修为', signed(s.cultivation)],
    ['体魄', signed(s.bodyCultivation)],
    ['精力', signed(s.focus)],
    ['体力', signed(s.stamina)]
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `${k} ${v}`)

  const tail = bits.length ? ` · ${bits.join(' · ')}` : ''
  const h =
    s.hours >= 1 / 60 ? `${Math.round(s.hours * 10) / 10} 小时` : `${Math.round(s.hours * 60)} 分`

  switch (s.kind) {
    case 'patrol':
      return `巡视乡间 ${h}（封地未开放，无产出）${tail}`
    case 'body':
      return `炼体 ${h}${tail}`
    case 'practice':
      return `练功 ${h}${tail}`
    case 'sleep':
      return `睡觉 ${h}${tail}`
    default:
      return `${s.kind} ${h}${tail}`
  }
}

export const state = () => ({
  /**
   * 「桂冈的一天」的当日状态。
   *
   * **null = 还没初始化**（首次 tick / 刚读档）—— 由 `ensureDayLoop()` 按当前游戏时间建。
   * ⚠ 不能给一个「从 0 开始」的默认值：读档时 clockGameTime 可能已经是几十万秒，
   *   初始状态若锚在 0，第一次推进会把几十万秒当作「今天已经过去」补算一遍。
   * 结构见 `plugins/dayLoop.js` 的 `createDayState()`。
   */
  dayLoop: null
})

export const getters = {
  /** 当前阶段：patrol | idle | loop | evening | sleep（未初始化时 idle） */
  dayPhase() {
    return this.dayLoop?.phase || 'idle'
  },
  /** 精力 —— 上限固定 100，本批没有百艺消耗它，所以白天恒满（《桂冈的一天》§十四） */
  focus() {
    return this.dayLoop?.focus ?? DAY_TUNING.focusMax
  },
  focusMax() {
    return DAY_TUNING.focusMax
  },
  /** 体力 —— 转发内宅的字段，**全仓库只此一个真源**（字段名 energy 是历史包袱） */
  stamina() {
    return this.energy
  },
  staminaMax() {
    return this.energyMax
  },
  /** 当前任务卡：名称 / 进度 / 剩余（给进度条用） */
  dayTaskView() {
    return this.dayLoop ? currentTaskView(this.dayLoop, this.clockGameTime) : null
  },
  /** 今日安排清单（✅ 已完成 / 🔄 进行中 / ⬜ 待办） */
  daySchedule() {
    return this.dayLoop ? scheduleView(this.dayLoop, this.clockGameTime) : []
  },
  daySummary() {
    return daySummaryOf(this.dayLoop)
  },
  dayLog() {
    return this.dayLoop?.log || []
  },
  /** 今天过去了多少（0~1），给「第 N 年 · 某月某日」下的进度用 */
  dayProgressPct() {
    if (!this.dayLoop) return 0
    const elapsed = this.clockGameTime - this.dayLoop.dayStartSeconds
    return Math.min(Math.max(elapsed / 86400, 0), 1)
  }
}

export const actions = {
  /** 首次 tick / 读档后按当前游戏时间建当日状态。重复调用无害 */
  ensureDayLoop(nowSeconds = 0) {
    if (this.dayLoop) return
    this.dayLoop = createDayState({
      nowSeconds,
      patrolHours: DAY_TUNING.patrol.defaultHours,
      bodyEnabled: false,
      focus: DAY_TUNING.focusMax
    })
  },

  /**
   * 从探索/秘境回镇守时调用（由 idle.switchIdleMode 转发）。
   *
   * ⚠ 不能简单 `resetDayLoop()`：那会丢掉当前任务与当天流水，玩家一回家
   *   就从巡视重新开始。`rebaseDayState` 只保留「剩余的那一段」，离开期间
   *   的游戏秒**一笔都不结算**。
   */
  resumeGarrisonMode(nowSeconds = this.clockGameTime) {
    const now = Number(nowSeconds) || 0
    this.ensureDayLoop(now)
    const { state, freshDay } = rebaseDayState(this.dayLoop, now, {
      leftAtSeconds: this.garrisonLeftAtSeconds
    })
    this.dayLoop = state
    if (freshDay) this.pushDayLog(`── 归来 · 第 ${state.workDayIndex + 1} 日 ──`)
    this.saveData()
  },

  /**
   * ★ **每 tick 的唯一入口**（由 clock.js 的 tick 钩子调用）。
   *
   * 顺序不能乱：
   *   ① 先算纯函数（不改 store）→ ② 写回 dayLoop → ③ 逐切片结算副作用 → ④ 落盘
   *
   * @param toSeconds 本 tick 结束时的游戏秒（= clockState.currentTime）
   */
  advanceDayLoop(toSeconds) {
    if (!toSeconds || toSeconds <= 0) return
    this.ensureDayLoop(toSeconds)

    const idleWifeCount = this.wives.filter(w => w.status === 'idle').length
    const prevDay = this.dayLoop.workDayIndex

    const r = stepDay(this.dayLoop, toSeconds, {
      stamina: this.energy,
      staminaMax: this.energyMax,
      idleWifeCount
    })

    this.dayLoop = r.state

    // 换日了没有 —— **先记下来，分隔行等这一轮的流水都写完再插**（见本函数末尾）。
    const dayChanged = r.state.workDayIndex !== prevDay

    // 突破检测：结算前后比一下内外功等级（打坐可能顺带把修为顶到上限并突破）
    const inner0 = this.level
    const body0 = this.bodyLevel

    // 逐切片结算。slices 是按**任务边界**切开的，每片落在同一个任务内，比例精确。
    // 打坐的收益按 `taskStart` 累到模块闭包的 acc 里 —— 它必须跨 tick 存活，
    // 因为一个练功轮跨 4 个 tick（放函数体里会每个 tick 清零）。
    for (const sl of r.slices) {
      // 灵力 + 熟练度：**只有练功段**（gainSpirit 内部会 saveData 并累积熟练度）
      if (sl.spirit) this.gainSpirit(sl.gameSeconds)
      // 体力：消耗与回补都走这两个 action，保证「全仓库只有一处 clamp 规则」
      if (sl.staminaDelta < 0) this.spendStamina(-sl.staminaDelta)
      else if (sl.staminaDelta > 0) this.recoverStamina(sl.staminaDelta)
      // 打坐：把灵力换成修为（练功）/ 体魄（炼体）
      if (sl.kind === 'practice' || sl.kind === 'body') {
        if (medAcc.taskStart !== sl.taskStart) {
          medAcc = { taskStart: sl.taskStart, cultivation: 0, bodyCultivation: 0 }
        }
        const md = this.meditateInSlice(sl.gameSeconds, sl.kind === 'body' ? 'outer' : 'inner')
        // `|| 0` 是保险丝：将来若有人再给 meditateInSlice 加一个 `return 0` 的提前返回，
        // 这里只会少记一次，不会把整条流水账变成 NaN
        if (sl.kind === 'body') medAcc.bodyCultivation += md?.gained || 0
        else medAcc.cultivation += md?.gained || 0
      }
    }

    // 流水账：**先把这一 tick 里跑完的环节记上**。
    //
    // ⚠ **顺序不能反**：`pending` 里的晚间互动发生在这之后，而且它自己也会写一条流水。
    //   先跑互动就会让「妻妾互动」排在**同一个 tick** 里刚做完的「练功」前面 ——
    //   两条时间戳一模一样，玩家一眼就看出倒序。
    //   （原则：流水按**事件实际发生的先后**写，而不是按代码顺手。）
    for (const c of r.completions) {
      // ⚠ 候工与晚间**不进流水**：
      //   · `idle` 是纯空转（巡视不满 2 小时时闲到 8:00），没有任何结算
      //   · `evening` 已有自己的简报（`runDayEvening` 写的「妻妾互动 N 位 · 有喜 M 位」）；
      //     而且它没互动时是个 1 秒的占位任务，会打印出「evening 0 分」这种内部术语
      if (c.kind !== 'idle' && c.kind !== 'evening') {
        this.pushDayLog(
          settlementText({
            kind: c.kind,
            hours: c.hours,
            focus: c.focusDelta,
            stamina: c.staminaDelta,
            // 灵力是**产出量**：由时长乘速率算，不取余额变化（它立刻被打坐花掉了）
            spirit: c.spiritSeconds > 0 ? this.spiritPerGameHour * (c.spiritSeconds / GAME_SECONDS_PER_HOUR) : 0,
            cultivation: c.kind === 'practice' ? medAcc.cultivation : 0,
            bodyCultivation: c.kind === 'body' ? medAcc.bodyCultivation : 0
          })
        )
      }
      if (c.taskStart === medAcc.taskStart) medAcc = { taskStart: null, cultivation: 0, bodyCultivation: 0 }
    }

    // 突破是当天最大的「结算结果」，单独报一句（境界名变了就是突破了）
    if (this.level !== inner0) this.pushDayLog(`★ 突破：内功已入${this.realm}`)
    if (this.bodyLevel !== body0) this.pushDayLog(`★ 突破：外功已入${this.bodyRealm}`)

    // 需要 store 去做副作用的动作（晚间互动）—— **放在环节之后**，见上面那段注释
    for (const p of r.pending) {
      if (p.kind === 'evening') this.runDayEvening(p.count)
    }

    // 换日分隔：**放在最后**。上一日的「睡觉」是这一轮里最晚发生的事，
    // 而睡觉的完成是在 `sleepToDawn()` 的嵌套调用里记的 —— 分隔行必须排在它后面。
    // （以前把它放在最前面，于是「── 第 N 日 ──」会夹在「妻妾互动」和「睡觉」之间。）
    if (dayChanged) this.pushDayLog(`── 第 ${r.state.workDayIndex + 1} 日 ──`)

    // ⚠ **不可省**。原来唯一的每秒落盘点是 core.gainSpirit，而它现在只在练功段被调用；
    //   巡视 / 炼体 / 互动 / 睡觉这些段没有它兜底，漏掉这一句就是「刷新即丢」。
    if (!r.slices.some(sl => sl.spirit)) this.saveData()

    // 睡觉**自动跳过**：睡觉是一天里最长的一段（默认 10.5 游戏小时 ≈ 42 现实秒）
    // 且全程没有任何产出 —— 让玩家每天点一次「睡到天亮」是不现实的。
    // 这里在进入 sleep 的当口就跳到次日 06:00，整段睡眠仍然被 stepDay 正常结算
    // （体力回满、换日、流水），只是不在现实时间里干等。
    if (this.dayLoop.phase === 'sleep' && !autoSkipping) {
      autoSkipping = true
      try {
        this.sleepToDawn()
      } finally {
        autoSkipping = false
      }
    }
  },

  /**
   * 打坐若干次 —— 把**灵力**换成**修为**（内功）或**体魄**（外功）。
   *
   * 为什么练功环节要顺带做这个：设计里这个环节的名字就是「**练功（打坐）**」
   * （《桂冈的一天》§2.1），也就是「产灵力」和「打坐」在同一小时里发生。
   * 少了这一步，灵力只会一直堆着、**修为永远是 0** —— 主界面上根本看不到成长。
   *
   * 次数受两件事限制：① `TUNING.practice.meditationSeconds`（每 1 游戏分钟一次，防老档
   * 攒的一大笔灵力被一个切片抽干）；② 当前灵力余额。
   * 换算公式取 `plugins/cultivationMath.js`，**不在这里另写一份**。
   *
   * @returns {{times:number, gained:number}} 实际打坐次数与掷出的修为（给流水账用）
   */
  meditateInSlice(gameSeconds, path = 'inner') {
    const level = path === 'outer' ? this.bodyLevel : this.level
    const cost = getCultivationCost(level)
    // ⚠ 这两个提前返回必须返回**同形状的对象**，不能 `return 0` ——
    //   调用方读的是 `md.gained`，返回数字会得到 undefined，
    //   累加进流水账的累加器就变成 `NaN`（症状：日志写「体魄 -NaN」）。
    //   尤其是 `cap <= 0`：切片比 1 游戏分钟还短时必然命中，而
    //   `settle.hours` 是整任务累计的，所以日志上还显示着「1 小时」，很难往这里想。
    if (!(cost > 0)) return { times: 0, gained: 0 }
    const cap = Math.floor((Number(gameSeconds) || 0) / DAY_TUNING.practice.meditationSeconds)
    if (cap <= 0) return { times: 0, gained: 0 }

    let times = 0
    let gained = 0
    while (times < cap && this.spirit >= cost) {
      // 内功已顶到上限、又被契合度门槛拦着 —— 再打坐只是白烧灵力
      if (path === 'inner' && this.cultivation >= this.maxCultivation && this.isBreakthroughBlocked) break
      this.spirit -= cost
      gained += rollCultivationGain(level, this.luck)
      times += 1
    }
    // 英烈祠：每块牌位 +1% 打坐修为，上限 +10%（《秘境系统》§六）。
    // 只加内功，外功不吃这个加成。
    if (times && path === 'inner') {
      const bonus = Number(this.shrineCultivationBonus) || 0
      if (bonus > 0) gained *= 1 + bonus
    }
    if (times) {
      if (path === 'outer') this.cultivateBody(gained)
      else this.cultivate(gained)
    }
    return { times, gained }
  },

  /**
   * 睡到天亮 —— 把时钟直接推到次日 06:00，并立刻结算这段睡眠。
   *
   * ⚠ **由 `advanceDayLoop` 在进入 sleep 时自动调用**，不是等玩家点按钮 ——
   * 睡觉是一天里最长的一段（默认 10.5 游戏小时 ≈ 42 现实秒）且全程无产出，
   * 玩家不可能每天点一次。留成 action 是为了让自动跳转有单一入口、也方便测试。
   *
   * 走 `skipTo` 而不是 `setCurrentTime` —— 后者不会补触发途中跨过的 hour/day 边界，
   * 内宅的每日推进（孕程、位阶晋升）就会整段漏跑。
   */
  sleepToDawn() {
    const d = this.dayLoop
    if (!d || d.phase !== 'sleep') return
    const target = nextWakeTime(d.dayStartSeconds)
    if (!(target > this.clockGameTime)) return
    skipTo(target)
    this.clockGameTime = target
    // 立刻把这段睡眠结算掉（体力回满 + 换日），别等下一个 tick
    this.advanceDayLoop(target)
  },

  /**
   * 晚间互动 —— 一次算清今晚几位，交给内宅**已测过**的那套判定。
   *
   * 为什么是一次调用而不是每晚调 n 次：`interactEvening(wifeIds)` 收的是一组侍妾、
   * 一次扣完，且被 `canInteractToday` 限成每游戏天一次。「30m/次」在那边本来就是
   * 「一位 30 分钟」的意思，所以一次调用 + n 位与设计 §2.2 完全一致。
   */
  runDayEvening(count = 0) {
    const n = Math.floor(Number(count) || 0)
    if (n <= 0) return
    const ids = pickAutoWives({
      wives: this.wives,
      rule: this.innerCourt?.autoRule,
      energy: this.energy
    }).slice(0, n)
    if (!ids.length) return

    const res = this.interactEvening(ids, { auto: true })
    if (!res.success) {
      this.pushDayLog(`晚间未成：${res.message}`)
      return
    }
    const hit = res.results.filter(x => x.pregnant).length
    this.pushDayLog(`妻妾互动 ${ids.length} 位${hit ? ` · 有喜 ${hit} 位` : ''}`)
  },

  pushDayLog(text) {
    const d = this.dayLoop
    if (!d) return
    d.log = [...(d.log || []), { at: this.clockGameTime, text }].slice(-LOG_LIMIT)
  },

  // ---------- 玩家介入 ----------

  /** 调整巡视时长（1~5 小时）。只影响明天与之后的巡视 */
  setDayPatrolHours(hours) {
    if (!this.dayLoop) return
    this.dayLoop = setPatrolHoursPure(this.dayLoop, hours)
    this.saveData()
  },

  /** 勾选 / 取消炼体。当天即生效（下一个小循环任务重算队列） */
  setDayBodyEnabled(enabled) {
    if (!this.dayLoop) return
    this.dayLoop = setBodyEnabledPure(this.dayLoop, enabled)
    this.saveData()
  },

  /** 打断循环 —— 做完当前任务就下班 */
  interruptDayLoop() {
    if (!this.dayLoop) return
    this.dayLoop = requestInterruptPure(this.dayLoop)
    this.pushDayLog('打断循环：做完手上这轮就下班')
    this.saveData()
  },

  /** 提前停止互动 —— 今晚不互动，直接睡（换更多睡眠） */
  stopDayInteracting() {
    if (!this.dayLoop) return
    this.dayLoop = requestStopInteractingPure(this.dayLoop)
    this.pushDayLog('今晚不互动了')
    this.saveData()
  },

  /**
   * 读档 / 重置存档时把当日状态清成「未初始化」。
   * 由 persistence.initializePlayer() 调用 —— 否则刷新后会用上一局的锚点补算。
   */
  resetDayLoop() {
    this.dayLoop = null
  }
}
