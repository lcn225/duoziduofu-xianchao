// 【货币】—— 纯函数层（无副作用，可被 node 直接加载跑断言）
//
// 真源：《模块六-经济体系》§0.2 / §九 / §十 · 《原作物价表》§一 ·
//       《时间刻度修订方案（2026-10-29）》§7.2（A1 拆账）· 《数据定案》§十六。
//
// **货币 v3（2026-10-31 A1 拆账）：分档独立记账**
//   secular    凡俗层：**总大子数**（整数）；100 大子 = 1 金页子，显示时自动拆面额
//   spiritual1 一阶灵石（整数）
//   spiritual2 二阶灵石（整数）
//   spiritual3 三阶灵石（整数）
//   strategic  战略层：四阶灵石（整数）；不进位、不兑换、不参与商品流通
//
// **三档各自独立、不自动进位**（2026-10-29 拍板，A 分档独立记账）。
//   100 一阶 / 1 二阶、800 二阶 / 1 三阶只作**老档折算与参考汇率**，
//   不再参与自动进位。跨档只能**向上、单向、有损耗**：
//   110 一阶 → 1 二阶、880 二阶 → 1 三阶（约 9% 损耗，对齐凡俗↔修仙的价差量级）。
//
// 为什么拆：单字段 `spiritual` 存总一阶数时，筑基后产出的二阶/三阶会按固定汇率
//   折回一阶，高境界的钱自动贬值（输入性通胀）；任何按二阶计价的商品在筑基后
//   都会变成零钱。拆档后「二阶的价值」由账本自己记住，不再靠换算。
//
// 两条账本分开记，**不折算成一个数**。只有凡俗 ↔ 修仙需要手动兑换：
//   买 1 一阶 = 3.8 金页子 = 380 大子
//   卖 1 一阶 = 3.2 金页子 = 320 大子
//   价差 0.6 金页子就是手续费（旧 5% 手续费作废）。
//
// ⚠ 老档迁移（`stores/modules/inventory.js` 读档时调用，幂等）：
//   1. 四字段 `{ daZi, jinYeZi, stone1, stone2 }` → 折叠成 `{ secular, spiritual }`（v2）；
//   2. 旧 `spiritStones` **1 旧 = 1 一阶**，90% 留一阶、10% 拆金页子/大子；
//   3. `spiritual`（总一阶数）按 100/800 **一次性折算落档**到 `spiritual1/2/3`（v3）。

/** 货币键，按「凡俗 → 修仙三档 → 战略」排；UI 全量展示时也按这个顺序 */
export const CURRENCY_KEYS = ['secular', 'spiritual1', 'spiritual2', 'spiritual3', 'strategic']

/** 修仙三档（低 → 高），跨档兑换与显示都按这个顺序 */
export const SPIRITUAL_TIERS = ['spiritual1', 'spiritual2', 'spiritual3']

export const CURRENCY_META = {
  secular: { key: 'secular', name: '凡俗', unit: '大子', layer: 'mortal' },
  spiritual1: { key: 'spiritual1', name: '一阶灵石', unit: '一阶', tier: 1, layer: 'cultivation' },
  spiritual2: { key: 'spiritual2', name: '二阶灵石', unit: '二阶', tier: 2, layer: 'cultivation' },
  spiritual3: { key: 'spiritual3', name: '三阶灵石', unit: '三阶', tier: 3, layer: 'cultivation' },
  strategic: { key: 'strategic', name: '战略', unit: '四阶灵石', layer: 'strategic' }
}

/** 旧四字段键（只作迁移来源；新代码不再读写） */
export const LEGACY_CURRENCY_KEYS = ['daZi', 'jinYeZi', 'stone1', 'stone2']

/**
 * 面额与兑换（《模块六》§0.2 / §十）。
 * 账本金额一律按**各档自己的面额**存整数，面额只在显示时拆。
 */
export const DENOMINATION = {
  /** 100 大子 = 1 金页子 */
  daZiPerJinYeZi: 100,
  /** 100 一阶 = 1 二阶（只作老档折算与参考汇率） */
  stone1PerStone2: 100,
  /** 800 二阶 = 1 三阶（2026-10-20 改；旧口径 100 作废） */
  stone2PerStone3: 800,
  /** 一阶 → 三阶：800 × 100 = 80,000 一阶 */
  stone1PerStone3: 80000,
  /** 跨档兑换（向上、单向、有损耗）：110 一阶 → 1 二阶 */
  stone1PerStone2Exchange: 110,
  /** 跨档兑换：880 二阶 → 1 三阶 */
  stone2PerStone3Exchange: 880,
  /** 跨层买入：3.8 金页子 = 1 一阶 = 380 大子 */
  secularPerSpiritualBuy: 380,
  /** 跨层卖出：1 一阶 = 3.2 金页子 = 320 大子 */
  secularPerSpiritualSell: 320,
  /** 参考价（只给展示/排序）：3.5 金页子 = 1 一阶 = 350 大子 */
  secularPerSpiritualReference: 350
}

/**
 * 老档迁移（2026-10-19 用户改口径）：
 *   **1 旧灵石 = 1 一阶灵石**，不再按 10 大子折算。
 *   90% 留一阶；剩下的 10% 里，先拿 5 阶换成大子，其余按 3.5 金页子/阶换金页子。
 *
 * 这样既保住「灵石数量基本不变」，又给旧玩家留一笔凡俗零钱。
 * 14,005 旧灵石 → 12,604 一阶 + 4,886 金页子 + 1,750 大子。
 */
export const LEGACY_KEEP_RATIO = 0.9
export const LEGACY_DAZI_STONES = 5

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback)
/** 账本金额一律非负；四舍五入到整数（该档最小单位） */
const amountOfRaw = v => Math.max(Math.round(num(v)), 0)

/** 新档的零钱袋 */
export const createCurrency = () => ({
  secular: 0,
  spiritual1: 0,
  spiritual2: 0,
  spiritual3: 0,
  strategic: 0
})

export const isCurrencyKey = key => CURRENCY_KEYS.includes(key)
export const isLegacyCurrencyKey = key => LEGACY_CURRENCY_KEYS.includes(key)

/** 该键是不是修仙三档之一；返回对应的档号（1/2/3），否则 null */
export const spiritualTierOfKey = key => {
  const index = SPIRITUAL_TIERS.indexOf(key)
  return index === -1 ? null : index + 1
}

/**
 * 一阶总数 → 三档（**只给老档折算与参考**，不参与自动进位）。
 * 100 一阶 → 1 二阶；80,000 一阶 → 1 三阶（= 800 二阶）。
 *
 * 例：`14,005 → { spiritual1: 5, spiritual2: 140, spiritual3: 0 }`
 *     `100,000 → { spiritual1: 0, spiritual2: 200, spiritual3: 1 }`
 */
export const splitSpiritualTiers = totalTier1 => {
  const t = amountOfRaw(totalTier1)
  const spiritual3 = Math.floor(t / DENOMINATION.stone1PerStone3)
  const rest = t % DENOMINATION.stone1PerStone3
  return {
    spiritual1: rest % DENOMINATION.stone1PerStone2,
    spiritual2: Math.floor(rest / DENOMINATION.stone1PerStone2),
    spiritual3
  }
}

/** 三档 → 一阶等价总额（**只给展示/排序/旧值对照**，不要拿它做结算） */
export const spiritualTier1Total = currency => {
  const c = currency || {}
  return (
    amountOfRaw(c.spiritual1) +
    amountOfRaw(c.spiritual2) * DENOMINATION.stone1PerStone2 +
    amountOfRaw(c.spiritual3) * DENOMINATION.stone1PerStone3
  )
}

/**
 * 读档归一化：补齐缺失键、去掉负数/NaN、取整。
 * `deepMerge` 通常已经补好默认值，这里只是第二道保险（导入老档 / 手改存档）。
 *
 * ⚠ **旧 `spiritual` 字段在这里只作拆分来源**：同时带旧键时以旧键为准
 *   （`deepMerge` 之后新键只会是默认 0，拿它当余额会把老档的钱清零）。
 *   迁移函数 `migrateCurrencyV3` 会保证这一步只跑一次。
 */
export const normalizeCurrency = raw => {
  const src = raw && typeof raw === 'object' ? raw : {}
  const out = createCurrency()
  if ('spiritual' in src) {
    // 旧 v2 字段存在 ⇒ **以旧键为准**（deepMerge 之后新键只会是默认 0）。
    // 拆档后直接返回，不再让新键把结果覆盖成 0。
    const tiers = splitSpiritualTiers(src.spiritual)
    for (const key of SPIRITUAL_TIERS) out[key] = tiers[key]
    out.secular = amountOfRaw(src.secular)
    out.strategic = amountOfRaw(src.strategic)
    return out
  }
  for (const key of CURRENCY_KEYS) out[key] = amountOfRaw(src[key])
  return out
}

/** 该对象是否还带旧四字段（判断要不要跑 v2 迁移） */
export const hasLegacyCurrencyFields = raw =>
  !!raw && typeof raw === 'object' && LEGACY_CURRENCY_KEYS.some(key => key in raw)

/** 该对象是否还带 v2 的 `spiritual` 总一阶字段（判断要不要跑 v3 拆档） */
export const hasLegacySpiritualField = raw =>
  !!raw && typeof raw === 'object' && 'spiritual' in raw

/**
 * 四字段 → v3 五字段（纯函数）。
 *   secular   = daZi + jinYeZi × 100
 *   spiritual = stone1 + stone2 × 100  → 再按 100/800 拆成一/二/三档
 *   strategic = 0（v1 没有这个面额）
 *
 * 如果对象同时带新旧字段（`deepMerge` 之后的典型形态），**以旧字段为准** ——
 * 新字段只会是默认 0，拿它当余额会把老档的钱清零。
 */
export const foldLegacyCurrency = raw => {
  const src = raw && typeof raw === 'object' ? raw : {}
  const secular =
    num(src.daZi) + num(src.jinYeZi) * DENOMINATION.daZiPerJinYeZi
  const spiritual =
    num(src.stone1) + num(src.stone2) * DENOMINATION.stone1PerStone2
  return normalizeCurrency({ secular, spiritual, strategic: 0 })
}

/** 某一币种的余额（未知键返回 0，不抛） */
export const amountOf = (currency, key) => amountOfRaw(currency?.[key])

/** 够不够付（单档） */
export const canAfford = (currency, key, amount) => {
  if (!isCurrencyKey(key)) return false
  return amountOf(currency, key) >= amountOfRaw(amount)
}

/** 加钱（纯函数，返回新对象） */
export const addCurrency = (currency, key, amount) => {
  const out = normalizeCurrency(currency)
  if (!isCurrencyKey(key)) return out
  out[key] = amountOfRaw(out[key]) + amountOfRaw(amount)
  return out
}

/**
 * 扣钱（纯函数）。
 * @returns {{ ok:boolean, currency:object }}
 *   ok=false 时 currency 原样返回（不扣）。
 */
export const spendCurrencyFrom = (currency, key, amount) => {
  const out = normalizeCurrency(currency)
  if (!isCurrencyKey(key) || !canAfford(out, key, amount)) return { ok: false, currency: out }
  out[key] = amountOfRaw(out[key]) - amountOfRaw(amount)
  return { ok: true, currency: out }
}

// ---------- 按档加钱 / 扣钱（产出口与消费口统一走这里） ----------

/**
 * 按档加灵石。`tier` = 1 / 2 / 3。
 * 未知档返回原对象（不静默加到错误的位置）。
 */
export const addSpiritualTier = (currency, tier, amount) => {
  const key = SPIRITUAL_TIERS[Math.trunc(num(tier, 1)) - 1]
  return key ? addCurrency(currency, key, amount) : normalizeCurrency(currency)
}

/** 按档扣灵石（余额不足返回 ok=false，不扣） */
export const spendSpiritualTierFrom = (currency, tier, amount) => {
  const key = SPIRITUAL_TIERS[Math.trunc(num(tier, 1)) - 1]
  if (!key) return { ok: false, currency: normalizeCurrency(currency) }
  return spendCurrencyFrom(currency, key, amount)
}

// ---------- 价格：一阶等价金额 → 按档拆分 ----------

/**
 * 把「一阶等价金额」拆成按档支付的价格。
 * 例：`1350 → { spiritual1: 50, spiritual2: 13, spiritual3: 0 }`（13.5 二阶）
 *     `100  → { spiritual1: 0,  spiritual2: 1,  spiritual3: 0 }`
 *
 * ⚠ 只用于把**旧一阶计价**换算成档位；设计口径是二阶的商品（宝匣 / 封地）
 *   应直接用 `priceInTier2(n)` 表达，避免经过一阶再拆。
 */
export const priceToTiers = amountTier1 => splitSpiritualTiers(amountTier1)

/** 设计口径「X 二阶」→ 按档价格（避免 13.5 二阶经过一阶再拆时的浮点误差） */
export const priceInTier2 = amountStone2 => {
  const v = Math.max(num(amountStone2), 0)
  const whole = Math.floor(v)
  const fraction = v - whole
  return normalizeCurrency({
    spiritual2: whole,
    spiritual1: Math.round(fraction * DENOMINATION.stone1PerStone2)
  })
}

/** 该价格对象需要的每一档数量（缺省 0） */
export const priceTierAmountsOf = price => {
  const p = price || {}
  return {
    spiritual1: Math.max(Math.round(num(p.spiritual1)), 0),
    spiritual2: Math.max(Math.round(num(p.spiritual2)), 0),
    spiritual3: Math.max(Math.round(num(p.spiritual3)), 0)
  }
}

/** 够不够付一个多档价格（每一档都要够） */
export const canAffordPrice = (currency, price) => {
  const need = priceTierAmountsOf(price)
  const c = normalizeCurrency(currency)
  return SPIRITUAL_TIERS.every(key => amountOf(c, key) >= need[key])
}

/**
 * 扣一个多档价格。**任何一档不够就整笔拒绝**（不出现「扣了一部分」）。
 * @returns {{ ok:boolean, currency:object }}
 */
export const spendPriceFrom = (currency, price) => {
  const out = normalizeCurrency(currency)
  const need = priceTierAmountsOf(price)
  if (!SPIRITUAL_TIERS.every(key => amountOf(out, key) >= need[key])) {
    return { ok: false, currency: out }
  }
  for (const key of SPIRITUAL_TIERS) out[key] = amountOfRaw(out[key]) - need[key]
  return { ok: true, currency: out }
}

/**
 * 价格 × 件数（连买 N 个用）。
 * 逐档相乘后零头会超过 100（13.5 二阶 × 3 = 39 二阶 150 一阶），
 * 所以先折回一阶等价再按面额拆 —— 这里进位的是**价格**，不是钱包。
 */
export const scalePrice = (price, count) => {
  const need = priceTierAmountsOf(price)
  const n = Math.max(Math.floor(num(count)), 0)
  const totalTier1 =
    need.spiritual1 +
    need.spiritual2 * DENOMINATION.stone1PerStone2 +
    need.spiritual3 * DENOMINATION.stone1PerStone3
  return splitSpiritualTiers(totalTier1 * n)
}

/** 把价格对象（按档）加回钱包（退款 / 兑换用；纯函数） */
export const addPriceTo = (currency, price) => {
  const need = priceTierAmountsOf(price)
  let out = normalizeCurrency(currency)
  for (const key of SPIRITUAL_TIERS) {
    if (need[key] > 0) out = addCurrency(out, key, need[key])
  }
  return out
}

/** 价格展示：`13 二阶 50 一阶`；全零显示 `0 一阶` */
export const formatPriceTiers = price => {
  const need = priceTierAmountsOf(price)
  const parts = []
  if (need.spiritual3 > 0) parts.push(`${need.spiritual3} 三阶`)
  if (need.spiritual2 > 0) parts.push(`${need.spiritual2} 二阶`)
  if (need.spiritual1 > 0 || parts.length === 0) parts.push(`${need.spiritual1} 一阶`)
  return parts.join(' ')
}

// ---------- 跨档兑换（向上、单向、有损耗，2026-10-31 A1 拍板） ----------

/** 每换 1 个高档，要付多少个低档 */
export const tierExchangeRateOf = fromTier => {
  const tier = Math.trunc(num(fromTier, 1))
  if (tier === 1) return DENOMINATION.stone1PerStone2Exchange
  if (tier === 2) return DENOMINATION.stone2PerStone3Exchange
  return null
}

/** 当前低档余额最多能换几个高档 */
export const maxTierExchange = (currency, fromTier) => {
  const rate = tierExchangeRateOf(fromTier)
  const key = SPIRITUAL_TIERS[Math.trunc(num(fromTier, 1)) - 1]
  if (!rate || !key) return 0
  return Math.floor(amountOf(currency, key) / rate)
}

/**
 * 低档 → 高档（**单向、有损耗**）。
 * `exchangeTierUp(wallet, 1, 3)` = 330 一阶 → 3 二阶。
 *
 * @returns {{ ok:boolean, currency:object, cost:number, gained:number }}
 */
export const exchangeTierUp = (currency, fromTier, count) => {
  const from = Math.trunc(num(fromTier, 1))
  const rate = tierExchangeRateOf(from)
  const out = normalizeCurrency(currency)
  const wanted = Math.max(Math.floor(num(count)), 0)
  if (!rate || !wanted) return { ok: false, currency: out, cost: 0, gained: 0 }
  const cost = wanted * rate
  const spent = spendCurrencyFrom(out, SPIRITUAL_TIERS[from - 1], cost)
  if (!spent.ok) return { ok: false, currency: out, cost, gained: 0 }
  const next = addCurrency(spent.currency, SPIRITUAL_TIERS[from], wanted)
  return { ok: true, currency: next, cost, gained: wanted }
}

// ---------- 面额拆分与显示（《模块六》§0.2 的显示规则表） ----------

/** 大子总数 → { jinYeZi, daZi } */
export const splitSecular = total => {
  const t = amountOfRaw(total)
  return { jinYeZi: Math.floor(t / DENOMINATION.daZiPerJinYeZi), daZi: t % DENOMINATION.daZiPerJinYeZi }
}

/**
 * 凡俗层显示：`X 金页子 Y 大子`；金页子 ≥ 10,000 时显示 `X.X 万金页子`。
 * 大子为 0 也照写（余额不动，只是省略不了）。
 */
export const formatSecular = total => {
  const { jinYeZi, daZi } = splitSecular(total)
  if (jinYeZi < 10000) return `${jinYeZi} 金页子 ${daZi} 大子`
  return `${(jinYeZi / 10000).toFixed(1)} 万金页子`
}

/**
 * **一阶等价金额**显示：`X 一阶` / `X 二阶 Y 一阶` / `X 三阶 Y 二阶 Z 一阶`。
 * ⚠ 只给**掉落金额与价格**用（这些数值仍按一阶口径书写）；
 *   钱包余额请用 `formatSpiritualWallet`。
 */
export const formatSpiritual = total => {
  const { spiritual3, spiritual2, spiritual1 } = splitSpiritualTiers(total)
  if (spiritual3 > 0) return `${spiritual3} 三阶 ${spiritual2} 二阶 ${spiritual1} 一阶`
  if (spiritual2 > 0) return `${spiritual2} 二阶 ${spiritual1} 一阶`
  return `${spiritual1} 一阶`
}

/**
 * 钱包三档显示：`1 三阶 · 12 二阶 · 50 一阶`。
 * 只写非零档；全零写 `0 一阶`。
 */
export const formatSpiritualWallet = currency => {
  const c = normalizeCurrency(currency)
  const parts = []
  if (c.spiritual3 > 0) parts.push(`${c.spiritual3} 三阶`)
  if (c.spiritual2 > 0) parts.push(`${c.spiritual2} 二阶`)
  if (c.spiritual1 > 0 || parts.length === 0) parts.push(`${c.spiritual1} 一阶`)
  return parts.join(' · ')
}

/** 战略层显示：`X 四阶` */
export const formatStrategic = total => `${amountOfRaw(total)} 四阶`

/** 金额展示：整数不带小数点，小数最多一位（如 4.5）—— 只给价格表/预览用 */
export const formatAmount = value => {
  const v = Math.max(num(value), 0)
  if (Number.isInteger(v)) return String(v)
  return String(Math.round(v * 10) / 10)
}

/**
 * 一行展示（钱包 / 日志用）：
 *   `12 金页子 50 大子 · 3 二阶 0 一阶`（战略层为 0 时省略）
 */
export const formatCurrencyLine = currency => {
  const c = normalizeCurrency(currency)
  const parts = [formatSecular(c.secular), formatSpiritualWallet(c)]
  if (c.strategic > 0) parts.push(formatStrategic(c.strategic))
  return parts.join(' · ')
}

/**
 * 参考汇率（《原作物价表》§一）。
 * ⚠ 只用于说明文案与粗略排序，**不能拿它把两层账本折算成一个数**。
 */
export const REFERENCE_RATES = {
  daZiPerJinYeZi: DENOMINATION.daZiPerJinYeZi,
  jinYeZiPerStone1: 3.5,
  stone1PerStone2: DENOMINATION.stone1PerStone2,
  stone2PerStone3: DENOMINATION.stone2PerStone3,
  stone1PerStone2Exchange: DENOMINATION.stone1PerStone2Exchange,
  stone2PerStone3Exchange: DENOMINATION.stone2PerStone3Exchange
}

/**
 * 换算成「大子」的参考总额 —— **只给展示/排序用**，不要拿它做结算。
 * 战略层不参与（四阶的兑换口径尚未定义）。
 */
export const referenceDaZiValue = currency => {
  const c = normalizeCurrency(currency)
  return c.secular + spiritualTier1Total(c) * DENOMINATION.secularPerSpiritualReference
}

// ---------- 跨层兑换（凡俗 ↔ 修仙，手动、整一阶成交） ----------

/** 当前凡俗层最多能买几枚一阶灵石（向下取整） */
export const maxSpiritualPurchase = currency =>
  Math.floor(amountOf(currency, 'secular') / DENOMINATION.secularPerSpiritualBuy)

/**
 * 买一阶：扣 `count × 380` 大子、`spiritual1 += count`。
 * 只要有一枚买不起就整笔拒绝（不出现「扣了钱到账 0」）。
 *
 * @returns {{ ok:boolean, currency:object, costSecular:number, gainedSpiritual:number }}
 */
export const secularToSpiritual = (currency, count) => {
  const out = normalizeCurrency(currency)
  const wanted = Math.max(Math.floor(num(count)), 0)
  const cost = wanted * DENOMINATION.secularPerSpiritualBuy
  if (!wanted || !canAfford(out, 'secular', cost)) {
    return { ok: false, currency: out, costSecular: cost, gainedSpiritual: 0 }
  }
  out.secular -= cost
  out.spiritual1 += wanted
  return { ok: true, currency: out, costSecular: cost, gainedSpiritual: wanted }
}

/**
 * 卖一阶：扣 `count` 一阶、`secular += count × 320` 大子。
 *
 * @returns {{ ok:boolean, currency:object, costSpiritual:number, gainedSecular:number }}
 */
export const spiritualToSecular = (currency, count) => {
  const out = normalizeCurrency(currency)
  const wanted = Math.max(Math.floor(num(count)), 0)
  if (!wanted || !canAfford(out, 'spiritual1', wanted)) {
    return { ok: false, currency: out, costSpiritual: wanted, gainedSecular: 0 }
  }
  out.spiritual1 -= wanted
  out.secular += wanted * DENOMINATION.secularPerSpiritualSell
  return { ok: true, currency: out, costSpiritual: wanted, gainedSecular: wanted * DENOMINATION.secularPerSpiritualSell }
}

// ---------- 老档 `spiritStones` 迁移（P17 口径，保留） ----------

/**
 * 旧灵石拆分（2026-10-19 口径）。
 *
 *   90% → 一阶灵石（向下取整）
 *   剩余 10% → 先拿 5 阶换大子（5 × 3.5 × 100 = 1,750 大子），
 *              其余按 3.5 金页子/阶换金页子
 *
 * 例：14,005 → { keepStone1: 12,604, jinYeZi: 4,886, daZi: 1,750 }
 * 三份加起来的价值仍是 14,005 一阶。
 */
export const splitLegacyStones = stones => {
  const old = Math.max(0, Math.round(Number(stones) || 0))
  const keepStone1 = Math.floor(old * LEGACY_KEEP_RATIO)
  const convert = old - keepStone1
  const daZiStones = Math.min(LEGACY_DAZI_STONES, convert)
  const jinYeZiRaw = (convert - daZiStones) * REFERENCE_RATES.jinYeZiPerStone1
  const jinYeZi = Math.round(jinYeZiRaw * 10) / 10
  const daZi =
    daZiStones * REFERENCE_RATES.jinYeZiPerStone1 * REFERENCE_RATES.daZiPerJinYeZi +
    Math.round((jinYeZiRaw - jinYeZi) * REFERENCE_RATES.daZiPerJinYeZi)
  return { old, keepStone1, convert, jinYeZi, daZi }
}

/**
 * 旧灵石迁移（v3 字段）：把拆分结果记进 `spiritual1` / `secular`。
 * 幂等由调用方保证 —— 迁移后必须把 `spiritStones` 清零。
 */
export const migratedCurrency = (currency, legacyStones) => {
  const split = splitLegacyStones(legacyStones)
  let out = normalizeCurrency(currency)
  out = addCurrency(out, 'spiritual1', split.keepStone1)
  out = addCurrency(out, 'secular', split.jinYeZi * DENOMINATION.daZiPerJinYeZi + split.daZi)
  return out
}
