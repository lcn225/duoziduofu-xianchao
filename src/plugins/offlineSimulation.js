// 离线结算 · 纯函数层（模块九 v2.0，2026-10-26 B2）
//
// 这一层只做四件事：**时间换算 / 按 00:00 切窗 / 报告聚合 / 探索与秘境的纯驱动**。
// 真正的结算一律调各模块自己的推进函数（在 `stores/modules/offline.js` 里编排），
// 这里**不写第二套规则**，也不 import Vue / Pinia / 任何 store
// （`verify-offline.mjs` 有静态扫描断言，防止以后有人手滑引进来）。
//
// ⚠ 唯一的上限口径：**180 游戏天**（≈4.8 现实小时）。旧版模块九写的
//   「12 现实小时 = 450 天」已于 2026-10-26 下调 —— 450 天 ≈ 一次过夜顶掉整档。

import { advanceExploration, eventIntervalSeconds, rewardsOfResolution } from './exploration.js'
import { runSegment, autoPickBuff, timeCostDaysOf } from './secretRealm.js'

const num = (value, fallback = 0) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** 1 游戏天 = 86,400 游戏秒 */
export const GAME_SECONDS_PER_DAY = 86400
/** 时间唯一锚点：1 现实秒 = 0.25 游戏小时 = 900 游戏秒（`gameClock.SECONDS_PER_GAME_HOUR`） */
export const GAME_SECONDS_PER_REAL_SECOND = 900
/** 1 现实秒 = 1/96 游戏天 */
export const REAL_SECONDS_PER_GAME_DAY = GAME_SECONDS_PER_DAY / GAME_SECONDS_PER_REAL_SECOND

export const OFFLINE_TUNING = {
  /** 离线上限（游戏天）—— 见文件头，2026-10-26 从 450 下调 */
  maxGameDays: 180,
  /** 离开不足 1 分钟不产报告、不重放（刷新页面不该弹窗） */
  minRealSeconds: 60,
  /** 讣告名单上限（报告只列这么多，其余进「等 N 人」） */
  reportNameLimit: 200,
  /** 探索战败养伤 12 游戏小时（《三大挂机》§2.4） */
  injuryGameSeconds: 12 * 3600,
  /** 安全阀：一天一个窗口 + 尾窗，180 天最多 181 个；留余量 */
  maxWindows: 400,
  /** 重大事件记录上限 */
  eventLimit: 20
}

// ---------- 换算 ----------

/** 离线对应的游戏秒（未封顶） */
export const offlineGameSecondsOf = realSeconds =>
  Math.max(num(realSeconds), 0) * GAME_SECONDS_PER_REAL_SECOND

/** 离线对应的游戏天数（已按 180 封顶） */
export const offlineGameDaysOf = realSeconds => {
  const days = Math.max(num(realSeconds), 0) / REAL_SECONDS_PER_GAME_DAY
  return Math.min(days, OFFLINE_TUNING.maxGameDays)
}

/** 是否触顶（报告要写「已触上限」） */
export const offlineCappedOf = realSeconds =>
  Math.max(num(realSeconds), 0) / REAL_SECONDS_PER_GAME_DAY > OFFLINE_TUNING.maxGameDays

/** 是否值得结算：`lastOnlineRealMs` 缺失/非法/不足 1 分钟都直接跳过 */
export const shouldSettleOffline = realSeconds =>
  Number.isFinite(Number(realSeconds)) && Number(realSeconds) >= OFFLINE_TUNING.minRealSeconds

/**
 * 把 [from, from+gameSeconds] 按 **00:00** 边界切开。
 *
 * 为什么要切：内宅日结与月俸只认 00:00；日常循环自己在 06:00 换日，
 * 所以外层**只按 00:00 切**，单段 ≤24 游戏小时（远离 `stepDay` 的 128 次转换保险丝）。
 *
 * @returns {Array<{from:number,to:number,endsAtMidnight:boolean}>}
 */
export const planOfflineWindows = ({ fromGameSeconds = 0, gameSeconds = 0 } = {}) => {
  const windows = []
  const end = Math.max(num(fromGameSeconds), 0) + Math.max(num(gameSeconds), 0)
  let cursor = Math.max(num(fromGameSeconds), 0)
  let guard = 0
  while (cursor < end - 1e-9 && guard < OFFLINE_TUNING.maxWindows) {
    guard += 1
    const nextMidnight = (Math.floor(cursor / GAME_SECONDS_PER_DAY) + 1) * GAME_SECONDS_PER_DAY
    const to = Math.min(nextMidnight, end)
    windows.push({ from: cursor, to, endsAtMidnight: to === nextMidnight })
    cursor = to
  }
  return windows
}

// ---------- 报告 ----------

export const createOfflineReport = ({
  realSeconds = 0,
  fromGameSeconds = 0,
  toGameSeconds = 0,
  mode = 'garrison',
  capped = false
} = {}) => ({
  realSeconds: Math.max(num(realSeconds), 0),
  fromGameSeconds: Math.max(num(fromGameSeconds), 0),
  toGameSeconds: Math.max(num(toGameSeconds), 0),
  gameSeconds: Math.max(num(toGameSeconds) - num(fromGameSeconds), 0),
  gameDays: Math.max(num(toGameSeconds) - num(fromGameSeconds), 0) / GAME_SECONDS_PER_DAY,
  mode,
  capped: !!capped,
  /** 各类收益（资源类由 store 用快照差补，事件类在这里累加） */
  gains: {
    stones: 0,
    secular: 0,
    items: 0,
    chests: 0,
    fragments: 0,
    herbs: 0,
    qiArts: 0,
    refinementStones: 0,
    fateCharms: 0
  },
  /** 修为：store 填开始/结束境界与突破次数 */
  cultivation: { gained: 0, breakthroughCount: 0, fromRealm: '', toRealm: '', blocked: false },
  /** 子嗣历练（桂冈三选一之外的独立线） */
  expedition: { trips: 0, stones: 0, items: 0 },
  /** 新生子嗣 */
  births: { count: 0, withSpiritRoot: 0 },
  /** 内宅讣告：只聚合现有两类（妻妾寿终 / 子嗣陨落），子嗣老死代码里还没有 */
  obituary: { wives: [], offspring: [], wifeCount: 0, offspringCount: 0 },
  /** 重大事件（突破、首破、修为已满、中断……） */
  events: [],
  /** 子嗣陨落 → 唯一暂停点 */
  pausedByFall: null,
  /** 实际推进到的窗口数 / 结算天数 */
  windows: 0,
  daysSettled: 0
})

/**
 * 把一批探索/秘境奖励记进报告（只统计，不落账）。
 *
 * ⚠ `only` 白名单是**防重复计数**用的：灵石 / 物品 / 宝匣这些资源，
 *   报告最终统一走「开始/结束快照差」（`finalizeOfflineReport`），
 *   这里再记一遍就会翻倍。只有快照里看不见的（残页、功法）才需要单独累加。
 */
export const absorbRewards = (report, rewards = [], { only = null } = {}) => {
  if (!report) return report
  for (const reward of rewards || []) {
    if (Array.isArray(only) && !only.includes(reward?.type)) continue
    const amount = num(reward?.amount, 1)
    switch (reward?.type) {
      case 'spiritual_stone':
        report.gains.stones += amount
        break
      case 'item':
        report.gains.items += Math.max(num(reward.count, 1), 1)
        break
      case 'chest':
        report.gains.chests += 1
        break
      case 'pill_fragment':
        report.gains.fragments += amount
        break
      case 'herb':
        report.gains.herbs += amount
        break
      case 'qi_art':
        report.gains.qiArts += 1
        break
      default:
        break
    }
  }
  return report
}

/**
 * 记一批讣告。名单有上限（180 天会死几十上百人，报告不能逐条刷屏）。
 * @param {{wives?:Array, offspring?:Array}} deaths 只放 `{ name, detail }`
 */
export const absorbObituary = (report, { wives = [], offspring = [] } = {}) => {
  if (!report) return report
  const limit = OFFLINE_TUNING.reportNameLimit
  for (const wife of wives || []) {
    report.obituary.wifeCount += 1
    if (report.obituary.wives.length < limit) report.obituary.wives.push(wife)
  }
  for (const child of offspring || []) {
    report.obituary.offspringCount += 1
    if (report.obituary.offspring.length < limit) report.obituary.offspring.push(child)
  }
  return report
}

/** 讣告总人数（名单可能被上限截断，所以计数单独记） */
export const obituaryCountsOf = report => ({
  wives: num(report?.obituary?.wifeCount),
  offspring: num(report?.obituary?.offspringCount)
})

/** 重大事件（有上限，防止 180 天刷满） */
export const addOfflineEvent = (report, text, kind = 'info') => {
  if (!report || !text) return report
  if (report.events.length >= OFFLINE_TUNING.eventLimit) return report
  report.events.push({ kind, text })
  return report
}

// ---------- 探索驱动 ----------

/** 真源在 `exploration.js`（叙事奖励语义属于探索）；这里转出给离线层用 */
export { rewardsOfResolution }

/**
 * 推一段探索。
 *
 * 与在线的唯一差别：战败后**不切模式、不调 forceHomeInjured**，只记一个
 * `injuryUntilSeconds`；养好伤继续探索（2026-10-26 拍板）。
 *
 * @returns {{session, resolutions, defeatedAt, injuryUntilSeconds, healed, startedAt}}
 */
export const runOfflineExplorationSlice = ({
  session,
  fromSeconds = 0,
  toSeconds = 0,
  injuryUntilSeconds = 0,
  ctx = {},
  rng = Math.random,
  tuning = OFFLINE_TUNING
} = {}) => {
  const from = Math.max(num(fromSeconds), 0)
  const to = Math.max(num(toSeconds, from), from)
  let state = session
  let injury = Math.max(num(injuryUntilSeconds), 0)
  let healed = false

  if (!state) {
    return { session: state, resolutions: [], defeatedAt: null, injuryUntilSeconds: injury, healed, startedAt: from }
  }

  // 养伤还没好：整段跳过
  if (injury > from) {
    if (injury >= to) {
      return { session: state, resolutions: [], defeatedAt: null, injuryUntilSeconds: injury, healed: false, startedAt: from }
    }
    healed = true
    const interval = eventIntervalSeconds(ctx.tuning)
    state = { ...state, active: true, nextEventAt: injury + interval }
    injury = 0
  } else if (!state.active) {
    // 存档里是「战败后未养伤」的脏态：按从现在重新出发处理
    const interval = eventIntervalSeconds(ctx.tuning)
    state = { ...state, active: true, nextEventAt: from + interval }
  }

  const result = advanceExploration(state, to, ctx, rng)
  let defeatedAt = null
  if (result.defeated) {
    const last = result.resolutions[result.resolutions.length - 1]
    defeatedAt = num(last?.at, to)
    injury = defeatedAt + tuning.injuryGameSeconds
  }
  return {
    session: result.state,
    resolutions: result.resolutions,
    defeatedAt,
    injuryUntilSeconds: injury,
    healed,
    startedAt: from
  }
}

// ---------- 秘境驱动 ----------

/** 离线续跑时的「新一趟」：与在线同一套字段，只是不经过 store 的建队入口 */
export const createOfflineSecretRun = ({
  difficulty = 1,
  startFloor = 1,
  highestFloorReached = 0,
  autoRetreatPct,
  permadeath = false
} = {}) => ({
  floor: Math.max(Math.floor(num(startFloor, 1)), 1),
  startFloor: Math.max(Math.floor(num(startFloor, 1)), 1),
  highestFloorReached: Math.max(num(highestFloorReached), 0),
  difficulty: Math.max(Math.floor(num(difficulty, 1)), 1),
  buffs: [],
  withdrawn: [],
  status: 'fighting',
  ...(autoRetreatPct == null ? {} : { autoRetreatPct }),
  permadeath: !!permadeath
})

/**
 * 推一段秘境：`runSegment` → 到 Buff 门就自动选（史诗 > 稀有 > 普通）。
 * 纯函数，不扣时间；天数由调用方用 `secretRunDaysOf` 记。
 */
export const stepOfflineSecretRealmSegment = ({
  run,
  partyBase = [],
  bossFirstClears = {},
  rng = Math.random,
  tuning
} = {}) => {
  const segment = runSegment({ run, partyBase, bossFirstClears, rng, tuning })
  let nextRun = segment.run
  let pickedBuff = null
  if (segment.pendingBuff) {
    const choice = autoPickBuff(segment.pendingBuff.options)
    if (choice) {
      pickedBuff = choice
      nextRun = {
        ...nextRun,
        buffs: [...(nextRun.buffs || []), choice.id],
        status: 'fighting'
      }
    }
  }
  return { ...segment, run: nextRun, pickedBuff }
}

/** 这一趟已经花掉的游戏天（结算时才扣，与在线 `finishSecretRealmRun` 同口径） */
export const secretRunDaysOf = run =>
  timeCostDaysOf(run?.highestFloorReached ?? 0, run?.startFloor ?? 1)
