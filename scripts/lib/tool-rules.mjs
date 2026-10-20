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

// 「验证」：只认项目里的两条正式入口 + 直接跑断言脚本
export function isVerify(cmd) {
  const c = norm(cmd)
  return /^npm run (verify(?::[\w-]+)?|check:docs|docs:toc)(\s|$)/.test(c)
    || /^node scripts\/verify-[\w.-]+\.mjs(\s|$)/.test(c)
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
