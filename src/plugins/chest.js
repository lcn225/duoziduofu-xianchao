// 【宝箱底座】—— 七阶宝匣的 TC（Treasure Class）掉落引擎（P17 第 2 步）
//
// 真源：《宝箱系统》§一/§二/§六 · 《物品池设计方案》§七 —— 底材 → 成色 → 实例。
//
// **这一步只做引擎，不接获取途径、不开商店**：
//   · 宝匣价格/阶级在 `plugins/shop.js`（1 / 4.5 / 20 / 90 / 400 / 1800 / 8000 二阶）。
//   · 本文件只负责「给定阶数，roll 出一组掉落」。
//   · TC 的具体权重、成色概率、灵石数量标了 TODO(数值真值表)，
//     第 3 步接宝箱/扫荡时再按真值表改，**不要在其他地方复制这套数字**。
//
// ⚠ **宝匣 7 阶是宝匣阶级，不是物品基阶**。物品最多五阶；
//   6/7 阶宝匣只出五阶极 + 特殊道具，不新增物品基阶。

import { CHEST_TIERS } from './shop.js'
import { createItemInstance, rollBaseItem, rollItemQuality } from './items.js'
import { itemTierKey } from './tiers.js'

/** TODO(数值真值表)：全部是占位，第 3 步统一调 */
export const TUNING = {
  /** 每箱执行多少次 Pick（遍历 TC） */
  picks: { 1: 3, 2: 3, 3: 4, 4: 4, 5: 5, 6: 5, 7: 6 },
  /** 空包权重（NoDrop） */
  noDrop: { 1: 15, 2: 12, 3: 10, 4: 8, 5: 5, 6: 4, 7: 3 },
  /** 直接掉钱权重 */
  currency: { 1: 35, 2: 33, 3: 30, 4: 27, 5: 15, 6: 12, 7: 10 },
  /** 特殊道具权重（四阶以上才有） */
  special: { 1: 0, 2: 0, 3: 0, 4: 3, 5: 5, 6: 6, 7: 8 },
  /**
   * 灵石掉落：货币 v2 一律记 `spiritual`（一阶总数）。
   * 原表「四阶起给二阶」已按 ×100 折成一阶，经济数值不变。
   */
  currencyByTier: {
    1: { currency: 'spiritual', amount: [10, 30] },
    2: { currency: 'spiritual', amount: [30, 80] },
    3: { currency: 'spiritual', amount: [80, 200] },
    4: { currency: 'spiritual', amount: [100, 300] },
    5: { currency: 'spiritual', amount: [300, 800] },
    6: { currency: 'spiritual', amount: [800, 2000] },
    7: { currency: 'spiritual', amount: [2000, 5000] }
  },
  /** 物品大类权重（第一层掷中「物品」后） */
  categoryWeights: { 灵材: 30, 灵植: 25, 灵器: 25, 灵兽: 20 },
  /** 相对本箱阶级的降阶/越阶：15% 降一阶 / 5% 越一阶 */
  downgradeChance: 0.15,
  upgradeChance: 0.05,
  /** 成色权重（成色只决定实例品质，不改变底材 tier） */
  qualityWeights: {
    1: { 下: 0.60, 中: 0.28, 上: 0.10, 极: 0.02 },
    2: { 下: 0.60, 中: 0.28, 上: 0.10, 极: 0.02 },
    3: { 下: 0.55, 中: 0.30, 上: 0.12, 极: 0.03 },
    4: { 下: 0.50, 中: 0.28, 上: 0.15, 极: 0.07 },
    // 五阶金匣按《宝箱系统》§2.2 的示例：60 / 25 / 12 / 3
    5: { 下: 0.60, 中: 0.25, 上: 0.12, 极: 0.03 },
    6: { 下: 0.50, 中: 0.25, 上: 0.15, 极: 0.10 },
    7: { 下: 0.45, 中: 0.25, 上: 0.18, 极: 0.12 }
  },
  /**
   * 洗命符：**不可购买**，只从四阶以上宝箱 / 秘境大 Boss 首杀极低概率掉。
   * 这里给「特殊道具」节点内部再掷一次的概率。
   */
  fateCharmChance: 0.05
}

const clampTier = tier => Math.min(Math.max(Math.floor(Number(tier) || 1), 1), 7)

/** 该宝匣能开出的最高**物品基阶**（6/7 阶匣仍只到五阶） */
export const chestMaxItemTier = tier => Math.min(clampTier(tier), 5)

/** 宝匣的显示信息（价格/名称来自 shop.js） */
export const chestMetaOf = tier => CHEST_TIERS.find(chest => chest.tier === clampTier(tier)) || null

/** 通用加权抽取。权重非正数的节点会被跳过；全 0 时返回 null */
export const pickWeighted = (nodes = [], rng = Math.random) => {
  const usable = nodes.filter(node => Number(node?.weight) > 0)
  const total = usable.reduce((sum, node) => sum + Number(node.weight), 0)
  if (!total) return null
  const roll = rng() * total
  let acc = 0
  for (const node of usable) {
    acc += Number(node.weight)
    if (roll < acc) return node
  }
  return usable[usable.length - 1]
}

/** 第一层 TC 节点（每次 Pick 走一遍） */
export const chestNodesOf = tier => {
  const t = clampTier(tier)
  return [
    { kind: 'noDrop', weight: TUNING.noDrop[t] || 0 },
    { kind: 'currency', weight: TUNING.currency[t] || 0 },
    { kind: 'item', weight: Math.max(100 - (TUNING.noDrop[t] || 0) - (TUNING.currency[t] || 0) - (TUNING.special[t] || 0), 0) },
    { kind: 'special', weight: TUNING.special[t] || 0 }
  ]
}

/** 物品大类的加权抽取 */
export const rollItemCategory = (rng = Math.random) => {
  const node = pickWeighted(
    Object.entries(TUNING.categoryWeights).map(([category, weight]) => ({ category, weight })),
    rng
  )
  return node?.category || '灵材'
}

/**
 * 物品相对本箱阶级的降阶/越阶。
 * 例：五阶匣 15% 出四阶、5% 出（封顶五阶）、80% 出五阶。
 */
export const rollItemTierForChest = (chestTier, rng = Math.random) => {
  const base = chestMaxItemTier(chestTier)
  const r = rng()
  if (r < TUNING.downgradeChance) return Math.max(base - 1, 1)
  if (r >= 1 - TUNING.upgradeChance) return Math.min(base + 1, 5)
  return base
}

/** 成色 roll（按宝匣阶级取权重） */
export const rollChestQuality = (tier, rng = Math.random) =>
  rollItemQuality(rng, TUNING.qualityWeights[clampTier(tier)])

const rollAmount = ([lo, hi], rng) => {
  const a = Math.max(Math.floor(Number(lo) || 0), 0)
  const b = Math.max(Math.floor(Number(hi) || a), a)
  return a + Math.floor(rng() * (b - a + 1))
}

/**
 * 开箱（**纯函数**）：给阶数，返回这一箱的掉落。
 *
 * @returns {{ tier:number, entries:Array, picks:number, noDropCount:number }}
 *   entries:
 *     { kind:'item', baseId, base, quality, tierKey, displayName }
 *     { kind:'currency', currency, amount }
 *     { kind:'special', id:'fate_charm', name:'洗命符' }
 *
 * ⚠ 这里**不落账、不存档、不碰 store**。谁调用谁负责把 entries 发给背包/货币。
 */
export const openChest = (tier, rng = Math.random) => {
  const t = clampTier(tier)
  const nodes = chestNodesOf(t)
  const picks = TUNING.picks[t] || 3
  const entries = []
  let noDropCount = 0

  for (let i = 0; i < picks; i += 1) {
    const node = pickWeighted(nodes, rng)
    if (!node || node.kind === 'noDrop') {
      noDropCount += 1
      continue
    }

    if (node.kind === 'currency') {
      const spec = TUNING.currencyByTier[t]
      entries.push({
        kind: 'currency',
        currency: spec.currency,
        amount: rollAmount(spec.amount, rng)
      })
      continue
    }

    if (node.kind === 'special') {
      // 特殊节点内部再掷一次：命中给洗命符，否则退回成一件物品，避免「空节点」
      if (rng() < TUNING.fateCharmChance) {
        entries.push({ kind: 'special', id: 'fate_charm', name: '洗命符' })
        continue
      }
      // fallthrough：按物品处理
    }

    const category = rollItemCategory(rng)
    const itemTier = rollItemTierForChest(t, rng)
    const base = rollBaseItem({ category, minTier: itemTier, maxTier: itemTier, rng })
      // 该阶该池没有条目时，退到整个池子里同大类、最近阶
      || rollBaseItem({ category, minTier: 1, maxTier: 5, rng })
    if (!base) continue
    const quality = rollChestQuality(t, rng)
    const instance = createItemInstance(base, { quality })
    entries.push({
      kind: 'item',
      baseId: base.id,
      base: {
        id: base.id,
        name: base.name,
        category: base.category,
        type: base.type,
        series: base.series,
        tier: base.tier,
        fateElement: base.fateElement,
        description: base.description
      },
      quality,
      tierKey: itemTierKey(base.tier, quality),
      displayName: instance.displayName
    })
  }

  return { tier: t, entries, picks, noDropCount }
}
