// 气运轮盘（诞生抽奖）—— 纯函数层（2026-11-24 施工）
//
// 真源：
//   · 《模块二》§6.0.2 气运轮盘（定稿表）/ §6.0.2.2 奖池权重 / §6.0.2.3 施工闸门
//   · 《产出登记表》R74（每抽期望：灰 0.09 / 白 2 / 绿 2 / 蓝 7 / 紫 7 一阶）
//
// 口径（别改错）：
//   1. **档位 = 九色里的一段**（复用 `itemColorClassOf`，不另立第三套映射）：
//      灰 = tier 0 凡俗；白 = 一阶下/中；绿 = 一阶上/极；蓝 = 二阶下/中；紫 = 二阶上/极。
//      **封顶紫**，金 / 暗金 / 红 / 彩挂 v1.5。
//   2. **第 n 抽的档位按抽序上抬**：第 1 抽灰、第 2 白、第 3 绿、第 4 蓝、第 5 起紫。
//      抽数 = 1 + 本次诞生新达成的成就数（`lotteryDrawCountOf`）。
//   3. **灰档一律折现、不入背包**：凡俗物品按 30 大子，货币格 = 金页子 ×1~3。
//      灰档**只存名字**（61 条），不建 `tier:0` 物品实例 —— 物品池里本来就没有凡俗品类，
//      抽到即折钱，没有入包路径。
//   4. **白起档正常入包**：灵器 / 灵材从 `ITEM_POOL` 抽；**丹药 / 符箓是百艺产物**
//      （物品池里没有这两个 category），按配方模板现生成，阶 = 档位阶（1 / 2）。
//      这是设计稿「灵器 55 / 丹药 25 / 符箓 10 / 灵材 10」在代码里的落地映射，
//      权重不变；回血丹等 `recover` 配方也能抽到（与秘境消耗品同形）。
//   5. 灵兽 / 灵植 / 心法残页 / 配方**不进池**（《模块二》§6.0.2.2 的三条理由）。
//
// ⚠ 产出无偏的锚点是「每抽 = 一件本档物品」：白/绿回收 2 一阶、蓝/紫回收 7 一阶。
//   新增品类要先把回收价对齐 R74，再回来改 `categoryWeights`。

import {
  ITEM_POOL,
  rollBaseItem,
  createItemInstance,
  isFixedQualityCategoryOf,
  qualityOfBaseOf,
  surfaceNameOf
} from './items.js'
import { RECIPES, buildConsumableItem } from './arts.js'

/** 档位顺序（封顶紫；index 越大越贵） */
export const LOTTERY_TIERS = ['gray', 'white', 'green', 'blue', 'purple']

export const LOTTERY_TIER_META = {
  gray: { name: '灰', tier: 0, label: '凡俗' },
  white: { name: '白', tier: 1, label: '一阶 · 下中品' },
  green: { name: '绿', tier: 1, label: '一阶 · 上极品' },
  blue: { name: '蓝', tier: 2, label: '二阶 · 下中品' },
  purple: { name: '紫', tier: 2, label: '二阶 · 上极品' }
}

export const LOTTERY_TUNING = {
  /** 凡俗物品折价（《模块二》§6.0.2.2：一律 30 大子/件，不入包） */
  grayCash: 30,
  /** 灰档「货币」格的额度：金页子 ×1~3（100 大子 = 1 金页子） */
  grayJinYeZi: [1, 3],
  /** 灰档大类权重（奢侈品 50 / 武学 20 / 暗器 10 / 物资 10 / 货币 10） */
  grayWeights: { luxury: 50, martial: 20, hidden: 10, goods: 10, cash: 10 },
  /**
   * 白起档的品类权重（《模块二》§6.0.2.2）。
   * 灵器 55 / 丹药 25 / 符箓 10 / 灵材 10；灵兽 / 灵植 / 残页 / 配方不进池。
   */
  categoryWeights: { 灵器: 55, 丹药: 25, 符箓: 10, 灵材: 10 },
  /**
   * 成色权重：沿用宝匣的 60/25/12/3，再按档位截取 ——
   * 白 / 蓝只取 [下, 中]、绿 / 紫只取 [上, 极]（与「档位 = 阶 + 成色」的九色映射一致）。
   * 玩家看到的仍是「白档 = 一阶下中」，不是抽到白的却给了上品。
   */
  qualityWeights: { 下: 60, 中: 25, 上: 12, 极: 3 }
}

/**
 * 灰档物品池（61 条，**只存名字**；抽到一律折 30 大子、不入背包）。
 * ⚠ 原作原词 9 条：迷踪步 / 摘星手 / 暴雨梨花针 / 福禄寿摆件 / 东珠头面 /
 *   点翠头面 / 珍品头面 / 翔鹤图屏风 / 山水画折扇。其余自拟（《模块二》§6.0.2.2）。
 */
export const GRAY_POOL = {
  luxury: [
    '福禄寿摆件', '东珠头面', '点翠头面', '珍品头面', '翔鹤图屏风', '山水画折扇',
    '鎏金香炉', '白玉屏风', '紫檀多宝格', '螺钿黄杨木匣', '和田玉如意', '象牙棋枰',
    '端溪砚台', '宣德铜炉', '汝窑天青盏', '钧窑海棠洗', '缂丝屏风', '苏绣百鸟图',
    '金丝楠木箱', '象牙雕十八罗汉', '翡翠白菜摆件', '玛瑙盘', '琉璃盏', '夜明珠',
    '沉香念珠', '犀角杯', '玳瑁梳妆匣', '珐琅彩瓶', '青花缠枝梅瓶', '粉彩百蝶瓶',
    '竹雕笔筒', '紫砂茶具', '象牙骨折扇', '蜀锦被面', '云锦袍料', '狐裘大氅',
    '貂皮褥子', '鎏金錾花盘', '银鎏金酒器', '红木八仙桌', '紫檀太师椅', '黄花梨拔步床',
    '琉璃屏风', '珊瑚树盆景', '碧玉如意', '羊脂玉扳指', '翡翠手镯', '东珠项链'
  ],
  martial: ['迷踪步', '摘星手', '铁布衫', '八卦掌', '五禽戏', '八段锦'],
  hidden: ['暴雨梨花针', '柳叶飞刀', '袖箭', '梅花针'],
  goods: ['粳稻千斤', '粗布十匹', '陶器一套']
}

/** 灰档条目总数（断言用；奢侈品 48 + 武学 6 + 暗器 4 + 物资 3） */
export const GRAY_ITEM_COUNT = Object.values(GRAY_POOL).reduce((sum, list) => sum + list.length, 0)

const pickWeightedKey = (weights, rng = Math.random) => {
  const entries = Object.entries(weights)
  const total = entries.reduce((acc, [, w]) => acc + (Number(w) || 0), 0)
  let r = (rng() || 0) * total
  for (const [key, w] of entries) {
    r -= Number(w) || 0
    if (r < 0) return key
  }
  return entries[entries.length - 1][0]
}

const pickOne = (list, rng = Math.random) =>
  list[Math.min(Math.floor((rng() || 0) * list.length), list.length - 1)]

/**
 * 第 `drawIndex`（0 起）抽的档位 —— 灰白绿蓝紫，封顶紫。
 * 与《模块二》§6.0.2.1 的成就规则同源：第 1 抽灰，每多一个成就抬一档。
 */
export const lotteryTierOfIndex = drawIndex => {
  const i = Math.max(Math.floor(Number(drawIndex) || 0), 0)
  return LOTTERY_TIERS[Math.min(i, LOTTERY_TIERS.length - 1)]
}

/** 一次出生的抽数 = 1 + 成就数 */
export const lotteryDrawCountOf = achievementCount =>
  1 + Math.max(Math.floor(Number(achievementCount) || 0), 0)

/**
 * 灰档一抽。**一律折现**：
 *   - 奢侈品 / 武学 / 暗器 / 物资 → 30 大子（带物品名，面板照常显示）
 *   - 货币格 → 金页子 ×1~3 = 100~300 大子
 * @returns {{ kind:'currency', currency:'secular', amount:number, name:string,
 *             tier:'gray', tierName:string, tierTone:string }}
 */
export const rollGrayEntry = (rng = Math.random) => {
  const group = pickWeightedKey(LOTTERY_TUNING.grayWeights, rng)
  if (group === 'cash') {
    const [lo, hi] = LOTTERY_TUNING.grayJinYeZi
    const n = lo + Math.floor((rng() || 0) * (hi - lo + 1))
    return {
      kind: 'currency',
      currency: 'secular',
      amount: n * 100,
      name: `金页子 ×${n}`,
      tier: 'gray',
      tierName: LOTTERY_TIER_META.gray.name,
      tierTone: 'ui-tier-gray'
    }
  }
  const name = pickOne(GRAY_POOL[group] || GRAY_POOL.goods, rng)
  return {
    kind: 'currency',
    currency: 'secular',
    amount: LOTTERY_TUNING.grayCash,
    name,
    tier: 'gray',
    tierName: LOTTERY_TIER_META.gray.name,
    tierTone: 'ui-tier-gray'
  }
}

/** 按档位取成色组：白/蓝 = 下中，绿/紫 = 上极 */
const qualityGroupOf = tier =>
  tier === 'white' || tier === 'blue' ? ['下', '中'] : ['上', '极']

export const rollQualityOfTier = (tier, rng = Math.random) => {
  const group = qualityGroupOf(tier)
  const weights = {}
  for (const q of group) weights[q] = LOTTERY_TUNING.qualityWeights[q] || 1
  return pickWeightedKey(weights, rng)
}

/** 同类兜底：该阶该品类缺条目时退到同品类最近阶（与宝匣 `openChest` 同口径） */
const baseOfCategoryTier = (category, tier, rng) =>
  rollBaseItem({ category, minTier: tier, maxTier: tier, rng }) ||
  rollBaseItem({ category, minTier: 1, maxTier: 5, rng })

/**
 * 固定成色品类（灵材 / 灵植）的底材池：**按档位成色带过滤**（#8 A-3，2026-11-26）。
 *
 * 档位契约是「白/蓝 = 下中、绿/紫 = 上极」，但材料的成色现在是底材写死的，
 * 所以只能反过来：只有固定成色落在该带内的底材才进池 —— 否则会出现「抽到白档却给上品」。
 * 一阶灵材 52 件里 下 26 + 中 16 = 42 件可进白/蓝档、二阶 40 件里 上 6 + 极 2 = 8 件可进绿/紫档，池子够用。
 * 该阶没有落在这带里的底材时，退到同品类全阶（与 `baseOfCategoryTier` 同口径）。
 */
const fixedQualityBaseOf = (category, tier, group, rng) => {
  const inBand = item => group.includes(qualityOfBaseOf(item.id))
  const sameTier = ITEM_POOL.filter(
    item => item.category === category && item.tier === tier && inBand(item)
  )
  const pool = sameTier.length ? sameTier : ITEM_POOL.filter(item => item.category === category && inBand(item))
  if (!pool.length) return null
  return pool[Math.min(Math.floor(rng() * pool.length), pool.length - 1)]
}

/** 丹药 / 符箓：从本艺配方里现生成一件该阶消耗品（物品池没有这两个 category） */
const consumableOfCategoryTier = (category, tier, quality, rng) => {
  const art = category === '丹药' ? 'alchemy' : 'talisman'
  // 阶不高于档位阶的配方才算「这一档能抽到的」：紫档能出二阶配方，白档只出一阶配方
  const pool = RECIPES.filter(recipe => recipe.art === art && Number(recipe.tier) <= tier)
  if (!pool.length) return null
  const recipe = pickOne(pool, rng)
  consumableSeq += 1
  return buildConsumableItem(recipe, { seq: consumableSeq, quality, tier })
}

/** 同毫秒内多次生成消耗品时避免 id 撞号 */
let consumableSeq = 0

/**
 * 白起档一抽：返回**已生成的物品实例**（调用方直接入包）。
 * @returns {{ kind:'item', category:string, baseId:string, name:string, quality:string,
 *             item:object, tier:string, tierName:string, tierTone:string } | null}
 */
export const rollTierEntryOf = (tier, rng = Math.random) => {
  const meta = LOTTERY_TIER_META[tier]
  if (!meta || meta.tier <= 0) return null
  const category = pickWeightedKey(LOTTERY_TUNING.categoryWeights, rng)
  const quality = rollQualityOfTier(tier, rng)

  let item = null
  if (category === '丹药' || category === '符箓') {
    item = consumableOfCategoryTier(category, meta.tier, quality, rng)
  } else if (isFixedQualityCategoryOf(category)) {
    // 灵材 / 灵植：成色写死，池子按档位成色带过滤（见 `fixedQualityBaseOf`）
    const base = fixedQualityBaseOf(category, meta.tier, qualityGroupOf(tier), rng)
    if (base) item = createItemInstance(base)
  } else {
    const base = baseOfCategoryTier(category, meta.tier, rng)
    if (base) item = createItemInstance(base, { quality })
  }
  if (!item) return null

  return {
    kind: 'item',
    category: item.category || category,
    baseId: item.baseId || item.id,
    // 灵材藏成色文字（#8 A-4）；灵器 / 丹药 / 符箓仍用带成色的显示名
    name: surfaceNameOf(item),
    // 材料的成色来自底材（`createItemInstance` 收口），成品的成色来自档位 roll
    quality: item.quality,
    item,
    tier,
    tierName: meta.name,
    // 九色色 class 由 `itemColorClassOf(item.tier, quality)` 在 UI 侧算；
    // 这里只给「档位名」，别在数据层复制一套颜色映射。
    tierTone: ''
  }
}

/** 单抽（灰档折现 / 白起档入包） */
export const rollLotteryDrawOf = (tier, rng = Math.random) =>
  tier === 'gray' ? rollGrayEntry(rng) : rollTierEntryOf(tier, rng)

/**
 * 把队列 `{tier,count,at}` 展开成逐抽列表（按出生时间升序）。
 * UI 的「≤5 次按出生时间逐条播」读它。
 */
export const expandLotteryQueueOf = queue =>
  (Array.isArray(queue) ? queue : []).flatMap(segment => {
    // 未知档位 / 0 次 = 脏段，直接丢掉（不默认成灰档，否则脏档会白送抽数）
    if (!LOTTERY_TIERS.includes(segment?.tier)) return []
    const count = Math.max(Math.floor(Number(segment?.count) || 0), 0)
    const at = Number(segment?.at) || 0
    return Array.from({ length: count }, () => ({ tier: segment.tier, at }))
  })

/** 待抽总次数（只算已知档位，与 `lotteryQueueSummaryOf` 同口径） */
export const lotteryPendingCountOf = queue =>
  (Array.isArray(queue) ? queue : []).reduce(
    (sum, segment) =>
      LOTTERY_TIERS.includes(segment?.tier)
        ? sum + Math.max(Math.floor(Number(segment?.count) || 0), 0)
        : sum,
    0
  )

/** 按档位汇总待抽次数（UI 总览用） */
export const lotteryQueueSummaryOf = queue => {
  const summary = Object.fromEntries(LOTTERY_TIERS.map(tier => [tier, 0]))
  for (const segment of Array.isArray(queue) ? queue : []) {
    if (!LOTTERY_TIERS.includes(segment?.tier)) continue
    summary[segment.tier] += Math.max(Math.floor(Number(segment?.count) || 0), 0)
  }
  return summary
}

/**
 * 一次「拉杆」：把队列全部抽掉（纯函数，不落账）。
 * 返回按出生时间排列的 entry；调用方负责入包 / 加货币。
 *
 * @param {Array<{tier:string,count:number,at:number}>} queue
 * @param {function} rng
 */
export const rollLotteryQueueOf = (queue, rng = Math.random) => {
  const draws = expandLotteryQueueOf(queue)
  const entries = []
  for (const draw of draws) {
    const entry = rollLotteryDrawOf(draw.tier, rng)
    if (entry) entries.push({ ...entry, at: draw.at })
  }
  return { entries, draws: draws.length }
}
