// 副本增益效果管理器
const dungeonBuffs = {
  // 存储当前应用的增益效果
  activeBuffs: [],
  // 应用增益效果
  apply(player, option) {
    // 添加到活跃增益列表
    this.activeBuffs.push({
      id: option.id,
      name: option.name,
      effect: option.effect,
      appliedAt: Date.now(),
    });
    // 应用效果
    if (typeof option.effect === "function") {
      // 创建属性的深拷贝以防止直接修改引用
      const stats = {
        baseAttributes: { ...player.baseAttributes },
        combatAttributes: { ...player.combatAttributes },
        specialAttributes: { ...player.specialAttributes },
        // 其他可能需要的属性
        spirit: player.spirit,
        maxSpirit: player.maxSpirit,
        cultivationRate: player.cultivationRate,
        spiritRate: player.spiritRate,
        luck: player.luck,
        shield: player.shield,
        healthRegen: player.healthRegen,
        spiritRegen: player.spiritRegen,
        lifeSteal: player.lifeSteal,
        immunityCount: player.immunityCount,
        tempStatBonus: player.tempStatBonus,
        buffEffectiveness: player.buffEffectiveness,
      };
      // 应用效果
      option.effect(stats);
      // 将修改后的属性更新回玩家对象
      Object.assign(player.baseAttributes, stats.baseAttributes);
      Object.assign(player.combatAttributes, stats.combatAttributes);
      Object.assign(player.specialAttributes, stats.specialAttributes);
      // 更新其他属性
      player.spirit = stats.spirit;
      player.maxSpirit = stats.maxSpirit;
      player.cultivationRate = stats.cultivationRate;
      player.spiritRate = stats.spiritRate;
      player.luck = stats.luck;
      player.shield = stats.shield;
      player.healthRegen = stats.healthRegen;
      player.spiritRegen = stats.spiritRegen;
      player.lifeSteal = stats.lifeSteal;
      player.immunityCount = stats.immunityCount;
      player.tempStatBonus = stats.tempStatBonus;
      player.buffEffectiveness = stats.buffEffectiveness;
    }
  },

  // 获取所有活跃的增益效果
  getActiveBuffs() {
    return this.activeBuffs;
  },

  // 清除所有增益效果
  clear(player) {
    // 重置基础属性
    if (player.baseAttributes) {
      player.baseAttributes = {
        attack: 10,
        defense: 5,
        speed: 10,
        health: 100,
      };
    }
    // 重置战斗属性
    if (player.combatAttributes) {
      player.combatAttributes = {
        critRate: 0.05,
        comboRate: 0,
        counterRate: 0,
        stunRate: 0,
        dodgeRate: 0,
        vampireRate: 0,
      };
    }
    // 重置特殊属性
    if (player.specialAttributes) {
      player.specialAttributes = {
        healBoost: 0,
        critDamageBoost: 0,
        critDamageReduce: 0,
        finalDamageBoost: 0,
        finalDamageReduce: 0,
        combatBoost: 0,
        resistanceBoost: 0,
      };
    }
    // 重置其他属性
    player.spiritRate = 1;
    player.cultivationRate = 1;
    player.luck = 1;
    player.shield = 0;
    player.healthRegen = 0;
    player.spiritRegen = 0;
    player.lifeSteal = 0;
    player.immunityCount = 0;
    player.tempStatBonus = 0;
    player.buffEffectiveness = 1;
    // 清空活跃增益列表
    this.activeBuffs = [];
  },
};

export default dungeonBuffs;
