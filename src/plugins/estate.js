// 【封地经营】模块四 v2 · a 段地基 —— 纯函数层（无副作用，可被 node 直接加载跑断言）
//
// 真源：《模块四-封地经营》v2 §2/§三/§四之二/§十/§十六.1 · 《数值真值表》§6.8 ·
//       《下一步》B14-a（2026-11-03）。
//
// 这一层只算数：建筑表、人口/徭役、报价、中间产物仓、单日推进。
// 入账 / 落盘 / 日志写在哪由 `stores/modules/estate.js` 决定。
//
// ⚠ 四条硬口径（改之前先读）：
//   1. **民心系统整条删除**（2026-11-02）：税收 / 产出 / 徭役效率都不再乘系数。
//   2. **21 栋建筑**，解锁由乡侯府等级卡（§十六.1）。产出型只产**中间产物**进独立仓，
//      不再直产灵石；仓上限 500/种，满仓停产、不溢出。
//   3. **总人口 = 村民 + 活着的子嗣**（子嗣数由调用方传入）；**徭役 = 总人口 × 25%**。
//   4. **钱是一阶灵石整数**（`currency.spiritual`）。设计表的成本单位是**二阶**，
//      这里统一 `× 100` 转成一阶再结算；**税收也进一阶**（v2 起不再进大子）。

import { GAME_SECONDS_PER_DAY as DAY } from './innerCourt.js'
// 成品基础价与回收口共用一张表（6/24/96/384/1536 一阶）—— 不要另抄一份
import { ITEM_BASE_PRICE } from './shop.js'

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback)
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)

/** 一游戏天的秒数（与日常循环 / 内宅同源） */
export const GAME_SECONDS_PER_DAY = DAY

// ---------- 建筑表（数据驱动，21 种；解锁看乡侯府等级） ----------

/**
 * 字段说明：
 *   id          稳定标识（存档里的键，**不要改**）
 *   name        显示名
 *   maxLevel    等级上限
 *   tier        档位：small / medium / large（只影响价格，§十六.1）
 *   unlock      解锁条件 `{ manorLevel }`
 *   mvp         是否开局可建（Lv1 四栋；仅用于教程/排序，不参与解锁判定）
 *   initial     是否开局即有（只有乡侯府）
 *   effectText  效果文案（效果是否生效看本批实现范围）
 *   produces    产出 `{ key, perLevel }`；`key` = 封地独立仓的中间产物键
 *   unlockText  未开放时的解锁说明（科技树灰显用）
 */
export const BUILDINGS = [
  {
    id: 'manor',
    name: '乡侯府',
    maxLevel: 5,
    tier: 'large',
    unlock: { manorLevel: 1 },
    mvp: true,
    initial: true,
    effectText: '村民人口上限 + / 新建筑解锁 / 旧建筑等级上限',
    produces: null,
    unlockText: ''
  },
  {
    id: 'relay',
    name: '长岭驿',
    maxLevel: 5,
    tier: 'large',
    unlock: { manorLevel: 5 },
    mvp: false,
    initial: false,
    effectText: '情报进度满格 → 刷新额外飞鹰门任务（b/c 段接）',
    produces: null,
    unlockText: '乡侯府 Lv.5 解锁'
  },
  {
    id: 'woodcutter',
    name: '快子峰木屋',
    maxLevel: 3,
    tier: 'medium',
    unlock: { manorLevel: 3 },
    mvp: false,
    initial: false,
    effectText: '同时修炼人数 +10/级（基础 50，c 段接）',
    produces: null,
    unlockText: '乡侯府 Lv.3 解锁'
  },
  {
    id: 'beacon',
    name: '烽火台',
    maxLevel: 3,
    tier: 'medium',
    unlock: { manorLevel: 4 },
    mvp: false,
    initial: false,
    effectText: '防御任务接取概率 +（b/c 段接）',
    produces: null,
    unlockText: '乡侯府 Lv.4 解锁'
  },
  {
    id: 'rookery',
    name: '迅风鸦巢舍',
    maxLevel: 3,
    tier: 'small',
    unlock: { manorLevel: 1 },
    mvp: true,
    initial: false,
    effectText: '情报积累速度 +20%/级（情报条未接）',
    produces: null,
    unlockText: ''
  },
  {
    id: 'farm',
    name: '灵田',
    maxLevel: 5,
    tier: 'small',
    unlock: { manorLevel: 1 },
    mvp: true,
    initial: false,
    effectText: '产粮 4/天/级（b 段供酒坊）',
    produces: { key: 'grain', perLevel: 4 },
    unlockText: ''
  },
  {
    id: 'herbGarden',
    name: '药圃',
    maxLevel: 5,
    tier: 'small',
    unlock: { manorLevel: 2 },
    mvp: false,
    initial: false,
    effectText: '产灵植 3/天/级（b 段供丹炉）',
    produces: { key: 'herb', perLevel: 3 },
    unlockText: '乡侯府 Lv.2 解锁'
  },
  {
    id: 'charcoal',
    name: '炭场',
    maxLevel: 3,
    tier: 'small',
    unlock: { manorLevel: 3 },
    mvp: false,
    initial: false,
    effectText: '木炭提升炼丹 / 炼器速度（不产中间产物，等 B11）',
    produces: null,
    unlockText: '乡侯府 Lv.3 解锁'
  },
  {
    id: 'mine',
    name: '矿场',
    maxLevel: 3,
    tier: 'small',
    unlock: { manorLevel: 2 },
    mvp: false,
    initial: false,
    effectText: '产矿石 4/天/级（b 段供工坊）',
    produces: { key: 'ore', perLevel: 4 },
    unlockText: '乡侯府 Lv.2 解锁'
  },
  {
    id: 'workshop',
    name: '工坊',
    maxLevel: 3,
    tier: 'medium',
    unlock: { manorLevel: 3 },
    mvp: false,
    initial: false,
    effectText: '耗矿石产法器：4 矿石 → 1 法器/天/级（§12.1）',
    produces: null,
    unlockText: '乡侯府 Lv.3 解锁'
  },
  {
    id: 'pavilion',
    name: '亭卫',
    maxLevel: 3,
    tier: 'small',
    unlock: { manorLevel: 1 },
    mvp: true,
    initial: false,
    effectText: '降低驻扎类任务门槛（未接）',
    produces: null,
    unlockText: ''
  },
  {
    id: 'wall',
    name: '长墙',
    maxLevel: 3,
    tier: 'small',
    unlock: { manorLevel: 4 },
    mvp: false,
    initial: false,
    effectText: '降低杀怪类任务推荐战力（未接）',
    produces: null,
    unlockText: '乡侯府 Lv.4 解锁'
  },
  {
    id: 'residence',
    name: '家族宅邸',
    maxLevel: 5,
    tier: 'medium',
    unlock: { manorLevel: 2 },
    mvp: false,
    initial: false,
    effectText: '内宅上限 +N（c 段接）',
    produces: null,
    unlockText: '乡侯府 Lv.2 解锁'
  },
  {
    id: 'library',
    name: '传功阁',
    maxLevel: 3,
    tier: 'medium',
    unlock: { manorLevel: 3 },
    mvp: false,
    initial: false,
    effectText: '子嗣修炼速度 +（c 段接）',
    produces: null,
    unlockText: '乡侯府 Lv.3 解锁'
  },
  {
    id: 'shrine',
    name: '英烈祠',
    maxLevel: 3,
    tier: 'medium',
    unlock: { manorLevel: 4 },
    mvp: false,
    initial: false,
    effectText: '子嗣修炼速度加成（c 段接）',
    produces: null,
    unlockText: '乡侯府 Lv.4 解锁'
  },
  {
    id: 'bathhouse',
    name: '药浴池',
    maxLevel: 5,
    tier: 'large',
    // 2026-10-28 B4b：「未开放」变成「乡侯府 Lv.2 解锁」—— 不在 MVP 四建筑里，
    // 但满足解锁条件后会从科技树挪进建造列表（`buildableBuildings`）。
    unlock: { manorLevel: 2 },
    mvp: false,
    initial: false,
    effectText: '灵材全天候转五系药力：1 件/小时；存量 100/300/1,000/3,000/10,000；药力上限 ×1/1.5/2/3/4',
    produces: null,
    unlockText: '乡侯府 Lv.2 解锁'
  },
  {
    id: 'winery',
    name: '酒坊',
    maxLevel: 3,
    tier: 'medium',
    unlock: { manorLevel: 2 },
    mvp: false,
    initial: false,
    effectText: '耗粮产灵酒：4 粮 → 2 灵酒/天/级（§12.1）',
    produces: null,
    unlockText: '乡侯府 Lv.2 解锁'
  },
  {
    id: 'market',
    name: '市集',
    maxLevel: 3,
    tier: 'medium',
    // 2026-11-03 B14-b：从 Lv3 提前到 Lv2 —— 与酒坊同批，否则酒坊建好要空摆一级
    unlock: { manorLevel: 2 },
    mvp: false,
    initial: false,
    effectText: '经营链销售闸门：建成才收货；固定价（§12.1）',
    produces: null,
    unlockText: '乡侯府 Lv.2 解锁'
  },
  {
    id: 'archive',
    name: '藏书阁',
    maxLevel: 3,
    tier: 'large',
    unlock: { manorLevel: 5 },
    mvp: false,
    initial: false,
    effectText: '子嗣学功法（c 段，先定乘区 / 匹配表）',
    produces: null,
    unlockText: '乡侯府 Lv.5 解锁'
  },
  {
    id: 'mortuary',
    name: '义庄',
    maxLevel: 3,
    tier: 'medium',
    unlock: { manorLevel: 4 },
    mvp: false,
    initial: false,
    effectText: '降低事件人口损失（b/c 段接）',
    produces: null,
    unlockText: '乡侯府 Lv.4 解锁'
  },
  {
    id: 'furnace',
    name: '丹炉',
    maxLevel: 3,
    tier: 'large',
    unlock: { manorLevel: 4 },
    mvp: false,
    initial: false,
    effectText: '耗灵植产灵丹：3 灵植 → 1 灵丹/天/级（§12.1；成品先抽象）',
    produces: null,
    unlockText: '乡侯府 Lv.4 解锁'
  }
]

// ---------- 经营链 L1（b 段，2026-11-03） ----------

/**
 * 成品表（《模块四》§12.1）。
 *
 * ⚠ **成品是抽象货物**：不占背包、不进回收口、不可装备 —— 结算当天直接折成灵石入账。
 * B11 炼丹 / 炼器上线后再把「灵丹 / 法器」换成真实物品；酒保持即产即卖。
 *
 * `names` 按**境界段**取（练气 / 筑基 / 金丹）：同一物品不随买家涨价，换段就是换物品。
 * `inputPerOutput` = 几份原料换 1 份成品；`outputPerLevel` = 每级每天产几份成品。
 */
export const PRODUCTS = {
  wine: {
    key: 'wine',
    label: '酒',
    input: 'grain',
    inputPerOutput: 2,
    outputPerLevel: 2,
    names: ['灵酒', '玉液', '仙酿']
  },
  pill: {
    key: 'pill',
    label: '丹药',
    input: 'herb',
    inputPerOutput: 3,
    outputPerLevel: 1,
    names: ['灵丹', '玄丹', '仙丹']
  },
  craft: {
    key: 'craft',
    label: '法器',
    input: 'ore',
    inputPerOutput: 4,
    outputPerLevel: 1,
    names: ['法器', '宝器', '仙器']
  }
}

/** 经营链：消耗建筑 → 成品（顺序 = UI 展示顺序） */
export const CHAIN_LINKS = [
  { building: 'winery', product: 'wine' },
  { building: 'furnace', product: 'pill' },
  { building: 'workshop', product: 'craft' }
]

/** 教程三步（乡侯府开局即有，不在教程里） */
export const TUTORIAL_IDS = ['farm', 'rookery', 'pavilion']

export const buildingById = id => BUILDINGS.find(b => b.id === id) || null

/** 建造列表排序：乡侯府 → 教程三步 → 其余（药浴池等）按表内顺序 */
const buildRank = id =>
  id === 'manor' ? -1 : TUTORIAL_IDS.includes(id) ? TUTORIAL_IDS.indexOf(id) : TUTORIAL_IDS.length
const byBuildRank = (a, b) =>
  buildRank(a.id) - buildRank(b.id) || BUILDINGS.indexOf(a) - BUILDINGS.indexOf(b)

/**
 * 建筑解锁了没有。乡侯府 `initial` 恒可用；其余看 `unlock.manorLevel`。
 * 老档没有该建筑数据时按未解锁处理。
 */
export const isBuildingUnlocked = (state, id) => {
  const building = buildingById(id)
  if (!building) return false
  if (building.initial) return true
  const need = num(building.unlock?.manorLevel)
  return need > 0 && num(state?.buildings?.manor) >= need
}

/** 开局可建的 Lv1 建筑，**按教程顺序**：乡侯府（开局即有）→ 灵田 → 鸦巢舍 → 亭卫 */
export const mvpBuildings = () => BUILDINGS.filter(b => b.mvp).sort(byBuildRank)

/** 当前可建造 / 可升级的建筑 = 已解锁的全部建筑，按教程顺序 */
export const buildableBuildings = state =>
  BUILDINGS.filter(b => isBuildingUnlocked(state, b.id)).sort(byBuildRank)

/** 科技树占位 = 还没解锁的建筑 */
export const techTreeBuildings = state =>
  BUILDINGS.filter(b => !isBuildingUnlocked(state, b.id))

// ---------- 数值 ----------

export const ESTATE_TUNING = {
  /** 村民初始人口（§3.1 六村合计） */
  villagers: 5600,
  /** 村民自然增长：2.5% / 游戏年（按天复利） */
  villagerGrowthPerYear: 0.025,
  /** 村民上限，由乡侯府等级卡（§十六.1） */
  villagerCapByManor: { 1: 5600, 2: 7500, 3: 10000, 4: 14000, 5: 20000 },
  /** 徭役 = 总人口 × 25%（初始 5,600 → 1,400，与 v1 对齐） */
  laborRate: 0.25,
  /** 繁荣度：MVP 固定不涨，只乘税收 */
  prosperity: 30,
  /** 定价轴：练气段 1 游戏月可支配收入（二阶） */
  baseIncomeStone2PerMonth: 88,
  /** 档位系数（§10.7 / §十六.1） */
  buildTiers: { small: 0.3, medium: 0.6, large: 1.0 },
  /** 工期（游戏月），索引 = 目标等级；首建 = Lv1→2 的一半 */
  buildMonths: { 2: 4, 3: 6, 4: 10, 5: 24 },
  /** 徭役需求 = 目标等级 × 200 */
  laborPerLevel: 200,
  firstBuildDurationRatio: 0.5,
  daysPerMonth: 30,
  /** 1 二阶 = 100 一阶 */
  stone1PerStone2: 100,
  /** 中间产物仓：每种上限 */
  storageCap: 500,
  tax: {
    /** 一阶 / 人 / 月（§十六.1 标定：Lv2 / 5,600 人 / 繁荣 30 ≈ 17.5 二阶/月） */
    perCapitaStone1PerMonth: 0.12,
    /** 乡侯府 Lv1 征收未开 */
    minManorLevel: 2,
    /** 征收进度 +1/30 每日 —— 进度条按 0~100 存，所以是 100/30 个百分点/天 */
    progressPerDay: 100 / 30
  },
  labor: {
    /** 满足率 < 50% ⇒ 停工（§3.3） */
    stopBelow: 0.5
  },
  /** 经营链 L1（b 段，《模块四》§12.1） */
  market: {
    /**
     * 市集固定价系数 = 物品基础价 × priceCoef × 市集等级系数。
     * 2.0 是开发组初值（A2 §4.3 只定了「基础价 × 固定系数」，系数交开发组）。
     * 改这里 = 改经营链全部收入，先登《产出登记表》。
     */
    priceCoef: 2,
    /** 市集等级系数：Lv1 1.0 / Lv2 1.2 / Lv3 1.4（不做供需波动） */
    levelCoef: { 1: 1, 2: 1.2, 3: 1.4 },
    /** 没建市集 ⇒ 三条链全部停摆（不耗料、不产成品） */
    minLevel: 1
  },
  chain: {
    /** 成品阶：练气 1 / 筑基 2 / 金丹 3（同一物品不随买家段位涨价） */
    tierByRealm: { qi: 1, foundation: 2, core: 3 }
  },
  /** 封地流水上限（离线 180 天也不会刷爆） */
  logLimit: 40
}

/** 中间产物的键（L1 经营链只有粮 / 灵植 / 矿石，§十二；顺序用于 UI） */
export const STORAGE_KEYS = ['grain', 'herb', 'ore']

/** 新档的封地状态 */
export const createEstateState = () => ({
  /** id → 等级（只记已建成） */
  buildings: { manor: 1 },
  /** id → 在建任务（支持并行建造） */
  builds: {},
  prosperity: ESTATE_TUNING.prosperity,
  /** 村民人口（总人口 = 村民 + 子嗣，子嗣由调用方传入） */
  villagers: ESTATE_TUNING.villagers,
  /** 中间产物独立仓（不占背包） */
  storage: { grain: 0, herb: 0, ore: 0 },
  /** 征收进度 0~100 */
  taxProgress: 0,
  /** 本月已征收过（`floor(dayIndex / 30)`）；-1 = 从未 */
  taxCollectedMonth: -1,
  /** 已结算到第几个游戏天（00:00 边界）；-1 = 从未 */
  lastDay: -1,
  /** 封地流水，最新在上 */
  log: []
})

/** 读档归一化：老档没有 estate / 被写成 null 时兜底；v1 → v2 迁移 */
export const normalizeEstate = raw => {
  const base = createEstateState()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base
  const buildings = { ...(raw.buildings && typeof raw.buildings === 'object' ? raw.buildings : base.buildings) }
  // 乡侯府是封地的根：脏档 / 手改档把它删了，人口上限与征收会一起塌，这里兜回 Lv1
  if (!(Number(buildings.manor) >= 1)) buildings.manor = base.buildings.manor
  const builds = raw.builds && typeof raw.builds === 'object' ? raw.builds : {}
  // v1 有 `population` / `laborTotal` / `morale`，v2 只留 villagers + storage；民心整条删除
  const { morale, population, laborTotal, ...rest } = raw
  const villagers = Math.max(num(raw.villagers, num(population, base.villagers)), 0)
  const storage = { ...base.storage }
  if (raw.storage && typeof raw.storage === 'object') {
    for (const key of STORAGE_KEYS) storage[key] = Math.max(num(raw.storage[key]), 0)
  }
  return {
    ...base,
    ...rest,
    buildings,
    builds: { ...builds },
    villagers,
    storage,
    log: Array.isArray(raw.log) ? raw.log.slice(0, ESTATE_TUNING.logLimit) : []
  }
}

// ---------- 人口 / 徭役 / 报价 ----------

/** 村民上限（乡侯府等级卡；超出表按最高档兜底） */
export const villagerCapOf = manorLevel => {
  const levels = ESTATE_TUNING.villagerCapByManor
  const level = clamp(Math.floor(num(manorLevel, 1)), 1, 5)
  return num(levels[level], levels[5])
}

/** 总人口 = 村民 + 活着的子嗣（子嗣数由 store 传入） */
export const totalPopulationOf = (state, offspringCount = 0) =>
  Math.max(num(state?.villagers, ESTATE_TUNING.villagers), 0) + Math.max(num(offspringCount), 0)

/** 可供徭役 = 总人口 × 25% */
export const laborTotalOf = (state, offspringCount = 0) =>
  Math.round(totalPopulationOf(state, offspringCount) * ESTATE_TUNING.laborRate)

/**
 * 升级 / 首建报价（§十六.1）。
 *
 * @param {string} id 建筑 id
 * @param {number} targetLevel 目标等级（首建传 1）
 * @param {{firstBuild?:boolean}} opts 首建：成本 0、工期 × 0.5
 * @returns {{costStone2:number,costStones:number,days:number,labor:number}|null}
 */
export const upgradeQuote = (id, targetLevel, { firstBuild = false } = {}) => {
  const building = buildingById(id)
  if (!building) return null
  const target = Math.floor(num(targetLevel))
  if (target < 1 || target > building.maxLevel) return null
  // 首建借用 Lv1→2 的基准（设计表从 Lv1→2 起）
  const baseLevel = Math.max(target, 2)
  const months = num(ESTATE_TUNING.buildMonths[baseLevel])
  if (!months) return null
  const coef = num(ESTATE_TUNING.buildTiers[building.tier], ESTATE_TUNING.buildTiers.small)
  const costStone2 = firstBuild
    ? 0
    : Math.round(
        ESTATE_TUNING.baseIncomeStone2PerMonth * coef * Math.pow(2, baseLevel - 2)
      )
  const days = Math.max(
    1,
    Math.round(months * ESTATE_TUNING.daysPerMonth * (firstBuild ? ESTATE_TUNING.firstBuildDurationRatio : 1))
  )
  return {
    costStone2,
    costStones: costStone2 * ESTATE_TUNING.stone1PerStone2,
    days,
    labor: Math.floor(target) * ESTATE_TUNING.laborPerLevel
  }
}

/** 某建筑的下一次可升级报价；已满级 / 未建成返回 null */
export const nextQuoteOf = (state, id) => {
  const building = buildingById(id)
  if (!building) return null
  const level = num(state?.buildings?.[id])
  if (level <= 0) return upgradeQuote(id, 1, { firstBuild: true })
  if (level >= building.maxLevel) return null
  return upgradeQuote(id, level + 1)
}

/**
 * 徭役满足率 = min(1, 徭役总数 / 在建总需求)。
 * MVP 不做拖拽、不做每项保底 50%（第二批），所以项目之间**自动均分**。
 *
 * @param {object} state
 * @param {number|null} laborTotal 显式徭役总数（含子嗣时由调用方算）；null = 用 state.laborTotal
 */
export const laborSatisfactionOf = (state, laborTotal = null) => {
  const builds = Object.values(state?.builds || {})
  const demand = builds.reduce((sum, job) => sum + Math.max(num(job?.labor), 0), 0)
  if (demand <= 0) return 1
  const total =
    laborTotal == null ? laborTotalOf(state, 0) : Math.max(num(laborTotal), 0)
  return clamp(total / demand, 0, 1)
}

/** 在建项目的徭役分配（均分后的实际人数，UI 展示用） */
export const laborAssignedOf = (state, id, laborTotal = null) => {
  const builds = Object.values(state?.builds || {})
  const demand = builds.reduce((sum, job) => sum + Math.max(num(job?.labor), 0), 0)
  const job = state?.builds?.[id]
  if (!job || demand <= 0) return 0
  const total =
    laborTotal == null ? laborTotalOf(state, 0) : Math.max(num(laborTotal), 0)
  return Math.min(num(job.labor), (total * num(job.labor)) / demand)
}

/** 月税收（一阶）；乡侯府 Lv1 未开征收 ⇒ 0 */
export const taxMonthlyStone1Of = (state, offspringCount = 0) => {
  const manorLevel = num(state?.buildings?.manor)
  if (manorLevel < ESTATE_TUNING.tax.minManorLevel) return 0
  return (
    totalPopulationOf(state, offspringCount) *
    ESTATE_TUNING.tax.perCapitaStone1PerMonth *
    Math.pow(2, manorLevel - 1) *
    (1 + num(state?.prosperity, ESTATE_TUNING.prosperity) / 100)
  )
}

/**
 * 巡视加速系数 = `(24 + S) / 24`（《模块四》§10.2 / §10.5，2026-10-27 起）。
 *
 * 设计口径：**只有巡视时段本身加速**（当天 06:00 → 06:00+S），日结按这个系数折算；
 * 旧的「当天巡视过就整日 ×2」已作废（R04 已登记，是**收益减少**）。
 * 探索 / 秘境时 dayLoop 冻结 ⇒ 调用方传 0 ⇒ 系数 = 1（预期行为）。
 *
 * S 上限按 `dayLoop.TUNING.patrol.maxHours = 5`，这里只兜脏档，不改玩法数值。
 */
export const patrolFactorOf = (patrolHours = 0) => (24 + clamp(num(patrolHours), 0, 5)) / 24

/** 建筑日产出（取整后的实物数量）；非产出型返回 0。v2 不再乘民心。 */
export const productionOf = (state, id, { patrolHours = 0 } = {}) => {
  const building = buildingById(id)
  if (!building?.produces) return 0
  const level = num(state?.buildings?.[id])
  if (level <= 0) return 0
  const base = building.produces.perLevel * level * patrolFactorOf(patrolHours)
  return Math.max(Math.round(base), 0)
}

// ---------- 经营链 L1（b 段） ----------

/** 当前大境界 → 成品阶（练气 1 / 筑基 2 / 金丹 3） */
export const productTierOf = realmTier =>
  num(ESTATE_TUNING.chain.tierByRealm[realmTier], 1)

/** 成品在当前段的显示名（一阶灵酒 / 二阶玉液 / 三阶仙酿…） */
export const productNameOf = (productKey, tier) => {
  const product = PRODUCTS[productKey]
  if (!product) return ''
  const index = clamp(Math.floor(num(tier, 1)), 1, product.names.length) - 1
  return product.names[index]
}

/** 市集等级系数；没建市集传 0 时按 Lv1 兜底（调用方应先判闸门） */
export const marketLevelCoefOf = level => {
  const lv = clamp(Math.floor(num(level)), 1, 3)
  return num(ESTATE_TUNING.market.levelCoef[lv], ESTATE_TUNING.market.levelCoef[1])
}

/** 市集单价（一阶/件）= 基础价(阶) × 固定系数 × 市集等级系数 */
export const productUnitPriceOf = (productKey, tier, marketLevel = 1) => {
  if (!PRODUCTS[productKey]) return 0
  const base = num(ITEM_BASE_PRICE[clamp(Math.floor(num(tier, 1)), 1, 5)], 0)
  return base * ESTATE_TUNING.market.priceCoef * marketLevelCoefOf(marketLevel)
}

/**
 * 某条链按「只算等级」的日产能（成品件数，未扣库存）。
 * 用于 UI 展示「产/天」，也用于日结的产出上限。
 */
export const chainCapacityOf = (state, buildingId, { patrolHours = 0 } = {}) => {
  const link = CHAIN_LINKS.find(row => row.building === buildingId)
  if (!link) return 0
  const level = num(state?.buildings?.[buildingId])
  if (level <= 0) return 0
  const product = PRODUCTS[link.product]
  return Math.max(Math.round(product.outputPerLevel * level * patrolFactorOf(patrolHours)), 0)
}

/**
 * 生产链视图（UI / 断言共用）：每条链的库存、产能、实际可产、单价与日入账。
 *
 * `reason`：`ok` 运转 · `unbuilt` 未建造 · `no-market` 市集未建 · `starved` 原料不足。
 * **市集未建时 `made = 0`** —— 不耗料、不产成品。
 */
export const chainViewOf = (state, { realmTier = 'qi', patrolHours = 0 } = {}) => {
  const marketLevel = num(state?.buildings?.market)
  const tier = productTierOf(realmTier)
  return CHAIN_LINKS.map(link => {
    const product = PRODUCTS[link.product]
    const level = num(state?.buildings?.[link.building])
    const stock = Math.max(num(state?.storage?.[product.input]), 0)
    const capacity = chainCapacityOf(state, link.building, { patrolHours })
    const affordable = Math.floor(stock / product.inputPerOutput)
    const canMake = level > 0 ? Math.min(capacity, affordable) : 0
    const made = marketLevel >= ESTATE_TUNING.market.minLevel ? canMake : 0
    const unitPrice = productUnitPriceOf(link.product, tier, Math.max(marketLevel, 1))
    let reason = 'ok'
    if (level <= 0) reason = 'unbuilt'
    else if (marketLevel < ESTATE_TUNING.market.minLevel) reason = 'no-market'
    else if (made <= 0) reason = 'starved'
    return {
      building: link.building,
      product: link.product,
      label: product.label,
      productName: productNameOf(link.product, tier),
      tier,
      level,
      input: product.input,
      inputPerOutput: product.inputPerOutput,
      stock,
      capacity,
      /** 满产时的原料日耗 */
      intake: capacity * product.inputPerOutput,
      consumed: made * product.inputPerOutput,
      made,
      unitPrice,
      income: Math.round(made * unitPrice),
      /** 满产时的日入账（不看当前库存，UI 展示「产/天」） */
      fullIncome: Math.round(capacity * unitPrice),
      marketLevel,
      reason
    }
  })
}

// ---------- 巡视判定 ----------

/**
 * 某个日历日窗口 `(from, to]` 里巡视是否结束过。
 *
 * `patrolEndSeconds` 是**该工作日 06:00 + 巡视小时数**的绝对游戏秒（dayLoop 的快照）。
 * 探索 / 秘境时 dayLoop 冻结，`patrolEndSeconds` 停在旧日期 ⇒ 天然落在窗口外 ⇒ 不加速。
 */
export const patrolSettledInWindow = (dayState, fromSeconds, toSeconds) => {
  const end = Number(dayState?.patrolEndSeconds)
  if (!Number.isFinite(end) || end <= 0) return false
  return end > num(fromSeconds) && end <= num(toSeconds)
}

/**
 * 产出条展示用：本日历日已累计产出的「一天几成」。
 *
 * 2026-10-27 改（P53 #2）：巡视不再整天 ×2，而是**只把 06:00 → 06:00+S 这一段
 * 按 2 倍计入**。所以这一天走满 `(24+S)/24` 趟，条子会在 00:00 前超 100%
 * 并回绕 —— 这是「今天的产出已经超过一天的量」，不是条子坏了。
 *
 * 巡视窗口必须**落在今天**（`start >= 今天 00:00`）才算，否则视为没巡视：
 * 探索 / 秘境时 dayLoop 冻结，`patrolStart/EndSeconds` 还停在旧日期（预期行为）。
 *
 * @param {{patrolStartSeconds?:number, patrolEndSeconds?:number}} window
 *   取自 `dayLoop.dayStartSeconds` / `dayLoop.patrolEndSeconds`（绝对游戏秒）
 */
export const productionBarOf = (nowSeconds, { patrolStartSeconds = 0, patrolEndSeconds = 0 } = {}) => {
  const now = num(nowSeconds)
  const dayBase = Math.floor(now / DAY) * DAY
  const start = num(patrolStartSeconds)
  const end = num(patrolEndSeconds)
  // 巡视时段已过去的那一段 → 额外多算的秒数（起点不在今天 ⇒ 0）
  const extra = start >= dayBase && end > start ? Math.max(Math.min(now, end) - start, 0) : 0
  return (((now - dayBase + extra) / DAY) * 100) % 100
}

/** 教程当前步：0=建灵田 · 1=建鸦巢舍 · 2=建亭卫 · 3=完成 */
export const tutorialStepOf = state => {
  for (let i = 0; i < TUTORIAL_IDS.length; i += 1) {
    if (!state?.buildings?.[TUTORIAL_IDS[i]]) return i
  }
  return TUTORIAL_IDS.length
}

// ---------- 单日推进 ----------

/**
 * 浅拷 + 两层深拷。
 * ⚠ `builds` 里的任务对象必须**逐条复制** —— 只 `{...builds}` 会让新旧状态共用
 *   同一个 job 引用，推进旧状态时把输入状态也改了（断言里表现为「同一天重复结算还在涨」）。
 */
const cloneEstate = state => {
  const builds = {}
  for (const [id, job] of Object.entries(state?.builds || {})) builds[id] = { ...job }
  return {
    ...state,
    buildings: { ...(state?.buildings || {}) },
    builds,
    storage: { ...(state?.storage || {}) },
    log: Array.isArray(state?.log)
      ? state.log.map(row => (row && typeof row === 'object' ? { ...row } : { day: 0, text: String(row) }))
      : []
  }
}

const pushLog = (state, dayIndex, text, kind = 'info') => {
  // 同一句连续刷（停工状态持续几十天）只留第一条 —— 否则 40 条上限会把完工 / 征收挤掉
  if (state.log[0]?.text === text) return
  state.log.unshift({ day: dayIndex, kind, text })
  if (state.log.length > ESTATE_TUNING.logLimit) state.log.length = ESTATE_TUNING.logLimit
}

/** 完工：只写回等级并删任务（正常路径与「进度已 100 的脏档」共用） */
const finishBuilding = (state, id, job, building, settledDay, out) => {
  const level = num(job.targetLevel)
  state.buildings[id] = Math.max(num(state.buildings[id]), level)
  delete state.builds[id]
  const text = job.firstBuild
    ? `${building.name} 建成（Lv.${level}）`
    : `${building.name} 升至 Lv.${level}`
  pushLog(state, settledDay, text, 'built')
  out.events.push({ kind: 'built', text })
}

/**
 * **封地单日结算**（00:00 边界调用一次）。
 *
 * 顺序固定：幂等 → 徭役快照 → 产出（进仓）→ **经营链（耗料产成品并即卖）** → 建设 →
 * 征收 → 人口增长 → 落 lastDay。
 * 两条顺序理由：
 *   ① 产出与税收要用**日初等级 / 日初人口快照** —— 今天完工的升级**明天**才产，
 *      否则「灵田今天建成今天收」「乡侯府今天升 Lv3 今天按 Lv3 收税」会多算一天；
 *   ② 结算归属的是「刚结束的那个日历日」（`settledDay = midnight/DAY − 1`），
 *      不是 `midnight/DAY` —— 否则首次结算会写成「第 2 日」，征收的月口径也整体偏一天。
 *
 * @param {object} state 封地状态（不改原对象）
 * @param {{midnight?:number, patrolHours?:number, stones?:number, offspringCount?:number,
 *          realmTier?:string}} ctx
 *   `patrolHours` = 那一天**实际巡视的小时数**（0 = 没巡视）；三处加速共用 `(24+S)/24`
 *   `stones` = 当前一阶灵石余额，只用来判断「今天付不付得起」
 *   `offspringCount` = 活着的子嗣数（总人口 / 徭役 / 税收的分母）
 *   `realmTier` = 当前大境界（`qi` / `foundation` / `core`），决定成品阶与市集单价
 * @returns {{state:object, gains:{spiritual:number,secular:number,taxStone1:number,
 *            chainStone1:number}, productGains:object, storageGains:object, spent:number,
 *            events:Array, settled:boolean}}
 */
export const advanceEstateDay = (
  state,
  {
    midnight = 0,
    patrolHours = 0,
    stones = 0,
    offspringCount = 0,
    realmTier = 'qi'
  } = {}
) => {
  const s = cloneEstate(state)
  const settledDay = Math.floor(num(midnight) / DAY) - 1
  const out = {
    state: s,
    gains: { spiritual: 0, secular: 0, taxStone1: 0, chainStone1: 0 },
    productGains: { wine: 0, pill: 0, craft: 0 },
    storageGains: { grain: 0, herb: 0, ore: 0 },
    spent: 0,
    events: [],
    settled: false
  }

  // ① 幂等：同一天只结一次。gap > 1（异常：老档 / 时钟回拨）只结一天，别补跑。
  if (!(settledDay > num(s.lastDay, -1))) return out

  // ② 日初快照：乡侯府等级 / 人口 / 徭役都按日初算
  const manorLevel = num(s.buildings.manor)
  const levelSnapshot = { ...s.buildings }
  const levelState = { ...s, buildings: levelSnapshot }
  const populationSnapshot = totalPopulationOf(s, offspringCount)
  const laborTotal = Math.round(populationSnapshot * ESTATE_TUNING.laborRate)
  const patrolFactor = patrolFactorOf(patrolHours)

  // ③ 徭役快照（今天完工的项目，徭役明天才释放）
  const satisfaction = laborSatisfactionOf(s, laborTotal)
  const laborStop = satisfaction < ESTATE_TUNING.labor.stopBelow

  // ④ 产出：每个已建成的产出型建筑按「天」进独立仓；仓满停产、不溢出
  for (const building of BUILDINGS) {
    if (!building.produces) continue
    if (!num(levelSnapshot[building.id])) continue
    const amount = productionOf(levelState, building.id, { patrolHours })
    if (!amount) continue
    const key = building.produces.key
    const have = Math.max(num(s.storage[key]), 0)
    const cap = ESTATE_TUNING.storageCap
    if (have >= cap) {
      pushLog(s, settledDay, `${building.name}仓满（${cap}），停产`, 'stall')
      continue
    }
    const added = Math.min(amount, cap - have)
    s.storage[key] = have + added
    out.storageGains[key] += added
    if (added < amount) pushLog(s, settledDay, `${building.name}仓满（${cap}），今日只入 ${added}`, 'stall')
  }

  // ④之二 经营链 L1（b 段）：市集是闸门；成品即产即卖，直接折成灵石入账
  //    · 原料取**今天生产之后**的库存（当天新粮当天可酿，符合「日结一次」的直觉）
  //    · 消费建筑按**日初等级快照**：今天完工的明天才开工
  //    · 市集没建 ⇒ 不耗料、不产成品（不是「产了卖不掉」，避免无谓的原料损失）
  const marketLevel = num(levelSnapshot.market)
  if (marketLevel >= ESTATE_TUNING.market.minLevel) {
    for (const link of CHAIN_LINKS) {
      const product = PRODUCTS[link.product]
      const level = num(levelSnapshot[link.building])
      if (level <= 0) continue
      const capacity = chainCapacityOf(levelState, link.building, { patrolHours })
      const stock = Math.max(num(s.storage[product.input]), 0)
      const made = Math.min(capacity, Math.floor(stock / product.inputPerOutput))
      if (made <= 0) continue
      const consumed = made * product.inputPerOutput
      s.storage[product.input] = stock - consumed
      const unitPrice = productUnitPriceOf(link.product, productTierOf(realmTier), marketLevel)
      const income = Math.round(made * unitPrice)
      out.productGains[link.product] += made
      out.gains.chainStone1 += income
      out.gains.spiritual += income
    }
  }

  // ⑤ 建设：进度与付款同速 ⇒ 总付款恒等于总成本（§10.5）
  let budget = Math.max(num(stones), 0)
  for (const [id, job] of Object.entries(s.builds)) {
    const building = buildingById(id)
    if (!building || !job) {
      delete s.builds[id]
      continue
    }
    const progress = clamp(num(job.progress), 0, 100)
    const remainingCost = Math.max(num(job.costStones) - num(job.paid), 0)

    // 脏档：进度已经 100 却没结算（中途崩溃 / 手改）→ 先补尾款，付得起才完工
    if (progress >= 100 - 1e-9) {
      if (remainingCost > budget) {
        const text = `${building.name} 停工：灵石不足（需补尾款 ${remainingCost} 一阶）`
        pushLog(s, settledDay, text, 'stall')
        out.events.push({ kind: 'stall', text })
        continue
      }
      budget -= remainingCost
      out.spent += remainingCost
      job.paid = num(job.paid) + remainingCost
      job.progress = 100
      finishBuilding(s, id, job, building, settledDay, out)
      continue
    }

    if (laborStop) {
      const text = `${building.name} 停工：徭役满足率 ${Math.round(satisfaction * 100)}%（需 ≥50%）`
      pushLog(s, settledDay, text, 'stall')
      out.events.push({ kind: 'stall', text })
      continue
    }

    const remainPct = 100 - progress
    // v2 起不再乘民心，只有巡视加速
    const rawDelta = (100 / Math.max(num(job.days, 1), 1)) * satisfaction * patrolFactor
    const nextProgress = Math.min(progress + rawDelta, 100)
    const deltaPct = nextProgress - progress
    if (deltaPct <= 0) continue
    // 完工判定看「推进后的进度」，不看 delta 与 remain 的比较 —— 浮点累加时后者可能漏判，
    // 于是任务被删掉却没付尾款（总付款少一笔）。
    const isDone = nextProgress >= 100 - 1e-9
    // 完工时把尾款补齐：避免逐日四舍五入让总付款 ≠ 总成本
    const pay = isDone ? remainingCost : Math.round((remainingCost * deltaPct) / remainPct)

    if (pay > budget) {
      const text = `${building.name} 停工：灵石不足（今日需 ${pay} 一阶）`
      pushLog(s, settledDay, text, 'stall')
      out.events.push({ kind: 'stall', text })
      continue
    }

    budget -= pay
    out.spent += pay
    job.paid = num(job.paid) + pay
    job.progress = clamp(nextProgress, 0, 100)

    if (isDone) {
      job.progress = 100
      finishBuilding(s, id, job, building, settledDay, out)
    }
  }

  // ⑥ 征收：乡侯府 Lv2 起；满格入库，**每月最多 1 次**
  //    「提前满不叠下月」：本月已经收过就不再涨进度 —— 不是攒到 100 等下月一号再收。
  const month = Math.floor(settledDay / ESTATE_TUNING.daysPerMonth)
  if (manorLevel >= ESTATE_TUNING.tax.minManorLevel && s.taxCollectedMonth !== month) {
    s.taxProgress = clamp(
      num(s.taxProgress) + ESTATE_TUNING.tax.progressPerDay * patrolFactor,
      0,
      100
    )
    if (s.taxProgress >= 100 - 1e-9) {
      // 金额用**日初等级 / 日初人口**算：今天从 Lv2 升到 Lv3，今天的税仍按 Lv2
      const stone1 = taxMonthlyStone1Of(levelState, offspringCount)
      const rounded = Math.round(stone1)
      out.gains.taxStone1 = stone1
      out.gains.spiritual += rounded
      s.taxCollectedMonth = month
      s.taxProgress = 0
      const text = `征收满格，入库 ${rounded} 一阶`
      pushLog(s, settledDay, text, 'tax')
      out.events.push({ kind: 'tax', text })
    }
  }

  // ⑦ 村民自然增长（2.5%/年，按天复利；封顶按**日初**乡侯府等级）
  const dailyRate = Math.pow(1 + ESTATE_TUNING.villagerGrowthPerYear, 1 / 365) - 1
  const cap = villagerCapOf(manorLevel)
  s.villagers = Math.min(cap, Math.max(num(s.villagers, ESTATE_TUNING.villagers) * (1 + dailyRate), 0))

  // ⑧ 落幂等标记（记录的是「刚结束的日历日」）
  s.lastDay = settledDay
  out.settled = true
  return out
}
