// 【货币】—— 纯函数层（无副作用，可被 node 直接加载跑断言）
//
// 真源：《模块六-经济体系》§0.2 / §十 · 《原作物价表》§一。
//
// **货币 v2（2026-10-20）：三个字段、四阶面额、同层自动进位**
//   secular   凡俗层：**总大子数**（整数）；100 大子 = 1 金页子，显示时自动拆面额
//   spiritual 修仙层：**总一阶灵石数**（整数）；100 一阶 = 1 二阶，800 二阶 = 1 三阶
//   strategic 战略层：四阶灵石（整数）；不进位、不兑换、不参与商品流通
//
// 两条账本分开记，**不折算成一个数**。只有凡俗 ↔ 修仙需要手动兑换：
//   买 1 一阶 = 3.8 金页子 = 380 大子
//   卖 1 一阶 = 3.2 金页子 = 320 大子
//   价差 0.6 金页子就是手续费（旧 5% 手续费作废）。
//
// ⚠ 老档迁移：
//   1. 四字段 `{ daZi, jinYeZi, stone1, stone2 }` → 三字段（`foldLegacyCurrency`）；
//   2. 旧 `spiritStones` **1 旧 = 1 一阶**，90% 留一阶、10% 拆金页子/大子
//      （`splitLegacyStones` / `migratedCurrency`）。
//   两步都由 `stores/modules/inventory.js` 在读档时调用，幂等。
//
// **2026-10-31 回滚 v3（三档独立记账作废）**：
//   v3 曾把 `spiritual` 拆成 `spiritual1/2/3` 三档独立、不自动进位。
//   实测后果 = 练气期所有产出全进一阶，钱包出现「752,040 一阶」这种账面。
//   用户 2026-10-31 拍板回滚：**货币仍是一根总账、同层自动进位**；
//   「大境界货币概念不同」改由**物价按境界段定价**表达（后续批次，未落地）。
//   老档合并：`spiritual = spiritual1 + spiritual2×100 + spiritual3×80,000`
//   （`mergeTieredCurrency`，`currencyVersion: 4`，幂等）。

/** 货币键，按「凡俗 → 修仙 → 战略」排；UI 全量展示时也按这个顺序 */
export const CURRENCY_KEYS = ['secular', 'spiritual', 'strategic']

export const CURRENCY_META = {
  secular: { key: 'secular', name: '凡俗', unit: '大子', layer: 'mortal' },
  spiritual: { key: 'spiritual', name: '修仙', unit: '一阶灵石', layer: 'cultivation' },
  strategic: { key: 'strategic', name: '战略', unit: '四阶灵石', layer: 'strategic' }
}

/** 旧四字段键（只作迁移来源；新代码不再读写） */
export const LEGACY_CURRENCY_KEYS = ['daZi', 'jinYeZi', 'stone1', 'stone2']

/**
 * 面额与兑换（《模块六》§0.2 / §十）。
 * 所有金额在账本里都按**最小单位**存整数，面额只在显示时拆。
 */
export const DENOMINATION = {
  /** 100 大子 = 1 金页子 */
  daZiPerJinYeZi: 100,
  /** 100 一阶 = 1 二阶 */
  stone1PerStone2: 100,
  /** 800 二阶 = 1 三阶（2026-10-20 改；旧口径 100 作废） */
  stone2PerStone3: 800,
  /** 一阶 → 三阶：800 × 100 = 80,000 一阶 */
  stone1PerStone3: 80000,
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
/** 账本金额一律非负；四舍五入到整数（最小单位） */
const amountOfRaw = v => Math.max(Math.round(num(v)), 0)

/** 新档的零钱袋 */
export const createCurrency = () => ({ secular: 0, spiritual: 0, strategic: 0 })

export const isCurrencyKey = key => CURRENCY_KEYS.includes(key)
export const isLegacyCurrencyKey = key => LEGACY_CURRENCY_KEYS.includes(key)

/**
 * 读档归一化：补齐缺失键、去掉负数/NaN、取整。
 * `deepMerge` 通常已经补好默认值，这里只是第二道保险（导入老档 / 手改存档）。
 * ⚠ 四字段老档**不要**直接喂进来 —— 先跑 `foldLegacyCurrency`，否则旧字段会被丢掉。
 */
export const normalizeCurrency = raw => {
  const src = raw && typeof raw === 'object' ? raw : {}
  const out = createCurrency()
  for (const key of CURRENCY_KEYS) out[key] = amountOfRaw(src[key])
  return out
}

/** 该对象是否还带旧四字段（判断要不要跑 v2 迁移） */
export const hasLegacyCurrencyFields = raw =>
  !!raw && typeof raw === 'object' && LEGACY_CURRENCY_KEYS.some(key => key in raw)

/** 该对象是否还带 v3 的三档字段（判断要不要跑 v4 合并） */
export const hasTieredCurrencyFields = raw =>
  !!raw &&
  typeof raw === 'object' &&
  ['spiritual1', 'spiritual2', 'spiritual3'].some(key => key in raw)

/**
 * v3 三档 → 单字段（2026-10-31 回滚 A1，**无损耗**）。
 *   `spiritual = spiritual1 + spiritual2 × 100 + spiritual3 × 80,000`
 *
 * 没有三档字段的对象原样归一化返回（新档 / 已是 v4 的档 no-op）。
 * 同时带 `spiritual` 时也合并进去（防御性：正常存档不会两者并存）。
 */
export const mergeTieredCurrency = raw => {
  const src = raw && typeof raw === 'object' ? raw : {}
  if (!hasTieredCurrencyFields(src)) return normalizeCurrency(src)
  const total =
    amountOfRaw(src.spiritual1) +
    amountOfRaw(src.spiritual2) * DENOMINATION.stone1PerStone2 +
    amountOfRaw(src.spiritual3) * DENOMINATION.stone1PerStone3 +
    amountOfRaw(src.spiritual)
  return normalizeCurrency({
    secular: src.secular,
    spiritual: total,
    strategic: src.strategic
  })
}

/**
 * 四字段 → 三字段（纯函数）。
 *   secular   = daZi + jinYeZi × 100
 *   spiritual = stone1 + stone2 × 100
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

/** 够不够付 */
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

/** 一阶总数 → { stone3, stone2, stone1 } */
export const splitSpiritual = total => {
  const t = amountOfRaw(total)
  const stone3 = Math.floor(t / DENOMINATION.stone1PerStone3)
  const rest = t % DENOMINATION.stone1PerStone3
  return {
    stone3,
    stone2: Math.floor(rest / DENOMINATION.stone1PerStone2),
    stone1: rest % DENOMINATION.stone1PerStone2
  }
}

/**
 * 修仙层显示：`X 一阶` / `X 二阶 Y 一阶` / `X 三阶 Y 二阶 Z 一阶`。
 * 中间面额为 0 也照写，避免玩家把「0 二阶 34 一阶」误读成 34 二阶。
 */
export const formatSpiritual = total => {
  const { stone3, stone2, stone1 } = splitSpiritual(total)
  if (stone3 > 0) return `${stone3} 三阶 ${stone2} 二阶 ${stone1} 一阶`
  if (stone2 > 0) return `${stone2} 二阶 ${stone1} 一阶`
  return `${stone1} 一阶`
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
  const parts = [formatSecular(c.secular), formatSpiritual(c.spiritual)]
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
  stone2PerStone3: DENOMINATION.stone2PerStone3
}

/**
 * 换算成「大子」的参考总额 —— **只给展示/排序用**，不要拿它做结算。
 * 战略层不参与（四阶的兑换口径尚未定义）。
 */
export const referenceDaZiValue = currency => {
  const c = normalizeCurrency(currency)
  return c.secular + c.spiritual * DENOMINATION.secularPerSpiritualReference
}

// ---------- 跨层兑换（凡俗 ↔ 修仙，手动、整一阶成交） ----------

/** 当前凡俗层最多能买几枚一阶灵石（向下取整） */
export const maxSpiritualPurchase = currency =>
  Math.floor(amountOf(currency, 'secular') / DENOMINATION.secularPerSpiritualBuy)

/**
 * 买一阶：扣 `count × 380` 大子、`spiritual += count`。
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
  out.spiritual += wanted
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
  if (!wanted || !canAfford(out, 'spiritual', wanted)) {
    return { ok: false, currency: out, costSpiritual: wanted, gainedSecular: 0 }
  }
  out.spiritual -= wanted
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
 * 旧灵石迁移（v2 字段）：把拆分结果记进 `spiritual` / `secular`。
 * 幂等由调用方保证 —— 迁移后必须把 `spiritStones` 清零。
 */
export const migratedCurrency = (currency, legacyStones) => {
  const split = splitLegacyStones(legacyStones)
  let out = normalizeCurrency(currency)
  out = addCurrency(out, 'spiritual', split.keepStone1)
  out = addCurrency(out, 'secular', split.jinYeZi * DENOMINATION.daZiPerJinYeZi + split.daZi)
  return out
}
