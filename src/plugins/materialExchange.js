// 【灵材定向兑换】纯函数层（2026-11-01）
//
// 真源：《炼体药浴》§附录 A.3「同级定向二换一」——2026-11-01 改口径为 **三换二**，
//       并在**坊市「兑换」页**落地（原计划顺延 B11 百艺）。
//
// 一句话：`3 件同阶任意五系灵材/灵植 → 2 件同阶指定系`。
// 为什么需要它：药浴要求**五系同时 ≥ floor**，而探索掉落的五系分布天然偏斜
// （2026-11-01 配平前：金 40% / 木 30% / 水火土 8~11%，见日报 §十三）。
// 配平后单图最短板仍有 7.5~9.4%，本工具是「缺一系停摆」的兜底。
//
// ⚠ 本文件是**纯函数**：不 import store / Vue、不写存档。随机一份由调用方注入。

import { BATH_CATEGORIES, BATH_ELEMENTS, elementOf } from './bath.js'
import { ITEM_POOL, createItemInstance, rollItemQuality } from './items.js'
import { unitsOf } from './stacks.js'

/** 兑换比例：3 件 → 2 件（67% 效率）。改这个等于改灵材经济的汇率。 */
export const EXCHANGE_TUNING = { cost: 3, gain: 2 }

/** 产物成色：与宝匣同一套权重（下 60 / 中 25 / 上 12 / 极 3） */
export const EXCHANGE_QUALITY_WEIGHTS = { 下: 0.6, 中: 0.25, 上: 0.12, 极: 0.03 }

/** 某系某阶的产出底材（灵材 + 灵植，五系） */
export const exchangeBasesOf = (element, tier) =>
  ITEM_POOL.filter(
    item =>
      BATH_CATEGORIES.includes(item.category) &&
      item.fateElement === element &&
      item.tier === tier
  )

/** 该阶能换出的五个系里，哪些真有底材（没底材的档位 UI 要灰掉） */
export const exchangeableElementsOf = tier =>
  BATH_ELEMENTS.filter(el => exchangeBasesOf(el, Math.floor(Number(tier) || 0)).length > 0)

/**
 * 能不能拿去换：品类 / 五系 / 未装备 / 在背包 / 未锁品种 / 非同参 / 非出战灵宠。
 * 口径与药浴漏斗一致（`bath.isBathEligible`），只少一条「产气 > 0」。
 */
export const isExchangeable = (item, opts = {}) => {
  if (!item || !item.id) return false
  const { lockedSpecies = [], activeFateItemId = null, activePetId = null, equippedIds = [] } = opts
  if (!BATH_CATEGORIES.includes(item.category)) return false
  if (item.equippedBy) return false
  if (item.location && item.location !== 'inventory') return false
  if (activePetId && item.id === activePetId) return false
  if (item.baseId && (lockedSpecies || []).includes(item.baseId)) return false
  if (activeFateItemId && item.baseId === activeFateItemId) return false
  if ((equippedIds || []).includes(item.id)) return false
  return !!elementOf(item)
}

/**
 * 库存盘点：`{ [tier]: { metal, wood, water, fire, earth } }`，单位是**件**（不是条目数）。
 * 灵材/灵植是一条带 `count` 的堆，所以必须走 `unitsOf`。
 */
export const exchangeStockOf = (items = [], opts = {}) => {
  const stock = {}
  for (const item of items || []) {
    if (!isExchangeable(item, opts)) continue
    const el = elementOf(item)
    const tier = Math.floor(Number(item.tier) || 0)
    if (!tier || !el) continue
    stock[tier] ||= { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 }
    stock[tier][el] += unitsOf(item)
  }
  return stock
}

/**
 * 换出源：该阶**件数最多**、且不是目标系的系（并列时按五系固定顺序取靠前的）。
 * 让玩家不用自己算「哪一系堆成山了」。
 */
export const pickSourceElementOf = (byElement = {}, targetElement) => {
  let best = null
  let bestUnits = 0
  for (const el of BATH_ELEMENTS) {
    if (el === targetElement) continue
    const units = Number(byElement?.[el]) || 0
    if (units > bestUnits) {
      best = el
      bestUnits = units
    }
  }
  return best
}

/**
 * 一次兑换的计划（不扣不改）。
 *
 * @param {object} opts
 *   `items` 背包（用来挑出要被吃掉的**具体条目**）
 *   `tier` 物品基阶 1~5
 *   `targetElement` 要换成的系
 *   `lockedSpecies / activeFateItemId / activePetId / equippedIds` 同药浴漏斗
 * @returns {{ok:boolean, reason?:string, sourceElement?:string,
 *            consumed?:Array, gain?:number, bases?:Array}}
 *   `consumed` = 「一件一条」的清单（同一摞可能出现多次），供 `planFromUnits` 汇总扣料。
 *   `bases` = 产出底材（同一件可能出现 `gain` 次）。
 */
export const planExchange = (opts = {}) => {
  const { items = [], tier, targetElement } = opts
  const t = Math.floor(Number(tier) || 0)
  if (!t || t < 1 || t > 5) return { ok: false, reason: '阶不合法' }
  if (!BATH_ELEMENTS.includes(targetElement)) return { ok: false, reason: '目标系不合法' }
  const bases = exchangeBasesOf(targetElement, t)
  if (!bases.length) return { ok: false, reason: '该阶没有这一系的底材' }

  const stock = exchangeStockOf(items, opts)
  const byElement = stock[t] || {}
  const sourceElement = pickSourceElementOf(byElement, targetElement)
  const { cost, gain } = EXCHANGE_TUNING
  if (!sourceElement || (Number(byElement[sourceElement]) || 0) < cost) {
    return { ok: false, reason: `该阶凑不齐 ${cost} 件可换材料` }
  }

  // 吃料顺序：**同阶、源系**里先低成色、再按背包含原顺序（确定性，离线重放才对得上）
  const QUALITY_ORDER = { 下: 0, 中: 1, 上: 2, 极: 3 }
  const pool = (items || [])
    .filter(item => isExchangeable(item, opts))
    .filter(item => Math.floor(Number(item.tier) || 0) === t && elementOf(item) === sourceElement)
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        (QUALITY_ORDER[a.item.quality] ?? 1) - (QUALITY_ORDER[b.item.quality] ?? 1) ||
        a.index - b.index
    )

  const consumed = []
  for (const { item } of pool) {
    for (let u = 0; u < unitsOf(item) && consumed.length < cost; u += 1) consumed.push(item)
    if (consumed.length >= cost) break
  }
  if (consumed.length < cost) return { ok: false, reason: `该阶凑不齐 ${cost} 件可换材料` }

  return { ok: true, sourceElement, consumed, gain, bases }
}

/** 生成 `gain` 件产物实例（底材随机、成色随机） */
export const rollExchangeOutput = (bases = [], gain = EXCHANGE_TUNING.gain, rng = Math.random) => {
  if (!bases?.length) return []
  const out = []
  for (let i = 0; i < gain; i += 1) {
    const base = bases[Math.min(Math.floor(rng() * bases.length), bases.length - 1)]
    const quality = rollItemQuality(rng, EXCHANGE_QUALITY_WEIGHTS)
    out.push(createItemInstance(base, { quality, rng }))
  }
  return out
}
