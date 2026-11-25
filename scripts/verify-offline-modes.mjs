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
import {
  TUNING as EXP_TUNING,
  createExplorationSession,
  locationById,
  pickEventFromTable,
  rollExploreEvent
} from '../src/plugins/exploration.js'
import { childEventWeightTable } from '../src/plugins/locations.js'
import { gainInto, stackKeyOf, unitsOf } from '../src/plugins/stacks.js'
import { TUNING as INNER_TUNING } from '../src/plugins/innerCourt.js'
import { resolveOffspringExpeditionDay } from '../src/plugins/offspringExpedition.js'
import {
  expeditionDayModelOf,
  planOffspringExpeditionExpectation
} from '../src/plugins/offspringExpect.js'
import { TUNING as SECRET_TUNING, sweepLimitOf, timeCostDaysOf } from '../src/plugins/secretRealm.js'
import {
  stochasticRound,
  expectedIntRangeOf,
  eventProbabilitiesOf,
  addExpectedRewardsOfEvent,
  mergeRewardsOf,
  planOfflineExplorationExpectation,
  resolveCoreBigEvent
} from '../src/plugins/explorationExpect.js'
import { ITEM_POOL } from '../src/plugins/items.js'
import { actions as explorationActions } from '../src/stores/modules/exploration.js'
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

// ================= 三之二、残碑（2026-11-22 S1）：指定功法残页的离线期望 =================
{
  const stele = (location.events || []).find(event => event.id === 'cl_stele')
  check('长岭乡外有残碑奇遇', !!stele, true)
  const acc = new Map()
  addExpectedRewardsOfEvent(acc, { event: stele, location, playerLevel: 1 }, 1)
  check(
    '残碑 1 次命中 = 2 张《双根御兽篇》残页',
    acc.get('qi_art_fragment|beast_vessel_dual')?.amount,
    2
  )
  const learnedAcc = new Map()
  addExpectedRewardsOfEvent(
    learnedAcc,
    { event: stele, location, playerLevel: 1, knownQiArts: ['beast_vessel_dual'] },
    1
  )
  check(
    '残碑学会后 1 次命中 = 2 张百艺残页',
    learnedAcc.get('fragment')?.amount,
    2
  )
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
  // 2026-11-26 #2：战败不再吃事件槽，期望与逐次掷骰都应打满 12 槽/天
  check('2,000 天事件数 = 12 × 天数（无养伤折损）', plan.events, simDays * 12)
  check('修为/经验类不产（探索不给修为）', rewards.some(r => r.type === 'cultivation'), false)
}

// ========== 四之二、金丹大事件：离线与在线同口径（§9.3 / R70，2026-11-21）==========
{
  const coreMap = locationById('siwang_zhaoze')
  const week = 7 * DAY
  const corePlan = planOfflineExplorationExpectation({
    location: coreMap,
    playerLevel: 21,
    fromSeconds: 0,
    toSeconds: week,
    tier: 'core',
    tuning: EXP_TUNING,
    rng: seeded(20261121)
  })
  const foundationPlan = planOfflineExplorationExpectation({
    location: coreMap,
    playerLevel: 21,
    fromSeconds: 0,
    toSeconds: week,
    tier: 'foundation',
    tuning: EXP_TUNING,
    rng: seeded(20261121)
  })
  const onlineBig = resolveCoreBigEvent({
    location: coreMap,
    playerLevel: 21,
    knownQiArts: [],
    tuning: EXP_TUNING,
    rng: seeded(20261121)
  })
  check('金丹离线：一周事件数 = 84 槽', corePlan.events, 84)
  // 2026-11-26 #2：各段同一公式，筑基也打满 84 槽（旧口径会扣养伤）
  check('筑基离线：一周事件数 = 84 槽（不再扣养伤）', foundationPlan.events, 84)
  check('金丹离线：一周奖励 = 在线一次大事件（逐位相同）', JSON.stringify(corePlan.rewards), JSON.stringify(onlineBig.rewards))
  check('金丹离线：胜场与在线一致', corePlan.wins, onlineBig.wins)
  check('金丹离线：败场与在线一致', corePlan.losses, onlineBig.losses)
  check('金丹离线：叙事数与在线一致', corePlan.narratives, onlineBig.narratives)
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
check('开关：子嗣历练期望值默认开', OFFLINE_TUNING.offspringExpect, true)
check('回滚路径：探索逐窗口函数仍在', typeof mock.settleOfflineExplorationPerWindow, 'function')
check('回滚路径：秘境续跑函数仍在', typeof mock.settleOfflineSecretRealmRun, 'function')
check('入口：探索走期望值', typeof mock.settleOfflineExplorationExpectation, 'function')
check('入口：秘境走扫荡', typeof mock.settleOfflineSecretRealmSweep, 'function')
check('秘境难度字段仍传给扫荡（不读 run）', SECRET_TUNING.floorsPerDifficulty, 50)

// ================= 七、子嗣历练期望值（P62 方向 6，2026-11-14） =================
// 测试目的：块化路径把「逐日状态机」换成闭式精确期望后，期望值必须与
// 「逐日逐事件掷骰」的统计结果一致，且不再被「一次战败作废整块」压掉产出。
{
  const E = INNER_TUNING.offspringExpedition
  const map = location // 长岭乡外（minLevel 1）
  const DAYS = 4000

  // ---------- 1. 必胜：战败概率 0 ⇒ 一天都不掉 ----
  {
    const level = map.minLevel + 2 // 跨两级 ⇒ 胜率 1
    const m = expeditionDayModelOf({ map, playerLevel: level, share: 1, expeditionTuning: E })
    check('历练模型：必胜 ⇒ 战败概率 0', m.defeatP, 0)
    check('历练模型：必胜 ⇒ 每天事件 = 12 × 0.8', m.eventsPerDay, withinPct(9.6, 1e-9))
    const plan = planOffspringExpeditionExpectation({
      map, playerLevel: level, days: DAYS, share: 1, expeditionTuning: E, rng: seeded(7)
    })
    check('历练期望：必胜 ⇒ 有效天数 = 全部天数', Math.round(plan.activeDays), DAYS)
    check('历练期望：必胜 ⇒ 事件数 = 9.6 × 天数', plan.events, v => Math.abs(v - 9.6 * DAYS) <= 1)
  }

  // ---------- 2. 有战败风险：闭式期望 vs 逐日逐事件模拟 ----
  // 逐日模拟就是在线那条路：战败只作废当次事件，当天剩余事件照常结算（2026-11-26 #2）。
  const simulate = (level, days, rng) => {
    const n = E.eventsPerDay * E.outputRatio
    const table = childEventWeightTable(map)
    let credit = 0
    let events = 0
    let defeats = 0
    for (let d = 0; d < days; d += 1) {
      credit += n
      const count = Math.floor(credit + 1e-9)
      credit = Math.round((credit - count) * 1e6) / 1e6
      for (let i = 0; i < count; i += 1) {
        const picked = pickEventFromTable(table, rng())
        if (!picked) break
        const ev = rollExploreEvent({
          location: map, eventId: picked.id, playerLevel: level, knownQiArts: [], rng, tuning: EXP_TUNING
        })
        events += 1
        if (ev.kind === 'defeat') defeats += 1
      }
    }
    return { events, defeats }
  }
  const level = map.minLevel // 同级 ⇒ 胜率 0.7，战败会真实发生
  const sim = simulate(level, DAYS, seeded(20261114))
  const plan = planOffspringExpeditionExpectation({
    map, playerLevel: level, days: DAYS, share: 1, expeditionTuning: E, rng: seeded(20261114)
  })
  check('历练期望：事件数与逐日模拟一致（±2%）', plan.events, withinPct(sim.events, 0.02))
  check('历练期望：战败次数与逐日模拟一致（±10%）', plan.losses, withinPct(sim.defeats, 0.1))
  check('历练期望：全部天数都算（无养伤日）', plan.activeDays, DAYS)

  // ---------- 3. 老档 injuryDays 不再影响块内期望 ----
  {
    const planLegacy = planOffspringExpeditionExpectation({
      map, playerLevel: level, days: 2, share: 1, injuredDays: 1, expeditionTuning: E, rng: seeded(3)
    })
    check('历练期望：老档 injuryDays 参数已忽略（2 天全算）', Math.round(planLegacy.activeDays), 2)
    check('历练期望：不再返回 injuredEnd', 'injuredEnd' in planLegacy, false)
  }

  // ---------- 4. 集成：纯函数走 expectation 分支 ----
  {
    const child = {
      id: 'verify-expedition-1',
      name: '验',
      status: 'alive',
      hasRoot: true,
      realmLevel: level,
      cultivation: 0,
      birthTime: 0,
      expeditionMode: 'explore',
      injuryDays: 0,
      expeditionCredit: 0
    }
    const { result } = resolveOffspringExpeditionDay({
      child,
      now: 400 * DAY,
      days: 180,
      expectation: true,
      tuning: INNER_TUNING,
      rng: seeded(20261114)
    })
    check('历练集成：expectation 分支事件数 > 0', result.events, v => v > 0)
    check(
      '历练集成：一块 180 天不再只出几十个事件（>1,000）',
      result.events,
      v => v > 1000
    )
    check('历练集成：报表地图已填', result.mapId, map.id)
  }
}


// ================= 八、落账批量等价（P62 方向 7，2026-11-14） =================
// 测试目的：家族工作 / 历练掉落改成「一次入 count 件」后，背包结果必须与逐件入包
// 逐位相同（可堆叠的并成一条带 count，灵器/灵宠仍按件各一条）。
{
  const stackable = { id: 'verify-stack-1', baseId: 'verify_base', category: '灵材', quality: 'common' }
  const once = []
  gainInto(once, stackable, 7)
  const many = []
  for (let i = 0; i < 7; i += 1) gainInto(many, stackable, 1)
  check('落账批量：可堆叠 ⇒ 一次入 7 件与逐件入包条目数相同', once.length, many.length)
  check('落账批量：可堆叠 ⇒ 件数相同', unitsOf(once[0]), unitsOf(many[0]))
  check('落账批量：可堆叠 ⇒ 件数 = 7', unitsOf(once[0]), 7)
  check('落账批量：可堆叠 ⇒ 合并键相同', stackKeyOf(once[0]), stackKeyOf(many[0]))

  const pet = { id: 'verify-pet-1', baseId: 'verify_pet', category: '灵宠', type: 'pet' }
  const pets = []
  gainInto(pets, pet, 3)
  check('落账批量：灵宠不合并 ⇒ 3 件仍是 3 条', pets.length, 3)
  check('落账批量：灵宠不合并 ⇒ 条目不带 count', pets.every(e => e.count == null), true)
}

// ================= 九、奖励合并落账（P62 阶段 H，2026-11-15） =================
// 测试目的：历练 / 桂冈探索改成「块内先合并、块末一次落账」后，必须保证
//   ① 合并键、件数、金额与原条目总和一致；② 不改入参；③ 认不出的类型不吞；
//   ④ 落账口认 `count`（宝匣/功法按件）；⑤ 舍入粒度变粗但期望无偏。
{
  const raw = [
    { type: 'item', baseId: 'b1', quality: 'common', name: '灵草', count: 2 },
    { type: 'item', baseId: 'b1', quality: 'common', name: '灵草', count: 3 },
    { type: 'item', baseId: 'b1', quality: 'fine', name: '灵草', count: 1 },
    { type: 'item', baseId: 'b2', quality: 'common', name: '矿石', count: 4 },
    { type: 'spiritual_stone', amount: 12 },
    { type: 'spiritual_stone', amount: 7 },
    { type: 'craft_fragment', amount: 1 },
    { type: 'craft_fragment', amount: 2 },
    { type: 'chest', tier: 2 },
    { type: 'chest', tier: 2 },
    { type: 'chest', tier: 3 },
    { type: 'qi_art_fragment', artId: 'a1', name: '甲' },
    { type: 'qi_art_fragment', artId: 'a1', name: '甲' },
    { type: 'unknown_thing', value: 9 }
  ]
  const merged = mergeRewardsOf(raw)
  const findItem = (baseId, quality) =>
    merged.find(r => r.type === 'item' && r.baseId === baseId && r.quality === quality)
  check('奖励合并：底材 + 成色相同的件数相加', findItem('b1', 'common')?.count, 5)
  check('奖励合并：成色不同不合并', merged.filter(r => r.type === 'item' && r.baseId === 'b1').length, 2)
  check('奖励合并：底材不同不合并', merged.filter(r => r.type === 'item').length, 3)
  check('奖励合并：物品总件数守恒', merged.filter(r => r.type === 'item').reduce((s, r) => s + r.count, 0), 10)
  check(
    '奖励合并：灵石金额相加',
    merged.filter(r => r.type === 'spiritual_stone').reduce((s, r) => s + r.amount, 0),
    19
  )
  check(
    '奖励合并：百艺残页相加',
    merged.filter(r => r.type === 'craft_fragment').reduce((s, r) => s + r.amount, 0),
    3
  )
  check('奖励合并：宝匣按阶合并成 count', merged.find(r => r.type === 'chest' && r.tier === 2)?.count, 2)
  check('奖励合并：宝匣不同阶分开', merged.filter(r => r.type === 'chest').length, 2)
  check('奖励合并：心法残页按 artId 合并', merged.find(r => r.type === 'qi_art_fragment')?.count, 2)
  check('奖励合并：未知类型原样保留', merged.filter(r => r.type === 'unknown_thing').length, 1)
  check('奖励合并：条目数 = 唯一桶数（3 物品 + 1 灵石 + 1 残页 + 2 宝匣 + 1 心法残页 + 1 未知）', merged.length, 9)
  check('奖励合并：不改入参', raw[0].count, 2)

  // 期望无偏：粒度从「逐条舍入」变「合计舍入」，均值必须对得上
  {
    const amounts = [2.4, 1.7, 0.6]
    const total = amounts.reduce((s, v) => s + v, 0)
    const rngA = seeded(20261115)
    const rngB = seeded(20261115)
    const N = 5000
    let perEntry = 0
    let mergedOnce = 0
    for (let i = 0; i < N; i += 1) {
      for (const v of amounts) perEntry += stochasticRound(v, rngA)
      mergedOnce += stochasticRound(total, rngB)
    }
    check('奖励合并：期望无偏（逐条舍入 vs 合计舍入，均值差 <1%）', mergedOnce / N, withinPct(perEntry / N, 0.01))
  }

  // 落账口认 count：宝匣按件、功法按次学
  {
    const calls = []
    const store = {
      pickRecipeFragmentId: () => '',
      gainChest: (tier, amount) => calls.push(['chest', tier, amount]),
      gainCurrency: (kind, amount) => calls.push(['currency', kind, amount]),
      gainItemCount: (item, count) => calls.push(['item', count]),
      gainRecipeFragment: id => calls.push(['recipe', id]),
      learnQiArt: artId => {
        calls.push(['learn', artId])
        return { success: true }
      },
      gainArtFragment: () => ({ success: true })
    }
    explorationActions.applyExplorationReward.call(store, { type: 'chest', tier: 2, count: 3 })
    check('奖励落账：宝匣 count=3 ⇒ 一次 gainChest(tier, 3)', JSON.stringify(calls), JSON.stringify([['chest', 2, 3]]))
    calls.length = 0
    explorationActions.applyExplorationReward.call(store, { type: 'chest', tier: 2 })
    check('奖励落账：宝匣缺 count ⇒ 按 1 件', JSON.stringify(calls), JSON.stringify([['chest', 2, 1]]))
    calls.length = 0
    explorationActions.applyExplorationReward.call(store, { type: 'qi_art', artId: 'a1' })
    check('奖励落账：功法缺 count ⇒ 只学 1 次', calls.length, 1)
    calls.length = 0
    explorationActions.applyExplorationReward.call(store, { type: 'qi_art', artId: 'a1', count: 3 })
    check('奖励落账：功法学 count 次（合并后不丢件）', calls.length, 3)
  }

  // 端到端：同一批奖励「逐条落账」与「合并后落账」的袋内结果逐位相同
  {
    const material = ITEM_POOL.find(it => it.category === '灵材' && Number(it.tier) === 1)
    const batch = []
    for (let i = 0; i < 6; i += 1) {
      batch.push({ type: 'item', baseId: material.id, quality: 'common', count: 1 })
      batch.push({ type: 'spiritual_stone', amount: 3 })
      batch.push({ type: 'chest', tier: 1 })
    }
    const makeStore = () => {
      const bag = []
      const stats = { stones: 0, chests: {} }
      return {
        bag,
        stats,
        pickRecipeFragmentId: () => '',
        gainChest: (tier, amount) => {
          stats.chests[tier] = (stats.chests[tier] || 0) + amount
        },
        gainCurrency: (kind, amount) => {
          stats.stones += amount
        },
        gainItemCount: (item, count) => gainInto(bag, item, count),
        gainRecipeFragment: () => {},
        learnQiArt: () => ({ success: true }),
        gainArtFragment: () => ({ success: true })
      }
    }
    const perEntryStore = makeStore()
    for (const reward of batch) explorationActions.applyExplorationReward.call(perEntryStore, reward)
    const mergedStore = makeStore()
    for (const reward of mergeRewardsOf(batch)) explorationActions.applyExplorationReward.call(mergedStore, reward)
    check('奖励合并：逐条 vs 合并 ⇒ 袋内条目数相同', mergedStore.bag.length, perEntryStore.bag.length)
    check('奖励合并：逐条 vs 合并 ⇒ 堆内件数相同', unitsOf(mergedStore.bag[0]), unitsOf(perEntryStore.bag[0]))
    check('奖励合并：逐条 vs 合并 ⇒ 灵石总数相同', mergedStore.stats.stones, perEntryStore.stats.stones)
    check('奖励合并：逐条 vs 合并 ⇒ 宝匣件数相同', mergedStore.stats.chests[1], perEntryStore.stats.chests[1])
  }
}

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
