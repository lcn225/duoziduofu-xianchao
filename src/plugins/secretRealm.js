// 【秘境】—— 纯函数层（无副作用，可被 node 直接加载跑断言）
//
// 设计（《秘境系统》v1.1）：
//   · 无限爬塔，每 5 层一个 Boss（10/20/30 为大 Boss）
//   · 进一次秘境固定扣 5 个游戏天
//   · 每通关 5 层，3 选 1 Buff；10 秒不选自动选品质最高
//   · 队伍 = 桂冈 + 最多 3 名成年子嗣/灵宠
//   · 自动撤退（默认 20%）；关闭后退可让子嗣真陨落
//   · 扫荡上限 = 最后一个已通关的 Boss 层；首破奖励只给一次
//
// ⚠ 战斗是**同步预演**：这里一次算出整段的 frames，视图只负责按倍速回放。
//   好处：结算不依赖任何计时器；刷新最多丢动画，不丢结果；node 也能断言。
// ⚠ 所有数值都是占位，等《数值真源表》替换。纯函数层不读 Pinia。
import { roguelikeOptions } from './dungeon.js'
// 子嗣成长/出战门槛的真源在模块二（P14）。秘境只消费，不另立一套年龄口径。
import { canFightOf, offspringGrowthOf } from './innerCourt.js'

const DAY = 86400

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback)
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)

/** 数值占位：真源表出来前只保证流程跑通 */
export const TUNING = {
  /** 进一次秘境固定扣 5 个游戏天 */
  timeCostDays: 5,
  /** Boss 层：每 5 层一个，尾数 0 为大 Boss */
  bossEvery: 5,
  bigBossEvery: 10,
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
  /** 出战位（不含桂冈） */
  companionSlots: 3,
  /** 子嗣陨落时返还给桂冈的修为 = 当前修为上限 × 该比例（占位） */
  deathReturnRatio: 0.05,
  offspring: {
    levelsPerYear: 0.5,
    qualityCoef: { low: 0.6, mid: 0.85, high: 1.15, top: 1.5 },
    rootCoef: { 1: 1.8, 2: 1.45, 3: 1.2, 4: 1.0, 5: 0.8 },
    rootlessMultiplier: 0.5,
    fateCoef: { 灵兽: 1.15, 器物: 1.1, 草木: 1.0, 杂物: 0.95 },
    traitCoef: { normal: 0.03, rare: 0.07, legend: 0.15 },
    base: { health: 60, damage: 6, defense: 3, speed: 8 }
  },
  pet: {
    base: { health: 50, damage: 5, defense: 2, speed: 9 }
  },
  enemy: {
    base: { health: 80, damage: 7, defense: 3, speed: 8 },
    perFloor: { health: 0.35, damage: 0.18, defense: 0.12, speed: 0.01 },
    bossMult: 1.8,
    bigBossMult: 3.0
  },
  rewards: {
    stoneBase: 20,
    stonePerFloor: 8,
    bossRefinement: 1,
    herbChance: 0.25,
    herbMax: 2,
    fragmentChance: 0.1,
    firstClearStones: 200,
    firstClearRefinement: 5,
    firstClearHerbs: 2
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
  if (f % num(TUNING.bigBossEvery, 10) === 0) return 'bigBoss'
  if (f % num(TUNING.bossEvery, 5) === 0) return 'boss'
  return 'normal'
}

/** 扫荡上限 = 最后一个已通关的 Boss 层（卡 15 → 10；通 15 → 15） */
export const sweepLimitOf = highestBossCleared => {
  const cleared = Math.max(Math.floor(num(highestBossCleared, 0)), 0)
  const every = Math.max(Math.floor(num(TUNING.bossEvery, 5)), 1)
  return Math.floor(cleared / every) * every
}

/** 5 天成本对应的目标时刻 */
export const runTimeTarget = nowSeconds => num(nowSeconds, 0) + TUNING.timeCostDays * DAY

/**
 * 子嗣能否出战 —— 直接读模块二的成长门槛（P14，设计 §7.1）：
 * **有灵根（仙师）+ 少年及以上**。
 *
 * ⚠ 旧口径是「1 游戏年 = 365 天，所有子嗣都能打」，现在：
 *   · 无灵根子嗣**不能出战**（凡人少年只能做正式工作）；
 *   · 有灵根子嗣提前到「少年」（凡人 90 天 / 仙师 140 天）就能上。
 *   门槛的真源在 `innerCourt.TUNING.growth.combatStage`，这里只转发。
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

/** 子嗣战力：仙龄 × 品质 × 灵根 × 本命 × 词条（占位，对齐《任务战斗》§7.3 的结构） */
export const buildOffspringUnit = (child, { nowSeconds = 0, tuning = TUNING } = {}) => {
  if (!child || child.status === 'fallen') return null
  if (!canFight(child, nowSeconds)) return null

  // 等级按**仙龄**算（P14）：成年 18 仙龄岁 → 约 10 级，与练气十层同量级。
  // 旧口径用「游戏年」（18 岁要 7.3 现实天），在新成长刻度下会永远停在 1~2 级。
  const ageYears = offspringGrowthOf(child, nowSeconds).ageYears
  const level = Math.max(1, Math.floor(1 + ageYears * num(tuning.offspring.levelsPerYear, 0.5)))
  const quality = num(tuning.offspring.qualityCoef[child.quality], 0.6)
  const root = child.hasRoot
    ? num(tuning.offspring.rootCoef[child.rootCount], 1)
    : num(tuning.offspring.rootlessMultiplier, 0.5)
  const fate = child.fate
    ? num(tuning.offspring.fateCoef[child.fate.kind], 1)
    : 1
  const trait = (child.traits || []).reduce(
    (sum, t) => sum + num(tuning.offspring.traitCoef[t.grade], 0),
    0
  )
  const mult = quality * root * fate * (1 + trait)
  const base = tuning.offspring.base

  return makeUnit({
    uid: `off:${child.id}`,
    source: 'offspring',
    refId: child.id,
    name: child.name,
    level,
    realm: child.quality || '',
    stats: {
      health: base.health * level * mult,
      damage: base.damage * level * mult,
      defense: base.defense * level * mult,
      speed: base.speed + level * 0.2
    }
  })
}

/** 灵宠：直接用抽奖时生成的绝对 combatAttributes */
export const buildPetUnit = (pet, { tuning = TUNING } = {}) => {
  if (!pet) return null
  const ca = pet.combatAttributes || {}
  const base = tuning.pet.base
  const health = num(ca.health, num(ca.maxHealth, base.health))
  const stats = {
    health,
    maxHealth: health,
    damage: num(ca.attack, num(ca.damage, base.damage)),
    defense: num(ca.defense, base.defense),
    speed: num(ca.speed, base.speed)
  }
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

const ENEMY_NAMES = {
  normal: ['山魈', '赤目狼', '铁甲蜈蚣', '噬灵蝠'],
  boss: ['守关妖将', '石魈王', '血瞳魔猿'],
  bigBoss: ['秘境之主', '上古凶兽', '镇塔魔君']
}

export const buildEnemy = (floor, rng = Math.random, tuning = TUNING) => {
  const f = Math.max(Math.floor(num(floor, 1)), 1)
  const kind = floorKind(f)
  const mult =
    kind === 'bigBoss'
      ? num(tuning.enemy.bigBossMult, 3)
      : kind === 'boss'
        ? num(tuning.enemy.bossMult, 1.8)
        : 1
  const base = tuning.enemy.base
  const grow = tuning.enemy.perFloor
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
      health: base.health * (1 + f * grow.health) * mult,
      damage: base.damage * (1 + f * grow.damage) * mult,
      defense: base.defense * (1 + f * grow.defense) * mult,
      speed: base.speed * (1 + f * grow.speed),
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

const partyHealthPct = allies => {
  const totalMax = allies.reduce((s, u) => s + num(u.stats.maxHealth), 0)
  const totalNow = allies.reduce((s, u) => s + num(u.currentHealth), 0)
  return totalMax > 0 ? (totalNow / totalMax) * 100 : 0
}

/**
 * 多单位战斗（一方队伍 vs 一方敌人）。按速度排序，每回合每个存活单位行动一次。
 *
 * @returns {{ allies, enemies, frames, outcome:'victory'|'defeat'|'retreated', rounds, deaths }}
 */
export const simulateBattle = (
  { allies = [], enemies = [], autoRetreatPct = TUNING.autoRetreatDefaultPct, permadeath = false, maxRounds = TUNING.maxRoundsPerBattle } = {},
  rng = Math.random
) => {
  const frames = []
  let round = 0
  let outcome = 'ongoing'

  while (round < Math.max(num(maxRounds, 30), 1)) {
    round += 1
    const actors = [...allies, ...enemies]
      .filter(u => u.alive)
      .sort((a, b) => num(b.stats.speed) - num(a.stats.speed) || String(a.uid).localeCompare(String(b.uid)))
    let retreatNow = false

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
      let lethal = damage >= target.currentHealth
      // 自动撤退开启时，队友的致命伤留 1 点血并立刻撤退（不产生永久死亡）
      if (lethal && target.side === 'ally' && num(autoRetreatPct) > 0) {
        damage = Math.max(target.currentHealth - 1, 0)
        target.currentHealth = 1
        retreatNow = true
      } else {
        target.currentHealth = Math.max(target.currentHealth - damage, 0)
      }
      if (target.currentHealth <= 0) {
        target.alive = false
        target.status = permadeath && target.source === 'offspring' ? 'fallen' : 'ko'
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
    }

    if (!enemies.some(u => u.alive)) {
      outcome = 'victory'
      break
    }
    if (!allies.some(u => u.alive)) {
      outcome = 'defeat'
      break
    }
    if (retreatNow) {
      outcome = 'retreated'
      break
    }
    if (num(autoRetreatPct) > 0 && partyHealthPct(allies) <= num(autoRetreatPct)) {
      outcome = 'retreated'
      break
    }
  }

  if (outcome === 'ongoing') outcome = num(autoRetreatPct) > 0 ? 'retreated' : 'defeat'

  if (outcome === 'victory') frames.push({ type: 'victory', round, text: '本层通过' })
  else if (outcome === 'retreated') frames.push({ type: 'retreat', round, text: '血量过低，队伍撤退' })
  else frames.push({ type: 'defeat', round, text: '队伍战败' })

  const deaths = allies
    .filter(u => !u.alive && u.source === 'offspring' && permadeath)
    .map(u => ({ uid: u.uid, refId: u.refId, name: u.name, source: u.source }))

  return { allies, enemies, frames, outcome, rounds: round, deaths }
}

// ---------- Buff ----------

const BUFF_BY_ID = new Map()
for (const pool of Object.values(roguelikeOptions)) {
  for (const option of pool) BUFF_BY_ID.set(option.id, option)
}

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

const emptyLoot = () => ({ spiritStones: 0, refinementStones: 0, herbs: 0, pillFragments: 0, firstClear: false })

const mergeLoot = (target, add) => {
  target.spiritStones += num(add.spiritStones)
  target.refinementStones += num(add.refinementStones)
  target.herbs += num(add.herbs)
  target.pillFragments += num(add.pillFragments)
  target.firstClear = target.firstClear || !!add.firstClear
  return target
}

/**
 * 单层基础掉落。**首破奖励只在 firstClear 时加一次**。
 * 扫荡/重复挑战调用时不传 firstClear。
 */
export const rollFloorLoot = (floor, { kind = 'normal', firstClear = false } = {}, rng = Math.random, tuning = TUNING) => {
  const f = Math.max(Math.floor(num(floor, 1)), 1)
  const mult = kind === 'bigBoss' ? 3 : kind === 'boss' ? 2 : 1
  const loot = emptyLoot()
  loot.spiritStones = Math.round(
    (num(tuning.rewards.stoneBase) + f * num(tuning.rewards.stonePerFloor)) * mult
  )
  if (kind !== 'normal') loot.refinementStones += num(tuning.rewards.bossRefinement)
  if (num(rng(), 1) < num(tuning.rewards.herbChance)) {
    loot.herbs += 1 + Math.floor(num(rng(), 0) * Math.max(num(tuning.rewards.herbMax, 1), 1))
  }
  if (num(rng(), 1) < num(tuning.rewards.fragmentChance)) loot.pillFragments += 1
  if (firstClear) {
    loot.spiritStones += num(tuning.rewards.firstClearStones)
    loot.refinementStones += num(tuning.rewards.firstClearRefinement)
    loot.herbs += num(tuning.rewards.firstClearHerbs)
    loot.firstClear = true
  }
  return loot
}

/** 扫荡：1..cap 的基础掉落之和，**永远不含首破** */
export const sweepLoot = (cap, rng = Math.random, tuning = TUNING) => {
  const limit = Math.max(Math.floor(num(cap, 0)), 0)
  const loot = emptyLoot()
  for (let floor = 1; floor <= limit; floor += 1) {
    mergeLoot(loot, rollFloorLoot(floor, { kind: floorKind(floor), firstClear: false }, rng, tuning))
  }
  return loot
}

// ---------- 一段挑战 ----------

/**
 * 同步预演：从 `run.floor` 开始打到下一个 Buff 门（每 5 层）或挑战结束。
 *
 * @param run             { floor, buffs, autoRetreatPct, permadeath, highestFloorReached }
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

  let guard = 0
  while (guard < num(tuning.maxFloorsPerSegment, 50)) {
    guard += 1
    const allies = applyBuffIds(partyBase.map(cloneUnit), buffs)
    const enemy = buildEnemy(floor, rng, tuning)
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

    if (battle.outcome !== 'victory') {
      return {
        run: { ...run, floor, buffs, highestFloorReached: highest, status: 'finished' },
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
          retreated: battle.outcome === 'retreated'
        }
      }
    }

    const kind = floorKind(floor)
    const firstClear = kind !== 'normal' && !firstClears[String(floor)]
    mergeLoot(loot, rollFloorLoot(floor, { kind, firstClear }, rng, tuning))
    if (firstClear) firstClears[String(floor)] = true
    highest = Math.max(highest, floor)

    if (floor % num(tuning.buffEveryFloors, 5) === 0) {
      return {
        run: { ...run, floor: floor + 1, buffs, highestFloorReached: highest, status: 'buff' },
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
    run: { ...run, floor, buffs, highestFloorReached: highest, status: 'fighting' },
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
