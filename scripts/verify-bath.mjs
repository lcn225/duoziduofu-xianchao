// 炼体药浴断言（B4a，2026-10-27）
//
// 覆盖：
//   · 参数表（真值表 §5.11 的 18 行 / cap 倍率 / 边界夹取）
//   · 单件产气（五档 × 四成色）、器/兽不产气、灵植可吃
//   · **实例没有 fateElement 时靠 baseId 回查**（最容易踩的一条）
//   · 防呆漏斗九条排除规则
//   · 吞噬优先级（阶升序 → 成色升序 → 背包原顺序）
//   · 软上限（判断在加之前、加时不截断）与五系全满停嘴
//   · 吸收条件（五系同时 ≥ floor）与扣减
//   · 整轮「先补后吸」、满级停嘴、建池后只吸不补（B4b 闸门）
//   · 预览与执行 deep equal
//   · 运行时层：settleBodyRound 扣背包 / 写药力 / 交 cultivateBody；cultivateBody 余数连升
//   · 静态扫描：纯函数层不 import Vue / Pinia / store、不用 Math.random、不写 saveData
//
//   node scripts/verify-bath.mjs
//   node scripts/verify-bath.mjs --list
//   VERIFY_FILTER=吞 node scripts/verify-bath.mjs --quiet
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BATH_ELEMENTS,
  BATH_EPS,
  BATH_MAX_LEVEL,
  BATH_PARAMS,
  QUALITY_COEF,
  TIER_BASE_YIELD,
  absorbOnce,
  bathCandidates,
  bathLogText,
  bathParamsOf,
  canAbsorb,
  elementOf,
  emptyMedicine,
  isBathEligible,
  medicinePctOf,
  planBathRound,
  planTopUp,
  sortBathCandidates,
  yieldOf
} from '../src/plugins/bath.js'
import { ITEM_POOL } from '../src/plugins/items.js'
import { actions as bathActions, getters as bathGetters } from '../src/stores/modules/bath.js'
import { actions as coreActions } from '../src/stores/modules/core.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
let skipped = 0
const results = []
const labels = []
const FILTER = (process.env.VERIFY_FILTER || '').toLowerCase()
const LIST = process.argv.includes('--list')

const eq = (a, b) => {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-6
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => eq(v, b[i]))
  return a === b
}
const check = (label, actual, expected) => {
  if (FILTER && !label.toLowerCase().includes(FILTER)) {
    skipped += 1
    return
  }
  labels.push(label)
  if (LIST) return
  const ok = eq(actual, expected)
  if (!ok) failures += 1
  results.push({ ok, label, actual, expected })
}

// ---------- 造数据：全部从真实物品池里捞，别手搓假底材 ----------
const baseOf = (category, element) =>
  ITEM_POOL.find(item => item.category === category && item.fateElement === element)

let seq = 0
/** 造一个背包实例（**故意不带 fateElement**，与 createItemInstance 的真实产物一致） */
const inst = (base, patch = {}) => {
  seq += 1
  return {
    id: patch.id || `inst_test_${seq}`,
    baseId: base.id,
    name: base.name,
    displayName: base.name,
    category: base.category,
    type: base.type,
    series: base.series,
    tier: base.tier,
    quality: '中',
    location: 'inventory',
    equippedBy: null,
    ...patch
  }
}
const byTier = (tier, quality = '中', category = '灵材', element = 'wood') => {
  const base = ITEM_POOL.find(
    item => item.category === category && item.fateElement === element && item.tier === tier
  )
  return inst(base, { quality })
}
/** 五系各一件（T1 / 中，产气 12） */
const fiveOfAKind = () => BATH_ELEMENTS.map(el => byTier(1, '中', '灵材', el))

// ================= 一、参数表 =================
check('参数表 18 级', Object.keys(BATH_PARAMS).length, 18)
check('L1 = 26 / 5 / 15', `${BATH_PARAMS[1].gain}/${BATH_PARAMS[1].floor}/${BATH_PARAMS[1].cap}`, '26/5/15')
check('L10 = 12 / 11 / 33', `${BATH_PARAMS[10].gain}/${BATH_PARAMS[10].floor}/${BATH_PARAMS[10].cap}`, '12/11/33')
check('L18 = 13 / 243 / 729', `${BATH_PARAMS[18].gain}/${BATH_PARAMS[18].floor}/${BATH_PARAMS[18].cap}`, '13/243/729')
check('cap 恒等于 3 × floor', Object.values(BATH_PARAMS).every(r => eq(r.cap, r.floor * 3)), true)
check('bathParamsOf(1) 取 L1', bathParamsOf(1).gain, 26)
check('炼体等级 0 → 夹到 L1', bathParamsOf(0).level, 1)
check('炼体等级 99 → 夹到 L18', bathParamsOf(99).level, BATH_MAX_LEVEL)
check('脏值 null → L1', bathParamsOf(null).level, 1)
check('cap 倍率只乘 cap 的 1.5（22.5）', bathParamsOf(1, { capMultiplier: 1.5 }).cap, 22.5)
check('cap 倍率不碰 gain', bathParamsOf(1, { capMultiplier: 4 }).gain, 26)
check('cap 倍率不碰 floor', bathParamsOf(1, { capMultiplier: 4 }).floor, 5)
check('倍率 0 / 负数 → 当 1', bathParamsOf(1, { capMultiplier: 0 }).cap, 15)

// ================= 二、产气 =================
check('T1 下品产气 10', yieldOf(byTier(1, '下')), 10)
check('T1 中品产气 12', yieldOf(byTier(1, '中')), 12)
check('T1 上品产气 15', yieldOf(byTier(1, '上')), 15)
check('T1 极品产气 20', yieldOf(byTier(1, '极')), 20)
check('T5 极品产气 800', yieldOf(byTier(5, '极')), TIER_BASE_YIELD[5] * QUALITY_COEF['极'])
check('成色缺失 → 按中品 1.2', yieldOf(byTier(1, undefined)), 12)
check('阶越界 → 0', yieldOf({ tier: 9, quality: '中' }), 0)

const woodMat = baseOf('灵材', 'wood')
const beast = baseOf('灵兽', 'beast')
const earthGear = baseOf('灵器', 'earth')
const woodPlant = baseOf('灵植', 'wood')
check('灵材金系 -> metal', elementOf(inst(baseOf('灵材', 'metal'))), 'metal')
check('★实例无 fateElement 也能靠 baseId 认出木系', elementOf(inst(woodMat)), 'wood')
check('★灵植（整株）也能认出水系', elementOf(inst(baseOf('灵植', 'water'))), 'water')
check('灵兽（beast）不产五系', elementOf(inst(beast)), null)
check('底材直接传进来也认（用 id 回查）', elementOf(woodMat), 'wood')
check('空对象 → null', elementOf({}), null)
check('灵植可以进药浴', isBathEligible(inst(woodPlant)), true)
check('灵器（器物）不能进药浴', isBathEligible(inst(earthGear)), false)
check('灵兽不能进药浴', isBathEligible(inst(beast)), false)
check('vessel 灵材不产气 → 不吃', isBathEligible(inst(baseOf('灵材', 'vessel'))), false)

// ================= 三、防呆漏斗 =================
const plain = inst(woodMat)
check('普通灵材可吃', isBathEligible(plain), true)
check('品种锁 → 不吃', isBathEligible(plain, { lockedSpecies: [plain.baseId] }), false)
check('别的品种锁不影响', isBathEligible(plain, { lockedSpecies: ['别的东西'] }), true)
check('同参占用的品种 → 不吃', isBathEligible(plain, { activeFateItemId: plain.baseId }), false)
check('出战中灵宠 → 不吃', isBathEligible(plain, { activePetId: plain.id }), false)
check('装备中（equippedBy）→ 不吃', isBathEligible({ ...plain, equippedBy: '桂冈' }), false)
check('不在背包（location）→ 不吃', isBathEligible({ ...plain, location: 'secretRealm' }), false)
check('子嗣装备占用 → 不吃', isBathEligible(plain, { equippedIds: [plain.id] }), false)
check('没有实例 id → 不吃', isBathEligible({ ...plain, id: null }), false)
check('null → 不吃', isBathEligible(null), false)

// ================= 四、优先级 =================
const lowTierHigh = byTier(1, '极', '灵材', 'wood')
const lowTierLow = byTier(1, '下', '灵材', 'wood')
const lowTierMidA = byTier(1, '中', '灵材', 'wood')
const lowTierMidB = byTier(1, '中', '灵材', 'wood')
const highTier = byTier(3, '下', '灵材', 'wood')
const ordered = sortBathCandidates([highTier, lowTierHigh, lowTierMidB, lowTierLow, lowTierMidA])
check(
  '优先级：阶升序 → 成色升序 → 背包原顺序',
  ordered.map(item => item.id),
  [lowTierLow.id, lowTierMidB.id, lowTierMidA.id, lowTierHigh.id, highTier.id]
)
check(
  'bathCandidates 自动剔除不合格的',
  bathCandidates([plain, inst(beast), plain], { lockedSpecies: [plain.baseId] }).length,
  0
)

// ================= 五、软上限与停嘴 =================
const p1 = bathParamsOf(1)
const top1 = planTopUp({ items: [byTier(1, '中'), byTier(1, '中'), byTier(1, '中')], params: p1 })
check('软上限：两件就把木系顶穿到 24（不截断）', top1.medicine.wood, 24)
check('软上限：第三件被跳过（加之前判 cap）', top1.consumed.length, 2)
const top2 = planTopUp({
  items: [byTier(1, '中')],
  medicine: { ...emptyMedicine(), wood: 15 },
  params: p1
})
check('木系已满 15 → 不再吃木系', top2.consumed.length, 0)
const top3 = planTopUp({
  items: fiveOfAKind(),
  medicine: { metal: 15, wood: 15, water: 15, fire: 15, earth: 15 },
  params: p1
})
check('五系全满 → 整体停嘴、材料留在背包', top3.consumed.length, 0)
const top4 = planTopUp({ items: [], params: p1 })
check('没材料 → 一件不吃', top4.consumed.length, 0)
check('没材料 → 药力不变', top4.medicine.wood, 0)

// ================= 六、吸收 =================
check('floor 边界：五系恰好 5 → 可吸收', canAbsorb({ metal: 5, wood: 5, water: 5, fire: 5, earth: 5 }, p1), true)
check('缺一系（木 4）→ 不能吸', canAbsorb({ metal: 9, wood: 4, water: 9, fire: 9, earth: 9 }, p1), false)
const abs1 = absorbOnce({ metal: 9, wood: 9, water: 9, fire: 9, earth: 9 }, p1)
check('吸一次扣五系各 floor', abs1.medicine.wood, 4)
check('吸一次得 gain', abs1.gained, 26)
check('吸一次标记 absorbed', abs1.absorbed, true)
const abs2 = absorbOnce({ metal: 9, wood: 4, water: 9, fire: 9, earth: 9 }, p1)
check('不够 floor → 药力原样退回', `${abs2.absorbed}/${abs2.medicine.wood}`, 'false/4')
check('EPS：差 1e-9 仍算够', canAbsorb({ metal: 5 - 1e-9, wood: 5, water: 5, fire: 5, earth: 5 }, p1), true)

// ================= 七、整轮（先补后吸） =================
// ⚠ 同一组材料只造一次：`planBathRound` 是纯函数不改输入，但每次 `fiveOfAKind()`
//   都会生成新的实例 id —— 预览与执行要用**同一份**才能比 deep equal。
const FIVE = fiveOfAKind()
const round1 = planBathRound({ items: FIVE, medicine: emptyMedicine(), bodyLevel: 1 })
check('空药力开局：先补 5 件', round1.consumed.length, 5)
check('补完每系 12，吸完剩 7', round1.medicine.metal, 7)
check('补完就吸 → 本轮有收益', round1.gained, 26)
check('本轮标记已补料', round1.toppedUp, true)

const round2 = planBathRound({ items: [], medicine: { metal: 7, wood: 7, water: 7, fire: 7, earth: 7 }, bodyLevel: 1 })
check('药力够、没材料 → 照样吸', round2.absorbed, true)
check('没材料也能吸完剩 2', round2.medicine.metal, 2)

const round3 = planBathRound({ items: FIVE, medicine: emptyMedicine(), bodyLevel: 1, maxed: true })
check('满级 → 不吃材料', round3.consumed.length, 0)
check('满级 → 不吸收', round3.absorbed, false)

const round4 = planBathRound({
  items: FIVE,
  medicine: emptyMedicine(),
  bodyLevel: 1,
  instantTopUp: false
})
check('建池后（B4b 闸门）→ 不吃材料', round4.consumed.length, 0)
check('建池后有空药力 → 也吸不出来', round4.absorbed, false)
const round5 = planBathRound({
  items: FIVE,
  medicine: { metal: 9, wood: 9, water: 9, fire: 9, earth: 9 },
  bodyLevel: 1,
  instantTopUp: false
})
check('建池后药力够 → 只吸不补', `${round5.absorbed}/${round5.consumed.length}`, 'true/0')

const preview = planBathRound({ items: FIVE, medicine: emptyMedicine(), bodyLevel: 1 })
const actual = planBathRound({ items: FIVE, medicine: emptyMedicine(), bodyLevel: 1 })
check(
  '预览与执行 deep equal（同一套 opts）',
  JSON.stringify(preview) === JSON.stringify(actual),
  true
)

// ================= 八、文案与百分比 =================
check('文案：吞噬 + 吸收', bathLogText(round1), '吞噬 5 件灵材 · 体魄 +26')
check(
  '文案：只吃没吸',
  bathLogText(planBathRound({ items: [byTier(1, '中')], medicine: emptyMedicine(), bodyLevel: 1 })),
  '吞噬 1 件灵材（药力不足，未吸收）'
)
check('文案：什么都没有', bathLogText(planBathRound({ items: [], medicine: emptyMedicine(), bodyLevel: 1 })), '药力不足，未吸收')
check('文案：空结果', bathLogText(null), '')
check('百分比：满 cap = 100%', medicinePctOf({ metal: 15 }, 15).metal, 100)
check('百分比：半 cap = 50%', medicinePctOf({ metal: 7.5 }, 15).metal, 50)
check('百分比：超 cap 夹到 100%', medicinePctOf({ metal: 30 }, 15).metal, 100)

// ================= 九、运行时层（mock store） =================
// 只验「扣背包 / 写药力 / 交 cultivateBody」这几步接线；纯函数细节上面已经覆盖。
const BODY_CAPS = { 1: 80, 2: 100 }
const makePlayer = patch => {
  const base = {
  bath: { medicine: emptyMedicine() },
  items: [],
  bodyLevel: 1,
  bodyRealm: '炼体一层',
  bodyCultivation: 0,
  maxBodyCultivation: BODY_CAPS[1],
  level: 1,
  cultivation: 0,
  maxCultivation: 100,
  spirit: 0,
  luck: 1,
  rebirthCultivationMultiplier: 1,
  totalCultivationTime: 0,
  isBreakthroughBlocked: false,
  lockedSpecies: [],
  activePet: null,
  practice: { fateItems: { active: null } },
  estate: { buildings: { manor: 1 } },
  saved: 0,
  saveData() {
    this.saved += 1
  },
  /** 简化版突破：够上限就升一级、清 0（真版在 core.js，余数由 cultivateBody 自己接） */
  tryBodyBreakthrough() {
    if (this.bodyLevel >= BATH_MAX_LEVEL) return
    this.bodyLevel += 1
    this.maxBodyCultivation = BODY_CAPS[this.bodyLevel] || this.maxBodyCultivation
    this.bodyCultivation = 0
  },
  ...bathActions,
  cultivateBody: coreActions.cultivateBody
  }
  // getters 必须定义成**访问器**，不能当普通方法展开 ——
  // `bathPlanOptions` 里读的是 `this.bathMedicine`（值），展开成函数会拿到函数对象
  for (const [key, fn] of Object.entries(bathGetters)) {
    Object.defineProperty(base, key, {
      get: () => fn.call(base),
      enumerable: true,
      configurable: true
    })
  }
  return Object.assign(base, patch)
}

const player = makePlayer({ items: fiveOfAKind() })
const usedIds = player.items.map(item => item.id)
const r = player.settleBodyRound()
check('运行时：一轮吞掉 5 件', usedIds.every(id => !player.items.some(item => item.id === id)), true)
check('运行时：留下的药力 = 吸完的 7', player.bath.medicine.wood, 7)
check('运行时：体魄 +26', player.bodyCultivation, 26)
check('运行时：返回结果带 consumed', r.consumed.length, 5)
check('运行时：落盘一次（cultivateBody 里存）', player.saved, 1)

const noMat = makePlayer({ items: [], bath: { medicine: { metal: 9, wood: 4, water: 9, fire: 9, earth: 9 } } })
noMat.settleBodyRound()
check('运行时：药力不够又没有料 → 不动体魄', noMat.bodyCultivation, 0)
check('运行时：不落盘（什么都没变）', noMat.saved, 0)

const eatOnly = makePlayer({ items: [byTier(1, '中'), byTier(1, '中')] })
eatOnly.settleBodyRound()
check('运行时：只吃料没吸收 → 自己落盘', eatOnly.saved, 1)
check('运行时：吃了但五系不全 → 药力写回', eatOnly.bath.medicine.wood, 24)

// cultivateBody：一次加超一级 → 循环突破 + 余数携带
const big = makePlayer({})
big.cultivateBody(104)
check('运行时：104 点体魄 → 升到 L2', big.bodyLevel, 2)
check('运行时：余数 24 带到下一级（不再清零丢）', big.bodyCultivation, 24)

// ================= 十、静态扫描 =================
const source = readFileSync(join(root, 'src/plugins/bath.js'), 'utf8')
// 先剥掉注释再扫 —— 注释里写着「不用 Math.random」也会被正则抓到
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
check('纯函数层不依赖 Vue / Pinia / store', /from ['"](vue|pinia)/.test(code) || /from ['"][^'"]*stores\//.test(code), false)
check('纯函数层不用 Math.random（离线重放要确定性）', /Math\.random/.test(code), false)
check('纯函数层不写 saveData', /saveData\s*\(/.test(code), false)
check('五系顺序与真值表一致', BATH_ELEMENTS.join(','), 'metal,wood,water,fire,earth')
check('EPS 是正的小数', BATH_EPS > 0 && BATH_EPS < 0.001, true)

// ================= 输出 =================
if (LIST) {
  for (const label of labels) console.log(`[LIST] ${label}`)
  console.log(`\n共 ${labels.length} 条断言`)
  process.exit(0)
}

const width = Math.max(...results.map(r => r.label.length), 10)
console.log('\n炼体药浴断言（《炼体药浴》v3.0 · 产气 / 漏斗 / 软上限 / 吸收 / 接线）\n')
for (const r of results) {
  const mark = r.ok ? '  ok  ' : ' FAIL '
  console.log(`[${mark}] ${r.label.padEnd(width)} ${r.actual}`)
}
const passed = results.length - failures
console.log(`\n${passed}/${results.length} 通过`)
if (failures > 0) {
  console.error(`\n${failures} 条断言失败\n`)
  process.exit(1)
}
console.log('全部通过 ✅\n')
if (skipped) console.log(`（${skipped} 条被 VERIFY_FILTER 跳过）`)
