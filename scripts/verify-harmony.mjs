// 契合度数值断言 —— 直接跑纯函数，不用起游戏
//
//   npm run verify
//
// 断言表就是《同参系统》§3.1/§3.4 与「连乘契合度」的机器可读版。改 harmony.js /
// tiers.js / cultivationData.js / realm.js 的数值后跑一遍，能挡住「改了数值但没意识到门槛被改坏」。
//
// 三条**反向断言**证明门槛不是装饰：
//   · 开局 0.08 < 练气三层 0.15 —— 第一道门槛必须拦人（连乘化的核心意图）
//   · 吕氏破境 0.152 刚好过 0.15，但过不了六层 0.25 —— 一次门槛只对应一次「换」
//   · 木属性灵地对桂冈匹配 0% → 保底 0.2 → 结丹 0.16 < 0.80

import {
  TUNING,
  calcHarmony,
  calcQiArtHarmony,
  calcSpiritLandHarmony,
  fateItemHarmonyOf,
  qiArtHarmonyOf,
  affinityTierOf,
  affinityCoeffOf,
  landFit,
  playerFates,
  playerElements,
  fateSpeedCoef,
  fitFactorOf,
  spiritPerSecondOf,
  qiArtProficiency,
  qiArtLevelOf
} from '../src/plugins/harmony.js'
import { TUNING as SHOP_TUNING } from '../src/plugins/shop.js'
import {
  buildInitialPractice,
  SPIRIT_LAND_MAP,
  FATE_ITEM_MAP,
  QI_ART_MAP,
  landOutput
} from '../src/plugins/cultivationData.js'
import { isTierAtLeast, LAND_OUTPUT } from '../src/plugins/tiers.js'
import {
  BREAKTHROUGH_THRESHOLDS,
  getBreakthroughRequirement,
  getRealmName
} from '../src/plugins/realm.js'
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
  qualityOfRootCount,
  rootCountName,
  rollRootCount,
  rollRootElements,
  rollRootProfile,
  purifiedRootCount,
  rollOffspring,
  offspringBonusOf,
  sumChildrenBonus,
  rawChildrenBonus,
  applyBonusSoftCap,
  playerFateProfile,
  cnNumeral,
  gameDayOf,
  hourOfDay,
  remainingDays,
  offspringAgeOf,
  formatOffspringAge,
  normalizePregnancy,
  GAME_SECONDS_PER_DAY,
  // ---------- P14 成长 / 繁育 ----------
  offspringGrowthOf,
  formatOffspringGrowth,
  canWorkOf,
  canFightOf,
  canMarryOf,
  generateSpouse,
  legacySpouseRootCount,
  spouseChanceOf,
  rollSpousePregnancy,
  coupleHasRoomOf,
  populationCapReached,
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
/** 连乘综合契合度 */
const mul = (a, f, l) => a * f * l

// ---------- 素材 ----------

const base = buildInitialPractice()
const HOURS_MAX = 2000 * 3600 // 熟练度顶满所需的游戏秒（2000 游戏小时 = 20%）
const MAX_ENTRY = { practiceSeconds: HOURS_MAX }

/** 切换主修功法（熟练度不动 —— 开局那几本的熟练度都是 0） */
const activeArt = (practice, id) => ({ ...practice, qiArts: { ...practice.qiArts, active: id } })

/** 直接算某本功法的契合（不要求它已解锁 —— 用来跑设计路径里的未来功法） */
const artFit = (id, hours = 0) =>
  qiArtHarmonyOf(QI_ART_MAP[id], { practiceSeconds: hours * 3600 }, base)

/** 金丹级完全匹配直接用真数据：兽器同源经（兽+器，覆盖率 2/2） */
const coreArtHarmony = () => artFit('beast_vessel_core')

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

// ---------- 0b. 六档亲和度与灵地保底（表本身）----------

const AFF = TUNING.fateItem.affinity
check('六档·正主 = 1.0', AFF.owner, 1.0)
check('六档·准正主 = 0.8', AFF.quasiOwner, 0.8)
check('六档·同系列 = 0.6', AFF.series, 0.6)
check('六档·近类型 = 0.4', AFF.nearType, 0.4)
check('六档·同类型 = 0.25', AFF.type, 0.25)
check('六档·无关 = 0.1', AFF.none, 0.1)
check('灵地保底 = 0.2', TUNING.spiritLand.minFit, 0.2)

// ---------- 1. 开局（全链路，真实初始存档）----------

const open = calcHarmony(base)
check('开局·功法契合（桂氏练气篇，0 熟练度）', open.qiArt, 0.2)
check('开局·同参契合（五件全部硬编近类型 0.4）', open.fateItem, 0.4)
check('开局·灵地契合（快子峰完美匹配）', open.spiritLand, 1.0)
check('开局·综合契合度 = 0.20 × 0.40 × 1.00', open.total, 0.08)
check('开局·综合 = 连乘重算', open.total, mul(open.qiArt, open.fateItem, open.spiritLand))
check('★旧权重表已随连乘重构删除', 'weights' in open, false)
check('开局·本命已不是契合度维度', 'destiny' in open, false)
check(
  '★开局五件同参按亲疏硬编：猪妖 0.6 > 盾 0.4 > 其余 0.25',
  fateItemHarmonyOf(FATE_ITEM_MAP.wu_li_zhu_yao, base) === 0.6 &&
    fateItemHarmonyOf(FATE_ITEM_MAP.taotie_shield, base) === 0.4 &&
    ['qingyu_sword', 'jinggang_ci', 'lingteng_shield'].every(
      id => fateItemHarmonyOf(FATE_ITEM_MAP[id], base) === 0.25
    ),
  true
)
check('  开局默认主同参仍是盾（0.4）', base.fateItems.active, 'taotie_shield')
check('  换猪妖 → 0.20 × 0.60 = 0.12，仍过不了三层', mul(0.2, 0.6, 1.0) < getBreakthroughRequirement(3), true)
check('  换青玉剑 → 0.20 × 0.25 = 0.05', mul(0.2, 0.25, 1.0), 0.05)

const fit0 = fitFactorOf(open.total)
check('开局·契合度项 (0.98 + 0.08×0.32)', fit0, 0.98 + 0.08 * 0.32)
// 开局无子嗣 —— childrenBonus 不传，走 spiritPerSecondOf 的默认 0。
const sps0 = spiritPerSecondOf({
  landOutput: landOutput(SPIRIT_LAND_MAP.kuaizi_hut),
  fitFactor: fit0,
  spiritRate: 1,
  fateCoef: fateSpeedCoef(base),
  bandwidth: TUNING.bandwidth
})
// ⚠ 单位是**灵力/游戏小时**，末尾乘门控补偿。速度项重标定后开局回到旧曲线：
//   1.5（快子峰产出）× 1.0056（契合度项）× 0.8（双本命系数）≈ 1.20672，
//   与连乘化之前的 1.2018 只差 +0.4%。
check(
  '开局·灵力/游戏小时',
  sps0,
  1.20672 * TUNING.practiceGateCompensation,
  `${sps0.toFixed(4)}（1.5 × 1.0056 × 0.8 × ${TUNING.practiceGateCompensation} 补偿）`
)
check('★补偿系数 = 门控 2.4 × 时钟 4', TUNING.practiceGateCompensation, 2.4 * 4)

// 速度项重标定：与旧加权制在各阶段的因子对齐（偏差 ≤3%）
const SPEED_CURVE = [
  [0.08, 1.0015], // 开局（旧综合 0.5025）
  [0.24, 1.0855], // 同系列同参（旧综合 0.6425）
  [0.56, 1.1305], // 筑基配置（旧综合 0.7175）
  [0.8, 1.21], // 结丹配置（旧综合 0.85）
  [1.0, 1.3] // 满配
]
check(
  '★速度项按旧曲线重标定（各阶段偏差 ≤3%）',
  SPEED_CURVE.every(([fit, oldFactor]) => Math.abs(fitFactorOf(fit) / oldFactor - 1) <= 0.03),
  true,
  SPEED_CURVE.map(([fit, oldFactor]) => `${fit}:${fitFactorOf(fit).toFixed(4)}/${oldFactor}`).join(' ')
)

// ---------- 2. 连乘门槛表 + 吕氏破境（原著路线）----------

check('★门槛·练气三层 = 0.15', BREAKTHROUGH_THRESHOLDS[3], 0.15)
check('★门槛·练气六层 = 0.25', BREAKTHROUGH_THRESHOLDS[6], 0.25)
check('★门槛·练气九层 = 0.40', BREAKTHROUGH_THRESHOLDS[9], 0.4)
check('★门槛·筑基初期 = 0.55', BREAKTHROUGH_THRESHOLDS[11], 0.55)
check('★门槛·结丹初期 = 0.80', BREAKTHROUGH_THRESHOLDS[15], 0.8)
check('★门槛表已废弃旧加权值（三层仍是 0.15，不是 0.55）', getBreakthroughRequirement(3), 0.15)

// 开局：桂氏气血经 0.20 × 盾 0.40 × 快子峰 1.00 = 0.08，被三层死死拦住
check('★开局 0.08 < 练气三层 0.15 —— 必须换功法', open.total < getBreakthroughRequirement(3), true,
  `${pct(open.total)} vs ${pct(getBreakthroughRequirement(3))}`)

// 吕氏破境：练气篇品阶分只有 0.20，靠 baseFit 0.38 这条原著路线直接过第一门槛
const lv = activeArt(base, 'lv_sequential')
check('★吕氏练气次第论·功法基础契合 = 38%', calcQiArtHarmony(lv), 0.38)
check('★换吕氏 → 0.38 × 0.40 × 1.00 = 0.152', calcHarmony(lv).total, 0.152)
check('★吕氏破境过练气三层 0.15（只高出 0.002）', calcHarmony(lv).total >= getBreakthroughRequirement(3), true,
  `${pct(calcHarmony(lv).total)} vs ${pct(getBreakthroughRequirement(3))}`)
check('  但过不了练气六层 0.25 —— 一次门槛只对应一次「换」', calcHarmony(lv).total < getBreakthroughRequirement(6), true)
check('★开局不发放《兽器双修经》', base.qiArts.known.beast_vessel_dual, undefined)
check('  吕氏与桂氏不再等价（旧版「换了等于没换」已不成立）', calcHarmony(lv).total !== open.total, true)

// 元氏修命经（金丹级，开局即送）是第二条过三层的路：0.40 × 0.40 × 1.00 = 0.16
const yuan = activeArt(base, 'yuan_ming')
check('元氏修命经（金丹级）→ 功法 40%', calcQiArtHarmony(yuan), 0.4)
check('  换元氏 0.16 也过三层', calcHarmony(yuan).total, 0.16)
check('  元氏同样过不了六层', calcHarmony(yuan).total < getBreakthroughRequirement(6), true)
check(
  '开局三本都已在手（桂氏 / 吕氏 / 元氏）',
  ['gui_blood', 'lv_sequential', 'yuan_ming'].every(id => base.qiArts.known[id]),
  true
)
check(
  '兽/器五本仍未解锁（没有获取途径，别偷偷发）',
  ['beast_roar', 'vessel_jue', 'beast_vessel_dual', 'beast_vessel_found', 'beast_vessel_core'].every(
    id => !base.qiArts.known[id]
  ),
  true
)

// ---------- 3. 成长路径（《同参系统》§六，逐行）----------

const rows = [
  { stage: '开局', qiArt: open.qiArt, fateItem: open.fateItem, spiritLand: 1.0, level: 3, total: 0.08, pass: false },
  {
    stage: '吕氏破境',
    qiArt: calcQiArtHarmony(lv),
    fateItem: affinityCoeffOf('nearType'),
    spiritLand: 1.0,
    level: 3,
    total: 0.152,
    pass: true
  },
  {
    stage: '换同系列同参',
    qiArt: 0.4,
    fateItem: affinityCoeffOf('series'),
    spiritLand: 1.0,
    level: 6,
    total: 0.24,
    pass: false
  },
  {
    stage: '熟练度 +5%',
    qiArt: artFit('yuan_ming', 500),
    fateItem: affinityCoeffOf('series'),
    spiritLand: 1.0,
    level: 6,
    total: 0.27,
    pass: true
  },
  {
    stage: '换兽器双修经',
    qiArt: artFit('beast_vessel_dual'),
    fateItem: affinityCoeffOf('series'),
    spiritLand: 1.0,
    level: 9,
    total: 0.36,
    pass: false
  },
  {
    stage: '换准正主同参',
    qiArt: artFit('beast_vessel_dual'),
    fateItem: affinityCoeffOf('quasiOwner'),
    spiritLand: 1.0,
    level: 9,
    total: 0.48,
    pass: true
  },
  {
    stage: '换万兽御器经',
    qiArt: artFit('beast_vessel_found'),
    fateItem: affinityCoeffOf('quasiOwner'),
    spiritLand: 1.0,
    level: 11,
    total: 0.56,
    pass: true
  },
  {
    stage: '换正主同参',
    qiArt: artFit('beast_vessel_found'),
    fateItem: affinityCoeffOf('owner'),
    spiritLand: 1.0,
    level: 0, // 设计表里这一行没有门槛（—），只用于展示 0.70
    total: 0.7,
    pass: true
  },
  {
    stage: '换金丹级功法',
    qiArt: artFit('beast_vessel_core'),
    fateItem: affinityCoeffOf('owner'),
    spiritLand: 1.0,
    level: 15,
    total: 0.8,
    pass: true
  }
]

for (const row of rows) {
  const total = mul(row.qiArt, row.fateItem, row.spiritLand)
  const gate = getBreakthroughRequirement(row.level)
  check(`${row.stage}·综合`, total, row.total)
  check(
    `${row.stage}·综合 ${row.pass ? '≥' : '<'} 门槛 ${pct(gate)}`,
    total >= gate,
    row.pass,
    `${pct(total)} vs ${pct(gate)}`
  )
}

// ---------- 4. 反向断言：灵地保底与连乘惩罚 ----------

const zhengjia = calcSpiritLandHarmony({ ...base, spiritLand: { ...base.spiritLand, current: 'zhengjia_core' } })
check('郑家核心（木）对桂冈原始匹配 = 0%', landFit(SPIRIT_LAND_MAP.zhengjia_core, playerElements(base)), 0)
check('★灵地保底：木属性灵地也按 20% 算', zhengjia, 0.2)
const atCore = mul(coreArtHarmony(), affinityCoeffOf('owner'), zhengjia)
check('★带木属性三阶灵地·结丹综合 0.16 < 0.80', atCore < getBreakthroughRequirement(15), true,
  `${pct(atCore)} vs ${pct(getBreakthroughRequirement(15))}`)

const wanshou = calcSpiritLandHarmony({ ...base, spiritLand: { ...base.spiritLand, current: 'wanshou_valley' } })
check('万兽谷兽栏（兽70%+器30%）对桂冈匹配 100%', wanshou, 1.0)
const atValley = mul(coreArtHarmony(), affinityCoeffOf('owner'), wanshou)
check('带万兽谷·结丹综合 0.80 ≥ 门槛 0.80', atValley >= getBreakthroughRequirement(15), true,
  `${pct(atValley)} vs ${pct(getBreakthroughRequirement(15))}`)

check('★无关同参仍有 0.1 底分（不是 0）', affinityCoeffOf('none'), 0.1)

// ---------- 5. 同参六档判定与品阶表自洽 ----------

const FATE_T4 = { id: 'f', kind: '器物', series: 's' }
const ITEM_OWNER = { bondFateId: 'f', kind: '器物', series: 'x' }
const ITEM_SERIES = { bondFateId: null, kind: '器物', series: 's' }
const ITEM_NEAR = { bondFateId: null, kind: '器物', series: 'x' }
const ITEM_NONE = { bondFateId: null, kind: '灵兽', series: 'x' }
check('判定·正主（bondFateId 命中）', affinityTierOf(ITEM_OWNER, FATE_T4), 'owner')
check('判定·同系列（series 命中）', affinityTierOf(ITEM_SERIES, FATE_T4), 'series')
check('判定·近类型（同 kind 兜底）', affinityTierOf(ITEM_NEAR, FATE_T4), 'nearType')
check('判定·无关', affinityTierOf(ITEM_NONE, FATE_T4), 'none')
check('判定·准正主只能显式标注', affinityTierOf({ ...ITEM_SERIES, affinity: 'quasiOwner' }, FATE_T4), 'quasiOwner')
check('判定·同类型只能显式标注', affinityTierOf({ ...ITEM_NEAR, affinity: 'type' }, FATE_T4), 'type')
check(
  '★硬编字段优先于回落链（盾同系列、写死近类型）',
  affinityTierOf(FATE_ITEM_MAP.taotie_shield, { id: 'x', kind: '器物', series: 'taotie' }),
  'nearType'
)
check('★FATE_ITEM_TIER_COEFF 已整表删除', 'FATE_ITEM_TIER_COEFF' in (await import('../src/plugins/tiers.js')), false)

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

// 灵根数量分布（第二步，已确定有灵根前提下的条件概率）
// ⚠ P15.5(c)：品质不再是独立随机量，只是「几灵根」的派生叫法。
const RCD = COURT.draw.rootCountDist
check('灵根数量分布合计 = 1', Object.values(RCD).reduce((a, b) => a + b, 0), 1)
check('灵根数量·rng 0.00 → 五灵根', rollRootCount(() => 0.0), 5)
check('灵根数量·rng 0.5999 → 五灵根（右边界外）', rollRootCount(() => 0.5999), 5)
check('灵根数量·rng 0.61 → 四灵根', rollRootCount(() => 0.61), 4)
check('灵根数量·rng 0.74 → 四灵根（边界 0.75）', rollRootCount(() => 0.74), 4)
check('灵根数量·rng 0.76 → 三灵根', rollRootCount(() => 0.76), 3)
check('灵根数量·rng 0.86 → 双灵根', rollRootCount(() => 0.86), 2)
check('灵根数量·rng 0.98 → 单灵根', rollRootCount(() => 0.98), 1)
check('灵根数量分布键 = 1..5', Object.keys(RCD).map(Number).sort().join(','), '1,2,3,4,5')

// 品质只是内部派生档（P15.5(c)）；2026-10-18 起 UI 不再展示
check('派生档：5 → low（五灵根）', qualityOfRootCount(5), 'low')
check('派生档：4 → mid', qualityOfRootCount(4), 'mid')
check('派生档：3 → mid', qualityOfRootCount(3), 'mid')
check('派生档：2 → high', qualityOfRootCount(2), 'high')
check('派生档：1 → top', qualityOfRootCount(1), 'top')
check('派生档：0 → null（无灵根）', qualityOfRootCount(0), null)
check(
  '灵根叫法：1/2/3/4/5',
  [1, 2, 3, 4, 5].map(rootCountName).join('/'),
  '单灵根/双灵根/三灵根/四灵根/五灵根'
)
check('灵根叫法：0 = 无灵根', rootCountName(0), '无灵根')

const roots2 = rollRootElements({ count: 2, rng: () => 0 })
check('★灵气不重复：抽 2 个得到 2 个互不相同的灵气', roots2.length === 2 && new Set(roots2).size === 2, true)

// 血脉提纯（P15.5(b)）：只有子嗣与母亲同档时才会 −1，最少保留 1
check('提纯·母亲五灵根 + 子五灵根：0.05 < 10% → 4', purifiedRootCount(5, 5, () => 0.05), 4)
check('提纯·母亲五灵根 + 子五灵根：0.15 ≥ 10% → 仍是 5', purifiedRootCount(5, 5, () => 0.15), 5)
check('提纯·母亲五灵根 + 子四灵根：不同档 → 不提纯', purifiedRootCount(4, 5, () => 0), 4)
check('提纯·母亲三灵根 + 子四灵根：15% → 3', purifiedRootCount(4, 3, () => 0.1), 3)
check('提纯·母亲四灵根 + 子三灵根：15% → 2', purifiedRootCount(3, 4, () => 0.1), 2)
check('提纯·母亲双灵根 + 子双灵根：20% → 1', purifiedRootCount(2, 2, () => 0.1), 1)
check('提纯·母亲单灵根 + 子单灵根：已到底 → 1', purifiedRootCount(1, 1, () => 0), 1)
check('提纯·没有母亲灵根信息（宿主侍妾）→ 原样返回', purifiedRootCount(3, 0, () => 0), 3)
check('★提纯最少保留 1 个灵根', purifiedRootCount(2, 2, () => 0) >= 1, true)
const puriRolls = []
purifiedRootCount(3, 3, () => {
  puriRolls.push(1)
  return 0.99
})
check('★母亲有灵根时总是消耗一次 rng（不短路）', puriRolls.length, 1)

// 提纯接进 rollOffspring：motherRootCount 只在子嗣繁育时传
const plainChild = rollOffspring({ rank: 4, fatherTier: 'qi', totalDraws: 5, pityNoRoot: 0, rng: () => 0.05 })
const pureChild = rollOffspring({
  rank: 4,
  fatherTier: 'qi',
  totalDraws: 5,
  pityNoRoot: 0,
  motherRootCount: 5,
  rng: () => 0.05
})
check('宿主侍妾不传 motherRootCount → 五灵根', plainChild.rootCount, 5)
check('母亲五灵根 + 提纯命中 → 子四灵根', pureChild.rootCount, 4)
check('提纯后品质跟着数量派生（四灵根 = 中品）', pureChild.quality, 'mid')

// 洗命重抽（P15.5(a)）：数量 + 属性 + 品质一起重抽，不改 hasRoot
const rerollProfile = rollRootProfile(() => 0.05)
check('洗命重抽·0.05 → 五灵根 + 下品', `${rerollProfile.rootCount}/${rerollProfile.quality}`, '5/low')
check('洗命重抽·灵根属性数量与数量一致', rerollProfile.roots.length, 5)
const rerollProfile2 = rollRootProfile(() => 0.98)
check('洗命重抽·0.98 → 单灵根 + 极品', `${rerollProfile2.rootCount}/${rerollProfile2.quality}`, '1/top')

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

// 怀孕概率（设计 §5.5 的 UI 示例值，逐行；2026-10-18 正向部分 ×0.6）
check('怀孕率 萧金桂 P4/好感85 = 11.1%', pregnancyChanceOf({ affinity: 85, rank: 4 }), 0.111)
check('怀孕率 丁赛喜 P4/好感72 = 10.32%', pregnancyChanceOf({ affinity: 72, rank: 4 }), 0.1032)
check('怀孕率 叶梨儿 P3/好感68 = 10.08%', pregnancyChanceOf({ affinity: 68, rank: 3 }), 0.1008)
check('怀孕率 林多儿 P4/好感60 = 9.6%', pregnancyChanceOf({ affinity: 60, rank: 4 }), 0.096)
check('怀孕率 丁金宝 P4/好感55 = 9.3%', pregnancyChanceOf({ affinity: 55, rank: 4 }), 0.093)
check('怀孕率 黄娇 P3/好感50 = 9.0%', pregnancyChanceOf({ affinity: 50, rank: 3 }), 0.09)
check('★好感封顶后再 ×0.6：好感 500 = 12%', pregnancyChanceOf({ affinity: 500, rank: 4 }), 0.12)
check('★疲劳惩罚已废除：低体力仍是 11.1%', pregnancyChanceOf({ affinity: 85, rank: 4, fatigued: true }), 0.111)
check('★怀孕保底已废：chance 0 + 旧 pity 10 仍是 false', rollPregnancy({ chance: 0, pity: 10, rng: () => 0.999 }), false)
check('  无保底：chance 1 必中', rollPregnancy({ chance: 1, rng: () => 0.999 }), true)

// 结构性断言：防止以后把 baseChance 也改成 0.06 造成双重缩放
check('chanceScale = 0.6', COURT.pregnancy.chanceScale, 0.6)
check('baseChance 仍是 10%（0.6 只乘一次）', COURT.pregnancy.baseChance, 0.1)
check('疲劳惩罚字段已删除', 'fatiguePenalty' in COURT.pregnancy, false)
check('怀孕保底字段已删除', 'pityLimit' in COURT.pregnancy, false)
// P17（2026-10-19）：侍妾池改为 20 金页子/位，价格真源移到 plugins/shop.js
check('侍妾池单价 20 金页子', SHOP_TUNING.maiden.price, 20)
check('侍妾池币种 = 金页子', SHOP_TUNING.maiden.currency, 'jinYeZi')
check('旧 200 灵石单价已删除', 'maidenPrice' in COURT.gacha, false)
// 位阶系数只乘基础项：P7 的 pregCoef 0.9 必须生效
check('P7/好感0 = (10%×0.9)×0.6 = 5.4%', pregnancyChanceOf({ affinity: 0, rank: 7 }), 0.054)
check('P13/好感0/auto 被 clamp 到 0', pregnancyChanceOf({ affinity: 0, rank: 13, auto: true }), 0)
// rollPregnancy 是严格小于
check('rollPregnancy: 0.499 < 0.5 命中', rollPregnancy({ chance: 0.5, rng: () => 0.499 }), true)
check('rollPregnancy: 0.5 不命中（严格小于）', rollPregnancy({ chance: 0.5, rng: () => 0.5 }), false)

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
// P14：硬上限 +200% 已改为按大境界解锁的软上限（设计 §9.1）
check('★软上限·练气 = 2.0', BONUS.softCap.qi, 2.0)
check('★软上限·筑基 = 4.0（筑基是练气的 2 倍）', BONUS.softCap.foundation, 4.0)
check('★软上限·结丹 = 7.0', BONUS.softCap.core, 7.0)
check('★软上限·元婴 = 10.0', BONUS.softCap.nascent, 10.0)
check('★硬上限字段 bonus.cap 已删除', 'cap' in BONUS, false)
check('软上限 原始 = cap → 63.2%', applyBonusSoftCap(2.0, 2.0), 2.0 * (1 - Math.exp(-1)))
check('软上限 原始 = 2cap → 86.5%', applyBonusSoftCap(4.0, 2.0), 2.0 * (1 - Math.exp(-2)))
check('软上限 原始 = 0 → 0', applyBonusSoftCap(0, 2.0), 0)
// ⚠ 不要拿 1000 这种值断言 `< cap`：e^-143 在浮点里直接下溢成 0，结果恰好等于 cap。
//   用 100（约 14 个 cap）还能看见渐近线。
check('★软上限渐近但不突破 cap', applyBonusSoftCap(100, 7.0) < 7.0, true)
check('★软上限随境界放大：同一原始值结丹 > 练气', applyBonusSoftCap(4, 7) > applyBonusSoftCap(4, 2), true)
check('★软上限单调：原始加成越大，结果越大', applyBonusSoftCap(3, 2) > applyBonusSoftCap(2, 2), true)

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

const maxChild = mkChild({
  rootCount: 1,
  fate: mkFate('dao_back_boar', '灵兽'),
  traits: mkTraits('rare', 'rare', 'rare', 'legend')
})
check('★20 个满配子嗣：原始 +1800%（0.90 × 20）', rawChildrenBonus(Array(20).fill(maxChild), PROFILE), 18)
check(
  '★20 个满配子嗣：练气软上限后 ≈ +199.98%',
  sumChildrenBonus(Array(20).fill(maxChild), PROFILE, 2.0),
  2.0 * (1 - Math.exp(-9))
)
check(
  '★同一批子嗣到了结丹：软上限放大到 ≈ +646%',
  sumChildrenBonus(Array(20).fill(maxChild), PROFILE, 7.0),
  7.0 * (1 - Math.exp(-18 / 7))
)
check('★低品质子嗣不是白送：10 个「五灵根+无关+无词条」原始 +10%', rawChildrenBonus(Array(10).fill(mkChild({ rootCount: 5, traits: [] })), PROFILE), 0.1)
check(
  '  套软上限后 10 个五灵根 ≈ +9.75%（小加成几乎不衰减）',
  sumChildrenBonus(Array(10).fill(mkChild({ rootCount: 5, traits: [] })), PROFILE, 2.0),
  2.0 * (1 - Math.exp(-0.05))
)
check('一个子嗣都没有 → 加成为 0', sumChildrenBonus([], PROFILE), 0)
check('★陨落子嗣不计入原始加成', rawChildrenBonus([{ ...maxChild, status: 'fallen' }], PROFILE), 0)

// 加成接进速度公式：+150% 就是 ×2.5（回归 spiritPerSecondOf 的 (1 + childrenBonus) 因子）
const spsNoChild = spiritPerSecondOf({ landOutput: 1.5, fitFactor: 1.0, spiritRate: 1, fateCoef: 1, bandwidth: 1 })
const spsWithChild = spiritPerSecondOf({ landOutput: 1.5, fitFactor: 1.0, spiritRate: 1, fateCoef: 1, bandwidth: 1, childrenBonus: 1.5 })
check('★子嗣 +150% → 灵力/秒 ×2.5', spsWithChild / spsNoChild, 2.5)

// ---------- 8. 模块二：内宅杂项（体力 / 位阶 / 开局预置 / 池完整性）----------

// 体力上限 = 145 + 外功加成（《睡觉恢复》§五）。**炼体一层即基准 145**，加成从第 2 级起算。
check('体力上限 基础 = 145', energyMaxOf(0), 145)
check('体力上限 炼体一层 = 145（开局）', energyMaxOf(1), 145)
check('体力上限 炼体十层 = 172', energyMaxOf(10), 172)
check('体力上限 锻骨圆满 = 196', energyMaxOf(14), 196)
check('体力上限 洗髓圆满 = 232', energyMaxOf(18), 232)
check('★脏数据不降上限：bodyLevel 负数', energyMaxOf(-5), 145)
check('★脏数据不降上限：bodyLevel 非数', energyMaxOf(undefined), 145)
check(
  '★体力上限随外功单调不减',
  [0, 1, 5, 10, 11, 14, 15, 18, 22].every((lv, i, arr) => i === 0 || energyMaxOf(lv) >= energyMaxOf(arr[i - 1])),
  true
)
check('互动消耗 15/人', COURT.energy.perInteraction, 15)
// 2026-10-16：时钟放慢 4 倍后，孕育 270 → 90 游戏天（现实时长从 7.2h 压回 ~2.4h）
check('孕育 90 游戏天', COURT.pregnancy.days, 90)
check('产后恢复 10 游戏天（与孕育同比例 9:1）', COURT.pregnancy.recoveryDays, 10)
check('★产后恢复 : 孕育 = 1:9（比例保持不变）', COURT.pregnancy.days / COURT.pregnancy.recoveryDays, 9)

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

check('自动模式叠 5%：萧金桂 11.1% → 6.1%', pregnancyChanceOf({ affinity: 85, rank: 4, auto: true }), 0.061)
check(
  '自动 + 低体力仍是 6.1%（疲劳已废）',
  pregnancyChanceOf({ affinity: 85, rank: 4, fatigued: true, auto: true }),
  0.061
)
check('★auto 默认关闭，不影响既有口径', pregnancyChanceOf({ affinity: 85, rank: 4 }), 0.111)

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

// ⚠ 关键约定：自动模式留 30 点体力作**节奏预留**（145 体力 → 预算 115 → 7 人）。
// 2026-10-18 起受孕率的疲劳惩罚已废除，这 30 点不再有「避免掉率」的含义。
check('★自动挑人留 30 点体力预留：145 体力只挑 7 人', pickAutoWives({ wives: POOL, rule: 'relation', energy: 145 }).length, 7)
check(
  '★预留真的留住了（结束时体力 ≥ 30）',
  145 - pickAutoWives({ wives: POOL, rule: 'relation', energy: 145 }).length * COURT.energy.perInteraction >=
    COURT.pregnancy.fatigueThreshold,
  true
)
check('体力 45 → 只够 1 人', pickAutoWives({ wives: POOL, rule: 'relation', energy: 45 }).length, 1)
check('★体力只剩 30（正好等于保底线）→ 一个都不挑', pickAutoWives({ wives: POOL, rule: 'relation', energy: 30 }).length, 0)
check('体力 0 → 不挑', pickAutoWives({ wives: POOL, rule: 'relation', energy: 0 }).length, 0)
check(
  '★候选人不够时按实际人数封顶',
  pickAutoWives({ wives: POOL.slice(0, 3), rule: 'relation', energy: 145 }).length,
  3
)
check(
  '★已孕 / 产后恢复的不参与自动挑人',
  pickAutoWives({
    wives: [...POOL, mkWife('x', 99, 4, null, 'pregnant'), mkWife('y', 99, 4, null, 'recovering')],
    rule: 'relation',
    energy: 145
  }).includes('x'),
  false
)
check(
  '挑人是按规则取前 N 个（不是随机）',
  pickAutoWives({ wives: POOL, rule: 'relation', energy: 145 }).join(''),
  'abcdefg'
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
check('★开局体力是满的（spentToday 0 ⇒ 上限即当前值）', court0.energy.spentToday, 0)
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

// 子嗣年龄（P12.5 列表展示）：365 天/年、30 天/月，只用于 UI
const D = GAME_SECONDS_PER_DAY
check('年龄：刚出生 = 0 天', formatOffspringAge(0, 0), '0 天')
check('年龄：29 天按天显示', formatOffspringAge(0, 29 * D), '29 天')
check('年龄：30 天 = 1 月', formatOffspringAge(0, 30 * D), '1 月')
check('年龄：59 天仍 = 1 月', formatOffspringAge(0, 59 * D), '1 月')
check('年龄：60 天 = 2 月', formatOffspringAge(0, 60 * D), '2 月')
check('年龄：365 天 = 1 岁 0 月', formatOffspringAge(0, 365 * D), '1 岁 0 月')
check('年龄：400 天 = 1 岁 1 月', formatOffspringAge(0, 400 * D), '1 岁 1 月')
check('★出生时间在未来：夹到 0 天，不出现负数', offspringAgeOf(10 * D, 0).totalDays, 0)
check('年龄结构：400 天 = 1 年 1 月 5 天', offspringAgeOf(0, 400 * D).days, 5)

// ---------- 8b'. P14 子嗣成长：仙凡双轨（设计 §7.1）----------
const mortalChild = { hasRoot: false, birthTime: 0 }
const immortalChild = { hasRoot: true, birthTime: 0 }

// 凡人边界 45 / 90 / 180 / 270 / 450
check('凡人 44 天 = 幼年', offspringGrowthOf(mortalChild, 44 * D).stageName, '幼年')
check('凡人 45 天 = 启蒙', offspringGrowthOf(mortalChild, 45 * D).stageName, '启蒙')
check('凡人 90 天 = 少年', offspringGrowthOf(mortalChild, 90 * D).stageName, '少年')
check('凡人 180 天 = 青年', offspringGrowthOf(mortalChild, 180 * D).stageName, '青年')
check('凡人 270 天 = 成年', offspringGrowthOf(mortalChild, 270 * D).stageName, '成年')
check('凡人 450 天 = 中年', offspringGrowthOf(mortalChild, 450 * D).stageName, '中年')
// 仙师边界 70 / 140 / 280 / 420 / 700
check('仙师 69 天 = 幼年', offspringGrowthOf(immortalChild, 69 * D).stageName, '幼年')
check('仙师 70 天 = 启蒙', offspringGrowthOf(immortalChild, 70 * D).stageName, '启蒙')
check('仙师 140 天 = 少年', offspringGrowthOf(immortalChild, 140 * D).stageName, '少年')
check('仙师 280 天 = 青年', offspringGrowthOf(immortalChild, 280 * D).stageName, '青年')
check('仙师 420 天 = 成年', offspringGrowthOf(immortalChild, 420 * D).stageName, '成年')
check('仙师 700 天 = 中年', offspringGrowthOf(immortalChild, 700 * D).stageName, '中年')
// 两条轨的成年都落在 18 仙龄岁
check('★凡人 270 天 = 18 仙龄岁', offspringGrowthOf(mortalChild, 270 * D).ageYears, 18)
check('★仙师 420 天 = 18 仙龄岁', offspringGrowthOf(immortalChild, 420 * D).ageYears, 18)
check('★设计示例：凡人 135 天 = 少年 · 9 岁 · 135/180 天', formatOffspringGrowth(mortalChild, 135 * D), '少年 · 9 岁 · 135/180 天')
check('中年没有终点（不显示 x/xx 天）', formatOffspringGrowth(mortalChild, 500 * D), '中年 · 33 岁')
check('★脏数据：出生时间在未来 → 幼年 0 天', formatOffspringGrowth(mortalChild, -10 * D), '幼年 · 0 岁 · 0/45 天')

// 收益门槛：凡人做工不参战；仙师少年可出战；青年可婚配
check('凡人启蒙可做工', canWorkOf(mortalChild, 45 * D), true)
check('凡人幼年不能做工', canWorkOf(mortalChild, 44 * D), false)
check('★无灵根：少年（甚至成年）都不能出战', canFightOf(mortalChild, 270 * D), false)
check('★有灵根：少年 140 天即可出战', canFightOf(immortalChild, 140 * D), true)
check('有灵根：启蒙 139 天不能出战', canFightOf(immortalChild, 139 * D), false)
check('青年可婚配', canMarryOf(mortalChild, 180 * D), true)
check('少年不可婚配', canMarryOf(mortalChild, 179 * D), false)
check('★陨落子嗣不参与婚配', canMarryOf({ ...mortalChild, status: 'fallen' }, 999 * D), false)
check('★陨落子嗣不能出战', canFightOf({ ...immortalChild, status: 'fallen' }, 999 * D), false)

// ---------- 8b''. P14 繁育：配偶 / 受孕 / 节流（设计 §7.4）----------
const mortalSon = { hasRoot: false, gender: 'male' }
const rootedSon = { hasRoot: true, gender: 'male', rootCount: 3 }
const spouseM = generateSpouse({ child: mortalSon, rng: () => 0 })
const spouseC = generateSpouse({ child: rootedSon, rng: () => 0 })
check('无灵根儿子 → 凡女 P1（pregCoef 1.0）', `${spouseM.name}|${spouseM.rank}|${spouseM.pregCoef}`, '赵春桃|1|1')
check('有灵根儿子 → 女修 P7（pregCoef 0.9）', `${spouseC.name}|${spouseC.rank}|${spouseC.pregCoef}`, '苏清漪|7|0.9')
check('配偶不入侍妾池：只是个普通对象（没有 status 字段）', 'status' in spouseM, false)

// 配偶灵根（P15.5(b)）：随机、但不优于子孙
check('无灵根儿子的配偶 → 无灵根', spouseM.rootCount, 0)
check('有灵根儿子的配偶 → 灵根属性数量 = rootCount', spouseC.roots.length, spouseC.rootCount)
check('三灵根儿子 + rng 0 → 配偶三灵根（下限）', spouseC.rootCount, 3)
check('三灵根儿子 + rng 0.99 → 配偶五灵根（上限）', generateSpouse({ child: rootedSon, rng: () => 0.99 }).rootCount, 5)
check(
  '★配偶永不高攀：三灵根儿子的配偶始终 >= 三灵根',
  [0, 0.2, 0.5, 0.8, 0.99].every(r => generateSpouse({ child: rootedSon, rng: () => r }).rootCount >= 3),
  true
)
check('单灵根儿子的配偶可以是一~五灵根', [0, 0.99].every(r => generateSpouse({ child: { ...rootedSon, rootCount: 1 }, rng: () => r }).rootCount >= 1), true)
const legacySon = { id: 'c_0001', name: '桂大', hasRoot: true, rootCount: 3 }
check('老档配偶灵根补齐稳定（刷新不重掷）', legacySpouseRootCount({ ...legacySon }), legacySpouseRootCount({ ...legacySon }))
check('老档配偶灵根不低于子孙', legacySpouseRootCount(legacySon) >= 3, true)
check('无灵根子孙的老档配偶 = 0', legacySpouseRootCount({ ...legacySon, hasRoot: false }), 0)
check('凡女配偶受孕率 = 10%', spouseChanceOf(spouseM), 0.1)
check('女修配偶受孕率 = 10% × 0.9', spouseChanceOf(spouseC), 0.09)
check('受孕掷骰：0 必中', rollSpousePregnancy({ spouse: spouseM, rng: () => 0 }), true)
check('受孕掷骰：0.1 不中（严格小于）', rollSpousePregnancy({ spouse: spouseM, rng: () => 0.1 }), false)
check('每对 5 胎还能生', coupleHasRoomOf({ childrenIds: Array(5).fill('x') }), true)
check('★每对满 6 胎停止', coupleHasRoomOf({ childrenIds: Array(6).fill('x') }), false)
check('老档没有 childrenIds 也不崩（按 0 算）', coupleHasRoomOf({}), true)
const alive625 = Array(625).fill({ status: 'alive' })
check('625 人未达全族上限', populationCapReached(alive625), false)
check('★626 人达到全族上限', populationCapReached([...alive625, { status: 'alive' }]), true)
check('★陨落者腾出名额', populationCapReached([...alive625, { status: 'fallen' }]), false)

// ---------- 8c. P12.3 读档归一化：旧档 270/30 → 90/10 ----------
const DAY = GAME_SECONDS_PER_DAY
const T0 = 100 * DAY
const legacyPreg = { status: 'pregnant', statusEndTime: T0 + 160 * DAY }
const np = normalizePregnancy(legacyPreg, T0)
check('★旧档孕育 270 天：剩 160 → 53.33 天', np.statusEndTime - T0, (160 / 3) * DAY)
check('  折算后起点 = 到期 - 90 天', np.statusEndTime - np.pregnancyStartTime, 90 * DAY)
check('  原对象未被修改', legacyPreg.statusEndTime, T0 + 160 * DAY)

const freshPreg = { status: 'pregnant', statusEndTime: T0 + 50 * DAY, pregnancyStartTime: T0 - 40 * DAY }
check('新档孕育 90 天：原样保留', normalizePregnancy(freshPreg, T0) === freshPreg, true)

const noStart = { status: 'pregnant', statusEndTime: T0 + 30 * DAY }
check('缺 pregnancyStartTime：按 90 天反推', normalizePregnancy(noStart, T0).pregnancyStartTime, T0 + 30 * DAY - 90 * DAY)

const legacyRec = { status: 'recovering', statusEndTime: T0 + 20 * DAY }
const nr = normalizePregnancy(legacyRec, T0)
check('★旧档产后 30 天：剩 20 → 6.67 天', nr.statusEndTime - T0, (20 / 3) * DAY)
check('  折算后恢复起点 = 到期 - 10 天', nr.statusEndTime - nr.recoveryStartTime, 10 * DAY)

const freshRec = { status: 'recovering', statusEndTime: T0 + 4 * DAY, recoveryStartTime: T0 - 6 * DAY }
check('新档产后 10 天：原样保留', normalizePregnancy(freshRec, T0) === freshRec, true)

const overdue = { status: 'pregnant', statusEndTime: T0 - DAY }
check('逾期不折算（交给结生）', normalizePregnancy(overdue, T0) === overdue, true)

const idleWife = { status: 'idle', statusEndTime: null }
check('待孕原样返回', normalizePregnancy(idleWife, T0) === idleWife, true)

// ---------- 输出 ----------

// ---------- 9. 静态结构检查：getter 被当成方法调用 ----------
//
// ⚠ **Pinia 的 getter 是 computed 属性，不是方法** —— `this.dimensionBreakdown()` 会去
//   调用那个**数组**，抛 `is not a function`。
//   这个 bug 真的发生过：`practice.js` 的 `bestImprovement` 这么写，而它只在
//   **被门槛拦住时**才求值（Cultivation.vue 的 `v-if="blockedByGate"`），
//   所以练气一层→二层一路平推都正常，**第一次触发是「练气二层圆满」** —— 那一页整页白屏。
//   静态扫一遍就能提前发现，成本几乎为零。
{
  const { readdirSync, readFileSync } = await import('node:fs')
  const path = await import('node:path')
  const getterNames = new Set()
  const actionNames = new Set()
  const collectTopLevel = (src, keyword) => {
    const m = src.match(new RegExp(`export const ${keyword} = \\{([\\s\\S]*?)\\n\\}`))
    if (!m) return
    for (const hit of m[1].matchAll(/^ {2}([A-Za-z_$][\w$]*)\s*\(/gm)) {
      ;(keyword === 'getters' ? getterNames : actionNames).add(hit[1])
    }
  }
  const dir = 'src/stores/modules'
  for (const f of readdirSync(dir)) {
    const src = readFileSync(path.join(dir, f), 'utf8')
    collectTopLevel(src, 'getters')
    collectTopLevel(src, 'actions')
  }
  // 自检：扫描器要是失效了（正则没匹配上），这条会先红
  check('静态检查：扫到了 getter 定义（防扫描器失效）', getterNames.size > 50, true)

  const offenders = []
  const scan = (file, src) => {
    src.split('\n').forEach((line, i) => {
      // 跳过注释行 —— 别把注释里举的反例当成真错
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return
      for (const hit of line.matchAll(/(?:this|playerStore)\.([A-Za-z_$][\w$]*)\(\)/g)) {
        const n = hit[1]
        if (getterNames.has(n) && !actionNames.has(n)) offenders.push(`${file}:${i + 1} ${n}`)
      }
    })
  }
  for (const f of readdirSync(dir)) scan(`${dir}/${f}`, readFileSync(path.join(dir, f), 'utf8'))
  for (const f of readdirSync('src/views')) scan(`src/views/${f}`, readFileSync(path.join('src/views', f), 'utf8'))
  check('★没有把 getter 当方法调的地方', offenders.join(' | ') || '无', '无')
}

// ---------- 输出 ----------

const pad = (s, n) => String(s).padEnd(n, ' ')
const width = Math.max(...results.map(r => [...r.label].length)) + 2

console.log('\n纯函数断言（连乘契合度 + 同参六档 · 模块二《多子多福》）\n')
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
