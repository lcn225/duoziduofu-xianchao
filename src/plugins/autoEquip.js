// 一键装备（P36 · 《装备系统》§12.1 + 《模块二》§15.4）
//
// 一次把所有能穿的穿好：
//   1. **桂冈 5 槽** —— 按 §12.1 的攻防评分选最高分
//   2. **出战子嗣 攻/防 两槽** —— 按子嗣**实际面板分**选最高分
//      （子嗣战斗只看气血/战力，暴击闪避那类词条不进面板，所以只算 攻/防/生命/速 四条）
//
// 分配顺序：桂冈 → 出战子嗣（境界降序 → 出生时间升序 → id 升序），
// 与 `pickExpeditionChildren` 同一套排序 —— **强的人先挑**，避免弱者抢走好东西。
// 换下来的旧件回池，后面的人还能接着挑；没人要的最后回背包。
//
// 三条硬口径（§12.1 选装规则）：
//   · 已锁（品种锁）的不参与，也不会被替换
//   · 同分比成色（极 > 上 > 中 > 下），再同就不换
//   · 只往高了换，**不降级**
//
// ⚠ 这里全是纯函数：不改入参、不落盘、不读 store。落盘在 store 的 `autoEquipAll`。
import { EQUIP_SLOT_KEYS, equipSlotOfType } from './equipment.js'
import {
  OFFSPRING_EQUIP_SLOTS,
  canOffspringEquip,
  equipmentSlotOfItem,
  offspringEquipmentOf
} from './offspringEquipment.js'
import { canFightOf } from './innerCourt.js'

const num = value => (Number.isFinite(Number(value)) ? Number(value) : 0)
const round2 = value => Math.round(value * 100) / 100

/**
 * §12.1 进攻侧的行为类词条权重（乘在「攻 + 速」基础分上）。
 * `attackPct` 单列，不进这张表。
 */
const OFFENSIVE_TRAIT_WEIGHTS = {
  critRate: 1.5,
  comboRate: 1.3,
  counterRate: 1.0,
  stunRate: 1.0,
  vampireRate: 0.8
}

/** §12.1 防御侧的行为类词条权重（乘在「防 + 生命」基础分上） */
const DEFENSIVE_TRAIT_WEIGHTS = {
  dodgeRate: 0.8,
  critResist: 0.5,
  comboResist: 0.5,
  counterResist: 0.5,
  stunResist: 0.5,
  dodgeResist: 0.5,
  vampireResist: 0.5,
  finalDamageReduce: 1.0
}

/**
 * 桂冈装备评分（《装备系统》§12.1）。
 *
 * ```
 * 基础分（攻） = 攻 × 1.0 + 速 × 1.5
 * 基础分（防） = 防 × 0.6 + 生命 × 0.15
 * 进攻侧 = 基础分（攻） × (1 + 攻% + Σ进攻词条)
 * 防御侧 = 基础分（防） × (1 + 防% + 生命% + Σ防御词条)
 * 总分   = 进攻侧 + 防御侧
 * ```
 *
 * ⚠ `attackPct / defensePct / healthPct / speedPct` **不写进装备 stats**
 *   （生成时已经乘进那一件装备的白板里），所以这几项在这里恒为 0 —— 留着是为了
 *   兼容老档里可能残留的字段。权重本身是**占位值**，等《装备系统》§十七 第 8 条验算。
 */
export const playerEquipScore = (stats = {}) => {
  const s = stats || {}
  const baseAttack = num(s.attack) * 1.0 + num(s.speed) * 1.5
  const baseDefense = num(s.defense) * 0.6 + num(s.health) * 0.15

  let attackMul = 1 + num(s.attackPct)
  for (const [key, weight] of Object.entries(OFFENSIVE_TRAIT_WEIGHTS)) {
    attackMul += num(s[key]) * weight
  }
  let defenseMul = 1 + num(s.defensePct) + num(s.healthPct)
  for (const [key, weight] of Object.entries(DEFENSIVE_TRAIT_WEIGHTS)) {
    defenseMul += num(s[key]) * weight
  }
  return round2(baseAttack * attackMul + baseDefense * defenseMul)
}

/**
 * 子嗣装备评分 —— **与桂冈同一套权重**，但只算四条本体属性。
 *
 * 子嗣战斗被简化成「气血 / 战力」（《模块二》§15.3），装备在子嗣身上只有
 * 「攻击 → 战力」与防/生命承伤这四条换算；暴击、闪避、抗性**不进面板**，
 * 所以在这里**一分都不给**（给分会让一键装备挑出对子嗣毫无作用的件）。
 */
export const offspringEquipScore = (stats = {}) => {
  const s = stats || {}
  return round2(
    num(s.attack) * 1.0 + num(s.speed) * 1.5 + num(s.defense) * 0.6 + num(s.health) * 0.15
  )
}

/** 成色档位（§12.1 第 2 条的同分裁决）。装备侧两种写法都认：中文成色与老英文键 */
const QUALITY_RANK = {
  下: 0,
  中: 1,
  上: 2,
  极: 3,
  none: 0,
  common: 0,
  uncommon: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
  mythic: 3
}

export const equipQualityRank = quality => QUALITY_RANK[quality] ?? 0

/**
 * 一件背包物品能进桂冈哪个槽（不能穿的返回 null）。
 *
 * 三种来源都要认，与 `offspringEquipment.equipmentSlotOfItem` 同一套判断：
 *   · 物品池灵器：有 `equipSlot`，中文 `type` 也能派生
 *   · 炼器产物：`slot` / `equipType` 直接就是 5 槽键
 *   · 老档灵器：可能只有中文 `type`
 */
export const playerEquipSlotOfItem = item => {
  if (!item) return null
  const direct = item.equipSlot || item.slot || item.equipType
  if (EQUIP_SLOT_KEYS.includes(direct)) return direct
  if (item.category !== '灵器') return null
  return equipSlotOfType(item.type)
}

/**
 * 候选是否比当前这件更值得穿。
 * 分高者胜；同分比成色；再同就**不换**（避免每次点击都来回倒腾同一批）。
 */
export const isBetterPick = (candidate, current, scoreOf) => {
  if (!candidate) return false
  if (!current) return true
  const diff = scoreOf(candidate.stats) - scoreOf(current.stats)
  if (Math.abs(diff) > 1e-6) return diff > 0
  return equipQualityRank(candidate.quality) > equipQualityRank(current.quality)
}

/** 出战子嗣的分配顺序：境界高的先挑（与 `pickExpeditionChildren` 同一套排序） */
const compareChildren = (a, b) =>
  (Number(b?.realmLevel) || 0) - (Number(a?.realmLevel) || 0) ||
  (Number(a?.birthTime) || 0) - (Number(b?.birthTime) || 0) ||
  String(a?.id || '').localeCompare(String(b?.id || ''))

/**
 * 一键装备的**分配计划**（纯函数，不改入参，不落盘）。
 *
 * @param {object} input
 * @param {Array}  input.items             背包（混装；非装备原样留着）
 * @param {number} input.level             桂冈内功层数（扁平索引 1..18，判 requiredRealm）
 * @param {object} input.equippedArtifacts 桂冈当前 5 槽
 * @param {Array}  input.lockedSpecies     品种锁（baseId 数组）
 * @param {Array}  input.children          子嗣全量（内部自己筛「可出战」）
 * @param {number} input.nowGameSeconds    传给 `canFightOf`（当前判定不读年龄，留着传参对齐）
 * @param {object} [input.tuning]          子嗣调参
 * @returns {{ items:Array, player:Array, offspring:Array }}
 *   `items` 是应用后的背包；`player` / `offspring` 只列**真正换了**的槽。
 */
export const planAutoEquip = ({
  items = [],
  level = 1,
  equippedArtifacts = {},
  lockedSpecies = [],
  children = [],
  nowGameSeconds = 0,
  tuning
} = {}) => {
  const locks = new Set((lockedSpecies || []).filter(Boolean))
  const isLocked = item => !!item && !!item.baseId && locks.has(item.baseId)

  // 池子 = 背包里能穿的装备。被换下来的旧件会重新进池，供后面的人继续挑。
  const pool = []
  for (const item of items || []) {
    if (playerEquipSlotOfItem(item)) pool.push(item)
  }
  const taken = new Set()
  const released = []

  const take = item => {
    const index = pool.indexOf(item)
    if (index !== -1) pool.splice(index, 1)
    taken.add(item.id)
  }
  const release = item => {
    if (!item) return
    taken.delete(item.id)
    pool.push(item)
    released.push(item)
  }

  // ---------- 1. 桂冈 5 槽 ----------
  const player = []
  for (const slot of EQUIP_SLOT_KEYS) {
    const current = equippedArtifacts?.[slot] || null
    // 身上这件被锁了 → 整个槽跳过：不参与、也不被替换（§12.1 第 3 条）
    if (isLocked(current)) continue
    let best = null
    for (const item of pool) {
      if (isLocked(item)) continue
      if (playerEquipSlotOfItem(item) !== slot) continue
      if (item.requiredRealm && level < item.requiredRealm) continue
      if (!best || isBetterPick(item, best, playerEquipScore)) best = item
    }
    if (!best || !isBetterPick(best, current, playerEquipScore)) continue
    take(best)
    if (current) release(current)
    player.push({ slot, item: best, previous: current })
  }

  // ---------- 2. 出战子嗣 攻/防 两槽 ----------
  const fighters = (children || [])
    .filter(child => canFightOf(child, nowGameSeconds, tuning))
    .sort(compareChildren)

  const offspring = []
  const touched = new Set()
  for (const child of fighters) {
    const equipment = offspringEquipmentOf(child)
    for (const slot of OFFSPRING_EQUIP_SLOTS) {
      const current = equipment[slot] || null
      if (isLocked(current)) continue
      let best = null
      for (const item of pool) {
        if (isLocked(item)) continue
        if (equipmentSlotOfItem(item) !== slot) continue
        // 阶位超了穿不上（练气子嗣最高 2 阶），这条已经包含「是不是武器/防具」
        if (!canOffspringEquip(child, item).ok) continue
        if (!best || isBetterPick(item, best, offspringEquipScore)) best = item
      }
      if (!best || !isBetterPick(best, current, offspringEquipScore)) continue
      take(best)
      if (current) release(current)
      offspring.push({ childId: child.id, slot, item: best, previous: current })
      touched.add(child.id)
    }
  }

  // ---------- 3. 收尾：背包 = 没被穿走的 + 换下来没人要的 ----------
  const finalItems = (items || []).filter(item => !!item && !taken.has(item.id))
  const appended = new Set(finalItems.map(item => item.id))
  for (const item of released) {
    if (taken.has(item.id) || appended.has(item.id)) continue
    appended.add(item.id)
    finalItems.push(item)
  }

  return {
    items: finalItems,
    player,
    offspring,
    childCount: touched.size
  }
}
