// 练气期月报（2026-11-27 待办 #3）—— 通知态 + 本月计数器。
//
// 规则真源：《模块解锁方针》§四 第 3 档「居中弹窗」第五类 ·
// 《下一步》B 档 #3。**练气段每个游戏月一次，可关、不暂停时钟**。
//
// 挂点：
//   · 月边界：`clock.js` 的 `register('month')`，**排在月俸 / 月饷之前** ——
//     这样月初发的俸禄算进「下一个月」的收支，而不是被边界快照吞掉。
//   · 出生 / 寿终 / 突破等：`innerCourt.recordCourtWeek` 顺手同步（不另记一套）。
//   · 材料 / 宝匣：`inventory.gainItemCount` / `gainChest`。
//
// ⚠ 离线重放**不触发** `register('month')`（离线块自己结算俸禄），所以离线跨过的月
//   本来就不会弹月报。回线后 `persistence.initializePlayer` 调
//   `startMonthlyReportCleanSlate()`：把当前这个「半在线半离线」的月跳过，
//   从下一个完整月开始计数（用户 2026-11-27 拍板）。
import { realmTierOf } from '../../plugins/realm.js'
import {
  MONTHLY_REPORT_VERSION,
  buildMonthlyReportOf,
  emptyMonthlyStats,
  isMonthlyStatKey,
  monthIndexOf
} from '../../plugins/monthlyReport.js'

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback)
const levelOf = value => Math.max(Math.floor(num(value, 1)), 1)

/** 新的一段月度计数（月初 / 读档 / 离线回线时重置） */
const freshMonthlyStats = store => ({
  version: MONTHLY_REPORT_VERSION,
  /** 正在累计的月序号（0 起） */
  month: monthIndexOf(store.clockGameTime),
  stats: emptyMonthlyStats(),
  currencyStart: {
    secular: num(store.currency?.secular),
    spiritual: num(store.currency?.spiritual)
  },
  /** 桂冈内功 / 外功的月初层号（月报报「升了几层」） */
  levelStart: levelOf(store.level),
  bodyLevelStart: levelOf(store.bodyLevel)
})

export const state = () => ({
  /**
   * 待玩家确认的月报；非空 = 弹窗。
   * 进存档：刷新页面不该把刚弹出的月报吞掉（体积很小）。
   */
  monthlyReport: null,
  /** 最近一次出月报的月序号（防同一月重复弹；0 起，-1 = 没出过） */
  monthlyReportShownMonth: -1,
  /**
   * 离线回线后要跳过的月界上界：`completed < monthlySuppressUntil` 不出报。
   * 例：回线在本月 M，设 M+1 ⇒ 本月末的月界（completed = M）跳过，
   * 下一个月末（completed = M+1）正常出报。
   */
  monthlySuppressUntil: -1,
  /** 正在累计的月度计数；形状见 `freshMonthlyStats` */
  monthlyStats: {
    version: MONTHLY_REPORT_VERSION,
    month: 0,
    stats: emptyMonthlyStats(),
    currencyStart: { secular: 0, spiritual: 0 },
    levelStart: 1,
    bodyLevelStart: 1
  }
})

export const getters = {
  /** 月报弹窗是否可见（组件直接读这个） */
  hasMonthlyReport() {
    return !!this.monthlyReport
  }
}

export const actions = {
  /**
   * 记一笔本月计数。`atSeconds` 传**事件发生时刻**（离线重放不是按时间顺序回调的）。
   * 只认 `emptyMonthlyStats` 里有的键；其它键（留宿 / 有喜等）静默忽略。
   *
   * 不落盘：计数跟着其它 `saveData` 走；月界出报时才强制存一次。
   */
  noteMonthly(patch = {}, atSeconds = null) {
    const month = monthIndexOf(atSeconds == null ? this.clockGameTime : atSeconds)
    const current = this.monthlyStats
    if (
      !current ||
      Number(current.version) !== MONTHLY_REPORT_VERSION ||
      !current.stats ||
      Number(current.month) !== month
    ) {
      // 跨月 / 老档形状不对：从这一笔开始重新累计。
      // 月界正常会先跑 `onMonthlyReportBoundary` 重置，这里只是兜底。
      this.monthlyStats = freshMonthlyStats(this)
      this.monthlyStats.month = month
    }
    const stats = this.monthlyStats.stats
    for (const [key, value] of Object.entries(patch || {})) {
      if (!isMonthlyStatKey(key)) continue
      stats[key] += Math.max(0, num(value))
    }
  },

  /**
   * 游戏月边界的月报结算（`clock.register('month')` 调用）。
   *
   * 只在**练气段**出报：筑基后 Day 页已经改为「昨日战报」+ 内宅周报，
   * 月报不再出现（离开练气段的那个月也不补报 = 预期行为）。
   */
  onMonthlyReportBoundary(gameTime) {
    const completedMonth = Math.max(monthIndexOf(gameTime) - 1, 0)
    const current = this.monthlyStats
    const canReport =
      realmTierOf(this.level) === 'qi' &&
      completedMonth >= num(this.monthlySuppressUntil, -1) &&
      completedMonth !== num(this.monthlyReportShownMonth, -1) &&
      current &&
      Number(current.version) === MONTHLY_REPORT_VERSION &&
      Number(current.month) === completedMonth

    let emitted = false
    if (canReport) {
      const report = buildMonthlyReportOf({
        month: completedMonth,
        stats: current.stats,
        currencyStart: current.currencyStart,
        currencyEnd: this.currency,
        levelStart: current.levelStart,
        levelEnd: this.level,
        bodyLevelStart: current.bodyLevelStart,
        bodyLevelEnd: this.bodyLevel
      })
      if (report) {
        this.monthlyReport = report
        this.monthlyReportShownMonth = completedMonth
        emitted = true
      }
    }
    // 不论出不出报，都从新的一个月重新计数
    this.monthlyStats = freshMonthlyStats(this)
    // 弹窗与计数器一起进档：刷新后不会重算一次，也不会丢这条月报
    if (emitted) this.saveData({ force: true })
  },

  /** 关闭月报（第 3 档：可关、不暂停时钟） */
  dismissMonthlyReport() {
    if (!this.monthlyReport) return false
    this.monthlyReport = null
    this.saveData()
    return true
  },

  /**
   * 读档归一化：没有字段 / 版本不对 / 月序号对不上（旧档、时钟被外部推进）→
   * 从当前月开始重新计数，**不补报**。
   *
   * @returns {boolean} 有没有改动（调用方决定要不要落盘）
   */
  normalizeMonthlyReportOnLoad() {
    const month = monthIndexOf(this.clockGameTime)
    const current = this.monthlyStats
    let changed = false
    if (
      !current ||
      Number(current.version) !== MONTHLY_REPORT_VERSION ||
      !current.stats ||
      !current.currencyStart
    ) {
      this.monthlyStats = freshMonthlyStats(this)
      changed = true
    } else if (Number(current.month) !== month) {
      this.monthlyStats = freshMonthlyStats(this)
      changed = true
    }
    if (this.monthlyReport && Number(this.monthlyReport.version) !== MONTHLY_REPORT_VERSION) {
      this.monthlyReport = null
      changed = true
    }
    if (changed) this.monthlySuppressUntil = -1
    return changed
  },

  /**
   * 离线回线：当前这个月被离线切了一半，**不出月报**；
   * 从下一个完整月开始计数（`monthlySuppressUntil = 当前月 + 1`）。
   * 同时清掉离线前可能挂着的旧月报，避免「闭关归来」叠在月报上。
   */
  startMonthlyReportCleanSlate() {
    const month = monthIndexOf(this.clockGameTime)
    this.monthlyStats = freshMonthlyStats(this)
    this.monthlySuppressUntil = month + 1
    this.monthlyReport = null
  }
}
