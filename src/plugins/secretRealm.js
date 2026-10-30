// 【秘境】—— 纯函数层（无副作用，可被 node 直接加载跑断言）
//
// 设计（《三大挂机》§四，2026-10-21 Q1 定稿）：
//   · **难度 1、2、3……无限递增**，每个难度固定 50 层，顺序解锁
//   · 每 5 层一个 Boss，50 层是大 Boss（旧「每 10 层大 Boss」作废）
//   · 时间成本 = **ceil(已通关 Boss 层 / 10) 游戏天**（旧「固定 5 天」作废）
//   · 每 5 层 Boss 给 1 个宝匣，阶只看难度（1–10 一阶 … 41+ 五阶）
//   · 50 层首杀（每难度一次）：高一阶宝匣 + 洗命符 ×1
//   · 每通关 5 层，3 选 1 Buff；10 秒不选自动选品质最高
//   · 队伍 = 桂冈 + 最多 3 名子嗣 + 1 只灵兽（P43 起灵兽是独立第 5 坑）
//   · 自动撤退（默认 20%）；关闭后退可让子嗣真陨落
//
// ⚠ 战斗是**同步预演**：这里一次算出整段的 frames，视图只负责按倍速回放。
//   好处：结算不依赖任何计时器；刷新最多丢动画，不丢结果；node 也能断言。
// ⚠ 敌人随难度变强的曲线 2026-10-21 P25 已按锚点反推（§4.8）：
//   挂「等效境界」而不是「难度线性乘数」，详见 TUNING.enemy 的注释。
// ⚠ 纯函数层不读 Pinia；子嗣出战门槛的真源仍在模块二。
import { roguelikeOptions } from './dungeon.js'
// 子嗣出战门槛的真源在模块二（P14）。秘境只消费，不另立一套年龄口径。
import { canFightOf } from './innerCourt.js'
// 子嗣装备面板（P36 第 3 步）：**加算在最后**，不乘境界/灵根/本命。
import { offspringPanelOf } from './offspringEquipment.js'
// 境界系数（P43 抽出）：灵兽面板与子嗣共用，见 realmCoef.js 顶部注释。
import { REALM_COEF, realmCoefAt as realmCoefAtOf, realmCoefOf as realmCoefOfOf } from './realmCoef.js'
// 灵兽面板 / 同修（P43）：面板 = 白板 × 成色 × 境界系数。
import { PET_TUNING, petPanelOf } from './petUnit.js'

const DAY = 86400

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback)
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)

/** 真源：《三大挂机》§四 + 《数值真值表》§6.4 */
export const TUNING = {
  /** 每个难度固定 50 层；第 50 层是大 Boss（2026-10-21 Q1） */
  floorsPerDifficulty: 50,
  /**
   * 时间成本 = ceil(已通关 Boss 层 / floorsPerDay) 游戏天。
   * 2026-10-21 改：旧「固定 5 天」作废；不满 10 层按 1 天，0 层不扣。
   */
  floorsPerDay: 10,
  /** Boss 层：每 5 层一个；每 50 层一个大 Boss（= 难度终点） */
  bossEvery: 5,
  bigBossEvery: 50,
  /** 每通关多少层弹一次 Buff */
  buffEveryFloors: 5,
  /** 不选 Buff 的自动选择倒计时（现实秒，给 UI 用） */
  buffAutoPickSeconds: 10,
  /** 自动撤退默认线（百分比） */
  autoRetreatDefaultPct: 20,
  /** 单场战斗最大回合；超时按战败（自动撤退开启时按撤退） */
  maxRoundsPerBattle: 30,
  /** 单段最多预演多少层（安全阀；正常每 5 层就会停在 Buff 门） */
  maxFloorsPerSegment: 50,
  /** 出战位（不含桂冈）：3 名子嗣 + 1 只灵兽 = 5 人队（P43，2026-10-25） */
  companionSlots: 3,
  /** 灵兽出战位（独立第 5 坑，不与子嗣抢位置） */
  petSlots: 1,
  /** 子嗣陨落时返还给桂冈的修为 = 当前修为上限 × 该比例（占位） */
  deathReturnRatio: 0.05,
  /**
   * 子嗣战力（2026-10-21 Q3 定稿）：
   *   四属性 = 基础值 × **境界系数** × 灵根 × 本命 ×（1 + Σ词条）
   *   **删除品质与仙龄**（旧口径作废）。
   */
  offspring: {
    /** 练气一~十层线性 1.0→5.0；筑基 10.0；结丹 30.0（真源在 realmCoef.js） */
    realmCoef: REALM_COEF,
    /** 单 2.0 / 双 1.5 / 三 1.2 / 四 1.0 / 五 0.8 */
    rootCoef: { 1: 2.0, 2: 1.5, 3: 1.2, 4: 1.0, 5: 0.8 },
    /** 无灵根永远不能出战，这里只是兜底值（不会被战斗读到） */
    rootlessMultiplier: 0.8,
    /** 本命按 tier：1→1.0 / 2→1.2 / 3→1.5 / 4–5→2.0 */
    fateTierCoef: { 1: 1.0, 2: 1.2, 3: 1.5, 4: 2.0, 5: 2.0 },
    /**
     * ~~词条加算：普通 +5% / 稀有 +10% / 传说 +20%~~
     * ⚠ **2026-10-30 作废**：战力侧读词条自己的 `effect.cultivation`（与修炼同一通道），
     *   稀有度不换算。现在池子里 `effect` 全为空 ⇒ 词条对战力贡献 **0**。
     */
    base: { health: 60, damage: 6, defense: 3, speed: 8 }
  },
  /**
   * 灵兽（P43）：白板 / 成色 / 境界系数都在 `petUnit.PET_TUNING`，
   * 这里只留一个指针，别在两处各写一套。
   */
  pet: PET_TUNING,
  /**
   * 怪物阈值曲线（2026-10-21 P25 反推、**2026-10-23 P36 第 6 步按带装备的队伍重标**；
   * 真源《三大挂机》§4.8 /《数值真值表》§6.4b）
   *
   *   等效境界 E = 难度 + (层数−1)/(50−1) × floorSpan + 种类偏移
   *   四属性     = 基础值 × realmCoefAt(E) × realmScale（速度除外）
   *
   * 校准口径（2026-10-23 改）：**桂冈 + 3 名同境界单灵根子嗣，全穿 T2 中品装备**。
   * 锚点 = 这套队伍在练气二层能过难度 1 第 5 层 Boss（100%）。
   * 反推表见 `npm run sim:realm -- --solve`；队伍构造在 `scripts/lib/sim-party.mjs`。
   *
   * ⚠ 口径演进：P25 裸装 3 子嗣 = 4.5 → P36 四人队（桂冈 + 3 名 T2 子嗣）= 7
   *   → **P42/P43 起五人队（+ 1 灵兽、装备白板几何 ×3）= 8.4**。
   *   8.4 是 `sim:realm --solve` 反推的：把「练气九层通难度 5」的护栏拉回来。
   *   改这个数 = 改整条难度曲线。
   */
  enemy: {
    base: { health: 80, damage: 7, defense: 3, speed: 8 },
    /**
     * 队伍系数：敌人 = 约 8.4 个同级裸装子嗣的战力。
     * 这么高是因为对面是「桂冈 + 3 名带装备子嗣 + 1 只灵兽」共 5 个单位轮流出手。
     * 调它 = 整体难度一起松/紧（唯一的总开关）。
     */
    realmScale: 8.4,
    /** 难度内 50 层跨 **1 个小境界**：第 1 层 ≈ 练气 D 层，第 50 层 ≈ D+1 层 */
    floorSpan: 1,
    /**
     * 种类偏移（按**等效境界**加，不再乘算）。
     * 乘算的坑：×3 在难度 8 折算成「高 7 个小境界」，练气九层永远过不了第 50 层。
     */
    bossOffset: 0.35,
    bigBossOffset: 0.7,
    /** 速度只随层数涨、不跟难度：双方速度差太大时战斗会变成单方面碾压 */
    speedPerFloor: 0.01
  },
  rewards: {
    /**
     * 灵石（**一阶灵石 / spiritual**）：round((20 + 8×层数) × 倍率 / 9)。
     * 真源《数值真值表》§6.4：2026-10-17 ÷3、2026-10-21 再 ÷3（总 ÷9）。
     * ⚠ P17 的「×10 记大子」是过渡口径，2026-10-21 返工时已按真值表切回一阶灵石。
     */
    spiritualBase: 20,
    spiritualPerFloor: 8,
    spiritualDivisor: 9,
    bossRefinement: 1,
    herbChance: 0.25,
    herbMax: 2,
    fragmentChance: 0.1,
    /**
     * Boss 首破（一次性，扫荡不给）：洗练石 +5 / 灵草 +2，灵石按难度与层数放大。
     * 灵石 = `round(firstClearSpiritual × 难度 × (1 + 层数 / floorsPerDifficulty))`
     * —— 真源《数值真值表》§6.4 / 《三大挂机》§4.3（2026-10-22 Q5）：
     * 旧口径「固定 +200」在难度 5 第 50 层等于废值（2026-10-22 作废）。
     */
    firstClearSpiritual: 200,
    firstClearRefinement: 5,
    firstClearHerbs: 2
  },
  /** 宝匣：《三大挂机》§4.3（2026-10-21 定稿） */
  chest: {
    /** 每个 Boss 层给 1 个 */
    perBossFloor: 1,
    /** 难度每 10 级 +1 阶：1–10 一阶 … 41+ 五阶 */
    difficultyPerTier: 10,
    maxTier: 5,
    /** 50 层首杀：高一阶宝匣（封顶五阶）+ 洗命符 */
    finalBossBonusTier: 1,
    finalBossFateCharms: 1
  },
  shrine: {
    cultivationPerMartyr: 0.01,
    cultivationCap: 0.1,
    rootPerMartyr: 0.001,
    rootCap: 0.01
  }
}

// ---------- 楼层 ----------

/** 'normal' | 'boss' | 'bigBoss' */
export const floorKind = floor => {
  const f = Math.max(Math.floor(num(floor, 1)), 1)
  if (f % num(TUNING.bigBossEvery, 50) === 0) return 'bigBoss'
  if (f % num(TUNING.bossEvery, 5) === 0) return 'boss'
  return 'normal'
}

/**
 * 扫荡上限 = **当前难度内**最后一个已通关的 Boss 层（卡 15 → 10；通 15 → 15）。
 * ⚠ 封顶 50：老档的 `highestBossCleared` 可能超过 50（旧结构 55/60 也有 Boss），
 *   不夹住的话扫荡会打出本难度不存在的层数。
 */
export const sweepLimitOf = highestBossCleared => {
  const cleared = Math.max(Math.floor(num(highestBossCleared, 0)), 0)
  const every = Math.max(Math.floor(num(TUNING.bossEvery, 5)), 1)
  const cap = Math.max(num(TUNING.floorsPerDifficulty, 50), 1)
  return Math.min(Math.floor(cleared / every) * every, cap)
}

/**
 * 时间成本（游戏天）= ceil(已通关 Boss 层 / 10)（《三大挂机》§4.1，2026-10-21）。
 * 例：通 20 层 → 2 天；卡 23 层但只通 20 层 Boss → 2 天；一层 Boss 都没通 → 0 天。
 *
 * **2026-10-23 加起点**：整备时可以选择从后面开始（跳过已走过的路），
 * 那几天就不能再算给玩家 —— 只按**本趟实际打过的那一段**计费：
 *   `ceil(max(0, 已通 Boss 层 − (起点 − 1)) / 10)`
 * 起点 = 1 时与旧公式完全等价（扫荡不传起点，行为不变）。
 * 例：从第 41 层起打通 50 层 → (50 − 40) / 10 = 1 天；从第 1 层打通 50 层仍是 5 天。
 */
export const timeCostDaysOf = (highestClearedFloor, startFloor = 1) => {
  const from = Math.max(Math.floor(num(startFloor, 1)), 1)
  const span = Math.max(sweepLimitOf(highestClearedFloor) - (from - 1), 0)
  return Math.ceil(span / Math.max(num(TUNING.floorsPerDay, 10), 1))
}

/** 时间成本对应的目标时刻 */
export const timeCostTargetOf = (nowSeconds, highestClearedFloor, startFloor = 1) =>
  num(nowSeconds, 0) + timeCostDaysOf(highestClearedFloor, startFloor) * DAY

/**
 * 起始层上限：**下一层**（= 本难度已到的最高层 + 1），封顶 50。
 * 第一趟（highestFloor = 0）只能是 1；已经打到 50 层就最晚从 50 层起（直接打大 Boss）。
 */
export const startFloorLimitOf = (highestFloor, tuning = TUNING) => {
  const cap = Math.max(num(tuning.floorsPerDifficulty, 50), 1)
  return clamp(Math.floor(num(highestFloor, 0)) + 1, 1, cap)
}

/** 把玩家请求的起始层夹进 [1, startFloorLimitOf]（2026-10-23 起始层选项） */
export const clampStartFloor = (requested, highestFloor, tuning = TUNING) =>
  clamp(Math.floor(num(requested, 1)), 1, startFloorLimitOf(highestFloor, tuning))

/** 宝匣阶只看难度：1–10 一阶 / 11–20 二阶 / … / 41+ 五阶（封顶） */
export const chestTierOfDifficulty = difficulty => {
  const d = Math.max(Math.floor(num(difficulty, 1)), 1)
  const per = Math.max(Math.floor(num(TUNING.chest.difficultyPerTier, 10)), 1)
  return clamp(Math.ceil(d / per), 1, Math.max(num(TUNING.chest.maxTier, 5), 1))
}

/** 一趟 / 扫荡能拿到几个宝匣 = 已通关的完整 Boss 层数 */
export const chestCountOf = highestClearedFloor =>
  Math.floor(sweepLimitOf(highestClearedFloor) / Math.max(num(TUNING.bossEvery, 5), 1)) *
  Math.max(num(TUNING.chest.perBossFloor, 1), 0)

/** 是否已通关某个难度（50 层大 Boss） */
export const difficultyClearedOf = highestClearedFloor =>
  sweepLimitOf(highestClearedFloor) >= Math.max(num(TUNING.floorsPerDifficulty, 50), 1)

// ---------- 难度进度槽 ----------
//
// 2026-10-21（P24b）：难度可以回刷，所以进度必须**按难度分开存**。
// `secretRealm.difficultyProgress = { [难度]: { highestFloor, highestBossCleared,
// bossFirstClears, finalBossFirstKill } }`；store 里那四个同名字段只是**当前选中难度**
// 的工作副本，切换时先写回进度槽、再读目标槽。

/** 一个难度的空进度 */
export const emptyDifficultyProgress = () => ({
  highestFloor: 0,
  highestBossCleared: 0,
  bossFirstClears: {},
  finalBossFirstKill: false
})

/** 读某个难度的进度（缺省/脏数据一律回落到空进度，不共享引用） */
export const difficultyProgressOf = (map, difficulty) => {
  const d = String(Math.max(Math.floor(num(difficulty, 1)), 1))
  const raw = map && typeof map === 'object' && !Array.isArray(map) ? map[d] : null
  const progress = raw && typeof raw === 'object' ? raw : {}
  return {
    highestFloor: Math.max(num(progress.highestFloor, 0), 0),
    highestBossCleared: Math.max(num(progress.highestBossCleared, 0), 0),
    bossFirstClears:
      progress.bossFirstClears && typeof progress.bossFirstClears === 'object'
        ? { ...progress.bossFirstClears }
        : {},
    finalBossFirstKill: !!progress.finalBossFirstKill
  }
}

/** 写某个难度的进度，返回新对象（不改入参） */
export const withDifficultyProgress = (map, difficulty, progress = {}) => {
  const d = String(Math.max(Math.floor(num(difficulty, 1)), 1))
  const base = map && typeof map === 'object' && !Array.isArray(map) ? map : {}
  return { ...base, [d]: difficultyProgressOf({ [d]: progress }, d) }
}

/**
 * 子嗣能否出战 —— 直接读模块二的门槛（设计 §15.2，2026-10-20 起）：
 * **有灵根 + 修为达到练气二层**。
 *
 * ⚠ 旧的「有灵根 + 少年」是过渡口径，已作废；无灵根子嗣永远不能出战。
 *   门槛的真源在 `innerCourt.TUNING.offspringCultivation.fightLevel`，这里只转发。
 */
export const canFight = (child, nowSeconds) => canFightOf(child, nowSeconds)

// ---------- 单位 ----------

const PERCENT_FIELDS = [
  'critRate',
  'comboRate',
  'counterRate',
  'stunRate',
  'dodgeRate',
  'vampireRate',
  'critResist',
  'comboResist',
  'counterResist',
  'stunResist',
  'dodgeResist',
  'vampireResist',
  'healBoost',
  'critDamageBoost',
  'critDamageReduce',
  'finalDamageBoost',
  'finalDamageReduce',
  'combatBoost',
  'resistanceBoost'
]

export const normalizeStats = (stats = {}) => {
  const health = Math.max(num(stats.health, stats.maxHealth || 100), 1)
  const out = {
    health,
    maxHealth: Math.max(num(stats.maxHealth, health), health),
    damage: Math.max(num(stats.damage, 10), 0),
    defense: Math.max(num(stats.defense, 5), 0),
    speed: Math.max(num(stats.speed, 10), 0)
  }
  for (const key of PERCENT_FIELDS) out[key] = clamp(num(stats[key], 0), 0, 10)
  out.critRate = clamp(num(stats.critRate, 0.05), 0, 1)
  out.dodgeRate = clamp(num(stats.dodgeRate, 0.05), 0, 1)
  out.critDamageBoost = Math.max(num(stats.critDamageBoost, 0.5), 0)
  return out
}

export const makeUnit = ({ uid, source, refId = '', name, level = 1, realm = '', stats = {} }) => {
  const normalized = normalizeStats(stats)
  return {
    uid,
    source,
    refId,
    name: name || '无名',
    level,
    realm,
    side: source === 'enemy' ? 'enemy' : 'ally',
    stats: normalized,
    currentHealth: normalized.maxHealth,
    alive: true,
    status: 'alive',
    stunned: false
  }
}

export const cloneUnit = unit => ({
  ...unit,
  stats: { ...unit.stats },
  currentHealth: unit.stats.maxHealth,
  alive: true,
  status: 'alive',
  stunned: false
})

/** 桂冈。入参是普通对象，不读 store */
export const buildPlayerUnit = (snapshot = {}) =>
  makeUnit({
    uid: 'player',
    source: 'player',
    refId: 'player',
    name: snapshot.name || '桂冈',
    level: num(snapshot.level, 1),
    realm: snapshot.realm || '',
    stats: snapshot.stats || snapshot
  })

/**
 * 境界系数（2026-10-21 Q3）：练气一~十层线性 1.0→5.0，筑基 10.0，结丹 30.0。
 * 传的是**层数**（子嗣 `realmLevel`）；11~20 视作筑基、21+ 视作结丹。
 *
 * 2026-10-25 P43：公式挪到 `realmCoef.js`（灵兽面板也要用，且不能反向 import 本文件）。
 * 这里保留原签名 `(level, tuning)`，断言与模拟器照旧从 secretRealm 读。
 */
export const realmCoefOf = (level, tuning = TUNING) => realmCoefOfOf(level, tuning.offspring.realmCoef)

/** **连续版**境界系数（敌人曲线 / 灵兽面板用）；口径见 realmCoef.js */
export const realmCoefAt = (level, tuning = TUNING) => realmCoefAtOf(level, tuning.offspring.realmCoef)

/**
 * 子嗣战力（2026-10-21 Q3 定稿）：
 *   四属性 = 基础值 × 境界系数 × 灵根系数 × 本命系数 ×（1 + Σ词条）
 * **删除品质与仙龄** —— 旧口径（仙龄 × 品质）已作废，不要再加回来。
 */
export const buildOffspringUnit = (child, { nowSeconds = 0, tuning = TUNING } = {}) => {
  // 战死（fallen）与老死（passed_away）都不能再上场（B1，2026-10-30）
  if (!child || child.status === 'fallen' || child.status === 'passed_away') return null
  if (!canFight(child, nowSeconds)) return null

  const level = Math.max(Math.floor(num(child.realmLevel, 1)), 1)
  const realm = realmCoefOf(level, tuning)
  const root = child.hasRoot
    ? num(tuning.offspring.rootCoef[child.rootCount], 1)
    : num(tuning.offspring.rootlessMultiplier, 1)
  const fateTier = clamp(Math.floor(num(child.fate?.tier, 1)), 1, 5)
  const fate = num(tuning.offspring.fateTierCoef[fateTier], 1)
  // 词条：读每条自己的 `effect.cultivation`（2026-10-30 公式先行；稀有度不换算）
  const trait = (child.traits || []).reduce(
    (sum, t) => sum + num(t?.effect?.cultivation, 0),
    0
  )
  const mult = realm * root * fate * (1 + trait)
  const base = tuning.offspring.base
  // 装备面板（P36 第 3 步）：**加算在最后**，不乘上面的任何系数。
  // 《装备系统》§十一 —— 它存在的意义就是给低境界子嗣补短板。
  const gear = offspringPanelOf(child)

  return makeUnit({
    uid: `off:${child.id}`,
    source: 'offspring',
    refId: child.id,
    name: child.name,
    level,
    realm: `练气${level}层`,
    stats: {
      health: base.health * mult + gear.health,
      damage: base.damage * mult + gear.attack,
      defense: base.defense * mult + gear.defense,
      speed: base.speed + level * 0.2 + gear.speed
    }
  })
}

/**
 * 灵兽出战单位（P43，2026-10-25）。
 *
 * 面板走 `petUnit.petPanelOf`：**白板(T1~T5) × 成色 × 境界系数**，
 * 不再读实例上烘死的 `combatAttributes`（那只在 P43 之前有效）。
 */
export const buildPetUnit = (pet, { tuning = TUNING } = {}) => {
  if (!pet) return null
  const panel = petPanelOf(pet, { tuning: tuning.pet })
  const health = num(panel.health, num(panel.maxHealth, 0))
  const stats = {
    health,
    maxHealth: health,
    damage: num(panel.attack, num(panel.damage, 0)),
    defense: num(panel.defense, 0),
    speed: num(panel.speed, 9)
  }
  // 百分比字段（暴击/闪避…）只有旧灵宠实例带，有就沿用
  const ca = pet.combatAttributes || {}
  for (const key of PERCENT_FIELDS) {
    if (ca[key] != null) stats[key] = ca[key]
  }
  return makeUnit({
    uid: `pet:${pet.id}`,
    source: 'pet',
    refId: pet.id,
    name: pet.name || '灵宠',
    level: num(pet.level, 1),
    realm: pet.rarity || '',
    stats
  })
}

/**
 * 战力（**只展示，不参与任何战斗判定**）——《数值真值表》§5.5。
 *
 * 与 `resolveAttack` 的承伤公式同口径（防御 100 = 减伤一半）：
 *   有效生命 = 气血 × (100 + 防御) / 100
 *   战力     = 攻击 × 有效生命 / 100
 *
 * 速度**不进战力**：它只决定出手顺序（`simulateBattle` 按速度排序），
 * 不改变一个单位的输出量；算进去会造出「战力高但打不动」的假象。
 *
 * 入参可以是战斗单位（`buildPlayerUnit` / `buildOffspringUnit` / `buildPetUnit`
 * 的产物），也可以是面板本身。灵宠面板用 `attack`、子嗣/桂冈用 `damage`，两个键名都认。
 *
 * ⚠ 这只是估算：暴击/连击/闪避那些百分比字段只有灵宠和桂冈有，没算进去。
 */
export const combatPowerOf = unitOrStats => {
  const stats = unitOrStats?.stats || unitOrStats || {}
  const health = Math.max(num(stats.health, num(stats.maxHealth, 0)), 0)
  const damage = Math.max(num(stats.damage, num(stats.attack, 0)), 0)
  const defense = Math.max(num(stats.defense, 0), 0)
  const effectiveHealth = (health * (100 + defense)) / 100
  return Math.round((damage * effectiveHealth) / 100)
}

const ENEMY_NAMES = {
  normal: ['山魈', '赤目狼', '铁甲蜈蚣', '噬灵蝠'],
  boss: ['守关妖将', '石魈王', '血瞳魔猿'],
  bigBoss: ['秘境之主', '上古凶兽', '镇塔魔君']
}

/**
 * 敌人实力 = 基础值 × 境界系数(等效境界) × 队伍系数。
 *
 * 等效境界 E = 难度 + 层数进度 × floorSpan + 种类偏移。
 * 例：难度 1 第 5 层 Boss → E = 1 + 4/49 + 0.35 ≈ 1.43，约等于练气一层半的强度。
 *
 * 曲线是 2026-10-21 P25 反推、2026-10-23 P36 按带装备的队伍重标的（§4.8），不是占位：
 * 练气二层的「桂冈 + 3 名 T2 中品子嗣」能过难度 1 第 5 层。
 * 重新反推用 `npm run sim:realm -- --solve`。
 */
export const buildEnemy = (floor, { difficulty = 1, rng = Math.random, tuning = TUNING } = {}) => {
  const f = Math.max(Math.floor(num(floor, 1)), 1)
  const d = Math.max(Math.floor(num(difficulty, 1)), 1)
  const kind = floorKind(f)
  const spec = tuning.enemy
  const lastFloor = Math.max(num(tuning.floorsPerDifficulty, 50), 2)
  const progress = Math.min(Math.max((f - 1) / (lastFloor - 1), 0), 1)
  const kindOffset =
    kind === 'bigBoss'
      ? num(spec.bigBossOffset, 0.7)
      : kind === 'boss'
        ? num(spec.bossOffset, 0.35)
        : 0
  const effLevel = d + progress * num(spec.floorSpan, 1) + kindOffset
  const scale = realmCoefAt(effLevel, tuning) * num(spec.realmScale, 4.5)
  const base = spec.base
  const names = ENEMY_NAMES[kind] || ENEMY_NAMES.normal
  const name = names[Math.min(Math.floor(num(rng(), 0) * names.length), names.length - 1)]
  return makeUnit({
    uid: `enemy:${f}`,
    source: 'enemy',
    refId: `floor:${f}`,
    name: `${name}·第${f}层`,
    level: f,
    realm: kind === 'normal' ? '' : kind === 'boss' ? '精英' : '首领',
    stats: {
      health: base.health * scale,
      damage: base.damage * scale,
      defense: base.defense * scale,
      speed: base.speed * (1 + f * num(spec.speedPerFloor, 0.01)),
      critRate: kind === 'normal' ? 0.05 : 0.1,
      dodgeRate: kind === 'normal' ? 0.03 : 0.05
    }
  })
}

// ---------- 战斗 ----------

const resolveAttack = (attacker, defender, rng = Math.random) => {
  const dodge = clamp(
    num(defender.stats.dodgeRate) - num(attacker.stats.dodgeResist),
    0,
    1
  )
  if (num(rng(), 1) < dodge) {
    return { dodged: true, damage: 0, crit: false, combo: false, vampire: false, stun: false }
  }

  let damage = Math.abs(num(attacker.stats.damage) * (1 + num(attacker.stats.combatBoost)))
  const critChance = clamp(
    num(attacker.stats.critRate) * (1 + num(attacker.stats.combatBoost)) -
      num(defender.stats.critResist) * (1 + num(defender.stats.resistanceBoost)),
    0,
    1
  )
  const crit = num(rng(), 1) < critChance
  if (crit) damage *= 1.5 + num(attacker.stats.critDamageBoost, 0.5)

  const comboChance = clamp(num(attacker.stats.comboRate) - num(defender.stats.comboResist), 0, 1)
  const combo = num(rng(), 1) < comboChance
  if (combo) damage *= 1.3

  damage *= 1 + num(attacker.stats.finalDamageBoost)
  damage *= 100 / (100 + num(defender.stats.defense) * (1 + num(defender.stats.combatBoost)))
  damage *= 1 - clamp(num(defender.stats.finalDamageReduce), 0, 1)
  damage = Math.max(1, damage)

  const vampire = num(rng(), 1) < clamp(num(attacker.stats.vampireRate) - num(defender.stats.vampireResist), 0, 1)
  const stun = num(rng(), 1) < clamp(num(attacker.stats.stunRate) - num(defender.stats.stunResist), 0, 1)

  return { dodged: false, damage, crit, combo, vampire, stun }
}

const healthPctOf = unit => {
  const max = num(unit?.stats?.maxHealth)
  return max > 0 ? (num(unit.currentHealth) / max) * 100 : 0
}

/**
 * 自动撤退看**每个人自己**的血量（2026-10-23 用户拍板，改自「全队平均」）。
 *
 * 旧口径：全队平均血量触线 / 任何人致命伤 → **整队**回家。结果是「一个脆皮连累全队，
 * 还不如桂冈一个人 SOLO」。新口径：谁触线谁自己退出这一趟，其余人继续；
 * 致命伤同样只退他一个。桂冈退出 = 挑战结束（他带队）。
 *
 * 灵宠**仍然不参与**（2026-10-22 拍板）：它只是出战位上的消耗品，
 * 倒地后按 `ko` 处理、下一层复活，不进入陨落账本，也不带走任何人。
 */
const retreatEligible = unit => unit?.side === 'ally' && unit.source !== 'pet'

/**
 * 多单位战斗（一方队伍 vs 一方敌人）。按速度排序，每回合每个存活单位行动一次。
 *
 * `withdrawn` 是本场自己退出的桂冈/子嗣（2026-10-23 改：单人退出，不再整队撤退）。
 *
 * @returns {{ allies, enemies, frames, outcome:'victory'|'defeat'|'retreated', rounds, deaths, withdrawn }}
 */
export const simulateBattle = (
  { allies = [], enemies = [], autoRetreatPct = TUNING.autoRetreatDefaultPct, permadeath = false, maxRounds = TUNING.maxRoundsPerBattle } = {},
  rng = Math.random
) => {
  const frames = []
  let round = 0
  let outcome = 'ongoing'
  const autoRetreatOn = num(autoRetreatPct) > 0
  /** 本场自己退出的桂冈/子嗣（本趟后续楼层不再出场，由 runSegment 接着累计） */
  const withdrawn = []
  /**
   * 谁打死了谁（uid → 敌人名）。2026-10-30 B1：陨落讣告要写「亡于『赤炎虎王』」，
   * 旧版 `deaths` 只带 id/名字，敌人名在结算时已经丢了。
   */
  const killerOf = new Map()

  /** 让一个桂冈/子嗣退出：不陨落、不进英烈祠。返回是否是桂冈本人 */
  const withdrawAlly = unit => {
    unit.alive = false
    unit.withdrawn = true
    unit.status = 'retreated'
    withdrawn.push({ uid: unit.uid, refId: unit.refId, name: unit.name, source: unit.source })
    frames.push({
      type: 'withdraw',
      round,
      floor: 0,
      actor: unit.uid,
      actorName: unit.name,
      targetMax: unit.stats.maxHealth,
      hp: unit.currentHealth,
      text: `${unit.name} 伤势过重，退出本次秘境`
    })
    return unit.source === 'player'
  }

  while (round < Math.max(num(maxRounds, 30), 1)) {
    round += 1
    const actors = [...allies, ...enemies]
      .filter(u => u.alive)
      .sort((a, b) => num(b.stats.speed) - num(a.stats.speed) || String(a.uid).localeCompare(String(b.uid)))
    let playerWithdrew = false

    for (const actor of actors) {
      if (!actor.alive) continue
      if (actor.stunned) {
        actor.stunned = false
        frames.push({
          type: 'skip',
          round,
          floor: 0,
          actor: actor.uid,
          actorName: actor.name,
          text: `${actor.name} 被震得无法出手`
        })
        continue
      }
      const foes = (actor.side === 'ally' ? enemies : allies).filter(u => u.alive)
      if (!foes.length) break
      const target = foes[Math.min(Math.floor(num(rng(), 0) * foes.length), foes.length - 1)]
      const hit = resolveAttack(actor, target, rng)

      if (hit.dodged) {
        frames.push({
          type: 'attack',
          round,
          floor: 0,
          attacker: actor.uid,
          attackerName: actor.name,
          target: target.uid,
          targetName: target.name,
          targetMax: target.stats.maxHealth,
          dodged: true,
          damage: 0,
          hp: target.currentHealth,
          text: `${actor.name} 的攻击被 ${target.name} 闪开了`
        })
        continue
      }

      let damage = hit.damage
      const lethal = damage >= target.currentHealth
      // 自动撤退开启时，桂冈/子嗣的致命伤留 1 点血并**自己**退出（不产生永久死亡）。
      // 灵宠不享受这条：它可以被打倒（ko），但不会退出，也不带走任何人（2026-10-22）。
      if (lethal && retreatEligible(target) && autoRetreatOn) {
        damage = Math.max(target.currentHealth - 1, 0)
        target.currentHealth = 1
      } else {
        target.currentHealth = Math.max(target.currentHealth - damage, 0)
      }
      if (target.currentHealth <= 0) {
        target.alive = false
        target.status = permadeath && target.source === 'offspring' ? 'fallen' : 'ko'
        // 记下凶手名字（敌人 unit 的 name 形如「赤炎虎王·第35层」）
        if (actor.side !== 'ally') killerOf.set(target.uid, actor.name)
      }
      if (hit.vampire) {
        const heal = damage * 0.2
        actor.currentHealth = Math.min(actor.stats.maxHealth, actor.currentHealth + heal)
      }
      if (hit.stun && target.alive) target.stunned = true

      frames.push({
        type: 'attack',
        round,
        floor: 0,
        attacker: actor.uid,
        attackerName: actor.name,
        attackerMax: actor.stats.maxHealth,
        target: target.uid,
        targetName: target.name,
        targetMax: target.stats.maxHealth,
        damage,
        crit: hit.crit,
        combo: hit.combo,
        vampire: hit.vampire,
        stun: hit.stun,
        lethal: target.currentHealth <= 0,
        hp: target.currentHealth,
        attackerHp: actor.currentHealth,
        text: `${actor.name} 对 ${target.name} 造成 ${Math.round(damage)} 伤害`
      })

      // 受击后**立刻**判定他自己是否触线（致命伤也算触线）：只退他一个人，其余人继续打。
      // 退出的人 `withdrawn = true`，runSegment 下一层就不让他上场了。
      if (retreatEligible(target) && autoRetreatOn && (lethal || healthPctOf(target) <= num(autoRetreatPct))) {
        if (withdrawAlly(target)) playerWithdrew = true
      }
    }

    if (!enemies.some(u => u.alive)) {
      outcome = 'victory'
      break
    }
    // 桂冈是带队的人：他自己退出，这趟挑战就结束（2026-10-23 用户拍板）
    if (playerWithdrew) {
      outcome = 'retreated'
      break
    }
    // 「还在场」= 没退出的那些；都倒下了才算没得打。
    // 有人退出过就记撤退（保住了命），全员倒地才算战败。
    const standing = allies.filter(u => !u.withdrawn)
    if (!standing.some(u => u.alive)) {
      outcome = withdrawn.length ? 'retreated' : 'defeat'
      break
    }
  }

  if (outcome === 'ongoing') outcome = autoRetreatOn ? 'retreated' : 'defeat'

  if (outcome === 'victory') frames.push({ type: 'victory', round, text: '本层通过' })
  else if (outcome === 'retreated') frames.push({ type: 'retreat', round, text: '队伍撤退，本次挑战结束' })
  else frames.push({ type: 'defeat', round, text: '队伍战败' })

  // ⚠ 退出的人也是 `alive = false`，但**绝不算陨落** —— 不排掉会把撤退算成阵亡
  const deaths = allies
    .filter(u => !u.alive && !u.withdrawn && u.source === 'offspring' && permadeath)
    .map(u => ({
      uid: u.uid,
      refId: u.refId,
      name: u.name,
      source: u.source,
      /** 亡于谁（B1 讣告用）；没有记录时为 null */
      killerName: killerOf.get(u.uid) || null
    }))

  return { allies, enemies, frames, outcome, rounds: round, deaths, withdrawn }
}

// ---------- Buff ----------

const BUFF_BY_ID = new Map()
// 品质由**池的键**决定（`roguelikeOptions.common/rare/epic`）。
// 存一份带 quality 的副本，UI 反查时不用再猜这个 id 属于哪一档。
for (const [quality, pool] of Object.entries(roguelikeOptions)) {
  for (const option of pool) BUFF_BY_ID.set(option.id, { ...option, quality })
}

/**
 * 反查一个 Buff 的展示信息。
 * `run.buffs` 只存 id（存档友好）；名字 / 描述 / 品质都在这里补。
 * 未知 id 返回 null —— 老档里若有已删除的 Buff，不能让 UI 渲染出空标签。
 */
export const buffInfoOf = id => {
  const option = BUFF_BY_ID.get(id)
  if (!option) return null
  return { id: option.id, name: option.name, description: option.description, quality: option.quality }
}

/** 本轮已获得的 Buff 列表（UI 用）。重复选同一项会返回重复条目，由调用方决定怎么合并 */
export const buffListOf = ids => (ids || []).map(buffInfoOf).filter(Boolean)

const QUALITY_RANK = { common: 1, rare: 2, epic: 3 }

const buffWeightsOf = floor => {
  const f = Math.max(Math.floor(num(floor, 1)), 1)
  if (f % 10 === 0) return { common: 0.5, rare: 0.3, epic: 0.2 }
  if (f % 5 === 0) return { common: 0.5, rare: 0.35, epic: 0.15 }
  return { common: 0.7, rare: 0.25, epic: 0.05 }
}

const rollQuality = (weights, rng) => {
  const roll = num(rng(), 1)
  let acc = 0
  for (const q of ['common', 'rare', 'epic']) {
    acc += num(weights[q], 0)
    if (roll < acc) return q
  }
  return 'common'
}

/** 3 选 1。返回纯描述对象（不带 effect），方便存进存档 */
export const pickBuffOptions = (floor, rng = Math.random) => {
  const weights = buffWeightsOf(floor)
  const options = []
  let guard = 0
  while (options.length < 3 && guard < 30) {
    guard += 1
    const quality = rollQuality(weights, rng)
    const pool = (roguelikeOptions[quality] || []).filter(o => !options.some(x => x.id === o.id))
    if (!pool.length) continue
    const option = pool[Math.min(Math.floor(num(rng(), 0) * pool.length), pool.length - 1)]
    options.push({
      id: option.id,
      name: option.name,
      description: option.description,
      quality
    })
  }
  return options
}

/** 10 秒不选时的自动选择：史诗 > 稀有 > 普通，同品质取第一个 */
export const autoPickBuff = options => {
  if (!Array.isArray(options) || !options.length) return null
  return [...options].sort((a, b) => QUALITY_RANK[b.quality] - QUALITY_RANK[a.quality])[0]
}

/** 把 buff id 应用到一队单位。每层战斗前重算，避免 buff 跨层叠加错乱 */
export const applyBuffIds = (units, buffIds = []) => {
  for (const unit of units) {
    // 兜底：已经退出本趟的人不能被「满血 + alive = true」复活。
    // 真正的过滤在 runSegment 里（每层先按 run.withdrawn 剔除再进来）。
    if (unit.withdrawn) continue
    for (const id of buffIds) {
      const option = BUFF_BY_ID.get(id)
      if (option && typeof option.effect === 'function') option.effect(unit)
    }
    // 每层满血开局；buff 提高上限后也补满
    unit.currentHealth = unit.stats.maxHealth
    unit.alive = true
    unit.status = 'alive'
    unit.stunned = false
  }
  return units
}

// ---------- 掉落 ----------

/**
 * 一份空掉落。**导出给 store 用**：一趟挑战会被切成若干 5 层段，
 * 结果面板要显示整趟的累计（`run.lootTotal`），不能只显示最后一段。
 */
export const emptyLoot = () => ({
  spiritual: 0,
  refinementStones: 0,
  herbs: 0,
  pillFragments: 0,
  /** 本段/本趟拿到的宝匣数量与阶（同难度同阶，取最大值即可） */
  chests: 0,
  chestTier: 0,
  /** 50 层首杀的高一阶宝匣（单独记，因为阶级和普通宝匣不同） */
  bonusChests: 0,
  bonusChestTier: 0,
  fateCharms: 0,
  firstClear: false
})

/** 把 `add` 累进 `target`（原地改 `target` 并返回它）。宝匣阶取两者最高。 */
export const mergeLoot = (target, add) => {
  target.spiritual += num(add.spiritual)
  target.refinementStones += num(add.refinementStones)
  target.herbs += num(add.herbs)
  target.pillFragments += num(add.pillFragments)
  target.chests += num(add.chests)
  target.chestTier = Math.max(num(target.chestTier), num(add.chestTier))
  target.bonusChests += num(add.bonusChests)
  target.bonusChestTier = Math.max(num(target.bonusChestTier), num(add.bonusChestTier))
  target.fateCharms += num(add.fateCharms)
  target.firstClear = target.firstClear || !!add.firstClear
  return target
}

/**
 * 单层基础掉落。**首破奖励只在 firstClear 时加一次**。
 * 扫荡/重复挑战调用时不传 firstClear。
 *
 * @param options.difficulty 决定宝匣阶；缺省按难度 1（一阶）
 */
export const rollFloorLoot = (
  floor,
  { kind = 'normal', firstClear = false, difficulty = 1 } = {},
  rng = Math.random,
  tuning = TUNING
) => {
  const f = Math.max(Math.floor(num(floor, 1)), 1)
  const mult = kind === 'bigBoss' ? 3 : kind === 'boss' ? 2 : 1
  const divisor = Math.max(num(tuning.rewards.spiritualDivisor, 9), 1)
  const loot = emptyLoot()
  loot.spiritual = Math.round(
    ((num(tuning.rewards.spiritualBase) + f * num(tuning.rewards.spiritualPerFloor)) * mult) /
      divisor
  )
  if (kind !== 'normal') {
    loot.refinementStones += num(tuning.rewards.bossRefinement)
    loot.chests += Math.max(num(tuning.chest.perBossFloor, 1), 0)
    loot.chestTier = chestTierOfDifficulty(difficulty)
  }
  if (num(rng(), 1) < num(tuning.rewards.herbChance)) {
    loot.herbs += 1 + Math.floor(num(rng(), 0) * Math.max(num(tuning.rewards.herbMax, 1), 1))
  }
  if (num(rng(), 1) < num(tuning.rewards.fragmentChance)) loot.pillFragments += 1
  if (firstClear) {
    // 首破灵石随难度与层数递增：难度 1 第 5 层 = 220、难度 5 第 50 层 = 2,000
    const clearDifficulty = Math.max(Math.floor(num(difficulty, 1)), 1)
    const floorSpan = Math.max(num(tuning.floorsPerDifficulty, 50), 1)
    loot.spiritual += Math.round(num(tuning.rewards.firstClearSpiritual) * clearDifficulty * (1 + f / floorSpan))
    loot.refinementStones += num(tuning.rewards.firstClearRefinement)
    loot.herbs += num(tuning.rewards.firstClearHerbs)
    loot.firstClear = true
  }
  return loot
}

/**
 * 扫荡：1..cap 的基础掉落之和，**永远不含首破、不含 50 层首杀**。
 * 宝匣按每个 Boss 层 1 个结算。
 */
export const sweepLoot = (cap, rng = Math.random, tuning = TUNING, difficulty = 1) => {
  const limit = Math.max(Math.floor(num(cap, 0)), 0)
  const loot = emptyLoot()
  for (let floor = 1; floor <= limit; floor += 1) {
    mergeLoot(
      loot,
      rollFloorLoot(floor, { kind: floorKind(floor), firstClear: false, difficulty }, rng, tuning)
    )
  }
  return loot
}

// ---------- 一段挑战 ----------

/**
 * 同步预演：从 `run.floor` 开始打到下一个 Buff 门（每 5 层）或挑战结束。
 *
 * @param run             { floor, buffs, autoRetreatPct, permadeath, highestFloorReached, withdrawn }
 * @param partyBase       已构建好的满血队伍模板（每层 clone）
 * @param bossFirstClears 持久化的首破账本（只读，返回新对象）
 * @param rng             注入的随机源
 * @returns {{ run, frames, pendingBuff, loot, deaths, firstClears, result }}
 */
export const runSegment = (
  { run, partyBase = [], bossFirstClears = {}, rng = Math.random, tuning = TUNING } = {}
) => {
  let floor = Math.max(Math.floor(num(run?.floor, 1)), 1)
  let highest = Math.max(num(run?.highestFloorReached, floor - 1), floor - 1)
  const frames = []
  const loot = emptyLoot()
  const deaths = []
  const firstClears = { ...(bossFirstClears || {}) }
  const buffs = [...(run?.buffs || [])]
  const autoRetreatPct = num(run?.autoRetreatPct, tuning.autoRetreatDefaultPct)
  const permadeath = !!run?.permadeath
  const difficulty = Math.max(Math.floor(num(run?.difficulty, 1)), 1)
  const lastFloor = Math.max(num(tuning.floorsPerDifficulty, 50), 1)
  /** 50 层首杀（每难度一次）：本难度此前已经拿过就置 true */
  let finalBossFirstKill = !!run?.finalBossFirstKill
  /**
   * 本趟已经自己退出的人（uid）。2026-10-23：撤退从「整队回家」改成「谁触线谁走」，
   * 所以牌桌上要一直记着这份名单 —— 否则下一层 `applyBuffIds` 会把满血 + alive 重新给他。
   */
  const withdrawnSet = new Set((Array.isArray(run?.withdrawn) ? run.withdrawn : []).map(String))
  const withdrawnInfo = new Map()

  let guard = 0
  while (guard < num(tuning.maxFloorsPerSegment, 50)) {
    guard += 1
    const inPlay = partyBase.filter(u => !withdrawnSet.has(String(u.uid)))
    if (!inPlay.length) {
      // 脏档兜底：一个能上场的人都没有了，按撤退收尾
      return {
        run: {
          ...run,
          floor,
          buffs,
          highestFloorReached: highest,
          status: 'finished',
          finalBossFirstKill,
          withdrawn: [...withdrawnSet]
        },
        frames,
        pendingBuff: null,
        loot,
        deaths,
        firstClears,
        result: {
          outcome: 'retreated',
          floor,
          rounds: 0,
          deaths,
          loot,
          retreated: true,
          withdrawn: [...withdrawnInfo.values()]
        }
      }
    }
    const allies = applyBuffIds(inPlay.map(cloneUnit), buffs)
    const enemy = buildEnemy(floor, { difficulty, rng, tuning })
    const battle = simulateBattle(
      {
        allies,
        enemies: [enemy],
        autoRetreatPct,
        permadeath,
        maxRounds: tuning.maxRoundsPerBattle
      },
      rng
    )
    frames.push(...battle.frames.map(frame => ({ ...frame, floor })))
    deaths.push(...battle.deaths)
    for (const unit of battle.withdrawn || []) {
      withdrawnSet.add(String(unit.uid))
      withdrawnInfo.set(String(unit.uid), unit)
    }

    if (battle.outcome !== 'victory') {
      return {
        run: {
          ...run,
          floor,
          buffs,
          highestFloorReached: highest,
          status: 'finished',
          finalBossFirstKill,
          withdrawn: [...withdrawnSet]
        },
        frames,
        pendingBuff: null,
        loot,
        deaths,
        firstClears,
        result: {
          outcome: battle.outcome,
          floor,
          rounds: battle.rounds,
          deaths,
          loot,
          retreated: battle.outcome === 'retreated',
          withdrawn: [...withdrawnInfo.values()]
        }
      }
    }

    const kind = floorKind(floor)
    const firstClear = kind !== 'normal' && !firstClears[String(floor)]
    mergeLoot(loot, rollFloorLoot(floor, { kind, firstClear, difficulty }, rng, tuning))
    if (firstClear) firstClears[String(floor)] = true
    highest = Math.max(highest, floor)

    // 50 层首杀（每个难度一次）：高一阶宝匣（封顶五阶）+ 洗命符 ×1。
    // 扫荡与重复爬塔不再给 —— 只有「本难度此前没拿过」的挑战才会走到这里。
    if (kind === 'bigBoss' && !finalBossFirstKill) {
      finalBossFirstKill = true
      loot.bonusChests += 1
      loot.bonusChestTier = Math.min(
        chestTierOfDifficulty(difficulty) + num(tuning.chest.finalBossBonusTier, 1),
        num(tuning.chest.maxTier, 5)
      )
      loot.fateCharms += num(tuning.chest.finalBossFateCharms, 1)
    }

    // 打穿本难度 50 层：挑战结束（解锁下一难度由 store 处理）
    if (floor >= lastFloor) {
      return {
        run: {
          ...run,
          floor: lastFloor,
          buffs,
          highestFloorReached: highest,
          status: 'finished',
          finalBossFirstKill,
          withdrawn: [...withdrawnSet]
        },
        frames,
        pendingBuff: null,
        loot,
        deaths,
        firstClears,
        result: {
          outcome: 'victory',
          floor: lastFloor,
          rounds: battle.rounds,
          deaths,
          loot,
          retreated: false,
          clearedDifficulty: true,
          withdrawn: [...withdrawnInfo.values()]
        }
      }
    }

    if (floor % num(tuning.buffEveryFloors, 5) === 0) {
      return {
        run: {
          ...run,
          floor: floor + 1,
          buffs,
          highestFloorReached: highest,
          status: 'buff',
          finalBossFirstKill,
          withdrawn: [...withdrawnSet]
        },
        frames,
        pendingBuff: { options: pickBuffOptions(floor, rng) },
        loot,
        deaths,
        firstClears,
        result: null
      }
    }
    floor += 1
  }

  // 安全阀：正常不会走到这里（每 5 层必然停在 Buff 门）
  return {
    run: {
      ...run,
      floor,
      buffs,
      highestFloorReached: highest,
      status: 'fighting',
      finalBossFirstKill,
      withdrawn: [...withdrawnSet]
    },
    frames,
    pendingBuff: null,
    loot,
    deaths,
    firstClears,
    result: null
  }
}

// ---------- 英烈祠 ----------

export const shrineBonuses = count => {
  const n = Math.max(Math.floor(num(count, 0)), 0)
  return {
    cultivationBonus: Math.min(n * num(TUNING.shrine.cultivationPerMartyr), num(TUNING.shrine.cultivationCap)),
    rootChanceBonus: Math.min(n * num(TUNING.shrine.rootPerMartyr), num(TUNING.shrine.rootCap))
  }
}
