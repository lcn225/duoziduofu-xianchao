// 串跑全部 verify 脚本。
//
//   node scripts/verify-all.mjs           完整输出（给人看）
//   node scripts/verify-all.mjs --quiet   只打印失败项 + 每个脚本的汇总（给 agent / CI 看）
//
// 五个脚本各自已经会 `process.exit(1)`；这里只负责串行、汇总与退出码。
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPTS = [
  'verify-harmony.mjs',
  'verify-dayloop.mjs',
  'verify-idle.mjs',
  'verify-shop.mjs',
  'verify-items.mjs'
]

const quiet = process.argv.includes('--quiet')
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let failed = false
let totalPassed = 0
let totalCount = 0

for (const name of SCRIPTS) {
  const result = spawnSync(process.execPath, [join('scripts', name)], {
    cwd: root,
    encoding: 'utf8'
  })

  if (result.error) {
    failed = true
    console.error(`[verify-all] ${name} 启动失败: ${result.error.message}`)
    continue
  }

  const output = `${result.stdout || ''}${result.stderr || ''}`

  if (!quiet) {
    process.stdout.write(output)
  } else {
    // 只留失败项与「N/N 通过」「X 条断言失败」这类汇总
    const lines = output.split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
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
  if (result.status !== 0) failed = true
}

if (quiet && totalCount) {
  console.log(`\n总计 ${totalPassed}/${totalCount} 通过`)
}

if (failed) {
  console.error('verify 未通过')
  process.exit(1)
}
