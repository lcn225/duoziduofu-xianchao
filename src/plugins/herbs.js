// 灵草品质配置
const HERB_QUALITIES = {
  legendary: {
    name: "仙品",
    color: "#ff9800",
    multiplier: 2.0,
    probability: 0.05,
  },
  epic: { name: "灵品", color: "#9c27b0", multiplier: 1.5, probability: 0.15 },
  rare: { name: "珍品", color: "#2196f3", multiplier: 1.2, probability: 0.3 },
  uncommon: {
    name: "普品",
    color: "#4caf50",
    multiplier: 1.0,
    probability: 0.5,
  },
};

// 灵草类型配置
const HERB_TYPES = {
  // 基础灵草
  commonSpirit: {
    name: "灵精草",
    baseValue: 10,
    tier: 1,
    description: "蕴含纯净灵气的基础灵草",
  },
  commonEssence: {
    name: "精元草",
    baseValue: 15,
    tier: 2,
    description: "富含精元之气的灵草",
  },
  // 进阶灵草
  spirit_grass: {
    name: "聚灵草",
    baseValue: 30,
    tier: 3,
    description: "能够聚集天地灵气的灵草",
  },
  cloud_flower: {
    name: "云雾花",
    baseValue: 40,
    tier: 4,
    description: "生长在云雾中的神秘灵花",
  },
  // 高级灵草
  thunder_root: {
    name: "雷根草",
    baseValue: 80,
    tier: 5,
    description: "吸收雷霆之力的珍贵灵草",
  },
  dragon_breath_herb: {
    name: "龙息草",
    baseValue: 100,
    tier: 6,
    description: "受龙气滋养的稀有灵草",
  },
};

// 采集概率计算
function calculateGatheringProbability(herbType, playerLevel, luck) {
  const herb = HERB_TYPES[herbType];
  if (!herb) return 0;
  // 基础采集概率
  let baseProb = 0.5 - herb.tier * 0.1;
  // 等级影响
  const levelDiff = playerLevel - herb.tier * 10;
  const levelMod =
    levelDiff >= 0
      ? Math.min(0.3, levelDiff * 0.02)
      : Math.max(-0.3, levelDiff * 0.03);
  // 幸运加成
  const luckMod = Math.sqrt(luck) * 0.05;
  // 最终概率
  return Math.min(0.95, Math.max(0.05, baseProb + levelMod + luckMod));
}

// 灵草品质判定
function determineHerbQuality(playerLevel, luck) {
  // 基础品质概率
  const baseProb = Math.random();
  // 幸运加成
  const luckBonus = Math.sqrt(luck) * 0.05;
  // 等级加成
  const levelBonus = Math.min(0.2, playerLevel * 0.01);
  // 最终概率
  const finalProb = baseProb + luckBonus + levelBonus;
  // 品质判定
  if (finalProb > 0.95) return "legendary";
  if (finalProb > 0.8) return "epic";
  if (finalProb > 0.5) return "rare";
  return "uncommon";
}

// 随机获取灵草
function getRandomHerb(playerLevel = 1, luck = 1) {
  // 获取所有可用的灵草类型
  const availableHerbs = Object.entries(HERB_TYPES).filter(
    ([_, herb]) => playerLevel >= herb.tier * 5 // 确保玩家等级足够
  );
  if (availableHerbs.length === 0) return null;
  // 根据稀有度和等级计算每种灵草的权重
  const weights = availableHerbs.map(([_, herb]) => {
    const tierDiff = playerLevel - herb.tier * 5;
    const baseWeight = 1 / Math.pow(2, herb.tier - 1); // 更高级的草药基础权重更低
    const levelBonus = Math.max(0, tierDiff * 0.05);
    return Math.max(0.1, baseWeight + levelBonus);
  });
  // 计算总权重
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  // 随机选择一种灵草
  let random = Math.random() * totalWeight;
  let cumulativeWeight = 0;
  for (let i = 0; i < availableHerbs.length; i++) {
    cumulativeWeight += weights[i];
    if (random <= cumulativeWeight) {
      const [herbId, herbData] = availableHerbs[i];
      // 决定品质
      const quality = determineHerbQuality(playerLevel, luck);
      // 计算价值
      const qualityMultiplier = HERB_QUALITIES[quality].multiplier;
      const value = Math.round(
        herbData.baseValue * qualityMultiplier * (1 + playerLevel * 0.1)
      );
      return {
        id: herbId,
        name: herbData.name,
        description: herbData.description,
        quality,
        value,
        tier: herbData.tier,
      };
    }
  }
  return null;
}

// 添加炼丹用的灵草配置
const herbs = [
  {
    id: "commonSpirit",
    name: "灵精草",
    description: "蕴含纯净灵气的基础灵草",
    tier: 1,
    alchemyValue: 10,
    effects: ["cultivationRate", "spiritRate"],
    chance: 0.3,
  },
  {
    id: "commonEssence",
    name: "精元草",
    description: "富含精元之气的灵草",
    tier: 2,
    alchemyValue: 15,
    effects: ["health", "defense"],
    chance: 0.3,
  },
  {
    id: "spirit_grass",
    name: "聚灵草",
    description: "能够聚集天地灵气的灵草",
    tier: 3,
    alchemyValue: 30,
    effects: ["cultivationRate", "spiritCap"],
    chance: 0.2,
  },
  {
    id: "cloud_flower",
    name: "云雾花",
    description: "生长在云雾中的神秘灵花",
    tier: 4,
    alchemyValue: 40,
    effects: ["speed", "dodgeRate"],
    chance: 0.2,
  },
  {
    id: "thunder_root",
    name: "雷根草",
    description: "吸收雷霆之力的珍贵灵草",
    tier: 5,
    alchemyValue: 80,
    effects: ["attack", "critRate"],
    chance: 0.15,
  },
  {
    id: "dragon_breath_herb",
    name: "龙息草",
    description: "受龙气滋养的稀有灵草",
    tier: 6,
    alchemyValue: 100,
    effects: ["allAttributes", "combatBoost"],
    chance: 0.1,
  },
  {
    id: "frost_lotus",
    name: "寒霜莲",
    description: "生长在极寒之地的奇异莲花",
    tier: 7,
    alchemyValue: 90,
    effects: ["defense", "resistanceBoost"],
    chance: 0.12,
  },
  {
    id: "fire_heart_flower",
    name: "火心花",
    description: "生长在火山中的炽热花朵",
    tier: 7,
    alchemyValue: 85,
    effects: ["attack", "fireAttribute"],
    chance: 0.12,
  },
  {
    id: "nine_leaf_lingzhi",
    name: "九叶灵芝",
    description: "传说中的九叶灵芝，蕴含强大生机",
    tier: 7,
    alchemyValue: 120,
    effects: ["health", "healBoost"],
    chance: 0.08,
  },
  {
    id: "purple_ginseng",
    name: "紫参",
    description: "千年紫参，可大幅提升修炼效率",
    tier: 7,
    alchemyValue: 150,
    effects: ["cultivationEfficiency", "comprehension"],
    chance: 0.08,
  },
];

// 1. 灵草合并函数
function mergeHerbs(herb1, herb2) {
  if (herb1.id !== herb2.id || herb1.quality !== herb2.quality) {
    return null;
  }

  return {
    ...herb1,
    value: Math.round((herb1.value + herb2.value) * 1.1), // 合并有10%加成
  };
}

// 2. 灵草分解函数
function decomposeHerb(herb) {
  const qualityMultiplier = HERB_QUALITIES[herb.quality].multiplier;
  const baseValue = Math.floor(herb.value / qualityMultiplier);
  return {
    spiritStones: Math.round(baseValue * 0.5),
    fragments: Math.round(baseValue * 0.3),
  };
}

// 3. 灵草升级函数
function upgradeHerbQuality(herb, luck = 1) {
  const qualities = Object.keys(HERB_QUALITIES);
  const currentIndex = qualities.indexOf(herb.quality);
  if (currentIndex >= qualities.length - 1) return null;

  const upgradeChance = 0.1 + Math.sqrt(luck) * 0.05;
  if (Math.random() > upgradeChance) return null;

  const newQuality = qualities[currentIndex + 1];
  return {
    ...herb,
    quality: newQuality,
    value: Math.round(herb.value * HERB_QUALITIES[newQuality].multiplier),
  };
}

export {
  HERB_QUALITIES,
  HERB_TYPES,
  calculateGatheringProbability,
  determineHerbQuality,
  getRandomHerb,
  herbs,
  mergeHerbs,
  decomposeHerb,
  upgradeHerbQuality,
};
