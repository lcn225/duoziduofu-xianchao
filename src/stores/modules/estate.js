// 【封地经营】运行时层（B3，2026-10-26）
//
// 纯函数在 `plugins/estate.js`；这里只做三件事：
//   ① 把日结结果入账（`currency.spiritual` / `currency.secular`）并落盘；
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
  createEstateState,
  laborSatisfactionOf,
  moraleBaselineOf,
  moraleCoefOf,
  moraleLabelOf,
  nextQuoteOf,
  normalizeEstate,
  patrolSettledInWindow,
  productionOf,
  taxMonthlyJinYeZi,
  tutorialStepOf,
  upgradeQuote
} from '../../plugins/estate.js'
import { normalizeCurrency } from '../../plugins/currency.js'

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

  /** UI 汇总：概况 + 每个建筑 + 征收 + 教程 */
  estateView() {
    const e = this.estateSafe
    const coef = moraleCoefOf(e.morale)
    const satisfaction = laborSatisfactionOf(e)
    const patrolled = this.estatePatrolledToday
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
        job: e.builds[building.id] || null,
        quote: nextQuoteOf(e, building.id),
        outputPerDay: productionOf(e, building.id, { moraleCoef: coef, patrolled })
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
      buildings,
      /** MVP 建筑槽（4 个）：建筑区只列这些，其余进科技树 */
      activeBuildings: buildings.filter(building => building.mvp),
      techTree: BUILDINGS.filter(building => !building.mvp),
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
    const result = advanceEstateDayPure(e, {
      midnight: m,
      patrolled,
      stones: Number(this.currency?.spiritual) || 0
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
        spiritual: Math.max(Math.round(current.spiritual + gainedStones - spent), 0),
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
    if (!building.mvp) return { ok: false, message: `${building.name}尚未开放` }
    if (Number(e.buildings[id]) > 0) return { ok: false, message: `${building.name}已经建成` }
    if (e.builds[id]) return { ok: false, message: `${building.name}正在建造中` }

    const quote = upgradeQuote(id, 1, { firstBuild: true })
    if (!quote) return { ok: false, message: '无法建造' }
    const job = {
      targetLevel: 1,
      progress: 0,
      paid: 0,
      costStones: quote.costStones,
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
      costStones: quote.costStones,
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
