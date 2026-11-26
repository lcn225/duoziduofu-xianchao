// verify-guard hook 规则断言（2026-11-26 · B3 拆槽）。
//
// 覆盖：
//   · 命令分类：断言 / 文档门禁 / 都不是（含 cd 前缀）
//   · 成败判定：有 exitCode 看 exitCode；没有就退回「失败|FAIL|Error:」
//   · 脚本契约：check-docs / doc-toc 的失败输出必须带「失败」（判定锚点）
//   · 槽位接线：assert / docs 两个槽分开，不再有 lastVerify
//
//   node scripts/verify-hooks.mjs           完整输出
//   node scripts/verify-hooks.mjs --list    只列断言标题
//   VERIFY_FILTER=分类 node scripts/verify-hooks.mjs --quiet
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isVerify, outcomeOkOf, verifyKindOf } from './lib/tool-rules.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
let skipped = 0
const results = []
const labels = []
const FILTER = (process.env.VERIFY_FILTER || '').toLowerCase()
const LIST = process.argv.includes('--list')

const eq = (a, b) => {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-6
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => eq(v, b[i]))
  }
  return a === b
}
const check = (label, actual, expected) => {
  if (FILTER && !label.toLowerCase().includes(FILTER)) {
    skipped += 1
    return
  }
  labels.push(label)
  if (LIST) return
  const ok = eq(actual, expected)
  if (!ok) failures += 1
  results.push({ ok, label, actual, expected })
}

// ================= 一、命令分类 =================
check('分类：npm run verify:quiet → 断言', verifyKindOf('npm run verify:quiet'), 'assert')
check('分类：npm run verify → 断言', verifyKindOf('npm run verify'), 'assert')
check('分类：直接跑 verify 脚本 → 断言', verifyKindOf('node scripts/verify-items.mjs --list'), 'assert')
check('分类：npm run check:docs → 文档门禁', verifyKindOf('npm run check:docs'), 'docs')
check('分类：npm run docs:toc --check → 文档门禁', verifyKindOf('npm run docs:toc --check'), 'docs')
check('分类：cd 前缀仍能识别', verifyKindOf('cd "C:\\x\\repo" && npm run check:docs'), 'docs')
check('分类：sim 脚本不算验证', verifyKindOf('npm run sim:fates'), null)
check('分类：build 不算验证', verifyKindOf('npm run build'), null)
check('分类：isVerify 口径不变（enter-report 用）', [
  isVerify('npm run verify:quiet'),
  isVerify('npm run check:docs'),
  isVerify('npm run sim:fates')
], [true, true, false])

// ================= 二、成败判定 =================
check('判定：有 exitCode 时以 exitCode 为准（失败）', outcomeOkOf({ exitCode: 1, stdout: '4,189/4,189 通过' }), false)
check('判定：有 exitCode 时以 exitCode 为准（成功）', outcomeOkOf({ exitCode: 0, stdout: '3 条断言失败' }), true)
check('判定：无 exitCode，全部通过 → 成功', outcomeOkOf({ stdout: '4,189/4,189 通过' }), true)
check('判定：无 exitCode，断言失败 → 失败', outcomeOkOf({ stdout: '3 条断言失败' }), false)
check('判定：无 exitCode，Error: → 失败', outcomeOkOf({ stderr: 'Error: boom' }), false)
check('判定：载荷为空 → 成功（别误伤）', outcomeOkOf({}), true)

// ================= 三、脚本契约：失败输出带「失败」 =================
const checkDocs = readFileSync(join(root, 'scripts/check-docs.mjs'), 'utf8')
const docToc = readFileSync(join(root, 'scripts/doc-toc.mjs'), 'utf8')
const guard = readFileSync(join(root, 'scripts/hooks/verify-guard.mjs'), 'utf8')
check('契约：check-docs 失败分支带「失败」', /文档检查失败/.test(checkDocs), true)
check('契约：doc-toc 目录过期分支带「失败」', /目录检查失败/.test(docToc), true)

// ================= 四、槽位接线 =================
check('接线：hook 有 assert / docs 两个槽', [/\bstate\.assert\b/.test(guard), /\bstate\.docs\b/.test(guard)], [true, true])
check('接线：旧 lastVerify 槽已移除', /state\.lastVerify|lastVerify:/.test(guard), false)
check('接线：文档门禁分支不调用 deny', (() => {
  const m = guard.match(/if \(kind === 'docs'\) \{[\s\S]*?\n  \}/)
  return m ? !/deny\(/.test(m[0]) : false
})(), true)
check('接线：hook 用 outcomeOkOf 判成败', /outcomeOkOf\(/.test(guard), true)

// ================= 输出 =================
if (LIST) {
  for (const label of labels) console.log(`[LIST] ${label}`)
  console.log(`\n共 ${labels.length} 条断言`)
  process.exit(0)
}

const width = Math.max(...results.map(r => r.label.length), 10)
console.log('\nverify-guard 断言（分类 / 判定 / 契约 / 槽位）\n')
for (const r of results) {
  const mark = r.ok ? '  ok  ' : ' FAIL '
  console.log(`[${mark}] ${r.label.padEnd(width)} ${r.actual}`)
}
const passed = results.length - failures
console.log(`\n${passed}/${results.length} 通过`)
if (failures > 0) {
  console.error(`\n${failures} 条断言失败\n`)
  process.exit(1)
}
console.log('全部通过 ✅\n')
if (skipped) console.log(`（${skipped} 条被 VERIFY_FILTER 跳过）`)
