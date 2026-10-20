import { pillRecipes, tryCreatePill, calculatePillEffect } from '../../plugins/pills'

// 丹药与丹方
export const state = () => ({
  pillFragments: {}, // 丹方残页（key为丹方ID，value为数量）
  pillRecipes: [], // 已获得的完整丹方
  activeEffects: [], // 当前生效的丹药效果列表
  pillsCrafted: 0, // 炼制丹药次数
  pillsConsumed: 0 // 服用丹药次数
})

export const getters = {}

export const actions = {
  // 使用物品（丹药或灵宠）
  // 分发器：具体逻辑分别在 usePill / usePet
  useItem(item) {
    if (item.type === 'pill') {
      return this.usePill(item)
    } else if (item.type === 'pet') {
      return this.usePet(item)
    }
    return { success: false, message: '无法使用该物品' }
  },
  // 使用丹药
  usePill(pill) {
    const now = Date.now()
    // 添加效果
    this.activeEffects.push({
      ...pill.effect,
      startTime: now,
      endTime: now + pill.effect.duration * 1000
    })
    // 移除已使用的丹药
    const index = this.items.findIndex(i => i.id === pill.id)
    if (index > -1) {
      this.items.splice(index, 1)
      this.pillsConsumed++
    }
    // 清理过期效果
    this.activeEffects = this.activeEffects.filter(effect => effect.endTime > now)
    this.saveData()
    return { success: true, message: '使用丹药成功' }
  },
  // 炼制丹药
  craftPill(recipeId) {
    const recipe = pillRecipes.find(r => r.id === recipeId)
    if (!recipe || !this.pillRecipes.includes(recipeId)) {
      return { success: false, message: '未掌握丹方' }
    }
    const fragments = this.pillFragments[recipeId] || 0
    const result = tryCreatePill(recipe, this.herbs, this, fragments, this.luck * this.alchemyRate)
    if (result.success) {
      // 消耗材料
      recipe.materials.forEach(material => {
        for (let i = 0; i < material.count; i++) {
          const index = this.herbs.findIndex(h => h.id === material.herb)
          if (index > -1) {
            this.herbs.splice(index, 1)
          }
        }
      })
      // 创建丹药
      const effect = calculatePillEffect(recipe, this.level)
      const pill = {
        id: `${recipe.id}_${Date.now()}`,
        name: recipe.name,
        description: recipe.description,
        type: 'pill',
        effect
      }
      this.items.push(pill)
      this.pillsCrafted++
      this.saveData()
    }
    return result
  },
  // 获得丹方残页
  gainPillFragment(recipeId, { save = true } = {}) {
    if (!this.pillFragments[recipeId]) {
      this.pillFragments[recipeId] = 0
    }
    this.pillFragments[recipeId]++
    // 检查是否可以合成完整丹方
    const recipe = pillRecipes.find(r => r.id === recipeId)
    if (recipe && this.pillFragments[recipeId] >= recipe.fragmentsNeeded) {
      this.pillFragments[recipeId] -= recipe.fragmentsNeeded
      if (!this.pillRecipes.includes(recipeId)) {
        this.pillRecipes.push(recipeId)
        this.unlockedPillRecipes++
      }
    }
    if (save) this.saveData()
  },
  // 获取当前有效的丹药效果
  getActiveEffects() {
    const now = Date.now()
    return this.activeEffects.filter(effect => effect.endTime > now)
  }
}
