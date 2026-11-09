#!/usr/bin/env node
/**
 * 多子多福 · 孕产与生育模型模拟（2026-11-09）
 *
 * 目的：验算两件事，不碰游戏代码、不读存档。
 *   ① 桂冈在 36/48/60 内宅上限下，各段亲生孩子量级（新模型 vs 旧 6 胎）
 *   ② 删掉 6 胎上限后，子孙自然繁衍是否会把人口顶爆
 *
 * 用法：node scripts/sim-fertility.mjs [--seed=1]
 */

const DAYS_PER_YEAR = 365
const CLOCK = { qi: 1, foundation: 24, core: 168 }
const SEC_PER_DAY = tier => 96 / CLOCK[tier]

const LIFESPAN = { mortal: 80, qi: 120, foundation: 200, core: 500 }
const Q = { mortal: 0.425, qi: 0.475, foundation: 0.525, core: 0.575 }
const B_TARGET = { mortal: 12, qi: 6, foundation: 6, core: 4 }

const PREG = 280
const REC = 30
const REWARD_PREG = 90
const REWARD_REC = 10
const REWARD_COUNT = 5

const HOUSEHOLD_CAP = { qi: 36, foundation: 48, core: 60 }
const POP_CAP = { qi: 626, foundation: 1500, core: 2400 }

/** 旧模型 */
const OLD = { preg: 90, rec: 10, p: { mortal: 0.105, qi: 0.069, foundation: 0.055 }, cap: 6 }
/** 新模型 */
const NEW = { preg: PREG, rec: REC, rewardCount: REWARD_COUNT }

const P_CURRENT = { mortal: 0.105, qi: 0.069, foundation: 0.055 }

/** 由「全周期胎数 B」反推自然受孕率（每晚/每次留宿） */
function naturalP(rank) {
  const w = LIFESPAN[rank] * Q[rank] * DAYS_PER_YEAR
  const interval = w / B_TARGET[rank]
  return 1 / (interval - PREG - REC)
}
const NATURAL_P = Object.fromEntries(Object.keys(B_TARGET).map(r => [r, naturalP(r)]))

/** 可复现随机数 */
function rngOf(seed) {
  let a = seed >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const fmt = (n, d = 0) => Number(n).toFixed(d)

/**
 * 一名侍妾一辈子的生育（天步进）。
 * @returns {{births:number, rewardUsed:number, days:number}}
 */
function lifeBirths(rank, { seed, model, rewardLeft, maxDays = Infinity, attemptsPerDay = 1 }) {
  const rng = rngOf(seed)
  let age = 16 + rng() * 6
  const fertEnd = 16 + LIFESPAN[rank] * Q[rank]
  const declineStart = fertEnd * 0.7
  let births = 0
  let rewardUsed = 0
  let days = 0

  while (age < fertEnd && days < maxDays) {
    const useReward = model === 'new' && rewardLeft > 0
    const coef = age <= declineStart ? 1 : (fertEnd - age) / (fertEnd - declineStart)
    const base = useReward ? P_CURRENT[rank] : model === 'new' ? NATURAL_P[rank] : OLD.p[rank]
    const p = base * coef * attemptsPerDay
    if (rng() >= p) {
      age += 1 / DAYS_PER_YEAR
      days += 1
      continue
    }
    // 受孕成功
    births++
    const preg = useReward ? REWARD_PREG : model === 'new' ? PREG : OLD.preg
    const rec = useReward ? REWARD_REC : model === 'new' ? REC : OLD.rec
    if (useReward) rewardLeft--
    rewardUsed += useReward ? 1 : 0
    const block = preg + rec
    age += block / DAYS_PER_YEAR
    days += block
    if (model === 'old' && births >= OLD.cap) break
  }
  return { births, rewardUsed, days }
}

/**
 * 桂冈：内宅常满（死了/绝育了立刻换人），跑满整段。
 */
function simLord(tier, wifeRank, segmentYears, model, seed) {
  const rng = rngOf(seed)
  const cap = HOUSEHOLD_CAP[tier]
  let total = 0
  let rewardLeft = model === 'new' ? REWARD_COUNT : 0
  let elapsedYears = 0
  let slots = 0
  let wifeCount = 0

  // 先一次性招满
  const ages = Array.from({ length: cap }, () => 16 + rng() * 6)
  while (elapsedYears < segmentYears) {
    // 每名在册侍妾推进 1 天，直到有人寿终 / 绝育 → 换人
    let dt = Infinity
    for (let i = 0; i < cap; i++) {
      const left = (LIFESPAN[wifeRank] - ages[i]) * DAYS_PER_YEAR
      if (left < dt) dt = Math.max(left, 1)
    }
    // 简化：整批按最短寿命推进
    const stepYears = Math.min(dt / DAYS_PER_YEAR, segmentYears - elapsedYears)
    if (stepYears <= 0) break
    for (let i = 0; i < cap; i++) {
      const { births, rewardUsed } = lifeBirths(wifeRank, {
        seed: seed + i * 977 + Math.floor(elapsedYears * 7),
        model,
        rewardLeft
      })
      // 按本段时间占比折算（简化：整段只算一次，见注释）
      total += births
      rewardLeft -= rewardUsed
      wifeCount++
    }
    elapsedYears += stepYears
    slots++
    if (slots > 50) break
  }
  // 上面把「每批侍妾的终身生育」直接累加，批数 ≈ 段长 / 寿元
  return { total, wifeCount, rewardLeft }
}

/**
 * 桂冈：内宅常满（死了/换人），按「批」推进。
 * 第 b 批侍妾只在段内剩余的 (段长 − b×寿元) 里生育。
 */
function simLordFast(tier, wifeRank, segmentYears, model, seed, perWeek = 7) {
  const rng = rngOf(seed)
  const cap = HOUSEHOLD_CAP[tier]
  const attemptsPerDay = perWeek / 7
  const batches = Math.max(1, Math.ceil(segmentYears / LIFESPAN[wifeRank]))
  let total = 0
  let rewardLeft = model === 'new' ? REWARD_COUNT : 0
  let born = 0
  for (let b = 0; b < batches; b++) {
    const remainYears = Math.max(0, segmentYears - b * LIFESPAN[wifeRank])
    const maxDays = remainYears * DAYS_PER_YEAR
    if (maxDays <= 0) break
    for (let i = 0; i < cap; i++) {
      if (born >= cap * batches) break
      const r = lifeBirths(wifeRank, {
        seed: seed + b * 7919 + i * 131,
        model,
        rewardLeft,
        maxDays,
        attemptsPerDay
      })
      total += r.births
      rewardLeft -= r.rewardUsed
      born++
    }
  }
  return { total, batches, wifeCount: cap * batches }
}

/**
 * 子孙繁衍：按年推进的闭群人口模型。
 * 每对夫妻每年按 1/胎间隔 出产；人口上限挡住新增婚配/受孕。
 */
function simPopulation(tier, years, model, seed) {
  const rng = rngOf(seed)
  const cap = POP_CAP[tier]
  // 个体：{age, sex, hasRoot, married}
  let pop = []
  for (let i = 0; i < 100; i++) {
    pop.push({ age: 18 + rng() * 40, sex: rng() < 0.5 ? 'm' : 'f', hasRoot: rng() < 0.5, married: false })
  }

  const rankOf = p => (p.hasRoot ? 'qi' : 'mortal')
  const intervalYears = rank =>
    (LIFESPAN[rank] * Q[rank] * DAYS_PER_YEAR) / B_TARGET[rank] / DAYS_PER_YEAR
  const oldIntervalYears = rank => (OLD.preg + OLD.rec + 1 / OLD.p[rank]) / DAYS_PER_YEAR

  let capYear = null
  for (let y = 0; y < years; y++) {
    // 年龄 / 死亡
    for (const p of pop) p.age++
    pop = pop.filter(p => p.age <= LIFESPAN[rankOf(p)])
    // 婚配（14 岁起；人口上限挡住）
    if (pop.length < cap) {
      const singlesM = pop.filter(p => !p.married && p.sex === 'm' && p.age >= 14)
      const singlesF = pop.filter(p => !p.married && p.sex === 'f' && p.age >= 14)
      const n = Math.min(singlesM.length, singlesF.length)
      for (let i = 0; i < n; i++) {
        singlesM[i].married = true
        singlesF[i].married = true
        singlesM[i].spouse = singlesF[i]
        singlesF[i].spouse = singlesM[i]
        singlesM[i].births = 0
        singlesF[i].births = 0
      }
    }
    // 生育
    if (pop.length < cap) {
      const mothers = pop.filter(
        p => p.sex === 'f' && p.married && p.age >= 16 && p.age <= 16 + LIFESPAN[rankOf(p)] * Q[rankOf(p)]
      )
      for (const mom of mothers) {
        if (pop.length >= cap) break
        const rank = rankOf(mom)
        const iv = model === 'new' ? intervalYears(rank) : oldIntervalYears(rank)
        if (model === 'old' && (mom.births || 0) >= OLD.cap) continue
        if (rng() < 1 / iv) {
          mom.births = (mom.births || 0) + 1
          pop.push({ age: 0, sex: rng() < 0.5 ? 'm' : 'f', hasRoot: rng() < 0.5, married: false })
        }
      }
    }
    if (capYear === null && pop.length >= cap) capYear = y + 1
  }
  return { pop: pop.length, capped: pop.length >= cap, capYear }
}

// ---------- 报告 ----------
const seed = Number((process.argv.find(a => a.startsWith('--seed=')) || '').split('=')[1]) || 1

const SEG = { qi: 2.1, foundation: 24.7, core: 314 }
const WIFE_RANK = { qi: 'mortal', foundation: 'qi', core: 'foundation' }

console.log('\n=== ① 桂冈亲生孩子（内宅常满 36/48/60，按段长换批）===\n')
console.log('段      段长(游戏年)  妻妾位阶   上限  批数  旧模型(6 胎)  新模型   新模型占人口上限')
for (const tier of ['qi', 'foundation', 'core']) {
  const rank = WIFE_RANK[tier]
  const oldR = simLordFast(tier, rank, SEG[tier], 'old', seed)
  const newR = simLordFast(tier, rank, SEG[tier], 'new', seed + 1)
  const pct = (newR.total / POP_CAP[tier]) * 100
  console.log(
    `${tier.padEnd(8)} ${fmt(SEG[tier], 1).padStart(10)}  ${rank.padEnd(10)} ${String(HOUSEHOLD_CAP[tier]).padStart(4)}  ${String(newR.batches).padStart(4)}  ${fmt(oldR.total).padStart(12)}  ${fmt(newR.total).padStart(7)}  ${fmt(pct, 1).padStart(10)}%`
  )
}

console.log('\n=== ①b 金丹用 P9（P10 尚未开放）===\n')
{
  const oldR = simLordFast('core', 'qi', SEG.core, 'old', seed)
  const newR = simLordFast('core', 'qi', SEG.core, 'new', seed + 1)
  console.log(
    `core     ${fmt(SEG.core, 1).padStart(10)}  qi         ${String(HOUSEHOLD_CAP.core).padStart(4)}  ${String(newR.batches).padStart(4)}  ${fmt(oldR.total).padStart(12)}  ${fmt(newR.total).padStart(7)}  ${fmt((newR.total / POP_CAP.core) * 100, 1).padStart(10)}%`
  )
}

console.log('\n=== ①c 金丹段：每周留宿次数 → 亲生总量（占人口上限 2,400）===\n')
console.log('留宿/周   P9 亲生   占比    P10 亲生   占比')
for (let k = 1; k <= 7; k++) {
  const p9 = simLordFast('core', 'qi', SEG.core, 'new', seed + 1, k).total
  const p10 = simLordFast('core', 'foundation', SEG.core, 'new', seed + 1, k).total
  console.log(
    `${String(k).padStart(6)}  ${fmt(p9).padStart(8)}  ${fmt((p9 / POP_CAP.core) * 100, 1).padStart(5)}%  ${fmt(p10).padStart(9)}  ${fmt((p10 / POP_CAP.core) * 100, 1).padStart(5)}%`
  )
}

console.log('\n=== ② 子孙繁衍：起始 100 人，跑 300 游戏年 ===\n')
console.log('段          上限   旧模型 到顶年  新模型 到顶年')
for (const tier of ['qi', 'foundation', 'core']) {
  const oldR = simPopulation(tier, 300, 'old', seed)
  const newR = simPopulation(tier, 300, 'new', seed + 1)
  console.log(
    `${tier.padEnd(11)} ${String(POP_CAP[tier]).padStart(5)}  ${fmt(oldR.pop).padStart(8)} ${String(oldR.capYear ?? '未顶').padStart(6)}  ${fmt(newR.pop).padStart(8)} ${String(newR.capYear ?? '未顶').padStart(6)}`
  )
}

console.log('\n=== ③ 关键参数 ===\n')
for (const rank of Object.keys(B_TARGET)) {
  const w = LIFESPAN[rank] * Q[rank] * DAYS_PER_YEAR
  console.log(
    `${rank.padEnd(12)} 寿元 ${String(LIFESPAN[rank]).padStart(3)}  育龄 ${fmt(w / DAYS_PER_YEAR, 1)} 年  全周期 B=${B_TARGET[rank]}  自然 p=${(NATURAL_P[rank] * 100).toFixed(4)}%/次`
  )
}
console.log('')
