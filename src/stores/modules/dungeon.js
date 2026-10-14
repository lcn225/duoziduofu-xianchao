// 秘境（Dungeon）统计与设置
export const state = () => ({
  dungeonDifficulty: 1, // 难度选择
  dungeonHighestFloor: 0, // 最高通关层数
  dungeonHighestFloor_2: 0, // 难度2最高层
  dungeonHighestFloor_5: 0, // 难度5最高层
  dungeonHighestFloor_10: 0, // 难度10最高层
  dungeonHighestFloor_100: 0, // 难度100最高层
  dungeonLastFailedFloor: 0, // 最后失败层数
  dungeonTotalRuns: 0, // 总探索次数
  dungeonBossKills: 0, // Boss击杀数
  dungeonEliteKills: 0, // 精英击杀数
  dungeonTotalKills: 0, // 总击杀数
  dungeonDeathCount: 0, // 死亡次数
  dungeonTotalRewards: 0 // 获得奖励次数
})

export const getters = {}

export const actions = {}
