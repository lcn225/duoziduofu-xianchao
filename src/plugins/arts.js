// 【百艺】—— 数值、配方与炼器产物的纯函数层（模块七）
//
// v1 只开放**炼器**一艺：小循环里 45 分钟/轮，体力 −6/时、精力 −35/天，
// 每轮随机产出一件金系一阶装备。其余三艺只留数据位，不产生行为。
//
// ⚠ 所有数值都是占位，标 `TODO(数值真值表)`。
// ⚠ 功法/配方**绝不能放进 inventory.items**：那里任何带 type 的条目都会被
//   `batchSellEquipments` 当成 1 灵石装备卖掉。它们住在 `arts.manuals`。
//
// 带 .js 后缀是刻意的：本文件会被 verify 脚本用 node 直接加载。

import { EQUIPMENT_QUALITIES } from './equipment.js'

/** 四艺。顺序也用作 UI 展示顺序 */
export const ARTS = ['alchemy', 'talisman', 'array', 'forge']

/** 中文字典（流水账、主界面勾选、日程都用它，别在视图里另写一份） */
export const ART_LABELS = {
  alchemy: '炼丹',
  talisman: '炼符',
  array: '炼阵',
  forge: '炼器'
}

/** 调参集中在这里 */
export const TUNING = {
  /** 每轮 45 分钟（设计《日常循环》§2.1） */
  durationSeconds: 45 * 60,
  /** 体力按小时扣 */
  staminaPerHour: { alchemy: 5, talisman: 5, array: 6, forge: 6 },
  /**
   * 精力是**每个百艺每天扣一次**，不是每轮扣。
   * 设计场景 B（2 百艺）= 30 + 35 = 65/天；场景 C（4 百艺）= 130/天。
   */
  focusPerDay: { alchemy: 30, talisman: 30, array: 35, forge: 35 }
}

/** 开局功法。放在 `arts.manuals` 的工厂默认值里，老档经 deepMerge 同样获得 */
export const STARTER_MANUALS = [
  { id: 'xiao_forging_1', name: '萧氏炼器基础卷一', art: 'forge', tier: '1下' }
]

/**
 * 金系一阶的三条基础配方（原著《萧氏炼器基础卷一》）。
 *
 * ⚠ `slot` 必须是 5 个装备槽键之一（P36 起：weapon/body/head/accessory/artifact），
 *   且 `type === slot`。没有「发簪」槽位，所以金簪/金钗都归到 `head`；
 *   素金戒指是饰品，归 `accessory`（旧键 `ring1` 已废）。
 * ⚠ `stats` 的键必须在 `attributes.js` 的 `artifactBonuses` 里，否则会被静默忽略。
 *   数值按旧抽奖页同槽位的 base 区间取，TODO(数值真值表)。
 */
export const RECIPES = [
  {
    id: 'su_jin_ring',
    name: '素金戒指',
    art: 'forge',
    tier: '1下',
    slot: 'accessory',
    stats: { attack: 8 }
  },
  {
    id: 'jin_zan',
    name: '金簪',
    art: 'forge',
    tier: '1下',
    slot: 'head',
    stats: { defense: 6, health: 60 }
  },
  {
    id: 'jin_chai',
    name: '金钗',
    art: 'forge',
    tier: '1下',
    slot: 'head',
    stats: { defense: 4, health: 50, speed: 2 }
  }
]

export const recipeById = id => RECIPES.find(r => r.id === id) || null

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

/**
 * 从「已学 + 属于本艺」的配方里**随机**抽一条。
 * 用户 2026-10-18 拍板：每轮随机，不轮转。
 * @returns 配方对象或 null（没学任何配方）
 */
export const rollRecipe = (knownRecipes = [], art = 'forge', rng = Math.random) => {
  const known = new Set(knownRecipes || [])
  const pool = RECIPES.filter(r => r.art === art && known.has(r.id))
  if (!pool.length) return null
  return pool[Math.min(Math.floor(rng() * pool.length), pool.length - 1)]
}

/**
 * 生成一件炼器产物 —— 必须是 `Inventory.vue` 认识的装备形状。
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
     * 数值阶位（1~5）—— 配方表里写的是 `'1下'` 这种「阶 + 成色」串（P53 #3）。
     * 背包 / 子嗣装备都按 `item.tier` 数值展示，所以这里只取首位数字，
     * 与宝匣/探索产物（`items.js` 的 `tier: base.tier`）保持同一口径。
     */
    tier: Number(String(recipe.tier ?? '1').match(/\d/)?.[0]) || 1,
    quality,
    level,
    requiredRealm: level,
    stats: { ...(recipe.stats || {}) },
    equipType: recipe.slot,
    qualityInfo: info
  }
}
