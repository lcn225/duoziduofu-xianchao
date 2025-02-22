// 装备强化和洗练相关配置

// 强化等级配置
const enhanceConfig = {
  baseSuccessRate: 0.95, // 基础成功率
  costPerLevel: 10, // 每级基础消耗的强化石数量
  // 不同品质的成长系数
  qualityGrowth: {
    legendary: {
      // 传说
      baseMultiplier: 1.8,
      levelGrowth: 0.025,
      costMultiplier: 2.0,
    },
    epic: {
      // 史诗
      baseMultiplier: 1.5,
      levelGrowth: 0.02,
      costMultiplier: 1.5,
    },
    rare: {
      // 稀有
      baseMultiplier: 1.3,
      levelGrowth: 0.015,
      costMultiplier: 1.2,
    },
    uncommon: {
      // 优秀
      baseMultiplier: 1.15,
      levelGrowth: 0.012,
      costMultiplier: 1.0,
    },
    common: {
      // 普通
      baseMultiplier: 1.0,
      levelGrowth: 0.01,
      costMultiplier: 0.8,
    },
  },
  // 属性上限配置
  statCaps: {
    // 基础属性上限
    attack: 100000,
    defense: 100000,
    health: 1000000,
    speed: 10000,
    // 战斗属性上限
    critRate: 0.75,
    comboRate: 0.6,
    counterRate: 0.6,
    stunRate: 0.5,
    dodgeRate: 0.65,
    vampireRate: 0.4,
    // 特殊属性上限
    healBoost: 1.0,
    critDamageBoost: 2.0,
    critDamageReduce: 0.75,
    finalDamageBoost: 1.0,
    finalDamageReduce: 0.75,
    combatBoost: 1.0,
    resistanceBoost: 1.0,
    // 修炼相关上限
    cultivationRate: 5.0,
    spiritRate: 5.0,
    luck: 3.0,
  },
};

// 洗练配置
const reforgeConfig = {
  costPerAttempt: 50, // 每次洗练基础消耗的灵石数量
  // 不同品质的洗练参数
  qualityParams: {
    legendary: {
      minVariation: -0.2, // 最小属性变化（-20%）
      maxVariation: 0.4, // 最大属性变化（+40%）
      newStatChance: 0.4, // 更换属性的概率（40%）
      costMultiplier: 2.0, // 消耗倍率
    },
    epic: {
      minVariation: -0.25,
      maxVariation: 0.35,
      newStatChance: 0.35,
      costMultiplier: 1.5,
    },
    rare: {
      minVariation: -0.3,
      maxVariation: 0.3,
      newStatChance: 0.3,
      costMultiplier: 1.2,
    },
    uncommon: {
      minVariation: -0.35,
      maxVariation: 0.25,
      newStatChance: 0.25,
      costMultiplier: 1.0,
    },
    common: {
      minVariation: -0.4,
      maxVariation: 0.2,
      newStatChance: 0.2,
      costMultiplier: 0.8,
    },
  },
};

// 可洗练的属性池
const reforgeableStats = {
  weapon: ["attack", "critRate", "critDamageBoost"],
  head: ["defense", "health", "stunResist"],
  body: ["defense", "health", "finalDamageReduce"],
  legs: ["defense", "speed", "dodgeRate"],
  feet: ["defense", "speed", "dodgeRate"],
  shoulder: ["defense", "health", "counterRate"],
  hands: ["attack", "critRate", "comboRate"],
  wrist: ["defense", "counterRate", "vampireRate"],
  necklace: ["health", "healBoost", "spiritRate"],
  ring1: ["attack", "critDamageBoost", "finalDamageBoost"],
  ring2: ["defense", "critDamageReduce", "resistanceBoost"],
  belt: ["health", "defense", "combatBoost"],
  artifact: ["cultivationRate", "spiritRate", "luck"],
};

// 强化装备
function enhanceEquipment(equipment, playerReinforceStones) {
  if (!equipment || !equipment.stats) {
    return { success: false, message: "无效的装备" };
  }

  const currentLevel = equipment.enhanceLevel || 0;
  const growthSettings = enhanceConfig.qualityGrowth[equipment.quality];

  // 计算本次强化消耗
  const baseCost = enhanceConfig.costPerLevel * growthSettings.costMultiplier;
  const levelFactor = Math.pow(1.15, Math.floor(currentLevel / 5));
  const cost = Math.round(baseCost * levelFactor);

  if (playerReinforceStones < cost) {
    return { success: false, message: "强化石不足" };
  }

  // 计算成功率
  const successRate = Math.max(
    0.1,
    enhanceConfig.baseSuccessRate - currentLevel * 0.03
  );
  const isSuccess = Math.random() < successRate;

  if (!isSuccess) {
    return {
      success: false,
      message: "强化失败",
      cost,
      oldStats: { ...equipment.stats },
      newStats: { ...equipment.stats },
    };
  }

  // 保存旧属性用于对比
  const oldStats = { ...equipment.stats };

  // 计算属性提升
  const levelGrowth = growthSettings.levelGrowth / Math.sqrt(currentLevel + 1);
  const growthFactor = 1 + levelGrowth / Math.log10(currentLevel + 10);

  // 提升装备属性
  Object.entries(equipment.stats).forEach(([stat, value]) => {
    if (typeof value === "number") {
      let newValue = value * growthFactor;

      // 检查是否是百分比属性
      if (
        [
          "critRate",
          "comboRate",
          "counterRate",
          "stunRate",
          "dodgeRate",
          "vampireRate",
          "healBoost",
          "critDamageBoost",
          "critDamageReduce",
          "finalDamageBoost",
          "finalDamageReduce",
          "combatBoost",
          "resistanceBoost",
          "cultivationRate",
          "spiritRate",
          "luck",
        ].includes(stat)
      ) {
        // 百分比属性使用较小的增长并限制上限
        newValue = Math.min(
          value + levelGrowth * 0.1,
          enhanceConfig.statCaps[stat]
        );
      } else {
        // 基础属性使用正常增长并限制上限
        newValue = Math.min(Math.round(newValue), enhanceConfig.statCaps[stat]);
      }
      equipment.stats[stat] = newValue;
    }
  });

  // 更新强化等级
  equipment.enhanceLevel = currentLevel + 1;

  return {
    success: true,
    message: "强化成功",
    cost,
    oldStats,
    newStats: equipment.stats,
    newLevel: equipment.enhanceLevel,
  };
}

// 洗练装备
function reforgeEquipment(
  equipment,
  playerSpiritStones,
  confirmNewStats = true
) {
  if (!equipment || !equipment.stats || !equipment.type) {
    return { success: false, message: "无效的装备" };
  }

  const params = reforgeConfig.qualityParams[equipment.quality];
  const cost = Math.round(reforgeConfig.costPerAttempt * params.costMultiplier);

  if (playerSpiritStones < cost) {
    return { success: false, message: "灵石不足" };
  }

  const oldStats = { ...equipment.stats };
  const availableStats = reforgeableStats[equipment.type];
  const tempStats = { ...equipment.stats };
  const originStats = Object.keys(tempStats);

  // 生成要处理的属性索引（1-3个随机）
  const modifyCount = Math.floor(Math.random() * 3) + 1;
  const modifyIndexes = [
    ...new Set(
      Array.from({ length: modifyCount }, () =>
        Math.floor(Math.random() * originStats.length)
      )
    ),
  ].slice(0, 3);

  modifyIndexes.forEach((index) => {
    const originStat = originStats[index];
    let currentStat = originStat;
    const baseValue = tempStats[originStat];

    // 尝试替换属性
    if (Math.random() < params.newStatChance) {
      const availableNew = availableStats.filter(
        (s) => !originStats.includes(s) && s !== originStat
      );
      if (availableNew.length > 0) {
        const newStat =
          availableNew[Math.floor(Math.random() * availableNew.length)];
        delete tempStats[originStat];
        currentStat = newStat;
      }
    }

    // 调整数值
    const delta =
      params.minVariation +
      Math.random() * (params.maxVariation - params.minVariation);
    let newValue = baseValue * (1 + delta);

    // 根据属性类型处理数值精度和上限
    if (
      [
        "critRate",
        "comboRate",
        "counterRate",
        "stunRate",
        "dodgeRate",
        "vampireRate",
        "healBoost",
        "critDamageBoost",
        "critDamageReduce",
        "finalDamageBoost",
        "finalDamageReduce",
        "combatBoost",
        "resistanceBoost",
        "cultivationRate",
        "spiritRate",
        "luck",
      ].includes(currentStat)
    ) {
      newValue = Math.min(
        Number(newValue.toFixed(3)),
        enhanceConfig.statCaps[currentStat]
      );
    } else {
      newValue = Math.min(
        Math.round(newValue),
        enhanceConfig.statCaps[currentStat]
      );
    }

    tempStats[currentStat] = Math.max(
      newValue,
      baseValue * (1 + params.minVariation)
    );
  });

  // 强制属性数量校验
  if (Object.keys(tempStats).length !== originStats.length) {
    console.error("属性数量异常", { old: originStats, new: tempStats });
    return {
      success: false,
      message: "洗练过程出现异常",
      cost: 0,
      oldStats,
      newStats: oldStats,
    };
  }

  if (confirmNewStats) {
    equipment.stats = { ...tempStats };
  }

  return {
    success: true,
    message: confirmNewStats ? "洗练成功" : "保留原有属性",
    cost,
    oldStats,
    newStats: tempStats,
    confirmed: confirmNewStats,
  };
}

export {
  enhanceConfig,
  reforgeConfig,
  reforgeableStats,
  enhanceEquipment,
  reforgeEquipment,
};
