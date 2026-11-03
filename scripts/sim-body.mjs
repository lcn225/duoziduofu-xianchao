// 外功 PACE 标定（《数值真值表》§2.4c 第 4 条 / §5.11）。
//
//   外功每一级的现实耗时 = 内功同级的现实耗时（口径「外功套用内功时间表」，
//   2026-11-01 B9-c 拍板）。于是：
//
//     OUTER_PACE(L) = 5 轮/天 × gain(L) × 目标天数(L)
//     目标天数(L)   = 内功目标秒数(L) ÷ 每游戏天的现实秒数(L)
//
//   每游戏天的现实秒数是**标定锚**（P55-b）：练气 96 秒、筑基后 4 秒（24×）。
//   **这一档就是锻骨 / 洗髓 PACE 要放大 14~33 倍的全部原因** —— 24× 下同样
//   的 5 轮/天只占 4 现实秒，外功产出按现实时间看快了 24 倍，门槛必须跟着抬。
//   ⚠ **2026-11-03 A1 后不要按金丹 168× 改这里再重跑**：内功阈值与外功产出都按
//     「游戏天」走，时钟变快时两边**一起**压缩，B9-c 的「外功现实耗时 = 内功同级」
//     自动保持。把 4 改成 0.571 会把 `OUTER_PACE` 冤枉放大 7 倍。
//
// 为什么不用 baseExp 当门槛：`Base_Exp` 的段总量守恒（17,680 / 116,000 / 576,000）
// 只管量级，不管时间；外功的产出来自药浴（定值 gain），时间就由门槛反推。
//
// 用法：
//   npm run sim:body                # 现状 vs 目标对照 + 建议的 OUTER_PACE
//   npm run sim:body -- --md        # 直接出可粘贴的 markdown 表
//   npm run sim:body -- --div=10    # 试算「外功整体比内功快 N 倍」的口径
//
// ⚠ 内功目标秒数是 `npm run sim:k -- --ideal` 的输出，**改内功 PACE 必须同步这张表**
//   （《真值表》§2.4c 是它的真源，2026-11-01 P56-d 版本）。
import { innerRealms, outerRealms } from '../src/plugins/realm.js'
import { BATH_PARAMS, BATH_MAX_LEVEL } from '../src/plugins/bath.js'

/** 内功逐级目标耗时（现实秒）：`npm run sim:k -- --ideal`，§2.4c */
const INNER_TARGET_SECONDS = [
  60, 180, 357, 608, 1075, 1229, 2149, 3664, 7658, 10740,
  11888, 13159, 14566, 16124, 17847, 19756, 21868, 24206, 26794, 29658,
  32829, 36339, 40224, 44525, 49285, 54554, 60387, 66843, 73989, 81890
]

/** 每游戏天的现实秒数：练气 1:1（96s），筑基后 24×（4s） */
const realSecondsPerGameDay = level => (level <= 10 ? 96 : 4)

/** 一天最多跑几轮炼体（巡视 2h + 全练功 10h，不勾百艺） */
const BODY_ROUNDS_PER_DAY = 5

const divider = (() => {
  const arg = process.argv.find(a => a.startsWith('--div='))
  const n = arg ? Number(arg.slice('--div='.length)) : 1
  return Number.isFinite(n) && n > 0 ? n : 1
})()

const MD = process.argv.includes('--md')
const f = (n, d = 0) => Number(n).toFixed(d)

const rows = []
for (let lv = 1; lv <= 30; lv += 1) {
  const params = BATH_PARAMS[Math.min(lv, BATH_MAX_LEVEL)]
  const gain = params.gain
  const base = outerRealms[lv - 1].baseExp
  // 现实秒产出 = 每天 N 轮 × gain ÷ 每游戏天的现实秒数
  const perSecond = (BODY_ROUNDS_PER_DAY * gain) / realSecondsPerGameDay(lv)
  const current = base / perSecond
  const target = INNER_TARGET_SECONDS[lv - 1] / divider
  const days = target / realSecondsPerGameDay(lv)
  const pace = Math.round(BODY_ROUNDS_PER_DAY * gain * days)
  // 需料（件/游戏天）：每轮每系 floor ÷ 平均单件药力，五系合计
  const avgYield = lv <= 10 ? 22.5 : lv <= 20 ? 54.5 : 135
  const itemsPerDay = (BODY_ROUNDS_PER_DAY * 5 * params.floor) / avgYield
  rows.push({ lv, gain, base, perSecond, current, target, pace, itemsPerDay })
}

const segOf = lv => (lv <= 10 ? '练气' : lv <= 20 ? '锻骨' : '洗髓')
const sum = (list, key) => list.reduce((s, r) => s + r[key], 0)
const bySeg = name => rows.filter(r => segOf(r.lv) === name)

if (MD) {
  console.log('| L | 外功境界 | gain | 裸 Base_Exp | 现状耗时 | 内功目标 | 目标/现状 | **有效上限（OUTER_PACE）** | 需料/天 |')
  console.log('|---:|---|---:|---:|---:|---:|---:|---:|---:|')
} else {
  console.log('L 境界 gain Base_Exp 现状耗时 内功目标 目标/现状 OUTER_PACE 需料/天')
}
for (const r of rows) {
  const cells = [
    r.lv,
    MD ? outerRealms[r.lv - 1].name : outerRealms[r.lv - 1].name.slice(0, 4),
    r.gain,
    r.base,
    `${f(r.current / 60, 1)} 分`,
    `${f(r.target / 60, 1)} 分`,
    `${f(r.target / r.current, 2)}×`,
    r.pace.toLocaleString(),
    `${f(r.itemsPerDay, 1)} 件`
  ]
  console.log(MD ? `| ${cells.join(' | ')} |` : cells.join(' | '))
}

console.log('\n段合计（现实时间）：')
console.log('段 | 现状 | 目标 | 倍数')
console.log('---|---|---|---')
let curTotal = 0
let tgtTotal = 0
for (const name of ['练气', '锻骨', '洗髓']) {
  const cur = sum(bySeg(name), 'current')
  const tgt = sum(bySeg(name), 'target')
  curTotal += cur
  tgtTotal += tgt
  console.log(`${name} | ${f(cur / 3600, 2)}h | ${f(tgt / 3600, 2)}h | ${f(tgt / cur, 1)}×`)
}
console.log(`合计 | ${f(curTotal / 3600, 2)}h | ${f(tgtTotal / 3600, 2)}h | ${f(tgtTotal / curTotal, 1)}×`)

// 硬口径自检：有效上限必须逐级递增（内功 L20 那条撞车不许在外功重演）
const bad = rows.filter((r, i) => i > 0 && r.pace <= rows[i - 1].pace)
console.log(bad.length ? `\n❌ 有效上限不单调：L${bad.map(r => r.lv).join(', L')}` : '\n有效上限逐级递增 ✅')
// 需料必须落在供给上限（≈45 件/游戏天）以内
const over = rows.filter(r => r.itemsPerDay > 45.5)
console.log(over.length ? `⚠ 需料超供给：L${over.map(r => r.lv).join(', L')}` : '需料全程 ≤ 45.5 件/天（§5.11 的供给上限）✅')

console.log('\n// ---- realm.js 的 OUTER_PACE ----')
const chunks = []
for (let i = 0; i < 30; i += 10) chunks.push('  ' + rows.slice(i, i + 10).map(r => r.pace).join(', '))
console.log(`const OUTER_PACE = [\n${chunks.join(',\n')}\n]`)

// 内功目标表与 realm.js 的 INNER_PACE 同步性提示
const innerSum = innerRealms.reduce((s, r) => s + r.maxCultivation, 0)
console.log(`\n（对照：内功有效上限合计 ${innerSum.toLocaleString()}，外功 ${rows.reduce((s, r) => s + r.pace, 0).toLocaleString()}）`)
