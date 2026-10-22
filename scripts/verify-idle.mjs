// 三大挂机系统（模式层 / 探索 / 秘境）纯函数断言 —— 与 verify-dayloop.mjs 同一套风格。
//
// 全部用注入的 rng，不做统计断言。覆盖：
//   模式转换、回镇守重锚、探索事件、秘境楼层/扫荡/首破、多单位战斗、子嗣战力、英烈祠。
//
// ⚠ 新增纯函数时先问自己：能不能在这里用常量 rng 钉死边界？能就加一条。
import { readFileSync } from 'node:fs'

import {
  MODES,
  canEnterMode,
  injuryLabelOf,
  injuryUntilOf,
  isInjuredAt,
  modeOfRoute
} from '../src/plugins/idleMode.js'
import {
  TUNING as DAY_TUNING,
  createDayState,
  rebaseDayState,
  stepDay
} from '../src/plugins/dayLoop.js'
import {
  TUNING as EXP_TUNING,
  QI_ART_DROP_POOL,
  advanceExploration,
  availableLocations,
  battleWinChanceOf,
  canEnterLocation,
  chestTierForLevel,
  createExplorationSession,
  eventIntervalSeconds,
  formatRewardSummary,
  locationById,
  pickEventAt,
  rollExploreEvent,
  rollItemTier,
  tierBandOf
} from '../src/plugins/exploration.js'
import { CATEGORY_ORDER, eventWeightTable } from '../src/plugins/locations.js'
import {
  autoPickBuff,
  buffInfoOf,
  buffListOf,
  buildEnemy,
  buildOffspringUnit,
  chestCountOf,
  chestTierOfDifficulty,
  difficultyClearedOf,
  difficultyProgressOf,
  floorKind,
  canFight,
  makeUnit,
  pickBuffOptions,
  realmCoefOf,
  rollFloorLoot,
  runSegment,
  shrineBonuses,
  simulateBattle,
  sweepLimitOf,
  sweepLoot,
  timeCostDaysOf,
  timeCostTargetOf,
  withDifficultyProgress
} from '../src/plugins/secretRealm.js'
import { newOffspring } from '../src/plugins/innerCourtData.js'
import {
  randomOffspringName,
  rollOffspringGender,
  legacyOffspringGender
} from '../src/plugins/innerCourt.js'

const H = 3600
const DAY = 86400

let failures = 0
let skipped = 0
const results = []
const labels = []
const FILTER = (process.env.VERIFY_FILTER || '').toLowerCase()
const LIST = process.argv.includes('--list')
const eq = (a, b) =>
  typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-6 : a === b
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
const checkTrue = (label, actual) => check(label, !!actual, true)

/** 确定性 LCG：同一 seed 必须跑出同一串 */
const seeded = seed => {
  let s = (Number(seed) >>> 0) || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

// ================= 一、模式层 =================
check('路由 / → 镇守', modeOfRoute('/'), MODES.GARRISON)
check('路由 /exploration → 探索', modeOfRoute('/exploration'), MODES.EXPLORATION)
check('路由 /dungeon → 秘境', modeOfRoute('/dungeon'), MODES.SECRET_REALM)
check('管理页不表态', modeOfRoute('/inventory'), null)

checkTrue('镇守 → 探索（未受伤）', canEnterMode({ target: MODES.EXPLORATION, activeMode: MODES.GARRISON }).ok)
check('受伤禁止出发探索', canEnterMode({
  target: MODES.EXPLORATION,
  activeMode: MODES.GARRISON,
  injured: true
}).ok, false)
check('受伤可以回镇守', canEnterMode({
  target: MODES.GARRISON,
  activeMode: MODES.EXPLORATION,
  injured: true
}).ok, true)
check('挑战中禁止切走', canEnterMode({
  target: MODES.GARRISON,
  activeMode: MODES.SECRET_REALM,
  runActive: true
}).ok, false)
check('探索中禁止直接进秘境', canEnterMode({
  target: MODES.SECRET_REALM,
  activeMode: MODES.EXPLORATION
}).ok, false)

const injuredUntil = injuryUntilOf(1000)
check('探索养伤 = 半天（12 游戏小时）', injuredUntil, 1000 + DAY / 2)
check('养伤标签 = 12 游戏小时', injuryLabelOf(), '12 游戏小时')
checkTrue('到期前 1 秒仍在养伤', isInjuredAt(injuredUntil - 1, injuredUntil))
check('到期那一刻解除', isInjuredAt(injuredUntil, injuredUntil), false)

// ================= 二、回镇守重锚 =================
const dayCtx = { stamina: 145, staminaMax: 145, idleWifeCount: 0 }
const morning = createDayState({ nowSeconds: 7 * H, patrolHours: 2 })
const leftAt = 7.5 * H
const rebased = rebaseDayState(morning, 9 * H, { leftAtSeconds: leftAt })
check('同一天重锚不换天', rebased.freshDay, false)
check('重锚后 lastSeconds = now', rebased.state.lastSeconds, 9 * H)
check('保留当前阶段', rebased.state.phase, morning.phase)
check('保留任务类型', rebased.state.taskKind, morning.taskKind)
// 2026-10-22：createDayState 改成按当日时刻接续后，7:00 建出的巡逻只到 8:00；
// 7:30 离开 → 回来只剩 0.5 小时，而不是旧行为里从 7:00 再排满 2 小时。
check('只保留剩余时长', rebased.state.taskDurationSeconds, 0.5 * H)

const advanced = stepDay(rebased.state, 9.5 * H, dayCtx)
const advancedSeconds = advanced.slices.reduce((s, x) => s + x.gameSeconds, 0)
check('归来后只结算 0.5 小时', advancedSeconds, 0.5 * H)

const nextDay = rebaseDayState(morning, 7 * H + DAY, { leftAtSeconds: leftAt })
check('跨工作日 → 全新一天', nextDay.freshDay, true)
const sleeping = { ...morning, phase: 'sleep' }
check('睡觉中重锚 → 全新一天', rebaseDayState(sleeping, 9 * H, { leftAtSeconds: leftAt }).freshDay, true)

// ================= 三、探索 v1.0 =================
const L1 = locationById('changling_xiangwai')
const L2 = locationById('zhulieren_shankou')
const L3 = locationById('changling_guanwai')
const L4 = locationById('feiying_zhenwai')

check('四图：长岭乡外', L1?.name, '长岭乡外')
check('四图：诸猎人山口', L2?.name, '诸猎人山口')
check('四图：长岭关外', L3?.name, '长岭关外')
check('四图：飞鹰镇外', L4?.name, '飞鹰镇外')
check(
  '四图事件数 16 / 17 / 18 / 18',
  [L1.events.length, L2.events.length, L3.events.length, L4.events.length].join(','),
  '16,17,18,18'
)
const allEvents = [L1, L2, L3, L4].flatMap(location => location.events)
check('事件 id 全局唯一', new Set(allEvents.map(event => event.id)).size, 69)
check(
  '事件大类都在七类内',
  allEvents.every(event => CATEGORY_ORDER.includes(event.category)),
  true
)
check(
  '四图权重合计 100',
  [L1, L2, L3, L4]
    .map(location => eventWeightTable(location).reduce((sum, row) => sum + row.weightPct, 0))
    .every(sum => Math.abs(sum - 100) < 1e-6),
  true
)
check('长岭乡外空包均分 8.75', eventWeightTable(L1)[0].weightPct, 8.75)
check('长岭关外奇遇：古修洞府 1%', pickEventAt(L3, 0.9001)?.name, '古修洞府')
check('长岭关外奇遇：无字石碑 4%', pickEventAt(L3, 0.92)?.name, '无字石碑')
check('长岭关外 95% 之后是叙事', pickEventAt(L3, 0.95)?.name, '商队遇劫')
check('飞鹰镇外：传承印记边界', pickEventAt(L4, 0.93)?.name, '传承印记')
check('飞鹰镇外：秘境入口边界', pickEventAt(L4, 0.94)?.name, '秘境入口')
check('长岭乡外：灵泉 5%', pickEventAt(L1, 0.9001)?.name, '灵泉')
check('事件间隔 = 2 游戏小时', eventIntervalSeconds(EXP_TUNING), 2 * H)

// ---- 进入门槛与胜率 ----
check('练气二层不可进诸猎人山口', canEnterLocation(2, L2), false)
check('练气三层可进诸猎人山口', canEnterLocation(3, L2), true)
check('availableLocations 1 层 = 1 张', availableLocations(1).length, 1)
check('availableLocations 3 层 = 2 张', availableLocations(3).length, 2)
check('availableLocations 6 层 = 3 张', availableLocations(6).length, 3)
check('availableLocations 9 层 = 4 张', availableLocations(9).length, 4)
check('同境界胜率 70%', battleWinChanceOf(1, 1), 0.7)
check('高 1 小境界胜率 90%', battleWinChanceOf(2, 1), 0.9)
check('高 2 小境界胜率 100%', battleWinChanceOf(3, 1), 1)
check('低于地图境界胜率 0', battleWinChanceOf(0, 1), 0)

const winEdge = rollExploreEvent({
  location: L1,
  eventId: 'cl_wolf',
  playerLevel: 1,
  rng: () => 0.6999
})
check('同境界 rng=0.6999 → 胜', winEdge.kind, 'battle')
const loseEdge = rollExploreEvent({
  location: L1,
  eventId: 'cl_wolf',
  playerLevel: 1,
  rng: () => 0.7
})
check('同境界 rng=0.70 → 败', loseEdge.kind, 'defeat')
check('战败不给奖励', loseEdge.rewards.length, 0)

// ---- 奖励解析 ----
const firstItemOf = result => result.rewards.find(reward => reward.type === 'item')

const orchard = rollExploreEvent({ location: L1, eventId: 'cl_orchard', playerLevel: 1, rng: () => 0.5 })
check('灵果园 → 灵材 / 果', `${firstItemOf(orchard).category}/${firstItemOf(orchard).itemType}`, '灵材/果')
const flowerPatch = rollExploreEvent({ location: L1, eventId: 'cl_flower', playerLevel: 1, rng: () => 0.5 })
check('灵花丛 → 灵材 / 花', `${firstItemOf(flowerPatch).category}/${firstItemOf(flowerPatch).itemType}`, '灵材/花')
const tea = rollExploreEvent({ location: L4, eventId: 'fy_tea', playerLevel: 9, rng: () => 0.5 })
check('灵茶园 → 灵材（叶/花/果）', firstItemOf(tea).category, '灵材')
checkTrue('灵茶园 fallback 到同阶花/果', ['叶', '花', '果'].includes(firstItemOf(tea).itemType))
check('灵茶园兜底 = 二阶（练气段高阶）', firstItemOf(tea).tier, 2)
const wildHerb = rollExploreEvent({ location: L1, eventId: 'cl_herb', playerLevel: 1, rng: () => 0.5 })
check('发现灵植 → 灵植', firstItemOf(wildHerb).category, '灵植')
const vine = rollExploreEvent({ location: L2, eventId: 'zl_vine', playerLevel: 3, rng: () => 0.5 })
check('发现古藤 → 灵植 / 藤', `${firstItemOf(vine).category}/${firstItemOf(vine).itemType}`, '灵植/藤')
const boneWolf = rollExploreEvent({ location: L1, eventId: 'cl_wolf', playerLevel: 1, rng: () => 0.1 })
check('T1 战斗宁可给二阶骨材，也不换类型', `${firstItemOf(boneWolf).itemType}/T${firstItemOf(boneWolf).tier}`, '骨材/T2')
check('长岭乡外采集恒一阶', firstItemOf(wildHerb).tier, 1)

// ---- 掉落阶 = 境界段 + 地图 depth 加权（2026-10-22 P30）----
check('练气段 = 一/二阶', `${tierBandOf(1).low}/${tierBandOf(9).high}`, '1/2')
check('筑基段 = 二/三阶', `${tierBandOf(11).low}/${tierBandOf(11).high}`, '2/3')
check('结丹段 = 三/四阶', `${tierBandOf(15).low}/${tierBandOf(15).high}`, '3/4')
check('长岭乡外恒一阶（0% 高阶）', rollItemTier({ playerLevel: 1, highTierChance: 0, rng: () => 0.9 }), 1)
check(
  '长岭关外 rng 0.59 → 二阶（60% 高阶）',
  rollItemTier({ playerLevel: 6, highTierChance: 0.6, rng: () => 0.59 }),
  2
)
check(
  '长岭关外 rng 0.6 → 一阶',
  rollItemTier({ playerLevel: 6, highTierChance: 0.6, rng: () => 0.6 }),
  1
)
check('练气六层绝不会掉三阶', rollItemTier({ playerLevel: 6, highTierChance: 0.6, rng: () => 0.59 }) < 3, true)
check('policy high = 段内高阶（练气 → 二阶）', rollItemTier({ playerLevel: 6, policy: 'high' }), 2)
check('policy low = 段内低阶（练气 → 一阶）', rollItemTier({ playerLevel: 6, policy: 'low' }), 1)
checkTrue('灵石奖励类型是 spiritual_stone', boneWolf.rewards.some(r => r.type === 'spiritual_stone'))

const noBattleDuel = rollExploreEvent({
  location: L4,
  eventId: 'fy_duel',
  playerLevel: 9,
  rng: () => 0.99
})
check('散修斗法波及不掷胜率 → find', noBattleDuel.kind, 'find')
checkTrue('散修斗法波及仍有灵石', noBattleDuel.rewards.some(r => r.type === 'spiritual_stone'))

check(
  '所有非空包事件都有奖励',
  allEvents
    .filter(event => event.category !== 'nothing')
    .every(event => {
      const location = [L1, L2, L3, L4].find(l => l.events.includes(event))
      return rollExploreEvent({
        location,
        eventId: event.id,
        playerLevel: location.minLevel,
        rng: () => 0.5
      }).rewards.length > 0
    }),
  true
)
check(
  '所有空包事件都没有奖励',
  allEvents
    .filter(event => event.category === 'nothing')
    .every(event => {
      const location = [L1, L2, L3, L4].find(l => l.events.includes(event))
      const result = rollExploreEvent({ location, eventId: event.id, playerLevel: location.minLevel, rng: () => 0.5 })
      return result.kind === 'nothing' && result.rewards.length === 0
    }),
  true
)

check(
  '结算文案：灵石 +6 · 灵植【回春草】×2 · 丹方残页 +1',
  formatRewardSummary([
    { type: 'spiritual_stone', amount: 6 },
    { type: 'item', category: '灵植', name: '回春草', count: 2 },
    { type: 'pill_fragment', amount: 1 }
  ]),
  '灵石 +6 · 灵植【回春草】×2 · 丹方残页 +1'
)
check(
  '结算文案：宝匣（一阶）×1',
  formatRewardSummary([{ type: 'chest', tier: 1 }]),
  '宝匣（一阶）×1'
)
check('结算文案：习得《兽吼功》', formatRewardSummary([{ type: 'qi_art', name: '兽吼功' }]), '习得《兽吼功》')

// ---- 功法 ----
const stele = rollExploreEvent({ location: L3, eventId: 'cg_stele', playerLevel: 6, rng: () => 0.1 })
check('无字石碑给练气篇功法', stele.rewards.find(r => r.type === 'qi_art')?.artId && true, true)
checkTrue('功法池只有练气三本', QI_ART_DROP_POOL.includes(stele.rewards.find(r => r.type === 'qi_art').artId))
const steleDone = rollExploreEvent({
  location: L3,
  eventId: 'cg_stele',
  playerLevel: 6,
  knownQiArts: [...QI_ART_DROP_POOL],
  rng: () => 0.1
})
check('功法集齐 → 不再掉功法', steleDone.rewards.some(r => r.type === 'qi_art'), false)
check('功法集齐 → 转 2 残页', steleDone.rewards.find(r => r.type === 'pill_fragment')?.amount, 2)
checkTrue('功法集齐改用 textMiss 文案', steleDone.text.includes('残篇'))
const sigil = rollExploreEvent({ location: L4, eventId: 'fy_sigil', playerLevel: 9, rng: () => 0.1 })
check('传承印记给功法', sigil.rewards.some(r => r.type === 'qi_art'), true)

// ---- 宝匣 ----
const cave = rollExploreEvent({ location: L3, eventId: 'cg_cave', playerLevel: 6, rng: () => 0.1 })
check('古修洞府必给宝匣', cave.rewards.some(r => r.type === 'chest'), true)
check('练气宝匣：长岭乡外恒一阶', chestTierForLevel(1, () => 0.1, 0), 1)
check('练气宝匣：长岭关外 60% 二阶（rng 0.59）', chestTierForLevel(6, () => 0.59, 0.6), 2)
check('练气宝匣：长岭关外 rng 0.6 → 一阶', chestTierForLevel(6, () => 0.6, 0.6), 1)
check('筑基宝匣 2–3 阶', chestTierForLevel(11, () => 0.59, 0.6), 3)
check('结丹宝匣 3–4 阶', chestTierForLevel(15, () => 0.59, 0.6), 4)
const rift = rollExploreEvent({ location: L4, eventId: 'fy_rift', playerLevel: 9, rng: () => 0.5 })
check('秘境入口不给宝匣', rift.rewards.some(r => r.type === 'chest'), false)
check('秘境入口文案不含宝匣', rift.text.includes('宝匣'), false)
check(
  '长岭乡外 / 诸猎人山口没有宝匣事件',
  [L1, L2].every(location => location.events.every(event => !event.reward?.chest)),
  true
)

// ---- 叙事 ----
const caravan = rollExploreEvent({ location: L3, eventId: 'cg_caravan', playerLevel: 6, rng: () => 0.5 })
check('叙事事件 kind = narrative', caravan.kind, 'narrative')
check('叙事自动选善意分支', caravan.narrative?.label, '拔刀相助')
checkTrue('叙事不会战败', caravan.kind !== 'defeat')
checkTrue('叙事有灵石', caravan.rewards.some(r => r.type === 'spiritual_stone'))

// ---- 会话推进 ----
const session = createExplorationSession({ nowSeconds: 0, locationId: L1.id })
check('第一次事件在 2h 后', session.nextEventAt, 2 * H)
const expCtx = { location: L1, playerLevel: 1, knownQiArts: [], tuning: EXP_TUNING }

const sixHours = advanceExploration(session, 6 * H, expCtx, () => 0.5)
check('推进 6h 结算 3 次', sixHours.state.stats.events, 3)
check('下一次事件锚点 8h', sixHours.state.nextEventAt, 8 * H)
checkTrue('流水账带结算后缀', sixHours.state.log.some(entry => entry.text.includes('+')))
check(
  'stats 与 resolutions 汇总一致',
  sixHours.state.stats.stones,
  sixHours.resolutions.reduce((sum, r) => sum + r.rewards.filter(x => x.type === 'spiritual_stone').reduce((s, x) => s + x.amount, 0), 0)
)

const day = advanceExploration(createExplorationSession({ nowSeconds: 0, locationId: L1.id }), 24 * H, expCtx, () => 0.5)
check('推进 24h = 12 次', day.resolutions.length, 12)
check('24h 后锚点 26h', day.state.nextEventAt, 26 * H)

// 分段推进与一次推进必须完全一致（证明不依赖视图计时器）
let stepState = createExplorationSession({ nowSeconds: 0, locationId: L1.id })
const stepRng = seeded(11)
for (let i = 1; i <= 3; i += 1) {
  stepState = advanceExploration(stepState, i * 2 * H, expCtx, stepRng).state
}
const oneShot = advanceExploration(
  createExplorationSession({ nowSeconds: 0, locationId: L1.id }),
  6 * H,
  expCtx,
  seeded(11)
)
check('分段与一次推进事件数一致', stepState.stats.events, oneShot.state.stats.events)
check('分段与一次推进锚点一致', stepState.nextEventAt, oneShot.state.nextEventAt)
check(
  '分段与一次推进日志一致',
  stepState.log.map(x => x.text).join('|'),
  oneShot.state.log.map(x => x.text).join('|')
)

// 同境界 70%：rng 恒 0.7 → 抽到战斗类且 0.7 >= 0.7 必败
const defeatCtx = { location: L3, playerLevel: 6, knownQiArts: [], tuning: EXP_TUNING }
const defeated = advanceExploration(
  createExplorationSession({ nowSeconds: 0, locationId: L3.id }),
  30 * H,
  defeatCtx,
  () => 0.7
)
check('战败返回 defeated', defeated.defeated, true)
check('战败后停止探索', defeated.state.active, false)
check('战败只结算一次', defeated.resolutions.length, 1)
check('战败时间是事件发生时刻，不是 tick 末尾', defeated.resolutions[0].at, 2 * H)
check('战败 stats.losses +1', defeated.state.stats.losses, 1)

const capped = advanceExploration(
  createExplorationSession({ nowSeconds: 0, locationId: L1.id }),
  100 * H,
  expCtx,
  () => 0.5
)
check('单 tick 最多 24 个事件', capped.resolutions.length, 24)
check('被 cap 后剩余留到下一 tick（50h）', capped.state.nextEventAt, 50 * H)
check('流水账上限生效', advanceExploration(
  createExplorationSession({ nowSeconds: 0, locationId: L1.id }),
  20 * H,
  { ...expCtx, tuning: { ...EXP_TUNING, logLimit: 3 } },
  () => 0.5
).state.log.length, 3)

// ================= 四、秘境楼层 / 扫荡 / 时间 / 宝匣 / 首破 =================
// 2026-10-21 Q1 定稿：难度 1~∞、每难度 50 层、Boss 每 5 层、50 层大 Boss。
check('4 层普通', floorKind(4), 'normal')
check('5 层 Boss', floorKind(5), 'boss')
check('10 层不再是「大 Boss」，只是普通 Boss', floorKind(10), 'boss')
check('15 层 Boss', floorKind(15), 'boss')
check('50 层大 Boss', floorKind(50), 'bigBoss')
check('未通 Boss 不可扫荡', sweepLimitOf(0), 0)
check('通 10 → 扫到 10', sweepLimitOf(10), 10)
check('卡 14 → 扫到 10', sweepLimitOf(14), 10)
check('通 15 → 扫到 15', sweepLimitOf(15), 15)
check('卡 49 层 → 只扫到 45', sweepLimitOf(49), 45)
check('老档 60 层封顶到 50（本难度只有 50 层）', sweepLimitOf(60), 50)

// 时间 = ceil(已通关 Boss 层 / 10)；0 层不扣
check('一层 Boss 都没通 → 0 天', timeCostDaysOf(0), 0)
check('通 4 层（无 Boss）→ 0 天', timeCostDaysOf(4), 0)
check('通 5 层 → 1 天', timeCostDaysOf(5), 1)
check('通 10 层 → 1 天', timeCostDaysOf(10), 1)
check('通 15 层 → 2 天', timeCostDaysOf(15), 2)
check('卡 23 层（只通 20 Boss）→ 2 天', timeCostDaysOf(23), 2)
check('满 50 层 → 5 天', timeCostDaysOf(50), 5)
check('时间目标时刻按通关层数算', timeCostTargetOf(1000, 20), 1000 + 2 * DAY)

// 宝匣阶只看难度：1–10 一阶 / 11–20 二阶 / 21–30 三阶 / 31–40 四阶 / 41+ 五阶
check('难度 1 → 一阶宝匣', chestTierOfDifficulty(1), 1)
check('难度 10 → 一阶宝匣', chestTierOfDifficulty(10), 1)
check('难度 11 → 二阶宝匣', chestTierOfDifficulty(11), 2)
check('难度 21 → 三阶宝匣', chestTierOfDifficulty(21), 3)
check('难度 31 → 四阶宝匣', chestTierOfDifficulty(31), 4)
check('难度 41 → 五阶宝匣', chestTierOfDifficulty(41), 5)
check('难度 100 封顶五阶', chestTierOfDifficulty(100), 5)
// 每 5 层 1 个
check('通 10 层 → 2 个宝匣', chestCountOf(10), 2)
check('通 20 层 → 4 个宝匣', chestCountOf(20), 4)
check('满 50 层 → 10 个宝匣', chestCountOf(50), 10)
check('49 层 → 9 个宝匣（45 层那个已通）', chestCountOf(49), 9)
// 难度解锁
check('49 层不算通关难度', difficultyClearedOf(49), false)
check('50 层算通关难度', difficultyClearedOf(50), true)

// 难度进度槽（P24b：已解锁难度可回刷，进度必须按难度隔离）
const progMap = withDifficultyProgress({}, 1, {
  highestFloor: 50,
  highestBossCleared: 50,
  bossFirstClears: { 5: true, 50: true },
  finalBossFirstKill: true
})
check('进度槽写入后能读回最高层', difficultyProgressOf(progMap, 1).highestFloor, 50)
check('进度槽按难度隔离（难度 2 是空的）', difficultyProgressOf(progMap, 2).highestFloor, 0)
check('进度槽首杀标记隔离', difficultyProgressOf(progMap, 2).finalBossFirstKill, false)
check('进度槽首破账本隔离', Object.keys(difficultyProgressOf(progMap, 2).bossFirstClears).length, 0)
check('写入返回新对象（不改入参）', progMap === withDifficultyProgress(progMap, 1, {}), false)
const progRef = difficultyProgressOf(progMap, 1)
progRef.bossFirstClears['9'] = true
check(
  '读出的首破账本是副本，改它不影响进度槽',
  Object.keys(difficultyProgressOf(progMap, 1).bossFirstClears).length,
  2
)

const year = DAY * 365
// 2026-10-20：出战门槛 = **有灵根 + 练气二层**（不再看年龄）。
const gateChild = { hasRoot: true, status: 'alive', birthTime: 0, realmLevel: 1 }
check('练气一层不能出战', canFight(gateChild, 140 * DAY), false)
check('练气二层可出战', canFight({ ...gateChild, realmLevel: 2 }, 140 * DAY), true)
check('★无灵根子嗣不能出战', canFight({ ...gateChild, hasRoot: false, realmLevel: 9 }, year * 2), false)

const bonus0 = shrineBonuses(0)
const bonus5 = shrineBonuses(5)
const bonus99 = shrineBonuses(99)
check('英烈祠 0 牌位', bonus0.cultivationBonus, 0)
check('英烈祠 5 牌位 → +5%', bonus5.cultivationBonus, 0.05)
check('英烈祠打坐加成封顶 +10%', bonus99.cultivationBonus, 0.1)
check('英烈祠灵根加成封顶 +1%', bonus99.rootChanceBonus, 0.01)

const buffs = pickBuffOptions(5, seeded(9))
check('Buff 恰好 3 个', buffs.length, 3)
check('Buff 不重复', new Set(buffs.map(b => b.id)).size, 3)
const epic = { id: 'x', name: 'x', description: '', quality: 'epic' }
const common = { id: 'y', name: 'y', description: '', quality: 'common' }
check('自动选品质最高', autoPickBuff([common, epic]).id, 'x')

// 本轮已获得的 Buff：run.buffs 只存 id，UI 靠这两个函数反查
const healInfo = buffInfoOf('heal')
check('Buff 反查：名称', healInfo?.name, '气血增加')
check('Buff 反查：品质来自池键', healInfo?.quality, 'common')
check('Buff 反查：描述非空', !!healInfo?.description, true)
check('Buff 反查：未知 id 返回 null', buffInfoOf('no_such_buff'), null)
check('Buff 列表过滤未知 id', buffListOf(['heal', 'no_such_buff']).length, 1)
check('Buff 列表保留重复项（合并交给 UI）', buffListOf(['heal', 'heal']).length, 2)

// 灵石 = round((20 + 8×层数) × 倍率 / 9)（《数值真值表》§6.4，总 ÷9）
check('1 层灵石 = round(28/9) = 3', rollFloorLoot(1, {}, () => 0.99).spiritual, 3)
check('普通层不给宝匣', rollFloorLoot(1, {}, () => 0.99).chests, 0)
const boss10Loot = rollFloorLoot(10, { kind: 'boss', difficulty: 1 }, () => 0.99)
check('10 层 Boss 灵石 = round(200/9) = 22', boss10Loot.spiritual, 22)
check('10 层 Boss 给 1 个宝匣', boss10Loot.chests, 1)
check('难度 1 的 Boss 宝匣一阶', boss10Loot.chestTier, 1)
check('难度 11 的 Boss 宝匣二阶', rollFloorLoot(10, { kind: 'boss', difficulty: 11 }, () => 0.99).chestTier, 2)
check('50 层大 Boss 灵石 = round(1260/9) = 140', rollFloorLoot(50, { kind: 'bigBoss' }, () => 0.99).spiritual, 140)

const firstLoot = rollFloorLoot(10, { kind: 'boss', firstClear: true }, () => 0.99)
const repeatLoot = rollFloorLoot(10, { kind: 'boss', firstClear: false }, () => 0.99)
checkTrue('首破灵石更多', firstLoot.spiritual > repeatLoot.spiritual)
check('首破固定 +200 灵石', firstLoot.spiritual - repeatLoot.spiritual, 200)
check('重复打不写首破', repeatLoot.firstClear, false)
check('扫荡不含首破', sweepLoot(10, seeded(2)).firstClear, false)
// 1~50 层累计对照《数值真值表》§6.4：1,558 灵石 / 10 个宝匣
const sweep50 = sweepLoot(50, seeded(3))
check('满 50 层扫荡 = 1,558 灵石', sweep50.spiritual, 1558)
check('满 50 层扫荡 = 10 个宝匣', sweep50.chests, 10)
check('扫荡宝匣一阶（难度 1）', sweep50.chestTier, 1)

// ================= 五、多单位战斗 =================
const strongAlly = () =>
  makeUnit({
    uid: 'player',
    source: 'player',
    name: '桂冈',
    stats: { health: 1e9, damage: 1e9, defense: 1e9, speed: 999 }
  })
const weakEnemy = () =>
  makeUnit({
    uid: 'enemy:1',
    source: 'enemy',
    name: '小妖',
    stats: { health: 10, damage: 1, defense: 0, speed: 1 }
  })

const win = simulateBattle({ allies: [strongAlly()], enemies: [weakEnemy()], autoRetreatPct: 0 }, seeded(1))
check('强队获胜', win.outcome, 'victory')
checkTrue('胜利有帧', win.frames.length > 0)

const fragileAlly = () =>
  makeUnit({
    uid: 'off:1',
    source: 'offspring',
    refId: 'c_1',
    name: '桂大',
    stats: { health: 10, damage: 1, defense: 0, speed: 1 }
  })
const lethalEnemy = () =>
  makeUnit({
    uid: 'enemy:5',
    source: 'enemy',
    name: '守关妖将',
    stats: { health: 1e9, damage: 1e6, defense: 1e9, speed: 999 }
  })

const retreat = simulateBattle(
  { allies: [fragileAlly()], enemies: [lethalEnemy()], autoRetreatPct: 20, permadeath: false },
  seeded(2)
)
check('低血线自动撤退', retreat.outcome, 'retreated')
check('撤退不产生陨落', retreat.deaths.length, 0)

// 2026-10-22：灵宠不参与自动撤退 —— 宠物吃致命伤可以倒地，但不能把全队拖回家。
const glassPet = () =>
  makeUnit({
    uid: 'pet:1',
    source: 'pet',
    name: '玄龟',
    stats: { health: 10, damage: 1, defense: 0, speed: 2 }
  })
const petRetreat = simulateBattle(
  {
    allies: [
      makeUnit({
        uid: 'player',
        source: 'player',
        name: '桂冈',
        stats: { health: 1e9, damage: 1e9, defense: 1e9, speed: 1 }
      }),
      glassPet()
    ],
    enemies: [
      makeUnit({
        uid: 'enemy:9',
        source: 'enemy',
        name: '一刀妖',
        stats: { health: 10, damage: 1e6, defense: 0, speed: 999 }
      })
    ],
    autoRetreatPct: 20,
    permadeath: false
  },
  seeded(2)
)
check('灵宠阵亡不触发全队撤退', petRetreat.outcome !== 'retreated', true)
check('灵宠阵亡不记陨落', petRetreat.deaths.length, 0)

const wipe = simulateBattle(
  { allies: [fragileAlly()], enemies: [lethalEnemy()], autoRetreatPct: 0, permadeath: true },
  seeded(2)
)
check('关闭撤退 → 战败', wipe.outcome, 'defeat')
check('关闭撤退 → 子嗣陨落', wipe.deaths.length, 1)
check('陨落单位标记 fallen', wipe.allies[0].status, 'fallen')

const slow = makeUnit({
  uid: 'player',
  source: 'player',
  name: '慢',
  stats: { health: 1000, damage: 1, defense: 0, speed: 1 }
})
const fast = makeUnit({
  uid: 'off:fast',
  source: 'offspring',
  name: '快',
  stats: { health: 1000, damage: 1, defense: 0, speed: 100 }
})
const harmlessEnemy = () =>
  makeUnit({
    uid: 'enemy:order',
    source: 'enemy',
    name: '木桩',
    stats: { health: 1e9, damage: 1, defense: 0, speed: 1 }
  })
const order = simulateBattle(
  { allies: [slow, fast], enemies: [harmlessEnemy()], autoRetreatPct: 0 },
  seeded(4)
)
const firstAttack = order.frames.find(f => f.type === 'attack' && String(f.attacker).startsWith('off:'))
checkTrue('速度快的先出手', firstAttack?.attacker === 'off:fast')

const detA = simulateBattle(
  { allies: [strongAlly(), fragileAlly()], enemies: [lethalEnemy()], autoRetreatPct: 20 },
  seeded(42)
)
const detB = simulateBattle(
  { allies: [strongAlly(), fragileAlly()], enemies: [lethalEnemy()], autoRetreatPct: 20 },
  seeded(42)
)
check('同 seed 结果一致', JSON.stringify(detA.frames), JSON.stringify(detB.frames))
check('同 seed 胜负一致', detA.outcome, detB.outcome)

// ================= 六、runSegment / 首破 =================
const runStart = {
  floor: 1,
  buffs: [],
  autoRetreatPct: 20,
  permadeath: false,
  highestFloorReached: 0
}
const seg1 = runSegment({
  run: runStart,
  partyBase: [strongAlly()],
  bossFirstClears: {},
  rng: seeded(5)
})
check('打完 5 层停在 Buff 门', seg1.run.status, 'buff')
check('下一层是 6', seg1.run.floor, 6)
check('5 层首破记录', seg1.firstClears['5'], true)
checkTrue('首破掉落在本段 loot 里', seg1.loot.firstClear)

const seg2 = runSegment({
  run: { ...runStart, floor: 5 },
  partyBase: [strongAlly()],
  bossFirstClears: { 5: true },
  rng: seeded(6)
})
check('重复打 5 层不写首破', !!seg2.loot.firstClear, false)

const lost = runSegment({
  run: runStart,
  partyBase: [fragileAlly()],
  bossFirstClears: {},
  rng: seeded(7)
})
check('打不过 → finished', lost.run.status, 'finished')
checkTrue('战败结果有 outcome', !!lost.result?.outcome)

// 打穿 50 层 = 通关本难度：一次性首杀（高一阶宝匣 + 洗命符），之后不再给
const finalSeg = runSegment({
  run: { ...runStart, floor: 46, highestFloorReached: 45, difficulty: 1 },
  partyBase: [strongAlly()],
  bossFirstClears: {},
  rng: seeded(11)
})
check('打穿 50 层 → 通关本难度', finalSeg.result?.clearedDifficulty, true)
check('通关后状态 finished', finalSeg.run.status, 'finished')
check('50 层首杀给 1 个高一阶宝匣', finalSeg.loot.bonusChests, 1)
check('50 层首杀宝匣封顶五阶', finalSeg.loot.bonusChestTier, 2)
check('50 层首杀给 1 张洗命符', finalSeg.loot.fateCharms, 1)
check('本趟 46~50 层共 1 个 Boss 宝匣（50 层）', finalSeg.loot.chests, 1)

const finalSegAgain = runSegment({
  run: { ...runStart, floor: 46, highestFloorReached: 45, difficulty: 1, finalBossFirstKill: true },
  partyBase: [strongAlly()],
  bossFirstClears: {},
  rng: seeded(11)
})
check('重复通关不再给首杀宝匣', finalSegAgain.loot.bonusChests, 0)
check('重复通关不再给洗命符', finalSegAgain.loot.fateCharms, 0)

// 怪物阈值曲线（2026-10-21 P25 反推）：敌人 = 基础值 × 境界系数(等效境界) × 4.5
// 等效境界 E = 难度 + (层数-1)/49 + 种类偏移（Boss 0.35 / 大 Boss 0.7）
const enemyD1F1 = buildEnemy(1, { difficulty: 1, rng: () => 0 })
const enemyD2F1 = buildEnemy(1, { difficulty: 2, rng: () => 0 })
const enemyD1F4 = buildEnemy(4, { difficulty: 1, rng: () => 0 })
const enemyD1F5 = buildEnemy(5, { difficulty: 1, rng: () => 0 })
const enemyD1F50 = buildEnemy(50, { difficulty: 1, rng: () => 0 })
const round2 = v => Math.round(v * 100) / 100
check('难度 1 第 1 层 = 等效境界 1.0（80 × 1.0 × 4.5）', round2(enemyD1F1.stats.maxHealth), 360)
check('难度 2 第 1 层 = 等效境界 2.0', round2(enemyD2F1.stats.maxHealth), 520)
// 难度 1 第 5 层 Boss：等效境界 1 + 4/49 + 0.35 = 1.4316
check('Boss 层 = 等效境界 1.43', round2(enemyD1F5.stats.maxHealth), 429.06)
check('Boss 层比前一普通层强（+0.35 个小境界）', enemyD1F5.stats.maxHealth > enemyD1F4.stats.maxHealth, true)
check(
  '50 层大 Boss + 难度内满层 = 等效境界 2.7',
  round2(enemyD1F50.stats.maxHealth),
  round2(80 * (1 + (2.7 - 1) * (4 / 9)) * 4.5)
)
check('难度不作用于速度', enemyD2F1.stats.speed, enemyD1F1.stats.speed)
check('层数作用于速度', enemyD1F50.stats.speed > enemyD1F1.stats.speed, true)

// 锚点（《三大挂机》§4.8）：练气二层、单灵根、3 人队，能打过难度 1 第 5 层 Boss。
// 统计断言，但用固定种子 —— 结果可复现；敌人曲线一改就会响。
const anchorChild = newOffspring({ id: 'anchor', name: '锚点', birthTime: 0, hasRoot: true, realmLevel: 2, rootCount: 1, traits: [] })
const anchorUnit = buildOffspringUnit(anchorChild, { nowSeconds: 2 * 365 * DAY })
const anchorRng = seeded(20261021)
let anchorWins = 0
const ANCHOR_N = 40
for (let i = 0; i < ANCHOR_N; i += 1) {
  const res = simulateBattle(
    {
      allies: [0, 1, 2].map(k => ({
        ...anchorUnit,
        uid: `anchor:${k}`,
        stats: { ...anchorUnit.stats },
        currentHealth: anchorUnit.stats.maxHealth,
        alive: true,
        stunned: false
      })),
      enemies: [buildEnemy(5, { difficulty: 1, rng: anchorRng })],
      autoRetreatPct: 0,
      permadeath: false,
      maxRounds: 30
    },
    anchorRng
  )
  if (res.outcome === 'victory') anchorWins += 1
}
check('锚点：练气二层三人队能过难度 1 第 5 层 Boss', anchorWins >= ANCHOR_N * 0.9, true)

// ================= 七、子嗣战力 / 英烈祠过滤 =================
const now = 2 * year
const lowChild = { ...newOffspring({ id: 'c_low', name: '低', birthTime: 0, hasRoot: true, realmLevel: 9, quality: 'low', rootCount: 5, traits: [] }) }
const topChild = { ...newOffspring({ id: 'c_top', name: '高', birthTime: 0, hasRoot: true, realmLevel: 9, quality: 'top', rootCount: 1, traits: [{ grade: 'legend' }] }) }
const lowUnit = buildOffspringUnit(lowChild, { nowSeconds: now })
const topUnit = buildOffspringUnit(topChild, { nowSeconds: now })
checkTrue('极品/单灵根战力更高', topUnit.stats.damage > lowUnit.stats.damage)

// Q3（2026-10-21）：四属性 = 基础 × 境界 × 灵根 × 本命 ×（1 + Σ词条），删品质与仙龄。
check('练气一层境界系数 1.0', realmCoefOf(1), 1)
check('练气十层境界系数 5.0', realmCoefOf(10), 5)
check('筑基境界系数 10', realmCoefOf(11), 10)
check('结丹境界系数 30', realmCoefOf(21), 30)
const qi2Child = { ...lowChild, realmLevel: 2, traits: [], fate: null }
const qi2 = buildOffspringUnit(qi2Child, { nowSeconds: now })
// 6 × (1 + 4/9) × 0.8（五灵根）= 6.933…
check('练气二层五灵根攻击 = 6.93', Math.round(qi2.stats.damage * 100) / 100, 6.93)
check(
  '品质不再影响战力（Q3 删除品质）',
  buildOffspringUnit({ ...qi2Child, quality: 'top' }, { nowSeconds: now }).stats.damage,
  qi2.stats.damage
)
check(
  '仙龄不再影响战力（Q3 删除仙龄）',
  buildOffspringUnit({ ...qi2Child, birthTime: now - 200 * DAY }, { nowSeconds: now }).stats.damage,
  qi2.stats.damage
)
check(
  '传说词条 +20%（加算）',
  Math.round(
    (buildOffspringUnit({ ...qi2Child, traits: [{ grade: 'legend' }] }, { nowSeconds: now }).stats.damage /
      qi2.stats.damage) *
      100
  ) / 100,
  1.2
)
check(
  '五阶本命 ×2.0',
  Math.round(
    (buildOffspringUnit({ ...qi2Child, fate: { tier: 5 } }, { nowSeconds: now }).stats.damage /
      qi2.stats.damage) *
      100
  ) / 100,
  2
)
check('练气一层不能出战', buildOffspringUnit({ ...lowChild, realmLevel: 1 }, { nowSeconds: now }), null)
check(
  '陨落子嗣不能出战',
  buildOffspringUnit({ ...lowChild, status: 'fallen' }, { nowSeconds: now }),
  null
)
check('新子嗣默认活着', newOffspring({ id: 'x' }).status, 'alive')

// ---------- 子嗣性别（Y 染规则的第一等字段） ----------
check('性别掷骰 0 → 男', rollOffspringGender(() => 0), 'male')
check('性别掷骰 0.499 → 男', rollOffspringGender(() => 0.499), 'male')
check('性别掷骰 0.5 → 女', rollOffspringGender(() => 0.5), 'female')
check('性别掷骰 0.999 → 女', rollOffspringGender(() => 0.999), 'female')
check('新子嗣模板默认有性别', newOffspring({ id: 'x' }).gender, 'male')
const legacySeed = { id: 'c_0001', name: '桂大' }
const legacyGender = legacyOffspringGender(legacySeed)
check('老档性别补齐稳定（刷新不重掷）', legacyOffspringGender({ ...legacySeed }), legacyGender)
checkTrue('老档性别落在 male/female', ['male', 'female'].includes(legacyGender))

// ---------- 子嗣命名 ----------
const seqRng = values => {
  const list = [...values]
  return () => (list.length ? list.shift() : 0)
}
check(
  '20% 彩蛋边界：0.199 走掌门路名池',
  randomOffspringName('桂冈', { existing: [], rng: seqRng([0.199, 0]) }),
  '桂光义'
)
check(
  '20% 彩蛋边界：0.2 走普通名池',
  randomOffspringName('桂冈', { existing: [], rng: seqRng([0.2, 0]) }),
  '桂青云'
)
check(
  '男名池：gender=male 抽普通池',
  randomOffspringName('桂冈', { existing: [], rng: seqRng([0.2, 0.2]), gender: 'male' }),
  '桂知行'
)
check(
  '女名池：gender=female 抽普通池',
  randomOffspringName('桂冈', { existing: [], rng: seqRng([0.2, 0.2]), gender: 'female' }),
  '桂听雨'
)
check(
  '女名池：gender=female 抽彩蛋池',
  randomOffspringName('桂冈', { existing: [], rng: seqRng([0, 0]), gender: 'female' }),
  '桂红儿'
)
const randomName = randomOffspringName('桂冈', { existing: [], rng: () => 0 })
check('随机名保留父姓', randomName.startsWith('桂'), true)
check('随机名取自掌门路彩蛋池', randomName, '桂光义')
check(
  '随机名避开已存在的名字',
  randomOffspringName('桂冈', { existing: ['桂光义'], rng: seqRng([0, 0, 0.01]) }),
  '桂晓生'
)
check(
  '彩蛋池撞满 → 字1+字2 组合兜底',
  randomOffspringName('桂冈', { existing: ['桂光义'], rng: () => 0 }),
  '桂云风'
)
let nameRng = [0.2, 0]
check(
  '普通池撞名后仍能从池内换名',
  randomOffspringName('桂冈', {
    existing: ['桂青云'],
    rng: () => nameRng.shift() ?? 0.01
  }),
  '桂长风'
)

// ================= 八、静态扫描 =================
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
for (const file of ['src/views/Exploration.vue', 'src/views/Dungeon.vue', 'src/composables/useRealmPlayback.js']) {
  check(`${file} 不含 setInterval`, /setInterval/.test(read(file)), false)
}
for (const file of [
  'src/plugins/idleMode.js',
  'src/plugins/locations.js',
  'src/plugins/exploration.js',
  'src/plugins/secretRealm.js'
]) {
  const source = read(file)
  const impure = /from\s+['"]vue['"]|from\s+['"]pinia['"]|\/stores\//.test(source)
  check(`${file} 不依赖 Vue/Pinia/store`, impure, false)
}

const explorationView = read('src/views/Exploration.vue')
check('Exploration.vue 不读旧奖励表', /location\.rewards/.test(explorationView), false)
check('Exploration.vue 不再显示大子/旧灵草', /da_zi|\bherb\b/.test(explorationView), false)
check('Exploration.vue 不再写「每游戏小时 1 次」', /每游戏小时 1 次/.test(explorationView), false)

// ================= 输出 =================
if (LIST) {
  for (const label of labels) console.log(`[LIST] ${label}`)
  console.log(`\n共 ${labels.length} 条断言${FILTER ? `（filter=${FILTER}）` : ''}`)
  process.exit(0)
}
console.log('')
for (const r of results) {
  if (r.ok) continue
  console.error(`[ 失败 ] ${r.label}  actual=${r.actual}  expected=${r.expected}`)
}
console.log(`\n${results.length - failures}/${results.length} 通过`)
if (failures > 0) {
  console.error(`\n${failures} 条断言失败\n`)
  process.exit(1)
}
console.log('全部通过 ✅\n')
