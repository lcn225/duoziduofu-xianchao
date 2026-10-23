// 【郑家宝阁】—— 回收口与货币兑换的数值真源（纯数据 + 纯函数）
//
// 真源：
//   侍妾池 20 金页子/位 —— 《模块六》§九 · 《原作物价表》§四.2（P17 决议 2）
//   宝匣七阶定价 —— 《模块六》§九 · 《宝箱系统》§一
//   跨层兑换 3.8 / 3.2 金页子 —— 《模块六》§十（货币 v2，2026-10-20）
//   物品回收价 = 基础价 × 30%（成色不计）—— 《模块六》§9.2（P36 第 7 步，2026-10-23）
//
// ⚠ 货币 v2：价格一律换算成账本最小单位再存 ——
//   金页子 → 大子（×100），二阶 → 一阶（×100）。**经济数值一个都没改**，
//   只是换了个记账单位。

import { DENOMINATION, formatSecular, formatSpiritual } from './currency.js'

export const TUNING = {
  /** 随机凡女侍妾（P1–P6）。正妾 / 女修不入随机池。 */
  maiden: {
    /** 20 金页子 = 2,000 大子 */
    price: 20 * DENOMINATION.daZiPerJinYeZi,
    currency: 'secular',
    name: '凡女侍妾'
  },
  /**
   * 跨层手动兑换（《模块六》§十）。
   * 价差即手续费：买 3.8 / 卖 3.2 金页子 = 1 一阶。
   */
  exchange: {
    from: 'secular',
    to: 'spiritual',
    /** 买 1 一阶要 380 大子（3.8 金页子） */
    buyRate: DENOMINATION.secularPerSpiritualBuy,
    /** 卖 1 一阶得 320 大子（3.2 金页子） */
    sellRate: DENOMINATION.secularPerSpiritualSell,
    /** 不设限额（旧 10/30/100/300 金页子/天 作废） */
    dailyLimit: null
  },
  /** 洗命符不可购买（P17 决议 4） */
  fateCharmPurchasable: false
}

/**
 * 七阶宝匣。`price` 的单位仍是**二阶灵石**（模块六 §九，设计口径），
 * 结账时用 `chestPriceOf` 换算成 `spiritual`（一阶）。
 * `status: 'open'` = 坊市可买入；`'unavailable'` = 暂不流通（6/7 阶置灰）。
 *
 * 2026-10-21 Q4 定稿：1~5 阶按「TC 期望 × 3」定价（见《宝匣定价计算表-2026-10-21》）；
 * **6/7 阶不定价**（`price: null`）—— 它们不新增物品基阶、特殊道具又是占位，
 * 期望只比五阶高 14%，定价会塌成 221 二阶。只从突破/终局获得，坊市不卖。
 * 2026-10-22 Q3（P28.3）：买入已接 `inventory.buyChest`；**宝匣仍不可回卖**。
 */
export const CHEST_TIERS = [
  { tier: 1, name: '一阶木匣', material: '木匣', price: 1, status: 'open' },
  { tier: 2, name: '二阶铁匣', material: '铁匣', price: 3, status: 'open' },
  { tier: 3, name: '三阶铜匣', material: '铜匣', price: 13.5, status: 'open' },
  { tier: 4, name: '四阶银匣', material: '银匣', price: 54, status: 'open' },
  { tier: 5, name: '五阶金匣', material: '金匣', price: 194, status: 'open' },
  { tier: 6, name: '六阶玉匣', material: '玉匣', price: null, status: 'unavailable' },
  { tier: 7, name: '七阶仙匣', material: '仙匣', price: null, status: 'unavailable' }
]

/** 某阶宝匣的单价，单位**一阶灵石**（结账用）；未知阶级或不定价返回 null */
export const chestPriceOf = tier => {
  const found = CHEST_TIERS.find(chest => chest.tier === Number(tier))
  if (!found || found.price == null) return null
  return Math.round(found.price * DENOMINATION.stone1PerStone2)
}

/** 宝匣价格文案：`4.5 二阶` → `4 二阶 50 一阶` */
export const formatChestPrice = tier => {
  const price = chestPriceOf(tier)
  return price == null ? '—' : formatSpiritual(price)
}

/** 侍妾价格文案：`2,000 大子` → `20 金页子 0 大子` */
export const formatMaidenPrice = () => formatSecular(TUNING.maiden.price)

/** 坊市宝匣是否已开放（1~5 阶已接买入，2026-10-22 P28.3） */
export const chestShopOpen = () => CHEST_TIERS.some(chest => chest.status === 'open')

// ==================== 物品回收（《模块六》§9.2，Q3 定稿） ====================

/**
 * 物品基础价（**一阶灵石**，下品口径）：1/2/3/4/5 阶 = 6/24/96/384/1536，每阶约 ×4。
 * 真源《数值真值表》§5.8 · 《宝匣定价计算表-2026-10-21》§一 #2。
 * 物品基阶只有 1~5；表外（老档脏数据 / 不入品）不给价，也就不能卖。
 */
export const ITEM_BASE_PRICE = { 1: 6, 2: 24, 3: 96, 4: 384, 5: 1536 }

/** 回收率：基础价 × 30% */
export const RECYCLE_RATE = 0.3

/** 可回收的四池（灵器/灵兽/灵植/灵材）；丹药、残页、特殊道具、宝匣都不在此列 */
export const SELLABLE_CATEGORIES = ['灵器', '灵兽', '灵植', '灵材']

/** 某基阶的基础价；1~5 以外返回 null */
export const basePriceOfTier = tier => ITEM_BASE_PRICE[Math.trunc(Number(tier))] ?? null

/**
 * 单件回收价 = `max(1, round(基础价(tier) × 30%))`。
 *
 * ⚠ **成色、词条一律不影响回收价**（2026-10-23 P36 第 7 步）：
 *   旧的「折价 = 基础价 × 成色系数」整条删掉 —— 成色已经在装备面板里变过一次，
 *   再让它变成回收价就是同一份随机数卖两次。结果 **2 / 7 / 29 / 115 / 461**。
 *   这是**收益减少**，已登记《产出登记表》S02 / R20 变更记录。
 *
 * ⚠ **逐件四舍五入到整一阶**，并且单卖与一键售出走同一个函数 ——
 *   否则「一件件卖」和「一键卖」对同一件物品会给不同价格。
 *   例：1 阶 6 × 0.3 = 1.8 → 2；2 阶 24 × 0.3 = 7.2 → 7。
 *   取整后至少 1，避免出现「卖了但一分钱没有」。
 */
export const sellPriceOf = item => {
  const base = basePriceOfTier(item?.tier)
  if (base == null) return null
  return Math.max(1, Math.round(base * RECYCLE_RATE))
}

/**
 * 一件物品能不能进回收口。
 *   · 只收四池（丹药/残页/特殊道具不在 `items` 或不在四池里）
 *   · 基阶表外（tier 0 / 空）不卖
 *   · **品种锁**：同一 `baseId` 被锁 → 整种不卖（炼体药浴等将来共用这套锁）
 *   · **出战中灵宠**不卖（灵宠实例还在 `items` 里，卖出会让出战位指空）
 *   · 装备中的灵器本来就不在 `items` 里（`equipArtifact` 已把它挪进 `equippedArtifacts`）
 */
export const isSellable = (item, { lockedSpecies = [], activePetId = null } = {}) => {
  if (!item) return false
  if (!SELLABLE_CATEGORIES.includes(item.category)) return false
  if (sellPriceOf(item) == null) return false
  if (item.baseId && (lockedSpecies || []).includes(item.baseId)) return false
  if (activePetId && item.id === activePetId) return false
  return true
}

/** 可回收物品清单（带单价） */
export const recycleCandidates = (items = [], opts = {}) =>
  (items || [])
    .filter(item => isSellable(item, opts))
    .map(item => ({ item, price: sellPriceOf(item) }))

/** 一键售出的汇总：件数 + 总价（确认框用） */
export const sumRecycle = (items = [], opts = {}) => {
  const entries = recycleCandidates(items, opts)
  return {
    entries,
    count: entries.length,
    total: entries.reduce((sum, entry) => sum + entry.price, 0)
  }
}
