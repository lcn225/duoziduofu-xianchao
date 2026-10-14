import { INITIAL_REALM_NAME } from '../../plugins/realm'

// 进度与统计：解锁项、成就、以及成就判定要读的各类计数器
export const state = () => ({
  // 成就与解锁项
  unlockedRealms: [INITIAL_REALM_NAME], // 已解锁境界
  unlockedLocations: ['新手村'], // 已解锁地点
  unlockedSkills: [], // 已解锁功法
  completedAchievements: [], // 已完成成就
  // 统计
  explorationCount: 0, // 探索次数
  itemsFound: 0, // 获得物品数量
  eventTriggered: 0, // 触发事件次数
  unlockedPillRecipes: 0 // 解锁丹方数量
})

export const getters = {}

export const actions = {}
