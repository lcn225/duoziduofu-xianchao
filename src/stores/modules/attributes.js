// 战斗属性四件套 + 装备栏位 + 装备加成汇总
//
// 注意：baseAttributes / combatAttributes / combatResistance / specialAttributes 是
// 角色当前生效的属性（含装备与灵宠加成），artifactBonuses 记录其中来自装备的部分。
// 穿脱装备与灵宠出战都会同时改这两处，二者必须保持同步。
//
// 2026-10-23（P36）：装备栏位从 13 个收敛到 **5 个**（武器/防具/头饰/饰品/法宝）。
// 老档按 `equipVersion: 2` 迁移：能映射的槽位保留、其余卸回背包；**不自动卖**。
// 迁移时旧装备的面板按新公式重生成 —— 玩家会发现数值变了，这是预期行为。

import {
  EQUIP_SLOT_KEYS,
  LEGACY_SLOT_TO_SLOT,
  equipSlotOfType,
  generateEquipment
} from '../../plugins/equipment.js'
import {
  innateAttributesOf,
  playerPanel,
  realmGrowthMultiplier as realmGrowthOf
} from '../../plugins/stats.js'

/** 新装备槽的默认值（迁移与 reset 都用它，避免两处写两份） */
const EMPTY_EQUIPPED = () => ({
  weapon: null, // 武器
  body: null, // 防具
  head: null, // 头饰
  accessory: null, // 饰品
  artifact: null // 法宝
})

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
  // 装备栏位（5 槽，P36）
  equippedArtifacts: EMPTY_EQUIPPED(),
  /** 装备结构版本；2 = 5 槽 + 新面板公式。老档为 0，迁移后置 2（幂等） */
  equipVersion: 0,
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

export const getters = {
  /**
   * 内功境界乘区 `1 + 0.12 × 内功层数`（P36 第 2 步，2026-10-23）。
   *
   * ⚠ `this.level` 是 `realm.js` 的扁平索引 1..18：练气一层 = 1、**筑基初期 = 11**
   *   → ×2.32。把它当「练气几层」算会得到 ×2.44，那是筑基中期。
   */
  realmGrowthMultiplier() {
    return realmGrowthOf(this.level)
  },
  /**
   * 本体四属性 = `baseAttributes` 扣掉装备与灵宠加成。
   *
   * state 里的 `baseAttributes` 是**含加成**的现值（穿脱装备时原地加减），
   * 境界乘区只乘本体，所以这里按 `artifactBonuses` 与出战灵宠的面板反推。
   * 两者都必须与 `baseAttributes` 同步，否则面板会漂 —— 见本文件顶部注释。
   */
  innateAttributes() {
    return innateAttributesOf({
      base: this.baseAttributes,
      artifact: this.artifactBonuses,
      pet: this.activePet?.combatAttributes || {}
    })
  },
  /**
   * 桂冈四属性**真值**（战斗、顶栏、秘境快照都读它）。
   * `= 本体 × 境界乘区 + 装备 + 灵宠 + 炼体`（《装备系统》§十）。
   */
  combatPanel() {
    return playerPanel({
      level: this.level,
      innate: this.innateAttributes,
      artifact: this.artifactBonuses,
      pet: this.activePet?.combatAttributes || {},
      body: this.bodyBonus
    })
  }
}

export const actions = {
  /**
   * 装备面板的加减（穿 / 脱共用）：`sign = +1` 穿上、`-1` 卸下。
   *
   * 抽出来是为了「一键装备」能一口气换 N 件、**只在最后落盘一次** ——
   * 原来每穿一件都 `saveData()`，换成十几件就是十几次整档序列化 + 加密。
   *
   * ⚠ 只改记忆里那四组属性与 `artifactBonuses`，**不动 `items` / `equippedArtifacts`**，
   *   搬运物品由调用方负责。
   */
  _applyArtifactStats(item, sign = 1) {
    const stats = item?.stats
    if (!stats) return
    Object.entries(stats).forEach(([key, value]) => {
      if (this.artifactBonuses[key] === undefined) return
      const delta = (Number(value) || 0) * sign
      this.artifactBonuses[key] += delta
      // 根据属性类型应用到对应的属性组
      if (key in this.baseAttributes) {
        this.baseAttributes[key] += delta
      } else if (key in this.combatAttributes) {
        this.combatAttributes[key] = Math.min(1, Math.max(0, this.combatAttributes[key] + delta))
      } else if (key in this.combatResistance) {
        this.combatResistance[key] = Math.min(1, Math.max(0, this.combatResistance[key] + delta))
      } else if (key in this.specialAttributes) {
        this.specialAttributes[key] += delta
      }
    })
  },

  // 穿上装备
  equipArtifact(artifact, slot) {
    // 检查境界要求
    if (artifact.requiredRealm && this.level < artifact.requiredRealm) {
      return { success: false, message: '境界不足，无法装备此装备' }
    }
    // 槽位归一：可能是 5 槽键、旧 13 槽键、或灵器中文 type（炼器产物 type === slot）
    const target = EQUIP_SLOT_KEYS.includes(slot)
      ? slot
      : LEGACY_SLOT_TO_SLOT[slot] ||
        (EQUIP_SLOT_KEYS.includes(artifact.equipSlot)
          ? artifact.equipSlot
          : EQUIP_SLOT_KEYS.includes(artifact.type)
            ? artifact.type
            : equipSlotOfType(artifact.type))
    // 先卸下当前装备
    if (this.equippedArtifacts[target]) {
      this.unequipArtifact(target)
    }
    // 从背包中移除装备
    const index = this.items.findIndex(item => item.id === artifact.id)
    if (index !== -1) {
      this.items.splice(index, 1)
    }
    // 穿上新装备（顺手把实例上的槽位字段也归一，UI 与对比都用它）
    artifact.equipSlot = target
    artifact.slot = target
    artifact.equipType = target
    this.equippedArtifacts[target] = artifact
    // 应用装备加成
    this._applyArtifactStats(artifact, 1)
    this.saveData()
    return { success: true, message: '装备成功' }
  },
  // 卸下装备
  unequipArtifact(slot) {
    const artifact = this.equippedArtifacts[slot]
    if (artifact) {
      // 移除装备加成
      this._applyArtifactStats(artifact, -1)
      // 将装备返回到背包
      this.items.push(artifact)
      this.equippedArtifacts[slot] = null
      this.saveData()
      return true
    }
    return false
  },
  /**
   * 老档装备结构迁移：13 槽 → 5 槽（`equipVersion: 2`，幂等）。
   *
   * 规则（《装备系统》§十三）：
   *   · weapon→武器，body→防具，head→头饰，artifact→法宝，ring1→饰品；
   *   · 其余 8 个旧槽（裤子/鞋子/肩甲/手套/护腕/项链/戒指2/腰带）**强制卸回背包**，不自动卖；
   *   · 拔下来的灵器按新公式（白板 + 主属性 + 副属性 + 词条）**重生成面板**，
   *     玩家会发现数值变了 —— **这是预期行为**，UI 迁移后会提示一次。
   *
   * 面板不能直接重算：baseAttributes 里同时混着灵宠加成，只能「先扣旧、再重新穿上」。
   *
   * @returns {boolean} 有没有改动
   */
  migrateEquipSlotsV2() {
    if (Number(this.equipVersion) >= 2) return false
    const snapshot = Object.entries({ ...(this.equippedArtifacts || {}) })
    const next = EMPTY_EQUIPPED()

    for (const [oldSlot, item] of snapshot) {
      if (!item) continue
      // 扣掉旧面板 + 回背包（unequipArtifact 自己落盘）
      this.unequipArtifact(oldSlot)
      const target =
        LEGACY_SLOT_TO_SLOT[oldSlot] ||
        (EQUIP_SLOT_KEYS.includes(item.equipSlot) ? item.equipSlot : null)
      // 映射不到新槽，或者同槽已经占了一件 → 留在背包里，不自动卖
      if (!target || next[target]) continue
      next[target] = this.regenerateEquipmentPanel(item, target)
    }

    this.equippedArtifacts = next
    for (const [slot, item] of Object.entries(next)) {
      if (item) this.equipArtifact(item, slot)
    }
    this.equipVersion = 2
    this.saveData()
    return true
  },

  /**
   * 按 P36 新公式重生成一件灵器的面板（迁移 / 补数据用）。
   * 炼器产物没有 baseId（面板是配方写死的），只归一槽位，不重掷。
   */
  regenerateEquipmentPanel(item, slot) {
    const target = slot || (EQUIP_SLOT_KEYS.includes(item?.equipSlot) ? item.equipSlot : null)
    if (!item || !target) return item
    if (!item.baseId) {
      return { ...item, equipSlot: target, slot: target, equipType: target }
    }
    const rolled = generateEquipment({
      slot: target,
      type: item.type,
      tier: item.tier,
      quality: item.quality,
      series: item.series
    })
    return {
      ...item,
      equipSlot: target,
      slot: target,
      equipType: target,
      stats: rolled.stats,
      mainStats: rolled.mainStats,
      subStats: rolled.subStats,
      traits: rolled.traits,
      statsVersion: 1
    }
  },

  // 获取装备总加成
  getArtifactBonus(type) {
    // 不能用 `|| 1`：合法加成 0 会被误返回 1（乘法类字段才需要 1 作默认值）
    return this.artifactBonuses[type] ?? 0
  }
}
