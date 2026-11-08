// 【百艺】—— 数值、配方、扣料与产物的纯函数层（模块七 v2）
//
// v2（B11-a1，2026-11-07）：配方从「凭空生成」改为
//   **真实扣料 → 按轮推进进度条 → 完成后出成品**。
//
// 硬口径（《模块七》§11.2 / §11.5）：
//   · `tier` 是**乡间阶**（配方所在境界段），桂冈亲手做产 **tier + 1**；
//   · 产出种类由 `output.kind` 决定 —— 凡俗（`crafted`）不参与「高一阶」，
//     B2 的「杂物 tier 0 + 30 大子回收」**本批不做**，所以它们仍是 1 阶可回收；
//   · 二阶及以上才要残页（`fragments`），熟练度只作「学高阶配方」的门槛；
//   · 熟练度**只有桂冈亲手制作才涨**，乡间自动不涨（B11-b）。
//
// ⚠ 所有数值都是占位，标 `TODO(数值真值表)`。
// ⚠ 功法/配方**绝不能放进 inventory.items**：那里任何带 type 的条目都会被
//   `batchSellEquipments` 当成 1 灵石装备卖掉。它们住在 `arts.manuals`。
//
// 带 .js 后缀是刻意的：本文件会被 verify 脚本用 node 直接加载。

import { EQUIPMENT_QUALITIES } from './equipment.js'
import { createItemInstance, itemById, itemsOfCategory } from './items.js'
import { CONSUMABLE_CATEGORIES, unitsOf } from './stacks.js'

/** 四艺。顺序也用作 UI 展示顺序 */
export const ARTS = ['alchemy', 'talisman', 'array', 'forge']

/** 中文字典（流水账、主界面勾选、日程都用它，别在视图里另写一份） */
export const ART_LABELS = {
  alchemy: '炼丹',
  talisman: '制符',
  array: '炼阵',
  forge: '炼器'
}

/**
 * 开局就解锁的艺。
 *
 * 口径（《模块解锁方针》§五 / 《模块七》§二）：**炼器开局即送**，
 * 炼丹 / 制符 / 炼阵「**凭功法或残页**解锁」。
 * B11-a2 落的是**残页那一条**：拿到某艺第一张残页就解锁该艺（见 store 的 `gainRecipeFragment`）；
 * 「功法整本」那条留到以后（探索事件掉百艺功法），不影响本批规则。
 */
export const STARTER_ARTS = ['forge']

/**
 * 境界段序号：练气 1 / 筑基 2 / 金丹 3。
 *
 * 配方的 `tier` 是**境界段**（§11.2）：tier 1 的配方练气段就能做、tier 2 要筑基、
 * tier 3 要金丹。**不是**「物品阶」——产物阶 = `tier + 1`（桂冈个人产高一阶）。
 */
export const REALM_TIER_INDEX = { qi: 1, foundation: 2, core: 3 }

/** 配方在当前境界段能不能做（配方阶 ≤ 当前段） */
export const recipeAvailableAtOf = (recipe, realmTier = 'qi') =>
  !!recipe && Number(recipe.tier) <= (REALM_TIER_INDEX[realmTier] || 1)

/** 境界段名（给「筑基后开放」之类的提示用） */
export const RECIPE_REALM_LABELS = { 1: '练气', 2: '筑基', 3: '金丹' }

/** 配方要求的境界段文案 */
export const recipeRealmLabelOf = recipe => RECIPE_REALM_LABELS[Number(recipe?.tier)] || '练气'

// ======================= 消耗品效果（B11-a2 写数值位，a3 生效） =======================
//
// 真正的消耗口在 `runSegment` 的层循环开头（B11-a3，见 `plugins/secretRealm.js`
// 的 `applyConsumableEffectsOf`）。这里负责把「回春丹 → 每 5 层气血 +15%」这层意思
// 写进物品，UI 与战斗都读它。
//
// ⚠ **`health` 是「生命上限」，不是「回血」**（2026-11-08 拍板）：
//   秘境每层开战前 `applyBuffIds` 都会把全队补满血，层间不继承血量
//   （B10 血量继承已降级 v1.5）——「回血 15%」加在满血队伍上是空效果。
//   所以改成 +maxHealth，和 roguelike buff「气血增加」同口径，立刻可见。

/** 生效范围：每层（符箓）/ 每 5 层（丹药）/ 整趟（阵法） */
export const EFFECT_SCOPES = {
  floor: '每层',
  segment: '每 5 层',
  run: '整趟'
}

/** 效果目标（`health` = 生命上限；老档的 `heal` 走同一档） */
export const EFFECT_STAT_LABELS = {
  attack: '攻击',
  defense: '防御',
  speed: '速度',
  health: '气血',
  /** 老档别名，2026-11-08 前存下的丹药带这个 type */
  heal: '气血',
  enemyAttack: '敌方攻击'
}

/**
 * 效果文案（唯一真源）：
 *   正向   →「每 5 层攻击 +10%」/「每 5 层气血 +15%」
 *   负向   →「整趟敌方攻击 −10%」（用 U+2212 减号，跟 UI 一致）
 */
export const effectTextOf = (effect = {}) => {
  const type = effect?.type
  // 凡俗 / 灵器配方没有 effect —— 返回空串，别显示「+0%」
  if (!type) return ''
  const scope = EFFECT_SCOPES[effect?.scope] || ''
  const stat = EFFECT_STAT_LABELS[type] || ''
  const value = Number(effect?.value) || 0
  const pct = Math.round(Math.abs(value) * 1000) / 10
  const sign = value < 0 ? '−' : '+'
  return `${scope}${stat} ${sign}${pct}%`
}

// ======================= 秘境消耗品：分类与库存排序（B11-a3） =======================

/**
 * 三类消耗品（`runSegment` 的槽位名 → 物品 category）。
 * 槽位名刻意不用「丹药」当键：代码里一直是 ASCII 键，中文只出现在 UI。
 */
export const CONSUMABLE_KINDS = {
  potion: '丹药',
  talisman: '符箓',
  array: '阵法'
}

export const CONSUMABLE_KIND_LABELS = {
  potion: '丹药',
  talisman: '符箓',
  array: '阵法'
}

/** 物品 category → 槽位名；不是消耗品返回 null */
export const consumableKindOf = item => {
  const category = item?.category
  for (const [kind, label] of Object.entries(CONSUMABLE_KINDS)) {
    if (category === label) return kind
  }
  return null
}

// ⚠ 惰性建表：这段代码在 `RECIPES` 定义之前，直接 `new Map(RECIPES…)` 会撞 TDZ。
let RECIPE_INDEX = null
const recipeIndexOf = id => {
  if (!RECIPE_INDEX) RECIPE_INDEX = new Map(RECIPES.map((recipe, index) => [recipe.id, index]))
  return RECIPE_INDEX.has(id) ? RECIPE_INDEX.get(id) : Number.MAX_SAFE_INTEGER
}

/**
 * 库存排序（默认 = 高阶优先）。
 *
 * 规则：**阶降序 → 配方表顺序 → id**。
 * 玩家在整备页调过顺序的，`order` 里按位置优先；不在 `order` 里的（新做出来的配方）
 * 按默认序排在后面 —— 所以加新配方不会打乱玩家已排好的顺序。
 *
 * @param {Array} entries [{ itemId, baseId, name, tier, count, effect }]
 * @param {string[]} order  玩家保存的 baseId 顺序（可空）
 */
export const sortConsumableStock = (entries = [], order = []) => {
  const rank = new Map((order || []).map((id, index) => [id, index]))
  const defaultRank = entry => Number(entry?.tier) || 0
  return [...entries].sort((a, b) => {
    const ra = rank.has(a.baseId) ? rank.get(a.baseId) : Infinity
    const rb = rank.has(b.baseId) ? rank.get(b.baseId) : Infinity
    if (ra !== rb) return ra - rb
    if (defaultRank(a) !== defaultRank(b)) return defaultRank(b) - defaultRank(a)
    const ia = recipeIndexOf(a.baseId)
    const ib = recipeIndexOf(b.baseId)
    if (ia !== ib) return ia - ib
    return String(a.baseId).localeCompare(String(b.baseId))
  })
}

/**
 * 把「现存配方」和「存档顺序」合并成一份可直接展示的 id 序列表。
 * 存档里有但不存在的 id 丢掉；现存但存档没列的按默认规则插到末尾。
 */
export const normalizeConsumableOrder = (entries = [], order = []) => {
  const present = new Set(entries.map(entry => entry.baseId))
  const kept = (order || []).filter(id => present.has(id))
  const seen = new Set(kept)
  for (const entry of sortConsumableStock(entries, kept)) {
    if (!seen.has(entry.baseId)) {
      seen.add(entry.baseId)
      kept.push(entry.baseId)
    }
  }
  return kept
}

/** 调参集中在这里 */
export const TUNING = {
  /** 每轮 45 分钟（设计《日常循环》§2.1）。也是进度条的步长 */
  durationSeconds: 45 * 60,
  /** 体力按小时扣 */
  staminaPerHour: { alchemy: 5, talisman: 5, array: 6, forge: 6 },
  /**
   * 精力是**每个百艺每天扣一次**，不是每轮扣。
   * 设计场景 B（2 百艺）= 30 + 35 = 65/天；场景 C（4 百艺）= 130/天。
   */
  focusPerDay: { alchemy: 30, talisman: 30, array: 35, forge: 35 },
  /**
   * 熟练度四档（《模块七》§四）。门槛 = **桂冈亲手完成的次数**。
   *
   * `timeReduction` 缩短的是**所需总时长**，不是每轮收益 —— 45 分钟是日循环的
   * 最小步长，本轮没法再拆。所以 1 轮配方在宗师下仍是 1 轮，
   * 但 4 轮的高阶配方会变成 2 轮。TODO(数值真值表)
   */
  proficiency: [
    { key: 'shu', name: '熟练', threshold: 0, timeReduction: 0 },
    { key: 'jing', name: '精通', threshold: 30, timeReduction: 0.1 },
    { key: 'da', name: '大师', threshold: 100, timeReduction: 0.25 },
    { key: 'zong', name: '宗师', threshold: 300, timeReduction: 0.5 }
  ],
  /** 二阶及以上配方的残页数 = 5 × 阶（《模块七》§二） */
  fragmentsPerTier: 5
}

/** 开局功法。放在 `arts.manuals` 的工厂默认值里，老档经 deepMerge 同样获得 */
export const STARTER_MANUALS = [
  { id: 'xiao_forging_1', name: '萧氏炼器基础卷一', art: 'forge', tier: '1下' }
]

/** 熟练度档位对象（传完成次数） */
export const proficiencyOf = completions => {
  const n = Math.max(0, Math.floor(Number(completions) || 0))
  let rank = TUNING.proficiency[0]
  for (const item of TUNING.proficiency) if (n >= item.threshold) rank = item
  return rank
}

/** 熟练度档位下标（0 熟练 / 1 精通 / 2 大师 / 3 宗师） */
export const proficiencyIndex = completions =>
  TUNING.proficiency.findIndex(r => r.key === proficiencyOf(completions).key)

/** 学某条配方需要的残页数（凡俗与一阶 = 0） */
export const fragmentsNeededOf = recipe =>
  Number(recipe?.tier) >= 2 ? TUNING.fragmentsPerTier * Number(recipe.tier) : 0

/**
 * 残页在宝匣里挂在第几阶（宝匣最多 7 阶）。
 * 对齐功法残页的既有映射（`ART_FRAGMENT_ITEM_TIER`），别另编一套。
 */
export const RECIPE_FRAGMENT_CHEST_TIER = { 2: 3, 3: 5, 4: 6 }

export const recipeFragmentChestTierOf = recipe =>
  RECIPE_FRAGMENT_CHEST_TIER[Number(recipe?.tier) || 0] || 7

export const recipeFragmentNameOf = recipe => `${recipe?.name || ''}残页`

/** 还没学会、且需要残页的配方（宝匣 / 探索 / 秘境的残页池） */
export const unlearnedFragmentRecipesOf = (knownRecipes = []) => {
  const known = new Set(knownRecipes || [])
  return RECIPES.filter(recipe => fragmentsNeededOf(recipe) > 0 && !known.has(recipe.id))
}

/**
 * 随机抽一条「该掉残页的配方」。
 *
 * 优先在 `recipeFragmentChestTierOf(recipe) ≤ tierCap` 的范围里抽（宝匣阶门）；
 * 池子空了就退回全池，最后都没有（残页全学完）回 null —— 调用方把这条奖励丢掉。
 */
export const pickFragmentRecipeOf = ({ knownRecipes = [], rng = Math.random, tierCap = 7 } = {}) => {
  const all = unlearnedFragmentRecipesOf(knownRecipes)
  if (!all.length) return null
  const gated = all.filter(recipe => recipeFragmentChestTierOf(recipe) <= tierCap)
  const pool = gated.length ? gated : all
  return pool[Math.min(Math.floor(rng() * pool.length), pool.length - 1)]
}

/**
 * 炼器配方表。
 *
 * 凡俗（`output.kind: 'crafted'`）：沿用 v1 的三件金饰，产物仍是 `category: 'crafted'`。
 *   它们同时是家族工作「工坊匠人」的产出模板（`buildCraftedItem`），**别删 id**。
 *   阶位写 1（不是 0）：B2 的「杂物 tier 0 + 30 大子回收」是另一件事，本批不做，
 *   所以它们仍走灵石的回收口（2 灵石/件），不然就是静默的收益减少。
 * 灵器（`output.kind: '灵器'`）：`output.baseId` 指向物品池底材，桂冈亲手做产**同系列高一阶**灵器。
 *
 * ⚠ `inputs[].type` 对应物品池的 `type`（金属 / 宝晶 / 叶 / 藤 / 骨材 / 灵土…），
 *   不是 `category`。匹配规则见 `planMaterialsOf`。
 */
export const RECIPES = [
  // ---------- 凡俗（v1 的萧氏炼器基础，产物是 crafted） ----------
  {
    id: 'su_jin_ring',
    name: '素金戒指',
    art: 'forge',
    tier: 1,
    rounds: 1,
    skill: 0,
    inputs: [{ type: '金属', count: 2 }],
    output: { kind: 'crafted' },
    // 旧字段保留：`buildCraftedItem` 还按它生成凡俗产物
    slot: 'accessory',
    stats: { attack: 8 }
  },
  {
    id: 'jin_zan',
    name: '金簪',
    art: 'forge',
    tier: 1,
    rounds: 1,
    skill: 0,
    inputs: [{ type: '金属', count: 2 }],
    output: { kind: 'crafted' },
    slot: 'head',
    stats: { defense: 6, health: 60 }
  },
  {
    id: 'jin_chai',
    name: '金钗',
    art: 'forge',
    tier: 1,
    rounds: 1,
    skill: 0,
    inputs: [{ type: '金属', count: 2 }],
    output: { kind: 'crafted' },
    slot: 'head',
    stats: { defense: 4, health: 50, speed: 2 }
  },
  // ---------- 灵器（tier 1 = 练气段，个人产二阶） ----------
  {
    id: 'forge_huiguang',
    name: '辉光剑',
    art: 'forge',
    tier: 1,
    rounds: 1,
    skill: 0,
    inputs: [
      { type: '金属', count: 2 },
      { type: '宝晶', count: 1 }
    ],
    output: { kind: '灵器', baseId: 'huiguang_1' }
  },
  {
    id: 'forge_jinggang',
    name: '精钢刺',
    art: 'forge',
    tier: 1,
    rounds: 1,
    skill: 0,
    inputs: [
      { type: '金属', count: 2 },
      { type: '宝晶', count: 1 }
    ],
    output: { kind: '灵器', baseId: 'jinggang_ci' }
  },
  {
    id: 'forge_lingteng',
    name: '灵藤木盾',
    art: 'forge',
    tier: 1,
    rounds: 1,
    skill: 0,
    inputs: [
      { type: '金属', count: 1 },
      { type: '宝晶', count: 2 }
    ],
    output: { kind: '灵器', baseId: 'lingteng_shield' }
  },
  {
    id: 'forge_crown',
    name: '青玉冠',
    art: 'forge',
    tier: 1,
    rounds: 1,
    skill: 0,
    inputs: [
      { type: '金属', count: 1 },
      { type: '宝晶', count: 2 }
    ],
    output: { kind: '灵器', baseId: 'crown_qingyu' }
  },

  // ==================== 炼丹（B11-a2）====================
  // 料是灵植：草 / 花 / 树 / 果（果在物品池里是 `灵材`，匹配只看 `type`，见 planMaterialsOf）。
  // 练气段（tier 1）三条，个人产**二阶**丹药；筑基段（tier 2）两条要 10 张残页。
  {
    id: 'alchemy_huichun',
    name: '回春丹',
    art: 'alchemy',
    tier: 1,
    rounds: 1,
    skill: 0,
    inputs: [{ type: '草', count: 2 }],
    output: { kind: '丹药' },
    effect: { type: 'health', value: 0.15, scope: 'segment' },
    desc: '秘境中每跨过 5 层，全队气血 +15%。'
  },
  {
    id: 'alchemy_juqi',
    name: '聚气丹',
    art: 'alchemy',
    tier: 1,
    rounds: 1,
    skill: 0,
    inputs: [
      { type: '草', count: 2 },
      { type: '果', count: 1 }
    ],
    output: { kind: '丹药' },
    effect: { type: 'attack', value: 0.1, scope: 'segment' },
    desc: '秘境中每跨过 5 层，全队攻击 +10%。'
  },
  {
    id: 'alchemy_ningshen',
    name: '凝神丹',
    art: 'alchemy',
    tier: 1,
    rounds: 2,
    skill: 0,
    inputs: [
      { type: '花', count: 2 },
      { type: '树', count: 1 }
    ],
    output: { kind: '丹药' },
    effect: { type: 'defense', value: 0.1, scope: 'segment' },
    desc: '秘境中每跨过 5 层，全队防御 +10%。'
  },
  {
    id: 'alchemy_xuanyuan',
    name: '玄元丹',
    art: 'alchemy',
    tier: 2,
    rounds: 2,
    skill: 0,
    inputs: [
      { type: '草', count: 3 },
      { type: '花', count: 2 }
    ],
    output: { kind: '丹药' },
    effect: { type: 'attack', value: 0.2, scope: 'segment' },
    desc: '秘境中每跨过 5 层，全队攻击 +20%。'
  },
  {
    id: 'alchemy_yusui',
    name: '玉髓丹',
    art: 'alchemy',
    tier: 2,
    rounds: 3,
    skill: 0,
    inputs: [
      { type: '花', count: 3 },
      { type: '果', count: 2 }
    ],
    output: { kind: '丹药' },
    effect: { type: 'health', value: 0.25, scope: 'segment' },
    desc: '秘境中每跨过 5 层，全队气血 +25%。'
  },

  // ==================== 制符（B11-a2）====================
  // ⚠ 设计写的是「叶 + 藤 + 妖兽」，但**物品池里没有「妖兽材料」这个 type**
  //   （灵兽是灵宠，不是材料），所以本批只用叶 / 藤。加妖兽材料要动物品池，另批。
  {
    id: 'talisman_jifeng',
    name: '疾风符',
    art: 'talisman',
    tier: 1,
    rounds: 1,
    skill: 0,
    inputs: [{ type: '叶', count: 2 }],
    output: { kind: '符箓' },
    effect: { type: 'speed', value: 0.1, scope: 'floor' },
    desc: '秘境中每层全队速度 +10%。'
  },
  {
    id: 'talisman_jingang',
    name: '金刚符',
    art: 'talisman',
    tier: 1,
    rounds: 1,
    skill: 0,
    inputs: [
      { type: '叶', count: 1 },
      { type: '藤', count: 2 }
    ],
    output: { kind: '符箓' },
    effect: { type: 'defense', value: 0.15, scope: 'floor' },
    desc: '秘境中每层全队防御 +15%。'
  },
  {
    id: 'talisman_pofeng',
    name: '破锋符',
    art: 'talisman',
    tier: 1,
    rounds: 2,
    skill: 0,
    inputs: [
      { type: '叶', count: 2 },
      { type: '藤', count: 1 }
    ],
    output: { kind: '符箓' },
    effect: { type: 'attack', value: 0.15, scope: 'floor' },
    desc: '秘境中每层全队攻击 +15%。'
  },
  {
    id: 'talisman_shenxing',
    name: '神行符',
    art: 'talisman',
    tier: 2,
    rounds: 2,
    skill: 0,
    inputs: [
      { type: '叶', count: 3 },
      { type: '藤', count: 2 }
    ],
    output: { kind: '符箓' },
    effect: { type: 'speed', value: 0.2, scope: 'floor' },
    desc: '秘境中每层全队速度 +20%。'
  },
  {
    id: 'talisman_pojun',
    name: '破军符',
    art: 'talisman',
    tier: 2,
    rounds: 3,
    skill: 0,
    inputs: [
      { type: '叶', count: 2 },
      { type: '藤', count: 3 }
    ],
    output: { kind: '符箓' },
    effect: { type: 'attack', value: 0.25, scope: 'floor' },
    desc: '秘境中每层全队攻击 +25%。'
  },

  // ==================== 炼阵（B11-a2）====================
  // ⚠ **整表从筑基段起**（2026-11-07 拍板）：物品池的骨材最低就是二阶（9 件里一阶 0 件），
  //   而「料阶 ≤ 配方阶」在 tier 1 下配不出任何骨材 —— 练气段炼阵无料可用。
  //   所以炼阵没有一阶配方：练气期入口显示「筑基后开放」，二阶骨材在练气期就能囤。
  //   因此本艺所有配方的 `skill` 必须是 0 —— 熟练度只靠亲手制作涨，
  //   要求 >0 会让「没有一阶配方 → 做不了 → 永远达不到」变成死锁。
  {
    id: 'array_juling',
    name: '聚灵阵',
    art: 'array',
    tier: 2,
    rounds: 2,
    skill: 0,
    inputs: [
      { type: '灵土', count: 2 },
      { type: '骨材', count: 1 }
    ],
    output: { kind: '阵法' },
    effect: { type: 'attack', value: 0.1, scope: 'run' },
    desc: '整趟秘境全队攻击 +10%。'
  },
  {
    id: 'array_hushan',
    name: '护山阵',
    art: 'array',
    tier: 2,
    rounds: 2,
    skill: 0,
    inputs: [
      { type: '骨材', count: 2 },
      { type: '灵土', count: 1 }
    ],
    output: { kind: '阵法' },
    effect: { type: 'defense', value: 0.15, scope: 'run' },
    desc: '整趟秘境全队防御 +15%。'
  },
  {
    id: 'array_fuling',
    name: '缚灵阵',
    art: 'array',
    tier: 2,
    rounds: 3,
    skill: 0,
    inputs: [
      { type: '骨材', count: 2 },
      { type: '灵土', count: 2 }
    ],
    output: { kind: '阵法' },
    effect: { type: 'enemyAttack', value: -0.1, scope: 'run' },
    desc: '整趟秘境敌方攻击 −10%。'
  }
]

export const recipeById = id => RECIPES.find(r => r.id === id) || null

/** 开局就认得的配方：萧氏基础卷的凡俗三件 + 练气段四条灵器 */
export const STARTER_RECIPE_IDS = RECIPES.filter(
  recipe => recipe.art === 'forge' && Number(recipe.tier) <= 1
).map(recipe => recipe.id)

/** 某艺的全部配方 */
export const recipesOfArt = art => RECIPES.filter(r => r.art === art)

/** 配方名 → id（老档没有 `baseId` 时靠名字回填） */
const RECIPE_ID_BY_NAME = new Map(RECIPES.map(r => [r.name, r.id]))

/**
 * 老档迁移（P62）：给 2026-11-01 之前产出的炼器产物补上 `category` / `baseId`。
 *
 * 旧 `buildCraftedItem` 不带这两个字段，于是读档合并堆时认不出它们。
 * 判据用 **id 前缀 `craft_`**（只有 `buildCraftedItem` 会生成）+ 配方名查表 ——
 * 不带前缀的（宝匣/探索掉的灵器）一律不碰，它们本来就有实例差异。
 *
 * @returns 新数组（无改动时元素原样返回）
 */
export const adoptLegacyCraftedItems = (list = []) =>
  (list || []).map(item => {
    if (!item || item.category) return item
    if (!String(item.id || '').startsWith('craft_')) return item
    const baseId = RECIPE_ID_BY_NAME.get(item.name)
    if (!baseId) return item
    return { ...item, baseId, category: 'crafted' }
  })

/** 这个任务名是不是百艺（用于 dayLoop 的切片与队列判断） */
export const isArtKind = kind => ARTS.includes(kind)

// ======================= 配方耗时与进度 =======================

/** 配方基础耗时（秒）= 轮数 × 45 分钟 */
export const recipeSecondsOf = recipe =>
  Math.max(1, Math.floor(Number(recipe?.rounds) || 1)) * TUNING.durationSeconds

/**
 * 完成所需的**有效进度秒数**。
 * 熟练度缩短的是所需总量（不是每轮收益），见 `TUNING.proficiency` 的注释。
 */
export const requiredSecondsOf = (recipe, completions = 0) =>
  recipeSecondsOf(recipe) * (1 - proficiencyOf(completions).timeReduction)

/**
 * 推进一轮：返回新进度与是否完成。
 * @param {number} progress 已累积的有效进度（秒）
 */
export const advanceProgress = (recipe, progress, roundSeconds, completions = 0) => {
  const next = Math.max(0, Number(progress) || 0) + Math.max(0, Number(roundSeconds) || 0)
  const need = requiredSecondsOf(recipe, completions)
  return { progress: Math.min(next, need), required: need, done: next >= need - 1e-6 }
}

// ======================= 扣料 =======================

/** 耗料的阶上限：凡俗按 1 阶算 */
export const materialTierCapOf = recipe => Math.max(1, Number(recipe?.tier) || 0)

/** 背包里能当百艺底材的条目（灵植 / 灵材的堆） */
const materialsOf = items =>
  (items || []).filter(
    item => item && (item.category === '灵材' || item.category === '灵植') && unitsOf(item) > 0
  )

/**
 * 为一条配方配平材料。
 *
 * 规则（B11-a1 拍板）：
 *   · 按底材 `type` 匹配（金属 / 宝晶 / 叶 / 藤 / 骨材 / 灵土…），不看 category；
 *   · **阶 ≤ 配方阶**（凡俗按 1 阶算）；
 *   · **先低阶后高阶**、同阶按 `baseId`、再按 `id` 排序 —— 结果确定，不吃好料。
 *
 * @returns {{ ok:boolean, plan:Array<{id:string,baseId:string,name:string,count:number}>,
 *            missing:Array<{type:string,need:number,have:number}> }}
 *   `plan` 按**条目 id** 聚合，可直接喂给 `stacks.planFromUnits` + `takeUnits`。
 */
export const planMaterialsOf = (recipe, items = [], { times = 1 } = {}) => {
  const cap = materialTierCapOf(recipe)
  const runs = Math.max(1, Math.floor(Number(times) || 1))
  const pool = materialsOf(items)
  const takenByEntry = new Map()
  const missing = []

  for (const input of recipe?.inputs || []) {
    const type = input?.type
    const total = Math.max(0, Math.floor(Number(input?.count) || 0)) * runs
    let need = total
    if (!type || total <= 0) continue

    const candidates = pool
      .filter(item => item.type === type && Number(item.tier) <= cap)
      .sort((a, b) => {
        const ta = Number(a.tier) || 0
        const tb = Number(b.tier) || 0
        if (ta !== tb) return ta - tb
        const ba = String(a.baseId || '')
        const bb = String(b.baseId || '')
        if (ba !== bb) return ba.localeCompare(bb)
        return String(a.id || '').localeCompare(String(b.id || ''))
      })

    for (const item of candidates) {
      if (need <= 0) break
      const already = takenByEntry.get(item) || 0
      const units = unitsOf(item) - already
      if (units <= 0) continue
      const take = Math.min(units, need)
      takenByEntry.set(item, already + take)
      need -= take
    }

    if (need > 0) {
      missing.push({ type, need: total, have: total - need })
    }
  }

  // `units` 是 `stacks.takeUnits` 的入参口径（不是 `count`）
  const plan = [...takenByEntry.entries()].map(([item, count]) => ({
    id: item.id,
    baseId: item.baseId || item.id,
    name: item.name || '',
    units: count
  }))

  return { ok: missing.length === 0, plan, missing }
}

/** 配方锁：当前配平会吃掉的品种（baseId）。药浴 / 回收 / 三换二共用这份锁。 */
export const lockedBaseIdsOf = (recipe, items = []) => {
  const { plan } = planMaterialsOf(recipe, items)
  return [...new Set(plan.map(entry => entry.baseId).filter(Boolean))]
}

/**
 * 背包里的料**够做几份**这条配方（B11-b 乡间自动用）。
 *
 * 与 `planMaterialsOf` 同一套匹配口径（按 `type`、阶 ≤ 配方阶），
 * 只是不排具体条目、只算总量：`min(floor(可用件数 / 每份需求))`。
 * 同类型出现多条 input 时先合并需求（当前配方没有这种写法，留作兜底）。
 *
 * @returns {number} 0 = 做不了
 */
export const craftableCountOf = (recipe, items = []) => {
  const cap = materialTierCapOf(recipe)
  const pool = materialsOf(items)
  const needByType = new Map()
  for (const input of recipe?.inputs || []) {
    const type = input?.type
    const count = Math.max(0, Math.floor(Number(input?.count) || 0))
    if (!type || count <= 0) continue
    needByType.set(type, (needByType.get(type) || 0) + count)
  }
  if (!needByType.size) return 0
  let runs = Infinity
  for (const [type, need] of needByType.entries()) {
    const have = pool
      .filter(item => item.type === type && Number(item.tier) <= cap)
      .reduce((sum, item) => sum + unitsOf(item), 0)
    runs = Math.min(runs, Math.floor(have / need))
  }
  return Number.isFinite(runs) ? Math.max(runs, 0) : 0
}

// ======================= 产物 =======================

/**
 * 同一系列、指定阶的底材；没有就原地升阶（名字不变，但阶与面板跟着变）。
 * @param {string} baseId 池内底材 id
 * @param {number} steps  升几阶（个人百艺 = 1）
 */
export const upgradedBaseOf = (baseId, steps = 1) => {
  const base = itemById(baseId)
  if (!base) return null
  const target = Math.min(5, Math.max(1, Number(base.tier) || 1) + Math.max(1, Number(steps) || 1))
  if (target === base.tier) return base
  // 优先找**同系列 + 同器型 + 目标阶**的条目 —— 名字会更好听（辉光剑 → 辉光镇魔剑）
  const sibling = itemsOfCategory('灵器').find(
    item => item.series === base.series && item.type === base.type && item.tier === target
  )
  return sibling || { ...base, tier: target }
}

/**
 * 生成一件**消耗品**（丹药 / 符箓 / 阵法，B11-a2）。
 *
 * 形状：
 *   · `baseId` = 配方 id（物品池里查不到，`normalizeStacks` 已放行）；
 *   · `tier`   = 配方阶 + 1（桂冈个人产**高一阶**，§11.2）；
 *   · 成色写死「中」、无词条 —— 同配方同阶两件逐字段相同，能合并（P62 的教训）；
 *   · `effect` 由秘境的层循环消费（B11-a3 已接上，见 `secretRealm.js` 的
 *     `settleConsumablesOf` / `applyConsumableEffectsOf`）。
 */
export const buildConsumableItem = (recipe, { seq = 1, tier: tierOverride = null } = {}) => {
  if (!recipe || !CONSUMABLE_CATEGORIES.includes(recipe.output?.kind)) return null
  const recipeTier = Math.max(1, Number(recipe.tier) || 1)
  // 桂冈个人产 tier + 1；乡间自动传 `tier: recipe.tier`（本段阶，B11-b）
  const base = Number.isFinite(Number(tierOverride)) && Number(tierOverride) > 0
    ? Math.floor(Number(tierOverride))
    : recipeTier + 1
  const tier = Math.min(5, Math.max(1, base))
  return {
    // id 只是条目标识（合并靠 `stackKeyOf`）——仍带上配方 id，避免同一毫秒里两艺撞号
    id: `art_${recipe.id}_${Date.now()}_${seq}`,
    baseId: recipe.id,
    category: recipe.output.kind,
    name: recipe.name,
    tier,
    quality: '中',
    count: 1,
    effect: { ...(recipe.effect || {}) },
    effectText: effectTextOf(recipe.effect),
    desc: recipe.desc || ''
  }
}

/**
 * 生成一件炼器产物。
 *
 * - 凡俗（`output.kind === 'crafted'`）：v1 形状，`category: 'crafted'`，可合并；
 * - 灵器：`category: '灵器'`，**升一阶**，不 roll 词条 + 打 `craftedClone` 标记，
 *   于是它既能穿、能回收，又能按 `baseId + 阶 + 成色` 合并（见 `plugins/stacks.js`）。
 *
 * @param {object} recipe  RECIPES 里的一条
 * @param {{ seq?:number, quality?:string, level?:number, rng?:Function }} options
 */
export const buildRecipeOutput = (recipe, { seq = 1, quality = '中', level = 1, rng } = {}) => {
  if (!recipe) return null
  if (CONSUMABLE_CATEGORIES.includes(recipe.output?.kind)) return buildConsumableItem(recipe, { seq })
  if (recipe.output?.kind === '灵器' && recipe.output.baseId) {
    const base = upgradedBaseOf(recipe.output.baseId, 1)
    if (!base) return null
    const instance = createItemInstance(base, { quality, rng, withTraits: false })
    if (!instance) return null
    return { ...instance, craftedClone: true }
  }
  return buildCraftedItem(recipe, { seq, quality, level })
}

/**
 * 乡间自动产物（B11-b，2026-11-08）：**同一配方的本段阶版本**。
 *
 * 与 `buildRecipeOutput` 的唯一差别是**不升阶** ——
 * 桂冈亲手做产 `recipe.tier + 1`，乡间自动产 `recipe.tier`（《模块七》§11.2）。
 * 两条产线的产物因此天然落在不同的堆叠键上（`stacks.stackKeyOf` 带 tier）。
 *
 * @param {object} recipe RECIPES 里的一条
 * @param {{ seq?:number }} options
 */
export const buildAutoRecipeOutput = (recipe, { seq = 1 } = {}) => {
  if (!recipe) return null
  if (CONSUMABLE_CATEGORIES.includes(recipe.output?.kind)) {
    return buildConsumableItem(recipe, { seq, tier: recipe.tier })
  }
  if (recipe.output?.kind === '灵器' && recipe.output.baseId) {
    const base = itemById(recipe.output.baseId)
    if (!base) return null
    const instance = createItemInstance(base, { quality: '中', withTraits: false })
    return instance ? { ...instance, craftedClone: true } : null
  }
  return buildCraftedItem(recipe, { seq })
}

/**
 * 生成一件**凡俗**炼器产物 —— 必须是 `Inventory.vue` 认识的形状。
 *
 * `qualityInfo` **不能缺**：Inventory 的装备列表与详情都是直接读
 * `equipment.qualityInfo.color`（没有可选链），缺了整页渲染会抛错。
 *
 * @param {object} recipe  RECIPES 里的一条
 * @param {{ seq?:number, quality?:string, level?:number }} options
 *   `seq` 用来保证同一次 stepDay 连续完成多轮时的 id 唯一。
 */
export const buildCraftedItem = (recipe, { seq = 1, quality = 'common', level = 1 } = {}) => {
  if (!recipe) return null
  const info = EQUIPMENT_QUALITIES[quality] || EQUIPMENT_QUALITIES.common
  return {
    // 字符串 id：Date.now() 可能在同一毫秒内被多次调用，必须加序号
    id: `craft_${Date.now()}_${seq}`,
    /**
     * P62：固定配方产物是**模板复制**（成色写死、无词条、无主副属性 roll），
     * 所以它能按 `baseId + 成色 + 等级` 合并成一条带 `count` 的堆。
     * 判定与合并键在 `plugins/stacks.js` 的 `isCraftedClone` / `stackKeyOf`。
     */
    baseId: recipe.id,
    category: 'crafted',
    name: recipe.name,
    type: recipe.slot,
    slot: recipe.slot,
    /**
     * 数值阶位（1~5）—— 老配方写的是 `'1下'` 这种「阶 + 成色」串（P53 #3），
     * 现在直接写数字。**0 是有效值**（B2 落地后会用到），不能用 `|| 1` 兜底。
     */
    tier: (() => {
      const found = String(recipe.tier ?? '1').match(/\d+/)
      return found ? Number(found[0]) : 1
    })(),
    quality,
    level,
    requiredRealm: level,
    stats: { ...(recipe.stats || {}) },
    equipType: recipe.slot,
    qualityInfo: info
  }
}

/**
 * 从「已学 + 属于本艺」的配方里随机抽一条（v1 行为，家族工作仍在用）。
 * @returns 配方对象或 null（没学任何配方）
 */
export const rollRecipe = (knownRecipes = [], art = 'forge', rng = Math.random) => {
  const known = new Set(knownRecipes || [])
  const pool = RECIPES.filter(r => r.art === art && known.has(r.id))
  if (!pool.length) return null
  return pool[Math.min(Math.floor(rng() * pool.length), pool.length - 1)]
}
