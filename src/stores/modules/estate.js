// 【封地经营】运行时层（B3，2026-10-26）
//
// 纯函数在 `plugins/estate.js`；这里只做三件事：
//   ① 把日结结果入账（`currency.spiritual1` 产出一阶 / `currency.spiritual2` 建设付款 /
//      `currency.secular` 税收）并落盘；
//   ② 管理建造 / 升级的开工入口；
//   ③ 给 UI 汇总派生值。
//
// ⚠ 本模块**没有** `PAUSE_ROUTES` 条目：封地是「看着进度条跑」的观战页（同内宅），
//   暂停会让它变成死屏。日结挂在 clock.js 的 day 钩子上。
// ⚠ 家族工作在 B3 **仍是直产资源**，不参与这里的进度条加速（2026-10-26 拍板，
//   等矿场/工坊/商队上线再一次性切换，避免一半岗位空转）。

import {
  BUILDINGS,
  ESTATE_TUNING,
  GAME_SECONDS_PER_DAY,
  advanceEstateDay as advanceEstateDayPure,
  buildingById,
  buildableBuildings,
  createEstateState,
  isBuildingUnlocked,
  laborSatisfactionOf,
  moraleBaselineOf,
  moraleCoefOf,
  moraleLabelOf,
  nextQuoteOf,
  normalizeEstate,
  patrolSettledInWindow,
  productionOf,
  taxMonthlyJinYeZi,
  techTreeBuildings,
  tutorialStepOf,
  upgradeQuote
} from '../../plugins/estate.js'
import { normalizeCurrency } from '../../plugins/currency.js'
import { patrolHoursOfDay } from '../../plugins/dayLoop.js'

export const state = () => ({
  estate: createEstateState()
})

export const getters = {
  /** 读档兜底后的封地状态（老档没有 estate / 被写成 null 时重建） */
  estateSafe() {
    return normalizeEstate(this.estate)
  },

  /** 今天是不是巡视日（日历日窗口里包住了 patrolEndSeconds） */
  estatePatrolledToday() {
    const t = Number(this.clockGameTime) || 0
    const midnight = Math.floor(t / GAME_SECONDS_PER_DAY) * GAME_SECONDS_PER_DAY
    return patrolSettledInWindow(this.dayLoop, midnight, midnight + GAME_SECONDS_PER_DAY)
  },

  /**
   * 今天**实际**巡视了几小时（没巡视 → 0）。
   *
   * ⚠ 先用 `estatePatrolledToday` 门控再读 `patrolHoursOfDay`：后者有 `minHours = 1` 兜底，
   *   探索 / 秘境时 dayLoop 冻结，直接读会拿到**旧日期**的 S（预期行为：那天不算加速）。
   */
  estatePatrolHoursToday() {
    return this.estatePatrolledToday ? patrolHoursOfDay(this.dayLoop) : 0
  },

  /** UI 汇总：概况 + 每个建筑 + 征收 + 教程 */
  estateView() {
    const e = this.estateSafe
    const coef = moraleCoefOf(e.morale)
    const satisfaction = laborSatisfactionOf(e)
    const patrolled = this.estatePatrolledToday
    const patrolHours = this.estatePatrolHoursToday
    const manorLevel = Number(e.buildings.manor) || 0
    const laborUsed = Object.values(e.builds || {}).reduce(
      (sum, job) => sum + (Number(job?.labor) || 0),
      0
    )
    const buildings = BUILDINGS.map(building => {
      const level = Number(e.buildings[building.id]) || 0
      return {
        ...building,
        level,
        unlocked: isBuildingUnlocked(e, building.id),
        job: e.builds[building.id] || null,
        quote: nextQuoteOf(e, building.id),
        outputPerDay: productionOf(e, building.id, { moraleCoef: coef, patrolHours })
      }
    })
    const taxMonthly = taxMonthlyJinYeZi(e)
    return {
      name: '长岭乡',
      manorLevel,
      morale: e.morale,
      moraleLabel: moraleLabelOf(e.morale),
      moraleCoef: coef,
      moraleBaseline: moraleBaselineOf(manorLevel),
      population: e.population,
      laborTotal: e.laborTotal,
      laborUsed,
      satisfaction,
      laborStop: satisfaction < ESTATE_TUNING.labor.stopBelow,
      prosperity: e.prosperity,
      taxProgress: e.taxProgress,
      taxUnlocked: manorLevel >= ESTATE_TUNING.tax.minManorLevel,
      taxMonthly,
      tutorialStep: tutorialStepOf(e),
      tutorialDone: tutorialStepOf(e) >= 3,
      patrolled,
      /** 今天实际巡视小时数（0 = 没巡视）；三进度按 `(24+S)/24` 加速 */
      patrolHours,
      /** 巡视为今天时，显示「+N%」用的整数百分比 */
      patrolBonusPct: Math.round((patrolHours / 24) * 100),
      /** 产出条的巡视窗口（绝对游戏秒；冻结/老档时可能是旧日期，纯函数会自己判掉） */
      patrolStartSeconds: Number(this.dayLoop?.dayStartSeconds) || 0,
      patrolEndSeconds: Number(this.dayLoop?.patrolEndSeconds) || 0,
      buildings,
      /** 建造槽：MVP 4 个 + 已解锁的额外建筑（药浴池），按教程顺序 */
      activeBuildings: buildableBuildings(e).map(building =>
        buildings.find(b => b.id === building.id)
      ),
      /** 科技树 = 还没解锁的（药浴池在乡侯府 Lv.2 后从这里消失） */
      techTree: techTreeBuildings(e),
      /** 药浴池解锁了没有（UI 用；`Estate.vue` 的池子卡片看它） */
      bathhouseUnlocked: isBuildingUnlocked(e, 'bathhouse'),
      log: e.log || []
    }
  }
}

export const actions = {
  ensureEstate() {
    this.estate = normalizeEstate(this.estate)
    return this.estate
  },

  /**
   * **老档建造任务迁移（2026-10-31 A1 拆账）**：`costStones` / `paid` 从一阶换算成二阶。
   * 只在 job 还没有 `costStone2` 时跑，幂等。
   * 误差 ≤ 0.5 二阶 —— 建设本来就不按分位数结算，可接受。
   */
  migrateEstateJobs() {
    const e = normalizeEstate(this.estate)
    let changed = false
    for (const job of Object.values(e.builds || {})) {
      if (!job || 'costStone2' in job) continue
      const rate = ESTATE_TUNING.stone1PerStone2
      job.costStone2 = Math.round((Number(job.costStones) || 0) / rate)
      delete job.costStones
      job.paid = Math.round((Number(job.paid) || 0) / rate)
      changed = true
    }
    if (changed) this.estate = e
    return changed
  },

  /**
   * **封地每日结算**（00:00 边界）。在线由 clock.js 的 day 钩子调，
   * 离线由 `offline.settleOfflineMidnightsBetween` 调 —— 两条线共用这一处。
   *
   * @param midnight 本次结算的 00:00 绝对游戏秒
   * @param {{silent?:boolean}} opts 离线静默（当前只影响返回，日志照样进、有上限）
   */
  advanceEstateDay(midnight, { silent = false } = {}) {
    const e = this.ensureEstate()
    const m = Number(midnight) || 0
    const patrolled = patrolSettledInWindow(this.dayLoop, m - GAME_SECONDS_PER_DAY, m)
    // 只有判定为巡视日才读 S：`patrolHoursOfDay` 有 minHours 兜底，冻结时会返回旧日期的值
    const patrolHours = patrolled ? patrolHoursOfDay(this.dayLoop) : 0
    const result = advanceEstateDayPure(e, {
      midnight: m,
      patrolHours,
      // A1 拆账：建设付款按**二阶**结算（设计表成本单位本来就是二阶）
      stone2: Number(this.currency?.spiritual2) || 0
    })
    if (!result.settled) return result

    this.estate = result.state

    const gainedStones = Number(result.gains.spiritual) || 0
    const gainedSecular = Number(result.gains.secular) || 0
    const spent = Number(result.spent) || 0
    if (gainedStones || gainedSecular || spent) {
      const current = normalizeCurrency(this.currency)
      this.currency = normalizeCurrency({
        ...current,
        // 产出一阶、付款二阶 —— 两档独立，不互相抵扣
        spiritual1: Math.max(Math.round(current.spiritual1 + gainedStones), 0),
        spiritual2: Math.max(Math.round(current.spiritual2 - spent), 0),
        secular: Math.max(Math.round(current.secular + gainedSecular), 0)
      })
    }

    // 离线重放期间 saveData 会被批次吞掉；在线则必须自己落盘（不在 tick 上）
    this.saveData()
    return { ...result, silent }
  },

  /** 建造（首建免费）。返回 `{ ok, message?, quote? }` */
  startEstateBuild(id) {
    const e = this.ensureEstate()
    const building = buildingById(id)
    if (!building) return { ok: false, message: '没有这个建筑' }
    // 2026-10-28 B4b：药浴池不在 MVP 四建筑里，但乡侯府 Lv.2 后可以建
    if (!building.mvp && !isBuildingUnlocked(e, id)) {
      return { ok: false, message: `${building.name}尚未开放（${building.unlockText || '条件未满足'}）` }
    }
    if (Number(e.buildings[id]) > 0) return { ok: false, message: `${building.name}已经建成` }
    if (e.builds[id]) return { ok: false, message: `${building.name}正在建造中` }

    const quote = upgradeQuote(id, 1, { firstBuild: true })
    if (!quote) return { ok: false, message: '无法建造' }
    const job = {
      targetLevel: 1,
      progress: 0,
      paid: 0,
      costStone2: quote.costStone2,
      days: quote.days,
      labor: quote.labor,
      firstBuild: true
    }
    this.estate = { ...e, builds: { ...e.builds, [id]: job } }
    this.pushEstateLog(`${building.name}动工（首建免费 · 工期 ${quote.days} 天）`, 'build')
    this.saveData()
    return { ok: true, quote }
  },

  /** 升级。返回 `{ ok, message?, quote? }` */
  startEstateUpgrade(id) {
    const e = this.ensureEstate()
    const building = buildingById(id)
    if (!building) return { ok: false, message: '没有这个建筑' }
    const level = Number(e.buildings[id]) || 0
    if (level <= 0) return { ok: false, message: `${building.name}尚未建成` }
    if (level >= building.maxLevel) return { ok: false, message: `${building.name}已满级` }
    if (e.builds[id]) return { ok: false, message: `${building.name}正在建设中` }

    const quote = upgradeQuote(id, level + 1)
    if (!quote) return { ok: false, message: '无法升级' }
    const job = {
      targetLevel: level + 1,
      progress: 0,
      paid: 0,
      costStone2: quote.costStone2,
      days: quote.days,
      labor: quote.labor,
      firstBuild: false
    }
    this.estate = { ...e, builds: { ...e.builds, [id]: job } }
    this.pushEstateLog(`${building.name}开始升级 Lv.${level + 1}（工期 ${quote.days} 天）`, 'build')
    this.saveData()
    return { ok: true, quote }
  },

  /** 封地流水（最新在上，上限见 TUNING.logLimit） */
  pushEstateLog(text, kind = 'info') {
    if (!text) return
    const e = this.ensureEstate()
    const day = Math.floor((Number(this.clockGameTime) || 0) / GAME_SECONDS_PER_DAY)
    const log = [{ day, kind, text }, ...(e.log || [])].slice(0, ESTATE_TUNING.logLimit)
    this.estate = { ...e, log }
  }
}
