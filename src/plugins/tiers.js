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
//   2026-10-28（B7）：六档亲和度也删了 —— 同参契合改为**三层标签重合度**，
//   真源在 `tagHarmony.js`。品阶只用于展示与灵地硬门槛，**不参与契合度计算**。

/** 灵地品阶（5 阶，不分下/中/上，也不分「极」）——《数据定案》§七 */
export const LAND_TIER_RANK = { '1': 1, '2': 2, '3': 3, '4': 4, '5': 5 }

export const LAND_TIER_NAMES = {
  '1': '一阶灵地', '2': '二阶灵地', '3': '三阶灵地', '4': '四阶灵地', '5': '五阶灵地'
}

/**
 * 灵地基础产出（**名义值**，《数值真值表》§1.4：20 / 50 / 80 / 110 / 140）。
 *
 * 灵地**等级只管产出，不进契合度** —— 契合度只看属性匹配百分比。
 * 旧版 9 档系数表（1.0~15.0，`1下`~`5`）已于 2026-11-01 P56-b 删除，不要重新引入。
 *
 * ⚠ **名义值不是代码里的灵力系数**。速度公式读的是 `landOutputOf`，
 *   它把名义值乘 `LAND_OUTPUT_COEF`（= 0.075）折成「灵力/游戏小时」的系数：
 *   一阶 20 × 0.075 = **1.5**，与 P56-b 之前快子峰的 1.5 完全相等 ——
 *   练气期节奏一格不动。为什么不是每阶都按旧值对齐：旧 9 档表本身就是另一条曲线
 *   （三阶 7.0 / 四阶 10.0 / 五阶 15.0），改成 5 阶等比后高阶产出会**下降**
 *   （三阶 6.0 / 四阶 8.25 / 五阶 10.5），这是设计表的比值带来的，已登记进产出登记表。
 *
 *   换算系数的来历：设计表 §2.5 的「灵力/秒」是**不含门控补偿 9.6、不含打坐转化率 k**
 *   的口径；代码的 `spiritPerGameHour` 已含 9.6。两侧在练气一层对齐到同一现实节奏
 *   （约 60 秒），比值就是 1.5 / 20。**改这个系数等于改全游戏修炼速度**。
 */
export const LAND_OUTPUT = {
  '1': 20, '2': 50, '3': 80, '4': 110, '5': 140
}

/** 名义产出 → 灵力/游戏小时系数。**改它等于改全游戏修炼速度**，见上方注释 */
export const LAND_OUTPUT_COEF = 0.075

/** 灵地名义产出（UI 展示用，单位是《数值真值表》§1.4 的「基础产出」） */
export const landNominalOutputOf = tier => LAND_OUTPUT[tier] ?? LAND_OUTPUT['1']

export const tierName = tier => TIER_NAMES[tier] || tier

// ---------------------------------------------------------------------------
// 物品 20 品阶（P17 第 2 步，2026-10-19）
//
// 真源：《数据定案》§七 —— 物品 = 5 基阶 × 下/中/上/极 = 20 品阶，
//      另加「不入品」白板；物品侧共 21 个显示档。
//
// ⚠ **宝箱的 7 阶是宝匣阶级，不是物品基阶**。6/7 阶宝匣只出五阶极 + 特殊道具，
//   不新增物品基阶。
// ⚠ **灵地只有 5 阶**（一/二/三/四/五阶，不分下中上）。2026-11-01 P56-b 起
//   灵地用 `LAND_TIER_RANK` / `LAND_OUTPUT`（键是 `'1'`~`'5'`），物品用
//   `TIER_RANK` / `ITEM_TIER_NAMES`（键是 `'1下'`~`'5'`）—— **两张表不通用**，
//   不要拿 `TIER_RANK` 去当灵地品阶用。
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

/** 灵地等级的基础产出**系数**（未知品阶回落到最低档，避免读脏数据时速度归零） */
export const landOutputOf = tier => landNominalOutputOf(tier) * LAND_OUTPUT_COEF

/**
 * 灵地 tier 是否达到 min 及以上。用于灵地品阶硬门槛。
 * min 为空 = 无要求，一律通过。
 *
 * ⚠ 走的是 `LAND_TIER_RANK`（`'1'`~`'5'`），**不是**物品的 `TIER_RANK`（`'1下'`~`'5'`）。
 *   2026-11-01 P56-b 起两张表分开 —— 物品仍是 20 品阶，灵地只有 5 阶。
 *   物品侧用 `isItemTierAtLeast`。
 */
export const isTierAtLeast = (tier, min) => {
  if (min === undefined || min === null) return true
  const a = LAND_TIER_RANK[tier]
  const b = LAND_TIER_RANK[min]
  if (b === undefined) return true
  if (a === undefined) return false
  return a >= b
}

/** 灵地品阶显示名（`'1'` → `'一阶灵地'`） */
export const landTierName = tier => LAND_TIER_NAMES[tier] || tier
