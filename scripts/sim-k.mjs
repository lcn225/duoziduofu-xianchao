// K(L) 配平系数重标（《数值真值表》§2.4 / §2.5）。
//
// ⚠ **2026-11-07 起本脚本只作历史对照**：现行 `INNER_PACE` 的真源是
//   `npm run sim:pace`（`scripts/sim-pace.mjs`）。本脚本用的是设计模型
//   （spiritRate 1.1^等效18格、k 0.8^等效18格），和代码的 1.2^(L-1) / 0.8^(L-1)
//   不是一套公式 —— 拿它重标会把金丹段标快约 4.8 倍。
//
//   K(L) = 目标本层耗时(L) / 裸公式耗时(L)
//   有效上限 = Base_Exp(L) × K(L)
//
// 为什么需要重标（2026-11-01 P56-b）：
//   ① 18 级 → 30 级（P61），`Base_Exp` 换成了段内切分后的 30 格；
//   ② 灵地改 5 阶 20/50/80/110/140（P56-b），基准路线 = 练气一阶 / 筑基二阶 / 金丹三阶；
//   ③ 宪法第二章锚点（P55-d 收窄结丹段）没动，但中间级要重新摊。
//
// 目标耗时的摊法：**同一锚点区间内，目标时间按裸耗时等比分配** ——
// 于是 K 在一个锚点区间内是常数，锚点行精确命中宪法，中间级不拍脑袋。
//
// 用法：`npm run sim:k`（`-- --fit=old` 复现 P56-a 之前的动作路线）
import { innerRealms, powerLevelOf } from '../src/plugins/realm.js'

const BASE = innerRealms.map(r => r.maxCultivation)

// 宪法第二章的累计锚点（现实秒）：到这一级开始时，已经花掉多少时间
const ANCHORS = {
  2: 60, // 练气二层 1 分钟
  3: 240, // 练气三层 累计 4 分钟
  6: 2280, // 练气六层 累计 38 分钟
  10: 16980, // 练气十层 累计 283 分钟
  11: 27720, // 筑基一层 累计 7.7 小时
  20: 118800, // 筑基十层 累计 33 小时
  21: 205200, // 金丹一层 累计 57 小时
  30: 682560 // 金丹十层 累计 7.9 天（189.6 小时）
}

/**
 * 基准路线的 Fit（《数值真值表》§3.3 的动作路线，**不含心法等级加成**）。
 * K 必须按「0 级心法」算 —— 等级加成是随修行时间自然涨的，混进来会重复计一次。
 */
const FIT_ACTIONS = [
  { until: 2, fit: 0.114 }, // 开局（桂氏 qi_mid × 盾）
  { until: 5, fit: 0.206 }, // 换元氏/吕氏
  { until: 8, fit: 0.33 }, // 换《兽器双修经》
  { until: 10, fit: 0.38 }, // 再换猪妖系同参
  { until: 20, fit: 0.411 }, // 换《万兽御器经》
  { until: 30, fit: 0.722 } // 《兽器同源经》+ 完美同参（0.76 × 0.95）
]
const fitOf = level => FIT_ACTIONS.find(x => level <= x.until).fit

/** 基准路线的灵地（名义产出）：练气一阶，筑基二阶，金丹三阶 */
const landNominalOf = level => (level <= 10 ? 20 : level <= 20 ? 50 : 80)

const FATE = 0.8 // 桂冈双本命双灵根
const LUCK = 1 // 打坐转化率里的运气项：(1 + 0.3×luck)

/** 打坐转化率 k(L) = 0.1 × 0.8^(powerLevel-1) × (1+0.3×luck) */
const kOf = level => 0.1 * 0.8 ** (powerLevelOf(level) - 1) * (1 + 0.3 * LUCK)
/** 突破倍率 spiritRate = 1.1^(powerLevel-1) */
const spiritRateOf = level => 1.1 ** (powerLevelOf(level) - 1)
/** 灵力/秒（设计口径：不含门控 9.6、不含 k） */
const spiritPerSecondOf = level =>
  landNominalOf(level) * (0.98 + 0.32 * fitOf(level)) * FATE * spiritRateOf(level)
/** 修为/秒 */
const gainPerSecondOf = level => spiritPerSecondOf(level) * kOf(level)
/** 裸耗时（秒） */
const bareSecondsOf = level => BASE[level - 1] / gainPerSecondOf(level)

// ---- 锚点区间：起点级 → 终点级（含两端）----
// 锚点 N 的意思是「**到 N 级开始时**已累计这么多秒」，所以区间是 (上一锚点, 本锚点-1]。
//   例：锚点 L2 = 60s ⇒ 只有 L1 的目标是 60s；L2 的 180s 属于下一个区间。
const BLOCKS = []
{
  const marks = [0, ...Object.keys(ANCHORS).map(Number)]
  for (let i = 1; i < marks.length; i += 1) {
    const prev = marks[i - 1]
    const from = Math.max(prev, 1)
    const to = marks[i] - 1
    const seconds = (ANCHORS[marks[i]] || 0) - (ANCHORS[prev] || 0)
    if (to >= from) BLOCKS.push({ from, to, seconds })
  }
}

// ---------------------------------------------------------------------------
// 口径 ②「理想曲线」（--ideal，2026-11-01 拍板）：
//   练气段照搬锚点摊法的结果（那一段已经定死），从**练气十层的填满耗时**起，
//   L11~L29 走**一条等比线**，终点精确落在金丹十层的累计锚点；
//   于是每级耗时严格递增、零台阶，20 / 21 两条「4 级时代残留锚点」不再参与分配。
// ---------------------------------------------------------------------------
const USE_IDEAL = process.argv.includes('--ideal')

const rows = []
for (const block of BLOCKS) {
  let bareSum = 0
  for (let lv = block.from; lv <= block.to; lv += 1) bareSum += bareSecondsOf(lv)
  const K = block.seconds / bareSum
  for (let lv = block.from; lv <= block.to; lv += 1) {
    const bare = bareSecondsOf(lv)
    rows.push({
      level: lv,
      powerLevel: powerLevelOf(lv),
      base: BASE[lv - 1],
      K,
      cap: Math.round(BASE[lv - 1] * K),
      fit: fitOf(lv),
      land: landNominalOf(lv),
      spiritRate: spiritRateOf(lv),
      spiritPerSecond: spiritPerSecondOf(lv),
      k: kOf(lv),
      gainPerSecond: gainPerSecondOf(lv),
      bare,
      target: bare * K
    })
  }
}

// ---- 口径 ②：把 L11~L29 换成一条等比线（练气段不动）----
let IDEAL_RATIO = null
if (USE_IDEAL) {
  const qiSum = rows.filter(r => r.level <= 10).reduce((s, r) => s + r.target, 0)
  const f0 = rows[9].target                            // 练气十层的填满耗时 = 等比起点
  const need = ANCHORS[30] - qiSum                     // L11~L29 要填满的总时长
  const n = 19
  const S = r => f0 * r * (Math.pow(r, n) - 1) / (r - 1)
  let lo = 1.000001, hi = 3
  for (let i = 0; i < 120; i++) { const m = (lo + hi) / 2; if (S(m) < need) lo = m; else hi = m }
  IDEAL_RATIO = (lo + hi) / 2
  let t = f0 * IDEAL_RATIO
  for (const r of rows) {
    if (r.level <= 10) continue
    r.target = t
    r.K = t / r.bare
    r.cap = Math.round(r.base * r.K)
    t *= IDEAL_RATIO
  }
}

// 末级（金丹十层）没有「下一级」，但验算表要能看到它的有效上限与累计时间
{
  const last = rows[rows.length - 1]
  const lv = 30
  // 理想曲线口径下，末级也按同一比例往前推，免得最后一条进度条和曲线脱节
  const bare30 = bareSecondsOf(30)
  const t30 = USE_IDEAL ? last.target * IDEAL_RATIO : null
  const K30 = USE_IDEAL ? t30 / bare30 : last.K
  rows.push({
    level: lv,
    powerLevel: powerLevelOf(lv),
    base: BASE[lv - 1],
    K: K30,
    cap: Math.round(BASE[lv - 1] * K30),
    fit: fitOf(lv),
    land: landNominalOf(lv),
    spiritRate: spiritRateOf(lv),
    spiritPerSecond: spiritPerSecondOf(lv),
    k: kOf(lv),
    gainPerSecond: gainPerSecondOf(lv),
    bare: 0,
    target: null
  })
}

const f = (n, d = 3) => Number(n).toFixed(d)
const MD = process.argv.includes('--md')
if (MD) {
  console.log('| 级 | 境界 | Base_Exp | K | 有效上限 | 灵地 | Fit | spiritRate | 灵力/秒 | 打坐 k | 修为/秒 | 裸耗时 | 目标 | 累计到本级开始 |')
  console.log('|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
} else {
  console.log('级 | 等效 | Base_Exp | K | 有效上限 | 灵地 | Fit | spiritRate | 灵力/秒 | 打坐k | 修为/秒 | 裸耗时 | 目标 | 累计到本级开始')
  console.log('---|---|---|---|---|---|---|---|---|---|---|---|---|---')
}
let cumulative = 0
const cumText = m =>
  m < 60 ? `${f(m, 1)} 分` : m < 60 * 48 ? `${f(m / 60, 1)} 小时` : `${f(m / 60 / 24, 2)} 天`
for (const r of rows) {
  const cum = cumulative
  console.log(
    [
      r.level,
      ...(MD ? [innerRealms[r.level - 1].name] : [f(r.powerLevel, 2)]),
      r.base,
      f(r.K),
      MD ? r.cap.toLocaleString() : r.cap,
      r.land,
      f(r.fit, 3),
      f(r.spiritRate, 2),
      f(r.spiritPerSecond, 1),
      f(r.k, 5),
      f(r.gainPerSecond, 2),
      r.bare ? `${Math.round(r.bare)}s` : '—',
      r.target === null ? '—（满级）' : `${Math.round(r.target)}s`,
      MD ? cumText(cum / 60) : `${f(cum / 60, 1)}m`
    ].join(' | ')
  )
  cumulative += r.bare * r.K
}

// ---- 校验：累计到锚点级必须精确等于宪法 ----
console.log('\n锚点校验：')
const cumAt = lv => rows.filter(r => r.level < lv).reduce((s, r) => s + r.bare * r.K, 0)
// 理想曲线口径下，20 / 21 是**已知会偏离**的两条 4 级时代残留锚点，只报偏差不报错
const RESIDUAL = new Set([20, 21])
let bad = 0
for (const [lv, sec] of Object.entries(ANCHORS)) {
  const got = cumAt(Number(lv))
  const ok = Math.abs(got - sec) < 0.5
  if (!ok && !(USE_IDEAL && RESIDUAL.has(Number(lv)))) bad += 1
  const mark = ok ? '✅' : USE_IDEAL && RESIDUAL.has(Number(lv))
    ? `ℹ 偏离 ${((got - sec) / 3600).toFixed(2)}h（${((got - sec) / sec * 100).toFixed(1)}%，理想曲线口径下作废）`
    : '❌'
  console.log(`  到 ${lv} 级：宪法 ${sec}s / 本表 ${f(got, 1)}s ${mark}`)
}

// ---- 段内 K 的唯一值列表（写进文档用；理想曲线口径下没有分段 K）----
if (!USE_IDEAL) {
  console.log('\n各锚点区间的 K：')
  for (const block of BLOCKS) {
    const r = rows.find(x => x.level === block.from)
    console.log(`  L${block.from}~L${block.to}：K = ${f(r.K)}（目标合计 ${Math.round(block.seconds)}s）`)
  }
} else {
  console.log(`\n理想曲线：练气段照旧，L11~L29 等比 ×${IDEAL_RATIO.toFixed(5)}，逐级 K 见上表`)
}
console.log(bad ? `\n❌ ${bad} 个锚点未命中` : '\n全部锚点命中 ✅')
