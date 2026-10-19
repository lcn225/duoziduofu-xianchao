// 物品池 / 20 品阶 / 宝箱 TC 引擎断言（P17 第 2 步）。
//
// 覆盖：
//   · 四池底材的 8 字段、id/series 唯一性、灵气与基阶合法性
//   · 物品 21 个显示档（20 品阶 + 不入品）与排序
//   · 六档同参亲和度（正主 / 准正主 / 同系列 / 近类型 / 同类型 / 无关）
//   · 多本命抽取（同系列不重复、灵气优先不重复）
//   · 七阶宝匣的 TC 引擎（Pick / NoDrop / 掉钱 / 物品 / 特殊道具）
//
// 全部常量或固定种子，不做统计断言。
import {
  DEFAULT_QUALITY_WEIGHTS,
  FATE_ELEMENTS,
  FATE_POOL,
  ITEM_CATEGORIES,
  ITEM_POOL,
  KIND_OF_CATEGORY,
  affinityOf,
  baseSnapshot,
  createItemInstance,
  displayNameOf,
  isNearKind,
  isNearName,
  itemById,
  rollBaseItem,
  rollFateSet,
  rollItemQuality,
  fatesFromRoots,
  clampFateTiers
} from '../src/plugins/items.js'
import {
  ITEM_QUALITIES,
  ITEM_TIER_KEYS,
  ITEM_TIER_NAMES,
  ITEM_TIER_RANK,
  isItemTierAtLeast,
  itemTierKey,
  itemTierName,
  splitItemTier
} from '../src/plugins/tiers.js'
import {
  TUNING as CHEST_TUNING,
  chestMaxItemTier,
  chestNodesOf,
  openChest,
  pickWeighted,
  rollItemTierForChest
} from '../src/plugins/chest.js'
import { CHEST_TIERS } from '../src/plugins/shop.js'

let passed = 0
let failed = 0
const check = (name, actual, expected) => {
  const ok = Object.is(actual, expected)
  if (ok) passed += 1
  else failed += 1
  console.log(`[${ok ? '  ok  ' : ' FAIL '}] ${name}`.padEnd(66), actual)
}
const checkTrue = (name, actual) => check(name, !!actual, true)

const seeded = seed => {
  let s = (Number(seed) >>> 0) || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}
const constRng = value => () => value

// ================= 一、四池底材 =================
check('四池类别', ITEM_CATEGORIES.join(','), '灵器,灵兽,灵植,灵材')
check('灵气枚举 7 类', FATE_ELEMENTS.join(','), 'metal,wood,water,fire,earth,beast,vessel')

const REQUIRED_FIELDS = ['id', 'name', 'category', 'type', 'series', 'tier', 'fateElement', 'description']
checkTrue(
  '★每个底材恰好 8 个字段',
  ITEM_POOL.every(item => {
    const keys = Object.keys(item)
    return keys.length === 8 && REQUIRED_FIELDS.every(field => field in item)
  })
)
checkTrue('★id 全局唯一', new Set(ITEM_POOL.map(item => item.id)).size === ITEM_POOL.length)
checkTrue(
  '★同 category + series 下 name 不重复',
  new Set(ITEM_POOL.map(item => `${item.category}:${item.series}:${item.name}`)).size ===
    ITEM_POOL.length
)
checkTrue('★category 都在四池内', ITEM_POOL.every(item => ITEM_CATEGORIES.includes(item.category)))
checkTrue(
  '★tier 都是 1~5 的整数（不带成色）',
  ITEM_POOL.every(item => Number.isInteger(item.tier) && item.tier >= 1 && item.tier <= 5)
)
checkTrue(
  '★fateElement 都在 7 类灵气内',
  ITEM_POOL.every(item => FATE_ELEMENTS.includes(item.fateElement))
)
checkTrue('每池至少 10 件', ITEM_CATEGORIES.every(cat => ITEM_POOL.filter(i => i.category === cat).length >= 10))
checkTrue(
  '★7 类灵气都有底材（本命抽卡不会无池可抽）',
  FATE_ELEMENTS.every(element => ITEM_POOL.some(item => item.fateElement === element))
)

// 兼容入口：开局五件 + 玩家两个本命
const OPENING_IDS = ['taotie_shield', 'wu_li_zhu_yao', 'qingyu_sword', 'jinggang_ci', 'lingteng_shield']
checkTrue('★开局五件都在物品池里', OPENING_IDS.every(id => !!itemById(id)))
checkTrue('★玩家两个本命都在物品池里', ['dao_back_boar', 'taotie_jade'].every(id => !!itemById(id)))
check('itemById 未知 id 返回 null', itemById('no_such_item'), null)
checkTrue(
  '★kind 映射只用旧词表',
  ITEM_POOL.every(item => ['灵兽', '器物', '草木', '杂物'].includes(KIND_OF_CATEGORY[item.category]))
)
check('FATE_POOL 四档都非空', ['low', 'mid', 'high', 'top'].every(q => FATE_POOL[q].length > 0), true)
checkTrue(
  'FATE_POOL 是底材兼容视图（带 id/element/kind）',
  Object.values(FATE_POOL)
    .flat()
    .every(f => f.id && f.element && f.kind)
)

// ================= 二、物品 21 档 =================
check('物品显示档共 21 个', ITEM_TIER_KEYS.length, 21)
check('不入品排最前', ITEM_TIER_KEYS[0], 'none')
check('最后一档 = 五阶极品', ITEM_TIER_KEYS[20], '5极')
check('成色共 4 档', ITEM_QUALITIES.join(','), '下,中,上,极')
check('一阶下品排序 = 1', ITEM_TIER_RANK['1下'], 1)
check('五阶极品排序 = 20', ITEM_TIER_RANK['5极'], 20)
check('不入品排序 = 0', ITEM_TIER_RANK.none, 0)
check('一阶中品显示名', ITEM_TIER_NAMES['1中'], '一阶中品')
check('五阶极品显示名', ITEM_TIER_NAMES['5极'], '五阶极品')
check('itemTierKey(1, 中)', itemTierKey(1, '中'), '1中')
check('itemTierKey(5, 极)', itemTierKey(5, '极'), '5极')
check('itemTierKey(3, none) = 不入品', itemTierKey(3, 'none'), 'none')
check('itemTierKey(9, 极) 封顶五阶', itemTierKey(9, '极'), '5极')
check('split(1中).tier', splitItemTier('1中').tier, 1)
check('split(1中).quality', splitItemTier('1中').quality, '中')
check('split(none).tier', splitItemTier('none').tier, 0)
check('itemTierName(2上)', itemTierName('2上'), '二阶上品')
checkTrue('★四阶极品 ≥ 三阶极品', isItemTierAtLeast('4极', '3极'))
checkTrue('★三阶极品 < 四阶下品', !isItemTierAtLeast('3极', '4下'))
check('空门槛一律通过', isItemTierAtLeast('none', null), true)

// ================= 三、同参六档 =================
const boarMaster = { name: '刃背乌鬣猪', category: '灵兽', series: 'boar', type: '妖兽' }
check('正主：name 完全相同 = 1.0', affinityOf(itemById('dao_back_boar'), boarMaster).coef, 1.0)
check(
  '准正主：同系列 + 名字包含 = 0.8',
  affinityOf({ name: '刃背乌鬣猪妖·成年', category: '灵兽', series: 'boar', type: '妖兽' }, boarMaster).coef,
  0.8
)
check('同系列：同 series 不同名 = 0.6', affinityOf(itemById('boar_2'), boarMaster).coef, 0.6)
check('准正主：幼体名包含本命名 = 0.8', affinityOf(itemById('boar_1'), boarMaster).coef, 0.8)
check(
  '近类型：同 category + type 近似 = 0.4',
  affinityOf(itemById('qingyu_dagger'), {
    name: '某把飞剑',
    category: '灵器',
    series: 'x',
    type: '飞剑'
  }).coef,
  0.4
)
check(
  '同类型：同 category、type 不相近 = 0.25',
  affinityOf(itemById('taotie_shield'), {
    name: '某块玉牌',
    category: '灵器',
    series: 'x',
    type: '牌'
  }).coef,
  0.25
)
check('无关：跨 category = 0.1', affinityOf(itemById('cao_huichun_1'), boarMaster).coef, 0.1)

check('名字近似：包含关系', isNearName('刃背乌鬣猪妖·成年', '刃背乌鬣猪'), true)
check('名字近似：互不包含', isNearName('饕餮纹白玉牌', '饕餮纹暗金镶青金石玉牌'), false)
check('类型近似：飞剑~匕', isNearKind('灵器', '飞剑', '匕'), true)
check('类型近似：盾~牌 不算近', isNearKind('灵器', '盾', '牌'), false)

// ================= 四、底材 → 实例 =================
const xuanbing = itemById('xuanbing_1')
const snap = baseSnapshot(xuanbing)
check('快照带 baseId', snap.baseId, 'xuanbing_1')
check('快照带 kind', snap.kind, '器物')
check('底材显示名', displayNameOf(xuanbing, 'none'), '不入品【寒冰刺】')
check('实例显示名', displayNameOf(xuanbing, '极'), '一阶极品【寒冰刺】')
const inst = createItemInstance(xuanbing, { quality: '极', instanceId: 'inst_test' })
check('实例 id', inst.instanceId, 'inst_test')
check('实例指回底材', inst.baseId, 'xuanbing_1')
check('实例品阶键', inst.tierKey, '1极')
check('实例带战斗面板位', inst.stats, null)
check('实例位置默认背包', inst.location, 'inventory')

check('成色 roll：0 → 下', rollItemQuality(constRng(0)), '下')
check('成色 roll：0.99 → 极', rollItemQuality(constRng(0.99)), '极')
check('成色权重合计 = 1', Object.values(DEFAULT_QUALITY_WEIGHTS).reduce((a, b) => a + b, 0), 1)

// ================= 五、多本命 =================
const fateRng = seeded(7)
const fates = rollFateSet({ count: 5, rng: fateRng })
check('抽 5 件本命', fates.length, 5)
check('★本命同系列不重复', new Set(fates.map(f => `${f.category}:${f.series}`)).size, 5)
checkTrue('本命允许灵气重复（灵根 = 去重集合）', new Set(fates.map(f => f.fateElement)).size <= 5)
checkTrue('本命快照带 kind', fates.every(f => !!f.kind))

// ★核心口径（2026-10-19）：先定本命，再查表判断灵根；3 件木系本命 = 单木灵根
const woodPool = ITEM_POOL.filter(item => item.fateElement === 'wood').filter(
  (item, index, arr) => arr.findIndex(other => other.series === item.series) === index
)
const woodFates = rollFateSet({ count: 3, rng: constRng(0), pool: woodPool.slice(0, 3) })
check('★3 件木系本命', woodFates.length, 3)
check('★3 件木系本命 → 单木灵根', new Set(woodFates.map(f => f.fateElement)).size, 1)

// 压阶：只换同灵气的低阶底材，灵根集合不变
const clamped = clampFateTiers({
  fates: [baseSnapshot(itemById('taotie_jade')), baseSnapshot(itemById('qingmu_2'))],
  maxTier: 2,
  rng: constRng(0)
})
checkTrue('压阶：全部 ≤2 阶', clamped.every(f => f.tier <= 2))
check('压阶：灵气不变', clamped.map(f => f.fateElement).join(','), 'vessel,wood')
check('抽 1 件本命', rollFateSet({ count: 1, rng: seeded(3) }).length, 1)
check('抽 0 件本命返回空', rollFateSet({ count: 0, rng: seeded(3) }).length, 0)

// P17 修正（2026-10-19）：本命品阶上限（是上限，不是保底）
const capped5 = rollFateSet({ count: 5, maxTier: 1, rng: seeded(7) })
check('★五灵根本命全部 ≤1 阶', capped5.every(f => f.tier <= 1), true)
check('★五灵根仍能抽满 5 件（1 阶池子够）', capped5.length, 5)
check('★上限不是保底：单件 maxTier=5、rng 0 → 1 阶', rollFateSet({ count: 1, maxTier: 5, rng: constRng(0) })[0].tier, 1)
check('四灵根上限 2 阶', rollFateSet({ count: 4, maxTier: 2, rng: seeded(7) }).every(f => f.tier <= 2), true)

// 老档迁移：按 roots 稳定补齐（不重掷）
const migratedFates = fatesFromRoots({
  roots: ['water', 'fire', 'wood', 'beast', 'vessel'],
  maxTier: 1,
  seed: 'c_legacy_iron'
})
check('老档补齐：数量 = roots 数量', migratedFates.length, 5)
check(
  '老档补齐：属性 = roots',
  [...new Set(migratedFates.map(f => f.fateElement))].sort().join(','),
  ['water', 'fire', 'wood', 'beast', 'vessel'].sort().join(',')
)
check('老档补齐：全部 ≤1 阶', migratedFates.every(f => f.tier <= 1), true)
check(
  '老档补齐：稳定（同 seed 同结果）',
  fatesFromRoots({
    roots: ['water', 'fire', 'wood', 'beast', 'vessel'],
    maxTier: 1,
    seed: 'c_legacy_iron'
  })
    .map(f => f.id)
    .join(','),
  migratedFates.map(f => f.id).join(',')
)
checkTrue('★tier 区间可收窄', rollBaseItem({ minTier: 3, maxTier: 3, rng: seeded(1) }).tier === 3)
checkTrue(
  '★excludeSeries 生效',
  (() => {
    const banned = new Set(['灵兽:boar'])
    return rollBaseItem({ category: '灵兽', excludeSeries: banned, rng: seeded(1) }).series !== 'boar'
  })()
)

// ================= 六、宝箱 TC 引擎 =================
check('宝匣价格表 7 阶', CHEST_TIERS.length, 7)
check('一阶匣 Pick = 3', CHEST_TUNING.picks[1], 3)
check('七阶匣 Pick = 6', CHEST_TUNING.picks[7], 6)
check('六阶匣最高物品基阶封顶五阶', chestMaxItemTier(6), 5)
check('七阶匣最高物品基阶封顶五阶', chestMaxItemTier(7), 5)
check('一阶匣最高物品基阶 = 1', chestMaxItemTier(1), 1)

const nodes1 = chestNodesOf(1)
check('一阶匣 TC 节点 = 4 类', nodes1.length, 4)
check('一阶匣 TC 权重合计 = 100', nodes1.reduce((s, n) => s + n.weight, 0), 100)
const nodes7 = chestNodesOf(7)
check('七阶匣 TC 权重合计 = 100', nodes7.reduce((s, n) => s + n.weight, 0), 100)
checkTrue('一阶匣没有特殊道具节点', !chestNodesOf(1).some(n => n.kind === 'special' && n.weight > 0))
checkTrue('四阶匣有特殊道具节点', chestNodesOf(4).some(n => n.kind === 'special' && n.weight > 0))

check(
  '加权抽取：第一个节点',
  pickWeighted([{ kind: 'a', weight: 1 }, { kind: 'b', weight: 1 }], constRng(0)).kind,
  'a'
)
check(
  '加权抽取：第二个节点',
  pickWeighted([{ kind: 'a', weight: 1 }, { kind: 'b', weight: 1 }], constRng(0.9)).kind,
  'b'
)
check('加权抽取：全 0 返回 null', pickWeighted([{ weight: 0 }], constRng(0)), null)

check('降阶：0 → 本箱 -1', rollItemTierForChest(5, constRng(0)), 4)
check('越阶：0.99 → 本箱 +1', rollItemTierForChest(4, constRng(0.99)), 5)
check('越阶封顶五阶', rollItemTierForChest(5, constRng(0.99)), 5)
check('降阶下限一阶', rollItemTierForChest(1, constRng(0)), 1)
check('常态 = 本箱阶级', rollItemTierForChest(3, constRng(0.5)), 3)

const chest1 = openChest(1, seeded(11))
check('一阶匣 Pick 次数', chest1.picks, 3)
checkTrue('一阶匣掉落不超过 Pick', chest1.entries.length <= chest1.picks)
checkTrue(
  '一阶匣掉落只有物品/一阶灵石',
  chest1.entries.every(e => e.kind === 'item' || (e.kind === 'currency' && e.currency === 'stone1'))
)
checkTrue(
  '物品掉落带 baseId / 成色 / 品阶键 / 显示名',
  chest1.entries
    .filter(e => e.kind === 'item')
    .every(e => e.baseId && e.quality && e.tierKey && e.displayName)
)

const chest5 = openChest(5, seeded(23))
check('五阶匣 Pick 次数', chest5.picks, 5)
checkTrue(
  '五阶匣掉落币种 = 二阶灵石',
  chest5.entries.filter(e => e.kind === 'currency').every(e => e.currency === 'stone2')
)
const chest7 = openChest(7, seeded(31))
checkTrue(
  '★七阶匣也不出六阶物品',
  chest7.entries.filter(e => e.kind === 'item').every(e => splitItemTier(e.tierKey).tier <= 5)
)
checkTrue(
  '★所有物品掉落的品阶键合法',
  [chest1, chest5, chest7].every(chest =>
    chest.entries.filter(e => e.kind === 'item').every(e => ITEM_TIER_KEYS.includes(e.tierKey))
  )
)

// 特殊道具：洗命符只能从四阶以上出
const fateCharmEntries = tier => {
  for (let seed = 1; seed <= 2000; seed += 1) {
    const box = openChest(tier, seeded(seed))
    if (box.entries.some(e => e.kind === 'special' && e.id === 'fate_charm')) return true
  }
  return false
}
checkTrue('★四阶以上存在洗命符掉落路径', fateCharmEntries(4))

// ================= 汇总 =================
console.log(`\n${passed}/${passed + failed} 通过`)
if (failed) {
  console.error(`${failed} 条断言失败`)
  process.exit(1)
}
