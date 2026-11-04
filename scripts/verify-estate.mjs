// 封地经营纯函数断言（模块四 v2 · a 段地基，2026-11-03）。
//
// 覆盖：
//   · 建筑表（21 种 / Lv1 四栋 / id 唯一 / 教程三步 / 解锁阶梯）
//   · 人口与徭役（村民上限 / 总人口含子嗣 / 徭役 25%）
//   · 报价（档位固定价 / ×2 递增 / 工期 / 徭役 = 目标等级 × 200 / 首建）
//   · 单日推进（巡视按小时折算 / 付款总额 = 总成本 / 灵石不足停工 / 完工升级 / 幂等）
//   · 产出（中间产物进独立仓 / 500 上限 / 满仓停产 / 不乘民心）
//   · 征收（Lv1 未开 / Lv2 起 / 30 天满 / 巡视 28 天 / 每月最多 1 次 / 一阶入账）
//   · 归一化（v1 population/morale → v2 villagers/storage）
//   · 静态扫描：纯函数层不 import Vue / Pinia / store
//
// 风格与 verify-offline.mjs 一致：常量断言，不做统计。
//   node scripts/verify-estate.mjs           完整输出
//   node scripts/verify-estate.mjs --list    只列断言标题
//   VERIFY_FILTER=征收 node scripts/verify-estate.mjs --quiet  只跑匹配项
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BUILDINGS,
  CHAIN_LINKS,
  ESTATE_TUNING,
  GAME_SECONDS_PER_DAY,
  PRODUCTS,
  STORAGE_KEYS,
  TUTORIAL_IDS,
  advanceEstateDay,
  buildableBuildings,
  buildingById,
  chainCapacityOf,
  chainViewOf,
  createEstateState,
  isBuildingUnlocked,
  laborAssignedOf,
  laborPlanOf,
  laborSatisfactionOf,
  laborTotalOf,
  marketLevelCoefOf,
  mvpBuildings,
  nextQuoteOf,
  normalizeEstate,
  patrolFactorOf,
  patrolSettledInWindow,
  productionBarOf,
  productionOf,
  productNameOf,
  productTierOf,
  productUnitPriceOf,
  taxMonthlyStone1Of,
  techTreeBuildings,
  totalPopulationOf,
  tutorialStepOf,
  upgradeQuote,
  villagerCapOf
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

/** 造一个可推进的状态：默认乡侯府 Lv1 */
const makeState = patch => ({ ...createEstateState(), ...(patch || {}) })

/** 连推 n 天（midnight = day×86400，从 day=1 开始），返回累计收益 */
const runDays = (
  state,
  days,
  { patrolHours = 0, stones = Number.MAX_SAFE_INTEGER, offspringCount = 0, realmTier = 'qi' } = {}
) => {
  let s = state
  let budget = stones
  const gains = { spiritual: 0, secular: 0, taxStone1: 0, chainStone1: 0 }
  const productGains = { wine: 0, pill: 0, craft: 0 }
  const storageGains = { grain: 0, herb: 0, ore: 0 }
  let spent = 0
  let events = []
  for (let i = 1; i <= days; i += 1) {
    const r = advanceEstateDay(s, {
      midnight: i * DAY,
      patrolHours,
      stones: budget,
      offspringCount,
      realmTier
    })
    s = r.state
    budget -= r.spent
    spent += r.spent
    gains.spiritual += r.gains.spiritual
    gains.secular += r.gains.secular
    gains.taxStone1 += r.gains.taxStone1
    gains.chainStone1 += r.gains.chainStone1 || 0
    for (const key of Object.keys(productGains)) productGains[key] += r.productGains?.[key] || 0
    for (const key of STORAGE_KEYS) storageGains[key] += r.storageGains[key] || 0
    events = events.concat(r.events)
  }
  return { state: s, gains, productGains, storageGains, spent, events, budget }
}

// 人口增长会让 30 天后的税收比首日多一点点；数值断言里先冻结增长，测完恢复。
const savedGrowth = ESTATE_TUNING.villagerGrowthPerYear

// ================= 一、建筑表 =================
check('建筑表 21 种', BUILDINGS.length, 21)
check('Lv1 可建 4 个', mvpBuildings().length, 4)
check(
  'Lv1 建筑按教程顺序',
  mvpBuildings().map(b => b.id),
  ['manor', 'farm', 'rookery', 'pavilion']
)
check('乡侯府 Lv1 时科技树剩 17 种', techTreeBuildings({ buildings: { manor: 1 } }).length, 17)
check('建筑 id 唯一', new Set(BUILDINGS.map(b => b.id)).size, BUILDINGS.length)
check('乡侯府开局即有', buildingById('manor').initial, true)
check('只有乡侯府 initial', BUILDINGS.filter(b => b.initial).length, 1)
check('灵田日产粮 4/级', buildingById('farm').produces.perLevel, 4)
check('灵田产出键 = grain', buildingById('farm').produces.key, 'grain')
check('药圃产灵植 3/级', buildingById('herbGarden').produces.perLevel, 3)
check('矿场产矿石 4/级', buildingById('mine').produces.perLevel, 4)
check('炭场不产中间产物（只提速，B11）', buildingById('charcoal').produces, null)
check('亭卫 / 鸦巢舍没有产出', buildingById('pavilion').produces, null)
check('鸦巢舍上限 3 级', buildingById('rookery').maxLevel, 3)
check('灵田上限 5 级', buildingById('farm').maxLevel, 5)
check('教程三步', TUTORIAL_IDS, ['farm', 'rookery', 'pavilion'])
check('新增 5 栋齐全', ['winery', 'market', 'archive', 'mortuary', 'furnace'].every(id => !!buildingById(id)), true)
check('档位只有 small / medium / large', new Set(BUILDINGS.map(b => b.tier)).size, 3)

// ================= 二、人口 / 徭役 =================
check('村民上限 Lv1 = 5,600', villagerCapOf(1), 5600)
check('村民上限 Lv2 = 7,500', villagerCapOf(2), 7500)
check('村民上限 Lv5 = 20,000', villagerCapOf(5), 20000)
check('总人口 = 村民 + 子嗣', totalPopulationOf(makeState(), 100), 5700)
check('徭役 = 总人口 × 25%', laborTotalOf(makeState(), 100), 1425)
check('没有在建项目 → 满足率 1', laborSatisfactionOf(makeState()), 1)
check(
  '一个 400 需求 → 满足率 1',
  laborSatisfactionOf(makeState({ builds: { farm: { labor: 400 } } })),
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
  '显式徭役 1425：4 个 500 → 1425/2000',
  laborSatisfactionOf(
    makeState({
      builds: { a: { labor: 500 }, b: { labor: 500 }, c: { labor: 500 }, d: { labor: 500 } }
    }),
    1425
  ),
  1425 / 2000
)
// ---------- 徭役逐项分配（2026-11-04：修「全体停工死锁」） ----------
// 旧口径是全体共用一个满足率：总需求 > 2×徭役 ⇒ 所有项目 <50% ⇒ 全部停工，且完工不了
// ⇒ 需求永不下降 = 永久死锁。新口径先开工的先拿满，够不到 50% 的排队（不占徭役）。
const fourJobs = makeState({
  builds: {
    a: { labor: 500, seq: 1 },
    b: { labor: 500, seq: 2 },
    c: { labor: 500, seq: 3 },
    d: { labor: 500, seq: 4 }
  }
})
check('逐项分配：先开工的拿满 500', laborAssignedOf(fourJobs, 'a'), 500)
check('逐项分配：第 3 项分到剩下的 400（80%，仍 ≥50%）', laborAssignedOf(fourJobs, 'c'), 400)
check('逐项分配：第 4 项拿不到 50% → 排队，不占徭役', laborAssignedOf(fourJobs, 'd'), 0)
check('逐项分配：已派徭役 = 池子 1,400（不多派也不少派）', laborPlanOf(fourJobs).assigned, 1400)

const eightJobs = makeState({
  builds: Object.fromEntries(
    ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, i) => [id, { labor: 400, seq: i + 1 }])
  )
})
const eightPlan = laborPlanOf(eightJobs)
check('8×400 = 3,200 需求：前 3 项满员', eightPlan.plan.a.assigned + eightPlan.plan.b.assigned + eightPlan.plan.c.assigned, 1200)
check('8×400：第 4 项分到 200（恰 50%，仍开工）', eightPlan.plan.d.satisfaction, 0.5)
check('8×400：第 5 项起排队', [eightPlan.plan.e.waiting, eightPlan.plan.f.waiting, eightPlan.plan.g.waiting, eightPlan.plan.h.waiting], [true, true, true, true])
check('8×400：整体满足率仍是 0.4375（旧口径：全体停工）', laborSatisfactionOf(eightJobs) < 0.5, true)

// 老档没有 seq：按 builds 的插入顺序兜底（JSON 往返保序）
const legacyJobs = makeState({
  builds: { farm: { labor: 1000 }, rookery: { labor: 1000 }, mine: { labor: 1000 } }
})
check('老档无 seq → 按插入顺序先给 farm', laborAssignedOf(legacyJobs, 'farm'), 1000)
check('老档无 seq：第二个分到剩余 400 → 40% 排队', laborPlanOf(legacyJobs).plan.rookery.waiting, true)

// ================= 三、报价（档位固定价 / ×2） =================
const farm2 = upgradeQuote('farm', 2)
check('灵田（小）Lv2 成本 = 26 二阶', farm2.costStone2, 26)
check('灵田 Lv2 成本换算成一阶 = 2600', farm2.costStones, 2600)
check('灵田 Lv2 工期 = 4 × 30 = 120 天', farm2.days, 120)
check('灵田 Lv2 徭役 = 2 × 200 = 400', farm2.labor, 400)
const farm5 = upgradeQuote('farm', 5)
check('灵田 Lv5 成本 = 26 × 8 = 211 二阶（×2 递增）', farm5.costStone2, 211)
check('灵田 Lv5 工期 = 24 × 30 = 720 天', farm5.days, 720)
check('灵田 Lv5 徭役 = 5 × 200 = 1000', farm5.labor, 1000)
const manor2 = upgradeQuote('manor', 2)
check('乡侯府（大）Lv2 成本 = 88 二阶', manor2.costStone2, 88)
check('乡侯府 Lv2 工期 = 120 天', manor2.days, 120)
const manor5 = upgradeQuote('manor', 5)
check('乡侯府 Lv5 成本 = 88 × 8 = 704 二阶', manor5.costStone2, 704)
check('乡侯府 Lv5 换算一阶 = 70,400', manor5.costStones, 70400)
check('乡侯府 Lv5 工期 = 720 天', manor5.days, 720)
check('鸦巢舍（小）Lv2 成本 = 26 二阶', upgradeQuote('rookery', 2).costStone2, 26)
check('亭卫（小）Lv2 成本 = 26 二阶', upgradeQuote('pavilion', 2).costStone2, 26)
check('灵田 Lv6 超出上限 → null', upgradeQuote('farm', 6), null)
check('鸦巢舍 Lv4 超出上限 → null', upgradeQuote('rookery', 4), null)
check('未知建筑 → null', upgradeQuote('nope', 2), null)
const farmFirst = upgradeQuote('farm', 1, { firstBuild: true })
check('首建免费（成本 0）', farmFirst.costStones, 0)
check('首建灵田工期 = 60 天（Lv1→2 的一半）', farmFirst.days, 60)
check('首建鸦巢舍工期 = 60 天', upgradeQuote('rookery', 1, { firstBuild: true }).days, 60)
check('首建徭役 = Lv1 × 200 = 200', farmFirst.labor, 200)
check('未建成 nextQuote 免费', nextQuoteOf(makeState(), 'farm').costStones, 0)
check('满级 nextQuote = null', nextQuoteOf(makeState({ buildings: { manor: 1, farm: 5 } }), 'farm'), null)

// ---------- 分段定价（§10.7，2026-11-04 落地）----------
// 练气 88 / 筑基 700 / 金丹 3,000（占位）二阶每游戏月 × 档位系数 × 2^(Lv−2)
check('★筑基段：灵田（小）Lv2 = 700 × 0.3 = 210 二阶',
  upgradeQuote('farm', 2, { realmTier: 'foundation' }).costStone2, 210)
check('★筑基段：乡侯府（大）Lv2 = 700 二阶',
  upgradeQuote('manor', 2, { realmTier: 'foundation' }).costStone2, 700)
check('★金丹段：乡侯府（大）Lv2 = 3,000 二阶（占位）',
  upgradeQuote('manor', 2, { realmTier: 'core' }).costStone2, 3000)
check('未知段名退回练气轴', upgradeQuote('farm', 2, { realmTier: 'nope' }).costStone2, 26)
check('★nextQuoteOf 传段名生效',
  nextQuoteOf(makeState({ buildings: { manor: 1, farm: 1 } }), 'farm', 'foundation').costStone2, 210)

// ---------- 快子峰木屋：2026-11-04 按真实档重标（筑基巅峰 / 115 子嗣锚点）----------
// 中档 0.6 × 分段收入；工期单独拉长到 Lv2 6 / Lv3 12 游戏月
const woodQi2 = upgradeQuote('woodcutter', 2)
check('木屋练气段 Lv2 = 53 二阶（88 × 0.6）', woodQi2.costStone2, 53)
check('木屋练气段 Lv3 = 106 二阶（×2）', upgradeQuote('woodcutter', 3).costStone2, 106)
check('★木屋筑基段 Lv2 = 420 二阶（700 × 0.6）',
  upgradeQuote('woodcutter', 2, { realmTier: 'foundation' }).costStone2, 420)
check('★木屋筑基段 Lv3 = 840 二阶（×2）',
  upgradeQuote('woodcutter', 3, { realmTier: 'foundation' }).costStone2, 840)
check('★木屋 Lv2 工期 = 6 × 30 = 180 天（自带覆盖表）', woodQi2.days, 180)
check('★木屋 Lv3 工期 = 12 × 30 = 360 天', upgradeQuote('woodcutter', 3).days, 360)
check('木屋首建仍是 Lv1→2 的一半 = 90 天',
  upgradeQuote('woodcutter', 1, { firstBuild: true }).days, 90)
check('木屋上限仍是 3 级', upgradeQuote('woodcutter', 4), null)

// ================= 四、税收 =================
ESTATE_TUNING.villagerGrowthPerYear = 0
check('乡侯府 Lv1 征收未开 → 0', taxMonthlyStone1Of(makeState()), 0)
check(
  '乡侯府 Lv2 · 5,600 人 · 繁荣 30 → 1,747.2 一阶',
  taxMonthlyStone1Of(makeState({ buildings: { manor: 2 } })),
  1747.2
)
check(
  '乡侯府 Lv3 → 3,494.4 一阶',
  taxMonthlyStone1Of(makeState({ buildings: { manor: 3 } })),
  3494.4
)
check(
  '乡侯府 Lv5 → 13,977.6 一阶',
  taxMonthlyStone1Of(makeState({ buildings: { manor: 5 } })),
  13977.6
)
check(
  '加 100 子嗣 → 总人口 5,700，税收 1,778.4',
  taxMonthlyStone1Of(makeState({ buildings: { manor: 2 } }), 100),
  1778.4
)

// ================= 五、单日推进 =================
const freeFarm = makeState({
  buildings: { manor: 1 },
  builds: { farm: { targetLevel: 1, progress: 0, paid: 0, costStones: 0, days: 60, labor: 200, firstBuild: true } }
})
const freeDay = advanceEstateDay(freeFarm, { midnight: DAY, patrolHours: 0, stones: 0 })
check('首建免费：0 灵石也能推进', freeDay.state.builds.farm.progress > 0, true)
check('首建免费：一天推进 100/60', freeDay.state.builds.farm.progress, 100 / 60)
check('首建免费：不扣钱', freeDay.spent, 0)
const patrolDay = advanceEstateDay(freeFarm, { midnight: DAY, patrolHours: 2, stones: 0 })
check('巡视 2 小时 → (24+2)/24 折算', patrolDay.state.builds.farm.progress, (100 / 60) * (26 / 24))

const again = advanceEstateDay(freeDay.state, { midnight: DAY, patrolHours: 0, stones: 0 })
check('同一天重复结算 → 不推进', again.settled, false)
check('同一天重复结算 → 进度不变', again.state.builds.farm.progress, 100 / 60)

const gapState = makeState({
  lastDay: 0,
  builds: { farm: { targetLevel: 1, progress: 0, paid: 0, costStones: 0, days: 60, labor: 200 } }
})
const gap = advanceEstateDay(gapState, { midnight: 5 * DAY, patrolHours: 0, stones: 0 })
check('跨了 5 天也只结一天（防补跑）', gap.state.builds.farm.progress, 100 / 60)
check('跨天后 lastDay 直接跳到「刚结束的日历日」', gap.state.lastDay, 4)

const paidJob = makeState({
  buildings: { manor: 1, farm: 1 },
  builds: { farm: { targetLevel: 2, progress: 0, paid: 0, costStones: 2600, days: 120, labor: 400 } }
})
const pay1 = advanceEstateDay(paidJob, { midnight: DAY, patrolHours: 0, stones: 100000 })
check('升级第一天付款 = round(2600 × 0.8333%) = 22', pay1.spent, 22)
check('付款记进 paid', pay1.state.builds.farm.paid, 22)

const poor = advanceEstateDay(paidJob, { midnight: DAY, patrolHours: 0, stones: 10 })
check('灵石不足 → 不推进', poor.state.builds.farm.progress, 0)
check('灵石不足 → 不扣钱', poor.spent, 0)
check('灵石不足 → 记停工事件', poor.events.filter(e => e.kind === 'stall').length, 1)
check('首次日结日志记在 day 0（UI 显示第 1 日）', poor.state.log[0]?.day, 0)

const done = runDays(paidJob, 130, { stones: 1000000 })
check('逐日付款推完 120 天 → Lv.2', done.state.buildings.farm, 2)
check('完工后从在建表删除', done.state.builds.farm, undefined)
check('总付款恒等于总成本 2600', done.spent, 2600)
check('灵田升级期间仍在产出（进独立仓）', done.storageGains.grain > 0, true)

const laborStopState = makeState({
  buildings: { manor: 1 },
  // 村民 0 ⇒ 徭役 0；需求 1,000 ⇒ 满足率 0，必然停工
  villagers: 0,
  // ⚠ 必须用真实建筑 id：`advanceEstateDay` 会删掉表里查不到的脏数据
  builds: {
    farm: { targetLevel: 2, progress: 0, paid: 0, costStones: 100, days: 10, labor: 500 },
    rookery: { targetLevel: 2, progress: 0, paid: 0, costStones: 100, days: 10, labor: 500 }
  }
})
const laborStop = advanceEstateDay(laborStopState, {
  midnight: DAY,
  patrolHours: 0,
  stones: 100000
})
check('徭役 0/1000 = 0 → 停工', laborStop.state.builds.farm.progress, 0)
check('徭役停工也记事件', laborStop.events.filter(e => e.kind === 'stall').length, 2)

// ★ 死锁回归（2026-11-04）：8 个项目同时在建 = 需求 3,200 > 2×1,400。
//   旧口径全体满足率 43.75% < 50% ⇒ 全部停工、谁都完不了工 ⇒ 永久卡死。
const queueState = makeState({
  buildings: { manor: 1 },
  builds: Object.fromEntries(
    ['relay', 'woodcutter', 'beacon', 'rookery', 'farm', 'charcoal', 'mine', 'workshop'].map((id, i) => [
      id,
      { targetLevel: 1, progress: 0, paid: 0, costStones: 0, days: 1, labor: 400, seq: i + 1, firstBuild: true }
    ])
  )
})
const queue1 = advanceEstateDay(queueState, { midnight: DAY, patrolHours: 0, stones: 0 })
check(
  '★ 死锁回归：第 1 天先开工的 3 项直接完工',
  ['relay', 'woodcutter', 'beacon'].every(id => queue1.state.buildings[id] === 1),
  true
)
check('★ 死锁回归：第 4 项分到 50% → 推进一半', queue1.state.builds.rookery.progress, 50)
check('★ 死锁回归：第 5 项排队，进度不动', queue1.state.builds.farm.progress, 0)
check(
  '★ 排队日志按天聚合（4 项排队只写 1 条，不刷满 40 条流水）',
  queue1.state.log.filter(r => r.text.includes('个项目排队中')).length,
  1
)
check('★ 死锁回归：4 天内 8 项全部完工（旧口径会永久卡死）', Object.keys(runDays(queueState, 4, { stones: 0 }).state.builds).length, 0)

// 排队项要能被「前面的完工」自动接手：第 2 天剩余徭役全部释放
const queue2 = advanceEstateDay(queue1.state, { midnight: 2 * DAY, patrolHours: 0, stones: 0 })
check('★ 排队自动接上：第 2 天原来排队的项目直接完工', queue2.state.buildings.farm, 1)
check('★ 排队自动接上：队尾项目开始分到徭役（50%）', queue2.state.builds.mine.progress, 50)

const stallDays = runDays(
  makeState({
    buildings: { manor: 1 },
    villagers: 0,
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
    farm: { targetLevel: 1, progress: 99.9, paid: 0, costStones: 0, days: 1, labor: 200, firstBuild: true }
  }
})
const dayBuilt = advanceEstateDay(builtToday, { midnight: DAY, patrolHours: 0, stones: 0 })
check('灵田完工当天不产出（次日才产）', dayBuilt.storageGains.grain, 0)
check('灵田完工当天等级已写回', dayBuilt.state.buildings.farm, 1)
const dayBuiltNext = advanceEstateDay(dayBuilt.state, { midnight: 2 * DAY, patrolHours: 0, stones: 0 })
check('灵田完工次日开始产粮', dayBuiltNext.storageGains.grain, 4)

const manorToday = makeState({
  buildings: { manor: 1 },
  builds: {
    manor: { targetLevel: 2, progress: 99.9, paid: 0, costStones: 0, days: 1, labor: 0 }
  }
})
const manorDay = advanceEstateDay(manorToday, { midnight: DAY, patrolHours: 0, stones: 0 })
check('乡侯府当天升 Lv2：当天仍不收税', manorDay.gains.spiritual, 0)
check('乡侯府等级已写回 Lv2', manorDay.state.buildings.manor, 2)

// 进度已 100 的脏任务：先补尾款，付得起才完工
const dirtyJob = makeState({
  buildings: { manor: 1 },
  builds: { farm: { targetLevel: 1, progress: 100, paid: 0, costStones: 1000, days: 10, labor: 200 } }
})
const dirtyPaid = advanceEstateDay(dirtyJob, { midnight: DAY, patrolHours: 0, stones: 100000 })
check('脏任务（进度 100）会补尾款', dirtyPaid.spent, 1000)
check('脏任务补完尾款才完工', dirtyPaid.state.buildings.farm, 1)
const dirtyPoor = advanceEstateDay(dirtyJob, { midnight: DAY, patrolHours: 0, stones: 10 })
check('脏任务尾款不足 → 不完工', dirtyPoor.state.buildings.farm, undefined)

// 人口自然增长（2.5% / 年，按天复利）
// ⚠ Lv1 上限就是 5,600，开局即满 ⇒ 要先升乡侯府才看得到增长（预期行为）
ESTATE_TUNING.villagerGrowthPerYear = 0.025
const grow0 = advanceEstateDay(makeState(), { midnight: DAY, patrolHours: 0 })
check('Lv1 开局即满上限 → 存量不涨', grow0.state.villagers, 5600)
const grow1 = advanceEstateDay(makeState({ buildings: { manor: 2 } }), {
  midnight: DAY,
  patrolHours: 0
})
check(
  '乡侯府 Lv2 村民一天增长 = 2.5% 的 1/365 复利',
  grow1.state.villagers,
  5600 * Math.pow(1.025, 1 / 365)
)
const growCap = advanceEstateDay(
  makeState({ buildings: { manor: 2 }, villagers: 7500 }),
  { midnight: DAY, patrolHours: 0 }
)
check('村民不越过上限（Lv2 = 7,500）', growCap.state.villagers <= 7500, true)
ESTATE_TUNING.villagerGrowthPerYear = 0

// ================= 六、产出（中间产物独立仓） =================
check(
  '灵田 Lv1 → 4 粮/天',
  productionOf(makeState({ buildings: { manor: 1, farm: 1 } }), 'farm'),
  4
)
check(
  '灵田 Lv2 巡视 2 小时 → 9（8×26/24 取整）',
  productionOf(makeState({ buildings: { manor: 1, farm: 2 } }), 'farm', { patrolHours: 2 }),
  9
)
check(
  '灵田 Lv3 → 12',
  productionOf(makeState({ buildings: { manor: 1, farm: 3 } }), 'farm'),
  12
)
check('没建灵田 → 0', productionOf(makeState(), 'farm'), 0)

const prodDay = advanceEstateDay(makeState({ buildings: { manor: 1, farm: 1 } }), {
  midnight: DAY,
  patrolHours: 0
})
check('日结把灵田产出进独立仓', prodDay.storageGains.grain, 4)
check('中间产物不进钱袋', prodDay.gains.spiritual, 0)
const prodPatrol = advanceEstateDay(makeState({ buildings: { manor: 1, farm: 2 } }), {
  midnight: DAY,
  patrolHours: 2
})
check('巡视 2 小时产出按 (24+2)/24 折算', prodPatrol.storageGains.grain, 9)

// 仓满停产
const storageFull = advanceEstateDay(
  makeState({ buildings: { manor: 1, farm: 5 }, storage: { grain: 495, herb: 0, ore: 0 } }),
  { midnight: DAY, patrolHours: 0 }
)
check('仓差 5 格时只入 5（不溢出）', storageFull.storageGains.grain, 5)
check('仓封顶 500', storageFull.state.storage.grain, 500)
const storageOver = advanceEstateDay(
  makeState({ buildings: { manor: 1, farm: 1 }, storage: { grain: 500, herb: 0, ore: 0 } }),
  { midnight: DAY, patrolHours: 0 }
)
check('仓满 → 停产', storageOver.storageGains.grain, 0)
check('仓满 → 记停工日志', storageOver.state.log.some(r => r.text.includes('仓满')), true)
check('中间产物仓上限 = 500', ESTATE_TUNING.storageCap, 500)
check('L1 中间产物只有 3 种', STORAGE_KEYS, ['grain', 'herb', 'ore'])

// 巡视系数：(24+S)/24，S 上限 5（dayLoop.TUNING.patrol.maxHours）
check('巡视系数 · 没巡视 = 1', patrolFactorOf(0), 1)
check('巡视系数 · S=2 → 26/24', patrolFactorOf(2), 26 / 24)
check('巡视系数 · S=5 → 29/24', patrolFactorOf(5), 29 / 24)
check('巡视系数 · 脏档 S=99 → 按上限 5 兜底', patrolFactorOf(99), 29 / 24)

// ================= 六之二、经营链 L1（b 段） =================
check('经营链 3 条', CHAIN_LINKS.length, 3)
check(
  '经营链映射 = 酒坊/丹炉/工坊',
  CHAIN_LINKS.map(row => row.building),
  ['winery', 'furnace', 'workshop']
)
check('酒：2 粮 → 1 灵酒', [PRODUCTS.wine.inputPerOutput, PRODUCTS.wine.outputPerLevel], [2, 2])
check('丹：3 灵植 → 1 灵丹', [PRODUCTS.pill.inputPerOutput, PRODUCTS.pill.outputPerLevel], [3, 1])
check('器：4 矿石 → 1 法器', [PRODUCTS.craft.inputPerOutput, PRODUCTS.craft.outputPerLevel], [4, 1])
check('成品阶 · 练气 = 1', productTierOf('qi'), 1)
check('成品阶 · 筑基 = 2', productTierOf('foundation'), 2)
check('成品阶 · 金丹 = 3', productTierOf('core'), 3)
check('成品阶 · 脏档兜底 1', productTierOf('nope'), 1)
check('酒名 · 一/二/三阶', [1, 2, 3].map(t => productNameOf('wine', t)), ['灵酒', '玉液', '仙酿'])
check('丹名 · 一/二/三阶', [1, 2, 3].map(t => productNameOf('pill', t)), ['灵丹', '玄丹', '仙丹'])
check('器名 · 一/二/三阶', [1, 2, 3].map(t => productNameOf('craft', t)), ['法器', '宝器', '仙器'])
check('市集等级系数 · Lv1 = 1', marketLevelCoefOf(1), 1)
check('市集等级系数 · Lv2 = 1.2', marketLevelCoefOf(2), 1.2)
check('市集等级系数 · Lv3 = 1.4', marketLevelCoefOf(3), 1.4)
check('单价 · 一阶灵酒 6 × 2.0 = 12', productUnitPriceOf('wine', 1, 1), 12)
check('单价 · 二阶玉液 24 × 2.0 = 48', productUnitPriceOf('wine', 2, 1), 48)
check('单价 · 三阶仙酿 96 × 2.0 × 1.2 = 230.4', productUnitPriceOf('wine', 3, 2), 230.4)
check('市集解锁 = 乡侯府 Lv2', buildingById('market').unlock.manorLevel, 2)
check('乡侯府 Lv1：市集没解锁', isBuildingUnlocked({ buildings: { manor: 1 } }, 'market'), false)
check('乡侯府 Lv2：市集解锁', isBuildingUnlocked({ buildings: { manor: 2 } }, 'market'), true)

check(
  '酒坊 Lv1 产能 = 2 灵酒/天',
  chainCapacityOf(makeState({ buildings: { manor: 2, winery: 1 } }), 'winery'),
  2
)
check(
  '酒坊 Lv3 巡视 2 小时 → 7 灵酒/天（6×26/24 取整）',
  chainCapacityOf(makeState({ buildings: { manor: 2, winery: 3 } }), 'winery', { patrolHours: 2 }),
  7
)

// 无市集 → 不耗料、不产成品（闸门）
const noMarket = advanceEstateDay(
  makeState({ buildings: { manor: 2, farm: 1, winery: 1 } }),
  { midnight: DAY, patrolHours: 0 }
)
check('没建市集：酒链不产成品', noMarket.productGains.wine, 0)
check('没建市集：不耗粮（灵田 4 粮全进仓）', noMarket.state.storage.grain, 4)
check('没建市集：没有链收入', noMarket.gains.chainStone1, 0)

// 市集 + 酒坊：当天新粮当天酿，2 灵酒 × 12 = 24
const wineDay = advanceEstateDay(
  makeState({ buildings: { manor: 2, farm: 1, winery: 1, market: 1 } }),
  { midnight: DAY, patrolHours: 0 }
)
check('酒链：产 2 灵酒', wineDay.productGains.wine, 2)
check('酒链：耗 4 粮（仓清空）', wineDay.state.storage.grain, 0)
check('酒链：入账 2 × 12 = 24 一阶', wineDay.gains.chainStone1, 24)
check('酒链：收入进 currency 一阶总账', wineDay.gains.spiritual, 24)

// 丹链 / 器链
const pillDay = advanceEstateDay(
  makeState({ buildings: { manor: 2, herbGarden: 1, furnace: 1, market: 1 } }),
  { midnight: DAY, patrolHours: 0 }
)
check('丹链：产 1 灵丹', pillDay.productGains.pill, 1)
check('丹链：耗 3 灵植', pillDay.state.storage.herb, 0)
check('丹链：入账 12 一阶', pillDay.gains.chainStone1, 12)

const craftDay = advanceEstateDay(
  makeState({ buildings: { manor: 3, mine: 1, workshop: 1, market: 1 } }),
  { midnight: DAY, patrolHours: 0 }
)
check('器链：产 1 法器', craftDay.productGains.craft, 1)
check('器链：耗 4 矿石', craftDay.state.storage.ore, 0)
check('器链：入账 12 一阶', craftDay.gains.chainStone1, 12)

// 原料不足 → 按现有量生产，不欠账
const starved = advanceEstateDay(
  makeState({
    buildings: { manor: 2, winery: 1, market: 1 },
    storage: { grain: 3, herb: 0, ore: 0 }
  }),
  { midnight: DAY, patrolHours: 0 }
)
check('原料 3 粮 → 只产 1 灵酒', starved.productGains.wine, 1)
check('原料 3 粮 → 只耗 2 粮', starved.state.storage.grain, 1)
check('原料不足按件补足，不预支', starved.gains.chainStone1, 12)

// 仓满时照样消耗
const fullStock = advanceEstateDay(
  makeState({
    buildings: { manor: 2, winery: 1, market: 1 },
    storage: { grain: 500, herb: 0, ore: 0 }
  }),
  { midnight: DAY, patrolHours: 0 }
)
check('仓满：酒坊照常耗 4 粮', fullStock.state.storage.grain, 496)
check('仓满：照样产 2 灵酒', fullStock.productGains.wine, 2)

// 境界段换阶
const foundationDay = advanceEstateDay(
  makeState({
    buildings: { manor: 2, winery: 1, market: 1 },
    storage: { grain: 100, herb: 0, ore: 0 }
  }),
  { midnight: DAY, patrolHours: 0, realmTier: 'foundation' }
)
check('筑基：2 灵酒 × 48 = 96 一阶', foundationDay.gains.chainStone1, 96)
const coreDay = advanceEstateDay(
  makeState({
    buildings: { manor: 2, winery: 1, market: 1 },
    storage: { grain: 100, herb: 0, ore: 0 }
  }),
  { midnight: DAY, patrolHours: 0, realmTier: 'core' }
)
check('金丹：2 仙酿 × 192 = 384 一阶', coreDay.gains.chainStone1, 384)

// 市集等级系数
const market2Day = advanceEstateDay(
  makeState({
    buildings: { manor: 2, winery: 1, market: 2 },
    storage: { grain: 100, herb: 0, ore: 0 }
  }),
  { midnight: DAY, patrolHours: 0 }
)
check('市集 Lv2：2 × 12 × 1.2 = 28.8 → 29', market2Day.gains.chainStone1, 29)
const market3Day = advanceEstateDay(
  makeState({
    buildings: { manor: 2, winery: 1, market: 3 },
    storage: { grain: 100, herb: 0, ore: 0 }
  }),
  { midnight: DAY, patrolHours: 0 }
)
check('市集 Lv3：2 × 12 × 1.4 = 33.6 → 34', market3Day.gains.chainStone1, 34)

// chainViewOf：四种状态
const chainNoMarket = chainViewOf(makeState({ buildings: { manor: 2, winery: 1 } }), {
  realmTier: 'qi'
})
check('链视图：没市集 → no-market', chainNoMarket[0].reason, 'no-market')
check('链视图：没市集 → made 0', chainNoMarket[0].made, 0)
check('链视图：没市集 → 不耗料', chainNoMarket[0].consumed, 0)
const chainUnbuilt = chainViewOf(makeState({ buildings: { manor: 2, market: 1 } }), {
  realmTier: 'qi'
})
check('链视图：未建造 → unbuilt', chainUnbuilt[0].reason, 'unbuilt')
const chainStarved = chainViewOf(
  makeState({
    buildings: { manor: 2, winery: 1, market: 1 },
    storage: { grain: 1, herb: 0, ore: 0 }
  }),
  { realmTier: 'qi' }
)
check('链视图：原料不足 → starved', chainStarved[0].reason, 'starved')
const chainOk = chainViewOf(
  makeState({
    buildings: { manor: 2, winery: 1, market: 1 },
    storage: { grain: 4, herb: 0, ore: 0 }
  }),
  { realmTier: 'qi' }
)
check('链视图：运转 → ok', chainOk[0].reason, 'ok')
check('链视图：产 2 / 耗 4 / 日入 24', [chainOk[0].made, chainOk[0].consumed, chainOk[0].income], [2, 4, 24])
check('链视图：满产日入 = 24', chainOk[0].fullIncome, 24)
check('链视图：满产原料日耗 = 4', chainOk[0].intake, 4)
check('链视图：成品名随境界段', chainViewOf(makeState({ buildings: { manor: 2, winery: 1, market: 1 } }), {
  realmTier: 'foundation'
})[0].productName, '玉液')

// 30 天连续：灵田 4/天 全部喂给酒坊，仓不积压
const chain30 = runDays(
  makeState({ buildings: { manor: 2, farm: 1, winery: 1, market: 1 } }),
  30
)
check('30 天：每天 2 灵酒 = 60', chain30.productGains.wine, 60)
check('30 天：粮仓不积压（日产日清）', chain30.state.storage.grain, 0)
check('30 天：链收入 60 × 12 = 720 一阶', chain30.gains.chainStone1, 720)
check('30 天：灵田产 120 粮，链耗 120 粮', chain30.storageGains.grain, 120)

// ================= 七、征收 =================
check('乡侯府 Lv1 征收条不涨', runDays(makeState(), 30).state.taxProgress, 0)
check('乡侯府 Lv1 没有税收入账', runDays(makeState(), 30).gains.spiritual, 0)

const taxOn = runDays(makeState({ buildings: { manor: 2 } }), 30)
check('乡侯府 Lv2 · 30 天满格入库一次（1,747 一阶）', taxOn.gains.spiritual, 1747)
check('征收进度回到 0', taxOn.state.taxProgress, 0)
check('记录已征收月份 = 0', taxOn.state.taxCollectedMonth, 0)

// 100/30 × 26/24 = 3.611%/天 ⇒ 满格要 28 天
const taxPatrol = runDays(makeState({ buildings: { manor: 2 } }), 28, { patrolHours: 2 })
check('巡视 2 小时 · 28 天满格', taxPatrol.gains.spiritual, 1747)

const taxTwice = makeState({
  buildings: { manor: 2 },
  taxProgress: 99,
  taxCollectedMonth: 0
})
const twice = advanceEstateDay(taxTwice, { midnight: 10 * DAY, patrolHours: 0, stones: 1000000 })
check('同月已收过 → 不再入库', twice.gains.spiritual, 0)
check('同月已收过 → 进度不再涨（提前满不叠下月）', twice.state.taxProgress, 99)

const taxRest = runDays(makeState({ buildings: { manor: 2 } }), 29, { patrolHours: 2 })
check('巡视 29 天（28 天满 + 1 天余量）收一次', taxRest.gains.spiritual, 1747)
check('收完后同月进度停在 0', taxRest.state.taxProgress, 0)

// 恢复人口增长（后续断言不再依赖固定人口）
ESTATE_TUNING.villagerGrowthPerYear = savedGrowth

// ================= 八、教程 / 解锁阶梯 =================
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

check('药浴池解锁条件 = 乡侯府 Lv.2', buildingById('bathhouse').unlock.manorLevel, 2)
check('乡侯府 Lv.1 → 药浴池没解锁', isBuildingUnlocked({ buildings: { manor: 1 } }, 'bathhouse'), false)
check('乡侯府 Lv.2 → 药浴池解锁', isBuildingUnlocked({ buildings: { manor: 2 } }, 'bathhouse'), true)
check('Lv1 建筑恒可用（灵田）', isBuildingUnlocked({ buildings: { manor: 1 } }, 'farm'), true)
check('没有这个建筑 → false', isBuildingUnlocked({ buildings: { manor: 5 } }, 'nope'), false)
check(
  '乡侯府 Lv.1：可建 4 个',
  buildableBuildings({ buildings: { manor: 1 } }).length,
  4
)
check(
  '乡侯府 Lv.2：解锁 10 个（市集提前到 Lv2）',
  buildableBuildings({ buildings: { manor: 2 } }).length,
  10
)
check(
  '乡侯府 Lv.5：21 个全解锁',
  buildableBuildings({ buildings: { manor: 5 } }).length,
  21
)
check(
  '乡侯府 Lv.2：药浴池从科技树里消失',
  techTreeBuildings({ buildings: { manor: 2 } }).some(b => b.id === 'bathhouse'),
  false
)
check(
  '乡侯府 Lv.1：药浴池还挂在科技树',
  techTreeBuildings({ buildings: { manor: 1 } }).some(b => b.id === 'bathhouse'),
  true
)
const bathFirst = upgradeQuote('bathhouse', 1, { firstBuild: true })
check('药浴池首建免费', bathFirst.costStones, 0)
check('药浴池首建工期 60 天', bathFirst.days, 60)
const bathUp = nextQuoteOf({ buildings: { manor: 2, bathhouse: 1 } }, 'bathhouse')
check('药浴池升 Lv2 成本 8,800 一阶（88 二阶）', bathUp.costStones, 8800)
check('药浴池升 Lv2 工期 120 天', bathUp.days, 120)

const dayState = { patrolEndSeconds: 6 * 3600 + 2 * 3600 }
check('巡视结束落在当日窗口 → true', patrolSettledInWindow(dayState, 0, DAY), true)
check('巡视结束在上一日窗口 → false', patrolSettledInWindow(dayState, -DAY, 0), false)
check('没有 dayLoop → false', patrolSettledInWindow(null, 0, DAY), false)

// 产出条：base = 当日已过比例，巡视那几小时额外多算（P53 #2）
const patrolWindow = { patrolStartSeconds: 6 * 3600, patrolEndSeconds: 8 * 3600 }
check('产出条 00:00 = 0', productionBarOf(0), 0)
check('产出条 12:00 = 50', productionBarOf(12 * 3600), 50)
check('产出条 18:00 = 75', productionBarOf(18 * 3600), 75)
check('产出条 06:00 巡视开始 = 25（还没多算）', productionBarOf(6 * 3600, patrolWindow), 25)
check(
  '产出条 08:00 巡视结束 = 41.67（25 + 2h 的 8.33）',
  productionBarOf(8 * 3600, patrolWindow),
  (8 * 3600 + 2 * 3600) / DAY * 100
)
check(
  '产出条 12:00 = 58.33',
  productionBarOf(12 * 3600, patrolWindow),
  (12 * 3600 + 2 * 3600) / DAY * 100
)
check('产出条：旧日期的巡视窗口不算（探索/秘境冻结）', productionBarOf(12 * 3600, {
  patrolStartSeconds: 6 * 3600 - DAY,
  patrolEndSeconds: 8 * 3600 - DAY
}), 50)

// ================= 九、归一化 / 静态扫描 =================
check('老档没有 estate → 重建默认', normalizeEstate(null).buildings.manor, 1)
check('estate 被写成 null → 重建默认', normalizeEstate(null).lastDay, -1)
check('脏档 buildings 为空 → 乡侯府兜回 Lv1', normalizeEstate({ buildings: {} }).buildings.manor, 1)
check('老档保留已有建筑', normalizeEstate({ buildings: { manor: 2, farm: 1 } }).buildings.manor, 2)
check('老档 population → villagers', normalizeEstate({ population: 4800 }).villagers, 4800)
check('老档 morale 被丢弃', 'morale' in normalizeEstate({ morale: 50 }), false)
check('老档没有 storage → 补 0', normalizeEstate({}).storage.grain, 0)
check(
  '老档流水超上限会被截断',
  normalizeEstate({ log: new Array(60).fill({ day: 0, text: 'x' }) }).log.length,
  ESTATE_TUNING.logLimit
)
check('流水上限 = 40', ESTATE_TUNING.logLimit, 40)

const pluginSource = readFileSync(join(root, 'src/plugins/estate.js'), 'utf8')
check(
  '纯函数层不依赖 Vue / Pinia / store',
  /from ['"](vue|pinia)/.test(pluginSource) || /from ['"][^'"]*stores\//.test(pluginSource),
  false
)
check('纯函数层不写 saveData', /saveData\s*\(/.test(pluginSource), false)

// ================= 十、运行时层接线（mock store） =================
// 只验「action 有没有把钱 / 仓记对、入口校验对不对」；纯函数细节上面已经覆盖。
const runtime = {
  estate: createEstateState(),
  offspring: { list: [] },
  // 第 0 个日历日窗口 [0, 86400) 内巡视结束 ⇒ 结算 dayIndex 1 时算巡视日；
  // dayStartSeconds 是判定 S 的起点（06:00），缺了会按 0 点算成 8 小时
  dayLoop: { dayStartSeconds: 6 * 3600, patrolEndSeconds: 6 * 3600 + 2 * 3600 },
  clockGameTime: DAY,
  currency: { secular: 0, spiritual: 100000, strategic: 0 },
  realmTier: 'qi',
  saveData() {}
}
Object.assign(runtime, estateActions)

runtime.estate = { ...runtime.estate, buildings: { manor: 1, farm: 1 } }
runtime.advanceEstateDay(DAY)
check('运行时：日结把灵田产出记进封地仓（巡视 2 小时 ⇒ 4 粮）', runtime.estate.storage.grain, 4)
check('运行时：中间产物不动钱袋', runtime.currency.spiritual, 100000)
check('运行时：lastDay 写回 state（刚结束的日历日）', runtime.estate.lastDay, 0)
runtime.advanceEstateDay(DAY)
check('运行时：同一天重复调不重复入账', runtime.estate.storage.grain, 4)

const buildResult = runtime.startEstateBuild('rookery')
check('运行时：建造入口返回 ok', buildResult.ok, true)
check('运行时：首建不进 buildings、先进 builds', !!runtime.estate.builds.rookery, true)
check('运行时：首建成本 0', runtime.estate.builds.rookery.costStones, 0)
check('运行时：重复建造被拒', runtime.startEstateBuild('rookery').ok, false)
check('运行时：已建成不能重复建造', runtime.startEstateBuild('farm').ok, false)
check('运行时：施工中不能升级', runtime.startEstateUpgrade('rookery').ok, false)
check('运行时：未解锁建筑被拒', runtime.startEstateBuild('relay').ok, false)
const upgradeResult = runtime.startEstateUpgrade('farm')
check('运行时：升级入口返回 ok', upgradeResult.ok, true)
check('运行时：升级写进 builds', runtime.estate.builds.farm.targetLevel, 2)
check('运行时：升级成本 2,600 一阶', runtime.estate.builds.farm.costStones, 2600)

// B4b：药浴池要乡侯府 Lv.2 才能动工
check('运行时：乡侯府 Lv.1 建药浴池被拒', runtime.startEstateBuild('bathhouse').ok, false)
runtime.estate = { ...runtime.estate, buildings: { ...runtime.estate.buildings, manor: 2 } }
check('运行时：乡侯府 Lv.2 可以建药浴池', runtime.startEstateBuild('bathhouse').ok, true)
check('运行时：药浴池首建进 builds', !!runtime.estate.builds.bathhouse, true)

// 经营链：运行时入账走同一个 currency.spiritual
const runtimeChain = {
  estate: {
    ...createEstateState(),
    buildings: { manor: 2, farm: 1, winery: 1, market: 1 }
  },
  offspring: { list: [] },
  dayLoop: { dayStartSeconds: 0, patrolEndSeconds: 0 },
  clockGameTime: DAY,
  currency: { secular: 0, spiritual: 0, strategic: 0 },
  realmTier: 'qi',
  saveData() {}
}
Object.assign(runtimeChain, estateActions)
runtimeChain.advanceEstateDay(DAY)
check('运行时：经营链收入进 currency.spiritual（24）', runtimeChain.currency.spiritual, 24)
check('运行时：粮被酒坊清空', runtimeChain.estate.storage.grain, 0)
check('运行时：封地仓没有成品（即产即卖）', 'wine' in runtimeChain.estate.storage, false)

// ================= 输出 =================
if (LIST) {
  for (const label of labels) console.log(`[LIST] ${label}`)
  console.log(`\n共 ${labels.length} 条断言`)
  process.exit(0)
}

const width = Math.max(...results.map(r => r.label.length), 10)
console.log('\n封地经营断言（《模块四》v2 · 建筑 / 人口 / 徭役 / 报价 / 日结 / 中间产物 / 征收）\n')
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
