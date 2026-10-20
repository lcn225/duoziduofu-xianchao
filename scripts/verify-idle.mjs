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
  advanceExploration,
  createExplorationSession,
  eventIntervalSeconds,
  formatRewardSummary,
  locationById,
  rollExploreEvent
} from '../src/plugins/exploration.js'
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
check('养伤 = 1 游戏天', injuredUntil, 1000 + DAY)
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

// ================= 三、探索 =================
check('探索地点可取', locationById('newbie_village')?.name, '新手村')
check('事件间隔 = 1 游戏小时', eventIntervalSeconds(EXP_TUNING), H)

const findEvent = rollExploreEvent({
  location: locationById('newbie_village'),
  tuning: { ...EXP_TUNING, battleChance: 0 },
  rng: () => 0.79
})
check('非战斗 + 末位奖励 → find', findEvent.kind, 'find')
checkTrue('find 有奖励描述', findEvent.rewards.length > 0)

// 2026-10-18 P13.1：删掉 cultivation 奖励后，新手村剩余概率合计 0.8，
// 末位 0.2 是「一无所获」——这是预期行为，不是漏抽。
const nothingEvent = rollExploreEvent({
  location: locationById('newbie_village'),
  tuning: { ...EXP_TUNING, battleChance: 0 },
  rng: () => 0.99
})
check('非战斗 + 概率落在空档 → nothing', nothingEvent.kind, 'nothing')
checkTrue('nothing 没有奖励', nothingEvent.rewards.length === 0)

let seq = [0.1, 0.1, 0.1, 0.5, 0.5]
const battleEvent = rollExploreEvent({
  location: locationById('newbie_village'),
  tuning: { ...EXP_TUNING, battleChance: 1, winChanceBase: 0.9, winChanceMin: 0.9, winChanceMax: 0.9 },
  rng: () => seq.shift() ?? 0.5
})
check('战斗胜 → battle', battleEvent.kind, 'battle')

seq = [0.1, 0.99]
const defeatEvent = rollExploreEvent({
  location: locationById('newbie_village'),
  tuning: { ...EXP_TUNING, battleChance: 1, winChanceBase: 0, winChanceMin: 0, winChanceMax: 0 },
  rng: () => seq.shift() ?? 0.5
})
check('战斗负 → defeat', defeatEvent.kind, 'defeat')

const session = createExplorationSession({ nowSeconds: 0, locationId: 'newbie_village' })
check('第一次事件在 1h 后', session.nextEventAt, H)
// 这段只验证「按游戏时间补结算」的调度，把战斗关掉，避免随机战败提前终止
const expCtx = {
  location: locationById('newbie_village'),
  luck: 1,
  tuning: { ...EXP_TUNING, battleChance: 0 }
}
const threeHours = advanceExploration(session, 3 * H, expCtx, seeded(7))
check('推进 3h 结算 3 次', threeHours.state.stats.events, 3)
check('下一次事件锚点 4h', threeHours.state.nextEventAt, 4 * H)
check(
  '结算文案：大子 +30 · 灵草 +2',
  formatRewardSummary([
    { type: 'da_zi', amount: 30 },
    { type: 'herb', amount: 2 }
  ]),
  '大子 +30 · 灵草 +2'
)
checkTrue(
  '流水账带结算后缀',
  threeHours.state.log.some(entry => entry.text.includes('+'))
)

// 分段推进与一次推进必须完全一致（证明不依赖视图计时器）
let stepState = createExplorationSession({ nowSeconds: 0, locationId: 'newbie_village' })
const stepRng = seeded(11)
for (let i = 1; i <= 3; i += 1) {
  stepState = advanceExploration(stepState, i * H, expCtx, stepRng).state
}
const oneShot = advanceExploration(
  createExplorationSession({ nowSeconds: 0, locationId: 'newbie_village' }),
  3 * H,
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

const defeatCtx = {
  location: locationById('newbie_village'),
  luck: 1,
  tuning: { ...EXP_TUNING, battleChance: 1, winChanceBase: 0, winChanceMin: 0, winChanceMax: 0 }
}
const defeated = advanceExploration(
  createExplorationSession({ nowSeconds: 0, locationId: 'newbie_village' }),
  H,
  defeatCtx,
  () => 0.5
)
check('战败返回 defeated', defeated.defeated, true)
check('战败后停止探索', defeated.state.active, false)

const capped = advanceExploration(
  createExplorationSession({ nowSeconds: 0, locationId: 'newbie_village' }),
  20 * H,
  { ...expCtx, tuning: { ...EXP_TUNING, logLimit: 3 } },
  seeded(3)
)
check('流水账上限生效', capped.state.log.length, 3)

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
// P14：出战门槛从「1 游戏年（365 天）」改成模块二的成长门槛 —— **仙师 + 少年（140 天）**。
const gateChild = { hasRoot: true, status: 'alive', birthTime: 0 }
check('仙师少年门槛未到（139 天）', canFight(gateChild, 139 * DAY), false)
check('仙师少年门槛刚好到（140 天）', canFight(gateChild, 140 * DAY), true)
check('★无灵根子嗣不能出战', canFight({ ...gateChild, hasRoot: false }, year * 2), false)

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
checkTrue('首破大子更多', firstLoot.daZi > repeatLoot.daZi)
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
const lowChild = { ...newOffspring({ id: 'c_low', name: '低', birthTime: 0, hasRoot: true, quality: 'low', rootCount: 5, traits: [] }) }
const topChild = { ...newOffspring({ id: 'c_top', name: '高', birthTime: 0, hasRoot: true, quality: 'top', rootCount: 1, traits: [{ grade: 'legend' }] }) }
const lowUnit = buildOffspringUnit(lowChild, { nowSeconds: now })
const topUnit = buildOffspringUnit(topChild, { nowSeconds: now })
checkTrue('极品/单灵根战力更高', topUnit.stats.damage > lowUnit.stats.damage)
check('未成年不能出战', buildOffspringUnit({ ...lowChild, birthTime: now }, { nowSeconds: now }), null)
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
for (const file of ['src/plugins/idleMode.js', 'src/plugins/exploration.js', 'src/plugins/secretRealm.js']) {
  const source = read(file)
  const impure = /from\s+['"]vue['"]|from\s+['"]pinia['"]|\/stores\//.test(source)
  check(`${file} 不依赖 Vue/Pinia/store`, impure, false)
}

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
