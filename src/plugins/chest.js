// 【宝箱底座】—— 七阶宝匣的 TC（Treasure Class）掉落引擎
//
// 真源：《宝箱系统》§一/§二/§四/§六 · 《物品池设计方案》§七 —— 底材 → 成色 → 实例。
//
// 2026-10-21 按 Q1/Q2 返工：
//   · 主 TC 五节点：NoDrop / 灵石 / 大类 / 残页 / 特殊道具。
//   · Pick：1~5 阶 = 5，6~7 阶 = 6（旧占位 3/3/4/4/5/5/6 作废）。
//   · 特殊道具 = 10 种占位（各阶一样、均分）；**洗命符不再从宝箱出**。
//   · 残页：调用方传 `fragmentPool`（未解锁的丹方/功法），没传就退回成物品。
//
// 2026-10-25（P41 #1）：特殊道具占主 TC **5% → 1%**，10 种均分（每种 0.1%）。
//   ⚠ 让出的 4% **全部并入 `item`（大类物品）**，不是丢进 NoDrop ——
//     净效果是**可用产出增加**（已登记《产出登记表》R15）。
//
// ⚠ **宝匣 7 阶是宝匣阶级，不是物品基阶**。物品最多五阶；
//   6/7 阶宝匣只出五阶极 + 特殊道具，不新增物品基阶。
//
// ⚠ 本文件**不落账、不存档、不碰 store**。谁调用谁负责把 entries 发给背包/货币。

import { CHEST_TIERS } from './shop.js'
import { createItemInstance, rollBaseItem, rollItemQuality } from './items.js'
import { itemTierKey } from './tiers.js'

/** 特殊道具：10 种占位（《宝箱系统》§6.3）。用途未开放，不可售/分解 */
export const SPECIAL_ITEMS = [
  { id: 'dongfu_map', name: '洞府宝图', description: '残破的兽皮图，墨迹模糊，只画了一半山势' },
  { id: 'red_nail', name: '红色长钉', description: '三寸长钉，通体赤红，触之微烫' },
  { id: 'black_nail', name: '黑色长钉', description: '同规格，漆黑如墨，入手冰凉' },
  { id: 'grey_slab', name: '灰白石板', description: '巴掌大的石板，表面刻着看不懂的纹路' },
  { id: 'taixu_compass', name: '太虚罗盘', description: '指针不指南北，缓慢乱转' },
  { id: 'broken_starmap', name: '残缺星图', description: '半张星图，缺了一大块，不知指向何处' },
  { id: 'blank_tablet', name: '无字木牌', description: '空白牌位，木质温润，不知供奉什么' },
  { id: 'silk_puppet', name: '缠丝木偶', description: '巴掌大的木偶，缠满红丝，看不出是谁缠的' },
  { id: 'frozen_cocoon', name: '冰封虫茧', description: '拳头大的茧，冰层封住，里面似乎有东西' },
  { id: 'dusty_bell', name: '蒙尘铜铃', description: '摇之无声，铜锈斑驳，不知原挂何处' }
]

/** 灵石掉落：货币 v2 一律记 `spiritual`（一阶）。数量仍是占位，等 Q4 定价表 */
export const TUNING = {
  /** 每箱执行多少次 Pick（《宝箱系统》§2.2） */
  picks: { 1: 5, 2: 5, 3: 5, 4: 5, 5: 5, 6: 6, 7: 6 },
  /**
   * 主 TC（%），按《宝箱系统》§2.2：
   *   1~2 阶 10/10/54/25/1；3~5 阶 10/10/59/20/1；6~7 阶 5/5/69/20/1
   * 特殊道具 2026-10-25（P41 #1）从 5 → 1，让出的 4 个百分点进了 `item`。
   */
  mainTC: {
    1: { noDrop: 10, currency: 10, item: 54, fragment: 25, special: 1 },
    2: { noDrop: 10, currency: 10, item: 54, fragment: 25, special: 1 },
    3: { noDrop: 10, currency: 10, item: 59, fragment: 20, special: 1 },
    4: { noDrop: 10, currency: 10, item: 59, fragment: 20, special: 1 },
    5: { noDrop: 10, currency: 10, item: 59, fragment: 20, special: 1 },
    6: { noDrop: 5, currency: 5, item: 69, fragment: 20, special: 1 },
    7: { noDrop: 5, currency: 5, item: 69, fragment: 20, special: 1 }
  },
  /** TODO(Q4)：灵石数量占位，定价表出来前先不动 */
  currencyByTier: {
    1: { currency: 'spiritual', amount: [10, 30] },
    2: { currency: 'spiritual', amount: [30, 80] },
    3: { currency: 'spiritual', amount: [80, 200] },
    4: { currency: 'spiritual', amount: [100, 300] },
    5: { currency: 'spiritual', amount: [300, 800] },
    6: { currency: 'spiritual', amount: [800, 2000] },
    7: { currency: 'spiritual', amount: [2000, 5000] }
  },
  /** 本阶四池均分（《宝箱系统》§2.3） */
  categoryWeights: { 灵材: 25, 灵植: 25, 灵器: 25, 灵兽: 25 },
  /** 相对本箱阶级的降阶/越阶：15% 降一阶 / 5% 越一阶 */
  downgradeChance: 0.15,
  upgradeChance: 0.05,
  /** 成色权重：当前统一 60/25/12/3（《宝箱系统》§2.4，是否随阶变仍待定） */
  qualityWeights: { 下: 0.6, 中: 0.25, 上: 0.12, 极: 0.03 }
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
  const w = TUNING.mainTC[t]
  return [
    { kind: 'noDrop', weight: w.noDrop },
    { kind: 'currency', weight: w.currency },
    { kind: 'item', weight: w.item },
    { kind: 'fragment', weight: w.fragment },
    { kind: 'special', weight: w.special }
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

/** 成色 roll（当前不随阶变） */
export const rollChestQuality = (tier, rng = Math.random) => rollItemQuality(rng, TUNING.qualityWeights)

const rollAmount = ([lo, hi], rng) => {
  const a = Math.max(Math.floor(Number(lo) || 0), 0)
  const b = Math.max(Math.floor(Number(hi) || a), a)
  return a + Math.floor(rng() * (b - a + 1))
}

/**
 * 残页：从「未解锁的丹方 / 功法」里随机一张。
 * `fragmentPool` 形如 `[{ kind:'recipe'|'art', id, name, tier }]`，tier 是解锁所需物品阶。
 * 只取 `tier <= 本箱最高物品基阶` 的；没有就返回 null（调用方退回成物品）。
 */
export const rollFragment = (chestTier, fragmentPool = [], rng = Math.random) => {
  const cap = chestMaxItemTier(chestTier)
  const usable = fragmentPool.filter(f => Number(f?.tier) <= cap)
  if (!usable.length) return null
  return usable[Math.min(Math.floor(rng() * usable.length), usable.length - 1)]
}

/** 特殊道具：10 种均分 */
export const rollSpecialItem = (rng = Math.random) =>
  SPECIAL_ITEMS[Math.min(Math.floor(rng() * SPECIAL_ITEMS.length), SPECIAL_ITEMS.length - 1)]

/**
 * 开箱（**纯函数**）：给阶数，返回这一箱的掉落。
 *
 * @param {number} tier
 * @param {object|function} options  rng 函数或 `{ rng, fragmentPool }`
 * @returns {{ tier:number, entries:Array, picks:number, noDropCount:number }}
 *   entries:
 *     { kind:'item', baseId, base, quality, tierKey, displayName }
 *     { kind:'currency', currency, amount }
 *     { kind:'fragment', fragmentKind:'recipe'|'art', id, name }
 *     { kind:'special', id, name, description }
 */
export const openChest = (tier, options = {}) => {
  const opts = typeof options === 'function' ? { rng: options } : options
  const rng = opts.rng || Math.random
  const fragmentPool = Array.isArray(opts.fragmentPool) ? opts.fragmentPool : []
  const t = clampTier(tier)
  const nodes = chestNodesOf(t)
  const picks = TUNING.picks[t] || 5
  const entries = []
  let noDropCount = 0

  const pushItem = () => {
    const category = rollItemCategory(rng)
    const itemTier = rollItemTierForChest(t, rng)
    const base =
      rollBaseItem({ category, minTier: itemTier, maxTier: itemTier, rng }) ||
      // 该阶该池没有条目时，退到整个池子里同大类、最近阶
      rollBaseItem({ category, minTier: 1, maxTier: 5, rng })
    if (!base) return false
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
    return true
  }

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

    if (node.kind === 'fragment') {
      const fragment = rollFragment(t, fragmentPool, rng)
      // 没有可掉落的残页（都学完了）：退回成物品，避免「空节点」
      if (fragment) {
        entries.push({
          kind: 'fragment',
          fragmentKind: fragment.kind,
          id: fragment.id,
          name: fragment.name
        })
        continue
      }
      if (!pushItem()) noDropCount += 1
      continue
    }

    if (node.kind === 'special') {
      const special = rollSpecialItem(rng)
      entries.push({
        kind: 'special',
        id: special.id,
        name: special.name,
        description: special.description
      })
      continue
    }

    if (!pushItem()) noDropCount += 1
  }

  return { tier: t, entries, picks, noDropCount }
}
