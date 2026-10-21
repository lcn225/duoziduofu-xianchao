// 【郑家宝阁】—— 回收口与货币兑换的数值真源（纯数据 + 纯函数）
//
// 真源：
//   侍妾池 20 金页子/位 —— 《模块六》§九 · 《原作物价表》§四.2（P17 决议 2）
//   宝匣七阶定价 —— 《模块六》§九 · 《宝箱系统》§一
//   跨层兑换 3.8 / 3.2 金页子 —— 《模块六》§十（货币 v2，2026-10-20）
//
// ⚠ 货币 v2：价格一律换算成账本最小单位再存 ——
//   金页子 → 大子（×100），二阶 → 一阶（×100）。**经济数值一个都没改**，
//   只是换了个记账单位。
// ⚠ 宝箱系统本身（TC 树 / 开箱 / 首通）尚未落地，商店页显示「未开放」。

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
 * `status: 'planned'` = 价格已定、系统未落地，商店里显示「未开放」。
 *
 * 2026-10-21 Q4 定稿：1~5 阶按「TC 期望 × 3」定价（见《宝匣定价计算表-2026-10-21》）；
 * **6/7 阶不定价**（`price: null`）—— 它们不新增物品基阶、特殊道具又是占位，
 * 期望只比五阶高 14%，定价会塌成 221 二阶。只从突破/终局获得，坊市不卖。
 */
export const CHEST_TIERS = [
  { tier: 1, name: '一阶木匣', material: '木匣', price: 1, status: 'planned' },
  { tier: 2, name: '二阶铁匣', material: '铁匣', price: 3, status: 'planned' },
  { tier: 3, name: '三阶铜匣', material: '铜匣', price: 13.5, status: 'planned' },
  { tier: 4, name: '四阶银匣', material: '银匣', price: 54, status: 'planned' },
  { tier: 5, name: '五阶金匣', material: '金匣', price: 194, status: 'planned' },
  { tier: 6, name: '六阶玉匣', material: '玉匣', price: null, status: 'planned' },
  { tier: 7, name: '七阶仙匣', material: '仙匣', price: null, status: 'planned' }
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

/** 宝箱系统是否已开放（当前恒 false；第 3 步落地后按功能开关改） */
export const chestShopOpen = () => CHEST_TIERS.some(chest => chest.status === 'open')
