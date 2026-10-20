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
  rollItemTier
} from '../src/plugins/exploration.js'
import { CATEGORY_ORDER, eventWeightTable } from '../src/plugins/locations.js'
import {
  autoPickBuff,
  buffInfoOf,
  buffListOf,
  buildOffspringUnit,
  floorKind,
  canFight,
  makeUnit,
  pickBuffOptions,
  rollFloorLoot,
  runSegment,
  runTimeTarget,
  shrineBonuses,
  simulateBattle,
  sweepLimitOf,
  sweepLoot
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
check('只保留剩余时长', rebased.state.taskDurationSeconds, 1.5 * H)

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
check('灵茶园同阶兜底 = T4', firstItemOf(tea).tier, 4)
const wildHerb = rollExploreEvent({ location: L1, eventId: 'cl_herb', playerLevel: 1, rng: () => 0.5 })
check('发现灵植 → 灵植', firstItemOf(wildHerb).category, '灵植')
const vine = rollExploreEvent({ location: L2, eventId: 'zl_vine', playerLevel: 3, rng: () => 0.5 })
check('发现古藤 → 灵植 / 藤', `${firstItemOf(vine).category}/${firstItemOf(vine).itemType}`, '灵植/藤')
const boneWolf = rollExploreEvent({ location: L1, eventId: 'cl_wolf', playerLevel: 1, rng: () => 0.1 })
check('T1 战斗宁可给二阶骨材，也不换类型', `${firstItemOf(boneWolf).itemType}/T${firstItemOf(boneWolf).tier}`, '骨材/T2')
check('T1 采集恒一阶', firstItemOf(wildHerb).tier, 1)
check('T2 mixed 本阶 = 2', rollItemTier({ mapTier: 2, rng: () => 0.6999 }), 2)
check('T2 mixed 低一阶 = 1', rollItemTier({ mapTier: 2, rng: () => 0.7 }), 1)
check('T4 primary = 4', rollItemTier({ mapTier: 4, policy: 'primary' }), 4)
check('T1 mixed 恒一阶', rollItemTier({ mapTier: 1, rng: () => 0.9 }), 1)
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
check('练气宝匣 1–2 阶', chestTierForLevel(1, () => 0.1), 1)
check('练气宝匣高阶', chestTierForLevel(1, () => 0.6), 2)
check('筑基宝匣 2–3 阶', chestTierForLevel(11, () => 0.6), 3)
check('结丹宝匣 3–4 阶', chestTierForLevel(15, () => 0.6), 4)
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

// ================= 四、秘境楼层 / 扫荡 / 首破 =================
check('4 层普通', floorKind(4), 'normal')
check('5 层 Boss', floorKind(5), 'boss')
check('10 层大 Boss', floorKind(10), 'bigBoss')
check('15 层 Boss', floorKind(15), 'boss')
check('未通 Boss 不可扫荡', sweepLimitOf(0), 0)
check('通 10 → 扫到 10', sweepLimitOf(10), 10)
check('卡 14 → 扫到 10', sweepLimitOf(14), 10)
check('通 15 → 扫到 15', sweepLimitOf(15), 15)
check('5 天成本', runTimeTarget(1000), 1000 + 5 * DAY)

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

const firstLoot = rollFloorLoot(10, { kind: 'boss', firstClear: true }, () => 0.99)
const repeatLoot = rollFloorLoot(10, { kind: 'boss', firstClear: false }, () => 0.99)
checkTrue('首破大子更多', firstLoot.secular > repeatLoot.secular)
check('重复打不写首破', repeatLoot.firstClear, false)
check('扫荡不含首破', sweepLoot(10, seeded(2)).firstClear, false)

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

// ================= 七、子嗣战力 / 英烈祠过滤 =================
const now = 2 * year
const lowChild = { ...newOffspring({ id: 'c_low', name: '低', birthTime: 0, hasRoot: true, realmLevel: 9, quality: 'low', rootCount: 5, traits: [] }) }
const topChild = { ...newOffspring({ id: 'c_top', name: '高', birthTime: 0, hasRoot: true, realmLevel: 9, quality: 'top', rootCount: 1, traits: [{ grade: 'legend' }] }) }
const lowUnit = buildOffspringUnit(lowChild, { nowSeconds: now })
const topUnit = buildOffspringUnit(topChild, { nowSeconds: now })
checkTrue('极品/单灵根战力更高', topUnit.stats.damage > lowUnit.stats.damage)
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
