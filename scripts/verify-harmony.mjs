// 契合度数值断言 —— 直接跑纯函数，不用起游戏
//
//   npm run verify
//
// 断言表就是《灵气系统》§7.2 与 §4.3 的机器可读版。改 harmony.js / tiers.js /
// cultivationData.js 的数值后跑一遍，能挡住「改了数值但没意识到门槛被改坏」。
//
// 三条**反向断言**证明门槛不是装饰：
//   · 开局 50.25% < 练气三层 55% —— 第一道门槛必须拦人（这是三维化后的核心意图）
//   · 木属性三阶灵地对桂冈匹配 0% → 结丹 50% < 85%
//   · 不入品本命拿四阶同参，上限仍是 20%

import {
  TUNING,
  calcHarmony,
  calcFateItemHarmony,
  calcQiArtHarmony,
  calcSpiritLandHarmony,
  fateItemHarmonyOf,
  qiArtHarmonyOf,
  proximityVs,
  playerFates,
  playerElements,
  fateSpeedCoef,
  fitFactorOf,
  spiritPerSecondOf,
  qiArtProficiency,
  qiArtLevelOf
} from '../src/plugins/harmony.js'
import { buildInitialPractice, SPIRIT_LAND_MAP, QI_ART_MAP, landOutput } from '../src/plugins/cultivationData.js'
import { isTierAtLeast, FATE_ITEM_TIER_COEFF, LAND_OUTPUT } from '../src/plugins/tiers.js'
import { getBreakthroughRequirement, getLandTierRequirement } from '../src/plugins/realm.js'

let failures = 0
const results = []

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps

const check = (label, actual, expected, detail = '') => {
  const ok =
    typeof expected === 'number' && typeof actual === 'number'
      ? close(actual, expected)
      : actual === expected
  if (!ok) failures++
  results.push({ ok, label, actual, expected, detail })
  return ok
}

const pct = v => (typeof v === 'number' ? `${(v * 100).toFixed(2)}%` : String(v))
const W = TUNING.weights
const weighted = (a, f, l) => a * W.qiArt + f * W.fateItem + l * W.spiritLand

// ---------- 素材 ----------

const base = buildInitialPractice()
const HOURS_MAX = 2000 * 3600 // 熟练度顶满所需的游戏秒（2000 游戏小时 = 20%）
const MAX_ENTRY = { practiceSeconds: HOURS_MAX }

/** 切换主修功法（熟练度不动 —— 开局那几本的熟练度都是 0） */
const activeArt = (practice, id) => ({ ...practice, qiArts: { ...practice.qiArts, active: id } })

/**
 * 把某本功法「塞进已知」并切过去（指定熟练度）。
 * 用来跑《灵气系统》§7.2 的**设计目标**路径 —— 那条路径假设兽/器功法已经拿到手，
 * 而它们在本批里还没有获取途径（属模块四/五）。
 */
const grantArt = (practice, id, seconds = 0) => ({
  ...practice,
  qiArts: { active: id, known: { ...practice.qiArts.known, [id]: { practiceSeconds: seconds } } }
})

/** 把某本功法设为已学且熟练度顶满 */
const withArt = (practice, id) => ({
  ...practice,
  qiArts: { active: id, known: { ...practice.qiArts.known, [id]: { practiceSeconds: HOURS_MAX } } }
})

/** 合成同参（三阶/四阶同系列在现有数据里还不存在，获取途径属模块四/五） */
const SYNTH_ITEM_T3 = { kind: '器物', series: 'taotie', bondFateId: null, tier: '3' }
const SYNTH_ITEM_T4 = { kind: '器物', series: 'taotie', bondFateId: null, tier: '4' }
/** 合成功法：筑基级「部分匹配」在现有数据里不存在（万兽御器经是完全匹配） */
const SYNTH_ART_FOUNDATION = { grade: 'foundation', elements: ['beast'] }
/** 金丹级完全匹配直接用真数据：兽器同源经（兽+器，覆盖率 2/2） */
const coreArtHarmony = () => calcQiArtHarmony(withArt(base, 'beast_vessel_core'))

// ---------- 0. 基础事实 ----------

check('玩家灵气 = 兽 + 器', JSON.stringify(playerElements(base)), JSON.stringify(['beast', 'vessel']))
check('本命数量系数 = 0.8（双本命双灵根）', fateSpeedCoef(base), 0.8)
check('桂冈两个本命都是四阶', playerFates(base).every(f => f.tier === '4'), true)
check('开局灵地 = 快子峰顶木屋', base.spiritLand.current, 'kuaizi_hut')
check('快子峰基础产出 = 1.5', landOutput(SPIRIT_LAND_MAP.kuaizi_hut), 1.5)

// 熟练度公式：每 100 游戏小时 +1%，上限 20%（旧版是 hours×0.01，快了 100 倍）
check('熟练度 @100 游戏小时 = 1%', qiArtProficiency({ practiceSeconds: 100 * 3600 }), 0.01)
check('熟练度 @2000 游戏小时 = 20%（上限）', qiArtProficiency({ practiceSeconds: HOURS_MAX }), 0.2)
check('熟练度 @10000 游戏小时仍为 20%（封顶）', qiArtProficiency({ practiceSeconds: 10000 * 3600 }), 0.2)
check('功法层数 @2000 小时 = 21 → 钳制到 20', qiArtLevelOf(MAX_ENTRY, QI_ART_MAP.yuan_ming), 20)
check('功法层数 @0 小时 = 1', qiArtLevelOf({ practiceSeconds: 0 }, QI_ART_MAP.gui_blood), 1)

// ---------- 1. 开局（全链路，真实初始存档）----------

const open = calcHarmony(base)
check('开局·功法契合', open.qiArt, 0.2)
check('开局·同参契合', open.fateItem, 0.245)
check('开局·灵地契合', open.spiritLand, 1.0)
check('开局·综合契合度', open.total, 0.5025)
check('开局·综合 = 加权重算', open.total, weighted(open.qiArt, open.fateItem, open.spiritLand))
check('开局·三维权重合计 = 1', W.qiArt + W.fateItem + W.spiritLand, 1)
check('开局·本命已不是契合度维度', 'destiny' in open, false)

const fit0 = fitFactorOf(open.total)
check('开局·契合度项 (0.7 + 0.5025×0.6)', fit0, 0.7 + 0.5025 * 0.6)
const sps0 = spiritPerSecondOf({
  landOutput: landOutput(SPIRIT_LAND_MAP.kuaizi_hut),
  fitFactor: fit0,
  spiritRate: 1,
  fateCoef: fateSpeedCoef(base),
  bandwidth: TUNING.bandwidth,
  childrenBonus: TUNING.childrenBonus
})
check('开局·灵力/秒', sps0, 1.2018, `${sps0.toFixed(4)}（文档 §9 写 1.20）`)

// ---------- 2. §7.2 成长路径（逐行）----------

const synthRow = (stage, qiArt, fateItem, spiritLand, level, landReq = null) => {
  const total = weighted(qiArt, fateItem, spiritLand)
  return {
    stage,
    harmony: { qiArt, fateItem, spiritLand, total },
    gateReq: getBreakthroughRequirement(level),
    landReq
  }
}

const rows = [
  synthRow('开局', open.qiArt, open.fateItem, open.spiritLand, 3),
  synthRow('换功法', calcQiArtHarmony(grantArt(base, 'beast_vessel_dual')), calcFateItemHarmony(base), 1.0, 3),
  synthRow('换同参', 0.2, fateItemHarmonyOf(SYNTH_ITEM_T3, base), 1.0, 6),
  synthRow(
    '换功法+同参',
    calcQiArtHarmony(grantArt(base, 'beast_vessel_dual')),
    fateItemHarmonyOf(SYNTH_ITEM_T3, base),
    1.0,
    9
  ),
  synthRow(
    '筑基配置',
    qiArtHarmonyOf(SYNTH_ART_FOUNDATION, MAX_ENTRY, base),
    fateItemHarmonyOf(SYNTH_ITEM_T3, base),
    1.0,
    11,
    getLandTierRequirement(11)
  ),
  synthRow('结丹配置', coreArtHarmony(), fateItemHarmonyOf(SYNTH_ITEM_T4, base), 1.0, 15, getLandTierRequirement(15)),
  synthRow('元婴配置', 1.0, 1.0, 1.0, 15)
]

const EXPECTED = {
  开局: { qiArt: 0.2, fateItem: 0.245, spiritLand: 1.0, total: 0.5025, pass: false },
  换功法: { qiArt: 0.6, fateItem: 0.245, spiritLand: 1.0, total: 0.5625, pass: true },
  换同参: { qiArt: 0.2, fateItem: 0.525, spiritLand: 1.0, total: 0.6425, pass: true },
  '换功法+同参': { qiArt: 0.6, fateItem: 0.525, spiritLand: 1.0, total: 0.7025, pass: true },
  筑基配置: { qiArt: 0.7, fateItem: 0.525, spiritLand: 1.0, total: 0.7175, pass: true },
  结丹配置: { qiArt: 1.0, fateItem: 0.7, spiritLand: 1.0, total: 0.85, pass: true },
  元婴配置: { qiArt: 1.0, fateItem: 1.0, spiritLand: 1.0, total: 1.0, pass: true }
}

for (const row of rows) {
  const e = EXPECTED[row.stage]
  check(`${row.stage}·功法`, row.harmony.qiArt, e.qiArt)
  check(`${row.stage}·同参`, row.harmony.fateItem, e.fateItem)
  check(`${row.stage}·灵地`, row.harmony.spiritLand, e.spiritLand)
  check(`${row.stage}·综合`, row.harmony.total, e.total)
  check(
    `${row.stage}·综合 ${e.pass ? '≥' : '<'} 门槛 ${pct(row.gateReq)}`,
    row.harmony.total >= row.gateReq,
    e.pass,
    `${pct(row.harmony.total)} vs ${pct(row.gateReq)}`
  )
}

// ---------- 3. 反向断言：门槛必须真的拦人 ----------

check('★开局 50.25% < 练气三层门槛 55% —— 必须被拦', open.total < getBreakthroughRequirement(3), true,
  `${pct(open.total)} vs ${pct(getBreakthroughRequirement(3))}`)

// 第一层门槛是**教学关**：开局三本都不匹配，过不去；
// 换到「元氏修命经」（金丹级，品阶分 20% → 40%）能把综合顶到 53.25%，但还差 1.75 个点；
// 再把功法熟练度养到 12%（1200 游戏小时 ≈ 20 现实分钟）就过线。
check(
  '开局只送三本不匹配功法（兽/器五本都未解锁）',
  ['gui_blood', 'lv_sequential', 'yuan_ming'].every(id => base.qiArts.known[id]) &&
    ['beast_roar', 'vessel_jue', 'beast_vessel_dual', 'beast_vessel_found', 'beast_vessel_core'].every(
      id => !base.qiArts.known[id]
    ),
  true
)

const yuan = activeArt(base, 'yuan_ming')
check('★换到元氏修命经（金丹级）→ 功法 40%', calcQiArtHarmony(yuan), 0.4)
check('  综合 53.25%，仍差 1.75pt —— 单换功法不够', calcHarmony(yuan).total, 0.5325)
check('  桂氏/吕氏都是练气篇，换了等于没换', calcHarmony(activeArt(base, 'lv_sequential')).total, open.total)

// 再养熟练度：过三层要求功法 ≥ 51.67%，元氏修命经 40% 打底，还差 11.67%
const needQiArt = (getBreakthroughRequirement(3) - open.fateItem * W.fateItem - open.spiritLand * W.spiritLand) / W.qiArt
check('★过三层所需功法契合 = 51.67%', needQiArt, 0.5166667)
check(
  '  对应熟练度约 11.67% → 约 1167 游戏小时',
  Math.round(((needQiArt - 0.4) / TUNING.qiArt.profPer100Hours) * 100),
  1167
)

const yuanP = h => ({
  ...yuan,
  qiArts: { ...yuan.qiArts, known: { ...yuan.qiArts.known, yuan_ming: { practiceSeconds: h * 3600 } } }
})
check('★元氏修命经 + 熟练度 12%（1200 游戏小时）→ 55.05%，过三层', calcHarmony(yuanP(1200)).total, 0.5505)
check('  此时确实过线', calcHarmony(yuanP(1200)).total >= getBreakthroughRequirement(3), true)
check('  熟练度 11% 时还差一点', calcHarmony(yuanP(1100)).total < getBreakthroughRequirement(3), true,
  `${pct(calcHarmony(yuanP(1100)).total)}`)

// 灵地属性 vs 灵地品阶是两条独立校验
const zhengjia = calcSpiritLandHarmony({ ...base, spiritLand: { ...base.spiritLand, current: 'zhengjia_core' } })
check('★郑家核心（木）对桂冈匹配 0%', zhengjia, 0)
const atCore = weighted(coreArtHarmony(), fateItemHarmonyOf(SYNTH_ITEM_T4, base), zhengjia)
check('★带木属性三阶灵地·结丹综合 50% < 85%', atCore < getBreakthroughRequirement(15), true,
  `${pct(atCore)} vs ${pct(getBreakthroughRequirement(15))}`)

const wanshou = calcSpiritLandHarmony({ ...base, spiritLand: { ...base.spiritLand, current: 'wanshou_valley' } })
check('万兽谷兽栏（兽70%+器30%）对桂冈匹配 100%', wanshou, 1.0)
const atValley = weighted(coreArtHarmony(), fateItemHarmonyOf(SYNTH_ITEM_T4, base), wanshou)
check('带万兽谷·结丹综合 85% ≥ 门槛 85%', atValley >= getBreakthroughRequirement(15), true,
  `${pct(atValley)} vs ${pct(getBreakthroughRequirement(15))}`)

// ---------- 4. 本命品阶封顶同参（《灵气系统》§4.3 的四个例子）----------

const F = FATE_ITEM_TIER_COEFF
/** 单个本命下的同参契合 = 接近度 × min(同参品阶, 本命品阶) */
const capped = (item, fate) => proximityVs(item, fate) * Math.min(F[item.tier] ?? F.none, F[fate.tier] ?? F.none)

const FATE_NONE = { id: 'f', kind: '器物', series: 's', tier: 'none' }
const FATE_T4 = { id: 'f', kind: '器物', series: 's', tier: '4' }
/** 正主：bondFateId 指向本命 id；同系列：同 series 但非正主 */
const ITEM_PRIMARY_NONE = { bondFateId: 'f', kind: '器物', series: 'x', tier: 'none' }
const ITEM_SERIES_T4 = { bondFateId: null, kind: '器物', series: 's', tier: '4' }
const ITEM_PRIMARY_T4 = { bondFateId: 'f', kind: '器物', series: 'x', tier: '4' }
const ITEM_SERIES_NONE = { bondFateId: null, kind: '器物', series: 's', tier: 'none' }

check('§4.3 不入品本命 + 不入品正主 = 20%', capped(ITEM_PRIMARY_NONE, FATE_NONE), 0.2)
check('§4.3 不入品本命 + 四阶同系列 = 14%', capped(ITEM_SERIES_T4, FATE_NONE), 0.14)
check('§4.3 四阶本命 + 四阶正主 = 100%', capped(ITEM_PRIMARY_T4, FATE_T4), 1.0)
check('§4.3 四阶本命 + 不入品同系列 = 14%', capped(ITEM_SERIES_NONE, FATE_T4), 0.14)
check('★本命品阶封顶：四阶同参放到不入品本命上，上限仍是 20%', Math.min(F['4'], F.none), 0.2)

// ---------- 5. 品阶表自洽 ----------

check('品阶系数 二阶 = 0.55', F['2中'], 0.55)
check('品阶系数 四阶 = 1.00', F['4'], 1.0)
check('灵地产出 五阶 = 15.0', LAND_OUTPUT['5'], 15.0)
check('灵地四阶 ≥ 三阶', isTierAtLeast('4', '3'), true)
check('一阶中品 不满足三阶要求', isTierAtLeast('1中', '3'), false)
check('无灵地要求一律通过', isTierAtLeast('1下', null), true)

// ---------- 输出 ----------

const pad = (s, n) => String(s).padEnd(n, ' ')
const width = Math.max(...results.map(r => [...r.label].length)) + 2

console.log('\n契合度断言（《灵气系统》§7.2 / §4.3 · 三维加权版）\n')
for (const r of results) {
  const mark = r.ok ? '  ok  ' : ' FAIL '
  const detail = r.detail ? `   ${r.detail}` : ''
  const show = typeof r.actual === 'number' ? r.actual.toFixed(4) : r.actual
  console.log(`[${mark}] ${pad(r.label, width)} ${show}${detail}`)
}

console.log(`\n${results.length - failures}/${results.length} 通过`)
if (failures > 0) {
  console.error(`\n${failures} 条断言失败\n`)
  process.exit(1)
}
console.log('全部通过 ✅\n')
