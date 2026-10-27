// 游戏日期 / 时刻的显示换算 —— **只此一份**。
//
// 这套换算原先内联在 `components/TimeStatusIndicator.vue` 里。「桂冈的一天」也要用，
// 再抄一份就是 CLAUDE.md「坑 §2」那个「两处口径对不上」的翻版，所以提出来共用。
//
// 时间常量复用 innerCourt.js（那已是事实上的真源）。

import { GAME_SECONDS_PER_HOUR as HOUR, GAME_SECONDS_PER_DAY as DAY } from './innerCourt.js'

export { HOUR as GAME_SECONDS_PER_HOUR, DAY as GAME_SECONDS_PER_DAY }
export const GAME_SECONDS_PER_MONTH = DAY * 30
export const GAME_SECONDS_PER_YEAR = DAY * 365

/** 十二时辰，各辖两个游戏小时。子时跨午夜（23:00–01:00），所以先把小时 +1 再折半 */
export const SHICHEN = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0)
const pad2 = n => String(n).padStart(2, '0')

/** 一天里的第几小时（0~23），带小数 */
export const hourFloatOf = gameSeconds => (num(gameSeconds) / HOUR) % 24

/** 一天里的整点（0~23） */
export const hourOf = gameSeconds => Math.floor(hourFloatOf(gameSeconds)) % 24

/** 时分，形如 `06:30` */
export const formatClock = gameSeconds => {
  const f = hourFloatOf(gameSeconds)
  const h = Math.floor(f)
  const m = Math.floor((f - h) * 60)
  return `${pad2(h)}:${pad2(m)}`
}

/** 时辰名，形如 `辰时` */
export const shichenOf = gameSeconds => `${SHICHEN[Math.floor(((hourOf(gameSeconds) + 1) % 24) / 2)]}时`

export const gameYearOf = gameSeconds => Math.floor(num(gameSeconds) / GAME_SECONDS_PER_YEAR) + 1
export const gameMonthOf = gameSeconds => Math.floor((num(gameSeconds) % GAME_SECONDS_PER_YEAR) / GAME_SECONDS_PER_MONTH) + 1
export const gameDayOfMonth = gameSeconds => Math.floor((num(gameSeconds) % GAME_SECONDS_PER_MONTH) / DAY) + 1

/** 形如 `第 3 年 · 3 月 · 初七 · 辰时` */
export const formatGameDate = gameSeconds =>
  `第 ${gameYearOf(gameSeconds)} 年 · ${gameMonthOf(gameSeconds)} 月 · ${gameDayOfMonth(gameSeconds)} 日 · ${shichenOf(gameSeconds)}`

/** 时长（游戏秒）→ 人话，形如 `1 小时 30 分` / `45 分` */
export const formatDuration = seconds => {
  const s = Math.max(num(seconds), 0)
  const totalMin = Math.round(s / 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h && m) return `${h} 小时 ${m} 分`
  if (h) return `${h} 小时`
  return `${m} 分`
}

/**
 * 倒计时（游戏秒）→ 15 分档人话。
 *
 * ⚠ 为什么不直接 `formatDuration`：时钟每 1 现实秒推进约 15 游戏分，而 tick 的真实
 *   间隔是 1.001~1.02 秒（后台节流、睡觉快进、rebase 重锚都会让某一步不是 15 分的整数倍）。
 *   直接用分钟显示，采样点相对轮次网格会漂：同一轮 60 分可能显示 45/30/15，也可能
 *   显示 52/37/22/7。向下取整到 15 分档后，显示值与采样相位无关（60 分轮恒为
 *   45/30/15，45 分轮恒为 30/15），玩家不会再看到「跳着走」的数字。
 *
 * 这是**显示层**口径，不改变任何结算；「本轮 1 小时」这类静态时长仍用 `formatDuration`。
 */
export const formatCountdown = seconds => {
  const s = Math.max(num(seconds), 0)
  if (s <= 0) return '0 分'
  if (s < 900) return '不足 15 分'
  return formatDuration(Math.floor(s / 900) * 900)
}
