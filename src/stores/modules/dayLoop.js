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
  createDayTotals,
  freezeDayReport,
  rebaseDayState,
  stepDay,
  scheduleView,
  currentTaskView,
  daySummaryOf,
  setPatrolHours as setPatrolHoursPure,
  setBodyEnabled as setBodyEnabledPure,
  setArtsSelected as setArtsSelectedPure,
  requestInterrupt as requestInterruptPure,
  requestStopInteracting as requestStopInteractingPure,
  GAME_SECONDS_PER_HOUR
} from '../../plugins/dayLoop'
import { pickAutoWives } from '../../plugins/innerCourt'
import { getCultivationCost, rollCultivationGain } from '../../plugins/cultivationMath'
import { bathLogText } from '../../plugins/bath'
import { PET_TUNING } from '../../plugins/petUnit'
import {
  SECONDS_PER_GAME_HOUR,
  setTimeScale,
  setAdvanceLimit,
  clearTimeScale
} from '../../plugins/gameClock'

/**
 * 睡觉加速的状态标记（模块闭包，不进 state）。
 * 真正的倍率/限流在 gameClock 的闭包里；这里只记「有没有在加速」。
 */
let sleepFastForward = false

/**
 * 打坐收益的累加器，**活在模块闭包里**（不进 state：它是过程值，不该进存档）。
 *
 * 为什么必须跨 tick 存活：一个练功轮 = 1 游戏小时 = 4 个 tick，
 * 而 `advanceDayLoop` 每个 tick 只调一次。放在函数体里的话每 tick 清零，
 * 流水账就会把一轮报成「0.25 小时」而不是「1 小时」（这个 bug 已经踩过一次）。
 * 按 `taskStart` 归属，任务收尾时清空。
 */
let medAcc = { taskStart: null, cultivation: 0, petXp: 0 }

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
    // 灵兽同修（P43）：与修为同轮入账，满级时 `petXp` 是 0、这一项自动不显示
    ['同修', signed(s.petXp)],
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
      // B3：巡视不再是空转 —— 它给封地三条进度条 ×2（资源从封地入库，不直接从巡视进背包）
      return `巡视乡间 ${h}（封地进度 ×2）${tail}`
    case 'body':
      // B4a：炼体不再烧灵力，改成「吞噬灵材 → 五系药力 → 吸一次」。
      // 药浴那一截自己带 ` · `，别和 tail 拼出两个分隔符。
      return [`炼体 ${h}`, bathLogText(s.bath), tail.replace(/^ · /, '')]
        .filter(Boolean)
        .join(' · ')
    case 'practice':
      return `练功 ${h}${tail}`
    case 'forge':
      return `炼器 ${h}${s.product ? ` · 出品 ${s.product}` : ''}${tail}`
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
  dayLoop: null,
  /**
   * **昨日战报**（P55-b）。刻意**不放在 `dayLoop` 里**：`resetDayLoop()` 会把 dayLoop
   * 整个置 null（读档 / 秘境扫荡都会调），战报跟着丢，刷新一次 Day 页就空了。
   * 它是一份「上一份完整战报」的快照，与本日的运行状态无关。
   */
  dayLoopLastReport: null
})

export const getters = {
  /** 当前阶段：patrol | idle | loop | evening | sleep（未初始化时 idle） */
  dayPhase() {
    return this.dayLoop?.phase || 'idle'
  },
  /**
   * 精力 —— 上限固定 100（《桂冈的一天》§十四）。
   * 实时值在 `dayLoop.focus`；还没初始化时回落到 `arts.focus`，
   * 这样刷新后的第一帧不会短暂显示 100（P12.4）。
   */
  focus() {
    return this.dayLoop?.focus ?? this.arts?.focus ?? DAY_TUNING.focusMax
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
  /**
   * 昨日战报（P55-b）。筑基后 Day 页显示的就是它 —— 24× 下一天 4 现实秒，
   * 实时任务条根本读不出来（《时间刻度修订方案》§6.2 #6）。
   * 练气期也照常记，只是页面用实时卡片、不展示这份摘要。
   */
  yesterdayReport() {
    return this.dayLoopLastReport || null
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
      // 巡视时长偏好从 arts.patrolHours 回灌（P51 #9）—— 否则刷新后滑杆弹回 2 小时
      patrolHours: this.arts?.patrolHours ?? DAY_TUNING.patrol.defaultHours,
      // 炼体偏好从 arts.bodyEnabled 回灌 —— 否则每次刷新都回到未勾选（2026-10-21）
      bodyEnabled: !!this.arts?.bodyEnabled,
      // 已勾选的百艺快照（默认 ['forge']）；纯函数层自己默认 0 百艺
      arts: this.arts?.selected || [],
      // 精力从 arts.focus 回灌 —— 否则每次刷新都回到 100（P12.4）
      focus: this.arts?.focus ?? DAY_TUNING.focusMax
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
  advanceDayLoop(toSeconds, { syncClock = false, offline = false } = {}) {
    if (!toSeconds || toSeconds <= 0) return
    this.ensureDayLoop(toSeconds)

    // 调试日志（P15.6）：离开镇守几天后回来时，ensureDayLoop 会建出新的一天；
    // 先把上一段（可能跨越多个工作日）结算成 partial，别让它混进新一天。
    this.debugCheckDay(this.dayLoop.workDayIndex)

    const idleWifeCount = this.wives.filter(w => w.status === 'idle').length
    const prevDay = this.dayLoop.workDayIndex

    const r = stepDay(this.dayLoop, toSeconds, {
      stamina: this.energy,
      staminaMax: this.energyMax,
      idleWifeCount
    })

    this.dayLoop = r.state
    // 老档 / 本批之前的存档里没有 `daily`（deepMerge 不会往已存在的对象里补字段）
    if (!this.dayLoop.daily) this.dayLoop.daily = createDayTotals()

    // 睡觉：不再瞬间跳到天亮，而是给时钟加一个倍率，让整段睡眠在约一轮炼器的
    // 现实时长里走完（左侧动画 + 读条可见）。离开睡觉就立刻恢复 1 倍速。
    // ⚠ 离线重放（offline）**不许**开倍率：那是全局时钟闭包状态，
    //   重放 180 天会反复改它，结束后必须保持 1 倍速。
    // ⚠ **筑基后 24× 也不许**（P55-b）：那边一整段睡眠只有 2 现实秒，
    //   再乘 1000 倍会把时钟直接冲到多年以后。
    if (this.dayLoop.phase === 'sleep' && !offline && !this.isAscendedRealm) this.startSleepFastForward()
    else this.stopSleepFastForward()

    // 换日了没有 —— **先记下来，分隔行等这一轮的流水都写完再插**（见本函数末尾）。
    const dayChanged = r.state.workDayIndex !== prevDay

    // 突破检测：结算前后比一下内外功等级（打坐可能顺带把修为顶到上限并突破）
    const inner0 = this.level
    const body0 = this.bodyLevel

    // 逐切片结算。slices 是按**任务边界**切开的，每片落在同一个任务内，比例精确。
    // 打坐的收益按 `taskStart` 累到模块闭包的 acc 里 —— 它必须跨 tick 存活，
    // 因为一个练功轮跨 4 个 tick（放函数体里会每个 tick 清零）。
    // 离线重放用：这一段实际掷出的修为 / 体魄。
    // ⚠ 不能用「结束修为 − 开始修为」—— 突破会把 `cultivation` 清零，
    //   跨突破的离线结算会算出 +0（B2 上线当天实测踩到）。
    let gainedInner = 0
    let gainedBody = 0

    // 药浴池全天候转换（B4b）：离线重放不跑 clock tick，这里补一次。
    // 在线时 tick 刚刚已经调过，同一个 action 幂等（游标已推进 ⇒ 这次是空转）。
    this.settleBathPool(toSeconds)

    for (const sl of r.slices) {
      // 离线重放：把时钟推到**这一片的结束时刻**，否则 180 天的流水、
      // 内宅 `gameDay`、晚间互动判定会全部挤到最后一天（B2 §风险 6/7）。
      if (syncClock) this.clockGameTime = sl.to
      // 灵力 + 熟练度：**只有练功段**（gainSpirit 内部会 saveData 并累积熟练度）
      if (sl.spirit) this.gainSpirit(sl.gameSeconds, { countTime: !offline })
      // 体力：消耗与回补都走这两个 action，保证「全仓库只有一处 clamp 规则」
      if (sl.staminaDelta < 0) this.spendStamina(-sl.staminaDelta)
      else if (sl.staminaDelta > 0) this.recoverStamina(sl.staminaDelta)
      // 打坐：把灵力换成修为。**只有练功段**（B4a：炼体已改成药浴，不再烧灵力）
      if (sl.kind === 'practice') {
        if (medAcc.taskStart !== sl.taskStart) {
          medAcc = { taskStart: sl.taskStart, cultivation: 0, petXp: 0 }
        }
        const md = this.meditateInSlice(sl.gameSeconds, { offline })
        // `|| 0` 是保险丝：将来若有人再给 meditateInSlice 加一个 `return 0` 的提前返回，
        // 这里只会少记一次，不会把整条流水账变成 NaN
        medAcc.cultivation += md?.gained || 0
        // 灵兽同修（P43）：和修为一样按轮累计，流水账/战报都读它
        medAcc.petXp += md?.petXp || 0
        gainedInner += md?.gained || 0
        // 昨日战报（P55-b）：按**掷出的修为**累进（不能用「结束修为 − 开始修为」，
        // 跨突破会被清零，B2 上线当天已经踩过一次）
        this.noteDayTotal({ cultivation: md?.gained || 0, petXp: md?.petXp || 0 })
        this.debugNoteCultivation({ inner: md?.gained || 0, innerTimes: md?.times || 0 })
      }
      // 调试日志：按 kind 累计小时数 + 精力变化（练功/炼体/巡视/睡觉/百艺都走这里）
      this.debugNoteSlice(sl)
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
        // 炼器：一轮跑完才出货（每轮随机一条已学配方）。产物名进流水。
        let product = null
        if (c.kind === 'forge') {
          const item = this.craftArt('forge')
          product = item?.name || null
        }
        // 炼体：**一轮结算一次药浴**（B4a）。结算点必须在这里而不是切片循环 ——
        // 一个 body 轮 = 1 游戏小时 = 4 个 tick，按切片结算会一轮吸 4 次。
        let bath = null
        if (c.kind === 'body') {
          bath = this.settleBodyRound({ offline })
          gainedBody += bath?.gained || 0
          this.noteDayTotal({ bodyCultivation: bath?.gained || 0 })
          this.debugNoteCultivation({
            outer: bath?.gained || 0,
            outerTimes: bath?.absorbed ? 1 : 0
          })
        }
        // 昨日战报：跑了多少小时、出了什么货
        this.noteDayTotal({ kind: c.kind, hours: c.hours, product })
        this.pushDayLog(
          settlementText({
            kind: c.kind,
            hours: c.hours,
            focus: c.focusDelta,
            stamina: c.staminaDelta,
            product,
            bath,
            // 灵力是**产出量**：由时长乘速率算，不取余额变化（它立刻被打坐花掉了）
            spirit: c.spiritSeconds > 0 ? this.spiritPerGameHour * (c.spiritSeconds / GAME_SECONDS_PER_HOUR) : 0,
            cultivation: c.kind === 'practice' ? medAcc.cultivation : 0,
            petXp: c.kind === 'practice' ? medAcc.petXp : 0,
            bodyCultivation: bath?.gained || 0
          })
        )
      }
      if (c.taskStart === medAcc.taskStart) medAcc = { taskStart: null, cultivation: 0, petXp: 0 }
    }

    // 突破是当天最大的「结算结果」，单独报一句（境界名变了就是突破了）
    if (this.level !== inner0) this.pushDayLog(`★ 突破：内功已入${this.realm}`)
    if (this.bodyLevel !== body0) this.pushDayLog(`★ 突破：外功已入${this.bodyRealm}`)

    // 需要 store 去做副作用的动作（晚间互动）—— **放在环节之后**，见上面那段注释
    for (const p of r.pending) {
      if (p.kind === 'evening') {
        // 互动发生在晚上（约 18:00），时钟必须先落到那个时刻，
        // 否则 `canInteractToday`（读 this.gameDay）会把互动记到次日。
        if (syncClock && p.atSeconds) this.clockGameTime = p.atSeconds
        this.runDayEvening(p.count, { silent: offline })
      }
    }

    // 换日分隔：**放在最后**。上一日的「睡觉」是这一轮里最晚发生的事，
    // 而睡觉的完成是在 `completions` 里记的 —— 分隔行必须排在它后面。
    // （以前把它放在最前面，于是「── 第 N 日 ──」会夹在「妻妾互动」和「睡觉」之间。）
    if (dayChanged) {
      /**
       * 定格**昨日战报**（P55-b）。放在这里而不是纯函数层：`daily` 里的
       * 修为 / 体魄 / 出品都是 store 才知道的量，纯函数层只负责形状。
       *
       * ⚠ 一次 tick 跨了多天时（24× + 后台节流，5 现实秒 = 5 游戏天），中间的
       *   几天会**折叠进同一份战报**（`dayIndex` 记的是起点那天）。这是取舍：
       *   逐日留档要把 `completions` 按日切开，收益不值得。
       */
      // ⚠ 空账不覆盖：刷新页面落在「当天 06:00 前夕」时（`resetDayLoop` 刚建出
      //   一份空的 daily，紧接着就换日），战报会被刷成一排 0 —— 那一份没有信息量，
      //   留着上一天的更诚实。
      const next = freezeDayReport(this.dayLoop.daily, prevDay)
      if (Object.keys(next.hours).length || next.interact) this.dayLoopLastReport = next
      this.dayLoop.daily = createDayTotals()
      this.pushDayLog(`── 第 ${r.state.workDayIndex + 1} 日 ──`)
    }

    // 调试日志：这一 tick 里跨过了 06:00 就把刚结束的工作日结算掉。
    // 放在最后 —— 本 tick 的切片都已经记进累加器了（代价是跨日那一 tick 的切片
    // 会算进前一天，误差 ≤ 一个 tick，可接受）。
    this.debugCheckDay(this.dayLoop.workDayIndex)

    // ⚠ **不可省**。原来唯一的每秒落盘点是 core.gainSpirit，而它现在只在练功段被调用；
    //   巡视 / 炼体 / 互动 / 睡觉这些段没有它兜底，漏掉这一句就是「刷新即丢」。
    if (!r.slices.some(sl => sl.spirit)) this.saveData()

    // 离线重放用：本段实际练功了多少游戏秒。
    // `totalCultivationTime` 的语义是「在线 tick 次数 ≈ 现实秒」，离线逐切片加会爆掉，
    // 所以由调用方按 `游戏秒 / 900` 一次性折算（900 游戏秒 = 1 现实秒）。
    return {
      spiritGameSeconds: r.slices.reduce((sum, sl) => sum + (sl.spirit ? sl.gameSeconds : 0), 0),
      cultivationGained: gainedInner,
      bodyCultivationGained: gainedBody
    }
  },

  /**
   * 打坐若干次 —— 把**灵力**换成**修为**。
   *
   * 为什么练功环节要顺带做这个：设计里这个环节的名字就是「**练功（打坐）**」
   * （《桂冈的一天》§2.1），也就是「产灵力」和「打坐」在同一小时里发生。
   * 少了这一步，灵力只会一直堆着、**修为永远是 0** —— 主界面上根本看不到成长。
   *
   * B4a 起**只有内功**走这里：炼体改成药浴（灵材 → 五系药力 → 吸收），不再烧灵力。
   * 外功的收益由 `bath.settleBodyRound` 产，所以原来那个 `path = 'outer'` 分支已经删掉。
   *
   * 次数受两件事限制：① `TUNING.practice.meditationSeconds`（每 1 游戏分钟一次，防老档
   * 攒的一大笔灵力被一个切片抽干）；② 当前灵力余额。
   * 换算公式取 `plugins/cultivationMath.js`，**不在这里另写一份**。
   *
   * @returns {{times:number, gained:number}} 实际打坐次数与掷出的修为（给流水账用）
   */
  meditateInSlice(gameSeconds, { offline = false } = {}) {
    const cost = getCultivationCost(this.level)
    // ⚠ 这两个提前返回必须返回**同形状的对象**，不能 `return 0` ——
    //   调用方读的是 `md.gained`，返回数字会得到 undefined，
    //   累加进流水账的累加器就变成 `NaN`（症状：日志写「修为 -NaN」）。
    //   尤其是 `cap <= 0`：切片比 1 游戏分钟还短时必然命中，而
    //   `settle.hours` 是整任务累计的，所以日志上还显示着「1 小时」，很难往这里想。
    // 返回形状固定带上 `petXp`（前端流水账、每日战报都读它），别只返回 `{ times, gained }`
    if (!(cost > 0)) return { times: 0, gained: 0, petXp: 0 }
    const cap = Math.floor((Number(gameSeconds) || 0) / DAY_TUNING.practice.meditationSeconds)
    if (cap <= 0) return { times: 0, gained: 0, petXp: 0 }

    let times = 0
    let gained = 0
    let petXp = 0
    while (times < cap && this.spirit >= cost) {
      // 内功已顶到上限、又被契合度门槛拦着 —— 再打坐只是白烧灵力
      if (this.cultivation >= this.maxCultivation && this.isBreakthroughBlocked) break
      this.spirit -= cost
      gained += rollCultivationGain(this.level, this.luck)
      times += 1
    }
    // 英烈祠：每块牌位 +1% 打坐修为，上限 +10%（《秘境系统》§六）。
    // 只加内功，外功不吃这个加成。
    if (times) {
      const bonus = Number(this.shrineCultivationBonus) || 0
      if (bonus > 0) gained *= 1 + bonus
    }
    if (times) {
      this.cultivate(gained, { countTime: !offline })
      // P43 同修：出战灵兽额外获得 50% 打坐修为（不扣桂冈，只在内功打坐时给）
      const petRes = this.gainPetCultivation(gained * PET_TUNING.cultivationShare)
      if (petRes) {
        petXp = petRes.xpGained || 0
        // 升级是稀有事件（一级要同层上限 ×2），单独一行；不进 `★ 突破` 那一类，因为主体是灵兽
        if (petRes.gainedLevels) {
          this.pushDayLog(
            `★ 灵兽「${petRes.name}」同修升至 Lv.${petRes.level}`
          )
        }
      }
    }
    return { times, gained, petXp }
  },

  /**
   * 开始「睡觉快进」：给时钟加倍率，让整段睡眠在约 `TUNING.sleep.fastForwardSeconds`
   *（默认 3 秒 ≈ 一轮炼器）的现实时间里走完。
   *
   * 为什么不再用 `skipTo`：那会瞬间跳到天亮，左侧睡觉动画和「当前任务」读条根本看不见。
   * 现在睡眠仍然是**正常 tick 结算**的（体力回满、精力恢复、换日、流水都在 stepDay 里），
   * 只是时间流速被放大。`advanceLimit` 保证一次 5 秒的后台 tick 也不会冲过天亮。
   *
   * ⚠ 倍率/限流活在 gameClock 的模块闭包里，`$reset()` 清不掉；
   *   所以离开睡觉、离开镇守、resetDayLoop 都必须调 `stopSleepFastForward()`。
   */
  startSleepFastForward() {
    if (sleepFastForward) return
    const d = this.dayLoop
    if (!d || d.phase !== 'sleep') return
    const end = d.taskStartSeconds + d.taskDurationSeconds
    const remaining = Math.max(end - this.clockGameTime, 0)
    if (remaining <= 0) return

    const baseRate = SECONDS_PER_GAME_HOUR * GAME_SECONDS_PER_HOUR
    const targetReal = Math.max(Number(DAY_TUNING.sleep.fastForwardSeconds) || 3, 0.5)
    // 基础时钟 1 现实秒 = 900 游戏秒；除以目标现实秒就是需要的倍率
    setTimeScale(Math.max(remaining / (targetReal * baseRate), 1))
    setAdvanceLimit(remaining)
    sleepFastForward = true
  },

  /** 结束睡觉快进，时钟恢复 1 倍速 */
  stopSleepFastForward() {
    if (!sleepFastForward) return
    clearTimeScale()
    sleepFastForward = false
  },

  /**
   * 晚间互动 —— 一次算清今晚几位，交给内宅**已测过**的那套判定。
   *
   * 为什么是一次调用而不是每晚调 n 次：`interactEvening(wifeIds)` 收的是一组侍妾、
   * 一次扣完，且被 `canInteractToday` 限成每游戏天一次。「30m/次」在那边本来就是
   * 「一位 30 分钟」的意思，所以一次调用 + n 位与设计 §2.2 完全一致。
   */
  runDayEvening(count = 0, { silent = false } = {}) {
    const n = Math.floor(Number(count) || 0)
    if (n <= 0) return
    const ids = pickAutoWives({
      wives: this.wives,
      rule: this.innerCourt?.autoRule,
      energy: this.energy
    }).slice(0, n)
    if (!ids.length) return

    const res = this.interactEvening(ids, { auto: true, silent })
    if (!res.success) {
      this.pushDayLog(`晚间未成：${res.message}`)
      return
    }
    const hit = res.results.filter(x => x.pregnant).length
    this.noteDayTotal({ interact: ids.length })
    this.pushDayLog(`妻妾互动 ${ids.length} 位${hit ? ` · 有喜 ${hit} 位` : ''}`)
  },

  pushDayLog(text) {
    const d = this.dayLoop
    if (!d) return
    d.log = [...(d.log || []), { at: this.clockGameTime, text }].slice(-LOG_LIMIT)
  },

  /**
   * 记一笔「今日累计」（P55-b 昨日战报的数据源）。
   *
   * ⚠ 只由 `advanceDayLoop` / `runDayEvening` 调用，**不要**在 UI 里调 ——
   *   战报的语义是「这一游戏天实际发生了什么」，不是「界面上点了什么」。
   */
  noteDayTotal({ kind, hours, cultivation, bodyCultivation, interact, product, petXp } = {}) {
    const d = this.dayLoop
    if (!d) return
    if (!d.daily) d.daily = createDayTotals()
    const daily = d.daily
    if (kind && hours > 0) daily.hours[kind] = (daily.hours[kind] || 0) + hours
    if (cultivation > 0) daily.cultivation += cultivation
    if (bodyCultivation > 0) daily.bodyCultivation += bodyCultivation
    if (petXp > 0) daily.petXp += petXp
    if (kind === 'practice' && hours > 0) daily.spiritHours += hours
    if (interact > 0) daily.interact += interact
    if (product) daily.products = [...daily.products, product].slice(-5)
  },

  // ---------- 玩家介入 ----------

  /** 调整巡视时长（1~5 小时）。还在巡视里则同步拉长/缩短今天这段，否则只影响明天 */
  setDayPatrolHours(hours) {
    if (!this.dayLoop) return
    this.dayLoop = setPatrolHoursPure(this.dayLoop, hours)
    // 偏好写进 arts（不会被 resetDayLoop 清空），刷新后从它回灌
    if (this.arts) this.arts.patrolHours = this.dayLoop.patrolHours
    this.saveData()
  },

  /** 勾选 / 取消炼体。当天即生效（下一个小循环任务重算队列） */
  setDayBodyEnabled(enabled) {
    // 偏好写进 arts（不会被 resetDayLoop 清空），当天状态写进 dayLoop
    if (this.arts) this.arts.bodyEnabled = !!enabled
    if (!this.dayLoop) return
    this.dayLoop = setBodyEnabledPure(this.dayLoop, enabled)
    this.saveData()
  },

  /**
   * 勾选 / 取消百艺。当天即生效。
   * 由 `stores/modules/arts.js` 的 setArtEnabled 调用（它同时改 arts.selected）。
   */
  setDayArtsSelected(arts = []) {
    this.ensureDayLoop(this.clockGameTime)
    if (!this.dayLoop) return
    this.dayLoop = setArtsSelectedPure(this.dayLoop, arts)
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
    // 精力实时值住在 dayLoop 里，而 resetDayLoop 会把 dayLoop 清空 ——
    // 不先搬进 arts.focus，刷新 / 秘境扫荡后精力就会回满 100（P12.4）。
    // ⚠ 必须放在 resetDayLoop 内部：secretRealm.startSecretRealmSweep() 也直接调它。
    if (this.dayLoop && this.arts) {
      this.arts.focus = this.dayLoop.focus
      // 炼体勾选同理：老档没有 arts.bodyEnabled 这个字段时，从当天状态补一次
      this.arts.bodyEnabled = !!this.dayLoop.bodyEnabled
      // 巡视时长滑杆同理（P51 #9）：不搬的话刷新一次就弹回 2 小时
      this.arts.patrolHours = this.dayLoop.patrolHours
    }
    // 时钟倍率活在 gameClock 闭包里，$reset / 读档都清不掉 —— 必须显式复位
    this.stopSleepFastForward()
    this.dayLoop = null
  }
}
