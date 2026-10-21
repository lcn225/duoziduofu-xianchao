// 月俸 —— 2026-10-21 用户拍板：开局的「灵石礼包」改成「俸禄」月结
//
// 背景：旧文案写「开局赠送 20000 灵石」，实际发的是 200,000 大子，
// 是 P17 单位迁移时 20,000 × 10 的临时换算，既不叫灵石也不该一次给这么多
// （200,000 大子 = 100 位凡女侍妾）。现在改成「开局发一个月，此后每月自动到账」。
//
// 数额锚点：**6,000 大子 = 60 金页子 = 3 位凡女侍妾**（侍妾定价 20 金页子/位，
// 真源 `plugins/shop.js` 的 TUNING.maiden）。一个月够买 3 位，既不卡死也不破坏物价。
//
// 一个游戏月 = 30 游戏天 = 2880 现实秒 ≈ 48 现实分钟（gameClock 的 month 边界）。

export const SALARY_TUNING = {
  /** 每月俸禄（账本最小单位） */
  amount: 6000,
  /** 发在凡俗层：俸禄是粮食银钱，不是修士的灵石 */
  currency: 'secular',
  label: '月俸'
}

/** 一个游戏月 = 30 游戏天 */
export const MONTH_SECONDS = 86400 * 30

export const monthIndexOf = gameTime => {
  const t = Number(gameTime)
  return Number.isFinite(t) && t > 0 ? Math.floor(t / MONTH_SECONDS) : 0
}

/**
 * 应发几个月。
 *
 * `lastPaidMonth < 0`（新档、或旧档没这个字段）时**只发当月**，不补历史 ——
 * 旧档玩家不该因为读档一次性领到十年俸禄。
 */
export const salaryMonthsDue = ({ lastPaidMonth, currentMonth }) => {
  const current = Math.max(0, Math.floor(Number(currentMonth) || 0))
  const last = Number(lastPaidMonth)
  if (!Number.isFinite(last) || last < 0) return 1
  return Math.max(0, current - Math.floor(last))
}
