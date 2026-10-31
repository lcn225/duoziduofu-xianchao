// 同参标签契合度 / 突破门槛校准表（B7，2026-10-28）
//
// 用法：
//   node scripts/sim-companion.mjs            # 全表
//   node scripts/sim-companion.mjs --top=8    # 每档多列几件
//
// 干什么：把 474 件按「玩家在那个阶段拿得到的阶」分档，算每一档里**最好的同参**
// 及其它对本命集合的契合度，再乘以各本功法契合，得到「这个阶段的上限」。
// `realm.js` 的 BREAKTHROUGH_THRESHOLDS 就是照这张表定的（《数值真值表》§2.5）。
//
// 分档口径来自《探索系统》P30「掉落阶按境界段」：
//   练气段 = 一/二阶，筑基段 = 二/三阶，结丹段 = 三/四阶。
// ⚠ 门槛判定发生在**突破前**：进筑基门时玩家还是练气（只有一/二阶），
//   所以「筑基门」用的是练气档，不是筑基档 —— 这一点最容易算错。
//
// 改标签、改物品池或改功法 baseFit 之后重跑这个，再手调门槛。

import { TAG_WEIGHTS, companionHarmonyOf } from '../src/plugins/tagHarmony.js'
import { ITEM_POOL } from '../src/plugins/items.js'
import { PLAYER_FATES, QI_ARTS } from '../src/plugins/cultivationData.js'
import { qiArtBaseFitOf, isUniversalArt } from '../src/plugins/harmony.js'

const arg = process.argv.find(value => value.startsWith('--top='))
const TOP = Math.max(1, Math.min(Math.floor(Number(arg?.slice(6)) || 5), 20))

const pct = v => `${(v * 100).toFixed(1)}%`

/** 阶段 → 玩家在这个阶段拥有的物品阶 */
const BANDS = [
  { name: '练气段（一/二阶）', min: 1, max: 2 },
  { name: '筑基段（二/三阶）', min: 2, max: 3 },
  { name: '结丹段（三/四阶）', min: 3, max: 4 }
]

/**
 * 功法本体契合 = 十六档品阶分 + 覆盖率 × 40%（**不含等级加成**，校准基线）；
 * `baseFit` 覆盖（吕氏 / 元氏 0.38）。真源是 `harmony.qiArtBaseFitOf`，别在这里再抄一份表。
 */
const PRACTICE_VIEW = { destiny: { fates: PLAYER_FATES.map(f => f.id) } }
const artFitOf = art => qiArtBaseFitOf(art, PRACTICE_VIEW)

const bestOf = (band, fateId) =>
  ITEM_POOL.filter(item => item.tier >= band.min && item.tier <= band.max)
    .map(item => ({ item, fit: companionHarmonyOf(item, fateId).fit }))
    .sort((a, b) => b.fit - a.fit)
    .slice(0, TOP)

const bestAcrossFates = (band, item) =>
  Math.max(...PLAYER_FATES.map(fate => companionHarmonyOf(item, fate.id).fit))

console.log(`权重：顶层 ${TAG_WEIGHTS.top} / 中层 ${TAG_WEIGHTS.mid} / 底层 ${TAG_WEIGHTS.base}`)
console.log(`本命：${PLAYER_FATES.map(f => `${f.name}(${f.id})`).join(' / ')}`)

/** 每个阶段：本命各自的最好同参，以及「对本命集合取最高」 */
for (const band of BANDS) {
  console.log(`\n=== ${band.name} ===`)
  for (const fate of PLAYER_FATES) {
    const list = bestOf(band, fate.id)
    console.log(`  ${fate.name} 最好 ${pct(list[0]?.fit ?? 0)}`)
    for (const { item, fit } of list) {
      console.log(`    ${pct(fit).padStart(6)}  T${item.tier} ${item.name}（${item.category}）`)
    }
  }
  // 玩家只挂一件同参 —— 取对本命集合最好的那件
  const bestAll = ITEM_POOL.filter(item => item.tier >= band.min && item.tier <= band.max)
    .map(item => ({ item, fit: bestAcrossFates(band, item) }))
    .sort((a, b) => b.fit - a.fit)[0]
  console.log(`  → 本阶段最好的单件同参：${bestAll?.item?.name} ${pct(bestAll?.fit ?? 0)}`)
  for (const art of QI_ARTS) {
    const total = artFitOf(art) * (bestAll?.fit ?? 0) * 1.0
    // 通用心法不进「取最高」，表里的数只是它自己的品阶分 + 覆盖率，别当成门槛值读
    const mark = isUniversalArt(art) ? '  ※通用·不进取最高' : ''
    console.log(
      `     ${art.name.padEnd(10, '　')}（${artFitOf(art).toFixed(2)} × ${pct(
        bestAll?.fit ?? 0
      )}）= ${pct(total)}${mark}`
    )
  }
}

// 稳态满配：同 id 作同参 = 1.0（刃背乌鬣猪在池里，玩家能拿到四阶那一件）
const boar = ITEM_POOL.find(item => item.id === 'dao_back_boar')
if (boar) {
  const selfFit = companionHarmonyOf(boar, 'dao_back_boar').fit
  console.log(`\n=== 原物同参（${boar.name}，结丹段四阶）===`)
  console.log(`  契合 ${pct(selfFit)}（同 id = 1.0）`)
  for (const art of QI_ARTS) {
    const mark = isUniversalArt(art) ? '  ※通用·不进取最高' : ''
    console.log(`     ${art.name} → ${pct(artFitOf(art) * selfFit)}${mark}`)
  }
}

console.log(`\n提示：门槛判定发生在突破前。进筑基门时玩家还是练气，只能用练气段那一行。`)
