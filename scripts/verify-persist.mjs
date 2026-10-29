// 存档加解密 + 落盘节流的断言（P58 性能批，2026-10-29）
//
//   node scripts/verify-persist.mjs          完整输出
//   node scripts/verify-persist.mjs --list   只列标题
//   VERIFY_FILTER=节流 node scripts/verify-persist.mjs
//
// 两件事，都是「坏了玩家直接丢档」的那种：
//   1. `src/plugins/crypto.js` —— 新格式（`vux2:` AES-GCM）**与老档（CryptoJS）都要解得开**。
//      换加密是 P58 唯一的**不可逆**改动：解错了不是卡顿，是整档消失。
//   2. `src/plugins/saveThrottle.js` —— 节流策略：5 秒窗口、force 顶穿、并发合并、写失败重试。
//
// ⚠ 这里**不测** persistence.js 的 store 编排（它 import 了 IndexedDB / gameClock，
//   Node 里起不来）；节流器的时序全在纯函数层，够用了。

import CryptoJS from 'crypto-js'
import {
  SAVE_FORMAT_V2,
  SAVE_VERSION,
  encryptData,
  decryptData,
  encryptText,
  decryptText,
  validateData
} from '../src/plugins/crypto.js'
import { SAVE_INTERVAL_MS, createSaveScheduler } from '../src/plugins/saveThrottle.js'

let failures = 0
let skipped = 0
const results = []
const labels = []
const FILTER = (process.env.VERIFY_FILTER || '').toLowerCase()
const LIST = process.argv.includes('--list')

const check = (label, actual, expected) => {
  if (FILTER && !label.toLowerCase().includes(FILTER)) {
    skipped += 1
    return
  }
  labels.push(label)
  if (LIST) return
  const ok = actual === expected
  if (!ok) failures += 1
  results.push({ ok, label, actual, expected })
}

/** 让挂起的 microtask（异步加密 / flush）跑完 */
const settle = async (n = 5) => {
  for (let i = 0; i < n; i++) await new Promise(resolve => setImmediate(resolve))
}

/**
 * 假时钟：只由 `advance()` 推进，定时器按到期顺序触发。
 * ⚠ 节流器的断言就是「什么时候写」，用真 setTimeout 会既慢又不稳。
 */
const makeClock = () => {
  let t = 1000
  let seq = 0
  const timers = new Map()
  return {
    now: () => t,
    setTimer: (fn, ms) => {
      const id = ++seq
      timers.set(id, { at: t + ms, fn })
      return id
    },
    clearTimer: id => timers.delete(id),
    advance: async ms => {
      const target = t + ms
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, v]) => v.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        timers.delete(due[0])
        t = due[1].at
        due[1].fn()
        await settle()
      }
      t = target
    },
    pending: () => timers.size
  }
}

// ================= 一、新格式（AES-GCM）=================
const sample = { name: '桂冈', level: 3, nested: { items: [1, 2, 3] }, 中文键: '值' }
const cipher = await encryptText(JSON.stringify(sample))
check('加密结果带 vux2: 前缀', String(cipher).startsWith(SAVE_FORMAT_V2), true)
check('密文不是明文（真的加了密）', cipher.includes('桂冈'), false)
check('加密→解密 = 原文', await decryptText(cipher), JSON.stringify(sample))
const cipher2 = await encryptText(JSON.stringify(sample))
check('同一份明文两次加密结果不同（IV 随机）', cipher === cipher2, false)
check('第二份也解得回原文', (await decryptText(cipher2)) === JSON.stringify(sample), true)
check('对象往返（encryptData / decryptData）', JSON.stringify(await decryptData(cipher)), JSON.stringify(sample))

// 跨分块的 base64（B64_CHUNK = 32KB）：200KB 中文，验证不从中间断掉
const big = { blob: '灵'.repeat(100000) }
const bigCipher = await encryptData(big)
const bigBack = await decryptData(bigCipher)
check('200KB 明文往返不丢字节', bigBack.blob.length, 100000)
check('200KB 明文往返内容一致', bigBack.blob === big.blob, true)

check('坏密文 → null（不抛）', await decryptText('vux2:不是base64!!'), null)
check('被截断的新格式 → null', await decryptText(cipher.slice(0, cipher.length - 8)), null)
check('空串 → null', await decryptText(''), null)
check('null → null', await decryptText(null), null)

// ================= 二、老档兼容（CryptoJS）=================
// 老档 = 换加密前写出来的密文，口令与格式都必须原样读得回来，
// 否则升级一次 P58 就把所有在线玩家的档清了。
const legacyCipher = CryptoJS.AES.encrypt(JSON.stringify(sample), 'vue-idle-xiuxian').toString()
check('老档密文没有 vux2: 前缀', legacyCipher.startsWith(SAVE_FORMAT_V2), false)
check('老档仍能解密', JSON.stringify(await decryptData(legacyCipher)), JSON.stringify(sample))
check('老档解密结果与内容一致', (await decryptData(legacyCipher)).name, '桂冈')
check(
  '老档口令写错 → null（不是脏数据）',
  await decryptData(CryptoJS.AES.encrypt('{}', 'wrong-passphrase').toString()),
  null
)

// 存档版本校验：换了加密格式**不升** SAVE_VERSION
check('SAVE_VERSION 仍是 3（换加密不动它）', SAVE_VERSION, 3)
check(
  'validateData 认得出缺字段',
  validateData({ name: 'x', level: 1 }),
  false
)
check(
  'validateData 认得出版本不符',
  validateData({
    name: 'x', level: 1, realm: '练气', cultivation: 0, maxCultivation: 10,
    spirit: 0, baseAttributes: {}, saveVersion: SAVE_VERSION - 1
  }),
  false
)
check(
  'validateData 接受完整档',
  validateData({
    name: 'x', level: 1, realm: '练气', cultivation: 0, maxCultivation: 10,
    spirit: 0, baseAttributes: {}, saveVersion: SAVE_VERSION
  }),
  true
)

// ================= 三、落盘节流 =================
check('节流窗口 = 5 秒', SAVE_INTERVAL_MS, 5000)

{
  // 首次调用：立刻写（lastWriteAt = -Infinity）
  const clock = makeClock()
  let writes = 0
  const s = createSaveScheduler({
    write: async () => { writes += 1 },
    now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer
  })
  await s.markDirty()
  check('第一次 saveData 立刻写盘', writes, 1)
  check('写完之后不再脏', s.isDirty(), false)
  check('无写入时 flush 不写', await s.flush().then(() => writes), 1)
}
{
  // 窗口内：只标脏 + 排一次定时器；到点才写
  const clock = makeClock()
  let writes = 0
  const s = createSaveScheduler({
    write: async () => { writes += 1 },
    now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer
  })
  await s.markDirty() // 第 1 次：立刻写
  await clock.advance(1000)
  await s.markDirty()
  await s.markDirty()
  await s.markDirty()
  check('1 秒内连调 3 次：一次都没写', writes, 1)
  check('窗口内被标脏', s.isDirty(), true)
  check('排了且只排了一个定时器', clock.pending(), 1)
  // 定时器锚在「上一次写盘 + 5 秒」= t=6000，现在是 t=2000
  await clock.advance(3999)
  check('还差 1ms 到窗口：仍未写', writes, 1)
  await clock.advance(1)
  check('满 5 秒：自动写一次', writes, 2)
  check('自动写完之后不脏', s.isDirty(), false)
  check('定时器已消费', clock.pending(), 0)
}
{
  // force 顶穿窗口（关页 / 切后台 / 读档收尾）
  const clock = makeClock()
  let writes = 0
  const s = createSaveScheduler({
    write: async () => { writes += 1 },
    now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer
  })
  await s.markDirty()
  await clock.advance(100)
  await s.markDirty({ force: true })
  check('force 在窗口内也立刻写', writes, 2)
  check('force 写完之后定时器被清掉', clock.pending(), 0)
}
{
  // 并发：写盘期间再标脏，不并排写第二份
  const clock = makeClock()
  let writes = 0
  let release = null
  const s = createSaveScheduler({
    write: () => { writes += 1; return new Promise(resolve => { release = resolve }) },
    now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer
  })
  const first = s.markDirty() // 进了 write，但没 resolve
  await settle()
  const second = s.markDirty({ force: true }) // 写盘还没结束
  await settle()
  check('写盘未结束时不并排写第二份', writes, 1)
  release()
  await first
  await second
  await settle()
  check('并发合并后总共只写了一次', writes, 1)
  check('写盘期间又被标脏 → 仍然脏（下个窗口再写）', s.isDirty(), true)
  check('写盘期间的脏会重新排定时器', clock.pending(), 1)
}
{
  // 写失败：保持脏，窗口过后自动重试
  const clock = makeClock()
  let writes = 0
  let fail = true
  const s = createSaveScheduler({
    write: async () => { writes += 1; if (fail) throw new Error('boom') },
    now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer
  })
  await s.markDirty()
  check('写失败：那一次算写过了', writes, 1)
  check('写失败后仍是脏的', s.isDirty(), true)
  fail = false
  await clock.advance(SAVE_INTERVAL_MS)
  check('窗口过后自动重试', writes, 2)
  check('重试成功后不脏', s.isDirty(), false)
}

// ---------- 输出 ----------
if (LIST) {
  for (const label of labels) console.log(`[LIST] ${label}`)
  console.log(`\n共 ${labels.length} 条断言${FILTER ? `（filter=${FILTER}）` : ''}`)
  process.exit(0)
}
const pad = (s, n) => String(s).padEnd(n)
const width = Math.max(...results.map(r => [...r.label].length)) + 2

console.log('\n存档加密 / 落盘节流断言（P58：AES-GCM 换格式 + 5 秒节流）\n')
for (const r of results) {
  const mark = r.ok ? '  ok  ' : ' FAIL '
  console.log(`[${mark}] ${pad(r.label, width)} ${r.actual}`)
}
console.log(`\n${results.length - failures}/${results.length} 通过`)
if (failures > 0) {
  console.error(`\n${failures} 条断言失败\n`)
  process.exit(1)
}
console.log('全部通过 ✅\n')
