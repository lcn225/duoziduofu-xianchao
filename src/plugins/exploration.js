// 【探索】—— 纯函数层（无副作用，可被 node 直接加载跑断言）
//
// 设计真源：`design/20-系统设计/探索系统.md` v1.0（2026-10-20 定稿）。
//   练气四图 / 每 1 时辰（2 游戏小时）结算 1 次 / 12 次/天 /
//   空包 35 · 采植 20 · 采材 10 · 战斗 15 · 拾遗 10 · 奇遇 5 · 叙事 5 /
//   同境界 70% · 高 1 小境界 90% · 高 2 小境界 100% · 不可越阶。
//
// 不复用旧的「点地点 → 3 秒 setInterval + Worker」循环 —— 那是第二个计时器，
// 且产出不随游戏时间。这里只产出**事件结果**，由 store 负责落账与存档。
//
// ⚠ 探索**不发桂冈修为**（2026-10-17 决议）。修为唯一主源是镇守练功。
// ⚠ 幸运（luck）不再影响胜率：v1.0 只按境界差判定。
import { locations, eventWeightTable } from './locations.js'
import { TUNING as MODE_TUNING } from './idleMode.js'
import { pickBaseItemForEvent, rollItemQuality } from './items.js'
import { QI_ART_MAP } from './cultivationData.js'

/** 数值真源：《数值真值表》§6.3 / 《产出登记表》R10 */
export const TUNING = {
  /** 每 1 时辰 = 2 游戏小时结算一次；一天 12 次 */
  eventEveryGameHours: 2,
  /** 单次 tick 最多补结算多少个事件（24 = 2 个游戏天），防止掉帧/改时钟后一次刷屏 */
  maxEventsPerTick: 24,
  /** 流水账上限 */
  logLimit: 60,
  /** 战斗胜率：同境界 / 高 1 小境界 / 高 2 小境界及以上 */
  winChanceSame: 0.7,
  winChancePlus1: 0.9,
  winChancePlus2: 1,
  /** 战败养伤天数（与《三大挂机》§一一致） */
  injuryGameDays: MODE_TUNING.injuryGameDays,
  /** 物品阶：80% 本阶 / 20% 低一阶；T1 恒本阶（2026-10-21 用户：主掉本阶、辅掉低一阶） */
  itemPrimaryChance: 0.8,
  /**
   * 宝匣概率**仅用于文档/断言**：实际由「古修洞府」事件权重 1% 保证，
   * 事件命中即给 1 个，不要再乘一次 chestChance。
   */
  chestChance: 0.01
}

/** 无字石碑 / 传承印记能掉的基础功法：练气篇 3 本（筑基/金丹不在练气四图） */
export const QI_ART_DROP_POOL = Object.freeze(['beast_roar', 'vessel_jue', 'beast_vessel_dual'])

const HOUR_SECONDS = 3600
const CHEST_TIER_NAMES = ['一', '二', '三', '四', '五', '六', '七']
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback)
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)

export const locationById = id => locations.find(l => l.id === id) || null

/** 可进入的地点（境界够、且数据存在） */
export const canEnterLocation = (playerLevel, location) =>
  !!location && num(playerLevel, 1) >= num(location.minLevel, 1)

/** 可选地点：等级够 */
export const availableLocations = level =>
  locations.filter(location => canEnterLocation(level, location))

/** 事件间隔（游戏秒） */
export const eventIntervalSeconds = (tuning = TUNING) =>
  Math.max(num(tuning.eventEveryGameHours, 2), 0.01) * HOUR_SECONDS

/** 闭区间整数 roll；[0,0] 直接返回 0（不消耗 rng） */
export const rollIntRange = (range, rng = Math.random) => {
  const min = Math.ceil(num(range?.[0], 0))
  const max = Math.floor(num(range?.[1], min))
  if (max <= min) return Math.max(min, 0)
  return min + Math.floor(num(rng(), 0) * (max - min + 1))
}

/**
 * 按权重表抽一个事件。`roll01` 是 [0,1) 的随机数。
 * 用整数百分比 + 单次乘法，避免浮点累加漂移；末尾兜底最后一个事件。
 */
export const pickEventFromTable = (table = [], roll01 = 0) => {
  const rows = table || []
  if (!rows.length) return null
  const roll = clamp(num(roll01, 0), 0, 1) * 100
  let acc = 0
  for (const row of rows) {
    acc += row.weightPct
    if (roll < acc) return row.event
  }
  return rows[rows.length - 1].event
}

export const pickEventAt = (location, roll01) =>
  pickEventFromTable(eventWeightTable(location), roll01)

export const pickExploreEvent = (location, rng = Math.random) => pickEventAt(location, rng())

/**
 * 战斗胜率：只按境界差。
 * 低于地图推荐境界 → 0（正常流程由 `canEnterLocation` 拦住）。
 */
export const battleWinChanceOf = (playerLevel, mapLevel, tuning = TUNING) => {
  const diff = Math.floor(num(playerLevel, 1)) - Math.floor(num(mapLevel, 1))
  if (diff < 0) return 0
  if (diff === 0) return num(tuning.winChanceSame, 0.7)
  if (diff === 1) return num(tuning.winChancePlus1, 0.9)
  return num(tuning.winChancePlus2, 1)
}

/** 物品阶：primary = 本阶；lower = 低一阶；mixed = 70% 本阶 / 30% 低一阶 */
export const rollItemTier = ({ mapTier = 1, policy = 'mixed', rng = Math.random, tuning = TUNING } = {}) => {
  const primary = clamp(Math.floor(num(mapTier, 1)), 1, 5)
  const lower = Math.max(primary - 1, 1)
  if (policy === 'primary') return primary
  if (policy === 'lower') return lower
  return num(rng(), 0) < num(tuning.itemPrimaryChance, 0.8) ? primary : lower
}

/** 宝匣阶级：按**玩家境界段**，不按地图阶（练气 1–2 / 筑基 2–3 / 结丹 3–4） */
export const chestTierForLevel = (playerLevel, rng = Math.random) => {
  const level = Math.floor(num(playerLevel, 1))
  const roll = num(rng(), 0)
  if (level <= 10) return roll < 0.5 ? 1 : 2
  if (level <= 14) return roll < 0.5 ? 2 : 3
  return roll < 0.5 ? 3 : 4
}

/** 从「练气篇 3 本 − 已习得」里抽一本；全集齐返回 null */
export const pickQiArt = (knownQiArts = [], rng = Math.random, pool = QI_ART_DROP_POOL) => {
  const known = new Set((knownQiArts || []).map(String))
  const candidates = pool.filter(id => !known.has(id))
  if (!candidates.length) return null
  return candidates[Math.min(Math.floor(num(rng(), 0) * candidates.length), candidates.length - 1)]
}

const isEmptyReward = reward =>
  !reward || (reward.type === 'spiritual_stone' && !reward.amount) ||
  (reward.type === 'pill_fragment' && !reward.amount) ||
  (reward.type === 'item' && !reward.count)

/**
 * 解析一个事件的奖励。**纯函数**：只返回描述对象，不生成物品实例。
 *
 * @returns {{ rewards: Array, missedPromise: boolean }}
 *   missedPromise = 有「条件奖励」没掉（残页概率、功法已集齐、物品 0 件），
 *   供文案选择 `textMiss`。
 */
export const resolveEventRewards = ({
  event,
  location,
  playerLevel = 1,
  knownQiArts = [],
  rng = Math.random,
  tuning = TUNING
} = {}) => {
  const rewards = []
  const spec = event?.reward || {}
  let missedPromise = false
  const mapTier = num(location?.mapTier, 1)

  // 1. 灵石
  const stones = rollIntRange(spec.stones, rng)
  if (stones > 0) rewards.push({ type: 'spiritual_stone', amount: stones })

  // 2. 物品（同 base + 同成色合并成一条，避免日志刷屏）
  const merged = new Map()
  for (const itemSpec of spec.items || []) {
    if (num(itemSpec.chance, 1) < 1 && num(rng(), 1) >= num(itemSpec.chance, 1)) {
      missedPromise = true
      continue
    }
    const count = rollIntRange(itemSpec.count || [1, 1], rng)
    if (count <= 0) {
      missedPromise = true
      continue
    }
    for (let i = 0; i < count; i += 1) {
      const tier = rollItemTier({ mapTier, policy: itemSpec.tierPolicy, rng, tuning })
      const base = pickBaseItemForEvent({
        category: itemSpec.category,
        types: itemSpec.types,
        fallbackTypes: itemSpec.fallbackTypes,
        tier,
        rng
      })
      if (!base) continue
      const quality = rollItemQuality(rng)
      const key = `${base.id}|${quality}`
      if (merged.has(key)) {
        merged.get(key).count += 1
      } else {
        merged.set(key, {
          type: 'item',
          baseId: base.id,
          name: base.name,
          category: base.category,
          itemType: base.type,
          tier: base.tier,
          quality,
          count: 1
        })
      }
    }
  }
  for (const reward of merged.values()) rewards.push(reward)

  // 3. 丹方残页
  if (spec.fragment) {
    const chance = num(spec.fragment.chance, 1)
    const dropped = chance >= 1 || num(rng(), 1) < chance
    if (dropped) {
      const amount = rollIntRange(spec.fragment.amount || [1, 1], rng)
      if (amount > 0) rewards.push({ type: 'pill_fragment', amount })
    } else {
      missedPromise = true
    }
  }

  // 4. 基础功法（无字石碑 / 传承印记）
  if (spec.art) {
    const chance = num(spec.art.chance, 1)
    const dropped = chance >= 1 || num(rng(), 1) < chance
    const artId = dropped ? pickQiArt(knownQiArts, rng) : null
    if (artId && QI_ART_MAP[artId]) {
      rewards.push({ type: 'qi_art', artId, name: QI_ART_MAP[artId].name })
    } else {
      // 功法已集齐（或没掷中）：转 2 张残页，文案改用 textMiss
      missedPromise = true
      rewards.push({ type: 'pill_fragment', amount: 2 })
    }
  }

  // 5. 宝匣（古修洞府事件命中即给，不再掷概率）
  if (spec.chest) {
    rewards.push({ type: 'chest', tier: chestTierForLevel(playerLevel, rng) })
  }

  return { rewards: rewards.filter(r => !isEmptyReward(r)), missedPromise }
}

const PLACEHOLDER_KEYS = [
  ['灵植名', r => r.category === '灵植'],
  ['灵藤名', r => r.itemType === '藤'],
  ['灵果名', r => r.itemType === '果'],
  ['灵花名', r => r.itemType === '花'],
  ['灵叶名', r => r.itemType === '叶'],
  ['灵土名', r => r.itemType === '灵土'],
  ['骨材名', r => r.itemType === '骨材'],
  ['灵木名', r => r.itemType === '灵木'],
  ['宝晶名', r => r.itemType === '宝晶'],
  ['灵材名', r => r.category === '灵材']
]

/** 把 {灵植名} 之类的占位符换成本次实际掉到的物品名 */
export const fillEventText = (text = '', rewards = []) => {
  const items = rewards.filter(reward => reward.type === 'item')
  let out = String(text || '')
  for (const [key, match] of PLACEHOLDER_KEYS) {
    const placeholder = `{${key}}`
    if (!out.includes(placeholder)) continue
    const hit = items.find(match)
    const fallback = key === '灵材名' ? '灵材' : key === '灵植名' ? '灵植' : '材料'
    out = out.split(placeholder).join(hit?.name || fallback)
  }
  // 兜底：清掉任何残留的 {xxx名}
  return out.replace(/\{[^}]*名\}/g, '材料')
}

const REWARD_LABELS = {
  spiritual_stone: '灵石',
  pill_fragment: '丹方残页'
}

/** 把奖励描述拼成流水账里的「结算」后缀 */
export const formatRewardSummary = (rewards = []) =>
  (rewards || [])
    .filter(reward => reward && reward.type)
    .map(reward => {
      if (reward.type === 'item') return `${reward.category}【${reward.name}】×${reward.count}`
      if (reward.type === 'qi_art') return `习得《${reward.name}》`
      if (reward.type === 'chest') {
        const tierName = CHEST_TIER_NAMES[clamp(num(reward.tier, 1), 1, 7) - 1]
        return `宝匣（${tierName}阶）×1`
      }
      const label = REWARD_LABELS[reward.type] || reward.type
      return `${label} +${reward.amount}`
    })
    .join(' · ')

/**
 * 结算一个探索事件。
 *
 * @returns {{
 *   kind:'nothing'|'find'|'battle'|'defeat'|'adventure'|'narrative',
 *   category:string, eventId:string, eventName:string, text:string,
 *   rewards:Array, narrative:object|null
 * }}
 *   rewards 是**描述对象**，落账由 store 做；纯函数层不碰 Pinia。
 */
export const rollExploreEvent = ({
  location,
  eventId = null,
  playerLevel = 1,
  knownQiArts = [],
  rng = Math.random,
  tuning = TUNING
} = {}) => {
  if (!location) {
    return {
      kind: 'nothing',
      category: 'nothing',
      eventId: '',
      eventName: '',
      text: '走了半天，一无所获。',
      rewards: [],
      narrative: null
    }
  }

  let event = null
  if (eventId) {
    event = (location.events || []).find(e => e.id === eventId) || null
  } else {
    event = pickExploreEvent(location, rng)
  }
  if (!event) {
    return {
      kind: 'nothing',
      category: 'nothing',
      eventId: '',
      eventName: '',
      text: '走了半天，一无所获。',
      rewards: [],
      narrative: null
    }
  }

  const base = { eventId: event.id, eventName: event.name, category: event.category }

  // 战斗：只有 battle 大类且没标 noBattle 才掷胜率
  if (event.category === 'battle' && !event.noBattle) {
    const winChance = battleWinChanceOf(playerLevel, location.minLevel, tuning)
    if (num(rng(), 0) >= winChance) {
      return {
        ...base,
        kind: 'defeat',
        text: '遭遇强敌，重伤败退，只能回家养伤。',
        rewards: [],
        narrative: null
      }
    }
    const { rewards } = resolveEventRewards({ event, location, playerLevel, knownQiArts, rng, tuning })
    return { ...base, kind: 'battle', text: fillEventText(event.text, rewards), rewards, narrative: null }
  }

  const { rewards, missedPromise } = resolveEventRewards({
    event,
    location,
    playerLevel,
    knownQiArts,
    rng,
    tuning
  })
  const rawText = missedPromise && event.textMiss ? event.textMiss : event.text
  let text = fillEventText(rawText, rewards)
  if (event.category === 'narrative' && event.narrative?.label) {
    text = `${text}（你选择${event.narrative.label}）`
  }

  const kind =
    event.category === 'nothing'
      ? 'nothing'
      : event.category === 'adventure'
        ? 'adventure'
        : event.category === 'narrative'
          ? 'narrative'
          : 'find'

  return {
    ...base,
    kind,
    text,
    rewards,
    narrative: event.narrative ? { ...event.narrative } : null
  }
}

/** 新建一次探索会话（纯数据） */
export const createExplorationSession = ({ nowSeconds = 0, locationId = '', tuning = TUNING } = {}) => {
  const now = Math.max(num(nowSeconds), 0)
  return {
    active: true,
    locationId,
    startedAt: now,
    nextEventAt: now + eventIntervalSeconds(tuning),
    log: [],
    stats: {
      events: 0,
      wins: 0,
      losses: 0,
      stones: 0,
      items: 0,
      fragments: 0,
      arts: 0,
      chests: 0,
      narratives: 0
    }
  }
}

const appendLog = (log, entry, limit) => [...log, entry].slice(-Math.max(num(limit, 60), 1))

const EMPTY_STATS = Object.freeze({
  events: 0,
  wins: 0,
  losses: 0,
  stones: 0,
  items: 0,
  fragments: 0,
  arts: 0,
  chests: 0,
  narratives: 0
})

/** 老档 stats 可能只有 events/wins/losses：先补键，避免 += undefined 变 NaN */
export const normalizeExplorationStats = (stats = {}) => ({ ...EMPTY_STATS, ...(stats || {}) })

const addStats = (stats, result) => {
  const next = normalizeExplorationStats(stats)
  next.events += 1
  if (result.kind === 'battle') next.wins += 1
  if (result.kind === 'defeat') next.losses += 1
  if (result.kind === 'narrative') next.narratives += 1
  for (const reward of result.rewards || []) {
    if (reward.type === 'spiritual_stone') next.stones += reward.amount
    if (reward.type === 'item') next.items += reward.count
    if (reward.type === 'pill_fragment') next.fragments += reward.amount
    if (reward.type === 'qi_art') next.arts += 1
    if (reward.type === 'chest') next.chests += 1
  }
  return next
}

/**
 * 把探索状态推进到 `toSeconds`。**纯函数**：不读 store、不存档、不碰时钟。
 *
 * @returns {{ state, resolutions, defeated }}
 *   resolutions 是本次补结算的事件列表（按时间正序），store 用它落账/写提示。
 */
export const advanceExploration = (state, toSeconds, ctx = {}, rng = Math.random) => {
  if (!state?.active) return { state, resolutions: [], defeated: false }
  const to = num(toSeconds, 0)
  const tuning = ctx.tuning || TUNING
  const location = ctx.location || locationById(state.locationId)
  const interval = eventIntervalSeconds(tuning)
  let next = num(state.nextEventAt, to + interval)
  let working = state
  const resolutions = []
  let guard = 0

  while (next <= to && guard < num(tuning.maxEventsPerTick, 24)) {
    const result = rollExploreEvent({
      location,
      playerLevel: ctx.playerLevel,
      knownQiArts: ctx.knownQiArts,
      rng,
      tuning
    })
    // 流水账必须带**结算结果**，不能只写「发现一处矿脉」——
    // 玩家得看见这次到底拿到了什么。
    const summary = formatRewardSummary(result.rewards)
    const text = summary ? `${result.text} · ${summary}` : result.text
    resolutions.push({ ...result, at: next, text })

    working = {
      ...working,
      nextEventAt: next + interval,
      log: appendLog(working.log || [], { at: next, kind: result.kind, text }, tuning.logLimit),
      stats: addStats(working.stats, result)
    }

    guard += 1
    if (result.kind === 'defeat') {
      working = { ...working, active: false }
      return { state: working, resolutions, defeated: true }
    }
    next += interval
  }

  return { state: working, resolutions, defeated: false }
}
