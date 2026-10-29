// 「桂冈的一天」纯函数断言 —— 与 verify-harmony.mjs 同一套风格，零依赖、秒出。
//
// 为什么单独一个脚本而不是塞进 verify-harmony.mjs：那一份聚焦契合度与模块二的数值，
// 这一份聚焦**时间推进**。分开跑，改哪边跑哪边。
//
// ⚠ 全部断言都靠 `stepDay` 硬造 tick 推进，不做统计断言（会 flaky）。

import {
  TUNING,
  WAKE_HOUR,
  OFF_WORK_HOUR,
  buildLoopQueue,
  queueTaskAt,
  workDayOf,
  dayStartOf,
  nextWakeTime,
  createDayState,
  createDayTotals,
  freezeDayReport,
  stepDay,
  currentTaskView,
  scheduleView,
  daySummaryOf,
  patrolHoursOfDay,
  setPatrolHours,
  setBodyEnabled,
  setArtsSelected,
  requestInterrupt,
  requestStopInteracting
} from '../src/plugins/dayLoop.js'
import { energyMaxOf } from '../src/plugins/innerCourt.js'
import { formatCountdown, formatDuration } from '../src/plugins/dayDate.js'
import {
  advance,
  clockState,
  GAME_STEP_SECONDS,
  ASCENDED_TIME_SCALE,
  setAscendedClock,
  isAscendedClock,
  secondsPerGameHourOf,
  realSecondsPerGameDayOf
} from '../src/plugins/gameClock.js'
import { isAscendedLevelOf } from '../src/plugins/realm.js'
import { RECIPES, buildCraftedItem, rollRecipe } from '../src/plugins/arts.js'
import {
  DEBUG_TUNING,
  loopHoursOf,
  expectedRounds,
  expectedOutputs,
  createAccumulator,
  noteSpirit,
  noteCultivation,
  noteStamina,
  noteSlice,
  buildDayRecord,
  formatRecord
} from '../src/plugins/debugLog.js'

const H = 3600
const DAY = 86400
const T0 = 3 * DAY + WAKE_HOUR * H // 第 3 个工作日的 06:00

let failures = 0
let skipped = 0
const results = []
const labels = []
const FILTER = (process.env.VERIFY_FILTER || '').toLowerCase()
const LIST = process.argv.includes('--list')

const eq = (a, b) => {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-6
  return a === b
}

const check = (label, actual, expected) => {
  if (FILTER && !label.toLowerCase().includes(FILTER)) {
    skipped += 1
    return
  }
  labels.push(label)
  if (LIST) return
  const ok = eq(actual, expected)
  if (!ok) failures += 1
  results.push({ ok, label, actual, expected })
}

// ---------- 跑一整天，收集切片 ----------
const simulate = ({ patrolHours = 2, bodyEnabled = false, arts = ['forge'], stamina0 = 145, idleWifeCount = 3, hours = 24, tickSeconds = 900 } = {}) => {
  const staminaMax = 145
  // 默认带炼器，与游戏默认（arts.selected = ['forge']）一致
  let s = createDayState({ nowSeconds: T0, patrolHours, bodyEnabled, arts, focus: TUNING.focusMax })
  let stamina = stamina0
  const byKind = {}
  const phases = []
  const pending = []
  const start = T0
  const startWorkDay = workDayOf(T0)
  // 换日会把当日计数清零，所以**每天都快照一次**，最后取的那份就是当天的收尾值
  let dayCounters = s.counters
  for (let t = start; t <= start + hours * H; t += tickSeconds) {
    const r = stepDay(s, t, { stamina, staminaMax, idleWifeCount })
    s = r.state
    for (const sl of r.slices) {
      const k = sl.kind
      byKind[k] = byKind[k] || { h: 0, stamina: 0, focus: 0, slices: 0 }
      byKind[k].h += sl.gameSeconds / H
      byKind[k].stamina += sl.staminaDelta
      byKind[k].focus += sl.focusDelta
      byKind[k].slices += 1
      byKind[k].spirit = byKind[k].spirit || !!sl.spirit
      stamina = Math.min(Math.max(stamina + sl.staminaDelta, 0), staminaMax)
    }
    for (const p of r.pending) pending.push(p)
    if (s.workDayIndex === startWorkDay) dayCounters = s.counters
    const key = s.phase + (s.phase === 'loop' ? '#' + s.taskKind : '')
    if (phases[phases.length - 1] !== key) phases.push(key)
  }
  return { state: s, dayCounters, stamina, byKind, phases, pending, staminaMax }
}

// ---------- 1. 时间换算 ----------
check('工作日边界是 06:00（不是 00:00）', workDayOf(T0), 3)
check('00:30 仍属前一天的工作日', workDayOf(3 * DAY + 1800), 2)
check('dayStartOf 落在当天 06:00', dayStartOf(T0), T0)
check('次日 06:00 = 今天 + 一天', nextWakeTime(T0), T0 + DAY)

// ---------- 1b. 新档首日：先等天亮，再正常开工 ----------
{
  // 游戏时间 0 是 00:00，比第一个 06:00 还早。这几天不能「夹到 00:00 开工」
  // （那会让首日变成 00:00 开工、12:00 下班、睡 16 小时）。
  const s0 = createDayState({ nowSeconds: 0 })
  check('新档首日先「等天亮」', s0.phase, 'idle')
  check('新档首日的 06:00 就是日程起点', s0.dayStartSeconds, WAKE_HOUR * H)
  const s6 = stepDay(s0, WAKE_HOUR * H, { stamina: 145, staminaMax: 145, idleWifeCount: 0 }).state
  check('到 06:00 转巡视', s6.phase, 'patrol')
  check('首日巡视也是 2 小时', s6.taskDurationSeconds, 2 * H)
  const s9 = stepDay(s6, WAKE_HOUR * H + 3 * H, { stamina: 145, staminaMax: 145, idleWifeCount: 0 }).state
  check('首日小循环从 08:00 开始（不是 02:00）', s9.phase, 'loop')
}

// ---------- 1c. 读档/刷新：按当日时刻接上，而不是永远从巡视开始（2026-10-22）----------
{
  const noon = createDayState({ nowSeconds: T0 + 6 * H, patrolHours: 2, arts: ['forge'] })
  check('12:00 刷新 → 小循环（不是巡视）', noon.phase, 'loop')
  check('12:00 接到练功轮次', noon.taskKind, 'practice')
  check('12:00 的剩余时长不超过一轮', noon.taskDurationSeconds <= H, true)
  const night = createDayState({ nowSeconds: T0 + 20 * H, patrolHours: 2 })
  check('凌晨 2:00 刷新 → 睡觉', night.phase, 'sleep')
  check('凌晨睡觉睡到次日 06:00', night.taskDurationSeconds, 4 * H)
}

// ---------- 1d. 巡视中途改时长 / 读档接手中途轮次（P51 #9，2026-10-26）----------
{
  // 读档落在巡视中途：起点锚在 06:00，进度按已走的那一段算
  const mid = createDayState({ nowSeconds: T0 + 1.5 * H, patrolHours: 2 })
  check('巡视中途读档：起点仍是当日 06:00', mid.taskStartSeconds, T0)
  check('巡视中途读档：结束时刻 = 06:00 + 2h', mid.patrolEndSeconds, T0 + 2 * H)

  // ★ 巡视中途把时长拖到 1 小时：结束时刻按「06:00 + 1h」重锚，而不是「接手时刻 + 1h」
  const shortened = setPatrolHours(mid, 1)
  check('★巡视中途拖到 1h：结束时刻 = 07:00（不是 07:30 + 1h）', shortened.patrolEndSeconds, T0 + H)
  const afterPatrol = stepDay(shortened, T0 + 1.75 * H, { stamina: 145, staminaMax: 145, idleWifeCount: 0 }).state
  check('★拖短后巡视立刻结束、直接进小循环', afterPatrol.phase, 'loop')
  check('★小循环从接手时刻起排（不是 07:30 + 1h）', afterPatrol.taskStartSeconds, T0 + 1.5 * H)

  // 读档落在小循环中途（09:49 的炼体轮 09:00–10:00）：进度 82%、剩余 11 分
  const t949 = T0 + 3 * H + 49 * 60
  const midRound = createDayState({ nowSeconds: t949, patrolHours: 2, bodyEnabled: true, arts: [] })
  const view = currentTaskView(midRound, t949)
  check('09:49 读档落在炼体轮', midRound.taskKind, 'body')
  check('★本轮起点锚回 09:00（不是接手时刻）', midRound.taskStartSeconds, T0 + 3 * H)
  check('★本轮剩余仍是 11 分钟', Math.round(view.remainingSeconds / 60), 11)
  check('★进度条反映已走的 49 分钟（82%）', view.progressPct, 82)
  check('★任务卡能写出「本轮 1 小时」', view.totalSeconds, H)

  // 巡视已经跑完之后再拖滑杆：只改明天，今日安排仍显示实际跑过的 2 小时
  const noon = createDayState({ nowSeconds: T0 + 6 * H, patrolHours: 2 })
  const longer = setPatrolHours(noon, 5)
  check('跑完巡视后拖到 5h：今天不补跑', longer.patrolEndSeconds, T0 + 2 * H)
  check('今日安排仍写「巡视乡间（2 小时）」', scheduleView(longer, T0 + 6 * H)[1].label, '巡视乡间（2 小时）')
  check('今日安排里巡视是已完成', scheduleView(longer, T0 + 6 * H)[1].status, 'done')
  check('明天的偏好已记为 5 小时', longer.patrolHours, 5)
  check('patrolHoursOfDay 按快照算（2 小时）', patrolHoursOfDay(longer), 2)

  // ★ Q8（2026-10-26 落地）：小循环 = 06:00 + S，巡视一结束就开工，没有候工段
  const oneHour = createDayState({ nowSeconds: T0, patrolHours: 1 })
  const atSeven = stepDay(oneHour, T0 + H, { stamina: 145, staminaMax: 145, idleWifeCount: 0 }).state
  check('★巡视 1h → 07:00 直接进小循环（不是等到 08:00）', atSeven.phase, 'loop')
  check('★巡视 1h → 小循环首轮起点 = 07:00', atSeven.taskStartSeconds, T0 + H)
  const rowsOne = scheduleView(atSeven, T0 + H)
  check('巡视 1h → 今日安排第 2 行就是小循环（无候工行）', rowsOne[2].key, 'loop-0')
  check('调试口径：巡视 1h → 小循环 11 小时', loopHoursOf(1), 11)
}

// ---------- 2. 小循环队列（《桂冈的一天》§3.1/§3.2）----------
check('0 百艺 / 不勾炼体 → 队列只有练功', buildLoopQueue({ bodyEnabled: false, arts: [] }).join(','), 'practice')
check('勾炼器 → 练功/炼器交替', buildLoopQueue({ bodyEnabled: false, arts: ['forge'] }).join(','), 'practice,forge')
check('勾了炼体（0 百艺）→ 练功/炼体交替', buildLoopQueue({ bodyEnabled: true, arts: [] }).join(','), 'practice,body')
check('炼体 + 炼器 → 练功/炼体/炼器', buildLoopQueue({ bodyEnabled: true, arts: ['forge'] }).join(','), 'practice,body,forge')
check('队列取模（i=2）', queueTaskAt(['practice', 'body'], 2), 'practice')
check('队列取模（i=3）', queueTaskAt(['practice', 'body'], 3), 'body')

// ---------- 3. 默认的一天：阶段轨迹 ----------
// 默认勾选炼器 → 练功 1h + 炼器 45m 交替；18:00 前开出的最后一轮会跑到 18:30
const base = simulate({})
// 0 百艺基线：保留一组「10 小时全练功」的断言，防止以后把 0 百艺算错
const noArts = simulate({ arts: [] })
check('默认天阶段轨迹（开始）', base.phases.slice(0, 3).join(' → '), 'patrol → loop#practice → loop#forge')
check(
  '默认天有晚间与睡觉，且顺序正确',
  base.phases.indexOf('evening') >= 0 && base.phases.indexOf('sleep') > base.phases.indexOf('evening'),
  true
)
check('默认 1 百艺 → 练功 6 小时（6 轮）', base.byKind.practice.h, 6)
check('默认 1 百艺 → 炼器 4.5 小时（6 轮）', base.byKind.forge.h, 4.5)
check('0 百艺基线 → 练功仍是 10 小时', noArts.byKind.practice.h, 10)
check('0 百艺基线 → 没有炼器段', noArts.byKind.forge, undefined)
check('巡视 2 小时（06:00→08:00，正好接上小循环）', base.byKind.patrol.h, 2)
check('巡视 2h 不产生空档', base.byKind.idle, undefined)
check('没有炼体段', base.byKind.body, undefined)
check('练功计数 6 轮', base.dayCounters.practice, 6)
check('炼器计数 6 轮', base.dayCounters.forge, 6)
check('练功时长统计 6 游戏小时', daySummaryOf({ counters: base.dayCounters }).spiritHours, 6)
check('今日统计带炼器轮次', daySummaryOf({ counters: base.dayCounters }).forge, 6)

// ---------- 4. 各环节的消耗（《桂冈的一天》§2.1/§2.2）----------
check('巡视 体力 −10/h', base.byKind.patrol.stamina, -20)
check('练功 体力 −3/h', base.byKind.practice.stamina, -18)
check('练功 精力 +10/h', base.byKind.practice.focus, 60)
check('炼器 体力 −6/h（6 轮 × 45m）', base.byKind.forge.stamina, -27)
check('★炼器 精力 −35/天（只扣一次，不是每轮）', base.byKind.forge.focus, -35)
check('睡觉 精力 +5/h', base.byKind.sleep.focus, base.byKind.sleep.h * 5)
check('睡觉 体力 +上限/4 每小时', base.byKind.sleep.stamina, (base.byKind.sleep.h * 145) / 4)
check('一整天后体力回满', base.stamina, 145)

// ---------- 5. 晚间与睡觉 ----------
// 一次互动 = 30 分钟；晚间 n 次 → 睡觉 = 至次日 06:00 的剩余
check('晚间发了 pending', base.pending.length, 1)
check('互动人数 = min(floor((80−30)/15), 侍妾数 3) = 3', base.pending[0].count, 3)

// 8 位待孕时仍只排 3 人 —— 这条钉住「自动模式留 30 体力」的预留；
// 如果以后删掉 reserve，会变成 min(floor(80/15), 8) = 5，这条会红。
const manyWives = simulate({ idleWifeCount: 8 })
check('★8 位待孕仍只排 3 人（30 点自动预留生效）', manyWives.pending[0].count, 3)

// ---------- 5b. 灵力只在练功段产出（门控），打坐次数受限速 ----------
{
  const all = simulate({ bodyEnabled: true })
  const spiritKinds = Object.entries(all.byKind).filter(([, v]) => v.spirit).map(([k]) => k)
  check('★只有练功段产灵力', spiritKinds.join(','), 'practice')
  check('★打坐限速：一个练功小时最多 60 次', Math.floor(H / TUNING.practice.meditationSeconds), 60)
  check('★打坐限速存在且 > 0（防老档灵力被一个切片抽干）', TUNING.practice.meditationSeconds > 0, true)
}

// ---------- 5c. 任务汇总（流水账按它记一条带结算结果的行）----------
{
  // 一个练功轮 = 1 游戏小时 = 4 个 tick。4 个 tick 跑完应该只汇总出**一条 1 小时**，
  // 而不是四条 0.25 小时 —— 累加器放在 store 的函数体里就会犯这个错。
  // 精力故意从 50 起 —— 开局是满的，满的时候有效增量是 0，测不出「恢复被记上了」
  let s = createDayState({ nowSeconds: T0, patrolHours: 2, focus: 50 })
  const got = []
  s = stepDay(s, T0 + 2 * H, { stamina: 145, staminaMax: 145, idleWifeCount: 0 }).state
  for (let i = 1; i <= 4; i++) {
    const r = stepDay(s, T0 + 2 * H + i * 900, { stamina: 145, staminaMax: 145, idleWifeCount: 0 })
    s = r.state
    got.push(...r.completions)
  }
  check('★一个练功轮只汇总出一条（不是每 tick 一条）', got.length, 1)
  check('★汇总的是整轮 1 小时（不是单片 0.25）', got[0].hours, 1)
  check('汇总标了练功', got[0].kind, 'practice')
  check('汇总带「产灵力的秒数」', got[0].spiritSeconds, 3600)
  check('汇总的体力消耗 = 一轮 −3', got[0].staminaDelta, -3)
  check('汇总的精力恢复 = 一轮 +10', got[0].focusDelta, 10)
}

{
  // ⚠ 汇总的是**实际生效**的量：睡一整夜（≈9 游戏小时）的原始恢复量是 9 × 36.25 ≈ 326，
  //   但体力上限只有 145 —— 报 326 就是在骗人。这里必须夹住。
  const s = createDayState({ nowSeconds: T0, patrolHours: 2, focus: 100 })
  const r = stepDay(s, T0 + 24 * H, { stamina: 145, staminaMax: 145, idleWifeCount: 0 })
  const sleep = r.completions.find(c => c.kind === 'sleep')
  check('★睡觉那一夜出现在汇总里', !!sleep, true)
  check('★睡觉汇总的体力恢复夹在上限内（原始量 9×36.25 ≈ 326）', sleep.staminaDelta <= 145, true)
  check('★睡觉汇总的体力恢复确实发生了（> 0）', sleep.staminaDelta > 0, true)
}

// ---------- 6. 切片按**任务边界**切，不按 tick ----------
{
  // 巡视 2h → 06:00–08:00 是巡视，08:00 起小循环。
  // 先把状态正常推到 07:30，再用**一个 1.25 游戏小时的 tick** 跨过 08:00 那条边界
  // （1.25h = MAX_TICK_REAL_SECONDS(5) × SECONDS_PER_GAME_HOUR(0.25)，是最坏情况）。
  const s = createDayState({ nowSeconds: T0, patrolHours: 2 })
  const ctx = { stamina: 100, staminaMax: 145, idleWifeCount: 0 }
  const s730 = stepDay(s, T0 + 1.5 * H, ctx).state
  const r = stepDay(s730, T0 + 1.5 * H + 4500, ctx)
  check('跨边界 tick 被切成两片', r.slices.length, 2)
  check('两片时长之和 = 整个 tick', r.slices.reduce((a, x) => a + x.gameSeconds, 0), 4500)
  check('第一片落在巡视（07:30→08:00）', r.slices[0].kind, 'patrol')
  check('第一片 30 分钟', r.slices[0].gameSeconds, 1800)
  check('第二片落在练功（08:00→08:45）', r.slices[1].kind, 'practice')
  check('第二片 45 分钟', r.slices[1].gameSeconds, 2700)
  check('★巡视那一轮被完整汇总（2 小时，不是半截）', r.completions[0].hours, 2)
}

// ---------- 7. 勾了炼体：练功轮次减半 ----------
// 队列 = 练功 1h + 炼体 1h + 炼器 45m = 2h45m；08:00 起跑 3 个完整周期后收在 18:15
const withBody = simulate({ bodyEnabled: true })
check('勾炼体 → 练功 4 小时', withBody.byKind.practice.h, 4)
check('勾炼体 → 炼体 4 小时', withBody.byKind.body.h, 4)
check('勾炼体 → 炼体计数 4 轮', withBody.dayCounters.body, 4)
check('勾炼体 体力 −15/h', withBody.byKind.body.stamina, -60)
check('勾炼体 + 炼器 → 炼器 3 轮', withBody.dayCounters.forge, 3)

// ---------- 8. 巡视 5 小时：小循环变短 ----------
// 11:00–18:00 共 7 小时 = 4 个完整周期（练功 1h + 炼器 45m）
const longPatrol = simulate({ patrolHours: 5 })
check('巡视 5 小时', longPatrol.byKind.patrol.h, 5)
check('巡视 5h → 练功只剩 4 小时', longPatrol.byKind.practice.h, 4)
check('巡视 5h → 炼器 4 轮', longPatrol.dayCounters.forge, 4)
check('巡视 5h 体力 −50', longPatrol.byKind.patrol.stamina, -50)

// ---------- 9. 体力见底 → 跳过晚间直接睡（§4.1 场景 D）----------
const tired = simulate({ bodyEnabled: true, stamina0: 60 })
check('体力只有 60 → 不进晚间', tired.pending.length, 0)
check('体力只有 60 → 直接睡', tired.phases.includes('sleep'), true)

// ---------- 10. 没有侍妾 → 晚间颗粒无收 ----------
check('没有侍妾 → 不发 pending', simulate({ idleWifeCount: 0 }).pending.length, 0)

// ---------- 11. 玩家介入 ----------
{
  const s0 = createDayState({ nowSeconds: T0, patrolHours: 2 })
  check('调巡视时长夹到 1~5', setPatrolHours(s0, 9).patrolHours, 5)
  check('调巡视时长夹下界', setPatrolHours(s0, 0).patrolHours, 1)
  check('勾选炼体会即时换队列', setBodyEnabled(s0, true).bodyEnabled, true)
  const afterInterrupt = requestInterrupt(s0)
  check('打断循环置位', afterInterrupt.endedByPlayer, true)
  check('提前停止互动置位', requestStopInteracting(s0).stopInteracting, true)
}
{
  // 打断循环 → 做完手上这轮就下班
  const interrupted = simulate({ hours: 24 })
  check('（对照）不打断时晚间会发 pending', interrupted.pending.length, 1)
}

// ---------- 12. 视图 ----------
{
  // 视图要读**推进过**的状态（推进到 09:30 = 第 1 轮炼器中途）
  const at = T0 + 3.5 * H
  let s = createDayState({ nowSeconds: T0, patrolHours: 2, arts: ['forge'] })
  s = stepDay(s, at, { stamina: 145, staminaMax: 145, idleWifeCount: 3 }).state
  const tv = currentTaskView(s, at)
  check('任务视图是炼器（09:00–09:45）', tv.kind, 'forge')
  check('任务视图 67% 进度（30/45 分钟）', tv.progressPct, 67)
  const rows = scheduleView(s, at)
  check('日程含晨起', rows[0].key, 'wake')
  check('日程含巡视', rows[1].key, 'patrol')
  check('百艺不再有独立的占位行', rows.find(r => r.key === 'arts'), undefined)
  check('默认天共 16 行（晨起+巡视+12 循环+互动+睡觉）', rows.length, 16)
  check('第 1 轮已跑完', rows.find(r => r.key === 'loop-0').status, 'done')
  check('第 2 轮（炼器）进行中', rows.find(r => r.key === 'loop-1').status, 'doing')
  check('白天：妻妾互动是待办', rows.find(r => r.key === 'evening').status, 'todo')
}

// ---------- 12c. 睡觉阶段的状态图标（2026-10-18 用户报）----------
// 旧逻辑把 evening 的区间算到次日 06:00，整段睡眠都显示「互动进行中」。
{
  const ctx = { stamina: 145, staminaMax: 145, idleWifeCount: 3 }
  let s = createDayState({ nowSeconds: T0, patrolHours: 2, arts: ['forge'] })
  s = stepDay(s, T0 + 16 * H, ctx).state
  check('睡觉阶段：phase 是 sleep', s.phase, 'sleep')
  const rows = scheduleView(s, T0 + 16 * H)
  check('★睡觉阶段：妻妾互动是 done（绿勾）', rows.find(r => r.key === 'evening').status, 'done')
  check('★睡觉阶段：睡觉是 doing（循环）', rows.find(r => r.key === 'sleep').status, 'doing')
}

// ---------- 12b. 炼器的边界语义 ----------
{
  const ctx = { stamina: 145, staminaMax: 145, idleWifeCount: 0 }
  let s = createDayState({ nowSeconds: T0, patrolHours: 2, arts: ['forge'], focus: 20 })
  s = stepDay(s, T0 + 2 * H, ctx).state // 巡视
  s = stepDay(s, T0 + 3 * H, ctx).state // 练功 08:00–09:00（精力 20 → 30）
  check('低精力仍进入炼器（不预先跳过）', s.taskKind, 'forge')
  const r = stepDay(s, T0 + 3 * H + 2700, ctx) // 炼器 09:00–09:45
  check('炼器耗尽精力后仍完成本轮', r.completions.some(c => c.kind === 'forge'), true)
  check('炼器精力扣到 0（不是负数）', r.state.focus, 0)
  check('精力耗尽标记 earlyOff', r.state.earlyOff, true)
  check('下一任务是补打坐', r.state.taskKind, 'practice')
  const r2 = stepDay(r.state, T0 + 3 * H + 2700 + H, ctx)
  check('补打坐后提前下班', r2.state.phase, 'evening')
  check('当日炼器只计 1 轮', r2.state.counters.forge, 1)
  check('当日练功计 2 轮（含补打坐）', r2.state.counters.practice, 2)
}
check('换日重置「今天已扣精力」', JSON.stringify(base.state.artsFocusSpent), '{}')

// 产物形状：必须能被 Inventory.vue 直接渲染
{
  const item = buildCraftedItem(RECIPES[0], { seq: 1 })
  check('产物 type === slot（且是合法槽位）', item.type === item.slot && item.slot === 'accessory', true)
  check('产物带 qualityInfo（缺了背包会崩）', item.qualityInfo.name, '凡品')
  check('产物属性是配方里的占位值', item.stats.attack, RECIPES[0].stats.attack)
  check('产物 requiredRealm = 1', item.requiredRealm, 1)
  check(
    '同 tick 多轮产物 id 唯一',
    buildCraftedItem(RECIPES[0], { seq: 1 }).id !== buildCraftedItem(RECIPES[0], { seq: 2 }).id,
    true
  )
  check('随机配方只从已学里抽', rollRecipe(['su_jin_ring'], 'forge', () => 0.99).name, '素金戒指')
  check('没学配方返回 null', rollRecipe([], 'forge'), null)
  check(
    '勾选列表过滤掉未知艺',
    setArtsSelected(createDayState({ nowSeconds: T0, arts: ['forge'] }), ['forge', 'nope']).arts.join(','),
    'forge'
  )
}

// ---------- 13. 反向断言：体力上限的跳档（与《睡觉恢复》§五 对齐）----------
check('★炼体一层 = 基准 145', energyMaxOf(1), 145)
check('★炼体十层 = 172', energyMaxOf(10), 172)
check('★锻骨圆满 = 196', energyMaxOf(14), 196)
check('★洗髓圆满 = 232', energyMaxOf(18), 232)
check(
  '★一整天消耗 < 开局体力（巡视 + 练功 + 炼器）',
  base.byKind.patrol.stamina + base.byKind.practice.stamina + base.byKind.forge.stamina > -145,
  true
)
check('★巡视拉满 5h 仍有练功轮次', longPatrol.dayCounters.practice > 0, true)
check('★巡视越长小循环越短（5h 比 2h 少 2 小时练功）', base.byKind.practice.h - longPatrol.byKind.practice.h, 2)

// ---------- 14. 调试日志（P15.6）：计划值 / 达成率 ----------
// 计划轮次与《数值真值表》§4.3 的轮次表对齐；达成率是「实际 / 计划」。
check('调试：巡视 2h → 小循环 10h', loopHoursOf(2), 10)
check('调试：巡视 5h → 小循环 7h', loopHoursOf(5), 7)
check('调试：巡视 1h → 小循环 11 小时（Q8：6:00 + S）', loopHoursOf(1), 11)

const rNone = expectedRounds({ patrolHours: 2, bodyEnabled: false, arts: [] })
check('调试：不勾任何东西 → 练功 10 轮', rNone.practiceRounds, 10)
const rForge = expectedRounds({ patrolHours: 2, bodyEnabled: false, arts: ['forge'] })
check('调试：勾炼器 → 练功 6 轮', rForge.practiceRounds, 6)
check('调试：勾炼器 → 炼器 5 轮', rForge.rounds.forge, 5)
const rBody = expectedRounds({ patrolHours: 2, bodyEnabled: true, arts: [] })
check('调试：勾炼体 → 练功 5 轮', rBody.practiceRounds, 5)
check('调试：勾炼体 → 炼体 5 轮', rBody.bodyRounds, 5)
const rBoth = expectedRounds({ patrolHours: 2, bodyEnabled: true, arts: ['forge'] })
check('调试：炼体 + 炼器 → 练功 4 / 炼体 3 / 炼器 3', `${rBoth.practiceRounds}/${rBoth.bodyRounds}/${rBoth.rounds.forge}`, '4/3/3')
const rTwo = expectedRounds({ patrolHours: 2, bodyEnabled: false, arts: ['forge', 'alchemy'] })
check('调试：两种百艺 → 练功 4 轮', rTwo.practiceRounds, 4)
check('调试：两种百艺 → 每种 4 轮', `${rTwo.rounds.forge}/${rTwo.rounds.alchemy}`, '4/4')

const SNAP = {
  level: 1,
  bodyLevel: 1,
  rate: 12,
  luck: 1,
  shrineBonus: 0,
  patrolHours: 2,
  bodyEnabled: false,
  arts: ['forge']
}
const EXP = expectedOutputs(SNAP)
check('调试：计划灵力 = 速率 × 练功小时（12 × 6）', EXP.spirit, 72)
check('调试：计划修为 = min(360 次, 7.2 次) × 1 × 1.3', EXP.cultivation, 9.36)
check('调试：计划体力 = 巡视 20 + 练功 18 + 炼器 22.5', EXP.stamina, 60.5)
check('调试：设计熟练度 1%/50h（6h）', EXP.proficiencyPct, 0.0012)
check('调试：打坐上限 60 次/小时', DEBUG_TUNING.meditationPerHour, 60)

// B4a：炼体改药浴后**不再分灵力**，体魄计划 = 炼体轮次 × 该级 gain（满料理论值）
const EXP_BODY = expectedOutputs({ ...SNAP, bodyEnabled: true, arts: [] })
check('调试：勾炼体不再扣灵力（5 轮 × 12）', EXP_BODY.spirit, 60)
check('调试：计划体魄 = 5 轮 × L1 gain 26', EXP_BODY.bodyCultivation, 130)
check('调试：计划吸收次数 = 炼体轮次', EXP_BODY.outerTimes, 5)

const acc = createAccumulator({ workDayIndex: 3, gameTime: T0, snapshot: SNAP })
noteSpirit(acc, 72, 6 * H)
noteCultivation(acc, { inner: 9.36, innerTimes: 7.2 })
noteStamina(acc, -60.5)
noteSlice(acc, { kind: 'practice', gameSeconds: 6 * H, focusDelta: 60 })
noteSlice(acc, { kind: 'forge', gameSeconds: 5 * 0.75 * H, focusDelta: -35 })
const rec = buildDayRecord(acc, {
  playerName: '桂冈',
  endedAt: T0 + DAY,
  coveredDays: 1,
  partial: false,
  now: {
    level: 1,
    bodyLevel: 1,
    rate: 12,
    overallHarmony: 0.08,
    nextGateRequirement: 0.15,
    nextGateGap: 0.07,
    isBreakthroughBlocked: true,
    isLandTierSufficient: true,
    childrenRaw: 0,
    childrenBonus: 0
  }
})
check('调试：练功实际小时 = 6', rec.hours.practice, 6)
check('调试：灵力达成率 100%', rec.spirit.ratio, 1)
check('调试：修为达成率 100%', rec.cultivation.ratio, 1)
check('调试：熟练度达成率 100%（代码与设计都是 1%/50h）', rec.proficiency.ratio, 1)
check('调试：代码口径 = 设计口径（100h 的差已关闭）', rec.proficiency.codeHoursPerPercent, rec.proficiency.designHoursPerPercent)
check('调试：体力记录 = 60.5', rec.stamina.spent, 60.5)
check('调试：门槛被拦住', rec.gate.blocked, true)
check('调试：记录日标签 = 第 4 日', rec.label, '第 4 日')
check('调试：摘要含工作日与门槛', formatRecord(rec).includes('第 4 日') && formatRecord(rec).includes('门槛'), true)

// 反向断言：实际为 0 时达成率必须是 0（不是 1，也不是 null）
const emptyAcc = createAccumulator({ workDayIndex: 4, gameTime: T0, snapshot: SNAP })
const emptyRec = buildDayRecord(emptyAcc, { endedAt: T0 + DAY, now: {} })
check('★调试：什么都没干 → 灵力达成率 0', emptyRec.spirit.ratio, 0)
check('★调试：什么都没干 → 熟练度达成率 0', emptyRec.proficiency.ratio, 0)

// 中途开启必须标 partial，正常开工不能误判
check('调试：06:00 开工不算迟到', rec.partial, false)
const lateAcc = createAccumulator({ workDayIndex: 3, gameTime: T0 + 3 * H, snapshot: SNAP })
const lateRec = buildDayRecord(lateAcc, { endedAt: T0 + DAY, now: {} })
check('★调试：12:00 才开启 → 标记 partial', lateRec.partial, true)
check('★调试：12:00 才开启 → lateStart = true', lateRec.lateStart, true)

// ---------- 时长显示（15 游戏分档：与 tick 的 15 分步长对齐） ----------
// 采样相位任意时剩 52/37/22/7 分；向下取整到 15 分档后必须稳定为 45/30/15。
check('显示：剩余 52 分 → 45 分', formatCountdown(52 * 60), '45 分')
check('显示：剩余 37 分 → 30 分', formatCountdown(37 * 60), '30 分')
check('显示：剩余 22 分 → 15 分', formatCountdown(22 * 60), '15 分')
check('显示：剩余 7 分 → 不足 15 分', formatCountdown(7 * 60), '不足 15 分')
check('显示：1 小时轮满格 → 1 小时', formatCountdown(H), '1 小时')
check('显示：45 分轮满格 → 45 分', formatCountdown(45 * 60), '45 分')
check('显示：养伤 11 小时 52 分 → 11 小时 45 分', formatCountdown(12 * H - 8 * 60), '11 小时 45 分')
check('显示：0 秒 → 0 分', formatCountdown(0), '0 分')
check('显示：静态时长仍用 formatDuration（本轮 1 小时）', formatDuration(H), '1 小时')

// ---------- 时钟整步（15 游戏分）：tick 必须落在任务边界上 ----------
check('时钟：步长 = 900 游戏秒', GAME_STEP_SECONDS, 900)
clockState.currentTime = T0
check('时钟：1 现实秒 = 1 整步（亚秒零头不进游戏时间）', advance(1.004), 900)
check('时钟：tick 后仍在 15 分格点上', clockState.currentTime % GAME_STEP_SECONDS, 0)
check('时钟：1.6 现实秒 = 2 步', advance(1.6), 1800)
check('时钟：后台 5 秒钳制 = 5 步', advance(5), 4500)
clockState.currentTime = T0 + 480 // 老档 / 离线落点带 8 分钟零头
advance(1.004)
check('时钟：带零头的旧时间被对齐回 15 分格点', clockState.currentTime % GAME_STEP_SECONDS, 0)

// 1 小时轮必须正好 4 个 tick 结束：第 1/2/3 个 tick 剩 45/30/15 分，
// 第 4 个 tick 直接切到下一轮 —— 不再多出一档「不足 15 分」。
const clockCtx = { stamina: 145, staminaMax: 145, idleWifeCount: 0 }
let loopState = createDayState({ nowSeconds: T0, patrolHours: 2 })
loopState = stepDay(loopState, T0 + 2 * H, clockCtx).state
const loopStart = T0 + 2 * H
const remain = []
for (let i = 1; i <= 3; i += 1) {
  loopState = stepDay(loopState, loopStart + i * GAME_STEP_SECONDS, clockCtx).state
  remain.push(Math.round(currentTaskView(loopState, loopStart + i * GAME_STEP_SECONDS).remainingSeconds / 60))
}
check('时钟：1 小时轮第 1 个 tick 剩 45 分', remain[0], 45)
check('时钟：1 小时轮第 2 个 tick 剩 30 分', remain[1], 30)
check('时钟：1 小时轮第 3 个 tick 剩 15 分', remain[2], 15)
loopState = stepDay(loopState, loopStart + 4 * GAME_STEP_SECONDS, clockCtx).state
check('时钟：第 4 个 tick 直接切下一轮（不拖到第 5 个）', loopState.taskStartSeconds, loopStart + 4 * GAME_STEP_SECONDS)

// ---------- P55-b：筑基后 24×（时钟按境界读倍率）+ 昨日战报 ----------
check('24×：分界点 = 内功 11（筑基初期）', isAscendedLevelOf(11), true)
check('24×：练气十层还没到分界点', isAscendedLevelOf(10), false)
check('24×：练气期 1 现实秒 = 0.25 游戏小时', secondsPerGameHourOf(false), 0.25)
check('24×：筑基后 1 现实秒 = 6 游戏小时', secondsPerGameHourOf(true), 6)
check('24×：练气期 1 游戏天 = 96 现实秒', realSecondsPerGameDayOf(false), 96)
check('24×：筑基后 1 游戏天 = 4 现实秒', realSecondsPerGameDayOf(true), 4)
check('24×：倍率常量 = 24（365 ÷ 15）', ASCENDED_TIME_SCALE, 24)

clockState.currentTime = T0
check('24× 前：isAscendedClock = false', isAscendedClock(), false)
setAscendedClock(true)
check('24×：1 现实秒 = 24 整步 = 6 游戏小时', advance(1), 24 * GAME_STEP_SECONDS)
check('24×：仍然落在 15 分格点上', clockState.currentTime % GAME_STEP_SECONDS, 0)
advance(3)
check('24×：4 现实秒恰好走完一个游戏天', Math.round((clockState.currentTime - T0) / 900), 96)
setAscendedClock(false)
check('复位后回到练气期步长', advance(1), GAME_STEP_SECONDS)

/**
 * 24× 下的一天：tick 一步 6 游戏小时。**引擎照跑**（P55-b 拍板：UI 降级，产出口径不变），
 * 这里钉住「一天仍跑完巡视 + 小循环 + 睡觉，只是玩家看不见」。
 */
const baseDay = createDayState({ nowSeconds: T0, patrolHours: 2 }).workDayIndex
let fast = createDayState({ nowSeconds: T0, patrolHours: 2 })
const kinds24 = []
let cursor24 = T0
for (let i = 0; i < 8; i += 1) {
  cursor24 += 6 * H
  const r = stepDay(fast, cursor24, clockCtx)
  fast = r.state
  kinds24.push(...r.completions.map(c => c.kind))
}
check('24×：两天里巡视跑了 2 次', kinds24.filter(k => k === 'patrol').length, 2)
check('24×：两天里练功轮次 ≥ 12（小循环没被 24× 跳过）', kinds24.filter(k => k === 'practice').length >= 12, true)
check('24×：两天后工作日 +2', fast.workDayIndex - baseDay, 2)
check('24×：睡觉照常出现', kinds24.includes('sleep'), true)

// 昨日战报：纯函数只给形状与取整，数值由 store 写
const totals = createDayTotals()
totals.hours.practice = 8.04
totals.hours.forge = 0.75
totals.hours.sleep = 11
totals.cultivation = 12.34
totals.bodyCultivation = 3.04
totals.interact = 3
totals.products = ['a', 'b', 'c', 'd', 'e', 'f']
const report = freezeDayReport(totals, 36)
check('战报：日次原样带出', report.dayIndex, 36)
check('战报：小时数一位小数', report.hours.practice, 8)
check('战报：炼器小时保留', report.hours.forge, 0.8)
check('战报：睡觉也记（页面自己决定显不显示）', report.hours.sleep, 11)
check('战报：修为取一位小数', report.cultivation, 12.3)
check('战报：体魄取一位小数', report.bodyCultivation, 3)
check('战报：互动人数取整', report.interact, 3)
check('战报：出品最多留 5 条', report.products.join(','), 'b,c,d,e,f')
check('战报：0 小时的环节不进表', 'body' in report.hours, false)

// ---------- 输出 ----------
if (LIST) {
  for (const label of labels) console.log(`[LIST] ${label}`)
  console.log(`\n共 ${labels.length} 条断言${FILTER ? `（filter=${FILTER}）` : ''}`)
  process.exit(0)
}
const pad = (s, n) => String(s).padEnd(n)
const width = Math.max(...results.map(r => [...r.label].length)) + 2

console.log('\n「桂冈的一天」纯函数断言（《桂冈的一天》§一~§四 · 推进 / 消耗 / 边界）\n')
for (const r of results) {
  const mark = r.ok ? '  ok  ' : ' FAIL '
  console.log(`[${mark}] ${pad(r.label, width)} ${r.actual}`)
}
console.log(`\n${results.length - failures}/${results.length} 通过`)
if (failures > 0) {
  console.error(`\n${failures} 条断言失败\n`)
  process.exit(1)
}
console.log('全部通过 ✅\n')
