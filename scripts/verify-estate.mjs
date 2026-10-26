// 封地经营纯函数断言（模块四 MVP，2026-10-26 B3）。
//
// 覆盖：
//   · 建筑表（16 种 / 4 个 MVP / id 唯一 / 教程三步）
//   · 民心六档与基准（50 + 5×乡侯府等级）
//   · 徭役满足率（自动均分 / <50% 停工）
//   · 报价（成本 weight × 二阶 → 一阶；工期 weight × 30 天；首建 0 成本 + 半工期）
//   · 单日推进（巡视 ×2 / 付款总额 = 总成本 / 灵石不足停工 / 完工升级 / 幂等）
//   · 产出（灵田 10 一阶/天/级 × 民心系数 × 巡视次数）
//   · 征收（Lv1 未开 / Lv2 起 / 30 天满 / 巡视 15 天 / 每月最多 1 次）
//   · 静态扫描：纯函数层不 import Vue / Pinia / store
//
// 风格与 verify-offline.mjs 一致：常量断言，不做统计。
//   node scripts/verify-estate.mjs           完整输出
//   node scripts/verify-estate.mjs --list    只列断言标题
//   VERIFY_FILTER=民心 node scripts/verify-estate.mjs --quiet  只跑匹配项
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BUILDINGS,
  ESTATE_TUNING,
  GAME_SECONDS_PER_DAY,
  TUTORIAL_IDS,
  advanceEstateDay,
  buildingById,
  createEstateState,
  laborAssignedOf,
  laborSatisfactionOf,
  moraleBaselineOf,
  moraleCoefOf,
  moraleLabelOf,
  mvpBuildings,
  nextQuoteOf,
  normalizeEstate,
  patrolSettledInWindow,
  productionBarOf,
  productionOf,
  taxMonthlyJinYeZi,
  techTreeBuildings,
  tutorialStepOf,
  upgradeQuote
} from '../src/plugins/estate.js'
// 运行时层：只用来验「入账 / 入口校验」，与 verify-offline.mjs mock store 的做法一致
import { actions as estateActions } from '../src/stores/modules/estate.js'

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

/** 造一个可推进的状态：默认乡侯府 Lv1、民心 55 */
const makeState = patch => ({ ...createEstateState(), ...(patch || {}) })

/** 连推 n 天（midnight = day×86400，从 day=1 开始），返回累计收益 */
const runDays = (state, days, { patrolled = false, stones = Number.MAX_SAFE_INTEGER } = {}) => {
  let s = state
  let budget = stones
  const gains = { spiritual: 0, secular: 0, taxJinYeZi: 0 }
  let spent = 0
  let events = []
  for (let i = 1; i <= days; i += 1) {
    const r = advanceEstateDay(s, { midnight: i * DAY, patrolled, stones: budget })
    s = r.state
    budget -= r.spent
    spent += r.spent
    gains.spiritual += r.gains.spiritual
    gains.secular += r.gains.secular
    gains.taxJinYeZi += r.gains.taxJinYeZi
    events = events.concat(r.events)
  }
  return { state: s, gains, spent, events, budget }
}

// ================= 一、建筑表 =================
check('建筑表 16 种', BUILDINGS.length, 16)
check('MVP 可建 4 个', mvpBuildings().length, 4)
check(
  'MVP 建筑按教程顺序',
  mvpBuildings().map(b => b.id),
  ['manor', 'farm', 'rookery', 'pavilion']
)
check('科技树剩 12 种', techTreeBuildings().length, 12)
check('建筑 id 唯一', new Set(BUILDINGS.map(b => b.id)).size, BUILDINGS.length)
check('乡侯府开局即有', buildingById('manor').initial, true)
check('只有乡侯府 initial', BUILDINGS.filter(b => b.initial).length, 1)
check('灵田日产出 10 一阶/级', buildingById('farm').produces.perLevel, 10)
check('灵田产出货币键 = spiritual', buildingById('farm').produces.key, 'spiritual')
check('亭卫 / 鸦巢舍没有产出', buildingById('pavilion').produces, null)
check('鸦巢舍上限 3 级', buildingById('rookery').maxLevel, 3)
check('灵田上限 5 级', buildingById('farm').maxLevel, 5)
check('教程三步', TUTORIAL_IDS, ['farm', 'rookery', 'pavilion'])

// ================= 二、民心 =================
check('民心 100 → 1.20', moraleCoefOf(100), 1.2)
check('民心 90 → 1.20（边界）', moraleCoefOf(90), 1.2)
check('民心 89 → 1.10', moraleCoefOf(89), 1.1)
check('民心 70 → 1.10', moraleCoefOf(70), 1.1)
check('民心 69 → 1.00', moraleCoefOf(69), 1.0)
check('民心 50 → 1.00', moraleCoefOf(50), 1.0)
check('民心 49 → 0.90', moraleCoefOf(49), 0.9)
check('民心 30 → 0.90', moraleCoefOf(30), 0.9)
check('民心 29 → 0.80', moraleCoefOf(29), 0.8)
check('民心 10 → 0.80', moraleCoefOf(10), 0.8)
check('民心 9 → 0.50', moraleCoefOf(9), 0.5)
check('民心 0 → 0.50', moraleCoefOf(0), 0.5)
check('民心等级 95 = 拥戴', moraleLabelOf(95), '拥戴')
check('民心等级 60 = 一般', moraleLabelOf(60), '一般')
check('民心等级 5 = 崩溃', moraleLabelOf(5), '崩溃')
check('基准：乡侯府 Lv1 = 55', moraleBaselineOf(1), 55)
check('基准：乡侯府 Lv5 = 75', moraleBaselineOf(5), 75)
check('新档民心 55', createEstateState().morale, 55)

// ================= 三、报价 =================
const farm2 = upgradeQuote('farm', 2)
check('灵田 Lv2 成本 = 40 × 0.9 = 36 二阶', farm2.costStone2, 36)
check('灵田 Lv2 成本换算成一阶 = 3600', farm2.costStones, 3600)
check('灵田 Lv2 工期 = 4 × 0.9 × 30 = 108 天', farm2.days, 108)
check('灵田 Lv2 徭役 100', farm2.labor, 100)
const manor2 = upgradeQuote('manor', 2)
check('乡侯府 Lv2 成本 = 48 二阶', manor2.costStone2, 48)
check('乡侯府 Lv2 工期 = 144 天', manor2.days, 144)
check('鸦巢舍 Lv2 工期 = 84 天', upgradeQuote('rookery', 2).days, 84)
check('亭卫 Lv2 工期 = 96 天', upgradeQuote('pavilion', 2).days, 96)
check('乡侯府 Lv5 成本 = 12,000 二阶', upgradeQuote('manor', 5).costStone2, 12000)
check('乡侯府 Lv5 换算一阶 = 1,200,000', upgradeQuote('manor', 5).costStones, 1200000)
check('乡侯府 Lv5 工期 = 864 天', upgradeQuote('manor', 5).days, 864)
check('灵田 Lv6 超出上限 → null', upgradeQuote('farm', 6), null)
check('鸦巢舍 Lv4 超出上限 → null', upgradeQuote('rookery', 4), null)
check('未知建筑 → null', upgradeQuote('nope', 2), null)
const farmFirst = upgradeQuote('farm', 1, { firstBuild: true })
check('首建免费（成本 0）', farmFirst.costStones, 0)
check('首建灵田工期 = 54 天（Lv1→2 的一半）', farmFirst.days, 54)
check('首建鸦巢舍工期 = 42 天', upgradeQuote('rookery', 1, { firstBuild: true }).days, 42)
check('首建亭卫工期 = 48 天', upgradeQuote('pavilion', 1, { firstBuild: true }).days, 48)
check('首建徭役仍取 Lv1→2 基准 = 100', farmFirst.labor, 100)
check('未建成 nextQuote 免费', nextQuoteOf(makeState(), 'farm').costStones, 0)
check('满级 nextQuote = null', nextQuoteOf(makeState({ buildings: { manor: 1, farm: 5 } }), 'farm'), null)

// ================= 四、徭役 =================
check('没有在建项目 → 满足率 1', laborSatisfactionOf(makeState()), 1)
check(
  '一个 100 需求 → 满足率 1',
  laborSatisfactionOf(makeState({ builds: { farm: { labor: 100 } } })),
  1
)
check(
  '4 个 500 需求 = 2000 → 1400/2000 = 0.7',
  laborSatisfactionOf(
    makeState({
      builds: { a: { labor: 500 }, b: { labor: 500 }, c: { labor: 500 }, d: { labor: 500 } }
    })
  ),
  0.7
)
check(
  '3 个 500 = 1500 → 1400/1500',
  laborSatisfactionOf(makeState({ builds: { a: { labor: 500 }, b: { labor: 500 }, c: { labor: 500 } } })),
  1400 / 1500
)
check(
  '需求 3000 → 0.4667（低于 50% 停工线）',
  laborSatisfactionOf(makeState({ builds: { a: { labor: 1000 }, b: { labor: 1000 }, c: { labor: 1000 } } })),
  1400 / 3000
)
check(
  '均分：2000 需求下 500 的项分到 350',
  laborAssignedOf(
    makeState({ builds: { a: { labor: 500 }, b: { labor: 500 }, c: { labor: 500 }, d: { labor: 500 } } }),
    'a'
  ),
  350
)

// ================= 五、税收 =================
check('乡侯府 Lv1 征收未开 → 0', taxMonthlyJinYeZi(makeState()), 0)
const taxState = makeState({ buildings: { manor: 2 }, morale: 55, prosperity: 30 })
check('乡侯府 Lv2 · 民心 55 → 43.68 金页子', taxMonthlyJinYeZi(taxState), 43.68)
check(
  '乡侯府 Lv3 · 民心 70 → 96.096 金页子',
  taxMonthlyJinYeZi(makeState({ buildings: { manor: 3 }, morale: 70 })),
  96.096
)
check(
  '乡侯府 Lv5 · 民心 90 → 419.328 金页子',
  taxMonthlyJinYeZi(makeState({ buildings: { manor: 5 }, morale: 90 })),
  419.328
)

// ================= 六、单日推进 =================
const freeFarm = makeState({
  buildings: { manor: 1 },
  builds: { farm: { targetLevel: 1, progress: 0, paid: 0, costStones: 0, days: 54, labor: 100, firstBuild: true } }
})
const freeDay = advanceEstateDay(freeFarm, { midnight: DAY, patrolled: false, stones: 0 })
check('首建免费：0 灵石也能推进', freeDay.state.builds.farm.progress > 0, true)
check('首建免费：一天推进 100/54', freeDay.state.builds.farm.progress, 100 / 54)
check('首建免费：不扣钱', freeDay.spent, 0)
const patrolDay = advanceEstateDay(freeFarm, { midnight: DAY, patrolled: true, stones: 0 })
check('巡视日 ×2 → 200/54', patrolDay.state.builds.farm.progress, 200 / 54)

const again = advanceEstateDay(freeDay.state, { midnight: DAY, patrolled: false, stones: 0 })
check('同一天重复结算 → 不推进', again.settled, false)
check('同一天重复结算 → 进度不变', again.state.builds.farm.progress, 100 / 54)

const gapState = makeState({
  lastDay: 0,
  builds: { farm: { targetLevel: 1, progress: 0, paid: 0, costStones: 0, days: 54, labor: 100 } }
})
const gap = advanceEstateDay(gapState, { midnight: 5 * DAY, patrolled: false, stones: 0 })
check('跨了 5 天也只结一天（防补跑）', gap.state.builds.farm.progress, 100 / 54)
check('跨天后 lastDay 直接跳到「刚结束的日历日」', gap.state.lastDay, 4)

const paidJob = makeState({
  buildings: { manor: 1, farm: 1 },
  builds: { farm: { targetLevel: 2, progress: 0, paid: 0, costStones: 3600, days: 108, labor: 100 } }
})
const pay1 = advanceEstateDay(paidJob, { midnight: DAY, patrolled: false, stones: 100000 })
check('升级第一天付款 = round(3600 × 0.9259%) = 33', pay1.spent, 33)
check('付款记进 paid', pay1.state.builds.farm.paid, 33)

const poor = advanceEstateDay(paidJob, { midnight: DAY, patrolled: false, stones: 10 })
check('灵石不足 → 不推进', poor.state.builds.farm.progress, 0)
check('灵石不足 → 不扣钱', poor.spent, 0)
check('灵石不足 → 记停工事件', poor.events.filter(e => e.kind === 'stall').length, 1)
check('首次日结日志记在 day 0（UI 显示第 1 日）', poor.state.log[0]?.day, 0)

const done = runDays(paidJob, 120, { stones: 1000000 })
check('逐日付款推完 108 天 → Lv.2', done.state.buildings.farm, 2)
check('完工后从在建表删除', done.state.builds.farm, undefined)
check('总付款恒等于总成本 3600', done.spent, 3600)
check('灵田升级期间仍在产出', done.gains.spiritual > 0, true)

const laborStopState = makeState({
  laborTotal: 400,
  // ⚠ 必须用真实建筑 id：`advanceEstateDay` 会删掉表里查不到的脏数据
  builds: {
    farm: { targetLevel: 2, progress: 0, paid: 0, costStones: 100, days: 10, labor: 500 },
    relay: { targetLevel: 2, progress: 0, paid: 0, costStones: 100, days: 10, labor: 500 }
  }
})
const laborStop = advanceEstateDay(laborStopState, { midnight: DAY, patrolled: false, stones: 100000 })
check('徭役满足率 400/1000 = 0.4 → 停工', laborStop.state.builds.farm.progress, 0)
check('徭役停工也记事件', laborStop.events.filter(e => e.kind === 'stall').length, 2)

const stallDays = runDays(
  makeState({
    laborTotal: 100,
    builds: { farm: { targetLevel: 2, progress: 0, paid: 0, costStones: 100, days: 10, labor: 500 } }
  }),
  10,
  { stones: 100000 }
)
check('连续停工 10 天只留 1 条同类日志（不刷屏）', stallDays.state.log.filter(r => r.kind === 'stall').length, 1)

// 完工当天不产出 / 不按新等级收税（日初等级快照）
const builtToday = makeState({
  buildings: { manor: 1 },
  builds: {
    farm: { targetLevel: 1, progress: 99.9, paid: 0, costStones: 0, days: 1, labor: 100, firstBuild: true }
  }
})
const dayBuilt = advanceEstateDay(builtToday, { midnight: DAY, patrolled: false, stones: 0 })
check('灵田完工当天不产出（次日才产）', dayBuilt.gains.spiritual, 0)
check('灵田完工当天等级已写回', dayBuilt.state.buildings.farm, 1)
const dayBuiltNext = advanceEstateDay(dayBuilt.state, { midnight: 2 * DAY, patrolled: false, stones: 0 })
check('灵田完工次日开始产出', dayBuiltNext.gains.spiritual, 10)

const manorToday = makeState({
  buildings: { manor: 1 },
  builds: {
    manor: { targetLevel: 2, progress: 99.9, paid: 0, costStones: 0, days: 1, labor: 0 }
  }
})
const manorDay = advanceEstateDay(manorToday, { midnight: DAY, patrolled: false, stones: 0 })
check('乡侯府当天升 Lv2：当天仍不收税', manorDay.gains.secular, 0)
check('乡侯府等级已写回 Lv2', manorDay.state.buildings.manor, 2)

// 进度已 100 的脏任务：先补尾款，付得起才完工
const dirtyJob = makeState({
  buildings: { manor: 1 },
  builds: { farm: { targetLevel: 1, progress: 100, paid: 0, costStones: 1000, days: 10, labor: 100 } }
})
const dirtyPaid = advanceEstateDay(dirtyJob, { midnight: DAY, patrolled: false, stones: 100000 })
check('脏任务（进度 100）会补尾款', dirtyPaid.spent, 1000)
check('脏任务补完尾款才完工', dirtyPaid.state.buildings.farm, 1)
const dirtyPoor = advanceEstateDay(dirtyJob, { midnight: DAY, patrolled: false, stones: 10 })
check('脏任务尾款不足 → 不完工', dirtyPoor.state.buildings.farm, undefined)

const moraleLow = advanceEstateDay(makeState({ morale: 50 }), { midnight: DAY, patrolled: false })
check('民心 50 → 52（每天 +2 向基准 55 靠拢）', moraleLow.state.morale, 52)
const moraleHigh = advanceEstateDay(makeState({ morale: 80 }), { midnight: DAY, patrolled: false })
check('民心 80 → 78（向下靠拢）', moraleHigh.state.morale, 78)
const moraleCap = advanceEstateDay(makeState({ morale: 54.5 }), { midnight: DAY, patrolled: false })
check('靠拢不越过基准', moraleCap.state.morale, 55)
const moraleDirty = advanceEstateDay(makeState({ morale: undefined }), { midnight: DAY, patrolled: false })
check('脏档缺 morale → 按基准 55 起步', moraleDirty.state.morale, 55)

// ================= 七、产出 =================
check(
  '灵田 Lv1 · 民心 55 → 10 一阶/天',
  productionOf(makeState({ buildings: { manor: 1, farm: 1 } }), 'farm'),
  10
)
check(
  '灵田 Lv1 巡视日 → 20',
  productionOf(makeState({ buildings: { manor: 1, farm: 1 } }), 'farm', { patrolled: true }),
  20
)
check(
  '灵田 Lv1 · 民心 95（系数 1.2）→ 12',
  productionOf(makeState({ buildings: { manor: 1, farm: 1 }, morale: 95 }), 'farm'),
  12
)
check(
  '灵田 Lv3 · 民心 55 → 30',
  productionOf(makeState({ buildings: { manor: 1, farm: 3 } }), 'farm'),
  30
)
check(
  '没建灵田 → 0',
  productionOf(makeState(), 'farm'),
  0
)

const prodDay = advanceEstateDay(makeState({ buildings: { manor: 1, farm: 1 } }), {
  midnight: DAY,
  patrolled: false
})
check('日结把灵田产出入账', prodDay.gains.spiritual, 10)
const prodPatrol = advanceEstateDay(makeState({ buildings: { manor: 1, farm: 1 } }), {
  midnight: DAY,
  patrolled: true
})
check('巡视日产出翻倍', prodPatrol.gains.spiritual, 20)

// ================= 八、征收 =================
const taxOff = runDays(makeState(), 30, { stones: 1000000 })
check('乡侯府 Lv1 征收条不涨', taxOff.state.taxProgress, 0)
check('乡侯府 Lv1 没有税收入账', taxOff.gains.secular, 0)

const taxOn = runDays(makeState({ buildings: { manor: 2 } }), 30, { stones: 1000000 })
check('乡侯府 Lv2 · 30 天满格入库一次', taxOn.gains.secular, 4368)
check('征收进度回到 0', taxOn.state.taxProgress, 0)
// 推 30 次日结 = 日历日 0..29，全在 month 0
check('记录已征收月份 = 0', taxOn.state.taxCollectedMonth, 0)

const taxPatrol = runDays(makeState({ buildings: { manor: 2 } }), 15, {
  stones: 1000000,
  patrolled: true
})
check('巡视日 15 天就满格', taxPatrol.gains.secular, 4368)

const taxTwice = makeState({
  buildings: { manor: 2 },
  taxProgress: 99,
  taxCollectedMonth: 0
})
const twice = advanceEstateDay(taxTwice, { midnight: 10 * DAY, patrolled: false, stones: 1000000 })
check('同月已收过 → 不再入库', twice.gains.secular, 0)
check('同月已收过 → 进度不再涨（提前满不叠下月）', twice.state.taxProgress, 99)

// 收完之后本月的剩余天数不再积累
const taxRest = runDays(makeState({ buildings: { manor: 2 } }), 16, { stones: 1000000, patrolled: true })
check('巡视 15 天收一次', taxRest.gains.secular, 4368)
check('收完后同月进度停在 0', taxRest.state.taxProgress, 0)

// ================= 九、教程 / 展示 =================
check('新档教程在第 0 步', tutorialStepOf(makeState()), 0)
check('建了灵田 → 第 1 步', tutorialStepOf(makeState({ buildings: { manor: 1, farm: 1 } })), 1)
check(
  '灵田 + 鸦巢舍 → 第 2 步',
  tutorialStepOf(makeState({ buildings: { manor: 1, farm: 1, rookery: 1 } })),
  2
)
check(
  '三步建完 → 3（完成）',
  tutorialStepOf(makeState({ buildings: { manor: 1, farm: 1, rookery: 1, pavilion: 1 } })),
  3
)

const dayState = { patrolEndSeconds: 6 * 3600 + 2 * 3600 }
check('巡视结束落在当日窗口 → true', patrolSettledInWindow(dayState, 0, DAY), true)
check('巡视结束在上一日窗口 → false', patrolSettledInWindow(dayState, -DAY, 0), false)
check('没有 dayLoop → false', patrolSettledInWindow(null, 0, DAY), false)

check('产出条 00:00 = 0', productionBarOf(0, false), 0)
check('产出条 12:00 = 50', productionBarOf(12 * 3600, false), 50)
check('产出条 18:00 = 75', productionBarOf(18 * 3600, false), 75)
check('产出条 06:00 巡视日 = 50（一天两趟）', productionBarOf(6 * 3600, true), 50)

// ================= 十、归一化 / 静态扫描 =================
check('老档没有 estate → 重建默认', normalizeEstate(null).buildings.manor, 1)
check('estate 被写成 null → 重建默认', normalizeEstate(null).lastDay, -1)
check('脏档 buildings 为空 → 乡侯府兜回 Lv1', normalizeEstate({ buildings: {} }).buildings.manor, 1)
check(
  '老档保留已有建筑',
  normalizeEstate({ buildings: { manor: 2, farm: 1 } }).buildings.manor,
  2
)
check(
  '老档流水超上限会被截断',
  normalizeEstate({ log: new Array(60).fill({ day: 0, text: 'x' }) }).log.length,
  ESTATE_TUNING.logLimit
)
check(
  '流水上限 = 40',
  ESTATE_TUNING.logLimit,
  40
)

const pluginSource = readFileSync(join(root, 'src/plugins/estate.js'), 'utf8')
check(
  '纯函数层不依赖 Vue / Pinia / store',
  /from ['"](vue|pinia)/.test(pluginSource) || /from ['"][^'"]*stores\//.test(pluginSource),
  false
)
check(
  '纯函数层不写 saveData',
  /saveData\s*\(/.test(pluginSource),
  false
)

// ================= 十一、运行时层接线（mock store） =================
// 只验「action 有没有把钱记对、入口校验对不对」；纯函数细节上面已经覆盖。
const runtime = {
  estate: createEstateState(),
  // 第 0 个日历日窗口 [0, 86400) 内巡视结束 ⇒ 结算 dayIndex 1 时算巡视日
  dayLoop: { patrolEndSeconds: 6 * 3600 + 2 * 3600 },
  clockGameTime: DAY,
  currency: { secular: 0, spiritual: 100000, strategic: 0 },
  saveData() {}
}
Object.assign(runtime, estateActions)

runtime.estate = { ...runtime.estate, buildings: { manor: 1, farm: 1 } }
runtime.advanceEstateDay(DAY)
check('运行时：日结把灵田产出记进 currency.spiritual（巡视日 ×2）', runtime.currency.spiritual, 100020)
check('运行时：lastDay 写回 state（刚结束的日历日）', runtime.estate.lastDay, 0)
runtime.advanceEstateDay(DAY)
check('运行时：同一天重复调不重复入账', runtime.currency.spiritual, 100020)

const buildResult = runtime.startEstateBuild('rookery')
check('运行时：建造入口返回 ok', buildResult.ok, true)
check('运行时：首建不进 buildings、先进 builds', !!runtime.estate.builds.rookery, true)
check('运行时：首建成本 0', runtime.estate.builds.rookery.costStones, 0)
check('运行时：重复建造被拒', runtime.startEstateBuild('rookery').ok, false)
check('运行时：已建成不能重复建造', runtime.startEstateBuild('farm').ok, false)
check('运行时：施工中不能升级', runtime.startEstateUpgrade('rookery').ok, false)
check('运行时：未开放建筑被拒', runtime.startEstateBuild('relay').ok, false)
const upgradeResult = runtime.startEstateUpgrade('farm')
check('运行时：升级入口返回 ok', upgradeResult.ok, true)
check('运行时：升级写进 builds', runtime.estate.builds.farm.targetLevel, 2)
check('运行时：升级成本 3600 一阶', runtime.estate.builds.farm.costStones, 3600)

// ================= 输出 =================
if (LIST) {
  for (const label of labels) console.log(`[LIST] ${label}`)
  console.log(`\n共 ${labels.length} 条断言`)
  process.exit(0)
}

const width = Math.max(...results.map(r => r.label.length), 10)
console.log('\n封地经营断言（《模块四》MVP · 建筑表 / 民心 / 徭役 / 报价 / 日结 / 产出 / 征收）\n')
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
