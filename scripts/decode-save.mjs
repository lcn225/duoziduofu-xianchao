// 存档解码 / 体检工具（手动用，不在 verify 里跑）
//
//   node scripts/decode-save.mjs <存档文件>              # 打印修炼相关摘要
//   node scripts/decode-save.mjs <存档文件> --raw        # 打印完整明文 JSON（很大，慎用）
//   node scripts/decode-save.mjs <存档文件> --path=a.b.c # 只打印某个字段
//
// 加密口径与 src/plugins/crypto.js 同步：vux2: + base64(iv12 + AES-GCM 密文)。
// 解不开时先确认文件确实是 vux2: 开头，或口令/盐有没有改。
import fs from 'node:fs'
import path from 'node:path'
import CryptoJS from 'crypto-js'

const PASSPHRASE = 'vue-idle-xiuxian'
const KDF_SALT = 'vue-idle-xiuxian/v2'
const KDF_ITERATIONS = 120000
const IV_BYTES = 12
const PREFIX = 'vux2:'

const [fileArg, ...flags] = process.argv.slice(2)
if (!fileArg) {
  console.error('用法：node scripts/decode-save.mjs <存档文件> [--raw|--path=a.b.c]')
  process.exit(1)
}
const flag = name => {
  const hit = flags.find(f => f === `--${name}` || f.startsWith(`--${name}=`))
  if (!hit) return null
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true
}

const subtle = globalThis.crypto.subtle
const deriveKey = async () => {
  const base = await subtle.importKey('raw', new TextEncoder().encode(PASSPHRASE), 'PBKDF2', false, ['deriveKey'])
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: new TextEncoder().encode(KDF_SALT), iterations: KDF_ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )
}

const decryptSave = async file => {
  const enc = fs.readFileSync(file, 'utf8').trim()
  if (!enc.startsWith(PREFIX)) {
    // 老档：CryptoJS（与 src/plugins/crypto.js 同一口令）
    const plain = CryptoJS.AES.decrypt(enc, PASSPHRASE).toString(CryptoJS.enc.Utf8)
    if (!plain) throw new Error('不是 vux2 格式存档，CryptoJS 也解不开（口令/文件坏了？）')
    return JSON.parse(plain)
  }
  const packed = Buffer.from(enc.slice(PREFIX.length), 'base64')
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv: packed.subarray(0, IV_BYTES) }, await deriveKey(), packed.subarray(IV_BYTES))
  return JSON.parse(Buffer.from(plain).toString('utf8'))
}

const pick = (obj, dotPath) => dotPath.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj)

const summarize = j => ({
  name: j.name,
  level: j.level,
  realm: j.realm,
  cultivation: `${j.cultivation} / ${j.maxCultivation}`,
  bodyLevel: j.bodyLevel,
  bodyRealm: j.bodyRealm,
  isGMMode: j.isGMMode,
  spirit: j.spirit,
  spiritRate: j.spiritRate,
  cultivationRate: j.cultivationRate,
  luck: j.luck,
  totalCultivationTime: j.totalCultivationTime,
  clockGameTime: j.clockGameTime,
  gameDays: +(j.clockGameTime / 86400).toFixed(1),
  breakthroughCount: j.breakthroughCount,
  lastOnlineRealMs: j.lastOnlineRealMs,
  lastOnlineLocal: new Date(j.lastOnlineRealMs).toString(),
  currency: j.currency,
  spiritLand: j.practice?.spiritLand,
  fateActive: j.practice?.fateItems?.active,
  fateOwned: j.practice?.fateItems?.owned,
  qiArts: j.practice?.qiArts,
  activePath: j.practice?.activePath,
  dayLoop: j.dayLoop && {
    patrolHours: j.dayLoop.patrolHours,
    settings: j.dayLoop.settings,
    task: j.dayLoop.task
  },
  idleMode: j.idleMode,
  childrenAlive: (j.offspring?.list || []).filter(o => o && o.status !== 'passed_away' && !o.fallen).length,
  childrenTotal: (j.offspring?.list || []).length,
  faction: j.faction && { rank: j.faction.rank, contribution: j.faction.contribution, withdrawable: j.faction.withdrawable },
  estate: j.estate && { buildings: Array.isArray(j.estate.builds) ? j.estate.builds.map(b => `${b.id}:Lv${b.level}`) : j.estate.builds },
  activeEffects: j.activeEffects
})

const main = async () => {
  if (flag('timeline')) {
    const rows = []
    for (const file of [fileArg, ...flags.filter(f => !f.startsWith('--'))]) {
      const j = await decryptSave(file)
      rows.push({
        file: path.basename(file),
        realLocal: Number.isFinite(j.lastOnlineRealMs) ? new Date(j.lastOnlineRealMs).toISOString() : '-',
        realm: j.realm,
        level: j.level,
        cultivation: `${j.cultivation}/${j.maxCultivation}`,
        clockDays: +(j.clockGameTime / 86400).toFixed(1),
        totalCultivationTime: j.totalCultivationTime,
        breakthroughs: j.breakthroughCount,
        spiritRate: +(j.spiritRate || 0).toFixed(2),
        factionContrib: j.faction?.contribution ?? 0
      })
    }
    console.table(rows)
    return
  }
  const save = await decryptSave(fileArg)
  const dotPath = flag('path')
  if (dotPath) {
    const paths = String(dotPath).split(',')
    console.log(JSON.stringify(Object.fromEntries(paths.map(p => [p, pick(save, p)])), null, 2))
    return
  }
  if (flag('raw')) {
    const out = path.join('save', '.decoded.json')
    fs.writeFileSync(out, JSON.stringify(save))
    console.log(`明文已写入 ${out}`)
    return
  }
  console.log(JSON.stringify(summarize(save), null, 2))
}

main().catch(error => {
  console.error('解码失败：', error.message)
  process.exit(1)
})
