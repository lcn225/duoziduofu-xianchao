// 货币 / 郑家宝阁纯函数断言（货币 v2，2026-10-20）。
//
// 覆盖：
//   · 三字段货币 `{ secular, spiritual, strategic }` 的归一化 / 加减 / 支付
//   · 四字段老档折叠（daZi + jinYeZi×100 / stone1 + stone2×100）
//   · 面额拆分与显示（100 大子 = 1 金页子；100 一阶 = 1 二阶；800 二阶 = 1 三阶）
//   · 跨层兑换（买 380 / 卖 320 大子 = 1 一阶）、整一阶成交
//   · 老档 `spiritStones` 迁移（1 旧 = 1 一阶；90/10 拆）
//   · 侍妾池 20 金页子、七阶宝匣定价、状态默认值（洗命符 5 张）
//
// 风格与 verify-idle.mjs 一致：全部常量断言，不做统计。
import {
  CURRENCY_KEYS,
  DENOMINATION,
  LEGACY_CURRENCY_KEYS,
  LEGACY_DAZI_STONES,
  LEGACY_KEEP_RATIO,
  REFERENCE_RATES,
  addCurrency,
  amountOf,
  canAfford,
  createCurrency,
  foldLegacyCurrency,
  formatAmount,
  formatCurrencyLine,
  formatSecular,
  formatSpiritual,
  formatStrategic,
  hasLegacyCurrencyFields,
  maxSpiritualPurchase,
  migratedCurrency,
  normalizeCurrency,
  referenceDaZiValue,
  secularToSpiritual,
  splitLegacyStones,
  splitSecular,
  splitSpiritual,
  spendCurrencyFrom,
  spiritualToSecular
} from '../src/plugins/currency.js'
import {
  CHEST_TIERS,
  TUNING as SHOP_TUNING,
  chestPriceOf,
  chestShopOpen,
  formatChestPrice,
  formatMaidenPrice
} from '../src/plugins/shop.js'
import { actions as inventoryActions, state as inventoryState } from '../src/stores/modules/inventory.js'

let passed = 0
let failed = 0
let skipped = 0
const labels = []
const FILTER = (process.env.VERIFY_FILTER || '').toLowerCase()
const LIST = process.argv.includes('--list')
const check = (name, actual, expected) => {
  if (FILTER && !name.toLowerCase().includes(FILTER)) {
    skipped += 1
    return
  }
  labels.push(name)
  if (LIST) return
  const ok = Object.is(actual, expected)
  if (ok) passed += 1
  else failed += 1
  console.log(`[${ok ? '  ok  ' : ' FAIL '}] ${name}`.padEnd(64), actual)
}
const checkTrue = (name, actual) => check(name, !!actual, true)

// ================= 一、货币定义 =================
check('币种共 3 个', CURRENCY_KEYS.length, 3)
check('币种顺序：凡俗/修仙/战略', CURRENCY_KEYS.join(','), 'secular,spiritual,strategic')
check('旧四字段仍被识别', LEGACY_CURRENCY_KEYS.join(','), 'daZi,jinYeZi,stone1,stone2')
check('100 大子 = 1 金页子', DENOMINATION.daZiPerJinYeZi, 100)
check('100 一阶 = 1 二阶', DENOMINATION.stone1PerStone2, 100)
check('800 二阶 = 1 三阶', DENOMINATION.stone2PerStone3, 800)
check('1 三阶 = 80,000 一阶', DENOMINATION.stone1PerStone3, 80000)
check('买 1 一阶 = 380 大子', DENOMINATION.secularPerSpiritualBuy, 380)
check('卖 1 一阶 = 320 大子', DENOMINATION.secularPerSpiritualSell, 320)
check('老档迁移：90% 留一阶', LEGACY_KEEP_RATIO, 0.9)
check('老档迁移：5 阶换大子', LEGACY_DAZI_STONES, 5)

const zero = createCurrency()
check('新档凡俗 = 0', zero.secular, 0)
check('新档修仙 = 0', zero.spiritual, 0)
check('新档战略 = 0', zero.strategic, 0)
check('新档没有旧四键', hasLegacyCurrencyFields(zero), false)
checkTrue('createCurrency 每次返回新对象', createCurrency() !== zero)
check('normalize 补缺失键', normalizeCurrency({ secular: 5 }).spiritual, 0)
check('normalize 去掉负数', normalizeCurrency({ secular: -10 }).secular, 0)
check('normalize 去掉 NaN', normalizeCurrency({ secular: 'abc' }).secular, 0)
check('normalize 取整', normalizeCurrency({ spiritual: 4.6 }).spiritual, 5)

// ================= 二、四字段 → 三字段 =================
const legacyWallet = { daZi: 12, jinYeZi: 3, stone1: 4, stone2: 4.5 }
check('折叠：旧档被识别', hasLegacyCurrencyFields(legacyWallet), true)
const folded = foldLegacyCurrency(legacyWallet)
check('折叠：12 大子 + 3 金页子 = 312', folded.secular, 312)
check('折叠：4 一阶 + 4.5 二阶 = 454', folded.spiritual, 454)
check('折叠：战略 = 0', folded.strategic, 0)
check('折叠：旧键不再保留', hasLegacyCurrencyFields(folded), false)
// deepMerge 形态：新键是默认 0、旧键才是余额 —— 必须旧键优先
const merged = foldLegacyCurrency({ secular: 0, spiritual: 0, strategic: 0, daZi: 140050, jinYeZi: 0, stone1: 0, stone2: 0 })
check('折叠：deepMerge 形态不丢老档钱', merged.secular, 140050)
check('折叠：没有旧键时保持 0', foldLegacyCurrency({}).secular, 0)

// ================= 三、加减与支付 =================
const wallet = { secular: 1000, spiritual: 2, strategic: 0 }
const richer = addCurrency(wallet, 'secular', 500)
check('加钱后凡俗 = 1500', richer.secular, 1500)
check('加钱不改原对象', wallet.secular, 1000)
check('加钱其他币种不变', richer.spiritual, 2)

checkTrue('够付 1000 大子', canAfford(wallet, 'secular', 1000))
checkTrue('不够付 1001 大子', !canAfford(wallet, 'secular', 1001))
checkTrue('未知币种不能付', !canAfford(wallet, 'silver', 1))

const paid = spendCurrencyFrom(wallet, 'secular', 400)
check('扣钱成功', paid.ok, true)
check('扣钱后余额 = 600', paid.currency.secular, 600)
const denied = spendCurrencyFrom(wallet, 'secular', 1001)
check('余额不足：不扣', denied.ok, false)
check('余额不足：原额保留', denied.currency.secular, 1000)
check('amountOf 未知键 = 0', amountOf(wallet, 'nope'), 0)

// ================= 四、面额与显示 =================
const sec = splitSecular(12345)
check('12,345 大子 = 123 金页子', sec.jinYeZi, 123)
check('12,345 大子余 45 大子', sec.daZi, 45)
check('显示：金页子 + 大子', formatSecular(12300), '123 金页子 0 大子')
check('显示：不足 100 大子也写 0 金页子', formatSecular(45), '0 金页子 45 大子')
check('显示：≥ 1 万金页子用万', formatSecular(1200000), '1.2 万金页子')

const spi = splitSpiritual(80034)
check('80,034 一阶 = 1 三阶', spi.stone3, 1)
check('80,034 一阶 = 0 二阶', spi.stone2, 0)
check('80,034 一阶余 34 一阶', spi.stone1, 34)
check('显示：不足 100 一阶', formatSpiritual(34), '34 一阶')
check('显示：二阶也写 0 一阶', formatSpiritual(1200), '12 二阶 0 一阶')
check('显示：三阶全写', formatSpiritual(80034), '1 三阶 0 二阶 34 一阶')
check('显示：战略层', formatStrategic(5), '5 四阶')
check(
  '货币行：凡俗 + 修仙，战略 0 省略',
  formatCurrencyLine({ secular: 1250, spiritual: 3, strategic: 0 }),
  '12 金页子 50 大子 · 3 一阶'
)
check('参考展示：整数不带小数', formatAmount(10), '10')
check('参考展示：4.5 保留一位', formatAmount(4.5), '4.5')
check(
  '参考总值：1 二阶 = 35,000 大子',
  referenceDaZiValue({ secular: 0, spiritual: 100, strategic: 0 }),
  35000
)

// ================= 五、跨层兑换 =================
check('2,000 大子最多买 5 枚', maxSpiritualPurchase({ secular: 2000 }), 5)
const bought = secularToSpiritual({ secular: 2000, spiritual: 0, strategic: 0 }, 5)
check('买 5 枚成功', bought.ok, true)
check('买 5 枚花 1,900 大子', bought.costSecular, 1900)
check('买后凡俗余 100', bought.currency.secular, 100)
check('买后修仙 = 5', bought.currency.spiritual, 5)
const buyDenied = secularToSpiritual({ secular: 379, spiritual: 0, strategic: 0 }, 1)
check('不足 380：拒绝', buyDenied.ok, false)
check('不足 380：不扣钱', buyDenied.currency.secular, 379)
check('买 0 枚：拒绝', secularToSpiritual({ secular: 380 }, 0).ok, false)

const sold = spiritualToSecular({ secular: 0, spiritual: 3, strategic: 0 }, 3)
check('卖 3 枚成功', sold.ok, true)
check('卖 3 枚得 960 大子', sold.gainedSecular, 960)
check('卖后修仙 = 0', sold.currency.spiritual, 0)
const sellDenied = spiritualToSecular({ secular: 0, spiritual: 2, strategic: 0 }, 3)
check('卖超过余额：拒绝', sellDenied.ok, false)
check('卖超过余额：原额保留', sellDenied.currency.spiritual, 2)

// ================= 六、老档 spiritStones 迁移 =================
const s1 = splitLegacyStones(1)
check('1 旧灵石：留 0 一阶', s1.keepStone1, 0)
check('1 旧灵石：0 金页子', s1.jinYeZi, 0)
check('1 旧灵石：5 阶换大子 = 350', s1.daZi, 350)
const s200 = splitLegacyStones(200)
check('200 旧灵石：180 一阶（90%）', s200.keepStone1, 180)
check('200 旧灵石：52.5 金页子', s200.jinYeZi, 52.5)
check('200 旧灵石：1,750 大子', s200.daZi, 1750)
const s14005 = splitLegacyStones(14005)
check('14,005 旧灵石：12,604 一阶', s14005.keepStone1, 12604)
check('14,005 旧灵石：4,886 金页子', s14005.jinYeZi, 4886)
check('14,005 旧灵石：1,750 大子', s14005.daZi, 1750)
check('负的旧灵石按 0 算', splitLegacyStones(-50).keepStone1, 0)
const migrated = migratedCurrency({ secular: 100, spiritual: 0, strategic: 0 }, 200)
check('迁移：凡俗累加 100 + 5,250 + 1,750', migrated.secular, 7100)
check('迁移：修仙累加 = 180', migrated.spiritual, 180)

// 2026-10-18 存档：已按旧 1:10 迁移成 140,050 大子；修复应补成 90/10 拆分。
const fixMock = {
  currency: { secular: 140050, spiritual: 0, strategic: 0 },
  legacyStoneFix: null,
  spiritStones: 0,
  saveData() {
    this.saved = true
  }
}
const fixRes = inventoryActions.applyLegacyStoneFix.call(fixMock, 14005)
check('旧档修复：成功', fixRes.ok, true)
check('旧档修复：凡俗 = 1,750 + 488,600', fixMock.currency.secular, 490350)
check('旧档修复：修仙 = 12,604', fixMock.currency.spiritual, 12604)
check('旧档修复：写入防重标记', fixMock.legacyStoneFix, 'p17-90pct-v1')
check(
  '旧档修复：第二次拒绝重复发钱',
  inventoryActions.applyLegacyStoneFix.call(fixMock, 14005).ok,
  false
)
const autoFixMock = {
  currency: { secular: 140050, spiritual: 0, strategic: 0 },
  legacyStoneFix: null,
  spiritStones: 0,
  applyLegacyStoneFix: inventoryActions.applyLegacyStoneFix,
  saveData() {
    this.saved = true
  }
}
check(
  '旧档修复：读档自动识别 140,050 大子的旧迁移',
  inventoryActions.fixLegacyCurrencyRate.call(autoFixMock),
  true
)

// ================= 七、货币 v2 迁移 action =================
const v2Mock = {
  currency: { secular: 0, spiritual: 0, strategic: 7, daZi: 100, jinYeZi: 2, stone1: 3, stone2: 1 },
  currencyVersion: 1
}
const v2Migrated = inventoryActions.migrateCurrencyV2.call(v2Mock)
check('v2 迁移：凡俗 100 + 200', v2Mock.currency.secular, 300)
check('v2 迁移：修仙 3 + 100', v2Mock.currency.spiritual, 103)
check('v2 迁移：战略旧档为 0', v2Mock.currency.strategic, 0)
check('v2 迁移：版本号写成 2', v2Mock.currencyVersion, 2)
check('v2 迁移：返回折叠结果', v2Migrated.secular, 300)
const v2Fresh = { currency: { secular: 5, spiritual: 0, strategic: 0 }, currencyVersion: 2 }
check('v2 迁移：新档 no-op', inventoryActions.migrateCurrencyV2.call(v2Fresh), null)
check('v2 迁移：新档余额不动', v2Fresh.currency.secular, 5)

// ================= 八、郑家宝阁定价 =================
check('侍妾池单价 = 2,000 大子（20 金页子）', SHOP_TUNING.maiden.price, 2000)
check('侍妾池币种 = secular', SHOP_TUNING.maiden.currency, 'secular')
check('侍妾价格文案', formatMaidenPrice(), '20 金页子 0 大子')
check('洗命符不可购买', SHOP_TUNING.fateCharmPurchasable, false)
check('兑换买价 = 380', SHOP_TUNING.exchange.buyRate, 380)
check('兑换卖价 = 320', SHOP_TUNING.exchange.sellRate, 320)

check('宝匣共 7 阶', CHEST_TIERS.length, 7)
check(
  '1~5 阶设计价 = 1/3/13.5/54/194 二阶（Q4 定价表）',
  CHEST_TIERS.slice(0, 5).map(chest => chest.price).join(','),
  '1,3,13.5,54,194'
)
checkTrue('六/七阶不定价（price = null）', CHEST_TIERS.slice(5).every(chest => chest.price === null))
check('一阶宝匣 = 100 一阶', chestPriceOf(1), 100)
check('二阶宝匣 = 300 一阶', chestPriceOf(2), 300)
check('五阶宝匣 = 19,400 一阶', chestPriceOf(5), 19400)
check('六阶宝匣不定价 → null', chestPriceOf(6), null)
check('七阶宝匣不定价 → null', chestPriceOf(7), null)
check('未知阶级返回 null', chestPriceOf(99), null)
check('二阶宝匣价格文案', formatChestPrice(2), '3 二阶 0 一阶')
check('宝箱系统尚未开放', chestShopOpen(), false)
checkTrue(
  '宝匣名称带材质',
  CHEST_TIERS.every(chest => chest.name.includes(chest.material))
)

// ================= 九、存档默认值 =================
const fresh = inventoryState()
check('新档洗命符 = 5 张', fresh.fateCharms, 5)
check('新档旧灵石字段 = 0（只作迁移来源）', fresh.spiritStones, 0)
check('新档 currency 三键齐全', CURRENCY_KEYS.every(key => fresh.currency[key] === 0), true)
check('新档 currencyVersion = 2', fresh.currencyVersion, 2)

// ================= 汇总 =================
if (LIST) {
  for (const label of labels) console.log(`[LIST] ${label}`)
  console.log(`\n共 ${labels.length} 条断言${FILTER ? `（filter=${FILTER}）` : ''}`)
  process.exit(0)
}
console.log(`\n${passed}/${passed + failed} 通过`)
if (failed) {
  console.error(`${failed} 条断言失败`)
  process.exit(1)
}
