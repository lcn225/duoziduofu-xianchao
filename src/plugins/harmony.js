// 四维契合度：修行系统的唯一真源
//
//   综合契合度 = (功法 + 同参 + 灵地 + 本命) / 4          每维归一到 [0,1]
//   修炼速度   = 0.5 + 综合契合度 × 1.5                  0% → 0.5×，50% → 1×，100% → 2×
//
// 全部是纯函数：不碰 store、不读全局，方便用 node 直接断言。

import { matchScore } from './wuxing'
import {
  QI_ART_MAP,
  FATE_ITEM_MAP,
  SPIRIT_LAND_MAP,
  PLAYER_FATES,
  LAND_LEVEL_COEFF,
  artGradeOf
} from './cultivationData'

/** 调参集中在这里，改数值只动这一处 */
export const TUNING = {
  /**
   * 现实秒 / 游戏小时。**唯一节奏旋钮**。
   * 设计文档写「每 100 小时 +1%」，但游戏里 1 tick = 1 秒，所以把「游戏小时」
   * 当抽象单位：调小 = 整体变快（调试期可设 0.1，快 20 倍）。
   */
  secondsPerGameHour: 2,
  /** 单次累积上限（秒），供将来的离线结算模块直接传离线时长 */
  maxSecondsPerTick: 86400,

  qiArt: {
    match: { same: 0.3, generate: 0.4, overcome: -0.1 },
    perLevel: 0.02, // 每层 +2%
    profPerHour: 0.01, // 每 100 游戏小时 +1%
    cap: 0.2 // 熟练度上限 20%
  },
  fateItem: {
    match: { same: 0.4, generate: 0.5, overcome: -0.2 },
    perLevel: 0.03, // 每级 +3%
    refPerHour: 0.02, // 每 50 游戏小时 +2%
    cap: 0.2 // 祭炼上限 20%
  },
  spiritLand: {
    // 灵地的匹配对象是「功法」五行（修行发生在功法与灵地之间）
    match: { same: 0.2, generate: 0.3, overcome: -0.1 }
  },
  destiny: {
    realm: { qi: 0.5, foundation: 0.8, core: 1.0 },
    perSkill: 0.1, // 每个本命技 +10%
    perFate: 0.05, // 每件本命物 +5%
    resonance: 0.15 // 本命共鸣（本命物集齐本命）额外 +15%
  },
  speed: { floor: 0.5, span: 1.5 },

  /**
   * 炼体加成：随外功境界派生（见 practice.js 的 bodyBonus）。
   * 走**纯 getter 派生**而不是写进 baseAttributes —— 现有穿装备/灵宠加成都是
   * 双向增量加减、已有漂移风险，派生值没有任何写操作，物理上不可能漂移。
   * 带上随境界递增的 scale，避免高境界时加成失去存在感。
   */
  body: { healthPerLevel: 20, defensePerLevel: 2 }
}

export const clamp01 = value => Math.min(1, Math.max(0, value))
export const hoursFromSeconds = seconds => seconds / TUNING.secondsPerGameHour

/** 取「本命」里与该五行匹配度最高的一个 —— 本命可以有多个，取最优 */
const bestFateMatch = (element, fateIds, coeffs) => {
  if (!element || !fateIds?.length) return 0
  let best = 0
  for (const id of fateIds) {
    const fate = PLAYER_FATES.find(f => f.id === id)
    if (!fate) continue
    const score = matchScore(element, fate.element, coeffs)
    if (score > best) best = score
  }
  return best
}

/** 熟练度当前值（百分点），由原始秒数现算 —— 改 TUNING 立即生效，无需迁移存档 */
export const qiArtProficiency = entry =>
  Math.min(hoursFromSeconds(entry?.practiceSeconds || 0) * TUNING.qiArt.profPerHour, TUNING.qiArt.cap)

export const fateItemRefinement = entry =>
  Math.min(hoursFromSeconds(entry?.refineSeconds || 0) * TUNING.fateItem.refPerHour, TUNING.fateItem.cap)

/** 功法契合 = 五行基础分 + 等级×2% + 熟练度 */
export const calcQiArtHarmony = practice => {
  const id = practice?.qiArts?.active
  const art = QI_ART_MAP[id]
  const entry = practice?.qiArts?.known?.[id]
  if (!art || !entry) return 0
  const base = bestFateMatch(art.element, practice.destiny?.fates, TUNING.qiArt.match)
  return clamp01(base + entry.level * TUNING.qiArt.perLevel + qiArtProficiency(entry))
}

/** 同参契合 = 五行基础分 + 等级×3% + 祭炼 */
export const calcFateItemHarmony = practice => {
  const id = practice?.fateItems?.active
  const item = FATE_ITEM_MAP[id]
  const entry = practice?.fateItems?.known?.[id]
  if (!item || !entry) return 0
  const base = bestFateMatch(item.element, practice.destiny?.fates, TUNING.fateItem.match)
  return clamp01(base + entry.level * TUNING.fateItem.perLevel + fateItemRefinement(entry))
}

/** 灵地契合 = 灵地等级系数 × 五行匹配系数（对比功法五行） */
export const calcSpiritLandHarmony = practice => {
  const land = SPIRIT_LAND_MAP[practice?.spiritLand?.current]
  if (!land) return 0
  const art = QI_ART_MAP[practice?.qiArts?.active]
  const coeff = LAND_LEVEL_COEFF[land.level] ?? 0.5
  const m = 1 + matchScore(art?.element, land.element, TUNING.spiritLand.match)
  return clamp01(coeff * m)
}

/** 本命共鸣：本命物已集齐全部本命 */
export const hasDestinyResonance = practice => {
  const fates = practice?.destiny?.fates || []
  const items = practice?.destiny?.items || []
  return fates.length > 0 && fates.every(id => items.includes(id))
}

/**
 * 本命契合 = 境界系数 + 本命技数×10% + 本命物数×5% (+ 共鸣 15%)
 *
 * 注意：设计文档原式是「境界系数 × 本命技解锁数 × 本命物收集数」，**乘法不成立** ——
 * 解锁数是计数，没有本命技时整维归零；练气期两技两物会得到 0.5×2×2 = 2.0（200%）。
 * 文档自己的示例（练气 55%）也凑不出来。此处按加性改写，与另外三维口径一致。
 */
export const calcDestinyHarmony = (practice, tier = 'qi') => {
  const realmCoeff = TUNING.destiny.realm[tier] ?? TUNING.destiny.realm.qi
  const skillPart = (practice?.destiny?.skills?.length || 0) * TUNING.destiny.perSkill
  const fatePart = (practice?.destiny?.items?.length || 0) * TUNING.destiny.perFate
  const resonance = hasDestinyResonance(practice) ? TUNING.destiny.resonance : 0
  return clamp01(realmCoeff + skillPart + fatePart + resonance)
}

/** 四维 + 综合 */
export const calcHarmony = (practice, tier = 'qi') => {
  const qiArt = calcQiArtHarmony(practice)
  const fateItem = calcFateItemHarmony(practice)
  const spiritLand = calcSpiritLandHarmony(practice)
  const destiny = calcDestinyHarmony(practice, tier)
  return {
    qiArt,
    fateItem,
    spiritLand,
    destiny,
    total: (qiArt + fateItem + spiritLand + destiny) / 4
  }
}

/** 修炼速度倍率：0% → floor，100% → floor + span */
export const speedMultiplierOf = total => TUNING.speed.floor + clamp01(total) * TUNING.speed.span

/** 单项契合上限（用于 UI 提示「这一维最多还能到多少」） */
export const qiArtCapOf = art => {
  const maxLevel = artGradeOf(art).maxLevel
  return TUNING.qiArt.match.generate + maxLevel * TUNING.qiArt.perLevel + TUNING.qiArt.cap
}
