// 练气期月报（2026-11-27 待办 #3）—— 纯函数层，不 import Vue / Pinia。
//
// 第 3 档「居中弹窗」的第五类（《模块解锁方针》§四）：**练气段每个游戏月一次**，
// 可关、**不暂停时钟**。筑基后内宅改周报、Day 页改「昨日战报」，月报不再出现。
//
// 口径（2026-11-27 用户拍板）：
//   · 收支 = **月初余额 → 月末余额的净变化**（灵石 / 大子各一行）。
//     不做「收入 / 支出」双栏 —— 那要给探索、秘境、封地、商店、药浴、月俸
//     所有货币变动点加记账，以后新增消费口还容易漏。
//   · 材料与宝匣 = **本月入包件数 / 入匣个数**（材料按「灵材 + 灵植」的件数，
//     宝匣按个数；封地取回 / 三换二这种「搬家」不计入，见 store 的 `monthly: false`）。
//   · 离线跨过的月界**不出月报**（离线报告已覆盖那段时间），回线后从下一个完整月开始。
//
// 出生 / 寿终 / 突破这些计数不在这里另记一套：内宅周报的计数器
// （`emptyCourtWeekStats`）本来就在记，`recordCourtWeek` 顺手同步到这里。
import { MONTH_SECONDS, monthIndexOf } from './salary.js'

/** 月报数据形状版本；不匹配就整份重置（回显层，丢历史无害） */
export const MONTHLY_REPORT_VERSION = 1

/**
 * 月报计数器（字段集合是唯一真源）。
 * 键与 `emptyCourtWeekStats` 的重叠部分由 `recordCourtWeek` 自动同步。
 */
export const emptyMonthlyStats = () => ({
  /** 诞下（桂冈亲生） */
  births: 0,
  /** 其中带灵根 */
  rootedBirths: 0,
  /** 添孙（子嗣的后代） */
  grandchildren: 0,
  /** 妻妾寿终 */
  wifeDeaths: 0,
  /** 子嗣寿终 */
  offspringDeaths: 0,
  /** 子嗣修为精进（突破）人数 */
  breakthroughs: 0,
  /** 自动洗命消耗的洗命符张数 */
  autoWashes: 0,
  /** 本月入包的灵材 + 灵植件数 */
  materials: 0,
  /** 本月入匣的宝匣个数 */
  chests: 0
})

/** 该计数器是否被月报读取（`recordCourtWeek` 的 patch 里无关键直接忽略） */
export const isMonthlyStatKey = key => key in emptyMonthlyStats()

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback)
const countOf = value => Math.max(Math.round(num(value)), 0)

/**
 * 月报是否有任何可报的内容。
 * 全 0 的月份**不弹窗**（练气 48 现实分钟里玩家可能只是在挂机）。
 */
export const hasMonthlyActivityOf = report => {
  if (!report) return false
  return (
    Math.abs(num(report.spiritual)) > 0 ||
    Math.abs(num(report.secular)) > 0 ||
    countOf(report.births) > 0 ||
    countOf(report.rootedBirths) > 0 ||
    countOf(report.grandchildren) > 0 ||
    countOf(report.wifeDeaths) > 0 ||
    countOf(report.offspringDeaths) > 0 ||
    countOf(report.innerLevels) > 0 ||
    countOf(report.bodyLevels) > 0 ||
    countOf(report.materials) > 0 ||
    countOf(report.chests) > 0
  )
}

/**
 * 结算成一个可展示的月报对象；没有任何内容时返回 `null`（调用方据此不弹窗）。
 *
 * @param {object} input
 * @param {number} input.month       刚结束的月序号（0 起；展示时 +1）
 * @param {object} input.stats       本月的 `emptyMonthlyStats()` 计数
 * @param {object} input.currencyStart 月初余额 `{ secular, spiritual }`
 * @param {object} input.currencyEnd   月末余额 `{ secular, spiritual }`
 * @param {number} input.levelStart / input.levelEnd        内功层号（含两端）
 * @param {number} input.bodyLevelStart / input.bodyLevelEnd 外功层号
 * @returns {null | object}
 */
export const buildMonthlyReportOf = ({
  month = 0,
  stats = {},
  currencyStart = {},
  currencyEnd = {},
  levelStart = 1,
  levelEnd = 1,
  bodyLevelStart = 1,
  bodyLevelEnd = 1
} = {}) => {
  const monthIndex = Math.max(Math.floor(num(month)), 0)
  const report = {
    version: MONTHLY_REPORT_VERSION,
    month: monthIndex,
    label: `第 ${monthIndex + 1} 月`,
    /** 净变化；负数表示本月花得比进账多 */
    spiritual: Math.round(num(currencyEnd.spiritual) - num(currencyStart.spiritual)),
    secular: Math.round(num(currencyEnd.secular) - num(currencyStart.secular)),
    births: countOf(stats.births),
    rootedBirths: countOf(stats.rootedBirths),
    grandchildren: countOf(stats.grandchildren),
    wifeDeaths: countOf(stats.wifeDeaths),
    offspringDeaths: countOf(stats.offspringDeaths),
    breakthroughs: countOf(stats.breakthroughs),
    autoWashes: countOf(stats.autoWashes),
    materials: countOf(stats.materials),
    chests: countOf(stats.chests),
    /** 桂冈内功 / 外功本月升了几层（含突破与连升） */
    innerLevels: Math.max(0, Math.floor(num(levelEnd, 1)) - Math.floor(num(levelStart, 1))),
    bodyLevels: Math.max(0, Math.floor(num(bodyLevelEnd, 1)) - Math.floor(num(bodyLevelStart, 1)))
  }
  return hasMonthlyActivityOf(report) ? report : null
}

/**
 * 带符号的净额文案：`+123` / `-45` / `±0`。
 * 只给月报 UI 用，不做千分位（练气段的数量级用不上）。
 */
export const formatSignedAmountOf = value => {
  const n = Math.round(num(value))
  if (n === 0) return '±0'
  return `${n > 0 ? '+' : ''}${n}`
}

/** 游戏秒 → 是否已经跨进下一个游戏月（只用于断言 / 调试） */
export const isMonthBoundary = gameSeconds => {
  const t = Math.max(num(gameSeconds), 0)
  return t > 0 && t % MONTH_SECONDS === 0
}

export { MONTH_SECONDS, monthIndexOf }
