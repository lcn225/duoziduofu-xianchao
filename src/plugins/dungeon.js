// 副本难度配置
const difficultyModifiers = {
  easy: { healthMod: 0.8, damageMod: 0.8, rewardMod: 0.8 },
  normal: { healthMod: 1.0, damageMod: 1.0, rewardMod: 1.0 },
  hard: { healthMod: 1.2, damageMod: 1.2, rewardMod: 1.5 },
  expert: { healthMod: 1.5, damageMod: 1.5, rewardMod: 2.0 }
}

// 特殊效果池
const specialEffects = [
  { id: 'spirit_enhance', name: '聚灵', description: '提升10%灵力获取', effect: (stats) => { stats.spiritRate = (stats.spiritRate || 1) * 1.1 } },
  { id: 'cultivation_boost', name: '悟道', description: '提升10%修炼速度', effect: (stats) => { stats.cultivationRate = (stats.cultivationRate || 1) * 1.1 } },
  { id: 'combat_mastery', name: '战法', description: '提升10%战斗属性', effect: (stats) => { stats.combatBoost = (stats.combatBoost || 0) + 0.1 } },
  { id: 'divine_protection', name: '天护', description: '提升5%最终减伤', effect: (stats) => { stats.finalDamageReduce = (stats.finalDamageReduce || 0) + 0.05 } },
  { id: 'fortune_blessing', name: '福缘', description: '提升1%幸运值', effect: (stats) => { stats.luck = (stats.luck || 1) * 1.01 } },
  { id: 'immortal_body', name: '不朽', description: '提升10%生命上限', effect: (stats) => { stats.maxHealth = (stats.maxHealth || 100) * 1.1 } },
  { id: 'divine_might', name: '神威', description: '提升5%最终伤害', effect: (stats) => { stats.finalDamageBoost = (stats.finalDamageBoost || 0) + 0.05 } },
  { id: 'battle_sage', name: '战圣', description: '提升5%暴击率和10%暴击伤害', effect: (stats) => { 
    stats.critRate = (stats.critRate || 0.05) + 0.05
    stats.critDamageBoost = (stats.critDamageBoost || 0.5) + 0.1
  } },
  { id: 'swift_shadow', name: '疾影', description: '提升10%速度和5%闪避率', effect: (stats) => {
    stats.speed = (stats.speed || 10) * 1.1
    stats.dodgeRate = (stats.dodgeRate || 0.05) + 0.05
  } },
  { id: 'counter_master', name: '反制', description: '提升10%反击率和5%反击抗性', effect: (stats) => {
    stats.counterRate = (stats.counterRate || 0) + 0.1
    stats.counterResist = (stats.counterResist || 0) + 0.05
  } },
  { id: 'warrior_soul', name: '战魂', description: '提升10%攻击力和10%防御力', effect: (stats) => {
    stats.attack = (stats.attack || 10) * 1.1
    stats.defense = (stats.defense || 5) * 1.1
  } },
  { id: 'life_force', name: '生机', description: '提升10%生命上限和10%治疗效果', effect: (stats) => {
    stats.maxHealth = (stats.maxHealth || 100) * 1.1
    stats.healBoost = (stats.healBoost || 0) + 0.1
  } },
  { id: 'blood_moon', name: '血月', description: '提升15%暴击率和20%吸血率', effect: (stats) => {
    stats.critRate = (stats.critRate || 0.05) + 0.15
    stats.vampireRate = (stats.vampireRate || 0) + 0.2
  } },
  { id: 'thunder_spirit', name: '雷灵', description: '提升20%速度和15%眩晕率', effect: (stats) => {
    stats.speed = (stats.speed || 10) * 1.2
    stats.stunRate = (stats.stunRate || 0) + 0.15
  } },
  { id: 'iron_will', name: '铁意', description: '提升15%防御力和10%最终减伤', effect: (stats) => {
    stats.defense = (stats.defense || 5) * 1.15
    stats.finalDamageReduce = (stats.finalDamageReduce || 0) + 0.1
  } },
  { id: 'wind_walker', name: '风行', description: '提升20%速度和10%连击率', effect: (stats) => {
    stats.speed = (stats.speed || 10) * 1.2
    stats.comboRate = (stats.comboRate || 0) + 0.1
  } },
  { id: 'spirit_blade', name: '灵刃', description: '提升15%攻击力和10%最终伤害', effect: (stats) => {
    stats.attack = (stats.attack || 10) * 1.15
    stats.finalDamageBoost = (stats.finalDamageBoost || 0) + 0.1
  } },
  { id: 'soul_shield', name: '魂盾', description: '提升15%生命上限和15%抗性', effect: (stats) => {
    stats.maxHealth = (stats.maxHealth || 100) * 1.15
    stats.resistanceBoost = (stats.resistanceBoost || 0) + 0.15
  } },
  { id: 'battle_trance', name: '战魄', description: '提升15%战斗属性和10%暴击伤害', effect: (stats) => {
    stats.combatBoost = (stats.combatBoost || 0) + 0.15
    stats.critDamageBoost = (stats.critDamageBoost || 0.5) + 0.1
  } },
  { id: 'divine_blessing', name: '神佑', description: '提升10%最终减伤和10%治疗效果', effect: (stats) => {
    stats.finalDamageReduce = (stats.finalDamageReduce || 0) + 0.1
    stats.healBoost = (stats.healBoost || 0) + 0.1
  } }
]

// 随机选项池
const roguelikeOptions = {
  common: [
    {
      id: 'heal', name: '灵力增加', description: '增加10%灵力', effect: (player) => {
        if (player.stats) {
          player.stats.health = Math.min(player.stats.maxHealth, player.stats.health + player.stats.maxHealth * 0.1)
        }
      }
    },
    {
      id: 'small_buff', name: '小幅强化', description: '增加10%伤害', effect: (player) => {
        if (player.stats) {
          player.stats.finalDamageBoost = (player.stats.finalDamageBoost || 0) + 0.1
        }
      }
    },
    {
      id: 'defense_boost', name: '铁壁', description: '提升20%防御力', effect: (player) => {
        if (player.stats) {
          player.stats.defense = (player.stats.defense || 5) * 1.2
        }
      }
    },
    {
      id: 'speed_boost', name: '疾风', description: '提升15%速度', effect: (player) => {
        if (player.stats) {
          player.stats.speed = (player.stats.speed || 10) * 1.15
        }
      }
    },
    {
      id: 'crit_boost', name: '会心', description: '提升15%暴击率', effect: (player) => {
        if (player.stats) {
          player.stats.critRate = (player.stats.critRate || 0.05) + 0.15
        }
      }
    },
    {
      id: 'dodge_boost', name: '轻身', description: '提升15%闪避率', effect: (player) => {
        if (player.stats) {
          player.stats.dodgeRate = (player.stats.dodgeRate || 0.05) + 0.15
        }
      }
    },
    {
      id: 'vampire_boost', name: '吸血', description: '提升10%吸血率', effect: (player) => {
        if (player.stats) {
          player.stats.vampireRate = (player.stats.vampireRate || 0) + 0.1
        }
      }
    },
    {
      id: 'combat_boost', name: '战意', description: '提升10%战斗属性', effect: (player) => {
        if (player.stats) {
          player.stats.combatBoost = (player.stats.combatBoost || 0) + 0.1
        }
      }
    }
  ],
  rare: [
    {
      id: 'double_damage', name: '伤害倍增', description: '本次副本伤害翻倍', effect: (player) => {
        if (player.stats) {
          player.stats.finalDamageBoost = (player.stats.finalDamageBoost || 0) + 1.0
        }
      }
    },
    {
      id: 'crit_mastery', name: '会心精通', description: '暴击率提升30%，暴击伤害提升50%', effect: (player) => {
        if (player.stats) {
          player.stats.critRate = (player.stats.critRate || 0.05) + 0.3
          player.stats.critDamageBoost = (player.stats.critDamageBoost || 0.5) + 0.5
        }
      }
    },
    {
      id: 'dodge_master', name: '无影', description: '闪避率提升40%', effect: (player) => {
        if (player.stats) {
          player.stats.dodgeRate = (player.stats.dodgeRate || 0.05) + 0.4
        }
      }
    },
    {
      id: 'combo_master', name: '连击精通', description: '连击率提升30%', effect: (player) => {
        if (player.stats) {
          player.stats.comboRate = (player.stats.comboRate || 0) + 0.3
        }
      }
    },
    {
      id: 'vampire_master', name: '血魔', description: '吸血率提升25%', effect: (player) => {
        if (player.stats) {
          player.stats.vampireRate = (player.stats.vampireRate || 0) + 0.25
        }
      }
    },
    {
      id: 'stun_master', name: '震慑', description: '眩晕率提升20%', effect: (player) => {
        if (player.stats) {
          player.stats.stunRate = (player.stats.stunRate || 0) + 0.2
        }
      }
    }
  ],
  epic: [
    {
      id: 'ultimate_power', name: '极限突破', description: '所有战斗属性提升50%', effect: (player) => {
        if (player.stats) {
          player.stats.combatBoost = (player.stats.combatBoost || 0) + 0.5
          player.stats.finalDamageBoost = (player.stats.finalDamageBoost || 0) + 0.5
        }
      }
    },
    {
      id: 'divine_protection', name: '天道庇护', description: '最终减伤提升30%', effect: (player) => {
        if (player.stats) {
          player.stats.finalDamageReduce = (player.stats.finalDamageReduce || 0) + 0.3
        }
      }
    },
    {
      id: 'combat_master', name: '战斗大师', description: '所有战斗属性和抗性提升25%', effect: (player) => {
        if (player.stats) {
          player.stats.combatBoost = (player.stats.combatBoost || 0) + 0.25
          player.stats.resistanceBoost = (player.stats.resistanceBoost || 0) + 0.25
        }
      }
    },
    {
      id: 'immortal_body', name: '不朽之躯', description: '生命上限提升100%，最终减伤提升20%', effect: (player) => {
        if (player.stats) {
          player.stats.maxHealth = (player.stats.maxHealth || 100) * 2
          player.stats.health = player.stats.maxHealth
          player.stats.finalDamageReduce = (player.stats.finalDamageReduce || 0) + 0.2
        }
      }
    },
    {
      id: 'celestial_might', name: '天人合一', description: '所有战斗属性提升40%，生命值恢复50%', effect: (player) => {
        if (player.stats) {
          player.stats.combatBoost = (player.stats.combatBoost || 0) + 0.4
          player.stats.health = Math.min(player.stats.maxHealth, player.stats.health + player.stats.maxHealth * 0.5)
        }
      }
    },
    {
      id: 'battle_sage_supreme', name: '战圣至尊', description: '暴击率提升40%，暴击伤害提升80%，最终伤害提升20%', effect: (player) => {
        if (player.stats) {
          player.stats.critRate = (player.stats.critRate || 0.05) + 0.4
          player.stats.critDamageBoost = (player.stats.critDamageBoost || 0.5) + 0.8
          player.stats.finalDamageBoost = (player.stats.finalDamageBoost || 0) + 0.2
        }
      }
    }
  ]
}

// 获取随机选项
const getRandomOptions = (floor) => {
  // 基础概率设置
  let commonChance = 0.7
  let rareChance = 0.25
  let epicChance = 0.05
  // 根据层数调整概率
  if (floor % 10 === 0) { // 每10层提高史诗品质概率
    commonChance = 0.5
    rareChance = 0.3
    epicChance = 0.2 // 提高史诗品质概率到20%
  } else if (floor % 5 === 0) { // 每5层提高稀有品质概率
    commonChance = 0.5
    rareChance = 0.35 // 提高稀有品质概率到35%
    epicChance = 0.15
  }
  const count = 3
  const selected = []
  const usedIds = new Set()
  while (selected.length < count) {
    // 为每个选项独立随机决定品质
    const rand = Math.random()
    let pool = 'common'
    if (rand < epicChance) {
      pool = 'epic'
    } else if (rand < epicChance + rareChance) {
      pool = 'rare'
    }
    // 从选定的池中随机选择一个选项
    const options = roguelikeOptions[pool].filter(opt => !usedIds.has(opt.id))
    if (options.length > 0) {
      const index = Math.floor(Math.random() * options.length)
      const option = options[index]
      option.type = pool
      selected.push(option)
      usedIds.add(option.id)
    } else {
      // 如果当前品质池中没有可用选项，尝试其他品质池
      const allOptions = [
        ...roguelikeOptions.common,
        ...roguelikeOptions.rare,
        ...roguelikeOptions.epic
      ].filter(opt => !usedIds.has(opt.id))
      if (allOptions.length > 0) {
        const index = Math.floor(Math.random() * allOptions.length)
        const option = allOptions[index]
        option.type = pool
        selected.push(option)
        usedIds.add(option.id)
      }
    }
  }
  return selected
}

export {
  difficultyModifiers,
  specialEffects,
  roguelikeOptions,
  getRandomOptions
}