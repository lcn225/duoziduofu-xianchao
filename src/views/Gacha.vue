<script setup>
import { usePlayerStore } from '../stores/player'
import { ref, computed, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { InformationCircleOutline, StarOutline, ShirtOutline as EquipmentIcon, PawOutline as PetIcon } from '@vicons/ionicons5'

const playerStore = usePlayerStore()
const message = useMessage()

// 抽卡类型
const gachaType = ref('all') // 'equipment'、'pet' 或 'all'

// 抽卡动画状态
const isShaking = ref(false)
const isOpening = ref(false)
const showResult = ref(false)
const gachaResult = ref(null)
const showProbabilityInfo = ref(false)
const isDrawing = ref(false)

// 结果弹窗相关
const currentPage = ref(1)
const pageSize = ref(12)
const showWishlistModal = ref(false) // 添加心愿单弹窗状态
const selectedRarity = ref(null) // 选中的灵宠品质
const selectedQuality = ref(null) // 选中的装备品质

// 抽卡配置对象
const gachaConfig = {
  equipmentQualities: {
    common: { name: '凡品', color: '#9e9e9e', statMod: 1.0, realmRequirement: 1, maxStatMod: 1.5 },
    uncommon: { name: '下品', color: '#4caf50', statMod: 1.2, realmRequirement: 5, maxStatMod: 2.0 },
    rare: { name: '中品', color: '#2196f3', statMod: 1.5, realmRequirement: 10, maxStatMod: 2.5 },
    epic: { name: '上品', color: '#9c27b0', statMod: 2.0, realmRequirement: 19, maxStatMod: 3.0 },
    legendary: { name: '极品', color: '#ff9800', statMod: 2.5, realmRequirement: 28, maxStatMod: 3.5 },
    mythic: { name: '仙品', color: '#e91e63', statMod: 3.0, realmRequirement: 37, maxStatMod: 4.0 }
  },
  pitySystem: {
    softPityThreshold: 50,
    hardPityThreshold: 100,
    softPityGrowth: 0.02,
    currentPityCount: 0,
    maxPityBonus: 0.4  // 最大保底加成概率
  },
  costConfig: {
    baseCost: 100,
    realmMultiplier: 0.03,  // 降低境界对消耗的影响
    pityCostMultiplier: 0.005  // 降低保底对消耗的影响
  },
  probabilityCurve: (level) => {
    const maxLevel = 100
    // 使用对数函数使增长更平缓
    return Math.min(0.15, 0.05 * Math.log10(1 + level / 10))
  }
}

// 装备类型
const equipmentTypes = {
  weapon: { name: '武器', slot: 'weapon', prefixes: ['九天', '太虚', '混沌', '玄天', '紫霄', '青冥', '赤炎', '幽冥'] },
  head: { name: '头部', slot: 'head', prefixes: ['天灵', '玄冥', '紫金', '青玉', '赤霞', '幽月', '星辰', '云霄'] },
  body: { name: '衣服', slot: 'body', prefixes: ['九霄', '太素', '混元', '玄阳', '紫薇', '青龙', '赤凤', '幽冥'] },
  legs: { name: '裤子', slot: 'legs', prefixes: ['天罡', '玄武', '紫电', '青云', '赤阳', '幽灵', '星光', '云雾'] },
  feet: { name: '鞋子', slot: 'feet', prefixes: ['天行', '玄风', '紫霞', '青莲', '赤焰', '幽影', '星步', '云踪'] },
  shoulder: { name: '肩甲', slot: 'shoulder', prefixes: ['天护', '玄甲', '紫雷', '青锋', '赤羽', '幽岚', '星芒', '云甲'] },
  hands: { name: '手套', slot: 'hands', prefixes: ['天罗', '玄玉', '紫晶', '青钢', '赤金', '幽银', '星铁', '云纹'] },
  wrist: { name: '护腕', slot: 'wrist', prefixes: ['天绝', '玄铁', '紫玉', '青石', '赤铜', '幽钢', '星晶', '云纱'] },
  necklace: { name: '项链', slot: 'necklace', prefixes: ['天珠', '玄圣', '紫灵', '青魂', '赤心', '幽魄', '星魂', '云珠'] },
  ring1: { name: '戒指1', slot: 'ring1', prefixes: ['天命', '玄命', '紫命', '青命', '赤命', '幽命', '星命', '云命'] },
  ring2: { name: '戒指2', slot: 'ring2', prefixes: ['天道', '玄道', '紫道', '青道', '赤道', '幽道', '星道', '云道'] },
  belt: { name: '腰带', slot: 'belt', prefixes: ['天系', '玄系', '紫系', '青系', '赤系', '幽系', '星系', '云系'] },
  artifact: { name: '法宝', slot: 'artifact', prefixes: ['天宝', '玄宝', '紫宝', '青宝', '赤宝', '幽宝', '星宝', '云宝'] }
}

// 装备基础属性
const equipmentBaseStats = {
  weapon: {
    attack: { name: '攻击', min: 10, max: 20 },
    critRate: { name: '暴击率', min: 0.05, max: 0.1 },
    critDamageBoost: { name: '暴击伤害', min: 0.1, max: 0.3 }
  },
  head: {
    defense: { name: '防御', min: 5, max: 10 },
    health: { name: '生命', min: 50, max: 100 },
    stunResist: { name: '抗眩晕', min: 0.05, max: 0.1 }
  },
  body: {
    defense: { name: '防御', min: 8, max: 15 },
    health: { name: '生命', min: 80, max: 150 },
    finalDamageReduce: { name: '最终减伤', min: 0.05, max: 0.1 }
  },
  legs: {
    defense: { name: '防御', min: 6, max: 12 },
    speed: { name: '速度', min: 5, max: 10 },
    dodgeRate: { name: '闪避率', min: 0.05, max: 0.1 }
  },
  feet: {
    defense: { name: '防御', min: 4, max: 8 },
    speed: { name: '速度', min: 8, max: 15 },
    dodgeRate: { name: '闪避率', min: 0.05, max: 0.1 }
  },
  shoulder: {
    defense: { name: '防御', min: 5, max: 10 },
    health: { name: '生命', min: 40, max: 80 },
    counterRate: { name: '反击率', min: 0.05, max: 0.1 }
  },
  hands: {
    attack: { name: '攻击', min: 5, max: 10 },
    critRate: { name: '暴击率', min: 0.03, max: 0.08 },
    comboRate: { name: '连击率', min: 0.05, max: 0.1 }
  },
  wrist: {
    defense: { name: '防御', min: 3, max: 8 },
    counterRate: { name: '反击率', min: 0.05, max: 0.1 },
    vampireRate: { name: '吸血率', min: 0.05, max: 0.1 }
  },
  necklace: {
    health: { name: '生命', min: 60, max: 120 },
    healBoost: { name: '强化治疗', min: 0.1, max: 0.2 },
    spiritRate: { name: '灵力获取', min: 0.1, max: 0.2 }
  },
  ring1: {
    attack: { name: '攻击', min: 5, max: 10 },
    critDamageBoost: { name: '暴击伤害', min: 0.1, max: 0.2 },
    finalDamageBoost: { name: '最终增伤', min: 0.05, max: 0.1 }
  },
  ring2: {
    defense: { name: '防御', min: 5, max: 10 },
    critDamageReduce: { name: '爆伤减免', min: 0.1, max: 0.2 },
    resistanceBoost: { name: '抗性提升', min: 0.05, max: 0.1 }
  },
  belt: {
    health: { name: '生命', min: 40, max: 80 },
    defense: { name: '防御', min: 4, max: 8 },
    combatBoost: { name: '战斗属性', min: 0.05, max: 0.1 }
  },
  artifact: {
    cultivationRate: { name: '修炼速率', min: 0.1, max: 0.3 },
    spiritRate: { name: '灵力获取', min: 0.1, max: 0.3 },
    luck: { name: '福缘', min: 0.1, max: 0.3 }
  }
}
// 灵宠品质配置
const petRarities = {
  divine: {
    name: '神品',
    color: '#FF0000',
    probability: 0.002,
    essenceBonus: 50
  },
  celestial: {
    name: '仙品',
    color: '#FFD700',
    probability: 0.0581,
    essenceBonus: 30
  },
  mystic: {
    name: '玄品',
    color: '#9932CC',
    probability: 0.1601,
    essenceBonus: 20
  },
  spiritual: {
    name: '灵品',
    color: '#1E90FF',
    probability: 0.2801,
    essenceBonus: 10
  },
  mortal: {
    name: '凡品',
    color: '#32CD32',
    probability: 0.4997,
    essenceBonus: 5
  }
}
// 灵宠池配置
const petPool = {
  divine: [
    { name: '玄武', description: '北方守护神兽' },
    { name: '白虎', description: '西方守护神兽' },
    { name: '朱雀', description: '南方守护神兽' },
    { name: '青龙', description: '东方守护神兽' },
    { name: '应龙', description: '上古神龙，掌控风雨' },
    { name: '麒麟', description: '祥瑞之兽，通晓万物' },
    { name: '饕餮', description: '贪婪之兽，吞噬万物，象征无尽的欲望' },
    { name: '穷奇', description: '邪恶之兽，背信弃义，象征混乱与背叛' },
    { name: '梼杌', description: '凶暴之兽，顽固不化，象征无法驯服的野性' },
    { name: '混沌', description: '无序之兽，无形无相，象征原始的混乱' }
  ],
  celestial: [
    { name: '囚牛', description: '龙之长子，喜好音乐，常立于琴头' },
    { name: '睚眦', description: '龙之次子，性格刚烈，嗜杀好斗，常刻于刀剑之上' },
    { name: '嘲风', description: '龙之三子，形似兽，喜好冒险，常立于殿角' },
    { name: '蒲牢', description: '龙之四子，形似龙而小，性好鸣，常铸于钟上' },
    { name: '狻猊', description: '龙之五子，形似狮子，喜静好坐，常立于香炉' },
    { name: '霸下', description: '龙之六子，形似龟，力大无穷，常背负石碑' },
    { name: '狴犴', description: '龙之七子，形似虎，明辨是非，常立于狱门' },
    { name: '负屃', description: '龙之八子，形似龙，雅好诗文，常盘于碑顶' },
    { name: '螭吻', description: '龙之九子，形似鱼，能吞火，常立于屋脊' }
  ],
  mystic: [
    { name: '火凤凰', description: '浴火重生的永恒之鸟' },
    { name: '雷鹰', description: '掌控雷电的猛禽' },
    { name: '冰狼', description: '冰原霸主' },
    { name: '岩龟', description: '坚不可摧的守护者' }
  ],
  spiritual: [
    { name: '玄龟', description: '擅长防御的水系灵宠' },
    { name: '风隼', description: '速度极快的飞行灵宠' },
    { name: '地甲', description: '坚固的大地守护者' },
    { name: '云豹', description: '敏捷的猎手' }
  ],
  mortal: [
    { name: '灵猫', description: '敏捷的小型灵宠' },
    { name: '幻蝶', description: '美丽的蝴蝶灵宠' },
    { name: '火鼠', description: '活泼的啮齿类灵宠' },
    { name: '草兔', description: '温顺的兔类灵宠' }
  ]
}

// 根据境界调整装备品质概率
const getEquipProbabilities = (level) => {
  // 基础概率
  const baseProbs = {
    common: 0.35,      // 凡品 35%
    uncommon: 0.30,    // 下品 30%
    rare: 0.17,        // 中品 17%
    epic: 0.11,        // 上品 11%
    legendary: 0.05,   // 极品 5%
    mythic: 0.02       // 仙品 2%
  }
  // 根据境界调整概率
  const adjustedProbs = { ...baseProbs }
  const levelBonus = Math.min(0.2, level * 0.01) // 每级提升1%，最高20%
  // 降低低品质概率
  adjustedProbs.common = Math.max(0.15, baseProbs.common - levelBonus)
  adjustedProbs.uncommon = Math.max(0.20, baseProbs.uncommon - levelBonus * 0.5)
  // 提升高品质概率
  const extraChance = (baseProbs.common - adjustedProbs.common) + (baseProbs.uncommon - adjustedProbs.uncommon)
  adjustedProbs.rare += extraChance * 0.4
  adjustedProbs.epic += extraChance * 0.3
  adjustedProbs.legendary += extraChance * 0.2
  adjustedProbs.mythic += extraChance * 0.1
  return adjustedProbs
}

// 抽取单个装备
const drawSingleEquip = () => {
  const random = Math.random()
  let accumulatedProb = 0
  const currentProbs = getEquipProbabilities(playerStore.level || 1)

  // 应用心愿单加成
  const adjustedProbs = {}
  let totalProb = 0
  for (const [quality, probability] of Object.entries(currentProbs)) {
    const boost = calculateWishlistBoost({ quality }, 'equipment')
    adjustedProbs[quality] = probability * boost
    totalProb += adjustedProbs[quality]
  }

  // 归一化概率
  for (const quality in adjustedProbs) {
    adjustedProbs[quality] /= totalProb
  }

  // 抽取结果
  for (const [quality, probability] of Object.entries(adjustedProbs)) {
    accumulatedProb += probability
    if (random <= accumulatedProb) {
      const types = Object.keys(equipmentTypes)
      const type = types[Math.floor(Math.random() * types.length)]
      return generateEquipment(playerStore.level || 1, type, quality)
    }
  }
}

// 优化属性计算函数
const calculateStatValue = (base, qualityMod, level) => {
  // 使用平方根函数使属性增长更平缓
  const levelMod = 1 + Math.sqrt(level) * 0.05
  return Math.min(base * qualityMod * levelMod, base * qualityMod * 5) // 设置属性上限
}

// 修改装备生成逻辑
const generateEquipment = (level, type = null, quality = null) => {
  if (!type) {
    const types = Object.keys(equipmentTypes)
    type = types[Math.floor(Math.random() * types.length)]
  }

  if (!quality) {
    // 优化品质概率计算
    const levelBonus = gachaConfig.probabilityCurve(level)
    const roll = Math.random() - levelBonus
    if (roll < 0.40) quality = 'common'
    else if (roll < 0.70) quality = 'uncommon'
    else if (roll < 0.85) quality = 'rare'
    else if (roll < 0.94) quality = 'epic'
    else if (roll < 0.98) quality = 'legendary'
    else quality = 'mythic'
  }

  const requiredRealm = gachaConfig.equipmentQualities[quality].realmRequirement
  const baseStats = {}
  const qualityMod = gachaConfig.equipmentQualities[quality].statMod
  const maxStatMod = gachaConfig.equipmentQualities[quality].maxStatMod

  Object.entries(equipmentBaseStats[type]).forEach(([stat, config]) => {
    const base = config.min + Math.random() * (config.max - config.min)
    let value = calculateStatValue(base, qualityMod, level)

    // 确保不超过品质上限
    value = Math.min(value, base * maxStatMod)

    if (['critRate', 'critDamageBoost', 'dodgeRate', 'vampireRate', 'finalDamageBoost', 'finalDamageReduce'].includes(stat)) {
      // 百分比属性额外限制
      value = Math.min(value, config.max * 2)
      baseStats[stat] = Math.round(value * 100) / 100
    } else {
      baseStats[stat] = Math.round(value)
    }
  })

  return {
    id: Date.now() + Math.random(),
    name: generateEquipmentName(type, quality),
    type,
    slot: type,
    quality,
    level,
    requiredRealm,
    stats: baseStats,
    qualityInfo: gachaConfig.equipmentQualities[quality]
  }
}

// 生成装备名称
const generateEquipmentName = (type, quality) => {
  const typeInfo = equipmentTypes[type]
  const qualityInfo = gachaConfig.equipmentQualities[quality]
  const prefix = typeInfo.prefixes[Math.floor(Math.random() * typeInfo.prefixes.length)]
  const suffixes = ['', '·真', '·极', '·道', '·天', '·仙', '·圣', '·神']
  const suffix = quality === 'mythic' ? suffixes[7] :
    quality === 'legendary' ? suffixes[6] :
      quality === 'epic' ? suffixes[5] :
        quality === 'rare' ? suffixes[4] :
          quality === 'uncommon' ? suffixes[3] :
            suffixes[0]
  return `${prefix}${typeInfo.name}${suffix}`
}

// 优化灵宠生成逻辑
const generatePetAttributes = (rarity, level) => {
  const rarityMultiplier = {
    divine: 5,
    celestial: 4,
    mystic: 3,
    spiritual: 2,
    mortal: 1
  }[rarity] || 1

  // 使用平方根函数控制属性增长
  const levelMod = Math.sqrt(level)
  const baseMultiplier = rarityMultiplier * (1 + levelMod * 0.1)

  return {
    attack: Math.round((10 + Math.random() * 5) * baseMultiplier),
    health: Math.round((100 + Math.random() * 20) * baseMultiplier),
    defense: Math.round((5 + Math.random() * 3) * baseMultiplier),
    speed: Math.round((10 + Math.random() * 5) * Math.min(baseMultiplier * 0.8, 5)),
    critRate: Math.min(Math.random() * 0.1 * rarityMultiplier * 0.5, 0.5),
    comboRate: Math.min(Math.random() * 0.1 * rarityMultiplier * 0.5, 0.5),
    counterRate: Math.min(Math.random() * 0.1 * rarityMultiplier * 0.5, 0.5),
    stunRate: Math.min(Math.random() * 0.1 * rarityMultiplier * 0.5, 0.5),
    dodgeRate: Math.min(Math.random() * 0.1 * rarityMultiplier * 0.5, 0.5),
    vampireRate: Math.min(Math.random() * 0.1 * rarityMultiplier * 0.5, 0.5)
  }
}

// 修改抽取灵宠的函数
const drawSinglePet = () => {
  const random = Math.random()
  let accumulatedProb = 0
  for (const [rarity, config] of Object.entries(petRarities)) {
    accumulatedProb += config.probability
    if (random <= accumulatedProb) {
      const pool = petPool[rarity]
      const pet = pool[Math.floor(Math.random() * pool.length)]
      // 根据品质生成升级道具数量
      const upgradeItemCount = {
        divine: 5,
        celestial: 4,
        mystic: 3,
        spiritual: 2,
        mortal: 1
      }
      return {
        ...pet,
        rarity,
        type: 'pet',
        quality: {
          strength: Math.floor(Math.random() * 10) + 1,
          agility: Math.floor(Math.random() * 10) + 1,
          intelligence: Math.floor(Math.random() * 10) + 1,
          constitution: Math.floor(Math.random() * 10) + 1
        },
        power: 0,
        experience: 0,
        maxExperience: 100,
        level: 1,
        star: 0,
        upgradeItems: upgradeItemCount[rarity] || 1,
        combatAttributes: generatePetAttributes(rarity, 1)
      }
    }
  }
}

// 综合池概率配置
const getAllPoolProbabilities = (level) => {
  const equipProbs = getEquipProbabilities(level)
  const totalEquipProb = 0.5 // 装备占50%概率
  const totalPetProb = 0.5 // 灵宠占50%概率
  // 调整装备概率
  const adjustedEquipProbs = {}
  Object.entries(equipProbs).forEach(([quality, prob]) => {
    adjustedEquipProbs[quality] = prob * totalEquipProb
  })
  // 调整灵宠概率
  const adjustedPetProbs = {}
  Object.entries(petRarities).forEach(([rarity, config]) => {
    adjustedPetProbs[rarity] = config.probability * totalPetProb
  })
  return {
    equipment: adjustedEquipProbs,
    pet: adjustedPetProbs
  }
}

// 从综合池抽取
const drawFromAllPool = () => {
  const random = Math.random()
  const probs = getAllPoolProbabilities(playerStore.level || 1)
  // 先决定是抽装备还是灵宠
  if (random < 0.5) {
    // 抽装备
    let accumulatedProb = 0
    for (const [quality, probability] of Object.entries(probs.equipment)) {
      accumulatedProb += probability
      if (random * 2 <= accumulatedProb) {
        const types = Object.keys(equipmentTypes)
        const type = types[Math.floor(Math.random() * types.length)]
        return {
          ...generateEquipment(playerStore.level || 1, type, quality),
          type,
          equipType: type
        }
      }
    }
    // 如果没有命中任何概率，返回最低品质的装备
    const types = Object.keys(equipmentTypes)
    const type = types[Math.floor(Math.random() * types.length)]
    return {
      ...generateEquipment(playerStore.level || 1, type, 'common'),
      type,
      equipType: type
    }
  } else {
    // 抽灵宠
    let accumulatedProb = 0
    for (const [rarity, config] of Object.entries(petRarities)) {
      accumulatedProb += config.probability
      if ((random - 0.5) * 2 <= accumulatedProb) {
        const pool = petPool[rarity]
        const pet = pool[Math.floor(Math.random() * pool.length)]
        const upgradeItemCount = {
          divine: 5,
          celestial: 4,
          mystic: 3,
          spiritual: 2,
          mortal: 1
        }
        return {
          ...pet,
          rarity,
          type: 'pet',
          quality: {
            strength: Math.floor(Math.random() * 10) + 1,
            agility: Math.floor(Math.random() * 10) + 1,
            intelligence: Math.floor(Math.random() * 10) + 1,
            constitution: Math.floor(Math.random() * 10) + 1
          },
          power: 0,
          experience: 0,
          maxExperience: 100,
          level: 1,
          star: 0,
          upgradeItems: upgradeItemCount[rarity] || 1,
          combatAttributes: generatePetAttributes(rarity, 1)
        }
      }
    }
    // 如果没有命中任何概率，返回最低品质的灵宠
    const pool = petPool.mortal
    const pet = pool[Math.floor(Math.random() * pool.length)]
    return {
      ...pet,
      rarity: 'mortal',
      type: 'pet',
      quality: {
        strength: Math.floor(Math.random() * 10) + 1,
        agility: Math.floor(Math.random() * 10) + 1,
        intelligence: Math.floor(Math.random() * 10) + 1,
        constitution: Math.floor(Math.random() * 10) + 1
      },
      power: 0,
      experience: 0,
      maxExperience: 100,
      level: 1,
      star: 0,
      upgradeItems: 1,
      combatAttributes: generatePetAttributes('mortal', 1)
    }
  }
}

// 执行抽卡
const performGacha = async (times) => {
  const cost = times * 100
  if (playerStore.spiritStones < cost) {
    message.error('灵石不足！')
    return
  }
  const itemType = gachaType.value
  if (playerStore.items.filter(item => item.type === itemType).length >= 100) {
    message.error(`${itemType === 'equipment' ? '装备' : '灵宠'}背包已满，请先处理一些${itemType === 'equipment' ? '装备' : '灵宠'}`)
    return
  }
  if (isDrawing.value) return
  isDrawing.value = true
  // 扣除灵石
  playerStore.spiritStones -= cost
  // 开始抽卡动画
  isShaking.value = true
  await new Promise(resolve => setTimeout(resolve, 1000))
  isShaking.value = false
  isOpening.value = true
  await new Promise(resolve => setTimeout(resolve, 1000))
  // 生成抽卡结果
  const results = Array(times).fill().map(() => {
    if (gachaType.value === 'all') {
      return drawFromAllPool()
    } else {
      return gachaType.value === 'equipment' ? drawSingleEquip() : drawSinglePet()
    }
  })
  // 添加到背包
  results.forEach(item => {
    if (item.type === 'pet') {
      // 根据品质获得精华
      const rarityConfig = playerStore.petConfig.rarityMap[item.rarity]
      if (rarityConfig) {
        playerStore.petEssence += rarityConfig.essenceBonus
      }
    }
    playerStore.items.push({
      ...item,
      id: Date.now() + Math.random()
    })
  })
  // 保存数据
  playerStore.saveData()
  // 显示结果
  gachaResult.value = results
  currentPage.value = 1
  selectedQuality.value = null
  selectedRarity.value = null
  isOpening.value = false
  showResult.value = true
  isDrawing.value = false
  // 更新保底计数器
  updatePityCounter(results)
}

// 计算当前页的结果
const currentPageResults = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredResults.value.slice(start, end)
})

// 计算总页数
const totalPages = computed(() => {
  return Math.ceil(filteredResults.value.length / pageSize.value)
})

// 心愿单配置
const wishlistConfig = {
  maxWishItems: 3, // 最多可添加3个心愿项
  probabilityBoost: {
    equipment: {
      mythic: 0.5,    // 仙品装备概率提升50%
      legendary: 0.8,  // 极品装备概率提升80%
      epic: 1.2,      // 上品装备概率提升120%
      rare: 1.5,      // 中品装备概率提升150%
      uncommon: 2.0,  // 下品装备概率提升200%
      common: 2.5     // 凡品装备概率提升250%
    },
    pet: {
      divine: 0.3,     // 神品灵宠概率提升30%
      celestial: 0.5,  // 仙品灵宠概率提升50%
      mystic: 0.8,    // 玄品灵宠概率提升80%
      spiritual: 1.2,  // 灵品灵宠概率提升120%
      mortal: 1.5     // 凡品灵宠概率提升150%
    }
  },
  // 保底机制
  pitySystem: {
    threshold: 50, // 50次未抽中心愿物品后触发保底
    guaranteeBoost: 5.0 // 保底后概率提升500%
  }
}

// 心愿单数据
const wishlist = ref({
  equipment: [], // 装备心愿单
  pet: []       // 灵宠心愿单
})

// 心愿单计数器
const wishlistPityCounter = ref({
  equipment: 0,
  pet: 0
})

// 筛选结果
const filteredResults = computed(() => {
  if (!gachaResult.value) return []
  return gachaResult.value.filter(item => {
    if (item.type === 'pet') {
      return !selectedRarity.value || item.rarity === selectedRarity.value
    }
    // 装备筛选
    return !selectedQuality.value || item.quality === selectedQuality.value
  })
})

// 当筛选条件改变时重置页码
watch([selectedQuality, selectedRarity], () => {
  currentPage.value = 1
})

// 添加到心愿单
const addToWishlist = (item) => {
  const type = item.type === 'pet' ? 'pet' : 'equipment'
  if (wishlist.value[type].length >= wishlistConfig.maxWishItems) {
    message.warning(`${type === 'pet' ? '灵宠' : '装备'}心愿单已达到上限`)
    return
  }
  // 检查是否已在心愿单中
  const existingItem = wishlist.value[type].find(i =>
    type === 'pet' ? i.name === item.name && i.rarity === item.rarity
      : i.name === item.name && i.quality === item.quality
  )
  if (existingItem) {
    message.warning('该物品已在心愿单中')
    return
  }
  wishlist.value[type].push(item)
  message.success('已添加到心愿单')
}

// 从心愿单移除
const removeFromWishlist = (item, type) => {
  const index = wishlist.value[type].findIndex(i =>
    type === 'pet' ? i.name === item.name && i.rarity === item.rarity
      : i.name === item.name && i.quality === item.quality
  )
  if (index > -1) {
    wishlist.value[type].splice(index, 1)
    message.success('已从心愿单移除')
  }
}

// 修改抽卡逻辑，考虑心愿单加成
const calculateWishlistBoost = (item, type) => {
  const wishItems = wishlist.value[type]
  const pityCount = wishlistPityCounter.value[type]

  // 检查是否在心愿单中
  const isWishItem = wishItems.some(wishItem =>
    type === 'pet' ? wishItem.name === item.name && wishItem.rarity === item.rarity
      : wishItem.name === item.name && wishItem.quality === item.quality
  )

  if (!isWishItem) return 1

  // 计算概率提升
  let boost = type === 'pet'
    ? wishlistConfig.probabilityBoost.pet[item.rarity]
    : wishlistConfig.probabilityBoost.equipment[item.quality]

  // 检查是否触发保底
  if (pityCount >= wishlistConfig.pitySystem.threshold) {
    boost *= wishlistConfig.pitySystem.guaranteeBoost
  }

  return 1 + boost
}

// 在执行抽卡后更新保底计数器
const updatePityCounter = (results) => {
  results.forEach(item => {
    const type = item.type === 'pet' ? 'pet' : 'equipment'
    const isWishItem = wishlist.value[type].some(wishItem =>
      type === 'pet' ? wishItem.name === item.name && wishItem.rarity === item.rarity
        : wishItem.name === item.name && wishItem.quality === item.quality
    )

    if (isWishItem) {
      wishlistPityCounter.value[type] = 0
    } else {
      wishlistPityCounter.value[type]++
    }
  })
}

const types = {
  equipment: '📦',
  pet: '🥚',
  all: '🎁'
}

// 将计算属性移到这里（在使用到的变量定义之后）
const equipmentQualityOptions = computed(() => {
  return Object.entries(gachaConfig.equipmentQualities).map(([key, value]) => ({
    label: value.name,
    value: key,
    style: { color: value.color }
  }))
})

const petRarityOptions = computed(() => {
  return Object.entries(petRarities).map(([key, value]) => ({
    label: value.name,
    value: key,
    style: { color: value.color }
  }))
})
</script>

<template>
  <n-layout>
    <n-layout-header bordered>
      <n-page-header>
        <template #title>
          抽奖系统
        </template>
      </n-page-header>
    </n-layout-header>
    <n-layout-content class="gacha-content">
      <n-card>
        <div class="gacha-container">
          <div class="gacha-type-selector">
            <n-radio-group v-model:value="gachaType" name="gachaType">
              <n-radio-button value="all">综合池</n-radio-button>
              <n-radio-button value="equipment">装备池</n-radio-button>
              <n-radio-button value="pet">灵宠池</n-radio-button>
            </n-radio-group>
          </div>
          <div class="spirit-stones">
            <n-statistic label="灵石" :value="playerStore.spiritStones" />
          </div>
          <div class="gacha-item-container">
            <div class="gacha-item" :class="{
                            'shake': isShaking,
                            'open': isOpening
                        }">
              {{ types[gachaType] }}
            </div>
          </div>
          <div class="gacha-buttons">
            <n-space vertical>
              <n-space justify="center">
                <n-button type="primary" @click="performGacha(1)"
                  :disabled="playerStore.spiritStones < 100 || isDrawing">
                  抽1次 (100灵石)
                </n-button>
                <n-button type="primary" @click="performGacha(10)"
                  :disabled="playerStore.spiritStones < 1000 || isDrawing">
                  抽10次 (1000灵石)
                </n-button>
                <n-button type="primary" @click="performGacha(50)"
                  :disabled="playerStore.spiritStones < 5000 || isDrawing">
                  抽50次 (5000灵石)
                </n-button>
                <n-button type="primary" @click="performGacha(100)"
                  :disabled="playerStore.spiritStones < 10000 || isDrawing">
                  抽100次 (10000灵石)
                </n-button>
                <n-button type="info" @click="showWishlistModal = true">
                  心愿单
                  <template #icon>
                    <n-badge :value="wishlist.equipment.length + wishlist.pet.length"
                      :show="wishlist.equipment.length + wishlist.pet.length > 0">
                      <n-icon><star-outline /></n-icon>
                    </n-badge>
                  </template>
                </n-button>
              </n-space>
              <n-space justify="center">
                <n-button quaternary circle size="small" @click="showProbabilityInfo = true">
                  <template #icon>
                    <n-icon><information-circle-outline /></n-icon>
                  </template>
                </n-button>
              </n-space>
            </n-space>
          </div>
          <!-- 抽卡结果弹窗 -->
          <n-modal v-model:show="showResult" preset="dialog" title="抽卡结果" :style="{ maxWidth: '90vw', width: '800px' }">
            <n-card :bordered="false">
              <!-- 筛选区域 -->
              <div class="filter-section" v-if="gachaType !== 'all'">
                <n-space align="center" justify="center" :wrap="true" :size="16">
                  <n-select v-model:value="selectedQuality" placeholder="装备品质筛选" clearable
                    :options="equipmentQualityOptions" :style="{ width: '180px' }" @update:value="currentPage = 1"
                    v-if="gachaType === 'equipment'">
                    <template #prefix>
                      <n-icon><equipment-icon /></n-icon>
                    </template>
                  </n-select>
                  <n-select v-model:value="selectedRarity" placeholder="灵宠品质筛选" clearable :options="petRarityOptions"
                    :style="{ width: '180px' }" @update:value="currentPage = 1" v-if="gachaType === 'pet'">
                    <template #prefix>
                      <n-icon><pet-icon /></n-icon>
                    </template>
                  </n-select>
                </n-space>
              </div>
              <!-- 结果网格 -->
              <div class="result-grid">
                <div v-for="item in currentPageResults" :key="item.id" class="result-item"
                  :style="{ borderColor: item.type === 'pet' ? petRarities[item.rarity]?.color : gachaConfig.equipmentQualities[item.quality]?.color || '#CCCCCC' }">
                  <h4>{{ item.name }}</h4>
                  <p>
                    品质：{{ item.type === 'pet' ? petRarities[item.rarity]?.name : gachaConfig.equipmentQualities[item.quality]?.name }}
                  </p>
                  <p v-if="item.type !== 'pet'">类型：{{ equipmentTypes[item.type]?.name || '未知装备' }}</p>
                  <p v-else>{{ item.description || '暂无描述' }}</p>
                  <n-button size="tiny" type="primary" @click="addToWishlist(item)"
                    :disabled="wishlist[item.type === 'pet' ? 'pet' : 'equipment'].length >= wishlistConfig.maxWishItems">
                    添加到心愿单
                  </n-button>
                </div>
              </div>
              <template #footer>
                <n-space vertical align="center">
                  <n-pagination v-model:page="currentPage" :page-count="totalPages" :page-size="pageSize"
                    @update:page-size="pageSize = $event" :page-slot="5" />
                </n-space>
              </template>
            </n-card>
          </n-modal>
          <!-- 概率说明弹窗 -->
          <n-modal v-model:show="showProbabilityInfo" preset="dialog" style="max-width: 600px">
            <template #header>
              <n-space align="center">
                <span>抽卡概率说明</span>
              </n-space>
            </template>
            <n-tabs type="segment" animated>
              <!-- 综合池概率 -->
              <n-tab-pane name="all" tab="综合池">
                <n-card>
                  <n-space vertical>
                    <n-divider>综合概率</n-divider>
                    <div class="probability-bars">
                      <div class="prob-item">
                        <div class="prob-label">
                          <span>装备</span>
                        </div>
                        <!-- 总体分布 -->
                        <n-progress type="line" :percentage="50" indicator-placement="inside" color="#2080f0"
                          :height="20" :border-radius="4" />
                        <div class="prob-label">
                          <span>灵宠</span>
                        </div>
                        <n-progress type="line" :percentage="50" indicator-placement="inside" color="#f0a020"
                          :height="20" :border-radius="4" />
                      </div>
                    </div>
                    <!-- 装备概率详情 -->
                    <n-divider>装备品质概率</n-divider>
                    <div class="probability-bars">
                      <div v-for="(probability, quality) in getAllPoolProbabilities(playerStore.level || 1).equipment"
                        :key="quality" class="prob-item">
                        <div class="prob-label">
                          <span :style="{ color: gachaConfig.equipmentQualities[quality].color }">
                            {{ gachaConfig.equipmentQualities[quality].name }}
                          </span>
                        </div>
                        <n-progress type="line" :percentage="probability * 200" indicator-placement="inside"
                          :color="gachaConfig.equipmentQualities[quality].color" :height="20" :border-radius="4"
                          :show-indicator="true">
                          <template #indicator>
                            {{ (probability * 100).toFixed(1) }}%
                          </template>
                        </n-progress>
                      </div>
                    </div>
                    <!-- 灵宠概率详情 -->
                    <n-divider>灵宠品质概率</n-divider>
                    <div class="probability-bars">
                      <div v-for="(probability, rarity) in getAllPoolProbabilities(playerStore.level || 1).pet"
                        :key="rarity" class="prob-item">
                        <div class="prob-label">
                          <span :style="{ color: petRarities[rarity].color }">
                            {{ petRarities[rarity].name }}
                          </span>
                        </div>
                        <n-progress type="line" :percentage="probability * 200" :indicator-placement="'inside'"
                          :color="petRarities[rarity].color" :height="20" :border-radius="4" :show-indicator="true">
                          <template #indicator>
                            {{ (probability * 100).toFixed(1) }}%
                          </template>
                        </n-progress>
                      </div>
                    </div>
                  </n-space>
                </n-card>
              </n-tab-pane>
              <!-- 装备池概率 -->
              <n-tab-pane name="equipment" tab="装备池">
                <n-card>
                  <div class="probability-bars">
                    <div v-for="(probability, quality) in getEquipProbabilities(playerStore.level || 1)" :key="quality"
                      class="prob-item">
                      <div class="prob-label">
                        <span :style="{ color: gachaConfig.equipmentQualities[quality].color }">
                          {{ gachaConfig.equipmentQualities[quality].name }}
                        </span>
                      </div>
                      <n-progress type="line" :percentage="probability * 100" :indicator-placement="'inside'"
                        :color="gachaConfig.equipmentQualities[quality].color" :height="20" :border-radius="4"
                        :show-indicator="true">
                        <template #indicator>
                          {{ (probability * 100).toFixed(1) }}%
                        </template>
                      </n-progress>
                    </div>
                  </div>
                </n-card>
              </n-tab-pane>
              <!-- 灵宠池概率 -->
              <n-tab-pane name="pet" tab="灵宠池">
                <n-card>
                  <div class="probability-bars">
                    <div v-for="(config, rarity) in petRarities" :key="rarity" class="prob-item">
                      <div class="prob-label">
                        <span :style="{ color: config.color }">
                          {{ config.name }}
                        </span>
                      </div>
                      <n-progress type="line" :percentage="config.probability * 100" :indicator-placement="'inside'"
                        :color="config.color" :height="20" :border-radius="4" :show-indicator="true">
                        <template #indicator>
                          {{ (config.probability * 100).toFixed(1) }}%
                        </template>
                      </n-progress>
                    </div>
                  </div>
                </n-card>
              </n-tab-pane>
            </n-tabs>
            <template #footer>
              <n-space vertical size="small">
                <n-text depth="3">* 概率会随着境界提升而调整</n-text>
                <n-text depth="3">* 心愿单中的物品会获得额外概率提升</n-text>
              </n-space>
            </template>
          </n-modal>
          <!-- 心愿单弹窗 -->
          <n-modal v-model:show="showWishlistModal" preset="dialog" title="心愿单">
            <n-tabs>
              <!-- 装备心愿单 -->
              <n-tab-pane name="equipment" tab="装备心愿单">
                <n-empty v-if="wishlist.equipment.length === 0" description="暂无心愿装备" />
                <n-list v-else>
                  <n-list-item v-for="item in wishlist.equipment" :key="item.id">
                    <n-space justify="space-between" align="center">
                      <n-space align="center">
                        <n-tag :color="{ color: gachaConfig.equipmentQualities[item.quality].color }">
                          {{ gachaConfig.equipmentQualities[item.quality].name }}
                        </n-tag>
                        <span>{{ item.name }}</span>
                      </n-space>
                      <n-button size="small" type="error" @click="removeFromWishlist(item, 'equipment')">
                        移除
                      </n-button>
                    </n-space>
                  </n-list-item>
                </n-list>
                <n-divider />
                <n-text depth="3">
                  装备心愿单: {{ wishlist.equipment.length }}/{{ wishlistConfig.maxWishItems }}
                </n-text>
              </n-tab-pane>
              <!-- 灵宠心愿单 -->
              <n-tab-pane name="pet" tab="灵宠心愿单">
                <n-empty v-if="wishlist.pet.length === 0" description="暂无心愿灵宠" />
                <n-list v-else>
                  <n-list-item v-for="item in wishlist.pet" :key="item.id">
                    <n-space justify="space-between" align="center">
                      <n-space align="center">
                        <n-tag :color="{ color: petRarities[item.rarity].color }">
                          {{ petRarities[item.rarity].name }}
                        </n-tag>
                        <span>{{ item.name }}</span>
                      </n-space>
                      <n-button size="small" type="error" @click="removeFromWishlist(item, 'pet')">
                        移除
                      </n-button>
                    </n-space>
                  </n-list-item>
                </n-list>
                <n-divider />
                <n-text depth="3">
                  灵宠心愿单: {{ wishlist.pet.length }}/{{ wishlistConfig.maxWishItems }}
                </n-text>
              </n-tab-pane>
            </n-tabs>
            <!-- 心愿单说明 -->
            <template #footer>
              <n-collapse>
                <n-collapse-item title="心愿单说明">
                  <n-space vertical>
                    <n-text>1. 每种类型最多可添加 {{ wishlistConfig.maxWishItems }} 个心愿物品</n-text>
                    <n-text>2. 心愿单中的物品会获得额外的抽取概率提升</n-text>
                    <n-text>3. 累计 {{ wishlistConfig.pitySystem.threshold }} 次未抽中心愿物品后触发保底机制</n-text>
                    <n-divider />
                    <n-text>当前保底计数：</n-text>
                    <n-text>装备：{{ wishlistPityCounter.equipment }}/{{ wishlistConfig.pitySystem.threshold }}</n-text>
                    <n-text>灵宠：{{ wishlistPityCounter.pet }}/{{ wishlistConfig.pitySystem.threshold }}</n-text>
                  </n-space>
                </n-collapse-item>
              </n-collapse>
            </template>
          </n-modal>
        </div>
      </n-card>
    </n-layout-content>
  </n-layout>
</template>

<style scoped>
.gacha-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.gacha-type-selector {
  margin-bottom: 20px;
}

.spirit-stones {
  align-self: flex-end;
}

.gacha-item-container {
  position: relative;
  width: 200px;
  height: 200px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.gacha-item {
  font-size: 100px;
  transition: transform 0.3s ease;
}

.gacha-item.shake {
  animation: shake 0.5s ease-in-out infinite;
}

.gacha-item.open {
  animation: open 1s ease-in-out;
}

@keyframes shake {
  0%,
  100% {
    transform: rotate(0deg);
  }

  25% {
    transform: rotate(-5deg);
  }

  75% {
    transform: rotate(5deg);
  }
}

@keyframes open {
  0% {
    transform: scale(1);
    opacity: 1;
  }

  50% {
    transform: scale(1.2);
    opacity: 0.5;
  }

  100% {
    transform: scale(0);
    opacity: 0;
  }
}

.result-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  margin: 16px 0;
}

.filter-section {
  padding: 16px;
  margin-bottom: 16px;
  background-color: var(--n-card-color);
  border-radius: 8px;
  border: 1px solid var(--n-border-color);
}

/* 确保结果项样式一致 */
.result-item {
  height: 100%;
  min-height: 160px;
  background: var(--n-card-color);
  border: 2px solid;
  border-radius: 8px;
  padding: 12px;
  text-align: center;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
  transition: all 0.2s ease;
}

@media screen and (max-width: 768px) {
  .result-item {
    width: 120px;
  }
}

.result-item h4 {
  margin: 0;
  font-size: 1.1em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-item p {
  margin: 0;
  font-size: 0.9em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gacha-buttons {
  margin-top: 20px;
}

@media screen and (max-width: 768px) {
  .result-container {
    max-height: calc(70vh - 100px);
  }

  .result-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* 选择器样式覆盖 */
:deep(.n-select) {
  margin: 0 8px;
}

:deep(.n-select .n-base-selection) {
  background-color: var(--n-card-color-modal);
  border-radius: 8px;
  transition: all 0.3s ease;
}

:deep(.n-select:hover .n-base-selection) {
  border-color: var(--n-primary-color);
  box-shadow: 0 0 0 2px var(--n-primary-color-suppl);
}

:deep(.n-select .n-base-selection-placeholder) {
  color: var(--n-text-color-3);
}

.probability-bars {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.prob-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.prob-label {
  min-width: 60px;
  text-align: right;
}

:deep(.n-progress.n-progress--line) {
  flex: 1;
}

:deep(.n-progress.n-progress--line .n-progress-graph) {
  background-color: rgba(0, 0, 0, 0.05);
}

:deep(.n-progress.n-progress--line .n-progress-graph__fill) {
  transition: all 0.3s ease-in-out;
}

:deep(.n-progress.n-progress--line:hover .n-progress-graph__fill) {
  filter: brightness(1.1);
}

:deep(.n-card) {
  background-color: rgba(255, 255, 255, 0.02);
}

:deep(.n-divider) {
  margin: 16px 0;
}
</style>