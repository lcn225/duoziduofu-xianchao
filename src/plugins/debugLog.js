// 调试日志的纯函数层（P15.6）。
//
// 目的：回答「今天实际产出 vs 计划差多少」。日志按**游戏工作日**（06:00 边界）记一条，
// 由 stores/modules/debug.js 的模块闭包收集、GM 页展示，并可选写进游戏目录的 `log/debug.jsonl`。
//
// 这里只做纯计算：不读 store、不碰 window、不写文件 —— 与其它 plugins/*.js 一致，
// `scripts/verify-dayloop.mjs` 的「调试日志」一组可以直接断言。
//
// ⚠ 计划值（expected）是**按日初快照**算的：日初境界 / 日初速率 / 当天勾选的巡视与百艺。
//   当天中途突破会让实际值偏离计划，这不是 bug —— 日志要暴露的正是这种偏离。
import {
  TUNING as DAY_TUNING,
  WAKE_HOUR,
  OFF_WORK_HOUR,
  dayStartOf
} from './dayLoop.js'
import { EXTRA_GAIN_CHANCE, getCultivationCost, getCultivationGain } from './cultivationMath.js'
import { TUNING as ARTS_TUNING } from './arts.js'

export const DEBUG_TUNING = {
  /** 环形缓冲条数。一天一条 → 500 条约 500 游戏天（≈ 13 现实小时） */
  bufferLimit: 500,
  /** 设计口径：熟练度 1% / 50 游戏小时（《数值真值表》§7.7 的 ×2 决议） */
  designProfHoursPerPercent: 50,
  /** 代码口径：2026-10-19 起与设计一致，也是 1% / 50 游戏小时 */
  codeProfHoursPerPercent: 50,
  /** 一小时最多打坐几次 —— 由 `practice.meditationSeconds` 派生，别抄 60 */
  meditationPerHour: 3600 / DAY_TUNING.practice.meditationSeconds
}

const num = value => (Number.isFinite(Number(value)) ? Number(value) : 0)
const round = (value, digits = 3) => {
  const p = Math.pow(10, digits)
  return Math.round(num(value) * p) / p
}

// ---------- 计划值：时间结构 ----------

/**
 * 小循环可用小时。
 *
 * 06:00 起床 → 巡视 S 小时 → **巡视一结束就开工**（Q8：`L = 12 − S`），18:00 下班。
 *   S=1 → 11h；S=2 → 10h；S=5 → 7h。
 * 与 `dayLoop` 的 `patrolEndSeconds` / `offWorkOf` 同源（巡视结束时刻就是小循环起点）。
 */
export const loopHoursOf = patrolHours => {
  const start = WAKE_HOUR + num(patrolHours)
  return Math.max(OFF_WORK_HOUR - start, 0)
}

/**
 * 计划轮次（《数值真值表》§4.3 的轮次表）。
 *
 *   C = 1 + B + 0.75×N              // 一个周期：练功 1h + 炼体 B×1h + N 个百艺×45m
 *   k = floor(L / C)                // 完整周期数
 *   r = L − k×C                     // 余时，按队列顺序补整轮
 *
 * 返回的 `rounds` 按任务 kind 记（practice / body / forge / alchemy …）。
 * 百艺的 kind 取自 `arts.js`，不在这里写死。
 */
export const expectedRounds = ({
  patrolHours = DAY_TUNING.patrol.defaultHours,
  bodyEnabled = false,
  arts = []
} = {}) => {
  const queue = ['practice', ...(bodyEnabled ? ['body'] : []), ...(arts || [])]
  const durations = queue.map(kind => (kind === 'practice' || kind === 'body' ? 1 : 0.75))
  const cycleHours = durations.reduce((sum, h) => sum + h, 0) || 1
  const loopHours = loopHoursOf(patrolHours)
  const fullCycles = Math.floor(loopHours / cycleHours)
  const restHours = loopHours - fullCycles * cycleHours

  const rounds = {}
  let cursor = 0
  for (let i = 0; i < queue.length; i += 1) {
    const kind = queue[i]
    cursor += durations[i]
    // 队列里每个 kind 只出现一次，所以直接累加即可
    rounds[kind] = (rounds[kind] || 0) + fullCycles + (restHours >= cursor ? 1 : 0)
  }

  return {
    loopHours,
    cycleHours,
    fullCycles,
    restHours,
    rounds,
    practiceRounds: rounds.practice || 0,
    bodyRounds: rounds.body || 0
  }
}

// ---------- 累加器 ----------

/**
 * 为一个工作日建累加器。
 * `snapshot` 是**日初**的读数（境界、速率、契合度、子嗣加成……），计划值全部由它推导。
 */
export const createAccumulator = ({ workDayIndex = 0, gameTime = 0, snapshot = {} } = {}) => ({
  version: 1,
  workDayIndex,
  startedAt: num(gameTime),
  lastAt: num(gameTime),
  snapshot: { ...snapshot },
  spirit: 0,
  cultivation: 0,
  bodyCultivation: 0,
  proficiencySeconds: 0,
  staminaSpent: 0,
  staminaRecovered: 0,
  focusDelta: 0,
  hours: {},
  meditations: 0,
  bodyMeditations: 0
})

/** 练功切片：灵力产出 + 功法熟练度（同一次 `gainSpirit` 调用） */
export const noteSpirit = (acc, amount, seconds = 0) => {
  if (!acc) return
  acc.spirit += Math.max(num(amount), 0)
  acc.proficiencySeconds += Math.max(num(seconds), 0)
}

/** 打坐：修为 / 体魄（`gained` 是掷出来的原始收益，突破清零不影响这里） */
export const noteCultivation = (acc, { inner = 0, outer = 0, innerTimes = 0, outerTimes = 0 } = {}) => {
  if (!acc) return
  acc.cultivation += Math.max(num(inner), 0)
  acc.bodyCultivation += Math.max(num(outer), 0)
  acc.meditations += Math.max(num(innerTimes), 0)
  acc.bodyMeditations += Math.max(num(outerTimes), 0)
}

/** 体力：正数回、负数耗（调用方传**实际生效量**，不是原始量） */
export const noteStamina = (acc, delta) => {
  if (!acc) return
  const d = num(delta)
  if (d < 0) acc.staminaSpent += -d
  else acc.staminaRecovered += d
}

/** 切片：按 kind 累计小时数与精力变化（练功/炼体/巡视/睡觉/百艺都走这里） */
export const noteSlice = (acc, { kind, gameSeconds, focusDelta = 0 } = {}) => {
  if (!acc || !kind) return
  const hours = Math.max(num(gameSeconds), 0) / 3600
  acc.hours[kind] = (acc.hours[kind] || 0) + hours
  acc.focusDelta += num(focusDelta)
}

// ---------- 计划值：产出 ----------

/**
 * 按日初快照算计划产出。返回的字段与 `buildDayRecord` 里的 actual 一一对应。
 *
 * 修为的计划是**理论打坐吞吐**：
 *   灵力量 / 打坐成本，且每小时最多 `meditationPerHour` 次。
 * 内功与外功按各自的「可打坐次数上限」比例分配灵力（两条线共用同一个灵力池）。
 */
export const expectedOutputs = snapshot => {
  const s = snapshot || {}
  const plan = expectedRounds({
    patrolHours: s.patrolHours,
    bodyEnabled: s.bodyEnabled,
    arts: s.arts
  })

  const rate = Math.max(num(s.rate), 0)
  const spirit = rate * plan.practiceRounds

  const level = Math.max(Math.floor(num(s.level) || 1), 1)
  const bodyLevel = Math.max(Math.floor(num(s.bodyLevel) || 1), 1)
  const perHour = DEBUG_TUNING.meditationPerHour
  const innerCap = perHour * plan.practiceRounds
  const outerCap = perHour * plan.bodyRounds
  const capSum = innerCap + outerCap
  const innerSpirit = capSum > 0 ? (spirit * innerCap) / capSum : 0
  const outerSpirit = capSum > 0 ? (spirit * outerCap) / capSum : 0

  const innerCost = Math.max(getCultivationCost(level), 1)
  const outerCost = Math.max(getCultivationCost(bodyLevel), 1)
  // 翻倍期望：`rollCultivationGain` 用 `random < 0.3×luck`，概率天然封顶 1
  const luck = Math.max(num(s.luck) || 1, 0)
  const doubleFactor = 1 + Math.min(EXTRA_GAIN_CHANCE * luck, 1)
  const innerGain = getCultivationGain(level) * doubleFactor * (1 + Math.max(num(s.shrineBonus), 0))
  const outerGain = getCultivationGain(bodyLevel) * doubleFactor

  const innerTimes = Math.min(innerCap, innerSpirit / innerCost)
  const outerTimes = Math.min(outerCap, outerSpirit / outerCost)

  const stamina =
    Math.max(num(s.patrolHours), 0) * DAY_TUNING.patrol.staminaPerHour +
    plan.practiceRounds * DAY_TUNING.practice.staminaPerHour +
    plan.bodyRounds * DAY_TUNING.body.staminaPerHour +
    (s.arts || []).reduce(
      (sum, kind) => sum + (plan.rounds[kind] || 0) * 0.75 * (ARTS_TUNING.staminaPerHour[kind] || 0),
      0
    )

  return {
    plan,
    spirit,
    cultivation: innerTimes * innerGain,
    bodyCultivation: outerTimes * outerGain,
    innerTimes,
    outerTimes,
    proficiencyPct: plan.practiceRounds / DEBUG_TUNING.designProfHoursPerPercent / 100,
    stamina
  }
}

// ---------- 汇总一条日记录 ----------

/**
 * 把累加器 + 日末读数变成一条可序列化的日记录。
 *
 * @param acc    `createAccumulator` 的产物
 * @param ctx.playerName 道号（一个 log 文件可能混过多个存档）
 * @param ctx.now        日末读数：level / bodyLevel / rate / harmony / nextGateRequirement /
 *                       nextGateGap / isBreakthroughBlocked / isLandTierSufficient /
 *                       childrenRaw / childrenBonus
 * @param ctx.partial    true = 中途启用/中途离开，这一条不完整
 * @param ctx.coveredDays 覆盖了几个工作日（正常换日 = 1）
 * @param ctx.reason      'day' | 'disable' | 'mode' | 'manual'
 */
export const buildDayRecord = (acc, ctx = {}) => {
  const s = acc?.snapshot || {}
  const now = ctx.now || {}
  const exp = expectedOutputs(s)
  const ratio = (actual, expected) => (expected > 0 ? round(actual / expected, 3) : null)

  // 中途开启：累加器从半路开始，计划值却是按整日算的 —— 标成 partial，
  // 免得玩家把「只记了半天」误读成「产出不达标」。
  // 2 游戏小时的容差：时钟 tick 一次最多推进 1.25 游戏小时，正常开工不会误判。
  // 新档 0 点等天亮（startedAt < 06:00）不算迟到。
  const dayStart = dayStartOf(num(acc?.startedAt))
  const lateStart = num(acc?.startedAt) > Math.max(dayStart, WAKE_HOUR * 3600) + 2 * 3600

  const hours = Object.fromEntries(
    Object.entries(acc?.hours || {}).map(([kind, h]) => [kind, round(h, 3)])
  )
  // 熟练度按 `accumulatePractice` 真正收到的秒数算，不按切片小时数 ——
  // 两者在正常路径上相等，但秒数是**产出侧**的直接证据（切片还包含非练功段）。
  const proficiencyHours = num(acc?.proficiencySeconds) / 3600
  const actualProfPct = proficiencyHours / DEBUG_TUNING.codeProfHoursPerPercent / 100

  return {
    v: acc?.version || 1,
    kind: 'day',
    player: String(ctx.playerName || ''),
    day: num(acc?.workDayIndex),
    label: `第 ${num(acc?.workDayIndex) + 1} 日`,
    reason: ctx.reason || 'day',
    partial: !!ctx.partial || lateStart,
    lateStart,
    coveredDays: Math.max(1, Math.floor(num(ctx.coveredDays) || 1)),
    startedAt: num(acc?.startedAt),
    endedAt: num(ctx.endedAt),
    level: { start: num(s.level), end: num(now.level) },
    bodyLevel: { start: num(s.bodyLevel), end: num(now.bodyLevel) },
    rate: { start: round(s.rate), end: round(now.rate) },
    hours,
    expectedHours: exp.plan.rounds,
    spirit: {
      actual: round(acc?.spirit),
      expected: round(exp.spirit),
      ratio: ratio(num(acc?.spirit), exp.spirit)
    },
    cultivation: {
      actual: round(acc?.cultivation),
      expected: round(exp.cultivation),
      ratio: ratio(num(acc?.cultivation), exp.cultivation),
      meditations: num(acc?.meditations)
    },
    bodyCultivation: {
      actual: round(acc?.bodyCultivation),
      expected: round(exp.bodyCultivation),
      ratio: ratio(num(acc?.bodyCultivation), exp.bodyCultivation),
      meditations: num(acc?.bodyMeditations)
    },
    proficiency: {
      actualPct: round(actualProfPct, 5),
      expectedPct: round(exp.proficiencyPct, 5),
      ratio: ratio(actualProfPct, exp.proficiencyPct),
      codeHoursPerPercent: DEBUG_TUNING.codeProfHoursPerPercent,
      designHoursPerPercent: DEBUG_TUNING.designProfHoursPerPercent
    },
    stamina: {
      spent: round(acc?.staminaSpent),
      recovered: round(acc?.staminaRecovered),
      expectedSpent: round(exp.stamina)
    },
    focus: { delta: round(acc?.focusDelta) },
    children: {
      rawStart: round(s.childrenRaw),
      cappedStart: round(s.childrenBonus),
      rawEnd: round(now.childrenRaw),
      cappedEnd: round(now.childrenBonus)
    },
    gate: {
      requirement: round(now.nextGateRequirement, 4),
      harmony: round(now.overallHarmony, 4),
      gap: round(now.nextGateGap, 4),
      blocked: !!now.isBreakthroughBlocked,
      landOk: !!now.isLandTierSufficient
    }
  }
}

/** 一行人类可读摘要（GM 页的「最近一条」与 console 用） */
export const formatRecord = record => {
  if (!record) return ''
  const pct = value => (value == null ? '—' : `${Math.round(value * 100)}%`)
  const gate = record.gate?.requirement > 0
    ? `门槛 ${record.gate.harmony}/${record.gate.requirement}${record.gate.blocked ? ' ✗' : ' ✓'}`
    : '无门槛'
  return [
    record.label,
    `练功 ${record.hours?.practice ?? 0}h/计划 ${record.expectedHours?.practice ?? 0}h`,
    `灵力 ${record.spirit?.actual}/${record.spirit?.expected} (${pct(record.spirit?.ratio)})`,
    `修为 ${record.cultivation?.actual}/${record.cultivation?.expected} (${pct(record.cultivation?.ratio)})`,
    `熟练度 ${record.proficiency?.actualPct}/${record.proficiency?.expectedPct} (${pct(record.proficiency?.ratio)})`,
    gate
  ].join(' · ')
}

/** JSONL 一行 */
export const toJsonLine = record => JSON.stringify(record)
