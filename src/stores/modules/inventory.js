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
import { openChest } from '../../plugins/chest.js'
import {
  chestPriceOf,
  isSellable,
  sellPriceOf,
  sumRecycle
} from '../../plugins/shop.js'
import {
  createItemInstance,
  generatePetAttributes,
  itemById,
  PET_RARITY_BY_QUALITY
} from '../../plugins/items.js'
import {
  EQUIPMENT_QUALITIES,
  equipQualityKeyOf,
  equipSlotOfType,
  generateEquipment,
  LEGACY_SLOT_TO_SLOT
} from '../../plugins/equipment.js'
import { pillRecipes } from '../../plugins/pills.js'
import { QI_ARTS } from '../../plugins/cultivationData.js'
import { emptyOffspringEquipment } from '../../plugins/offspringEquipment.js'
import { planAutoEquip } from '../../plugins/autoEquip.js'

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
   * 品种锁（2026-10-22 P28.3）：`baseId` 数组。
   * 锁住一个品种 = 该底材的**所有实例**都不进回收口（灵植/灵材按品种卖，
   * 逐件锁会变成体力活）。与将来的炼体药浴共用这套锁。
   */
  lockedSpecies: [],
  /**
   * 宝匣库存：按阶级计数（1~7 阶）。
   * 用计数对象而不是实例数组 —— 626 人口下子嗣诞生会发大量宝匣，
   * 实例数组会把 items 撑爆。开箱 UI 读 `chests[tier]`，扣 1 后走 chest.js。
   * 来源：探索古修洞府 1%（当前已接）；子嗣诞生/秘境/坊市后续接。
   */
  chests: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 },
  /**
   * 特殊道具（2026-10-21）：`{ [id]: 数量 }`，10 种占位，用途未开放。
   * **不进 `items` 数组** —— 没有 tier/成色，塞进去会被装备/分解逻辑扫到。
   * 不可出售/分解（见《宝箱系统》§6.3）。
   */
  specialItems: {}
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

  /**
   * 老档物品实例归一化（2026-10-22，P36 起含面板换代）。
   *
   * P29 之前开出的灵器 `stats = null`、没有装备部位，灵兽只是普通物品 ——
   * 玩家背包里可能已经躺着一堆「楚秦道袍」「玄龟」，不迁移的话新代码也救不回来。
   * P36（2026-10-23）起灵器还多一层：13 槽 → 5 槽、面板换成「白板 + 主属性 +
   * 副属性 + 词条」，老实例按 `statsVersion` 重生成（数值变了 = 预期行为）。
   *
   * 幂等：`statsVersion === 1` 且槽位已是 5 槽之一的实例原样返回。
   *
   * @returns {boolean} 有没有改动（改了就落盘）
   */
  migrateItemInstances() {
    let changed = false
    const items = this.items || []
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i]
      if (!item) continue
      if (!item.baseId) {
        // 炼器产物没有底材：只把旧 13 槽键（如 ring1）归一成 5 槽键
        const legacy = item.equipSlot || item.slot || item.type
        const target = LEGACY_SLOT_TO_SLOT[legacy]
        if (target) {
          items[i] = { ...item, equipSlot: target, slot: target, equipType: target }
          changed = true
        }
        continue
      }
      const base = itemById(item.baseId)
      if (!base) continue

      if (base.category === '灵器') {
        const slot = equipSlotOfType(base.type)
        const qualityKey = equipQualityKeyOf(item.quality)
        const stale = item.statsVersion !== 1 || item.equipSlot !== slot
        if (!stale) continue
        const rolled = generateEquipment({
          slot,
          type: base.type,
          tier: base.tier,
          quality: item.quality,
          series: base.series
        })
        items[i] = {
          ...item,
          id: item.id || item.instanceId,
          equipSlot: slot,
          slot,
          equipType: slot,
          qualityKey,
          stats: rolled.stats,
          mainStats: rolled.mainStats,
          subStats: rolled.subStats,
          traits: rolled.traits,
          statsVersion: 1,
          qualityInfo: item.qualityInfo || EQUIPMENT_QUALITIES[qualityKey]
        }
        changed = true
      } else if (base.category === '灵兽' && item.type !== 'pet') {
        items[i] = {
          ...item,
          id: item.id || item.instanceId,
          type: 'pet',
          species: item.species || base.type,
          rarity: item.rarity || PET_RARITY_BY_QUALITY[item.quality] || 'mortal',
          level: item.level || 1,
          star: item.star || 0,
          stats: null,
          combatAttributes: item.combatAttributes || generatePetAttributes(base.tier, item.quality)
        }
        changed = true
      }
    }
    if (changed) this.items = items
    return changed
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

  /** 获得特殊道具（10 种占位，按数量计数，不进 items） */
  gainSpecialItem(id, amount = 1, { save = true } = {}) {
    const key = String(id || '')
    if (!key) return false
    const n = Math.max(Math.floor(Number(amount) || 0), 0)
    if (!n) return false
    if (!this.specialItems || typeof this.specialItems !== 'object' || Array.isArray(this.specialItems)) {
      this.specialItems = {}
    }
    this.specialItems[key] = (Number(this.specialItems[key]) || 0) + n
    if (save) this.saveData()
    return true
  },

  /**
   * 宝匣残页池：未解锁的丹方 + 功法，按解锁所需物品基阶过滤。
   * 丹方 grade1~8 → 物品阶 `ceil(grade/2)` 封顶 5；功法 qi/foundation/core → 1/3/5。
   */
  buildFragmentPool() {
    const pool = []
    const knownRecipes = this.pillRecipes || []
    for (const recipe of pillRecipes) {
      if (knownRecipes.includes(recipe.id)) continue
      const grade = Number(String(recipe.grade || '').replace('grade', '')) || 1
      pool.push({
        kind: 'recipe',
        id: recipe.id,
        name: `${recipe.name}丹方残页`,
        tier: Math.min(Math.max(Math.ceil(grade / 2), 1), 5)
      })
    }
    const knownArts = this.practice?.qiArts?.known || {}
    const artTiers = { qi: 1, foundation: 3, core: 5 }
    for (const art of QI_ARTS) {
      if (knownArts[art.id]) continue
      pool.push({
        kind: 'art',
        id: art.id,
        name: `${art.name}残页`,
        tier: artTiers[art.grade] || 1
      })
    }
    return pool
  },

  /**
   * 开一个宝匣（**唯一落账点**）。扣 1 个、roll 掉落、分发到背包/货币/残页/特殊道具。
   * 宝匣纯函数层在 `plugins/chest.js`；这里只负责账。
   *
   * @returns {{ ok:boolean, message?:string, box?:object }}
   */
  openChestAt(tier, times = 1) {
    const t = Math.min(Math.max(Math.floor(Number(tier) || 1), 1), 7)
    const have = Number(this.chests?.[t]) || 0
    if (have <= 0) return { ok: false, message: '没有这个品阶的宝匣' }
    // 连开：一次最多开手里现有的数量，UI 传 10 时不会把箱子数开成负数
    const n = Math.min(Math.max(Math.floor(Number(times) || 1), 1), have)

    let lastBox = null
    const merged = { tier: t, entries: [], picks: 0, noDropCount: 0, opened: n }
    for (let i = 0; i < n; i += 1) {
      const box = openChest(t, { fragmentPool: this.buildFragmentPool() })
      lastBox = box
      merged.picks += box.picks
      merged.noDropCount += box.noDropCount
      for (const entry of box.entries) merged.entries.push(entry)

      for (const entry of box.entries) {
        if (entry.kind === 'currency') {
          this.currency = addCurrency(this.currency, entry.currency, entry.amount)
        } else if (entry.kind === 'item') {
          this.items.push(createItemInstance(entry.base, { quality: entry.quality }))
        } else if (entry.kind === 'special') {
          this.gainSpecialItem(entry.id, 1, { save: false })
        } else if (entry.kind === 'fragment') {
          if (entry.fragmentKind === 'recipe') {
            this.gainPillFragment(entry.id, { save: false })
          } else {
            this.gainArtFragment(entry.id, { save: false })
          }
        }
      }
    }

    this.chests[t] = have - n

    this.saveData()
    return { ok: true, box: merged, lastBox }
  },
  // ---------- 坊市：宝匣买入 / 物品回收（P28.3，2026-10-22） ----------

  /**
   * 坊市买宝匣（《模块六》§9.1）。价目在 `plugins/shop.js` 的 `CHEST_TIERS`，
   * **结账用一阶灵石**（`chestPriceOf` 把设计口径的二阶换算成一阶）。
   * 买入后进 `chests[tier]`，不自动开。
   *
   * @returns {{ok:boolean, message?:string, count?:number, cost?:number}}
   */
  buyChest(tier, count = 1) {
    const unit = chestPriceOf(tier)
    if (unit == null) return { ok: false, message: '该阶宝匣暂不流通' }
    const t = Math.trunc(Number(tier))
    const n = Math.max(Math.floor(Number(count) || 1), 1)
    const cost = unit * n
    if (!this.spendCurrency('spiritual', cost)) {
      return { ok: false, message: '修仙层灵石不足', cost }
    }
    // 兜底退款：扣钱后给不了匣子是不能接受的（正常走不到）
    if (!this.gainChest(t, n)) {
      this.gainCurrency('spiritual', cost)
      return { ok: false, message: '买入失败' }
    }
    return { ok: true, count: n, cost }
  },

  /** 回收口公共选项：品种锁 + 出战灵宠（出战灵宠还在 items 里，不能卖） */
  recycleOptions() {
    return {
      lockedSpecies: Array.isArray(this.lockedSpecies) ? this.lockedSpecies : [],
      activePetId: this.activePet?.id || null
    }
  },

  /** 切换品种锁。返回 true = 现在是锁定状态 */
  toggleSpeciesLock(baseId) {
    if (!baseId) return false
    const locks = Array.isArray(this.lockedSpecies) ? [...this.lockedSpecies] : []
    const index = locks.indexOf(baseId)
    if (index === -1) locks.push(baseId)
    else locks.splice(index, 1)
    this.lockedSpecies = locks
    this.saveData()
    return index === -1
  },

  /**
   * 单件卖出（《模块六》§9.2）。回收价 = 折价 × 30%，**逐件取整**，
   * 与一键售出共用 `sellPriceOf`。
   *
   * @returns {{ok:boolean, message?:string, price?:number, item?:object}}
   */
  sellItem(id) {
    const item = (this.items || []).find(entry => entry.id === id)
    if (!item) return { ok: false, message: '物品不存在' }
    if (!isSellable(item, this.recycleOptions())) {
      return { ok: false, message: '该物品不可出售（装备中 / 已锁定 / 非回收品类）' }
    }
    const price = sellPriceOf(item)
    this.items = this.items.filter(entry => entry.id !== id)
    this.currency = addCurrency(this.currency, 'spiritual', price)
    this.saveData()
    return { ok: true, price, item }
  },

  /**
   * 一键售出全部未锁定物品（灵器/灵兽/灵植/灵材）。
   * 装备中、品种锁定、出战中灵宠、特殊道具、残页、宝匣都自动排除。
   *
   * @returns {{ok:boolean, message?:string, count?:number, total?:number}}
   */
  sellAllUnlocked() {
    const { entries, count, total } = sumRecycle(this.items, this.recycleOptions())
    if (!count) return { ok: false, message: '没有可出售的物品' }
    const ids = new Set(entries.map(entry => entry.item.id))
    this.items = this.items.filter(item => !ids.has(item.id))
    this.currency = addCurrency(this.currency, 'spiritual', total)
    this.saveData()
    return { ok: true, count, total }
  },

  /**
   * 一键装备（《装备系统》§12.1 + 《模块二》§15.4，P36）。
   *
   * 一次把桂冈 5 槽与**所有出战子嗣**的攻/防两槽穿到当前能穿的最好。
   * 分配与评分是纯函数 `planAutoEquip`；这里只负责搬物品、加减面板、落盘一次。
   *
   * ⚠ 不能复用 `equipArtifact` / `equipOffspringItem`：它们每件都 `saveData()`，
   *   一次换十几件就是十几次整档序列化 + 加密。所以走 `_applyArtifactStats` 手工加减。
   * ⚠ 换下来的旧件**回背包**，不会被卖掉 —— 与手动换装一致。
   *
   * `player` / `offspring` 是**换装明细**（旧件 → 新件），给背包页的结果弹窗用；
   * 子嗣那几条额外带 `childName`，免得视图层再查一遍名单。
   *
   * @returns {{ok:boolean, changed:number, playerCount:number, offspringCount:number,
   *   childCount:number, player:Array, offspring:Array}}
   */
  autoEquipAll() {
    const plan = planAutoEquip({
      items: this.items || [],
      level: this.level,
      equippedArtifacts: this.equippedArtifacts,
      lockedSpecies: Array.isArray(this.lockedSpecies) ? this.lockedSpecies : [],
      children: this.offspring?.list || [],
      nowGameSeconds: this.clockGameTime
    })

    const changed = plan.player.length + plan.offspring.length
    if (!changed) {
      return { ok: true, changed: 0, playerCount: 0, offspringCount: 0, childCount: 0, player: [], offspring: [] }
    }

    // 桂冈：先扣旧件的加成，再补新件
    for (const move of plan.player) {
      if (move.previous) this._applyArtifactStats(move.previous, -1)
      // 槽位字段归一，与 equipArtifact 保持同一份写法（详情弹窗按它判断）
      move.item.equipSlot = move.slot
      move.item.slot = move.slot
      move.item.equipType = move.slot
      this._applyArtifactStats(move.item, 1)
      this.equippedArtifacts[move.slot] = move.item
    }

    // 子嗣：整件实例挪过去（面板最后加算，不吃境界/灵根/本命，不需要增量记账）
    const list = this.offspring?.list || []
    for (const move of plan.offspring) {
      const child = list.find(c => c.id === move.childId)
      if (!child) continue
      if (!child.equipment || typeof child.equipment !== 'object') {
        child.equipment = emptyOffspringEquipment()
      }
      child.equipment[move.slot] = move.item
    }

    this.items = plan.items
    this.saveData()
    return {
      ok: true,
      changed,
      playerCount: plan.player.length,
      offspringCount: plan.offspring.length,
      childCount: plan.childCount,
      player: plan.player.map(move => ({
        slot: move.slot,
        item: move.item,
        previous: move.previous
      })),
      offspring: plan.offspring.map(move => ({
        childId: move.childId,
        childName: list.find(c => c.id === move.childId)?.name || '',
        slot: move.slot,
        item: move.item,
        previous: move.previous
      }))
    }
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
          quality: equipQualityKeyOf(equipment.quality)
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
          // 宝匣灵器的部位在 equipSlot、成色是中文；与炼器产物统一后再比
          const slot = item.equipSlot || item.type
          if (equipmentType && slot !== equipmentType) return false
          if (quality && equipQualityKeyOf(item.quality) !== quality) return false
          return true
        })
        .map(item => ({
          id: item.id,
          type: item.equipSlot || item.type,
          quality: equipQualityKeyOf(item.quality)
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
