// 游戏时钟 —— 所有跟时间相关的系统的底层骨架
//
//   1 现实秒 = 0.25 游戏小时（15 游戏分钟）   ← 唯一节奏旋钮
//   1 游戏天 = 24 游戏小时 = 96 现实秒 ≈ 1.6 现实分钟
//   1 游戏年 = 365 游戏天 = 35040 现实秒 ≈ 9.7 现实小时
//
// 设计要点（《design/new/时间系统 完整设计方案.md》）：
//   · 时间只在「自动推进模式」下走；进入管理界面即暂停（由路由守卫驱动）
//   · 五种钩子：tick（每现实秒）/ hour / day / month / year（跨边界时补触发）
//   · 普通事件进流水账，特殊事件弹窗并暂停
//
// ⚠ 计时器句柄与钩子表**活在模块作用域的闭包里**，不进 Pinia state：
//   一旦进 state 就会被序列化进存档；而且 $reset()（GM 重置 / 导入存档）
//   会重建 state 却清不掉旧 timer，必然泄漏。
//   只有 clockState 这个 reactive 影子对象暴露给 UI。

import { reactive } from 'vue'

/**
 * 游戏小时 / 现实秒 —— 时钟的**唯一节奏旋钮**。
 *
 * ⚠ 它在 advance() 里决定**每次 tick 走几个 15 分整步**：1 现实秒 × 0.25 游戏小时
 *   = 900 游戏秒 = 1 步（`GAME_STEP_SECONDS`）。所以**改小 = 游戏时间变慢**，改大 = 变快。
 *   （早先这里写成「改小 = 整体变快」，是反的，已修。）
 *
 * 当前 0.25：1 现实秒推进 15 游戏分钟，一个游戏天 ≈ 1.6 现实分钟。
 * 想快进调试就调大（60 = 1 现实秒顶 60 游戏小时）。
 *
 * ⚠ 它**只**影响「按游戏时间结算的东西」：孕育 270 天、功法熟练度（每 100 游戏小时 +1%）、
 *   内宅每日推进与晚间 20 时。灵力 / 突破挂在 tick（现实秒）上，不看它。
 */
export const SECONDS_PER_GAME_HOUR = 0.25

const GAME_SECONDS_PER_HOUR = 3600
const GAME_SECONDS_PER_DAY = 86400
const GAME_SECONDS_PER_MONTH = 86400 * 30
const GAME_SECONDS_PER_YEAR = 86400 * 365

/** 现实时间推进的粒度 */
export const TICK_MS = 1000

/**
 * 一次 tick 的**游戏时间步长** = 15 游戏分钟。
 *
 * `advance()` 只按整步推进：tick 永远落在 00:00 / 06:00 / 08:15 这种 15 分格点上。
 * 这不只是显示口径 —— 日常循环的任务边界（06:00 + S、练功 1 小时、百艺 45 分）
 * 全是 15 分的整数倍，时钟不落在格点上，任务结束就会落在两个 tick 之间，
 * 于是「1 小时轮」要拖到第 5 个 tick 才切换、倒计时多出一档「不足 15 分」。
 */
export const GAME_STEP_SECONDS = 900

/**
 * 单次 tick 愿意承认的现实秒上限。
 *
 * 浏览器会把后台标签页的 setInterval 节流到分钟级，恢复时一次 tick 会算出
 * 几小时的 delta。本批还没做离线结算，不钳制的话就等于「切走标签页白送收益」。
 * 这不是离线结算，是个漏洞。
 */
export const MAX_TICK_REAL_SECONDS = 5

/**
 * 时间加速倍率与「本次加速最多推进多少游戏秒」。
 *
 * 只给**睡觉快进**用（见 stores/modules/dayLoop.js 的 startSleepFastForward）：
 * 睡觉不再是瞬间跳转，而是按约一轮炼器的现实时长把整夜走完，让左侧动画与读条可见。
 *
 * ⚠ `advanceLimit` 是必需的保险丝：一次后台节流后的 5 秒 tick 在 13 倍速下会推进
 *   65,000 游戏秒，直接冲过天亮并把第二天上午也跑掉。有了它，最多推进到睡觉结束。
 * ⚠ 两者都是模块闭包变量，不进 state/存档；刷新后自动回到 1 / Infinity。
 */
let timeScale = 1
let advanceLimit = Infinity

export const setTimeScale = scale => {
  const n = Number(scale)
  timeScale = Number.isFinite(n) && n > 0 ? n : 1
}

export const setAdvanceLimit = seconds => {
  const n = Number(seconds)
  advanceLimit = Number.isFinite(n) && n > 0 ? n : Infinity
}

export const clearTimeScale = () => {
  timeScale = 1
  advanceLimit = Infinity
}

export const getTimeScale = () => timeScale
export const getAdvanceLimit = () => advanceLimit

/** 跨界钩子：按单位从大到小排，触发顺序无所谓，但保持稳定便于调试 */
const BOUNDARIES = [
  { level: 'hour', unit: GAME_SECONDS_PER_HOUR },
  { level: 'day', unit: GAME_SECONDS_PER_DAY },
  { level: 'month', unit: GAME_SECONDS_PER_MONTH },
  { level: 'year', unit: GAME_SECONDS_PER_YEAR }
]

/** 只装「UI 需要看」的字段；方法与句柄都在闭包里 */
export const clockState = reactive({
  /** 当前游戏时间（游戏秒） */
  currentTime: 0,
  /** running | paused | paused_event —— paused_event 留给事件模块，本批不用 */
  state: 'running',
  /** 暂停原因（一般是路由名），供指示器显示 */
  pausedBy: null
})

const hooks = { tick: [], hour: [], day: [], month: [], year: [] }

let timer = null
let lastTickRealTime = 0

/**
 * 注册时间钩子。
 * @param level 'tick' | 'hour' | 'day' | 'month' | 'year'
 * @param cb    tick 收到 `{ realSeconds, gameSeconds, currentTime }`；
 *              其余收到 `(gameTime, unitIndex)`
 * @returns 注销函数
 */
export const register = (level, cb) => {
  if (!hooks[level]) throw new Error(`未知的时间钩子层级: ${level}`)
  hooks[level].push(cb)
  return () => {
    const i = hooks[level].indexOf(cb)
    if (i >= 0) hooks[level].splice(i, 1)
  }
}

const fire = (level, ...args) => {
  for (const cb of [...hooks[level]]) cb(...args)
}

/** 跨越 unit 的整数倍边界时逐单位补触发，掉帧也不会漏掉 day/month/year */
const checkBoundary = (level, prevTime, nextTime, unit) => {
  const prevUnit = Math.floor(prevTime / unit)
  const nextUnit = Math.floor(nextTime / unit)
  for (let i = prevUnit + 1; i <= nextUnit; i++) fire(level, i * unit, i)
}

export const isRunning = () => clockState.state === 'running'

/**
 * 把游戏时间回灌进时钟。
 *
 * 存档里只存当前游戏秒（**不存**句柄与钩子表），读档后由持久化层调这里恢复。
 * 少了这一步，刷新页面日期就会归零。
 */
export const setCurrentTime = seconds => {
  const n = Number(seconds)
  clockState.currentTime = Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * 推进一次。deltaRealSeconds 是现实秒，会被钳制到 MAX_TICK_REAL_SECONDS。
 * 返回本次实际推进的游戏秒数（0 表示没推进）。
 *
 * 抽成独立函数是为了能脱离 setInterval 单测/调试。
 */
export const advance = deltaRealSeconds => {
  const clamped = Math.min(Math.max(Number(deltaRealSeconds) || 0, 0), MAX_TICK_REAL_SECONDS)
  if (clamped <= 0) return 0

  /**
   * 按**整步**推进：1 现实秒 = 1 步 = 15 游戏分（睡觉快进只是把步数放大）。
   *
   * ⚠ 不能用 `clamped × 900` 连续推进：setInterval 的真实间隔是 1.001~1.02 秒，
   *   亚秒零头会一步步累积，把 tick 从 15 分格点上拖走。后果不是「偶尔差一点」——
   *   任务边界落在两个 tick 之间，1 小时轮要被第 5 个 tick 才切换，倒计时多一档
   *   「不足 15 分」，这是 2026-10-27 用户反复反馈的 46/31/16/1、52/37/22/7 的来源。
   */
  const steps = Math.round(clamped * timeScale)
  if (steps <= 0) return 0
  let gameSeconds = steps * GAME_STEP_SECONDS
  // 加速时限流：最多推进到睡觉结束。用尽后自动放开，避免时钟永久卡住。
  if (Number.isFinite(advanceLimit)) {
    const allowedSteps = Math.floor(advanceLimit / GAME_STEP_SECONDS)
    gameSeconds = Math.min(gameSeconds, Math.max(allowedSteps, 0) * GAME_STEP_SECONDS)
    advanceLimit -= gameSeconds
    if (advanceLimit < GAME_STEP_SECONDS) advanceLimit = Infinity
  }
  if (gameSeconds <= 0) return 0

  const prevTime = clockState.currentTime
  // 老档 / 离线落点可能带 15 分以内的零头：先向下对齐，再整步推进。
  // 对齐只影响这一次 tick 的实际增量（`nextTime - prevTime` 仍为正），不会倒拨时间。
  const base = Math.floor(prevTime / GAME_STEP_SECONDS) * GAME_STEP_SECONDS
  const nextTime = base + gameSeconds
  clockState.currentTime = nextTime

  const delta = nextTime - prevTime
  fire('tick', { realSeconds: clamped, gameSeconds: delta, currentTime: nextTime })
  for (const boundary of BOUNDARIES) {
    checkBoundary(boundary.level, prevTime, nextTime, boundary.unit)
  }
  return delta
}

/**
 * 把时钟**直接跳到**某个游戏时刻，并把途中跨过的 hour/day/month/year 边界**逐个补触发**。
 *
 * 只给「睡到天亮」这类**跳过一段无产出时间**的玩家操作使用。不能用 `advance()` ——
 * 它收的是现实秒，而且被 `MAX_TICK_REAL_SECONDS` 钳死（一次最多 1.25 游戏小时）。
 *
 * ⚠ **只补边界钩子，不发 tick**。tick 的语义是「每秒结算」，而跳过的这一段
 *   该由调用方按自己的切片结算（dayLoop 就是这么做的）；
 *   在这里发 tick 会让灵力/体力按错误的粒度结算两次。
 *
 * @returns 实际推进的游戏秒（<= 0 表示没动）
 */
export const skipTo = targetGameSeconds => {
  const target = Number(targetGameSeconds)
  if (!Number.isFinite(target) || target <= clockState.currentTime) return 0
  const prevTime = clockState.currentTime
  clockState.currentTime = target
  for (const boundary of BOUNDARIES) {
    checkBoundary(boundary.level, prevTime, target, boundary.unit)
  }
  return target - prevTime
}

const tick = () => {
  if (!isRunning()) return
  const now = Date.now()
  const deltaRealSeconds = (now - lastTickRealTime) / 1000
  lastTickRealTime = now
  advance(deltaRealSeconds)
}

/** 启动（重复调用无副作用） */
export const start = () => {
  if (timer !== null) return
  lastTickRealTime = Date.now()
  timer = setInterval(tick, TICK_MS)
}

export const stop = () => {
  if (timer === null) return
  clearInterval(timer)
  timer = null
}

/**
 * 暂停持有者 —— **模块闭包**，与 hooks / timer 同理：不进 state、不序列化。
 *
 * 为什么要两个持有者：路由守卫（router.afterEach → syncClockPause）在离开暂停页时
 * 会无条件调 `resume()`。若「诞生弹窗的事件暂停」与「路由暂停」共用同一个 state 字段，
 * 玩家在弹窗开着时点任何导航，事件暂停就被踩掉了 —— 时钟恢复走、弹窗却还挂着。
 * 拆成「事件持有者集合 + 路由持有者」再由 `applyState()` 派生，
 * 这类互踩**由结构消除**；不需要在 syncClockPause 里写
 * `if (state === 'paused_event') return` 那种特判（特判在「事件期间进出暂停页」
 * 的组合下会再次出错）。
 *
 * ⚠ 代价：`$reset()` 清不掉它们（模块闭包），所以 persistence.initializePlayer()
 *   必须调 clearEventPauses()，否则重置存档后时钟会永久卡在 paused_event。
 */
const eventHolds = new Set()
let routeHold = null

/** 由持有者派生 clockState.state —— 事件优先级高于路由 */
const applyState = () => {
  const wasRunning = clockState.state === 'running'
  let next = 'running'
  let reason = null
  if (eventHolds.size) {
    next = 'paused_event'
    reason = [...eventHolds][0]
  } else if (routeHold) {
    next = 'paused'
    reason = routeHold
  }
  clockState.state = next
  clockState.pausedBy = reason
  // 关键：不重置的话，暂停期间的现实时间会灌进恢复后的第一次 tick。
  // 只在「真的从非 running 变回 running」时重置 —— 无条件重置会让每次导航
  // 都吞掉已累计的现实时间。
  if (next === 'running' && !wasRunning) lastTickRealTime = Date.now()
}

/** 路由暂停（同一时刻只有一个页面）。重复调用无害 */
export const pause = (reason = null) => {
  routeHold = reason
  applyState()
}

export const resume = () => {
  routeHold = null
  applyState()
}

/** 事件暂停（诞生弹窗、剧情等）。可多个来源并存，全部释放才恢复 */
export const pauseForEvent = (reason = null) => {
  eventHolds.add(reason)
  applyState()
}

export const resumeFromEvent = (reason = null) => {
  eventHolds.delete(reason)
  applyState()
}

/** 清空所有事件持有者。读档 / 重置存档时调用，防止上个会话的持有者泄漏 */
export const clearEventPauses = () => {
  eventHolds.clear()
  applyState()
}

export const isEventPaused = () => clockState.state === 'paused_event'
