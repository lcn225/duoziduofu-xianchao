// 计算当前境界的修炼消耗
const getCurrentCultivationCost = (level) => {
  const baseCultivationCost = 10
  return Math.floor(baseCultivationCost * Math.pow(1.5, level - 1))
}

// 计算当前境界的修炼获得
const getCurrentCultivationGain = (level) => {
  const baseCultivationGain = 1
  return Math.floor(baseCultivationGain * Math.pow(1.2, level - 1))
}

// 计算实际获得的修为
const calculateCultivationGain = (level, luck) => {
  const extraCultivationChance = 0.3
  let gain = getCurrentCultivationGain(level)
  if (Math.random() < extraCultivationChance * luck) {
    gain *= 2
  }
  return gain
}

self.onmessage = ({ data }) => {
  const { type, playerData } = data
  if (type === 'cultivateUntilBreakthrough') {
    try {
      const { level, spirit, cultivation, maxCultivation, luck } = playerData
      const currentCost = getCurrentCultivationCost(level)
      const gain = getCurrentCultivationGain(level)
      if (gain <= 0) {
        self.postMessage({ type: 'error', message: '修炼效率异常' })
        return
      }
      const remainingCultivation = Math.max(0, maxCultivation - cultivation)
      const times = Math.ceil(remainingCultivation / gain)
      const totalCost = times * currentCost
      if (spirit < totalCost) {
        self.postMessage({ 
          type: 'error', 
          message: `灵力不足！突破需要${totalCost}灵力，当前灵力：${spirit.toFixed(1)}` 
        })
        return
      }
      let totalGain = 0
      let doubleGainTimes = 0
      for (let i = 0; i < times; i++) {
        const currentGain = calculateCultivationGain(level, luck)
        if (currentGain > gain) doubleGainTimes++
        totalGain += currentGain
      }
      self.postMessage({
        type: 'success',
        result: {
          spiritCost: totalCost,
          cultivationGain: totalGain,
          doubleGainTimes
        }
      })
    } catch (error) {
      self.postMessage({ type: 'error', message: '修炼计算出错' })
    }
  }
}