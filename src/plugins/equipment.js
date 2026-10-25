// 装备强化和洗练相关配置
//
// 2026-10-23（P36 第 1 步）：槽位从 13 个收敛到 **5 个**（武器 / 防具 / 头饰 / 饰品 / 法宝），
// 面板从「白板 × 成色」改成「白板 + 主属性 + 副属性 + 词条」。
// 真源：《[装备系统](../../design/20-系统设计/装备系统.md)》§三~§六、§5.3、§5.4；
// 词条：《[装备词条表](../../design/30-数据与决议/装备词条表.md)》（代码副本在 `equipmentTraits.js`）。
//
// ⚠ 词条数值是**乘区**，只乘这一件装备自己的白板 + 主副属性，不是乘角色总面板。
// ⚠ 旧 13 槽存档的迁移在 `stores/modules/attributes.js`（`equipVersion: 2`）。

import { applyTraits, rollTraits, round1 } from './equipmentTraits.js'

/**
 * 装备品质表（**唯一真源**）。
 *
 * 原本只写在已删除的抽奖页里；P12.4 的炼器也要产出装备、并且以后要按
 * 炼器等级调整掉落品质，所以挪到这里共用。P17 起抽奖池作废，装备来源改为
 * 炼器 + 宝箱（宝箱未落地）。
 * `statMod` / `maxStatMod` 是生成装备时的属性倍率。
 */
export const EQUIPMENT_QUALITIES = {
  common: { name: '凡品', color: '#9e9e9e', statMod: 1.0, maxStatMod: 1.5 },
  uncommon: { name: '下品', color: '#4caf50', statMod: 1.2, maxStatMod: 2.0 },
  rare: { name: '中品', color: '#2196f3', statMod: 1.5, maxStatMod: 2.5 },
  epic: { name: '上品', color: '#9c27b0', statMod: 2.0, maxStatMod: 3.0 },
  legendary: { name: '极品', color: '#ff9800', statMod: 2.5, maxStatMod: 3.5 },
  mythic: { name: '仙品', color: '#e91e63', statMod: 3.0, maxStatMod: 4.0 }
}

/**
 * 宝匣/探索的**中文成色**（下/中/上/极）→ 装备系统的品质键。
 *
 * 装备侧沿用了开源项目的六档英文键（common…mythic），物品池侧是
 * 5 基阶 × 下/中/上/极（P17）。两边必须在一个地方对齐，否则宝匣开出的
 * 灵器在装备页会被品质筛选漏掉。
 */
export const CHEST_QUALITY_TO_EQUIP_KEY = {
  下: 'common',
  中: 'rare',
  上: 'epic',
  极: 'legendary'
}

export const equipQualityKeyOf = quality => CHEST_QUALITY_TO_EQUIP_KEY[quality] || 'common'

/**
 * 5 个装备槽（**唯一口径**，2026-10-23 P36）。
 *
 * 被砍掉的 8 槽（裤子/鞋子/肩甲/手套/护腕/项链/戒指2/腰带）UI 不再显示、
 * 不接受新装备；老档里穿着的按 `equipVersion: 2` 卸回背包。
 */
export const EQUIP_SLOT_KEYS = ['weapon', 'body', 'head', 'accessory', 'artifact']

/** 槽位键 → 中文名（装备页、成就、词条表共用一份） */
export const EQUIP_SLOT_NAME = {
  weapon: '武器',
  body: '防具',
  head: '头饰',
  accessory: '饰品',
  artifact: '法宝'
}

/**
 * 灵器 `type`（中文：飞剑/袍/牌…）→ 5 个装备槽。
 *
 * 物品池只给 `type`，没有部位字段。映射按《装备系统》§三的「槽 × 纳入 type」：
 * 武器 = 兵器类，防具 = 袍/甲/盾，头饰 = 冠/簪，
 * 饰品 = 牌/环/印/戒/铃/镜/珠/项链，法宝 = 其余法器/挂件。
 * 未来给池子加新器型时，先在这里补一行（未映射的默认进法宝）。
 */
export const EQUIP_SLOT_BY_ITEM_TYPE = {
  飞剑: 'weapon',
  剑: 'weapon',
  刺: 'weapon',
  匕: 'weapon',
  刀: 'weapon',
  矛: 'weapon',
  枪: 'weapon',
  戈: 'weapon',
  棍: 'weapon',
  杖: 'weapon',
  锤: 'weapon',
  鞭: 'weapon',
  弓: 'weapon',
  弩: 'weapon',
  镖: 'weapon',
  轮: 'weapon',
  斧: 'weapon',
  钩: 'weapon',
  叉: 'weapon',
  袍: 'body',
  甲: 'body',
  盾: 'body',
  冠: 'head',
  簪: 'head',
  戒: 'accessory',
  环: 'accessory',
  珠: 'accessory',
  项链: 'accessory',
  牌: 'accessory',
  印: 'accessory',
  铃: 'accessory',
  镜: 'accessory',
  幡: 'artifact',
  旗: 'artifact',
  符: 'artifact',
  袋: 'artifact',
  网: 'artifact',
  索: 'artifact',
  伞: 'artifact',
  舟: 'artifact',
  塔: 'artifact',
  琴: 'artifact',
  笛: 'artifact',
  笔: 'artifact',
  砚: 'artifact',
  丹炉: 'artifact',
  器: 'artifact',
  梭: 'artifact',
  盘: 'artifact',
  钹: 'artifact',
  简: 'artifact'
}

/** 未知灵器类型一律归「法宝」，不要返回空槽位 */
export const equipSlotOfType = type => EQUIP_SLOT_BY_ITEM_TYPE[type] || 'artifact'

/** 旧 13 槽键 → 新 5 槽键（老档迁移用；设计只保留 ring1→饰品，其余卸下） */
export const LEGACY_SLOT_TO_SLOT = {
  weapon: 'weapon',
  body: 'body',
  head: 'head',
  artifact: 'artifact',
  ring1: 'accessory'
}

/**
 * 部位白板（《装备系统》§四；**2026-10-25 P42 从线性改成几何 ×3/阶**）。
 *
 * 旧口径是 `基值 × 阶`（武器攻 5/10/15/20/25）。问题是装备面板**平加**，
 * 子嗣本体却按境界系数涨：练气九层换 T2 武器只多 15% 伤害，越到后期越低，
 * 玩家反馈「没有换了高阶脱胎换骨的感觉」。
 *
 * 现在每阶乘 **×3**（武器攻 5/15/45/135/405），T1 基值与主属性/词条不动。
 * 系数由 `sim:realm` 反推：每一档在自己境界约 +20~25% 伤害 ≈ 多通 50 层。
 * 低境界拿不到高阶（`offspringEquipment.SEGMENT_MAX_TIER` 把练气锁在 T1/T2），
 * 所以 T3~T5 的巨大白板只会在筑基/结丹段生效，不会破坏前期。
 */
export const WHITE_BOARD_GROWTH = 3

/** T1 基值（与旧表、与《装备系统》§四的 T1 列完全一致） */
const SLOT_WHITE_BOARD_T1 = {
  weapon: { attack: 5 },
  body: { defense: 4, health: 30 },
  head: { defense: 3, health: 20 },
  accessory: { attack: 4 },
  artifact: { attack: 3, defense: 2 }
}

/**
 * 某槽某阶的白板（纯函数，断言与详情页都能读）。
 * `tier` 1~5：`T1 基值 × WHITE_BOARD_GROWTH^(tier−1)`，保留一位小数。
 */
export const whiteBoardOf = (slotKey, tier = 1) => {
  const base = SLOT_WHITE_BOARD_T1[slotKey] || SLOT_WHITE_BOARD_T1.artifact
  const t = Math.min(Math.max(Math.floor(Number(tier) || 1), 1), 5)
  const factor = WHITE_BOARD_GROWTH ** (t - 1)
  const out = {}
  for (const [key, value] of Object.entries(base)) out[key] = round1(value * factor)
  return out
}

/** 主属性单条基础值（T1~T5）；双主属性各取 60% */
const MAIN_STAT_BASE = [8, 13, 21, 33, 53]
const DUAL_MAIN_RATIO = 0.6
const MAIN_JITTER = 0.3 // ±15% = 0.85 ~ 1.15

/** 副属性基础值（《装备系统》§5.2，速度单列压低） */
const SUB_STAT_BASE = {
  health: [2, 4, 6, 9, 15],
  defense: [2, 4, 6, 9, 15],
  speed: [1, 1.5, 2, 2.5, 3]
}

const WEAPON_TYPES = new Set(
  Object.keys(EQUIP_SLOT_BY_ITEM_TYPE).filter(type => EQUIP_SLOT_BY_ITEM_TYPE[type] === 'weapon')
)
const ACCESSORY_CHOOSE_TYPES = new Set(['戒', '环', '珠'])
const ARTIFACT_ATTACK_TYPES = new Set(['幡', '旗', '符'])
const ARTIFACT_CHOOSE_TYPES = new Set(['琴', '笛', '笔', '砚'])

/**
 * 按 type 决定「主属性是哪条、副属性是哪条」（《装备系统》§5.3）。
 *
 * `choose: true` 的二选一也吃同一个 seed —— 同 series 同 tier 永远同一套。
 */
const allocationOf = type => {
  if (WEAPON_TYPES.has(type)) return { main: ['attack'], sub: 'speed' }
  if (type === '袍' || type === '甲' || type === '盾') {
    return { main: ['defense', 'health'], dual: true, sub: 'health' }
  }
  if (type === '冠' || type === '簪') return { main: ['health'], sub: 'defense' }
  if (ACCESSORY_CHOOSE_TYPES.has(type)) {
    return { main: ['attack', 'defense'], choose: true, sub: ['speed', 'health'], chooseSub: true }
  }
  if (type === '牌' || type === '印' || type === '镜' || type === '铃') {
    return { main: ['defense'], sub: 'speed' }
  }
  if (ARTIFACT_ATTACK_TYPES.has(type)) return { main: ['attack'], sub: 'defense' }
  if (ARTIFACT_CHOOSE_TYPES.has(type)) {
    return { main: ['attack', 'health'], choose: true, sub: 'defense' }
  }
  // 袋/网/索/伞/舟/塔/丹炉/器/梭/盘/钹/简 + 未知类型 → 生命主
  return { main: ['health'], sub: 'defense' }
}

/** FNV-1a → [0, 1)：主属性浮动与二选一的稳定随机源 */
const seededFloat01 = seed => {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967296
}

/** 英文品质键 → 中文成色（兼容老调用方；'none' 与凡品都按「下」= 0 词条） */
const QUALITY_BY_KEY = {
  common: '下',
  uncommon: '下',
  rare: '中',
  epic: '上',
  legendary: '极',
  mythic: '极',
  none: '下'
}
const normalizeQuality = quality => QUALITY_BY_KEY[quality] || (TRAIT_QUALITY_SET.has(quality) ? quality : '中')
const TRAIT_QUALITY_SET = new Set(['下', '中', '上', '极'])

/**
 * 生成一件灵器的完整面板（P36 第 1 步的核心）。
 *
 * 公式（《装备系统》§四 / §五 / §六）：
 *   白板 = 部位基值 × 基阶
 *   主属性 = 基础值(阶) × (±15%，seed = hash(series + tier))      ← 确定性
 *   副属性 = §5.2 表
 *   词条   = 按成色条数 roll，乘区乘在「白板 + 主副属性」上        ← 随机
 *
 * @param {object} input
 * @param {string} input.slot    槽位键（5 槽；传旧键或缺失时按 type 推导）
 * @param {string} input.type    灵器 type（中文）
 * @param {number} input.tier    基阶 1~5
 * @param {string} input.quality 成色：下/中/上/极（也接受旧英文键）
 * @param {string} input.series  同系列标签（主属性种子）
 * @param {Function} input.rng   词条随机源
 * @returns {{ slot:string, stats:object, traits:Array, mainStats:object, subStats:object, whiteBoard:object }}
 */
export const generateEquipment = ({
  slot,
  type,
  tier = 1,
  quality = '中',
  series = '',
  rng = Math.random
} = {}) => {
  const slotKey = EQUIP_SLOT_KEYS.includes(slot) ? slot : equipSlotOfType(type)
  const tierNum = Math.min(Math.max(Math.floor(Number(tier) || 1), 1), 5)
  const q = normalizeQuality(quality)
  const whiteBoard = whiteBoardOf(slotKey, tierNum)
  const mainStats = {}
  const subStats = {}

  const alloc = allocationOf(type)
  const seed = seededFloat01(`${series || type || ''},${tierNum}`)
  const jitter = 1 - MAIN_JITTER / 2 + MAIN_JITTER * seed
  const mainBase = MAIN_STAT_BASE[tierNum - 1]

  let mainKeys = alloc.main
  if (alloc.choose) {
    // 攻击 或 防御 / 攻击 或 生命：同一个 seed，稳定二选一
    mainKeys = [alloc.main[seed < 0.5 ? 0 : 1]]
  }
  for (const key of mainKeys) {
    const raw = mainBase * (alloc.dual ? DUAL_MAIN_RATIO : 1) * jitter
    mainStats[key] = round1(raw)
  }

  let subKey = alloc.sub
  if (Array.isArray(subKey)) subKey = subKey[seed < 0.5 ? 0 : 1]
  const subRange = SUB_STAT_BASE[subKey] || SUB_STAT_BASE.defense
  subStats[subKey] = subRange[tierNum - 1]

  // 白板 + 主属性 + 副属性（词条的乘区加在它上面）
  const flat = { ...whiteBoard }
  for (const bucket of [mainStats, subStats]) {
    for (const [key, value] of Object.entries(bucket)) flat[key] = round1((flat[key] || 0) + value)
  }

  const traits = rollTraits({ slotKey, tier: tierNum, quality: q, rng })
  const stats = applyTraits(flat, traits)

  return { slot: slotKey, stats, traits, mainStats, subStats, whiteBoard }
}

/**
 * 兼容旧调用方的薄包装：只要面板数值。
 * **新代码用 `generateEquipment`** —— 词条和主/副属性也要一起存进实例。
 */
export const generateEquipmentStats = (slot, tier = 1, quality = '中', options = {}) =>
  generateEquipment({ slot, tier, quality, ...options }).stats

// 强化等级配置
const enhanceConfig = {
  maxLevel: 100, // 最大强化等级
  baseSuccessRate: 1, // 基础成功率
  costPerLevel: 10, // 每级消耗的强化石数量
  statIncrease: 0.1 // 每级属性提升比例（10%）
}

// 洗练配置
const reforgeConfig = {
  costPerAttempt: 10, // 每次洗练消耗的洗练石数量
  minVariation: -0.3, // 最小属性变化（-30%）
  maxVariation: 0.3, // 最大属性变化（+30%）
  newStatChance: 0.3 // 更换属性的概率（30%）
}

// 可洗练的属性池
const reforgeableStats = {
  weapon: ['attack', 'critRate', 'critDamageBoost'],
  head: ['defense', 'health', 'stunResist'],
  body: ['defense', 'health', 'finalDamageReduce'],
  legs: ['defense', 'speed', 'dodgeRate'],
  feet: ['defense', 'speed', 'dodgeRate'],
  shoulder: ['defense', 'health', 'counterRate'],
  hands: ['attack', 'critRate', 'comboRate'],
  wrist: ['defense', 'counterRate', 'vampireRate'],
  necklace: ['health', 'healBoost', 'spiritRate'],
  ring1: ['attack', 'critDamageBoost', 'finalDamageBoost'],
  ring2: ['defense', 'critDamageReduce', 'resistanceBoost'],
  belt: ['health', 'defense', 'combatBoost'],
  artifact: ['attack', 'critRate', 'comboRate']
}

// 强化装备
function enhanceEquipment(equipment, playerReinforceStones) {
  if (!equipment || !equipment.stats) {
    return { success: false, message: '无效的装备' }
  }
  const currentLevel = equipment.enhanceLevel || 0
  if (currentLevel >= enhanceConfig.maxLevel) {
    return { success: false, message: '装备已达到最大强化等级' }
  }
  const cost = enhanceConfig.costPerLevel * (currentLevel + 1)
  if (playerReinforceStones < cost) {
    return { success: false, message: '强化石不足' }
  }
  // 计算成功率
  const successRate = enhanceConfig.baseSuccessRate - currentLevel * 0.05
  const isSuccess = Math.random() < successRate
  if (!isSuccess) {
    return {
      success: false,
      message: '强化失败',
      cost,
      oldStats: { ...equipment.stats },
      newStats: { ...equipment.stats }
    }
  }
  // 保存旧属性用于对比
  const oldStats = { ...equipment.stats }
  // 提升装备属性
  Object.keys(equipment.stats).forEach(stat => {
    if (typeof equipment.stats[stat] === 'number') {
      equipment.stats[stat] *= 1 + enhanceConfig.statIncrease
      // 对百分比属性进行特殊处理
      if (
        ['critRate', 'critDamageBoost', 'dodgeRate', 'vampireRate', 'finalDamageBoost', 'finalDamageReduce'].includes(
          stat
        )
      ) {
        equipment.stats[stat] = Math.round(equipment.stats[stat] * 100) / 100
      } else {
        equipment.stats[stat] = Math.round(equipment.stats[stat])
      }
    }
  })
  // 更新强化等级
  equipment.enhanceLevel = (equipment.enhanceLevel || 0) + 1
  return {
    success: true,
    message: '强化成功',
    cost,
    oldStats,
    newStats: equipment.stats,
    newLevel: equipment.enhanceLevel
  }
}

function reforgeEquipment(equipment, playerSpiritStones, confirmNewStats = true) {
  if (!equipment || !equipment.stats || !equipment.type) {
    return { success: false, message: '无效的装备' }
  }
  if (playerSpiritStones < reforgeConfig.costPerAttempt) {
    return { success: false, message: '洗练石不足' }
  }
  const oldStats = { ...equipment.stats }
  const availableStats = reforgeableStats[equipment.type]
  const tempStats = { ...equipment.stats }
  const originStats = Object.keys(tempStats)
  // 生成要处理的属性索引（1-3个随机）
  const modifyIndexes = [
    ...new Set(
      Array.from({ length: Math.floor(Math.random() * 3) + 1 }, () => Math.floor(Math.random() * originStats.length))
    )
  ].slice(0, 3) // 确保最多处理3个属性
  modifyIndexes.forEach(index => {
    const originStat = originStats[index]
    let currentStat = originStat
    const baseValue = tempStats[originStat]
    // Step 1: 尝试替换属性
    if (Math.random() < reforgeConfig.newStatChance) {
      // 过滤可用属性（不包含现有属性）
      const availableNew = availableStats.filter(s => !originStats.includes(s) && s !== originStat)
      if (availableNew.length > 0) {
        const newStat = availableNew[Math.floor(Math.random() * availableNew.length)]
        // 替换属性名但保留当前数值（会在步骤2中调整）
        delete tempStats[originStat]
        currentStat = newStat
      }
    }
    // Step 2：强制数值调整（基于原始值±30%）
    const delta = Math.random() * 0.6 - 0.3 // [-0.3, 0.3]
    const newValue = baseValue * (1 + delta)
    // 根据属性类型处理数值精度
    if (
      ['critRate', 'critDamageBoost', 'dodgeRate', 'vampireRate', 'finalDamageBoost', 'finalDamageReduce'].includes(
        currentStat
      )
    ) {
      tempStats[currentStat] = Math.min(Math.max(Number(newValue.toFixed(2)), baseValue * 0.7), baseValue * 1.3)
    } else {
      tempStats[currentStat] = Math.min(
        Math.max(Math.round(newValue), Math.round(baseValue * 0.7)),
        Math.round(baseValue * 1.3)
      )
    }
  })
  // 强制属性数量校验
  if (Object.keys(tempStats).length !== originStats.length) {
    console.error('属性数量异常', { old: originStats, new: tempStats })
    return {
      success: false,
      message: '洗练过程出现异常',
      cost: 0,
      oldStats,
      newStats: oldStats
    }
  }
  if (confirmNewStats) {
    equipment.stats = { ...tempStats }
  }
  return {
    success: true,
    message: confirmNewStats ? '洗练成功' : '保留原有属性',
    cost: reforgeConfig.costPerAttempt,
    oldStats,
    newStats: tempStats,
    confirmed: confirmNewStats
  }
}

export { enhanceConfig, reforgeConfig, reforgeableStats, enhanceEquipment, reforgeEquipment }
