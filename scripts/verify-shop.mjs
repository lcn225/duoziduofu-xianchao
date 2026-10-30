// 货币 / 郑家宝阁纯函数断言（货币 v2，2026-10-20）。
//
// 覆盖：
//   · 三字段货币 `{ secular, spiritual, strategic }` 的归一化 / 加减 / 支付
//   · 四字段老档折叠（daZi + jinYeZi×100 / stone1 + stone2×100）
//   · 面额拆分与显示（100 大子 = 1 金页子；100 一阶 = 1 二阶；800 二阶 = 1 三阶）
//   · 跨层兑换（买 380 / 卖 320 大子 = 1 一阶）、整一阶成交
//   · 老档 `spiritStones` 迁移（1 旧 = 1 一阶；90/10 拆）
//   · 侍妾池 20 金页子、七阶宝匣定价、状态默认值（洗命符 5 张）
//   · 宝匣买入（1~5 阶可买 / 6~7 阶置灰）与物品回收（折价 × 30%，Q3 P28.3）
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
  ITEM_BASE_PRICE,
  RECYCLE_RATE,
  SELLABLE_CATEGORIES,
  TUNING as SHOP_TUNING,
  basePriceOfTier,
  chestPriceOf,
  chestShopOpen,
  chestUnlockLabelOf,
  formatChestPrice,
  isChestUnlockedAt,
  formatMaidenPrice,
  maidenPoolOf,
  isSellable,
  recycleCandidates,
  sellPriceOf,
  sumRecycle
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
check('侍妾池（凡女）单价 = 2,000 大子（20 金页子）', SHOP_TUNING.maiden.mortal.price, 2000)
check('侍妾池（凡女）币种 = secular', SHOP_TUNING.maiden.mortal.currency, 'secular')
check('侍妾价格文案（凡女）', formatMaidenPrice(false), '20 金页子 0 大子')
// P55-b：筑基后换 P9 练气女修池；价 = 该位阶 20 个月月饷（30 一阶 × 20 = 600 一阶 = 6 二阶）
check('侍妾池（女修）单价 = 600 一阶（6 二阶）', SHOP_TUNING.maiden.cultivator.price, 600)
check('侍妾池（女修）币种 = spiritual', SHOP_TUNING.maiden.cultivator.currency, 'spiritual')
check('侍妾价格文案（女修）', formatMaidenPrice(true), '6 二阶 0 一阶')
check('筑基后取女修池', maidenPoolOf(true).name, '练气女修')
check('练气期取凡女池', maidenPoolOf(false).name, '凡女侍妾')
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
check('坊市宝匣已开放', chestShopOpen(), true)
checkTrue(
  '1~5 阶可买（status = open）',
  CHEST_TIERS.slice(0, 5).every(chest => chest.status === 'open')
)
checkTrue(
  '6/7 阶置灰（status = unavailable）',
  CHEST_TIERS.slice(5).every(chest => chest.status === 'unavailable')
)
checkTrue(
  '宝匣名称带材质',
  CHEST_TIERS.every(chest => chest.name.includes(chest.material))
)

// 坊市按境界解锁（P41 #2，2026-10-25）
check(
  '解锁等级 = 1/1/11/21/31',
  CHEST_TIERS.slice(0, 5).map(chest => chest.unlockLevel).join(','),
  '1,1,11,21,31'
)
check('一阶宝匣练气一层就解锁', isChestUnlockedAt(1, 1), true)
check('二阶宝匣练气一层就解锁', isChestUnlockedAt(2, 1), true)
check('三阶宝匣十层（练气巅峰）仍锁着', isChestUnlockedAt(3, 10), false)
check('三阶宝匣筑基一层（11）解锁', isChestUnlockedAt(3, 11), true)
check('四阶宝匣金丹一层（21）解锁', isChestUnlockedAt(4, 21), true)
check('四阶宝匣筑基十层（20）仍锁着', isChestUnlockedAt(4, 20), false)
// ⚠ 31 = 元婴一层，境界表只到 30（金丹十层）—— 五阶坊市**当前永远买不到**（拍板过的预期行为）
check('五阶宝匣在 30 级（金丹十层）仍锁着', isChestUnlockedAt(5, 30), false)
check('五阶宝匣在 31 级（元婴一层）解锁', isChestUnlockedAt(5, 31), true)
check('6/7 阶没有解锁等级（不定价、不流通）', CHEST_TIERS.slice(5).every(chest => chest.unlockLevel == null), true)
check('解锁文案：三阶 → 筑基一层', chestUnlockLabelOf(3), '筑基一层')
check('解锁文案：四阶 → 金丹一层', chestUnlockLabelOf(4), '金丹一层')
check('解锁文案：五阶 → 结婴（超出境界表，按设计文案）', chestUnlockLabelOf(5), '结婴')
check('解锁文案：6 阶 → null', chestUnlockLabelOf(6), null)

// ================= 十、物品回收（《模块六》§9.2，Q3 定稿） =================
check('基础价 1 阶 = 6', ITEM_BASE_PRICE[1], 6)
check('基础价 2 阶 = 24', ITEM_BASE_PRICE[2], 24)
check('基础价 3 阶 = 96', ITEM_BASE_PRICE[3], 96)
check('基础价 4 阶 = 384', ITEM_BASE_PRICE[4], 384)
check('基础价 5 阶 = 1,536', ITEM_BASE_PRICE[5], 1536)
check('基础价表外（6 阶）→ null', basePriceOfTier(6), null)
check('回收率 30%', RECYCLE_RATE, 0.3)
check('可回收四池', SELLABLE_CATEGORIES.join(','), '灵器,灵兽,灵植,灵材')

const sword1 = { id: 'a', baseId: 'b1', name: '青玉剑', category: '灵器', tier: 1, quality: '下' }
const herb2 = { id: 'b', baseId: 'b2', name: '凝露草', category: '灵植', tier: 2, quality: '中' }
const pet1 = { id: 'c', baseId: 'b3', name: '玄龟', category: '灵兽', type: 'pet', tier: 1, quality: '上' }
const top4 = { id: 'd', category: '灵材', tier: 4, quality: '上' }
const max5 = { id: 'e', category: '灵材', tier: 5, quality: '极' }
const pill = { id: 'f', category: '丹药', type: 'pill', tier: 1, quality: '中' }
const zeroTier = { id: 'g', category: '灵材', tier: 0, quality: '中' }

// 2026-10-23 P36 第 7 步：成色系数整条删掉，回收价只按阶
check(
  '★回收价表：2/7/29/115/461',
  [1, 2, 3, 4, 5].map(tier => sellPriceOf({ tier })).join('/'),
  '2/7/29/115/461'
)
check('回收：1 阶 1.8 → 2', sellPriceOf(sword1), 2)
check('回收：2 阶 7.2 → 7', sellPriceOf(herb2), 7)
check('回收：4 阶 115.2 → 115', sellPriceOf(top4), 115)
check('回收：5 阶 460.8 → 461', sellPriceOf(max5), 461)
check(
  '★成色不影响回收价（同阶下品 = 极品）',
  sellPriceOf({ tier: 3, quality: '极' }),
  sellPriceOf({ tier: 3, quality: '下' })
)
check('  三阶不看成色恒 29', sellPriceOf({ tier: 3, quality: '极' }), 29)
check('  缺成色字段照样算', sellPriceOf({ tier: 2 }), 7)
check('回收：表外 → null', sellPriceOf(zeroTier), null)

checkTrue('灵器可卖', isSellable(sword1))
checkTrue('丹药不可卖', !isSellable(pill))
checkTrue('表外不可卖', !isSellable(zeroTier))
checkTrue('品种锁定不可卖', !isSellable(herb2, { lockedSpecies: ['b2'] }))
checkTrue('出战灵宠不可卖', !isSellable(pet1, { activePetId: 'c' }))
checkTrue('非出战灵宠可卖', isSellable(pet1, { activePetId: 'other' }))

const candidateList = recycleCandidates([sword1, herb2, pill, zeroTier])
check('候选只留四池表内：2 件', candidateList.length, 2)
check('候选价：2 + 7', candidateList.map(entry => entry.price).join(','), '2,7')
const summary = sumRecycle([sword1, herb2, pet1])
check('一键售出件数 = 3', summary.count, 3)
check('一键售出总价 = 2 + 7 + 2 = 11', summary.total, 11)

// ---------- store action：卖出 / 品种锁 / 买入 ----------
const makeMock = items => ({
  items,
  currency: { secular: 0, spiritual: 0, strategic: 0 },
  lockedSpecies: [],
  activePet: null,
  saved: 0,
  saveData() {
    this.saved += 1
  },
  recycleOptions: inventoryActions.recycleOptions,
  sellItem: inventoryActions.sellItem,
  sellAllUnlocked: inventoryActions.sellAllUnlocked,
  toggleSpeciesLock: inventoryActions.toggleSpeciesLock
})

const sellMock = makeMock([sword1, herb2, pet1, pill])
const oneSold = sellMock.sellItem('a')
check('单件卖出成功', oneSold.ok, true)
check('单件卖出价 = 2', oneSold.price, 2)
check('单件卖出从背包移除', sellMock.items.length, 3)
check('单件卖出灵石入账', sellMock.currency.spiritual, 2)
check('卖不存在的物品失败', sellMock.sellItem('nope').ok, false)
check('卖丹药失败', sellMock.sellItem('f').ok, false)
check('失败不扣物品', sellMock.items.length, 3)

const lockMock = makeMock([sword1, herb2])
check('加锁返回 true', lockMock.toggleSpeciesLock('b2'), true)
check('加锁写入品种锁', lockMock.lockedSpecies.join(','), 'b2')
check('锁定品种单卖失败', lockMock.sellItem('b').ok, false)
check('同品种其余实例仍可卖', lockMock.sellItem('a').ok, true)
check('解锁返回 false', lockMock.toggleSpeciesLock('b2'), false)
check('解锁后品种锁为空', lockMock.lockedSpecies.length, 0)
check('解锁后可卖', lockMock.sellItem('b').ok, true)

const allMock = makeMock([sword1, herb2, pet1, pill])
allMock.activePet = { id: 'c' }
const allSold = allMock.sellAllUnlocked()
check('一键售出成功', allSold.ok, true)
check('一键售出排除丹药与出战灵宠：2 件', allSold.count, 2)
check('一键售出总价 = 2 + 7', allSold.total, 9)
check('一键售出后背包只剩丹药与灵宠', allMock.items.map(item => item.id).join(','), 'c,f')
check('一键售出灵石入账', allMock.currency.spiritual, 9)
check('没有可卖物品时失败', makeMock([]).sellAllUnlocked().ok, false)

/** `level` 是内功境界（P41 #2 门槛读它）；18 = 结丹圆满，除五阶外全解锁 */
const buyMock = {
  level: 18,
  chests: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 },
  currency: { secular: 0, spiritual: 1000, strategic: 0 },
  saved: 0,
  saveData() {
    this.saved += 1
  },
  spendCurrency: inventoryActions.spendCurrency,
  gainCurrency: inventoryActions.gainCurrency,
  gainChest: inventoryActions.gainChest,
  buyChest: inventoryActions.buyChest
}
const bought1 = buyMock.buyChest(1, 1)
check('买一阶宝匣成功', bought1.ok, true)
check('买一阶宝匣花 100 一阶', bought1.cost, 100)
check('买后修仙 = 900', buyMock.currency.spiritual, 900)
check('买后进宝匣库存', buyMock.chests[1], 1)
const buyClosed = buyMock.buyChest(6, 1)
check('六阶宝匣不可买', buyClosed.ok, false)
check('不可买时不扣钱', buyMock.currency.spiritual, 900)
const buyTooMuch = buyMock.buyChest(3, 1)
check('灵石不足：买入失败', buyTooMuch.ok, false)
check('灵石不足：余额不动', buyMock.currency.spiritual, 900)
check('灵石不足：不产匣', buyMock.chests[3], 0)

// 门槛拦在 store 里（P41 #2）：低境界连「扣钱」这一步都走不到
const lowMock = { ...buyMock, level: 10, currency: { secular: 0, spiritual: 100000, strategic: 0 } }
const buyLocked = lowMock.buyChest(3, 1)
check('练气买三阶被境界拦住', buyLocked.ok, false)
checkTrue('拦下时的提示指向解锁境界', /筑基/.test(buyLocked.message || ''))
check('被境界拦住时一分不扣', lowMock.currency.spiritual, 100000)
const buyFiveAt18 = buyMock.buyChest(5, 1)
check('18 级（结丹圆满）也买不到五阶（要元婴 19）', buyFiveAt18.ok, false)

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
