// 离线结算 · 纯函数层（模块九 v2.1，2026-10-26 B2；2026-10-29 P55-c 按境界两套）
//
// 这一层只做四件事：**时间换算 / 按 00:00 切窗 / 报告聚合 / 探索与秘境的纯驱动**。
// 真正的结算一律调各模块自己的推进函数（在 `stores/modules/offline.js` 里编排），
// 这里**不写第二套规则**，也不 import Vue / Pinia / 任何 store
// （`verify-offline.mjs` 有静态扫描断言，防止以后有人手滑引进来）。
//
// ⚠ **双层时间（《时间刻度修订方案（2026-10-29）》§五）**：
//   练气期 1 游戏天 = 96 现实秒、离线上限 180 天（≈4.8 现实小时）；
//   筑基后 1 游戏天 = **4 现实秒**（24×）、上限按**分段配额**另算。
//   跨境界的离线（下线时练气、离线期间筑基）**按段结算**：练气段烧掉多少现实秒，
//   剩下的预算再按筑基后的速率换算 —— 不按「下线那一刻的境界」一刀切。

import { advanceExploration, eventIntervalSeconds, rewardsOfResolution } from './exploration.js'
import { runSegment, autoPickBuff, timeCostDaysOf } from './secretRealm.js'
import { SECONDS_PER_GAME_HOUR, ASCENDED_TIME_SCALE } from './gameClock.js'
import { isAscendedLevelOf } from './realm.js'

const num = (value, fallback = 0) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** 1 游戏天 = 86,400 游戏秒 */
export const GAME_SECONDS_PER_DAY = 86400
/** 时间唯一锚点：1 现实秒 = 0.25 游戏小时 = 900 游戏秒（`gameClock.SECONDS_PER_GAME_HOUR`） */
export const GAME_SECONDS_PER_REAL_SECOND = 900
/** 1 现实秒 = 1/96 游戏天（练气期） */
export const REAL_SECONDS_PER_GAME_DAY = GAME_SECONDS_PER_DAY / GAME_SECONDS_PER_REAL_SECOND
/** 筑基后：1 现实秒 = 24 × 900 游戏秒 ⇒ 1 游戏天 = 4 现实秒 */
export const GAME_SECONDS_PER_REAL_SECOND_ASCENDED = GAME_SECONDS_PER_REAL_SECOND * ASCENDED_TIME_SCALE
export const REAL_SECONDS_PER_GAME_DAY_ASCENDED = GAME_SECONDS_PER_DAY / GAME_SECONDS_PER_REAL_SECOND_ASCENDED

/** 离线相位：练气期 / 筑基后（`realm.isAscendedLevelOf` 是唯一分界点） */
export const OFFLINE_PHASES = Object.freeze({ QI: 'qi', ASCENDED: 'ascended' })

export const OFFLINE_TUNING = {
  /**
   * 离线上限（游戏天），**按境界两套**（P55-c）。
   *
   * 设计表：练气 180（≈4.8h）/ 筑基后 **3,650**（≈4.06h）。
   *
   * ⚠ **2026-10-29 拍板：筑基段暂用 180，3650 等聚合引擎落地再开**
   *   （《下一步》P55-c 落地记录 · 产出登记表 R33）。原因是逐日重放的实测代价：
   *   真实档（666 子嗣 / 12,189 物品）180 天要 7.9 秒、3650 天要 **136 秒**，
   *   瓶颈 96% 在内宅日结（每天扫 666 个子女）。所以这里先把「按相位换算速率 +
   *   分段配额」的**框架**落地，3650 这个数等「跨期聚合结算」引擎做好再改一行常量。
   */
  maxGameDays: { qi: 180, ascended: 180 },
  /** 一趟离线最多切几次相位（练气 → 筑基后，理论上 2 次；留余量） */
  maxPhases: 4,
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

/** 桂冈境界 → 离线相位 */
export const offlinePhaseOfLevel = level =>
  isAscendedLevelOf(level) ? OFFLINE_PHASES.ASCENDED : OFFLINE_PHASES.QI

/** 相位 → 1 游戏天 = 多少现实秒（练气 96 / 筑基后 4） */
export const offlineRealSecondsPerGameDayOf = phase =>
  phase === OFFLINE_PHASES.ASCENDED ? REAL_SECONDS_PER_GAME_DAY_ASCENDED : REAL_SECONDS_PER_GAME_DAY

/** 相位 → 该相位的离线上限（游戏天） */
export const offlineMaxGameDaysOf = phase =>
  num(OFFLINE_TUNING.maxGameDays[phase], OFFLINE_TUNING.maxGameDays.qi)

/** 相位 → 1 现实秒 = 多少游戏秒 */
export const offlineGameSecondsPerRealSecondOf = phase =>
  phase === OFFLINE_PHASES.ASCENDED ? GAME_SECONDS_PER_REAL_SECOND_ASCENDED : GAME_SECONDS_PER_REAL_SECOND

/** 离线对应的游戏秒（未封顶；`phase` 缺省按练气期） */
export const offlineGameSecondsOf = (realSeconds, { phase = OFFLINE_PHASES.QI } = {}) =>
  Math.max(num(realSeconds), 0) * offlineGameSecondsPerRealSecondOf(phase)

/** 离线对应的游戏天数（已按该相位的上限封顶；`phase` 缺省按练气期） */
export const offlineGameDaysOf = (realSeconds, { phase = OFFLINE_PHASES.QI } = {}) => {
  const days = Math.max(num(realSeconds), 0) / offlineRealSecondsPerGameDayOf(phase)
  return Math.min(days, offlineMaxGameDaysOf(phase))
}

/** 是否触顶（报告要写「已触上限」） */
export const offlineCappedOf = (realSeconds, { phase = OFFLINE_PHASES.QI } = {}) =>
  Math.max(num(realSeconds), 0) / offlineRealSecondsPerGameDayOf(phase) > offlineMaxGameDaysOf(phase)

/**
 * **当前相位还能重放多少游戏天** —— 分段配额的唯一算法。
 *
 * 预算（现实秒）和配额（游戏天）谁先见底就按谁停：
 *   · 练气段：96 现实秒/天，配额 180 天 ⇒ 4.8 现实小时正好用满；
 *   · 筑基段：4 现实秒/天 ⇒ 同样 4.8 小时能换到 4,320 天，由配额卡住。
 *
 * @returns {{days:number, realSeconds:number, rate:number, cappedByQuota:boolean}}
 */
export const offlinePhasePlanOf = ({
  realSecondsLeft = 0,
  phase = OFFLINE_PHASES.QI,
  daysUsedInPhase = 0
} = {}) => {
  const budget = Math.max(num(realSecondsLeft), 0)
  const rate = offlineRealSecondsPerGameDayOf(phase)
  const quotaLeft = Math.max(offlineMaxGameDaysOf(phase) - Math.max(num(daysUsedInPhase), 0), 0)
  const daysByBudget = budget / rate
  const days = Math.min(daysByBudget, quotaLeft)
  return {
    days: days > 1e-9 ? days : 0,
    realSeconds: Math.max(days, 0) * rate,
    rate,
    cappedByQuota: quotaLeft <= daysByBudget + 1e-9
  }
}

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
  /** 修为：store 填开始/结束境界与突破次数；`bodyGained` = 离线期间炼体涨的体魄（P53 #6） */
  cultivation: {
    gained: 0,
    bodyGained: 0,
    breakthroughCount: 0,
    fromRealm: '',
    toRealm: '',
    blocked: false
  },
  /** 子嗣历练（桂冈三选一之外的独立线） */
  expedition: { trips: 0, stones: 0, items: 0 },
  /** 药浴池：离线期间转换了多少件 + 收尾时五系药力的最高占比（《炼体药浴》§9.4） */
  bath: { converted: 0, medicinePct: 0 },
  /** 新生子嗣 */
  births: { count: 0, withSpiritRoot: 0 },
  /** 内宅讣告：只聚合现有两类（妻妾寿终 / 子嗣陨落），子嗣老死代码里还没有 */
  obituary: { wives: [], offspring: [], wifeCount: 0, offspringCount: 0 },
  /** 重大事件（突破、首破、修为已满、中断……） */
  events: [],
  /**
   * 分段账（P55-c）：`{ phase, fromGameSeconds, toGameSeconds, days }`。
   * 跨境界离线会有两条（练气段 + 筑基段）；同境界只有一条。
   */
  phases: [],
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
