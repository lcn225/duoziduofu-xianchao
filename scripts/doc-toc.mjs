// 给大文档顶部生成「带行号的章节目录」，让 agent 只读目标章节而不是整份读。
//
//   node scripts/doc-toc.mjs             # 自动处理 design/ 下 >= 15KB 的 md
//   node scripts/doc-toc.mjs --check     # 只检查目录是否最新（CI/check:docs 用）
//   node scripts/doc-toc.mjs a.md b.md   # 只处理指定文件
//
// 目录块用 <!-- TOC:START --> / <!-- TOC:END --> 包住，可重复运行。
// 实现要点：只在原文的字符偏移处**插入**一块文本，其余字节原样保留 ——
// 不能 split 全文再 join，否则 CRLF/LF 混排的文件会被整篇重写。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..')
const DESIGN = path.join(REPO, 'design')

const START = '<!-- TOC:START -->'
const END = '<!-- TOC:END -->'
const NOTE =
  '> **阅读提示**：别整份读。按行号用 `Read(offset, limit)` 只读目标章节；行号漂了就重跑 `npm run docs:toc`。'

// 目录块本身 + 两侧至多一个换行；CRLF 必须一起吃掉，否则会留下孤立的 \r
const TOC_RE = new RegExp(
  `(?:\\r?\\n)?${START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\r?\\n)?`,
  'g'
)

const args = process.argv.slice(2)
const checkOnly = args.includes('--check')
const explicit = args.filter(a => !a.startsWith('--'))

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) walk(full, out)
    else if (name.endsWith('.md')) out.push(full)
  }
  return out
}

function pickFiles() {
  if (explicit.length) return explicit.map(p => path.resolve(REPO, p))
  return walk(DESIGN)
    .filter(p => !p.includes(`${path.sep}90-历史归档${path.sep}`))
    .filter(p => !p.includes(`${path.sep}原作${path.sep}`))
    .filter(p => fs.statSync(p).size >= 15000)
}

function stripToc(text) {
  // 目录在文件最开头时（没有 H1 的文档），移除后还会剩一个前导空行；
  // 不处理的话每跑一次行号就 +1。
  const leading = /^\s*<!-- TOC:START -->/.test(text)
  const out = text.replace(TOC_RE, '')
  return leading ? out.replace(/^(?:\r?\n)+/, '') : out
}

function lineStarts(text) {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1)
  return starts
}

function lineText(text, starts, i) {
  const end = i + 1 < starts.length ? starts[i + 1] : text.length
  return text.slice(starts[i], end).replace(/\r?\n$/, '')
}

function rebuild(text) {
  const clean = stripToc(text)
  const starts = lineStarts(clean)
  const lines = starts.map((_, i) => lineText(clean, starts, i))
  // starts 的最后一个元素可能等于 text.length（文件以换行结尾），不代表新的一行
  if (lines.length > 1 && starts[starts.length - 1] >= clean.length && lines[lines.length - 1] === '') {
    starts.pop()
    lines.pop()
  }

  const headings = []
  lines.forEach((line, i) => {
    if (line.startsWith('## ')) headings.push({ index: i, text: line.slice(3).trim() })
  })
  if (headings.length < 3) return { text, changed: false, skipped: true }

  // 目录插在 H1 之后；没有 H1 就插在文件最前面
  let insertLine = 0
  const h1 = lines.findIndex(line => line.startsWith('# '))
  if (h1 >= 0) {
    insertLine = h1 + 1
    while (insertLine < lines.length && lines[insertLine] === '') insertLine++
  }
  const insertOffset = insertLine < starts.length ? starts[insertLine] : clean.length
  const needBlank = insertLine > 0 && lines[insertLine - 1] !== ''

  // 用插入点附近的换行风格；文件为空时退回 \n
  const before = clean.slice(0, insertOffset)
  const eol = before.endsWith('\r\n') || clean.includes('\r\n') ? '\r\n' : '\n'

  const insertedLines = headings.length + 4 + (needBlank ? 1 : 0)
  const toc = headings.map(h => {
    const finalLine = h.index + 1 + (h.index >= insertLine ? insertedLines : 0)
    return `- L${finalLine} · ${h.text}`
  })

  const blockLines = [START, NOTE, ...toc, END, '']
  let block = blockLines.join(eol) + eol
  if (needBlank) block = eol + block

  const next = clean.slice(0, insertOffset) + block + clean.slice(insertOffset)
  return { text: next, changed: next !== text }
}

const files = pickFiles()
let changed = 0
let skipped = 0
let stale = 0

for (const file of files) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    continue
  }
  const result = rebuild(text)
  const rel = path.relative(REPO, file).replace(/\\/g, '/')
  if (result.skipped) {
    skipped++
    continue
  }
  if (!result.changed) continue
  if (checkOnly) {
    stale++
    console.log(`[ STALE ] ${rel}`)
    continue
  }
  fs.writeFileSync(file, result.text, 'utf8')
  changed++
  console.log(`[ TOC ] ${rel}`)
}

if (checkOnly) {
  if (stale) {
    console.error(`\n${stale} 份文档的目录过期：跑 npm run docs:toc`)
    process.exit(1)
  }
  console.log(`目录都是最新的（检查 ${files.length} 份，跳过 ${skipped} 份小文档）`)
} else {
  console.log(`\n更新 ${changed} 份，跳过 ${skipped} 份（标题少于 3 个）`)
}
