// 串跑全部 verify 脚本。
//
//   node scripts/verify-all.mjs           完整输出（给人看）
//   node scripts/verify-all.mjs --quiet   只打印失败项 + 每个脚本的汇总（给 agent / CI 看）
//
// 各脚本自己会 `process.exit(1)`；这里只负责串行、汇总与退出码。
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPTS = [
  'verify-harmony.mjs',
  'verify-dayloop.mjs',
  'verify-idle.mjs',
  'verify-shop.mjs',
  'verify-items.mjs',
  'verify-offline.mjs',
  'verify-estate.mjs',
  'verify-bath.mjs',
  'verify-persist.mjs'
]

const quiet = process.argv.includes('--quiet')
const list = process.argv.includes('--list')
const filterArg = process.argv.find(a => a.startsWith('--filter='))
const filter = filterArg ? filterArg.slice('--filter='.length) : ''
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let failed = false
let totalPassed = 0
let totalCount = 0

for (const name of SCRIPTS) {
  const childArgs = [join('scripts', name)]
  if (list) childArgs.push('--list')
  const env = { ...process.env }
  if (filter) env.VERIFY_FILTER = filter
  const result = spawnSync(process.execPath, childArgs, {
    cwd: root,
    encoding: 'utf8',
    env
  })

  if (result.error) {
    failed = true
    console.error(`[verify-all] ${name} 启动失败: ${result.error.message}`)
    continue
  }

  const output = `${result.stdout || ''}${result.stderr || ''}`

  if (list) {
    // 只打印断言标题，带上脚本名，方便 grep
    for (const line of output.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (trimmed.startsWith('[LIST]')) console.log(`${name}: ${trimmed.slice(6).trim()}`)
    }
  } else if (!quiet) {
    process.stdout.write(output)
  } else {
    // 只留失败项与「N/N 通过」「X 条断言失败」这类汇总
    const lines = output.split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (/^0\/0 通过$/.test(trimmed)) continue
      if (trimmed.includes('[ FAIL ]') || /^\d+\/\d+ 通过$/.test(trimmed) || /^\d+ 条断言失败$/.test(trimmed)) {
        console.log(trimmed)
      }
    }
  }

  const match = output.match(/(\d+)\/(\d+) 通过/)
  if (match) {
    totalPassed += Number(match[1])
    totalCount += Number(match[2])
  }
  if (result.status !== 0) {
    failed = true
    // 退出码非 0 但汇总又全过时，得知道是哪一个脚本 —— 否则只能逐个手跑
    console.error(`[verify-all] ${name} 退出码 ${result.status}`)
  }
}

if (quiet && totalCount) {
  console.log(`\n总计 ${totalPassed}/${totalCount} 通过`)
}

if (failed) {
  console.error('verify 未通过')
  process.exit(1)
}
