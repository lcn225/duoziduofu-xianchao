// 灵兽面板 / 同修（P43，2026-10-25）
//
// 真源：《数值真值表》§5.8 +《下一步》P43。旧口径（固定 1 级、精华升级、升星）
// **整条作废**，不要再从 `petEssence` / `star` 里读任何数值。
//
// 口径：
//   · 面板 = 白板(T1~T5) × 成色倍率 × **境界系数**（与子嗣同一套 `realmCoefAt`）
//   · 等级 = 同修升上来的**小境界（层）**，不是大境界
//   · 初始等级 = max(1, 主角小境界 − 3)；上限 = 主角小境界，
//     本命同源（`series` 与本命一致，如猪类）= 主角小境界 + 1
//   · 同修 = 桂冈镇守打坐拿到的修为，灵兽**额外**获得 50%（不扣桂冈）
//   · 经验需求 = 主角同层修为上限 × 2（需求高于主角，保证永远慢于主角）
//
// ⚠ 面板只影响战斗：不进修炼速度、不进突破门槛，所以不触发宪法第二章门槛重算。
// ⚠ 本文件不 import `secretRealm.js`（会成环）—— 境界系数在 `realmCoef.js`。
import { realmCoefAt } from './realmCoef.js'
import { EQUIPMENT_QUALITIES, equipQualityKeyOf } from './equipment.js'
import { innerRealms } from './realm.js'

export const PET_TUNING = {
  /** 白板每阶成长（T1 → T5），与主属性同量级；灵兽本身已经吃境界系数，不能再 ×3 */
  growth: 1.6,
  /** 一阶白板（未乘成色与境界系数） */
  whiteBoardT1: { health: 80, damage: 4, defense: 1.6, speed: 9 },
  /** 同修拿到桂冈打坐修为的比例（额外获得，不扣桂冈） */
  cultivationShare: 0.5,
  /** 灵兽每级经验需求 = 主角同层修为上限 × 该系数 */
  xpRequirementMultiplier: 2,
  /** 初始等级 = 主角小境界 − 该值 */
  initialLevelGap: 3,
  /** 本命同源时上限比主角多一层 */
  sameSeriesBonusLevels: 1
}

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback)
const round1 = v => Math.round(v * 10) / 10
const clampTier = tier => Math.min(Math.max(Math.floor(num(tier, 1)), 1), 5)

/** 某阶白板（未乘成色/境界系数）；速度不随境界涨，只随阶 +1 */
export const petWhiteBoardOf = tier => {
  const t = clampTier(tier)
  const factor = PET_TUNING.growth ** (t - 1)
  const base = PET_TUNING.whiteBoardT1
  return {
    health: round1(base.health * factor),
    damage: round1(base.damage * factor),
    defense: round1(base.defense * factor),
    speed: base.speed + t
  }
}

/** 灵兽等级（脏档兜底成 1） */
export const petLevelOf = pet => Math.max(Math.floor(num(pet?.level, 1)), 1)

/** 成色倍率：下 1.0 / 中 1.5 / 上 2.0 / 极 2.5（与装备成色同一张表） */
export const petQualityModOf = pet =>
  EQUIPMENT_QUALITIES[equipQualityKeyOf(pet?.quality)]?.statMod || EQUIPMENT_QUALITIES.common.statMod

/**
 * 灵兽战斗面板（**唯一口径**）。
 *
 * 返回键名沿用旧灵宠实例的 `combatAttributes`：`{ health, attack, defense, speed }`。
 * 没有 `tier` 的对象（断言里手搓的面板、P43 之前的老实例）原样回落 `combatAttributes`，
 * 这样 `buildPetUnit` 对两代数据都能用。
 */
export const petPanelOf = (pet, { tuning = PET_TUNING } = {}) => {
  if (!pet) return { health: tuning.whiteBoardT1.health, attack: tuning.whiteBoardT1.damage, defense: tuning.whiteBoardT1.defense, speed: tuning.whiteBoardT1.speed + 1 }
  if (pet.tier == null) {
    const ca = pet.combatAttributes || {}
    return {
      health: num(ca.health, num(ca.maxHealth, tuning.whiteBoardT1.health)),
      attack: num(ca.attack, num(ca.damage, tuning.whiteBoardT1.damage)),
      defense: num(ca.defense, tuning.whiteBoardT1.defense),
      speed: num(ca.speed, tuning.whiteBoardT1.speed + 1)
    }
  }
  const board = petWhiteBoardOf(pet.tier)
  const coef = realmCoefAt(petLevelOf(pet))
  const mod = petQualityModOf(pet)
  return {
    health: Math.round(board.health * mod * coef),
    attack: round1(board.damage * mod * coef),
    defense: round1(board.defense * mod * coef),
    speed: board.speed
  }
}

/** 获得一只新灵兽时的等级：max(1, 主角小境界 − 3) */
export const petInitialLevelOf = (playerLevel, { tuning = PET_TUNING } = {}) =>
  Math.max(1, Math.floor(num(playerLevel, 1)) - num(tuning.initialLevelGap, 3))

/** 同修上限：主角小境界；本命同源 +1 */
export const petLevelCapOf = (playerLevel, sameSeries = false, { tuning = PET_TUNING } = {}) =>
  Math.max(1, Math.floor(num(playerLevel, 1))) + (sameSeries ? num(tuning.sameSeriesBonusLevels, 1) : 0)

/** 灵兽从 level 升到 level+1 所需经验（主角同层修为上限 × 2） */
export const petXpRequirementOf = (level, { tuning = PET_TUNING } = {}) => {
  const lv = Math.min(Math.max(Math.floor(num(level, 1)), 1), innerRealms.length)
  return innerRealms[lv - 1].maxCultivation * num(tuning.xpRequirementMultiplier, 2)
}

/**
 * 灵兽是否与本命同源：`pet.series` 命中了玩家任一 ↔ 本命的 `series`。
 * 例：桂冈本命含 `boar`（刃背乌鬣猪）→ 猪类灵兽算同源。
 */
export const petSameSeriesOf = (pet, fateSeries = []) =>
  !!pet?.series && (fateSeries || []).some(series => series && series === pet.series)

/**
 * 同修结算（纯函数）：把 `amount` 点经验加进去，返回新等级与新经验。
 *
 * 升到上限就停住、经验清零 —— 上限由主角小境界决定，主角突破后自然又能继续涨。
 *
 * @param {object} pet    灵兽实例（读 level / xp）
 * @param {number} amount 本次获得的经验
 * @param {{ playerLevel:number, sameSeries?:boolean }} ctx
 * @returns {{ level:number, xp:number, gainedLevels:number, capped:boolean }}
 */
export const growPet = (pet, amount, { playerLevel = 1, sameSeries = false } = {}) => {
  const cap = petLevelCapOf(playerLevel, sameSeries)
  let level = Math.min(petLevelOf(pet), cap)
  let xp = Math.max(num(pet?.xp, 0), 0) + Math.max(num(amount, 0), 0)
  let gainedLevels = 0
  while (level < cap && xp >= petXpRequirementOf(level)) {
    xp -= petXpRequirementOf(level)
    level += 1
    gainedLevels += 1
  }
  if (level >= cap) {
    level = cap
    xp = 0
  }
  return { level, xp, gainedLevels, capped: level >= cap }
}
