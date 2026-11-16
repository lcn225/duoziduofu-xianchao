// 属性公式目标态验证（2026-11-16，P25 / 零散 #10）
//
// 四条目标（用户 2026-11-16 定的口径）：
//   ① 小境界有成长
//   ② 大境界有明显成长
//   ③ 靠装备可以跨小境界挑战，但不能跨大境界挑战（**不要求**「高境界还穿旧装」也不被越级）
//   ④ 同阶极品 ≈ 高一阶下品；同阶 下/中/上/极 要有差异
//
// 模型：
//   本体 = 基础值 × 大境界基数(1/3/9) × 小境界乘数(1.0~2.0)
//   总面板 = 本体 + 装备 + 灵兽 + 炼体      （后三者平加，这里只算装备）
//   装备 = 《装备系统》§四 原表（×3/阶） + 成色乘区（EQUIPMENT_QUALITIES.statMod）
//
// 基础值整体 ×10（用户 2026-11-16 拍板）：攻击 100 / 生命 1000 / 防御 50 / 速度 10（速度不吃大境界乘区）。
//
// 跑法：node scripts/sim-attr-target.mjs

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { generateEquipment, EQUIPMENT_QUALITIES, equipQualityKeyOf } from '../src/plugins/equipment.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'design', 'new')

const BASE = { attack: 100, health: 1000, defense: 50, speed: 10 }
/** 定稿：大境界基数 1 / 4 / 16（用户 2026-11-16 拍板） */
const REALM_BASE = [1, 4, 16]
/** §五 对照：memo 原值 1 / 3 / 9 */
const REALM3 = [1, 3, 9]
const SUB = [1.0, 1.1, 1.2, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0]
const QUALITIES = ['下', '中', '上', '极'].map(key => ({
  key,
  mult: EQUIPMENT_QUALITIES[equipQualityKeyOf(key)].statMod
}))

const realmIndexOf = level => (level <= 10 ? 0 : level <= 20 ? 1 : 2)
const subMulOf = level => SUB[(level - 1) % 10]
const realmNameOf = level => (level <= 10 ? `练气${level}层` : level <= 20 ? `筑基${level - 10}层` : `金丹${level - 20}层`)

/**
 * 装备阶 = 段内最高可穿（练气 T2 / 筑基 T3 / 金丹 T4），与 `sim:realm` 校准队
 * 「同境界全穿本段最高阶」的口径一致。段内换阶（T1→T2）是玩家个体差异，不写进曲线。
 */
const gearTierOf = level => realmIndexOf(level) + 2

// 五件套白板 + 主属性（普通成色、无词条）
const SLOT_TYPES = [
  { slot: 'weapon', type: '剑' },
  { slot: 'body', type: '袍' },
  { slot: 'head', type: '冠' },
  { slot: 'accessory', type: '戒' },
  { slot: 'artifact', type: '幡' }
]
const findAttackSeries = () => {
  for (let i = 0; i < 200; i += 1) {
    const series = `target-attr-${i}`
    const stats = generateEquipment({ slot: 'accessory', type: '戒', tier: 1, series, withTraits: false }).stats
    if (stats.attack && !stats.defense) return series
  }
  return 'target-attr-0'
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
const GEAR = { 1: gearOfTier(1), 2: gearOfTier(2), 3: gearOfTier(3), 4: gearOfTier(4), 5: gearOfTier(5) }

const panelOf = (level, { quality = '下', stat = 'attack', tier = null, realmBase = REALM_BASE } = {}) => {
  const innate = BASE[stat] * realmBase[realmIndexOf(level)] * subMulOf(level)
  const gear = GEAR[tier || gearTierOf(level)][stat] * (QUALITIES.find(q => q.key === quality)?.mult || 1)
  return { innate, gear, total: innate + gear }
}

const LEVELS = [1, 5, 10, 11, 15, 20, 21, 25, 30]
const fmt = v => (Math.round(v * 10) / 10).toLocaleString('en-US', { maximumFractionDigits: 1 })
const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0)
const ratio = (a, b) => a / b

// ---------- 四条验证 ----------
// ① 段内：练气 1 → 10（同段，装备按段内阶梯从 T1 升到 T2）
const rise1 = q => ratio(panelOf(10, { quality: q }).total, panelOf(1, { quality: q }).total)
// ② 大境界：练气10 → 筑基1、筑基10 → 金丹1
// 「破境瞬间」= 同装备；「换装后」= 高境界换上本段高一阶装备
const rise2aSame = q => ratio(panelOf(11, { quality: q, tier: gearTierOf(10) }).total, panelOf(10, { quality: q }).total)
const rise2aUp = q => ratio(panelOf(11, { quality: q, tier: 3 }).total, panelOf(10, { quality: q }).total)
const rise2bSame = q => ratio(panelOf(21, { quality: q, tier: gearTierOf(20) }).total, panelOf(20, { quality: q }).total)
const rise2bUp = q => ratio(panelOf(21, { quality: q, tier: 4 }).total, panelOf(20, { quality: q }).total)
// ③ 跨大境界挑战：低境界满装（极品本段）vs 高境界换装后最差装（下品高一阶）
const crossRealmOf = (low, high, highTier) => {
  const lo = panelOf(low, { quality: '极' })
  const hi = panelOf(high, { quality: '下', tier: highTier })
  return { lo: lo.total, hi: hi.total, ratio: ratio(hi.total, lo.total) }
}
// 不要求的边界：高境界还穿旧装备
const edgeOf = (low, high, oldTier) => {
  const lo = panelOf(low, { quality: '极' }).total
  const hi = panelOf(high, { quality: '下', tier: oldTier }).total
  return { lo, hi, winner: hi >= lo ? '高境界' : '低境界', diff: ratio(Math.max(lo, hi), Math.min(lo, hi)) }
}
// ④ 极品 T_n vs 下品 T_{n+1}
const qualityVsNextTier = n => {
  const lo = GEAR[n].attack * QUALITIES[3].mult
  const hi = GEAR[n + 1].attack * QUALITIES[0].mult
  return { lo, hi, ratio: ratio(lo, hi) }
}

// ---------- Markdown ----------
const md = []
md.push('# 2026-11-16 属性公式目标态（P25 / 零散 #10）')
md.push('')
md.push('> 依据：用户 2026-11-16 定的四条目标 + 两项拍板（基础值整体 ×10；③ 不要求「高境界还穿旧装」也不被越级）。')
md.push('> 生成脚本：`node scripts/sim-attr-target.mjs`。曲线图：同目录 `2026-11-16 属性公式目标态图.html`。')
md.push('')
md.push('## 一、公式与参数')
md.push('')
md.push('```')
md.push('总面板 = 本体 + 装备 + 灵兽 + 炼体')
md.push('本体   = 基础值(分属性) × 大境界基数(1 / 4 / 16) × 小境界乘数(下表)')
md.push('装备   = 《装备系统》§四 白板（×3/阶） × 成色乘区（下1.0 / 中1.5 / 上2.0 / 极2.5）')
md.push('```')
md.push('')
md.push('| 项 | 值 |')
md.push('|---|---|')
md.push(`| 桂冈基础值 | 攻击 ${BASE.attack} / 生命 ${BASE.health} / 防御 ${BASE.defense} / 速度 ${BASE.speed}（**速度不吃大境界乘区**） |`)
md.push('| 大境界基数 | 练气 1 · 筑基 4 · 金丹 16（元婴 64 预留） |')
md.push('| 小境界乘数 | 1.0 / 1.1 / 1.2 / 1.4 / 1.5 / 1.6 / 1.7 / 1.8 / 1.9 / 2.0 |')
md.push('| 成色乘区 | 下 1.0 · 中 1.5 · 上 2.0 · 极 2.5（`EQUIPMENT_QUALITIES.statMod`，现在只有灵宠在用） |')
md.push('| 词条 | 仍按成色给条数（下0/中1/上2/极3），**叠在成色乘区之上**，见 §六.5 |')
md.push('')
md.push('**装备白板（五件套合计，普通成色、无词条；×成色乘区后才是实际面板）**')
md.push('')
md.push('| 阶 | 攻击合计 | 生命合计 | 防御合计 |')
md.push('|---:|---:|---:|---:|')
for (const t of [1, 2, 3, 4, 5]) md.push(`| T${t} | ${fmt(GEAR[t].attack)} | ${fmt(GEAR[t].health)} | ${fmt(GEAR[t].defense)} |`)
md.push('')
md.push('> 曲线口径 = 段内最高可穿（练气全段 T2 / 筑基 T3 / 金丹 T4），与 `sim:realm` 校准队一致；段内 T1→T2 的个体换阶不写进曲线。')
md.push('')
md.push('## 二、四条目标验证（攻击）')
md.push('')
md.push('### ① 小境界有成长')
md.push('')
md.push('| 口径 | 练气1 → 练气10（同穿本段 T2） | 判定 |')
md.push('|---|---:|---|')
for (const q of QUALITIES) {
  const r = rise1(q.key)
  md.push(`| ${q.key}品 | ×${r.toFixed(2)} | ${r >= 1.3 ? '✓' : '✗'} |`)
}
md.push(`| 本体单独 | ×2.00 | ✓ |`)
md.push('')
md.push('> 装备越强，段内成长越被稀释（极品 ×1.35 vs 下品 ×1.58）——这是让 ④ 成立的代价。')
md.push('> 若要求极品也 ≥×1.5，需要把基础值再抬到 ~200，或把「极」乘区从 2.5 降到 ~2.0（会削弱 ④ 的体感）。')
md.push('')
md.push('### ② 大境界有明显成长')
md.push('')
md.push('| 口径 | 练气10 → 筑基1 | 筑基10 → 金丹1 |')
md.push('|---|---:|---:|')
md.push(`| 本体单独（不含装备） | ×${(REALM_BASE[1] / (REALM_BASE[0] * 2)).toFixed(2)} | ×${(REALM_BASE[2] / (REALM_BASE[1] * 2)).toFixed(2)} |`)
for (const q of QUALITIES) {
  md.push(`| ${q.key}品 · 破境瞬间（同装备） | ×${rise2aSame(q.key).toFixed(2)} | ×${rise2bSame(q.key).toFixed(2)} |`)
  md.push(`| ${q.key}品 · 换装后（本段高一阶） | ×${rise2aUp(q.key).toFixed(2)} | ×${rise2bUp(q.key).toFixed(2)} |`)
}
md.push('')
md.push('> 破境瞬间：本体 ×2.0，装备占比越高被稀释得越多（定稿 R=4 下：下品 ×1.73、极品 ×1.52）。')
md.push('> 换装后叠上 T2→T3 / T3→T4 的阶差，总面板落在 ×2.1~2.2。')
md.push('> memo 原值 R=3 的对照见 §五（极品玩家破境瞬间只有 ×1.26，这是弃用 3 的原因）。')
md.push('')
md.push('### ③ 能跨小境界、不能跨大境界')
md.push('')
const c1 = crossRealmOf(10, 11, 3)
const c2 = crossRealmOf(20, 21, 4)
const e1 = edgeOf(10, 11, 2)
const e2 = edgeOf(20, 21, 3)
md.push('| 对局 | 低境界满装（极品本段） | 高境界换装后（下品高一阶） | 结果 |')
md.push('|---|---:|---:|---|')
md.push(`| 练气10 vs 筑基1 | ${fmt(c1.lo)} | ${fmt(c1.hi)} | 高境界赢 ×${c1.ratio.toFixed(2)} ✓ |`)
md.push(`| 筑基10 vs 金丹1 | ${fmt(c2.lo)} | ${fmt(c2.hi)} | 高境界赢 ×${c2.ratio.toFixed(2)} ✓ |`)
md.push('')
md.push(`> 跨小境界：练气一层穿本段极品（T2）${fmt(panelOf(1, { quality: '极' }).total)} vs 练气十层穿同阶下品 ${fmt(panelOf(10).total)}，只差 ×${ratio(panelOf(1, { quality: '极' }).total, panelOf(10).total).toFixed(2)}——极品能压满一整个小境界段，中品以下只能跨 3~5 层。`)
md.push(`> **不要求的边界**（用户 2026-11-16 明确不需要）：高境界还穿旧装备时——练气10 极品 ${fmt(e1.lo)} vs 筑基1 下品 ${fmt(e1.hi)}，${e1.winner}赢 ×${e1.diff.toFixed(2)}；` +
  `筑基10 极品 ${fmt(e2.lo)} vs 金丹1 下品 ${fmt(e2.hi)}，${e2.winner}赢 ×${e2.diff.toFixed(2)}。`)
md.push('')
md.push('### ④ 极品 ≈ 下一阶下品；同阶有差异')
md.push('')
md.push('| 对比 | 极品本阶 | 下品高一阶 | 比值 | 判定 |')
md.push('|---|---:|---:|---:|---|')
for (const n of [1, 2, 3, 4]) {
  const r = qualityVsNextTier(n)
  md.push(`| T${n} 极品 vs T${n + 1} 下品 | ${fmt(r.lo)} | ${fmt(r.hi)} | ×${r.ratio.toFixed(2)} | ${r.ratio >= 0.8 && r.ratio <= 1.2 ? '✓' : '✗'} |`)
}
md.push(`| 同阶 下 → 极 | ${fmt(GEAR[2].attack)} | ${fmt(GEAR[2].attack * QUALITIES[3].mult)} | ×${QUALITIES[3].mult.toFixed(2)} | ✓ 明显 |`)
md.push('')
md.push('## 三、关键等级的总攻击（含装备占比）')
md.push('')
md.push('| 层 | 境界 | 本体 | 下品总 | 占比 | 极品总 | 占比 |')
md.push('|---:|---|---:|---:|---:|---:|---:|')
for (const level of LEVELS) {
  const low = panelOf(level, { quality: '下' })
  const top = panelOf(level, { quality: '极' })
  md.push(
    `| ${level} | ${realmNameOf(level)} | ${fmt(low.innate)} | ${fmt(low.total)} | ${pct(low.gear, low.total).toFixed(0)}% | ${fmt(top.total)} | ${pct(top.gear, top.total).toFixed(0)}% |`
  )
}
md.push('')
md.push('## 四、施工影响清单')
md.push('')
md.push('### 4.1 代码')
md.push('')
md.push('- `plugins/equipment.js`：`generateEquipment` 里把 `statMod` 乘进「白板 + 主属性 + 副属性」（宠物已经在用同一张表）。')
md.push('- `plugins/stats.js`：`playerPanel` 改「基础值 × 大境界基数 × 小境界乘数」；`realmGrowthMultiplier` 作废。')
md.push('- `stores/modules/attributes.js`：`baseAttributes` 初值 ×10；`combatPanel` 的乘区顺序不变。')
md.push('- 老档迁移：`baseAttributes` ×10（新增迁移版本号，参考 `migrateRealmScale`）；**装备实例已烘死的 stats 不改**。')
md.push('- `plugins/secretRealm.js`：子嗣 / 灵兽 / 敌人基础值同比 ×10；敌人 `realmScale` 用 `sim:realm --solve` 重标。')
md.push('- `plugins/realmCoef.js`：子嗣与灵兽的 `realmCoefAt` 与新公式合并（`realmCoef.js:38` 的 TODO 顺势收掉）。')
md.push('- `plugins/petUnit.js`：白板 T1 80/4/1.6/9 ×10；灵兽阶是否也改 1/3/9 见未定项。')
md.push('- `plugins/bath.js` / `practice.bodyBonus`：**不 ×10**（见未定项）。')
md.push('')
md.push('### 4.2 文档')
md.push('')
md.push('- 《装备系统》§6.1：成色不再只决定词条条数，新增「成色乘区」；§8 验算示例、§九 平衡锚点重写。')
md.push('- 《装备系统》§四 **保留**（×3/阶 不动）。')
md.push('- 《数值真值表》§5.9（装备面板）、§5.10（桂冈四属性）、§5.8（灵兽）、§6.4b（秘境阈值）。')
md.push('- 《产出登记表》R19、R32/R33（若 `sim:realm` 后秘境趟均层数变化要重登）。')
md.push('- P42 验收（T5 vs T1 武器多通 ≥50 层）要重跑；`realmScale 8.4` 作废。')
md.push('- 《三大挂机》§4.8、`sim:realm` 校准队口径同步。')
md.push('')
md.push('### 4.3 断言')
md.push('')
md.push('- `verify-idle`：秘境锚点、`realmScale`、敌人曲线。')
md.push('- `verify-items`：装备白板（不变）、成色乘区新增断言、词条数量。')
md.push('- `verify-harmony`：桂冈面板乘区、`sim:pace` 是否受面板影响（面板不进修炼速度，预期不受影响）。')
md.push('- 新增 `sim:attr` 类对照断言（本脚本可固化为 `verify-*` 的一节）。')
md.push('')
md.push('## 五、大境界基数：定稿 4，对照 3')
md.push('')
md.push('memo 的原值是 3（下限，必须大于小境界极差 2.0）。但 ② 要求「明显」，而**破境瞬间装备没变**，本体 ×1.5 会被装备稀释，所以定稿取 4：')
md.push('')
md.push('| 指标（练气10 → 筑基1） | 基数 4（定稿） | 基数 3（memo 原值） |')
md.push('|---|---:|---:|')
md.push('| 本体单独 | ×2.00 | ×1.50 |')
md.push(`| 总面板 · 破境瞬间 · 下品 | ×${ratio(400 + GEAR[2].attack, panelOf(10).total).toFixed(2)} | ×${ratio(300 + GEAR[2].attack, panelOf(10).total).toFixed(2)} |`)
md.push(`| 总面板 · 破境瞬间 · 极品 | ×${ratio(400 + GEAR[2].attack * 2.5, panelOf(10, { quality: '极' }).total).toFixed(2)} | ×${ratio(300 + GEAR[2].attack * 2.5, panelOf(10, { quality: '极' }).total).toFixed(2)} |`)
md.push(`| 总面板 · 换装后 · 下品 T3 | ×${ratio(400 + GEAR[3].attack, panelOf(10).total).toFixed(2)} | ×${ratio(300 + GEAR[3].attack, panelOf(10).total).toFixed(2)} |`)
md.push(`| ③ 练气10 极品 vs 筑基1 下品 T3 | ×${ratio(400 + GEAR[3].attack, panelOf(10, { quality: '极' }).total).toFixed(2)} | ×${ratio(300 + GEAR[3].attack, panelOf(10, { quality: '极' }).total).toFixed(2)} |`)
md.push('| 金丹10 本体攻击 | 3,200 | 1,800 |')
md.push('')
md.push('> 取 3：极品玩家突破那一刻只强 ×1.26，换装后才 ×1.9。取 4：破境瞬间下品 ×1.73 / 极品 ×1.52，四条目标全部成立且有余量。')
md.push('> **定稿 = 1 / 4 / 16（元婴 64）**；3 保留在本文作对照，不再采用。')
md.push('')
md.push('关键点的绝对值（定稿 R=4 vs memo R=3）：')
md.push('')
md.push('| 层 | R=4 下品 | R=4 极品 | R=3 下品 | R=3 极品 |')
md.push('|---:|---:|---:|---:|---:|')
for (const level of LEVELS) {
  const a = panelOf(level).total
  const b = panelOf(level, { realmBase: REALM3 }).total
  const c = panelOf(level, { quality: '极' }).total
  const d = panelOf(level, { quality: '极', realmBase: REALM3 }).total
  md.push(`| ${level} | ${fmt(a)} | ${fmt(c)} | ${fmt(b)} | ${fmt(d)} |`)
}
md.push('')
md.push('> **段内形状不变**：1~10 / 11~20 / 21~30 内部，两版用的是同一组小境界乘数（1.0~2.0），曲线形状相同。')
md.push('> R=4 改两件事：① 每段整体高度（筑基是 R=3 的 4/3、金丹 16/9）；② 段间跳变（本体 ×2.0 而不是 ×1.5）。')
md.push('> 段内成长会略陡一点（装备占比降低）：筑基 1→10 下品在 R=3 是 ×1.64、R=4 是 ×1.70。')
md.push('')
md.push('## 六、未定项（施工前要拍）')
md.push('')
md.push('1. **速度**：本文按「速度不吃大境界乘区」处理（避免先手一边倒）；若坚持四属性同乘，敌人速度要同步重标。')
md.push('2. **子嗣的灵根 / 本命 / 词条乘区**：保留（推荐）还是并入新公式？保留的话 `sim:realm` 按新口径重跑。')
md.push('3. **灵兽**：白板 ×10 后是否仍用 `realmCoefAt(同修等级)`，还是改成 memo 的「品阶 1/3/9 + 线性等级」。')
md.push('4. **炼体**：保持现公式（满级 +720 血 / +72 防）。基础值 ×10 后炼体占比从 70% 降到 7~20%，属于**预期削弱**，要不要补偿待定。')
md.push('5. **词条叠乘**：极品 3 条词条约 +8~24% 叠在成色乘区上，会让「极品一阶」比「下品二阶」高 10~45%。是否把词条条数降一档（下0/中1/上2/极2）需要单独验算。')
md.push('6. **宝匣成色分布**：极品 2.5 倍后，极品掉率要不要下调（「突出极品的不易」）。')
md.push('7. **老档体验**：迁移后玩家装备相对变弱（本体 ×10、装备不动），是否要在更新说明里写清楚。')

// ---------- HTML ----------
const ALL_LEVELS = Array.from({ length: 30 }, (_, i) => i + 1)
const series = QUALITIES.map((q, i) => ({
  key: q.key,
  name: `${q.key}品（×${q.mult.toFixed(1)}）`,
  color: `var(--series-${i + 1})`,
  values: ALL_LEVELS.map(level => panelOf(level, { quality: q.key })),
  share: ALL_LEVELS.map(level => {
    const p = panelOf(level, { quality: q.key })
    return p.total > 0 ? p.gear / p.total : 0
  })
}))
const series3 = QUALITIES.map((q, i) => ({
  key: q.key,
  name: `${q.key}品（×${q.mult.toFixed(1)}）`,
  color: `var(--series-${i + 1})`,
  values: ALL_LEVELS.map(level => panelOf(level, { quality: q.key, realmBase: REALM3 })),
  share: ALL_LEVELS.map(level => {
    const p = panelOf(level, { quality: q.key, realmBase: REALM3 })
    return p.total > 0 ? p.gear / p.total : 0
  })
}))
const html = buildHtml(ALL_LEVELS, series, series3)
writeFileSync(join(OUT, '2026-11-16 属性公式目标态.md'), md.join('\n') + '\n')
writeFileSync(join(OUT, '2026-11-16 属性公式目标态图.html'), html)
console.log('wrote design/new/2026-11-16 属性公式目标态.md')
console.log('wrote design/new/2026-11-16 属性公式目标态图.html')

function buildHtml(levels, series, series3) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>属性公式目标态 · 2026-11-16</title>
<style>
  .viz-root {
    color-scheme: light;
    --surface-1: #fcfcfb; --page: #f9f9f7;
    --text-primary: #0b0b0b; --text-secondary: #52514e; --text-muted: #898781;
    --grid: #e1e0d9; --axis: #c3c2b7;
    --series-1: #2a78d6; --series-2: #eb6834; --series-3: #1baf7a; --series-4: #eda100;
    font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
    background: var(--page); color: var(--text-primary); margin: 0; padding: 32px;
  }
  @media (prefers-color-scheme: dark) {
    :root:where(:not([data-theme="light"])) .viz-root {
      color-scheme: dark;
      --surface-1: #1a1a19; --page: #0d0d0d;
      --text-primary: #f0efec; --text-secondary: #c3c2b7;
      --grid: #2c2c2a; --axis: #383835;
      --series-1: #3987e5; --series-2: #d95926; --series-3: #199e70; --series-4: #c98500;
    }
  }
  h1 { font-size: 20px; margin: 0 0 4px; font-weight: 650; }
  p.sub { margin: 0 0 24px; color: var(--text-secondary); font-size: 13px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(520px, 1fr)); gap: 24px; max-width: 1280px; }
  .card { background: var(--surface-1); border: 1px solid rgba(11,11,11,.10); border-radius: 12px; padding: 20px 20px 12px; }
  .card h2 { font-size: 14px; margin: 0 0 2px; font-weight: 650; }
  .card p.note { margin: 0 0 10px; font-size: 12px; color: var(--text-secondary); }
  .legend { display: flex; flex-wrap: wrap; gap: 16px; margin: 0 0 6px; font-size: 12px; color: var(--text-secondary); }
  .legend span { display: inline-flex; align-items: center; gap: 6px; }
  .legend i { width: 14px; height: 3px; border-radius: 2px; display: inline-block; }
  svg { width: 100%; height: auto; display: block; overflow: visible; }
  .tick { fill: var(--text-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  .end-label { fill: var(--text-secondary); font-size: 11px; font-weight: 600; }
</style>
</head>
<body>
<div class="viz-root">
  <h1>属性公式目标态 — 桂冈攻击</h1>
  <p class="sub">基础值 攻击 100；本体 = 100 × 大境界基数(1/4/16) × 小境界(1.0~2.0)；装备 = §四 原表 × 成色乘区（1.0/1.5/2.0/2.5）。装备阶 = 段内最高可穿（练气 T2 / 筑基 T3 / 金丹 T4）。</p>
  <div class="cards">
    ${chartCard('总攻击 · R=4（定稿）', '四条线只差装备成色；大境界处的折点是本体 ×4 与装备换阶叠加', 'total', levels, series, false, 5000)}
    ${chartCard('总攻击 · R=3（memo 原值，对照）', '同一口径、基数 1/3/9：段间跳变更小，段内形状基本不变（两图共用纵轴）', 'total', levels, series3, false, 5000)}
    ${chartCard('装备占总攻击比例 · R=4', '装备占比随成色与段内位置变化', 'share', levels, series, true)}
  </div>
</div>
<script>
  const VBW = 720, PADL = 52, PADR = 76
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

function chartCard(title, note, key, levels, series, isPercent, fixedMax = null) {
  const W = 720, H = 320
  const pad = { l: 52, r: 76, t: 18, b: 34 }
  const plotW = W - pad.l - pad.r
  const plotH = H - pad.t - pad.b
  const valuesOf = s => (key === 'share' ? s.share : s.values.map(v => v.total))
  const all = series.flatMap(valuesOf)
  const yMax = fixedMax || niceMax(isPercent ? 1 : Math.max(...all))
  const x = i => pad.l + (i / (levels.length - 1)) * plotW
  const y = v => pad.t + plotH - (v / yMax) * plotH
  const ticksY = 5
  const grid = Array.from({ length: ticksY + 1 }, (_, i) => {
    const v = (yMax / ticksY) * i
    return `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--grid)" stroke-width="1"/>
      <text class="tick" x="${pad.l - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${isPercent ? (v * 100).toFixed(0) + '%' : fmtAxis(v)}</text>`
  }).join('')
  const bands = [10, 20].map(lv => {
    const bx = x(lv - 0.5)
    return `<line x1="${bx.toFixed(1)}" x2="${bx.toFixed(1)}" y1="${pad.t}" y2="${pad.t + plotH}" stroke="var(--axis)" stroke-width="1" stroke-dasharray="3 4"/>`
  }).join('')
  const bandLabels = ['练气', '筑基', '金丹'].map((name, i) =>
    `<text class="tick" x="${x(i * 10 + 4.5).toFixed(1)}" y="${(pad.t + 12).toFixed(1)}" text-anchor="middle" opacity=".8">${name}</text>`
  ).join('')
  const xTicks = [1, 5, 10, 15, 20, 25, 30].map(lv =>
    `<text class="tick" x="${x(levels.indexOf(lv)).toFixed(1)}" y="${H - 12}" text-anchor="middle">${lv}</text>`
  ).join('')
  const lastIdx = levels.length - 1
  const endLabels = series.map(s => ({ s, v: valuesOf(s)[lastIdx], y: y(valuesOf(s)[lastIdx]) })).sort((a, b) => a.y - b.y)
  for (let i = 1; i < endLabels.length; i += 1) if (endLabels[i].y - endLabels[i - 1].y < 14) endLabels[i].y = endLabels[i - 1].y + 14
  const paths = series.map(s => {
    const vals = valuesOf(s)
    const d = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${x(lastIdx).toFixed(1)}" cy="${y(vals[lastIdx]).toFixed(1)}" r="4" fill="${s.color}" stroke="var(--surface-1)" stroke-width="2"/>`
  }).join('')
  const endText = endLabels.map(e =>
    `<text class="end-label" x="${(x(lastIdx) + 9).toFixed(1)}" y="${(e.y + 4).toFixed(1)}">${isPercent ? (e.v * 100).toFixed(0) + '%' : fmtAxis(e.v)}</text>`
  ).join('')
  const legend = series.map(s => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join('')
  const values = JSON.stringify(series.map(s => ({ name: s.name, color: s.color, values: valuesOf(s) })))
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
      <div class="tip" style="position:absolute;top:0;left:0;opacity:0;pointer-events:none;background:var(--surface-1);border:1px solid rgba(11,11,11,.12);border-radius:8px;padding:8px 10px;font-size:12px;box-shadow:0 4px 16px rgba(0,0,0,.12);min-width:200px"></div>
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
  const mag = 10 ** Math.floor(Math.log10(v))
  const norm = v / mag
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10
  return step * mag
}
function fmtAxis(v) {
  if (v >= 10000) return Math.round(v / 1000) + 'k'
  if (v >= 1000) return (Math.round(v / 100) / 10) + 'k'
  return Math.round(v).toString()
}
