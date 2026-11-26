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
  ART_DROP_KIND,
  artDropPoolOf,
  addRewardStats,
  advanceExploration,
  availableLocations,
  battleWinChanceOf,
  buildNarrativeOptions,
  canEnterLocation,
  chestTierForLevel,
  coreEventSlotsOf,
  createExplorationSession,
  eventIntervalSeconds,
  formatRewardSummary,
  locationById,
  pickEventAt,
  rollExploreEvent,
  rollItemTier,
  tierBandOf
} from '../src/plugins/exploration.js'
import { resolveCoreBigEvent } from '../src/plugins/explorationExpect.js'
import { realSecondsPerGameDayOf } from '../src/plugins/gameClock.js'
import { CATEGORY_ORDER, eventWeightTable, locations } from '../src/plugins/locations.js'
import { pickBaseItemForEvent } from '../src/plugins/items.js'
import { QI_ART_MAP } from '../src/plugins/cultivationData.js'
import { roguelikeOptions } from '../src/plugins/dungeon.js'
import {
  TUNING,
  DEATH_WARNING_TEXTS,
  oneShotRiskOf,
  permadeathOfRetreat,
  autoPickBuff,
  buffInfoOf,
  buffListOf,
  buildEnemy,
  buildOffspringUnit,
  buildPetUnit,
  buildPlayerUnit,
  chestBonusPicksOf,
  chestCountOf,
  combatPowerOf,
  chestTierOfDifficulty,
  difficultyPositionOf,
  clampStartFloor,
  difficultyClearedOf,
  difficultyProgressOf,
  emptyLoot,
  floorKind,
  // B16 #4（2026-11-07）：敌人 / 层名 / 难度名
  ENEMY_SEGMENTS_PER_TIER,
  enemyDescOf,
  enemyEntryOf,
  enemySegmentOf,
  floorBandNameOf,
  difficultyNameOf,
  difficultyCycleOf,
  ENEMY_NAME_TABLE,
  FLOOR_BANDS,
  DIFFICULTY_NAMES,
  // B11-a3（2026-11-08）：秘境消耗品
  applyConsumableEffectsOf,
  applyEnemyConsumableEffectsOf,
  // 2026-11-17 战斗模型批：层间余血 + 回血丹
  applyBuffIds,
  consumeHealPillsOf,
  HEAL_PILL_TUNING,
  normalizeConsumableStockOf,
  settleConsumablesOf,
  canFight,
  makeUnit,
  mergeLoot,
  pickBuffOptions,
  realmCoefOf,
  rollFloorLoot,
  runSegment,
  shrineBonuses,
  simulateBattle,
  startFloorLimitOf,
  sweepLimitOf,
  sweepLoot,
  timeCostDaysOf,
  timeCostTargetOf,
  withDifficultyProgress
} from '../src/plugins/secretRealm.js'
import {
  newOffspring,
  GENERATION_TABOO_SURNAMES,
  SINGLE_NAME_CHARS,
  SURNAMES,
  WIFE_GIVEN_NAMES,
  CULTIVATOR_SPOUSE_SURNAMES,
  CULTIVATOR_SPOUSE_NAMES
} from '../src/plugins/innerCourtData.js'
import {
  randomOffspringName,
  generationCharOf,
  GENERATION_USABLE_CHARS,
  rollOffspringGender,
  legacyOffspringGender,
  nextMortalRankOf,
  branchLabelOf,
  offspringDisplayNameOf,
  offspringNameConflictOf,
  cnUpperNumeral,
  specialNameOf
} from '../src/plugins/innerCourt.js'
import {
  OFFSPRING_EQUIP_SLOTS,
  equipmentSlotOfItem,
  canOffspringEquip,
  offspringMaxTierOf,
  offspringPanelOf,
  offspringEquipmentOf,
  eligibleOffspringItemsOf,
  isMortalGradeItem
} from '../src/plugins/offspringEquipment.js'
// 校准队伍的唯一构造口（`sim:realm` 的锚点断言与反推表共用）
import { calibrationParty } from './lib/sim-party.mjs'
// P43：灵兽同修 / 面板；零散 #3：初始等级按品阶 / 吞噬 / 兽苑
import {
  gardenSlotsOf,
  growPet,
  petDevourPlanOf,
  petInitialLevelOf,
  petLevelCapOf,
  petPanelOf,
  petSameSeriesOf,
  petTotalXpOf,
  petXpRequirementOf,
  relinkPetRecord
} from '../src/plugins/petUnit.js'
// 零散 #3：吞噬 / 兽苑的 store 编排（mock store，只测 action 本身）
import { actions as petStoreActions } from '../src/stores/modules/pets.js'

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
check('旧档养伤记录禁止出发探索', canEnterMode({
  target: MODES.EXPLORATION,
  activeMode: MODES.GARRISON,
  injured: true
}).ok, false)
check('旧档养伤记录可以回镇守', canEnterMode({
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

// 2026-11-26 #2：新战败不再产生养伤；`isInjuredAt` 只服务老档残留记录（左闭右开）
checkTrue('旧档养伤到期前 1 秒仍在养伤', isInjuredAt(999, 1000))
check('旧档养伤到期那一刻解除', isInjuredAt(1000, 1000), false)
check('没有养伤记录 = 不在养伤', isInjuredAt(1000, 0), false)

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
  '四图事件数 17 / 18 / 18 / 18（前两张多残碑）',
  [L1.events.length, L2.events.length, L3.events.length, L4.events.length].join(','),
  '17,18,18,18'
)
const allEvents = [L1, L2, L3, L4].flatMap(location => location.events)
check('事件 id 全局唯一', new Set(allEvents.map(event => event.id)).size, 71)
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
check('长岭乡外：残碑固定 4%', pickEventAt(L1, 0.9001)?.name, '残碑')
check('长岭乡外：残碑之后是灵泉 1%', pickEventAt(L1, 0.945)?.name, '灵泉')
check('诸猎人山口：残碑固定 4%', pickEventAt(L2, 0.9001)?.name, '残碑')
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
// 2026-11-01：战斗/拾遗已改成「灵材全类型」（药浴五系配平），所以兜底规则不再走探索路径，
// 直接钉 `pickBaseItemForEvent` 的类型回退：T1 没有骨材 → 换阶给 T2 骨材，不换成别的类型。
const boneFallback = pickBaseItemForEvent({ category: '灵材', types: ['骨材'], tier: 1, rng: () => 0.1 })
check('T1 骨材缺档 → 宁可给二阶骨材，也不换类型', `${boneFallback.type}/T${boneFallback.tier}`, '骨材/T2')
check('战斗 / 拾遗不再限定骨材（灵材全类型）', pickBaseItemForEvent({ category: '灵材', types: null, tier: 1, rng: () => 0.1 }).category, '灵材')
// 元素加权：目标系在池里就按权重重归一化抽，抽不到才退回均匀 —— 药浴五系配平的底层保证。
const biasedFire = pickBaseItemForEvent({
  category: '灵材',
  types: null,
  tier: 1,
  elements: { metal: 0, wood: 0, water: 0, fire: 1, earth: 0 },
  rng: () => 0.5
})
check('元素加权：只给火系权重 → 必出火系', biasedFire.fateElement, 'fire')
check('长岭乡外采集恒一阶', firstItemOf(wildHerb).tier, 1)

// ---- 掉落阶 = 境界段 + 地图 depth 加权（2026-10-22 P30）----
check('练气段 = 一/二阶', `${tierBandOf(1).low}/${tierBandOf(9).high}`, '1/2')
check('筑基段 = 二/三阶', `${tierBandOf(11).low}/${tierBandOf(11).high}`, '2/3')
check('金丹段 = 三/四阶（2026-10-30 起金丹从 21 层算）', `${tierBandOf(21).low}/${tierBandOf(21).high}`, '3/4')
check('筑基十层仍算筑基段（二/三阶）', `${tierBandOf(20).low}/${tierBandOf(20).high}`, '2/3')
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
      const result = rollExploreEvent({
        location,
        eventId: event.id,
        playerLevel: location.minLevel,
        rng: () => 0.5
      })
      // 叙事事件的奖励挂在「善意」选项上、等玩家选完才入账（§9.1），
      // 所以这里看选项里滚出来的那一份，而不是 result.rewards。
      if (result.kind === 'narrative') {
        return (result.narrative?.options?.find(o => o.id === 'help')?.rewards || []).length > 0
      }
      return result.rewards.length > 0
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
  '结算文案：灵石 +6 · 灵植【回春草】×2 · 百艺残页 +1',
  formatRewardSummary([
    { type: 'spiritual_stone', amount: 6 },
    { type: 'item', category: '灵植', name: '回春草', count: 2 },
    { type: 'craft_fragment', amount: 1 }
  ]),
  '灵石 +6 · 灵植【回春草】×2 · 百艺残页 +1'
)
check(
  '结算文案：宝匣（一阶）×1',
  formatRewardSummary([{ type: 'chest', tier: 1 }]),
  '宝匣（一阶）×1'
)
check('结算文案：习得《兽吼功》', formatRewardSummary([{ type: 'qi_art', name: '兽吼功' }]), '习得《兽吼功》')

// ---- 功法（2026-10-31：无字石碑 = 心法残页 / 传承印记 = 非心法整本）----
const stele = rollExploreEvent({ location: L3, eventId: 'cg_stele', playerLevel: 6, rng: () => 0.1 })
const steleFrag = stele.rewards.find(r => r.type === 'qi_art_fragment')
check('无字石碑给心法残页', steleFrag?.artId && true, true)
checkTrue('无字石碑只给心法', QI_ART_MAP[steleFrag.artId].category === '心法')
check('功法残页文案', formatRewardSummary([steleFrag]), `《${steleFrag.name}》残页 +1`)
const heartPool = artDropPoolOf(ART_DROP_KIND.heartFragment, 6)
check('心法池按练气段取 T1+T2', heartPool.length > 0 && heartPool.every(id => QI_ART_MAP[id].tier <= 2), true)
const steleDone = rollExploreEvent({
  location: L3,
  eventId: 'cg_stele',
  playerLevel: 6,
  knownQiArts: [...heartPool],
  rng: () => 0.1
})
check('心法全学 → 不再掉残页', steleDone.rewards.some(r => r.type === 'qi_art_fragment'), false)
check('心法全学 → 转 2 残页', steleDone.rewards.find(r => r.type === 'craft_fragment')?.amount, 2)
checkTrue('心法全学改用 textMiss 文案', steleDone.text.includes('残篇'))
const sigil = rollExploreEvent({ location: L4, eventId: 'fy_sigil', playerLevel: 9, rng: () => 0.1 })
const sigilArt = sigil.rewards.find(r => r.type === 'qi_art')
check('传承印记给整本', sigilArt?.artId && true, true)
checkTrue('传承印记只给非心法', QI_ART_MAP[sigilArt.artId].category !== '心法')
check('传承印记不产残页', sigil.rewards.some(r => r.type === 'qi_art_fragment'), false)

// ---- 残碑（2026-11-22 S1）：指定书名、残页 ×2、学会转百艺残页；不做保底 ----
const ruin = rollExploreEvent({ location: L1, eventId: 'cl_stele', playerLevel: 1, rng: () => 0.1 })
const ruinFrag = ruin.rewards.find(r => r.type === 'qi_art_fragment')
check('残碑指定《双根御兽篇》残页', ruinFrag?.artId, 'beast_vessel_dual')
check('残碑一次给 2 张残页', ruinFrag?.count, 2)
check('残碑残页文案 +2', formatRewardSummary([ruinFrag]), '《双根御兽篇》残页 +2')
const ruinLearned = rollExploreEvent({
  location: L1,
  eventId: 'cl_stele',
  playerLevel: 1,
  knownQiArts: ['beast_vessel_dual'],
  rng: () => 0.1
})
check('残碑学会后不产该本残页', ruinLearned.rewards.some(r => r.type === 'qi_art_fragment'), false)
check('残碑学会后转 2 张百艺残页', ruinLearned.rewards.find(r => r.type === 'craft_fragment')?.amount, 2)
checkTrue('残碑学会后改用 textMiss 文案', ruinLearned.text.includes('旁注'))
check('残碑不做事件保底（2026-11-22 删）', 'pityGameDays' in L1.events.find(e => e.id === 'cl_stele'), false)

// ---- 宝匣 ----
const cave = rollExploreEvent({ location: L3, eventId: 'cg_cave', playerLevel: 6, rng: () => 0.1 })
check('古修洞府必给宝匣', cave.rewards.some(r => r.type === 'chest'), true)
check('练气宝匣：长岭乡外恒一阶', chestTierForLevel(1, () => 0.1, 0), 1)
check('练气宝匣：长岭关外 60% 二阶（rng 0.59）', chestTierForLevel(6, () => 0.59, 0.6), 2)
check('练气宝匣：长岭关外 rng 0.6 → 一阶', chestTierForLevel(6, () => 0.6, 0.6), 1)
check('筑基宝匣 2–3 阶', chestTierForLevel(11, () => 0.59, 0.6), 3)
check('金丹宝匣 3–4 阶', chestTierForLevel(21, () => 0.59, 0.6), 4)
const rift = rollExploreEvent({ location: L4, eventId: 'fy_rift', playerLevel: 9, rng: () => 0.5 })
check('秘境入口不给宝匣', rift.rewards.some(r => r.type === 'chest'), false)
check('秘境入口文案不含宝匣', rift.text.includes('宝匣'), false)
check(
  '长岭乡外 / 诸猎人山口没有宝匣事件',
  [L1, L2].every(location => location.events.every(event => !event.reward?.chest)),
  true
)

// ---- 叙事（《探索系统》§9.1 弹窗两选一）----
const caravan = rollExploreEvent({ location: L3, eventId: 'cg_caravan', playerLevel: 6, rng: () => 0.5 })
check('叙事事件 kind = narrative', caravan.kind, 'narrative')
check('叙事默认自动选善意', caravan.narrative?.autoChoice, 'help')
check('叙事只有善意 / 离开两支', caravan.narrative?.options.map(o => o.id).join(','), 'help,leave')
check(
  '叙事善意分支带灵石',
  caravan.narrative.options.find(o => o.id === 'help').rewards.some(r => r.type === 'spiritual_stone'),
  true
)
check('叙事离开分支没有奖励', caravan.narrative.options.find(o => o.id === 'leave').rewards.length, 0)
check('叙事结算时不落奖励（等玩家选）', caravan.rewards.length, 0)
checkTrue('叙事不会战败', caravan.kind !== 'defeat')
checkTrue('叙事文案不再带旧版「（你选择…）」后缀', !caravan.text.includes('你选择'))

const narrativeEvents = [L1, L2, L3, L4].flatMap(location =>
  (location.events || []).filter(event => event.category === 'narrative')
)
check('四图共 8 条叙事事件', narrativeEvents.length, 8)
check(
  '叙事事件都是善意 + 离开两支',
  narrativeEvents.every(event => event.narrative?.options?.map(o => o.id).join(',') === 'help,leave'),
  true
)
check(
  '叙事的选项都有标签与结果文案',
  narrativeEvents.every(event => event.narrative.options.every(o => !!o.label && !!o.text)),
  true
)
check(
  '叙事奖励只挂在善意分支上',
  narrativeEvents.every(
    event =>
      event.narrative.options.find(o => o.id === 'help').reward &&
      !event.narrative.options.find(o => o.id === 'leave').reward
  ),
  true
)

// 叙事选项的纯函数：只滚善意分支（rng 消耗与旧版一致）
const optBag = buildNarrativeOptions(
  {
    id: 'test_narrative',
    category: 'narrative',
    text: '测试',
    narrative: {
      options: [
        { id: 'help', label: '相助', text: '帮了', reward: { stones: [2, 2] } },
        { id: 'leave', label: '离开', text: '走了' }
      ]
    }
  },
  { location: L1, playerLevel: 1, rng: () => 0.5 }
)
check('选项纯函数：善意分支滚出奖励', optBag.find(o => o.id === 'help').rewards.length, 1)
check('选项纯函数：离开分支没有奖励', optBag.find(o => o.id === 'leave').rewards.length, 0)
check(
  '选项纯函数：超时默认善意',
  rollExploreEvent({ location: L3, eventId: 'cg_caravan', playerLevel: 6, rng: () => 0.5 }).narrative.autoChoice,
  'help'
)
check('奖励统计：累加到已有 stats', addRewardStats({ stones: 1 }, [{ type: 'spiritual_stone', amount: 3 }]).stones, 4)
check('奖励统计：老档缺键当 0', addRewardStats({}, [{ type: 'chest', tier: 1 }]).chests, 1)
check('叙事超时 20 现实秒', EXP_TUNING.narrativeTimeoutRealSeconds, 20)
check('叙事队列上限 3', EXP_TUNING.narrativeQueueLimit, 3)

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
// 2026-11-26 #2：战败只作废当次事件，**不停探索、不回镇守**（《探索系统》§八）
check('战败后继续探索', defeated.state.active, true)
check('战败不再中止后续事件（30h = 15 槽全部结算）', defeated.resolutions.length, 15)
check('战败时间是事件发生时刻，不是 tick 末尾', defeated.resolutions[0].at, 2 * H)
check('战败 stats.losses 按实际败场累计', defeated.state.stats.losses, 15)
check(
  '战败文案不再提「回家养伤」',
  defeated.resolutions[0].text.includes('养伤'),
  false
)

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

// ================= 三之一、金丹大事件（《探索系统》§9.3，2026-11-21）=================
// 口径：每 1 游戏周结算一个大事件，收益 = 84 个旧事件槽；期望 + 随机舍入；**不产养伤**。
const GC = locationById('siwang_zhaoze')
check('金丹大事件：间隔 = 1 游戏周', eventIntervalSeconds(EXP_TUNING, 'core'), 7 * 24 * H)
check('金丹大事件：筑基仍 2 游戏小时', eventIntervalSeconds(EXP_TUNING, 'foundation'), 2 * H)
check('金丹大事件：练气仍 2 游戏小时', eventIntervalSeconds(EXP_TUNING), 2 * H)
check('金丹大事件：K = 84 个旧事件槽', coreEventSlotsOf(EXP_TUNING), 84)
check('金丹大事件：7 游戏天 = 4.0 现实秒', Math.round(realSecondsPerGameDayOf('core') * 7 * 100) / 100, 4)
check(
  '金丹大事件：关掉开关就回到 2 小时',
  eventIntervalSeconds({ ...EXP_TUNING, coreBigEvent: false }, 'core'),
  2 * H
)

const coreSession = createExplorationSession({ nowSeconds: 0, locationId: GC.id, tier: 'core' })
check('金丹会话：首次事件锚在 7 天后', coreSession.nextEventAt, 7 * 24 * H)
check('金丹会话：记下境界段', coreSession.tier, 'core')

const coreCtx = {
  location: GC,
  playerLevel: 21,
  knownQiArts: [],
  tuning: EXP_TUNING,
  tier: 'core',
  resolveEvent: resolveCoreBigEvent
}
const twoWeeks = advanceExploration(coreSession, 14 * 24 * H, coreCtx, seeded(7))
check('金丹：两周结算 2 个大事件', twoWeeks.resolutions.length, 2)
check('金丹：大事件 kind = big', twoWeeks.resolutions[0].kind, 'big')
check('金丹：一条大事件 = 84 槽', twoWeeks.resolutions[0].eventCount, 84)
check('金丹：stats.events 按槽计（84 × 2）', twoWeeks.state.stats.events, 168)
check('金丹：一条大事件只写一条流水', twoWeeks.state.log.length, 2)
check('金丹：大事件永不战败', twoWeeks.defeated, false)
checkTrue('金丹：流水是「行了一周」战报', twoWeeks.state.log.every(entry => entry.text.includes('行了一周')))
check('金丹：大事件产出非空', twoWeeks.resolutions[0].rewards.length > 0, true)

// 换段重锚：练气会话破了金丹，不能拿「2 游戏小时的等待」换 84 槽收益
const qiSession = createExplorationSession({ nowSeconds: 0, locationId: L1.id })
const switched = advanceExploration(qiSession, H, { ...expCtx, tier: 'core' }, () => 0.5)
check('换段重锚：当拍不结算', switched.resolutions.length, 0)
check('换段重锚：锚到 H + 7 天', switched.state.nextEventAt, H + 7 * 24 * H)
check('换段重锚：段字段已更新', switched.state.tier, 'core')

// 老档没有 tier 字段：练气 / 筑基间隔不变 ⇒ 只补字段、不动锚点
const legacySession = { ...createExplorationSession({ nowSeconds: 0, locationId: L1.id }) }
delete legacySession.tier
const legacyAdvance = advanceExploration(legacySession, 2 * H, expCtx, () => 0.5)
check('老档补 tier：不吞掉这一拍的事件', legacyAdvance.resolutions.length, 1)
check('老档补 tier：字段补成 qi', legacyAdvance.state.tier, 'qi')

// 结算后缀条数上限（大事件一次几十条，流水折成十几行不可读）
const manyRows = Array.from({ length: 5 }, (_, i) => ({ type: 'item', category: '灵植', name: `草${i}`, count: 1 }))
check(
  '结算后缀：超过上限补「等 N 项」',
  formatRewardSummary(manyRows, { maxEntries: 2 }).endsWith('等 5 项'),
  true
)
check('结算后缀：默认不截断', formatRewardSummary(manyRows).includes('等'), false)

// ================= 三之二、筑基四图（2026-11-01 B9-a）=================
// 真源《探索系统》§2.2 / §6.5~6.8。结构照抄练气四图，解锁 11 / 14 / 17 / 20。
const B1 = locationById('qingshi_gudao')
const B2 = locationById('wanshou_gukou')
const B3 = locationById('kugu_zhanchang')
const B4 = locationById('dihuo_duanya')
const baseMaps = [B1, B2, B3, B4]

check('筑基四图：一线天峡谷', B1?.name, '一线天峡谷')
check('筑基四图：七连寨', B2?.name, '七连寨')
check('筑基四图：炼石废墟', B3?.name, '炼石废墟')
check('筑基四图：地火断崖', B4?.name, '地火断崖')
check(
  '筑基四图解锁 11 / 14 / 17 / 20',
  baseMaps.map(location => location.minLevel).join(','),
  '11,14,17,20'
)
check(
  '筑基四图事件数 16 / 17 / 18 / 18',
  baseMaps.map(location => location.events.length).join(','),
  '16,17,18,18'
)
check(
  '筑基四图段内高阶 0 / 30 / 60 / 90%',
  baseMaps.map(location => location.highTierChance).join(','),
  '0,0.3,0.6,0.9'
)
const everyEvent = [...locations].flatMap(location => location.events)
check('十六图事件 id 全局唯一', new Set(everyEvent.map(event => event.id)).size, everyEvent.length)
check('十六图事件总数 209', everyEvent.length, 209)
check(
  '十六图权重合计 100',
  [...locations]
    .map(location => eventWeightTable(location).reduce((sum, row) => sum + row.weightPct, 0))
    .every(sum => Math.abs(sum - 100) < 1e-6),
  true
)
check('不可越阶：练气十层进不了一线天峡谷', canEnterLocation(10, B1), false)
check('筑基一层可进一线天峡谷', canEnterLocation(11, B1), true)
check('availableLocations 11 层 = 5 张', availableLocations(11).length, 5)
check('availableLocations 14 层 = 6 张', availableLocations(14).length, 6)
check('availableLocations 20 层 = 8 张', availableLocations(20).length, 8)
check('筑基段掉阶：低二阶', tierBandOf(11).low, 2)
check('筑基段掉阶：高三阶', tierBandOf(20).high, 3)

/**
 * 每游戏天（名义 12 事件）的灵石期望 —— 与《真值表》§6.3 的推导同一口径：
 * 战斗类（非 noBattle）乘 0.70 胜率、叙事类只算 autoChoice 那一支。
 */
const stoneExpectationOf = location => {
  const avgStones = range => (Array.isArray(range) ? (Number(range[0]) + Number(range[1])) / 2 : 0)
  const perEvent = eventWeightTable(location).reduce((sum, { event, weightPct }) => {
    let reward = event.reward || {}
    if (event.category === 'narrative') {
      const chosen = (event.narrative?.options || []).find(x => x.id === event.narrative?.autoChoice)
      reward = chosen?.reward || {}
    }
    const value = avgStones(reward.stones) * (event.category === 'battle' && !event.noBattle ? 0.7 : 1)
    return sum + (value * weightPct) / 100
  }, 0)
  return perEvent * 12
}

const baseStones = stoneExpectationOf(L4)
// 目标 = 飞鹰镇外 × realmCoefAt(minLevel) / realmCoefAt(9)；容差 ±8%（占位数值，B8 重定价）
const BASE_TARGET_RATIO = [2.195, 2.927, 3.659, 4.39]
for (const [index, location] of baseMaps.entries()) {
  const ratio = stoneExpectationOf(location) / baseStones
  const target = BASE_TARGET_RATIO[index]
  check(
    `筑基图 ${index + 1} 灵石/天 ≈ 飞鹰镇外 ×${target}（±8%）`,
    Math.abs(ratio - target) / target < 0.08,
    true
  )
}
check(
  '灵石/天逐图递增',
  baseMaps.map(location => Math.round(stoneExpectationOf(location))).every(
    (value, index, arr) => index === 0 || value > arr[index - 1]
  ),
  true
)

// ================= 三之三、金丹四图（2026-11-06 B16）=================
// 真源《探索系统》§2.2 / §6.9~6.12。结构照抄筑基四图，解锁 21 / 24 / 27 / 30。
const C1 = locationById('siwang_zhaoze')
const C2 = locationById('heihe_fang')
const C3 = locationById('nankou_guan')
const C4 = locationById('xiaomoyuan')
const coreMaps = [C1, C2, C3, C4]

check('金丹四图：死亡沼泽', C1?.name, '死亡沼泽')
check('金丹四图：黑河坊', C2?.name, '黑河坊')
check('金丹四图：南口关', C3?.name, '南口关')
check('金丹四图：小魔渊', C4?.name, '小魔渊')
check(
  '金丹四图解锁 21 / 24 / 27 / 30',
  coreMaps.map(location => location.minLevel).join(','),
  '21,24,27,30'
)
check(
  '金丹四图事件数 16 / 17 / 18 / 18',
  coreMaps.map(location => location.events.length).join(','),
  '16,17,18,18'
)
check(
  '金丹四图段内高阶 0 / 30 / 60 / 90%',
  coreMaps.map(location => location.highTierChance).join(','),
  '0,0.3,0.6,0.9'
)
check('不可越阶：筑基十层进不了死亡沼泽', canEnterLocation(20, C1), false)
check('金丹一层可进死亡沼泽', canEnterLocation(21, C1), true)
check('筑基十层只看得到 8 张图', availableLocations(20).length, 8)
check('金丹一层 9 张图', availableLocations(21).length, 9)
check('金丹十层 12 张图', availableLocations(30).length, 12)
check('金丹段掉阶：低三阶', tierBandOf(21).low, 3)
check('金丹段掉阶：高四阶', tierBandOf(30).high, 4)

// 目标 = 飞鹰镇外 × realmCoefAt(minLevel) / realmCoefAt(9)；容差 ±8%
const CORE_TARGET_RATIO = [6.585, 8.781, 10.977, 13.17]
for (const [index, location] of coreMaps.entries()) {
  const ratio = stoneExpectationOf(location) / baseStones
  const target = CORE_TARGET_RATIO[index]
  check(
    `金丹图 ${index + 1} 灵石/天 ≈ 飞鹰镇外 ×${target}（±8%）`,
    Math.abs(ratio - target) / target < 0.08,
    true
  )
}
check(
  '金丹图灵石/天逐图递增',
  coreMaps.map(location => Math.round(stoneExpectationOf(location))).every(
    (value, index, arr) => index === 0 || value > arr[index - 1]
  ),
  true
)
check(
  '金丹图灵石/天 ≈ 对应筑基图 × 3（±2%）',
  coreMaps.every((location, index) => {
    const target = stoneExpectationOf(baseMaps[index]) * 3
    return Math.abs(stoneExpectationOf(location) - target) / target < 0.02
  }),
  true
)

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

// 2026-10-23 起始层：从中间起打只算**本趟实际走过的那一段**
check('从第 41 层起打通关 50 层 → 只算 1 天', timeCostDaysOf(50, 41), 1)
check('从第 41 层起打、卡在 43 层（Boss 40 已通）→ 0 天', timeCostDaysOf(43, 41), 0)
check('从第 31 层起打通关 50 层 → 2 天', timeCostDaysOf(50, 31), 2)
check('起点缺省仍按全程算', timeCostDaysOf(50), timeCostDaysOf(50, 1))
check('起始层上限：第一趟只能是第 1 层', startFloorLimitOf(0), 1)
check('起始层上限：打到 12 层 → 最晚从第 13 层起', startFloorLimitOf(12), 13)
check('起始层上限：打到 50 层封顶 50', startFloorLimitOf(50), 50)
check('请求第 30 层但最高只到 12 → 夹到 13', clampStartFloor(30, 12), 13)
check('请求 0 层 → 夹到 1', clampStartFloor(0, 12), 1)
check('请求 99 层 → 封顶 50', clampStartFloor(99, 49), 50)
check('非法起点回落 1', clampStartFloor(undefined, 12), 1)

// 宝匣阶只看难度：1–10 一阶 / 11–20 二阶 / 21–30 三阶 / 31–40 四阶 / 41+ 五阶
check('难度 1 → 一阶宝匣', chestTierOfDifficulty(1), 1)
check('难度 10 → 一阶宝匣', chestTierOfDifficulty(10), 1)
check('难度 11 → 二阶宝匣', chestTierOfDifficulty(11), 2)
check('难度 21 → 三阶宝匣', chestTierOfDifficulty(21), 3)
check('难度 31 → 四阶宝匣', chestTierOfDifficulty(31), 4)
check('难度 41 → 五阶宝匣', chestTierOfDifficulty(41), 5)
check('难度 100 封顶五阶', chestTierOfDifficulty(100), 5)

// P44 #8（2026-11-08）：段内位次 1–4 / 5–8 / 9–10 → 开箱 pick 加成 +0 / +1 / +2，换阶重置
check('难度 1 段内位次 = 1', difficultyPositionOf(1), 1)
check('难度 4 段内位次 = 4', difficultyPositionOf(4), 4)
check('难度 10 段内位次 = 10', difficultyPositionOf(10), 10)
check('★难度 11 换阶重置回 1', difficultyPositionOf(11), 1)
check('难度 25 段内位次 = 5', difficultyPositionOf(25), 5)
check('★难度 1–4 加成 +0', [1, 2, 3, 4].map(d => chestBonusPicksOf(d)).join(','), '0,0,0,0')
check('★难度 5–8 加成 +1', [5, 6, 7, 8].map(d => chestBonusPicksOf(d)).join(','), '1,1,1,1')
check('★难度 9–10 加成 +2', [9, 10].map(d => chestBonusPicksOf(d)).join(','), '2,2')
check('★难度 11–14 换阶重置回 +0', [11, 12, 13, 14].map(d => chestBonusPicksOf(d)).join(','), '0,0,0,0')
check('难度 19 加成 +2', chestBonusPicksOf(19), 2)
check('难度 20 加成 +2', chestBonusPicksOf(20), 2)
check('难度 21 换阶重置回 +0', chestBonusPicksOf(21), 0)
check('难度 49 加成 +2', chestBonusPicksOf(49), 2)
check('非法难度回落 +0', chestBonusPicksOf(undefined), 0)
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

// 稀有档在共享项上必须**严格强于**普通档（2026-11-25 修上游反向数值）。
// 否则 `autoPickBuff` 按品质自动选会选到更弱的项。
const buffIdPool = [...roguelikeOptions.common, ...roguelikeOptions.rare, ...roguelikeOptions.epic]
const buffOf = id => buffIdPool.find(o => o.id === id)
const freshBuffStats = () => ({
  stats: {
    attack: 100, health: 1000, defense: 100, speed: 10,
    critRate: 0.05, dodgeRate: 0.05, vampireRate: 0, comboRate: 0, stunRate: 0, critDamageBoost: 0.2
  }
})
const BUFF_UPGRADE_PAIRS = [
  ['defense_boost', 'defense_master'],
  ['crit_boost', 'crit_mastery'],
  ['dodge_boost', 'dodge_master'],
  ['vampire_boost', 'vampire_master']
]
for (const [commonId, rareId] of BUFF_UPGRADE_PAIRS) {
  const base = freshBuffStats().stats
  const afterCommon = freshBuffStats()
  const afterRare = freshBuffStats()
  buffOf(commonId).effect(afterCommon)
  buffOf(rareId).effect(afterRare)
  const touched = Object.keys(base).filter(k => afterCommon.stats[k] !== base[k])
  const keys = Object.keys(base)
  // 稀有档：随便哪一项都不能比普通弱；且四项合起来必须有一处更强
  // （会心精通 = 暴击率持平 + 多送 20% 爆伤，严格更强落在普通档够不到的字段上）
  const notWorse = keys.every(k => afterRare.stats[k] >= afterCommon.stats[k] - 1e-9)
  const strictlyBetter = keys.some(k => afterRare.stats[k] > afterCommon.stats[k] + 1e-9)
  check(`稀有 ${rareId} 在共享项上不弱于普通 ${commonId}`, notWorse && strictlyBetter, true)
  check(`稀有 ${rareId} 确实改动了至少一项`, touched.length > 0, true)
}

// 灵石 = round((20 + 8×层数) × 倍率 / 9)（《数值真值表》§6.4，总 ÷9）
check('1 层灵石 = round(28/9) = 3', rollFloorLoot(1, {}, () => 0.99).spiritual, 3)
check('普通层不给宝匣', rollFloorLoot(1, {}, () => 0.99).chests, 0)
const boss10Loot = rollFloorLoot(10, { kind: 'boss', difficulty: 1 }, () => 0.99)
check('10 层 Boss 灵石 = round(200/9) = 22', boss10Loot.spiritual, 22)
check('10 层 Boss 给 1 个宝匣', boss10Loot.chests, 1)
check('难度 1 的 Boss 宝匣一阶', boss10Loot.chestTier, 1)
check('难度 11 的 Boss 宝匣二阶', rollFloorLoot(10, { kind: 'boss', difficulty: 11 }, () => 0.99).chestTier, 2)
// P44 #8：加成跟难度走，且**不影响宝匣个数**
check('难度 1 的 Boss 宝匣无加成', boss10Loot.chestBonusPicks, 0)
check('难度 9 的 Boss 宝匣 +2 pick', rollFloorLoot(10, { kind: 'boss', difficulty: 9 }, () => 0.99).chestBonusPicks, 2)
check('难度 11 的 Boss 宝匣换阶后 +0', rollFloorLoot(10, { kind: 'boss', difficulty: 11 }, () => 0.99).chestBonusPicks, 0)
check('难度 19 的 Boss 宝匣 +2 pick', rollFloorLoot(10, { kind: 'boss', difficulty: 19 }, () => 0.99).chestBonusPicks, 2)
check('普通层没有宝匣加成', rollFloorLoot(1, { difficulty: 9 }, () => 0.99).chestBonusPicks, 0)
check(
  '★加成不改变宝匣个数（难度 9 仍是每 Boss 层 1 个）',
  rollFloorLoot(10, { kind: 'boss', difficulty: 9 }, () => 0.99).chests,
  1
)
check('50 层大 Boss 灵石 = round(1260/9) = 140', rollFloorLoot(50, { kind: 'bigBoss' }, () => 0.99).spiritual, 140)

const firstLoot = rollFloorLoot(10, { kind: 'boss', firstClear: true }, () => 0.99)
const repeatLoot = rollFloorLoot(10, { kind: 'boss', firstClear: false }, () => 0.99)
checkTrue('首破灵石更多', firstLoot.spiritual > repeatLoot.spiritual)
// 首破灵石 = round(200 × 难度 × (1 + 层数/50))，真源《数值真值表》§6.4
check('难度 1 第 10 层首破灵石 = round(200 × 1.2) = 240', firstLoot.spiritual - repeatLoot.spiritual, 240)
const firstClearDelta = (floor, difficulty) =>
  rollFloorLoot(floor, { kind: 'boss', difficulty, firstClear: true }, () => 0.99).spiritual -
  rollFloorLoot(floor, { kind: 'boss', difficulty, firstClear: false }, () => 0.99).spiritual
check('难度 1 第 5 层首破灵石 = 220', firstClearDelta(5, 1), 220)
check('难度 5 第 50 层首破灵石 = 2,000', firstClearDelta(50, 5), 2000)
check('难度 11 第 5 层首破灵石 = round(200 × 11 × 1.1) = 2,420', firstClearDelta(5, 11), 2420)
check('首破灵石随难度线性放大', firstClearDelta(5, 2) - firstClearDelta(5, 1), 220)
check('首破洗练石仍为 +5（2026-10-22 拍板保留）', firstLoot.refinementStones - repeatLoot.refinementStones, 5)
// 2026-11-08 灵草退役：账本字段 `herbs` → `plants`（掉的是灵植），数值不变
check('首破灵植仍为 +2', firstLoot.plants - repeatLoot.plants, 2)
check('重复打不写首破', repeatLoot.firstClear, false)
check('扫荡不含首破', sweepLoot(10, seeded(2)).firstClear, false)
// 1~50 层累计对照《数值真值表》§6.4：1,558 灵石 / 10 个宝匣
const sweep50 = sweepLoot(50, seeded(3))
check('满 50 层扫荡 = 1,558 灵石', sweep50.spiritual, 1558)
check('满 50 层扫荡 = 10 个宝匣', sweep50.chests, 10)
check('扫荡宝匣一阶（难度 1）', sweep50.chestTier, 1)

// ★ 2026-10-27：一趟 50 层的**整趟**掉落（= 结算面板该显示的数）。
// 挑战会被切成 10 段（每 5 层一段），每段单独入账；面板曾经只拿最后一段的 loot，
// 于是「打完难度 4 首杀只看到 一阶宝匣 ×1 + 二阶宝匣 ×1」。累计靠 mergeLoot。
const fullPassLoot = (difficulty = 4) => {
  let run = {
    floor: 1,
    startFloor: 1,
    highestFloorReached: 0,
    difficulty,
    buffs: [],
    withdrawn: [],
    status: 'fighting',
    autoRetreatPct: 0,
    permadeath: false
  }
  let firstClears = {}
  const total = emptyLoot()
  // 2026-11-17 战斗模型批：层间不再免费回满，难度 4 不带药连九层都过不去。
  // 这条测的是「整趟掉落累计」，不是难度门槛 —— 回血丹按供给充足给。
  const fullPassHeal = {
    heal: [
      {
        itemId: 'fullpass_pill',
        baseId: 'alchemy_huixue',
        name: '回血丹',
        tier: 1,
        effect: { type: 'recover', value: 0.3, scope: 'floor' },
        count: 9999
      }
    ]
  }
  for (let guard = 0; guard < 30; guard += 1) {
    const segment = runSegment({
      run,
      partyBase: calibrationParty({ level: 9 }),
      bossFirstClears: firstClears,
      rng: seeded(20261027),
      consumables: fullPassHeal
    })
    run = segment.run
    firstClears = segment.firstClears
    mergeLoot(total, segment.loot)
    if (segment.result) break
    const pick = autoPickBuff(segment.pendingBuff?.options)
    if (!pick) break
    run = { ...run, buffs: [...run.buffs, pick.id], status: 'fighting' }
  }
  return total
}
const fullPassDifficulty4 = fullPassLoot(4)
check('整趟 50 层：10 个一阶宝匣（每 5 层 1 个）', fullPassDifficulty4.chests, 10)
check('整趟 50 层：首杀高一阶宝匣 ×1', fullPassDifficulty4.bonusChests, 1)
check('整趟 50 层：首杀宝匣是二阶（难度 4 → 一阶 +1）', fullPassDifficulty4.bonusChestTier, 2)
check('整趟 50 层：洗命符 ×1', fullPassDifficulty4.fateCharms, 1)
check('整趟 50 层：灵石 = 1,558 基础 + 12,400 首破 = 13,958', fullPassDifficulty4.spiritual, 13958)
check('整趟 50 层：洗练石 = 10 基础 + 50 首破 = 60', fullPassDifficulty4.refinementStones, 60)
// P44 #8：整趟累加按「取最高」合并（同一趟难度固定，实为常量透传）
check('难度 4 整趟宝匣无加成（段内位次 4）', fullPassDifficulty4.chestBonusPicks, 0)
const mergedBonusLoot = mergeLoot(
  mergeLoot(emptyLoot(), { chests: 1, chestTier: 1, chestBonusPicks: 1 }),
  { chests: 1, chestTier: 1, chestBonusPicks: 2 }
)
check('★整趟合并时加成取最高', mergedBonusLoot.chestBonusPicks, 2)
check('整趟合并时宝匣个数照常累加', mergedBonusLoot.chests, 2)

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

// 2026-11-04 B15-d：闪避帧必须带攻击方血量。
// 旧帧只有目标的 hp，秘境敌人卡在「敌人出手被闪开」那一帧会读到 1/1 满血，
// 看起来像闪避后回血（实际血量没变）。命中帧带 attackerHp，闪避帧也要带。
const dodgeTank = () =>
  makeUnit({
    uid: 'player',
    source: 'player',
    name: '桂冈',
    stats: { health: 1000, damage: 1, defense: 0, speed: 1, dodgeRate: 1 }
  })
const dodgeFoe = () =>
  makeUnit({
    uid: 'enemy:1',
    source: 'enemy',
    name: '小妖',
    stats: { health: 1000, damage: 10, defense: 0, speed: 99 }
  })
const dodgeBattle = simulateBattle(
  { allies: [dodgeTank()], enemies: [dodgeFoe()], autoRetreatPct: 0 },
  seeded(2)
)
const dodgeFrame = dodgeBattle.frames.find(f => f.type === 'attack' && f.dodged)
checkTrue('闪避帧存在', !!dodgeFrame)
check('闪避帧带攻击方生命上限', dodgeFrame?.attackerMax, 1000)
check('闪避帧带攻击方当前血量', dodgeFrame?.attackerHp, 1000)

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
// 2026-10-30 B1：讣告要写「亡于谁」，`deaths` 必须带上凶手名
check('★陨落记录带敌人名（亡于谁）', wipe.deaths[0].killerName, lethalEnemy().name)

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

// ---- 2026-10-23：撤退从「整队回家」改成「谁触线谁走」----
// 恒定 rng = 0.99 让目标选择永远落在数组最后一个（`floor(0.99 × n) = n − 1`），
// 敌人打谁完全确定，不用碰运气。
const lastTargetRng = () => 0.99
const oneShotEnemy = health =>
  makeUnit({
    uid: 'enemy:kill',
    source: 'enemy',
    name: '一刀妖',
    stats: { health, damage: 1e6, defense: 0, speed: 999 }
  })

const soloSurvives = simulateBattle(
  {
    allies: [strongAlly(), fragileAlly()],
    enemies: [oneShotEnemy(10)],
    autoRetreatPct: 20,
    permadeath: false
  },
  lastTargetRng
)
check('脆皮吃致命伤 → 只有他自己退出', soloSurvives.withdrawn.length, 1)
check('退出的是那个脆皮', soloSurvives.withdrawn[0]?.uid, 'off:1')
check('其余人继续打 → 本层照样通关', soloSurvives.outcome, 'victory')
check('退出的人不算陨落', soloSurvives.deaths.length, 0)
check('退出会留一帧 withdraw', soloSurvives.frames.some(f => f.type === 'withdraw'), true)

const soloPermadeath = simulateBattle(
  {
    allies: [strongAlly(), fragileAlly()],
    enemies: [oneShotEnemy(10)],
    autoRetreatPct: 20,
    permadeath: true
  },
  lastTargetRng
)
check('开着撤退时，允陨落模式下退出的人也不陨落', soloPermadeath.deaths.length, 0)

// ---- P53 #12 死前预警（2026-11-26）：战前静态判定，两条同时成立才显示 ----
// 条件：撤退线 0（= 关闭自动撤退 = 允许陨落）+ 本图最狠一击能带走最脆子嗣。
// 2026-11-26 同批拍板：陨落不再有独立开关，撤退线 > 0 永远有「留 1 血退出」保护。
const fragileOffspring = health =>
  makeUnit({
    uid: 'off:risk',
    source: 'offspring',
    name: '桂大',
    stats: { health, damage: 1, defense: 0, speed: 1 }
  })
const riskBase = { difficulty: 5, autoRetreatPct: 0 }
check(
  'P53#12 陨落开关：撤退线 0 = 允许陨落',
  permadeathOfRetreat(0),
  true
)
check(
  'P53#12 陨落开关：撤退线 > 0 = 有保命保护',
  permadeathOfRetreat(20),
  false
)
checkTrue(
  'P53#12 预警：撤退关闭 + 敌人能一击 → 显示',
  oneShotRiskOf({ ...riskBase, allies: [fragileOffspring(10)] })
)
check(
  'P53#12 预警：撤退线调高 → 实时消失',
  oneShotRiskOf({ ...riskBase, autoRetreatPct: 5, allies: [fragileOffspring(10)] }),
  false
)
check(
  'P53#12 预警：只带桂冈 / 灵宠（没人会陨落）→ 不显示',
  oneShotRiskOf({
    ...riskBase,
    allies: [
      makeUnit({ uid: 'player', source: 'player', name: '桂冈', stats: { health: 10, damage: 1, defense: 0, speed: 1 } }),
      makeUnit({ uid: 'pet:1', source: 'pet', name: '灵兽', stats: { health: 10, damage: 1, defense: 0, speed: 1 } })
    ]
  }),
  false
)
check(
  'P53#12 预警：队伍血厚（敌人不够强）→ 不显示',
  oneShotRiskOf({
    ...riskBase,
    allies: [
      makeUnit({ uid: 'off:tank', source: 'offspring', name: '桂二', stats: { health: 1e9, damage: 1, defense: 1e9, speed: 1 } })
    ]
  }),
  false
)
check(
  'P53#12 预警文案不含数字 / 百分比',
  /[0-9０-９%％]/.test(`${DEATH_WARNING_TEXTS.retreat}${DEATH_WARNING_TEXTS.launch}`),
  false
)
check(
  'P53#12 预警文案用「陨落」、不写「一定会死」',
  `${DEATH_WARNING_TEXTS.retreat}${DEATH_WARNING_TEXTS.launch}`.includes('陨落') &&
    !`${DEATH_WARNING_TEXTS.retreat}${DEATH_WARNING_TEXTS.launch}`.includes('一定会死'),
  true
)

const lordOut = simulateBattle(
  {
    allies: [
      makeUnit({
        uid: 'off:heir',
        source: 'offspring',
        refId: 'c_heir',
        name: '桂大',
        stats: { health: 1e9, damage: 1e9, defense: 1e9, speed: 2 }
      }),
      makeUnit({
        uid: 'player',
        source: 'player',
        name: '桂冈',
        stats: { health: 10, damage: 1, defense: 0, speed: 1 }
      })
    ],
    // 血量要远超子嗣的 1e9 伤害，否则桂冈退出的同一回合敌人就被打死，变成 victory
    enemies: [oneShotEnemy(1e15)],
    autoRetreatPct: 20,
    permadeath: false
  },
  lastTargetRng
)
check('桂冈自己退出 → 挑战结束（不是继续打）', lordOut.outcome, 'retreated')
check('桂冈在退出名单里', lordOut.withdrawn[0]?.source, 'player')

const allOut = simulateBattle(
  {
    allies: [
      makeUnit({ uid: 'off:a', source: 'offspring', refId: 'a', name: '甲', stats: { health: 10, damage: 1, defense: 0, speed: 1 } }),
      makeUnit({ uid: 'off:b', source: 'offspring', refId: 'b', name: '乙', stats: { health: 10, damage: 1, defense: 0, speed: 1 } })
    ],
    enemies: [oneShotEnemy(1e9)],
    autoRetreatPct: 20,
    permadeath: false
  },
  lastTargetRng
)
check('全员退出 → 记撤退而不是战败', allOut.outcome, 'retreated')
check('每个人各记各的退出', allOut.withdrawn.length, 2)

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

// 2026-10-23：自己退出的人**本段之后**不再出场。
// 桂冈速度 1（后手）、脆皮子嗣速度 2；敌人速度 ~8 先手，恒定 rng 让它固定打数组最后一个（脆皮）。
// 脆皮 20 血吃一刀就退，桂冈一刀秒掉敌人 → 后面几层只剩桂冈。
const fragileSeg = runSegment({
  run: { ...runStart },
  partyBase: [
    makeUnit({ uid: 'player', source: 'player', name: '桂冈', stats: { health: 1e9, damage: 1e9, defense: 1e9, speed: 1 } }),
    makeUnit({ uid: 'off:fragile', source: 'offspring', refId: 'c_f', name: '脆', stats: { health: 20, damage: 1, defense: 0, speed: 2 } })
  ],
  bossFirstClears: {},
  rng: lastTargetRng
})
check('退出名单写回 run.withdrawn', fragileSeg.run.withdrawn.includes('off:fragile'), true)
check(
  '退出的子嗣不在后续楼层出手',
  fragileSeg.frames.filter(f => f.floor > 1 && f.attacker === 'off:fragile').length,
  0
)
check('其余人照样打到 Buff 门', fragileSeg.run.status, 'buff')
check('退出的人记在结果名单里', fragileSeg.run.withdrawn.length, 1)

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

// ================= 六之二、秘境消耗品（B11-a3，2026-11-08） =================
// 口径：丹药每 5 层 1 粒（只管这 5 层）/ 符箓每层 1 张 / 阵法整趟 1 份。
// 从背包直读、按优先级取第一件有货的；用完就断，不降级不失败；扫荡不消耗。

const potionEntry = (id, tier, effect, count = 99) => ({
  itemId: `it_${id}`,
  baseId: id,
  name: id,
  tier,
  effect,
  count
})
const ATK10 = { type: 'attack', value: 0.1, scope: 'segment' }
const SPD10 = { type: 'speed', value: 0.1, scope: 'floor' }
const DEF15 = { type: 'defense', value: 0.15, scope: 'run' }
const ENEMY10 = { type: 'enemyAttack', value: -0.1, scope: 'run' }

// 1) 库存规范化：只留有货的
const stock0 = normalizeConsumableStockOf({
  potion: [potionEntry('a', 3, ATK10, 2), potionEntry('b', 2, ATK10, 0)],
  talisman: [],
  array: []
})
check('消耗品库存：0 件的不进池', stock0.potion.length, 1)
check('消耗品库存：remaining = count', stock0.potion[0].remaining, 2)

// 2) 阵法：整趟只扣 1 份，第 2 层不再扣
const arrayStock = normalizeConsumableStockOf({ array: [potionEntry('arr', 3, DEF15, 5)] })
const floor1 = settleConsumablesOf({ state: {}, stock: arrayStock, floor: 1 })
const floor2 = settleConsumablesOf({ state: floor1.state, stock: arrayStock, floor: 2 })
check('阵法：第 1 层扣 1 份', floor1.spent.length, 1)
check('阵法：第 2 层不再扣', floor2.spent.length, 0)
check('阵法：第 2 层仍带着效果', floor2.effects.length, 1)
check('阵法：整趟只用 1 份', arrayStock.array[0].remaining, 4)
check('阵法：已部署的 id 写回 state', floor1.state.arrayId, 'arr')

// 3) 丹药：段号变化才吃（第 1 层吃、第 3 层不吃、第 6 层再吃）
const potionStock = normalizeConsumableStockOf({ potion: [potionEntry('p', 2, ATK10, 10)] })
const p1 = settleConsumablesOf({ state: {}, stock: potionStock, floor: 1 })
const p3 = settleConsumablesOf({ state: p1.state, stock: potionStock, floor: 3 })
const p6 = settleConsumablesOf({ state: p3.state, stock: potionStock, floor: 6 })
check('丹药：第 1 层吃 1 粒', p1.spent.length, 1)
check('丹药：同段第 3 层不再吃', p3.spent.length, 0)
check('丹药：第 6 层（新段）再吃', p6.spent.length, 1)
check('丹药：两段共吃 2 粒', potionStock.potion[0].remaining, 8)
check('丹药：段号写回 state', p6.state.potionSegment, 2)

// 4) 符箓：每层 1 张，用完就断
const talismanStock = normalizeConsumableStockOf({ talisman: [potionEntry('t', 2, SPD10, 2)] })
const t1 = settleConsumablesOf({ state: {}, stock: talismanStock, floor: 1 })
const t2 = settleConsumablesOf({ state: t1.state, stock: talismanStock, floor: 2 })
const t3 = settleConsumablesOf({ state: t2.state, stock: talismanStock, floor: 3 })
check('符箓：第 1 层吃 1 张', t1.spent.length, 1)
check('符箓：用完就断（第 3 层无效果）', t3.effects.length, 0)
check('符箓：不吃负数', talismanStock.talisman[0].remaining, 0)

// 5) 没货 → 零消耗、零效果（回放不能因为没带药就变慢/失败）
const emptySettle = settleConsumablesOf({ state: {}, stock: normalizeConsumableStockOf({}), floor: 1 })
check('无消耗品：不扣也不给效果', emptySettle.spent.length + emptySettle.effects.length, 0)

// 6) 效果落地：health = **生命上限**（不是回血）；老档 heal 是别名
const unit = makeUnit({ uid: 'u', source: 'player', name: '甲', stats: { health: 100, maxHealth: 100, damage: 10, defense: 10, speed: 10 } })
applyConsumableEffectsOf([unit], [{ type: 'health', value: 0.15 }])
check('丹药：health 加的是生命上限', unit.stats.maxHealth, 115)
check('丹药：满血单位跟着上限抬到 115', unit.currentHealth, 115)
const legacyUnit = makeUnit({ uid: 'u2', source: 'player', name: '乙', stats: { health: 100, maxHealth: 100, damage: 10, defense: 10, speed: 10 } })
applyConsumableEffectsOf([legacyUnit], [{ type: 'heal', value: 0.25 }])
check('老档 heal 别名同样加生命上限', legacyUnit.stats.maxHealth, 125)
// 2026-11-17 战斗模型批：层间余血后，「气血 +N%」不能再顺手补满 —— 受伤比例要保留
const hurtByPotion = makeUnit({ uid: 'u3', source: 'player', name: '丙', stats: { health: 100, maxHealth: 100, damage: 10, defense: 10, speed: 10 } })
hurtByPotion.currentHealth = 40
applyConsumableEffectsOf([hurtByPotion], [{ type: 'health', value: 0.15 }])
check('丹药：受伤单位只抬同样绝对值（40 → 55）', [hurtByPotion.stats.maxHealth, hurtByPotion.currentHealth].join(), '115,55')
// buff 每层重算时也不再补满
const hurtByBuff = makeUnit({ uid: 'u4', source: 'player', name: '丁', stats: { health: 100, maxHealth: 100, damage: 10, defense: 10, speed: 10 } })
hurtByBuff.currentHealth = 30
applyBuffIds([hurtByBuff], [])
check('buff：不再把当前血量补满', hurtByBuff.currentHealth, 30)

// 6b) 回血丹（2026-11-17）：≤70% 才吃，每粒回上限 30%，一层最多一粒
check('回血丹：回复量 = 上限 30%', HEAL_PILL_TUNING.healRatio, 0.3)
check('回血丹：触发线 = 70%', HEAL_PILL_TUNING.thresholdPct, 0.7)
const RECOVER30 = { type: 'recover', value: 0.3, scope: 'floor' }
const pillStock = normalizeConsumableStockOf({ heal: [potionEntry('h', 2, RECOVER30, 3)] })
const pillUnit = makeUnit({ uid: 'h1', source: 'player', name: '戊', stats: { health: 100, maxHealth: 100, damage: 10, defense: 10, speed: 10 } })
pillUnit.currentHealth = 50
const pillSpent = consumeHealPillsOf([pillUnit], pillStock)
check('回血丹：50% 血吃 1 粒回 30%', pillUnit.currentHealth, 80)
check('回血丹：账本 1 条', pillSpent.length, 1)
check('回血丹：库存 3 → 2', pillStock.heal[0].remaining, 2)
const pillHealthy = makeUnit({ uid: 'h2', source: 'player', name: '己', stats: { health: 100, maxHealth: 100, damage: 10, defense: 10, speed: 10 } })
pillHealthy.currentHealth = 80
consumeHealPillsOf([pillHealthy], pillStock)
check('回血丹：80% 血不吃（不浪费）', [pillHealthy.currentHealth, pillStock.heal[0].remaining].join(), '80,2')
const noPillStock = normalizeConsumableStockOf({})
const pillEmpty = makeUnit({ uid: 'h3', source: 'player', name: '庚', stats: { health: 100, maxHealth: 100, damage: 10, defense: 10, speed: 10 } })
pillEmpty.currentHealth = 10
consumeHealPillsOf([pillEmpty], noPillStock)
check('回血丹：没药就硬扛（血量不变）', pillEmpty.currentHealth, 10)

// 6c) 层间余血 / 倒地到段末（2026-11-17）：坦克带 1 血脆皮连打一段
//   · 脆皮速度最快、第 1 层出手后被打倒 → 第 2 层起不再出场（旧口径会满血复活）
//   · 坦克第 1 层吃过伤害 → 第 2 层开打时血量带伤（旧口径会满血开局）
const carryTank = makeUnit({
  uid: 'tank',
  source: 'player',
  name: '坦克',
  stats: { health: 1e6, maxHealth: 1e6, damage: 800, defense: 0, speed: 5 }
})
const carryGlass = makeUnit({
  uid: 'glass',
  source: 'offspring',
  name: '脆皮',
  stats: { health: 1, maxHealth: 1, damage: 1, defense: 0, speed: 900 }
})
const carrySeg = runSegment({
  run: { ...runStart, autoRetreatPct: 0 },
  partyBase: [carryTank, carryGlass],
  bossFirstClears: {},
  rng: seeded(77)
})
checkTrue(
  '层间余血：第 2 层开打时坦克带着第 1 层的伤',
  carrySeg.frames.some(f => f.floor === 2 && f.attacker === 'tank' && f.attackerHp < f.attackerMax)
)
checkTrue(
  '倒地到段末：第 1 层倒下的脆皮第 2 层起不再出场',
  carrySeg.frames.some(f => f.floor === 1 && f.attacker === 'glass') &&
    carrySeg.frames.every(f => f.floor < 2 || (f.attacker !== 'glass' && f.actor !== 'glass'))
)

// 7) 敌方侧：缚灵阵让敌人伤害 ×0.9
const enemyUnit = makeUnit({ uid: 'e', source: 'enemy', name: '敌', stats: { health: 100, damage: 100, defense: 0, speed: 1 } })
applyEnemyConsumableEffectsOf(enemyUnit, [ENEMY10])
check('阵法：敌方攻击 −10%', Math.round(enemyUnit.stats.damage), 90)

// 8) runSegment 接上：整段 1~5 层 = 丹药 1 粒 + 符箓 5 张 + 阵法 1 份
const segStock = normalizeConsumableStockOf({
  potion: [potionEntry('p', 2, ATK10)],
  talisman: [potionEntry('t', 2, SPD10)],
  array: [potionEntry('a', 3, DEF15)]
})
const consumableSeg = runSegment({
  run: { ...runStart },
  partyBase: [strongAlly()],
  bossFirstClears: {},
  rng: seeded(5),
  consumables: segStock
})
const consumedCount = id => consumableSeg.consumed.find(entry => entry.baseId === id)?.count || 0
check('一段 5 层：丹药 1 粒', consumedCount('p'), 1)
check('一段 5 层：符箓 5 张', consumedCount('t'), 5)
check('一段 5 层：阵法 1 份', consumedCount('a'), 1)
check('消耗账本按 itemId 落', consumableSeg.consumed.find(e => e.baseId === 'p')?.itemId, 'it_p')
check('消耗状态跨段写回 run', consumableSeg.run.potionSegment, 1)

// 9) 没带消耗品时，战斗结果与不传 consumables 完全一致（不引入额外随机）
const noConsumableSeg = runSegment({
  run: { ...runStart },
  partyBase: [strongAlly()],
  bossFirstClears: {},
  rng: seeded(5)
})
const emptyStockSeg = runSegment({
  run: { ...runStart },
  partyBase: [strongAlly()],
  bossFirstClears: {},
  rng: seeded(5),
  consumables: normalizeConsumableStockOf({})
})
check('没带消耗品：帧数不变', emptyStockSeg.frames.length, noConsumableSeg.frames.length)
check('没带消耗品：落点不变', emptyStockSeg.run.floor, noConsumableSeg.run.floor)
check('没带消耗品：账本为空', emptyStockSeg.consumed.length, 0)

// 怪物阈值曲线（2026-11-16 P25 换新本体乘区）：敌人 = 基础值 × 本体乘区(等效境界) × realmScale
// 等效境界 E = 难度 + (层数-1)/49 + 种类偏移（Boss 0.35 / 大 Boss 0.7）
// 速度不吃大境界基数，敌人速度仍只随层数涨（speedPerFloor）。
const enemyD1F1 = buildEnemy(1, { difficulty: 1, rng: () => 0 })
const enemyD2F1 = buildEnemy(1, { difficulty: 2, rng: () => 0 })
const enemyD1F4 = buildEnemy(4, { difficulty: 1, rng: () => 0 })
const enemyD1F5 = buildEnemy(5, { difficulty: 1, rng: () => 0 })
const enemyD1F50 = buildEnemy(50, { difficulty: 1, rng: () => 0 })
const round2 = v => Math.round(v * 100) / 100
// 2026-11-17（战斗模型批）：层间余血 + 回血丹后重标，realmScale 5.6 → 4.8
check('难度 1 第 1 层 = 等效境界 1.0（800 × 1.0 × 4.8）', round2(enemyD1F1.stats.maxHealth), 3840)
check('难度 2 第 1 层 = 等效境界 2.0（800 × 1.1 × 4.8）', round2(enemyD2F1.stats.maxHealth), 4224)
// 难度 1 第 5 层 Boss：等效境界 1 + 4/49 + 0.35 = 1.4316 → 小境界乘数 1.04316
check('Boss 层 = 等效境界 1.43', round2(enemyD1F5.stats.maxHealth), 4005.75)
check('Boss 层比前一普通层强（+0.35 个小境界）', enemyD1F5.stats.maxHealth > enemyD1F4.stats.maxHealth, true)
check(
  '50 层大 Boss + 难度内满层 = 等效境界 2.7（800 × 1.17 × 4.8）',
  round2(enemyD1F50.stats.maxHealth),
  round2(800 * 1.17 * 4.8)
)
check('难度不作用于速度', enemyD2F1.stats.speed, enemyD1F1.stats.speed)
check('层数作用于速度', enemyD1F50.stats.speed > enemyD1F1.stats.speed, true)

// ---- 2026-11-07 B16 #4：敌人名 / 层名 / 难度名（纯文案，不动数值） ----
// 段按**难度**切：1~10 练气 / 11~20 筑基 / 21+ 金丹（元婴未实装，31+ 沿用金丹）
check('★敌人段：难度 1 = 练气', enemySegmentOf(1), 'qi')
check('敌人段：难度 10 仍是练气', enemySegmentOf(10), 'qi')
check('★敌人段：难度 11 = 筑基', enemySegmentOf(11), 'foundation')
check('敌人段：难度 20 仍是筑基', enemySegmentOf(20), 'foundation')
check('★敌人段：难度 21 = 金丹', enemySegmentOf(21), 'core')
check('敌人段：31+ 沿用金丹（不编第四段）', enemySegmentOf(99), 'core')
check('每段跨度 = 10 个难度', ENEMY_SEGMENTS_PER_TIER, 10)

// 名表完整性：《可定稿》#03 要求每档 5~8 个名字 + 一句描述
const allEnemyEntries = Object.values(ENEMY_NAME_TABLE).flatMap(t => Object.values(t).flat())
check(
  '★名表每档 5~8 条',
  Object.values(ENEMY_NAME_TABLE).every(t => Object.values(t).every(p => p.length >= 5 && p.length <= 8)),
  true
)
check('★名表全库不重名', new Set(allEnemyEntries.map(e => e.name)).size, allEnemyEntries.length)
check('★名表每条都有描述', allEnemyEntries.every(e => String(e.desc || '').length >= 4), true)
check('名表 3 段 × (8+6+5) = 57 条', allEnemyEntries.length, 57)

// buildEnemy 真按段取名（rng 恒 0 → 各池第一条）
check('难度 1 第 1 层取练气首名', enemyD1F1.name, `${ENEMY_NAME_TABLE.qi.normal[0].name}·第1层`)
check('难度 1 第 5 层取练气精英首名', enemyD1F5.name, `${ENEMY_NAME_TABLE.qi.boss[0].name}·第5层`)
check('难度 1 第 50 层取练气首领首名', enemyD1F50.name, `${ENEMY_NAME_TABLE.qi.bigBoss[0].name}·第50层`)
check(
  '★难度 11 第 1 层换成筑基名',
  buildEnemy(1, { difficulty: 11, rng: () => 0 }).name,
  `${ENEMY_NAME_TABLE.foundation.normal[0].name}·第1层`
)
check(
  '★难度 21 第 1 层换成金丹名',
  buildEnemy(1, { difficulty: 21, rng: () => 0 }).name,
  `${ENEMY_NAME_TABLE.core.normal[0].name}·第1层`
)

// 层名：10 档 × 5 层，1~50 无空洞
check('层名 10 档', FLOOR_BANDS.length, 10)
check(
  '层名覆盖 1~50 不断档',
  FLOOR_BANDS.every((b, i) => b.from === i * 5 + 1 && b.to === (i + 1) * 5),
  true
)
check('层名 1~5 层 = 苔痕石阶', floorBandNameOf(1) === '苔痕石阶' && floorBandNameOf(5), '苔痕石阶')
check('层名第 6 层换档', floorBandNameOf(6), '断壁回廊')
check('★层名第 23 层 = 枯骨厅', floorBandNameOf(23), '枯骨厅')
check('★层名第 50 层 = 镇魔塔顶', floorBandNameOf(50), '镇魔塔顶')
check('层号越界钳到首尾', [floorBandNameOf(0), floorBandNameOf(99)].join(), '苔痕石阶,镇魔塔顶')

// 难度名：10 个一轮循环，对齐宝匣阶每 10 难度换档
check('难度名 10 个', DIFFICULTY_NAMES.length, 10)
check('难度 1 = 幽泉窟', difficultyNameOf(1), '幽泉窟')
check('★难度名第 10 个 = 镇魔台', difficultyNameOf(10), '镇魔台')
check('★难度名 10 个一轮循环（11 回到 1）', difficultyNameOf(11), difficultyNameOf(1))
check('难度 23 = 落雁坡（第 3 个）', difficultyNameOf(23), '落雁坡')
check('难度 23 是第 3 轮', difficultyCycleOf(23), 3)

// 敌人描述反查：战斗帧只带「名·第N层」，UI 悬停时剥后缀查表
check('敌人描述按名字反查', enemyDescOf('铁背狼·第23层'), ENEMY_NAME_TABLE.qi.normal[0].desc)
check('未知敌人名返回空串', enemyDescOf('无名氏'), '')

// 锚点（《三大挂机》§4.8）。**2026-10-23 P36 第 6 步重标**：
// 校准队伍从「3 名裸装子嗣」改成「桂冈 + 3 名 T2 中品子嗣」——
// 秘境实机队伍永远有桂冈，且子嗣装备是平加面板（练气二层攻 ×2.3），
// 按裸装反推的旧曲线在有装备的玩家身上形同虚设。
// 队伍构造在 `scripts/lib/sim-party.mjs`，和 `sim-realm.mjs` 用的是同一份。

/**
 * 段锚点（2026-11-17 战斗模型批）：用**生产函数** `runSegment` 打一整段（≤5 层），
 * 层间余血、倒地到段末、回血丹每层自动服 —— 与实机完全同一条路。
 * 回血丹按「供给充足」口径（校准问的是战力门槛，不是药够不够）。
 */
const anchorSegmentVictories = (allies, difficulty, tailFloor, seed, n = 40) => {
  const rng = seeded(seed)
  const startFloor = Math.max(tailFloor - 4, 1)
  const healStock = {
    heal: [
      {
        itemId: 'anchor_pill',
        baseId: 'alchemy_huixue',
        name: '回血丹',
        tier: 1,
        effect: { type: 'recover', value: 0.3, scope: 'floor' },
        count: 999
      }
    ]
  }
  let wins = 0
  for (let i = 0; i < n; i += 1) {
    const seg = runSegment({
      run: { floor: startFloor, buffs: [], autoRetreatPct: 0, difficulty, withdrawn: [] },
      partyBase: allies,
      bossFirstClears: {},
      rng,
      consumables: healStock
    })
    if (seg.result ? seg.result.outcome === 'victory' : seg.run.status === 'buff') wins += 1
  }
  return wins / n
}

const anchorPartyLv2 = calibrationParty({ level: 2 })
check(
  '锚点：练气二层校准队伍（带回血丹）能过难度 1 第 1~5 层',
  anchorSegmentVictories(anchorPartyLv2, 1, 5, 20261021) >= 0.9,
  true
)
// 校准曲线的意图（§6.4b）：练气九层打通难度 5。这一条一改就会响，是整条曲线的护栏。
const anchorPartyLv9 = calibrationParty({ level: 9 })
check(
  '练气九层校准队伍能过难度 5 第 46~50 层',
  anchorSegmentVictories(anchorPartyLv9, 5, 50, 20261023, 60) >= 0.8,
  true
)
// 新手护栏：还没攒到装备时，必须能过第一段。
// ⚠ **2026-11-17 战斗模型批从练气四层挪到六层**（预期行为，不是 bug）：
//   「每层满血」改成「5 层连打 + 回血丹」后，裸装队伍的门槛从四层抬到六层；
//   带 T2 中品装备的校准队仍是练气二层（上面的锚点）。这是模型改动的直接后果，
//   不是难度曲线漂了 —— 裸装玩家请在练气六层前进第一段，或先攒装备。
const freshParty = calibrationParty({ level: 6, gear: null })
check(
  '练气六层裸装五人队（带回血丹）能过难度 1 第 1~5 层',
  anchorSegmentVictories(freshParty, 1, 5, 20261023) >= 0.9,
  true
)

// P42（2026-10-25）武器代差：验收 = 同一支校准队「装 T5 武器 vs 装 T1 武器」多通 ≥ 50 层。
// 2026-11-17 战斗模型批：格点换成段口径（层间余血 + 回血丹）——
// T1 武器在练气九层**整段打不过**难度 7 第 36~40 层（≤ 340 层），
// T5 武器**整段能过**难度 8 第 46~50 层（= 400 层）—— 差 ≥ 60 层，高于 50 层的验收线。
// 只换武器：防具仍走校准档 T2 中品（`weaponTier`）。
const swordRampT1 = calibrationParty({ level: 9, weaponTier: 1 })
const swordRampT5 = calibrationParty({ level: 9, weaponTier: 5 })
check(
  'T1 武器：练气九层过不了难度 7 第 36~40 层',
  anchorSegmentVictories(swordRampT1, 7, 40, 20261024) < 0.9,
  true
)
check(
  'T5 武器：练气九层能过难度 8 第 46~50 层',
  anchorSegmentVictories(swordRampT5, 8, 50, 20261024) >= 0.9,
  true
)

// P43（2026-10-25）灵兽：独立第 5 坑 + 同修等级口径。
check('出战位：3 名子嗣', TUNING.companionSlots, 3)
check('出战位：1 只灵兽', TUNING.petSlots, 1)
// 零散 #3（2026-11-16）：初始等级按品阶 1/5/10/15/20，不再随主角涨
check('灵兽初始等级·一阶 = 1', petInitialLevelOf(1, { playerLevel: 30 }), 1)
check('灵兽初始等级·二阶 = 5', petInitialLevelOf(2, { playerLevel: 30 }), 5)
check('灵兽初始等级·三阶 = 10', petInitialLevelOf(3, { playerLevel: 30 }), 10)
check('灵兽初始等级·四阶 = 15', petInitialLevelOf(4, { playerLevel: 30 }), 15)
check('灵兽初始等级·五阶 = 20', petInitialLevelOf(5, { playerLevel: 30 }), 20)
check('初始等级高于主角层 → 夹到主角层（练气 3 开二阶 = Lv.3）', petInitialLevelOf(2, { playerLevel: 3 }), 3)
check('老档 / 脏 tier → 一阶 1 级', petInitialLevelOf(undefined, { playerLevel: 30 }), 1)
// 兽苑受益只数：Lv1/2/3 = 2/4/6，未建 = 0
check('兽苑 Lv0 = 0 只', gardenSlotsOf(0), 0)
check('兽苑 Lv1 = 2 只', gardenSlotsOf(1), 2)
check('兽苑 Lv2 = 4 只', gardenSlotsOf(2), 4)
check('兽苑 Lv3 = 6 只', gardenSlotsOf(3), 6)
check('兽苑脏档 Lv4 → 按满级 6 只（不静默变 0）', gardenSlotsOf(4), 6)
check('灵兽上限 = 主角小境界', petLevelCapOf(9, false), 9)
check('本命同源上限 +1', petLevelCapOf(9, true), 10)
check('猪类灵兽与本命同源', petSameSeriesOf({ series: 'boar' }, ['boar', 'taotie']), true)
check('异源灵兽不加层', petSameSeriesOf({ series: 'fox' }, ['boar', 'taotie']), false)
// 同修：拿 50% 经验、需求 2 倍 ⇒ 进境约为主角 1/4；这里只钉「一级需求 = 主角同层 × 2」
check('灵兽 1 级经验需求 = 70 × 2', petXpRequirementOf(1), 140)
check('灵兽 6 级经验需求 = 1300 × 2', petXpRequirementOf(6), 2600)
// 零散 #3：品阶越高每级越贵（×1.5/阶）
check('T2 1 级需求 = 140 × 1.3', petXpRequirementOf(1, { tier: 2 }), 182)
check('T3 1 级需求 = 140 × 1.69', petXpRequirementOf(1, { tier: 3 }), 236.6)
check('T5 1 级需求 = 140 × 1.3⁴', petXpRequirementOf(1, { tier: 5 }), 399.854)
check('老档无 tier 按 T1', petXpRequirementOf(6, { tier: undefined }), 2600)
const grownPet = growPet({ level: 1, xp: 0 }, 140, { playerLevel: 9 })
check('同修满经验升一级', grownPet.level, 2)
check('升级后扣掉本级经验', grownPet.xp, 0)
check('本次升了 1 级', grownPet.gainedLevels, 1)
const cappedPet = growPet({ level: 9, xp: 0 }, 999999, { playerLevel: 9 })
check('灵兽卡在主角小境界', cappedPet.level, 9)
check('卡上限时经验清零', cappedPet.xp, 0)
check('卡上限标记', cappedPet.capped, true)
// 流水账报的是「实际记进账的经验」：满级溢出那截要扣掉，否则会显示「同修 +X」却一点没涨
check('未满级时同修经验全额入账', grownPet.xpGained, 140)
check('满级时同修经验记 0（溢出全废）', cappedPet.xpGained, 0)
const sameSeriesCap = growPet({ level: 9, xp: 0 }, 999999, { playerLevel: 9, sameSeries: true })
check('本命同源能多升一层', sameSeriesCap.level, 10)

// 零散 #3（2026-11-16）吞噬：累计经验 = 等级折算 + 层内经验，1:1 转移、免费、无倍率
check('累计经验·1 级 = 层内经验', petTotalXpOf({ level: 1, xp: 30 }), 30)
check('累计经验·3 级 10 点 = 140 + 300 + 10', petTotalXpOf({ level: 3, xp: 10 }), 450)
check('累计经验·5 级 = 140 + 300 + 600 + 900', petTotalXpOf({ level: 5, xp: 0 }), 1940)
check('累计经验按自己的品阶算·T2 3 级 = (140 + 300) × 1.3 + 10', petTotalXpOf({ tier: 2, level: 3, xp: 10 }), 582)
const devourPlan = petDevourPlanOf({ level: 1, xp: 0 }, { level: 3, xp: 10 }, { playerLevel: 9 })
check('吞噬·狗粮 450 点喂 1 级 → Lv.3', devourPlan.level, 3)
check('吞噬·剩余经验 10', devourPlan.xp, 10)
check('吞噬·一次升 2 级', devourPlan.gainedLevels, 2)
check('吞噬·转移量 = 450（1:1，无倍率）', devourPlan.totalXp, 450)
check('吞噬·未溢出时丢失 0', devourPlan.lostXp, 0)
// 目标被主角上限卡住：溢出经验作废（§二.1 的「战力下降风险自担」由 UI 警示）
const devourCapped = petDevourPlanOf({ level: 1, xp: 0 }, { level: 5, xp: 0 }, { playerLevel: 3 })
check('吞噬·卡上限停在 Lv.3', devourCapped.level, 3)
check('吞噬·卡上限时经验清零', devourCapped.xp, 0)
check('吞噬·溢出 1500 点作废', devourCapped.lostXp, 1500)
check('吞噬·实际入账 440（= 升到 3 级所需）', devourCapped.xpGained, 440)
// 定稿示例：15 级二阶喂 1 级三阶 → 追不回 15 级（品阶系数 1.3/阶 的直观体现）
const memoDevour = petDevourPlanOf(
  { tier: 3, level: 1, xp: 0 },
  { tier: 2, level: 15, xp: 0 },
  { playerLevel: 30 }
)
check('吞噬·定稿示例 15 级二阶喂 1 级三阶 → Lv.13', memoDevour.level, 13)
check('吞噬·定稿示例剩余经验 27,992', Math.round(memoDevour.xp), 27992)
check('吞噬·定稿示例升了 12 级', memoDevour.gainedLevels, 12)
// 面板 = 白板(T2) × 成色中 1.5 × 本体乘区（6 级小境界 = 1.6，练气段基数 1）
//   生命 round(1280 × 1.5 × 1.6) = 3072；攻击 64 × 1.5 × 1.6 = 153.6
const petPanel = petPanelOf({ tier: 2, quality: '中', level: 6 })
check('灵兽面板·6 级生命 3072', petPanel.health, 3072)
check('灵兽面板·6 级攻击 153.6', petPanel.attack, 153.6)

// 2026-10-27：读档后出战灵兽与背包项是两份拷贝 → relinkPetRecord 对齐回同一引用。
// 不修的话，同修等级只涨在 activePet 上，背包/秘境名单读 items 永远显示旧等级。
const petItem = { id: 'p_relink', type: 'pet', tier: 2, quality: '中', level: 1, xp: 0 }
const activeClone = {
  ...petItem,
  level: 4,
  xp: 30,
  combatAttributes: { health: 11, attack: 22, defense: 33, speed: 44 }
}
const relinked = relinkPetRecord(activeClone, [petItem])
check('出战灵兽回指背包里的同一对象', relinked, petItem)
check('同修等级回写到背包项', petItem.level, 4)
check('同修经验回写到背包项', petItem.xp, 30)
check('面板沿用已加到桂冈身上的那份', petItem.combatAttributes.attack, 22)
// 2026-11-03：同一对象（已出战那只就地加经验）也要补 petVersion，
// 否则 migratePetsV2 读档时仍会把它当老档打回 Lv.1。
const samePet = { id: 'p_same', type: 'pet', tier: 2, quality: '中', level: 5, xp: 0 }
check('出战中就地 relink 也补 petVersion', relinkPetRecord(samePet, [samePet]).petVersion, 1)
check('找不到背包项 → null（不凭空造对象）', relinkPetRecord({ id: 'p_ghost' }, [petItem]), null)

// 零散 #3：store 侧吞噬 / 兽苑（mock store；getter 直接用属性值，不拉 Pinia）
const makePetStore = patch => ({
  ...petStoreActions,
  level: 20,
  items: [],
  activePet: null,
  estate: { buildings: {} },
  playerFateSeries: [],
  saveData() {},
  refreshActivePetPanel() {
    this.panelRefreshed = (this.panelRefreshed || 0) + 1
  },
  ...patch
})
// 吞噬：狗粮消失、经验 1:1 转入、目标升级
const devourTarget = { id: 't1', type: 'pet', name: '主兽', tier: 3, quality: '中', level: 1, xp: 0 }
const devourFood = { id: 'f1', type: 'pet', name: '狗粮', tier: 2, quality: '中', level: 3, xp: 10 }
const devourStore = makePetStore({ items: [devourTarget, devourFood] })
const devourRes = devourStore.devourPet('t1', 'f1')
check('吞噬成功', devourRes.ok, true)
// T2 狗粮 (140 + 300) × 1.3 + 10 = 582；T3 主兽 1→2 级扣 236.6，剩 345.4（不够 2 级的 507）
check('吞噬后主兽 Lv.2（高阶每级更贵）', devourTarget.level, 2)
check('吞噬后主兽经验 345.4', Math.round(devourTarget.xp * 10) / 10, 345.4)
check('狗粮从背包消失', devourStore.items.length, 1)
check('不能吃自己', makePetStore({ items: [devourTarget] }).devourPet('t1', 't1').ok, false)
// 出战中的灵兽不能当狗粮（用户 2026-11-16 拍板）
check(
  '出战中的灵兽不能当狗粮',
  makePetStore({ items: [{ ...devourFood }], activePet: { ...devourFood } }).devourPet('t1', 'f1').ok,
  false
)
// 秘境在途队伍里的灵兽也不能当狗粮
check(
  '秘境在途的灵兽不能当狗粮',
  makePetStore({
    items: [{ ...devourTarget }, { ...devourFood }],
    secretRealm: { run: { status: 'fighting', party: [{ kind: 'pet', id: 'f1' }] } }
  }).devourPet('t1', 'f1').ok,
  false
)
// 主兽是出战那只 → 面板要刷新（先扣旧值再加新值）
const activeTarget = { id: 't2', type: 'pet', name: '出战兽', tier: 3, quality: '中', level: 1, xp: 0 }
const activeDevourStore = makePetStore({
  items: [activeTarget, { ...devourFood }],
  activePet: activeTarget
})
activeDevourStore.devourPet('t2', 'f1')
check('吞噬主兽是出战兽 → 刷新桂冈面板', activeDevourStore.panelRefreshed, 1)

// 兽苑：Lv1 只喂战力最高的 2 只未出战兽；满级兽跳过、出战兽不算
const gardenActive = { id: 'g0', type: 'pet', tier: 5, quality: '极', level: 10, xp: 0 }
const gardenCapped = { id: 'g1', type: 'pet', tier: 5, quality: '极', level: 20, xp: 0 }
const gardenA = { id: 'g2', type: 'pet', tier: 3, quality: '中', level: 5, xp: 0 }
const gardenB = { id: 'g3', type: 'pet', tier: 2, quality: '中', level: 6, xp: 0 }
const gardenC = { id: 'g4', type: 'pet', tier: 1, quality: '中', level: 2, xp: 0 }
const gardenStore = makePetStore({
  items: [gardenActive, gardenCapped, gardenA, gardenB, gardenC],
  activePet: gardenActive,
  estate: { buildings: { beastGarden: 1 } }
})
const gardenRes = gardenStore.gainGardenPetCultivation(1000)
check('兽苑 Lv1 受益 2 只', gardenRes?.count, 2)
check('兽苑·战力最高档拿到经验（T3 Lv5）', gardenA.xp, 1000)
check('兽苑·战力次高拿到经验（T2 Lv6）', gardenB.xp, 1000)
check('兽苑·低战力没轮到', gardenC.xp, 0)
check('兽苑·满级兽跳过', gardenCapped.xp, 0)
check('兽苑·出战兽不算', gardenActive.level, 10)
check('没建兽苑 → 不发经验', makePetStore({ items: [{ ...gardenC }] }).gainGardenPetCultivation(1000), null)

// #5（2026-11-26）：开局赠送灵宠 —— 入包 + 自动出战 + 面板进本体 + 幂等
const starterStore = makePetStore({
  items: [],
  baseAttributes: { attack: 100, health: 1000, defense: 50, speed: 10 },
  combatAttributes: {},
  combatResistance: {},
  specialAttributes: {},
  // 真 `gainInto` 对不可堆叠物品是 push 一份**拷贝** —— mock 必须照抄，否则漏测引用分离
  gainItem(item) {
    this.items.push({ ...item })
  }
})
const starterPet = starterStore.grantStarterPet()
check('开局灵宠：入包一只', starterStore.items.length, 1)
check('开局灵宠：自动出战', starterStore.activePet === starterPet, true)
check('开局灵宠：出战位与背包是同一条引用', starterStore.activePet === starterStore.items[0], true)
check('开局灵宠：生命加成进本体（1,000 → 1,800）', starterStore.baseAttributes.health, 1800)
check('开局灵宠：攻击加成进本体（100 → 140）', starterStore.baseAttributes.attack, 140)
check('开局灵宠：重复调用不再发第二只', starterStore.grantStarterPet(), null)
check('开局灵宠：已有出战宠 → 不发（幂等）', makePetStore({ activePet: devourTarget }).grantStarterPet(), null)

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
// P25（2026-11-16）：60 × 1.1（练气二层小境界）× 0.8（五灵根）= 52.8
check('练气二层五灵根攻击 = 52.8', Math.round(qi2.stats.damage * 100) / 100, 52.8)
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
// 2026-10-30 公式先行：战力侧读 `effect.cultivation`，稀有度不换算
check(
  '词条 effect 0.20 → 战力 ×1.2（加算）',
  Math.round(
    (buildOffspringUnit(
      { ...qi2Child, traits: [{ grade: 'legend', effect: { cultivation: 0.2 } }] },
      { nowSeconds: now }
    ).stats.damage /
      qi2.stats.damage) *
      100
  ) / 100,
  1.2
)
check(
  '★老档词条（只有 grade、无 effect）战力不加成',
  buildOffspringUnit({ ...qi2Child, traits: [{ grade: 'legend' }] }, { nowSeconds: now }).stats.damage,
  qi2.stats.damage
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

// ---- 战力（2026-10-23，编队页展示用；真源《数值真值表》§5.5）----
// 有效生命 = 气血 × (100 + 防御) / 100（与 resolveAttack 的承伤同口径）
// 战力     = 攻击 × 有效生命 / 100。**速度不进战力**，它只决定出手顺序。
check('战力公式：200血/10攻/100防 = 40', combatPowerOf({ health: 200, damage: 10, defense: 100 }), 40)
check('战力公式：攻击翻倍则战力翻倍', combatPowerOf({ health: 200, damage: 20, defense: 100 }), 80)
check(
  '战力：速度不进战力',
  combatPowerOf({ health: 200, damage: 10, defense: 100, speed: 99 }),
  combatPowerOf({ health: 200, damage: 10, defense: 100, speed: 1 })
)
check('战力：队伍战力可加总（只做展示）', combatPowerOf({ health: 100, damage: 10, defense: 0 }) * 2, 20)
const powerPet = buildPetUnit({ id: 'p1', name: '青纹狐', combatAttributes: { health: 100, attack: 10, defense: 25, speed: 9 } })
check('战力：灵宠面板认 attack 键 = 13', combatPowerOf(powerPet), 13)
check('战力：灵宠没面板时回落白板 = 371', combatPowerOf(buildPetUnit({ id: 'p2', name: '旧灵宠' })), 371)
check(
  '战力：桂冈单位按 damage 键 = 11',
  combatPowerOf(
    buildPlayerUnit({ name: '桂冈', level: 1, realm: '练气一层', stats: { health: 100, damage: 10, defense: 5, speed: 10 } })
  ),
  11
)
checkTrue('战力：单灵根传说词条子嗣 > 五灵根子嗣', combatPowerOf(topUnit) > combatPowerOf(lowUnit))
checkTrue('战力：子嗣战力为正数', combatPowerOf(topUnit) > 0)

// ================= 七之二、子嗣装备（P36 第 3 步）=================
// 公式（《装备系统》§十一）：四属性 = 基础 × 境界 × 灵根 × 本命 × (1+词条) + **装备面板**
// 装备面板加算在最后，不乘任何系数。
const gearWeapon = { id: 'it_w', name: '青锋剑', category: '灵器', type: '飞剑', tier: 1, quality: '中', stats: { attack: 20, speed: 2 } }
const gearBody = { id: 'it_b', name: '青云袍', category: '灵器', type: '袍', tier: 1, quality: '中', stats: { defense: 8, health: 60 } }
const gearHead = { id: 'it_h', name: '青玉冠', category: '灵器', type: '冠', tier: 1, quality: '中', stats: { health: 30 } }
const gearHighTier = { id: 'it_t3', name: '玄铁重剑', category: '灵器', type: '飞剑', tier: 3, quality: '中', stats: { attack: 50 } }
const gearCrafted = { id: 'craft_1', name: '自炼短刀', slot: 'weapon', stats: { attack: 12 } }

check('新子嗣默认两个空槽', JSON.stringify(offspringEquipmentOf(newOffspring({ id: 'x' }))), JSON.stringify({ weapon: null, body: null }))
check('缺 equipment 字段兜底成空槽', offspringPanelOf({ id: 'y' }).attack, 0)
check('飞剑按中文 type 进「攻」槽', equipmentSlotOfItem(gearWeapon), 'weapon')
check('袍进「防」槽', equipmentSlotOfItem(gearBody), 'body')
check('头饰不是子嗣槽位', equipmentSlotOfItem(gearHead), null)
check('炼器产物按 slot 键认槽', equipmentSlotOfItem(gearCrafted), 'weapon')

const gearChild = { ...qi2Child, equipment: { weapon: gearWeapon, body: gearBody } }
check('装备面板：攻 = 武器攻击', offspringPanelOf(gearChild).attack, 20)
check('装备面板：防 = 防具防御', offspringPanelOf(gearChild).defense, 8)
check('装备面板：生命 = 防具生命', offspringPanelOf(gearChild).health, 60)
check('装备面板：速 = 武器速度', offspringPanelOf(gearChild).speed, 2)

const gearUnit = buildOffspringUnit(gearChild, { nowSeconds: now })
check('攻击加算在最后（基础 52.8 + 20）', Math.round(gearUnit.stats.damage * 100) / 100, 72.8)
check('生命加算在最后（基础 528 + 60）', Math.round(gearUnit.stats.health * 100) / 100, 588)
// 不乘境界：同几件装备穿在练气九层 vs 练气二层，面板完全一样
const gearHighRealm = buildOffspringUnit({ ...gearChild, realmLevel: 9 }, { nowSeconds: now })
const gearLowRealm = buildOffspringUnit({ ...gearChild, realmLevel: 2 }, { nowSeconds: now })
check(
  '装备面板不吃境界乘区（高境界差值 = 本体差值）',
  Math.round((gearHighRealm.stats.damage - gearLowRealm.stats.damage) * 100) / 100,
  Math.round(
    (buildOffspringUnit({ ...qi2Child, realmLevel: 9 }, { nowSeconds: now }).stats.damage -
      buildOffspringUnit(qi2Child, { nowSeconds: now }).stats.damage) *
      100
  ) / 100
)

// 阶位限制：P30 境界段定阶（练气一/二阶、筑基二/三阶、结丹三/四阶）
check('练气子嗣最高穿二阶', offspringMaxTierOf(qi2Child), 2)
check('练气能穿 T1 武器', canOffspringEquip(qi2Child, gearWeapon).ok, true)
check('练气穿不了 T3 武器', canOffspringEquip(qi2Child, gearHighTier).ok, false)
check('练气穿不了 T3 武器 → 理由带境界', canOffspringEquip(qi2Child, gearHighTier).reason.includes('境界不足'), true)
check('筑基（第 11 层）最高穿三阶', offspringMaxTierOf({ ...qi2Child, realmLevel: 11 }), 3)
check('结丹（第 21 层）最高穿四阶', offspringMaxTierOf({ ...qi2Child, realmLevel: 21 }), 4)
check('头饰穿不上（子嗣只有攻/防）', canOffspringEquip(qi2Child, gearHead).ok, false)

// P51 #5（B5，2026-10-27）：凡人子嗣穿不了灵器，只认不入品的凡俗物品
const mortalChild = { ...lowChild, hasRoot: false, realmLevel: 0 }
const mortalWeapon = { id: 'it_m', name: '柴刀', category: '灵器', type: '飞剑', tier: 0, tierKey: 'none', quality: 'none', stats: { attack: 2 } }
check('凡人子嗣穿不了 T1 灵器', canOffspringEquip(mortalChild, gearWeapon).ok, false)
check('凡人穿不了灵器的理由写明「灵器」', canOffspringEquip(mortalChild, gearWeapon).reason.includes('灵器'), true)
check('凡人子嗣能穿不入品的凡俗物品', canOffspringEquip(mortalChild, mortalWeapon).ok, true)
check('有灵根子嗣仍能穿 T1 灵器', canOffspringEquip(qi2Child, gearWeapon).ok, true)
check('tierKey=none 判为凡俗', isMortalGradeItem(mortalWeapon), true)
check('tier 为 0 判为凡俗', isMortalGradeItem({ tier: 0 }), true)
check('只成色是 none（tier 3）不算凡俗', isMortalGradeItem({ tier: 3, quality: 'none' }), false)
check('有品阶灵器不是凡俗', isMortalGradeItem(gearWeapon), false)
check('凡俗物品进「攻」槽', equipmentSlotOfItem(mortalWeapon), 'weapon')
check(
  '凡人可穿清单里只剩凡俗物品',
  eligibleOffspringItemsOf(mortalChild, [gearWeapon, gearBody, mortalWeapon]).map(i => i.id).join(','),
  'it_m'
)

// 背包筛选：只列槽位对得上、阶位够得着的
const gearPool = [gearWeapon, gearBody, gearHead, gearHighTier, gearCrafted]
check(
  '可穿清单 = 武器 + 防具（T3 与头饰被滤掉）',
  eligibleOffspringItemsOf(qi2Child, gearPool)
    .map(item => item.id)
    .sort()
    .join(','),
  'craft_1,it_b,it_w'
)

// 两槽一共只有两个：OFFSPRING_EQUIP_SLOTS 是子嗣槽位的唯一真源
check('子嗣可穿槽位 = 攻/防两个', OFFSPRING_EQUIP_SLOTS.join(','), 'weapon,body')

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

// ---------- 子嗣命名（《模块二》§7.5，2026-11-19 姓名系统重构）----------
// 修士 = 姓 + 千字文辈分字 + 单字名（桂天赐），同代不重名；
// 凡人 = 姓 + 排行 + 郎 / 娘（桂大郎），排行按生母、按代、全部孩子（含修士、含已故）。
const seqRng = values => {
  const list = [...values]
  return () => (list.length ? list.shift() : 0)
}
// 辈分字按 generation 取「第 N 个不避讳的千字文字」，洪被剔除 ⇒ 荒是第 7 个。
check('辈分字：1 = 天', generationCharOf(1), '天')
check('辈分字：2 = 地', generationCharOf(2), '地')
check('辈分字：3 = 玄', generationCharOf(3), '玄')
check('辈分字：4 = 黄', generationCharOf(4), '黄')
check('辈分字：6 = 宙', generationCharOf(6), '宙')
check('辈分字：洪被避讳跳过 ⇒ 7 = 荒', generationCharOf(7), '荒')
check('辈分字：8 = 日', generationCharOf(8), '日')
check('辈分字：16 = 寒', generationCharOf(16), '寒')
check(
  '可用辈分字不含十二避讳姓',
  GENERATION_USABLE_CHARS.some(ch => GENERATION_TABOO_SURNAMES.includes(ch)),
  false
)
check('可用辈分字已去重', new Set(GENERATION_USABLE_CHARS).size, GENERATION_USABLE_CHARS.length)

// 单字名池（男女各 ≥1,100 字，2026-11-19 用户拍板：实际能排到 1,104/1,112，
// 设计文档原估「1,500+」改为实测值 —— 只有有灵根的修士用池，单代修士远不到 1,000）
check('单字名池：男 ≥ 1,100 字', SINGLE_NAME_CHARS.male.length >= 1100, true)
check('单字名池：女 ≥ 1,100 字', SINGLE_NAME_CHARS.female.length >= 1100, true)
check(
  '单字名池：男女池各自去重',
  new Set(SINGLE_NAME_CHARS.male).size === SINGLE_NAME_CHARS.male.length &&
    new Set(SINGLE_NAME_CHARS.female).size === SINGLE_NAME_CHARS.female.length,
  true
)
check(
  '单字名池：千字文黑名单已剔除（糠 / 诮 / 骡）',
  ['糠', '诮', '骡'].some(ch => SINGLE_NAME_CHARS.male.includes(ch)),
  false
)

// 修士大名
const firstName = randomOffspringName('桂冈', { existing: [], rng: () => 0, hasRoot: true })
check('修士新生 = 姓 + 辈分字 + 单字名（三个字）', Array.from(firstName).length, 3)
check('第一代用「天」字辈', firstName.startsWith('桂天'), true)
check(
  '第二代的辈分字换成「地」',
  randomOffspringName('桂冈', { existing: [], rng: () => 0, generation: 2, hasRoot: true }).startsWith(
    '桂地'
  ),
  true
)
check(
  '女名也从单字池取（不含彩蛋池）',
  Array.from(
    randomOffspringName('桂冈', { existing: [], rng: () => 0, gender: 'female', hasRoot: true })
  ).length,
  3
)
const secondName = randomOffspringName('桂冈', {
  existing: [firstName],
  rng: seqRng([0, 0.01]),
  hasRoot: true
})
check('同代内不重名：撞名后换一个字', secondName !== firstName, true)
check('换字后仍是「桂天 X」', secondName.startsWith('桂天'), true)
check(
  '辈分字与单字不重复（不出现「桂天天」）',
  randomOffspringName('桂冈', { existing: [], rng: () => 0.004, hasRoot: true }) !== '桂天天',
  true
)
check(
  '父方道号首字仍作姓',
  randomOffspringName('林远', { existing: [], rng: () => 0, hasRoot: true }).startsWith('林天'),
  true
)

// 凡人俗名
check('凡人头胎 = 桂大郎', randomOffspringName('桂冈', { birthRank: 1 }), '桂大郎')
check('凡人三胎 = 桂三郎', randomOffspringName('桂冈', { birthRank: 3 }), '桂三郎')
check('凡人女儿 = 桂二娘', randomOffspringName('桂冈', { gender: 'female', birthRank: 2 }), '桂二娘')
check('凡人十二胎 = 桂十二郎', randomOffspringName('桂冈', { birthRank: 12 }), '桂十二郎')

// 排行：修士占号 / 按生母独立 / 跨代不串号
const rankList = [
  { id: 'a', hasRoot: true, generation: 1, motherId: 'w_1', motherName: '甲' },
  { id: 'b', hasRoot: false, generation: 1, motherId: 'w_1', motherName: '甲' },
  { id: 'c', hasRoot: false, generation: 1, motherId: 'w_2', motherName: '乙' }
]
check('排行：修士占号 ⇒ 同母两口之后是第三', nextMortalRankOf(rankList, { motherId: 'w_1' }, 1), 3)
check('排行：按生母独立计数', nextMortalRankOf(rankList, { motherId: 'w_2' }, 1), 2)
check('排行：跨代不串号', nextMortalRankOf(rankList, { motherId: 'w_1' }, 2), 1)

// 作者指定名通道
const specialTable = [
  { fatherName: '桂冈', motherId: 'w_1', generation: 1, gender: 'male', name: '桂天日' }
]
check(
  '指定名：命中直接使用（优先于随机）',
  randomOffspringName('桂冈', {
    existing: [],
    rng: () => 0,
    hasRoot: true,
    motherId: 'w_1',
    generation: 1,
    specialNames: specialTable
  }),
  '桂天日'
)
check(
  '指定名：母 / 代 / 性别不匹配就不命中',
  specialNameOf({ fatherName: '桂冈', motherId: 'w_2', generation: 1, gender: 'male' }, specialTable),
  null
)
check('指定名：线上表默认留空', specialNameOf({ fatherName: '桂冈', motherId: 'w_1' }), null)

// 支脉房号
check('房号标签：1 = 长房', branchLabelOf(1), '长房')
check('房号标签：2 = 二房', branchLabelOf(2), '二房')
check('房号标签：未回填 = 空串', branchLabelOf(0), '')
check(
  '凡人俗名带房号',
  offspringDisplayNameOf({ name: '桂大郎', hasRoot: false, branchNo: 1 }),
  '桂大郎 · 长房'
)
check(
  '修士大名不带房号',
  offspringDisplayNameOf({ name: '桂天赐', hasRoot: true, branchNo: 1 }),
  '桂天赐'
)

// 改名查重口径
check(
  '凡人跨母重名合法',
  offspringNameConflictOf(
    { id: 'a', name: '桂大郎', hasRoot: false, generation: 1, motherId: 'w_1' },
    { id: 'b', name: '桂大郎', hasRoot: false, generation: 1, motherId: 'w_2' }
  ),
  false
)
check(
  '凡人同母同代重名冲突',
  offspringNameConflictOf(
    { id: 'a', name: '桂大郎', hasRoot: false, generation: 1, motherId: 'w_1' },
    { id: 'b', name: '桂大郎', hasRoot: false, generation: 1, motherId: 'w_1' }
  ),
  true
)
check(
  '修士同代重名冲突',
  offspringNameConflictOf(
    { id: 'a', name: '桂天赐', hasRoot: true, generation: 1 },
    { id: 'b', name: '桂天赐', hasRoot: true, generation: 1 }
  ),
  true
)
check(
  '修士跨代（辈分字不同）不冲突',
  offspringNameConflictOf(
    { id: 'a', name: '桂天赐', hasRoot: true, generation: 1 },
    { id: 'b', name: '桂天赐', hasRoot: true, generation: 2 }
  ),
  false
)
check('兜底大写数字 1 = 壹', cnUpperNumeral(1), '壹')
check('兜底大写数字 2 = 贰', cnUpperNumeral(2), '贰')

// 妻妾 / 女修配偶名池（2026-11-19）：50 姓 + 100 单字 + 50 双字
check('侍妾姓池 = 50', new Set(SURNAMES).size, 50)
check('侍妾单字名池 = 100', new Set(WIFE_GIVEN_NAMES.single).size, 100)
check('侍妾双字名池 = 50', new Set(WIFE_GIVEN_NAMES.double).size, 50)
check('女修配偶姓池 = 50', new Set(CULTIVATOR_SPOUSE_SURNAMES).size, 50)
check('女修配偶单字名池 = 100', new Set(CULTIVATOR_SPOUSE_NAMES.single).size, 100)
check('女修配偶双字名池 = 50', new Set(CULTIVATOR_SPOUSE_NAMES.double).size, 50)

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
