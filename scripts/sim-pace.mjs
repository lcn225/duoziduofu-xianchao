// `INNER_PACE` 标定（仙龄锚，2026-11-07）
//
//   node scripts/sim-pace.mjs            # A 仙龄锚（现行口径），出可粘贴的 PACE 数组
//   node scripts/sim-pace.mjs --b        # 附带 B 现实锚对照（不采用，会烧穿金丹寿元）
//
// 背景：上一版 `INNER_PACE` 用「设计模型」标定（spiritRate 1.1^等效18格、k 0.8^等效18格），
// 但代码跑的是 1.2^(L-1) 与 0.8^(L-1)、30 级。金丹十层实际速度比标定模型快约 39 倍，
// 再叠 168× 时钟，金丹段现实十几分钟就走完（2026-11-07 存档实测：9 分钟）。
//
// 现行口径 = **仙龄锚**：宪法 §2.1「游戏内累计」那一列（唯一与时钟无关的量）。
//   练气段照旧（L1~L10 不动），筑基段与金丹段按仙龄重标。
// 生产模型按**代码真实公式**，基准路线（无子嗣、无主修等级加成）：
//   spiritPerGameHour = land×0.075 × (0.98+0.32Fit) × 1.2^(L-1) × 0.8 × 9.6
//   k(L)              = 1.2^(L-1)/10/1.5^(L-1) × 1.3 = 0.13 × 0.8^(L-1)
//   修为/打坐游戏小时  = spiritPerGameHour × k
// 默认天：每天打坐 10 游戏小时（巡视 2h + 练功 10h）。
//
// 锚点（宪法 §2.1，累计到该级**开始时**）：
//   筑基一层 0.79 岁 / 筑基十层 114.6 岁 / 金丹一层 134.9 岁 / 金丹十层 449.3 岁
import { innerRealms, powerLevelOf } from '../src/plugins/realm.js'
import { spiritPerSecondOf } from '../src/plugins/harmony.js'
import { getCultivationCost, getCultivationGain, EXTRA_GAIN_CHANCE } from '../src/plugins/cultivationMath.js'
import { landNominalOutputOf, LAND_OUTPUT_COEF } from '../src/plugins/tiers.js'
import { secondsPerGameHourOf } from '../src/plugins/gameClock.js'

const LUCK = 1
const PRACTICE_HOURS_PER_GAME_DAY = 10
const USE_B = process.argv.includes('--b')

/** 基准动作路线（与 sim-k 的 FIT_ACTIONS 一致；不含心法等级加成） */
const FIT_ACTIONS = [
  { until: 2, fit: 0.114 },
  { until: 5, fit: 0.206 },
  { until: 8, fit: 0.33 },
  { until: 10, fit: 0.38 },
  { until: 20, fit: 0.411 },
  { until: 30, fit: 0.722 }
]
const fitOf = level => FIT_ACTIONS.find(x => level <= x.until).fit
const landOf = level => (level <= 10 ? 20 : level <= 20 ? 50 : 80)

/** 修为 / 打坐游戏小时（基准路线，无子嗣） */
export const productionOf = level => {
  const spirit = spiritPerSecondOf({
    landOutput: landOf(level) * LAND_OUTPUT_COEF,
    fitFactor: 0.98 + 0.32 * fitOf(level),
    spiritRate: 1.2 ** (level - 1),
    fateCoef: 0.8,
    bandwidth: 1,
    childrenBonus: 0
  })
  const gainPerSpirit = (getCultivationGain(level) / getCultivationCost(level)) * (1 + EXTRA_GAIN_CHANCE * LUCK)
  return spirit * gainPerSpirit
}

const baseExp = innerRealms.map(r => r.baseExp)
const currentPace = innerRealms.map(r => r.maxCultivation)

const swap = arr => {
  const out = [...currentPace]
  arr.forEach(({ from, to, hours }) => {
    const sumExp = baseExp.slice(from - 1, to).reduce((s, v) => s + v, 0)
    for (let lv = from; lv <= to; lv += 1) {
      out[lv - 1] = Math.round(productionOf(lv) * hours * (baseExp[lv - 1] / sumExp))
    }
  })
  return out
}

// ---- A 仙龄锚 ----
// 宪法锚点换成年份差；L30 的填满时间在宪法表之外，按理想曲线 ×1.10691 外推。
const A_BLOCKS = [
  { from: 11, to: 19, years: 114.6 - 0.79 },
  { from: 20, to: 20, years: 134.9 - 114.6 },
  { from: 21, to: 29, years: 449.3 - 134.9 }
]
const yearsToHours = years => years * 365 * PRACTICE_HOURS_PER_GAME_DAY
const paceA = swap(A_BLOCKS.map(b => ({ ...b, hours: yearsToHours(b.years) })))
// L30 外推：按理想曲线逐级耗时 ×1.10691
{
  const lv = 30
  const prevHours = yearsToHours(449.3 - 134.9) * (baseExp[28] / baseExp.slice(20, 29).reduce((s, v) => s + v, 0))
  paceA[lv - 1] = Math.round(productionOf(lv) * prevHours * 1.10691)
}

// ---- B 现实锚（对照，不采用） ----
// 筑基段 7.7 → 53.9 现实小时；金丹段 62.1 → 189.6 现实小时。
const realHoursToPracticeHours = (hours, tier) =>
  hours * 3600 * secondsPerGameHourOf(tier) * (PRACTICE_HOURS_PER_GAME_DAY / 24)
const B_BLOCKS = [
  { from: 11, to: 19, hours: realHoursToPracticeHours(53.9 - 7.7, 'foundation') },
  { from: 20, to: 20, hours: realHoursToPracticeHours(62.1 - 53.9, 'foundation') },
  { from: 21, to: 29, hours: realHoursToPracticeHours(189.6 - 62.1, 'core') }
]
const paceB = swap(B_BLOCKS)
{
  const lv = 30
  const prevHours = realHoursToPracticeHours(189.6 - 62.1, 'core') *
    (baseExp[28] / baseExp.slice(20, 29).reduce((s, v) => s + v, 0))
  paceB[lv - 1] = Math.round(productionOf(lv) * prevHours * 1.10691)
}

const sum = (arr, from, to) => arr.slice(from - 1, to).reduce((s, v) => s + v, 0)
const fmt = n => n.toLocaleString('en-US')
const realHoursOfYears = (years, tier) => (years * 365 * 24) / secondsPerGameHourOf(tier) / 3600

console.log('=== 生产模型（代码真实公式，基准路线，无子嗣）===')
for (const lv of [1, 10, 11, 20, 21, 30]) {
  console.log(
    `L${String(lv).padStart(2)} p${String(powerLevelOf(lv)).padStart(2)} ` +
    `Fit ${fitOf(lv).toFixed(3)} 灵地 ${String(landOf(lv)).padStart(3)} ` +
    `${productionOf(lv).toFixed(2)} 修为/打坐游戏小时`
  )
}

console.log('\n=== A 仙龄锚（现行）===')
console.log(`筑基 L11~L20  ${fmt(sum(currentPace, 11, 20))} → ${fmt(sum(paceA, 11, 20))}  (${(sum(paceA, 11, 20) / sum(currentPace, 11, 20)).toFixed(2)}×)`)
console.log(`金丹 L21~L30  ${fmt(sum(currentPace, 21, 30))} → ${fmt(sum(paceA, 21, 30))}  (${(sum(paceA, 21, 30) / sum(currentPace, 21, 30)).toFixed(2)}×)`)
console.log(`筑基段现实 ${realHoursOfYears(114.6 - 0.79, 'foundation').toFixed(1)}h ／ 金丹段现实 ${realHoursOfYears(449.3 - 134.9, 'core').toFixed(1)}h`)

if (USE_B) {
  console.log('\n=== B 现实锚（对照：金丹段会烧穿 500 岁寿元）===')
  console.log(`筑基 L11~L20  ${fmt(sum(currentPace, 11, 20))} → ${fmt(sum(paceB, 11, 20))}  (${(sum(paceB, 11, 20) / sum(currentPace, 11, 20)).toFixed(2)}×)`)
  console.log(`金丹 L21~L30  ${fmt(sum(currentPace, 21, 30))} → ${fmt(sum(paceB, 21, 30))}  (${(sum(paceB, 21, 30) / sum(currentPace, 21, 30)).toFixed(2)}×)`)
  console.log(`金丹段仙龄 = ${((189.6 - 62.1) * 3600 * secondsPerGameHourOf('core') / 24 / 365).toFixed(0)} 岁（寿元 500）`)
}

console.log('\n=== 逐级（A 仙龄锚）===')
console.log('级   现 PACE        A PACE')
for (let lv = 11; lv <= 30; lv += 1) {
  console.log(`${String(lv).padStart(2)}  ${fmt(currentPace[lv - 1]).padStart(10)}  ${fmt(paceA[lv - 1]).padStart(10)}`)
}

console.log('\n=== 可直接粘贴进 realm.js 的 INNER_PACE ===')
console.log(paceA.flatMap((v, i) => (i % 10 === 0 ? [`  /* L${i + 1}~L${i + 10} */ ${fmt(v)},`] : [`${fmt(v)},`])).join(' ').replace(/, /g, ', '))
