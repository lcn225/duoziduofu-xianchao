// 读 Claude Code 的会话日志，回答「token 到底花在哪」。
//
//   node scripts/token-report.mjs              # 本仓库的会话
//   node scripts/token-report.mjs --all        # ~/.claude/projects 下所有项目
//   node scripts/token-report.mjs --limit=25   # 多列几个会话
//   node scripts/token-report.mjs --json       # 机器可读
//
// 日志里同一次 API 请求会按内容块（思考块 / 工具块）写成多条记录，
// 每条都带完整 usage，所以「往返」必须按 requestRef 去重，否则成本会翻倍。
// 表格里的「工具/往返」= 工具调用次数 ÷ 真实往返：≈1 是全串行，≥2 才是并行批处理。
//
// 成本是**相对单位**，不是账单：以「输入价 = 1」为基准，
// 缓存读 0.1、缓存写 1.25、输出 5。不同模型单价不同，但比例基本一致，
// 用来比较「哪类开销占大头」足够。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..')
const PROJECTS = path.join(os.homedir(), '.claude', 'projects')

const PRICE = { cacheRead: 0.1, cacheWrite: 1.25, input: 1, output: 5 }

const args = process.argv.slice(2)
const scanAll = args.includes('--all')
const asJson = args.includes('--json')
const limitArg = args.find(a => a.startsWith('--limit='))
const limit = limitArg ? Math.max(1, Number(limitArg.slice(8)) || 15) : 15

const normalize = p =>
  path.resolve(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
const repoNorm = normalize(REPO)

function transcriptFiles() {
  if (!fs.existsSync(PROJECTS)) return []
  const files = []
  for (const dir of fs.readdirSync(PROJECTS)) {
    const full = path.join(PROJECTS, dir)
    if (!fs.statSync(full).isDirectory()) continue
    for (const name of fs.readdirSync(full)) {
      if (name.endsWith('.jsonl')) files.push(path.join(full, name))
    }
  }
  return files
}

function parseSession(file) {
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split('\n')

  let cwd = null
  let trips = 0
  let cacheRead = 0
  let cacheWrite = 0
  let input = 0
  let output = 0
  let maxCtx = 0
  let userTurns = 0
  let toolCalls = 0
  let toolResultChars = 0
  let errors = 0
  let firstTs = null
  let lastTs = null
  const models = new Set()
  const byTool = {}
  // 同一次 API 请求会按内容块（思考块 / 工具块）写成多条记录，每条都带完整 usage。
  // 不去重的话 token 和往返都会翻倍 —— 2026-10-22 实测：546 条记录 = 268 次真实请求。
  const seenReq = new Set()

  for (const line of lines) {
    if (!line.trim()) continue
    let o
    try {
      o = JSON.parse(line)
    } catch {
      continue
    }
    if (o.cwd && !cwd) cwd = o.cwd
    if (o.timestamp) {
      if (!firstTs) firstTs = o.timestamp
      lastTs = o.timestamp
    }

    if (o.type === 'assistant' && o.message) {
      const u = o.message.usage
      const reqKey = o.requestRef || o.requestId || null
      const dup = reqKey ? seenReq.has(reqKey) : false
      if (reqKey) seenReq.add(reqKey)
      if (u && !dup) {
        trips++
        cacheRead += u.cache_read_input_tokens || 0
        cacheWrite += u.cache_creation_input_tokens || 0
        input += u.input_tokens || 0
        output += u.output_tokens || 0
        const ctx =
          (u.cache_read_input_tokens || 0) +
          (u.cache_creation_input_tokens || 0) +
          (u.input_tokens || 0)
        if (ctx > maxCtx) maxCtx = ctx
      }
      if (o.message.model) models.add(o.message.model)
      for (const c of o.message.content || []) {
        if (c.type === 'tool_use') {
          toolCalls++
          byTool[c.name] = (byTool[c.name] || 0) + 1
        }
      }
    } else if (o.type === 'user' && o.message && !o.isMeta) {
      const c = o.message.content
      let hasResult = false
      let hasText = false
      if (typeof c === 'string') {
        hasText = true
      } else if (Array.isArray(c)) {
        for (const x of c) {
          if (x.type === 'tool_result') {
            hasResult = true
            let s = ''
            if (typeof x.content === 'string') s = x.content
            else if (Array.isArray(x.content)) s = x.content.map(y => y.text || '').join('')
            toolResultChars += s.length
            if (x.is_error) errors++
          } else if (x.type === 'text' && x.text) {
            hasText = true
          }
        }
      }
      // 工具返回也走 user 消息；只把真正的人类输入算成一轮
      if (hasText && !hasResult) userTurns++
    }
  }

  if (!cwd) return null
  const cwdNorm = normalize(cwd)
  if (!scanAll && cwdNorm !== repoNorm && !cwdNorm.startsWith(repoNorm + '/')) {
    return null
  }

  const cost =
    cacheRead * PRICE.cacheRead +
    cacheWrite * PRICE.cacheWrite +
    input * PRICE.input +
    output * PRICE.output

  return {
    file,
    cwd,
    trips,
    cacheRead,
    cacheWrite,
    input,
    output,
    maxCtx,
    avgCtx: trips ? (cacheRead + cacheWrite + input) / trips : 0,
    userTurns,
    toolCalls,
    toolResultChars,
    errors,
    cost,
    models: [...models],
    byTool,
    firstTs,
    lastTs
  }
}

const sessions = []
for (const file of transcriptFiles()) {
  try {
    const s = parseSession(file)
    if (s) sessions.push(s)
  } catch {
    // 损坏/正在写入的日志跳过
  }
}

sessions.sort((a, b) => b.cost - a.cost)

const total = sessions.reduce(
  (a, s) => {
    a.trips += s.trips
    a.cacheRead += s.cacheRead
    a.cacheWrite += s.cacheWrite
    a.input += s.input
    a.output += s.output
    a.userTurns += s.userTurns
    a.toolCalls += s.toolCalls
    a.toolResultChars += s.toolResultChars
    a.cost += s.cost
    return a
  },
  {
    trips: 0,
    cacheRead: 0,
    cacheWrite: 0,
    input: 0,
    output: 0,
    userTurns: 0,
    toolCalls: 0,
    toolResultChars: 0,
    cost: 0
  }
)

const m = n => (n / 1e6).toFixed(n >= 1e8 ? 0 : n >= 1e7 ? 1 : 2)

if (asJson) {
  console.log(JSON.stringify({ total, sessions }, null, 2))
  process.exit(0)
}

const fmtDate = ts => (ts ? ts.slice(0, 10) : '----------')
const fmtK = n => `${Math.round(n / 1000)}k`

// 中文表头按显示宽度右对齐：padStart 数的是码元，CJK 会多出一截
const dispW = s =>
  [...s].reduce((n, c) => n + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/.test(c) ? 2 : 1), 0)
const padW = (s, w) => ' '.repeat(Math.max(0, w - dispW(s))) + s

console.log(`扫描范围：${scanAll ? '全部项目' : REPO}`)
console.log(`${sessions.length} 个会话 · ${total.trips} 次 API 往返 · ${total.userTurns} 个真实请求`)
console.log(
  `成本构成（相对单位）：缓存读 ${m(total.cacheRead * PRICE.cacheRead)} / ` +
    `缓存写 ${m(total.cacheWrite * PRICE.cacheWrite)} / ` +
    `输入 ${m(total.input)} / 输出 ${m(total.output * PRICE.output)} · ` +
    `合计 ${m(total.cost)}`
)
console.log('')

const header = [
  '会话'.padEnd(10),
  '日期'.padEnd(10),
  '往返'.padStart(6),
  '请求'.padStart(5),
  '上下文峰值'.padStart(10),
  '平均上下文'.padStart(10),
  '缓存读'.padStart(9),
  '输出'.padStart(8),
  '工具'.padStart(6),
  padW('工具/往返', 10),
  '相对成本'.padStart(9)
].join('  ')
console.log(header)
console.log('-'.repeat(header.length))

for (const s of sessions.slice(0, limit)) {
  console.log(
    [
      path.basename(s.file, '.jsonl').slice(0, 8).padEnd(10),
      fmtDate(s.firstTs).padEnd(10),
      String(s.trips).padStart(6),
      String(s.userTurns).padStart(5),
      fmtK(s.maxCtx).padStart(10),
      fmtK(s.avgCtx).padStart(10),
      `${m(s.cacheRead)}M`.padStart(9),
      `${m(s.output)}M`.padStart(8),
      String(s.toolCalls).padStart(6),
      padW(s.trips ? (s.toolCalls / s.trips).toFixed(2) : '—', 10),
      m(s.cost).padStart(9)
    ].join('  ')
  )
}

const toolTotals = {}
for (const s of sessions) {
  for (const [name, n] of Object.entries(s.byTool)) {
    toolTotals[name] = (toolTotals[name] || 0) + n
  }
}
const toolLine = Object.entries(toolTotals)
  .sort((a, b) => b[1] - a[1])
  .map(([name, n]) => `${name} ${n}`)
  .join(' · ')

const totalCtx = total.cacheRead + total.cacheWrite + total.input
const avgCtx = total.trips ? totalCtx / total.trips : 0
const cacheShare = total.cost ? (total.cacheRead * PRICE.cacheRead) / total.cost : 0

console.log('')
console.log(`平均每次往返上下文：${fmtK(avgCtx)}（${(avgCtx / 1000).toFixed(0)}k）`)
console.log(`缓存读占相对成本：${(cacheShare * 100).toFixed(0)}%`)
console.log(
  `工具返回总量：${(total.toolResultChars / 1e6).toFixed(2)}M 字符 ` +
    `（约 ${Math.round(total.toolResultChars / 4 / 1000)}k token，错误 ${sessions.reduce((a, s) => a + s.errors, 0)} 次）`
)
console.log(`工具调用：${toolLine || '（无）'}`)
const toolsPerTrip = total.trips ? total.toolCalls / total.trips : 0
console.log(
  `工具/往返：${toolsPerTrip.toFixed(2)}` +
    (toolsPerTrip < 1.3 ? '  ← 偏低：读/查基本是串行发的，独立调用应该并进同一条消息' : '')
)
console.log('')
console.log('读法：成本 ≈ 往返次数 × 每次重读的上下文。先压会话长度，再压工具轮次；')
console.log('「工具/往返」≈1 = 全串行，≥2 才叫并行批处理。')
console.log('工具返回本身占比通常很小，不要为了省 token 跳过验证。')
