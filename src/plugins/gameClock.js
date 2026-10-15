// 游戏时钟 —— 所有跟时间相关的系统的底层骨架
//
//   1 现实秒 = 1 游戏小时   ← 唯一节奏旋钮
//   1 游戏天 = 24 游戏小时 = 24 现实秒
//   1 游戏年 = 365 游戏天 = 8760 现实秒 ≈ 2.43 现实小时
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

/** 现实秒 / 游戏小时。改小 = 整体变快（调试期可设 0.05，快 20 倍；记得改回 1） */
export const SECONDS_PER_GAME_HOUR = 1

const GAME_SECONDS_PER_HOUR = 3600
const GAME_SECONDS_PER_DAY = 86400
const GAME_SECONDS_PER_MONTH = 86400 * 30
const GAME_SECONDS_PER_YEAR = 86400 * 365

/** 现实时间推进的粒度 */
export const TICK_MS = 1000

/**
 * 单次 tick 愿意承认的现实秒上限。
 *
 * 浏览器会把后台标签页的 setInterval 节流到分钟级，恢复时一次 tick 会算出
 * 几小时的 delta。本批还没做离线结算，不钳制的话就等于「切走标签页白送收益」。
 * 这不是离线结算，是个漏洞。
 */
export const MAX_TICK_REAL_SECONDS = 5

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

  const gameSeconds = clamped * SECONDS_PER_GAME_HOUR * GAME_SECONDS_PER_HOUR
  const prevTime = clockState.currentTime
  const nextTime = prevTime + gameSeconds
  clockState.currentTime = nextTime

  fire('tick', { realSeconds: clamped, gameSeconds, currentTime: nextTime })
  for (const boundary of BOUNDARIES) {
    checkBoundary(boundary.level, prevTime, nextTime, boundary.unit)
  }
  return gameSeconds
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

export const pause = (reason = null) => {
  if (clockState.state === 'paused' && clockState.pausedBy === reason) return
  clockState.state = 'paused'
  clockState.pausedBy = reason
}

export const resume = () => {
  if (isRunning()) return
  clockState.state = 'running'
  clockState.pausedBy = null
  // 关键：不重置的话，暂停期间的现实时间会灌进恢复后的第一次 tick
  lastTickRealTime = Date.now()
}
