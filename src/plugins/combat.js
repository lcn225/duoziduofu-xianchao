// 战斗状态
const CombatState = {
  READY: "ready",
  IN_PROGRESS: "in_progress",
  VICTORY: "victory",
  DEFEAT: "defeat",
};

// 战斗类型
const CombatType = {
  NORMAL: "normal", // 普通战斗
  BOSS: "boss", // Boss战斗
  ELITE: "elite", // 精英战斗
};

// 基础战斗属性
class CombatStats {
  constructor(base = {}) {
    // 基础属性
    this.health = base.health || 100;
    this.maxHealth = base.maxHealth || 100;
    this.damage = base.damage || 10;
    this.defense = base.defense || 5;
    this.speed = base.speed || 10;
    // 战斗属性（百分比）
    this.critRate = base.critRate || 0.05; // 暴击率
    this.comboRate = base.comboRate || 0; // 连击率
    this.counterRate = base.counterRate || 0; // 反击率
    this.stunRate = base.stunRate || 0; // 眩晕率
    this.dodgeRate = base.dodgeRate || 0.05; // 闪避率
    this.vampireRate = base.vampireRate || 0; // 吸血率
    // 战斗抗性（百分比）
    this.critResist = base.critResist || 0; // 抗暴击
    this.comboResist = base.comboResist || 0; // 抗连击
    this.counterResist = base.counterResist || 0; // 抗反击
    this.stunResist = base.stunResist || 0; // 抗眩晕
    this.dodgeResist = base.dodgeResist || 0; // 抗闪避
    this.vampireResist = base.vampireResist || 0; // 抗吸血
    // 特殊属性（百分比）
    this.healBoost = base.healBoost || 0; // 强化治疗
    this.critDamageBoost = base.critDamageBoost || 0.5; // 强化爆伤
    this.critDamageReduce = base.critDamageReduce || 0; // 弱化爆伤
    this.finalDamageBoost = base.finalDamageBoost || 0; // 最终增伤
    this.finalDamageReduce = base.finalDamageReduce || 0; // 最终减伤
    this.combatBoost = base.combatBoost || 0; // 战斗属性提升
    this.resistanceBoost = base.resistanceBoost || 0; // 战斗抗性提升
  }
  // 计算最终伤害
  calculateDamage(target) {
    // 应用战斗属性提升
    let damage = Math.abs(this.damage * (1 + this.combatBoost));
    let isCrit = false;
    let isCombo = false;
    let isVampire = false;
    let isStun = false;
    // 计算暴击（考虑目标的抗暴击）
    const finalCritRate = Math.max(
      0,
      this.critRate * (1 + this.combatBoost) -
        (target
          ? target.stats.critResist * (1 + target.stats.resistanceBoost)
          : 0)
    );
    if (Math.random() < finalCritRate) {
      damage *= 1.5 + this.critDamageBoost;
      isCrit = true;
    }
    // 计算连击（考虑目标的抗连击）
    const finalComboRate = Math.max(
      0,
      this.comboRate * (1 + this.combatBoost) -
        (target ? target.stats.comboResist : 0)
    );
    if (Math.random() < finalComboRate) {
      damage *= 1.3;
      isCombo = true;
    }
    // 计算吸血（考虑目标的抗吸血）
    const finalVampireRate = Math.max(
      0,
      this.vampireRate * (1 + this.combatBoost) -
        (target ? target.stats.vampireResist : 0)
    );
    if (Math.random() < finalVampireRate) {
      isVampire = true;
    }
    // 计算眩晕（考虑目标的抗眩晕）
    const finalStunRate = Math.max(
      0,
      this.stunRate * (1 + this.combatBoost) -
        (target ? target.stats.stunResist : 0)
    );
    if (Math.random() < finalStunRate) {
      isStun = true;
    }
    // 应用最终伤害加成
    damage *= 1 + this.finalDamageBoost;
    return { damage: Math.abs(damage), isCrit, isCombo, isVampire, isStun };
  }
  // 计算伤害减免
  calculateDamageReduction(incomingDamage, attackerStats) {
    let damage = Math.abs(incomingDamage);
    // 应用防御减伤（考虑战斗属性提升）
    const effectiveDefense = this.defense * (1 + this.combatBoost);
    damage *= 100 / (100 + effectiveDefense);
    // 如果是暴击伤害，应用暴击伤害减免
    if (attackerStats && attackerStats.isCrit) {
      damage *= 1 - this.critDamageReduce;
    }
    // 应用最终伤害减免
    damage *= 1 - this.finalDamageReduce;
    return Math.abs(damage);
  }
}

// 根据境界等级计算属性加成
const calculateRealmBonus = (realmLevel) => {
  return 1 + realmLevel * 0.2; // 每个境界提升20%的属性
};

// 添加敌人等级成长配置
const ENEMY_CONFIG = {
  growthSettings: {
    normal: {
      baseMultiplier: 1.0,
      levelGrowth: 0.015,
      healthGrowth: 0.02,
      statGrowth: 0.01,
    },
    elite: {
      baseMultiplier: 1.3,
      levelGrowth: 0.02,
      healthGrowth: 0.025,
      statGrowth: 0.015,
    },
    boss: {
      baseMultiplier: 1.8,
      levelGrowth: 0.025,
      healthGrowth: 0.03,
      statGrowth: 0.02,
    },
  },
  // 属性上限配置，与灵宠系统保持一致
  statCaps: {
    critRate: 0.75,
    comboRate: 0.6,
    stunRate: 0.5,
    dodgeRate: 0.65,
    counterRate: 0.6,
    vampireRate: 0.4,
    // 抗性上限
    critResist: 0.75,
    comboResist: 0.6,
    stunResist: 0.5,
    dodgeResist: 0.65,
    counterResist: 0.6,
    vampireResist: 0.4,
    // 特殊属性上限
    healBoost: 1.0,
    critDamageBoost: 2.0,
    critDamageReduce: 0.75,
    finalDamageBoost: 1.0,
    finalDamageReduce: 0.75,
    combatBoost: 1.0,
    resistanceBoost: 1.0,
  },
};

// 战斗实体基类
class CombatEntity {
  constructor(name, level, stats = {}, realm = "练气一层") {
    this.name = name;
    this.level = level;
    this.realm = realm;
    // 应用境界加成
    const realmBonus = calculateRealmBonus(level);
    Object.keys(stats).forEach((key) => {
      if (typeof stats[key] === "number") {
        stats[key] *= realmBonus;
      }
    });
    // 确保maxHealth与health保持一致
    if (stats.health && !stats.maxHealth) {
      stats.maxHealth = stats.health;
    }
    this.stats = new CombatStats(stats);
    this.currentHealth = this.stats.maxHealth;
    this.effects = [];
  }
  // 受到伤害
  takeDamage(amount, source) {
    // 计算实际闪避率（考虑攻击方的抗闪避）
    const actualDodgeRate = Math.max(
      0,
      Math.min(
        1,
        this.stats.dodgeRate - (source ? source.stats.dodgeResist : 0)
      )
    );
    // 闪避判定
    if (Math.random() < actualDodgeRate) {
      return { dodged: true, damage: 0 };
    }
    // 计算实际伤害
    const reducedDamage = this.stats.calculateDamageReduction(amount);
    this.currentHealth = Math.max(0, this.currentHealth - reducedDamage);
    // 计算反击（考虑攻击方的抗反击）
    let isCounter = false;
    if (source) {
      const finalCounterRate = Math.max(
        0,
        this.stats.counterRate - source.stats.counterResist
      );
      if (Math.random() < finalCounterRate) {
        isCounter = true;
      }
    }
    return {
      dodged: false,
      damage: reducedDamage,
      currentHealth: this.currentHealth,
      isDead: this.currentHealth <= 0,
      isCounter: isCounter,
    };
  }
  // 恢复生命值
  heal(amount) {
    const oldHealth = this.currentHealth;
    this.currentHealth = Math.min(
      this.stats.maxHealth,
      this.currentHealth + amount
    );
    return this.currentHealth - oldHealth;
  }
  // 添加效果
  addEffect(effect) {
    this.effects.push(effect);
    effect.apply(this);
  }
  // 移除效果
  removeEffect(effectId) {
    const index = this.effects.findIndex((e) => e.id === effectId);
    if (index >= 0) {
      const effect = this.effects[index];
      effect.remove(this);
      this.effects.splice(index, 1);
    }
  }
}

// 战斗管理器
class CombatManager {
  constructor(player, enemy, type = CombatType.NORMAL) {
    this.player = player;
    this.enemy = enemy;
    this.type = type;
    this.state = CombatState.READY;
    this.round = 0;
    this.maxRounds = 10; // 设置最大回合数为10
    this.log = [];
  }
  // 开始战斗
  start() {
    this.state = CombatState.IN_PROGRESS;
    return this.state;
  }
  // 执行回合
  executeTurn() {
    if (this.state !== CombatState.IN_PROGRESS) return null;
    this.round++;
    // 检查是否超过最大回合数
    if (this.round > this.maxRounds) {
      this.state = CombatState.DEFEAT;
      this.log.push(`战斗超过${this.maxRounds}回合，战斗失败！`);
      return { results: [], state: this.state };
    }
    const results = [];
    // 根据速度决定攻击顺序
    const playerSpeed =
      this.player.stats.speed * (1 + this.player.stats.combatBoost);
    const enemySpeed =
      this.enemy.stats.speed * (1 + this.enemy.stats.combatBoost);
    const firstAttacker = playerSpeed >= enemySpeed ? this.player : this.enemy;
    const secondAttacker = playerSpeed >= enemySpeed ? this.enemy : this.player;

    // 第一回合攻击
    const firstAttack = firstAttacker.stats.calculateDamage(secondAttacker);
    const firstResult = secondAttacker.takeDamage(
      firstAttack.damage,
      firstAttacker
    );

    // 记录第一回合攻击日志
    let firstAttackLog = `${firstAttacker.name}率先发起攻击`;
    if (firstResult.dodged) {
      firstAttackLog += `，被闪避了！`;
    } else {
      firstAttackLog += `，造成${firstResult.damage.toFixed(1)}点伤害`;
      if (firstAttack.isCrit) firstAttackLog += `（暴击！）`;
      if (firstAttack.isCombo) firstAttackLog += `（连击！）`;
      if (firstAttack.isVampire) {
        const healAmount = firstResult.damage * 0.3;
        firstAttacker.heal(healAmount);
        firstAttackLog += `（吸血恢复${healAmount.toFixed(1)}点生命值！）`;
      }
      if (firstAttack.isStun) firstAttackLog += `（眩晕目标！）`;
    }
    this.log.push(firstAttackLog);
    results.push({
      attacker: firstAttacker.name,
      defender: secondAttacker.name,
      damage: firstResult.damage,
      isCrit: firstAttack.isCrit,
      isCombo: firstAttack.isCombo,
      isDodged: firstResult.dodged,
    });

    // 检查第二攻击者是否死亡
    if (firstResult.isDead) {
      this.state =
        firstAttacker === this.player
          ? CombatState.VICTORY
          : CombatState.DEFEAT;
      this.log.push(`${firstAttacker.name}获得胜利！`);
      return { results, state: this.state };
    }

    // 第二回合攻击（如果没有被眩晕）
    if (!firstAttack.isStun) {
      const secondAttack = secondAttacker.stats.calculateDamage(firstAttacker);
      const secondResult = firstAttacker.takeDamage(
        secondAttack.damage,
        secondAttacker
      );

      // 记录第二回合攻击日志
      // 如果是反击，先添加反击触发的日志
      if (firstResult.isCounter) {
        this.log.push(`${secondAttacker.name}触发了反击效果！`);
      }
      let secondAttackLog = firstResult.isCounter
        ? `${secondAttacker.name}的反击`
        : `${secondAttacker.name}进行攻击`;
      if (secondResult.dodged) {
        secondAttackLog += `，被闪避了！`;
      } else {
        secondAttackLog += `，造成${secondResult.damage.toFixed(1)}点伤害`;
        if (secondAttack.isCrit) secondAttackLog += `（暴击！）`;
        if (secondAttack.isCombo) secondAttackLog += `（连击！）`;
        if (secondAttack.isVampire) {
          const healAmount = secondResult.damage * 0.3;
          secondAttacker.heal(healAmount);
          secondAttackLog += `（吸血恢复${healAmount.toFixed(1)}点生命值！）`;
        }
        if (secondAttack.isStun) secondAttackLog += `（眩晕目标！）`;
      }
      this.log.push(secondAttackLog);
      results.push({
        attacker: secondAttacker.name,
        defender: firstAttacker.name,
        damage: secondResult.damage,
        isCrit: secondAttack.isCrit,
        isCombo: secondAttack.isCombo,
        isDodged: secondResult.dodged,
      });

      // 检查第一攻击者是否死亡
      if (secondResult.isDead) {
        this.state =
          secondAttacker === this.player
            ? CombatState.VICTORY
            : CombatState.DEFEAT;
        this.log.push(`${secondAttacker.name}获得胜利！`);
      }
    }
    return { results, state: this.state };
  }
  // 获取战斗日志
  getCombatLog() {
    return this.log;
  }
}

// 修改生成敌人的函数
function generateEnemy(level, type = CombatType.NORMAL, realm = "练气一层") {
  const settings = ENEMY_CONFIG.growthSettings[type.toLowerCase()];

  // 使用对数增长来控制属性增长速度
  const growthFactor = 1 + settings.levelGrowth / Math.log10(level + 10);
  const healthGrowthFactor = 1 + settings.healthGrowth / Math.log10(level + 10);
  const statGrowthFactor = settings.statGrowth / Math.sqrt(level);

  // 基础属性计算
  const baseStats = {
    // 基础属性使用指数增长但增速受控
    health: Math.round(
      100 * settings.baseMultiplier * Math.pow(healthGrowthFactor, level)
    ),
    damage: Math.round(
      10 * settings.baseMultiplier * Math.pow(growthFactor, level)
    ),
    defense: Math.round(
      5 * settings.baseMultiplier * Math.pow(growthFactor, level)
    ),
    speed: Math.round(
      10 * settings.baseMultiplier * Math.pow(growthFactor, level * 0.8)
    ), // 速度增长较慢

    // 战斗属性使用递减增长
    critRate: Math.min(
      0.05 + statGrowthFactor * level,
      ENEMY_CONFIG.statCaps.critRate
    ),
    comboRate: Math.min(
      0.03 + statGrowthFactor * level * 0.8,
      ENEMY_CONFIG.statCaps.comboRate
    ),
    counterRate: Math.min(
      0.03 + statGrowthFactor * level * 0.7,
      ENEMY_CONFIG.statCaps.counterRate
    ),
    stunRate: Math.min(
      0.02 + statGrowthFactor * level * 0.6,
      ENEMY_CONFIG.statCaps.stunRate
    ),
    dodgeRate: Math.min(
      0.05 + statGrowthFactor * level * 0.9,
      ENEMY_CONFIG.statCaps.dodgeRate
    ),
    vampireRate: Math.min(
      0.02 + statGrowthFactor * level * 0.5,
      ENEMY_CONFIG.statCaps.vampireRate
    ),

    // 战斗抗性
    critResist: Math.min(
      0.02 + statGrowthFactor * level * 0.7,
      ENEMY_CONFIG.statCaps.critResist
    ),
    comboResist: Math.min(
      0.02 + statGrowthFactor * level * 0.7,
      ENEMY_CONFIG.statCaps.comboResist
    ),
    counterResist: Math.min(
      0.02 + statGrowthFactor * level * 0.7,
      ENEMY_CONFIG.statCaps.counterResist
    ),
    stunResist: Math.min(
      0.02 + statGrowthFactor * level * 0.7,
      ENEMY_CONFIG.statCaps.stunResist
    ),
    dodgeResist: Math.min(
      0.02 + statGrowthFactor * level * 0.7,
      ENEMY_CONFIG.statCaps.dodgeResist
    ),
    vampireResist: Math.min(
      0.02 + statGrowthFactor * level * 0.7,
      ENEMY_CONFIG.statCaps.vampireResist
    ),

    // 特殊属性
    healBoost: Math.min(
      0.05 + statGrowthFactor * level * 0.6,
      ENEMY_CONFIG.statCaps.healBoost
    ),
    critDamageBoost: Math.min(
      0.2 + statGrowthFactor * level * 0.8,
      ENEMY_CONFIG.statCaps.critDamageBoost
    ),
    critDamageReduce: Math.min(
      0.1 + statGrowthFactor * level * 0.6,
      ENEMY_CONFIG.statCaps.critDamageReduce
    ),
    finalDamageBoost: Math.min(
      0.05 + statGrowthFactor * level * 0.5,
      ENEMY_CONFIG.statCaps.finalDamageBoost
    ),
    finalDamageReduce: Math.min(
      0.05 + statGrowthFactor * level * 0.5,
      ENEMY_CONFIG.statCaps.finalDamageReduce
    ),
    combatBoost: Math.min(
      0.03 + statGrowthFactor * level * 0.4,
      ENEMY_CONFIG.statCaps.combatBoost
    ),
    resistanceBoost: Math.min(
      0.03 + statGrowthFactor * level * 0.4,
      ENEMY_CONFIG.statCaps.resistanceBoost
    ),
  };

  // 根据类型和等级生成敌人名称
  let enemyName = "";
  const normalNames = [
    "野狼",
    "山猪",
    "毒蛇",
    "黑熊",
    "猛虎",
    "恶狼",
    "巨蟒",
    "狂狮",
  ];
  const eliteNames = [
    "赤焰虎",
    "玄冰蟒",
    "紫电豹",
    "金刚猿",
    "幽冥狼",
    "碧水蛟",
    "雷霆鹰",
    "烈风豹",
  ];
  const bossNames = [
    "九尾天狐",
    "万年龙蟒",
    "太古神虎",
    "玄天冰凤",
    "幽冥魔龙",
    "混沌巨兽",
    "远古天蟒",
    "不死火凤",
  ];

  switch (type) {
    case CombatType.BOSS:
      enemyName = bossNames[Math.floor(level / 10) % bossNames.length];
      break;
    case CombatType.ELITE:
      enemyName = eliteNames[Math.floor(level / 5) % eliteNames.length];
      break;
    default:
      enemyName = normalNames[level % normalNames.length];
  }

  return new CombatEntity(enemyName, level, baseStats, realm);
}

export {
  CombatState,
  CombatType,
  CombatStats,
  CombatEntity,
  CombatManager,
  generateEnemy,
};
