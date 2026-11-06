// 月俸 —— 2026-11-01 B8 落地，**2026-11-06 B8-b 重构**：
// **90% 折算成贡献点（直接在飞鹰阁花）+ 10% 累积成可提现额度（手动提现成灵石）**
//
// 历史：
//   · 2026-10-21 开局「灵石礼包」改成 6,000 大子/月的凡俗俸禄（过渡值）。
//   · 2026-10-27 A2 拍板改成二阶：下柱 833 / 中柱 1,500 / 上柱 2,500 二阶/月。
//   · 2026-11-01 B8 拆双轨：10% 现银（`currency.spiritual`）+ 90% 挂账（`faction.credit`，
//     只能在大库 / 秘库按内部优惠价淘换）。
//   · **2026-11-06 B8-b**：挂账 `faction.credit` 整条删除 —— 90% 直接进 `faction.contribution`
//     （飞鹰阁唯一货币），10% 进 `faction.withdrawable`（二阶记账，累积、手动提现）。
//
// 职位（《模块五》§13.4）：只看**累计获得**的贡献点（任务 + 俸禄 90%），不扣持有、不扣提现。
//   **下柱 0 / 中柱 17,000 / 上柱 240,000**（2026-11-06 重标；旧 1,500 / 5,000 作废）。
//
// 发放节奏（2026-11-01 用户拍板，不变）：**练气按月、筑基后每游戏年发一次**。
//   跨年判定用「月序号跨过 12 的倍数」，不是滚动 12 个月，这样和「腊月」对得上。

/** 一个游戏月 = 30 游戏天 */
export const MONTH_SECONDS = 86400 * 30

/** 一年 = 12 个游戏月 */
export const SALARY_MONTHS_PER_YEAR = 12

/**
 * 可提现比例：**10% 累积成可提现额度**（二阶记账，无上限、无手续费、手动提现）。
 * 其余 90% 折算成贡献点 —— 两者之和恒等于当期俸禄总额，不丢零头。
 */
export const SALARY_WITHDRAW_RATIO = 0.1

/** 贡献点比例：90%（`1 − SALARY_WITHDRAW_RATIO`，单独导出只为可读） */
export const SALARY_POINTS_RATIO = 1 - SALARY_WITHDRAW_RATIO

/**
 * 职位阶梯（《模块五》§13.4）。
 * `minContributionTotal` = 累计获得的贡献点门槛；`stone2PerMonth` = **二阶**月俸。
 * 上柱 2,500 是拟值（原文未明价），按 1 : 1.8 : 3 补齐。
 */
export const SALARY_RANKS = [
  { id: 'xia', name: '下柱', minContributionTotal: 0, stone2PerMonth: 833 },
  { id: 'zhong', name: '中柱', minContributionTotal: 17000, stone2PerMonth: 1500 },
  { id: 'shang', name: '上柱', minContributionTotal: 240000, stone2PerMonth: 2500 }
]

/** 老口径兼容：给 UI 文案用的「下柱月俸」 */
export const SALARY_TUNING = {
  /** 下柱月俸（二阶） */
  amountStone2: SALARY_RANKS[0].stone2PerMonth,
  /** 贡献点：飞鹰阁唯一货币 */
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
 * 把「二阶月俸 × 月数」拆成 **贡献点 + 可提现额度**（2026-11-06 B8-b）。
 *
 * @param {number} stone2Total 二阶总额（可以是小数，如 833 × 3）
 * @returns {{ totalStone2:number, points:number, withdrawStone2:number }}
 *   `points + withdrawStone2 === totalStone2`（取整后仍然守恒，不会丢零头）。
 *
 * 下柱每月：833 二阶 ⇒ 贡献点 **750** + 可提现 **83 二阶**。
 */
export const salarySplitOf = stone2Total => {
  const total = Math.max(0, Math.round(Number(stone2Total) || 0))
  const points = Math.round(total * SALARY_POINTS_RATIO)
  return { totalStone2: total, points, withdrawStone2: total - points }
}
