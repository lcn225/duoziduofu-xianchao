// 月俸（模块六 · 经济）—— 2026-11-06 B8-b 重构：**90% 贡献点 + 10% 累积提现**
//
//   · 金额 = 职位月俸（下柱 833 / 中柱 1,500 / 上柱 2,500 二阶）× 月数；
//   · **90% 折算成贡献点**（`faction.contribution` + `contributionTotal`，飞鹰阁唯一货币）；
//   · **10% 累积成可提现额度**（`faction.withdrawable`，二阶记账，无上限），
//     玩家手动 `withdrawSalary()` 提现成 `currency.spiritual`（×100 一阶）；
//   · **练气按月、筑基后每游戏年发一次**（`salaryDueMonths` 里判年边界）。
//
// 挂在 gameClock 的 `month` 边界上；掉帧跨了多个月会一次补发多月，不会吞掉。
// 旧档没有 `lastSalaryMonth` 字段时 deepMerge 会补成 -1：只发当月，不补历史。
//
// **新档的首月不在这里发**（2026-11-20）：`isNewPlayer` 期间 `paySalaryUpTo`
// 直接返回 0，首月只由 Day 页的 `claimStartingSalary` 一次性直接入账
// （83 二阶 + 20 金页子）。否则月钩子 / 离线块结算会抢先把「-1 → 欠 1 个月」
// 领走，领取条再点就是 +0。
//
// ⚠ 旧口径「90% 挂账 `faction.credit`」已整条删除（2026-11-06）。
//   老档 `credit`（一阶）由 `normalizeFactionOnLoad` **÷100** 迁成贡献点。

import {
  STARTING_GIFT,
  monthIndexOf,
  nextRankGapOf,
  rankOfContributionTotal,
  salaryDueMonths,
  salarySplitOf
} from '../../plugins/salary.js'
import { isAscendedLevelOf } from '../../plugins/realm.js'
import { DENOMINATION } from '../../plugins/currency.js'

export const state = () => ({
  /** 上次发俸禄的月份序号；-1 = 还没发过（新档 / 旧档迁移） */
  lastSalaryMonth: -1,
  /** 最近一次发薪的拆分（只给 UI 文案用，不参与结算） */
  lastSalarySplit: { months: 0, rank: '', totalStone2: 0, points: 0, withdrawStone2: 0 }
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
  /** 可提现额度（二阶，累积） */
  salaryWithdrawable() {
    return Math.max(0, Math.floor(Number(this.faction?.withdrawable) || 0))
  },
  /** 可提现额度折成一阶灵石（提现时直接进 `currency.spiritual`） */
  salaryWithdrawableStone1() {
    return this.salaryWithdrawable * DENOMINATION.stone1PerStone2
  }
}

export const actions = {
  /**
   * 结算到 gameTime 所在月份为止的俸禄。
   * @returns {{ points:number, withdrawStone2:number }}
   *   本次折算的贡献点 / 可提现额度（0 = 本月/本年还没到发薪点）
   */
  paySalaryUpTo(gameTime, { announce = true } = {}) {
    const empty = { points: 0, withdrawStone2: 0 }
    // 新档的首月由 Day 页「开局红包」一次性直接入账（`claimStartingSalary`）。
    // 月钩子 / 离线块结算在这之前一律不结算 —— 否则首月会被它们静默领走
    // （`lastSalaryMonth: -1` 会被 `salaryDueMonths` 当成「欠 1 个月」），
    // 玩家再点领取条就是 +0（2026-11-20 修）。
    if (this.isNewPlayer) return empty
    const currentMonth = monthIndexOf(gameTime)
    const ascended = isAscendedLevelOf(this.level)
    const months = salaryDueMonths({
      lastPaidMonth: this.lastSalaryMonth,
      currentMonth,
      ascended
    })
    if (months <= 0) return empty
    if (!this.faction) return empty

    const rank = this.salaryRank
    const split = salarySplitOf(months * rank.stone2PerMonth)

    // 90% → 贡献点（**同时计累计**：升职门槛包含俸禄这一份）
    if (split.points > 0) {
      this.faction.contribution = (Number(this.faction.contribution) || 0) + split.points
      this.faction.contributionTotal = (Number(this.faction.contributionTotal) || 0) + split.points
    }
    // 10% → 累积可提现额度（二阶；不进钱袋、不参与门槛）
    this.faction.withdrawable =
      (Number(this.faction.withdrawable) || 0) + split.withdrawStone2
    this.lastSalaryMonth = currentMonth
    this.lastSalarySplit = { months, rank: rank.name, ...split }

    if (announce) {
      const suffix = months > 1 ? `（${months} 个月）` : ''
      this.pushFactionLog?.(
        `${rank.name}俸禄${suffix}：贡献点 +${split.points}` +
          ` · 可提现 +${split.withdrawStone2} 二阶`
      )
    }
    this.saveData()
    return { points: split.points, withdrawStone2: split.withdrawStone2 }
  },

  /**
   * 领取开局红包（Day 页领取条的唯一入口，2026-11-20）。
   *
   * **直接入账，不走 90/10 拆分**：83 二阶进 `currency.spiritual`、
   * 20 金页子（2,000 大子）进 `currency.secular`，口径见 `plugins/salary.js`
   * 的 `STARTING_GIFT`。为什么不用月俸那条路：90% 贡献点与 10% 可提现
   * 都只能在飞鹰门页（练气六层 + 乡侯府 Lv1）看见，开局等于空头支票。
   *
   * 领取时把 `lastSalaryMonth` 对齐到当前月 —— 月俸从下一个游戏月起发，
   * 不会因为新档 `-1` 把首月再发一遍。`isNewPlayer` 同时置 false，
   * 这是「自动结算期间不发首月」那道闸门（见 `paySalaryUpTo`）。
   *
   * @returns {{ ok:boolean, stone1:number, secular:number }}
   */
  claimStartingSalary({ save = true } = {}) {
    const empty = { ok: false, stone1: 0, secular: 0 }
    if (!this.isNewPlayer) return empty
    // 两次入账不各自落盘，末尾统一存一次（`gainCurrency` 默认会 save）
    this.gainCurrency('spiritual', STARTING_GIFT.stone1, { save: false })
    this.gainCurrency('secular', STARTING_GIFT.secular, { save: false })
    this.lastSalaryMonth = monthIndexOf(this.clockGameTime)
    this.isNewPlayer = false
    if (save) this.saveData()
    return { ok: true, stone1: STARTING_GIFT.stone1, secular: STARTING_GIFT.secular }
  },

  /**
   * 手动提现：把**全部**可提现额度一次性打进钱袋（`currency.spiritual`，按一阶）。
   * 无手续费、无上限、**不影响累计贡献**。
   * @returns {{ ok:boolean, message?:string, stone1?:number, stone2?:number }}
   */
  withdrawSalary({ save = true } = {}) {
    const stone2 = Math.max(0, Math.floor(Number(this.faction?.withdrawable) || 0))
    if (stone2 <= 0) return { ok: false, message: '没有可提现的俸禄' }
    const stone1 = stone2 * DENOMINATION.stone1PerStone2
    this.faction.withdrawable = (Number(this.faction.withdrawable) || 0) - stone2
    this.gainCurrency('spiritual', stone1)
    this.pushFactionLog?.(`提取俸禄：${stone2} 二阶灵石入袋`)
    if (save) this.saveData()
    return { ok: true, stone1, stone2 }
  }
}
