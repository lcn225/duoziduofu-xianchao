// 离线结算 · 纯函数层（模块九 v2.1，2026-10-26 B2；2026-10-29 P55-c 按境界两套）
//
// 这一层只做四件事：**时间换算 / 按 00:00 切窗 / 报告聚合 / 探索与秘境的纯驱动**。
// 真正的结算一律调各模块自己的推进函数（在 `stores/modules/offline.js` 里编排），
// 这里**不写第二套规则**，也不 import Vue / Pinia / 任何 store
// （`verify-offline.mjs` 有静态扫描断言，防止以后有人手滑引进来）。
//
// ⚠ **分层时间（《时间刻度修订方案（2026-10-29）》§五；2026-11-03 A1 加金丹）**：
//   练气期 1 游戏天 = 96 现实秒、离线上限 180 天（≈4.8 现实小时）；
//   筑基后 1 游戏天 = **4 现实秒**（24×）、金丹 **≈0.571 现实秒**（168×）；
//   上限按**分段配额**另算（2026-11-05 B1：练气 180 / 筑基·金丹 1,500 过渡值，
//   目标态见 `OFFLINE_TUNING.maxGameDays` 的注释）。
//   跨境界的离线（下线时练气、离线期间筑基/结丹）**按段结算**：本段烧掉多少现实秒，
//   剩下的预算再按新段位的速率换算 —— 不按「下线那一刻的境界」一刀切。

import { advanceExploration, eventIntervalSeconds, rewardsOfResolution } from './exploration.js'
import { runSegment, autoPickBuff, timeCostDaysOf } from './secretRealm.js'
import { timeScaleOf } from './gameClock.js'
import { realmTierOf } from './realm.js'

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

/**
 * 离线相位 = 境界段（2026-11-03 A1 加金丹）。
 * 与 `realm.realmTierOf(level)` 一一对应：练气 `qi` / 筑基 `foundation` / 金丹 `core`。
 */
export const OFFLINE_PHASES = Object.freeze({
  QI: 'qi',
  FOUNDATION: 'foundation',
  CORE: 'core'
})

export const OFFLINE_TUNING = {
  /**
   * 离线上限（游戏天），**按境界段三套**（P55-c；2026-11-03 A1 加金丹）。
   *
   * **口径 = 原则 A（2026-11-05 B1 拍板）：离线等价于同样现实时长的在线挂机。**
   * 上限单位是**现实时长 T = 4.8 小时**（= 练气现状 180 天），各段游戏天 = T ÷ 该段速率：
   *
   *   练气 180（4.8h，段内容 ≈100%）· 筑基 **4,320**（4.8h，段内容 10.4%）·
   *   金丹 **30,240**（4.8h，段内容 26.4%，按 168×）。
   *
   * ⚠ **2026-11-11 R34 已抬到目标态**（`maxGameDays` 三档全部按原则 A）：
   *   块结算 + 日常循环块化之后，逐日重放的 0.037 秒/游戏天不再成立；
   *   实测见《日报 2026-11-11》§四。旧过渡值 1,500（B1-a）已作废。
   *
   * ⚠ **不要再按「设计表 3,650」去改**：3,650 是 24× 时代凭感觉写的，不是从任何原则
   *   （现实时长 / 内容占比 / 性能预算）推出来的；2026-11-05 B1 已用原则 A 取代它。
   * ⚠ **也不要再拿「上限按游戏天」当理由**：上限的单位是现实时长，游戏天只是各段的换算结果。
   */
  maxGameDays: { qi: 180, foundation: 4320, core: 30240 },
  /**
   * **离线结算的块步长（游戏天）** —— 2026-11-11 用户拍板「不需要那么精确，
   * 用粗颗粒度换结算速度」。
   *
   * 练气段只有 180 天，逐日重放最便宜，也是唯一会让玩家感知到「哪天生了谁」的段；
   * 筑基 / 金丹的离线跨度是几年，逐日扫 1,400+ 子嗣 × 1,500 天会在读档时冻住
   * 主线程（真档实测 79 秒，其中内宅日结 37 秒、药浴池 26 秒）。
   *
   * 块内口径（**只影响离线，在线一行不动**）：
   *   · 内宅日结 / 子嗣修炼 / 家族工作 / 历练：一次算 `blockDays` 天的量；
   *   · 子嗣诞生与寿终：按块末时刻判定（最多晚 `blockDays` 天，这是精度损失）；
   *   · 药浴池：块末转换一次（块内体魄结算看到的是块初药力）；
   *   · 封地：仍逐日（经营链有仓满刹车与月税，不能简单乘天数）。
   * ⚠ 这是**有意为之的近似**，不是 bug；要改精确度只改这一行。
   */
  blockDays: { qi: 1, foundation: 7, core: 180 },
  /** 一趟离线最多切几段（qi → foundation → core = 3 段；留余量） */
  maxPhases: 4,
  /** 离开不足 1 分钟不产报告、不重放（刷新页面不该弹窗） */
  minRealSeconds: 60,
  /** 讣告名单上限（报告只列这么多，其余进「等 N 人」） */
  reportNameLimit: 200,
  /** 探索战败养伤 12 游戏小时（《三大挂机》§2.4） */
  injuryGameSeconds: 12 * 3600,
  /**
   * 安全阀：一天一个窗口 + 尾窗。
   * ⚠ **必须 ≥ 最大段配额**（2026-11-05 B1：1500 天 ⇒ 至少 1,501 个）。
   *   留在 400 会把 1,500 天静默截在第 400 天 —— 预算没花完、报告却显示「已触顶」。
   */
  maxWindows: 32000,
  /** 重大事件记录上限 */
  eventLimit: 20
}

// ---------- 换算 ----------

/** 桂冈境界 → 离线相位（与 `realm.realmTierOf` 一一对应） */
export const offlinePhaseOfLevel = level => realmTierOf(level)

/** 相位 → 1 游戏天 = 多少现实秒（练气 96 / 筑基 4 / 金丹 ≈0.571） */
export const offlineRealSecondsPerGameDayOf = phase =>
  GAME_SECONDS_PER_DAY / offlineGameSecondsPerRealSecondOf(phase)

/** 相位 → 该相位的离线上限（游戏天） */
export const offlineMaxGameDaysOf = phase =>
  num(OFFLINE_TUNING.maxGameDays[phase], OFFLINE_TUNING.maxGameDays.qi)

/** 相位 → 离线块步长（游戏天）；缺省按 1 天（逐日），保证未知相位不会跳步 */
export const offlineBlockDaysOf = phase =>
  Math.max(Math.floor(num(OFFLINE_TUNING.blockDays[phase], 1)), 1)

/** 相位 → 1 现实秒 = 多少游戏秒（练气 900 / 筑基 21,600 / 金丹 151,200） */
export const offlineGameSecondsPerRealSecondOf = phase =>
  GAME_SECONDS_PER_REAL_SECOND * timeScaleOf(phase)

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
 *   · 筑基段：4 现实秒/天 ⇒ 4.8 小时能换到 4,320 天，现在由过渡配额 1,500 卡住
 *     （目标态 4,320，等 R34 聚合引擎）；
 *   · 金丹段：≈0.571 现实秒/天 ⇒ 4.8 小时能换到 30,240 天，同样由 1,500 天卡住。
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
    /** 灵植（2026-11-08 灵草退役后改名；旧报告里的 `herbs` 不再产生） */
    plants: 0,
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
    /** A1-3：四属性面板的前后快照（离线提示与弹窗同一条文案格式） */
    fromPanel: null,
    toPanel: null,
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
      case 'craft_fragment':
        report.gains.fragments += amount
        break
      case 'plant':
        report.gains.plants += amount
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
 * 记一批讣告。名单有上限（1,500 天能死几十上百人，报告不能逐条刷屏）。
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

/** 重大事件（有上限，防止 1,500 天刷满） */
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
  tuning,
  /** B11-a3：离线秘境同样吃消耗品，库存视图由 store 传（本函数不碰背包） */
  consumables = null
} = {}) => {
  const segment = runSegment({ run, partyBase, bossFirstClears, rng, tuning, consumables })
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
