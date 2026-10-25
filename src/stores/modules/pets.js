// 灵兽系统（**2026-10-25 P43 重写**）
//
// 真源：《数值真值表》§5.8 +《下一步》P43。
//   · 面板 = 白板(T1~T5) × 成色 × 境界系数（`petUnit.petPanelOf`，唯一口径）
//   · 等级靠**同修**：桂冈镇守打坐拿到的修为，出战灵兽额外获得 50%（不扣桂冈）
//   · 上限 = 主角小境界；本命同源 +1；初始等级 = max(1, 主角小境界 − 3)
//
// ⚠ **精华 / 升级 / 升星整条线已删除**（`petEssence` / `upgradePet` / `evolvePet`）。
//   老档字段在 `migratePetsV2` 里直接删、不补偿；`star` 只留作历史字段、不参与任何计算。
// ⚠ 出战灵兽仍给桂冈一份平加面板（老口径保留）：面板随等级变化，
//   所以升级后必须 `refreshActivePetPanel()` 先扣旧值再加新值，否则 `baseAttributes` 会漂。

import {
  PET_TUNING,
  growPet,
  petLevelCapOf,
  petPanelOf,
  petSameSeriesOf
} from '../../plugins/petUnit.js'
import { playerFates } from '../../plugins/harmony.js'

export const state = () => ({
  activePet: null // 当前出战的灵兽（同修经验只给它）
})

export const getters = {
  /** 出战灵兽的当前面板（UI 与桂冈加成共用） */
  activePetPanel() {
    return this.activePet ? petPanelOf(this.activePet) : null
  },
  /** 玩家里程本命的 series 集合（判断灵兽是否「本命同源」） */
  playerFateSeries() {
    return playerFates(this.practice).map(fate => fate.series).filter(Boolean)
  }
}

export const actions = {
  /** 同修经验入账（只给**出战**的那只；它才是随桂冈打坐的灵兽） */
  gainPetCultivation(amount) {
    const pet = this.activePet
    if (!pet || !(Number(amount) > 0)) return null
    const before = pet.level || 1
    const result = growPet(pet, amount, {
      playerLevel: this.level,
      sameSeries: petSameSeriesOf(pet, this.playerFateSeries)
    })
    pet.level = result.level
    pet.xp = result.xp
    if (result.level !== before) this.refreshActivePetPanel()
    this.saveData()
    return result
  },

  // 使用灵宠（出战/召回）
  usePet(pet) {
    if (!this.activePet) return this.deployPet(pet)
    if (this.activePet.id === pet.id) return this.recallPet()
    this.recallPet()
    return this.deployPet(pet)
  },
  // 召回灵宠
  recallPet() {
    if (!this.activePet) return { success: false, message: '当前没有出战的灵宠' }
    this.resetPetBonuses()
    this.activePet = null
    this.saveData()
    return { success: true, message: '召回成功' }
  },
  // 出战灵宠
  deployPet(pet) {
    if (this.activePet) this.recallPet()
    this.activePet = pet
    this.syncActivePetPanel()
    this.applyPetBonuses()
    this.saveData()
    return { success: true, message: '出战成功' }
  },
  /** 把等级/成色算出来的面板写回实例（只写出战那只） */
  syncActivePetPanel() {
    if (!this.activePet) return false
    this.activePet.combatAttributes = petPanelOf(this.activePet)
    return true
  },
  /**
   * 等级变化后刷新桂冈面板：**先扣旧面板、再算新面板、再加回去**。
   * 灵兽升一级面板是整块变化的，直接再 apply 一次会重复叠加。
   */
  refreshActivePetPanel() {
    if (!this.activePet) return false
    this.resetPetBonuses()
    this.syncActivePetPanel()
    this.applyPetBonuses()
    return true
  },
  // 重置灵宠属性加成
  resetPetBonuses() {
    if (!this.activePet) return
    const petBonus = this.activePet.combatAttributes
    if (!petBonus) return
    // 保存原始属性值
    const originalBaseAttributes = { ...this.baseAttributes }
    const originalCombatAttributes = { ...this.combatAttributes }
    const originalCombatResistance = { ...this.combatResistance }
    const originalSpecialAttributes = { ...this.specialAttributes }
    // 更新基础属性
    this.baseAttributes.attack = originalBaseAttributes.attack - (petBonus.attack || 0)
    this.baseAttributes.defense = originalBaseAttributes.defense - (petBonus.defense || 0)
    this.baseAttributes.health = originalBaseAttributes.health - (petBonus.health || 0)
    this.baseAttributes.speed = originalBaseAttributes.speed - (petBonus.speed || 0)
    // 更新战斗属性
    Object.keys(this.combatAttributes).forEach(key => {
      this.combatAttributes[key] = originalCombatAttributes[key] - (petBonus[key] || 0)
    })
    // 更新战斗抗性
    Object.keys(this.combatResistance).forEach(key => {
      this.combatResistance[key] = originalCombatResistance[key] - (petBonus[key] || 0)
    })
    // 更新特殊属性
    Object.keys(this.specialAttributes).forEach(key => {
      this.specialAttributes[key] = originalSpecialAttributes[key] - (petBonus[key] || 0)
    })
  },
  // 应用灵宠属性加成
  applyPetBonuses() {
    if (!this.activePet) return
    const petBonus = this.activePet.combatAttributes
    if (!petBonus) return
    // 保存原始属性值
    const originalBaseAttributes = { ...this.baseAttributes }
    const originalCombatAttributes = { ...this.combatAttributes }
    const originalCombatResistance = { ...this.combatResistance }
    const originalSpecialAttributes = { ...this.specialAttributes }
    // 更新基础属性
    this.baseAttributes.attack = originalBaseAttributes.attack + (petBonus.attack || 0)
    this.baseAttributes.defense = originalBaseAttributes.defense + (petBonus.defense || 0)
    this.baseAttributes.health = originalBaseAttributes.health + (petBonus.health || 0)
    this.baseAttributes.speed = originalBaseAttributes.speed + (petBonus.speed || 0)
    // 更新战斗属性
    Object.keys(this.combatAttributes).forEach(key => {
      this.combatAttributes[key] = originalCombatAttributes[key] + (petBonus[key] || 0)
    })
    // 更新战斗抗性
    Object.keys(this.combatResistance).forEach(key => {
      this.combatResistance[key] = originalCombatResistance[key] + (petBonus[key] || 0)
    })
    // 更新特殊属性
    Object.keys(this.specialAttributes).forEach(key => {
      this.specialAttributes[key] = originalSpecialAttributes[key] + (petBonus[key] || 0)
    })
  }
}
