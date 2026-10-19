// 背包与资源
//
// items 是混装数组：装备、丹药（type: 'pill'）、灵宠（type: 'pet'）都放在一起，
// 按 type 区分。多个模块会读写它，改动时注意别破坏其他类型的元素。
import {
  addCurrency,
  createCurrency,
  exchangeDaZiForJinYeZi as exchangeDaZiForJinYeZiPure,
  isCurrencyKey,
  legacyStonesToDaZi,
  spendCurrencyFrom
} from '../../plugins/currency.js'

export const state = () => ({
  /**
   * 双层货币（P17，2026-10-19）：大子 / 金页子 / 一阶灵石 / 二阶灵石。
   * 真源与汇率说明见 `plugins/currency.js`；**两层不折算**。
   */
  currency: createCurrency(),
  /**
   * ⚠ **旧版「灵石」，只作老档迁移来源**（1 旧 = 10 大子，P17 决议 3）。
   * `migrateLegacyCurrency()` 读档时把它搬进 `currency.daZi` 并清零；
   * 新代码**一律不再读写这个字段**。留着键是为了让老档能通过 `deepMerge`。
   */
  spiritStones: 0,
  reinforceStones: 0, // 强化石数量
  refinementStones: 0, // 洗练石数量
  /**
   * 洗命符：子嗣诞生时可消耗 1 张，重抽灵根/本命/词条。
   * 开局送 **5 张、不可购买**（P17 决议 4）；后续只从四阶以上宝箱 /
   * 秘境大 Boss 首杀极低概率掉落。**缺省值会通过 deepMerge 补给老档**
   * （老档里已有的张数保持不变，不没收）。
   */
  fateCharms: 5,
  herbs: [], // 灵草库存
  items: [] // 物品库存（装备/丹药/灵宠混存）
})

export const getters = {}

export const actions = {
  // ---------- 货币 ----------

  /**
   * 获得货币。key 见 `plugins/currency.js` 的 CURRENCY_KEYS。
   * 未知键直接返回 false（不静默加到错误的位置）。
   */
  gainCurrency(key, amount = 0) {
    if (!isCurrencyKey(key)) return false
    const next = addCurrency(this.currency, key, amount)
    if (next[key] === this.currency?.[key]) return false
    this.currency = next
    this.saveData()
    return true
  },

  /** 扣除货币。余额不足返回 false，不扣。 */
  spendCurrency(key, amount = 0) {
    const result = spendCurrencyFrom(this.currency, key, amount)
    if (!result.ok) return false
    this.currency = result.currency
    this.saveData()
    return true
  },

  /**
   * 大子 → 金页子（郑家宝阁的兑换骨架）。
   * 汇率与手续费的真源在 `plugins/shop.js` 的 TUNING.exchange；本 action 只执行。
   *
   * @returns 纯函数 `exchangeDaZiForJinYeZi` 的结果 { ok, currency, costDaZi, gainedJinYeZi }
   */
  exchangeDaZiToJinYeZi(jinYeZi, feeRate = 0) {
    const result = exchangeDaZiForJinYeZiPure(this.currency, jinYeZi, { feeRate })
    if (!result.ok) return result
    this.currency = result.currency
    this.saveData()
    return result
  },

  /**
   * 老档迁移（P17 决议 3）：旧 `spiritStones` × 10 → `currency.daZi`，
   * 迁完把旧字段清零。**幂等** —— 第二次调用返回 0。
   *
   * ⚠ 必须在任何模块读钱之前调用（`persistence.initializePlayer` 里紧跟 deepMerge）。
   *   不 bump SAVE_VERSION：这是结构兼容迁移，不是「旧档作废」。
   *
   * @returns {number} 本次迁移得到的大子数；0 表示无需迁移
   */
  migrateLegacyCurrency() {
    const legacy = Number(this.spiritStones) || 0
    if (legacy <= 0) {
      // 脏值（负数/NaN）也顺手清掉，免得下次又跑一遍
      if (this.spiritStones !== 0) this.spiritStones = 0
      return 0
    }
    const daZi = legacyStonesToDaZi(legacy)
    this.currency = addCurrency(this.currency, 'daZi', daZi)
    this.spiritStones = 0
    return daZi
  },

  /** 获得洗命符（活动/补偿用；开局 5 张在 state 默认值里） */
  gainFateCharm(amount = 1) {
    const n = Math.max(Number(amount) || 0, 0)
    if (!n) return
    this.fateCharms += n
    this.saveData()
  },

  /** 消耗洗命符。数量不足返回 false，不扣 */
  spendFateCharm(amount = 1) {
    const n = Math.max(Number(amount) || 0, 0)
    if (!n) return true
    if ((Number(this.fateCharms) || 0) < n) return false
    this.fateCharms -= n
    this.saveData()
    return true
  },

  // 获得物品
  gainItem(item) {
    this.items.push(item)
    this.itemsFound++ // 增加获得物品统计
    this.saveData()
  },
  // 添加装备到背包
  addEquipment(equipment) {
    if (!this.items) {
      this.items = []
    }
    this.items.push(equipment)
    this.saveData()
  },
  // 卖出装备
  async sellEquipment(equipment) {
    const index = this.items.findIndex(i => i.id === equipment.id)
    if (index === -1) {
      return { success: false, message: '装备不存在' }
    }
    return new Promise(resolve => {
      const worker = new Worker(new URL('../../workers/equipment.js', import.meta.url))
      worker.onmessage = e => {
        const { stoneAmount, itemId } = e.data
        this.reinforceStones += stoneAmount
        const index = this.items.findIndex(i => i.id === itemId)
        if (index > -1) {
          this.items.splice(index, 1)
        }
        this.saveData()
        worker.terminate()
        resolve({ success: true, message: `成功卖出装备，获得${stoneAmount}个强化石` })
      }
      // 只传递必要的数据
      worker.postMessage({
        type: 'single',
        equipment: {
          id: equipment.id,
          quality: equipment.quality
        }
      })
    })
  },
  // 批量卖出装备
  async batchSellEquipments(quality = null, equipmentType = null) {
    return new Promise(resolve => {
      const worker = new Worker(new URL('../../workers/equipment.js', import.meta.url))
      worker.onmessage = e => {
        const { totalStones, itemsToRemove, count } = e.data
        this.reinforceStones += totalStones
        this.items = this.items.filter(item => !itemsToRemove.includes(item.id))
        this.saveData()
        worker.terminate()
        resolve({
          success: true,
          message: `成功卖出${count}件装备，获得${totalStones}个强化石`
        })
      }
      // 将数据转换为纯对象数组
      const itemsToSell = this.items
        .filter(item => {
          if (!item || !item.type || item.type === 'pill' || item.type === 'pet') return false
          if (equipmentType && item.type !== equipmentType) return false
          if (quality && item.quality !== quality) return false
          return true
        })
        .map(item => ({
          id: item.id,
          type: item.type,
          quality: item.quality
        }))
      // 发送简化后的数据
      worker.postMessage({
        type: 'batch',
        items: JSON.parse(JSON.stringify(itemsToSell)),
        quality,
        equipmentType
      })
    })
  }
}
