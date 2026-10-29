// 离线结算纯函数断言（《模块九》v2.1 · B2，上限 180 游戏天）
//
//   node scripts/verify-offline.mjs          完整输出
//   node scripts/verify-offline.mjs --list   只列标题
//   VERIFY_FILTER=换算 node scripts/verify-offline.mjs
//
// 只测纯函数层（`src/plugins/offlineSimulation.js`）与它驱动的探索/秘境纯函数。
// store 编排（`stores/modules/offline.js`）的断言放在本文件末尾的 mock 区。

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  OFFLINE_TUNING,
  OFFLINE_PHASES,
  GAME_SECONDS_PER_DAY,
  REAL_SECONDS_PER_GAME_DAY,
  REAL_SECONDS_PER_GAME_DAY_ASCENDED,
  offlineGameDaysOf,
  offlineGameSecondsOf,
  offlineCappedOf,
  offlinePhaseOfLevel,
  offlineRealSecondsPerGameDayOf,
  offlineMaxGameDaysOf,
  offlinePhasePlanOf,
  shouldSettleOffline,
  planOfflineWindows,
  createOfflineReport,
  absorbRewards,
  absorbObituary,
  obituaryCountsOf,
  addOfflineEvent,
  rewardsOfResolution,
  runOfflineExplorationSlice,
  createOfflineSecretRun,
  stepOfflineSecretRealmSegment,
  secretRunDaysOf
} from '../src/plugins/offlineSimulation.js'
import { TUNING as EXP_TUNING, createExplorationSession } from '../src/plugins/exploration.js'
import { locations } from '../src/plugins/locations.js'
import { MAX_TICK_REAL_SECONDS } from '../src/plugins/gameClock.js'
import { calibrationParty } from './lib/sim-party.mjs'
import { actions as offlineActions } from '../src/stores/modules/offline.js'

const H = 3600
const DAY = GAME_SECONDS_PER_DAY
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

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

/** 固定种子（mulberry32），保证重放可复现 */
const seeded = seed => () => {
  seed = (seed + 0x6d2b79f5) >>> 0
  let t = seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// ================= 一、换算与上限 =================
check('1 现实秒 = 1/96 游戏天', REAL_SECONDS_PER_GAME_DAY, 96)
check('96 现实秒 = 1 游戏天', offlineGameDaysOf(96), 1)
check('1 现实小时 = 37.5 游戏天', offlineGameDaysOf(3600), 37.5)
check('4.8 现实小时 = 180 游戏天（新上限）', offlineGameDaysOf(4.8 * 3600), 180)
check('练气上限 180 天（不是旧的 450）', OFFLINE_TUNING.maxGameDays.qi, 180)
check('超过上限仍返回 180', offlineGameDaysOf(12 * 3600), 180)
check('超过上限 → capped = true', offlineCappedOf(12 * 3600), true)
check('刚好 180 天 → capped = false', offlineCappedOf(4.8 * 3600), false)
check('0 现实秒 → 0 天', offlineGameDaysOf(0), 0)
check('负数现实秒 → 0 天', offlineGameDaysOf(-500), 0)
check('NaN 现实秒 → 0 天', offlineGameDaysOf('abc'), 0)

// ---------- 一之二、按境界两套（P55-c，双层时间） ----------
check('练气十层 = 练气相位', offlinePhaseOfLevel(10), OFFLINE_PHASES.QI)
check('筑基初期（11 级）= 筑基相位', offlinePhaseOfLevel(11), OFFLINE_PHASES.ASCENDED)
check('结丹（15 级）仍是筑基相位', offlinePhaseOfLevel(15), OFFLINE_PHASES.ASCENDED)
check('脏数据 level=0 按练气处理', offlinePhaseOfLevel(0), OFFLINE_PHASES.QI)
check('练气：1 游戏天 = 96 现实秒', offlineRealSecondsPerGameDayOf(OFFLINE_PHASES.QI), 96)
check('筑基后：1 游戏天 = 4 现实秒（24×）', offlineRealSecondsPerGameDayOf(OFFLINE_PHASES.ASCENDED), 4)
check('筑基后常量 = 4 现实秒', REAL_SECONDS_PER_GAME_DAY_ASCENDED, 4)
// 720 现实秒 ÷ 4 = 180 天，正好压在配额上（再多就被封顶，见下一条）
check('筑基后 720 现实秒 = 180 游戏天（4 秒/天）', offlineGameDaysOf(720, { phase: OFFLINE_PHASES.ASCENDED }), 180)
check(
  '筑基后 1 现实小时够 900 天，但被配额压在 180',
  offlineGameDaysOf(3600, { phase: OFFLINE_PHASES.ASCENDED }),
  180
)
check('筑基后 1 现实秒 = 21600 游戏秒', offlineGameSecondsOf(1, { phase: OFFLINE_PHASES.ASCENDED }), 21600)
check(
  '筑基段上限暂用 180 天（3650 等聚合引擎，R33）',
  OFFLINE_TUNING.maxGameDays.ascended,
  180
)
check('练气相位上限 180', offlineMaxGameDaysOf(OFFLINE_PHASES.QI), 180)
check('筑基相位上限 180', offlineMaxGameDaysOf(OFFLINE_PHASES.ASCENDED), 180)

// 分段配额（offlinePhasePlanOf）：预算与配额谁先见底就停
const qiPlan = offlinePhasePlanOf({ realSecondsLeft: 4.8 * 3600, phase: OFFLINE_PHASES.QI })
check('练气段 4.8h 正好排满 180 天', qiPlan.days, 180)
check('练气段 4.8h 用掉全部现实秒', qiPlan.realSeconds, 4.8 * 3600)
check('练气段被配额卡住（cappedByQuota）', qiPlan.cappedByQuota, true)
const qiShort = offlinePhasePlanOf({ realSecondsLeft: 960, phase: OFFLINE_PHASES.QI })
check('练气段 960 现实秒 = 10 天（预算先见底）', qiShort.days, 10)
check('练气段预算未用尽 → cappedByQuota = false', qiShort.cappedByQuota, false)
const ascPlan = offlinePhasePlanOf({ realSecondsLeft: 4.8 * 3600, phase: OFFLINE_PHASES.ASCENDED })
check('筑基段 4.8h 预算够 4320 天，被 180 天配额卡住', ascPlan.days, 180)
check('筑基段 180 天只用掉 720 现实秒', ascPlan.realSeconds, 180 * 4)
const ascQuotaUsed = offlinePhasePlanOf({
  realSecondsLeft: 4.8 * 3600,
  phase: OFFLINE_PHASES.ASCENDED,
  daysUsedInPhase: 180
})
check('筑基段配额用尽 → 不再排天数', ascQuotaUsed.days, 0)
check('空预算 → 0 天', offlinePhasePlanOf({ realSecondsLeft: 0 }).days, 0)
check('离线游戏秒 = 现实秒 × 900', offlineGameSecondsOf(2), 1800)
check('不足 60 现实秒不结算', shouldSettleOffline(59), false)
check('60 现实秒开始结算', shouldSettleOffline(60), true)
check('NaN 不结算', shouldSettleOffline(NaN), false)

// ================= 二、按 00:00 切窗 =================
const fromNight = 23 * H
const nightWindows = planOfflineWindows({ fromGameSeconds: fromNight, gameSeconds: 2 * DAY })
check('23:00 起离线 2 天 → 3 个窗口', nightWindows.length, 3)
check('首窗止于 00:00', nightWindows[0].to, DAY)
check('首窗标记 endsAtMidnight', nightWindows[0].endsAtMidnight, true)
check('中窗整一天', nightWindows[1].to - nightWindows[1].from, DAY)
check('尾窗结束在 23:00 后 2 天', nightWindows[2].to, fromNight + 2 * DAY)
check('尾窗不跨午夜', nightWindows[2].endsAtMidnight, false)
check(
  '窗口总长 = 请求时长（不丢不重）',
  nightWindows.reduce((sum, w) => sum + (w.to - w.from), 0),
  2 * DAY
)
const midnightWindows = planOfflineWindows({ fromGameSeconds: 0, gameSeconds: DAY })
check('00:00 起离线 1 天 → 1 个窗口', midnightWindows.length, 1)
check('该窗口止于次日 00:00', midnightWindows[0].to, DAY)
check('空时长 → 0 个窗口', planOfflineWindows({ fromGameSeconds: 5, gameSeconds: 0 }).length, 0)

// ================= 三、报告聚合 =================
const report = createOfflineReport({
  realSeconds: 4.8 * 3600,
  fromGameSeconds: 10 * DAY,
  toGameSeconds: 190 * DAY,
  mode: 'exploration',
  capped: true
})
check('报告游戏天数 = 180', report.gameDays, 180)
check('报告 capped 透传', report.capped, true)
absorbRewards(report, [
  { type: 'spiritual_stone', amount: 120 },
  { type: 'item', count: 3 },
  { type: 'chest' },
  { type: 'pill_fragment', amount: 2 },
  { type: 'qi_art', name: '兽吼功' }
])
check('灵石累加', report.gains.stones, 120)
check('物品按 count 累加', report.gains.items, 3)
check('宝匣按个数累加', report.gains.chests, 1)
check('残页累加', report.gains.fragments, 2)
check('功法单独计数', report.gains.qiArts, 1)

absorbObituary(report, {
  wives: [{ name: '张氏' }, { name: '李氏' }],
  offspring: [{ name: '桂一' }]
})
absorbObituary(report, { wives: [{ name: '王氏' }] })
check('讣告：妻妾计数跨批累加', obituaryCountsOf(report).wives, 3)
check('讣告：子嗣计数', obituaryCountsOf(report).offspring, 1)
check('讣告：名单保留', report.obituary.wives.length, 3)

const bulk = createOfflineReport({})
absorbObituary(bulk, {
  wives: Array.from({ length: 250 }, (_, i) => ({ name: `妾${i}` }))
})
check('讣告：计数不受名单上限影响', obituaryCountsOf(bulk).wives, 250)
check('讣告：名单被上限截断', bulk.obituary.wives.length, OFFLINE_TUNING.reportNameLimit)
for (let i = 0; i < 50; i += 1) addOfflineEvent(report, `事件${i}`)
check('重大事件有上限', report.events.length, OFFLINE_TUNING.eventLimit)

// ================= 四、探索驱动 =================
const L1 = locations.find(l => l.id === 'changling_xiangwai')
const L3 = locations.find(l => l.id === 'zhulieren_shankou')
check('探索地点表可用', !!L1 && !!L3, true)

const expCtx = { location: L1, playerLevel: 1, knownQiArts: [] }
const calmSession = createExplorationSession({ nowSeconds: 0, locationId: L1.id })
const oneDay = runOfflineExplorationSlice({
  session: calmSession,
  fromSeconds: 0,
  toSeconds: DAY,
  ctx: expCtx,
  rng: () => 0.5
})
check('探索推进 24h = 12 个事件', oneDay.resolutions.length, 12)
check('探索推进后锚点 = 26h', oneDay.session.nextEventAt, 26 * H)
check('没战败就不记养伤', oneDay.injuryUntilSeconds, 0)

const defeatCtx = { location: L3, playerLevel: 1, knownQiArts: [] }
const defeatSession = createExplorationSession({ nowSeconds: 0, locationId: L3.id })
const defeatDay = runOfflineExplorationSlice({
  session: defeatSession,
  fromSeconds: 0,
  toSeconds: DAY,
  ctx: defeatCtx,
  rng: () => 0.7
})
check('战败被识别', defeatDay.defeatedAt, 2 * H)
check('战败后记 12 游戏小时养伤', defeatDay.injuryUntilSeconds, 2 * H + 12 * H)
check('战败后会话停用', defeatDay.session.active, false)

const healedDay = runOfflineExplorationSlice({
  session: defeatDay.session,
  fromSeconds: 0,
  toSeconds: 3 * DAY,
  injuryUntilSeconds: defeatDay.injuryUntilSeconds,
  ctx: defeatCtx,
  rng: () => 0.7
})
check('养伤结束标记 healed', healedDay.healed, true)
check('养伤后继续探索（有新事件）', healedDay.resolutions.length > 0, true)
check('养伤后重新启用会话', healedDay.session.active === false || healedDay.resolutions.length > 0, true)

const narrativeResolution = {
  kind: 'narrative',
  rewards: [],
  narrative: {
    autoChoice: 'help',
    options: [
      { id: 'leave', rewards: [] },
      { id: 'help', rewards: [{ type: 'spiritual_stone', amount: 30 }] }
    ]
  }
}
check('叙事离线取 autoChoice 分支的奖励', rewardsOfResolution(narrativeResolution)[0].amount, 30)
check('非叙事取 resolutions.rewards', rewardsOfResolution({ rewards: [{ type: 'chest', tier: 1 }] }).length, 1)

// ================= 五、秘境驱动 =================
const party = calibrationParty({ level: 2 })
check('校准队伍至少 3 人', party.length >= 3, true)

const run0 = createOfflineSecretRun({ difficulty: 1, startFloor: 1, highestFloorReached: 0 })
check('离线新趟从第 1 层起', run0.floor, 1)
check('离线新趟状态 fighting', run0.status, 'fighting')

const seg = stepOfflineSecretRealmSegment({ run: run0, partyBase: party, rng: seeded(7) })
check('一段最多推进 5 层到 Buff 门', seg.run.highestFloorReached <= 5, true)
check('Buff 门自动选中一个', !!seg.pickedBuff || seg.result !== null, true)
check('自动 Buff 进 buffs 列表', (seg.run.buffs || []).length <= 1, true)

// ★ 2026-10-27：第二段必须从上一段结尾接着打。
// `runSegment` 不改入参，store 的内层循环曾经写成 `const run` + 不更新，
// 于是同一趟把 1~5 层重打 20 遍（宝匣/灵石白送，天数只算 1 趟）。
const seg2 = stepOfflineSecretRealmSegment({ run: seg.run, partyBase: party, rng: seeded(7) })
check(
  '离线第二段接着上场（层数推进或已出结果）',
  seg2.result !== null || seg2.run.floor > seg.run.floor,
  true
)

check('50 层 = 5 游戏天', secretRunDaysOf({ highestFloorReached: 50, startFloor: 1 }), 5)
check('25 层 = 3 游戏天（向上取整）', secretRunDaysOf({ highestFloorReached: 25, startFloor: 1 }), 3)
check('从 41 层打通 50 层 = 1 游戏天', secretRunDaysOf({ highestFloorReached: 50, startFloor: 41 }), 1)
check('一层没通 = 0 天', secretRunDaysOf({ highestFloorReached: 0, startFloor: 1 }), 0)

// ================= 六、静态与保险丝 =================
const pluginSource = readFileSync(join(root, 'src/plugins/offlineSimulation.js'), 'utf8')
check(
  '纯函数层不依赖 Vue / Pinia / store',
  /from ['"](vue|pinia)/.test(pluginSource) || /from ['"][^'"]*stores\//.test(pluginSource),
  false
)
check(
  '纯函数层不自己写 skipTo（离线不许补触发边界钩子）',
  /skipTo\s*\(/.test(pluginSource.replace(/\/\/.*$/gm, '')),
  false
)
// 离线秘境的内层循环在 store 里（纯函数层测不到），用源码钉住「run 必须往前推」。
// 2026-10-27：曾经是 `const run` 且不更新 → 同一趟把 1~5 层重打 20 遍。
const offlineStoreSource = readFileSync(join(root, 'src/stores/modules/offline.js'), 'utf8')
check(
  '离线秘境内层循环把 run 推进到下一段（run = segment.run）',
  /run = segment\.run/.test(offlineStoreSource),
  true
)
check('切页保险丝不被放宽（仍为 5 秒）', MAX_TICK_REAL_SECONDS, 5)
check('探索事件间隔仍是 2 游戏小时', EXP_TUNING.eventEveryGameHours, 2)

// ================= 七、store 编排（mock） =================
// 离线层只做编排：按 00:00 切窗 → 调各模块自己的推进函数。这里用 mock 钉住
// 「内宅日结 / 月俸各一次」「日常循环推到终点」「不自己扣时间」三条。
const calls = { dayLoop: [], innerCourt: [], salary: [], estate: [] }
const mock = {
  clockGameTime: 23 * H,
  idleMode: 'garrison',
  injuryUntilSeconds: 0,
  currency: { secular: 0, spiritual: 0, strategic: 0 },
  items: [],
  herbs: [],
  chests: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 },
  refinementStones: 0,
  fateCharms: 0,
  offspring: { list: [] },
  wives: [],
  cultivation: 0,
  level: 1,
  realm: '练气一层',
  breakthroughCount: 0,
  totalCultivationTime: 0,
  maxCultivation: 100,
  isBreakthroughBlocked: false
}
Object.assign(mock, offlineActions)
mock.stopSleepFastForward = () => {}
mock.saveData = () => {}
mock.advanceDayLoop = function (to) {
  calls.dayLoop.push(to)
  this.clockGameTime = to
  // 每个窗口假装练了 1800 游戏秒（= 2 现实秒的 tick 数）、掷出 100 修为
  return { spiritGameSeconds: 1800, cultivationGained: 100 }
}
mock.advanceInnerCourtDay = function (t) {
  calls.innerCourt.push(t)
  this.clockGameTime = t
}
mock.paySalaryUpTo = function (t) {
  calls.salary.push(t)
  return 6000
}
/** B3：封地日结挂同一个 00:00 点（实现细节在 estate 自己的断言里） */
mock.advanceEstateDay = function (t) {
  calls.estate.push(t)
  return { settled: true }
}

mock.settleBathPool = () => {}
// 现在走总入口：192 现实秒 ÷ 96 = 2 游戏天（P55-c 起「排多少天」由入口按相位算，不再手工传 to）
const garrisonReport = mock.runOfflineSimulation({ realSeconds: 2 * 96, fromGameSeconds: 23 * H })
check('编排：2 天 = 2 次内宅日结', calls.innerCourt.length, 2)
check('编排：内宅日结落在 00:00', calls.innerCourt[0], DAY)
check('编排：月俸与日结同一批边界', calls.salary.length, 2)
check('编排：封地日结也落在 00:00（B3）', calls.estate.length, 2)
check('编排：封地日结与内宅同刻', calls.estate[0], calls.innerCourt[0])
check('编排：日常循环推到终点', calls.dayLoop[calls.dayLoop.length - 1], 23 * H + 2 * DAY)
check('编排：结束后时钟 = 终点', mock.clockGameTime, 23 * H + 2 * DAY)
check('编排：结算天数 = 2', garrisonReport.daysSettled, 2)
check('编排：镇守模式不产生养伤记录', mock.injuryUntilSeconds, 0)
// 3 个窗口 × 1800 游戏秒 = 5400 → /900 = 6 个「在线 tick」；不算成 3 次或 5400 次
check('编排：成就口径按 900 游戏秒折算', mock.totalCultivationTime, 6)
// B2 上线当天踩到的坑：突破会把 cultivation 清零，快照差会算成 +0
check('编排：修为按实际掷出量累加（3 窗 × 100）', garrisonReport.cultivation.gained, 300)

// 单看门狗：garrison 分支绝不允许自己扣时间（时间只由游标推进）
check('编排：没有 skipTo / advance 的时间跳跃', Math.abs(mock.clockGameTime - (23 * H + 2 * DAY)) < 1e-6, true)

// ---------- P55-c：跨境界离线按分段配额 ----------
// 下线时练气、离线期间筑基：练气段按 96 秒/天烧预算，破境后剩下的现实秒按 4 秒/天换算。
// 这条断言钉住三件事：① 破境后**当场收尾**（不把练气段配额吃满）；
// ② 剩下的预算真的换成了更多游戏天；③ 报告的 phases 记出两段。
const phaseCalls = []
const phaseMock = {
  clockGameTime: 0,
  idleMode: 'garrison',
  injuryUntilSeconds: 0,
  currency: { secular: 0, spiritual: 0, strategic: 0 },
  items: [],
  herbs: [],
  chests: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 },
  refinementStones: 0,
  fateCharms: 0,
  offspring: { list: [] },
  wives: [],
  cultivation: 0,
  level: 1,
  realm: '练气十层',
  breakthroughCount: 0,
  totalCultivationTime: 0,
  maxCultivation: 8500,
  isBreakthroughBlocked: false
}
Object.assign(phaseMock, offlineActions)
phaseMock.stopSleepFastForward = () => {}
phaseMock.saveData = () => {}
phaseMock.settleBathPool = () => {}
/** 第 100 个游戏天破境筑基（把 level 推到 11） */
phaseMock.advanceDayLoop = function (to) {
  phaseCalls.push(to)
  this.clockGameTime = to
  if (to >= 100 * DAY && this.level < 11) {
    this.level = 11
    this.realm = '筑基初期'
  }
  return { spiritGameSeconds: 0, cultivationGained: 0 }
}
phaseMock.advanceInnerCourtDay = t => { phaseMock.clockGameTime = t }
phaseMock.advanceEstateDay = () => ({ settled: true })
phaseMock.paySalaryUpTo = () => 0

// 4.8 现实小时 = 练气段最多 180 天；第 100 天破境 → 余下 (17280 − 100×96) 秒按 4 秒/天
const phaseReport = phaseMock.runOfflineSimulation({ realSeconds: 4.8 * 3600, fromGameSeconds: 0 })
check('跨境界：分成两段', phaseReport.phases.length, 2)
check('跨境界：首段是练气', phaseReport.phases[0].phase, OFFLINE_PHASES.QI)
check('跨境界：练气段走到破境那天就收尾（100 天）', phaseReport.phases[0].days, 100)
check('跨境界：次段是筑基', phaseReport.phases[1].phase, OFFLINE_PHASES.ASCENDED)
check('跨境界：筑基段按 4 秒/天换算，被 180 天配额卡住', phaseReport.phases[1].days, 180)
check('跨境界：总天数 = 100 + 180', phaseReport.daysSettled, 280)
check('跨境界：预算没用完 → capped', phaseReport.capped, true)
check(
  '跨境界：日记一句「破境筑基」',
  phaseReport.events.some(e => e.kind === 'good' && e.text.includes('筑基')),
  true
)

// 筑基档离线：预算 4.8 小时够 4320 天，配额只有 180 天
const ascMock = { ...phaseMock }
Object.assign(ascMock, offlineActions)
ascMock.level = 11
ascMock.realm = '筑基初期'
ascMock.clockGameTime = 0
ascMock.injuryUntilSeconds = 0
ascMock.advanceDayLoop = function (to) {
  this.clockGameTime = to
  return { spiritGameSeconds: 0, cultivationGained: 0 }
}
ascMock.advanceInnerCourtDay = t => { ascMock.clockGameTime = t }
ascMock.advanceEstateDay = () => ({ settled: true })
ascMock.paySalaryUpTo = () => 0
ascMock.stopSleepFastForward = () => {}
ascMock.saveData = () => {}
ascMock.settleBathPool = () => {}
const ascReport = ascMock.runOfflineSimulation({ realSeconds: 4.8 * 3600, fromGameSeconds: 0 })
check('筑基档：只结算一段', ascReport.phases.length, 1)
check('筑基档：段相位 = 筑基', ascReport.phases[0].phase, OFFLINE_PHASES.ASCENDED)
check('筑基档：被 180 天配额卡住（设计值 3650，R33 暂缓）', ascReport.daysSettled, 180)
check('筑基档：触顶标记', ascReport.capped, true)

// 练气档离线：4.8 小时正好 180 天，不算触顶
const qiOnlyMock = { ...phaseMock }
Object.assign(qiOnlyMock, offlineActions)
qiOnlyMock.level = 10
qiOnlyMock.clockGameTime = 0
qiOnlyMock.injuryUntilSeconds = 0
qiOnlyMock.advanceDayLoop = function (to) {
  this.clockGameTime = to
  return { spiritGameSeconds: 0, cultivationGained: 0 }
}
qiOnlyMock.advanceInnerCourtDay = t => { qiOnlyMock.clockGameTime = t }
qiOnlyMock.advanceEstateDay = () => ({ settled: true })
qiOnlyMock.paySalaryUpTo = () => 0
qiOnlyMock.stopSleepFastForward = () => {}
qiOnlyMock.saveData = () => {}
qiOnlyMock.settleBathPool = () => {}
const qiOnlyReport = qiOnlyMock.runOfflineSimulation({ realSeconds: 4.8 * 3600, fromGameSeconds: 0 })
check('练气档：180 天整', qiOnlyReport.daysSettled, 180)
check('练气档：刚好用满预算 → 不算触顶', qiOnlyReport.capped, false)

// ---------- 讣告去重（2026-10-28） ----------
// 以前同一位寿终的妻妾会被记两次：按 00:00 增量记一遍，finalize 的快照差再记一遍。
// 180 天离线能刷出「妻妾 20 人已作古」，而实际只死了 10 位。
const dupMock = {
  ...mock,
  wives: [
    { name: '张氏', status: 'idle' },
    { name: '李氏', status: 'idle' }
  ],
  offspring: { list: [] },
  injuryUntilSeconds: 0,
  clockGameTime: 23 * H
}
Object.assign(dupMock, offlineActions)
dupMock.stopSleepFastForward = () => {}
dupMock.saveData = () => {}
dupMock.advanceDayLoop = function (to) {
  this.clockGameTime = to
  return {}
}
/** 第 1 个 00:00 张氏寿终，第 2 个 00:00 李氏寿终 —— 同一批死亡只该记两次，不是四次 */
dupMock.advanceInnerCourtDay = function (t) {
  this.clockGameTime = t
  const day = Math.round(t / DAY)
  if (day === 1) this.wives[0].status = 'passed_away'
  if (day === 2) this.wives[1].status = 'passed_away'
}
dupMock.paySalaryUpTo = () => 0
dupMock.advanceEstateDay = () => ({ settled: true })

const dupBefore = dupMock.offlineSnapshot()
const dupReport = createOfflineReport({
  realSeconds: 3 * 96,
  fromGameSeconds: 23 * H,
  toGameSeconds: 23 * H + 3 * DAY,
  mode: 'garrison'
})
dupMock.settleOfflineGarrison({ from: 23 * H, to: 23 * H + 3 * DAY, report: dupReport })
dupMock.finalizeOfflineReport(dupReport, dupBefore, dupMock.offlineSnapshot())
check('讣告去重：两位寿终只记两人（不是四次）', obituaryCountsOf(dupReport).wives, 2)
check('讣告去重：名单也正好两条', dupReport.obituary.wives.length, 2)

// ---------- 输出 ----------
if (LIST) {
  for (const label of labels) console.log(`[LIST] ${label}`)
  console.log(`\n共 ${labels.length} 条断言${FILTER ? `（filter=${FILTER}）` : ''}`)
  process.exit(0)
}
const pad = (s, n) => String(s).padEnd(n)
const width = Math.max(...results.map(r => [...r.label].length)) + 2

console.log('\n离线结算断言（《模块九》v2.1 · 换算 / 切窗 / 报告 / 探索 / 秘境 / 编排）\n')
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
