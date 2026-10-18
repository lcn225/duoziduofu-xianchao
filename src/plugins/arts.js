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
 * ⚠ `slot` 必须是 `Inventory.vue` 认识的 13 个槽位键之一，且 `type === slot`。
 *   没有「发簪」槽位，所以金簪/金钗都归到 `head`。
 * ⚠ `stats` 的键必须在 `attributes.js` 的 `artifactBonuses` 里，否则会被静默忽略。
 *   数值按 Gacha 同槽位的 base 区间取，TODO(数值真值表)。
 */
export const RECIPES = [
  {
    id: 'su_jin_ring',
    name: '素金戒指',
    art: 'forge',
    tier: '1下',
    slot: 'ring1',
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
    name: recipe.name,
    type: recipe.slot,
    slot: recipe.slot,
    quality,
    level,
    requiredRealm: level,
    stats: { ...(recipe.stats || {}) },
    equipType: recipe.slot,
    qualityInfo: info
  }
}
