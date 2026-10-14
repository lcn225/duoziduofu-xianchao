// 战斗属性四件套 + 装备栏位 + 装备加成汇总
//
// 注意：baseAttributes / combatAttributes / combatResistance / specialAttributes 是
// 角色当前生效的属性（含装备与灵宠加成），artifactBonuses 记录其中来自装备的部分。
// 穿脱装备与灵宠出战都会同时改这两处，二者必须保持同步。
export const state = () => ({
  // 基础战斗属性
  baseAttributes: {
    attack: 10, // 攻击
    health: 100, // 生命
    defense: 5, // 防御
    speed: 10 // 速度
  },
  // 战斗属性
  combatAttributes: {
    critRate: 0, // 暴击率
    comboRate: 0, // 连击率
    counterRate: 0, // 反击率
    stunRate: 0, // 眩晕率
    dodgeRate: 0, // 闪避率
    vampireRate: 0 // 吸血率
  },
  // 战斗抗性
  combatResistance: {
    critResist: 0, // 抗暴击
    comboResist: 0, // 抗连击
    counterResist: 0, // 抗反击
    stunResist: 0, // 抗眩晕
    dodgeResist: 0, // 抗闪避
    vampireResist: 0 // 抗吸血
  },
  // 特殊属性
  specialAttributes: {
    healBoost: 0, // 强化治疗
    critDamageBoost: 0, // 强化爆伤
    critDamageReduce: 0, // 弱化爆伤
    finalDamageBoost: 0, // 最终增伤
    finalDamageReduce: 0, // 最终减伤
    combatBoost: 0, // 战斗属性提升
    resistanceBoost: 0 // 战斗抗性提升
  },
  // 装备栏位
  equippedArtifacts: {
    weapon: null, // 武器
    head: null, // 头部
    body: null, // 衣服
    legs: null, // 裤子
    feet: null, // 鞋子
    shoulder: null, // 肩甲
    hands: null, // 手套
    wrist: null, // 护腕
    necklace: null, // 项链
    ring1: null, // 戒指1
    ring2: null, // 戒指2
    belt: null, // 腰带
    artifact: null // 法宝
  },
  // 装备加成属性
  artifactBonuses: {
    // 基础属性加成
    attack: 0,
    health: 0,
    defense: 0,
    speed: 0,
    // 战斗属性加成
    critRate: 0,
    comboRate: 0,
    counterRate: 0,
    stunRate: 0,
    dodgeRate: 0,
    vampireRate: 0,
    // 抗性加成
    critResist: 0,
    comboResist: 0,
    counterResist: 0,
    stunResist: 0,
    dodgeResist: 0,
    vampireResist: 0,
    // 特殊属性加成
    healBoost: 0,
    critDamageBoost: 0,
    critDamageReduce: 0,
    finalDamageBoost: 0,
    finalDamageReduce: 0,
    combatBoost: 0,
    resistanceBoost: 0,
    // 修炼相关加成
    cultivationRate: 1,
    spiritRate: 1
  }
})

export const getters = {}

export const actions = {
  // 穿上装备
  equipArtifact(artifact, slot) {
    // 检查境界要求
    if (artifact.requiredRealm && this.level < artifact.requiredRealm) {
      return { success: false, message: '境界不足，无法装备此装备' }
    }
    // 先卸下当前装备
    if (this.equippedArtifacts[slot]) {
      this.unequipArtifact(slot)
    }
    // 从背包中移除装备
    const index = this.items.findIndex(item => item.id === artifact.id)
    if (index !== -1) {
      this.items.splice(index, 1)
    }
    // 穿上新装备
    this.equippedArtifacts[slot] = artifact
    // 应用装备加成
    if (artifact.stats) {
      Object.entries(artifact.stats).forEach(([key, value]) => {
        // 先更新artifactBonuses
        if (this.artifactBonuses[key] !== undefined) {
          this.artifactBonuses[key] += value
          // 根据属性类型应用到对应的属性组
          if (key in this.baseAttributes) {
            this.baseAttributes[key] += value
          } else if (key in this.combatAttributes) {
            this.combatAttributes[key] = Math.min(1, this.combatAttributes[key] + value)
          } else if (key in this.combatResistance) {
            this.combatResistance[key] = Math.min(1, this.combatResistance[key] + value)
          } else if (key in this.specialAttributes) {
            this.specialAttributes[key] += value
          }
        }
      })
    }
    this.saveData()
    return { success: true, message: '装备成功' }
  },
  // 卸下装备
  unequipArtifact(slot) {
    const artifact = this.equippedArtifacts[slot]
    if (artifact) {
      // 移除装备加成
      if (artifact.stats) {
        Object.entries(artifact.stats).forEach(([key, value]) => {
          if (this.artifactBonuses[key] !== undefined) {
            this.artifactBonuses[key] -= value
            // 从对应的属性组中移除加成
            if (key in this.baseAttributes) {
              this.baseAttributes[key] -= value
            } else if (key in this.combatAttributes) {
              this.combatAttributes[key] = Math.max(0, this.combatAttributes[key] - value)
            } else if (key in this.combatResistance) {
              this.combatResistance[key] = Math.max(0, this.combatResistance[key] - value)
            } else if (key in this.specialAttributes) {
              this.specialAttributes[key] -= value
            }
          }
        })
      }
      // 将装备返回到背包
      this.items.push(artifact)
      this.equippedArtifacts[slot] = null
      this.saveData()
      return true
    }
    return false
  },
  // 获取装备总加成
  getArtifactBonus(type) {
    // 不能用 `|| 1`：合法加成 0 会被误返回 1（乘法类字段才需要 1 作默认值）
    return this.artifactBonuses[type] ?? 0
  }
}
