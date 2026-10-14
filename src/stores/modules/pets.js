// 灵宠系统
export const state = () => ({
  activePet: null, // 当前出战的灵宠
  petEssence: 0, // 灵宠精华
  petConfig: {
    rarityMap: {
      divine: { name: '神品', color: '#FF0000', probability: 0.02, essenceBonus: 50 },
      celestial: { name: '仙品', color: '#FFD700', probability: 0.08, essenceBonus: 30 },
      mystic: { name: '玄品', color: '#9932CC', probability: 0.15, essenceBonus: 20 },
      spiritual: { name: '灵品', color: '#1E90FF', probability: 0.25, essenceBonus: 10 },
      mortal: { name: '凡品', color: '#32CD32', probability: 0.5, essenceBonus: 5 }
    }
  }
})

export const getters = {
  // 获取灵宠的属性加成
  getPetBonus() {
    if (!this.activePet)
      return {
        attack: 0,
        defense: 0,
        health: 0,
        critRate: 0,
        comboRate: 0,
        counterRate: 0,
        stunRate: 0,
        dodgeRate: 0,
        vampireRate: 0,
        critResist: 0,
        comboResist: 0,
        counterResist: 0,
        stunResist: 0,
        dodgeResist: 0,
        vampireResist: 0,
        healBoost: 0,
        critDamageBoost: 0,
        critDamageReduce: 0,
        finalDamageBoost: 0,
        finalDamageReduce: 0,
        combatBoost: 0,
        resistanceBoost: 0
      }
    const qualityBonusMap = {
      divine: 0.15, // 神品基础加成15%
      celestial: 0.12, // 仙品基础加成12%
      mystic: 0.09, // 玄品基础加成9%
      spiritual: 0.06, // 灵品基础加成6%
      mortal: 0.03 // 凡品基础加成3%
    }
    const starBonusPerQuality = {
      divine: 0.02, // 神品每星+2%
      celestial: 0.01, // 仙品每星+1%
      mystic: 0.01, // 玄品每星+1%
      spiritual: 0.01, // 灵品每星+1%
      mortal: 0.01 // 凡品每星+1%
    }
    const baseBonus = qualityBonusMap[this.activePet.rarity] || 0
    const starBonus = (this.activePet.star || 0) * (starBonusPerQuality[this.activePet.rarity] || 0)
    const levelBonus = ((this.activePet.level || 1) - 1) * (baseBonus * 0.1)
    const totalBonus = baseBonus + starBonus + levelBonus
    const phase = Math.floor((this.activePet.star || 0) / 5)
    const phaseBonus = phase * (baseBonus * 0.5)
    const finalBonus = totalBonus + phaseBonus
    const combatBonus = finalBonus * 0.5
    return {
      attack: finalBonus,
      defense: finalBonus,
      health: finalBonus,
      critRate: combatBonus,
      comboRate: combatBonus,
      counterRate: combatBonus,
      stunRate: combatBonus,
      dodgeRate: combatBonus,
      vampireRate: combatBonus,
      critResist: combatBonus,
      comboResist: combatBonus,
      counterResist: combatBonus,
      stunResist: combatBonus,
      dodgeResist: combatBonus,
      vampireResist: combatBonus,
      healBoost: combatBonus,
      critDamageBoost: combatBonus,
      critDamageReduce: combatBonus,
      finalDamageBoost: combatBonus,
      finalDamageReduce: combatBonus,
      combatBoost: combatBonus,
      resistanceBoost: combatBonus
    }
  }
}

export const actions = {
  // 使用灵宠（出战/召回）
  usePet(pet) {
    // 如果当前没有出战灵宠，直接出战新灵宠
    if (!this.activePet) {
      return this.deployPet(pet)
    }
    // 如果点击的是当前出战灵宠，则召回
    if (this.activePet.id === pet.id) {
      return this.recallPet()
    }
    // 如果点击的是其他灵宠，先召回当前灵宠，再出战新灵宠
    this.recallPet()
    return this.deployPet(pet)
  },
  // 召回灵宠
  recallPet() {
    if (!this.activePet) {
      return { success: false, message: '当前没有出战的灵宠' }
    }
    // 重置所有属性加成
    this.resetPetBonuses()
    this.activePet = null
    this.saveData()
    return { success: true, message: '召回成功' }
  },
  // 出战灵宠
  deployPet(pet) {
    // 如果已有灵宠出战，先召回
    if (this.activePet) {
      this.recallPet()
    }
    // 出战新灵宠
    this.activePet = pet
    // 应用灵宠属性加成
    this.applyPetBonuses()
    this.saveData()
    return { success: true, message: '出战成功' }
  },
  // 重置灵宠属性加成
  resetPetBonuses() {
    const petBonus = this.activePet.combatAttributes
    // 保存原始属性值
    const originalBaseAttributes = { ...this.baseAttributes }
    const originalCombatAttributes = { ...this.combatAttributes }
    const originalCombatResistance = { ...this.combatResistance }
    const originalSpecialAttributes = { ...this.specialAttributes }
    // 更新基础属性
    this.baseAttributes.attack = originalBaseAttributes.attack - petBonus.attack
    this.baseAttributes.defense = originalBaseAttributes.defense - petBonus.defense
    this.baseAttributes.health = originalBaseAttributes.health - petBonus.health
    this.baseAttributes.speed = originalBaseAttributes.speed - petBonus.speed
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
    // 保存原始属性值
    const originalBaseAttributes = { ...this.baseAttributes }
    const originalCombatAttributes = { ...this.combatAttributes }
    const originalCombatResistance = { ...this.combatResistance }
    const originalSpecialAttributes = { ...this.specialAttributes }
    // 更新基础属性
    this.baseAttributes.attack = originalBaseAttributes.attack + petBonus.attack
    this.baseAttributes.defense = originalBaseAttributes.defense + petBonus.defense
    this.baseAttributes.health = originalBaseAttributes.health + petBonus.health
    this.baseAttributes.speed = originalBaseAttributes.speed + petBonus.speed
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
  },
  // 升级灵宠
  upgradePet(pet, essenceCount) {
    if (this.petEssence < essenceCount) {
      return { success: false, message: '灵宠精华不足' }
    }
    // 消耗精华并提升等级
    this.petEssence -= essenceCount
    const petIndex = this.items.findIndex(item => item.id === pet.id)
    if (petIndex > -1) {
      const currentPet = this.items[petIndex]
      currentPet.level = (currentPet.level || 1) + 1
      // 根据品质和等级提升战斗属性
      const qualityMultiplier =
        {
          divine: 2.0,
          celestial: 1.8,
          mystic: 1.6,
          spiritual: 1.4,
          mortal: 1.2
        }[currentPet.rarity] || 1.2
      // 更新战斗属性
      currentPet.combatAttributes = {
        attack: Math.floor(currentPet.combatAttributes.attack * (1 + 0.01 * qualityMultiplier)),
        health: Math.floor(currentPet.combatAttributes.health * (1 + 0.01 * qualityMultiplier)),
        defense: Math.floor(currentPet.combatAttributes.defense * (1 + 0.01 * qualityMultiplier)),
        speed: Math.floor(currentPet.combatAttributes.speed * (1 + 0.01 * qualityMultiplier)),

        critRate: currentPet.combatAttributes.critRate + 0.01 * qualityMultiplier,
        comboRate: currentPet.combatAttributes.comboRate + 0.01 * qualityMultiplier,
        counterRate: currentPet.combatAttributes.counterRate + 0.01 * qualityMultiplier,
        stunRate: currentPet.combatAttributes.stunRate + 0.01 * qualityMultiplier,
        dodgeRate: currentPet.combatAttributes.dodgeRate + 0.01 * qualityMultiplier,
        vampireRate: currentPet.combatAttributes.vampireRate + 0.01 * qualityMultiplier,

        critResist: currentPet.combatAttributes.critResist + 0.01 * qualityMultiplier, // 抗暴击
        comboResist: currentPet.combatAttributes.comboResist + 0.01 * qualityMultiplier, // 抗连击
        counterResist: currentPet.combatAttributes.counterResist + 0.01 * qualityMultiplier, // 抗反击
        stunResist: currentPet.combatAttributes.stunResist + 0.01 * qualityMultiplier, // 抗眩晕
        dodgeResist: currentPet.combatAttributes.dodgeResist + 0.01 * qualityMultiplier, // 抗闪避
        vampireResist: currentPet.combatAttributes.vampireResist + 0.01 * qualityMultiplier, // 抗吸血

        healBoost: currentPet.combatAttributes.healBoost + 0.01 * qualityMultiplier,
        critDamageBoost: currentPet.combatAttributes.critDamageBoost + 0.01 * qualityMultiplier,
        critDamageReduce: currentPet.combatAttributes.critDamageReduce + 0.01 * qualityMultiplier,
        finalDamageBoost: currentPet.combatAttributes.finalDamageBoost + 0.01 * qualityMultiplier,
        finalDamageReduce: currentPet.combatAttributes.finalDamageReduce + 0.01 * qualityMultiplier,
        combatBoost: currentPet.combatAttributes.combatBoost + 0.01 * qualityMultiplier,
        resistanceBoost: currentPet.combatAttributes.resistanceBoost + 0.01 * qualityMultiplier
      }
      // 如果是当前出战的灵宠，重新应用属性加成
      if (this.activePet && this.activePet.id === pet.id) {
        this.applyPetBonuses()
      }
    }
    this.saveData()
    return { success: true, message: '升级成功' }
  },
  // 升星灵宠
  evolvePet(pet, foodPet) {
    // 检查是否是相同品质和名字的灵宠
    if (pet.rarity != foodPet.rarity || pet.name != foodPet.name) {
      return { success: false, message: '只能使用相同品质和名字的灵宠进行升星' }
    }
    const petIndex = this.items.findIndex(item => item.id === pet.id)
    const foodPetIndex = this.items.findIndex(item => item.id === foodPet.id)
    if (petIndex > -1 && foodPetIndex > -1) {
      // 返还作为升星材料的灵宠已消耗的精华
      const returnEssence = (foodPet.level - 1) * 10 // 假设每级消耗10精华
      this.petEssence += returnEssence
      // 移除作为材料的灵宠
      this.items.splice(foodPetIndex, 1)
      // 提升目标灵宠星级
      this.items[petIndex].star = (this.items[petIndex].star || 0) + 1
      this.saveData()
      return { success: true, message: '升星成功' }
    }
    return { success: false, message: '升星失败' }
  }
}
