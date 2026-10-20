// 读 Claude Code 的会话日志，回答「你到底在为什么按 ENTER」。
//
//   npm run enter-report                    # 本项目全部会话
//   npm run enter-report -- --session=e06d9ad5   # 只看某个会话（前缀即可）
//   npm run enter-report -- --since=2026-10-20   # 只看某天之后
//   npm run enter-report -- --json               # 机器可读
//
// ENTER 的两个来源分开算：
//   1. 你主动发消息 / 敲斜杠命令 —— 这是对话本身，省不掉；
//   2. 权限确认框 —— 这个能省。日志里的 permissionDecision.source 会写明是谁放行的：
//      config（白名单 / acceptEdits 自动）不花 ENTER，
//      user_temporary / user_permanent 是你手动按的。
//
// 重点指标是「白白多按的」：Bash 命令如果以 `cd 某目录 && ` 开头，
// 前缀式白名单（Bash(npm run verify:*)）永远匹配不上，等于白配。
// 把 cd 剥掉后能命中白名单的次数，就是这个坏习惯的代价。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import { isVerify, isProbe } from './lib/tool-rules.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..')
const PROJECTS = path.join(os.homedir(), '.claude', 'projects')

const args = process.argv.slice(2)
const asJson = args.includes('--json')
const sessionArg = args.find(a => a.startsWith('--session='))
const sinceArg = args.find(a => a.startsWith('--since='))
const since = sinceArg ? sinceArg.slice(8) : null

// Claude Code 用「非字母数字一律换成 -」来命名会话目录
const projectDir = path.join(PROJECTS, REPO.replace(/[^A-Za-z0-9]/g, '-'))

// ---- 白名单：从 .claude/settings.json 读，判「剥掉 cd 后会不会自动放行」 ----
function allowRules() {
  const file = path.join(REPO, '.claude', 'settings.json')
  let cfg = {}
  try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return [] }
  return (cfg.permissions?.allow ?? [])
    .filter(r => r.startsWith('Bash('))
    .map(r => r.slice(5, -1))
    .map(r => (r.endsWith(':*') ? { prefix: r.slice(0, -2) } : { exact: r }))
}
const RULES = allowRules()
const allowed = cmd => RULES.some(r => (r.prefix ? cmd.startsWith(r.prefix) : cmd === r.exact))

// `cd xxx && rest` → rest。也认 cd xxx; rest 和 (cd xxx && rest) 的常见写法。
function stripCd(cmd) {
  const m = cmd.trim().match(/^\((?: )?cd\s+(?:"[^"]*"|'[^']*'|\S+)\s*&&\s*([\s\S]*?)\)?$/)
    || cmd.trim().match(/^cd\s+(?:"[^"]*"|'[^']*'|\S+)\s*&&\s*([\s\S]*)$/)
  return m ? m[1].trim() : null
}

function sig(cmd) {
  return cmd.replace(/\s+/g, ' ').trim().split(' ').slice(0, 4).join(' ').slice(0, 70)
}

// 把「剥掉 cd 后仍会弹」的命令归成几类，好判断该补规则还是换写法
function categorize(cmd) {
  if (/^node\s+scripts\//.test(cmd)) return 'node scripts/<项目脚本>'
  if (/^node\s+-e/.test(cmd)) return 'node -e（一次性代码）'
  if (/^node\s+-/.test(cmd)) return 'node stdin heredoc'
  if (/^node\b/.test(cmd)) return 'node 其他'
  if (/^npm run/.test(cmd)) return `npm run ${cmd.split(/\s+/)[2] ?? ''}`
  if (/^npx vite/.test(cmd)) return 'npx vite（dev / 预览）'
  if (/chrome\.exe/.test(cmd)) return 'chrome headless（截图验收）'
  if (/^python/.test(cmd)) return 'python（一次性脚本）'
  if (/^(rm|mkdir|cp|mv|touch)\b/.test(cmd)) return `文件系统操作 ${cmd.split(/\s+/)[0]}`
  if (/^(cat|echo|printf|tee)\b/.test(cmd)) return '用 bash 写文件'
  if (/^(for|while|if)\b/.test(cmd)) return 'shell 循环 / 管道'
  if (/^git\b/.test(cmd)) return `git ${cmd.split(/\s+/)[1]}`
  return cmd.split(/\s+/)[0]
}

async function parseSession(file) {
  const toolUse = new Map()
  const s = {
    file, id: path.basename(file, '.jsonl').slice(0, 8),
    first: null, last: null,
    typed: 0, slash: 0,
    manual: 0, auto: 0, reject: 0,
    byTool: {}, bashManual: 0, cdManual: 0, cdRescuable: 0,
    gaps: {},   // 真实缺口：不属于 cd 造成的
    gapCats: {},
    calls: { read: 0, edit: 0, verify: 0, probe: 0, bash: 0, other: 0 },
    rejects: [],
  }
  const rl = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line.trim()) continue
    let o
    try { o = JSON.parse(line) } catch { continue }
    if (o.timestamp) { s.first ??= o.timestamp; s.last = o.timestamp }

    const content = Array.isArray(o.message?.content) ? o.message.content : null
    if (content && o.type === 'assistant') {
      for (const b of content) if (b.type === 'tool_use') {
        toolUse.set(b.id, b)
        if (b.name === 'Edit' || b.name === 'Write' || b.name === 'NotebookEdit') s.calls.edit++
        else if (b.name === 'Read' || b.name === 'Grep' || b.name === 'Glob') s.calls.read++
        else if (b.name === 'Bash') {
          const cmd = b.input?.command ?? ''
          if (isVerify(cmd)) s.calls.verify++
          else if (isProbe(cmd)) s.calls.probe++
          else s.calls.bash++
        } else s.calls.other++
      }
    }
    if (o.promptSource) {
      if (o.promptSource === 'typed' || o.promptSource === 'queued') s.typed++
      else s.slash++
    }
    if (o.type === 'system' && o.subtype === 'local_command') s.slash++

    const pd = o.permissionDecision
    if (!pd || !content) continue
    if (pd.source === 'user_reject' || pd.decision === 'reject') { s.reject++; continue }
    const manual = pd.source === 'user_temporary' || pd.source === 'user_permanent'
    for (const b of content) {
      if (b.type !== 'tool_result') continue
      const t = toolUse.get(b.tool_use_id)
      const name = t?.name ?? '(未匹配)'
      if (!manual) { s.auto++; continue }
      s.manual++
      s.byTool[name] = (s.byTool[name] ?? 0) + 1
      if (name !== 'Bash') continue
      s.bashManual++
      const cmd = (t?.input?.command ?? '').trim()
      const inner = stripCd(cmd)
      if (inner !== null) {
        s.cdManual++
        if (allowed(inner)) s.cdRescuable++
        else {
          s.gaps[sig(inner)] = (s.gaps[sig(inner)] ?? 0) + 1
          s.gapCats[categorize(inner)] = (s.gapCats[categorize(inner)] ?? 0) + 1
        }
      } else {
        // 不以 cd 开头也不是白名单能覆盖的 —— 这才是真的要补规则或换写法
        s.gaps[sig(cmd)] = (s.gaps[sig(cmd)] ?? 0) + 1
        s.gapCats[categorize(cmd)] = (s.gapCats[categorize(cmd)] ?? 0) + 1
      }
    }
  }
  return s
}

async function main() {
  if (!fs.existsSync(projectDir)) {
    console.error(`找不到会话目录：${projectDir}`)
    process.exit(1)
  }
  let files = fs.readdirSync(projectDir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => path.join(projectDir, f))
  if (sessionArg) {
    const want = sessionArg.slice(10)
    files = files.filter(f => path.basename(f).startsWith(want))
  }
  files.sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs)

  const sessions = []
  for (const f of files) {
    const s = await parseSession(f)
    if (since && (!s.first || s.first.slice(0, 10) < since)) continue
    sessions.push(s)
  }
  if (!sessions.length) { console.log('没有匹配的会话。'); return }

  const sum = (k) => sessions.reduce((a, s) => a + s[k], 0)
  const byTool = {}, gaps = {}, gapCats = {}
  const calls = { read: 0, edit: 0, verify: 0, probe: 0, bash: 0, other: 0 }
  for (const s of sessions) {
    for (const [k, v] of Object.entries(s.byTool)) byTool[k] = (byTool[k] ?? 0) + v
    for (const [k, v] of Object.entries(s.gaps)) gaps[k] = (gaps[k] ?? 0) + v
    for (const [k, v] of Object.entries(s.gapCats)) gapCats[k] = (gapCats[k] ?? 0) + v
    for (const [k, v] of Object.entries(s.calls)) calls[k] = (calls[k] ?? 0) + v
  }
  const total = {
    sessions: sessions.length,
    from: sessions[0].first?.slice(0, 10),
    to: sessions.at(-1).last?.slice(0, 10),
    typed: sum('typed'), slash: sum('slash'),
    manual: sum('manual'), auto: sum('auto'), reject: sum('reject'),
    bashManual: sum('bashManual'), cdManual: sum('cdManual'), cdRescuable: sum('cdRescuable'),
  }

  if (asJson) {
    console.log(JSON.stringify({ total, calls, byTool, gaps, gapCats, sessions: sessions.map(s => ({ id: s.id, day: s.first?.slice(0, 10), typed: s.typed, manual: s.manual, auto: s.auto, cdRescuable: s.cdRescuable, calls: s.calls })) }, null, 2))
    return
  }

  const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—')
  console.log(`\nENTER 账本 · ${total.sessions} 个会话 · ${total.from} ~ ${total.to}\n`)
  console.log(`  你发的消息 / 斜杠命令   ${total.typed + total.slash}`)
  console.log(`  权限确认（手动按）      ${total.manual}   ← 这部分能省`)
  console.log(`  自动放行（不花 ENTER）  ${total.auto}`)
  console.log(`  拒绝                    ${total.reject}`)

  console.log('\n工具调用构成：')
  console.log(`  读文件 / 搜索   ${String(calls.read).padStart(5)}`)
  console.log(`  改代码 / 文档   ${String(calls.edit).padStart(5)}`)
  console.log(`  验证            ${String(calls.verify).padStart(5)}  ← 每条都要过 verify-guard`)
  console.log(`  一次性探针      ${String(calls.probe).padStart(5)}  ← 连续 3 次会被提醒换法子`)
  console.log(`  其他 Bash       ${String(calls.bash).padStart(5)}`)
  console.log(`  其他工具        ${String(calls.other).padStart(5)}`)

  const tools = Object.entries(byTool).sort((a, b) => b[1] - a[1])
  if (tools.length) {
    console.log('\n手动确认按工具：')
    for (const [k, v] of tools) console.log(`  ${String(v).padStart(5)}  ${k}`)
  }

  if (total.bashManual) {
    console.log('\nBash 手动确认里：')
    console.log(`  以 cd 开头        ${String(total.cdManual).padStart(5)}  ${pct(total.cdManual, total.bashManual)}  ← 前缀白名单会被它废掉`)
    console.log(`  剥掉 cd 本可自动  ${String(total.cdRescuable).padStart(5)}  ${pct(total.cdRescuable, total.bashManual)}  ← 纯属白按`)
  }

  const catList = Object.entries(gapCats).sort((a, b) => b[1] - a[1])
  if (catList.length) {
    console.log('\n真实缺口按类别（不带 cd 也会弹）：')
    for (const [k, v] of catList) console.log(`  ${String(v).padStart(5)}  ${k}`)
  }

  const gapList = Object.entries(gaps).sort((a, b) => b[1] - a[1]).slice(0, 10)
  if (gapList.length) {
    console.log('\n最多的几条具体命令（要么补白名单，要么换个写法）：')
    for (const [k, v] of gapList) console.log(`  ${String(v).padStart(5)}  ${k}`)
  }

  console.log('\n最近 8 个会话（验证/探针 是工具调用数，看得出是不是在空转）：')
  console.log('  日期        会话      发消息  手动确认  自动  白按  验证  探针')
  for (const s of sessions.slice(-8)) {
    console.log(`  ${s.first?.slice(0, 10) ?? '?'}  ${s.id}  ${String(s.typed + s.slash).padStart(6)}  ${String(s.manual).padStart(8)}  ${String(s.auto).padStart(4)}  ${String(s.cdRescuable).padStart(4)}  ${String(s.calls.verify).padStart(4)}  ${String(s.calls.probe).padStart(4)}`)
  }
  console.log()
}

main()
