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
import { getBreakthroughRequirement, getLandTierRequirement, getRealmName } from '../src/plugins/realm.js'
// 模块二（内宅 / 多子多福）。全部走注入的确定性 rng，不做统计断言。
import {
  TUNING as COURT,
  fatherCoefOf,
  rankName,
  promotedRankOf,
  energyMaxOf,
  pregnancyChanceOf,
  rollPregnancy,
  rootChanceOf,
  rollQuality,
  rollRootCount,
  rollRootElements,
  rollOffspring,
  offspringBonusOf,
  sumChildrenBonus,
  playerFateProfile,
  cnNumeral,
  gameDayOf,
  hourOfDay,
  remainingDays,
  AUTO_RULES,
  sortWivesByRule,
  pickAutoWives
} from '../src/plugins/innerCourt.js'
import {
  FATE_POOL,
  TRAIT_POOL,
  PRESET_WIVES,
  buildInitialInnerCourt,
  buildInitialOffspring
} from '../src/plugins/innerCourtData.js'
import { ELEMENTS } from '../src/plugins/wuxing.js'

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
// 开局无子嗣 —— childrenBonus 不传，走 spiritPerSecondOf 的默认 0。
// （原 TUNING.childrenBonus 占位常量已随模块二接入删除，见下方 §6。）
const sps0 = spiritPerSecondOf({
  landOutput: landOutput(SPIRIT_LAND_MAP.kuaizi_hut),
  fitFactor: fit0,
  spiritRate: 1,
  fateCoef: fateSpeedCoef(base),
  bandwidth: TUNING.bandwidth
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

// ---------- 6. 模块二：抽卡与概率（《模块二》§5.3 / §6.1 / §6.2）----------
//
// 全部用常量 rng，把累积分布的每一个边界都钉死；不做统计断言（会 flaky）。

// 父方身份系数 —— 修正设计 §6.1 的自相矛盾（系数表说练气 2.0，正文表却用 ×4）
check('父方系数·凡人 = 1.0', fatherCoefOf('mortal'), 1.0)
check('父方系数·练气 = 2.0', fatherCoefOf('qi'), 2.0)
check('父方系数·筑基 = 3.0', fatherCoefOf('foundation'), 3.0)
check('父方系数·结丹 = 4.0', fatherCoefOf('core'), 4.0)
check('父方系数·未知档回落 1.0', fatherCoefOf(undefined), 1.0)
// ★ 关键：系数键必须与 realm.js 境界对象的 tier 字段对齐，否则父方系数全靠默认值
check('★realm 练气一层 → 2.0', fatherCoefOf(getRealmName(1).tier), 2.0)
check('★realm 筑基初期 → 3.0', fatherCoefOf(getRealmName(11).tier), 3.0)
check('★realm 结丹初期 → 4.0', fatherCoefOf(getRealmName(15).tier), 4.0)

// 灵根概率 = 10% × 母方位阶灵根系数 × 父方系数（上限 100%）
check('灵根率 P1×练气 = 10%', rootChanceOf({ rank: 1, fatherTier: 'qi' }), 0.1)
check('灵根率 P3×练气 = 14%', rootChanceOf({ rank: 3, fatherTier: 'qi' }), 0.14)
check('灵根率 P4×练气 = 16%', rootChanceOf({ rank: 4, fatherTier: 'qi' }), 0.16)
check('灵根率 P5×练气 = 18%', rootChanceOf({ rank: 5, fatherTier: 'qi' }), 0.18)
check('灵根率 P6×练气 = 20%', rootChanceOf({ rank: 6, fatherTier: 'qi' }), 0.2)
check('灵根率 P4×筑基 = 24%', rootChanceOf({ rank: 4, fatherTier: 'foundation' }), 0.24)
check('灵根率 P4×结丹 = 32%', rootChanceOf({ rank: 4, fatherTier: 'core' }), 0.32)
check('★灵根率封顶：P10×结丹 = 100%（原始值正好 1.00）', rootChanceOf({ rank: 10, fatherTier: 'core' }), 1.0)
check('★灵根率封顶：P13×结丹 钳到 100%（原始值 160%）', rootChanceOf({ rank: 13, fatherTier: 'core' }), 1.0)

// 品质分布（第二步，已确定有灵根前提下的条件概率）
const QD = COURT.draw.qualityDist
check('品质分布合计 = 1', QD.low + QD.mid + QD.high + QD.top, 1)
check('品质·rng 0.00 → 下品', rollQuality(() => 0.0), 'low')
check('品质·rng 0.5999 → 下品（右边界外）', rollQuality(() => 0.5999), 'low')
check('品质·rng 0.61 → 中品', rollQuality(() => 0.61), 'mid')
check('品质·rng 0.84 → 中品', rollQuality(() => 0.84), 'mid')
check('品质·rng 0.86 → 上品', rollQuality(() => 0.86), 'high')
check('品质·rng 0.96 → 上品', rollQuality(() => 0.96), 'high')
check('品质·rng 0.99 → 极品', rollQuality(() => 0.99), 'top')

check('灵根数·下品 = 五灵根', rollRootCount({ quality: 'low', rng: () => 0 }), 5)
check('灵根数·上品 = 双灵根', rollRootCount({ quality: 'high', rng: () => 0 }), 2)
check('灵根数·极品 = 单灵根', rollRootCount({ quality: 'top', rng: () => 0 }), 1)
check('灵根数·中品 60% 分到四灵根', rollRootCount({ quality: 'mid', rng: () => 0.5 }), 4)
check('灵根数·中品 40% 分到三灵根', rollRootCount({ quality: 'mid', rng: () => 0.7 }), 3)
const roots2 = rollRootElements({ count: 2, rng: () => 0 })
check('★灵气不重复：抽 2 个得到 2 个互不相同的灵气', roots2.length === 2 && new Set(roots2).size === 2, true)

// 两步抽卡 + 两条保底
const p4qi = { rank: 4, fatherTier: 'qi', totalDraws: 5, pityNoRoot: 0 }
check('抽卡·16% 命中（rng 0.05）', rollOffspring({ ...p4qi, rng: () => 0.05 }).hasRoot, true)
check('抽卡·16% 未命中（rng 0.90）', rollOffspring({ ...p4qi, rng: () => 0.9 }).hasRoot, false)
check(
  '★首充礼包：第 1 个子嗣必定有灵根（rng 0.999 也中）',
  rollOffspring({ ...p4qi, totalDraws: 0, rng: () => 0.999 }).hasRoot,
  true
)
check(
  '★灵根保底：第 20 抽必出（pity 19）',
  rollOffspring({ ...p4qi, totalDraws: 19, pityNoRoot: 19, rng: () => 0.999 }).hasRoot,
  true
)
check(
  '  第 19 抽不保底（pity 18）',
  rollOffspring({ ...p4qi, totalDraws: 19, pityNoRoot: 18, rng: () => 0.999 }).hasRoot,
  false
)
const noRoot = rollOffspring({ ...p4qi, rng: () => 0.9 })
check(
  '无灵根时品质/灵根/本命/词条全为空值',
  noRoot.quality === null &&
    noRoot.rootCount === 0 &&
    noRoot.roots.length === 0 &&
    noRoot.fate === null &&
    noRoot.traits.length === 0,
  true
)
const withRoot = rollOffspring({ ...p4qi, rng: () => 0.05 })
check('有灵根时至少 1 个词条', withRoot.traits.length >= 1, true)
check('有灵根时本命非空', withRoot.fate !== null, true)
check('  该分支品质为下品（rng 0.05）', withRoot.quality, 'low')

// 怀孕概率（设计 §5.5 的 UI 示例值，逐行）
check('怀孕率 萧金桂 P4/好感85 = 18.5%', pregnancyChanceOf({ affinity: 85, rank: 4 }), 0.185)
check('怀孕率 丁赛喜 P4/好感72 = 17.2%', pregnancyChanceOf({ affinity: 72, rank: 4 }), 0.172)
check('怀孕率 叶梨儿 P3/好感68 = 16.8%', pregnancyChanceOf({ affinity: 68, rank: 3 }), 0.168)
check('怀孕率 林多儿 P4/好感60 = 16.0%', pregnancyChanceOf({ affinity: 60, rank: 4 }), 0.16)
check('怀孕率 丁金宝 P4/好感55 = 15.5%', pregnancyChanceOf({ affinity: 55, rank: 4 }), 0.155)
check('怀孕率 黄娇 P3/好感50 = 15.0%', pregnancyChanceOf({ affinity: 50, rank: 3 }), 0.15)
check('★好感加成封顶：好感 500 仍是 20%', pregnancyChanceOf({ affinity: 500, rank: 4 }), 0.2)
check('★疲劳惩罚：精力不足时 -10%', pregnancyChanceOf({ affinity: 85, rank: 4, fatigued: true }), 0.085)
check('★怀孕保底：连续 10 次未孕 → 第 11 次必中', rollPregnancy({ chance: 0, pity: 10, rng: () => 0.999 }), true)
check('  连续 9 次未孕仍看运气', rollPregnancy({ chance: 0, pity: 9, rng: () => 0.999 }), false)

// ---------- 7. 模块二：子嗣修炼加成（《模块二》§9.1）----------

const BONUS = COURT.bonus
check('灵根系数 五灵根 = 0.02', BONUS.rootCountCoef[5], 0.02)
check('灵根系数 四灵根 = 0.05', BONUS.rootCountCoef[4], 0.05)
check('灵根系数 三灵根 = 0.10', BONUS.rootCountCoef[3], 0.1)
check('灵根系数 双灵根 = 0.20', BONUS.rootCountCoef[2], 0.2)
check('灵根系数 单灵根 = 0.40', BONUS.rootCountCoef[1], 0.4)
check('本命契合 完全相同 = 1.5', BONUS.fateFitCoef.exact, 1.5)
check('本命契合 同类型 = 1.2', BONUS.fateFitCoef.sameKind, 1.2)
check('本命契合 无关 = 0.5', BONUS.fateFitCoef.none, 0.5)
check('★「同五行」档已删除', 'sameElements' in BONUS.fateFitCoef, false)
check('词条系数 普通 = 0.05', BONUS.traitCoef.normal, 0.05)
check('词条系数 稀有 = 0.10', BONUS.traitCoef.rare, 0.1)
check('词条系数 传说 = 0.20', BONUS.traitCoef.legend, 0.2)
check('★子嗣加成上限 = +200%', BONUS.cap, 2.0)

const PROFILE = playerFateProfile(base)
check('玩家本命画像·ids', JSON.stringify(PROFILE.playerFateIds), JSON.stringify(['dao_back_boar', 'taotie_jade']))
check('玩家本命画像·kinds', JSON.stringify(PROFILE.playerKinds), JSON.stringify(['灵兽', '器物']))

const mkFate = (id, kind) => ({ id, name: id, element: 'beast', kind })
const mkChild = over => ({
  id: 'c',
  hasRoot: true,
  quality: 'low',
  rootCount: 1,
  roots: ['fire'],
  fate: mkFate('wild_boar', '草木'),
  traits: [],
  ...over
})
const mkTraits = (...grades) => grades.map((grade, i) => ({ id: `t${i}`, name: `词条${i}`, grade }))
const bonusOf = child => offspringBonusOf({ child, ...PROFILE })

// 设计 §9.2 的示例逐行。⚠ 桂二那行原本吃的是「同五行 1.0」，该档已删，
// 改判「同类型 1.2」后由 0.220 变为 0.264 —— 这是口径变更的必然结果。
check('§9.2 单火+同类型+1稀有 = 0.528', bonusOf(mkChild({ rootCount: 1, fate: mkFate('spirit_fox', '灵兽'), traits: mkTraits('rare') })), 0.528)
check('§9.2 双灵根+同类型+1稀有 = 0.264（原表 0.220 用的是已删的「同五行」）', bonusOf(mkChild({ rootCount: 2, fate: mkFate('black_water_turtle', '灵兽'), traits: mkTraits('rare') })), 0.264)
check('§9.2 三灵根+同类型+1稀有 = 0.132', bonusOf(mkChild({ rootCount: 3, fate: mkFate('red_flame_marten', '灵兽'), traits: mkTraits('rare') })), 0.132)
check('§9.2 四灵根+无关+无词条 = 0.025', bonusOf(mkChild({ rootCount: 4, traits: [] })), 0.025)
check(
  '满配 单灵根+完全相同+3稀有1传说 = 0.90',
  bonusOf(mkChild({ rootCount: 1, fate: mkFate('dao_back_boar', '灵兽'), traits: mkTraits('rare', 'rare', 'rare', 'legend') })),
  0.9
)

// 反向断言
check('★无灵根子嗣加成为 0（词条与本命都不作数）', bonusOf(mkChild({ hasRoot: false, traits: mkTraits('legend') })), 0)
check('★加成封顶：20 个满配子嗣求和被钳到 +200%', sumChildrenBonus(Array(20).fill(mkChild({ rootCount: 1, fate: mkFate('dao_back_boar', '灵兽'), traits: mkTraits('rare', 'rare', 'rare', 'legend') })), PROFILE), 2.0)
check('★低品质子嗣不是白送：10 个「五灵根+无关+无词条」只有 +10%', sumChildrenBonus(Array(10).fill(mkChild({ rootCount: 5, traits: [] })), PROFILE), 0.1)
check('一个子嗣都没有 → 加成为 0', sumChildrenBonus([], PROFILE), 0)

// 加成接进速度公式：+150% 就是 ×2.5（回归 spiritPerSecondOf 的 (1 + childrenBonus) 因子）
const spsNoChild = spiritPerSecondOf({ landOutput: 1.5, fitFactor: 1.0, spiritRate: 1, fateCoef: 1, bandwidth: 1 })
const spsWithChild = spiritPerSecondOf({ landOutput: 1.5, fitFactor: 1.0, spiritRate: 1, fateCoef: 1, bandwidth: 1, childrenBonus: 1.5 })
check('★子嗣 +150% → 灵力/秒 ×2.5', spsWithChild / spsNoChild, 2.5)

// ---------- 8. 模块二：内宅杂项（精力 / 位阶 / 开局预置 / 池完整性）----------

check('精力上限 基础 = 100', energyMaxOf(0), 100)
check('精力上限 炼体 1 级 = 105', energyMaxOf(1), 105)
check('精力上限 炼体 18 级 = 190', energyMaxOf(18), 190)
check('★脏数据不降上限：bodyLevel 负数', energyMaxOf(-5), 100)
check('★脏数据不降上限：bodyLevel 非数', energyMaxOf(undefined), 100)
check('互动消耗 15/人', COURT.energy.perInteraction, 15)
check('孕育 270 游戏天', COURT.pregnancy.days, 270)
check('产后恢复 30 游戏天', COURT.pregnancy.recoveryDays, 30)

check('位阶名 P1 = 通房丫鬟', rankName(1), '通房丫鬟')
check('位阶名 P6 = 六等正妻', rankName(6), '六等正妻')
check('★位阶名越界回落「凡女」，不崩', rankName(99), '凡女')
check('★凡女段 P1-P6 的怀孕系数全是 1.0', [1, 2, 3, 4, 5, 6].every(r => COURT.ranks[r].pregCoef === 1.0), true)
check(
  '★灵根系数随位阶单调不减（P1→P13）',
  Array.from({ length: 12 }, (_, i) => i + 1).every(r => COURT.ranks[r].rootCoef <= COURT.ranks[r + 1].rootCoef),
  true
)

// 位阶晋升：严格逐级
check('P1 互动 9 次不升阶', promotedRankOf({ rank: 1, interactionCount: 9 }), null)
check('P1 互动 10 次 → P2', promotedRankOf({ rank: 1, interactionCount: 10 }), 2)
check('P2 互动过就「入房」 → P3', promotedRankOf({ rank: 2, interactionCount: 1 }), 3)
check('P3 有喜 → P4', promotedRankOf({ rank: 3, pregnancyCount: 1 }), 4)
check('P4 诞下有灵根子嗣 → P5', promotedRankOf({ rank: 4, rootChildrenCount: 1 }), 5)
check('P5 诞下极品 → P6', promotedRankOf({ rank: 5, topChildrenCount: 1 }), 6)
check('★P6 是凡女天花板，不升阶', promotedRankOf({ rank: 6, topChildrenCount: 99 }), null)

// ---------- 8b. 自动模式与晚间判定（内宅不暂停时间的配套）----------
//
// 内宅**不在 PAUSE_ROUTES 里** —— 时间照走，晚间到点自动留宿。
// 这里的断言保证「自动模式」的三个数值约定不会被后续改动悄悄带偏。

check('晚间 = 游戏时间第 20 小时', COURT.night.eveningHour, 20)
check('自动模式怀孕率惩罚 = -5%', COURT.pregnancy.autoPenalty, 0.05)

check('时刻换算 0 秒 = 第 0 时', hourOfDay(0), 0)
check('时刻换算 20 时', hourOfDay(20 * 3600), 20)
check('时刻换算 23 时', hourOfDay(23 * 3600), 23)
check('★时刻换算跨天归零：第 24 小时 = 第 0 时', hourOfDay(24 * 3600), 0)
check('★次日 20 时仍是 20（不是 44）', hourOfDay(44 * 3600), 20)

check('自动模式叠 5%：萧金桂 18.5% → 13.5%', pregnancyChanceOf({ affinity: 85, rank: 4, auto: true }), 0.135)
check(
  '自动 + 疲劳叠满 15%：18.5% → 3.5%',
  pregnancyChanceOf({ affinity: 85, rank: 4, fatigued: true, auto: true }),
  0.035
)
check('★auto 默认关闭，不影响既有口径', pregnancyChanceOf({ affinity: 85, rank: 4 }), 0.185)

// 挑人规则
const mkWife = (id, affinity, rank, last = null, status = 'idle') => ({
  id,
  name: id,
  affinity,
  rank,
  status,
  lastInteractionTime: last
})
const POOL = [
  mkWife('a', 90, 3, 500),
  mkWife('b', 80, 4, 100),
  mkWife('c', 70, 4, null),
  mkWife('d', 60, 3, 300),
  mkWife('e', 50, 4, null),
  mkWife('f', 40, 3, 900),
  mkWife('g', 30, 3, 800),
  mkWife('h', 20, 3, 700)
]
const idsOf = list => list.map(w => w.id)

check('自动规则只有三种（自定义顺序留后）', JSON.stringify(AUTO_RULES), JSON.stringify(['relation', 'rank', 'robin']))
check('规则·优先高好感', idsOf(sortWivesByRule(POOL, 'relation')).slice(0, 4).join(''), 'abcd')
check('规则·优先高位阶（同位阶比好感）', idsOf(sortWivesByRule(POOL, 'rank')).slice(0, 5).join(''), 'bcead')
check('规则·平均分配（最久没轮到的优先，没互动过的最先）', idsOf(sortWivesByRule(POOL, 'robin')).slice(0, 4).join(''), 'cebd')

// ⚠ 关键约定：自动模式留 fatigueThreshold 点精力不用
check('★自动挑人留 30 点精力保底：105 精力只挑 5 人', pickAutoWives({ wives: POOL, rule: 'relation', energy: 105 }).length, 5)
check(
  '★保底真的留住了（结束时精力 ≥ 疲劳线，自动夜永不触发疲劳）',
  105 - pickAutoWives({ wives: POOL, rule: 'relation', energy: 105 }).length * COURT.energy.perInteraction >=
    COURT.pregnancy.fatigueThreshold,
  true
)
check('精力 45 → 只够 1 人', pickAutoWives({ wives: POOL, rule: 'relation', energy: 45 }).length, 1)
check('★精力只剩 30（正好等于保底线）→ 一个都不挑', pickAutoWives({ wives: POOL, rule: 'relation', energy: 30 }).length, 0)
check('精力 0 → 不挑', pickAutoWives({ wives: POOL, rule: 'relation', energy: 0 }).length, 0)
check(
  '★候选人不够时按实际人数封顶',
  pickAutoWives({ wives: POOL.slice(0, 3), rule: 'relation', energy: 105 }).length,
  3
)
check(
  '★已孕 / 产后恢复的不参与自动挑人',
  pickAutoWives({
    wives: [...POOL, mkWife('x', 99, 4, null, 'pregnant'), mkWife('y', 99, 4, null, 'recovering')],
    rule: 'relation',
    energy: 105
  }).includes('x'),
  false
)
check(
  '挑人是按规则取前 N 个（不是随机）',
  pickAutoWives({ wives: POOL, rule: 'relation', energy: 105 }).join(''),
  'abcde'
)

const court0 = buildInitialInnerCourt()
check('开局预置 侍妾 8 位', court0.wives.length, 8)
check(
  '★开局 8 位姓名与设计 §13.2 逐字一致',
  court0.wives.map(w => w.name).join(','),
  '萧金桂,丁赛喜,冯珠儿,叶梨儿,丁金宝,林多儿,黄娇,冯大妮'
)
check('★开局全部「待孕」（冯珠儿的例假 / 冯大妮的已孕本批不做）', court0.wives.every(w => w.status === 'idle' && w.statusEndTime === null), true)
check('开局位阶落在 P3/P4', court0.wives.every(w => w.rank === 3 || w.rank === 4), true)
check('开局好感都在 0-100', court0.wives.every(w => w.affinity >= 0 && w.affinity <= 100), true)
check('★开局精力是满的（spentToday 0 ⇒ 上限即当前值）', court0.energy.spentToday, 0)
check('★开局默认自动模式（内宅不暂停时间，主要体验是看它自己跑）', court0.nightMode, 'auto')
check('开局自动规则 = 优先高好感', court0.autoRule, 'relation')
check('开局流水账为空', court0.interactionLog.length, 0)
const off0 = buildInitialOffspring()
check('开局无子嗣', off0.list.length, 0)
check('开局抽卡计数归零', off0.gacha.totalDraws === 0 && off0.gacha.pityNoRoot === 0, true)
check('开局无待确认诞生', off0.pendingBirthIds.length, 0)

// 池完整性 —— 防死代码
check('本命池 四档都非空', ['low', 'mid', 'high', 'top'].every(q => FATE_POOL[q]?.length > 0), true)
const ALL_FATES = Object.values(FATE_POOL).flat()
check('★本命池元素全在 ELEMENTS 里', ALL_FATES.every(f => f.element in ELEMENTS), true)
const KIND_WHITELIST = ['灵兽', '器物', '草木', '杂物']
check('★本命池 kind 词汇统一', ALL_FATES.every(f => KIND_WHITELIST.includes(f.kind)), true)
check('★本命池里存在「灵兽」档（否则同类型是死代码）', ALL_FATES.some(f => f.kind === '灵兽'), true)
check('★本命池里存在「器物」档（否则同类型是死代码）', ALL_FATES.some(f => f.kind === '器物'), true)
check(
  '★玩家两个本命 id 都在池子里（否则「完全相同 1.5」是死代码）',
  PROFILE.playerFateIds.every(id => ALL_FATES.some(f => f.id === id)),
  true
)
check('词条池 三档都非空', ['normal', 'rare', 'legend'].every(g => TRAIT_POOL[g]?.length > 0), true)
check('抽奖位阶权重合计 = 1', Object.values(COURT.gacha.rankWeights).reduce((a, b) => a + b, 0), 1)
check('抽奖位阶只出 P1-P3（本批可达段）', Object.keys(COURT.gacha.rankWeights).every(k => Number(k) <= COURT.rankReachableMax), true)
check('内宅上限 ≥ 开局人数', COURT.gacha.householdCap >= PRESET_WIVES.length, true)

check('中文数字 1 = 一', cnNumeral(1), '一')
check('中文数字 10 = 十', cnNumeral(10), '十')
check('中文数字 11 = 十一', cnNumeral(11), '十一')
check('中文数字 20 = 二十', cnNumeral(20), '二十')
check('中文数字 21 = 二十一', cnNumeral(21), '二十一')

check('游戏天：0 秒 = 第 0 天', gameDayOf(0), 0)
check('游戏天：86400 秒 = 第 1 天', gameDayOf(86400), 1)
check('剩余天数：270 天后向上取整为 270', remainingDays(270 * 86400, 0), 270)
check('★剩余天数已过期归 0（不出现负数）', remainingDays(0, 270 * 86400), 0)

// ---------- 输出 ----------

const pad = (s, n) => String(s).padEnd(n, ' ')
const width = Math.max(...results.map(r => [...r.label].length)) + 2

console.log('\n纯函数断言（契合度《灵气系统》§7.2/§4.3 三维加权版 · 模块二《多子多福》）\n')
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
