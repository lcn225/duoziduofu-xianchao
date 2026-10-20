// 背包与资源
//
// items 是混装数组：装备、丹药（type: 'pill'）、灵宠（type: 'pet'）都放在一起，
// 按 type 区分。多个模块会读写它，改动时注意别破坏其他类型的元素。
import {
  DENOMINATION,
  addCurrency,
  createCurrency,
  foldLegacyCurrency,
  hasLegacyCurrencyFields,
  isCurrencyKey,
  secularToSpiritual as secularToSpiritualPure,
  spiritualToSecular as spiritualToSecularPure,
  splitLegacyStones,
  spendCurrencyFrom
} from '../../plugins/currency.js'

export const state = () => ({
  /**
   * 货币 v2（2026-10-20）：`{ secular, spiritual, strategic }`。
   * 最小单位：大子 / 一阶灵石 / 四阶灵石；同层面额由显示层自动拆。
   * 真源与说明见 `plugins/currency.js`；**两层不折算**。
   */
  currency: createCurrency(),
  /** 货币结构版本：2 = 三字段（v1 四字段由 migrateCurrencyV2 折叠） */
  currencyVersion: 2,
  /**
   * ⚠ **旧版「灵石」，只作老档迁移来源**（1 旧 = 10 大子，P17 决议 3）。
   * `migrateLegacyCurrency()` 读档时把它搬进 `currency.spiritual` / `currency.secular` 并清零；
   * 新代码**一律不再读写这个字段**。留着键是为了让老档能通过 `deepMerge`。
   */
  spiritStones: 0,
  /**
   * 旧灵石迁移修复标记（2026-10-19）。
   * 老档先按 1 旧 = 10 大子迁移过；用户改口径为「1 旧 = 1 一阶 + 90/10 拆分」，
   * 这里记录一次性补偿是否已应用，防止重复发钱。
   */
  legacyStoneFix: null,
  reinforceStones: 0, // 强化石数量
  refinementStones: 0, // 洗练石数量
  /**
   * 洗命符：子嗣诞生时可消耗 1 张，重抽灵根/本命/词条。
   * 开局送 **5 张、不可购买**（P17 决议 4）；后续只从四阶以上宝箱 /
   * 秘境大 Boss 首杀极低概率掉落。**缺省值会通过 deepMerge 补给老档**
   * （老档里已有的张数保持不变，不没收）。
   */
  fateCharms: 5,
  herbs: [], // 灵草库存（旧体系，炼丹按 herb.id 读；新探索不再写入）
  items: [], // 物品库存（装备/丹药/灵宠/灵植/灵材混存）
  /**
   * 宝匣库存：按阶级计数（1~7 阶）。
   * 用计数对象而不是实例数组 —— 626 人口下子嗣诞生会发大量宝匣，
   * 实例数组会把 items 撑爆。开箱 UI 读 `chests[tier]`，扣 1 后走 chest.js。
   * 来源：探索古修洞府 1%（当前已接）；子嗣诞生/秘境/坊市后续接。
   */
  chests: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 }
})

export const getters = {
  chestTotal() {
    return Object.values(this.chests || {}).reduce((sum, n) => sum + (Number(n) || 0), 0)
  }
}

export const actions = {
  // ---------- 货币 ----------

  /**
   * 获得货币。key 见 `plugins/currency.js` 的 CURRENCY_KEYS。
   * 未知键直接返回 false（不静默加到错误的位置）。
   */
  gainCurrency(key, amount = 0, { save = true } = {}) {
    if (!isCurrencyKey(key)) return false
    const next = addCurrency(this.currency, key, amount)
    if (next[key] === this.currency?.[key]) return false
    this.currency = next
    if (save) this.saveData()
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
   * 凡俗 → 修仙：用大子买一阶灵石（3.8 金页子 = 380 大子 / 枚）。
   * 汇率真源在 `plugins/shop.js` 的 TUNING.exchange；本 action 只执行。
   *
   * @returns 纯函数 `secularToSpiritual` 的结果 { ok, currency, costSecular, gainedSpiritual }
   */
  exchangeSecularToSpiritual(count) {
    const result = secularToSpiritualPure(this.currency, count)
    if (!result.ok) return result
    this.currency = result.currency
    this.saveData()
    return result
  },

  /**
   * 修仙 → 凡俗：卖一阶灵石换大子（1 一阶 = 3.2 金页子 = 320 大子）。
   *
   * @returns 纯函数 `spiritualToSecular` 的结果 { ok, currency, costSpiritual, gainedSecular }
   */
  exchangeSpiritualToSecular(count) {
    const result = spiritualToSecularPure(this.currency, count)
    if (!result.ok) return result
    this.currency = result.currency
    this.saveData()
    return result
  },

  /**
   * **货币 v2 结构迁移（2026-10-20）**：四字段 → 三字段。
   *   daZi + jinYeZi × 100 → secular
   *   stone1 + stone2 × 100 → spiritual
   *   strategic = 0
   *
   * ⚠ 必须**早于**任何模块读钱（`persistence.initializePlayer` 里紧跟 deepMerge）。
   *   `deepMerge` 会把旧四键原样留下、同时补上新三键的默认 0，所以这里以旧键为准。
   *   迁完旧键消失，第二次调用 no-op。不 bump SAVE_VERSION：这是结构迁移，不是旧档作废。
   *
   * @returns {{secular,spiritual,strategic}|null} 折叠后的钱包；null 表示无需迁移
   */
  migrateCurrencyV2() {
    const folded = hasLegacyCurrencyFields(this.currency)
      ? foldLegacyCurrency(this.currency)
      : null
    if (folded) this.currency = folded
    this.currencyVersion = 2
    return folded
  },

  /**
   * 老档迁移（2026-10-19 口径）：旧 `spiritStones` **1:1 当一阶灵石**，
   * 其中 90% 留一阶、10% 拆成金页子/大子（见 `splitLegacyStones`）。
   * 迁完把旧字段清零。**幂等** —— 第二次调用返回 null。
   *
   * ⚠ 必须在 `migrateCurrencyV2()` **之后**调用（此时钱包已是三字段）。
   *   不 bump SAVE_VERSION：这是结构兼容迁移，不是「旧档作废」。
   *
   * @returns {{old,keepStone1,jinYeZi,daZi}|null} 本次迁移的拆分；null 表示无需迁移
   */
  migrateLegacyCurrency() {
    const legacy = Number(this.spiritStones) || 0
    if (legacy <= 0) {
      // 脏值（负数/NaN）也顺手清掉，免得下次又跑一遍
      if (this.spiritStones !== 0) this.spiritStones = 0
      return null
    }
    const split = splitLegacyStones(legacy)
    this.currency = addCurrency(this.currency, 'spiritual', split.keepStone1)
    this.currency = addCurrency(
      this.currency,
      'secular',
      split.jinYeZi * DENOMINATION.daZiPerJinYeZi + split.daZi
    )
    this.spiritStones = 0
    // 新迁移已经按新口径发过，不再触发下面的旧档修复
    this.legacyStoneFix = 'p17-90pct-v1'
    return split
  },

  /**
   * 一次性修复：把已经按 **旧 1:10** 迁移过的存档，补成新口径。
   *
   * 2026-10-18 那份存档：旧灵石 14,005 → 当时发了 140,050 大子。
   * 新口径应为 12,604 一阶 + 4,886 金页子 + 1,750 大子。
   * 做法：从当前凡俗层（`secular`）里扣回 140,050，再把新拆分加上去。
   *
   * ⚠ 只在 `secular >= 140,050` 时自动跑；如果玩家已经花掉一部分，
   *   自动条件不成立，需要用 GM 页手动改或导出存档后单独补。
   */
  applyLegacyStoneFix(oldStones = 14005) {
    if (this.legacyStoneFix) return { ok: false, message: '旧灵石补偿已应用过' }
    const split = splitLegacyStones(oldStones)
    const migratedDaZi = split.old * 10
    const currentSecular = Number(this.currency?.secular) || 0
    if (currentSecular < migratedDaZi) {
      return { ok: false, message: '当前大子不足以扣回旧迁移，请用 GM 页手动改' }
    }
    this.currency = {
      ...this.currency,
      secular:
        currentSecular -
        migratedDaZi +
        split.jinYeZi * DENOMINATION.daZiPerJinYeZi +
        split.daZi,
      spiritual: (Number(this.currency?.spiritual) || 0) + split.keepStone1,
      strategic: Number(this.currency?.strategic) || 0
    }
    this.legacyStoneFix = 'p17-90pct-v1'
    this.saveData()
    return { ok: true, split }
  },

  /**
   * 读档时自动识别「已被旧 1:10 迁移过、且还没花过新灵石」的存档，并补一次。
   * 条件刻意卡得很窄：凡俗层（secular）≥ 140,050、修仙层（spiritual）为 0、旧灵石已清零。
   */
  fixLegacyCurrencyRate() {
    if (this.legacyStoneFix) return false
    if ((Number(this.spiritStones) || 0) !== 0) return false
    const c = this.currency || {}
    if ((Number(c.spiritual) || 0) !== 0) return false
    if ((Number(c.secular) || 0) < 140050) return false
    return this.applyLegacyStoneFix(14005).ok
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
  gainItem(item, { save = true } = {}) {
    this.items.push(item)
    this.itemsFound++ // 增加获得物品统计
    if (save) this.saveData()
  },

  /**
   * 获得宝匣。`tier` 是**宝匣阶级**（1~7），不是物品基阶。
   * 默认自己落盘；探索一次 tick 会连发多条，调用方传 `{ save: false }`。
   */
  gainChest(tier = 1, amount = 1, { save = true } = {}) {
    const t = Math.min(Math.max(Math.floor(Number(tier) || 1), 1), 7)
    const n = Math.max(Math.floor(Number(amount) || 0), 0)
    if (!n) return false
    if (!this.chests || typeof this.chests !== 'object' || Array.isArray(this.chests)) {
      this.chests = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 }
    }
    this.chests[t] = (Number(this.chests[t]) || 0) + n
    if (save) this.saveData()
    return true
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
