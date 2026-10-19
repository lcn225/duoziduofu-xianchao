// 统一品阶 enum（《跨文档冲突审阅》§12）
//
//   不入品 → 一阶下品 → 一阶中品 → 一阶上品 → 二阶下品 → 二阶中品 → 二阶上品 → 三阶 → 四阶 → 五阶
//
// 同参最高四阶、灵地最高五阶，建筑 Lv.1-5 独立。
// 放在这里而不是 cultivationData.js，是为了让 realm.js（灵地品阶门槛）不必反向依赖数据文件。

export const TIER_RANK = {
  none: 0,
  '1下': 1, '1中': 2, '1上': 3,
  '2下': 4, '2中': 5, '2上': 6,
  '3': 7, '4': 8, '5': 9
}

export const TIER_NAMES = {
  none: '不入品',
  '1下': '一阶下品', '1中': '一阶中品', '1上': '一阶上品',
  '2下': '二阶下品', '2中': '二阶中品', '2上': '二阶上品',
  '3': '三阶', '4': '四阶', '5': '五阶'
}

// ⚠ 2026-10-18：`FATE_ITEM_TIER_COEFF`（同参/本命品阶系数）已整表删除。
//   同参契合改为**六档亲和度**（正主 1.0 / 准正主 0.8 / 同系列 0.6 / 近类型 0.4 /
//   同类型 0.25 / 无关 0.1），真源在 harmony.js 的 `TUNING.fateItem.affinity`。
//   品阶现在只用于展示与灵地硬门槛，**不再参与契合度计算**。

/**
 * 灵地基础产出（《灵气系统》§3.2）。
 *
 * 灵地**等级只管产出，不进契合度** —— 契合度只看属性匹配百分比。
 * 旧版那张「灵地等级系数表」(0.5~1.5) 已废弃，不要重新引入。
 */
export const LAND_OUTPUT = {
  '1下': 1.0, '1中': 1.5, '1上': 2.0,
  '2下': 3.0, '2中': 4.0, '2上': 5.0,
  '3': 7.0, '4': 10.0, '5': 15.0
}

export const tierName = tier => TIER_NAMES[tier] || tier

// ---------------------------------------------------------------------------
// 物品 20 品阶（P17 第 2 步，2026-10-19）
//
// 真源：《数据定案》§七 —— 物品 = 5 基阶 × 下/中/上/极 = 20 品阶，
//      另加「不入品」白板；物品侧共 21 个显示档。
//
// ⚠ **宝箱的 7 阶是宝匣阶级，不是物品基阶**。6/7 阶宝匣只出五阶极 + 特殊道具，
//   不新增物品基阶。
// ⚠ **灵地只有 5 阶**（一/二/三/四/五阶，不分下中上）。上面的 TIER_RANK /
//   LAND_OUTPUT 仍是**旧灵地表**，等 P17 第 3 步反推 K 时一起改；不要拿
//   ITEM_TIER_* 去当灵地品阶用。
// ---------------------------------------------------------------------------

/** 物品成色（从低到高） */
export const ITEM_QUALITIES = ['下', '中', '上', '极']

/** 物品基阶 1~5 */
export const ITEM_BASE_TIERS = [1, 2, 3, 4, 5]

/** 21 个显示档：不入品 + 5 基阶 × 4 成色 */
export const ITEM_TIER_KEYS = [
  'none',
  ...ITEM_BASE_TIERS.flatMap(tier => ITEM_QUALITIES.map(quality => `${tier}${quality}`))
]

const QUALITY_LABEL = { 下: '下品', 中: '中品', 上: '上品', 极: '极品' }
const TIER_LABEL = { 1: '一阶', 2: '二阶', 3: '三阶', 4: '四阶', 5: '五阶' }

/** 20 品阶的显示名：`{1:'一阶',(...)}` */
export const ITEM_TIER_NAMES = Object.fromEntries(
  ITEM_TIER_KEYS.map(key => {
    if (key === 'none') return [key, '不入品']
    const tier = Number(key[0])
    const quality = key.slice(1)
    return [key, `${TIER_LABEL[tier]}${QUALITY_LABEL[quality] || '下品'}`]
  })
)

/** 排序权重：不入品 0，一阶下品 1 … 五阶极品 20 */
export const ITEM_TIER_RANK = Object.fromEntries(
  ITEM_TIER_KEYS.map((key, index) => [key, index])
)

/**
 * 基阶 + 成色 → 品阶键。成色为空/`none` → `none`（不入品）。
 * `itemTierKey(1, '中') === '1中'`
 */
export const itemTierKey = (tier, quality = '中') => {
  const t = Math.floor(Number(tier) || 0)
  if (quality === 'none' || t < 1) return 'none'
  if (t > 5) return '5极'
  return `${t}${ITEM_QUALITIES.includes(quality) ? quality : '中'}`
}

/** 品阶键 → { tier, quality }；`none` 返回 { tier: 0, quality: 'none' } */
export const splitItemTier = key => {
  if (!key || key === 'none') return { tier: 0, quality: 'none' }
  return { tier: Number(key[0]) || 0, quality: key.slice(1) || '中' }
}

export const itemTierName = key => ITEM_TIER_NAMES[key] || key

/** 物品品阶是否达到 min 及以上（min 为空 = 无要求） */
export const isItemTierAtLeast = (tier, min) => {
  if (min === undefined || min === null) return true
  const a = ITEM_TIER_RANK[tier]
  const b = ITEM_TIER_RANK[min]
  if (b === undefined) return true
  if (a === undefined) return false
  return a >= b
}

/** 灵地等级的基础产出（未知品阶回落到最低档，避免读脏数据时速度归零） */
export const landOutputOf = tier => LAND_OUTPUT[tier] ?? LAND_OUTPUT['1下']

/**
 * tier 是否达到 min 及以上。用于灵地品阶硬门槛。
 * min 为空 = 无要求，一律通过。
 */
export const isTierAtLeast = (tier, min) => {
  if (min === undefined || min === null) return true
  const a = TIER_RANK[tier]
  const b = TIER_RANK[min]
  if (b === undefined) return true
  if (a === undefined) return false
  return a >= b
}
