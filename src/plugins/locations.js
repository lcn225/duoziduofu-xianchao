// 地点配置
//
// ⚠ 2026-10-18：探索**不再发放修为**（2026-10-17 决议，P13.1）。
// 修为的唯一主源是镇守练功；旧版每个地点都有一条 cultivation 奖励，
// 会把「镇守 = 修为主源」这条底层取舍直接打穿。**不要加回来。**
//
// ⚠ 2026-10-19 P17：奖励币种改成 **大子**（凡俗层）。旧数值是「灵石」，
//   按 1 旧灵石 = 10 大子 机械换算（×10）。探索整体重做（P17 第 4 步）时
//   会替换这张表，届时按《三大挂机》§三 重新给 T1–T5 的奖励梯度。
export const locations = [
  {
    id: 'newbie_village',
    name: '新手村',
    description: '灵气稀薄的凡人聚集地，适合初入修仙之道的修士。',
    minLevel: 1,
    spiritCost: 50,
    rewards: [
      { type: 'da_zi', chance: 0.3, amount: [10, 30] },
      { type: 'herb', chance: 0.3, amount: [1, 2] },
      { type: 'pill_fragment', chance: 0.2, amount: [1, 1] }
    ]
  },
  // 练气后期地点
  {
    id: 'celestial_mountain',
    name: '天阙峰',
    description: '云雾缭绕的仙山，传说是远古仙人讲道之地。',
    minLevel: 5,
    spiritCost: 1500,
    rewards: [
      { type: 'da_zi', chance: 0.25, amount: [300, 600] },
      { type: 'herb', chance: 0.3, amount: [15, 25] },
      { type: 'pill_fragment', chance: 0.2, amount: [6, 10] }
    ]
  },
  // 筑基期地点
  {
    id: 'phoenix_valley',
    name: '凤凰谷',
    description: '常年被火焰环绕的神秘山谷，据说有凤凰遗留的道韵。',
    minLevel: 11,
    spiritCost: 2000,
    rewards: [
      { type: 'da_zi', chance: 0.25, amount: [500, 1000] },
      { type: 'herb', chance: 0.3, amount: [20, 35] },
      { type: 'pill_fragment', chance: 0.2, amount: [8, 12] }
    ]
  },
  // 结丹期地点
  {
    id: 'dragon_abyss',
    name: '龙渊',
    description: '深不见底的神秘深渊，蕴含远古真龙的气息。',
    minLevel: 15,
    spiritCost: 3000,
    rewards: [
      { type: 'da_zi', chance: 0.25, amount: [800, 1500] },
      { type: 'herb', chance: 0.3, amount: [30, 50] },
      { type: 'pill_fragment', chance: 0.2, amount: [10, 15] }
    ]
  },
  // 结丹后期地点（原「化神期」，境界表压缩后暂作终局图，名称待主题替换）
  {
    id: 'immortal_realm',
    name: '仙界入口',
    description: '传说中通往仙界的神秘之地，充满无尽机缘。',
    minLevel: 17,
    spiritCost: 5000,
    rewards: [
      { type: 'da_zi', chance: 0.25, amount: [1500, 3000] },
      { type: 'herb', chance: 0.3, amount: [50, 100] },
      { type: 'pill_fragment', chance: 0.2, amount: [15, 20] }
    ]
  }
]

// 计算实际获取概率（考虑幸运值）
export const calculateRewardChance = (baseChance, luck = 1) => {
  return Math.min(baseChance * luck, 1) // 确保概率不超过100%
}
