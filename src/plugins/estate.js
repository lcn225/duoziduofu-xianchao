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
// 乡间自动百艺（B11-b）：料源与配平口径与桂冈共用同一套纯函数，不要另抄一份
import { craftableCountOf, planMaterialsOf } from './arts.js'
// 中间产物仓取回：底材从物品池挑，五系顺序与药浴共用一套（`bath → items`，无回边）
import { ITEM_POOL } from './items.js'
import { BATH_ELEMENTS } from './bath.js'

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
    effectText: '子嗣修炼位 +25/级（基础 50 照给，B14-c 已接）',
    produces: null,
    /**
     * 木屋的工期比同等级建筑长（2026-11-04 用户拍板）：Lv2 6 / Lv3 12 游戏月。
     * 筑基 24× 下 = **12 / 24 现实分钟**；其他建筑仍走 `ESTATE_TUNING.buildMonths`。
     */
    durationMonths: { 2: 6, 3: 12 },
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
    // B11-b（2026-11-08）：从经营链改为「乡间自动炼器」—— 4 矿石 → 1 件本段阶灵器进背包
    effectText: '乡间炼器：4 矿石 → 1 件本段阶灵器 / 天 / 级（料吃封地仓，成品进背包）',
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
    // 2026-11-05：藏书阁并入传功阁（只留一栋「管子嗣修炼」的楼），见《模块四》§十三
    effectText: '子嗣修炼速度：按灵根抽 1 门功法，功法品阶 + 本阁等级越高越快（0~16.6%）',
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
    // 2026-11-05 用户拍板：**不再单独给加成**，卡片只展示家族树英烈祠的牌位加成（R13）
    effectText: '家族英烈牌位：每座 +1% 打坐修为、+0.1% 新生灵根（R13，上限 +10% / +1%）',
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
    // B11-b（2026-11-08）：从经营链改为「乡间自动炼丹」—— 3 灵植 → 1 件本段阶丹药进背包
    effectText: '乡间炼丹：3 灵植 → 1 件本段阶丹药 / 天 / 级（料吃封地仓，成品进背包）',
    produces: null,
    unlockText: '乡侯府 Lv.4 解锁'
  },
  {
    id: 'talismanShop',
    name: '符坊',
    maxLevel: 3,
    tier: 'medium',
    unlock: { manorLevel: 3 },
    mvp: false,
    initial: false,
    // B11-b 新增（《模块四》§十六 #9 拍板：与工坊同批、中档、3 级）
    effectText: '乡间制符：按排班配方产本段阶符箓进背包（料吃背包叶 / 藤）',
    produces: null,
    unlockText: '乡侯府 Lv.3 解锁'
  },
  {
    id: 'arrayHall',
    name: '阵堂',
    maxLevel: 3,
    tier: 'large',
    unlock: { manorLevel: 4 },
    mvp: false,
    initial: false,
    // B11-b 新增（与丹炉同批、大档、3 级）
    effectText: '乡间炼阵：按排班配方产本段阶阵法进背包（料吃背包骨材 / 灵土）',
    produces: null,
    unlockText: '乡侯府 Lv.4 解锁'
  }
]

// ---------- 经营链 L1（b 段，2026-11-03） ----------

/**
 * 成品表（《模块四》§12.1）。
 *
 * ⚠ **B11-b（2026-11-08）起只有酒还是抽象货物**：不占背包、不进回收口、不可装备 ——
 * 结算当天直接折成灵石入账。丹炉 / 工坊 已改「乡间自动百艺」（`AUTO_ART_LINES`），
 * `PRODUCTS.pill` / `PRODUCTS.craft` 只留作它们的**料耗基准**（3 灵植 / 4 矿石 换 1 件），
 * 不再进 `CHAIN_LINKS`。
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

/**
 * 经营链：消耗建筑 → 成品（顺序 = UI 展示顺序）。
 *
 * ⚠ **B11-b（2026-11-08）起只剩酒坊一条链**：丹炉 / 工坊 改「乡间自动百艺」
 * （见下方 `AUTO_ART_LINES`），成品变真实物品进背包、不再即产即卖。
 * 市集闸门因此从三链变**一链（酒）** —— 《产出登记表》2026-11-04 的 R53 变更已生效。
 * `PRODUCTS.pill` / `PRODUCTS.craft` 不再进链，只留作乡间百艺的料耗基准。
 */
export const CHAIN_LINKS = [{ building: 'winery', product: 'wine' }]

/**
 * 乡间自动百艺（B11-b，2026-11-08 拍板）。
 *
 * - `source: 'storage'` —— 料吃**封地仓**：丹炉吃灵植、工坊吃矿石，
 *   消耗速度沿用原经营链（3 灵植 / 4 矿石 换 1 件）；
 * - `source: 'bag'` —— 料吃**背包**：封地不产叶/藤/骨材/灵土，只能扣背包，
 *   按该艺**当前排班配方**的真实 inputs 扣（`arts.planMaterialsOf`）。
 *
 * 两种来源的成品都进背包，阶 = **配方所在境界段**（乡间产本段阶，桂冈产高一阶）。
 * ⚠ 本表顺序 = UI 展示顺序。
 */
export const AUTO_ART_LINES = [
  { building: 'furnace', art: 'alchemy', source: 'storage', storageKey: 'herb', inputPerOutput: 3 },
  { building: 'workshop', art: 'forge', source: 'storage', storageKey: 'ore', inputPerOutput: 4 },
  { building: 'talismanShop', art: 'talisman', source: 'bag' },
  { building: 'arrayHall', art: 'array', source: 'bag' }
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
  /** 定价轴：练气段 1 游戏月可支配收入（二阶）。保留给旧断言 / 未传段名的调用方 */
  baseIncomeStone2PerMonth: 88,
  /**
   * **分段定价轴**（《模块四》§10.7，2026-11-04 落地）：
   * 每级价格 = 该段 1 游戏月可支配收入（俸禄现银 + 探索/秘境，**不含挂账**）
   * × 档位系数 × 2^(Lv−2)。
   *
   * - 练气 **88**：已定（83 现银 + 5~6 探索）。
   * - 筑基 **700**：520~910 的中点（下柱+一线天 520 / 上柱+地火断崖 1,080）。
   * - 金丹 **3,000**：⚠ **占位**（原作物价表「仙朝」2,770~3,520/月），等 B16 金丹图实测后改。
   *
   * 时钟加速只压缩现实时间，**不动价格**（不存在「物价 ×168」）。
   */
  incomeStone2ByRealm: { qi: 88, foundation: 700, core: 3000 },
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
  /** 乡间自动百艺（B11-b，2026-11-08）：每栋每级每天几件成品，另乘巡视 (24+S)/24 */
  autoArt: {
    perLevelPerDay: 1
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
  const builds = raw.builds && typeof raw.builds === 'object' ? { ...raw.builds } : {}
  // 2026-11-05：**藏书阁并入传功阁**（用户拍板，只留一栋「管子嗣修炼」的楼）。
  // 老档若建过 `archive`，把等级并进 `library`（封顶 3 级）并清掉键；
  // 在建工程也一并转过去，避免按「未知建筑」被静默删除、已付的款打水漂。
  if (buildings.archive !== undefined) {
    const archiveLevel = Math.max(Math.floor(num(buildings.archive)), 0)
    const libraryLevel = Math.max(Math.floor(num(buildings.library)), 0)
    if (archiveLevel > libraryLevel) buildings.library = Math.min(archiveLevel, 3)
    delete buildings.archive
  }
  if (builds.archive) {
    if (!builds.library) {
      builds.library = {
        ...builds.archive,
        targetLevel: Math.min(Math.max(Math.floor(num(builds.archive.targetLevel, 1)), 1), 3)
      }
    }
    delete builds.archive
  }
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
 * @param {{firstBuild?:boolean, realmTier?:string}} opts 首建：成本 0、工期 × 0.5；
 *   `realmTier` = 定价段（`qi` / `foundation` / `core`），缺省按练气段算
 * @returns {{costStone2:number,costStones:number,days:number,labor:number}|null}
 */
export const upgradeQuote = (id, targetLevel, { firstBuild = false, realmTier = 'qi' } = {}) => {
  const building = buildingById(id)
  if (!building) return null
  const target = Math.floor(num(targetLevel))
  if (target < 1 || target > building.maxLevel) return null
  // 首建借用 Lv1→2 的基准（设计表从 Lv1→2 起）
  const baseLevel = Math.max(target, 2)
  // 工期：建筑可以自带覆盖表（如快子峰木屋 6 / 12 游戏月），否则走全局按等级的表
  const months = num(
    building.durationMonths?.[baseLevel],
    num(ESTATE_TUNING.buildMonths[baseLevel])
  )
  if (!months) return null
  const coef = num(ESTATE_TUNING.buildTiers[building.tier], ESTATE_TUNING.buildTiers.small)
  // 分段定价（§10.7）：未知段名退回练气轴
  const income = num(
    ESTATE_TUNING.incomeStone2ByRealm?.[realmTier],
    ESTATE_TUNING.baseIncomeStone2PerMonth
  )
  const costStone2 = firstBuild
    ? 0
    : Math.round(income * coef * Math.pow(2, baseLevel - 2))
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

/** 某建筑的下一次可升级报价；已满级 / 未建成返回 null（`realmTier` 决定定价段） */
export const nextQuoteOf = (state, id, realmTier = 'qi') => {
  const building = buildingById(id)
  if (!building) return null
  const level = num(state?.buildings?.[id])
  if (level <= 0) return upgradeQuote(id, 1, { firstBuild: true, realmTier })
  if (level >= building.maxLevel) return null
  return upgradeQuote(id, level + 1, { realmTier })
}

/**
 * 整体徭役满足率 = min(1, 徭役总数 / 在建总需求)。
 *
 * ⚠ 这个数是**概况展示**，不是推进判据 —— 推进看 `laborPlanOf` 的逐项分配。
 *   旧口径拿它当全部项目的统一速度，导致「总需求 > 2×徭役 ⇒ 全体 <50% ⇒ 全体停工」，
 *   且完工不了 ⇒ 需求永不下降 = **永久死锁**（2026-11-04 修）。
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

/**
 * **徭役分配计划**（2026-11-04 起，取代「全体均分」）。
 *
 * 口径：**先开工的项目先拿徭役，拿满为止**；剩下的依次往下发。
 * 分到的比例 ≥ `stopBelow`（50%）就按这个比例推进，< 50% 的项目本轮记为
 * `waiting`（分到的徭役退回池子，不占着），等前面的项目完工后自动接上。
 *
 * 死锁为什么不会再发生：只要总徭役够**第一个**项目的 50%，就至少有一个项目在推进；
 * 完工后它的徭役回到池子，队尾的项目接着跑。旧口径下「全体一起卡死」在结构上不成立。
 *
 * 排序键：`job.seq`（开工流水号，store 下单时写）；老档没有 seq（=0）时
 * 按 `builds` 对象的插入顺序兜底（JSON 往返保序）。
 *
 * @returns {{
 *   total:number, demand:number, assigned:number,
 *   plan:Object<string,{demand:number, assigned:number, satisfaction:number, waiting:boolean}>
 * }}
 */
export const laborPlanOf = (state, laborTotal = null) => {
  const raw = state?.builds && typeof state.builds === 'object' ? state.builds : {}
  const entries = Object.entries(raw)
    .map(([id, job], index) => ({ id, job, index }))
    .filter(({ job }) => job && typeof job === 'object')
    .sort((a, b) => num(a.job.seq) - num(b.job.seq) || a.index - b.index)

  const total = laborTotal == null ? laborTotalOf(state, 0) : Math.max(num(laborTotal), 0)
  const stopBelow = ESTATE_TUNING.labor.stopBelow
  let pool = total
  let demandSum = 0
  let assignedSum = 0
  const plan = {}

  for (const { id, job } of entries) {
    const demand = Math.max(num(job.labor), 0)
    demandSum += demand
    // 需求 0（手工档 / 特殊项目）：不占徭役，直接算满速
    if (demand <= 0) {
      plan[id] = { demand: 0, assigned: 0, satisfaction: 1, waiting: false, reason: null }
      continue
    }
    const assigned = Math.min(demand, pool)
    const satisfaction = assigned / demand
    if (satisfaction >= stopBelow - 1e-9) {
      plan[id] = { demand, assigned, satisfaction, waiting: false, reason: null }
      pool -= assigned
      assignedSum += assigned
    } else {
      // 够不到 50% ⇒ 这轮排队，不占徭役（留给后面的项目）。
      // `reason` 只影响文案：前面已经拿走了徭役 = 排队；一点都没派出去 = 真·总量不足。
      plan[id] = {
        demand,
        assigned: 0,
        satisfaction,
        waiting: true,
        reason: assignedSum > 0 ? 'queue' : 'labor'
      }
    }
  }

  return { total, demand: demandSum, assigned: assignedSum, plan }
}

/** 在建项目的徭役分配（逐项分配后的实际人数，UI 展示用） */
export const laborAssignedOf = (state, id, laborTotal = null) => {
  const { plan } = laborPlanOf(state, laborTotal)
  return num(plan[id]?.assigned)
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

// ---------- 中间产物仓 → 背包取回（2026-11-11 · P36 链头） ----------
//
// 一句话：把「灵植 × N」的抽象计数铸成**具体物品实例**进背包，
// 让药浴池（只读背包）能吃到药圃的产出，同时**不动丹炉吃仓这条自动链**。
//
// ⚠ 只有**灵植**能取回：`ITEM_POOL` 里没有「粮」「矿石」这两个品类，
//   硬铸会污染本命 / 同参池。粮与矿石只在封地内被酒坊 / 工坊消耗。
// ⚠ 这是「出」动作：仓上限 500 的刹车照旧，取回后仓里腾出位置继续产。

/** 一次「取回」铸多少件（仓里不足则取现有量） */
export const WITHDRAW_UNITS_PER_CLICK = 10

/** 能从封地仓取回背包的中间产物 → 物品池品类 */
export const STORAGE_WITHDRAW_CATEGORY = { herb: '灵植' }

export const withdrawableStorageKeys = () => Object.keys(STORAGE_WITHDRAW_CATEGORY)

/** 某系某阶的灵植底材（池内顺序，确定性 —— 不摇 rng） */
const withdrawBasesOf = (element, tier) =>
  ITEM_POOL.filter(
    item =>
      item.category === '灵植' &&
      item.fateElement === element &&
      Math.floor(num(item.tier)) === tier
  )

/**
 * 取回计划（**纯函数，不改 state**）。
 *
 * 标准件规则（2026-11-09 A1 拍板 / 2026-11-11 路线 4）：
 *   · **阶 = 当前境界段低阶**（`productTierOf`：练气 1 / 筑基 2 / 金丹 3）
 *   · **成色固定「中」**
 *   · **五系按缺口**：`preferElements` 由调用方按药力升序排好，这里只按序轮转；
 *     该阶某系没有底材就跳过（数据分布问题，不是错误），五系全空才算失败。
 *
 * @returns {{ok:boolean, reason?:string, key?:string, units?:number, tier?:number,
 *            quality?:string, bases?:Array, elements?:string[]}}
 */
export const planStorageWithdraw = (
  state,
  key = 'herb',
  units = WITHDRAW_UNITS_PER_CLICK,
  { tier = 1, quality = '中', preferElements = BATH_ELEMENTS } = {}
) => {
  if (!STORAGE_WITHDRAW_CATEGORY[key]) {
    return { ok: false, reason: '这种中间产物没有背包形态' }
  }
  const have = Math.floor(Math.max(num(state?.storage?.[key]), 0))
  if (have <= 0) return { ok: false, reason: '封地仓里没有可取的存货' }
  const want = Math.min(Math.floor(num(units)), have)
  if (want <= 0) return { ok: false, reason: '取回件数必须大于 0' }

  const t = clamp(Math.floor(num(tier, 1)), 1, 5)
  const order = (Array.isArray(preferElements) ? preferElements : BATH_ELEMENTS).filter(el =>
    BATH_ELEMENTS.includes(el)
  )
  // 只留有底材的系；顺序 = 调用方给的缺口顺序
  const pools = order.map(el => withdrawBasesOf(el, t)).filter(list => list.length > 0)
  if (!pools.length) return { ok: false, reason: `该阶（${t} 阶）没有可取的灵植底材` }

  const bases = []
  const elements = []
  for (let i = 0; i < want; i += 1) {
    const list = pools[i % pools.length]
    const base = list[Math.floor(i / pools.length) % list.length]
    bases.push(base)
    elements.push(base.fateElement)
  }
  return { ok: true, key, units: want, tier: t, quality, bases, elements }
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

// ---------- 乡间自动百艺（B11-b，2026-11-08） ----------

/** 某栋乡间建筑的日产能（件，未扣料）：每级 1 件 × 巡视系数 */
export const autoArtCapacityOf = (state, buildingId, { patrolHours = 0 } = {}) => {
  const level = num(state?.buildings?.[buildingId])
  if (level <= 0) return 0
  return Math.max(
    Math.round(ESTATE_TUNING.autoArt.perLevelPerDay * level * patrolFactorOf(patrolHours)),
    0
  )
}

/**
 * 单条乡间线的投影（**不扣料、不入包**）—— UI 与日结共用同一份口径。
 *
 * `reason`：`ok` 运转 · `unbuilt` 未建造 · `no-recipe` 该艺未解锁 / 本段无可用配方 ·
 * `starved` 原料不足。
 */
export const autoArtRowOf = (state, line, { bagItems = [], recipes = {}, patrolHours = 0 } = {}) => {
  const level = num(state?.buildings?.[line.building])
  const recipe = recipes?.[line.art] || null
  const capacity = autoArtCapacityOf(state, line.building, { patrolHours })
  let made = 0
  let stock = 0
  if (level > 0 && recipe) {
    if (line.source === 'storage') {
      stock = Math.max(num(state?.storage?.[line.storageKey]), 0)
      made = Math.min(capacity, Math.floor(stock / Math.max(1, line.inputPerOutput)))
    } else {
      made = Math.min(capacity, craftableCountOf(recipe, bagItems))
    }
  }
  let reason = 'ok'
  if (level <= 0) reason = 'unbuilt'
  else if (!recipe) reason = 'no-recipe'
  else if (made <= 0) reason = 'starved'
  return {
    building: line.building,
    art: line.art,
    source: line.source,
    inputKey: line.source === 'storage' ? line.storageKey : null,
    inputPerOutput: line.source === 'storage' ? line.inputPerOutput : null,
    stock,
    level,
    capacity,
    made,
    recipeId: recipe?.id || null,
    recipeName: recipe?.name || '',
    /** 乡间产 = 配方所在境界段（不是 +1） */
    tier: recipe ? Math.max(1, Number(recipe.tier) || 1) : 0,
    reason
  }
}

/** 四条乡间线的视图（UI 用；顺序 = `AUTO_ART_LINES`） */
export const autoArtViewOf = (state, opts = {}) =>
  AUTO_ART_LINES.map(line => autoArtRowOf(state, line, opts))

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
 *
 * 导出供离线块化路径（P62 步骤 1）在**块首**复印一次：块内用 `clone:false` 直接改这份
 * 纯对象，不再逐日复印、也不把响应式代理带进循环。
 */
export const cloneEstate = state => {
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
 * 顺序固定：幂等 → 徭役快照 → 产出（进仓）→ **经营链（酒，耗料产成品并即卖）** →
 * **乡间百艺（四栋，产实物进背包）** → 建设 → 征收 → 人口增长 → 落 lastDay。
 * 两条顺序理由：
 *   ① 产出与税收要用**日初等级 / 日初人口快照** —— 今天完工的升级**明天**才产，
 *      否则「灵田今天建成今天收」「乡侯府今天升 Lv3 今天按 Lv3 收税」会多算一天；
 *   ② 结算归属的是「刚结束的那个日历日」（`settledDay = midnight/DAY − 1`），
 *      不是 `midnight/DAY` —— 否则首次结算会写成「第 2 日」，征收的月口径也整体偏一天。
 *
 * @param {object} state 封地状态（默认不改原对象；`clone:false` 时**原地改**）
 * @param {{midnight?:number, patrolHours?:number, stones?:number, offspringCount?:number,
 *          realmTier?:string, bagItems?:Array, autoRecipes?:object, clone?:boolean}} ctx
 *   `patrolHours` = 那一天**实际巡视的小时数**（0 = 没巡视）；三处加速共用 `(24+S)/24`
 *   `stones` = 当前一阶灵石余额，只用来判断「今天付不付得起」
 *   `offspringCount` = 活着的子嗣数（总人口 / 徭役 / 税收的分母）
 *   `realmTier` = 当前大境界（`qi` / `foundation` / `core`），决定成品阶与市集单价
 *   `bagItems` = 背包快照（乡间符坊 / 阵堂按它扣料；纯函数**只读不扣**）
 *   `autoRecipes` = 四艺当前排班配方 `{ alchemy, talisman, array, forge }`（可为 null）
 *   `clone` = 默认 `true`（在线路径照旧）。**只有离线块化路径传 `false`**：
 *     调用方在块首已 `cloneEstate` 过一份纯对象，块内 180 天都在这同一份上改。
 *     ⚠ 传 `false` 等于「入参归调用方所有」，别在别处再传。
 * @returns {{state:object, gains:{spiritual:number,secular:number,taxStone1:number,
 *            chainStone1:number}, productGains:object, storageGains:object, spent:number,
 *            autoArt:{rows:Array, produced:Array, bagPlan:Array}, events:Array, settled:boolean}}
 */
export const advanceEstateDay = (
  state,
  {
    midnight = 0,
    patrolHours = 0,
    stones = 0,
    offspringCount = 0,
    realmTier = 'qi',
    bagItems = [],
    autoRecipes = {},
    clone = true
  } = {}
) => {
  const s = clone ? cloneEstate(state) : state
  const settledDay = Math.floor(num(midnight) / DAY) - 1
  const out = {
    state: s,
    gains: { spiritual: 0, secular: 0, taxStone1: 0, chainStone1: 0 },
    productGains: { wine: 0, pill: 0, craft: 0 },
    storageGains: { grain: 0, herb: 0, ore: 0 },
    spent: 0,
    /** 乡间自动百艺：`rows` 逐栋明细 · `produced` 待入包 · `bagPlan` 待从背包实扣 */
    autoArt: { rows: [], produced: [], bagPlan: [] },
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
  //    逐项分配：先开工的优先拿满，够不到 50% 的排队（不占徭役），前面的完工后自动接上。
  const laborPlan = laborPlanOf(s, laborTotal)

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

  // ④之三 乡间自动百艺（B11-b，2026-11-08）：成品进背包，**不再即产即卖**
  //    · 丹炉 / 工坊 料吃封地仓（沿用 3 灵植 / 4 矿石 换 1 件）
  //    · 符坊 / 阵堂 料吃背包（按该艺当前排班配方的真实 inputs）
  //    · 顺序放在酒链之后：当天新料当天可用；背包侧**只出计划、不扣料**
  //      （实扣在 store 里统一 `takeUnits`，纯函数层不碰响应式数组）
  for (const line of AUTO_ART_LINES) {
    const row = autoArtRowOf(s, line, { bagItems, recipes: autoRecipes, patrolHours })
    if (row.made > 0) {
      if (line.source === 'storage') {
        const consumed = row.made * line.inputPerOutput
        s.storage[line.storageKey] = Math.max(num(s.storage[line.storageKey]) - consumed, 0)
        row.consumedStorage = consumed
      } else {
        const { plan } = planMaterialsOf(autoRecipes[line.art], bagItems, { times: row.made })
        out.autoArt.bagPlan.push(...plan)
        row.consumedUnits = plan.reduce((sum, entry) => sum + entry.units, 0)
      }
      out.autoArt.produced.push({
        recipeId: row.recipeId,
        art: line.art,
        building: line.building,
        units: row.made
      })
    }
    out.autoArt.rows.push(row)
  }

  // ⑤ 建设：进度与付款同速 ⇒ 总付款恒等于总成本（§10.5）
  let budget = Math.max(num(stones), 0)
  /** 本轮排队/徭役不足的项目（日志在循环末尾聚合，避免几十天刷满流水） */
  const laborWaiting = []
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

    // 逐项徭役：这一项本轮分到多少
    const share = laborPlan.plan[id] || {
      demand: num(job.labor),
      assigned: num(job.labor),
      satisfaction: 1,
      waiting: false,
      reason: null
    }
    if (share.waiting) {
      const pct = Math.round(share.satisfaction * 100)
      const text =
        share.reason === 'queue'
          ? `${building.name} 排队中：徭役先给先开工的项目（本项分到 ${pct}%，需 ≥50%）`
          : `${building.name} 停工：徭役不足（分到 ${pct}%，需 ≥50%）`
      // 日志**按天聚合**（见循环末尾）：排队会持续几十天，逐项写会把 40 条流水刷满、
      // 把完工 / 征收挤掉。事件仍逐项保留，留给将来的通知层。
      laborWaiting.push({ text, reason: share.reason })
      out.events.push({ kind: 'stall', text })
      continue
    }

    const remainPct = 100 - progress
    // v2 起不再乘民心，只有巡视加速
    const rawDelta = (100 / Math.max(num(job.days, 1), 1)) * share.satisfaction * patrolFactor
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

  // ⑤之二 徭役排队日志：一项照旧写具体名字，多项合并成一条
  if (laborWaiting.length === 1) {
    pushLog(s, settledDay, laborWaiting[0].text, 'stall')
  } else if (laborWaiting.length > 1) {
    const allQueue = laborWaiting.every(row => row.reason === 'queue')
    pushLog(
      s,
      settledDay,
      allQueue
        ? `${laborWaiting.length} 个项目排队中：徭役先给先开工的项目`
        : `${laborWaiting.length} 个项目停工：徭役不足`,
      'stall'
    )
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
