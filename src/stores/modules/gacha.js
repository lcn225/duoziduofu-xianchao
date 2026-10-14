// 抽奖页（Gacha）的用户偏好设置
//
// 这些字段只有抽奖页读写，单独成模块，避免混进秘境统计里难以查找。
export const state = () => ({
  // 自动出售相关设置
  autoSellQualities: [], // 选中的装备品质
  autoReleaseRarities: [], // 选中的灵宠品质
  // 心愿单相关设置
  wishlistEnabled: false, // 心愿单开关
  selectedWishEquipQuality: null,
  selectedWishPetRarity: null
})

export const getters = {}

export const actions = {}
