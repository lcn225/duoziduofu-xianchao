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
import { specialtyCoefForType } from '../../plugins/innerCourt.js'
// P62：炼器产物是一条带 count 的堆，穿/脱要按「拆一件 / 还一件」处理
import { gainInto, instanceOf, isStackable, nextInstanceIdOf, unitsOf } from '../../plugins/stacks.js'
// P56-c：器诀的装备百分比（与专精词条**同一加区**，见 `artifactPanel`）
import { vesselArtBonusForTypeOf } from '../../plugins/artEffects.js'

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
   * 装备加成（**已套传承专精 + 器诀**，P60 / P56-c）。
   *
   * 两样东西在**同一个加区**（《功法系统》§4.3「与词条加算」）：
   *   专精词条 → 细类命中器型 ×1.2 / 大类命中 ×1.1，取最高不叠乘；
   *   器诀功法 → 按等级的百分比（`artEffects.js`），只加对应器型，缺失器型 = 全部灵器。
   * 合计写法 = `1 + 专精增量 + 器诀百分比`，**先加总再乘装备白板**。
   *
   * 两样都没有时直接返回 `artifactBonuses`，行为与旧版完全一致。
   * 只影响**面板求和**，不改 `baseAttributes` / `artifactBonuses` 本身。
   */
  artifactPanel() {
    const specialties = this.legacySpecialties || []
    const vesselMap = this.vesselArtBonusMap || {}
    if (!specialties.length && !Object.keys(vesselMap).length) return this.artifactBonuses
    const out = {}
    for (const key of Object.keys(this.artifactBonuses)) out[key] = 0
    for (const slot of EQUIP_SLOT_KEYS) {
      const item = this.equippedArtifacts?.[slot]
      if (!item?.stats) continue
      const coef =
        specialtyCoefForType(specialties, item.type) + vesselArtBonusForTypeOf(vesselMap, item.type)
      for (const [key, value] of Object.entries(item.stats)) {
        if (out[key] === undefined) continue
        out[key] += (Number(value) || 0) * coef
      }
    }
    return out
  },
  /**
   * 桂冈四属性**真值**（战斗、顶栏、秘境快照都读它）。
   *
   * `= (本体 × 境界乘区 + 装备 + 灵宠 + 炼体) × (1 + 传承战力词条) × (1 + 非心法功法)`
   * —— 后两个是**两个乘区**（《装备系统》§十 + §15.5.4 B 类；《功法系统》§5.4 第 2 条
   * 「跨系统乘算」）。非心法的四项已各自套过软上限（P56-c）。
   */
  combatPanel() {
    const panel = playerPanel({
      level: this.level,
      innate: this.innateAttributes,
      artifact: this.artifactPanel,
      pet: this.activePet?.combatAttributes || {},
      body: this.bodyBonus
    })
    const combatMult = 1 + (Number(this.legacyCombatBonus) || 0)
    const art = this.nonArtEffects || {}
    const artActive = art.attack || art.speed || art.health || art.defense
    if (combatMult === 1 && !artActive) return panel
    for (const key of Object.keys(panel)) {
      panel[key] *= combatMult * (1 + (Number(art[key]) || 0))
    }
    return panel
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
    // 校验都过了才动背包：堆里扣 1（拆出实例），单件直接整条移走
    artifact = this._takeOneUnit(artifact)
    // 先卸下当前装备
    if (this.equippedArtifacts[target]) {
      this.unequipArtifact(target)
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
  /**
   * 从背包里「扣掉一件」，返回真正要穿上的那个实例（P62）。
   *
   * 炼器产物在背包里是一条带 `count` 的堆（`stacks.isCraftedClone`）：
   *   · 堆里还有多件 → 数量减 1，**拆出一个新实例**穿在身上（id 必须换，不能和堆共用）；
   *   · 只剩一件 / 普通掉落灵器 → 整条从背包移除，穿的就是它本身。
   * 找不到条目（老调用方直接传对象）时原样返回，不报错。
   */
  _takeOneUnit(artifact) {
    if (!artifact) return artifact
    const at = (this.items || []).findIndex(entry => entry.id === artifact.id)
    if (at === -1) return artifact
    const entry = this.items[at]
    const have = unitsOf(entry)
    if (isStackable(entry) && have > 1) {
      this.items[at] = { ...entry, count: have - 1 }
      return instanceOf(entry, nextInstanceIdOf(entry))
    }
    this.items.splice(at, 1)
    return entry
  },
  // 卸下装备
  unequipArtifact(slot) {
    const artifact = this.equippedArtifacts[slot]
    if (artifact) {
      // 移除装备加成
      this._applyArtifactStats(artifact, -1)
      // 将装备返回到背包（P62：炼器产物走 gainInto 才能并回堆里）
      gainInto(this.items, artifact)
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
