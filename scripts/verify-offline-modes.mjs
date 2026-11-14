// 离线三条挂机线的「怎么算」断言（P62 阶段 E，2026-11-14）
//
//   node scripts/verify-offline-modes.mjs          完整输出
//   node scripts/verify-offline-modes.mjs --list   只列标题
//   VERIFY_FILTER=秘境 node scripts/verify-offline-modes.mjs
//
// 只管阶段 E 的两件事：
//   E1 探索期望值（`plugins/explorationExpect.js`）—— 与逐次掷骰统计等价、随机舍入无偏；
//   E2 秘境离线扫荡（`stores/modules/offline.js: settleOfflineSecretRealmSweep`）——
//      趟数 floor、余数不结算、不写首破、不吃消耗品、陨落不暂停、run 冻结。

import {
  OFFLINE_TUNING,
  GAME_SECONDS_PER_DAY,
  createOfflineReport,
  runOfflineExplorationSlice,
  rewardsOfResolution
} from '../src/plugins/offlineSimulation.js'
import { TUNING as EXP_TUNING, createExplorationSession, locationById } from '../src/plugins/exploration.js'
import { TUNING as SECRET_TUNING, sweepLimitOf, timeCostDaysOf } from '../src/plugins/secretRealm.js'
import {
  stochasticRound,
  expectedIntRangeOf,
  eventProbabilitiesOf,
  addExpectedRewardsOfEvent,
  planOfflineExplorationExpectation
} from '../src/plugins/explorationExpect.js'
import { actions as offlineActions } from '../src/stores/modules/offline.js'

const DAY = GAME_SECONDS_PER_DAY

let failures = 0
let skipped = 0
const results = []
const labels = []
const FILTER = (process.env.VERIFY_FILTER || '').toLowerCase()
const LIST = process.argv.includes('--list')

const check = (label, actual, expected) => {
  if (FILTER && !label.toLowerCase().includes(FILTER)) {
    skipped += 1
    return
  }
  labels.push(label)
  if (LIST) return
  let ok
  const isNum = typeof actual === 'number' && typeof expected === 'number'
  if (isNum) {
    // 比例断言用相对误差；绝对值断言仍要求精确到 1e-6
    ok = Math.abs(actual - expected) < 1e-6
  } else if (typeof expected === 'function') {
    ok = !!expected(actual)
  } else if (expected && typeof expected === 'object' && expected.__within != null) {
    ok = Math.abs(actual - expected.value) <= expected.__within
  } else {
    ok = actual === expected
  }
  if (!ok) failures += 1
  results.push({ ok, label, actual, expected })
}

/** 相对误差断言：|actual − expected| ÷ max(|expected|, 1) ≤ pct */
const withinPct = (value, pct) => ({ __within: Math.abs(value) * pct, value })

/** 固定种子（mulberry32） */
const seeded = seed => () => {
  seed = (seed + 0x6d2b79f5) >>> 0
  let t = seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// ================= 一、随机舍入与区间期望 =================
check('随机舍入：0 → 0', stochasticRound(0), 0)
check('随机舍入：负数 → 0', stochasticRound(-3.2), 0)
check(
  '随机舍入：整数不动',
  stochasticRound(7, seeded(1)),
  7
)
{
  const rng = seeded(20261114)
  const n = 20000
  let sum = 0
  for (let i = 0; i < n; i += 1) sum += stochasticRound(3.25, rng)
  check('随机舍入：2 万次均值收敛到 3.25（±0.02）', sum / n, withinPct(3.25, 0.02))
}
check('区间期望：[1,5] → 3', expectedIntRangeOf([1, 5]), 3)
check('区间期望：[2,2] → 2', expectedIntRangeOf([2, 2]), 2)
check('区间期望：[0,0] → 0', expectedIntRangeOf([0, 0]), 0)
check('区间期望：[3,4] → 3.5', expectedIntRangeOf([3, 4]), 3.5)

// ================= 二、事件概率分布 =================
const location = locationById('changling_xiangwai')
check('地点存在（长岭乡外）', !!location, true)
{
  const rows = eventProbabilitiesOf(location)
  const sum = rows.reduce((s, r) => s + r.p, 0)
  check('事件概率合计 = 1（末尾兜底接住不足 100 的余量）', sum, withinPct(1, 1e-9))
  check('事件概率没有负值', rows.every(r => r.p > 0), true)
}

// ================= 三、叙事按 autoChoice 确定性并入 =================
{
  const fakeLocation = { id: 'fake', minLevel: 1, highTierChance: 0, elementBias: null, events: [] }
  const narrative = {
    id: 'n1',
    name: '叙事',
    category: 'narrative',
    text: '',
    reward: { stones: [5, 5] },
    narrative: {
      autoChoice: 'help',
      options: [
        { id: 'help', label: '相助', text: '', reward: { stones: [100, 100] } },
        { id: 'leave', label: '离开', text: '' }
      ]
    }
  }
  const acc = new Map()
  addExpectedRewardsOfEvent(acc, { event: narrative, location: fakeLocation, playerLevel: 1 }, 1)
  check('叙事：相助分支的灵石期望 = 100（不是两支加权）', acc.get('stones')?.amount, 100)
  const leaveAcc = new Map()
  addExpectedRewardsOfEvent(
    leaveAcc,
    {
      event: { ...narrative, narrative: { ...narrative.narrative, autoChoice: 'leave' } },
      location: fakeLocation,
      playerLevel: 1
    },
    1
  )
  check('叙事：autoChoice = 离开 → 没有奖励', leaveAcc.size, 0)
}

// ================= 四、期望值 vs 逐次掷骰（同一地图、同一境界） =================
{
  const simDays = 2000
  const rng = seeded(20261114)
  let session = createExplorationSession({ nowSeconds: 0, locationId: location.id })
  let injury = 0
  const totals = { events: 0, wins: 0, losses: 0, stones: 0, items: 0, chests: 0 }
  const ctx = { location, playerLevel: 1, knownQiArts: [], tuning: EXP_TUNING }
  for (let d = 0; d < simDays; d += 1) {
    const slice = runOfflineExplorationSlice({
      session,
      fromSeconds: d * DAY,
      toSeconds: (d + 1) * DAY,
      injuryUntilSeconds: injury,
      ctx,
      rng
    })
    session = slice.session
    injury = slice.injuryUntilSeconds
    for (const resolution of slice.resolutions) {
      totals.events += 1
      if (resolution.kind === 'battle') totals.wins += 1
      if (resolution.kind === 'defeat') totals.losses += 1
      for (const reward of rewardsOfResolution(resolution)) {
        if (reward.type === 'spiritual_stone') totals.stones += reward.amount
        if (reward.type === 'item') totals.items += reward.count
        if (reward.type === 'chest') totals.chests += 1
      }
    }
  }
  const plan = planOfflineExplorationExpectation({
    location,
    playerLevel: 1,
    knownQiArts: [],
    fromSeconds: 0,
    toSeconds: simDays * DAY,
    tuning: EXP_TUNING,
    rng: seeded(20261115)
  })
  const rewards = plan.rewards
  const stoneSum = rewards.filter(r => r.type === 'spiritual_stone').reduce((s, r) => s + r.amount, 0)
  const itemSum = rewards.filter(r => r.type === 'item').reduce((s, r) => s + r.count, 0)
  const chestSum = rewards.filter(r => r.type === 'chest').length
  check(`2,000 天事件数：期望 ≈ 逐次掷骰（±5%）`, plan.events, withinPct(totals.events, 0.05))
  check('2,000 天胜场：期望 ≈ 逐次掷骰（±8%）', plan.wins, withinPct(totals.wins, 0.08))
  check('2,000 天败场：期望 ≈ 逐次掷骰（±10%）', plan.losses, withinPct(totals.losses, 0.1))
  check('2,000 天灵石：期望 ≈ 逐次掷骰（±10%）', stoneSum, withinPct(totals.stones, 0.1))
  check('2,000 天物品件数：期望 ≈ 逐次掷骰（±10%）', itemSum, withinPct(totals.items, 0.1))
  check('2,000 天宝匣数：期望 ≈ 逐次掷骰（±12%）', chestSum, withinPct(totals.chests, 0.12))
  check('养伤折损天数 > 0（战斗图必然受伤）', plan.injuredDays > 0, true)
  check('修为/经验类不产（探索不给修为）', rewards.some(r => r.type === 'cultivation'), false)
}

// ================= 五、秘境离线扫荡（mock 编排） =================
const mock = {
  clockGameTime: 0,
  dungeonTotalRuns: 0,
  dungeonTotalRewards: 0,
  secretRealm: {
    difficulty: 2,
    highestBossCleared: 10,
    highestFloor: 12,
    bossFirstClears: { 1: true, 2: true },
    finalBossFirstKill: false,
    stats: { sweeps: 0, deaths: 0 },
    run: { floor: 7, startFloor: 1, status: 'fighting', party: ['a'] }
  }
}
Object.assign(mock, offlineActions)
const lootBatches = []
let blockSpans = []
mock.applySecretRealmLoot = function (loot) {
  lootBatches.push(loot)
}
mock.settleOfflineSpanByBlock = function (from, to) {
  blockSpans.push([from, to])
  this.clockGameTime = to
}
mock.saveData = () => {}
mock.pauseForOffspringFall = () => {
  throw new Error('离线扫荡不该再触发陨落暂停')
}

{
  const beforeRun = JSON.stringify(mock.secretRealm.run)
  const report = createOfflineReport({ fromGameSeconds: 0, toGameSeconds: 0, mode: 'secret_realm' })
  const spanDays = 30
  const cap = sweepLimitOf(mock.secretRealm.highestBossCleared)
  const per = Math.max(timeCostDaysOf(mock.secretRealm.highestBossCleared), 1)
  const expectedSweeps = Math.floor(spanDays / per)
  mock.settleOfflineSecretRealmSweep({ from: 0, to: spanDays * DAY, report })
  check('秘境：cap = 第 10 层（已通 Boss 层）', cap, 10)
  check('秘境：每趟天数 = ceil(cap ÷ 10)', per, 1)
  check('秘境：趟数 = floor(天数 ÷ 每趟天数)', lootBatches.length, expectedSweeps)
  check('秘境：趟数 > 0（样本有意义）', expectedSweeps > 0, true)
  check('秘境：统计 sweeps 与趟数一致', mock.secretRealm.stats.sweeps, expectedSweeps)
  check('秘境：dungeonTotalRuns 与趟数一致', mock.dungeonTotalRuns, expectedSweeps)
  check('秘境：dungeonTotalRewards 与趟数一致', mock.dungeonTotalRewards, expectedSweeps)
  check('秘境：进行中的 run 冻结（逐位不变）', JSON.stringify(mock.secretRealm.run), beforeRun)
  check('秘境：不写首破（bossFirstClears 不变）', JSON.stringify(mock.secretRealm.bossFirstClears), JSON.stringify({ 1: true, 2: true }))
  check('秘境：不给 50 层首杀（finalBossFirstKill 不变）', mock.secretRealm.finalBossFirstKill, false)
  check('秘境：陨落不暂停（报告没有 pausedByFall）', !!report.pausedByFall, false)
  check('秘境：整段离线仍推进内宅/封地（一次块跨度）', blockSpans.length, 1)
  check('秘境：块跨度覆盖整段离线', blockSpans[0][1] - blockSpans[0][0], spanDays * DAY)
  // 每趟只吃 cap + difficulty：扫荡不掉高一阶箱、不带首破加成
  check(
    '秘境：扫荡掉落不带首破 / 加成宝箱',
    lootBatches.every(loot => !(Number(loot?.bonusChests) > 0)),
    true
  )
}

// 余数不结算：29 天、每趟 1 天 → 29 趟
{
  lootBatches.length = 0
  blockSpans = []
  mock.dungeonTotalRuns = 0
  mock.secretRealm.stats.sweeps = 0
  const report = createOfflineReport({ mode: 'secret_realm' })
  mock.settleOfflineSecretRealmSweep({ from: 0, to: 29 * DAY, report })
  check('秘境：29 天 ÷ 1 天/趟 = 29 趟', lootBatches.length, 29)
}

// cap = 0：一层 Boss 都没通 → 不产出，只推进时间
{
  lootBatches.length = 0
  blockSpans = []
  const savedCleared = mock.secretRealm.highestBossCleared
  mock.secretRealm.highestBossCleared = 0
  const report = createOfflineReport({ mode: 'secret_realm' })
  mock.settleOfflineSecretRealmSweep({ from: 0, to: 10 * DAY, report })
  check('秘境：cap = 0 不产掉落', lootBatches.length, 0)
  check('秘境：cap = 0 仍推进时间（块结算一次）', blockSpans.length, 1)
  mock.secretRealm.highestBossCleared = savedCleared
}

// 每趟 2 天：30 天 → 15 趟
{
  lootBatches.length = 0
  mock.secretRealm.highestBossCleared = 20
  const per = Math.max(timeCostDaysOf(20), 1)
  const report = createOfflineReport({ mode: 'secret_realm' })
  mock.settleOfflineSecretRealmSweep({ from: 0, to: 30 * DAY, report })
  check('秘境：每趟 2 天 → 30 天扫 15 趟', per, 2)
  check('秘境：趟数 = floor(30 ÷ 2)', lootBatches.length, 15)
}

// ================= 六、开关与回滚路径 =================
check('开关：探索期望值默认开', OFFLINE_TUNING.explorationExpect, true)
check('开关：秘境扫荡默认开', OFFLINE_TUNING.secretSweep, true)
check('回滚路径：探索逐窗口函数仍在', typeof mock.settleOfflineExplorationPerWindow, 'function')
check('回滚路径：秘境续跑函数仍在', typeof mock.settleOfflineSecretRealmRun, 'function')
check('入口：探索走期望值', typeof mock.settleOfflineExplorationExpectation, 'function')
check('入口：秘境走扫荡', typeof mock.settleOfflineSecretRealmSweep, 'function')
check('离线养伤 = 12 游戏小时（0.5 天，不是设计稿写的 12 天）', OFFLINE_TUNING.injuryGameSeconds, 12 * 3600)
check('秘境难度字段仍传给扫荡（不读 run）', SECRET_TUNING.floorsPerDifficulty, 50)

// ================= 汇总 =================
if (LIST) {
  for (const label of labels) console.log(label)
} else {
  for (const r of results) {
    if (!r.ok) console.log(`✗ ${r.label}\n   实际: ${r.actual}\n   期望: ${typeof r.expected === 'object' ? JSON.stringify(r.expected) : r.expected}`)
  }
  const passed = results.length - failures
  console.log(`${passed}/${results.length} 通过${skipped ? `（跳过 ${skipped}）` : ''}`)
  if (failures) process.exitCode = 1
}
