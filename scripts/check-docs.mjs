// 设计文档一致性检查（2026-10-19）
//
// 用法：
//   node scripts/check-docs.mjs
//
// 只查两类问题：
//   1. 已被拍板废掉的旧词 / 旧口径（例如 凡兽、民心/50、灵气优先不重复）
//   2. 失效的相对链接
//
// ⚠ 这是 grep 级检查，只挡「旧词残留」；语义矛盾（例如本命数量 vs 灵根数量）
//   仍然只能靠人读。日常改完文档跑一次，比人工翻 8 份文档快。
//
// 跳过：design/90-历史归档/（归档可以保留旧词）、design/原作/（小说原文）。

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'))

const RULES = [
  {
    re: /凡兽|王级变异兽|神兽\/仙器|神兽·仙器/,
    reason: '旧本命档位名，已统一为「N 阶灵兽/灵器/灵植/灵材」',
    allow: /作废|不再叫|旧词|旧表|90-历史归档/
  },
  {
    re: /民心\/50/,
    reason: '旧民心系数，已改分级表 1.20/1.10/1.00/0.90/0.80/0.50',
    allow: /已废弃|已删除|删除|不要再用|取代|不是|→|矛盾|旧/
  },
  {
    re: /灵气优先不重复|灵气不重复/,
    reason: '旧多本命规则，灵气现在可重复（灵根 = 去重集合）',
    allow: /旧|不再|已删除|取代|作废/
  },
  {
    re: /本命数量\s*=\s*灵根数量/,
    reason: '旧灵根模型，现在灵根 = 本命属性去重集合',
    allow: /旧|老档|迁移|例外/
  },
  {
    re: /(?:npm run verify|验证)[^\n]{0,20}(?:757|777)|(?:757|777)\s*条/,
    reason: '过期验证条数，以当前 verify 输出为准',
    allow: /旧|之前|历史/
  },
  {
    re: /战败率极低/,
    reason: '探索 v1.0 已改为「同境界每事件 4.5% 战败」，不再是极低',
    allow: /旧措辞|旧口径|历史/
  },
  {
    re: /每游戏小时 1 次/,
    reason: '探索已改为每 2 游戏小时（1 时辰）结算 1 次',
    allow: /旧|之前|历史/
  },
  {
    // 2026-10-28：仙龄刻度 15 → 45 游戏天/岁（女修 70/3 → 70）
    re: /15\s*游戏天\s*[=＝]\s*1\s*(?:仙龄岁|岁)|1\s*仙龄岁[^\n]{0,8}15\s*游戏天|女修[^\n]{0,12}70\s*\/\s*3\s*天/,
    reason: '旧仙龄刻度（凡女 15 天/岁、女修 70/3 天），2026-10-28 已改 45 / 70 天',
    allow: /旧|作废|历史|迁移|折回|3×|3x|之前|当时/
  }
]

const isSkipped = file =>
  file.includes('90-历史归档') ||
  file.includes(`${join('design', '原作')}`) ||
  file.includes(join('node_modules'))

const walkMarkdown = dir => {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (isSkipped(full)) continue
    const stat = statSync(full)
    if (stat.isDirectory()) out.push(...walkMarkdown(full))
    else if (name.endsWith('.md')) out.push(full)
  }
  return out
}

const files = [
  join(ROOT, 'CLAUDE.md'),
  join(ROOT, 'README.md'),
  ...walkMarkdown(join(ROOT, 'design'))
]

const problems = []
for (const file of files) {
  if (!existsSync(file)) continue
  const rel = file.slice(ROOT.length + 1).replaceAll('\\', '/')
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, index) => {
    for (const rule of RULES) {
      if (!rule.re.test(line)) continue
      if (rule.allow && rule.allow.test(line)) continue
      problems.push(`${rel}:${index + 1}  旧口径：「${line.trim().slice(0, 80)}」  → ${rule.reason}`)
    }
  })

  // 相对链接：只查 ](path)，跳过 http/#/mailto
  const dir = dirname(file)
  for (const match of readFileSync(file, 'utf8').matchAll(/\]\(([^)]+)\)/g)) {
    const link = match[1].trim()
    if (/^(https?:|#|mailto:)/.test(link)) continue
    const path = decodeURIComponent(link.split('#')[0])
    if (!path) continue
    if (!existsSync(normalize(join(dir, path)))) {
      problems.push(`${rel}  坏链接：${link}`)
    }
  }
}

if (problems.length) {
  console.error(`\n文档检查：${problems.length} 个问题\n`)
  for (const problem of problems) console.error(`- ${problem}`)
  console.error('\n修完再跑一次；归档文档不参与检查。\n')
  process.exit(1)
}

console.log(`文档检查通过：${files.length} 份文档，无旧口径残留、无坏链接。`)
