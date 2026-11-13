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
  AUTO_ART_LINES,
  BUILDINGS,
  ESTATE_TUNING,
  GAME_SECONDS_PER_DAY,
  STORAGE_KEYS,
  WITHDRAW_UNITS_PER_CLICK,
  advanceEstateDay as advanceEstateDayPure,
  autoArtViewOf,
  buildingById,
  buildableBuildings,
  chainViewOf,
  cloneEstate,
  createEstateState,
  isBuildingUnlocked,
  laborPlanOf,
  laborSatisfactionOf,
  laborTotalOf,
  nextQuoteOf,
  normalizeEstate,
  patrolSettledInWindow,
  planStorageWithdraw,
  productionOf,
  productTierOf,
  taxMonthlyStone1Of,
  totalPopulationOf,
  tutorialStepOf,
  upgradeQuote,
  villagerCapOf,
  withdrawableStorageKeys
} from '../../plugins/estate.js'
import {
  buildAutoRecipeOutput,
  recipeById,
  // P62 阶段 D1：离线材料账本（在线不激活，行为不变）
  takeOfflineMaterialUnits
} from '../../plugins/arts.js'
import { createItemInstance } from '../../plugins/items.js'
import { BATH_ELEMENTS } from '../../plugins/bath.js'
import { takeUnits } from '../../plugins/stacks.js'
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
    // 乡间自动百艺（B11-b）：四艺当前排班配方 → 本段阶实物；丹炉/工坊看封地仓，符坊/阵堂看背包
    const autoRecipes = {}
    for (const line of AUTO_ART_LINES) autoRecipes[line.art] = this.activeRecipeOf(line.art)
    const autoArts = autoArtViewOf(e, {
      bagItems: this.items || [],
      recipes: autoRecipes,
      patrolHours
    })
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
      /** 取回入口（2026-11-11 路线 4）：只有灵植有背包形态，粮/矿石留在封地内消耗 */
      storageWithdraw: {
        keys: withdrawableStorageKeys(),
        unitsPerClick: WITHDRAW_UNITS_PER_CLICK,
        tier: productTierOf(this.realmTier)
      },
      /** 经营链（b 段）：B11-b 起只剩酒坊一条（丹炉/工坊转乡间百艺） */
      chain,
      /** 乡间自动百艺（B11-b）：四栋建筑的配方 / 产能 / 产出 / 状态 */
      autoArts,
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
      // 科技树字段已删（B14-d，2026-11-05）：未解锁建筑改由全景图灰地块展示，
      // `techTreeBuildings` 仍留在 plugins/estate.js 供 verify-estate 用。
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

/**
 * 乡间百艺的背包侧：**先按计划扣料，再入成品**（顺序与纯函数里的账本一致）。
 * `items` / `gainItem` 来自背包 store；mock store 缺少其中任何一个就跳过
 * （纯函数的 `bagPlan` 仍可单独断言）。单日入口与离线块入口共用这一处。
 */
const applyAutoArtBagOf = (store, result) => {
  const bagPlan = result.autoArt?.bagPlan || []
  // P62 阶段 D1：离线块内先问账本；账本已扣就只累计，块末一次写回背包
  if (bagPlan.length && Array.isArray(store.items) && !takeOfflineMaterialUnits(bagPlan)) {
    store.items = takeUnits(store.items, bagPlan)
  }
  if (typeof store.gainItem !== 'function') return
  for (const produced of result.autoArt?.produced || []) {
    const recipe = recipeById(produced.recipeId)
    const item = buildAutoRecipeOutput(recipe)
    if (!item) continue
    // `gainItem` 按 `unitsOf(item)` 入栈 —— 把当天产出的件数写进 `count`
    item.count = Math.max(1, Number(produced.units) || 1)
    store.gainItem(item, { save: false })
  }
}

export const actions = {
  ensureEstate() {
    this.estate = normalizeEstate(this.estate)
    return this.estate
  },

  /**
   * **封地每日结算**（00:00 边界）。在线由 clock.js 的 day 钩子调；
   * 离线块化走下面的 `advanceEstateBlock`（开关关掉时 / 老路径仍调这里）。
   *
   * @param midnight 本次结算的 00:00 绝对游戏秒
   * @param {{silent?:boolean, ensure?:boolean}} opts 离线静默（只影响返回，日志照样进、有上限）
   */
  advanceEstateDay(midnight, { silent = false, ensure = true } = {}) {
    // `ensure:false` 只给离线块内逐日循环用：块首已经 normalize 过一次，
    // 后面几十天再跑一遍 `normalizeEstate` 纯属浪费（R34 实测占封地结算 1/3）。
    const e = ensure ? this.ensureEstate() : this.estate
    /** B14-c #7：传功阁落成判定（0 → ≥1 的那一天给子嗣发功法） */
    const libraryBefore = Number(e.buildings?.library) || 0
    const m = Number(midnight) || 0
    const patrolled = patrolSettledInWindow(this.dayLoop, m - GAME_SECONDS_PER_DAY, m)
    // 只有判定为巡视日才读 S：`patrolHoursOfDay` 有 minHours 兜底，冻结时会返回旧日期的值
    const patrolHours = patrolled ? patrolHoursOfDay(this.dayLoop) : 0
    // 乡间自动百艺（B11-b）：四艺当前排班配方随结算一起传进去（纯函数只读）。
    // `activeRecipeOf` 在百艺 store 里；mock store（断言用）可以没有它 ⇒ 按「无配方」处理。
    const autoRecipes = {}
    if (typeof this.activeRecipeOf === 'function') {
      for (const line of AUTO_ART_LINES) autoRecipes[line.art] = this.activeRecipeOf(line.art)
    }
    const result = advanceEstateDayPure(e, {
      midnight: m,
      patrolHours,
      stones: Number(this.currency?.spiritual) || 0,
      offspringCount: this.estateOffspringCount,
      realmTier: this.realmTier,
      bagItems: this.items || [],
      autoRecipes
    })
    if (!result.settled) return result

    this.estate = result.state

    // 乡间百艺的背包侧：**先按计划扣料，再入成品**（顺序与纯函数里的账本一致）。
    applyAutoArtBagOf(this, result)

    // B14-c #7：传功阁首次落成 → 给全体在世、有灵根、还没学过的子嗣抽一次功法。
    // 离线重放走同一条路（每天结算一次，落成那天触发）。
    if (libraryBefore < 1 && Number(result.state.buildings?.library) >= 1) {
      this.grantLibraryArtsOnBuild()
    }

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

  /**
   * **封地离地块结算**（P62 步骤 1，2026-11-12）：一次算 `days` 个游戏天。
   *
   * 只给离线块化路径调用（`OFFLINE_TUNING.estateBlock` 打开时）；在线仍是单日入口。
   * **算的过程变快，算的结果不变**：
   *   · 复印：块首 `normalize` + `cloneEstate` 各一次，块内几十天在这份**纯对象**上直接改
   *     （纯函数传 `clone:false`），最后一次性写回 `this.estate`；
   *   · 背包 / 钱袋 / 落盘同样块首块末各一次。钱袋用本地 `stones` 累加 —— 语义与逐日
   *     完全一致（当天收入当天算、第二天才花得出去）：每天开工前读到的余额都含前一天收入。
   *   · 纯函数仍**逐日**推进 —— 仓满刹车、月税、徭役逐项分配、完工日一律不变。
   *
   * ⚠ 有意保留的逐日开销（后续步骤再改，别在这里顺手动，会改产出）：
   *   · 巡视时长 / 排班配方仍逐日读当前 `dayLoop` 快照（现状如此）。
   *   · 背包材料：阶段 D1 起由**离线材料账本**接管（`plugins/arts.js` 的
   *     `craftableCountOf` / `planMaterialsOf` 自动走账本索引），块内不再逐日全扫背包。
   *
   * @param {{from?:number, days?:number, offspringCount?:number}} opts `from` = 块起点（秒），
   *   块内第一个 00:00 起算；`offspringCount` 由离线活跃索引给（P62 阶段 C），
   *   不给就退回全族 filter（老路径 / 断言 / mock）
   * @returns {{days:number, settled:number}} `settled` = 真正结算了几天（幂等跳过的不算）
   */
  advanceEstateBlock({ from = 0, days = 0, offspringCount = null } = {}) {
    const span = Math.max(Math.floor(Number(days) || 0), 0)
    if (span <= 0) return { days: 0, settled: 0 }
    // 人口块首算一次（P62 阶段 C，C5）：块内不会再有人口变化 —— 内宅已经按整块结算过，
    //   封地块看到的存活数整块不变，与逐日读 getter 的值完全相同。
    const fixedOffspringCount =
      offspringCount == null
        ? this.estateOffspringCount
        : Math.max(Math.floor(Number(offspringCount) || 0), 0)
    // 块首：normalize（老档兜底）+ 纯对象复印，各一次
    const e = cloneEstate(this.ensureEstate())
    const current = normalizeCurrency(this.currency)
    let stones = Number(current.spiritual) || 0
    let secular = Number(current.secular) || 0
    let settled = 0
    let midnight = (Math.floor((Number(from) || 0) / GAME_SECONDS_PER_DAY) + 1) * GAME_SECONDS_PER_DAY
    for (let i = 0; i < span; i += 1) {
      /** B14-c #7：传功阁落成判定（0 → ≥1 的那一天给子嗣发功法，幂等靠 `libraryArtSettled`） */
      const libraryBefore = Number(e.buildings?.library) || 0
      // 只有判定为巡视日才读 S：`patrolHoursOfDay` 有 minHours 兜底，冻结时会返回旧日期的值
      const patrolled = patrolSettledInWindow(this.dayLoop, midnight - GAME_SECONDS_PER_DAY, midnight)
      const patrolHours = patrolled ? patrolHoursOfDay(this.dayLoop) : 0
      const autoRecipes = {}
      if (typeof this.activeRecipeOf === 'function') {
        for (const line of AUTO_ART_LINES) autoRecipes[line.art] = this.activeRecipeOf(line.art)
      }
      const result = advanceEstateDayPure(e, {
        midnight,
        patrolHours,
        stones,
        offspringCount: fixedOffspringCount,
        realmTier: this.realmTier,
        bagItems: this.items || [],
        autoRecipes,
        // 块内直接改块首复印的那份（入参归本 action 所有）
        clone: false
      })
      midnight += GAME_SECONDS_PER_DAY
      if (!result.settled) continue
      settled += 1
      // 乡间百艺的背包侧：先扣料、再入成品（与单日入口同一处实现）
      applyAutoArtBagOf(this, result)
      if (libraryBefore < 1 && Number(e.buildings?.library) >= 1) this.grantLibraryArtsOnBuild()
      // 钱袋只记账不落盘：与逐日路径的 `Math.max(round(...), 0)` 同一口径
      stones = Math.max(
        Math.round(stones + (Number(result.gains.spiritual) || 0) - (Number(result.spent) || 0)),
        0
      )
      secular = Math.max(Math.round(secular + (Number(result.gains.secular) || 0)), 0)
    }
    // 块末：封地 / 钱袋 / 落盘各写一次（块内 180 天的响应式写入与存盘全免）
    this.estate = e
    this.currency = normalizeCurrency({ ...current, spiritual: stones, secular })
    this.saveData()
    return { days: span, settled }
  },

  /**
   * **封地仓 → 背包取回**（2026-11-11 · P36 链头 · 路线 4）。
   *
   * 把 `estate.storage.herb` 的计数铸成具体灵植实例进背包，药浴池（只读背包）就能吃到
   * 药圃的产出；丹炉照旧吃仓，`fillBathPool` 口径不动。
   *
   * 标准件规则：**本段阶 · 中成色 · 五系按缺口**（缺口 = 药力升序，并列保持五系固定序）。
   * 免费、瞬时、不占徭役；不进日结与离线结算。
   *
   * @returns {{ok:boolean, reason?:string, count?:number, tier?:number,
   *            quality?:string, elements?:string[]}}
   */
  withdrawEstateStorage(key = 'herb', units = WITHDRAW_UNITS_PER_CLICK) {
    const e = this.ensureEstate()
    // 缺口顺序：药力低的系先补（mock store 没有 bath 时回退五系固定序）
    const medicine = this.bathMedicine || {}
    const preferElements = BATH_ELEMENTS.slice().sort(
      (a, b) => (Number(medicine[a]) || 0) - (Number(medicine[b]) || 0)
    )
    const plan = planStorageWithdraw(e, key, units, {
      tier: productTierOf(this.realmTier),
      preferElements
    })
    if (!plan.ok) return plan

    this.estate = {
      ...e,
      storage: { ...e.storage, [key]: Math.max(Math.floor(Number(e.storage[key]) || 0) - plan.units, 0) }
    }

    // 逐件铸（`gainItem` 按 baseId + 成色合并成堆，10 件不会变 10 条）
    if (typeof this.gainItem === 'function') {
      for (const base of plan.bases) {
        const item = createItemInstance(base, { quality: plan.quality })
        if (item) this.gainItem(item, { save: false })
      }
    }

    this.pushEstateLog(
      `从封地仓取回 ${plan.units} 件灵植（${plan.tier} 阶 · ${plan.quality}成色）`,
      'withdraw'
    )
    this.saveData()
    return {
      ok: true,
      count: plan.units,
      tier: plan.tier,
      quality: plan.quality,
      elements: plan.elements
    }
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
