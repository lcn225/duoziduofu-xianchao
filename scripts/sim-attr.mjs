// 属性成长模型对照（2026-11-16，P25 / 零散 #10 讨论用）
//
// 一次性分析脚本，不参与游戏运行、不进 verify。
// 输出：design/new/2026-11-16 属性公式对照表.md + 同目录 HTML 曲线图。
//
// 三套模型：
//   A 现状  = 本体 × (1 + 0.12 × powerLevelOf(层)) + 实际五件套装备（段内最高阶）
//   B memo = 本体 × 大境界基数(1/3/9) × 小境界乘数 + memo 装备表（极品 15/18/22）
//   C 折中 = memo 本体公式 + 《装备系统》§四 原装备表（只换本体、装备不动）
//
// 本体基础值取存档初始：攻击 10 / 生命 100 / 防御 5 / 速度 10。
//
// 跑法：node scripts/sim-attr.mjs

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { powerLevelOf } from '../src/plugins/realm.js'
import { generateEquipment } from '../src/plugins/equipment.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'design', 'new')

const BASE = { attack: 10, health: 100, defense: 5, speed: 10 }
const SUB_MULT = [1.0, 1.1, 1.2, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0]
const REALM_INDEX = level => (level <= 10 ? 0 : level <= 20 ? 1 : 2)
const REALM_BASE = [1, 3, 9]
const subMulOf = level => SUB_MULT[(level - 1) % 10]

/** 段内最高可穿阶：练气 T2 / 筑基 T3 / 金丹 T4（offspringEquipment.SEGMENT_MAX_TIER） */
const GEAR_TIER = level => (level <= 10 ? 2 : level <= 20 ? 3 : 4)

// ---------- 现状：实际五件套 ----------
// 每件：白板 + 主属性（±15% 由 seed 决定，这里用固定 series 取一套代表性数值）+ 副属性，
// 无词条（withTraits:false）= 面板的保底值。成色不影响这个底子。
const SLOT_TYPES = [
  { slot: 'weapon', type: '剑' },
  { slot: 'body', type: '袍' },
  { slot: 'head', type: '冠' },
  { slot: 'accessory', type: '戒' },
  { slot: 'artifact', type: '幡' }
]

/** 饰品主属性是「攻击 / 防御」二选一，找一条 seed 落在攻击的 series，模拟攻击向配装 */
const findAttackSeries = () => {
  for (let i = 0; i < 200; i += 1) {
    const series = `attr-test-${i}`
    const stats = generateEquipment({ slot: 'accessory', type: '戒', tier: 1, series, withTraits: false }).stats
    if (stats.attack && !stats.defense) return series
  }
  return 'attr-test-0'
}
const SERIES = findAttackSeries()

const gearOfTier = tier => {
  const total = { attack: 0, health: 0, defense: 0 }
  for (const { slot, type } of SLOT_TYPES) {
    const { stats } = generateEquipment({ slot, type, tier, series: SERIES, withTraits: false })
    total.attack += stats.attack || 0
    total.health += stats.health || 0
    total.defense += stats.defense || 0
  }
  return {
    attack: Math.round(total.attack * 10) / 10,
    health: Math.round(total.health * 10) / 10,
    defense: Math.round(total.defense * 10) / 10
  }
}
const GEAR_BY_TIER = { 1: gearOfTier(1), 2: gearOfTier(2), 3: gearOfTier(3), 4: gearOfTier(4), 5: gearOfTier(5) }

// ---------- B / C 的装备表 ----------
/** memo §四：一阶极品 +15 / 二阶 +18 / 三阶 +22（普通 8/10/12） */
const MEMO_GEAR_BEST = [15, 18, 22]

const flatGear = value => ({ attack: value, health: value, defense: value, speed: 0 })

const models = {
  A: level => {
    const panel = 1 + 0.12 * powerLevelOf(level)
    const gear = GEAR_BY_TIER[GEAR_TIER(level)]
    return {
      attack: BASE.attack * panel + gear.attack,
      health: BASE.health * panel + gear.health,
      defense: BASE.defense * panel + gear.defense,
      gearAttack: gear.attack,
      gearHealth: gear.health
    }
  },
  B: level => {
    const panel = REALM_BASE[REALM_INDEX(level)] * subMulOf(level)
    const g = MEMO_GEAR_BEST[REALM_INDEX(level)]
    const gear = flatGear(g)
    return {
      attack: BASE.attack * panel + gear.attack,
      health: BASE.health * panel + gear.health,
      defense: BASE.defense * panel + gear.defense,
      gearAttack: gear.attack,
      gearHealth: gear.health
    }
  },
  C: level => {
    const panel = REALM_BASE[REALM_INDEX(level)] * subMulOf(level)
    const gear = GEAR_BY_TIER[GEAR_TIER(level)]
    return {
      attack: BASE.attack * panel + gear.attack,
      health: BASE.health * panel + gear.health,
      defense: BASE.defense * panel + gear.defense,
      gearAttack: gear.attack,
      gearHealth: gear.health
    }
  }
}

const LEVELS = [1, 5, 10, 11, 15, 20, 21, 25, 30]
const CIRCLE_LEVELS = LEVELS.filter(l => [1, 10, 11, 21, 30].includes(l))
const fmt = v => (Math.round(v * 10) / 10).toLocaleString('en-US', { maximumFractionDigits: 1 })
const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0)

const rows = LEVELS.map(level => {
  const out = { level }
  for (const key of ['A', 'B', 'C']) {
    const r = models[key](level)
    out[key] = {
      attack: r.attack,
      gearPct: pct(r.gearAttack, r.attack),
      health: r.health,
      healthGearPct: pct(r.gearHealth, r.health)
    }
  }
  return out
})

// ---------- 关键比值 ----------
const ratio = (m, a, b) => models[m](a).attack / models[m](b).attack
// 现状的本体乘区与 B/C 不同，单独给一条
const innateA = level => BASE.attack * (1 + 0.12 * powerLevelOf(level))
const innateBC = level => BASE.attack * REALM_BASE[REALM_INDEX(level)] * subMulOf(level)
const keyRatios = {
  A: { jump1: ratio('A', 11, 10), jump2: ratio('A', 21, 20), qiSlope: ratio('A', 10, 1), all: ratio('A', 30, 1) },
  B: { jump1: ratio('B', 11, 10), jump2: ratio('B', 21, 20), qiSlope: ratio('B', 10, 1), all: ratio('B', 30, 1) },
  C: { jump1: ratio('C', 11, 10), jump2: ratio('C', 21, 20), qiSlope: ratio('C', 10, 1), all: ratio('C', 30, 1) }
}
const innateRatios = {
  A: {
    jump1: innateA(11) / innateA(10),
    jump2: innateA(21) / innateA(20),
    qiSlope: innateA(10) / innateA(1),
    all: innateA(30) / innateA(1)
  },
  B: {
    jump1: innateBC(11) / innateBC(10),
    jump2: innateBC(21) / innateBC(20),
    qiSlope: innateBC(10) / innateBC(1),
    all: innateBC(30) / innateBC(1)
  }
}

// ---------- Markdown ----------
const md = []
md.push('# 2026-11-16 属性成长模型对照（P25 / 零散 #10）')
md.push('')
md.push('> 生成脚本：`node scripts/sim-attr.mjs`。数值只用于讨论，不改游戏。')
md.push('> 曲线图：同目录 `2026-11-16 属性公式对照图.html`（浏览器打开）。')
md.push('')
md.push('## 口径')
md.push('')
md.push('- 对象：桂冈。本体基础值取存档初始：**攻击 10 / 生命 100 / 防御 5 / 速度 10**（`stores/modules/attributes.js:39`）。')
md.push('- **A 现状**：`本体 × (1 + 0.12 × powerLevelOf(层))` + 实际五件套装备（段内最高可穿：练气 T2 / 筑基 T3 / 金丹 T4；普通成色、无词条，即面板保底值）。')
md.push('- **B memo**：`本体 × 大境界基数(1/3/9) × 小境界乘数(1.0~2.0)` + memo §四 装备表（极品 15/18/22；普通 8/10/12 未展示）。memo 只给了一个「装备数值」，这里按四条属性各加同样数值理解。')
md.push('- **C 折中**：同 B 的本体公式，装备**保留《装备系统》§四 原表**（几何 ×3/阶，段内最高可穿 T2/T3/T4）—— 即「只换本体公式、装备不动」。')
md.push('- 三套都**没有**算灵宠、炼体、词条、功法百分比——它们都是平加或乘区，不影响本表的形状对比。')
md.push('')
md.push('## 一、攻击')
md.push('')
md.push('| 层 | 境界 | A 现状 | A 装备占比 | B memo | B 装备占比 | C 折中 | C 装备占比 |')
md.push('|---:|---|---:|---:|---:|---:|---:|---:|')
const realmName = level => (level <= 10 ? `练气${level}层` : level <= 20 ? `筑基${level - 10}层` : `金丹${level - 20}层`)
for (const r of rows) {
  md.push(
    `| ${r.level} | ${realmName(r.level)} | ${fmt(r.A.attack)} | ${r.A.gearPct.toFixed(0)}% | ${fmt(r.B.attack)} | ${r.B.gearPct.toFixed(0)}% | ${fmt(r.C.attack)} | ${r.C.gearPct.toFixed(0)}% |`
  )
}
md.push('')
md.push('## 二、生命')
md.push('')
md.push('| 层 | A 现状 | A 装备占比 | B memo | B 装备占比 | C 折中 | C 装备占比 |')
md.push('|---:|---:|---:|---:|---:|---:|---:|')
for (const r of rows) {
  md.push(
    `| ${r.level} | ${fmt(r.A.health)} | ${r.A.healthGearPct.toFixed(0)}% | ${fmt(r.B.health)} | ${r.B.healthGearPct.toFixed(0)}% | ${fmt(r.C.health)} | ${r.C.healthGearPct.toFixed(0)}% |`
  )
}
md.push('')
md.push('## 三、关键比值')
md.push('')
md.push('**本体（不含装备）**')
md.push('')
md.push('| 指标 | A 现状 | B/C memo 结构 | 含义 |')
md.push('|---|---:|---:|---|')
md.push(`| 练气1 → 练气10 | ×${innateRatios.A.qiSlope.toFixed(2)} | ×${innateRatios.B.qiSlope.toFixed(2)} | 段内成长 |`)
md.push(`| 练气10 → 筑基1 | ×${innateRatios.A.jump1.toFixed(2)} | ×${innateRatios.B.jump1.toFixed(2)} | **大境界跳变** |`)
md.push(`| 筑基10 → 金丹1 | ×${innateRatios.A.jump2.toFixed(2)} | ×${innateRatios.B.jump2.toFixed(2)} | 大境界跳变 |`)
md.push(`| 练气1 → 金丹10 | ×${innateRatios.A.all.toFixed(1)} | ×${innateRatios.B.all.toFixed(1)} | 全程跨度 |`)
md.push('')
md.push('**总面板（本体 + 装备）**')
md.push('')
md.push('| 指标 | A 现状 | B memo | C 折中 | 含义 |')
md.push('|---|---:|---:|---:|---|')
md.push(`| 练气1 → 练气10 | ×${keyRatios.A.qiSlope.toFixed(2)} | ×${keyRatios.B.qiSlope.toFixed(2)} | ×${keyRatios.C.qiSlope.toFixed(2)} | 段内成长 |`)
md.push(`| 练气10 → 筑基1 | ×${keyRatios.A.jump1.toFixed(2)} | ×${keyRatios.B.jump1.toFixed(2)} | ×${keyRatios.C.jump1.toFixed(2)} | 大境界跳变 |`)
md.push(`| 筑基10 → 金丹1 | ×${keyRatios.A.jump2.toFixed(2)} | ×${keyRatios.B.jump2.toFixed(2)} | ×${keyRatios.C.jump2.toFixed(2)} | 大境界跳变 |`)
md.push(`| 练气1 → 金丹10 | ×${keyRatios.A.all.toFixed(1)} | ×${keyRatios.B.all.toFixed(1)} | ×${keyRatios.C.all.toFixed(1)} | 全程跨度 |`)
md.push('')
md.push('## 四、读表结论')
md.push('')
md.push(
  `1. **现状的本体大境界跳变 = ×${innateRatios.A.jump1.toFixed(2)}**（练气10 到筑基1），段内却有 ×${innateRatios.A.qiSlope.toFixed(2)}。` +
    `用户说的「突破没感觉」就是这条。总面板之所以还能跳 ×${keyRatios.A.jump1.toFixed(2)}，是**装备换阶**给的，不是本体。`
)
md.push(
  `2. **现状装备占攻击 ${Math.min(...rows.map(r => r.A.gearPct)).toFixed(0)}~${Math.max(...rows.map(r => r.A.gearPct)).toFixed(0)}%**，` +
    `生命 ${Math.min(...rows.map(r => r.A.healthGearPct)).toFixed(0)}~${Math.max(...rows.map(r => r.A.healthGearPct)).toFixed(0)}%。` +
    'memo 说「装备膨胀」属实，但根因是**本体几乎不涨**，装备只是被动地成了主角。'
)
md.push(
  `3. **memo 的装备表跟它自己的面板不匹配**：练气段装备占 ${rows.find(r => r.level === 10).B.gearPct.toFixed(0)}~${rows.find(r => r.level === 1).B.gearPct.toFixed(0)}%（太强），` +
    `金丹段只占 ${rows.find(r => r.level === 30).B.gearPct.toFixed(0)}~${rows.find(r => r.level === 21).B.gearPct.toFixed(0)}%（太弱）——` +
    '面板涨了 18 倍、装备只涨 1.5 倍。它自己的场景 3 只检查了金丹这一端。'
)
md.push(
  `4. **C（memo 本体 + §四 原装备）的装备占比稳定在 ${rows.find(r => r.level === 10).C.gearPct.toFixed(0)}~${rows.find(r => r.level === 1).C.gearPct.toFixed(0)}%**，` +
    '两者同比涨、不再随境界恶化；但**装备仍是主角**。这说明只要《装备系统》§四 不动，光换本体公式压不下装备占比——' +
    'memo 的 11% 必须靠重写 §四 的装备表才能拿到。'
)
md.push(
  '5. **B/C 的大境界跳变是 ×1.5，不等于 memo 说的「绝对碾压」**：按 memo 场景 2 自己的数，练气10 极品 35 vs 筑基1 普通 40 只赢 1.14 倍；' +
    '而筑基1 **白板（30）反而打不过练气10 极品（35）**——「绝对碾压」在对面不穿装备时不成立。' +
    '要真碾压，基数得接近小境界极差 2.0 以上；memo 为了装备保值把基数压到 3，这是它内部的第一处张力。'
)
md.push('')
md.push('> 注：A 的装备按「普通成色、无词条」算，是面板保底；实际带词条的装备占比只会更高。')
md.push('')
md.push('## 五、memo 没有回答、需要补的')
md.push('')
md.push('- 分属性基础值（memo 只给了一个「10」，实际生命是 100、防御是 5）。')
md.push('- 子嗣的灵根（2.0~0.8）、本命（1.0~2.0）、词条乘区留不留。')
md.push('- 灵兽是 5 阶、等级上限 = 桂冈层数（最高 31），不是 3 阶 / 20 级；灵兽面板平加进桂冈，新小面板下会压过本体。')
md.push('- 炼体满级平加 +720 血 / +72 防，小面板下占比过高，要重标。')
md.push('- 老档装备的 `stats` 烘死在存档里，重填白板只影响新装备，迁移与否要定。')

// ---------- HTML 图 ----------
const ALL_LEVELS = Array.from({ length: 30 }, (_, i) => i + 1)
const chartData = {
  levels: ALL_LEVELS,
  attack: {
    A: chartDataOf('A', 'attack'),
    B: chartDataOf('B', 'attack'),
    C: chartDataOf('C', 'attack')
  },
  gearPct: {
    A: chartDataOf('A', 'gearPct'),
    B: chartDataOf('B', 'gearPct'),
    C: chartDataOf('C', 'gearPct')
  },
  health: {
    A: chartDataOf('A', 'health'),
    B: chartDataOf('B', 'health'),
    C: chartDataOf('C', 'health')
  },
  healthGearPct: {
    A: chartDataOf('A', 'healthGearPct'),
    B: chartDataOf('B', 'healthGearPct'),
    C: chartDataOf('C', 'healthGearPct')
  }
}

function chartDataOf(model, key) {
  return ALL_LEVELS.map(level => {
    const r = models[model](level)
    return key === 'gearPct' ? r.gearAttack / r.attack : key === 'healthGearPct' ? r.gearHealth / r.health : r[key]
  })
}

const html = buildHtml(chartData)
writeFileSync(join(OUT_DIR, '2026-11-16 属性公式对照表.md'), md.join('\n') + '\n')
writeFileSync(join(OUT_DIR, '2026-11-16 属性公式对照图.html'), html)
console.log('wrote design/new/2026-11-16 属性公式对照表.md')
console.log('wrote design/new/2026-11-16 属性公式对照图.html')
console.log(JSON.stringify({ GEAR_BY_TIER, keyRatios }, null, 2))

// ---------------------------------------------------------------------------

function buildHtml(data) {
  const series = [
    { key: 'A', name: '现状（线性 +12%/层）', color: 'var(--series-1)' },
    { key: 'B', name: 'memo（基数 3，装备压平）', color: 'var(--series-2)' },
    { key: 'C', name: '折中（基数 3，装备保 §四 原表）', color: 'var(--series-3)' }
  ]
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>属性成长模型对照 · 2026-11-16</title>
<style>
  .viz-root {
    color-scheme: light;
    --surface-1: #fcfcfb;
    --page: #f9f9f7;
    --text-primary: #0b0b0b;
    --text-secondary: #52514e;
    --text-muted: #898781;
    --grid: #e1e0d9;
    --axis: #c3c2b7;
    --series-1: #2a78d6;
    --series-2: #eb6834;
    --series-3: #1baf7a;
    font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
    background: var(--page);
    color: var(--text-primary);
    margin: 0;
    padding: 32px;
  }
  @media (prefers-color-scheme: dark) {
    :root:where(:not([data-theme="light"])) .viz-root {
      color-scheme: dark;
      --surface-1: #1a1a19;
      --page: #0d0d0d;
      --text-primary: #f0efec;
      --text-secondary: #c3c2b7;
      --grid: #2c2c2a;
      --axis: #383835;
      --series-1: #3987e5;
      --series-2: #d95926;
      --series-3: #199e70;
    }
  }
  .viz-root h1 { font-size: 20px; margin: 0 0 4px; font-weight: 650; }
  .viz-root p.sub { margin: 0 0 24px; color: var(--text-secondary); font-size: 13px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(520px, 1fr)); gap: 24px; max-width: 1280px; }
  .card {
    background: var(--surface-1);
    border: 1px solid rgba(11,11,11,.10);
    border-radius: 12px;
    padding: 20px 20px 12px;
  }
  .card h2 { font-size: 14px; margin: 0 0 2px; font-weight: 650; }
  .card p.note { margin: 0 0 10px; font-size: 12px; color: var(--text-secondary); }
  .legend { display: flex; flex-wrap: wrap; gap: 16px; margin: 0 0 6px; font-size: 12px; color: var(--text-secondary); }
  .legend span { display: inline-flex; align-items: center; gap: 6px; }
  .legend i { width: 14px; height: 3px; border-radius: 2px; display: inline-block; }
  svg { width: 100%; height: auto; display: block; overflow: visible; }
  .tick { fill: var(--text-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  .axis-label { fill: var(--text-secondary); font-size: 11px; }
  .band { fill: var(--text-muted); opacity: .06; }
  .end-label { fill: var(--text-secondary); font-size: 11px; font-weight: 600; }
</style>
</head>
<body>
<div class="viz-root">
  <h1>属性成长模型对照 — 桂冈</h1>
  <p class="sub">本体基础值 攻击 10 / 生命 100。A/C 用《装备系统》§四 原表（段内最高可穿：练气 T2 / 筑基 T3 / 金丹 T4），B 用 memo 的压平装备表（极品 15/18/22）。未计灵宠、炼体、词条与功法。</p>
  <div class="cards">
    ${chartCard('攻击随等级', '三套模型的本体 + 装备合计攻击', 'attack', data, series, 'linear', 0)}
    ${chartCard('攻击的装备占比', '装备攻击 ÷ 总攻击；memo 的装备表在练气段偏强、金丹段偏弱', 'gearPct', data, series, 'linear', 1)}
    ${chartCard('生命随等级', '生命与攻击同形状，只是基数 100', 'health', data, series, 'linear', 0)}
    ${chartCard('生命的装备占比', '现状里生命装备占比同样随境界走高', 'healthGearPct', data, series, 'linear', 1)}
  </div>
</div>
<script>
  // 交叉线 + tooltip：hover 任意位置显示该等级三套模型的数值
  const VBW = 720, PADL = 48, PADR = 72
  document.querySelectorAll('svg[data-chart]').forEach(svg => {
    const tip = svg.parentElement.querySelector('.tip')
    const pts = JSON.parse(svg.dataset.values)
    const levels = JSON.parse(svg.dataset.levels)
    const isPct = svg.dataset.percent === '1'
    svg.addEventListener('mousemove', ev => {
      const rect = svg.getBoundingClientRect()
      const x = (ev.clientX - rect.left) / rect.width * VBW
      const idx = Math.max(0, Math.min(levels.length - 1, Math.round((x - PADL) / (VBW - PADL - PADR) * (levels.length - 1))))
      const rows = pts.map(s => '<div class="row"><i style="background:' + s.color + '"></i><span>' + s.name + '</span><b>' + (isPct ? (s.values[idx] * 100).toFixed(0) + '%' : fmt(s.values[idx])) + '</b></div>').join('')
      tip.innerHTML = '<div class="head">' + levelName(levels[idx]) + '</div>' + rows
      tip.style.opacity = '1'
      const tx = Math.min(Math.max(ev.clientX - rect.left + 12, 8), rect.width - tip.offsetWidth - 8)
      tip.style.transform = 'translate(' + tx + 'px,' + (ev.clientY - rect.top + 12) + 'px)'
    })
    svg.addEventListener('mouseleave', () => { tip.style.opacity = '0' })
  })
  function fmt(v) { return v >= 1000 ? Math.round(v).toLocaleString('en-US') : (Math.round(v * 10) / 10).toString() }
  function levelName(l) { return l <= 10 ? '练气 ' + l + ' 层' : l <= 20 ? '筑基 ' + (l - 10) + ' 层' : '金丹 ' + (l - 20) + ' 层' }
</script>
</body>
</html>`
}

function chartCard(title, note, key, data, series, scale, isPercent) {
  const W = 720
  const H = 320
  const pad = { l: 48, r: 72, t: 18, b: 34 }
  const plotW = W - pad.l - pad.r
  const plotH = H - pad.t - pad.b
  const levels = data.levels
  const all = series.flatMap(s => data[key][s.key])
  const maxY = Math.max(...all)
  const yMax = niceMax(isPercent ? 1 : maxY)
  const x = i => pad.l + (i / (levels.length - 1)) * plotW
  const y = v => pad.t + plotH - (v / yMax) * plotH
  const ticksY = 5
  const grid = Array.from({ length: ticksY + 1 }, (_, i) => {
    const v = (yMax / ticksY) * i
    return `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--grid)" stroke-width="1"/>
      <text class="tick" x="${pad.l - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${isPercent ? (v * 100).toFixed(0) + '%' : fmtAxis(v)}</text>`
  }).join('')
  // 大境界分隔（练气/筑基/金丹）
  const bands = [10, 20]
    .map(lv => {
      const bx = x(lv - 0.5)
      return `<line x1="${bx.toFixed(1)}" x2="${bx.toFixed(1)}" y1="${pad.t}" y2="${pad.t + plotH}" stroke="var(--axis)" stroke-width="1" stroke-dasharray="3 4"/>`
    })
    .join('')
  const bandLabels = ['练气', '筑基', '金丹']
    .map((name, i) => {
      const mid = x(i * 10 + 4.5)
      return `<text class="tick" x="${mid.toFixed(1)}" y="${(pad.t + 12).toFixed(1)}" text-anchor="middle" opacity=".8">${name}</text>`
    })
    .join('')
  const xTicks = [1, 5, 10, 15, 20, 25, 30]
    .map(lv => {
      const idx = levels.indexOf(lv)
      return `<text class="tick" x="${x(idx).toFixed(1)}" y="${H - 12}" text-anchor="middle">${lv}</text>`
    })
    .join('')
  // 末端直标；三条线靠得太近时上下错开，避免叠字
  const lastIdx = levels.length - 1
  const endLabels = series
    .map((s, i) => ({ s, i, v: data[key][s.key][lastIdx], y: y(data[key][s.key][lastIdx]) }))
    .sort((a, b) => a.y - b.y)
  for (let i = 1; i < endLabels.length; i += 1) {
    if (endLabels[i].y - endLabels[i - 1].y < 14) endLabels[i].y = endLabels[i - 1].y + 14
  }
  const paths = series.map(s => {
    const d = data[key][s.key].map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
    const lastV = data[key][s.key][lastIdx]
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${x(lastIdx).toFixed(1)}" cy="${y(lastV).toFixed(1)}" r="4" fill="${s.color}" stroke="var(--surface-1)" stroke-width="2"/>`
  }).join('')
  const endText = endLabels
    .map(
      e =>
        `<text class="end-label" x="${(x(lastIdx) + 9).toFixed(1)}" y="${(e.y + 4).toFixed(1)}">${isPercent ? (e.v * 100).toFixed(0) + '%' : fmtAxis(e.v)}</text>`
    )
    .join('')
  const legend = series.map(s => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join('')
  const values = JSON.stringify(series.map(s => ({ name: s.name, color: `var(${s.color.slice(4, -1)})`, values: data[key][s.key] })))
  return `<div class="card">
    <h2>${title}</h2>
    <p class="note">${note}</p>
    <div class="legend">${legend}</div>
    <div style="position:relative">
      <svg data-chart="${key}" data-percent="${isPercent ? 1 : 0}" data-values='${values.replace(/'/g, '&#39;')}' data-levels='${JSON.stringify(levels)}' viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">
        ${bands}${grid}${bandLabels}
        <line x1="${pad.l}" x2="${W - pad.r}" y1="${pad.t + plotH}" y2="${pad.t + plotH}" stroke="var(--axis)" stroke-width="1"/>
        ${xTicks}
        ${paths}
        ${endText}
      </svg>
      <div class="tip" style="position:absolute;top:0;left:0;opacity:0;pointer-events:none;background:var(--surface-1);border:1px solid rgba(11,11,11,.12);border-radius:8px;padding:8px 10px;font-size:12px;box-shadow:0 4px 16px rgba(0,0,0,.12);min-width:180px"></div>
    </div>
    <style>
      .tip .head { font-weight: 650; margin-bottom: 4px; color: var(--text-primary); }
      .tip .row { display: flex; align-items: center; gap: 6px; color: var(--text-secondary); margin-top: 2px; }
      .tip .row i { width: 10px; height: 3px; border-radius: 2px; display: inline-block; }
      .tip .row b { margin-left: auto; color: var(--text-primary); font-variant-numeric: tabular-nums; }
    </style>
  </div>`
}

function niceMax(v) {
  if (v <= 0) return 1
  const mag = Math.pow(10, Math.floor(Math.log10(v)))
  const norm = v / mag
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10
  return step * mag
}
function fmtAxis(v) {
  if (v >= 10000) return Math.round(v / 1000) + 'k'
  if (v >= 1000) return (Math.round(v / 100) / 10) + 'k'
  return Math.round(v).toString()
}
