// 背包与资源
//
// items 是混装数组：装备、丹药（type: 'pill'）、灵宠（type: 'pet'）都放在一起，
// 按 type 区分。多个模块会读写它，改动时注意别破坏其他类型的元素。
export const state = () => ({
  // 资源
  spiritStones: 0, // 灵石数量
  reinforceStones: 0, // 强化石数量
  refinementStones: 0, // 洗练石数量
  herbs: [], // 灵草库存
  items: [] // 物品库存（装备/丹药/灵宠混存）
})

export const getters = {}

export const actions = {
  // 获得物品
  gainItem(item) {
    this.items.push(item)
    this.itemsFound++ // 增加获得物品统计
    this.saveData()
  },
  // 添加装备到背包
  addEquipment(equipment) {
    if (!this.items) {
      this.items = []
    }
    this.items.push(equipment)
    this.saveData()
  },
  // 卖出装备
  async sellEquipment(equipment) {
    const index = this.items.findIndex(i => i.id === equipment.id)
    if (index === -1) {
      return { success: false, message: '装备不存在' }
    }
    return new Promise(resolve => {
      const worker = new Worker(new URL('../../workers/equipment.js', import.meta.url))
      worker.onmessage = e => {
        const { stoneAmount, itemId } = e.data
        this.reinforceStones += stoneAmount
        const index = this.items.findIndex(i => i.id === itemId)
        if (index > -1) {
          this.items.splice(index, 1)
        }
        this.saveData()
        worker.terminate()
        resolve({ success: true, message: `成功卖出装备，获得${stoneAmount}个强化石` })
      }
      // 只传递必要的数据
      worker.postMessage({
        type: 'single',
        equipment: {
          id: equipment.id,
          quality: equipment.quality
        }
      })
    })
  },
  // 批量卖出装备
  async batchSellEquipments(quality = null, equipmentType = null) {
    return new Promise(resolve => {
      const worker = new Worker(new URL('../../workers/equipment.js', import.meta.url))
      worker.onmessage = e => {
        const { totalStones, itemsToRemove, count } = e.data
        this.reinforceStones += totalStones
        this.items = this.items.filter(item => !itemsToRemove.includes(item.id))
        this.saveData()
        worker.terminate()
        resolve({
          success: true,
          message: `成功卖出${count}件装备，获得${totalStones}个强化石`
        })
      }
      // 将数据转换为纯对象数组
      const itemsToSell = this.items
        .filter(item => {
          if (!item || !item.type || item.type === 'pill' || item.type === 'pet') return false
          if (equipmentType && item.type !== equipmentType) return false
          if (quality && item.quality !== quality) return false
          return true
        })
        .map(item => ({
          id: item.id,
          type: item.type,
          quality: item.quality
        }))
      // 发送简化后的数据
      worker.postMessage({
        type: 'batch',
        items: JSON.parse(JSON.stringify(itemsToSell)),
        quality,
        equipmentType
      })
    })
  }
}
