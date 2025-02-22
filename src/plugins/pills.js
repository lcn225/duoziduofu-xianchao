// 丹药品阶
export const pillGrades = {
  grade1: { name: "一品", difficulty: 1, successRate: 0.9 },
  grade2: { name: "二品", difficulty: 1.2, successRate: 0.8 },
  grade3: { name: "三品", difficulty: 1.5, successRate: 0.7 },
  grade4: { name: "四品", difficulty: 2, successRate: 0.6 },
  grade5: { name: "五品", difficulty: 2.5, successRate: 0.5 },
  grade6: { name: "六品", difficulty: 3, successRate: 0.4 },
  grade7: { name: "七品", difficulty: 4, successRate: 0.3 },
  grade8: { name: "八品", difficulty: 5, successRate: 0.2 },
  grade9: { name: "九品", difficulty: 6, successRate: 0.1 },
};

// 丹药类型
export const pillTypes = {
  spirit: { name: "灵力类", effectMultiplier: 1 },
  cultivation: { name: "修炼类", effectMultiplier: 1.2 },
  attribute: { name: "属性类", effectMultiplier: 1.5 },
  special: { name: "特殊类", effectMultiplier: 2 },
};

// 根据品阶计算所需残页数量
const getFragmentsNeeded = (grade) => {
  const gradeNumber = parseInt(grade.replace("grade", ""));
  return 5 * gradeNumber + 5; // 一品10个，二品15个，以此类推
};

// 丹药品质设置
const PILL_QUALITIES = {
  legendary: {
    name: "极品",
    color: "#ff9800",
    effectMultiplier: 2.0,
    probability: 0.05,
  },
  epic: {
    name: "上品",
    color: "#9c27b0",
    effectMultiplier: 1.5,
    probability: 0.15,
  },
  rare: {
    name: "中品",
    color: "#2196f3",
    effectMultiplier: 1.2,
    probability: 0.3,
  },
  uncommon: {
    name: "下品",
    color: "#4caf50",
    effectMultiplier: 1.0,
    probability: 0.5,
  },
};

// 丹药效果类型配置
const PILL_EFFECTS = {
  // 修炼相关
  cultivationRate: {
    name: "聚灵",
    description: "提升修炼速度",
    maxValue: 5.0, // 最大500%提升
    baseValue: 0.2, // 基础20%提升
    scaling: 0.1, // 每境界增加10%
    duration: 3600, // 1小时
  },
  spiritRate: {
    name: "凝神",
    description: "提升灵力获取",
    maxValue: 5.0,
    baseValue: 0.2,
    scaling: 0.1,
    duration: 3600,
  },
  // 战斗属性
  attack: {
    name: "增力",
    description: "提升攻击力",
    maxValue: 10000,
    baseValue: 50,
    scaling: 0.15,
    duration: 1800, // 30分钟
  },
  defense: {
    name: "固体",
    description: "提升防御力",
    maxValue: 10000,
    baseValue: 30,
    scaling: 0.15,
    duration: 1800,
  },
  health: {
    name: "养元",
    description: "提升生命值",
    maxValue: 50000,
    baseValue: 100,
    scaling: 0.15,
    duration: 1800,
  },
  speed: {
    name: "轻身",
    description: "提升速度",
    maxValue: 1000,
    baseValue: 20,
    scaling: 0.1,
    duration: 1800,
  },
  // 战斗特效
  critRate: {
    name: "锐意",
    description: "提升暴击率",
    maxValue: 0.75,
    baseValue: 0.05,
    scaling: 0.01,
    duration: 1800,
  },
  critDamageBoost: {
    name: "破击",
    description: "提升暴击伤害",
    maxValue: 2.0,
    baseValue: 0.1,
    scaling: 0.05,
    duration: 1800,
  },
  // 添加新的效果类型
  spiritCap: {
    name: "聚灵",
    description: "提升灵力上限",
    maxValue: 10.0,
    baseValue: 0.3,
    scaling: 0.1,
    duration: 3600,
  },
  spiritRecovery: {
    name: "回灵",
    description: "提升灵力恢复速度",
    maxValue: 5.0,
    baseValue: 0.2,
    scaling: 0.1,
    duration: 1800,
  },
  cultivationEfficiency: {
    name: "凝元",
    description: "提升修炼效率",
    maxValue: 5.0,
    baseValue: 0.2,
    scaling: 0.1,
    duration: 2400,
  },
  comprehension: {
    name: "悟道",
    description: "提升悟性",
    maxValue: 3.0,
    baseValue: 0.1,
    scaling: 0.05,
    duration: 3600,
  },
  autoHeal: {
    name: "自愈",
    description: "战斗中自动恢复生命",
    maxValue: 0.2,
    baseValue: 0.05,
    scaling: 0.01,
    duration: 1800,
  },
  fireAttribute: {
    name: "火灵",
    description: "提升火属性修炼速度",
    maxValue: 3.0,
    baseValue: 0.2,
    scaling: 0.1,
    duration: 2400,
  },
};

// 丹药配方
const pillRecipes = [
  {
    id: "basicCultivation",
    name: "聚灵丹",
    description: "基础的修炼辅助丹药",
    effect: {
      type: "cultivationRate",
      value: 0.2,
      duration: 3600,
    },
    materials: [
      { herb: "commonSpirit", count: 2 },
      { herb: "commonEssence", count: 1 },
    ],
    fragmentsNeeded: 3,
    difficulty: 1.0,
  },
  {
    id: "spirit_gathering",
    name: "聚灵丹",
    description: "提升灵力恢复速度的丹药",
    grade: "grade1",
    type: "spirit",
    materials: [
      { herb: "spirit_grass", count: 2 },
      { herb: "cloud_flower", count: 1 },
    ],
    fragmentsNeeded: getFragmentsNeeded("grade1"),
    baseEffect: {
      type: "spiritRate",
      value: 0.2,
      duration: 3600,
    },
  },
  {
    id: "cultivation_boost",
    name: "聚气丹",
    description: "提升修炼速度的丹药",
    grade: "grade2",
    type: "cultivation",
    materials: [
      { herb: "cloud_flower", count: 2 },
      { herb: "thunder_root", count: 1 },
    ],
    fragmentsNeeded: getFragmentsNeeded("grade2"),
    baseEffect: {
      type: "cultivationRate",
      value: 0.3,
      duration: 1800,
    },
  },
  {
    id: "thunder_power",
    name: "雷灵丹",
    description: "提升战斗属性的丹药",
    grade: "grade3",
    type: "attribute",
    materials: [
      { herb: "thunder_root", count: 2 },
      { herb: "dragon_breath_herb", count: 1 },
    ],
    fragmentsNeeded: getFragmentsNeeded("grade3"),
    baseEffect: {
      type: "combatBoost",
      value: 0.4,
      duration: 900,
    },
  },
  {
    id: "immortal_essence",
    name: "仙灵丹",
    description: "全属性提升的神奇丹药",
    grade: "grade4",
    type: "special",
    materials: [
      { herb: "dragon_breath_herb", count: 2 },
      { herb: "immortal_jade_grass", count: 1 },
    ],
    fragmentsNeeded: getFragmentsNeeded("grade4"),
    baseEffect: {
      type: "allAttributes",
      value: 0.5,
      duration: 600,
    },
  },
  {
    id: "five_elements_pill",
    name: "五行丹",
    description: "融合五行之力的神奇丹药，全面提升修炼者素质",
    grade: "grade5",
    type: "attribute",
    materials: [
      { herb: "five_elements_grass", count: 2 },
      { herb: "phoenix_feather_herb", count: 1 },
    ],
    fragmentsNeeded: getFragmentsNeeded("grade5"),
    baseEffect: {
      type: "allAttributes",
      value: 0.8,
      duration: 1200,
    },
  },
  {
    id: "celestial_essence_pill",
    name: "天元丹",
    description: "凝聚天地精华的极品丹药，大幅提升修炼速度",
    grade: "grade6",
    type: "cultivation",
    materials: [
      { herb: "celestial_dew_grass", count: 2 },
      { herb: "moonlight_orchid", count: 1 },
    ],
    fragmentsNeeded: getFragmentsNeeded("grade6"),
    baseEffect: {
      type: "cultivationRate",
      value: 1.0,
      duration: 1800,
    },
  },
  {
    id: "sun_moon_pill",
    name: "日月丹",
    description: "融合日月精华的丹药，能大幅提升灵力上限",
    grade: "grade7",
    type: "spirit",
    materials: [
      { herb: "sun_essence_flower", count: 2 },
      { herb: "moonlight_orchid", count: 2 },
    ],
    fragmentsNeeded: getFragmentsNeeded("grade7"),
    baseEffect: {
      type: "spiritCap",
      value: 1.5,
      duration: 2400,
    },
  },
  {
    id: "phoenix_rebirth_pill",
    name: "涅槃丹",
    description: "蕴含不死凤凰之力的神丹，能在战斗中自动恢复生命",
    grade: "grade8",
    type: "special",
    materials: [
      { herb: "phoenix_feather_herb", count: 3 },
      { herb: "celestial_dew_grass", count: 1 },
    ],
    fragmentsNeeded: getFragmentsNeeded("grade8"),
    baseEffect: {
      type: "autoHeal",
      value: 0.1,
      duration: 3600,
    },
  },
  {
    id: "spirit_recovery",
    name: "回灵丹",
    description: "快速恢复灵力的丹药",
    grade: "grade2",
    type: "spirit",
    materials: [
      { herb: "dark_yin_grass", count: 2 },
      { herb: "frost_lotus", count: 1 },
    ],
    fragmentsNeeded: getFragmentsNeeded("grade2"),
    baseEffect: {
      type: "spiritRecovery",
      value: 0.4,
      duration: 1200,
    },
  },
  {
    id: "essence_condensation",
    name: "凝元丹",
    description: "提升修炼效率的高级丹药",
    grade: "grade3",
    type: "cultivation",
    materials: [
      { herb: "nine_leaf_lingzhi", count: 2 },
      { herb: "purple_ginseng", count: 1 },
    ],
    fragmentsNeeded: getFragmentsNeeded("grade3"),
    baseEffect: {
      type: "cultivationEfficiency",
      value: 0.5,
      duration: 1500,
    },
  },
  {
    id: "mind_clarity",
    name: "清心丹",
    description: "提升心境和悟性的丹药",
    grade: "grade3",
    type: "special",
    materials: [
      { herb: "frost_lotus", count: 2 },
      { herb: "fire_heart_flower", count: 1 },
    ],
    fragmentsNeeded: getFragmentsNeeded("grade3"),
    baseEffect: {
      type: "comprehension",
      value: 0.3,
      duration: 2400,
    },
  },
  {
    id: "fire_essence",
    name: "火元丹",
    description: "提升火属性修炼速度的丹药",
    grade: "grade4",
    type: "attribute",
    materials: [
      { herb: "fire_heart_flower", count: 2 },
      { herb: "dragon_breath_herb", count: 1 },
    ],
    fragmentsNeeded: getFragmentsNeeded("grade4"),
    baseEffect: {
      type: "fireAttribute",
      value: 0.6,
      duration: 1800,
    },
  },
];

// 计算效果值
function calculateEffectValue(effectType, quality) {
  const effect = PILL_EFFECTS[effectType];
  if (!effect) return 0;

  const qualityMultipliers = {
    common: 1,
    uncommon: 1.2,
    rare: 1.5,
    epic: 2.0,
    legendary: 3.0,
  };

  return Math.min(
    effect.maxValue,
    effect.baseValue * qualityMultipliers[quality]
  );
}

// 计算丹药效果
function calculatePillEffect(recipe, playerLevel, quality = "uncommon") {
  const effectConfig = PILL_EFFECTS[recipe.effect.type];
  if (!effectConfig) return recipe.effect;

  // 基础效果
  let value = effectConfig.baseValue;

  // 境界加成
  const realmBonus = 1 + playerLevel * effectConfig.scaling;
  value *= realmBonus;

  // 品质加成
  const qualityMultiplier = PILL_QUALITIES[quality].effectMultiplier;
  value *= qualityMultiplier;

  // 确保不超过上限
  value = Math.min(value, effectConfig.maxValue);

  // 对百分比类型的属性进行特殊处理
  if (
    ["cultivationRate", "spiritRate", "critRate", "critDamageBoost"].includes(
      recipe.effect.type
    )
  ) {
    value = Number(value.toFixed(3));
  } else {
    value = Math.round(value);
  }

  return {
    type: recipe.effect.type,
    value: value,
    duration: recipe.effect.duration,
    quality: quality,
    successRate: calculatePillSuccess(recipe, playerLevel),
  };
}

// 计算丹药成功率
function calculatePillSuccess(recipe, playerLevel) {
  const baseRate = 0.6;
  const levelBonus = Math.min(0.2, playerLevel * 0.01);
  const difficultyPenalty = (recipe.difficulty - 1) * 0.1;

  return Math.min(
    0.95,
    Math.max(0.1, baseRate + levelBonus - difficultyPenalty)
  );
}

// 尝试炼制丹药
function tryCreatePill(recipe, herbs, player, fragments = 0, luckModifier = 1) {
  // 检查材料是否足够
  for (const material of recipe.materials) {
    const herbCount = herbs.filter((h) => h.id === material.herb).length;
    if (herbCount < material.count) {
      return {
        success: false,
        message: "材料不足",
      };
    }
  }

  // 计算成功率
  let baseSuccess = 0.5; // 基础50%成功率
  const fragmentBonus = fragments * 0.1; // 每个残页增加10%成功率
  const levelBonus = Math.min(0.3, player.level * 0.02); // 每境界增加2%，最多30%
  const luckBonus = (luckModifier - 1) * 0.5; // 幸运加成

  let successRate = Math.min(
    0.95,
    baseSuccess + fragmentBonus + levelBonus + luckBonus
  );

  // 决定是否炼制成功
  if (Math.random() > successRate) {
    // 失败时有机会获得丹方残页
    if (Math.random() < 0.3) {
      // 30%概率获得残页
      return {
        success: false,
        message: "炼制失败，但获得了一页丹方残页",
        gainFragment: true,
      };
    }
    return {
      success: false,
      message: "炼制失败",
    };
  }

  // 决定丹药品质
  let quality = "uncommon";
  const qualityRoll = Math.random() * luckModifier; // 应用幸运加成
  for (const [q, config] of Object.entries(PILL_QUALITIES)) {
    if (qualityRoll <= config.probability) {
      quality = q;
      break;
    }
  }

  // 计算丹药效果
  const effect = calculatePillEffect(recipe, player.level, quality);

  return {
    success: true,
    message: `炼制成功！获得了${PILL_QUALITIES[quality].name}品质的${recipe.name}`,
    quality: quality,
    effect: effect,
  };
}

// 移除之前的单独导出，统一在文件末尾导出所有内容
export {
  PILL_QUALITIES,
  PILL_EFFECTS,
  pillRecipes,
  calculateEffectValue,
  calculatePillEffect,
  calculatePillSuccess,
  tryCreatePill,
};
