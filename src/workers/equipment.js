const qualityStoneMap = {
  mythic: 6,
  legendary: 5,
  epic: 4,
  rare: 3,
  uncommon: 2,
  common: 1
}

// 处理单个装备的售卖
const sellSingleEquipment = (equipment) => {
  return qualityStoneMap[equipment.quality] || 1
}

self.onmessage = ({ data }) => {
  const { type, items, equipment } = data
  if (type === 'single') {
    const stoneAmount = qualityStoneMap[equipment.quality] || 1
    self.postMessage({
      type: 'single',
      stoneAmount,
      itemId: equipment.id
    })
  } else if (type === 'batch') {
    let totalStones = 0
    const itemsToRemove = []
    items.forEach(equipment => {
      const stoneAmount = qualityStoneMap[equipment.quality] || 1
      totalStones += stoneAmount
      itemsToRemove.push(equipment.id)
    })
    self.postMessage({
      type: 'batch',
      totalStones,
      itemsToRemove,
      count: items.length
    })
  }
}