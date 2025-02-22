// 副本难度配置
const difficultyModifiers = {
  easy: { healthMod: 0.8, damageMod: 0.8, rewardMod: 0.8 },
  normal: { healthMod: 1.0, damageMod: 1.0, rewardMod: 1.0 },
  hard: { healthMod: 1.2, damageMod: 1.2, rewardMod: 1.5 },
  expert: { healthMod: 1.5, damageMod: 1.5, rewardMod: 2.0 },
};

// 特殊效果池
const specialEffects = [
  {
    id: "spirit_enhance",
    name: "聚灵",
    description: "提升20%灵力获取",
    effect: (stats) => {
      stats.spiritRate = (stats.spiritRate || 1) * 1.2;
    },
  },
  {
    id: "cultivation_boost",
    name: "悟道",
    description: "提升15%修炼速度",
    effect: (stats) => {
      stats.cultivationRate = (stats.cultivationRate || 1) * 1.15;
    },
  },
  {
    id: "combat_mastery",
    name: "战法",
    description: "提升15%战斗属性",
    effect: (stats) => {
      stats.combatBoost = (stats.combatBoost || 0) + 0.15;
    },
  },
  {
    id: "divine_protection",
    name: "天护",
    description: "提升10%最终减伤",
    effect: (stats) => {
      stats.finalDamageReduce = (stats.finalDamageReduce || 0) + 0.1;
    },
  },
  {
    id: "spirit_resonance",
    name: "灵韵",
    description: "提升15%灵力上限",
    effect: (stats) => {
      stats.maxSpirit = (stats.maxSpirit || 0) * 1.15;
    },
  },
  {
    id: "fortune_blessing",
    name: "福缘",
    description: "提升10%幸运值",
    effect: (stats) => {
      stats.luck = (stats.luck || 1) * 1.1;
    },
  },
  {
    id: "immortal_body",
    name: "不朽",
    description: "提升20%生命上限",
    effect: (stats) => {
      stats.maxHealth = (stats.maxHealth || 100) * 1.2;
    },
  },
  {
    id: "divine_might",
    name: "神威",
    description: "提升10%最终伤害",
    effect: (stats) => {
      stats.finalDamageBoost = (stats.finalDamageBoost || 0) + 0.1;
    },
  },
];

// 随机选项池
const roguelikeOptions = {
  common: [
    {
      id: "heal",
      name: "灵力恢复",
      description: "恢复30%灵力",
      effect: (stats) => {
        stats.health = Math.min(
          stats.maxHealth || 100,
          (stats.health || 0) + (stats.maxHealth || 100) * 0.3
        );
      },
    },
    {
      id: "small_buff",
      name: "小幅强化",
      description: "增加10%伤害",
      effect: (stats) => {
        stats.finalDamageBoost = (stats.finalDamageBoost || 0) + 0.1;
      },
    },
    {
      id: "spirit_shield",
      name: "灵力护盾",
      description: "获得一层护盾，可抵挡一次伤害",
      effect: (stats) => {
        stats.shield = (stats.shield || 0) + 1;
      },
    },
    {
      id: "cultivation_boost",
      name: "悟道加持",
      description: "临时提升20%修炼速度",
      effect: (stats) => {
        stats.cultivationRate = (stats.cultivationRate || 1) * 1.2;
      },
    },
    {
      id: "spirit_gathering",
      name: "聚灵",
      description: "提升15%灵力获取",
      effect: (stats) => {
        stats.spiritRate = (stats.spiritRate || 1) * 1.15;
      },
    },
    {
      id: "defense_boost",
      name: "铁壁",
      description: "提升20%防御力",
      effect: (stats) => {
        stats.defense = (stats.defense || 5) * 1.2;
      },
    },
    {
      id: "speed_boost",
      name: "疾风",
      description: "提升15%速度",
      effect: (stats) => {
        stats.speed = (stats.speed || 10) * 1.15;
      },
    },
    {
      id: "health_regen",
      name: "生机",
      description: "每回合恢复5%生命值",
      effect: (stats) => {
        stats.healthRegen = (stats.healthRegen || 0) + 0.05;
      },
    },
    {
      id: "spirit_regen",
      name: "灵息",
      description: "每回合恢复3%灵力",
      effect: (stats) => {
        stats.spiritRegen = (stats.spiritRegen || 0) + 0.03;
      },
    },
    {
      id: "luck_boost",
      name: "福运",
      description: "提升10%幸运值",
      effect: (stats) => {
        stats.luck = (stats.luck || 1) * 1.1;
      },
    },
  ],
  rare: [
    {
      id: "double_damage",
      name: "伤害倍增",
      description: "本次副本伤害翻倍",
      effect: (stats) => {
        stats.finalDamageBoost = ((stats.finalDamageBoost || 0) + 1) * 2 - 1;
      },
    },
    {
      id: "breakthrough_chance",
      name: "突破机缘",
      description: "获得一次突破机会",
      effect: (stats) => {
        stats.breakthroughChance = (stats.breakthroughChance || 0) + 1;
      },
    },
    {
      id: "spirit_blessing",
      name: "灵气祝福",
      description: "所有属性提升25%",
      effect: (stats) => {
        const multiplier = 1.25;
        stats.damage = (stats.damage || 0) * multiplier;
        stats.defense = (stats.defense || 0) * multiplier;
        stats.speed = (stats.speed || 0) * multiplier;
        stats.maxHealth = (stats.maxHealth || 0) * multiplier;
        stats.health = (stats.health || 0) * multiplier;
        stats.critRate = (stats.critRate || 0) * multiplier;
        stats.dodgeRate = (stats.dodgeRate || 0) * multiplier;
        stats.counterRate = (stats.counterRate || 0) * multiplier;
      },
    },
    {
      id: "combat_enlightenment",
      name: "战斗顿悟",
      description: "战斗经验获取翻倍",
      effect: (stats) => {
        stats.combatExpRate = (stats.combatExpRate || 1) * 2;
      },
    },
    {
      id: "crit_mastery",
      name: "会心",
      description: "暴击率提升30%，暴击伤害提升50%",
      effect: (stats) => {
        stats.critRate = (stats.critRate || 0) + 0.3;
        stats.critDamageBoost = (stats.critDamageBoost || 0) + 0.5;
      },
    },
    {
      id: "dodge_master",
      name: "无影",
      description: "闪避率提升40%",
      effect: (stats) => {
        stats.dodgeRate = (stats.dodgeRate || 0) + 0.4;
      },
    },
    {
      id: "spirit_link",
      name: "灵脉",
      description: "攻击时有30%概率额外造成灵力伤害",
      effect: (stats) => {
        stats.spiritDamageChance = 0.3;
      },
    },
    {
      id: "life_bond",
      name: "生命链接",
      description: "造成伤害时回复10%生命值",
      effect: (stats) => {
        stats.lifeSteal = (stats.lifeSteal || 0) + 0.1;
      },
    },
    {
      id: "realm_resonance",
      name: "境界共鸣",
      description: "基于当前境界提升20-50%属性",
      effect: (stats) => {
        const bonus = 0.2 + (stats.level || 1) * 0.01;
        const multiplier = 1 + bonus;
        stats.damage = (stats.damage || 0) * multiplier;
        stats.defense = (stats.defense || 0) * multiplier;
        stats.speed = (stats.speed || 0) * multiplier;
        stats.maxHealth = (stats.maxHealth || 0) * multiplier;
        stats.health = (stats.health || 0) * multiplier;
        stats.critRate = (stats.critRate || 0) * multiplier;
        stats.dodgeRate = (stats.dodgeRate || 0) * multiplier;
        stats.counterRate = (stats.counterRate || 0) * multiplier;
      },
    },
  ],
  epic: [
    {
      id: "immortal",
      name: "不死之身",
      description: "一次致命伤害免疫",
      effect: (stats) => {
        stats.immunityCount = (stats.immunityCount || 0) + 1;
      },
    },
    {
      id: "ultimate_power",
      name: "极限突破",
      description: "属性临时提升50%",
      effect: (stats) => {
        const multiplier = 1.5;
        stats.damage = (stats.damage || 0) * multiplier;
        stats.defense = (stats.defense || 0) * multiplier;
        stats.speed = (stats.speed || 0) * multiplier;
        stats.maxHealth = (stats.maxHealth || 0) * multiplier;
        stats.health = (stats.health || 0) * multiplier;
        stats.critRate = (stats.critRate || 0) * multiplier;
        stats.dodgeRate = (stats.dodgeRate || 0) * multiplier;
        stats.counterRate = (stats.counterRate || 0) * multiplier;
        stats.tempStatBonus = (stats.tempStatBonus || 0) + 0.5;
      },
    },
    {
      id: "realm_insight",
      name: "境界感悟",
      description: "立即获得大量修为",
      effect: (stats) => {
        if (
          stats.cultivation !== undefined &&
          stats.maxCultivation !== undefined
        ) {
          stats.cultivation = Math.min(
            stats.maxCultivation,
            stats.cultivation + stats.maxCultivation * 0.5
          );
        }
      },
    },
    {
      id: "divine_protection",
      name: "天道庇护",
      description: "获得三层护盾",
      effect: (stats) => {
        stats.shield = (stats.shield || 0) + 3;
      },
    },
    {
      id: "heaven_blessing",
      name: "天地眷顾",
      description: "所有增益效果提升100%",
      effect: (stats) => {
        stats.buffEffectiveness = (stats.buffEffectiveness || 1) * 2;
      },
    },
    {
      id: "immortal_insight",
      name: "仙人顿悟",
      description: "获得一个随机特殊效果，持续整个副本",
      effect: (stats) => {
        // 从特殊效果池中随机选择一个效果并应用
        const randomEffect =
          specialEffects[Math.floor(Math.random() * specialEffects.length)];
        if (randomEffect && typeof randomEffect.effect === "function") {
          randomEffect.effect(stats);
        }
      },
    },
  ],
};

// 获取随机选项
const getRandomOptions = (floor) => {
  // 基础概率设置
  let commonChance = 0.7;
  let rareChance = 0.25;
  let epicChance = 0.05;
  // 根据层数调整概率
  if (floor % 10 === 0) {
    // 每10层提高史诗品质概率
    commonChance = 0.5;
    rareChance = 0.3;
    epicChance = 0.2; // 提高史诗品质概率到20%
  } else if (floor % 5 === 0) {
    // 每5层提高稀有品质概率
    commonChance = 0.5;
    rareChance = 0.35; // 提高稀有品质概率到35%
    epicChance = 0.15;
  }
  const count = 3;
  const selected = [];
  const usedIds = new Set();
  while (selected.length < count) {
    // 为每个选项独立随机决定品质
    const rand = Math.random();
    let pool = "common";
    if (rand < epicChance) {
      pool = "epic";
    } else if (rand < epicChance + rareChance) {
      pool = "rare";
    }
    // 从选定的池中随机选择一个选项
    const options = roguelikeOptions[pool].filter(
      (opt) => !usedIds.has(opt.id)
    );
    if (options.length > 0) {
      const index = Math.floor(Math.random() * options.length);
      const option = options[index];
      option.type = pool;
      selected.push(option);
      usedIds.add(option.id);
    } else {
      // 如果当前品质池中没有可用选项，尝试其他品质池
      const allOptions = [
        ...roguelikeOptions.common,
        ...roguelikeOptions.rare,
        ...roguelikeOptions.epic,
      ].filter((opt) => !usedIds.has(opt.id));
      if (allOptions.length > 0) {
        const index = Math.floor(Math.random() * allOptions.length);
        const option = allOptions[index];
        option.type = pool;
        selected.push(option);
        usedIds.add(option.id);
      }
    }
  }
  return selected;
};

export {
  difficultyModifiers,
  specialEffects,
  roguelikeOptions,
  getRandomOptions,
};
