// 灵材 / 灵植固定成色表生成（2026-11-26 · 待办 #8）
//
//   输入：src/plugins/items.data.js 的 灵材 / 灵植 底材（295 件）
//   输出：src/plugins/itemQuality.data.js
//
// 口径（2026-11-26 拍板 ③）：
//   · 每**阶独立**分配（灵材 5 阶 + 灵植 5 阶，共 10 组），阶内按 baseId 字典序稳定排序；
//   · 每组按 50 / 30 / 15 / 5 用**最大余数法**取整（件数守恒）；
//   · 打平（小数部分相同）时按 下 → 中 → 上 → 极 的顺序优先给前排。
//     真正会打平的是灵植五阶（10 件：上 1.5 / 极 0.5 都余 0.5），按此规则给「上」
//     ⇒ 5 / 3 / 2 / 0，**五阶灵植没有「极」**。这是固定表的既有后果，不是漏配。
//
// ⚠ 成表后**写死**。以后新增材料按「该阶当前比例」手工补一行，
//   **不要重跑整表** —— 重算会按字典序重排，老玩家已有的堆会变值。
//   本脚本只用于首次生成 / 人工复核（`--check` 只打印对照表、不写文件）。
//
// 生成：npm run quality:build
// 核对：node scripts/build-item-quality.mjs --check

import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = resolve(ROOT, 'src/plugins/items.data.js')
const OUT = resolve(ROOT, 'src/plugins/itemQuality.data.js')

/** 固定成色的落位权重（下 / 中 / 上 / 极），顺序即打平时给前排的优先级 */
export const MATERIAL_QUALITY_WEIGHTS = [
  ['下', 0.5],
  ['中', 0.3],
  ['上', 0.15],
  ['极', 0.05]
]

const QUALITY_CATEGORIES = ['灵材', '灵植']

/** 最大余数法：返回 { 下, 中, 上, 极 }，合计 = n */
export const allocateQualities = n => {
  const n0 = Math.max(Math.floor(Number(n) || 0), 0)
  const rows = MATERIAL_QUALITY_WEIGHTS.map(([quality, weight]) => {
    const exact = n0 * weight
    return { quality, exact, floor: Math.floor(exact + 1e-9) }
  })
  let left = n0 - rows.reduce((sum, row) => sum + row.floor, 0)
  // 小数部分降序；相等时保持 下 → 中 → 上 → 极 的原始顺序（index 升序）
  const order = rows
    .map((row, index) => ({ index, frac: Math.round((row.exact - row.floor) * 1e9) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index)
  for (const { index } of order) {
    if (left <= 0) break
    rows[index].floor += 1
    left -= 1
  }
  return Object.fromEntries(rows.map(row => [row.quality, row.floor]))
}

const { ITEM_POOL } = await import(pathToFileURL(SRC).href)

const groups = []
for (const category of QUALITY_CATEGORIES) {
  for (let tier = 1; tier <= 5; tier += 1) {
    const list = ITEM_POOL.filter(item => item.category === category && item.tier === tier).sort(
      (a, b) => String(a.id).localeCompare(String(b.id))
    )
    groups.push({ category, tier, list })
  }
}

const table = {}
let expected = 0
for (const { category, tier, list } of groups) {
  expected += list.length
  const alloc = allocateQualities(list.length)
  const left = { ...alloc }
  // 按「下 → 中 → 上 → 极」的顺序从排好序的名单里依次取走名额
  for (const [quality] of MATERIAL_QUALITY_WEIGHTS) {
    const take = left[quality] || 0
    for (let i = 0; i < take; i += 1) {
      const item = list.shift()
      if (!item) break
      table[item.id] = quality
    }
  }
  const parts = MATERIAL_QUALITY_WEIGHTS.map(([q]) => `${q} ${alloc[q]}`).join(' / ')
  console.log(`${category} ${tier} 阶：${allocTotal(alloc)} 件 → ${parts}`)
}
// 兜底自检：每条都落位、数量守恒
const total = Object.keys(table).length
if (total !== expected) {
  console.error(`失败：落位 ${total} 件 ≠ 池内 ${expected} 件`)
  process.exit(1)
}

function allocTotal(alloc) {
  return Object.values(alloc).reduce((sum, n) => sum + n, 0)
}

const byOrder = Object.keys(table).sort((a, b) => a.localeCompare(b))
const lines = byOrder.map(id => `  ${JSON.stringify(id)}: ${JSON.stringify(table[id])}`).join(',\n')

const output = `// ⚠ 自动生成，不要手改。
// 来源：src/plugins/items.data.js 的 灵材 / 灵植底材（${total} 件）
// 重新生成：node scripts/build-item-quality.mjs（npm run quality:build）
//
// 口径（2026-11-26 待办 #8 拍板 ③，《炼体药浴》§三）：
//   灵材 / 灵植的成色是**底材固有**属性，不再逐次 roll。
//   每阶独立按 50 / 30 / 15 / 5 用最大余数法落位（件数守恒）；
//   打平时按 下 → 中 → 上 → 极 的顺序优先给前排（灵植五阶因此没有「极」）。
//   ⚠ 以后新增材料**按该阶当前比例手工补一行**，不要重跑整表（重排会让老堆变值）。

/** baseId → 成色（下 / 中 / 上 / 极） */
export const MATERIAL_QUALITY_BY_BASE = {
${lines}
}
`
if (!process.argv.includes('--check')) {
  writeFileSync(OUT, output, 'utf8')
  console.log(`✓ ${total} 件固定成色 → src/plugins/itemQuality.data.js`)
} else {
  console.log(`（--check：不写文件；本次会生成 ${total} 件）`)
}
