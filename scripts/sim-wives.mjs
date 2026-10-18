// 侍妾供给 / 怀孕周期的粗略仿真（设计分析工具，**不参与 npm run verify**）。
// 用法：node scripts/sim-wives.mjs
// 规则镜像 src/plugins/innerCourt.js（2026-10-18 返工后）：
//   chance = (0.1×pregCoef + affinity×0.001) × 0.6 − 0.05(auto)
//   无疲劳惩罚、无怀孕保底
//   孕育 90 天 + 产后 10 天；每晚按 relation 规则从 idle 里取前 n 位
//   自动模式挑人上限 = floor((体力 − 30) / 15)（30 是节奏预留，不再影响受孕率）

const DAYS = 5000
const WARMUP = 500
const P = { base: 0.1, scale: 0.6, affScale: 0.001, affCap: 0.1, autoPenalty: 0.05, days: 90, recovery: 10 }
const PER = 15
const RESERVE = 30

const makeRng = seed => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}

const presetAffinity = [85, 72, 45, 68, 55, 60, 50, 70]

const makeWives = (count, rng) => {
  const wives = presetAffinity.map(a => ({ affinity: a }))
  for (let i = wives.length; i < count; i += 1) {
    // 抽奖凡女：P1~P3 权重 55/30/15，好感 30~60；P1-P6 的 pregCoef 都是 1.0
    wives.push({ affinity: 30 + Math.floor(rng() * 31) })
  }
  return wives.map(w => ({ ...w, status: 'idle', end: 0, children: 0 }))
}

const simulate = ({ count = 8, stamina = 84.5, base = P.base, scale = P.scale, days = P.days, seed = 1 }) => {
  const rng = makeRng(seed)
  const wives = makeWives(count, rng)
  let idleSum = 0
  let emptyNights = 0
  let interactionSum = 0
  let conceptions = 0
  let maxDrought = 0
  let drought = 0
  let observed = 0
  for (let day = 0; day < DAYS; day += 1) {
    // 先处理到期
    for (const w of wives) {
      if (w.status === 'pregnant' && day >= w.end) { w.status = 'recovering'; w.end = day + P.recovery }
      else if (w.status === 'recovering' && day >= w.end) w.status = 'idle'
    }
    const idle = wives.filter(w => w.status === 'idle')
    const max = Math.floor(Math.max(stamina - RESERVE, 0) / PER)
    const picked = [...idle].sort((a, b) => b.affinity - a.affinity).slice(0, max)
    // 只有 idle 的人参与判孕
    const fertile = picked.filter(w => w.status === 'idle')
    for (const w of fertile) {
      const positive = (base + Math.min(P.affCap, w.affinity * P.affScale)) * scale
      const chance = Math.max(0, Math.min(1, positive - P.autoPenalty))
      if (rng() < chance) {
        w.status = 'pregnant'
        w.end = day + days
        w.children += 1
        conceptions += 1
      }
    }
    if (day >= WARMUP) {
      observed += 1
      idleSum += idle.length
      interactionSum += picked.length
      if (picked.length === 0) { emptyNights += 1; drought += 1; maxDrought = Math.max(maxDrought, drought) }
      else drought = 0
    }
  }
  return {
    count,
    avgIdle: (idleSum / observed).toFixed(2),
    emptyPct: ((emptyNights / observed) * 100).toFixed(1) + '%',
    avgInteractions: (interactionSum / observed).toFixed(2),
    conceptionsPer100Days: ((conceptions / (DAYS - WARMUP)) * 100).toFixed(1),
    maxDroughtDays: maxDrought
  }
}

const rows = []
rows.push(['8 位 / 默认日(3 次)', simulate({ count: 8 })])
rows.push(['8 位 / 体力拉满(7 次)', simulate({ count: 8, stamina: 145 })])
rows.push(['12 位 / 默认日', simulate({ count: 12 })])
rows.push(['16 位 / 默认日', simulate({ count: 16 })])
rows.push(['24 位 / 默认日', simulate({ count: 24 })])
rows.push(['36 位 / 默认日', simulate({ count: 36 })])
rows.push(['8 位 / 孕育 45 天', simulate({ count: 8, days: 45 })])
rows.push(['16 位 / 孕育 45 天', simulate({ count: 16, days: 45 })])
rows.push(['8 位 / 只乘基础 6%（旧 §5.5 口径）', simulate({ count: 8, base: 0.06, scale: 1 })])

console.log('方案'.padEnd(34), '平均闲置', '空夜%', '每夜互动', '每百天受孕', '最长空窗')
for (const [label, r] of rows) {
  console.log(
    label.padEnd(30),
    String(r.avgIdle).padStart(6),
    String(r.emptyPct).padStart(7),
    String(r.avgInteractions).padStart(7),
    String(r.conceptionsPer100Days).padStart(9),
    String(r.maxDroughtDays).padStart(7)
  )
}
