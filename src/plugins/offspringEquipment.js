// 子嗣装备（P36 第 3 步；《装备系统》§十一 / 模块二 §15.3）
//
// 四槽里本批只开两个 **实际穿装备** 的槽：
//   攻（weapon）→ 攻击加算
//   防（body）  → 防御 / 生命加算
// 另外两槽按原设计**本来就不加算**，只做占位提示：
//   同参 → 只提供契合度，走课题 B（P37 未落地）
//   灵兽 → 独立出战单位，子嗣侧还没有灵兽配置
//
// 公式（《装备系统》§十一）：
//   四属性 = 基础值 × 境界系数 × 灵根系数 × 本命系数 × (1 + Σ词条) + 装备面板
// **装备面板加算在最后**，不乘境界/灵根/本命 —— 它存在的意义是给低境界子嗣补短板。
//
// ⚠ 词条里的几率类属性（critRate / dodgeRate …）**不进子嗣面板**：模块二 §15.3
//   把子嗣战斗简化成「气血 / 战力」，秘境单位也只认 health/damage/defense/speed 四条
//   加暴击闪避的默认值。装备在子嗣身上只有「攻击 → damage」这一条换算。
import { equipSlotOfType } from './equipment.js'

/** 子嗣真正能穿的两个槽（顺序 = UI 展示顺序） */
export const OFFSPRING_EQUIP_SLOTS = ['weapon', 'body']

/** 槽位键 → 子嗣侧叫法（攻 / 防，与《装备系统》§十一 的表一致） */
export const OFFSPRING_EQUIP_SLOT_NAME = { weapon: '攻', body: '防' }

/** 未开放的两个槽（占位说明，UI 直接渲染） */
export const OFFSPRING_LOCKED_SLOTS = [
  { key: 'companion', name: '同参', note: '只提供契合度，等课题 B（P37）' },
  { key: 'beast', name: '灵兽', note: '独立出战单位，子嗣灵兽未做' }
]

/**
 * 境界段 → 可穿最高阶（**沿用 P30 的「境界段定阶」**，与掉落口径同一张表）：
 *   练气 一/二阶、筑基 二/三阶、结丹 三/四阶。
 *
 * 子嗣现在封顶练气九层（`offspringCultivation.maxLevel = 9`），实际只会读到 2。
 * 改这里就等于改「子嗣能不能穿高阶装备」，别在别处再写一套阈值。
 */
const SEGMENT_MAX_TIER = { qi: 2, foundation: 3, core: 4 }
const SEGMENT_NAME = { qi: '练气', foundation: '筑基', core: '结丹' }
/** 段起点层（与 realm.js 的扁平索引对齐：练气 1~10、筑基 11~20、结丹 21~30） */
const SEGMENT_START_LEVEL = { foundation: 11, core: 21 }

const round1 = value => Math.round(value * 10) / 10
const num = value => (Number.isFinite(Number(value)) ? Number(value) : 0)

/** 空槽位结构（新子嗣与老档迁移共用同一份形状） */
export const emptyOffspringEquipment = () => ({ weapon: null, body: null })

/** 读子嗣装备（缺字段 / 脏档都兜底成空槽） */
export const offspringEquipmentOf = child => {
  const out = emptyOffspringEquipment()
  const raw = child?.equipment
  if (!raw || typeof raw !== 'object') return out
  for (const slot of OFFSPRING_EQUIP_SLOTS) out[slot] = raw[slot] || null
  return out
}

/**
 * 一件物品能进子嗣哪个槽；不合适的返回 null。
 *
 * 三种来源要都认：
 *   · 物品池灵器：有 `equipSlot`，中文 `type` 派生槽位
 *   · 炼器产物：只有 `slot` / `equipType`，且槽位键就是 5 槽键（没有 category）
 *   · 老档灵器：可能只有中文 `type`
 */
export const equipmentSlotOfItem = item => {
  if (!item) return null
  const direct = item.equipSlot || item.slot || item.equipType
  if (OFFSPRING_EQUIP_SLOTS.includes(direct)) return direct
  // 有明确槽位但不在这两槽里（头饰/饰品/法宝）→ 子嗣穿不了，别再按中文 type 猜
  if (direct) return null
  if (item.category !== '灵器') return null
  const derived = equipSlotOfType(item.type)
  return OFFSPRING_EQUIP_SLOTS.includes(derived) ? derived : null
}

/** 子嗣当前境界段 */
export const offspringRealmSegmentOf = child => {
  const level = Math.floor(Number(child?.realmLevel) || 0)
  if (level >= SEGMENT_START_LEVEL.core) return 'core'
  if (level >= SEGMENT_START_LEVEL.foundation) return 'foundation'
  return 'qi'
}

/** 该子嗣能穿的最高阶（1~5） */
export const offspringMaxTierOf = child => SEGMENT_MAX_TIER[offspringRealmSegmentOf(child)]

/**
 * 能不能穿这件。返回 `{ ok, slot }` 或 `{ ok:false, reason }`。
 *
 * 规则（《模块二》§15.4「子嗣境界不够，穿不上高阶装备」+ P30 境界段定阶）：
 *   · 只能是武器 / 防具
 *   · 阶不能超过境界段上限（练气 T1–T2）
 * ⚠ 已陨落 / 已故的子嗣只允许卸下，不允许再穿 —— 调用方按 `status` 自行判断。
 */
export const canOffspringEquip = (child, item) => {
  if (!child) return { ok: false, reason: '子嗣不存在' }
  if (!item) return { ok: false, reason: '物品不存在' }
  const slot = equipmentSlotOfItem(item)
  if (!slot) return { ok: false, reason: '子嗣只能穿武器与防具' }
  const tier = Math.min(Math.max(Math.floor(Number(item.tier) || 1), 1), 5)
  const maxTier = offspringMaxTierOf(child)
  if (tier > maxTier) {
    const segment = SEGMENT_NAME[offspringRealmSegmentOf(child)]
    return { ok: false, reason: `境界不足：${segment}子嗣最高只能穿 ${maxTier} 阶` }
  }
  return { ok: true, slot }
}

/**
 * 装备面板（已穿两槽的合计，**不乘任何系数**）。
 * `attack` 在 `buildOffspringUnit` 里换算成 `damage`。
 */
export const offspringPanelOf = child => {
  const total = { attack: 0, defense: 0, health: 0, speed: 0 }
  const equipment = offspringEquipmentOf(child)
  for (const slot of OFFSPRING_EQUIP_SLOTS) {
    const stats = equipment[slot]?.stats || {}
    for (const key of Object.keys(total)) total[key] += num(stats[key])
  }
  for (const key of Object.keys(total)) total[key] = round1(total[key])
  return total
}

/** 已穿几件（UI 按钮上的 1/2 用） */
export const offspringEquippedCountOf = child =>
  OFFSPRING_EQUIP_SLOTS.reduce((n, slot) => n + (offspringEquipmentOf(child)[slot] ? 1 : 0), 0)

/** 背包里能穿给这个子嗣的物品（槽位对得上、阶位够得着） */
export const eligibleOffspringItemsOf = (child, items = []) =>
  (items || []).filter(item => canOffspringEquip(child, item).ok)
