// 月俸（模块六 · 经济）—— 开局发一个月，此后按境界节奏到账
//
// 2026-11-01 B8：
//   · 金额 = 职位月俸（下柱 833 / 中柱 1,500 / 上柱 2,500 二阶）× 月数；
//   · **10% 兑现成灵石现款**（`currency.spiritual`），
//     **90% 记挂账**（`faction.credit`，一阶总账），只能在秘库/大库抵扣；
//   · **练气按月、筑基后每游戏年发一次**（`salaryDueMonths` 里判年边界）。
//
// 挂在 gameClock 的 `month` 边界上；掉帧跨了多个月会一次补发多月，不会吞掉。
// 旧档没有 `lastSalaryMonth` 字段时 deepMerge 会补成 -1：只发当月，不补历史。

import {
  SALARY_TUNING,
  creditStone1ForPoints,
  monthIndexOf,
  nextRankGapOf,
  rankOfContributionTotal,
  salaryDueMonths,
  salarySplitOf
} from '../../plugins/salary.js'
import { isAscendedLevelOf } from '../../plugins/realm.js'
import { formatSpiritual } from '../../plugins/currency.js'

export const state = () => ({
  /** 上次发俸禄的月份序号；-1 = 还没发过（新档 / 旧档迁移） */
  lastSalaryMonth: -1,
  /** 最近一次发薪的拆分（只给 UI 文案用，不参与结算） */
  lastSalarySplit: { months: 0, rank: '', totalStone1: 0, cashStone1: 0, creditStone1: 0 }
})

export const getters = {
  /** 当前职位（只看累计贡献点，不扣持有） */
  salaryRank() {
    return rankOfContributionTotal(this.faction?.contributionTotal)
  },
  /** 距下一职位还差多少累计贡献点（已到顶 = 0） */
  salaryNextRankGap() {
    return nextRankGapOf(this.faction?.contributionTotal)
  },
  /** 本月应发二阶总额（按当前职位） */
  salaryMonthlyStone2() {
    return this.salaryRank.stone2PerMonth
  },
  /** 挂账余额（一阶总账） */
  salaryCredit() {
    return Math.max(0, Math.floor(Number(this.faction?.credit) || 0))
  },
  /** 挂账折算成的贡献点购买力（1 二阶挂账 = 1 贡献点） */
  salaryCreditPoints() {
    return Math.floor(this.salaryCredit / 100)
  }
}

export const actions = {
  /**
   * 结算到 gameTime 所在月份为止的俸禄。
   * @returns 本次**现银**（一阶灵石，0 = 本月/本年还没到发薪点）
   */
  paySalaryUpTo(gameTime, { announce = true } = {}) {
    const currentMonth = monthIndexOf(gameTime)
    const ascended = isAscendedLevelOf(this.level)
    const months = salaryDueMonths({
      lastPaidMonth: this.lastSalaryMonth,
      currentMonth,
      ascended
    })
    if (months <= 0) return 0
    if (!this.faction) return 0

    const rank = this.salaryRank
    const split = salarySplitOf(months * rank.stone2PerMonth)
    this.gainCurrency(SALARY_TUNING.currency, split.cashStone1)
    this.faction.credit = (Number(this.faction.credit) || 0) + split.creditStone1
    this.lastSalaryMonth = currentMonth
    this.lastSalarySplit = { months, rank: rank.name, ...split }

    if (announce) {
      const suffix = months > 1 ? `（${months} 个月）` : ''
      this.pushFactionLog?.(
        `${rank.name}俸禄${suffix}：现银 ${formatSpiritual(split.cashStone1)}` +
          ` · 挂账 ${formatSpiritual(split.creditStone1)}`
      )
    }
    this.saveData()
    return split.cashStone1
  },

  /**
   * 用挂账抵扣秘库商品。**1 二阶挂账 = 1 贡献点**。
   * @returns {{ ok:boolean, message?:string, spentStone1?:number }}
   */
  spendCreditForPoints(points, { save = true } = {}) {
    const need = creditStone1ForPoints(points)
    const have = Math.max(0, Math.floor(Number(this.faction?.credit) || 0))
    if (!need || have < need) {
      return { ok: false, message: `挂账不足（需要 ${(need / 100).toLocaleString()} 二阶）` }
    }
    this.faction.credit = have - need
    if (save) this.saveData()
    return { ok: true, spentStone1: need }
  }
}
