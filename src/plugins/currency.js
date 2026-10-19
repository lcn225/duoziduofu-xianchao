// 【货币】—— 纯函数层（无副作用，可被 node 直接加载跑断言）
//
// 真源：《模块六-经济体系》§0.2 / §十 · 《原作物价表》§一。
//
// **两层货币不折算**：
//   凡俗层：大子、金页子（100 大子 = 1 金页子）
//   修仙层：一阶灵石、二阶灵石（100 一阶 = 1 二阶）
// 两层分开记账，汇率只用于「参考 / 手动兑换」，**不作为结算依据**。
//
// ⚠ 老档迁移（2026-10-19 用户改口径）：**1 旧灵石 = 1 一阶灵石**，
//   90% 留一阶、10% 拆金页子/大子（见 `splitLegacyStones`）。
//   旧字段 `spiritStones` 只作迁移来源，迁完清零；新代码一律读写 `currency`。

/** 货币键，按「从低到高」排；UI 全量展示时也按这个顺序 */
export const CURRENCY_KEYS = ['daZi', 'jinYeZi', 'stone1', 'stone2']

export const CURRENCY_META = {
  daZi: { key: 'daZi', name: '大子', layer: 'mortal' },
  jinYeZi: { key: 'jinYeZi', name: '金页子', layer: 'mortal' },
  stone1: { key: 'stone1', name: '一阶灵石', layer: 'cultivation' },
  stone2: { key: 'stone2', name: '二阶灵石', layer: 'cultivation' }
}

/**
 * 参考汇率（《原作物价表》§一）。
 * ⚠ 只用于兑换与说明文案，不能拿它把两层账本折算成一个数。
 */
export const REFERENCE_RATES = {
  /** 100 大子 = 1 金页子 */
  daZiPerJinYeZi: 100,
  /** 3.5 金页子 = 1 一阶灵石 */
  jinYeZiPerStone1: 3.5,
  /** 100 一阶灵石 = 1 二阶灵石 */
  stone1PerStone2: 100,
  /** 100 二阶灵石 = 1 三阶灵石（设定值，原文未明写，见物价表注） */
  stone2PerStone3: 100
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
/** 金额可以带小数（如 4.5 二阶），但不能为负 */
const amountOfRaw = v => Math.max(num(v), 0)

/** 新档的零钱袋 */
export const createCurrency = () => ({ daZi: 0, jinYeZi: 0, stone1: 0, stone2: 0 })

export const isCurrencyKey = key => CURRENCY_KEYS.includes(key)

/**
 * 读档归一化：补齐缺失键、去掉负数/NaN。
 * `deepMerge` 通常已经补好默认值，这里只是第二道保险（导入老档 / 手改存档）。
 */
export const normalizeCurrency = raw => {
  const src = raw && typeof raw === 'object' ? raw : {}
  const out = createCurrency()
  for (const key of CURRENCY_KEYS) out[key] = amountOfRaw(src[key])
  return out
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

/**
 * 旧灵石拆分（2026-10-19 新口径）。
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
 * 老档迁移的纯函数版本：把旧 `spiritStones` 按 90/10 拆进一阶/金页子/大子。
 * 幂等由调用方保证 —— 迁移后必须把 `spiritStones` 清零。
 */
export const migratedCurrency = (currency, legacyStones) => {
  const split = splitLegacyStones(legacyStones)
  let out = normalizeCurrency(currency)
  out = addCurrency(out, 'stone1', split.keepStone1)
  out = addCurrency(out, 'jinYeZi', split.jinYeZi)
  out = addCurrency(out, 'daZi', split.daZi)
  return out
}

/**
 * 大子 → 金页子（郑家宝阁的兑换骨架）。
 * 100:1；手续费先留 0，等《模块六》§十 的手续费/限额反推完再接。
 *
 * @returns {{ ok:boolean, currency:object, costDaZi:number, gainedJinYeZi:number }}
 *   `jinYeZi` 是要**换到**的金页子数量；不足时 ok=false，不扣钱。
 */
export const exchangeDaZiForJinYeZi = (currency, jinYeZi, { feeRate = 0 } = {}) => {
  const out = normalizeCurrency(currency)
  const wanted = amountOfRaw(jinYeZi)
  const fee = Math.max(num(feeRate), 0)
  const cost = Math.round(wanted * REFERENCE_RATES.daZiPerJinYeZi * (1 + fee) * 100) / 100
  if (!wanted) return { ok: false, currency: out, costDaZi: cost, gainedJinYeZi: 0 }
  if (!canAfford(out, 'daZi', cost)) return { ok: false, currency: out, costDaZi: cost, gainedJinYeZi: 0 }
  out.daZi = amountOfRaw(out.daZi) - cost
  out.jinYeZi = amountOfRaw(out.jinYeZi) + wanted
  return { ok: true, currency: out, costDaZi: cost, gainedJinYeZi: wanted }
}

/** 金额展示：整数不带小数点，小数最多一位（如 4.5） */
export const formatAmount = value => {
  const v = amountOfRaw(value)
  if (Number.isInteger(v)) return String(v)
  return String(Math.round(v * 10) / 10)
}

/** 一行展示（App 顶部状态条用）：`12 大子 · 3 金页子 · 0 一阶 · 0 二阶` */
export const formatCurrencyLine = currency =>
  CURRENCY_KEYS.map(key => `${formatAmount(currency?.[key])} ${CURRENCY_META[key].name}`).join(' · ')

/**
 * 换算成「大子」的参考总额 —— **只给展示/排序用**，不要拿它做结算。
 * 两层货币不折算，这条只回答「他到底多有钱」这种粗略问题。
 */
export const referenceDaZiValue = currency => {
  const c = normalizeCurrency(currency)
  return (
    c.daZi +
    c.jinYeZi * REFERENCE_RATES.daZiPerJinYeZi +
    c.stone1 * REFERENCE_RATES.jinYeZiPerStone1 * REFERENCE_RATES.daZiPerJinYeZi +
    c.stone2 *
      REFERENCE_RATES.stone1PerStone2 *
      REFERENCE_RATES.jinYeZiPerStone1 *
      REFERENCE_RATES.daZiPerJinYeZi
  )
}
