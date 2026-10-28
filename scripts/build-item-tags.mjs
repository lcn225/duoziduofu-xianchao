// 物品标签 → 运行时数据模块（2026-10-28，B7 第 1 步）
//
//   输入：design/30-数据与决议/物品标签-474.json       （474 件三层标签）
//         design/30-数据与决议/同参标签关系表.json     （77 键，含 _meta）
//   输出：src/plugins/itemTags.data.js
//
// 为什么要生成一份 .js 而不是直接 import JSON：
//   `scripts/verify-*.mjs` 用 node 直接加载 `src/plugins/*.js`（见 harmony.js 顶部），
//   node 的 ESM 读 JSON 需要 import attributes，vite 的写法又不一样。生成 .js 两边都通。
//
// **设计 JSON 是唯一真源，这里只搬运**。标签改了改设计文件，重跑本脚本：
//   npm run tags:build

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TAGS_SRC = resolve(ROOT, 'design/30-数据与决议/物品标签-474.json')
const REL_SRC = resolve(ROOT, 'design/30-数据与决议/同参标签关系表.json')
const OUT = resolve(ROOT, 'src/plugins/itemTags.data.js')

const tags = JSON.parse(readFileSync(TAGS_SRC, 'utf8'))
const rel = JSON.parse(readFileSync(REL_SRC, 'utf8'))

const items = tags.items || {}
const ids = Object.keys(items)

// ---- 自检：缺层、空 id、非数组 ----
const problems = []
for (const id of ids) {
  const t = items[id]
  if (!t || !Array.isArray(t.top) || !Array.isArray(t.mid) || !Array.isArray(t.base)) {
    problems.push(`${id}: 三层不全`)
    continue
  }
  if (!t.mid.length) problems.push(`${id}: 中层为空`)
  if (!t.base.length) problems.push(`${id}: 底层为空`)
  const all = [...t.top, ...t.mid, ...t.base]
  if (new Set(all).size !== all.length) problems.push(`${id}: 同一件物品有重复标签`)
}
if (problems.length) {
  console.error(`✗ 标签数据有 ${problems.length} 处问题：\n  ${problems.join('\n  ')}`)
  process.exit(1)
}

// ---- 关系表结构：键 → { derives: string[], implies: string[] }，_meta 跳过 ----
const relKeys = Object.keys(rel).filter(key => key !== '_meta')
const badRel = relKeys.filter(
  key => !Array.isArray(rel[key]?.derives) || !Array.isArray(rel[key]?.implies)
)
if (badRel.length) {
  console.error(`✗ 关系表结构不对：${badRel.join('、')}`)
  process.exit(1)
}

const sortWords = list => [...new Set(list)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

const itemLines = ids
  .sort()
  .map(id => {
    const t = items[id]
    return `  ${JSON.stringify(id)}: { top: ${JSON.stringify(t.top)}, mid: ${JSON.stringify(
      t.mid
    )}, base: ${JSON.stringify(t.base)} },`
  })
  .join('\n')

const relLines = relKeys
  .sort()
  .map(key => {
    const entry = rel[key]
    return `  ${JSON.stringify(key)}: { derives: ${JSON.stringify(
      sortWords(entry.derives)
    )}, implies: ${JSON.stringify(entry.implies)} },`
  })
  .join('\n')

const meta = rel._meta || {}

const output = `// ⚠ 自动生成，不要手改。
// 来源：
//   design/30-数据与决议/物品标签-474.json   （${ids.length} 件三层标签）
//   design/30-数据与决议/同参标签关系表.json （${relKeys.length} 键顶层关系）
// 重新生成：npm run tags:build
//
// 口径（《模块一》§4.3 /《同参标签契合度》）：
//   契合度 = Σ(本命被命中的标签权重) / Σ(本命全部标签权重)
//   权重 顶层 1.0 / 中层 0.4 / 底层 0.25
//   顶层可走一跳关系（同参词作键查本命词），中层/底层只认字面交集。

/** 三层权重（《装备词条表》§1） */
export const TAG_WEIGHTS = { top: 1.0, mid: 0.4, base: 0.25 }

/** 同一件物品 = 100%；非原物封顶 95%（交付包 §三） */
export const COMPANION_CAP = 0.95

/** 关系表元数据：promoted 已转正 / candidate 候选 / example_only 池内无物的示例词 */
export const TOP_RELATIONS_META = ${JSON.stringify(meta, null, 2).replace(/\n/g, '\n')}

/** 顶层关系表：键 = 同参词，值里的词 = 本命词。\`A → B\` = 同参带 A 命中本命 B。只走一跳。 */
export const TOP_RELATIONS = {
${relLines}
}

/** 474 件的三层标签；顶层可为空数组（一二阶不强制），中层/底层至少 1 个 */
export const ITEM_TAGS = {
${itemLines}
}
`

writeFileSync(OUT, output, 'utf8')
console.log(`✓ ${ids.length} 件标签 + ${relKeys.length} 键关系 → src/plugins/itemTags.data.js`)
