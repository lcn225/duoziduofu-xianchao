// 拆开一份导出的存档，看体量堆在哪、物品列表是不是重复栈。
//
//   node scripts/inspect-save.mjs save/xxx.json
//   node scripts/inspect-save.mjs save/xxx.json --top=30 --sample=5
//
// 为什么需要它：存档是「整个 $state」加密落盘的，任何一处数组爆掉都会变成
// 每秒几十毫秒的加密开销（见 scripts/perf-probe.mjs）。怀疑「档越来越大」时先拆这里，
// 别拿 DevTools 手点 IndexedDB。
//
// ⚠ 解密**直接复用** src/plugins/crypto.js：两种格式（老 CryptoJS / 新 `vux2:` AES-GCM）
//   都由它判定，口令或格式改了这里不用跟 —— 自己再抄一份密钥就等着解出空串。
import fs from 'node:fs'
import path from 'node:path'
import { decryptData } from '../src/plugins/crypto.js'
import { itemById } from '../src/plugins/items.js'
import {
  countUnits,
  isStackable,
  normalizeHerbStacks,
  normalizeStacks,
  unitsOf
} from '../src/plugins/stacks.js'

const args = process.argv.slice(2)
const get = (k, d) => {
  const hit = args.find(a => a.startsWith(`--${k}=`))
  return hit ? hit.slice(k.length + 3) : d
}
const file = args.find(a => !a.startsWith('--'))
if (!file) {
  console.error('用法：node scripts/inspect-save.mjs save/xxx.json [--top=20] [--sample=3]')
  process.exit(1)
}
const topN = Number(get('top', 18))
const sampleN = Number(get('sample', 3))

const raw = fs.readFileSync(path.resolve(file), 'utf8').trim()
const state = await decryptData(raw)
if (!state) {
  console.error('解密失败：口令或格式变了？')
  process.exit(1)
}
/** 明文体量：与落盘时那份 JSON.stringify 等价（往返稳定），不必留原始串 */
const plain = JSON.stringify(state)
const bytes = v => {
  try { return JSON.stringify(v).length } catch { return 0 }
}
const mb = n => (n / 1048576).toFixed(3)

console.log(`文件 ${path.basename(file)}`)
console.log(`密文 ${mb(raw.length)} MB → 明文 ${mb(plain.length)} MB，顶层键 ${Object.keys(state).length}\n`)

const rows = Object.entries(state)
  .map(([k, v]) => [k, bytes(v), Array.isArray(v) ? `array[${v.length}]` : typeof v])
  .sort((a, b) => b[1] - a[1])
console.log('体量前 %d 名：', topN)
for (const [k, s, t] of rows.slice(0, topN)) {
  console.log(`  ${mb(s).padStart(8)} MB  ${t.padEnd(16)} ${k}`)
}

// 数组类字段：看重复度。同一 baseId 堆了几百条 = 「该合并没合并」，
// 每条都是不同实例（不同成色/词条）= 数据本身合理，只能改落盘策略。
for (const [k, v] of Object.entries(state)) {
  if (!Array.isArray(v) || v.length < 20) continue
  const keys = v.map(it => (it && typeof it === 'object' ? String(it.baseId ?? it.id ?? it.name) : String(it)))
  const cnt = new Map()
  for (const key of keys) cnt.set(key, (cnt.get(key) || 0) + 1)
  const dup = [...cnt.entries()].sort((a, b) => b[1] - a[1])
  console.log(`\n[${k}] ${v.length} 条，不同键 ${cnt.size} 个`)
  for (const it of v.slice(0, sampleN)) console.log(`  样例 ${JSON.stringify(it).slice(0, 200)}`)
  console.log('  占用最多的键：')
  for (const [key, c] of dup.slice(0, 10)) console.log(`    ${String(c).padStart(6)} × ${key}`)
}

/**
 * `items` 按类型拆：装备/灵宠是**每个实例本来就该单列**（各有成色、词条、等级），
 * 灵材/骨材这类没有实例差异的，堆成 1599 条就是纯浪费。
 * 最后一行给「把可堆叠项合并成一条带数量」之后能省多少 —— 性能批要不要碰数据模型的依据。
 */
const items = state.items
if (Array.isArray(items) && items.length) {
  const byType = new Map()
  for (const it of items) {
    const k = it?.type || it?.equipType || (it?.baseId ? 'material' : 'unknown')
    const cur = byType.get(k) || { n: 0, bytes: 0, bases: new Set(), stackable: true }
    cur.n += 1
    cur.bytes += bytes(it)
    if (it?.baseId) cur.bases.add(it.baseId)
    // 有实例差异的（没 baseId、带词条/成色/等级/经验）不能合并
    if (!it?.baseId) cur.stackable = false
    byType.set(k, cur)
  }
  console.log('\n[items] 按类型拆：')
  console.log('  类型           条数      不同baseId   可否合并   占用')
  for (const [k, v] of [...byType.entries()].sort((a, b) => b[1].bytes - a[1].bytes)) {
    console.log(
      `  ${String(k).padEnd(12)} ${String(v.n).padStart(7)} ${String(v.bases.size).padStart(12)}` +
      `   ${(v.stackable ? '可' : '否').padStart(6)}   ${mb(v.bytes).padStart(8)} MB`
    )
  }
  const stackBytes = [...byType.values()].filter(v => v.stackable).reduce((a, v) => a + v.bytes, 0)
  const stackN = [...byType.values()].filter(v => v.stackable).reduce((a, v) => a + v.n, 0)
  const stackBases = [...byType.values()].filter(v => v.stackable).reduce((a, v) => a + v.bases.size, 0)
  console.log(
    `  → 可合并项 ${stackN} 条 / ${mb(stackBytes)} MB，合并后约 ${stackBases} 条 ` +
    `（省 ${mb(stackBytes * (1 - stackBases / Math.max(stackN, 1)))} MB 上下）`
  )

  // 合并键要不要带成色：灵材/灵植的回收价按成色系数（1.0/1.2/1.5/2.0）算，
  // 同 baseId 混着不同成色就不能只按 baseId 合并。这里直接数两种键各有多少组。
  const byBase = new Set()
  const byBaseQuality = new Set()
  const qualityOfBase = new Map()
  for (const it of items) {
    if (!it?.baseId) continue
    byBase.add(it.baseId)
    byBaseQuality.add(`${it.baseId}|${it.quality || '(无)'}`)
    const q = qualityOfBase.get(it.baseId) || new Set()
    q.add(it.quality || '(无)')
    qualityOfBase.set(it.baseId, q)
  }
  const mixed = [...qualityOfBase.entries()].filter(([, q]) => q.size > 1)
  console.log(`  合并键：按 baseId = ${byBase.size} 组；按 baseId+成色 = ${byBaseQuality.size} 组`)
  console.log(`  同 baseId 混多种成色的有 ${mixed.length} 种` +
    (mixed.length ? `，例：${mixed.slice(0, 5).map(([b, q]) => `${b}(${[...q].join('/')})`).join('，')}` : ''))

  /**
   * 迁移前必做的安全检查：`normalizeStacks` 会扔掉**底材查不到**的可堆叠条目。
   * 这里按同一判据先列出来 —— 如果 orphan 集合不止那批已删除的灵材，
   * 说明判据会误删玩家的东西，不能上迁移。
   */
  const orphans = new Map()
  for (const it of items) {
    if (!isStackable(it)) continue
    const baseId = it.baseId || it.id
    if (!baseId || itemById(baseId)) continue
    const cur = orphans.get(baseId) || { units: 0, name: it.name }
    cur.units += unitsOf(it)
    orphans.set(baseId, cur)
  }
  const orphanList = [...orphans.entries()].sort((a, b) => b[1].units - a[1].units)
  console.log(`\n  底材已不存在的可堆叠条目：${orphanList.length} 种 / ${orphanList.reduce((a, [, v]) => a + v.units, 0)} 件` +
    (orphanList.length ? `（迁移会清掉）` : ''))
  for (const [id, v] of orphanList.slice(0, 60)) {
    console.log(`    ${String(v.units).padStart(5)} 件  ${id}  ${v.name || ''}`)
  }
  const prefix = new Map()
  for (const [id] of orphanList) {
    const p = String(id).replace(/\d+$/, '')
    prefix.set(p, (prefix.get(p) || 0) + 1)
  }
  console.log('    按前缀归类：' + [...prefix.entries()].map(([p, n]) => `${p}* ${n} 种`).join('，'))

  /**
   * 迁移前 / 后要核对的**守恒量**：
   *   · 可堆叠件数（清掉孤儿之后）—— 合并只该减少条目数，不该减少件数
   *   · 灵草总株数
   * 拿两份导出档各跑一次对一眼，就知道有没有把玩家东西合并丢了。
   */
  const stackUnitsKept = items
    .filter(it => isStackable(it) && itemById(it.baseId || it.id))
    .reduce((sum, it) => sum + unitsOf(it), 0)
  console.log(`\n  守恒量：可堆叠件数（清孤儿后）= ${stackUnitsKept}，灵草总株数 = ${countUnits(state.herbs ?? [])}`)

  // 在内存里跑一遍迁移（与 `inventory.migrateStacks` 同两条纯函数），
  // 直接证明「只减少条目数、不减少件数」。落到浏览器里跑会被游玩产出干扰（灌档后会掉东西）。
  const sim = normalizeStacks(items, id => !!itemById(id))
  const simHerbs = normalizeHerbStacks(state.herbs ?? [])
  const simUnits = sim.list.filter(it => isStackable(it)).reduce((sum, it) => sum + unitsOf(it), 0)
  const simHerbUnits = countUnits(simHerbs.list)
  console.log(`  模拟迁移：entries ${items.length} → ${sim.list.length}，件数 ${stackUnitsKept} → ${simUnits} ` +
    `${stackUnitsKept === simUnits ? '✓ 守恒' : '✗ 件数对不上'}`)
  console.log(`  模拟迁移：灵草 ${(state.herbs ?? []).length} 条 → ${simHerbs.list.length} 条，株数 ` +
    `${countUnits(state.herbs ?? [])} → ${simHerbUnits} ${countUnits(state.herbs ?? []) === simHerbUnits ? '✓ 守恒' : '✗ 株数对不上'}`)
  console.log(`  清掉的孤儿：${sim.droppedIds.length} 条条目（清单见上）`)
}
