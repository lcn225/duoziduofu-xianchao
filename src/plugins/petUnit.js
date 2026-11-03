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

// ---------------------------------------------------------------------------
// 阶 / 种类 / 显示名（B15-b #2，2026-11-03）
//
// 背景：灵宠页原来只显示**成色**（下品/中品/上品/极品），玩家看不出「阶」；
// 而 P43 之前的老档灵宠没有 `tier` 字段（抽奖时代只存了名字），不能硬凑一个阶。
// 所以这里给三个兼容读法：新档读 `tier` / `species`，老档返回空串，UI 据此隐藏。
// ---------------------------------------------------------------------------

/** 灵兽阶（1~5）。老档（P43 之前）没有 `tier`，返回 null */
export const petTierOf = pet => {
  const tier = Number(pet?.tier)
  return Number.isFinite(tier) && tier >= 1 ? Math.min(Math.floor(tier), 5) : null
}

const PET_TIER_LABELS = { 1: '一阶', 2: '二阶', 3: '三阶', 4: '四阶', 5: '五阶' }

/** 灵兽阶的显示名；老档没有阶时返回空串（调用方据此隐藏这一格） */
export const petTierNameOf = pet => {
  const tier = petTierOf(pet)
  return tier ? PET_TIER_LABELS[tier] : ''
}

/**
 * 灵兽种类（妖兽 / 凶兽…）。
 * 新档存在 `species`（`type` 被改写成了 `'pet'`）；老档没有 `species`，返回空串。
 */
export const petKindOf = pet => {
  const kind = pet?.species
  return typeof kind === 'string' && kind && kind !== 'pet' ? kind : ''
}

/**
 * 灵兽列表显示名：新档「阶·名字」，老档只有名字。
 * 例：`三阶·刃背乌鬣猪` / `赤瞳灵狐`（老档）。
 */
export const petDisplayNameOf = pet => {
  const name = pet?.name || '灵宠'
  const tier = petTierNameOf(pet)
  return tier ? `${tier}·${name}` : name
}

/** 成色倍率：下 1.0 / 中 1.5 / 上 2.0 / 极 2.5（与装备成色同一张表） */
export const petQualityModOf = pet =>
  EQUIPMENT_QUALITIES[equipQualityKeyOf(pet?.quality)]?.statMod || EQUIPMENT_QUALITIES.common.statMod

/**
 * 灵宠成色的中文标签（P51 #4，2026-10-26）。
 *
 * **只有这一套**：下品 / 中品 / 上品 / 极品，与背包、宝匣结果用同一组字。
 * 旧的「凡品/灵品/玄品/仙品」（甚至「神品」）是上游灵宠抽奖的遗留文案，
 * 成色真源一直是物品池的 下/中/上/极，别再按 `rarity` 显示。
 */
export const PET_QUALITY_LABELS = { 下: '下品', 中: '中品', 上: '上品', 极: '极品' }

/** 老档没有 `quality` 时，按旧的 rarity 键折回成色（只读，不改存档） */
const LEGACY_RARITY_TO_QUALITY = {
  divine: '极',
  celestial: '极',
  mystic: '上',
  spiritual: '中',
  mortal: '下'
}

/** 灵宠成色键（下/中/上/极）：优先 `quality`，老档按 `rarity` 兜底 */
export const petQualityOf = pet => {
  const q = pet?.quality
  if (PET_QUALITY_LABELS[q]) return q
  return LEGACY_RARITY_TO_QUALITY[pet?.rarity] || '中'
}

/** 灵宠成色：`{ quality, name, color }`（颜色与装备成色同一张表） */
export const petQualityInfoOf = pet => {
  const quality = petQualityOf(pet)
  const meta = EQUIPMENT_QUALITIES[equipQualityKeyOf(quality)] || EQUIPMENT_QUALITIES.common
  return { quality, name: PET_QUALITY_LABELS[quality], color: meta.color }
}

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

/**
 * 灵兽从 level 升到 level+1 所需经验（主角同层**裸**修为 × 2）。
 *
 * ⚠ 2026-11-01 P56-d：读 `baseExp` 而不是 `maxCultivation` ——
 *   后者现在是桂冈的有效上限（含理想曲线配平），拿它当灵兽经验会把同修节奏带偏。
 */
export const petXpRequirementOf = (level, { tuning = PET_TUNING } = {}) => {
  const lv = Math.min(Math.max(Math.floor(num(level, 1)), 1), innerRealms.length)
  return innerRealms[lv - 1].baseExp * num(tuning.xpRequirementMultiplier, 2)
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
 * @returns {{ level:number, xp:number, gainedLevels:number, capped:boolean, xpGained:number }}
 */
export const growPet = (pet, amount, { playerLevel = 1, sameSeries = false } = {}) => {
  const cap = petLevelCapOf(playerLevel, sameSeries)
  let level = Math.min(petLevelOf(pet), cap)
  const add = Math.max(num(amount, 0), 0)
  let xp = Math.max(num(pet?.xp, 0), 0) + add
  let gainedLevels = 0
  while (level < cap && xp >= petXpRequirementOf(level)) {
    xp -= petXpRequirementOf(level)
    level += 1
    gainedLevels += 1
  }
  /**
   * 实际记进账的经验（流水账用）。到上限时多出来的那截会被清零，
   * 不能把 `amount` 原样报成「已获得」—— 否则满级灵兽每轮都显示「同修 +X」却一点没涨。
   */
  let xpGained = add
  if (level >= cap) {
    xpGained = Math.max(add - xp, 0)
    level = cap
    xp = 0
  }
  return { level, xp, gainedLevels, capped: level >= cap, xpGained }
}

/**
 * 读档后把「出战灵兽」与背包里同 id 的那一项对齐（**2026-10-27 修**）。
 *
 * 存档存的是整个 `$state`：`items` 数组与 `activePet` 各自序列化一份，读档又各自
 * `structuredClone`。于是它们是两个互不相干的对象 —— 同修只改 `activePet`，
 * 背包列表读 `items`，表现就是「灵兽等级永远不涨」，召回再出战时还会被打回旧等级。
 *
 * 以 `activePet` 的等级/经验为准回写背包项（它才是上次一直在练的那只），
 * 面板沿用已经加到桂冈身上的那一份，避免读档时属性漂移。
 *
 * @returns 背包里的那只（已就地更新）；找不到对应物品时返回 null
 */
export const relinkPetRecord = (activePet, items) => {
  if (!activePet?.id) return null
  const live = (Array.isArray(items) ? items : []).find(
    item => item?.type === 'pet' && item.id === activePet.id
  )
  if (!live) return null
  // 同一条宠物被出战并就地加经验时 `live === activePet`，也要补标记 ——
  // 否则它仍会被 `migratePetsV2` 当成老档打回 Lv.1。
  live.petVersion = 1
  if (live === activePet) return live
  live.level = petLevelOf(activePet)
  live.xp = Math.max(num(activePet.xp, 0), 0)
  live.combatAttributes = activePet.combatAttributes || petPanelOf(live)
  return live
}
