// 气运轮盘 / 子嗣成就纯函数断言（2026-11-24，《模块二》§6.0.2 · 产出表 R74）。
//
// 覆盖：
//   · 档位映射（灰白绿蓝紫封顶）与「抽数 = 1 + 成就数」
//   · 灰档 61 条 / 权重 / 折现（一律 30 大子，货币格金页子 ×1~3）
//   · 白起档权重（灵器 55 / 丹药 25 / 符箓 10 / 灵材 10）与成色截取
//   · 丹药 / 符箓走百艺配方模板（物品池里没有这两个 category）
//   · 20 条子嗣成就的配置完整性 + 按类判定（首位 / 计数 / 灵根 / 词条 / 同胞 / 本命）
//   · 队列（档位, 次数, 出生时刻）追加 / 合并 / 汇总
//   · store 拉杆：落账、清队列、≤5 逐条播 / >5 汇总
//   · 静态扫描：纯函数层不 import Vue / Pinia / store
//
//   node scripts/verify-lottery.mjs           完整输出
//   node scripts/verify-lottery.mjs --list    只列断言标题
//   VERIFY_FILTER=档位 node scripts/verify-lottery.mjs --quiet
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  GRAY_ITEM_COUNT,
  GRAY_POOL,
  LOTTERY_TIERS,
  LOTTERY_TIER_META,
  LOTTERY_TUNING,
  expandLotteryQueueOf,
  lotteryDrawCountOf,
  lotteryPendingCountOf,
  lotteryQueueSummaryOf,
  lotteryTierOfIndex,
  rollGrayEntry,
  rollLotteryQueueOf,
  rollQualityOfTier,
  rollTierEntryOf
} from '../src/plugins/lottery.js'
import {
  OFFSPRING_ACHIEVEMENTS,
  absorbBirthCountersOf,
  buildBirthCountersOf,
  evaluateOffspringAchievementsOf
} from '../src/plugins/offspringAchievements.js'
import { actions as lotteryActions } from '../src/stores/modules/lottery.js'

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
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ak = Object.keys(a)
    const bk = Object.keys(b)
    return ak.length === bk.length && ak.every(key => eq(a[key], b[key]))
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

/** 固定序列 rng（每次调用弹一个；用完后一直返回最后一个） */
const rngSeq = list => {
  let i = 0
  return () => {
    const value = i < list.length ? list[i] : list[list.length - 1]
    i += 1
    return value
  }
}

// ================= 一、档位映射 =================
check('档位：五档（灰白绿蓝紫）', LOTTERY_TIERS.join(','), 'gray,white,green,blue,purple')
check('档位：九色里封顶紫，没有金 / 暗金 / 红 / 彩', [
  !!LOTTERY_TIER_META.gold,
  !!LOTTERY_TIER_META.red,
  LOTTERY_TIER_META.purple.name
], [false, false, '紫'])
check('档位：白/绿 = 一阶，蓝/紫 = 二阶', [
  LOTTERY_TIER_META.white.tier,
  LOTTERY_TIER_META.green.tier,
  LOTTERY_TIER_META.blue.tier,
  LOTTERY_TIER_META.purple.tier
], [1, 1, 2, 2])
check('档位：第 1 抽灰', lotteryTierOfIndex(0), 'gray')
check('档位：第 2 抽白', lotteryTierOfIndex(1), 'white')
check('档位：第 3 抽绿', lotteryTierOfIndex(2), 'green')
check('档位：第 4 抽蓝', lotteryTierOfIndex(3), 'blue')
check('档位：第 5 抽紫', lotteryTierOfIndex(4), 'purple')
check('档位：紫封顶（第 12 抽仍是紫）', lotteryTierOfIndex(11), 'purple')
check('档位：负数按第 1 抽灰', lotteryTierOfIndex(-3), 'gray')
check('抽数：0 成就 = 1 抽', lotteryDrawCountOf(0), 1)
check('抽数：1 成就 = 2 抽', lotteryDrawCountOf(1), 2)
check('抽数：原作样本 桂大郎 3 成就 = 4 抽', lotteryDrawCountOf(3), 4)
check('抽数：负数兜底 1 抽', lotteryDrawCountOf(-5), 1)

// ================= 二、灰档 =================
check('灰档：奢侈品 48 条', GRAY_POOL.luxury.length, 48)
check('灰档：凡俗武学 6 条', GRAY_POOL.martial.length, 6)
check('灰档：凡俗暗器 4 条', GRAY_POOL.hidden.length, 4)
check('灰档：凡俗物资 3 条', GRAY_POOL.goods.length, 3)
check('灰档：共 61 条', GRAY_ITEM_COUNT, 61)
const grayNames = Object.values(GRAY_POOL).flat()
check('灰档：名字不重复', new Set(grayNames).size, grayNames.length)
const ORIGINAL_NAMES = [
  '迷踪步', '摘星手', '暴雨梨花针', '福禄寿摆件', '东珠头面',
  '点翠头面', '珍品头面', '翔鹤图屏风', '山水画折扇'
]
check('灰档：原作原词 9 条全部在池', ORIGINAL_NAMES.every(name => grayNames.includes(name)), true)
check('灰档：权重合计 100', Object.values(LOTTERY_TUNING.grayWeights).reduce((a, b) => a + b, 0), 100)
check('灰档：奢侈品权重 50', LOTTERY_TUNING.grayWeights.luxury, 50)
check('灰档：折价 30 大子', LOTTERY_TUNING.grayCash, 30)

const grayLuxury = rollGrayEntry(rngSeq([0, 0]))
check('灰档：rng=0 抽到奢侈品池首条，折 30 大子', [
  grayLuxury.kind,
  grayLuxury.name,
  grayLuxury.amount,
  grayLuxury.currency,
  grayLuxury.tierTone
], ['currency', '福禄寿摆件', 30, 'secular', 'ui-tier-gray'])
const grayCash = rollGrayEntry(rngSeq([0.95, 0]))
check('灰档：货币格 → 金页子 ×1 = 100 大子', [
  grayCash.kind,
  grayCash.name,
  grayCash.amount
], ['currency', '金页子 ×1', 100])
const grayCash3 = rollGrayEntry(rngSeq([0.95, 0.999]))
check('灰档：货币格上限 ×3 = 300 大子', [grayCash3.name, grayCash3.amount], ['金页子 ×3', 300])

// ================= 三、白起档 =================
check('白起：品类权重合计 100', Object.values(LOTTERY_TUNING.categoryWeights).reduce((a, b) => a + b, 0), 100)
check('白起：灵器 55 / 丹药 25 / 符箓 10 / 灵材 10', [
  LOTTERY_TUNING.categoryWeights['灵器'],
  LOTTERY_TUNING.categoryWeights['丹药'],
  LOTTERY_TUNING.categoryWeights['符箓'],
  LOTTERY_TUNING.categoryWeights['灵材']
], [55, 25, 10, 10])
check('白起：灵兽 / 灵植 / 残页 / 配方不进池', [
  '灵兽' in LOTTERY_TUNING.categoryWeights,
  '灵植' in LOTTERY_TUNING.categoryWeights,
  '残页' in LOTTERY_TUNING.categoryWeights,
  '配方' in LOTTERY_TUNING.categoryWeights
], [false, false, false, false])

const whiteQualities = new Set()
const greenQualities = new Set()
for (let i = 0; i < 400; i += 1) {
  const r = () => (i * 37 % 100) / 100
  whiteQualities.add(rollQualityOfTier('white', r))
  greenQualities.add(rollQualityOfTier('green', r))
}
check('成色：白档只出下 / 中', [...whiteQualities].sort(), ['下', '中'].sort())
check('成色：绿档只出上 / 极', [...greenQualities].sort(), ['上', '极'].sort())

// 品类权重顺序 = 灵器 55 / 丹药 25 / 符箓 10 / 灵材 10（累计 55 / 80 / 90 / 100）
const equipEntry = rollTierEntryOf('white', rngSeq([0.1, 0.6, 0.99]))
check('白档灵器：category / 基阶 / 成色', [
  equipEntry.kind,
  equipEntry.item.category,
  equipEntry.item.tier,
  ['下', '中'].includes(equipEntry.quality)
], ['item', '灵器', 1, true])

const pillEntry = rollTierEntryOf('blue', rngSeq([0.6, 0.5, 0.99]))
check('蓝档丹药：走炼丹配方，阶 = 2', [
  pillEntry.kind,
  pillEntry.item.category,
  pillEntry.item.tier,
  pillEntry.item.effect?.type ? true : false
], ['item', '丹药', 2, true])

const talismanEntry = rollTierEntryOf('green', rngSeq([0.85, 0.5, 0.99]))
check('绿档符箓：走制符配方，阶 = 1', [
  talismanEntry.item.category,
  talismanEntry.item.tier,
  ['上', '极'].includes(talismanEntry.quality)
], ['符箓', 1, true])

const materialEntry = rollTierEntryOf('purple', rngSeq([0.95, 0.5, 0.99]))
check('紫档灵材：从物品池抽二阶', [
  materialEntry.item.category,
  materialEntry.item.tier,
  ['上', '极'].includes(materialEntry.quality)
], ['灵材', 2, true])

check('灰档不走白起档入口', rollTierEntryOf('gray', rngSeq([0.5])), null)

// ================= 四、队列 =================
const queue = [
  { tier: 'gray', count: 2, at: 100 },
  { tier: 'white', count: 1, at: 100 },
  { tier: 'purple', count: 3, at: 200 }
]
check('队列：展开逐抽（按出生时间）', expandLotteryQueueOf(queue).map(d => `${d.tier}@${d.at}`), [
  'gray@100',
  'gray@100',
  'white@100',
  'purple@200',
  'purple@200',
  'purple@200'
])
check('队列：待抽总数', lotteryPendingCountOf(queue), 6)
check('队列：按档位汇总', lotteryQueueSummaryOf(queue), {
  gray: 2,
  white: 1,
  green: 0,
  blue: 0,
  purple: 3
})
check('队列：脏段（未知档位 / 0 次）被忽略', lotteryPendingCountOf([
  { tier: 'rainbow', count: 5, at: 0 },
  { tier: 'gray', count: 0, at: 0 },
  { tier: 'gray', count: 1, at: 0 }
]), 1)

const rolled = rollLotteryQueueOf(queue, rngSeq([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]))
check('队列：拉杆抽数 = 队列总数', rolled.draws, 6)
check('队列：拉杆条目数 = 抽数', rolled.entries.length, 6)
check('队列：条目保留出生时刻', rolled.entries.map(e => e.at), [100, 100, 100, 200, 200, 200])

// ================= 五、子嗣成就配置 =================
check('成就：共 20 条', OFFSPRING_ACHIEVEMENTS.length, 20)
check('成就：id 唯一', new Set(OFFSPRING_ACHIEVEMENTS.map(a => a.id)).size, 20)
const clsCount = OFFSPRING_ACHIEVEMENTS.reduce((acc, a) => {
  acc[a.cls] = (acc[a.cls] || 0) + 1
  return acc
}, {})
check('成就：分类计数（首位 5 / 计数 5 / 灵根 3 / 词条 2 / 同胞 3 / 本命 2）', clsCount, {
  first: 5,
  count: 5,
  root: 3,
  trait: 2,
  sibling: 3,
  fate: 2
})

const off = patch => ({
  id: patch.id || 'c_x',
  name: patch.name || '测试',
  hasRoot: !!patch.hasRoot,
  rootCount: patch.rootCount || 0,
  traits: patch.traits || [],
  fates: patch.fates || [],
  motherId: patch.motherId ?? '',
  generation: 1,
  ...patch
})

// ---------- 首位 / 计数 ----------
const firstBorn = off({ traits: [{ id: 't', grade: 'normal' }], motherId: 'w1' })
const firstIds = evaluateOffspringAchievementsOf(firstBorn, buildBirthCountersOf([]))
check('首位：第 1 个出生 + 首个词条', firstIds, ['first_child', 'first_trait'])

const counters1 = buildBirthCountersOf([firstBorn])
const secondIds = evaluateOffspringAchievementsOf(off({}), counters1)
check('计数：第 2 个出生', secondIds, ['second_child'])

const counters9 = buildBirthCountersOf(Array.from({ length: 9 }, (_, i) => off({ id: `c${i}` })))
check('计数：第 10 个出生', evaluateOffspringAchievementsOf(off({}), counters9), ['tenth_child'])

const counters99 = buildBirthCountersOf(Array.from({ length: 99 }, (_, i) => off({ id: `c${i}` })))
check('计数：第 100 个出生（百子）', evaluateOffspringAchievementsOf(off({}), counters99), ['hundredth_child'])

const counters9999 = buildBirthCountersOf(Array.from({ length: 9999 }, (_, i) => off({ id: `c${i}` })))
check('计数：第 10,000 个出生（万子，当前不可达但配置在）', evaluateOffspringAchievementsOf(off({}), counters9999), ['ten_thousand_child'])

// ---------- 灵根 ----------
const firstRoot = off({ hasRoot: true, rootCount: 1, traits: [{}] })
check('灵根：首个灵根子嗣', evaluateOffspringAchievementsOf(firstRoot, buildBirthCountersOf([])), [
  'first_child',
  'first_root',
  'first_trait'
])
const doubleRoot = off({ hasRoot: true, rootCount: 3, traits: [] })
check('灵根：首个三灵根同时触发双 / 三灵根', evaluateOffspringAchievementsOf(doubleRoot, buildBirthCountersOf([])), [
  'first_child',
  'first_root',
  'first_double_root',
  'first_triple_root'
])
const counters9Root = buildBirthCountersOf(
  Array.from({ length: 9 }, (_, i) => off({ id: `r${i}`, hasRoot: true, rootCount: 1, traits: [{}] }))
)
check('灵根：第 10 个有灵根子嗣（同批也触发第 10 个出生）', evaluateOffspringAchievementsOf(
  off({ hasRoot: true, rootCount: 1 }),
  counters9Root
), ['tenth_child', 'tenth_root_child'])
const countersRootSeen = buildBirthCountersOf([off({ hasRoot: true, rootCount: 2 })])
check('灵根：双灵根只触发一次（之后不再给）', evaluateOffspringAchievementsOf(
  off({ hasRoot: true, rootCount: 2 }),
  countersRootSeen
), ['second_child'])
const counters8Root = buildBirthCountersOf(
  Array.from({ length: 8 }, (_, i) => off({ id: `r${i}`, hasRoot: true, rootCount: 1, traits: [{}] }))
)
check('灵根：无灵根子嗣不占灵根序号', evaluateOffspringAchievementsOf(off({ hasRoot: false }), counters8Root), [])
check('灵根：凡人无灵根不进灵根计数', buildBirthCountersOf([off({ hasRoot: false })]).rooted, 0)

// ---------- 词条 ----------
const legendIds = evaluateOffspringAchievementsOf(
  off({ traits: [{ grade: 'legend' }, { grade: 'normal' }] }),
  buildBirthCountersOf([])
)
check('词条：首个传说 + 首个双词条（同时触发）', legendIds, [
  'first_child',
  'first_trait',
  'first_dual_trait',
  'first_legend_trait'
])
const legendSeen = buildBirthCountersOf([off({ traits: [{ grade: 'legend' }] })])
check('词条：传说只触发一次（只余计数成就）', evaluateOffspringAchievementsOf(
  off({ traits: [{ grade: 'legend' }] }),
  legendSeen
), ['second_child'])

// ---------- 同胞 ----------
const mother2 = buildBirthCountersOf([
  off({ id: 'a', motherId: 'w1' }),
  off({ id: 'b', motherId: 'w1' })
])
check('同胞：同母第 3 个', evaluateOffspringAchievementsOf(off({ motherId: 'w1' }), mother2), ['three_from_one'])
const mother4 = buildBirthCountersOf(Array.from({ length: 4 }, (_, i) => off({ id: `m${i}`, motherId: 'w1' })))
check('同胞：同母第 5 个', evaluateOffspringAchievementsOf(off({ motherId: 'w1' }), mother4), ['five_from_one'])
const mother9 = buildBirthCountersOf(Array.from({ length: 9 }, (_, i) => off({ id: `m${i}`, motherId: 'w1' })))
check('同胞：同母第 10 个（同批也触发第 10 个出生）', evaluateOffspringAchievementsOf(
  off({ motherId: 'w1' }),
  mother9
), ['tenth_child', 'ten_from_one'])
check('同胞：不同生母各自计数', evaluateOffspringAchievementsOf(off({ motherId: 'w2' }), mother2), [])
check('同胞：孙辈（motherId 为空）不进同胞类', evaluateOffspringAchievementsOf(off({ motherId: '' }), mother4), [])

// ---------- 本命 ----------
const beastFate = off({ hasRoot: true, rootCount: 1, fates: [{ category: '灵兽' }] })
check('本命：首个兽类本命', evaluateOffspringAchievementsOf(beastFate, buildBirthCountersOf([])), [
  'first_child',
  'first_root',
  'first_beast_fate'
])
const beastSeen = buildBirthCountersOf([off({ fates: [{ category: '灵兽' }] })])
check('本命：兽类本命只触发一次（只余计数成就）', evaluateOffspringAchievementsOf(
  off({ fates: [{ category: '灵兽' }] }),
  beastSeen
), ['second_child'])
check('本命：老档单件 `fate` 字段也能判', evaluateOffspringAchievementsOf(
  { hasRoot: false, traits: [], fates: [], fate: { category: '灵植' }, motherId: '' },
  buildBirthCountersOf([])
), ['first_child', 'first_plant_fate'])

// ---------- 计数器 ----------
const counters = buildBirthCountersOf([
  off({ id: 'a', hasRoot: true, rootCount: 2, motherId: 'w1', traits: [{ grade: 'legend' }], fates: [{ category: '灵兽' }] }),
  off({ id: 'b', motherId: 'w1' })
])
check('计数器：出生 / 灵根 / 同母', [counters.born, counters.rooted, counters.motherBirths.get('w1')], [2, 1, 2])
check('计数器：布尔位累积', [
  counters.anyDoubleRoot,
  counters.anyTripleRoot,
  counters.anyTrait,
  counters.anyDualTrait,
  counters.anyLegendTrait,
  counters.anyBeastFate,
  counters.anyPlantFate
], [true, false, true, false, true, true, false])
const absorbed = absorbBirthCountersOf(buildBirthCountersOf([]), off({ hasRoot: true, motherId: 'w9' }))
check('计数器：absorb 单个子嗣', [absorbed.born, absorbed.rooted, absorbed.motherBirths.get('w9')], [1, 1, 1])

// ================= 六、store 队列 / 拉杆 =================
const makeStore = (patch = {}) =>
  Object.assign(
    {
      lottery: { queue: [], pulled: 0, recent: [] },
      currency: { secular: 0, spiritual: 0, strategic: 0 },
      offspringList: [],
      gained: [],
      currencyGained: [],
      saves: 0,
      birthAchievementCountersOf() {
        return buildBirthCountersOf(this.offspringList)
      },
      gainCurrency(key, amount) {
        this.currencyGained.push([key, amount])
      },
      gainItem(item) {
        this.gained.push(item)
      },
      saveData() {
        this.saves += 1
      }
    },
    lotteryActions,
    patch
  )

const queueStore = makeStore()
queueStore.appendLotteryDrawsOf(1, 10)
check('store：1 抽 → 只有灰档', queueStore.lottery.queue.map(s => `${s.tier}x${s.count}`), ['grayx1'])
queueStore.appendLotteryDrawsOf(2, 20)
check('store：2 抽 → 灰 + 白', queueStore.lottery.queue.map(s => `${s.tier}x${s.count}`), [
  'grayx1',
  'grayx1',
  'whitex1'
])
queueStore.lottery.queue = []
queueStore.appendLotteryDrawsOf(6, 30)
check('store：6 抽 → 五档 + 紫合并成一段', queueStore.lottery.queue.map(s => `${s.tier}x${s.count}`), [
  'grayx1',
  'whitex1',
  'greenx1',
  'bluex1',
  'purplex2'
])
check('store：待抽总数', lotteryPendingCountOf(queueStore.lottery.queue), 6)

const birthStore = makeStore()
const firstChild = off({ traits: [{ grade: 'normal' }], motherId: 'w1' })
birthStore.noteOffspringBirthAchievements(firstChild, 100)
check('store：出生挂点写入 achievementIds', firstChild.achievementIds, ['first_child', 'first_trait'])
check('store：首个出生（2 成就 = 3 抽）= 灰 + 白 + 绿', birthStore.lottery.queue.map(s => `${s.tier}x${s.count}@${s.at}`), [
  'grayx1@100',
  'whitex1@100',
  'greenx1@100'
])
check('store：最近诞生记一条', birthStore.lottery.recent.length, 1)
check('store：最近诞生带成就 id', birthStore.lottery.recent[0].achievements, ['first_child', 'first_trait'])
check('store：最近诞生带抽数', birthStore.lottery.recent[0].draws, 3)
birthStore.offspringList.push(off({ id: 'born1' }))
const second = birthStore.noteOffspringBirthAchievements(off({ id: 'born2' }), 200)
check('store：第二次出生只达成「复数子嗣」= 2 抽', [second.ids, second.draws], [['second_child'], 2])

const pullStore = makeStore({ lottery: { queue: [{ tier: 'gray', count: 3, at: 1 }], pulled: 0, recent: [] } })
const pulled = pullStore.pullLottery()
check('store：拉杆 ≤5 → animated', [pulled.ok, pulled.draws, pulled.animated], [true, 3, true])
check('store：灰档全部折现（3 × 30 大子）', pullStore.currencyGained, [
  ['secular', 30],
  ['secular', 30],
  ['secular', 30]
])
check('store：拉杆后清空队列', pullStore.lottery.queue.length, 0)
check('store：累计已抽次数', pullStore.lottery.pulled, 3)
check('store：拉杆落盘', pullStore.saves, 1)
const emptyPull = pullStore.pullLottery()
check('store：空队列拉杆返回 ok:false', emptyPull.ok, false)

const bigStore = makeStore({ lottery: { queue: [{ tier: 'gray', count: 6, at: 1 }], pulled: 0, recent: [] } })
const bigPull = bigStore.pullLottery()
check('store：>5 抽 → 跳过动画（animated:false）', [bigPull.draws, bigPull.animated], [6, false])

// ================= 七、静态扫描 =================
for (const file of ['src/plugins/lottery.js', 'src/plugins/offspringAchievements.js']) {
  const source = readFileSync(join(root, file), 'utf8')
  check(`静态：${file} 不 import Vue`, /from ['"]vue['"]/.test(source), false)
  check(`静态：${file} 不 import Pinia`, /pinia/.test(source), false)
  check(`静态：${file} 不 import store`, /stores\//.test(source), false)
}

// ================= 输出 =================
if (LIST) {
  for (const label of labels) console.log(`[LIST] ${label}`)
  console.log(`\n共 ${labels.length} 条断言`)
  process.exit(0)
}

const width = Math.max(...results.map(r => r.label.length), 10)
console.log('\n气运轮盘断言（《模块二》§6.0.2 · 档位 / 灰档 / 白起档 / 成就 / 队列 / 拉杆）\n')
for (const r of results) {
  const mark = r.ok ? '  ok  ' : ' FAIL '
  console.log(`[${mark}] ${r.label.padEnd(width)} ${JSON.stringify(r.actual)}`)
}
const passed = results.length - failures
console.log(`\n${passed}/${results.length} 通过`)
if (failures > 0) {
  console.error(`\n${failures} 条断言失败\n`)
  process.exit(1)
}
console.log('全部通过 ✅\n')
if (skipped) console.log(`（${skipped} 条被 VERIFY_FILTER 跳过）`)
