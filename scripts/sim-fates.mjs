// 本命 / 灵根分布模拟器（2026-10-19）
//
// 用法：
//   node scripts/sim-fates.mjs
//   node scripts/sim-fates.mjs --n=200000
//
// 口径：《模块二》§6.2 —— **先定本命数量 → 抽本命（灵气可重复）→
// 灵根 = fateElement 去重集合**。灵根数量可以小于本命数量
// （3 件木系本命 = 单木灵根）。
//
// 改本命数量分布、灵气池或根系数后先跑这个，不用手算分布。

import { rollOffspring, TUNING } from '../src/plugins/innerCourt.js'

const arg = process.argv.find(value => value.startsWith('--n='))
const N = Math.max(1000, Math.min(Math.floor(Number(arg?.slice(4)) || 50000), 1000000))

const rootDist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
const fateDist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
let rooted = 0
let fateSum = 0
let rootCoefSum = 0
let traitCoefSum = 0
let bonusSum = 0

for (let i = 0; i < N; i += 1) {
  const child = rollOffspring({ rank: 6, fatherTier: 'core', totalDraws: 1, rng: Math.random })
  if (!child.hasRoot) continue
  rooted += 1
  rootDist[child.rootCount] = (rootDist[child.rootCount] || 0) + 1
  fateDist[child.fates.length] = (fateDist[child.fates.length] || 0) + 1
  fateSum += child.fates.length
  const rootCoef = TUNING.bonus.rootCountCoef[child.rootCount] || 0
  const traitCoef =
    1 + (child.traits || []).reduce((sum, t) => sum + (TUNING.bonus.traitCoef[t.grade] || 0), 0)
  rootCoefSum += rootCoef
  traitCoefSum += traitCoef
  bonusSum += rootCoef * traitCoef
}

const pct = value => `${((value / rooted) * 100).toFixed(1)}%`

console.log(`样本 ${N}，有灵根 ${rooted}（${((rooted / N) * 100).toFixed(1)}%）`)
console.log('\n本命数量分布（先抽的）')
for (let count = 1; count <= 5; count += 1) {
  console.log(`  ${count} 件   ${pct(fateDist[count])}`)
}
console.log('\n灵根数量分布（本命属性去重后）')
for (let count = 1; count <= 5; count += 1) {
  console.log(`  ${count} 灵根 ${pct(rootDist[count])}   系数 ${TUNING.bonus.rootCountCoef[count]}`)
}
console.log('\n期望')
console.log(`  平均本命件数      ${(fateSum / rooted).toFixed(2)}`)
console.log(`  期望根系数        ${(rootCoefSum / rooted).toFixed(4)}`)
console.log(`  期望词条系数      ${(traitCoefSum / rooted).toFixed(4)}`)
console.log(`  期望（根×词条）   ${(bonusSum / rooted).toFixed(4)}`)
