// hook 和 enter-report 共用的命令判定，避免两边各写一套规则后走样。

// `cd xxx && rest` → rest。白名单是前缀匹配，带 cd 会整条作废（见 CLAUDE.md）。
export function stripCd(cmd) {
  const s = cmd.trim()
  const m = s.match(/^\((?: )?cd\s+(?:"[^"]*"|'[^']*'|\S+)\s*&&\s*([\s\S]*?)\)?$/)
    || s.match(/^cd\s+(?:"[^"]*"|'[^']*'|\S+)\s*&&\s*([\s\S]*)$/)
  return m ? m[1].trim() : s
}

// 去掉 `FOO=bar ` 这类前置环境变量
function stripEnv(cmd) {
  let c = cmd.trim()
  while (/^[A-Za-z_][A-Za-z0-9_]*=\S+\s+/.test(c)) c = c.replace(/^[A-Za-z_][A-Za-z0-9_]*=\S+\s+/, '')
  return c
}

const norm = cmd => stripEnv(stripCd(cmd))

// 「验证」分两类，verify-guard 记账也分开（2026-11-26 B3）：
//   assert = 断言（verify*）—— 同指纹重跑要拦
//   docs   = 文档门禁（check:docs / docs:toc）—— design/ 不进 git，指纹看不出文档改动，
//            同指纹结论不可信 ⇒ 不做重复拦截，只留记录
export function verifyKindOf(cmd) {
  const c = norm(cmd)
  if (/^npm run (check:docs|docs:toc)(\s|$)/.test(c)) return 'docs'
  if (/^npm run verify(?::[\w-]+)?(\s|$)/.test(c)) return 'assert'
  if (/^node scripts\/verify-[\w.-]+\.mjs(\s|$)/.test(c)) return 'assert'
  return null
}

// 「验证」：只认项目里的两条正式入口 + 直接跑断言脚本（enter-report 的统计口径，别改）
export const isVerify = cmd => verifyKindOf(cmd) !== null

// PostToolUse 的 tool_response → 是否成功。
// 本机 hook 载荷里没有 exitCode（2026-11-26 实测），只能退回文本正则；
// 所以验证脚本的失败输出必须统一带「失败」（check-docs / doc-toc 已改）。
export function outcomeOkOf(res) {
  const tr = res || {}
  if (typeof tr.exitCode === 'number') return tr.exitCode === 0
  const text = `${tr.stdout ?? ''}\n${tr.stderr ?? ''}`
  return !/(失败|FAIL\b|Error:)/.test(text)
}

// 「探针」：为看一眼结果临时写的一次性代码
export function isProbe(cmd) {
  const c = norm(cmd)
  return /^node\s+(-e|--input-type=module|--input-type|-)(\s|$)/.test(c)
    || /^python3?(\s|$)/.test(c)
    || /^perl\s/.test(c)
    || /^awk\s/.test(c)
}

export const cmdSig = cmd => cmd.replace(/\s+/g, ' ').trim().slice(0, 160)
