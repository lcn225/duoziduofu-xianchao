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
  STORAGE_KEYS,
  advanceEstateDay as advanceEstateDayPure,
  buildingById,
  buildableBuildings,
  chainViewOf,
  createEstateState,
  isBuildingUnlocked,
  laborPlanOf,
  laborSatisfactionOf,
  laborTotalOf,
  nextQuoteOf,
  normalizeEstate,
  patrolSettledInWindow,
  productionOf,
  productTierOf,
  taxMonthlyStone1Of,
  techTreeBuildings,
  totalPopulationOf,
  tutorialStepOf,
  upgradeQuote,
  villagerCapOf
} from '../../plugins/estate.js'
import { isAliveOffspringOf } from '../../plugins/innerCourt.js'
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

  /** 活着的子嗣数（总人口 / 徭役 / 税收的分母） */
  estateOffspringCount() {
    return (this.offspring?.list || []).filter(isAliveOffspringOf).length
  },

  /** UI 汇总：概况 + 每个建筑 + 征收 + 教程 */
  estateView() {
    const e = this.estateSafe
    const offspringCount = this.estateOffspringCount
    const population = totalPopulationOf(e, offspringCount)
    const laborTotal = laborTotalOf(e, offspringCount)
    const satisfaction = laborSatisfactionOf(e, laborTotal)
    // 逐项分配（2026-11-04）：先开工的优先，够不到 50% 的排队
    const laborPlan = laborPlanOf(e, laborTotal)
    const patrolled = this.estatePatrolledToday
    const patrolHours = this.estatePatrolHoursToday
    const manorLevel = Number(e.buildings.manor) || 0
    const buildings = BUILDINGS.map(building => {
      const level = Number(e.buildings[building.id]) || 0
      return {
        ...building,
        level,
        unlocked: isBuildingUnlocked(e, building.id),
        job: e.builds[building.id] || null,
        /** 这一项本轮分到的徭役（`waiting` = 排队中，不推进） */
        laborShare: laborPlan.plan[building.id] || null,
        // 报价按**当前境界段**定价（§10.7，2026-11-04）：练气 88 / 筑基 700 / 金丹 3,000
        quote: nextQuoteOf(e, building.id, this.realmTier),
        outputPerDay: productionOf(e, building.id, { patrolHours })
      }
    })
    const taxMonthly = taxMonthlyStone1Of(e, offspringCount)
    // 经营链（b 段）：按当前库存与等级投影；市集未建时 made 恒 0
    const chain = chainViewOf(e, { realmTier: this.realmTier, patrolHours })
    return {
      name: '长岭乡',
      manorLevel,
      villagers: e.villagers,
      offspringCount,
      population,
      townCap: villagerCapOf(manorLevel),
      laborTotal,
      /** 在建需求合计 */
      laborDemand: laborPlan.demand,
      /** 实际派出的徭役（逐项分配后；≤ laborTotal） */
      laborUsed: laborPlan.assigned,
      /** 排队中的项目数（拿不到 50%，不推进也不占徭役） */
      laborQueued: Object.values(laborPlan.plan).filter(p => p.waiting).length,
      satisfaction,
      prosperity: e.prosperity,
      /** 中间产物独立仓（不占背包） */
      storage: { ...e.storage },
      storageKeys: STORAGE_KEYS,
      storageCap: ESTATE_TUNING.storageCap,
      /** 经营链（b 段）：三条链的库存 / 产能 / 单价 / 日入账 */
      chain,
      productTier: productTierOf(this.realmTier),
      marketLevel: Number(e.buildings.market) || 0,
      marketUnlocked: isBuildingUnlocked(e, 'market'),
      /** 三条链满产（不扣库存）的日入账，单位一阶 */
      chainFullIncomePerDay: chain.reduce((sum, row) => sum + (row.fullIncome || 0), 0),
      taxProgress: e.taxProgress,
      taxUnlocked: manorLevel >= ESTATE_TUNING.tax.minManorLevel,
      /** 月税收，单位一阶 */
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
      /** 建造槽：所有已解锁建筑，按教程顺序（v2 由乡侯府等级卡） */
      activeBuildings: buildableBuildings(e).map(building =>
        buildings.find(b => b.id === building.id)
      ),
      /** 科技树 = 还没解锁的 */
      techTree: techTreeBuildings(e),
      /** 药浴池解锁了没有（UI 用；`Estate.vue` 的池子卡片看它） */
      bathhouseUnlocked: isBuildingUnlocked(e, 'bathhouse'),
      log: e.log || []
    }
  }
}

/**
 * 开工流水号：在建项目里取 `max(seq) + 1`。
 * 徭役逐项分配按它排队（先开工的先拿满）；老档没有 seq（按 0 起算）时纯函数会按
 * `builds` 的插入顺序兜底，语义一致。
 */
const nextBuildSeqOf = estate => {
  const builds = estate?.builds && typeof estate.builds === 'object' ? estate.builds : {}
  return Object.values(builds).reduce((max, job) => Math.max(max, Number(job?.seq) || 0), 0) + 1
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
    // 只有判定为巡视日才读 S：`patrolHoursOfDay` 有 minHours 兜底，冻结时会返回旧日期的值
    const patrolHours = patrolled ? patrolHoursOfDay(this.dayLoop) : 0
    const result = advanceEstateDayPure(e, {
      midnight: m,
      patrolHours,
      stones: Number(this.currency?.spiritual) || 0,
      offspringCount: this.estateOffspringCount,
      realmTier: this.realmTier
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
    // v2：所有建筑（含药浴池）都由乡侯府等级解锁
    if (!isBuildingUnlocked(e, id)) {
      return { ok: false, message: `${building.name}尚未开放（${building.unlockText || '条件未满足'}）` }
    }
    if (Number(e.buildings[id]) > 0) return { ok: false, message: `${building.name}已经建成` }
    if (e.builds[id]) return { ok: false, message: `${building.name}正在建造中` }

    // ⚠ 报价在下单时**快照**进 job（含成本与工期）：之后突破换段也不会改在建项目
    const quote = upgradeQuote(id, 1, { firstBuild: true, realmTier: this.realmTier })
    if (!quote) return { ok: false, message: '无法建造' }
    const job = {
      targetLevel: 1,
      progress: 0,
      paid: 0,
      costStones: quote.costStones,
      days: quote.days,
      labor: quote.labor,
      firstBuild: true,
      /** 开工流水号：徭役逐项分配按它排队（先开工的先拿） */
      seq: nextBuildSeqOf(e)
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

    const quote = upgradeQuote(id, level + 1, { realmTier: this.realmTier })
    if (!quote) return { ok: false, message: '无法升级' }
    const job = {
      targetLevel: level + 1,
      progress: 0,
      paid: 0,
      costStones: quote.costStones,
      days: quote.days,
      labor: quote.labor,
      firstBuild: false,
      /** 开工流水号：徭役逐项分配按它排队（先开工的先拿） */
      seq: nextBuildSeqOf(e)
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
