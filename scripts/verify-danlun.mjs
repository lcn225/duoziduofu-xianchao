// 丹论纯函数断言（2026-11-06，《丹论系统》）。
//
// 覆盖：
//   · 候选池完整性（27 条 / id 与论名唯一 / 四句与出典齐全 / 触发等级 21）
//   · 每条 `test` 的阈值（达到 → 命中，差 1 → 不命中）
//   · 选取规则（同 theme 只取 1 / 按权重降序 / 兜底补齐）
//   · 存档快照（丢掉 `test`，函数不进存档）
//   · 信号抽取（buildDanLunSignalsOf 读真实字段名）
//   · store 看门狗（level < 21 不弹 / 弹一次 / 立论后不再弹 / 强制落盘）
//   · 静态扫描：纯函数层不 import Vue / Pinia / store
//
//   node scripts/verify-danlun.mjs           完整输出
//   node scripts/verify-danlun.mjs --list    只列断言标题
//   VERIFY_FILTER=候选 node scripts/verify-danlun.mjs --quiet
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DAN_LUN_LEVEL,
  DAN_LUN_POOL,
  buildDanLunSignalsOf,
  danLunById,
  danLunSnapshotOf,
  emptyDanLunSignals,
  pickDanLunCandidatesOf
} from '../src/plugins/danLun.js'
import { actions as progressActions } from '../src/stores/modules/progress.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
let skipped = 0
const results = []
const labels = []
const FILTER = (process.env.VERIFY_FILTER || '').toLowerCase()
const LIST = process.argv.includes('--list')

const eq = (a, b) => {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-6
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => eq(v, b[i]))
  }
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

/** 造一份信号：空表 + patch */
const sig = patch => ({ ...emptyDanLunSignals(), ...(patch || {}) })

/** 取某条的 test，喂一份信号 */
const testOf = (id, patch) => {
  const entry = DAN_LUN_POOL.find(item => item.id === id)
  return typeof entry?.test === 'function' ? entry.test(sig(patch)) : null
}

// ================= 一、候选池完整性 =================
check('候选池：共 27 条', DAN_LUN_POOL.length, 27)
check('候选池：id 唯一', new Set(DAN_LUN_POOL.map(e => e.id)).size, DAN_LUN_POOL.length)
check('候选池：论名唯一', new Set(DAN_LUN_POOL.map(e => e.name)).size, DAN_LUN_POOL.length)
check(
  '候选池：每条都有论辞 / 四句（3~4 行）/ 出典 / theme',
  DAN_LUN_POOL.every(
    e =>
      !!e.verse &&
      Array.isArray(e.lines) &&
      e.lines.length >= 3 &&
      e.lines.length <= 4 &&
      !!e.source &&
      !!e.theme
  ),
  true
)
check('候选池：权重非负整数', DAN_LUN_POOL.every(e => Number.isInteger(e.weight) && e.weight >= 0), true)
check('触发等级 = 金丹一层（21）', DAN_LUN_LEVEL, 21)
check('兜底三条永远命中', DAN_LUN_POOL.filter(e => e.weight <= 2 && e.test(sig())).length, 3)

// ================= 二、阈值（达到命中 / 差 1 不命中） =================
const thresholdCases = [
  ['dao_water', { mainElement: 'water', elementPracticed: { water: 2 } }, { mainElement: 'water', elementPracticed: { water: 1 } }],
  ['dao_fire', { mainElement: 'fire', elementPracticed: { fire: 2 } }, { mainElement: 'fire', elementPracticed: { fire: 1 } }],
  ['dao_wood', { mainElement: 'wood', elementPracticed: { wood: 2 } }, { mainElement: 'wood', elementPracticed: { wood: 1 } }],
  ['dao_metal', { mainElement: 'metal', elementPracticed: { metal: 2 } }, { mainElement: 'metal', elementPracticed: { metal: 1 } }],
  ['dao_earth', { mainElement: 'earth', elementPracticed: { earth: 2 } }, { mainElement: 'earth', elementPracticed: { earth: 1 } }],
  ['dao_vessel', { mainElement: 'vessel', equippedCount: 4 }, { mainElement: 'vessel', equippedCount: 3 }],
  ['dao_beast', { mainElement: 'beast', hasPet: true }, { mainElement: 'beast', hasPet: false }],
  ['dao_collect', { companionKinds: 200 }, { companionKinds: 199 }],
  ['dao_land_many', { landUnlocked: 8 }, { landUnlocked: 7 }],
  ['dao_land_stay', { landUnlocked: 8, landCurrent: 'kuaizi_hut' }, { landUnlocked: 8, landCurrent: 'other' }],
  ['dao_family', { aliveOffspring: 300 }, { aliveOffspring: 299 }],
  ['dao_family_root', { heirsAtFoundation: 30 }, { heirsAtFoundation: 29 }],
  ['dao_loss', { offspringLost: 20 }, { offspringLost: 19 }],
  ['dao_wives', { aliveWives: 20 }, { aliveWives: 19 }],
  ['dao_merit', { contributionTotal: 50000 }, { contributionTotal: 49999 }],
  ['dao_rank', { contributionTotal: 240000 }, { contributionTotal: 239999 }],
  ['dao_estate', { manorLevel: 5 }, { manorLevel: 4 }],
  ['dao_people', { population: 14000 }, { population: 13999 }],
  ['dao_star', { visitedLocations: 10 }, { visitedLocations: 9 }],
  ['dao_mortal', { eventTriggered: 10000 }, { eventTriggered: 9999 }],
  ['dao_wealth', { spiritual: 20000000 }, { spiritual: 19999999 }],
  ['dao_now', { dungeonFloor: 40 }, { dungeonFloor: 39 }],
  ['dao_body', { bodyLevel: 20 }, { bodyLevel: 19 }],
  ['dao_kind', { helpChoices: 100 }, { helpChoices: 99 }]
]
for (const [id, hit, miss] of thresholdCases) {
  check(`阈值 ${id}：达到 → 命中`, testOf(id, hit), true)
  check(`阈值 ${id}：差 1 → 不命中`, testOf(id, miss), false)
}

// ================= 三、选取规则 =================
const emptyPick = pickDanLunCandidatesOf(sig())
check('选取：空信号 → 3 条兜底', emptyPick.length, 3)
check('选取：空信号顺序 = 守拙 / 随道逐流 / 吾道不孤', emptyPick.map(e => e.id), [
  'dao_keep',
  'dao_flow',
  'dao_alone'
])

const oneHit = pickDanLunCandidatesOf(
  sig({ mainElement: 'vessel', equippedCount: 4 })
)
check('选取：单命中 → 命中条排第一，其余用兜底补', oneHit.map(e => e.id), [
  'dao_vessel',
  'dao_keep',
  'dao_flow'
])

const landBoth = pickDanLunCandidatesOf(sig({ landUnlocked: 12, landCurrent: 'kuaizi_hut' }))
check(
  '选取：同 theme 只取 1 条（登高见天压过一隅足矣）',
  landBoth.some(e => e.id === 'dao_land_many') && !landBoth.some(e => e.id === 'dao_land_stay'),
  true
)

const factionBoth = pickDanLunCandidatesOf(sig({ contributionTotal: 300000 }))
check(
  '选取：门派同 theme 只取权重高的（执掌一宗）',
  factionBoth.some(e => e.id === 'dao_rank') && !factionBoth.some(e => e.id === 'dao_merit'),
  true
)

const manyHits = pickDanLunCandidatesOf(
  sig({
    mainElement: 'vessel',
    equippedCount: 5,
    companionKinds: 400,
    landUnlocked: 12,
    aliveOffspring: 1000,
    heirsAtFoundation: 80,
    offspringLost: 70,
    aliveWives: 40,
    contributionTotal: 300000,
    manorLevel: 5,
    population: 15000,
    visitedLocations: 12,
    eventTriggered: 30000,
    spiritual: 50000000,
    dungeonFloor: 50,
    bodyLevel: 20,
    helpChoices: 300
  })
)
check('选取：多条命中仍只给 3 条', manyHits.length, 3)
check('选取：3 条 theme 互不相同', new Set(manyHits.map(e => e.theme)).size, 3)
check(
  '选取：按权重降序',
  manyHits[0].weight >= manyHits[1].weight && manyHits[1].weight >= manyHits[2].weight,
  true
)

const snapshot = danLunSnapshotOf(DAN_LUN_POOL[0])
check('快照：丢掉 test 函数', 'test' in snapshot, false)
check('快照：保留 id / 论名 / 论辞 / 四句 / 出典', [
  snapshot.id,
  snapshot.name,
  !!snapshot.verse,
  snapshot.lines.length,
  !!snapshot.source
], ['dao_water', '水之污浊', true, 4, true])
check('按 id 回查：未知 id → null', danLunById('nope'), null)
check('按 id 回查：已知 id → 同一条', danLunById('dao_keep')?.name, '守拙')

// ================= 四、信号抽取 =================
const mockStore = {
  practice: {
    qiArts: {
      active: 'hunyuan_jianyu',
      known: {
        hunyuan_jianyu: { practiceSeconds: 3600 },
        beast_vessel_dual: { practiceSeconds: 7200 },
        gui_blood: { practiceSeconds: 0 }
      }
    },
    spiritLand: {
      current: 'kuaizi_hut',
      unlocked: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    }
  },
  equippedArtifacts: { weapon: {}, body: {}, head: {}, accessory: {} },
  activePet: { id: 'pet' },
  ownedFateItemIds: new Array(200).fill('x'),
  offspring: {
    list: [
      { status: 'alive', realmLevel: 11 },
      { status: 'alive', realmLevel: 1 },
      { status: 'passed_away', realmLevel: 1 }
    ]
  },
  innerCourt: { wives: [{ status: 'idle' }, { status: 'passed_away' }] },
  faction: { contributionTotal: 240000 },
  estate: { villagers: 1000, buildings: { manor: 5 } },
  visitedLocations: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
  eventTriggered: 10000,
  currency: { spiritual: 20000000 },
  dungeonHighestFloor: 40,
  bodyLevel: 20,
  narrativeChoiceCounts: { help: 100 }
}
const signals = buildDanLunSignalsOf(mockStore)
check('信号：主修取 elements 第一项（混元剑狱 → vessel）', signals.mainElement, 'vessel')
check(
  '信号：已练功法按元素计数（未练的不算）',
  Object.entries(signals.elementPracticed).sort(),
  [
    ['beast', 1],
    ['vessel', 2]
  ]
)
check('信号：装备件数', signals.equippedCount, 4)
check('信号：有出战灵兽', signals.hasPet, true)
check('信号：同参底材种数', signals.companionKinds, 200)
check('信号：灵地解锁数 / 当前灵地', [signals.landUnlocked, signals.landCurrent], [8, 'kuaizi_hut'])
check('信号：活着的子嗣 / 陨落数 / 筑基子嗣', [
  signals.aliveOffspring,
  signals.offspringLost,
  signals.heirsAtFoundation
], [2, 1, 1])
check('信号：活着的妻妾', signals.aliveWives, 1)
check('信号：总人口 = 村民 + 活子嗣', signals.population, 1002)
check('信号：累计贡献点读 contributionTotal', signals.contributionTotal, 240000)
check('信号：走过探索图数', signals.visitedLocations, 10)
check('信号：其余直读字段', [
  signals.eventTriggered,
  signals.spiritual,
  signals.dungeonFloor,
  signals.bodyLevel,
  signals.helpChoices
], [10000, 20000000, 40, 20, 100])
check(
  '信号：空 store 不炸（老档兜底）',
  buildDanLunSignalsOf({}).mainElement,
  ''
)

// ================= 五、store 看门狗 =================
const makeStore = patch => {
  const store = {
    level: 21,
    danLun: null,
    danLunCandidates: [],
    danLunNoticeVisible: false,
    offlineReport: null,
    pauseCount: 0,
    resumeCount: 0,
    saves: [],
    pauseClockForEvent(reason) {
      this.pauseCount += 1
      this.pauseReason = reason
    },
    resumeClockFromEvent() {
      this.resumeCount += 1
    },
    saveData(options) {
      this.saves.push(options || {})
    },
    ...mockStore
  }
  Object.defineProperty(store, 'danLunSignals', {
    get() {
      return buildDanLunSignalsOf(this)
    }
  })
  Object.assign(store, progressActions)
  return Object.assign(store, patch || {})
}

const beforeLevel = makeStore({ level: 20 })
beforeLevel.syncDanLunNotice()
check('看门狗：level 20 不弹', beforeLevel.danLunNoticeVisible, false)
check('看门狗：level 20 不暂停', beforeLevel.pauseCount, 0)

const opens = makeStore()
opens.syncDanLunNotice()
check('看门狗：金丹一层 → 弹窗 + 3 条候选', [
  opens.danLunNoticeVisible,
  opens.danLunCandidates.length
], [true, 3])
check('看门狗：暂停理由 = danlun', opens.pauseReason, 'danlun')
check('看门狗：强制落盘', opens.saves.some(item => item.force === true), true)

const snapshotIds = opens.danLunCandidates.map(item => item.id)
opens.syncDanLunNotice()
check('看门狗：重复 tick 不重掷候选', opens.danLunCandidates.map(item => item.id), snapshotIds)

const offline = makeStore({ offlineReport: { some: true } })
offline.syncDanLunNotice()
check('看门狗：离线报告未确认不弹', offline.danLunNoticeVisible, false)

const chosen = makeStore()
chosen.syncDanLunNotice()
const firstId = chosen.danLunCandidates[0].id
const firstName = chosen.danLunCandidates[0].name
const firstLineCount = chosen.danLunCandidates[0].lines.length
chosen.chooseDanLun(firstId)
check(
  '立论：写入 danLun（含 id / 论名 / 论辞 / 四句）',
  [chosen.danLun?.id, chosen.danLun?.name, !!chosen.danLun?.verse, chosen.danLun?.lines?.length],
  [firstId, firstName, true, firstLineCount]
)
check('立论：关闭弹窗并清空候选', [chosen.danLunNoticeVisible, chosen.danLunCandidates.length], [false, 0])
check('立论：恢复时钟', chosen.resumeCount, 1)
check('立论：强制落盘', chosen.saves.some(item => item.force === true), true)

chosen.syncDanLunNotice()
check('立论后：再 tick 不弹第二次', chosen.danLunNoticeVisible, false)

// ================= 六、静态扫描 =================
const source = readFileSync(join(root, 'src/plugins/danLun.js'), 'utf8')
check('静态：不 import Vue', /from ['"]vue['"]/.test(source), false)
check('静态：不 import Pinia', /pinia/.test(source), false)
check('静态：不 import store', /stores\//.test(source), false)

// ================= 输出 =================
if (LIST) {
  for (const label of labels) console.log(`[LIST] ${label}`)
  console.log(`\n共 ${labels.length} 条断言`)
  process.exit(0)
}

const width = Math.max(...results.map(r => r.label.length), 10)
console.log('\n丹论断言（《丹论系统》· 候选池 / 阈值 / 选取 / 信号 / 看门狗）\n')
for (const r of results) {
  const mark = r.ok ? '  ok  ' : ' FAIL '
  console.log(`[${mark}] ${r.label.padEnd(width)} ${r.actual}`)
}
const passed = results.length - failures
console.log(`\n${passed}/${results.length} 通过`)
if (failures > 0) {
  console.error(`\n${failures} 条断言失败\n`)
  process.exit(1)
}
console.log('全部通过 ✅\n')
if (skipped) console.log(`（${skipped} 条被 VERIFY_FILTER 跳过）`)
