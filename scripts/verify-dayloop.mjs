// 「桂冈的一天」纯函数断言 —— 与 verify-harmony.mjs 同一套风格，零依赖、秒出。
//
// 为什么单独一个脚本而不是塞进 verify-harmony.mjs：那一份聚焦契合度与模块二的数值，
// 这一份聚焦**时间推进**。分开跑，改哪边跑哪边。
//
// ⚠ 全部断言都靠 `stepDay` 硬造 tick 推进，不做统计断言（会 flaky）。

import {
  TUNING,
  WAKE_HOUR,
  LOOP_START_HOUR,
  OFF_WORK_HOUR,
  buildLoopQueue,
  queueTaskAt,
  workDayOf,
  dayStartOf,
  nextWakeTime,
  createDayState,
  stepDay,
  currentTaskView,
  scheduleView,
  daySummaryOf,
  setPatrolHours,
  setBodyEnabled,
  setArtsSelected,
  requestInterrupt,
  requestStopInteracting
} from '../src/plugins/dayLoop.js'
import { energyMaxOf } from '../src/plugins/innerCourt.js'
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
check('调试：巡视 1h 不增加小循环（08:00 才开工）', loopHoursOf(1), 10)

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
