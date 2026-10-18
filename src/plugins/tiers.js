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
