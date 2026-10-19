// 货币 / 郑家宝阁纯函数断言（P17 第 1 步）。
//
// 覆盖：
//   · 双层货币的归一化 / 加减 / 支付
//   · 老档迁移口径（1 旧灵石 = 1 一阶；90% 一阶 / 10% 金页子+大子）
//   · 大子 → 金页子 100:1 与不足时不扣钱
//   · 侍妾池 20 金页子、七阶宝匣定价、状态默认值（洗命符 5 张）
//
// 风格与 verify-idle.mjs 一致：全部常量断言，不做统计。
import {
  CURRENCY_KEYS,
  LEGACY_DAZI_STONES,
  LEGACY_KEEP_RATIO,
  REFERENCE_RATES,
  addCurrency,
  amountOf,
  canAfford,
  createCurrency,
  exchangeDaZiForJinYeZi,
  formatAmount,
  formatCurrencyLine,
  migratedCurrency,
  normalizeCurrency,
  referenceDaZiValue,
  splitLegacyStones,
  spendCurrencyFrom
} from '../src/plugins/currency.js'
import { CHEST_TIERS, TUNING as SHOP_TUNING, chestPriceOf, chestShopOpen } from '../src/plugins/shop.js'
import { actions as inventoryActions, state as inventoryState } from '../src/stores/modules/inventory.js'

let passed = 0
let failed = 0
const check = (name, actual, expected) => {
  const ok = Object.is(actual, expected)
  if (ok) passed += 1
  else failed += 1
  console.log(`[${ok ? '  ok  ' : ' FAIL '}] ${name}`.padEnd(64), actual)
}
const checkTrue = (name, actual) => check(name, !!actual, true)

// ================= 一、货币定义 =================
check('币种共 4 个', CURRENCY_KEYS.length, 4)
check('币种顺序：大子/金页子/一阶/二阶', CURRENCY_KEYS.join(','), 'daZi,jinYeZi,stone1,stone2')
check('老档迁移：90% 留一阶', LEGACY_KEEP_RATIO, 0.9)
check('老档迁移：5 阶换大子', LEGACY_DAZI_STONES, 5)
check('100 大子 = 1 金页子', REFERENCE_RATES.daZiPerJinYeZi, 100)
check('3.5 金页子 = 1 一阶', REFERENCE_RATES.jinYeZiPerStone1, 3.5)

const zero = createCurrency()
check('新档大子 = 0', zero.daZi, 0)
check('新档金页子 = 0', zero.jinYeZi, 0)
check('新档一阶 = 0', zero.stone1, 0)
check('新档二阶 = 0', zero.stone2, 0)

checkTrue('createCurrency 每次返回新对象', createCurrency() !== zero)
check('normalize 补缺失键', normalizeCurrency({ daZi: 5 }).jinYeZi, 0)
check('normalize 去掉负数', normalizeCurrency({ daZi: -10 }).daZi, 0)
check('normalize 去掉 NaN', normalizeCurrency({ daZi: 'abc' }).daZi, 0)
check('normalize 保留小数', normalizeCurrency({ stone2: 4.5 }).stone2, 4.5)

// ================= 二、加减与支付 =================
const wallet = { daZi: 1000, jinYeZi: 2, stone1: 0, stone2: 0 }
const richer = addCurrency(wallet, 'daZi', 500)
check('加钱后大子 = 1500', richer.daZi, 1500)
check('加钱不改原对象', wallet.daZi, 1000)
check('加钱其他币种不变', richer.jinYeZi, 2)

checkTrue('够付 1000 大子', canAfford(wallet, 'daZi', 1000))
checkTrue('不够付 1001 大子', !canAfford(wallet, 'daZi', 1001))
checkTrue('未知币种不能付', !canAfford(wallet, 'silver', 1))

const paid = spendCurrencyFrom(wallet, 'daZi', 400)
check('扣钱成功', paid.ok, true)
check('扣钱后余额 = 600', paid.currency.daZi, 600)
const denied = spendCurrencyFrom(wallet, 'daZi', 1001)
check('余额不足：不扣', denied.ok, false)
check('余额不足：原额保留', denied.currency.daZi, 1000)
check('amountOf 未知键 = 0', amountOf(wallet, 'nope'), 0)

// ================= 三、老档迁移（2026-10-19 新口径） =================
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
const migrated = migratedCurrency({ daZi: 100, jinYeZi: 0, stone1: 0, stone2: 0 }, 200)
check('迁移：大子累加而不是覆盖', migrated.daZi, 1850)
check('迁移：金页子累加', migrated.jinYeZi, 52.5)
check('迁移：一阶累加', migrated.stone1, 180)

// 2026-10-18 存档：已按旧 1:10 迁移成 140,050 大子；修复应补成 90/10 拆分。
const fixMock = {
  currency: { daZi: 140050, jinYeZi: 0, stone1: 0, stone2: 0 },
  legacyStoneFix: null,
  spiritStones: 0,
  saveData() {
    this.saved = true
  }
}
const fixRes = inventoryActions.applyLegacyStoneFix.call(fixMock, 14005)
check('旧档修复：成功', fixRes.ok, true)
check('旧档修复：大子 = 1,750', fixMock.currency.daZi, 1750)
check('旧档修复：金页子 = 4,886', fixMock.currency.jinYeZi, 4886)
check('旧档修复：一阶 = 12,604', fixMock.currency.stone1, 12604)
check('旧档修复：写入防重标记', fixMock.legacyStoneFix, 'p17-90pct-v1')
check(
  '旧档修复：第二次拒绝重复发钱',
  inventoryActions.applyLegacyStoneFix.call(fixMock, 14005).ok,
  false
)
const autoFixMock = {
  currency: { daZi: 140050, jinYeZi: 0, stone1: 0, stone2: 0 },
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

// ================= 四、兑换（大子 → 金页子） =================
const exchangeWallet = { daZi: 2000, jinYeZi: 0, stone1: 0, stone2: 0 }
const exchanged = exchangeDaZiForJinYeZi(exchangeWallet, 20)
check('20 金页子 = 2000 大子', exchanged.costDaZi, 2000)
check('兑换成功', exchanged.ok, true)
check('兑换后金页子 = 20', exchanged.currency.jinYeZi, 20)
check('兑换后大子 = 0', exchanged.currency.daZi, 0)
const notEnough = exchangeDaZiForJinYeZi({ daZi: 1999, jinYeZi: 0, stone1: 0, stone2: 0 }, 20)
check('大子不足：失败', notEnough.ok, false)
check('大子不足：原额保留', notEnough.currency.daZi, 1999)
check('兑换 0 金页子：失败且不扣', exchangeDaZiForJinYeZi(exchangeWallet, 0).ok, false)

// 参考总额：350 金页子 = 1 二阶（原文锚点）
check(
  '参考总值：1 二阶 = 35000 大子',
  referenceDaZiValue({ daZi: 0, jinYeZi: 0, stone1: 0, stone2: 1 }),
  35000
)
check('参考展示：整数不带小数', formatAmount(10), '10')
check('参考展示：4.5 保留一位', formatAmount(4.5), '4.5')
check(
  '货币行：四种币种都显示',
  formatCurrencyLine({ daZi: 12, jinYeZi: 3, stone1: 0, stone2: 0 }),
  '12 大子 · 3 金页子 · 0 一阶灵石 · 0 二阶灵石'
)

// ================= 五、郑家宝阁定价 =================
check('侍妾池单价 = 20', SHOP_TUNING.maiden.price, 20)
check('侍妾池币种 = jinYeZi', SHOP_TUNING.maiden.currency, 'jinYeZi')
check('洗命符不可购买', SHOP_TUNING.fateCharmPurchasable, false)
check('兑换汇率 = 100', SHOP_TUNING.exchange.rate, 100)
check('兑换手续费暂为 0', SHOP_TUNING.exchange.feeRate, 0)

check('宝匣共 7 阶', CHEST_TIERS.length, 7)
check(
  '七阶价格 = 1/4.5/20/90/400/1800/8000',
  CHEST_TIERS.map(chest => chest.price).join(','),
  '1,4.5,20,90,400,1800,8000'
)
check('一阶宝匣价格', chestPriceOf(1), 1)
check('五阶宝匣价格', chestPriceOf(5), 400)
check('未知阶级返回 null', chestPriceOf(99), null)
check('宝箱系统尚未开放', chestShopOpen(), false)
checkTrue(
  '宝匣名称带材质',
  CHEST_TIERS.every(chest => chest.name.includes(chest.material))
)

// ================= 六、存档默认值 =================
const fresh = inventoryState()
check('新档洗命符 = 5 张', fresh.fateCharms, 5)
check('新档旧灵石字段 = 0（只作迁移来源）', fresh.spiritStones, 0)
check('新档 currency 四键齐全', CURRENCY_KEYS.every(key => fresh.currency[key] === 0), true)

// ================= 汇总 =================
console.log(`\n${passed}/${passed + failed} 通过`)
if (failed) {
  console.error(`${failed} 条断言失败`)
  process.exit(1)
}
