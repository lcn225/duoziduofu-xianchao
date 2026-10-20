// 无头 Chrome 截一张图，用于「跑起来看一眼」的验收。
//
//   node scripts/shot.mjs --url=http://localhost:2025/ --out=.tmp/shot.png
//   node scripts/shot.mjs --url=... --out=... --w=1280 --h=900 --wait=4000
//
// 以前是每次手搓 `"/c/Program Files/.../chrome.exe" --headless=new ...`，
// 19 个会话里手搓了 88 次、每次都要按权限确认；收成一个脚本后进白名单，一次都不用按。
//
// --wait 是虚拟时间预算（毫秒），给 Vue 挂载和本地存档读取留时间；
// 截图前的等待不依赖真实时钟，慢机器也能稳定出图。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const args = process.argv.slice(2)
const get = (k, d) => {
  const hit = args.find(a => a.startsWith(`--${k}=`))
  return hit ? hit.slice(k.length + 3) : d
}

const url = get('url')
if (!url) {
  console.error('用法：node scripts/shot.mjs --url=http://localhost:2025/ --out=shot.png [--w=1280] [--h=900] [--wait=4000]')
  process.exit(1)
}
const out = path.resolve(get('out', 'shot.png'))
const width = Number(get('w', 1280))
const height = Number(get('h', 900))
const wait = Number(get('wait', 4000))

const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  path.join(os.homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'),
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]
const chrome = get('chrome', CANDIDATES.find(p => fs.existsSync(p)))
if (!chrome) {
  console.error('找不到 Chrome，用 --chrome=路径 指定。')
  process.exit(1)
}

fs.mkdirSync(path.dirname(out), { recursive: true })
// 每次用独立 profile，避免和正在运行的 Chrome 抢锁
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'shot-'))

const argv = [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  `--user-data-dir=${profile}`,
  `--window-size=${width},${height}`,
  `--virtual-time-budget=${wait}`,
  `--screenshot=${out}`,
  url,
]

const code = await new Promise((resolve) => {
  const child = spawn(chrome, argv, { stdio: ['ignore', 'ignore', 'pipe'] })
  let err = ''
  child.stderr.on('data', d => { err += d })
  child.on('exit', c => resolve({ c, err }))
    .on('error', e => resolve({ c: 1, err: String(e) }))
  // Chrome 偶尔不退出，兜底
  setTimeout(() => child.kill(), wait + 15000).unref()
}).then(r => r.c)

fs.rmSync(profile, { recursive: true, force: true })
if (code !== 0 || !fs.existsSync(out)) {
  console.error(`截图失败（chrome exit ${code}）`)
  process.exit(1)
}
console.log(`已保存 ${out}`)
