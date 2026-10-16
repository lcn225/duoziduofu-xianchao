// 桂冈的一天 —— 纯函数层（无副作用，可被 node 直接加载跑断言）
//
// 一天的骨架（《桂冈的一天 + 体力精力系统》§一）：
//
//   晨起 06:00 → 巡视乡间（1~5h）→ 小循环 08:00~18:00 → 妻妾互动 → 睡觉 → 次日 06:00
//
// 设计要点（为什么这么写）：
//
//   · **显式存 phase + 绝对时间锚点**，不用「累加已执行的秒数」。
//     浮点累加器跑几百个 tick 会漂；而 `now - taskStartSeconds` 每 tick 现算，
//     锚点是绝对的 → 掉帧、读档、时钟暂停全都自愈，等价于 gameClock 的 checkBoundary。
//
//   · 也**不**「按当前时间反推阶段」：日程是**路径相关**的 —— 精力耗尽提前下班、
//     体力耗尽自动睡觉、玩家随时打断。光知道 now 推不出这些。
//
//   · 所有推进都是 `(state, toSeconds, ctx) → { state, slices, pending }`。
//     ctx 把「只有 store 才知道的东西」（当前体力 / 上限 / 可互动人数）显式传进来，
//     纯函数不读 store。
//
//   · 时间单位统一**游戏秒**，复用 innerCourt.js 的时间常量（那已是事实上的真源）。
//
// ⚠ 边界只有一处容易搞混：本模块的「一天」是 **06:00 边界**（`workDayOf`），
//   而 innerCourt 的 `gameDayOf` 是 **00:00 边界**。名字刻意不同，别互相套用。

import {
  GAME_SECONDS_PER_HOUR as HOUR,
  GAME_SECONDS_PER_DAY as DAY,
  TUNING as COURT
} from './innerCourt.js'

export { HOUR as GAME_SECONDS_PER_HOUR, DAY as GAME_SECONDS_PER_DAY }

/** 辰时起床。也是 `dayStartSeconds` 指向的那一刻 */
export const WAKE_HOUR = 6
/** 小循环开始（**绝对时刻 08:00**） */
export const LOOP_START_HOUR = 8
/** 下班（**绝对时刻 18:00**）。小循环结束、互动开始 */
export const OFF_WORK_HOUR = 18

/**
 * ⚠ 上面三个是**一天里的绝对时刻**，而 `dayStartSeconds` 指向的是 06:00。
 * 所以换算成「相对 dayStart 的偏移」时必须减去 `WAKE_HOUR`。
 *
 * 不減的话 `LOOP_START_HOUR * HOUR` 会变成「起床后 8 小时」= 14:00 ——
 * 而且默认巡视 2 小时时症状**被巧合掩盖**（14:00→24:00 恰好也是 10 小时练功），
 * 只有把巡视拉到 5 小时才会露出来。见 verify-dayloop 的「巡视 5h → 练功只剩 7 小时」。
 */
const loopStartOf = dayStartSeconds => dayStartSeconds + (LOOP_START_HOUR - WAKE_HOUR) * HOUR
const offWorkOf = dayStartSeconds => dayStartSeconds + (OFF_WORK_HOUR - WAKE_HOUR) * HOUR

export const PHASES = ['patrol', 'idle', 'loop', 'evening', 'sleep']

export const TUNING = {
  /** 巡视乡间（《桂冈的一天》§2.1）。⚠ 模块四未上线：占时间、扣体力，但**无产出**。 */
  patrol: { minHours: 1, maxHours: 5, defaultHours: 2, staminaPerHour: 10 },
  /**
   * 练功（打坐）：恢复精力、消耗一点体力、**唯一产灵力与熟练度的环节**。
   *
   * ⚠ 它同时也是**打坐** —— 设计里这个环节的名字就是「练功（打坐）」（《桂冈的一天》§2.1）。
   *   灵力只是中间物，玩家要的成长是**修为**：`spirit → 花掉 → cultivation`。
   *   少了这一步，灵力会一直堆着而修为永远是 0（主界面上根本看不到成长）。
   *   换算率见 `plugins/cultivationMath.js`，不在这里重复定义。
   */
  practice: {
    durationSeconds: HOUR,
    focusPerHour: 10,
    staminaPerHour: 3,
    /**
     * 一次打坐占多少**游戏秒** —— 只用来给换算**限速**。
     *
     * 为什么需要限速：灵力是累积的，若不限速，老档里存着的一大笔灵力会在
     * 第一个练功切片里被一次性抽干、修为瞬间飙一大截。
     * 1 游戏分钟一次 → 一个练功小时最多 60 次，攒下的灵力在一两个游戏天里平稳转完。
     */
    meditationSeconds: 60
  },
  /** 炼体：独立勾选项，1h/轮，体力消耗高 */
  body: { durationSeconds: HOUR, staminaPerHour: 15 },
  /** 妻妾互动：30m/次（**离散**，不按小时折算）。每次的体力消耗读 innerCourt 的 TUNING，别抄第二份 */
  evening: { perInteractSeconds: HOUR / 2 },
  /** 睡觉：精力 +5/h；体力恢复率用 innerCourt 的「上限/4 每小时」 */
  sleep: { focusPerHour: 5 },
  /** 精力上限**固定 100**，不随炼体涨（原作里主角的「注意力」问题还没解决） */
  focusMax: 100
}

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback)
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)

// ---------- 时间换算 ----------

/** 本「工作日」的序号（**06:00 边界**，与 innerCourt 的 00:00 边界 gameDayOf 刻意不同名） */
export const workDayOf = gameSeconds => Math.floor((num(gameSeconds) - WAKE_HOUR * HOUR) / DAY)

/** 本工作日的 06:00 的绝对游戏秒 */
export const dayStartOf = gameSeconds => workDayOf(gameSeconds) * DAY + WAKE_HOUR * HOUR

/** 一天里的第几小时，带小数（0.0 ~ 24.0）。给进度与消耗按比例算用 */
export const hourFloatOf = gameSeconds => {
  const t = ((num(gameSeconds) % DAY) + DAY) % DAY
  return t / HOUR
}

/** 下一次 06:00 的绝对游戏秒 */
export const nextWakeTime = gameSeconds => dayStartOf(gameSeconds) + DAY

/** 距下次起床还有多少游戏秒 */
export const secondsUntilNextWake = gameSeconds => Math.max(nextWakeTime(gameSeconds) - num(gameSeconds), 0)

// ---------- 小循环队列 ----------

/**
 * 生成小循环队列（《桂冈的一天》§3.1）。
 *
 * 本轮**百艺还没上线**（属模块七），所以队列只有「练功」和可选的「炼体」：
 *   不勾炼体 → ['practice']          → 10 小时跑 10 轮练功（合设计 §3.2 的 0 百艺行）
 *   勾了炼体 → ['practice', 'body']  → 跑 5 轮练功 + 5 轮炼体（合 §3.2 的炼体表）
 *
 * 百艺上线后往这里加 art1..artN 即可，`queueTaskAt` 不用改。
 */
export const buildLoopQueue = ({ bodyEnabled = false } = {}) =>
  bodyEnabled ? ['practice', 'body'] : ['practice']

/** 小循环里第 i 个任务是什么（取模，i 从 0 起） */
export const queueTaskAt = (queue, i) => queue[Math.abs(Math.floor(i)) % queue.length]

// ---------- 任务表 ----------

const taskDurationOf = task => {
  if (task === 'practice') return TUNING.practice.durationSeconds
  if (task === 'body') return TUNING.body.durationSeconds
  return HOUR
}

// ---------- 状态 ----------

/**
 * 建一个新的当日状态。
 *
 * ⚠ `lastSeconds` 是**推进锚点**：stepDay 每次都从它推到 toSeconds。
 *   读档时用当时的 `clockGameTime` 建，循环就当班开始了 —— 不需要补算离线时段
 *   （离线结算还没做，见模块九）。
 */
export const createDayState = ({
  nowSeconds = 0,
  patrolHours = TUNING.patrol.defaultHours,
  bodyEnabled = false,
  focus = TUNING.focusMax
} = {}) => {
  const t = Math.max(num(nowSeconds), 0)
  const firstWake = WAKE_HOUR * HOUR
  /**
   * ⚠ **新档的起点（游戏时间 0 = 00:00）比第一个 06:00 还早**：
   *   `workDayOf(0)` = **-1**、`dayStartOf(0)` = **-64800** —— 也就是「本日的 06:00
   *   已经在过去」，日程整个过期。所以这段时间先**等天亮**（一个 `idle` 任务），
   *   到 06:00 再正常开工。
   *
   *   （早先的写法是把首日夹到 `dayStart = 0`，结果第一天变成 00:00 开工、
   *   12:00 就下班、睡 16 小时 —— 日志上一眼就能看出不对。）
   */
  const beforeFirstDay = t < firstWake
  const dayStartSeconds = beforeFirstDay ? firstWake : dayStartOf(t)
  const hours = clamp(patrolHours, TUNING.patrol.minHours, TUNING.patrol.maxHours)
  return {
    workDayIndex: Math.max(workDayOf(t), 0),
    dayStartSeconds,
    phase: beforeFirstDay ? 'idle' : 'patrol',
    taskKind: beforeFirstDay ? 'idle' : 'patrol',
    // 锚在 `t` 上：接手的这一刻就是本任务的开始。加载存档时若正处在某个任务中途，
    // 那么这一条记的就是「接手之后的那一段」——诚实但看起来短，见 CLAUDE.md 的说明。
    taskStartSeconds: t,
    taskDurationSeconds: beforeFirstDay ? firstWake - t : hours * HOUR,
    loopIndex: 0,
    patrolHours: hours,
    bodyEnabled: !!bodyEnabled,
    focus: clamp(num(focus, TUNING.focusMax), 0, TUNING.focusMax),
    /** 精力耗尽后已补过一轮打坐（防重复补） */
    earlyOff: false,
    /** 玩家点了「打断循环」 */
    endedByPlayer: false,
    /** 玩家点了「提前停止互动」 */
    stopInteracting: false,
    counters: { practice: 0, body: 0, interact: 0, spiritHours: 0 },
    /** 当日流水账。由 store 写（纯函数不产生日志），换日时清空 */
    log: [],
    /**
     * 当前任务的**结算累加器**（见 stepDay 的 `completions`）。
     *
     * ⚠ 它必须住在 state 里，不能是 `stepDay` 的局部变量 ——
     *   一个练功轮 = 1 游戏小时 = 4 个 tick，而 `stepDay` **每 tick 只被调用一次**，
     *   局部累加器每 tick 清零，结果就是把一轮报成「0.25 小时」而不是「1 小时」。
     *   （这个 bug 连踩两次：先放在 store 的函数体里，又放在 stepDay 的函数体里。）
     */
    settle: null,
    lastSeconds: t
  }
}

/** 流水账保留条数。一天 12~14 条任务 + 晚间几条，40 条足够覆盖一整天 */
export const LOG_LIMIT = 40

const setTask = (s, kind, startAt, durationSeconds) => {
  s.taskKind = kind
  s.taskStartSeconds = startAt
  s.taskDurationSeconds = Math.max(num(durationSeconds), 1)
}

/** 进入小循环的第 index 个任务 */
const enterLoop = (s, t, index) => {
  s.phase = 'loop'
  s.loopIndex = index
  const q = buildLoopQueue({ bodyEnabled: s.bodyEnabled })
  s.queue = q
  setTask(s, queueTaskAt(q, index), t, taskDurationOf(queueTaskAt(q, index)))
}

const enterSleep = (s, t) => {
  s.phase = 'sleep'
  setTask(s, 'sleep', t, Math.max(nextWakeTime(t) - t, 1))
}

/** 次日 06:00：重置当日的可变量。精力留着（它是脑力，睡一觉也补不满） */
const rollToNewDay = (s, t) => {
  s.workDayIndex += 1
  s.dayStartSeconds = dayStartOf(t)
  s.phase = 'patrol'
  s.loopIndex = 0
  s.earlyOff = false
  s.endedByPlayer = false
  s.stopInteracting = false
  s.counters = { practice: 0, body: 0, interact: 0, spiritHours: 0 }
  const hours = clamp(s.patrolHours, TUNING.patrol.minHours, TUNING.patrol.maxHours)
  setTask(s, 'patrol', s.dayStartSeconds, hours * HOUR)
}

// ---------- 切片 ----------

const makeSlice = (s, from, to, staminaMax) => {
  const gameSeconds = to - from
  const h = gameSeconds / HOUR
  const kind = s.taskKind
  const sl = { kind, from, to, gameSeconds, focusDelta: 0, staminaDelta: 0, spirit: false }

  switch (kind) {
    case 'patrol':
      sl.staminaDelta = -TUNING.patrol.staminaPerHour * h
      break
    case 'practice':
      sl.focusDelta = TUNING.practice.focusPerHour * h
      sl.staminaDelta = -TUNING.practice.staminaPerHour * h
      sl.spirit = true
      break
    case 'body':
      sl.staminaDelta = -TUNING.body.staminaPerHour * h
      break
    case 'sleep':
      sl.staminaDelta = (staminaMax / COURT.energy.sleepRestoreDivisor) * h
      sl.focusDelta = TUNING.sleep.focusPerHour * h
      break
    default:
      break // idle：什么都不耗
  }
  return sl
}

// ---------- 阶段推进 ----------

/**
 * 一个任务做完之后的去向。**必须保证 taskStartSeconds 前进**，否则外层循环会空转。
 *
 * @param stam      本次 step 内的**模型**体力（起点来自 ctx，随切片增减）
 * @param ctx.idleWifeCount 可互动的侍妾数（没有内宅时传 0，晚间就跳过）
 */
const advancePhase = (s, t, stam, ctx, pending) => {
  switch (s.phase) {
    case 'patrol': {
      const loopStart = loopStartOf(s.dayStartSeconds)
      // 巡视不满 2 小时 → 先闲到 8:00（设计 §1.1：小循环 8:00 才开始）
      if (t < loopStart) setTask(s, 'idle', t, loopStart - t)
      else enterLoop(s, t, 0)
      break
    }

    case 'idle':
      // 空档有两种，去向不同：
      //   ① 新档「等天亮」（t 还没到本日的 06:00）→ 之后是**巡视**
      //   ② 巡视比 2 小时还短、闲到 08:00 → 之后是**小循环**
      if (t <= s.dayStartSeconds && t < loopStartOf(s.dayStartSeconds)) {
        s.phase = 'patrol'
        setTask(s, 'patrol', t, s.patrolHours * HOUR)
      } else {
        enterLoop(s, t, 0)
      }
      break

    case 'loop': {
      // 体力见底 → 自动睡觉，直接跳过晚间（设计 §4.1 场景 D）
      if (stam <= 0) {
        enterSleep(s, t)
        break
      }
      // 精力见底 → 补一轮打坐，然后放弃当天剩余安排、提前下班（设计 §3.3）
      if (s.focus <= 0 && !s.earlyOff) {
        s.earlyOff = true
        s.phase = 'loop'
        setTask(s, 'practice', t, TUNING.practice.durationSeconds)
        break
      }
      const nextIndex = s.loopIndex + 1
      const offWork = offWorkOf(s.dayStartSeconds)
      const nextStart = t
      const done = s.earlyOff || s.endedByPlayer || nextStart >= offWork
      if (done) {
        enterEvening(s, t, stam, ctx, pending)
        break
      }
      enterLoop(s, t, nextIndex)
      break
    }

    case 'evening':
      enterSleep(s, t)
      break

    case 'sleep':
      rollToNewDay(s, t)
      break

    default:
      setTask(s, 'idle', t, HOUR)
      break
  }
}

/**
 * 进入晚间互动：**一次算清今晚互动几位**，然后整段占掉 n × 30 分钟。
 *
 * 为什么不是「每 30 分钟调一次内宅」：内宅的 `interactEvening(wifeIds)` 收的是
 * **一组**侍妾、一次扣完，且被 `canInteractToday` 限成每游戏天一次。
 * 「30m/次」在那边本来就是「一位 30 分钟」的意思 —— 所以一次调用 + n 位，
 * 与设计 §2.2 完全一致，也复用了已经测过的判定逻辑。
 *
 * 具体挑哪几位由 store 做（它才有规则与好感），纯函数只算 n 与时长。
 */
const enterEvening = (s, t, stam, ctx, pending) => {
  s.phase = 'evening'
  const reserve = num(COURT.pregnancy.fatigueThreshold, 30)
  const per = num(COURT.energy.perInteraction, 15)
  const room = Math.max(Math.floor((stam - reserve) / per), 0)
  const n = s.stopInteracting ? 0 : Math.min(room, Math.max(Math.floor(num(ctx.idleWifeCount)), 0))
  setTask(s, 'evening', t, n > 0 ? n * TUNING.evening.perInteractSeconds : 1)
  if (n > 0) pending.push({ kind: 'evening', count: n, atSeconds: t })
  s.counters.interact = n
}

// ---------- 主推进 ----------

const cloneState = s => ({
  ...s,
  counters: { ...s.counters },
  queue: s.queue ? [...s.queue] : undefined,
  log: s.log ? [...s.log] : [],
  settle: s.settle ? { ...s.settle } : null
})

/** 一个任务的结算累加器 —— **住在 state 里**（见 createDayState 的 `settle`） */
const newAcc = (kind, taskStart) => ({
  kind,
  taskStart,
  hours: 0,
  focusDelta: 0,
  staminaDelta: 0,
  /** 产灵力的游戏秒（练功段才有）—— 由 store 乘速率换算成灵力，不在这里算 */
  spiritSeconds: 0
})

/**
 * 把一天的模型从 `state.lastSeconds` 推到 `toSeconds`。
 *
 * @returns {{ state, slices, pending, completions }}
 *   slices      —— 按任务边界切开的时间段，每段落在**同一个任务**内，比例精确。
 *                  store 逐段结算：practice 段调 gainSpirit、sleep 段回体力、其余只记账。
 *   pending     —— 需要 store 去做副作用的动作（目前只有 `evening`：真正调内宅互动）。
 *   completions —— **本次调用里跑完的那些任务**，每项是该任务的**汇总**
 *                  （时长 / 精力 / 体力 / 产灵力的秒数）。流水账按它记一条带结算结果的行。
 *
 * ⚠ **切片边界由任务决定，不由 tick 决定**。一个 tick 在 0.25 的时钟下是 15 游戏分钟，
 *   而一个任务 30~60 分钟 —— 单个 tick 必然横跨边界，整 tick 记就会算错比例。
 *
 * ⚠ **汇总必须在这里做**，不能在 store 里做：一个练功轮跨 4 个 tick，store 每次调用都
 *   只看到其中一片；累加器只要放在 store 的函数体里就会每个 tick 重置，
 *   最后报出来的时长只有 0.25 小时而不是 1 小时。（这个 bug 已经踩过一次。）
 */
export const stepDay = (state, toSeconds, ctx = {}) => {
  const s = cloneState(state)
  const slices = []
  const pending = []
  /** 本次调用里跑完的任务（跨 tick 的那部分时长也已经由纯函数累加好） */
  const completions = []

  const to = num(toSeconds)
  let cursor = num(s.lastSeconds)
  if (to <= cursor) return { state: s, slices, pending, completions }

  const staminaMax = num(ctx.staminaMax)
  // 本次 step 内的**模型**体力：起点来自 store 的真实值，随切片增减。
  // 每 tick 结束由 store 用真实值反写对齐（见 dayLoop store 的注释）。
  let stam = clamp(num(ctx.stamina), 0, staminaMax)

  let guard = 0
  while (cursor < to && guard++ < 128) {
    const taskEnd = s.taskStartSeconds + s.taskDurationSeconds
    const sliceTo = Math.min(to, taskEnd)

    if (sliceTo > cursor) {
      const sl = makeSlice(s, cursor, sliceTo, staminaMax)
      // 给 store 用：同 `taskStart` 的切片属于同一个任务；`taskDone` 表示这条把任务跑完了。
      // 流水账按**任务**记（一条带结算结果），不按切片记 —— 否则一个练功小时会被 tick
      // 切成 4 条「练功 0.25 小时」，一天刷 40 条。
      sl.taskStart = s.taskStartSeconds
      sl.taskDone = sliceTo >= taskEnd

      // 按任务汇总（累加器在 state 里，跨 tick 存活）。任务换了就开新的一条。
      if (!s.settle || s.settle.taskStart !== s.taskStartSeconds) {
        s.settle = newAcc(s.taskKind, s.taskStartSeconds)
      }
      s.settle.hours += sl.gameSeconds / HOUR
      if (sl.spirit) s.settle.spiritSeconds += sl.gameSeconds

      // ⚠ 汇总的是**实际生效的**增减（夹过上下限之后的），不是原始量 ——
      //   否则「睡觉 9.3 小时」会报出「体力 +335」，而体力上限只有 145。
      const stamBefore = stam
      stam = clamp(stam + sl.staminaDelta, 0, staminaMax)
      s.settle.staminaDelta += stam - stamBefore
      sl.staminaAfter = stam

      // 精力：练功回、睡觉回，**上限固定 100**（本批没有消耗它的百艺，所以白天恒满）
      const focusBefore = s.focus
      s.focus = clamp(s.focus + sl.focusDelta, 0, TUNING.focusMax)
      s.settle.focusDelta += s.focus - focusBefore

      if (sl.spirit) s.counters.spiritHours += sl.gameSeconds / HOUR
      slices.push(sl)
      cursor = sliceTo
    }

    if (cursor >= taskEnd) {
      const before = s.taskStartSeconds
      // 数「完成了多少轮」——按**任务收尾**计，不按切片计（切片会被 tick 切碎）
      if (s.taskKind === 'practice') s.counters.practice += 1
      else if (s.taskKind === 'body') s.counters.body += 1
      // 任务收尾 → 把这一条的汇总推出去（**必须在 advancePhase 之前**，
      // 它会把 taskStartSeconds 换成下一个任务）
      if (s.settle && s.settle.taskStart === s.taskStartSeconds) {
        completions.push(s.settle)
        s.settle = null
      }
      advancePhase(s, cursor, stam, ctx, pending)
      // 防死循环：任何 transition 都必须让时间前进
      if (s.taskStartSeconds < cursor) s.taskStartSeconds = cursor
      if (s.taskStartSeconds === before && s.taskDurationSeconds <= 0) s.taskDurationSeconds = 1
    }
  }

  s.lastSeconds = to
  return { state: s, slices, pending, completions }
}

// ---------- 视图（纯展示，给 UI 用） ----------

const PHASE_LABELS = {
  patrol: '巡视乡间',
  idle: '候工',
  loop: '小循环',
  evening: '妻妾互动',
  sleep: '睡觉'
}

export const phaseLabel = phase => PHASE_LABELS[phase] || phase

const TASK_LABELS = { practice: '练功', body: '炼体', patrol: '巡视乡间', idle: '候工', evening: '妻妾互动', sleep: '睡觉' }

/** 当前任务卡：名称 + 进度 + 剩余 */
export const currentTaskView = (state, nowSeconds) => {
  if (!state) return null
  const t = num(nowSeconds)
  const end = state.taskStartSeconds + state.taskDurationSeconds
  const pct = clamp((t - state.taskStartSeconds) / state.taskDurationSeconds, 0, 1)
  const label =
    state.taskKind === 'practice' && state.phase === 'loop'
      ? `练功（第 ${state.loopIndex + 1} 轮）`
      : TASK_LABELS[state.taskKind] || state.taskKind
  return {
    kind: state.taskKind,
    phase: state.phase,
    label,
    progressPct: Math.round(pct * 100),
    remainingSeconds: Math.max(end - t, 0),
    endSeconds: end
  }
}

/**
 * 今日安排清单（设计 §七 的 ✅🔄⬜）。
 *
 * ⚠ **巡视乡间与百艺是「占了位置但没产出」的**：巡视真跑（占时间、扣体力，日志写「封地未开放」），
 *   百艺四个槽位标 `deferred` 只做展示 —— 模块七 还没上线，不假装它在跑。
 */
export const scheduleView = (state, nowSeconds) => {
  if (!state) return []
  const t = num(nowSeconds)
  const rows = [{ key: 'wake', label: '晨起', status: 'done' }]

  const statusOf = (startSeconds, endSeconds) =>
    t >= endSeconds ? 'done' : t >= startSeconds ? 'doing' : 'todo'

  const patrolEnd = state.dayStartSeconds + state.patrolHours * HOUR
  rows.push({
    key: 'patrol',
    label: `巡视乡间（${state.patrolHours} 小时）`,
    status: statusOf(state.dayStartSeconds, patrolEnd),
    note: '封地未开放，无产出'
  })

  const q = buildLoopQueue({ bodyEnabled: state.bodyEnabled })
  const loopStart = loopStartOf(state.dayStartSeconds)
  const offWork = offWorkOf(state.dayStartSeconds)
  let cursor = Math.max(patrolEnd, loopStart)
  let i = 0
  while (cursor < offWork && i < 24) {
    const task = queueTaskAt(q, i)
    const end = Math.min(cursor + taskDurationOf(task), offWork)
    rows.push({
      key: `loop-${i}`,
      label: `${TASK_LABELS[task]}（第 ${i + 1} 轮）`,
      status: i < state.loopIndex ? 'done' : statusOf(cursor, end)
    })
    cursor = end
    i += 1
  }

  rows.push({
    key: 'arts',
    label: '百艺（炼丹 / 炼符 / 炼阵 / 炼器）',
    status: 'todo',
    deferred: true,
    note: '待模块七'
  })
  rows.push({ key: 'evening', label: '妻妾互动', status: statusOf(offWork, nextWakeTime(state.dayStartSeconds)) })
  rows.push({ key: 'sleep', label: '睡觉', status: t >= offWork && state.phase === 'sleep' ? 'doing' : 'todo' })
  return rows
}

/** 今日统计 */
export const daySummaryOf = state => ({
  practice: state?.counters?.practice || 0,
  body: state?.counters?.body || 0,
  interact: state?.counters?.interact || 0,
  spiritHours: Math.round((state?.counters?.spiritHours || 0) * 100) / 100
})

// ---------- 玩家介入（都是 (state, x) → 新 state） ----------

/** 调整巡视时长。**只影响明天与之后的巡视**（当天已经跑过的部分不改） */
export const setPatrolHours = (state, hours) => {
  const h = clamp(Math.round(num(hours, TUNING.patrol.defaultHours)), TUNING.patrol.minHours, TUNING.patrol.maxHours)
  const s = cloneState(state)
  s.patrolHours = h
  // 还在巡视里 → 同步拉长/缩短当前这段
  if (s.phase === 'patrol') {
    s.taskDurationSeconds = h * HOUR
  }
  return s
}

/** 勾选 / 取消炼体。**当天即生效**（下一个小循环任务重算队列） */
export const setBodyEnabled = (state, enabled) => {
  const s = cloneState(state)
  s.bodyEnabled = !!enabled
  if (s.phase === 'loop') {
    const q = buildLoopQueue({ bodyEnabled: s.bodyEnabled })
    s.queue = q
    // 队列变了，当前任务的**剩余**时长按新队列重算（已跑过的部分不退）
    const next = queueTaskAt(q, s.loopIndex)
    const elapsed = Math.max(num(s.lastSeconds) - s.taskStartSeconds, 0)
    s.taskKind = next
    s.taskStartSeconds = num(s.lastSeconds) - Math.min(elapsed, taskDurationOf(next))
    s.taskDurationSeconds = taskDurationOf(next)
  }
  return s
}

/** 打断循环 —— 做完当前任务就下班（设计 §八「正在执行的任务必须完成才下班」） */
export const requestInterrupt = state => ({ ...cloneState(state), endedByPlayer: true })

/** 提前停止互动 —— 今晚不互动，直接睡（换更多睡眠） */
export const requestStopInteracting = state => ({ ...cloneState(state), stopInteracting: true })
