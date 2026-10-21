// 月俸（模块六 · 经济）—— 开局发一个月，此后每个游戏月自动到账
//
// 挂在 gameClock 的 `month` 边界上（30 游戏天 ≈ 48 现实分钟）。
// 掉帧跨了多个月会一次补发多月，不会吞掉。
// 旧档没有 `lastSalaryMonth` 字段时 deepMerge 会补成 -1：只发当月，不补历史。

import { SALARY_TUNING, monthIndexOf, salaryMonthsDue } from '../../plugins/salary.js'

export const state = () => ({
  /** 上次发俸禄的月份序号；-1 = 还没发过（新档 / 旧档迁移） */
  lastSalaryMonth: -1
})

export const actions = {
  /**
   * 结算到 gameTime 所在月份为止的俸禄。
   * @returns 本次实发金额（0 = 本月已经发过）
   */
  paySalaryUpTo(gameTime, { announce = true } = {}) {
    const currentMonth = monthIndexOf(gameTime)
    const months = salaryMonthsDue({ lastPaidMonth: this.lastSalaryMonth, currentMonth })
    if (months <= 0) return 0

    const amount = months * SALARY_TUNING.amount
    this.gainCurrency(SALARY_TUNING.currency, amount)
    this.lastSalaryMonth = currentMonth
    if (announce) {
      const suffix = months > 1 ? `（补发 ${months} 个月）` : ''
      this.pushCourtLog?.(`月俸到账：${amount.toLocaleString()} 大子${suffix}`)
    }
    this.saveData()
    return amount
  }
}
