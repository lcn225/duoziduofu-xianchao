// 【探索】—— 纯函数层（无副作用，可被 node 直接加载跑断言）
//
// 设计定位（《三大挂机系统》§三）：纯文字流水账、低风险高回报的基础资源获取。
// 不复用旧的「点地点 → 3 秒 setInterval + Worker」循环 —— 那个是第二个计时器，
// 且产出不随游戏时间。这里只产出**事件结果**，由 store 负责落账与存档。
//
// ⚠ 所有数值都是占位，等《数值真源表》替换。事件间隔以**游戏小时**计：
//   当前时钟 1 现实秒 = 0.25 游戏小时，所以 1 游戏小时 ≈ 4 现实秒。
import { locations } from './locations.js'
import { TUNING as MODE_TUNING } from './idleMode.js'

/** 数值占位：真源表出来前只保证流程跑通 */
export const TUNING = {
  /** 每隔多少游戏小时结算一次事件（占位 1h ≈ 4 现实秒） */
  eventEveryGameHours: 1,
  /** 单次 tick 最多补结算多少个事件，防止掉帧/改时钟后一次刷屏 */
  maxEventsPerTick: 24,
  /** 战斗事件占比 */
  battleChance: 0.35,
  /** 战斗胜率：基础 + 幸运加成，夹在 [0.3, 0.95] */
  winChanceBase: 0.7,
  winChancePerLuck: 0.05,
  winChanceMin: 0.3,
  winChanceMax: 0.95,
  /** 战败养伤天数（与《三大挂机》§三一致） */
  injuryGameDays: MODE_TUNING.injuryGameDays,
  /** 流水账上限 */
  logLimit: 60
}

const HOUR_SECONDS = 3600
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback)
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)

export const locationById = id => locations.find(l => l.id === id) || null

/** 可选地点：等级够、且数据存在 */
export const availableLocations = level =>
  locations.filter(l => num(level, 1) >= num(l.minLevel, 1))

/** 事件间隔（游戏秒） */
export const eventIntervalSeconds = (tuning = TUNING) =>
  Math.max(num(tuning.eventEveryGameHours, 1), 0.01) * HOUR_SECONDS

/**
 * 按 location.rewards 抽一条奖励（纯函数版 `events.getRandomReward`）。
 * 返回 `{ type, amount }` 或 null。
 */
export const rollLocationReward = (rewards = [], rng = Math.random) => {
  const roll = num(rng(), 1)
  let cumulative = 0
  for (const reward of rewards) {
    cumulative += num(reward.chance, 0)
    if (roll <= cumulative) {
      const [min, max] = Array.isArray(reward.amount) ? reward.amount : [0, 0]
      const lo = Math.ceil(num(min, 0))
      const hi = Math.floor(num(max, lo))
      const amount = lo + Math.floor(num(rng(), 0) * (hi - lo + 1))
      return { type: reward.type, amount: Math.max(amount, 0) }
    }
  }
  return null
}

/** 战斗胜率。幸运值沿用现有口径（1.0 = 普通） */
export const battleWinChanceOf = (luck = 1, tuning = TUNING) =>
  clamp(
    num(tuning.winChanceBase) + (num(luck, 1) - 1) * num(tuning.winChancePerLuck),
    num(tuning.winChanceMin),
    num(tuning.winChanceMax)
  )

const REWARD_LABELS = {
  spirit_stone: '灵石',
  herb: '灵草',
  pill_fragment: '丹方残页'
}

/** 把奖励描述拼成流水账里的「结算」后缀，例如「灵石 +3 · 灵草 +2」 */
export const formatRewardSummary = (rewards = []) =>
  (rewards || [])
    .map(reward => {
      const label = REWARD_LABELS[reward.type] || reward.type
      return `${label} +${reward.amount}`
    })
    .join(' · ')

const FIND_TEXTS = ['发现一处散落的灵石矿脉', '在草丛里摸到一株灵草', '捡到前人遗落的储物袋', '循着灵气挖到一点好东西']
const WIN_TEXTS = ['遭遇劫修，力战得胜', '一头妖兽扑来，被你斩于剑下', '碰上流窜的散修，对方丢下东西跑了']
const NOTHING_TEXTS = ['走了半天，一无所获', '风平浪静，只有鸟叫', '绕了一圈，没发现什么']

/** 从文案数组里取一条。rng 返回 1（边界）时也不会越界 */
const pickText = (arr, r) =>
  arr[Math.min(Math.floor(num(r, 0) * arr.length), arr.length - 1)]

/**
 * 结算一个探索事件。
 *
 * @returns {{ kind:'find'|'battle'|'defeat'|'nothing', rewards:Array, text:string }}
 *   rewards 是**描述对象**，落账由 store 做；纯函数层不碰 Pinia。
 */
export const rollExploreEvent = ({ location, luck = 1, rng = Math.random, tuning = TUNING } = {}) => {
  if (!location) return { kind: 'nothing', rewards: [], text: NOTHING_TEXTS[0] }

  if (num(rng(), 1) < num(tuning.battleChance)) {
    if (num(rng(), 1) < battleWinChanceOf(luck, tuning)) {
      const reward = rollLocationReward(location.rewards, rng)
      return {
        kind: 'battle',
        rewards: reward ? [reward] : [],
        text: pickText(WIN_TEXTS, rng())
      }
    }
    return { kind: 'defeat', rewards: [], text: '遭遇强敌，重伤败退，只能回家养伤' }
  }

  const reward = rollLocationReward(location.rewards, rng)
  if (!reward) {
    return {
      kind: 'nothing',
      rewards: [],
      text: pickText(NOTHING_TEXTS, rng())
    }
  }
  return {
    kind: 'find',
    rewards: [reward],
    text: pickText(FIND_TEXTS, rng())
  }
}

/** 新建一次探索会话（纯数据） */
export const createExplorationSession = ({ nowSeconds = 0, locationId = '' } = {}) => {
  const now = Math.max(num(nowSeconds), 0)
  return {
    active: true,
    locationId,
    startedAt: now,
    nextEventAt: now + eventIntervalSeconds(),
    log: [],
    stats: { events: 0, wins: 0, losses: 0, stones: 0, herbs: 0, fragments: 0 }
  }
}

const appendLog = (log, entry, limit) => [...log, entry].slice(-Math.max(num(limit, 60), 1))

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
      luck: ctx.luck,
      rng,
      tuning
    })
    // 流水账必须带**结算结果**，不能只写「发现一处矿脉」——
    // 玩家得看见这次到底拿到了什么。
    const summary = formatRewardSummary(result.rewards)
    const text = summary ? `${result.text} · ${summary}` : result.text
    const entry = { at: next, kind: result.kind, text, rewards: result.rewards }
    resolutions.push({ ...result, at: next, text })

    const stats = { ...working.stats }
    stats.events += 1
    if (result.kind === 'battle') stats.wins += 1
    if (result.kind === 'defeat') stats.losses += 1
    for (const reward of result.rewards) {
      if (reward.type === 'spirit_stone') stats.stones += reward.amount
      if (reward.type === 'herb') stats.herbs += reward.amount
      if (reward.type === 'pill_fragment') stats.fragments += reward.amount
    }

    working = {
      ...working,
      nextEventAt: next + interval,
      log: appendLog(working.log || [], entry, tuning.logLimit),
      stats
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
