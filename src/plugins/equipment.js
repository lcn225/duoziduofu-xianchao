// 装备强化和洗练相关配置

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
 * 灵器 `type`（中文：飞剑/袍/牌…）→ 13 个装备部位。
 *
 * 物品池只给 `type`，没有部位字段；宝匣开出「楚秦一阶道袍」时若不做这层映射，
 * 装备页按英文 key 过滤就永远找不到它（2026-10-22 用户反馈）。
 * 映射原则：能穿的按形态落位，其余法器/挂件统一进「法宝」。
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
  袍: 'body',
  甲: 'body',
  冠: 'head',
  簪: 'head',
  戒: 'ring1',
  珠: 'necklace',
  项链: 'necklace',
  履: 'feet',
  靴: 'feet',
  裤: 'legs',
  腰带: 'belt',
  护腕: 'wrist',
  手套: 'hands'
}

/** 未知灵器类型一律归「法宝」，不要返回空槽位 */
export const equipSlotOfType = type => EQUIP_SLOT_BY_ITEM_TYPE[type] || 'artifact'

/**
 * 各部位的**一阶白板属性**。占位数值，锚点取炼器三条基础配方
 * （素金戒指 attack 8 / 金簪 defense 6 + health 60 / 金钗 health 50 + speed 2）。
 * 新数值请先登记《数值真值表》再改。
 */
const SLOT_BASE_STATS = {
  weapon: { attack: 10 },
  head: { defense: 6, health: 40 },
  body: { defense: 8, health: 60 },
  legs: { defense: 5, health: 30 },
  feet: { defense: 4, speed: 2 },
  shoulder: { defense: 6, health: 40 },
  hands: { attack: 6 },
  wrist: { defense: 4 },
  necklace: { health: 60 },
  ring1: { attack: 8 },
  ring2: { attack: 8 },
  belt: { defense: 4, health: 40 },
  artifact: { attack: 6, defense: 4 }
}

const ROUNDABLE_PERCENT_STATS = new Set([
  'critRate',
  'critDamageBoost',
  'dodgeRate',
  'vampireRate',
  'finalDamageBoost',
  'finalDamageReduce'
])

/**
 * 生成灵器战斗面板：基础属性 × 基阶 × 成色倍率。
 *
 * ⚠ 成色倍率直接借用 `EQUIPMENT_QUALITIES[].statMod`，不要再抄一份。
 * ⚠ 这是**新数值**（宝匣/探索装备此前 stats 全是 null），改之前先登记。
 */
export const generateEquipmentStats = (slot, tier = 1, qualityKey = 'common') => {
  const base = SLOT_BASE_STATS[slot] || SLOT_BASE_STATS.artifact
  const tierNum = Math.min(Math.max(Math.floor(Number(tier) || 1), 1), 5)
  const mod = (EQUIPMENT_QUALITIES[qualityKey] || EQUIPMENT_QUALITIES.common).statMod
  const out = {}
  for (const [key, value] of Object.entries(base)) {
    const raw = value * tierNum * mod
    out[key] = ROUNDABLE_PERCENT_STATS.has(key) ? Math.round(raw * 100) / 100 : Math.round(raw)
  }
  return out
}

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
