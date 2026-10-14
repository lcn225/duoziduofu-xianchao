import {
  getRealmName,
  getBodyRealmName,
  REALM_MAX_LEVEL,
  INITIAL_REALM_NAME,
  INITIAL_BODY_REALM_NAME
} from '../../plugins/realm'

// 角色本体：身份、内外功境界、灵力与各项倍率、修炼统计
export const state = () => ({
  // 基础属性
  name: '无名修士',
  nameChangeCount: 0, // 道号修改次数
  level: 1, // 内功境界等级（扁平索引 1..18）
  realm: INITIAL_REALM_NAME, // 当前内功境界名称
  cultivation: 0, // 当前修为值
  maxCultivation: getRealmName(1).maxCultivation, // 当前境界最大修为值
  // 外功（炼体）平行线：与内功独立进度，不互为前置
  bodyLevel: 1, // 外功境界等级（扁平索引 1..18）
  bodyRealm: INITIAL_BODY_REALM_NAME, // 当前外功境界名称
  bodyCultivation: 0, // 当前体魄值
  maxBodyCultivation: getBodyRealmName(1).maxCultivation, // 当前外功境界最大体魄值
  spirit: 0, // 灵力值
  spiritRate: 1, // 灵力获取倍率
  luck: 1, // 幸运值
  cultivationRate: 1, // 修炼速率
  herbRate: 1, // 灵草获取倍率
  alchemyRate: 1, // 炼丹成功率加成
  // 统计数据
  totalCultivationTime: 0, // 总修炼时间
  breakthroughCount: 0 // 突破次数
})

export const getters = {}

export const actions = {
  // 获取灵力
  gainSpirit(amount) {
    this.spirit += amount * this.spiritRate
    this.saveData()
  },
  // 修炼增加修为
  cultivate(amount) {
    // 确保amount是数字类型
    const numAmount = Number(String(amount).replace(/[^0-9.-]/g, '')) || 0
    this.cultivation = Number(String(this.cultivation).replace(/[^0-9.-]/g, '')) || 0
    this.cultivation += numAmount
    this.totalCultivationTime += 1 // 增加修炼时间统计
    if (this.cultivation >= this.maxCultivation) {
      this.tryBreakthrough()
    }
    this.saveData()
  },
  // 尝试突破（内功）
  tryBreakthrough() {
    // 检查是否可以突破到下一个境界
    if (this.level < REALM_MAX_LEVEL) {
      // 注意：getRealmName(n) 返回的是「第 n 级」的境界，
      // 所以要突破到下一级就得传 this.level + 1，传 this.level 会停在原地
      const nextRealm = getRealmName(this.level + 1)
      // 更新境界信息
      this.level += 1
      this.realm = nextRealm.name // 使用完整的境界名称（如：练气三层）
      this.maxCultivation = nextRealm.maxCultivation
      this.cultivation = 0 // 重置修为值
      this.breakthroughCount += 1 // 增加突破次数
      // 解锁新境界
      if (!this.unlockedRealms.includes(nextRealm.name)) {
        this.unlockedRealms.push(nextRealm.name)
      }
      // 突破奖励
      this.spirit += 100 * this.level // 获得灵力奖励
      this.spiritRate *= 1.2 // 提升灵力获取倍率
      this.saveData()
      return true
    }
    return false
  },
  // 尝试突破（外功）
  // 与内功对称，进度完全独立。本期只落数据与推进逻辑，
  // 体魄的产出途径（妖兽血肉、气血汤、炼体功法）与 UI 留待「修行与突破」模块。
  tryBodyBreakthrough() {
    if (this.bodyLevel < REALM_MAX_LEVEL) {
      const nextRealm = getBodyRealmName(this.bodyLevel + 1)
      this.bodyLevel += 1
      this.bodyRealm = nextRealm.name
      this.maxBodyCultivation = nextRealm.maxCultivation
      this.bodyCultivation = 0
      this.saveData()
      return true
    }
    return false
  }
}
