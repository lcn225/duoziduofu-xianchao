// 【物品池】—— 四池唯一的物品数据源（P17 第 2 步，2026-10-19）
//
// 真源：
//   《物品池设计方案》—— 四池、8 字段底材、底材/实例两层模型、`series` 命名。
//   《数据定案》§一/§二/§三/§五/§十三/§十四 —— 条目、series、灵材、灵植。
//
// **两条结构铁律**：
//   1. 池子里只存**底材**（8 字段 + 三层标签，无成色、无战斗面板）。
//      成色（下/中/上/极）在掉落时 roll，见 `createItemInstance`。
//   2. 同参是**用途，不是分类**。没有「同参表」—— 能不能当同参，取决于
//      两件物品的**三层标签重合度**（2026-10-28 B7 起，见 `tagHarmony.js`）。
//      旧的六档 `affinity` 硬编已删除。
//
// ⚠ 本文件是**纯数据 + 纯函数**，被 `scripts/verify-items.mjs` 用 node 直接加载。
//   相对 import 必须带 `.js` 后缀。
// ⚠ 物品基阶 1~5，**不带成色**；20 品阶 = 5 基阶 × 下/中/上/极 + 不入品。
//   宝匣 7 阶是**宝匣阶级**，不是物品基阶。

import { ITEM_POOL } from './items.data.js'
import { ITEM_QUALITIES, itemTierKey, itemTierName } from './tiers.js'
import {
  EQUIPMENT_QUALITIES,
  equipQualityKeyOf,
  equipSlotOfType,
  generateEquipment
} from './equipment.js'
// P43：灵兽面板改成「白板 × 成色 × 境界系数」，由 petUnit.js 统一算
import { petPanelOf } from './petUnit.js'
// B7：三层标签（474 件，真源 design/30-数据与决议/物品标签-474.json）
import { itemTagsOf } from './tagHarmony.js'

/** 四池 */
export const ITEM_CATEGORIES = ['灵器', '灵兽', '灵植', '灵材']

/** 灵气枚举（与 wuxing.js 的 ELEMENTS 键一致） */
export const FATE_ELEMENTS = ['metal', 'wood', 'water', 'fire', 'earth', 'beast', 'vessel']

/** 旧词表 `kind`（模块二的加成判定还在用这套） */
export const KIND_OF_CATEGORY = {
  灵器: '器物',
  灵兽: '灵兽',
  灵植: '草木',
  灵材: '杂物'
}

/**
 * 物品池底材（数据在 `items.data.js`，由 `scripts/build-items.py` 生成；不要手改）。
 *
 * 每个条目只有 8 个字段：
 *   id / name / category / type / series / tier / fateElement / description
 *
 * - `tier` 是**整数 1~5**，纯基阶，不带成色。
 * - `series` 是**同系列分组标签**，同一 series 下可以有多件；跨 category 可重名
 *   （同参判定先比 category）。
 * - 灵植 = **整株活体**，type 只有 草/花/树/藤；灵材 = 材质 + **摘下来的花/果/叶**
 *   （《物品池设计方案》§二：同一株植物，整株进灵植，部位进灵材，不重复录入）。
 */
export { ITEM_POOL }

const BY_ID = new Map(ITEM_POOL.map(item => [item.id, item]))

/** 底材按 id 查；未知返回 null */
export const itemById = id => BY_ID.get(id) || null

/** 按 category 筛底材（不传则返回全部） */
export const itemsOfCategory = category =>
  category ? ITEM_POOL.filter(item => item.category === category) : [...ITEM_POOL]

/** 8 字段底材快照 + 三层标签（不暴露池内引用） */
export const baseSnapshot = item => {
  if (!item) return null
  return {
    id: item.id,
    baseId: item.id,
    name: item.name,
    category: item.category,
    type: item.type,
    series: item.series,
    tier: item.tier,
    fateElement: item.fateElement,
    description: item.description || '',
    // 兼容旧词表：子嗣加成判定读 kind
    kind: KIND_OF_CATEGORY[item.category] || '杂物',
    // B7：同参契合按标签算，本命快照必须带上它
    tags: itemTagsOf(item.id)
  }
}

/** 同参判定用的 key（同 category 内 series 唯一） */
export const seriesKeyOf = item => `${item?.category || ''}:${item?.series || ''}`

/**
 * 六档同参亲和度、名字近似、类型近似 —— **2026-10-28（B7）全部删除**。
 *
 * 同参契合现在按三层标签算（`tagHarmony.companionHarmonyOf`），不按名字/系列/器型。
 * 旧的 `affinityOf` 是「准正主只能靠名字包含」的占位判定；标签引擎上线后
 * name/series/type 与同参**再无关系**，别再按名字比较把它们引回来。
 *
 * 保留下来的只有 `seriesKeyOf` —— 它服务抽本命时的「同系列不重复」，与同参无关。
 */

/** 默认成色权重（下 50 / 中 30 / 上 15 / 极 5），宝箱可按阶覆盖 */
export const DEFAULT_QUALITY_WEIGHTS = { 下: 0.5, 中: 0.3, 上: 0.15, 极: 0.05 }

/** roll 成色。rng 返回 1（边界）时不会越界 */
export const rollItemQuality = (rng = Math.random, weights = DEFAULT_QUALITY_WEIGHTS) => {
  const r = rng()
  let acc = 0
  for (const quality of ITEM_QUALITIES) {
    acc += Number(weights[quality]) || 0
    if (r < acc) return quality
  }
  return ITEM_QUALITIES[ITEM_QUALITIES.length - 1]
}

/**
 * 从池子里抽一件底材。
 * tier 区间与 category 都可收窄；`excludeSeries` 用于本命「同系列不重复」。
 */
export const rollBaseItem = ({
  category = null,
  minTier = 1,
  maxTier = 5,
  excludeSeries = new Set(),
  rng = Math.random,
  pool = ITEM_POOL
} = {}) => {
  const lo = Math.max(Math.floor(Number(minTier) || 1), 1)
  const hi = Math.min(Math.floor(Number(maxTier) || 5), 5)
  const candidates = pool.filter(
    item =>
      (!category || item.category === category) &&
      item.tier >= lo &&
      item.tier <= hi &&
      !excludeSeries.has(seriesKeyOf(item))
  )
  if (!candidates.length) return null
  return candidates[Math.min(Math.floor(rng() * candidates.length), candidates.length - 1)]
}

/**
 * 探索掉落用的「类型 + 阶」感知抽取。
 *
 * 物品池存在类型缺口（例如骨材最低二阶、叶只到一/二阶），直接按
 * `category + type + tier` 找会返回 null。这里按固定优先级兜底：
 *   1. 同 category + types + 精确 tier
 *   2. 同 category + fallbackTypes + 精确 tier（果园/茶园换同阶近似部位）
 *   3. 同 category + types + 逐阶向低
 *   4. 同 category + types + 逐阶向高（骨材最低二阶：T1 宁可给二阶骨材）
 *   5. 同 category + 任意 type，先精确阶、再逐阶向低
 *   6. null
 *
 * 兜底顺序是**故意的**：宁可换阶也不换成完全无关的类型；
 * 只有实在没有同类型时，才退到同 category 的其它类型。
 *
 * @returns {object|null} 物品池底材
 */
export const pickBaseItemForEvent = ({
  category = null,
  types = null,
  fallbackTypes = null,
  tier = 1,
  rng = Math.random,
  pool = ITEM_POOL
} = {}) => {
  const wantTypes = Array.isArray(types) && types.length ? new Set(types) : null
  const wantFallback = Array.isArray(fallbackTypes) && fallbackTypes.length ? new Set(fallbackTypes) : null
  const t = Math.max(Math.floor(Number(tier) || 1), 1)
  const inCategory = item => !category || item.category === category
  const matchesType = (item, set) => !set || set.has(item.type)

  const pick = predicate => {
    const list = pool.filter(predicate)
    if (!list.length) return null
    return list[Math.min(Math.floor(rng() * list.length), list.length - 1)]
  }

  // 1. 同类型 + 精确阶
  const exact = pick(item => inCategory(item) && matchesType(item, wantTypes) && item.tier === t)
  if (exact) return exact

  // 2. 同阶近似部位（只给显式声明 fallbackTypes 的事件用）
  if (wantFallback) {
    const near = pick(item => inCategory(item) && matchesType(item, wantFallback) && item.tier === t)
    if (near) return near
  }

  // 3. 同类型，逐阶向低
  for (let low = t - 1; low >= 1; low -= 1) {
    const fallback = pick(item => inCategory(item) && matchesType(item, wantTypes) && item.tier === low)
    if (fallback) return fallback
  }

  // 4. 同类型，逐阶向高（骨材最低二阶：T1 战斗宁可给二阶骨材，也不换类型）
  for (let high = t + 1; high <= 5; high += 1) {
    const fallback = pick(item => inCategory(item) && matchesType(item, wantTypes) && item.tier === high)
    if (fallback) return fallback
  }

  // 5. 同 category 任意类型，先精确阶、再逐阶向低
  for (let low = t; low >= 1; low -= 1) {
    const any = pick(item => inCategory(item) && item.tier === low)
    if (any) return any
  }

  return null
}

/**
 * 子嗣本命：抽 `count` 件底材快照。
 *
 * 约束（《物品池设计方案》§5.2）：
 *   · 同系列不重复（`category:series`）
 *   · **灵气允许重复**（2026-10-19 修正）：灵根 = 本命 `fateElement` 的**去重集合**，
 *     不是本命数量。3 件木系本命 = 单木灵根；5 件不同属性 = 五灵根。
 *     `usedElements` 已删除，不要再加回来。
 *   · **品阶上限 `maxTier`** 可由调用方传入；子嗣流程在「得到灵根数」之后
 *     再用 `clampFateTiers` 压阶（5→1、4/3→2、2→4、1→5）。这是**上限，不是保底**。
 *   · tier 权重暂按均匀；境界加权等本命强度模型定了再接。
 */
export const rollFateSet = ({ count = 1, maxTier = 5, rng = Math.random, pool = ITEM_POOL } = {}) => {
  const requested = Number(count)
  const n = Number.isFinite(requested)
    ? Math.max(Math.min(Math.floor(requested), 5), 0)
    : 1
  const cap = Math.max(Math.min(Math.floor(Number(maxTier) || 5), 5), 1)
  const eligible = item => Number(item?.tier) <= cap
  const out = []
  const usedSeries = new Set()
  for (let i = 0; i < n; i += 1) {
    // 均匀选一个**还有同系列可用底材的灵气**；灵气可以重复。
    // 这样灵气分布不被池子条目数量带偏（兽类条目多，但不应更容易抽到兽灵根）。
    const availableElements = FATE_ELEMENTS.filter(element =>
      pool.some(
        item =>
          item.fateElement === element && eligible(item) && !usedSeries.has(seriesKeyOf(item))
      )
    )
    const candidatesForElement = element =>
      pool.filter(
        item =>
          item.fateElement === element && eligible(item) && !usedSeries.has(seriesKeyOf(item))
      )

    let item = null
    if (availableElements.length) {
      const element =
        availableElements[
          Math.min(Math.floor(rng() * availableElements.length), availableElements.length - 1)
        ]
      const candidates = candidatesForElement(element)
      item = candidates[Math.min(Math.floor(rng() * candidates.length), candidates.length - 1)]
    } else {
      // 所有系列都用完了：允许同系列重复，保证能抽满
      const candidates = pool.filter(entry => eligible(entry))
      if (candidates.length) {
        item = candidates[Math.min(Math.floor(rng() * candidates.length), candidates.length - 1)]
      }
    }
    if (!item) break
    out.push(baseSnapshot(item))
    usedSeries.add(seriesKeyOf(item))
  }
  return out
}

/**
 * 把一批本命压到 `maxTier` 以内：超阶的换成**同灵气**的低阶底材。
 *
 * 用于「先定本命 → 由本命去重得到灵根数 → 再按灵根数封顶」的第二遍。
 * 换底材不换灵气，所以灵根集合不变；同系列尽量不重复。
 * 换不到同灵气的低阶底材时保留原样（宁可越阶，也不改灵根集合）。
 */
export const clampFateTiers = ({ fates = [], maxTier = 5, rng = Math.random, pool = ITEM_POOL } = {}) => {
  const cap = Math.max(Math.min(Math.floor(Number(maxTier) || 5), 5), 1)
  const out = fates.map(fate => ({ ...fate }))
  for (let i = 0; i < out.length; i += 1) {
    if (Number(out[i]?.tier) <= cap) continue
    const element = out[i].fateElement
    const used = new Set(out.filter((_, j) => j !== i).map(seriesKeyOf))
    const candidates = pool.filter(
      item =>
        item.fateElement === element &&
        Number(item.tier) <= cap &&
        !used.has(seriesKeyOf(item))
    )
    if (!candidates.length) continue
    const item = candidates[Math.min(Math.floor(rng() * candidates.length), candidates.length - 1)]
    out[i] = baseSnapshot(item)
  }
  return out
}

/** FNV-1a：老档补齐本命时的稳定索引（刷新不重掷） */
const stableIndex = (seed, mod) => {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return mod > 0 ? (hash >>> 0) % mod : 0
}

/**
 * 老档迁移：按已有的 `roots` 稳定补齐本命，**不重掷**。
 *
 * P17 之前的 `fate` 是单件、且与 `roots` 独立抽的；读档时要把
 * 「本命数量 = 灵根数量」补回来（**老档迁移例外**：保留旧档已确定的灵根数，
 * 新档走「本命去重 → 灵根」，两者方向相反）。`seed` 用子嗣 id + 名字，
 * 保证刷新稳定。新档不要用这个 —— 新档走 `rollFateSet`。
 */
export const fatesFromRoots = ({ roots = [], maxTier = 5, seed = '', pool = ITEM_POOL } = {}) => {
  const elements = [...new Set((roots || []).filter(Boolean))]
  const cap = Math.max(Math.min(Math.floor(Number(maxTier) || 5), 5), 1)
  const out = []
  const usedSeries = new Set()
  for (let i = 0; i < elements.length; i += 1) {
    const element = elements[i]
    const candidates = pool.filter(
      item =>
        item.fateElement === element &&
        Number(item.tier) <= cap &&
        !usedSeries.has(seriesKeyOf(item))
    )
    // 上限优先：该灵气在上限内没有底材就跳过，宁可少一件，也不越阶。
    // 当前 7 种灵气都有一阶底材，正常走不到这里。
    if (!candidates.length) continue
    const item = candidates[stableIndex(`${seed}|${element}|${i}`, candidates.length)]
    out.push(baseSnapshot(item))
    usedSeries.add(seriesKeyOf(item))
  }
  return out
}

/** 底材显示名：`一阶【寒冰刺】` */
export const baseDisplayNameOf = item => {
  if (!item) return '—'
  return `${item.tier}阶【${item.name}】`
}

/** 实例显示名：`一阶极品【寒冰刺】`；不入品 → `一阶【寒冰刺】` */
export const displayNameOf = (item, quality = '中') => {
  if (!item) return '—'
  return `${itemTierName(itemTierKey(item.tier, quality))}【${item.name}】`
}

/** 物品成色 → 灵宠品阶（宠物 store 用英文键，与抽奖时代的字段保持一致） */
export const PET_RARITY_BY_QUALITY = {
  下: 'mortal',
  中: 'spiritual',
  上: 'mystic',
  极: 'celestial'
}

/**
 * 灵兽底材 → 灵宠面板（2026-10-22；**2026-10-25 P43 改口径**）。
 *
 * 旧版是「绝对属性 + 固定 1 级」，现在灵兽会随同修升级，面板必须按
 * `白板(T1~T5) × 成色 × 境界系数` 现算 —— 烘死在一处的 `combatAttributes`
 * 只作为**当前面板缓存**给桂冈加成用，真源始终是 `petUnit.petPanelOf`。
 *
 * @param {number} tier    基阶 1~5
 * @param {string} quality 成色 下/中/上/极
 * @param {number} level   同修等级（默认 1）
 */
export const generatePetAttributes = (tier = 1, quality = '中', level = 1) =>
  petPanelOf({ tier, quality, level })

let instanceSeq = 0
/**
 * 底材 → 实例（《物品池设计方案》§4.2）。
 * 池子只存模板；掉落后才 roll 成色、生成 stats。
 *
 * 2026-10-22 起**在这里把灵器/灵兽接到对应系统**（《模块一》§9.1：
 * 灵器 → 装备、灵兽 → 灵宠）：
 *   · 灵器实例带 `equipSlot` / `stats` / `qualityInfo`，装备页能直接穿；
 *   · 灵兽实例变成 `type: 'pet'`，进灵宠页、可出战。
 *   灵植 / 灵材保持原样（材料页）。
 *
 * @param base   底材（池内对象或快照）
 * @param quality 成色：下/中/上/极/none
 * @param stats  战斗面板（显式传入时优先，供百艺/测试覆盖）
 * @param petLevel 灵兽初始等级（P43：`max(1, 主角小境界 − 3)`，由调用方传入）
 * @param rng    词条随机源（默认 Math.random；测试可注入）
 */
export const createItemInstance = (
  base,
  {
    quality = '中',
    stats = null,
    instanceId = null,
    equippedBy = null,
    location = 'inventory',
    petLevel = 1,
    rng = Math.random
  } = {}
) => {
  if (!base) return null
  instanceSeq += 1
  const id = instanceId || `inst_${Date.now().toString(36)}_${instanceSeq}`
  const tierKey = itemTierKey(base.tier, quality)
  const qualityKey = equipQualityKeyOf(quality)
  const equipSlot = base.category === '灵器' ? equipSlotOfType(base.type) : null
  const common = {
    // `id` 与 `instanceId` 同值：装备/出售等旧代码按 `id` 找物品，没有它会误删别的条目
    id,
    instanceId: id,
    baseId: base.id,
    name: base.name,
    category: base.category,
    type: base.type,
    series: base.series,
    tier: base.tier,
    quality,
    qualityKey,
    tierKey,
    displayName: displayNameOf(base, quality),
    description: base.description || '',
    // 三层标签跟着底材走：实例（背包 / 已装备 / 出战灵宠）都能直接当同参
    tags: base.tags || itemTagsOf(base.id),
    stats,
    equippedBy,
    location
  }

  if (base.category === '灵器') {
    // P36 第 1 步：白板 + 主属性 + 副属性 + 词条（《装备系统》§四~§六）
    const rolled =
      stats || !equipSlot
        ? null
        : generateEquipment({
            slot: equipSlot,
            type: base.type,
            tier: base.tier,
            quality,
            series: base.series,
            rng
          })
    return {
      ...common,
      equipSlot,
      // 兼容旧装备字段：`slot` / `equipType` 都指向同一个部位
      slot: equipSlot,
      equipType: equipSlot,
      stats: stats || rolled.stats,
      // 主属性 / 副属性 / 词条分开存：装备详情要按「白板 → 主属性 → 词条」展示
      mainStats: rolled?.mainStats || {},
      subStats: rolled?.subStats || {},
      traits: rolled?.traits || [],
      statsVersion: 1,
      qualityInfo: EQUIPMENT_QUALITIES[qualityKey] || EQUIPMENT_QUALITIES.common
    }
  }

  if (base.category === '灵兽') {
    return {
      ...common,
      // 灵宠页按 `type === 'pet'` 过滤；原 type（妖兽/凶兽…）留在 species
      type: 'pet',
      species: base.type,
      rarity: PET_RARITY_BY_QUALITY[quality] || 'mortal',
      // P43：等级由同修推进，初始 = max(1, 主角小境界 − 3)（调用方传入）；star 字段已废弃
      level: Math.max(Math.floor(Number(petLevel) || 1), 1),
      xp: 0,
      star: 0,
      stats: null,
      // 面板缓存：真源是 petUnit.petPanelOf，这里只是给桂冈加成用的当前值
      combatAttributes: generatePetAttributes(base.tier, quality, petLevel)
    }
  }

  return common
}

/**
 * 子嗣本命池的**兼容视图**（旧代码按品质四档读）。
 *
 * P17 起本命真源是上面的 ITEM_POOL；这里只把底材按基阶粗分四档，
 * 供 `innerCourtData` 继续导出旧名字、供 verify 检查元素/kind 词汇。
 * **新代码不要再用它抽本命** —— 用 `rollFateSet`。
 */
const fateEntryOf = item => ({
  id: item.id,
  name: item.name,
  element: item.fateElement,
  kind: KIND_OF_CATEGORY[item.category] || '杂物'
})

export const FATE_POOL = {
  low: ITEM_POOL.filter(item => item.tier === 1).map(fateEntryOf),
  mid: ITEM_POOL.filter(item => item.tier === 2).map(fateEntryOf),
  high: ITEM_POOL.filter(item => item.tier === 3).map(fateEntryOf),
  top: ITEM_POOL.filter(item => item.tier >= 4).map(fateEntryOf)
}
