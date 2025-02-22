import { getRandomHerb, HERB_QUALITIES } from "./herbs";
import { pillRecipes } from "./pills";
import { getRealmLevel } from "./realm";

// 事件类型配置
const EVENT_TYPES = {
  // 基础事件
  basic_encounter: {
    name: "寻常际遇",
    probability: 0.3,
    rewards: {
      spiritStones: { base: 20, variance: 0.2 },
      herbs: { probability: 0.3, count: { min: 1, max: 2 } },
      pill_fragment: { probability: 0.08, count: { min: 1, max: 1 } },
    },
  },
  // 机缘事件
  small_fortune: {
    name: "小型机缘",
    probability: 0.15,
    rewards: {
      spiritStones: { base: 50, variance: 0.3 },
      herbs: { probability: 0.4, count: { min: 1, max: 2 } },
      items: { probability: 0.2 },
      pill_fragment: { probability: 0.1, count: { min: 1, max: 2 } },
      spirit: { base: 50, variance: 0.2 },
    },
  },
  // 修炼点事件
  cultivation_spot: {
    name: "修炼洞府",
    probability: 0.1,
    rewards: {
      cultivation: { base: 100, variance: 0.25 },
      comprehension: { probability: 0.15, bonus: 0.05 },
      spirit: { base: 80, variance: 0.2 },
    },
  },
  // 战斗事件
  combat_encounter: {
    name: "遭遇战斗",
    probability: 0.25,
    rewards: {
      spiritStones: { base: 150, variance: 0.3 },
      items: { probability: 0.3 },
      pill_fragment: { probability: 0.2, count: { min: 2, max: 4 } },
    },
    risk: {
      damage: { base: 20, variance: 0.2 },
      spirit_loss: { base: 50, variance: 0.3 },
    },
  },
  // 心魔事件
  devil_heart: {
    name: "心魔侵扰",
    probability: 0.1,
    risk: {
      cultivation_loss: { base: 100, variance: 0.3 },
      spirit_loss: { base: 100, variance: 0.2 },
    },
  },
  // 奇遇事件
  major_fortune: {
    name: "重大机缘",
    probability: 0.03,
    rewards: {
      spiritStones: { base: 150, variance: 0.4 },
      herbs: { probability: 0.6, count: { min: 2, max: 4 } },
      items: { probability: 0.4 },
      pill_fragment: { probability: 0.2, count: { min: 2, max: 4 } },
      spirit: { base: 120, variance: 0.3 },
      cultivation: { base: 200, variance: 0.3 },
    },
  },
};

// 事件奖励计算
function calculateEventRewards(eventType, playerLevel, luck) {
  const config = EVENT_TYPES[eventType];
  if (!config) return null;
  if (!config.rewards) return null;
  // 等级加成系数
  const levelMod = 1 + playerLevel * 0.05;
  // 幸运加成
  const luckMod = 1 + Math.sqrt(luck) * 0.1;
  // 计算基础奖励
  const rewards = {};
  // 灵石奖励
  if (config.rewards.spiritStones) {
    const variance =
      (Math.random() - 0.5) * (config.rewards.spiritStones.variance || 0.2);
    rewards.spiritStones = Math.round(
      config.rewards.spiritStones.base * levelMod * luckMod * (1 + variance)
    );
  }
  // 灵草奖励
  if (
    config.rewards.herbs &&
    Math.random() < config.rewards.herbs.probability * luckMod
  ) {
    rewards.herbCount = Math.floor(
      config.rewards.herbs.count.min +
        Math.random() *
          (config.rewards.herbs.count.max - config.rewards.herbs.count.min + 1)
    );
  }
  // 丹方残页奖励
  if (
    config.rewards.pill_fragment &&
    Math.random() < config.rewards.pill_fragment.probability * luckMod
  ) {
    rewards.pill_fragment = {
      count: Math.floor(
        config.rewards.pill_fragment.count.min +
          Math.random() *
            (config.rewards.pill_fragment.count.max -
              config.rewards.pill_fragment.count.min +
              1)
      ),
    };
  }
  // 灵力奖励
  if (config.rewards.spirit && config.rewards.spirit.base) {
    const variance =
      (Math.random() - 0.5) * (config.rewards.spirit.variance || 0.2);
    const spiritGain = Math.round(
      config.rewards.spirit.base * levelMod * luckMod * (1 + variance)
    );
    if (spiritGain > 0) {
      rewards.spirit = spiritGain;
    }
  }
  // 修为奖励
  if (config.rewards.cultivation && config.rewards.cultivation.base) {
    const variance =
      (Math.random() - 0.5) * (config.rewards.cultivation.variance || 0.2);
    const cultivationGain = Math.round(
      config.rewards.cultivation.base * levelMod * luckMod * (1 + variance)
    );
    if (cultivationGain > 0) {
      rewards.cultivation = cultivationGain;
    }
  }
  // 悟性奖励
  if (config.rewards.comprehension) {
    rewards.comprehension = {
      probability: config.rewards.comprehension.probability * luckMod,
      bonus: config.rewards.comprehension.bonus,
    };
  }
  return rewards;
}

// 随机事件配置
let eventsList = [
  {
    id: "ancient_tablet",
    name: "古老石碑",
    description: "发现一块刻有上古功法的石碑。",
    chance: 0.08,
    effect: (playerStore, showMessage) => {
      const bonus = Math.floor(30 * (playerStore.level / 5 + 1));
      playerStore.cultivation += bonus;
      showMessage("success", `[古老石碑]领悟石碑上的功法，获得${bonus}点修为`);
    },
  },
  {
    id: "spirit_spring",
    name: "灵泉",
    description: "偶遇一处天然灵泉。",
    chance: 0.12,
    effect: (playerStore, showMessage) => {
      const bonus = Math.floor(60 * (playerStore.level / 3 + 1));
      playerStore.spirit += bonus;
      showMessage("success", `[灵泉]饮用灵泉，灵力增加${bonus}点`);
    },
  },
  {
    id: "ancient_master",
    name: "古修遗府",
    description: "意外发现一位上古大能的洞府。",
    chance: 0.03,
    effect: (playerStore, showMessage) => {
      const cultivationBonus = Math.floor(120 * (playerStore.level / 2 + 1));
      const spiritBonus = Math.floor(180 * (playerStore.level / 2 + 1));
      playerStore.cultivation += cultivationBonus;
      playerStore.spirit += spiritBonus;
      showMessage(
        "success",
        `[古修遗府]获得上古大能传承，修为增加${cultivationBonus}点，灵力增加${spiritBonus}点`
      );
    },
  },
  {
    id: "monster_attack",
    name: "妖兽袭击",
    description: "遭遇一只实力强大的妖兽。",
    chance: 0.15,
    effect: (playerStore, showMessage) => {
      const damage = Math.floor(80 * (playerStore.level / 4 + 1));
      playerStore.spirit = Math.max(0, playerStore.spirit - damage);
      showMessage("error", `[妖兽袭击]与妖兽激战，损失${damage}点灵力`);
    },
  },
  {
    id: "cultivation_deviation",
    name: "走火入魔",
    description: "修炼出现偏差，走火入魔。",
    chance: 0.12,
    effect: (playerStore, showMessage) => {
      const damage = Math.floor(50 * (playerStore.level / 3 + 1));
      playerStore.cultivation = Math.max(0, playerStore.cultivation - damage);
      showMessage("error", `[走火入魔]走火入魔，损失${damage}点修为`);
    },
  },
  {
    id: "treasure_trove",
    name: "秘境宝藏",
    description: "发现一处上古修士遗留的宝藏。",
    chance: 0.05,
    effect: (playerStore, showMessage) => {
      const stoneBonus = Math.floor(30 * (playerStore.level / 2 + 1));
      playerStore.spiritStones += stoneBonus;
      showMessage("success", `[秘境宝藏]发现宝藏，获得${stoneBonus}颗灵石`);
    },
  },
  {
    id: "enlightenment",
    name: "顿悟",
    description: "修炼中突然顿悟。",
    chance: 0.08,
    effect: (playerStore, showMessage) => {
      const bonus = Math.floor(50 * (playerStore.level / 4 + 1));
      playerStore.cultivation += bonus;
      playerStore.spiritRate *= 1.05;
      showMessage(
        "success",
        `[顿悟]突然顿悟，获得${bonus}点修为，灵力获取速率提升5%`
      );
    },
  },
  {
    id: "qi_deviation",
    name: "心魔侵扰",
    description: "遭受心魔侵扰，修为受损。",
    chance: 0.15,
    effect: (playerStore, showMessage) => {
      const damage = Math.floor(60 * (playerStore.level / 3 + 1));
      playerStore.spirit = Math.max(0, playerStore.spirit - damage);
      playerStore.cultivation = Math.max(0, playerStore.cultivation - damage);
      showMessage("error", `[心魔侵扰]遭受心魔侵扰，损失${damage}点灵力和修为`);
    },
  },
];

eventsList = eventsList.filter((event) => event.id !== "ancient_master");

function triggerRandomEvent(playerStore, message) {
  for (const event of eventsList) {
    if (Math.random() <= event.chance) {
      message("info", `[${event.name}]${event.description}`);
      event.effect(playerStore, message);
      playerStore.eventTriggered++;
      playerStore.saveData();
      return true;
    }
  }
  return false;
}

const handleReward = (reward, playerStore, showMessage) => {
  if (!reward) return;
  // 处理灵石奖励
  if (reward.spiritStones) {
    playerStore.spiritStones += reward.spiritStones;
    showMessage?.("success", `获得${reward.spiritStones}灵石`);
  }
  // 处理经验奖励
  if (reward.experience) {
    playerStore.gainExperience(reward.experience);
    showMessage?.("success", `获得${reward.experience}经验`);
  }
  // 处理物品奖励
  if (reward.items) {
    reward.items.forEach((item) => {
      playerStore.items.push(item);
      showMessage?.("success", `获得物品：${item.name}`);
    });
  }
  // 处理其他可能的奖励类型
  if (reward.spirit) {
    playerStore.spirit += reward.spirit;
    showMessage?.("success", `恢复${reward.spirit}点灵力`);
  }

  if (reward.cultivation) {
    playerStore.cultivation += reward.cultivation;
    showMessage?.("success", `获得${reward.cultivation}点修为`);
  }
};

// 事件链配置
const EVENT_CHAINS = {
  cultivation_breakthrough: {
    name: "修炼突破",
    stages: ["感悟", "凝聚", "突破"],
    rewards: {
      cultivation: { base: 500, variance: 0.4 },
      comprehension: { probability: 0.4, bonus: 0.15 },
    },
  },
  ancient_inheritance: {
    name: "传承机缘",
    stages: ["发现", "参悟", "继承"],
    rewards: {
      spirit: { base: 300, variance: 0.3 },
      cultivation: { base: 400, variance: 0.4 },
    },
  },
};

// 检查事件冷却
function checkEventCooldown(eventType, lastEventTimes) {
  const now = Date.now();
  const cooldowns = {
    basic_encounter: 10 * 60 * 1000, // 10分钟
    small_fortune: 30 * 60 * 1000, // 30分钟
    cultivation_spot: 20 * 60 * 1000, // 20分钟
    combat_encounter: 15 * 60 * 1000, // 15分钟
    major_fortune: 60 * 60 * 1000, // 1小时
    devil_heart: 45 * 60 * 1000, // 45分钟
  };
  const lastTime = lastEventTimes[eventType] || 0;
  return now - lastTime >= (cooldowns[eventType] || 0);
}

function getRandomReward(rewardConfig, playerLevel, luck) {
  const rewards = {};
  const luckMod = 1 + Math.sqrt(luck) * 0.1;
  const levelMod = 1 + playerLevel * 0.05;

  // 灵力奖励
  if (rewardConfig.spirit) {
    const variance =
      (Math.random() - 0.5) * (rewardConfig.spirit.variance || 0.2);
    rewards.spirit = Math.round(
      rewardConfig.spirit.base * (1 + variance) * luckMod * levelMod
    );
  }

  // 修为奖励
  if (rewardConfig.cultivation) {
    const variance =
      (Math.random() - 0.5) * (rewardConfig.cultivation.variance || 0.2);
    rewards.cultivation = Math.round(
      rewardConfig.cultivation.base * (1 + variance) * luckMod * levelMod
    );
  }

  // 灵石奖励
  if (rewardConfig.spiritStones) {
    const variance =
      (Math.random() - 0.5) * (rewardConfig.spiritStones.variance || 0.2);
    rewards.spiritStones = Math.round(
      rewardConfig.spiritStones.base * (1 + variance) * luckMod * levelMod
    );
  }

  // 灵草奖励
  if (
    rewardConfig.herbs &&
    Math.random() < rewardConfig.herbs.probability * luckMod
  ) {
    rewards.herbCount = Math.floor(
      rewardConfig.herbs.count.min +
        Math.random() *
          (rewardConfig.herbs.count.max - rewardConfig.herbs.count.min + 1)
    );
  }

  // 丹方残页奖励
  if (
    rewardConfig.pill_fragment &&
    Math.random() < rewardConfig.pill_fragment.probability * luckMod
  ) {
    rewards.pill_fragment = {
      count: Math.floor(
        rewardConfig.pill_fragment.count.min +
          Math.random() *
            (rewardConfig.pill_fragment.count.max -
              rewardConfig.pill_fragment.count.min +
              1)
      ),
    };
  }

  // 悟性奖励
  if (rewardConfig.comprehension) {
    rewards.comprehension = {
      probability: rewardConfig.comprehension.probability * luckMod,
      bonus: rewardConfig.comprehension.bonus,
    };
  }

  return rewards;
}

// 特殊事件配置
const SPECIAL_EVENTS = {
  ancient_tablet: {
    name: "古老石碑",
    description: "发现一块刻有上古功法的石碑",
    probability: 0.08,
    requirements: {
      minLevel: 1,
      maxLevel: 20,
    },
    rewards: {
      cultivation: { base: 100, variance: 0.3 },
      comprehension: { probability: 0.2, bonus: 0.05 },
    },
  },
  spirit_spring: {
    name: "灵泉",
    description: "偶遇一处天然灵泉",
    probability: 0.12,
    requirements: {
      minLevel: 1,
      maxLevel: 20,
    },
    rewards: {
      spirit: { base: 100, variance: 0.2 },
      cultivation: { base: 50, variance: 0.2 },
    },
  },
  ancient_formation: {
    name: "上古阵法",
    description: "发现一座上古传送阵",
    probability: 0.05,
    requirements: {
      minLevel: 15,
      maxLevel: 30,
    },
    rewards: {
      cultivation: { base: 300, variance: 0.3 },
      spirit: { base: 200, variance: 0.2 },
      comprehension: { probability: 0.3, bonus: 0.1 },
    },
  },
  secret_realm: {
    name: "秘境入口",
    description: "发现一处秘境入口",
    probability: 0.03,
    requirements: {
      minLevel: 25,
      maxLevel: 50,
    },
    rewards: {
      spiritStones: { base: 200, variance: 0.4 },
      herbs: { probability: 0.8, count: { min: 3, max: 6 } },
      pill_fragment: { probability: 0.4, count: { min: 2, max: 4 } },
    },
  },
  thunder_enlightenment: {
    name: "雷霆感悟",
    description: "在雷霆中领悟武道真谛",
    probability: 0.08,
    requirements: {
      minLevel: 10,
      maxLevel: 30,
    },
    rewards: {
      cultivation: { base: 200, variance: 0.3 },
      comprehension: { probability: 0.25, bonus: 0.08 },
      spirit: { base: 150, variance: 0.2 },
    },
  },
  celestial_enlightenment: {
    name: "天道感悟",
    description: "在仙山之巅感悟天道",
    probability: 0.06,
    requirements: {
      minLevel: 15,
      maxLevel: 40,
    },
    rewards: {
      cultivation: { base: 300, variance: 0.4 },
      comprehension: { probability: 0.3, bonus: 0.1 },
      spirit: { base: 200, variance: 0.3 },
    },
  },
  ancient_inheritance: {
    name: "远古传承",
    description: "获得远古修士的传承",
    probability: 0.04,
    requirements: {
      minLevel: 20,
      maxLevel: 50,
    },
    rewards: {
      cultivation: { base: 400, variance: 0.4 },
      spirit: { base: 300, variance: 0.3 },
      comprehension: { probability: 0.35, bonus: 0.12 },
      pill_fragment: { probability: 0.5, count: { min: 3, max: 5 } },
    },
  },
  enlightenment: {
    name: "顿悟",
    description: "修炼中突然顿悟",
    probability: 0.08,
    requirements: {
      minLevel: 1,
      maxLevel: 30,
    },
    rewards: {
      cultivation: { base: 150, variance: 0.3 },
      comprehension: { probability: 0.2, bonus: 0.06 },
      spirit: { base: 100, variance: 0.2 },
    },
  },
  treasure_trove: {
    name: "秘境宝藏",
    description: "发现一处上古修士遗留的宝藏",
    probability: 0.05,
    requirements: {
      minLevel: 1,
      maxLevel: 30,
    },
    rewards: {
      spiritStones: { base: 100, variance: 0.3 },
      herbs: { probability: 0.6, count: { min: 2, max: 4 } },
      pill_fragment: { probability: 0.3, count: { min: 1, max: 3 } },
    },
  },
  ancient_master: {
    name: "古修遗府",
    description: "意外发现一位上古大能的洞府",
    probability: 0.03,
    requirements: {
      minLevel: 10,
      maxLevel: 40,
    },
    rewards: {
      cultivation: { base: 250, variance: 0.4 },
      spirit: { base: 200, variance: 0.3 },
      comprehension: { probability: 0.25, bonus: 0.08 },
      pill_fragment: { probability: 0.4, count: { min: 2, max: 4 } },
    },
  },
  phoenix_inheritance: {
    name: "凤凰传承",
    description: "获得远古凤凰一族的传承",
    probability: 0.04,
    requirements: {
      minLevel: 30,
      maxLevel: 60,
    },
    rewards: {
      cultivation: { base: 500, variance: 0.4 },
      spirit: { base: 400, variance: 0.3 },
      comprehension: { probability: 0.4, bonus: 0.15 },
      pill_fragment: { probability: 0.6, count: { min: 3, max: 6 } },
    },
  },
  fire_enlightenment: {
    name: "火之感悟",
    description: "在火焰中领悟火之道韵",
    probability: 0.06,
    requirements: {
      minLevel: 25,
      maxLevel: 55,
    },
    rewards: {
      cultivation: { base: 350, variance: 0.35 },
      spirit: { base: 250, variance: 0.3 },
      comprehension: { probability: 0.3, bonus: 0.1 },
    },
  },
  dragon_inheritance: {
    name: "真龙传承",
    description: "获得远古真龙的传承",
    probability: 0.03,
    requirements: {
      minLevel: 35,
      maxLevel: 70,
    },
    rewards: {
      cultivation: { base: 600, variance: 0.4 },
      spirit: { base: 500, variance: 0.35 },
      comprehension: { probability: 0.45, bonus: 0.18 },
      pill_fragment: { probability: 0.7, count: { min: 4, max: 7 } },
    },
  },
  water_enlightenment: {
    name: "水之感悟",
    description: "在深渊之中领悟水之真意",
    probability: 0.06,
    requirements: {
      minLevel: 30,
      maxLevel: 60,
    },
    rewards: {
      cultivation: { base: 400, variance: 0.35 },
      spirit: { base: 300, variance: 0.3 },
      comprehension: { probability: 0.35, bonus: 0.12 },
    },
  },
  immortal_inheritance: {
    name: "仙人传承",
    description: "获得仙界遗留的传承",
    probability: 0.02,
    requirements: {
      minLevel: 40,
      maxLevel: 80,
    },
    rewards: {
      cultivation: { base: 800, variance: 0.45 },
      spirit: { base: 600, variance: 0.4 },
      comprehension: { probability: 0.5, bonus: 0.2 },
      pill_fragment: { probability: 0.8, count: { min: 5, max: 8 } },
    },
  },
  heavenly_enlightenment: {
    name: "天道感悟",
    description: "在仙界入口感悟天道真意",
    probability: 0.05,
    requirements: {
      minLevel: 35,
      maxLevel: 75,
    },
    rewards: {
      cultivation: { base: 500, variance: 0.4 },
      spirit: { base: 400, variance: 0.35 },
      comprehension: { probability: 0.4, bonus: 0.15 },
    },
  },
};

// 修改特殊事件触发器
function triggerSpecialEvent(location, playerRealm, luck) {
  if (!location.specialEvents) return null;
  for (const eventId of location.specialEvents) {
    const event = SPECIAL_EVENTS[eventId];
    if (!event) continue;

    // 检查境界要求
    const playerRealmLevel = getRealmLevel(playerRealm);
    const minRealmLevel = getRealmLevel(event.requirements.minRealm);
    const maxRealmLevel = getRealmLevel(event.requirements.maxRealm);
    if (playerRealmLevel < minRealmLevel || playerRealmLevel > maxRealmLevel)
      continue;

    // 计算触发概率（考虑境界和幸运值）
    const realmBonus = (playerRealmLevel - minRealmLevel) * 0.05;
    const triggerChance =
      event.probability * (1 + realmBonus + Math.sqrt(luck) * 0.1);
    if (Math.random() > triggerChance) continue;

    // 计算奖励（考虑境界加成）
    const rewards = getRandomReward(event.rewards, playerRealmLevel, luck);

    // 返回一个包含effect函数的事件对象
    return {
      ...event,
      rewards,
      effect: (playerStore, showMessage) => {
        showMessage("info", `[${event.name}]${event.description}`);
        // 处理奖励
        if (rewards.spirit) {
          playerStore.spirit += rewards.spirit;
          showMessage("success", `获得${rewards.spirit}点灵力`);
        }
        if (rewards.cultivation) {
          playerStore.cultivation += rewards.cultivation;
          showMessage("success", `获得${rewards.cultivation}点修为`);
        }
        if (rewards.spiritStones) {
          playerStore.spiritStones += rewards.spiritStones;
          showMessage("success", `获得${rewards.spiritStones}灵石`);
        }
        if (rewards.herbCount) {
          // TODO: 处理灵草奖励
          showMessage("success", `获得${rewards.herbCount}株灵草`);
        }
        if (rewards.pill_fragment) {
          // TODO: 处理丹方残页奖励
          showMessage(
            "success",
            `获得${rewards.pill_fragment.count}页丹方残页`
          );
        }
        if (rewards.comprehension) {
          // TODO: 处理悟性奖励
          showMessage("success", "获得悟性提升");
        }

        playerStore.eventTriggered++;
        playerStore.saveData();
      },
    };
  }

  return null;
}

export {
  EVENT_TYPES,
  calculateEventRewards,
  EVENT_CHAINS,
  checkEventCooldown,
  triggerSpecialEvent,
  eventsList,
  handleReward,
  getRandomReward,
  triggerRandomEvent,
  SPECIAL_EVENTS,
};
