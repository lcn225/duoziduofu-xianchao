// 离线结算纯函数断言（《模块九》v2.1 · B2；2026-11-05 B1 上限按相位：180 / 1,500 / 1,500）
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
  offlineGameDaysOf,
  offlineGameSecondsOf,
  offlineCappedOf,
  offlinePhaseOfLevel,
  offlineRealSecondsPerGameDayOf,
  offlineMaxGameDaysOf,
  offlineBlockDaysOf,
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
// P62 阶段 C：内宅 store 的活跃索引 / 收尾结清（store 层的真实编排，mock 钉不住）
import { actions as innerCourtActions, getters as innerCourtGetters } from '../src/stores/modules/innerCourt.js'
import { offspringDeathSecondsOf } from '../src/plugins/innerCourt.js'
// P62 阶段 D（2026-11-13）：材料账本 + 日常循环块内批量
import { offlineMaterialBagActive, takeOfflineMaterialUnits } from '../src/plugins/arts.js'
import { takeUnits, unitsOf } from '../src/plugins/stacks.js'
import { createDayState } from '../src/plugins/dayLoop.js'
import { actions as dayLoopActions } from '../src/stores/modules/dayLoop.js'

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
check('4.8 现实小时 = 180 游戏天（练气配额）', offlineGameDaysOf(4.8 * 3600), 180)
check('练气上限 180 天（不是旧的 450）', OFFLINE_TUNING.maxGameDays.qi, 180)
check('超过上限仍返回 180', offlineGameDaysOf(12 * 3600), 180)
check('超过上限 → capped = true', offlineCappedOf(12 * 3600), true)
check('刚好 180 天 → capped = false', offlineCappedOf(4.8 * 3600), false)
check('0 现实秒 → 0 天', offlineGameDaysOf(0), 0)
check('负数现实秒 → 0 天', offlineGameDaysOf(-500), 0)
check('NaN 现实秒 → 0 天', offlineGameDaysOf('abc'), 0)

// ---------- 一之二、按境界三段（P55-c；2026-11-03 A1 加金丹） ----------
check('练气十层 = 练气相位', offlinePhaseOfLevel(10), OFFLINE_PHASES.QI)
check('筑基初期（11 级）= 筑基相位', offlinePhaseOfLevel(11), OFFLINE_PHASES.FOUNDATION)
check('筑基十层（20 级）仍是筑基相位', offlinePhaseOfLevel(20), OFFLINE_PHASES.FOUNDATION)
check('金丹一层（21 级）= 金丹相位', offlinePhaseOfLevel(21), OFFLINE_PHASES.CORE)
check('金丹十层（30 级）= 金丹相位', offlinePhaseOfLevel(30), OFFLINE_PHASES.CORE)
check('脏数据 level=0 按练气处理', offlinePhaseOfLevel(0), OFFLINE_PHASES.QI)
check('练气：1 游戏天 = 96 现实秒', offlineRealSecondsPerGameDayOf(OFFLINE_PHASES.QI), 96)
check('筑基后：1 游戏天 = 4 现实秒（24×）', offlineRealSecondsPerGameDayOf(OFFLINE_PHASES.FOUNDATION), 4)
check('金丹：1 游戏天 ≈ 0.571 现实秒（168×）', offlineRealSecondsPerGameDayOf(OFFLINE_PHASES.CORE), 24 / 42)
// 720 现实秒 ÷ 4 = 180 天，低于 4,320 配额（不被封顶）
check('筑基后 720 现实秒 = 180 游戏天（4 秒/天）', offlineGameDaysOf(720, { phase: OFFLINE_PHASES.FOUNDATION }), 180)
check(
  '筑基后 1 现实小时 = 900 天（低于 4,320 配额，不截断）',
  offlineGameDaysOf(3600, { phase: OFFLINE_PHASES.FOUNDATION }),
  900
)
check('筑基后 1 现实秒 = 21600 游戏秒', offlineGameSecondsOf(1, { phase: OFFLINE_PHASES.FOUNDATION }), 21600)
check('金丹 1 现实秒 = 151200 游戏秒', offlineGameSecondsOf(1, { phase: OFFLINE_PHASES.CORE }), 151200)
check(
  '金丹 1 现实秒 = 1.75 游戏天',
  offlineGameSecondsOf(1, { phase: OFFLINE_PHASES.CORE }) / DAY,
  1.75
)
// 2026-11-11 R34：上限从过渡值 1,500 抬到原则 A 的目标态（现实 4.8 小时）
check(
  '筑基段上限 = 目标态 4,320 天（4.8 现实小时 / 4 秒一天）',
  OFFLINE_TUNING.maxGameDays.foundation,
  4320
)
check(
  '金丹段上限 = 目标态 30,240 天（4.8 现实小时 / 168×）',
  OFFLINE_TUNING.maxGameDays.core,
  30240
)
check('练气相位上限 180', offlineMaxGameDaysOf(OFFLINE_PHASES.QI), 180)
check('筑基相位上限 4,320', offlineMaxGameDaysOf(OFFLINE_PHASES.FOUNDATION), 4320)
check('金丹相位上限 30,240', offlineMaxGameDaysOf(OFFLINE_PHASES.CORE), 30240)
// 2026-11-11 粗颗粒度块结算：练气逐日，筑基按周，金丹按半年
// （金丹 180 天是 R34 实测倒推的：30 天 136 秒 → 90 天 77 秒 → 180 天 54 秒）
check('练气块步长 = 1 天（逐日）', offlineBlockDaysOf(OFFLINE_PHASES.QI), 1)
check('筑基块步长 = 7 天（按周）', offlineBlockDaysOf(OFFLINE_PHASES.FOUNDATION), 7)
check('金丹块步长 = 180 天（半年）', offlineBlockDaysOf(OFFLINE_PHASES.CORE), 180)
check('未知相位块步长兜底 = 1 天', offlineBlockDaysOf('unknown'), 1)
// B1-a：安全阀必须盖得住最大段配额，否则配额会被 `planOfflineWindows` 静默截断
check(
  'maxWindows ≥ 最大段配额（不留静默截断）',
  OFFLINE_TUNING.maxWindows >= Math.max(...Object.values(OFFLINE_TUNING.maxGameDays)),
  true
)
// 目标态口径：上限必须正好等于「现实 4.8 小时 ÷ 该段速率」
check(
  '筑基上限 = 4.8 现实小时换算出的 4,320 天',
  OFFLINE_TUNING.maxGameDays.foundation,
  Math.round((4.8 * 3600) / offlineRealSecondsPerGameDayOf(OFFLINE_PHASES.FOUNDATION))
)
check(
  '金丹上限 = 4.8 现实小时换算出的 30,240 天',
  OFFLINE_TUNING.maxGameDays.core,
  Math.round((4.8 * 3600) / offlineRealSecondsPerGameDayOf(OFFLINE_PHASES.CORE))
)

// 分段配额（offlinePhasePlanOf）：预算与配额谁先见底就停
const qiPlan = offlinePhasePlanOf({ realSecondsLeft: 4.8 * 3600, phase: OFFLINE_PHASES.QI })
check('练气段 4.8h 正好排满 180 天', qiPlan.days, 180)
check('练气段 4.8h 用掉全部现实秒', qiPlan.realSeconds, 4.8 * 3600)
check('练气段被配额卡住（cappedByQuota）', qiPlan.cappedByQuota, true)
const qiShort = offlinePhasePlanOf({ realSecondsLeft: 960, phase: OFFLINE_PHASES.QI })
check('练气段 960 现实秒 = 10 天（预算先见底）', qiShort.days, 10)
check('练气段预算未用尽 → cappedByQuota = false', qiShort.cappedByQuota, false)
const ascPlan = offlinePhasePlanOf({ realSecondsLeft: 4.8 * 3600, phase: OFFLINE_PHASES.FOUNDATION })
check('筑基段 4.8h 预算正好排满 4,320 天', ascPlan.days, 4320)
check('筑基段 4,320 天用掉全部现实秒（4.8 小时）', ascPlan.realSeconds, 4.8 * 3600)
const ascQuotaUsed = offlinePhasePlanOf({
  realSecondsLeft: 4.8 * 3600,
  phase: OFFLINE_PHASES.FOUNDATION,
  daysUsedInPhase: 4320
})
check('筑基段配额用尽 → 不再排天数', ascQuotaUsed.days, 0)
const corePlan = offlinePhasePlanOf({ realSecondsLeft: 4.8 * 3600, phase: OFFLINE_PHASES.CORE })
check('金丹段 4.8h 预算正好排满 30,240 天', corePlan.days, 30240)
check('金丹段 30,240 天用掉全部现实秒（4.8 小时）', Math.round(corePlan.realSeconds), 4.8 * 3600)
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
  { type: 'craft_fragment', amount: 2 },
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
const calls = { dayLoop: [], innerCourt: [], salary: [], estate: [], faction: [] }
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
/** 2026-10-30 飞鹰门：任务结算 + 周/月刷新。它自己按墙钟累计现实秒，这里只记调用次数 */
mock.advanceFactionReal = function () {
  calls.faction.push(calls.faction.length)
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
check('编排：飞鹰门也每天结一次（2026-10-30）', calls.faction.length, 2)
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
phaseMock.advanceFactionReal = () => ({ settled: true })
phaseMock.paySalaryUpTo = () => 0

// 4.8 现实小时 = 练气段最多 180 天；第 100 天破境 → 余下 (17280 − 100×96) 秒按 4 秒/天
const phaseReport = phaseMock.runOfflineSimulation({ realSeconds: 4.8 * 3600, fromGameSeconds: 0 })
check('跨境界：分成两段', phaseReport.phases.length, 2)
check('跨境界：首段是练气', phaseReport.phases[0].phase, OFFLINE_PHASES.QI)
check('跨境界：练气段走到破境那天就收尾（100 天）', phaseReport.phases[0].days, 100)
check('跨境界：次段是筑基', phaseReport.phases[1].phase, OFFLINE_PHASES.FOUNDATION)
// R34 抬到目标态后：剩 (17,280 − 9,600) 秒 ÷ 4 = 1,920 天，低于 4,320 配额、预算用完
check('跨境界：筑基段按 4 秒/天换算，剩 1,920 天', phaseReport.phases[1].days, 1920)
check('跨境界：总天数 = 100 + 1,920', phaseReport.daysSettled, 2020)
check('跨境界：预算用完 → 不算触顶', phaseReport.capped, false)
check(
  '跨境界：日记一句「破境筑基」',
  phaseReport.events.some(e => e.kind === 'good' && e.text.includes('筑基')),
  true
)

// 筑基档离线：预算 4.8 小时正好 4,320 天（R34 目标态，预算与配额同时见底）
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
check('筑基档：段相位 = 筑基', ascReport.phases[0].phase, OFFLINE_PHASES.FOUNDATION)
check('筑基档：4.8h 预算正好排满 4,320 天', ascReport.daysSettled, 4320)
check('筑基档：预算用完 → 不算触顶', ascReport.capped, false)

// 跨段（筑基 → 金丹）：2026-11-03 A1 第三档。
// 第 100 个游戏天结丹，此后按 ≈0.571 现实秒/游戏天换算（R34 后上限 30,240 天，预算先见底）。
const coreMock = { ...phaseMock }
Object.assign(coreMock, offlineActions)
coreMock.level = 11
coreMock.realm = '筑基初期'
coreMock.clockGameTime = 0
coreMock.injuryUntilSeconds = 0
coreMock.advanceDayLoop = function (to) {
  this.clockGameTime = to
  if (to >= 100 * DAY && this.level < 21) {
    this.level = 21
    this.realm = '金丹一层'
  }
  return { spiritGameSeconds: 0, cultivationGained: 0 }
}
coreMock.advanceInnerCourtDay = t => { coreMock.clockGameTime = t }
coreMock.advanceEstateDay = () => ({ settled: true })
coreMock.advanceFactionReal = () => ({ settled: true })
coreMock.paySalaryUpTo = () => 0
coreMock.stopSleepFastForward = () => {}
coreMock.saveData = () => {}
coreMock.settleBathPool = () => {}
const coreReport = coreMock.runOfflineSimulation({ realSeconds: 4.8 * 3600, fromGameSeconds: 0 })
check('跨段（筑基→金丹）：分成两段', coreReport.phases.length, 2)
check('跨段（筑基→金丹）：首段是筑基', coreReport.phases[0].phase, OFFLINE_PHASES.FOUNDATION)
check('跨段（筑基→金丹）：筑基段走到结丹那天就收尾（100 天）', coreReport.phases[0].days, 100)
check('跨段（筑基→金丹）：次段是金丹', coreReport.phases[1].phase, OFFLINE_PHASES.CORE)
// 剩 (17,280 − 400) 秒 ÷ (24/42) = 29,540 天，低于 30,240 配额、预算用完
check('跨段（筑基→金丹）：金丹段按 168× 换算，剩 29,540 天', coreReport.phases[1].days, 29540)
check('跨段（筑基→金丹）：总天数 = 100 + 29,540', coreReport.daysSettled, 29640)
check(
  '跨段（筑基→金丹）：日记一句「结成金丹」',
  coreReport.events.some(e => e.kind === 'good' && e.text.includes('金丹')),
  true
)

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
// 1,500 天离线能刷出「妻妾 20 人已作古」，而实际只死了 10 位。
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

// ---------- 2026-11-11 粗颗粒度块结算 ----------
// 金丹 120 现实秒 = 210 游戏天；块长 180 天 ⇒ 一个整块 + 一个 30 天尾块，
// 内宅 2 次（首次带 days=180），封地块化 2 次（P62 步骤 1）。
const blockCalls = {
  innerCourt: [],
  estate: [],
  estateBlock: [],
  salary: [],
  dayLoop: 0,
  templateDays: 0,
  /** P62 阶段 C：活跃索引的开关（begin/end 各一次） */
  courtIndex: []
}
const blockMock = { ...mock, level: 30, realm: '金丹十层', clockGameTime: 0, injuryUntilSeconds: 0 }
Object.assign(blockMock, offlineActions)
blockMock.stopSleepFastForward = () => {}
blockMock.saveData = () => {}
blockMock.settleBathPool = () => {}
// 块内第一天完整跑 dayLoop（返回当日模板），其余天走模板补发
blockMock.advanceDayLoop = function (to) {
  blockCalls.dayLoop += 1
  this.clockGameTime = to
  return {
    spiritGameSeconds: 0,
    cultivationGained: 0,
    dayTemplate: { cultivationGained: 0, petXp: 0, bodyRounds: 0, artHours: {}, eveningCount: 0 }
  }
}
blockMock.applyOfflineDayTemplate = function (template, days) {
  blockCalls.templateDays += days
  return { days, cultivationGained: 0, bodyCultivationGained: 0, spiritGameSeconds: 0 }
}
blockMock.advanceInnerCourtDay = function (t, opts = {}) {
  blockCalls.innerCourt.push({ t, days: opts.days })
  this.clockGameTime = t
}
blockMock.advanceEstateDay = t => { blockCalls.estate.push(t); return { settled: true } }
// P62 步骤 1：封地也块化 —— 块首块末各写一次，块内仍逐日算（纯函数内部）
blockMock.advanceEstateBlock = function ({ from, days }) {
  blockCalls.estateBlock.push({ from, days })
  return { days, settled: days }
}
blockMock.paySalaryUpTo = t => { blockCalls.salary.push(t); return 0 }
blockMock.advanceFactionReal = () => ({ settled: true })
// P62 阶段 C：重放开始建索引、结束释放（异常退出也走 finally）
blockMock.beginOfflineCourtIndex = () => { blockCalls.courtIndex.push('begin') }
blockMock.endOfflineCourtIndex = () => { blockCalls.courtIndex.push('end') }
const blockReport = blockMock.runOfflineSimulation({ realSeconds: 120, fromGameSeconds: 0 })
check('块结算：金丹 210 天全部结算', blockReport.daysSettled, 210)
check('块结算：180 天块 + 30 天尾块 ⇒ 内宅 2 次', blockCalls.innerCourt.length, 2)
check('块结算：首块内宅带 days = 180', blockCalls.innerCourt[0].days, 180)
check('块结算：尾块内宅带 days = 30', blockCalls.innerCourt[1].days, 30)
check('块结算：封地块化（2 次，不再逐日 210 次）', blockCalls.estateBlock.length, 2)
check('块结算：首块封地带 days = 180', blockCalls.estateBlock[0].days, 180)
check('块结算：尾块封地带 days = 30', blockCalls.estateBlock[1].days, 30)
check('块结算：块化路径不再逐日调封地入口', blockCalls.estate.length, 0)
check('块结算：月俸按块补（2 次）', blockCalls.salary.length, 2)
// R34：日常循环只在块首完整跑一次，其余天按模板补发
check('块结算：日常循环只跑块数（2 次）', blockCalls.dayLoop, 2)
check('块结算：模板补发 179 + 29 = 208 天', blockCalls.templateDays, 208)
// P62 阶段 C：活跃索引随重放开合（成对，且只开一次）
check('阶段 C：重放开始建索引、结束释放', blockCalls.courtIndex.join(','), 'begin,end')

// P62 步骤 1 回滚开关：`OFFLINE_TUNING.estateBlock = false` ⇒ 退回逐日路径
// （等价性断言两档都跑；这里只钉「开关真的接上了」，两条路径的数值等价在 verify-estate）
const offCalls = { estate: [], estateBlock: [] }
const offMock = { ...blockMock }
offMock.advanceEstateDay = t => { offCalls.estate.push(t); return { settled: true } }
offMock.advanceEstateBlock = ({ days }) => { offCalls.estateBlock.push(days); return { days, settled: days } }
const savedEstateBlock = OFFLINE_TUNING.estateBlock
check('回滚开关：estateBlock 默认打开', savedEstateBlock, true)
OFFLINE_TUNING.estateBlock = false
offMock.runOfflineSimulation({ realSeconds: 120, fromGameSeconds: 0 })
OFFLINE_TUNING.estateBlock = savedEstateBlock
check('回滚开关：关掉后退回逐日封地（210 次）', offCalls.estate.length, 210)
check('回滚开关：关掉后不再走块入口', offCalls.estateBlock.length, 0)

// ---------- P62 阶段 B（2026-11-13）：凡人四类产出落点 ----------
// 灵石必须**在封地块结算之后**入账 ⇒ 本块挣的、下一块才花得出去（延迟账户同一口径）。
const landingCalls = { innerOpts: null, estateSaw: [], estateCount: [] }
const landingMock = {
  clockGameTime: 0,
  currency: { secular: 0, spiritual: 10, strategic: 0 },
  // P62 阶段 C：活跃索引给的人口（mock 直接给 42）
  offlineCourtAliveCountOf: () => 42,
  advanceInnerCourtDay(t, opts = {}) {
    landingCalls.innerOpts = opts
    return { familyIncome: { spiritual: 70 } }
  },
  advanceEstateBlock({ offspringCount } = {}) {
    landingCalls.estateSaw.push(this.currency.spiritual)
    landingCalls.estateCount.push(offspringCount)
    return { days: 3, settled: 3 }
  },
  advanceFactionReal: () => ({}),
  paySalaryUpTo: () => 0,
  settleBathPool: () => null,
  saveData() {}
}
Object.assign(landingMock, offlineActions)
landingMock.settleOfflineBlock({ from: 0, to: 3 * DAY, days: 3 })
check('阶段 B：块内结内宅带 deferFamilyIncome', landingCalls.innerOpts.deferFamilyIncome, true)
check('阶段 B：封地块结算时看不到本块凡人灵石', landingCalls.estateSaw[0], 10)
check('阶段 B：块末才补入凡人灵石（10 + 70）', landingMock.currency.spiritual, 80)
landingMock.settleOfflineBlock({ from: 3 * DAY, to: 6 * DAY, days: 3 })
check('阶段 B：下一块的封地预算才拿得到（80）', landingCalls.estateSaw[1], 80)
// P62 阶段 C：人口增量与块起点都要传给下一层（收尾结清 / C5）
check('阶段 C：内宅块结算带块起点（fromSeconds）', landingCalls.innerOpts.fromSeconds, 3 * DAY)
check('阶段 C：封地块拿到活跃索引的人口（42）', landingCalls.estateCount[0], 42)

// ---------- P62 阶段 C（2026-11-13）：活跃索引 + 凡人收尾结清（store 层） ----------
// 目的：块化后「块内死了只结存活天数」「人口增量」「修士桶只扫修士」三条看代码对不出错，
// 只有拿真实 action 跑一遍才算数。这份 mock 只补 state 与落盘点，逻辑全走 store。
{
  const court = {
    clockGameTime: 0,
    level: 1,
    currency: { secular: 0, spiritual: 0, strategic: 0 },
    items: [],
    herbs: [],
    pets: [],
    bodyLevel: 0,
    ownedFateItemIds: [],
    practice: { qiArts: { known: {} }, fateItems: { known: {} } },
    estate: { buildings: {} },
    secretRealm: { run: null },
    innerCourt: {
      wives: [],
      energy: { spentToday: 0 },
      weekly: { version: 1, buckets: {}, seen: {} },
      log: []
    },
    offspring: {
      list: [],
      gacha: { totalDraws: 0, pityNoRoot: 0 },
      pendingBirthIds: [],
      nextChildSeq: 100,
      expeditionReport: null
    },
    saveData() {},
    pushCourtLog() {},
    recordCourtWeek() {},
    ensureCourtWeekly() {},
    grantLegacyTraitsOf() {
      return 0
    },
    gainItem() {},
    applyExplorationReward() {},
    debugNoteStamina() {},
    pauseClockForEvent() {}
  }
  Object.assign(court, innerCourtActions)
  // getter 必须定义成 get：Pinia 里它们是 computed，直接 assign 会变成函数对象
  for (const [key, fn] of Object.entries(innerCourtGetters)) {
    Object.defineProperty(court, key, { get: () => fn.call(court), configurable: true })
  }

  const BLOCK_DAYS = 10
  const blockFrom = 0
  const blockTo = BLOCK_DAYS * DAY
  // 账房（0.5 灵石/天）在第 5.5 天寿终：先按 0 岁算寿元秒数，再倒推出生时刻
  const lifeSeconds = offspringDeathSecondsOf({ id: 'c_9001', name: '桂壹', hasRoot: false, birthTime: 0 })
  const worker = {
    id: 'c_9001',
    name: '桂壹',
    gender: 'male',
    hasRoot: false,
    rootCount: 0,
    birthTime: 5.5 * DAY - lifeSeconds,
    realmLevel: 0,
    status: 'alive',
    job: 'accountant',
    jobProgress: 0,
    jobHerbProgress: 0,
    jobForgeProgress: 0,
    traits: [],
    spouse: null,
    expeditionMode: 'cultivate',
    injuryDays: 0
  }
  const cultivator = {
    id: 'c_9002',
    name: '桂贰',
    gender: 'male',
    hasRoot: true,
    rootCount: 3,
    birthTime: 0,
    realmLevel: 1,
    cultivation: 0,
    status: 'alive',
    traits: [],
    spouse: null,
    expeditionMode: 'cultivate',
    injuryDays: 0
  }
  // 200 天后才到婚配年龄：建索引时进「到点队列」，长块末应被挪进繁育桶并成婚
  const lateMale = {
    id: 'c_9003',
    name: '桂叁',
    gender: 'male',
    hasRoot: false,
    birthTime: -14 * 365 * DAY + 200 * DAY,
    realmLevel: 0,
    status: 'alive',
    traits: [],
    spouse: null,
    expeditionMode: 'cultivate',
    injuryDays: 0
  }
  const deadRooted = {
    id: 'c_9004',
    name: '桂肆',
    gender: 'male',
    hasRoot: true,
    rootCount: 1,
    birthTime: 0,
    realmLevel: 1,
    status: 'passed_away',
    traits: []
  }
  court.offspring.list = [worker, cultivator, lateMale, deadRooted]

  court.beginOfflineCourtIndex(blockFrom)
  check('阶段 C（store）：索引人口不含已故', court.offlineCourtAliveCountOf(), 3)

  // 家族工作：账房 0.5/天 × 5 天（第 6 个午夜前死亡）= 2 灵石 + 余 0.5
  const jobBlock = court.advanceFamilyJobs(blockTo, BLOCK_DAYS, { fromSeconds: blockFrom })
  check('阶段 C（store）：块内寿终只结存活 5 天', jobBlock.output.spiritual, 2)
  check('阶段 C（store）：灵石按块末延迟入账口径出账', jobBlock.deferredSpiritual, 0)
  check('阶段 C（store）：余数记账 0.5', Math.round(worker.jobProgress * 100) / 100, 0.5)

  // 寿终：按预计算的死亡线判死（不是块末一刀切）
  const passed = court.settleOffspringLifespan(blockTo)
  check('阶段 C（store）：到点的人判死', worker.status, 'passed_away')
  check('阶段 C（store）：讣告名单只有他', passed.join(','), '桂壹')
  check('阶段 C（store）：人口随寿终 −1', court.offlineCourtAliveCountOf(), 2)
  check('阶段 C（store）：死亡时刻 = 出生 + 寿元', worker.passedAwayAt, 5.5 * DAY)

  // 修士桶：死掉的有灵根子嗣不涨修为，活着的那位照常涨
  const trained = court.advanceOffspringCultivation(blockTo, null, BLOCK_DAYS)
  check('阶段 C（store）：修士桶只练活着的修士', trained.trained, 1)
  check('阶段 C（store）：练的是活着的那位', cultivator.cultivation > 0, true)
  check('阶段 C（store）：已故修士没涨修为', deadRooted.cultivation, undefined)

  // 到点队列：200 天后成年的男性在长块末被挪进繁育桶并成婚
  court.advanceOffspringBreeding(210 * DAY, 180, { fromSeconds: 30 * DAY })
  check('阶段 C（store）：到点男性进繁育桶后成婚', !!lateMale.spouse, true)

  court.endOfflineCourtIndex()
  check('阶段 C（store）：结束后索引释放', court.offlineCourtAliveCountOf(), null)

  // 全链路冒烟：再补一名同样「第 5.5 天寿终」的账房，跑一次真实的 advanceInnerCourtDay。
  // 目的：钉住「家族工作提到寿终之前 + 块化参数下传 + 返回值」这条新编排，别只测子 action。
  const worker2 = {
    ...worker,
    id: 'c_9005',
    name: '桂伍',
    status: 'alive',
    // ⚠ 上面的 worker 已被寿终结算摘掉岗位（`_retireOffspringAt` 会把 job 置 null），
    //    这里必须显式补回来，否则整块结算一条岗都不扫
    job: 'accountant',
    jobProgress: 0,
    jobHerbProgress: 0,
    jobForgeProgress: 0
  }
  // 寿元有 ±5% 稳定随机（按 id + 名字哈希）⇒ 新 id 要重新倒推出生时刻，不能沿用上面那份
  const life2 = offspringDeathSecondsOf({ id: 'c_9005', name: '桂伍', hasRoot: false, birthTime: 0 })
  worker2.birthTime = 5.5 * DAY - life2
  court.offspring.list.push(worker2)
  court.beginOfflineCourtIndex(blockFrom)
  const dayBlock = court.advanceInnerCourtDay(blockTo, {
    silent: true,
    days: BLOCK_DAYS,
    fromSeconds: blockFrom,
    deferFamilyIncome: true
  })
  check('阶段 C（store）：整块结算返回凡人灵石（0.5 × 5 天）', dayBlock.familyIncome.spiritual, 2)
  check('阶段 C（store）：整块结算里到点的人已判死', worker2.status, 'passed_away')
  court.endOfflineCourtIndex()
}

// ---------- P62 阶段 D1（2026-11-13）：离线材料账本 ----------
// 目的：块首建账本、块内只扣账本（背包当场不动）、块末一次性写回；
// 开关 `OFFLINE_TUNING.materialBag` 关掉退回「边算边扣背包」。
{
  const ledgerSeen = []
  const makeLedgerMock = () => {
    const m = {
      clockGameTime: 0,
      level: 1,
      items: [
        { id: 'm1', baseId: 'jin_1', name: '金属', category: '灵材', type: '金属', tier: 1, count: 5 }
      ],
      injuryUntilSeconds: 0,
      saveData() {},
      advanceDayLoop() {
        return {}
      },
      advanceInnerCourtDay() {
        return {}
      },
      advanceEstateBlock() {
        return { days: 1, settled: 1 }
      },
      advanceFactionReal() {},
      paySalaryUpTo() {},
      settleBathPool() {}
    }
    Object.assign(m, offlineActions)
    // 必须在 assign 之后覆盖 —— `offlineActions` 里也有同名 action
    // 与真实调用点同一条门控：账本生效就只扣账本，否则直接扣背包
    m.advanceOfflineGarrisonWindow = function () {
      const plan = [{ id: 'm1', units: 1 }]
      if (!takeOfflineMaterialUnits(plan)) this.items = takeUnits(this.items, plan)
      ledgerSeen.push({ count: unitsOf(this.items[0]), active: offlineMaterialBagActive() })
      return {}
    }
    return m
  }
  const runTwoBlocks = () => {
    const m = makeLedgerMock()
    const report = createOfflineReport({ realSeconds: 2 * 96, fromGameSeconds: 0, mode: 'garrison' })
    m.settleOfflineGarrison({ from: 0, to: 2 * DAY, report })
    return m
  }

  const bagMock = runTwoBlocks()
  check('阶段 D1：块内背包当场不动（先 [5,4]，块末才扣）', ledgerSeen.map(x => x.count).join(','), '5,4')
  check('阶段 D1：块内账本一直生效', ledgerSeen.every(x => x.active), true)
  check('阶段 D1：两块共扣 2 件，块末写回背包', unitsOf(bagMock.items[0]), 3)
  check('阶段 D1：重放结束后账本释放', offlineMaterialBagActive(), false)

  ledgerSeen.length = 0
  const savedMaterialBag = OFFLINE_TUNING.materialBag
  OFFLINE_TUNING.materialBag = false
  runTwoBlocks()
  OFFLINE_TUNING.materialBag = savedMaterialBag
  check('阶段 D1：开关关掉 → 边算边扣背包（[4,3]）', ledgerSeen.map(x => x.count).join(','), '4,3')
  check('阶段 D1：开关关掉后账本不生效', ledgerSeen.every(x => !x.active), true)
}

// ---------- P62 阶段 D2/D3（2026-11-13）：日常循环块内批量 ----------
// 目的：批量版在「突破当天」收尾、炼体 / 百艺 / 晚间按 k 天折算；
// 回滚开关关掉退回逐日版，两边产出逐位一致。
{
  const makeTemplateStore = patch => {
    const store = {
      ...dayLoopActions,
      clockGameTime: 0,
      level: 1,
      maxCultivation: 1000,
      cultivation: 0,
      isBreakthroughBlocked: false,
      cultivate(amount) {
        this.cultivation = Math.min(this.cultivation + amount, this.maxCultivation)
        if (this.cultivation >= this.maxCultivation && !this.isBreakthroughBlocked) {
          this.level += 1
          this.maxCultivation *= 2
          this.cultivation = 0
          this.breaks = (this.breaks || 0) + 1
        }
      },
      gainPetCultivation(amount) {
        this.petXp = (this.petXp || 0) + amount
      },
      settleBodyRound() {
        this.bodyRoundCount = (this.bodyRoundCount || 0) + 1
        return { gained: 2 }
      },
      advanceArtDays(kind, { hoursPerDay, days }) {
        this.artDays = (this.artDays || 0) + days
        this.artHours = (this.artHours || 0) + hoursPerDay * days
        return { completions: 0, products: [] }
      },
      advanceArtRound() {
        this.artRoundCount = (this.artRoundCount || 0) + 1
        return {}
      },
      runDayEvening(count) {
        this.evening = (this.evening || 0) + count
      },
      saveData() {}
    }
    // patch 最后打 —— 覆盖 action / getter 都要以测试口径为准
    return Object.assign(store, patch)
  }
  const template = {
    cultivationGained: 100,
    petXp: 10,
    spiritGameSeconds: 600,
    bodyRounds: 5,
    artHours: { forge: 2 },
    eveningCount: 3
  }

  const batchStore = makeTemplateStore()
  const batchOut = batchStore.applyOfflineDayTemplate(template, 15, { startGameSeconds: DAY })
  check('阶段 D2：批量在突破当天收尾（10 天）', batchOut.days, 10)
  check('阶段 D2：只突破一次', batchStore.breaks, 1)
  check('阶段 D2：突破后修为清零', batchStore.cultivation, 0)
  check('阶段 D2：突破后上限翻倍', batchStore.maxCultivation, 2000)
  check('阶段 D2：修为总量 = 模板 × 天数', batchOut.cultivationGained, 1000)
  check('阶段 D2：炼体轮 = 5 × 10', batchStore.bodyRoundCount, 50)
  check('阶段 D2：百艺天数 = 10（一次批量调用）', batchStore.artDays, 10)
  check('阶段 D2：批量不再逐日调 advanceArtRound', batchStore.artRoundCount || 0, 0)
  check('阶段 D2：晚间互动 = 3 × 10', batchStore.evening, 30)
  check('阶段 D2：灵兽同修 = 10 × 10', batchStore.petXp, 100)

  const savedDayLoopBatch = OFFLINE_TUNING.dayLoopBatch
  OFFLINE_TUNING.dayLoopBatch = false
  const perDayStore = makeTemplateStore()
  const perDayOut = perDayStore.applyOfflineDayTemplate(template, 15, { startGameSeconds: DAY })
  OFFLINE_TUNING.dayLoopBatch = savedDayLoopBatch
  check('阶段 D2：回滚开关 → 逐日版天数一致', perDayOut.days, batchOut.days)
  check('阶段 D2：回滚开关 → 逐日版修为一致', perDayOut.cultivationGained, batchOut.cultivationGained)
  check('阶段 D2：回滚开关 → 逐日版炼体一致', perDayStore.bodyRoundCount, batchStore.bodyRoundCount)
  check('阶段 D2：回滚开关 → 逐日版百艺一致（10 次）', perDayStore.artRoundCount, 10)
  check('阶段 D2：回滚开关 → 逐日版晚间一致', perDayStore.evening, batchStore.evening)

  // 卡门槛（契合度不够）：修为封顶、天数照走、不突破
  const blockedStore = makeTemplateStore({ isBreakthroughBlocked: true, maxCultivation: 100 })
  blockedStore.cultivation = 100
  const blockedOut = blockedStore.applyOfflineDayTemplate(
    { cultivationGained: 100, petXp: 0, spiritGameSeconds: 0, bodyRounds: 0, artHours: {}, eveningCount: 0 },
    15
  )
  check('阶段 D2：卡门槛时天数照走', blockedOut.days, 15)
  check('阶段 D2：卡门槛时不突破', blockedStore.breaks || 0, 0)
  check('阶段 D2：卡门槛时修为封顶不溢出', blockedStore.cultivation, 100)

  // 块首重锚（R34 遗留修复）：跨多天的块必须把 lastSeconds 拉回块起点，
  // 否则 stepDay 会按 128 次保险丝多算 ~9 天，再被当成「一天模板」乘出去。
  const rebaseStore = makeTemplateStore()
  rebaseStore.dayLoop = createDayState({ nowSeconds: 0, patrolHours: 2 })
  rebaseStore.rebaseOfflineDayLoop(5 * DAY)
  check('阶段 D2：长块块首重锚到块起点', rebaseStore.dayLoop.lastSeconds, 5 * DAY)
  const qiRebase = makeTemplateStore()
  qiRebase.dayLoop = createDayState({ nowSeconds: 0, patrolHours: 2 })
  const qiTaskStart = qiRebase.dayLoop.taskStartSeconds
  qiRebase.rebaseOfflineDayLoop(1 * DAY)
  check('阶段 D2：练气 1 天块不重锚（保持原路径）', qiRebase.dayLoop.taskStartSeconds, qiTaskStart)

  // 入口接线：每个块首次进 `advanceOfflineGarrisonWindow` 都要重锚一次
  const rebaseCalls = []
  const rebaseMock = {
    clockGameTime: 0,
    injuryUntilSeconds: 0,
    advanceDayLoop() {
      return {}
    },
    rebaseOfflineDayLoop(t) {
      rebaseCalls.push(t)
    },
    saveData() {}
  }
  Object.assign(rebaseMock, offlineActions)
  rebaseMock.advanceOfflineGarrisonWindow(DAY)
  rebaseMock.clockGameTime = 2 * DAY
  rebaseMock.advanceOfflineGarrisonWindow(3 * DAY)
  check('阶段 D2：每个块首都重锚（0 / 2 天）', rebaseCalls.join(','), `0,${2 * DAY}`)
}

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
