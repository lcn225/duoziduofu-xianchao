// 【郑家宝阁】—— 回收口与货币兑换的数值真源（纯数据 + 纯函数）
//
// 真源：
//   侍妾池 20 金页子/位 —— 《模块六》§九 · 《原作物价表》§四.2（P17 决议 2）
//   宝匣七阶定价 —— 《模块六》§九 · 《宝箱系统》§一
//   大子→金页子 100:1 —— 《原作物价表》§一
//
// ⚠ 宝箱系统本身（TC 树 / 开箱 / 首通）属 P17 第 2~3 步，尚未落地。
//   本文件先提供价格与阶级名，商店页把它们展示成「未开放」。

export const TUNING = {
  /** 随机凡女侍妾（P1–P6）。正妾 / 女修不入随机池。 */
  maiden: {
    price: 20,
    currency: 'jinYeZi',
    /** 内宅人数上限在 plugins/innerCourt.js 的 TUNING.gacha.householdCap */
    name: '凡女侍妾'
  },
  /**
   * 大子 → 金页子 的手动兑换骨架。
   * 手续费与限额在《模块六》§十 仍是「待反推」：先按 0 手续费 / 不限额跑通，
   * 反推完再改这里的两个数。
   */
  exchange: {
    from: 'daZi',
    to: 'jinYeZi',
    /** 100 大子 = 1 金页子（《原作物价表》§一） */
    rate: 100,
    feeRate: 0,
    /** 限额暂不实现（TODO：按阶段 10/30/100/300 金页子/天） */
    dailyLimit: null
  },
  /** 洗命符不可购买（P17 决议 4） */
  fateCharmPurchasable: false
}

/**
 * 七阶宝匣。`price` 的单位是**二阶灵石**（模块六 §九）。
 * `status: 'planned'` = 价格已定、系统未落地，商店里显示「未开放」。
 */
export const CHEST_TIERS = [
  { tier: 1, name: '一阶木匣', material: '木匣', price: 1, status: 'planned' },
  { tier: 2, name: '二阶铁匣', material: '铁匣', price: 4.5, status: 'planned' },
  { tier: 3, name: '三阶铜匣', material: '铜匣', price: 20, status: 'planned' },
  { tier: 4, name: '四阶银匣', material: '银匣', price: 90, status: 'planned' },
  { tier: 5, name: '五阶金匣', material: '金匣', price: 400, status: 'planned' },
  { tier: 6, name: '六阶玉匣', material: '玉匣', price: 1800, status: 'planned' },
  { tier: 7, name: '七阶仙匣', material: '仙匣', price: 8000, status: 'planned' }
]

/** 某阶宝匣的单价（二阶灵石）；未知阶级返回 null */
export const chestPriceOf = tier => {
  const found = CHEST_TIERS.find(chest => chest.tier === Number(tier))
  return found ? found.price : null
}

/** 宝箱系统是否已开放（当前恒 false；第 3 步落地后按功能开关改） */
export const chestShopOpen = () => CHEST_TIERS.some(chest => chest.status === 'open')
