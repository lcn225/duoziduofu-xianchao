import { HERB_TYPES } from "./herbs";

// 地点等级和解锁条件
const LOCATION_TIERS = {
  tier1: { minLevel: 1, maxLevel: 9, difficultyMod: 1.0 },
  tier2: { minLevel: 18, maxLevel: 27, difficultyMod: 1.3 },
  tier3: { minLevel: 31, maxLevel: 51, difficultyMod: 1.6 },
  tier4: { minLevel: 52, maxLevel: 63, difficultyMod: 2.0 },
  tier5: { minLevel: 81, maxLevel: 99, difficultyMod: 2.5 },
  tier6: { minLevel: 108, maxLevel: 116, difficultyMod: 3.0 },
  tier7: { minLevel: 117, maxLevel: 126, difficultyMod: 3.5 },
};

// 地点配置
const locations = [
  {
    id: "novice_village",
    name: "新手村",
    tier: "tier1",
    description: "适合初入修仙的修士探索",
    baseHerbRate: 1.0,
    baseEventRate: 0.3,
    specialEvents: ["ancient_tablet", "spirit_spring"],
    herbTypes: ["commonSpirit", "commonEssence"],
    eventTypes: ["basic_encounter", "small_fortune"],
    rewards: {
      spiritStones: { min: 10, max: 50 },
      herbs: { min: 1, max: 3 },
      items: { probability: 0.1 },
    },
  },
  {
    id: "spirit_forest",
    name: "灵木林",
    tier: "tier2",
    description: "充满灵气的森林",
    baseHerbRate: 1.2,
    baseEventRate: 0.4,
    specialEvents: ["spirit_spring", "enlightenment", "treasure_trove"],
    herbTypes: ["spirit_grass", "cloud_flower"],
    eventTypes: ["herb_encounter", "small_fortune", "basic_encounter"],
    rewards: {
      spiritStones: { min: 30, max: 100 },
      herbs: { min: 2, max: 4 },
      items: { probability: 0.15 },
    },
  },
  {
    id: "thunder_peak",
    name: "雷峰",
    tier: "tier3",
    description: "蕴含雷属性灵气的山峰",
    baseHerbRate: 1.1,
    baseEventRate: 0.5,
    specialEvents: [
      "ancient_formation",
      "thunder_enlightenment",
      "ancient_master",
    ],
    herbTypes: ["thunder_root", "lightning_flower"],
    eventTypes: ["thunder_trial", "medium_fortune", "cultivation_spot"],
    rewards: {
      spiritStones: { min: 80, max: 200 },
      herbs: { min: 2, max: 5 },
      items: { probability: 0.2 },
    },
  },
  {
    id: "celestial_mountain",
    name: "天阙峰",
    tier: "tier4",
    description: "云雾缭绕的仙山，传说是远古仙人讲道之地",
    baseHerbRate: 1.3,
    baseEventRate: 0.6,
    specialEvents: [
      "secret_realm",
      "celestial_enlightenment",
      "ancient_inheritance",
    ],
    herbTypes: ["celestial_grass", "cloud_essence"],
    eventTypes: ["cultivation_spot", "major_fortune"],
    rewards: {
      spiritStones: { min: 100, max: 300 },
      herbs: { min: 3, max: 6 },
      items: { probability: 0.25 },
    },
  },
  {
    id: "phoenix_valley",
    name: "凤凰谷",
    tier: "tier5",
    description: "常年被火焰环绕的神秘山谷，据说有凤凰遗留的道韵",
    baseHerbRate: 1.4,
    baseEventRate: 0.65,
    specialEvents: ["phoenix_inheritance", "fire_enlightenment"],
    herbTypes: ["fire_essence", "phoenix_grass"],
    eventTypes: ["major_fortune", "cultivation_spot"],
    rewards: {
      spiritStones: { min: 150, max: 400 },
      herbs: { min: 3, max: 7 },
      items: { probability: 0.3 },
    },
  },
  {
    id: "dragon_abyss",
    name: "龙渊",
    tier: "tier6",
    description: "深不见底的神秘深渊，蕴含远古真龙的气息",
    baseHerbRate: 1.5,
    baseEventRate: 0.7,
    specialEvents: ["dragon_inheritance", "water_enlightenment"],
    herbTypes: ["dragon_grass", "abyss_flower"],
    eventTypes: ["major_fortune", "cultivation_spot"],
    rewards: {
      spiritStones: { min: 200, max: 500 },
      herbs: { min: 4, max: 8 },
      items: { probability: 0.35 },
    },
  },
  {
    id: "immortal_realm",
    name: "仙界入口",
    tier: "tier7",
    description: "传说中通往仙界的神秘之地，充满无尽机缘",
    baseHerbRate: 1.6,
    baseEventRate: 0.75,
    specialEvents: ["immortal_inheritance", "heavenly_enlightenment"],
    herbTypes: ["immortal_grass", "heaven_flower"],
    eventTypes: ["major_fortune", "cultivation_spot"],
    rewards: {
      spiritStones: { min: 300, max: 800 },
      herbs: { min: 5, max: 10 },
      items: { probability: 0.4 },
    },
  },
];

// 计算实际获取概率（考虑幸运值）
export const calculateRewardChance = (baseChance, luck = 1) => {
  return Math.min(baseChance * luck, 1); // 确保概率不超过100%
};

// 探索奖励计算
function calculateExplorationRewards(location, playerLevel, luck) {
  const tier = LOCATION_TIERS[location.tier];
  const levelDiff = playerLevel - tier.minLevel;
  // 基础奖励倍率
  let baseMultiplier = 1 + levelDiff * 0.05;
  if (levelDiff < 0) {
    // 等级不足时降低收益
    baseMultiplier = Math.max(0.5, 1 + levelDiff * 0.1);
  }
  // 幸运值影响
  const luckBonus = Math.sqrt(luck) * 0.1;

  // 计算最终奖励
  return {
    spiritStones: {
      min: Math.round(
        location.rewards.spiritStones.min * baseMultiplier * (1 + luckBonus)
      ),
      max: Math.round(
        location.rewards.spiritStones.max * baseMultiplier * (1 + luckBonus)
      ),
    },
    herbs: {
      min: location.rewards.herbs.min,
      max: Math.round(location.rewards.herbs.max * (1 + luckBonus)),
    },
    itemProbability: Math.min(
      0.8,
      location.rewards.items.probability * (1 + luckBonus)
    ),
  };
}

// 添加缺失的功能
// 1. 地点解锁条件检查
function checkLocationRequirements(location, playerLevel, unlockedLocations) {
  const tier = LOCATION_TIERS[location.tier];
  if (!tier) return false;
  // 检查等级要求
  if (playerLevel < tier.minLevel) return false;
  // 检查前置地点要求
  if (location.requires) {
    if (!location.requires.every((loc) => unlockedLocations.includes(loc))) {
      return false;
    }
  }
  return true;
}

// 2. 地点特殊事件概率
function calculateSpecialEventProbability(location, playerLevel, luck) {
  const tier = LOCATION_TIERS[location.tier];
  const baseProb = location.baseEventRate || 0.1;
  const levelDiff = playerLevel - tier.minLevel;
  const levelBonus = Math.min(0.2, levelDiff * 0.01);
  const luckBonus = Math.sqrt(luck) * 0.05;
  return Math.min(0.8, baseProb + levelBonus + luckBonus);
}

// 3. 地点灵草刷新
function refreshLocationHerbs(location, playerLevel) {
  const tier = LOCATION_TIERS[location.tier];
  const herbList = [];
  location.herbTypes.forEach((herbId) => {
    const herb = HERB_TYPES[herbId];
    if (herb && herb.tier <= tier.maxLevel) {
      herbList.push({
        id: herbId,
        name: herb.name,
        description: herb.description,
        tier: herb.tier,
        refreshTime: Date.now() + 3600000 * (1 + Math.random()), // 1-2小时刷新
      });
    }
  });
  return herbList;
}

// 统一在文件末尾导出所有内容
export {
  locations,
  LOCATION_TIERS,
  calculateExplorationRewards,
  checkLocationRequirements,
  calculateSpecialEventProbability,
  refreshLocationHerbs,
};
