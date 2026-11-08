// 【宝箱底座】—— 七阶宝匣的 TC（Treasure Class）掉落引擎
//
// 真源：《宝箱系统》§一/§二/§四/§六 · 《物品池设计方案》§七 —— 底材 → 成色 → 实例。
//
// 2026-10-21 按 Q1/Q2 返工：
//   · 主 TC 五节点：NoDrop / 灵石 / 大类 / 残页 / 特殊道具。
//   · Pick：1~5 阶 = 5，6~7 阶 = 6（旧占位 3/3/4/4/5/5/6 作废）。
//   · **2026-11-08（P44 #8）**：上表是**基础值**。秘境产出的宝匣按难度段内位次
//     **+0 / +1 / +2**（1–4 / 5–8 / 9–10，换阶重置），实例带 `bonusPicks`，
//     开箱 `picks = 基础 + bonusPicks`。坊市 / 探索 / 首破一律 0。个数不变（每 5 层 1 个）。
//   · 特殊道具 = 10 种占位（各阶一样、均分）；**洗命符不再从宝箱出**。
//   · 残页：调用方传 `fragmentPool`（未解锁的丹方/功法），没传就退回成物品。
//
// 2026-10-25（P41 #1）：特殊道具占主 TC **5% → 1%**，10 种均分（每种 0.1%）。
//   ⚠ 让出的 4% **全部并入 `item`（大类物品）**，不是丢进 NoDrop ——
//     净效果是**可用产出增加**（已登记《产出登记表》R15）。
//
// ⚠ **宝匣 7 阶是宝匣阶级，不是物品基阶**。物品最多五阶；
//   6/7 阶宝匣只出五阶极 + 特殊道具，不新增物品基阶。
//
// ⚠ 本文件**不落账、不存档、不碰 store**。谁调用谁负责把 entries 发给背包/货币。

import { CHEST_TIERS } from './shop.js'
import { ITEM_POOL, createItemInstance, rollBaseItem, rollItemQuality } from './items.js'
import { itemTierKey } from './tiers.js'
import { unitsOf } from './stacks.js'

/** 特殊道具：10 种占位（《宝箱系统》§6.3）。用途未开放，不可售/分解 */
export const SPECIAL_ITEMS = [
  { id: 'dongfu_map', name: '洞府宝图', description: '残破的兽皮图，墨迹模糊，只画了一半山势' },
  { id: 'red_nail', name: '红色长钉', description: '三寸长钉，通体赤红，触之微烫' },
  { id: 'black_nail', name: '黑色长钉', description: '同规格，漆黑如墨，入手冰凉' },
  { id: 'grey_slab', name: '灰白石板', description: '巴掌大的石板，表面刻着看不懂的纹路' },
  { id: 'taixu_compass', name: '太虚罗盘', description: '指针不指南北，缓慢乱转' },
  { id: 'broken_starmap', name: '残缺星图', description: '半张星图，缺了一大块，不知指向何处' },
  { id: 'blank_tablet', name: '无字木牌', description: '空白牌位，木质温润，不知供奉什么' },
  { id: 'silk_puppet', name: '缠丝木偶', description: '巴掌大的木偶，缠满红丝，看不出是谁缠的' },
  { id: 'frozen_cocoon', name: '冰封虫茧', description: '拳头大的茧，冰层封住，里面似乎有东西' },
  { id: 'dusty_bell', name: '蒙尘铜铃', description: '摇之无声，铜锈斑驳，不知原挂何处' }
]

// ==================== 灵材箱（B15-c #1，2026-11-08） ====================
//
// 为什么要有它：宝匣一次 pick 值 1 件物品，而 1 件灵材和 1 件灵器不是一个价值量级
// ⇒ 25% 的灵材池事实上是「踩空」。改成箱子后，这一格按**批量**计价。
//
// 口径（用户 2026-11-08 拍板）：
//   · 宝匣的「灵材」大类**权重 25% 不动**，只是产出形态换成 1~5 阶灵材箱；
//   · 一箱开 **4 件同阶灵材**（`MATERIAL_BOX_UNITS`），**尽量不重样**、成色各自独立 roll；
//   · 箱子**没有成色**（固定「中」+ 按阶堆叠），**不可回收**、不进本命/同参池、不可装备；
//   · 开箱口 = 背包页「一键全开」（`inventory.openAllMaterialBoxes`）。
//
// ⚠ 这是一条**产出改动**：灵材供给 ≈ ×4，已登记《产出登记表》R60。
//   灵材是药浴唯一料源，改这里要回看 `npm run sim:body` 的供料假设。
export const MATERIAL_BOX_CATEGORY = '灵材箱'
export const MATERIAL_BOX_UNITS = 4

const BOX_TIER_CN = ['一', '二', '三', '四', '五']

/** 1~5 阶灵材箱底材（不进 `ITEM_POOL`，所以不会进本命 / 同参 / 回收 / 商店） */
export const MATERIAL_BOXES = BOX_TIER_CN.map((cn, index) => ({
  id: `material_box_${index + 1}`,
  name: '灵材箱',
  // `createItemInstance` 会优先用这个：默认的「一阶中品【灵材箱】」会把成色误读成箱子的属性
  displayName: `${cn}阶灵材箱`,
  category: MATERIAL_BOX_CATEGORY,
  type: '箱',
  series: '',
  tier: index + 1,
  fateElement: '',
  description: `封着一箱${cn}阶灵材，开启后可得 ${MATERIAL_BOX_UNITS} 件（尽量不重样）。`
}))

/** 灵材箱底材（阶夹在 1~5 —— 宝匣阶级能到 7，但物品基阶只到 5） */
export const materialBoxBaseOf = tier => {
  const t = Math.min(Math.max(Math.floor(Number(tier) || 1), 1), MATERIAL_BOXES.length)
  return MATERIAL_BOXES[t - 1]
}

/** 是不是灵材箱底材 id（老档清理 / 迁移用） */
export const isMaterialBoxId = id => MATERIAL_BOXES.some(box => box.id === id)

/** 是不是灵材箱条目 */
export const isMaterialBoxOf = item => !!item && item.category === MATERIAL_BOX_CATEGORY

/** 灵石掉落：货币 v2 一律记 `spiritual`（一阶）。数量仍是占位，等 Q4 定价表 */
export const TUNING = {
  /** 每箱执行多少次 Pick（《宝箱系统》§2.2） */
  picks: { 1: 5, 2: 5, 3: 5, 4: 5, 5: 5, 6: 6, 7: 6 },
  /**
   * 主 TC（%），按《宝箱系统》§2.2：
   *   1~2 阶 10/10/54/25/1；3~5 阶 10/10/59/20/1；6~7 阶 5/5/69/20/1
   * 特殊道具 2026-10-25（P41 #1）从 5 → 1，让出的 4 个百分点进了 `item`。
   */
  mainTC: {
    1: { noDrop: 10, currency: 10, item: 54, fragment: 25, special: 1 },
    2: { noDrop: 10, currency: 10, item: 54, fragment: 25, special: 1 },
    3: { noDrop: 10, currency: 10, item: 59, fragment: 20, special: 1 },
    4: { noDrop: 10, currency: 10, item: 59, fragment: 20, special: 1 },
    5: { noDrop: 10, currency: 10, item: 59, fragment: 20, special: 1 },
    6: { noDrop: 5, currency: 5, item: 69, fragment: 20, special: 1 },
    7: { noDrop: 5, currency: 5, item: 69, fragment: 20, special: 1 }
  },
  /** TODO(Q4)：灵石数量占位，定价表出来前先不动 */
  currencyByTier: {
    1: { currency: 'spiritual', amount: [10, 30] },
    2: { currency: 'spiritual', amount: [30, 80] },
    3: { currency: 'spiritual', amount: [80, 200] },
    4: { currency: 'spiritual', amount: [100, 300] },
    5: { currency: 'spiritual', amount: [300, 800] },
    6: { currency: 'spiritual', amount: [800, 2000] },
    7: { currency: 'spiritual', amount: [2000, 5000] }
  },
  /** 本阶四池均分（《宝箱系统》§2.3） */
  categoryWeights: { 灵材: 25, 灵植: 25, 灵器: 25, 灵兽: 25 },
  /** 相对本箱阶级的降阶/越阶：15% 降一阶 / 5% 越一阶 */
  downgradeChance: 0.15,
  upgradeChance: 0.05,
  /** 成色权重：当前统一 60/25/12/3（《宝箱系统》§2.4，是否随阶变仍待定） */
  qualityWeights: { 下: 0.6, 中: 0.25, 上: 0.12, 极: 0.03 }
}

const clampTier = tier => Math.min(Math.max(Math.floor(Number(tier) || 1), 1), 7)

/**
 * 秘境难度加成（P44 #8，2026-11-08）的**设计上限**：段内位次 9–10 = **+2**。
 * 不设上限的话，脏档里一个离谱的 `bonusPicks` 会把 `entries` 撑爆。
 * 改设计（《三大挂机》§4.3）时同步改这里。
 */
export const MAX_BONUS_PICKS = 2

/** 把任意输入夹成合法的 pick 加成（0 ~ MAX_BONUS_PICKS 的整数） */
export const clampBonusPicks = bonusPicks =>
  Math.min(Math.max(Math.floor(Number(bonusPicks) || 0), 0), MAX_BONUS_PICKS)

/**
 * 这一箱实际执行多少次 Pick = 基础值 + 秘境难度加成（P44 #8）。
 * 坊市买的 / 探索掉的 / 首破宝匣都传 0（默认）。
 */
export const chestPicksOf = (tier, bonusPicks = 0) =>
  (TUNING.picks[clampTier(tier)] || 5) + clampBonusPicks(bonusPicks)

/**
 * 宝匣加成分布的清洗（P44 #8）：`{ [bonus]: 件数 }` → 只留 1~MAX 的正整数项。
 * 脏数据 / 老档（没有这个字段）一律收敛成 `{}` = 全部 +0。
 */
export const normalizeChestBonusMap = (raw = {}) => {
  const out = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [key, value] of Object.entries(raw)) {
    const bonus = Math.floor(Number(key))
    const count = Math.floor(Number(value))
    if (!(bonus > 0) || bonus > MAX_BONUS_PICKS) continue
    if (!(count > 0)) continue
    out[bonus] = count
  }
  return out
}

/**
 * 一次开 `count` 个同阶宝匣时，按**加成从高到低**分配（先吃肥的，玩家不亏）。
 * @returns {{ bonuses:number[], rest:object }} `bonuses` 长度 = count；`rest` = 没开的加成分布
 */
export const chestOpenPlanOf = (bonusMap, count) => {
  const rest = normalizeChestBonusMap(bonusMap)
  const n = Math.max(Math.floor(Number(count) || 0), 0)
  const bonuses = []
  const order = Object.keys(rest).map(Number).sort((a, b) => b - a)
  for (const bonus of order) {
    while (rest[bonus] > 0 && bonuses.length < n) {
      bonuses.push(bonus)
      rest[bonus] -= 1
    }
    if (rest[bonus] <= 0) delete rest[bonus]
    if (bonuses.length >= n) break
  }
  while (bonuses.length < n) bonuses.push(0)
  return { bonuses, rest }
}

/** 该宝匣能开出的最高**物品基阶**（6/7 阶匣仍只到五阶） */
export const chestMaxItemTier = tier => Math.min(clampTier(tier), 5)

/** 宝匣的显示信息（价格/名称来自 shop.js） */
export const chestMetaOf = tier => CHEST_TIERS.find(chest => chest.tier === clampTier(tier)) || null

/** 通用加权抽取。权重非正数的节点会被跳过；全 0 时返回 null */
export const pickWeighted = (nodes = [], rng = Math.random) => {
  const usable = nodes.filter(node => Number(node?.weight) > 0)
  const total = usable.reduce((sum, node) => sum + Number(node.weight), 0)
  if (!total) return null
  const roll = rng() * total
  let acc = 0
  for (const node of usable) {
    acc += Number(node.weight)
    if (roll < acc) return node
  }
  return usable[usable.length - 1]
}

/** 第一层 TC 节点（每次 Pick 走一遍） */
export const chestNodesOf = tier => {
  const t = clampTier(tier)
  const w = TUNING.mainTC[t]
  return [
    { kind: 'noDrop', weight: w.noDrop },
    { kind: 'currency', weight: w.currency },
    { kind: 'item', weight: w.item },
    { kind: 'fragment', weight: w.fragment },
    { kind: 'special', weight: w.special }
  ]
}

/** 物品大类的加权抽取 */
export const rollItemCategory = (rng = Math.random) => {
  const node = pickWeighted(
    Object.entries(TUNING.categoryWeights).map(([category, weight]) => ({ category, weight })),
    rng
  )
  return node?.category || '灵材'
}

/**
 * 物品相对本箱阶级的降阶/越阶。
 * 例：五阶匣 15% 出四阶、5% 出（封顶五阶）、80% 出五阶。
 */
export const rollItemTierForChest = (chestTier, rng = Math.random) => {
  const base = chestMaxItemTier(chestTier)
  const r = rng()
  if (r < TUNING.downgradeChance) return Math.max(base - 1, 1)
  if (r >= 1 - TUNING.upgradeChance) return Math.min(base + 1, 5)
  return base
}

/** 成色 roll（当前不随阶变） */
export const rollChestQuality = (tier, rng = Math.random) => rollItemQuality(rng, TUNING.qualityWeights)

const rollAmount = ([lo, hi], rng) => {
  const a = Math.max(Math.floor(Number(lo) || 0), 0)
  const b = Math.max(Math.floor(Number(hi) || a), a)
  return a + Math.floor(rng() * (b - a + 1))
}

/**
 * 残页：从「未解锁的丹方 / 功法」里随机一张。
 * `fragmentPool` 形如 `[{ kind:'recipe'|'art', id, name, tier }]`，tier 是解锁所需物品阶。
 * 只取 `tier <= 本箱最高物品基阶` 的；没有就返回 null（调用方退回成物品）。
 */
export const rollFragment = (chestTier, fragmentPool = [], rng = Math.random) => {
  const cap = chestMaxItemTier(chestTier)
  const usable = fragmentPool.filter(f => Number(f?.tier) <= cap)
  if (!usable.length) return null
  return usable[Math.min(Math.floor(rng() * usable.length), usable.length - 1)]
}

/** 特殊道具：10 种均分 */
export const rollSpecialItem = (rng = Math.random) =>
  SPECIAL_ITEMS[Math.min(Math.floor(rng() * SPECIAL_ITEMS.length), SPECIAL_ITEMS.length - 1)]

/**
 * 一个灵材箱的内容（纯函数）：`MATERIAL_BOX_UNITS` 件**同阶**灵材，尽量不重样。
 *
 * 为什么要求不重样：一箱 4 件要是全抽成同一系，就只是把「1 件踩空」放大成
 * 「4 件踩空」，补不了药浴的短板（五系供给 22/24/18/15/21）。
 * 每阶灵材池都有 31~52 条，**一定能凑满 4 条不同的**；池子异常缩水时才允许重复。
 *
 * 成色沿用宝箱权重（《宝箱系统》§2.4，60/25/12/3），与直接掉灵材时的概率一致。
 */
export const rollMaterialBoxContentsOf = (tier, rng = Math.random) => {
  const t = materialBoxBaseOf(tier).tier
  const sameTier = ITEM_POOL.filter(item => item.category === '灵材' && item.tier === t)
  const pool =
    sameTier.length >= MATERIAL_BOX_UNITS
      ? sameTier
      : ITEM_POOL.filter(item => item.category === '灵材')
  const picked = []
  const used = new Set()
  while (picked.length < MATERIAL_BOX_UNITS && used.size < pool.length) {
    const candidates = pool.filter(item => !used.has(item.id))
    const base = candidates[Math.min(Math.floor(rng() * candidates.length), candidates.length - 1)]
    if (!base) break
    used.add(base.id)
    picked.push({ base, quality: rollChestQuality(t, rng) })
  }
  return picked
}

/**
 * 开掉一批灵材箱（纯函数）：按 `count` 件数逐箱展开，返回 `[{ base, quality }]`。
 * `units` = 一共开了几个箱子（箱条目的 `count` 是**箱数**，不是材料数）。
 */
export const openMaterialBoxesOf = (boxes = [], rng = Math.random) => {
  const gained = []
  let units = 0
  for (const box of boxes || []) {
    if (!isMaterialBoxOf(box)) continue
    const n = unitsOf(box)
    units += n
    for (let i = 0; i < n; i += 1) {
      for (const one of rollMaterialBoxContentsOf(box.tier, rng)) gained.push(one)
    }
  }
  return { units, gained }
}

/**
 * 开箱（**纯函数**）：给阶数，返回这一箱的掉落。
 *
 * @param {number} tier
 * @param {object|function} options  rng 函数或 `{ rng, fragmentPool, bonusPicks }`
 *   `bonusPicks` = 秘境难度加成（P44 #8，段内位次 9–10 为 +2），非秘境来源传 0
 * @returns {{ tier:number, entries:Array, picks:number, noDropCount:number, bonusPicks:number }}
 *   entries:
 *     { kind:'item', baseId, base, quality, tierKey, displayName }
 *     { kind:'currency', currency, amount }
 *     { kind:'fragment', fragmentKind:'recipe'|'art', id, name }
 *     { kind:'special', id, name, description }
 */
export const openChest = (tier, options = {}) => {
  const opts = typeof options === 'function' ? { rng: options } : options
  const rng = opts.rng || Math.random
  const fragmentPool = Array.isArray(opts.fragmentPool) ? opts.fragmentPool : []
  const t = clampTier(tier)
  const nodes = chestNodesOf(t)
  const bonusPicks = clampBonusPicks(opts.bonusPicks)
  const picks = chestPicksOf(t, bonusPicks)
  const entries = []
  let noDropCount = 0

  const pushItem = () => {
    const category = rollItemCategory(rng)
    const itemTier = rollItemTierForChest(t, rng)
    // B15-c #1（2026-11-08）：灵材这一格改掉「灵材箱」——
    // 1 件灵材配不上一次 pick 的价值，改成「一箱 4 件」，权重仍是 25%。
    // ⚠ 判的是**被替换的池名** '灵材'，不是箱子自己的品类（`MATERIAL_BOX_CATEGORY`）。
    const boxBase = category === '灵材' ? materialBoxBaseOf(itemTier) : null
    const base =
      boxBase ||
      rollBaseItem({ category, minTier: itemTier, maxTier: itemTier, rng }) ||
      // 该阶该池没有条目时，退到整个池子里同大类、最近阶
      rollBaseItem({ category, minTier: 1, maxTier: 5, rng })
    if (!base) return false
    // 箱子没有成色：固定「中」，同阶箱子才能堆成一摞（开箱时材料各自 roll 成色）
    const quality = boxBase ? '中' : rollChestQuality(t, rng)
    const instance = createItemInstance(base, { quality })
    entries.push({
      kind: 'item',
      baseId: base.id,
      base: {
        id: base.id,
        name: base.name,
        category: base.category,
        type: base.type,
        series: base.series,
        tier: base.tier,
        fateElement: base.fateElement,
        description: base.description,
        // 灵材箱没有成色，`createItemInstance` 要靠它绕开「一阶中品【灵材箱】」的默认名
        displayName: base.displayName
      },
      quality,
      tierKey: itemTierKey(base.tier, quality),
      displayName: instance.displayName
    })
    return true
  }

  for (let i = 0; i < picks; i += 1) {
    const node = pickWeighted(nodes, rng)
    if (!node || node.kind === 'noDrop') {
      noDropCount += 1
      continue
    }

    if (node.kind === 'currency') {
      const spec = TUNING.currencyByTier[t]
      entries.push({
        kind: 'currency',
        currency: spec.currency,
        amount: rollAmount(spec.amount, rng)
      })
      continue
    }

    if (node.kind === 'fragment') {
      const fragment = rollFragment(t, fragmentPool, rng)
      // 没有可掉落的残页（都学完了）：退回成物品，避免「空节点」
      if (fragment) {
        entries.push({
          kind: 'fragment',
          fragmentKind: fragment.kind,
          id: fragment.id,
          name: fragment.name
        })
        continue
      }
      if (!pushItem()) noDropCount += 1
      continue
    }

    if (node.kind === 'special') {
      const special = rollSpecialItem(rng)
      entries.push({
        kind: 'special',
        id: special.id,
        name: special.name,
        description: special.description
      })
      continue
    }

    if (!pushItem()) noDropCount += 1
  }

  return { tier: t, entries, picks, noDropCount, bonusPicks }
}
