// 子嗣成长 / 灵根系数校准表（P55-a，2026-10-29）
//
// 用法：
//   node scripts/sim-offspring.mjs                 # 全表（同参 0 / 0.3 / 0.6 三档）
//   node scripts/sim-offspring.mjs --fit=0.6       # 只算某一档同参
//   node scripts/sim-offspring.mjs --eff=1         # 纯打坐；0.9 半打坐；0.8 仅历练
//   node scripts/sim-offspring.mjs --solve         # 按《时间刻度修订方案》§4.4.2 反推灵根系数
//
// 干什么：子嗣的修炼是**确定性**的 —— 给定灵根系数与配给同参，每一级要多少游戏天
// 完全可算。这个脚本逐级累加 `所需修为 / 日增修为`，得到「多少仙龄岁到达每一境」。
//
// 口径（真源 `src/plugins/innerCourt.js`）：
//   日增 = baseGain × gainPerLevel^(L−1) × 灵根系数 × (1 + 同参契合)
//   所需 = 桂冈同层修为上限（`realm.js` 的 CULTIVATION_CURVE.inner），
//          **L ≥ 11（筑基段）起额外 × costBump^(L−11)**
//
// 寿元门槛按 B1 的境界寿元表（凡人 80 / 练气 120 / 筑基 200 / 结丹 500），
// 那张表要等「子嗣寿命」批落地，本脚本只把它当**判定线**画在表上。

import { TUNING } from '../src/plugins/innerCourt.js'
import { getRealmName } from '../src/plugins/realm.js'

const argOf = key => process.argv.find(v => v.startsWith(`--${key}=`))?.split('=')[1]
const flag = key => process.argv.includes(`--${key}`)

const C = TUNING.offspringCultivation
const COST_BUMP = C.costBump?.from
  ? { ...C.costBump, multiplier: Number(argOf('bump')) || C.costBump.multiplier }
  : null
const DAYS_PER_YEAR = 365

/** 寿命线（岁）：凡人 80 / 练气 120 / 筑基 200 / 结丹 500 */
const LIFESPAN = { mortal: 80, qi: 120, foundation: 200, core: 500 }
const tierOfLevel = lv => getRealmName(lv).tier

/** 升上 `level` 所需的修为（从 `level-1` 起算） */
export const levelCostOf = (level, bump = COST_BUMP) => {
  const lv = Math.max(Math.floor(Number(level) || 1), 1)
  let cost = getRealmName(lv).maxCultivation
  if (bump && lv >= bump.from && lv <= (bump.to ?? Infinity)) cost *= bump.multiplier
  return cost
}

/** 站在 `level` 时的日增修为 */
export const dailyGainOf = (level, rootCoef, fit) => {
  const lv = Math.max(Math.floor(Number(level) || 1), 1)
  return C.baseGain * Math.pow(C.gainPerLevel, lv - 1) * rootCoef * (1 + fit)
}

/**
 * 逐级累加：返回 `levels[i]` = 升到第 i+1 级所需的**累计游戏天**（1 级 = 0 天）。
 * `maxLevel` 封顶，不再往后算。
 */
export const ladderOf = (rootCoef, fit, eff = 1, maxLevel = C.maxLevel) => {
  const levels = [0]
  let days = 0
  for (let lv = 1; lv < maxLevel; lv += 1) {
    const gain = dailyGainOf(lv, rootCoef, fit) * eff
    days += gain > 0 ? levelCostOf(lv) / gain : Infinity
    levels.push(days)
  }
  return levels
}

/** 第一次到达「某大境界开头」的累计天数 → 仙龄岁 */
const reachAge = (ladder, level) => (ladder[level - 1] ?? Infinity) / DAYS_PER_YEAR

const fmt = v => (Number.isFinite(v) ? v.toFixed(1) : '—')

/** 该年龄能不能活着到 —— 超寿元加 `✗` */
const mark = (ageYears, level) => {
  if (!Number.isFinite(ageYears)) return '—'
  const life = LIFESPAN[tierOfLevel(level)] || 120
  return `${fmt(ageYears)}${ageYears > life ? ' ✗' : ''}`
}

const rootCounts = [1, 2, 3, 4, 5]
const rootName = { 1: '单灵根', 2: '双灵根', 3: '三灵根', 4: '四灵根', 5: '五灵根' }

const effArg = Number(argOf('eff'))
const EFF = Number.isFinite(effArg) && effArg > 0 ? effArg : 0.9
const fitArg = argOf('fit')
const FITS = fitArg != null ? [Number(fitArg)] : [0, 0.3, 0.6]

console.log(`灵根系数：${rootCounts.map(r => `${rootName[r]} ${C.rootCoef[r]}`).join(' / ')}`)
console.log(
  `日增 = ${C.baseGain} × ${C.gainPerLevel}^(L−1) × 系数 × (1 + 同参)；` +
    `筑基段加税：${
      COST_BUMP ? `L${COST_BUMP.from}~${COST_BUMP.to ?? '∞'} ×${COST_BUMP.multiplier}` : '无'
    }；` +
    `封顶 L${C.maxLevel}（${getRealmName(C.maxLevel).name}）`
)
console.log(`修行效率 = ${(EFF * 100).toFixed(0)}%（100 仅打坐 / 90 半打坐 / 80 仅历练）`)
console.log(
  `寿元线：凡 ${LIFESPAN.mortal} / 练气 ${LIFESPAN.qi} / 筑基 ${LIFESPAN.foundation} / 结丹 ${LIFESPAN.core} 岁`
)

const MILESTONES = [
  { level: 10, name: '练气十层' },
  { level: 11, name: '筑基初期' },
  { level: 15, name: '结丹初期' },
  { level: 18, name: '结丹圆满' }
]

for (const fit of FITS) {
  console.log(`\n=== 配给同参 = ${fit} ===`)
  const header = ['灵根', '系数', ...MILESTONES.map(m => m.name)]
  console.log(header.map(h => h.padEnd(9, '　')).join(''))
  for (const root of rootCounts) {
    const ladder = ladderOf(C.rootCoef[root] ?? 1, fit, EFF)
    const cells = MILESTONES.map(m =>
      m.level > C.maxLevel ? '—' : mark(reachAge(ladder, m.level), m.level)
    )
    console.log([rootName[root], String(C.rootCoef[root]), ...cells].map(h => h.padEnd(9, '　')).join(''))
  }
  console.log('  ✗ = 到那时已超寿元（B1 寿元表落地后即为「此路不通」）')
}

// ---------- 反推：给定目标年龄，解灵根系数 ----------
if (flag('solve')) {
  // 目标 = 《时间刻度修订方案》§4.4.2 的「仅打坐（100%）」列
  const TARGETS = {
    1: { level: 11, age: 9 },
    2: { level: 15, age: 189 },
    3: { level: 11, age: 19 },
    4: { level: 11, age: 58 },
    5: { level: 11, age: 157 }
  }
  console.log('\n=== 反推灵根系数（目标：§4.4.2 仅打坐列）===')
  for (const root of rootCounts) {
    const t = TARGETS[root]
    // 日增 ∝ 系数 ⇒ 累计天数 ∝ 1/系数。先按系数 1 算一遍，再按比例解。
    const base = ladderOf(1, Number(fitArg ?? 0.6), 1)
    const days = base[t.level - 1]
    const solved = days / (t.age * DAYS_PER_YEAR)
    console.log(
      `  ${rootName[root]}：目标 ${t.age} 岁 → ${getRealmName(t.level).name} ⇒ 系数 ${solved.toFixed(3)}`
    )
  }
  console.log('  注：Solve 只解「到某一级」这一个约束；跨度还要另外对齐「单 : 五 ≈ 15 倍」。')
}
