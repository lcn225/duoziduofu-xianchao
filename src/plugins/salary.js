// 月俸 —— 2026-11-01 B8 落地：**足额二阶 + 10% 现银 / 90% 挂账双轨**
//
// 历史：
//   · 2026-10-21 开局「灵石礼包」改成 6,000 大子/月的凡俗俸禄（过渡值）。
//   · 2026-10-27 A2 拍板改成二阶：下柱 833 / 中柱 1,500 / 上柱 2,500 二阶/月。
//   · 2026-11-01 B8 正式落地，并按原作「见票支账 + 腊月取现」拆成双轨：
//       **10% 兑现成灵石现款（进 `currency.spiritual`）**；
//       **90% 记「挂账」（`faction.credit`，按一阶总账记）**，
//       只能在大库 / 秘库按内部优惠价淘换，不直接进钱袋。
//     —— 这样 833 二阶/月不会把一阶宝匣扫空，同时把玩家推去秘库/大库消费。
//
// 职位（《模块五》§13.4）：只看**累计获得**的贡献点，不扣持有。
//   下柱 开局 · 中柱 1,500 · 上柱 5,000。
//
// 发放节奏（2026-11-01 用户拍板）：**练气按月、筑基后每游戏年发一次**。
//   筑基后 24× 世界里一游戏月 = 2 现实分钟，一年 = 24 现实分钟，不会等太久。
//   跨年判定用「月序号跨过 12 的倍数」，不是滚动 12 个月，这样和「腊月」对得上。

import { DENOMINATION } from './currency.js'

/** 一个游戏月 = 30 游戏天 */
export const MONTH_SECONDS = 86400 * 30

/** 一年 = 12 个游戏月 */
export const SALARY_MONTHS_PER_YEAR = 12

/** 现银比例：10% 进钱袋，其余 90% 挂账 */
export const SALARY_CASH_RATIO = 0.1

/**
 * 职位阶梯（《模块五》§13.4）。
 * `minContributionTotal` = 累计获得的贡献点门槛；`stone2PerMonth` = **二阶**月俸。
 * 上柱 2,500 是拟值（原文未明价），按 1 : 1.8 : 3 补齐。
 */
export const SALARY_RANKS = [
  { id: 'xia', name: '下柱', minContributionTotal: 0, stone2PerMonth: 833 },
  { id: 'zhong', name: '中柱', minContributionTotal: 1500, stone2PerMonth: 1500 },
  { id: 'shang', name: '上柱', minContributionTotal: 5000, stone2PerMonth: 2500 }
]

/** 老口径兼容：给 UI 文案用的「下柱月俸」 */
export const SALARY_TUNING = {
  /** 下柱月俸（二阶） */
  amountStone2: SALARY_RANKS[0].stone2PerMonth,
  /** 记账币种：现银进修仙层；挂账进 `faction.credit` */
  currency: 'spiritual',
  label: '月俸'
}

export const monthIndexOf = gameTime => {
  const t = Number(gameTime)
  return Number.isFinite(t) && t > 0 ? Math.floor(t / MONTH_SECONDS) : 0
}

/** 累计贡献点 → 职位对象；未知/负数按下柱 */
export const rankOfContributionTotal = total => {
  const t = Math.max(0, Math.floor(Number(total) || 0))
  let rank = SALARY_RANKS[0]
  for (const r of SALARY_RANKS) if (t >= r.minContributionTotal) rank = r
  return rank
}

/** 距离下一职位还差多少累计贡献点；已到顶返回 0 */
export const nextRankGapOf = total => {
  const t = Math.max(0, Math.floor(Number(total) || 0))
  const next = SALARY_RANKS.find(r => r.minContributionTotal > t)
  return next ? next.minContributionTotal - t : 0
}

/**
 * 应发几个月。
 *
 * - `lastPaidMonth < 0`（新档、或旧档没这个字段）时**只发当月**，不补历史。
 * - 练气期：跨了几个月就发几个月（掉帧/离线一次补发）。
 * - 筑基后：只在**跨过游戏年边界**（月序号跨过 12 的倍数）时发一次，
 *   发的是「上次发薪到本月」的全部月份 —— 升境当月不会凭空多发或少发。
 */
export const salaryDueMonths = ({ lastPaidMonth, currentMonth, ascended = false }) => {
  const current = Math.max(0, Math.floor(Number(currentMonth) || 0))
  const last = Number(lastPaidMonth)
  if (!Number.isFinite(last) || last < 0) return 1
  const lastMonth = Math.floor(last)
  if (current <= lastMonth) return 0
  const months = current - lastMonth
  if (!ascended) return months
  const crossedYear =
    Math.floor(current / SALARY_MONTHS_PER_YEAR) > Math.floor(lastMonth / SALARY_MONTHS_PER_YEAR)
  return crossedYear ? months : 0
}

/**
 * 把「二阶月俸 × 月数」拆成现银 / 挂账。
 *
 * @param {number} stone2Total 二阶总额（可以是小数，如 833 × 3）
 * @returns {{ totalStone1:number, cashStone1:number, creditStone1:number }}
 *   账本一律按**一阶**记；`cash + credit === total`，不会丢零头。
 */
export const salarySplitOf = stone2Total => {
  const totalStone1 = Math.max(0, Math.round((Number(stone2Total) || 0) * DENOMINATION.stone1PerStone2))
  const cashStone1 = Math.min(totalStone1, Math.round(totalStone1 * SALARY_CASH_RATIO))
  return { totalStone1, cashStone1, creditStone1: totalStone1 - cashStone1 }
}

/**
 * 挂账抵扣秘库价：**1 二阶挂账 = 1 贡献点**（2026-11-01 用户拍板）。
 * 秘库标价单位是贡献点，所以 1 点 = 1 二阶 = 100 一阶。
 */
export const creditStone1ForPoints = points =>
  Math.max(0, Math.round((Number(points) || 0) * DENOMINATION.stone1PerStone2))
