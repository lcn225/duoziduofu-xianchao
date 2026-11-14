// 离线探索的**期望值结算**（P62 阶段 E1，2026-11-14）
//
// 真源：《模块九》§3.5 · 《P62 离线结算 v3 · 设计方案（定稿）》步骤 4.1 ·
//       `design/new/P62 阶段 E 施工单.md`
//
// 为什么要有这个模块：离线 30,240 天的探索是 36 万个事件，逐个 `rollExploreEvent`
// 会卡死读档。这里把「一整段离线」当一次抽样，直接算**数学期望**：
//   · 事件数 / 战斗胜败 / 掉落阶 / 每件底材与成色 / 宝匣 / 功法，全部按概率展开；
//   · 落账时用**随机舍入**（`stochasticRound`）—— 期望严格无偏；
//   · 养伤按「吃掉的期望事件槽」折算（`injuryGameDays = 0.5 天 = 6 槽`，有损、已接受）。
//
// 口径纪律：
//   · **在线一行不改**：线上仍走 `rollExploreEvent` / `advanceExploration`；
//   · 这里只从 `items.js` 的候选池函数读分布，不复制一份掉落表；
//   · 叙事事件按 `autoChoice` 确定性并入（㉓），**不做两支加权**。

import { eventWeightTable } from './locations.js'
import {
  ART_DROP_KIND,
  TUNING as EXPLORATION_TUNING,
  artDropPoolOf,
  battleWinChanceOf,
  eventIntervalSeconds,
  tierBandOf
} from './exploration.js'
import {
  DEFAULT_QUALITY_WEIGHTS,
  eventBaseCandidatesOf,
  eventCandidateWeightsOf
} from './items.js'
import { QI_ART_MAP } from './cultivationData.js'

const DAY = 86400
const num = (value, fallback = 0) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}
const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

/**
 * **随机舍入**：整数部分照拿，小数余数按概率多拿 1。
 * `E[stochasticRound(v)] === v` —— 这是「期望值不变」的落账保证。
 */
export const stochasticRound = (value, rng = Math.random) => {
  const v = num(value, 0)
  if (v <= 0) return 0
  const base = Math.floor(v)
  return base + (num(rng(), 0) < v - base ? 1 : 0)
}

/** 闭区间整数 roll 的期望（与 `rollIntRange` 同口径：[0,0] 直接 0） */
export const expectedIntRangeOf = (range = [0, 0]) => {
  const min = Math.ceil(num(range?.[0], 0))
  const max = Math.floor(num(range?.[1], min))
  if (max <= min) return Math.max(min, 0)
  return (min + max) / 2
}

/**
 * 事件概率分布（与 `pickEventFromTable` 逐位同口径：按 weightPct 累加、
 * 末尾兜底接住「权重合计不足 100」的余量）。
 * @returns {{event: object, p: number}[]}
 */
export const eventProbabilitiesOf = location => {
  const table = eventWeightTable(location) || []
  if (!table.length) return []
  const rows = []
  let acc = 0
  for (const row of table) {
    const p = Math.max(num(row.weightPct), 0) / 100
    rows.push({ event: row.event, p })
    acc += p
  }
  const last = rows[rows.length - 1]
  if (last) last.p += Math.max(1 - acc, 0)
  return rows.filter(row => row.p > 0)
}

const isBattleEvent = event => event?.category === 'battle' && !event?.noBattle

/** 叙事事件按 `autoChoice` 取实际生效的奖励规格（㉓；默认 help） */
const effectiveEventOf = event => {
  if (event?.category !== 'narrative') return event
  const auto = event?.narrative?.autoChoice || 'help'
  const option = (event?.narrative?.options || []).find(o => o.id === auto)
  if (!option || option.id !== 'help') return null
  return { ...event, reward: option.reward || event.reward }
}

const addBucket = (acc, key, amount, payload) => {
  if (!(amount > 0)) return
  const cur = acc.get(key)
  if (cur) {
    cur.amount += amount
    return
  }
  acc.set(key, { key, amount, ...payload })
}

/**
 * 一个事件的**期望奖励**（不掷骰），乘 `factor`（事件概率 × 胜率）累加进 `acc`。
 * 逐段镜像 `resolveEventRewards` 的五类：灵石 / 物品 / 残页 / 功法 / 宝匣。
 */
export const addExpectedRewardsOfEvent = (
  acc,
  { event, location, playerLevel = 1, knownQiArts = [], tuning = EXPLORATION_TUNING } = {},
  factor = 0
) => {
  const target = effectiveEventOf(event)
  if (!target || !(factor > 0)) return
  const spec = target.reward || {}
  const highTierChance = num(location?.highTierChance, tuning.defaultHighTierChance)
  const elementBias = location?.elementBias || null
  const lootUnrestricted = target.category === 'battle' || target.category === 'pickup'
  const band = tierBandOf(playerLevel)

  // 1. 灵石
  const stones = expectedIntRangeOf(spec.stones)
  if (stones > 0) addBucket(acc, 'stones', factor * stones, { type: 'spiritual_stone' })

  // 2. 物品：概率 × 件数 × 阶分布 × 底材分布 × 成色分布
  for (const itemSpec of spec.items || []) {
    const chance = num(itemSpec.chance, 1)
    if (chance < 1 && !(chance > 0)) continue
    const pDrop = clamp(chance, 0, 1)
    const eCount = expectedIntRangeOf(itemSpec.count || [1, 1])
    if (!(pDrop > 0) || !(eCount > 0)) continue
    const tierRows = []
    if (itemSpec.tierPolicy === 'high') tierRows.push({ tier: band.high, p: 1 })
    else if (itemSpec.tierPolicy === 'low') tierRows.push({ tier: band.low, p: 1 })
    else {
      const h = clamp(highTierChance, 0, 1)
      if (h < 1) tierRows.push({ tier: band.low, p: 1 - h })
      if (h > 0) tierRows.push({ tier: band.high, p: h })
    }
    const types = lootUnrestricted && itemSpec.category === '灵材' ? null : itemSpec.types
    for (const row of tierRows) {
      const list = eventBaseCandidatesOf({
        category: itemSpec.category,
        types,
        fallbackTypes: itemSpec.fallbackTypes,
        tier: row.tier
      })
      const weights = eventCandidateWeightsOf(list, elementBias)
      for (let i = 0; i < list.length; i += 1) {
        const base = list[i]
        const baseP = weights[i]
        if (!(baseP > 0)) continue
        for (const quality of Object.keys(DEFAULT_QUALITY_WEIGHTS)) {
          const pQ = num(DEFAULT_QUALITY_WEIGHTS[quality], 0)
          if (!(pQ > 0)) continue
          addBucket(acc, `item|${base.id}|${quality}`, factor * pDrop * eCount * row.p * baseP * pQ, {
            type: 'item',
            baseId: base.id,
            name: base.name,
            category: base.category,
            itemType: base.type,
            tier: base.tier,
            quality
          })
        }
      }
    }
  }

  // 3. 百艺残页
  if (spec.fragment) {
    const pDrop = clamp(num(spec.fragment.chance, 1), 0, 1)
    const eAmount = expectedIntRangeOf(spec.fragment.amount || [1, 1])
    if (pDrop > 0 && eAmount > 0) {
      addBucket(acc, 'fragment', factor * pDrop * eAmount, { type: 'craft_fragment' })
    }
  }

  // 4. 功法：池内每本均分；池空（该段已全学）→ 每次转 2 张百艺残页（与在线同口径）
  if (spec.art) {
    const pDrop = clamp(num(spec.art.chance, 1), 0, 1)
    const kind = spec.art.kind || ART_DROP_KIND.heartFragment
    const pool = artDropPoolOf(kind, playerLevel)
    const eDrops = factor * pDrop
    if (!(eDrops > 0)) return
    if (pool.length) {
      const each = eDrops / pool.length
      for (const artId of pool) {
        const art = QI_ART_MAP[artId]
        if (!art) continue
        const type = kind === ART_DROP_KIND.otherArt ? 'qi_art' : 'qi_art_fragment'
        addBucket(acc, `${type}|${artId}`, each, { type, artId, name: art.name })
      }
    } else {
      addBucket(acc, 'fragment', eDrops * 2, { type: 'craft_fragment' })
    }
  }

  // 5. 宝匣：按 highTierChance 拆到段内低阶 / 高阶
  if (spec.chest) {
    const h = clamp(highTierChance, 0, 1)
    if (h < 1) addBucket(acc, `chest|${band.low}`, factor * (1 - h), { type: 'chest', tier: band.low })
    if (h > 0) addBucket(acc, `chest|${band.high}`, factor * h, { type: 'chest', tier: band.high })
  }
}

/**
 * 一整段离线探索的期望结算（纯函数，不碰 store）。
 *
 * @returns {{
 *   events, wins, losses, narratives, injuredDays, helpChoices: number,
 *   rewards: Array, activeSeconds: number
 * }}
 *   奖励已经是**整数**（随机舍入后），可以直接交给 `applyExplorationReward`。
 */
export const planOfflineExplorationExpectation = ({
  location,
  playerLevel = 1,
  knownQiArts = [],
  fromSeconds = 0,
  toSeconds = 0,
  injuryUntilSeconds = 0,
  tuning = EXPLORATION_TUNING,
  rng = Math.random
} = {}) => {
  const empty = { events: 0, wins: 0, losses: 0, narratives: 0, injuredDays: 0, helpChoices: 0, rewards: [], activeSeconds: 0 }
  if (!location) return empty
  const from = Math.max(num(fromSeconds), 0)
  const to = Math.max(num(toSeconds), from)
  const span = to - from
  if (!(span > 0)) return empty
  // 读档时还没养好的伤：这段时间不产事件，但也不额外扣（已经发生过了）
  const injuredSeconds = clamp(num(injuryUntilSeconds) - from, 0, span)
  const activeSeconds = span - injuredSeconds

  const interval = eventIntervalSeconds(tuning)
  const slotsPerDay = DAY / interval
  const probs = eventProbabilitiesOf(location)
  const winChance = battleWinChanceOf(playerLevel, location.minLevel, tuning)

  let battleP = 0
  let lossP = 0
  let narrativeP = 0
  for (const row of probs) {
    if (isBattleEvent(row.event)) {
      battleP += row.p
      lossP += row.p * (1 - winChance)
    }
    if (row.event?.category === 'narrative') narrativeP += row.p
  }

  // 自洽解：每事件占 1 槽，每次养伤额外吃掉 `injuryDays × slotsPerDay` 槽
  const injuryDays = Math.max(num(tuning.injuryGameDays), 0)
  const injurySlots = injuryDays * slotsPerDay
  const days = activeSeconds / DAY
  const rawEvents = (slotsPerDay * days) / (1 + lossP * injurySlots)

  const acc = new Map()
  for (const row of probs) {
    const winFactor = isBattleEvent(row.event) ? winChance : 1
    addExpectedRewardsOfEvent(
      acc,
      { event: row.event, location, playerLevel, knownQiArts, tuning },
      rawEvents * row.p * winFactor
    )
  }

  const rewards = []
  for (const bucket of acc.values()) {
    const count = stochasticRound(bucket.amount, rng)
    if (count <= 0) continue
    switch (bucket.type) {
      case 'spiritual_stone':
        rewards.push({ type: 'spiritual_stone', amount: count })
        break
      case 'item':
        rewards.push({
          type: 'item',
          baseId: bucket.baseId,
          name: bucket.name,
          category: bucket.category,
          itemType: bucket.itemType,
          tier: bucket.tier,
          quality: bucket.quality,
          count
        })
        break
      case 'craft_fragment':
        rewards.push({ type: 'craft_fragment', amount: count })
        break
      case 'chest':
        // 落账口一次只给 1 个（`applyExplorationReward` 读的是 tier 不是 amount），按条展开
        for (let i = 0; i < count; i += 1) rewards.push({ type: 'chest', tier: bucket.tier })
        break
      default:
        // qi_art / qi_art_fragment：一次掉落 = 1 本（残页同理），多出来的掉落按条展开
        for (let i = 0; i < count; i += 1) {
          rewards.push(
            bucket.type === 'qi_art'
              ? { type: 'qi_art', artId: bucket.artId, name: bucket.name }
              : { type: 'qi_art_fragment', artId: bucket.artId, name: bucket.name }
          )
        }
    }
  }

  const wins = stochasticRound(rawEvents * battleP * winChance, rng)
  const losses = stochasticRound(rawEvents * battleP * (1 - winChance), rng)
  const narratives = stochasticRound(rawEvents * narrativeP, rng)
  return {
    events: stochasticRound(rawEvents, rng),
    wins,
    losses,
    narratives,
    injuredDays: Math.round(losses * injuryDays * 10) / 10,
    helpChoices: narratives,
    rewards,
    activeSeconds
  }
}
