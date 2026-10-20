// 防「任务做完了还反复跑测试」和「一条路走到黑的探针」。
// 由 .claude/settings.json 的 PreToolUse / PostToolUse 调起，别手动跑。
//
// 规则：
//   1. 验证 / 探针前，正文里必须有一行「测试目的：因为改了 X，要确认 Y」；
//   2. 工作区和上次验证时一模一样 → 拦（绿了就是绿了）；
//   3. 同样输入的验证连续失败两次 → 拦（再跑还是同样结果）；
//   4. 同一条探针 10 分钟内重复 → 拦；
//   5. 探针连写（中间没改文件）≥3 次 → 只提醒，不拦。
//
// 放行：用 Write 往 .claude/.state/override 写任意内容，
// 下一条命令跳过 guard 并自动删除该文件（一次性）。
//
// 关于误伤：treeHash 只覆盖 git 能看到的东西；未跟踪文件用大小+修改时间兜底。
// 如果确实需要不改文件重跑（比如端到端卡在端口占用），走 override，不要删 hook。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isVerify, isProbe, cmdSig } from '../lib/tool-rules.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const STATE_DIR = path.join(REPO, '.claude', '.state')
const STATE = path.join(STATE_DIR, 'verify-guard.json')
const OVERRIDE = path.join(STATE_DIR, 'override')
const REPEAT_MS = 10 * 60 * 1000

function load() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')) } catch { return {} }
}
function save(s) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true })
    fs.writeFileSync(STATE, JSON.stringify(s))
  } catch { /* 状态写不了不影响工具执行 */ }
}
function out(obj) {
  process.stdout.write(JSON.stringify(obj))
}
function deny(reason) {
  out({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
    systemMessage: reason,
  })
}
function warn(msg) {
  out({ systemMessage: msg, hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: msg } })
}

// 工作区指纹：git 状态 + diff 内容；未跟踪文件补上大小/修改时间
function treeHash() {
  let s = ''
  const opts = { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
  try { s += execSync('git status --porcelain', opts) } catch { /* 非 git 目录 */ }
  try { s += execSync('git diff', opts) } catch { /* 同上 */ }
  for (const line of s.split('\n')) {
    if (!line.startsWith('?? ')) continue
    const p = path.join(REPO, line.slice(3).trim())
    try { const st = fs.statSync(p); s += `|${p}|${st.size}|${st.mtimeMs}` } catch { /* 已消失 */ }
  }
  return crypto.createHash('sha1').update(s).digest('hex')
}

// 找本轮最后一段助手正文，看有没有「测试目的」
function hasPurpose(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return true
  try {
    const fd = fs.openSync(transcriptPath, 'r')
    const size = fs.fstatSync(fd).size
    const start = Math.max(0, size - 256 * 1024)
    const buf = Buffer.alloc(size - start)
    fs.readSync(fd, buf, 0, buf.length, start)
    fs.closeSync(fd)
    const lines = buf.toString('utf8').split('\n')
    if (start > 0) lines.shift() // 只有从中间截取时，第一行才可能不完整

    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i].trim()) continue
      let o
      try { o = JSON.parse(lines[i]) } catch { continue }
      // 碰到真正的用户输入就停：上一轮的目的说明不算数
      if (o.type === 'user') {
        const c = o.message?.content
        const isToolResult = Array.isArray(c) && c.some(b => b.type === 'tool_result')
        if (!isToolResult) break
        continue
      }
      if (o.type !== 'assistant' || o.isSidechain) continue
      const blocks = Array.isArray(o.message?.content) ? o.message.content : []
      const text = blocks.filter(b => b.type === 'text').map(b => b.text).join('\n')
      if (!text) continue
      return /(测试目的|验证目的)/.test(text)
    }
    return false
  } catch {
    return true // 读不了就别卡住工作
  }
}

function pre(input) {
  const cmd = input.tool_input?.command
  if (typeof cmd !== 'string' || !cmd.trim()) return

  if (fs.existsSync(OVERRIDE)) {
    try { fs.unlinkSync(OVERRIDE) } catch { /* 忽略 */ }
    warn('已按你的放行执行一次（guard 本次跳过）。')
    return
  }

  const verify = isVerify(cmd)
  const probe = isProbe(cmd)
  if (!verify && !probe) return

  if (!hasPurpose(input.transcript_path)) {
    deny('测试前先在正文里写一行「测试目的：因为改了 X，要确认 Y」。这不是格式要求——写不出来就说明这次测试没必要跑。')
    return
  }

  const state = load()
  if (verify) {
    const tree = treeHash()
    const last = state.lastVerify
    if (last && last.tree === tree) {
      if (last.ok) {
        deny('工作区和上次验证时一模一样，上次已经全部通过。没改东西就不用再跑——真要重跑，往 .claude/.state/override 写任意内容放行一次。')
        return
      }
      if ((last.fails || 1) >= 2) {
        deny(`同样的验证已经连续失败 ${last.fails} 次，工作区没变，再跑还是同样结果。改代码、换手段，或者把问题抛给用户。`)
        return
      }
    }
    state.pending = { tree, at: Date.now() }
    save(state)
    return
  }

  // 探针
  const now = Date.now()
  state.recent = (state.recent || []).filter(r => now - r.at < REPEAT_MS)
  const s = cmdSig(cmd)
  if (state.recent.some(r => r.sig === s)) {
    deny('同一条探针 10 分钟内已经跑过，结果就在上文。')
    return
  }
  state.recent.push({ sig: s, at: now })
  state.probes = (state.probes || 0) + 1
  save(state)
  if (state.probes >= 3) {
    warn(`这是连续第 ${state.probes} 次一次性探针，中间没有改过文件。同一个问题换第 ${state.probes} 种写法，通常不是信息不够，是方向错了：停手，换个手段，或者直接问用户。`)
  }
}

function post(input) {
  const name = input.tool_name
  const state = load()

  if (name === 'Edit' || name === 'Write' || name === 'NotebookEdit') {
    if (state.probes || state.pending) {
      state.probes = 0
      save(state)
    }
    return
  }
  if (name !== 'Bash') return

  const cmd = input.tool_input?.command || ''
  if (!isVerify(cmd) || !state.pending) return

  const tr = input.tool_response || {}
  const text = `${tr.stdout ?? ''}\n${tr.stderr ?? ''}`
  const ok = typeof tr.exitCode === 'number' ? tr.exitCode === 0 : !/(失败|FAIL\b|Error:)/.test(text)
  const prev = state.lastVerify
  const sameTree = prev && prev.tree === state.pending.tree
  const fails = ok ? 0 : (sameTree ? (prev.fails || 1) + 1 : 1)
  state.lastVerify = { tree: state.pending.tree, ok, fails, at: Date.now() }
  delete state.pending
  save(state)
}

const mode = process.argv[2]
let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', d => { raw += d })
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw || '{}')
    if (mode === 'pre') pre(input)
    else if (mode === 'post') post(input)
  } catch { /* hook 永远不要弄崩会话 */ }
  process.exit(0)
})
