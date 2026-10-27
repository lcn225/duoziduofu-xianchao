// 【炼体药浴】纯函数层（B4a，2026-10-27）
//
// 真源：
//   《炼体药浴》v3.0（§二 瞬间吞噬 / §三 产气 / §四 防呆漏斗 / §五 吸收与上限 / §八 体力）
//   《数值真值表》§5.11（gain / floor / cap 18 行）、§5.11b（药浴池，B4b 才接）
//
// 一句话链路：`灵材 → 五系药力 → 吸收 → 炼体修为`。
// 药浴把「炼体烧灵力」整条砍掉（体力照旧 15/h，见《炼体药浴》§八），
// 所以 `dayLoop` 的 body 轮次不再调 `meditateInSlice`，改成每轮调一次 `planBathRound`。
//
// ⚠ 本文件是**纯函数**：不 import store / Vue、不用 `Math.random`、不写存档。
//   被 `scripts/verify-bath.mjs` 用 node 直接加载，相对 import 必须带 `.js` 后缀。
// ⚠ 结算点是「一轮炼体」（= 1 游戏小时 = 4 个 tick），不是每个 tick ——
//   按 tick 结算会一轮吸 4 次，日修为直接翻四倍。

import { itemById } from './items.js'

/** 五系药力（顺序即 UI 展示顺序，与 `FATE_ELEMENTS` 前五项一致） */
export const BATH_ELEMENTS = ['metal', 'wood', 'water', 'fire', 'earth']

/** 五系的单字标签（流水账 / 药力条用） */
export const BATH_ELEMENT_LABELS = { metal: '金', wood: '木', water: '水', fire: '火', earth: '土' }

/** 能吃进药浴的品类：灵材（材质/花果叶）+ 灵植（整株）。
 *  ⚠ **灵植必须算**：真值表 §5.11 的供给行把「药圃 5/天/级」算作药浴供给，而药圃产的是灵植；
 *  且 `灵材/wood` 全池只有 10 件底材、`灵植/wood` 63 件 —— 排除灵植会让木系永久死锁，
 *  五系「同时 ≥ floor」就再也满足不了。灵器（装备）与灵兽不吃。 */
export const BATH_CATEGORIES = ['灵材', '灵植']

/** 单件产气：基础(tier) × 成色系数（《炼体药浴》§三） */
export const TIER_BASE_YIELD = { 1: 10, 2: 25, 3: 60, 4: 150, 5: 400 }
export const QUALITY_COEF = { 下: 1.0, 中: 1.2, 上: 1.5, 极: 2.0 }

/** 成色从低到高的吞噬顺序（同阶先吃低成色） */
const QUALITY_ORDER = { 下: 0, 中: 1, 上: 2, 极: 3 }

/** 外功最多 18 级（洗髓圆满）；19 级等元婴段一起做（真值表 §5.10 注释） */
export const BATH_MAX_LEVEL = 18

/**
 * 炼体药浴参数表 —— 照《数值真值表》§5.11 **原样抄**，不要在这里做二次计算。
 *   gain  = 吸收一次得多少炼体修为（= 该级日产出 ÷ 5）
 *   floor = 吸收一次每系要扣多少药力（五系同时够了才能吸）
 *   cap   = 单系药力软上限（判断在**加之前**，加的时候不截断）
 */
export const BATH_PARAMS = {
  1: { gain: 26, floor: 5, cap: 15 },
  2: { gain: 13, floor: 5, cap: 15 },
  3: { gain: 14, floor: 6, cap: 18 },
  4: { gain: 12, floor: 7, cap: 21 },
  5: { gain: 10, floor: 7, cap: 21 },
  6: { gain: 12, floor: 8, cap: 24 },
  7: { gain: 12, floor: 9, cap: 27 },
  8: { gain: 12, floor: 9, cap: 27 },
  9: { gain: 14, floor: 10, cap: 30 },
  10: { gain: 12, floor: 11, cap: 33 },
  11: { gain: 16, floor: 33, cap: 99 },
  12: { gain: 15, floor: 40, cap: 120 },
  13: { gain: 14, floor: 47, cap: 141 },
  14: { gain: 11, floor: 55, cap: 165 },
  15: { gain: 15, floor: 162, cap: 486 },
  16: { gain: 14, floor: 189, cap: 567 },
  17: { gain: 12, floor: 216, cap: 648 },
  18: { gain: 13, floor: 243, cap: 729 }
}

/** 比较药力时的容差（浮点累加会出 24.999999999999996 这种事） */
export const BATH_EPS = 1e-6

/** 空的五系药力池 */
export const emptyMedicine = () => ({ metal: 0, wood: 0, water: 0, fire: 0, earth: 0 })

const num = value => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * 取某一级炼体的药浴参数。
 *
 * @param {number} bodyLevel 外功等级 1..18（超出按边界夹住，老档脏数据也不会 NaN）
 * @param {{capMultiplier?:number}} opts `capMultiplier` 是药浴池等级倍率（B4b：1/1.5/2/3/4），
 *   浴桶口径恒为 1。**只乘 cap**，gain / floor 一个都不改（真值表 §5.11b）。
 */
export const bathParamsOf = (bodyLevel, { capMultiplier = 1 } = {}) => {
  const level = Math.min(Math.max(Math.floor(num(bodyLevel)) || 1, 1), BATH_MAX_LEVEL)
  const row = BATH_PARAMS[level]
  const mult = num(capMultiplier) > 0 ? num(capMultiplier) : 1
  return { level, gain: row.gain, floor: row.floor, cap: row.cap * mult }
}

/**
 * 一件物品是哪一系。
 *
 * ⚠ **必须回查底材**：`createItemInstance` 生成的实例**不带** `fateElement`
 *   （`items.js` 的 common 字段里没有它），只读实例字段会让所有材料都判成「非五系」，
 *   药浴就永远吃不到东西。实例用 `baseId` 查，底材本身用 `id` 查。
 *
 * @returns {string|null} 'metal'|'wood'|'water'|'fire'|'earth'，器/兽/未知返回 null
 */
export const elementOf = item => {
  if (!item) return null
  const base = itemById(item.baseId || item.id)
  const el = base?.fateElement || item.fateElement || null
  return BATH_ELEMENTS.includes(el) ? el : null
}

/** 单件产气 = 基础(tier) × 成色系数；不在 1~5 阶或非五系 → 0 */
export const yieldOf = item => {
  if (!item) return 0
  const base = TIER_BASE_YIELD[Math.floor(num(item.tier))]
  if (!base) return 0
  // 底材没有成色（不该进背包，保险起见按「中」）；实例一定有
  const coef = QUALITY_COEF[item.quality] ?? QUALITY_COEF['中']
  return base * coef
}

/**
 * 防呆漏斗：这件东西能不能被药浴吃掉（《炼体药浴》§四 + §9.3）。
 *
 * @param {object} item 背包实例
 * @param {object} opts
 *   `lockedSpecies`   品种锁（baseId 数组，复用背包灵材页那套）
 *   `activeFateItemId` 当前同参（baseId；同参是**用途**不是分类，这里只做排除）
 *   `activePetId`     出战中灵宠实例 id
 *   `equippedIds`     额外要排除的实例 id（子嗣装备等）
 */
export const isBathEligible = (item, opts = {}) => {
  if (!item || !item.id) return false
  const { lockedSpecies = [], activeFateItemId = null, activePetId = null, equippedIds = [] } = opts
  if (!BATH_CATEGORIES.includes(item.category)) return false
  if (item.equippedBy) return false
  if (item.location && item.location !== 'inventory') return false
  if (activePetId && item.id === activePetId) return false
  if (item.baseId && (lockedSpecies || []).includes(item.baseId)) return false
  if (activeFateItemId && item.baseId === activeFateItemId) return false
  if ((equippedIds || []).includes(item.id)) return false
  if (!elementOf(item)) return false
  return yieldOf(item) > 0
}

/** 吞噬优先级：tier 升序 → 成色升序（下→极）→ 背包含原顺序（确定性，离线重放才对得上） */
export const sortBathCandidates = list =>
  (list || [])
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        num(a.item.tier) - num(b.item.tier) ||
        (QUALITY_ORDER[a.item.quality] ?? 1) - (QUALITY_ORDER[b.item.quality] ?? 1) ||
        a.index - b.index
    )
    .map(entry => entry.item)

/** 可用材料（已按优先级排好） */
export const bathCandidates = (items = [], opts = {}) =>
  sortBathCandidates((items || []).filter(item => isBathEligible(item, opts)))

const isFull = (medicine, params) =>
  BATH_ELEMENTS.every(el => num(medicine[el]) >= params.cap - BATH_EPS)

/**
 * 药力不足时**瞬间批量补料**，把五系补到 `cap`（浴桶口径，《炼体药浴》§二）。
 *
 * 三条硬规则：
 *   1. **软上限**：判断在加之前 —— 某系已经 ≥ cap 就跳过该系，但**加的时候不截断**。
 *      所以 T1 金系已有 14、再吃一件（+10）会变成 24，下一轮吸完自然降下来，溢出不会被浪费。
 *   2. 五系全满 → 整体停止，材料留在背包。
 *   3. 只补不吸是错的：调用方必须接着调 `absorbOnce`（见 `planBathRound`）。
 */
export const planTopUp = (opts = {}) => {
  const { items = [], medicine = emptyMedicine(), params, maxed = false } = opts
  const p = params || bathParamsOf(opts.bodyLevel, { capMultiplier: opts.capMultiplier })
  const med = { ...emptyMedicine(), ...(medicine || {}) }
  const consumed = []
  if (!maxed) {
    for (const item of bathCandidates(items, opts)) {
      if (isFull(med, p)) break
      const el = elementOf(item)
      if (!el) continue
      if (num(med[el]) >= p.cap - BATH_EPS) continue
      med[el] += yieldOf(item)
      consumed.push(item)
    }
  }
  return { medicine: med, consumed }
}

/** 五系**同时** ≥ floor 才能吸（缺一系整体停摆 —— 二换一的兜底在 B11） */
export const canAbsorb = (medicine, params) =>
  BATH_ELEMENTS.every(el => num(medicine?.[el]) >= params.floor - BATH_EPS)

/** 吸一次：五系各扣 floor，返回炼体修为 `gain` */
export const absorbOnce = (medicine, params) => {
  const med = { ...emptyMedicine(), ...(medicine || {}) }
  if (!canAbsorb(med, params)) return { medicine: med, absorbed: false, gained: 0 }
  for (const el of BATH_ELEMENTS) med[el] = Math.max(0, num(med[el]) - params.floor)
  return { medicine: med, absorbed: true, gained: params.gain }
}

/**
 * 一轮炼体（1 游戏小时）的完整结算：**先补到 cap，再吸一次**。
 *
 * 为什么是先补后吸、而不是「有药力就只吸」：真值表 §5.11 拍板
 * 「吸收次数 = 炼体实际执行的轮次，日修为 = 轮次 × gain」。空药力开局如果不补，
 * 第一轮就白跑；满 5 轮也凑不到 `5 × gain`。
 *
 * @param {object} opts `items / medicine / bodyLevel / capMultiplier / maxed /
 *   instantTopUp / lockedSpecies / activeFateItemId / activePetId / equippedIds`
 *   `instantTopUp === false` = 药浴池已建成（A4：建池后浴桶关闭，只吸不补，由池子全天候转换）
 */
export const planBathRound = (opts = {}) => {
  const params = opts.params || bathParamsOf(opts.bodyLevel, { capMultiplier: opts.capMultiplier })
  const before = { ...emptyMedicine(), ...(opts.medicine || {}) }
  // 满级后不再吃材料（吃了也没地方放），但也不报错 —— 玩家只是白挂体力
  const topUp = opts.maxed || opts.instantTopUp === false ? null : planTopUp({ ...opts, params })
  const absorbedFrom = topUp ? topUp.medicine : before
  const absorbed = opts.maxed
    ? { medicine: absorbedFrom, absorbed: false, gained: 0 }
    : absorbOnce(absorbedFrom, params)
  return {
    params,
    before,
    medicine: absorbed.medicine,
    consumed: topUp ? topUp.consumed : [],
    absorbed: absorbed.absorbed,
    gained: absorbed.gained,
    toppedUp: !!topUp
  }
}

/** 流水账文案（`settlementText` 拼在「炼体 1 小时」后面） */
export const bathLogText = result => {
  if (!result) return ''
  const n = (result.consumed || []).length
  const gain = `体魄 +${Math.round(num(result.gained))}`
  if (result.absorbed) return n ? `吞噬 ${n} 件灵材 · ${gain}` : `吸收药力 · ${gain}`
  if (n) return `吞噬 ${n} 件灵材（药力不足，未吸收）`
  return '药力不足，未吸收'
}

/** 五系药力百分比（0~100，UI 药力条用） */
export const medicinePctOf = (medicine, cap) => {
  const c = num(cap) > 0 ? num(cap) : 1
  const out = {}
  for (const el of BATH_ELEMENTS) {
    const v = (num(medicine?.[el]) / c) * 100
    out[el] = Math.max(0, Math.min(100, Math.round(v * 10) / 10))
  }
  return out
}
