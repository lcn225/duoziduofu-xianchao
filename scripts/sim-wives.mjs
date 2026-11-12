// 侍妾「填满期 / 锯齿」仿真（2026-11-12 口径，**不参与 npm run verify**）。
//
// 镜像 src/plugins/innerCourt.js：
//   p = 30%（凡女，未乘育龄系数）—— 好感 / 手动自动 / 奖励期都不参与
//   孕期 280 + 休养 234（由终身胎数 B=24 反推，见 `recoveryDaysOf`）；
//   奖励期只压孕期（前 5 个灵根子嗣 90/10，本脚本不计，误差集中在最早 5 胎）
//   每晚从 idle 里取 min(floor(体力/15), idle) 人；体力上限 145（`energyMaxOf` 白板值）
//
// 目的：回答「一个游戏月填满 36 人」「一波之后静默多久」「稳态一年几胎」。
// 用法：node scripts/sim-wives.mjs

const P = 0.3
const PREG = 280
// 休养期 = 育龄窗口(34 年) ÷ B(24) − 280 − 1/0.3 ≈ 234 天
const REC = 234
const PER = 15
const STAMINA = 145
const DAYS = 730

const makeRng = seed => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}

const simulate = ({ count, seed = 1 }) => {
  const rng = makeRng(seed)
  const wives = Array.from({ length: count }, () => ({ status: 'idle', end: 0, births: 0 }))
  const perNight = Math.min(Math.floor(STAMINA / PER), count)

  let firstWaveDay = null
  let conceptions = 0
  let drought = 0
  let maxDrought = 0
  let busyDays = 0

  for (let day = 0; day < DAYS; day++) {
    for (const w of wives) {
      if (w.status === 'pregnant' && day >= w.end) {
        w.status = 'recovering'
        w.end = day + REC
      } else if (w.status === 'recovering' && day >= w.end) {
        w.status = 'idle'
      }
    }
    const idle = wives.filter(w => w.status === 'idle')
    const picked = idle.slice(0, perNight)
    let hits = 0
    for (const w of picked) {
      if (rng() < P) {
        w.status = 'pregnant'
        w.end = day + PREG
        w.births++
        hits++
        conceptions++
      }
    }
    if (hits) {
      drought = 0
    } else {
      drought++
      maxDrought = Math.max(maxDrought, drought)
    }
    if (hits) busyDays++
    // 第一波：全员妊娠
    if (firstWaveDay === null && wives.every(w => w.status !== 'idle')) firstWaveDay = day + 1
  }

  return {
    count,
    perNight,
    firstWaveDay: firstWaveDay ?? '—',
    firstWaveBirths: wives.reduce((s, w) => s + w.births, 0),
    perYear: (conceptions / (DAYS / 365)).toFixed(1),
    maxDrought
  }
}

console.log('妾数  每夜留宿  全员妊娠(天)  平均胎/年  最长空窗(天)')
for (const count of [5, 12, 24, 36]) {
  const r = simulate({ count })
  console.log(
    String(r.count).padStart(4),
    String(r.perNight).padStart(8),
    String(r.firstWaveDay).padStart(12),
    String(r.perYear).padStart(10),
    String(r.maxDrought).padStart(12)
  )
}
