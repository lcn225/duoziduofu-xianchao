// 计算随机事件触发概率
const calculateEventChance = (luck) => {
  return 0.3 * luck  // 基础触发概率为30%，受幸运值影响
}

// 计算奖励倍率
const calculateRewardMultiplier = (luck) => {
  return Math.random() < 0.5 * luck ? 1.5 : 1
}

// 处理单次探索
const handleExploration = (playerData, location) => {
  const { luck } = playerData
  const eventChance = calculateEventChance(luck)
  const result = {
    type: 'exploration_result',
    eventTriggered: false,
    rewardMultiplier: 1,
    spiritCost: location.spiritCost
  }

  // 随机事件判定
  if (Math.random() < eventChance) {
    result.eventTriggered = true
  } else {
    // 计算奖励倍率
    result.rewardMultiplier = calculateRewardMultiplier(luck)
  }

  return result
}

self.onmessage = ({ data }) => {
  const { type, playerData, location } = data

  if (type === 'explore') {
    try {
      const result = handleExploration(playerData, location)
      self.postMessage(result)
    } catch (error) {
      self.postMessage({
        type: 'error',
        message: error.message
      })
    }
  }
}