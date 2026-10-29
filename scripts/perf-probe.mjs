// 页面性能探针：逐页量「主线程到底在忙什么」。
//
//   npm run dev                                    # 另一个终端先起服务
//   node scripts/perf-probe.mjs                    # 新档基线
//   node scripts/perf-probe.mjs --save=save/xx.json  # 灌入真实存档再量
//   node scripts/perf-probe.mjs --only=innercourt,inventory --dwell=15000
//
// ⚠ 只量某几页用 `--only=`，且**不要带前导斜杠**：Git Bash 会把 `/innercourt`
//   当成路径改写成 `C:/Program Files/Git/innercourt`（踩过）。
//
// 为什么不用 DevTools 手点：一次要量 8 个页面 × 每页 10 秒，手点复现不了，
// 而且「哪页慢、慢在哪一项」要的是同一台机器、同一份存档、同一段代码的对照。
//
// 量什么：
//   · CDP `Performance.getMetrics` 的增量 → 每秒 script / layout / style 各占多少毫秒
//     （脚本重算、样式重算、布局重排分开列，才知道是该减响应式还是该减 DOM）
//   · 页面内 requestAnimationFrame 间隔 → 帧率与掉帧分位
//   · longtask（>50ms 的任务）条数与最长一条
//   · MutationObserver 计数 → DOM 变更次数/秒（Vue 重渲染的粗粒度信号）
//   · `IDBObjectStore.put` 计数 → saveData 落盘频率（每 tick 加密一次是最可疑的一项）
//   · `Nodes` 指标 → 页面 DOM 节点数（内宅/背包页最容易爆）
//
// ⚠ 必须开**有头** Chrome：后台/被遮挡的窗口会把 rAF 节流到 1Hz，帧率读数会假到没法看。
//   脚本已带三个 disable-backgrounding 开关。测量期间别把窗口最小化。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const args = process.argv.slice(2)
const get = (k, d) => {
  const hit = args.find(a => a.startsWith(`--${k}=`))
  return hit ? hit.slice(k.length + 3) : d
}

const url = get('url', 'http://localhost:2025/')
const savePath = get('save', '')
const dwellMs = Number(get('dwell', 10000))
const settleMs = Number(get('settle', 2500))
const bootMs = Number(get('boot', 25000))
/**
 * 页面清单。默认 = 主界面 + 各模块页；`--only=` 用**不带斜杠**的键覆盖
 * （Git Bash 会改写带前导斜杠的参数，见文件头）。
 */
const DEFAULT_ROUTES = ['/', '/innercourt', '/inventory', '/exploration', '/cultivation', '/estate', '/dungeon', '/shop']
const only = get('only', '')
const routes = only
  ? only.split(',').filter(Boolean).map(k => {
      const key = k.trim()
      return key === 'home' || key === 'day' || key === 'root' ? '/' : '/' + key.replace(/^\/+/, '')
    })
  : get('routes', '') ? get('routes', '').split(',').filter(Boolean) : DEFAULT_ROUTES
const outJson = path.resolve(get('out', `.tmp/perf-${new Date().toISOString().replace(/[:.]/g, '-')}.json`))
const profiling = args.includes('--profile')
const benching = args.includes('--bench')
const dumpSavePath = get('dump-save', '')

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

// ---------------------------------------------------------------- CDP 小客户端

class CDP {
  constructor(ws) {
    this.ws = ws
    this.seq = 0
    this.waiters = new Map()
    this.handlers = new Map()
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data)
      if (msg.id && this.waiters.has(msg.id)) {
        const { resolve, reject } = this.waiters.get(msg.id)
        this.waiters.delete(msg.id)
        if (msg.error) reject(new Error(`${msg.error.message} ${msg.error.data || ''}`))
        else resolve(msg.result)
      } else if (msg.method) {
        for (const fn of this.handlers.get(msg.method) || []) fn(msg.params, msg)
      }
    })
  }
  send(method, params = {}, sessionId) {
    const id = ++this.seq
    const payload = { id, method, params }
    if (sessionId) payload.sessionId = sessionId
    this.ws.send(JSON.stringify(payload))
    return new Promise((resolve, reject) => this.waiters.set(id, { resolve, reject }))
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-'))
const child = spawn(chrome, [
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1440,900',
  // 遮挡/后台一律不降频，否则 rAF 与 setInterval 都会被节流，读数全是假的
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
  'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore'] })

const cleanup = () => {
  try { child.kill() } catch { /* 已退出 */ }
  try { fs.rmSync(profile, { recursive: true, force: true }) } catch { /* 占用就留给系统回收 */ }
}

/** Chrome 把实际端口写在 profile 里的 DevToolsActivePort 第一行 */
const waitPort = async () => {
  const f = path.join(profile, 'DevToolsActivePort')
  for (let i = 0; i < 200; i++) {
    if (fs.existsSync(f)) {
      const line = fs.readFileSync(f, 'utf8').split('\n')[0].trim()
      if (line) return Number(line)
    }
    await sleep(100)
  }
  throw new Error('Chrome 没起来（等不到 DevToolsActivePort）')
}

const perf = {
  install: `(() => {
    if (window.__perf) return 'already'
    const P = { frames: [], longTasks: [], mutations: 0, idbPuts: 0, lsSets: 0, raf: true }
    window.__perf = P
    let last = 0
    const loop = t => { if (!P.raf) return; if (last) P.frames.push(t - last); last = t; requestAnimationFrame(loop) }
    requestAnimationFrame(loop)
    try {
      new PerformanceObserver(list => {
        for (const e of list.getEntries()) P.longTasks.push({ d: e.duration, n: e.name })
      }).observe({ entryTypes: ['longtask'] })
    } catch (e) { /* 老 Chrome 没有 longtask */ }
    try {
      new MutationObserver(recs => { P.mutations += recs.length })
        .observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })
    } catch (e) {}
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...a) { P.idbPuts++; return put.apply(this, a) }
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (...a) { P.lsSets++; return setItem.apply(this, a) }
    return 'ok'
  })()`,
  reset: `(() => { const P = window.__perf; if (!P) return 'missing';
    P.frames.length = 0; P.longTasks.length = 0; P.mutations = 0; P.idbPuts = 0; P.lsSets = 0; return 'ok' })()`,
  snapshot: `(() => { const P = window.__perf; if (!P) return null;
    return { frames: P.frames.slice(), longTasks: P.longTasks.slice(), mutations: P.mutations,
             idbPuts: P.idbPuts, lsSets: P.lsSets } })()`,
  /**
   * 「可以开始量了」的判据。
   *
   * ⚠ 光看 `.top-bar` 存在**不够**：外壳在读档/迁移跑完之前就渲染了，
   *   那时 `$state` 还是默认值（实测明文只有 0.01MB —— 帧率怎么量都好看，
   *   P58 第一轮就被这个坑量出一张假表）。
   *   `NSpin` description 是我们自己写的文案，等它消失才算真正读档完成。
   */
  ready: `(() => {
    const app = document.querySelector('#app')
    if (!document.querySelector('.top-bar') || !app || !app.children.length) return false
    return !document.body.textContent.includes('正在加载游戏数据')
  })()`,
}

/**
 * 把导出的存档串写进 IndexedDB 的 `idle-xiuxian` / `player-data` / 键 `playerData`。
 * 与 `src/stores/db.js` 的 GameDB 完全同构，不经过应用内任何导出/导入 UI。
 *
 * ⚠ 按块传：真实档有 8 MB 密文，一次性塞进一个 `Runtime.evaluate` 表达式
 *   会把 CDP 消息撑到几十 MB（中文转义后更大），Chrome 侧容易直接断连接。
 */
const saveStageStart = '(() => { window.__saveParts = []; return "ok" })()'
const saveStagePush = chunk => `window.__saveParts.push(${JSON.stringify(chunk)}), window.__saveParts.length`

const injectSave = `async () => {
  const raw = window.__saveParts.join('')
  window.__saveParts = null
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('idle-xiuxian', 1)
    req.onupgradeneeded = e => {
      const d = e.target.result
      if (!d.objectStoreNames.contains('player-data')) d.createObjectStore('player-data')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  await new Promise((resolve, reject) => {
    const tx = db.transaction('player-data', 'readwrite')
    tx.objectStore('player-data').put(raw, 'playerData')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  return raw.length
}`

const pct = (arr, p) => {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))]
}

/**
 * 把 CDP 的 cpuProfile 聚合成「按自身耗时排序的函数表」。
 * 只看 selfTime（采样点落在自己身上的时间）—— 找热点要的就是这个，
 * 包含时间会把整条调用链都算进来，看不出到底谁贵。
 */
const topSelf = (profile, top = 20) => {
  const byId = new Map(profile.nodes.map(n => [n.id, n]))
  const self = new Map()
  let total = 0
  for (let i = 0; i < profile.samples.length; i++) {
    const node = byId.get(profile.samples[i])
    const dt = profile.timeDeltas[i] || 0
    total += dt
    if (!node) continue
    const cf = node.callFrame
    const where = String(cf.url || '').replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '')
    const key = `${cf.functionName || '(anonymous)'} @ ${where}:${cf.lineNumber + 1}`
    self.set(key, (self.get(key) || 0) + dt)
  }
  return {
    totalMs: total / 1000,
    list: [...self.entries()]
      .map(([name, us]) => ({ name, ms: us / 1000 }))
      .sort((a, b) => b.ms - a.ms)
      .slice(0, top),
  }
}

const main = async () => {
  const port = await waitPort()
  const res = await fetch(`http://127.0.0.1:${port}/json/version`)
  const { webSocketDebuggerUrl } = await res.json()
  const ws = new WebSocket(webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  const cdp = new CDP(ws)

  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  await cdp.send('Page.enable', {}, sessionId)
  await cdp.send('Runtime.enable', {}, sessionId)
  await cdp.send('Performance.enable', {}, sessionId)

  /**
   * 控制台报错 / 未捕获异常。改完数据模型要顺手回归一遍：
   * 页面渲染炸了但 fps 仍可能是 60（空页当然快），光看帧率看不出来。
   */
  const pageErrors = []
  cdp.handlers.set('Runtime.exceptionThrown', [
    p => pageErrors.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || '异常')
  ])
  cdp.handlers.set('Runtime.consoleAPICalled', [
    p => {
      if (p.type !== 'error') return
      const text = (p.args || []).map(a => a.description ?? a.value ?? a.type).join(' ')
      pageErrors.push(`console.error: ${text}`)
    }
  ])

  const evalIn = async (expression, byValue = true) => {
    const r = await cdp.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: byValue,
    }, sessionId)
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
    }
    return r.result.value
  }

  const metrics = async () => {
    const r = await cdp.send('Performance.getMetrics', {}, sessionId)
    const o = {}
    for (const m of r.metrics) o[m.name] = m.value
    return o
  }

  // ---- 打开游戏 ----
  await cdp.send('Page.navigate', { url }, sessionId)
  for (let i = 0; i < bootMs / 250; i++) {
    await sleep(250)
    try {
      if (await evalIn(perf.ready)) break
    } catch { /* 导航中帧被销毁，忽略 */ }
  }

  // ---- 灌存档（可选）----
  let saveNote = '新档'
  let bootMsReal = 0
  if (savePath) {
    const raw = fs.readFileSync(path.resolve(savePath), 'utf8').trim()
    const CHUNK = 256 * 1024
    await evalIn(saveStageStart)
    for (let i = 0; i < raw.length; i += CHUNK) {
      await evalIn(saveStagePush(raw.slice(i, i + CHUNK)))
    }
    const written = await evalIn(`(${injectSave})()`)
    if (written !== raw.length) throw new Error(`存档写入长度不符：${written} != ${raw.length}`)

    const t0 = Date.now()
    await cdp.send('Page.reload', {}, sessionId)
    let ready = false
    for (let i = 0; i < bootMs / 250; i++) {
      await sleep(250)
      try {
        if (await evalIn(perf.ready)) { ready = true; break }
      } catch { /* 同上 */ }
    }
    if (!ready) throw new Error('灌入存档后页面没有就绪')
    bootMsReal = Date.now() - t0
    saveNote = `${path.basename(savePath)}（${(raw.length / 1048576).toFixed(2)} MB 密文）`
  }

  // 读档完成后还会跑一次离线结算/migrate，给它一点时间落定再开始计时
  await sleep(settleMs)
  await evalIn(perf.install)

  /**
   * 把**当前浏览器里的存档**导回本地文件。
   *
   * 用途：验证迁移类改动（如 P57 堆叠）真的把碎片合掉了、且数量没丢 ——
   * 只看内存里的数组不算数，要落盘之后解出来再数一遍。
   * 同样分块取：8MB 字符串一次性 `returnByValue` 容易把 CDP 消息撑爆。
   */
  if (dumpSavePath) {
    const total = await evalIn(`(async () => {
      const raw = await new Promise((resolve, reject) => {
        const req = indexedDB.open('idle-xiuxian', 1)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction('player-data', 'readonly')
          const get = tx.objectStore('player-data').get('playerData')
          get.onsuccess = () => resolve(get.result)
          get.onerror = () => reject(get.error)
        }
        req.onerror = () => reject(req.error)
      })
      window.__saveOut = typeof raw === 'string' ? raw : JSON.stringify(raw)
      return window.__saveOut.length
    })()`)
    const CHUNK = 256 * 1024
    const parts = []
    for (let i = 0; i < total; i += CHUNK) {
      parts.push(await evalIn(`window.__saveOut.slice(${i}, ${i + CHUNK})`))
    }
    await evalIn('window.__saveOut = null')
    const outPath = path.resolve(dumpSavePath)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, parts.join(''))
    console.log(`\n存档已导出：${outPath}（${(total / 1048576).toFixed(2)} MB）`)
  }

  /**
   * 落盘微基准：把「序列化」和「加密」分开计时，并且各量两遍 ——
   * 一遍直接吃 Pinia 的响应式代理（`$state` 原样），一遍先 `toRaw` 剥掉代理。
   * 差值就是「深度响应式代理的 get 陷阱」白付的钱，是改不改 `saveData` 的直接依据。
   */
  if (benching) {
    const bench = await evalIn(`(async () => {
      const { usePlayerStore } = await import('/src/stores/player.js')
      const store = usePlayerStore()
      const s = store.$state
      let toRaw = x => x
      try {
        const vue = await import('/node_modules/.vite/deps/vue.js')
        if (typeof vue.toRaw === 'function') toRaw = vue.toRaw
      } catch (e) { /* 拿不到就按代理算 */ }
      const { encryptData } = await import('/src/plugins/crypto.js')
      // ⚠ 2026-10-29 P58 起 encryptData 是 async（WebCrypto AES-GCM），必须 await，
      //   否则量到的是「派发了一个 Promise」的 0.0ms
      const time = async fn => { const a = performance.now(); await fn(); return performance.now() - a }
      let bytes = 0
      const out = { raw: toRaw !== (x => x) ? 'toRaw 可用' : 'toRaw 不可用（两个数一样是正常的）' }
      out.stringifyProxy = await time(() => { bytes = JSON.stringify(s).length })
      out.stringifyToRaw = await time(() => { JSON.stringify(toRaw(s)) })
      out.encryptProxy = await time(() => encryptData(s))
      out.encryptToRaw = await time(() => encryptData(toRaw(s)))
      out.bytes = bytes
      return out
    })()`)
    console.log(`\n落盘微基准（明文 ${(bench.bytes / 1048576).toFixed(2)} MB，${bench.raw}）`)
    const row = (k, v) => console.log(`  ${k.padEnd(18)} ${v.toFixed(1).padStart(8)} ms`)
    row('stringify(代理)', bench.stringifyProxy)
    row('stringify(toRaw)', bench.stringifyToRaw)
    row('encrypt(代理)', bench.encryptProxy)
    row('encrypt(toRaw)', bench.encryptToRaw)
    console.log('  → 一次落盘 = stringify + encrypt；P58 之前每秒一次 ⇒ 主线程 100%，现在节流到最多 5 秒一次\n')
  }
  const info = await evalIn(`(() => {
    const t = document.title
    const nav = document.querySelectorAll('.nav-item')
    return { title: t, navCount: nav.length, ua: navigator.userAgent }
  })()`)

  console.log(`\n存档：${saveNote}`)
  if (bootMsReal) console.log(`读档到可交互：${(bootMsReal / 1000).toFixed(1)}s`)
  console.log(`页面：${url}  导航项 ${info.navCount} 个`)
  console.log(`每页停留 ${(dwellMs / 1000).toFixed(0)}s（先静置 ${(settleMs / 1000).toFixed(0)}s）\n`)

  const label = route => (route === '/' ? '主界面' : route.replace(/^\//, ''))
  const head = ['页面', 'fps', '帧p95', '长任务', '最长', '脚本ms/s', '样式ms/s', '布局ms/s',
    '总任务ms/s', 'DOM变更/s', '存盘/s', '节点数', '堆MB']
  const WIDTHS = [11, 6, 7, 7, 6, 9, 9, 9, 10, 9, 7, 7, 7]
  const line = c => c.map((v, i) => {
    if (i === 0) return String(v).padEnd(WIDTHS[0])
    if (typeof v !== 'number') return String(v).padStart(WIDTHS[i])
    return (Number.isFinite(v) ? v.toFixed(1) : '-').padStart(WIDTHS[i])
  }).join(' ')
  const rows = []
  const detail = []
  console.log(line(head))

  for (const route of routes) {
    await evalIn(`location.hash = ${JSON.stringify('#' + route)}`)
    await sleep(settleMs)
    await evalIn(perf.reset)
    const m0 = await metrics()
    if (profiling) {
      await cdp.send('Profiler.enable', {}, sessionId)
      await cdp.send('Profiler.setSamplingInterval', { interval: 500 }, sessionId)
      await cdp.send('Profiler.start', {}, sessionId)
    }
    const samples = []
    const secs = Math.max(1, Math.round(dwellMs / 1000))
    for (let s = 0; s < secs; s++) {
      await sleep(1000)
      samples.push(await metrics())
    }
    let profile = null
    if (profiling) {
      const r = await cdp.send('Profiler.stop', {}, sessionId)
      profile = topSelf(r.profile)
    }
    const m1 = samples[samples.length - 1]
    const snap = await evalIn(perf.snapshot)
    const seconds = dwellMs / 1000
    const delta = k => (m1[k] || 0) - (m0[k] || 0)

    const frames = snap?.frames || []
    const longTasks = (snap?.longTasks || []).map(t => t.d)
    const perSec = (samples, key) => {
      const out = []
      let prev = m0[key] || 0
      for (const s of samples) {
        out.push(((s[key] || 0) - prev) * 1000)
        prev = s[key] || 0
      }
      return out
    }

    const row = {
      route,
      fps: frames.length / seconds,
      frameP95: pct(frames, 0.95),
      frameMax: frames.length ? Math.max(...frames) : 0,
      longTasks: longTasks.length,
      longTaskMax: longTasks.length ? Math.max(...longTasks) : 0,
      longTaskTotal: longTasks.reduce((a, b) => a + b, 0),
      scriptPerSec: delta('ScriptDuration') * 1000 / seconds,
      stylePerSec: delta('RecalcStyleDuration') * 1000 / seconds,
      layoutPerSec: delta('LayoutDuration') * 1000 / seconds,
      taskPerSec: delta('TaskDuration') * 1000 / seconds,
      mutationsPerSec: (snap?.mutations || 0) / seconds,
      savesPerSec: (snap?.idbPuts || 0) / seconds,
      nodes: m1.Nodes || 0,
      heapMB: (m1.JSHeapUsedSize || 0) / 1048576,
      heapTotalMB: (m1.JSHeapTotalSize || 0) / 1048576,
      layoutCount: delta('LayoutCount'),
      styleCount: delta('RecalcStyleCount'),
      lsSets: snap?.lsSets || 0,
      scriptBySec: perSec(samples, 'ScriptDuration'),
      taskBySec: perSec(samples, 'TaskDuration'),
      profile,
    }
    rows.push(row)
    detail.push(row)

    console.log(line([
      label(route), row.fps, row.frameP95, row.longTasks, row.longTaskMax,
      row.scriptPerSec, row.stylePerSec, row.layoutPerSec, row.taskPerSec,
      row.mutationsPerSec, row.savesPerSec, row.nodes, row.heapMB,
    ]))
    if (profile) {
      console.log(`  └ ${label(route)} 热点（采样 ${(profile.totalMs / 1000).toFixed(1)}s，自身耗时前 12）`)
      for (const it of profile.list.slice(0, 12)) {
        const share = profile.totalMs ? (it.ms / profile.totalMs) * 100 : 0
        console.log(`     ${it.ms.toFixed(0).padStart(6)}ms ${share.toFixed(1).padStart(5)}%  ${it.name}`)
      }
    }
  }

  if (pageErrors.length) {
    console.log(`\n⚠ 页面报错 ${pageErrors.length} 条：`)
    for (const err of [...new Set(pageErrors)].slice(0, 15)) console.log('  ' + String(err).split('\n')[0].slice(0, 200))
  } else {
    console.log('\n页面无未捕获异常 / console.error')
  }

  fs.mkdirSync(path.dirname(outJson), { recursive: true })
  fs.writeFileSync(outJson, JSON.stringify({
    at: new Date().toISOString(),
    url,
    save: saveNote,
    bootMs: bootMsReal,
    dwellMs,
    ua: info.ua,
    rows: detail,
  }, null, 2))
  console.log(`\n明细（含逐秒曲线）：${path.relative(process.cwd(), outJson)}`)

  try { await cdp.send('Browser.close') } catch { /* 已关 */ }
  await sleep(300)
  cleanup()
}

main().then(() => process.exit(0)).catch(err => {
  console.error('探针失败：', err.message)
  cleanup()
  process.exit(1)
})
