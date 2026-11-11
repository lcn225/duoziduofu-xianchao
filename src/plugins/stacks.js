// 物品堆叠 —— 灵植 / 灵材的「一物一条」改成「一条带数量」。
//
// 为什么需要（2026-10-29 实测，见《下一步》P57 / P58）：
//   用户真档 4.96MB 明文里，`items` 12,189 条占 3.69MB，其中**可合并的灵植/灵材
//   共 7,510 条、2.44MB，本质只有 729 组**（`bone_shougu_2` 一种就堆了 1,599 条）。
//   存档每秒整份加密落盘，体量直接变成主线程占用 —— 这不是「以后再说」的优化。
//
// 口径（2026-10-29 拍板）：
//   1. **不新建独立计数仓**，就在原条目上加 `count` —— `items` 被 22 个文件读、
//      `herbs` 被 11 个读，`filter/map/find` 必须继续能跑（`chests` 那种计数对象
//      只适合「没有其他字段」的东西）。
//   2. **合并键必须带成色**：同一种灵材混着下/中/上/极四种成色，
//      而回收价按成色系数走（1.0/1.2/1.5/2.0）—— 只按 baseId 合并会把钱算丢。
//   3. **掉落灵器 / 灵宠实例不合并**：每一件有自己的成色、词条、等级、经验。
//   4. **固定配方产物（炼器）合并**（2026-11-01 P62）：`buildCraftedItem` 是模板复制 ——
//      成色写死、没有词条、没有主副属性 roll，同配方同成色同等级的两个对象**逐字段相同**。
//      不合并的话用户真档 12.4 万条全是 `craft_` 金簪/金钗/素金戒指（存档 48MB）。
//      判定见 `isCraftedClone`：**强化/洗练过的不算克隆**，退回一条一件。
//
// ⚠ 所有函数都是**纯函数**（不改入参），方便断言；store 只负责替换数组与落盘。

/**
 * 百艺消耗品品类（B11-a2，2026-11-07）：丹田 / 符箓 / 阵法。
 *
 * 它们是**配方模板复制品**（成色写死「中」、词条为空），同配方同阶的两件逐字段相同，
 * 所以能合并；回收口（`shop.SELLABLE_CATEGORIES` 四池白名单）不认它们，
 * 装备/灵宠的槽位判定也不认（没有 `slot`）。
 */
export const CONSUMABLE_CATEGORIES = ['丹药', '符箓', '阵法']

/**
 * 可堆叠的品类。灵器/灵宠有实例差异，不在此列。
 * 灵材箱（B15-c #1，2026-11-08）：没有成色、同阶逐字相同，按阶堆成一摞。
 */
export const STACKABLE_CATEGORIES = ['灵植', '灵材', '灵材箱', ...CONSUMABLE_CATEGORIES]

/** 炼器产物的品类键（与掉落灵器的 `灵器` 区分开，回收口不认它） */
export const CRAFTED_CATEGORY = 'crafted'

/**
 * 是不是「模板复制的炼器产物」。
 *
 * 只有这种才有资格合并：成色/词条/主副属性全是配方写死的，
 * 一旦被强化（`enhanceLevel`）或洗练（`reforged`）就有了实例差异，必须一条一件。
 *
 * 2026-11-07 B11-a1：炼器改产**真灵器**（`category: '灵器'`，能穿、能回收），
 * 所以判据多了 `craftedClone` 标记 —— 由 `arts.buildRecipeOutput` 打上，
 * 且不 roll 词条（`generateEquipment({ withTraits: false })`），保证同配方产物完全一致。
 */
export const isCraftedClone = item =>
  !!item &&
  (item.category === CRAFTED_CATEGORY || item.craftedClone === true) &&
  !item.enhanceLevel &&
  !item.reforged &&
  !(Array.isArray(item.traits) && item.traits.length)

/** 一个条目代表几个单位（老档没有 count 字段，按 1 计） */
export const unitsOf = item => Math.max(Math.floor(Number(item?.count) || 1), 1)

/**
 * 能不能合并。
 * 判据是**有没有实例差异**，所以除了品类白名单，还要求「没有装备槽、不是灵宠」——
 * 老档里有灵器缺 `category` 的脏数据，光看品类会把它当灵材合掉。
 */
export const isStackable = item => {
  if (!item) return false
  // 炼器产物有 slot，但它是模板复制品 —— 单独放行（见文件头口径 4）
  if (isCraftedClone(item)) return true
  return !item.equipSlot && !item.slot && item.type !== 'pet' && STACKABLE_CATEGORIES.includes(item.category)
}

/**
 * 合并键：品类 + 底材 + 成色（见文件头口径 2）；炼器产物再加**阶与等级**。
 *
 * 阶必须进键：B11-a1 起同名底材可能以不同阶出现（个人百艺产高一阶），
 * 只按 baseId 合并会把一阶与二阶挤成一条。
 */
export const stackKeyOf = item => {
  const head = `${item?.category || ''}|${item?.baseId || item?.id || ''}|${item?.quality || ''}`
  // 消耗品必须带阶：同一条配方在桂冈个人（高一阶）与乡间自动（本段阶，B11-b）产出的
  // 是两件不同的东西，只按 baseId 合并会把二阶与三阶挤成一条。
  if (CONSUMABLE_CATEGORIES.includes(item?.category)) return `${head}|${item?.tier ?? ''}`
  return isCraftedClone(item) ? `${head}|${item?.tier ?? ''}|${item?.level ?? ''}` : head
}

/**
 * 从堆里拆出一件独立实例（保留除 `count` 外的全部字段，换成新的唯一 id）。
 * 装备/穿子嗣时用：穿上的是实例，背包里的那条减 1。
 */
export const instanceOf = (entry, id) => {
  const out = { ...(entry || {}) }
  delete out.count
  if (id) out.id = id
  return out
}

/** 拆实例用的唯一 id（`craft_` 是真实时间戳，这里不能再撞） */
let instanceSeq = 0
export const nextInstanceIdOf = entry => {
  instanceSeq += 1
  return `i_${entry?.baseId || 'item'}_${Date.now().toString(36)}_${instanceSeq.toString(36)}`
}

/**
 * 造一条堆叠条目，**保底补一个唯一 `id`**。
 *
 * 2026-11-07 用户真档：**121 摞灵材 / 灵植（约 5 万件，占 21%）没有 `id`**。
 * 药浴 / 一键投入 / 三换二 全都按 `id` 找条目（`takeUnits` / `planFromUnits`），
 * 遇到没有 `id` 的会**静默跳过** —— 玩家看到的就是「材料明明有，就是投不进去」。
 * 老档的身份字段可能只写了 `instanceId`，先认它；两样都没有就新发一个。
 * 在**合并之后**补：同组碎片只留一条，不该占多个 id。
 */
const stackedEntryOf = (item, n) => {
  const entry = { ...item, count: n }
  if (!entry.id) entry.id = (typeof entry.instanceId === 'string' && entry.instanceId) || nextInstanceIdOf(entry)
  return entry
}

/** 一组条目一共几个单位 */
export const countUnits = (list = []) => (list || []).reduce((sum, item) => sum + unitsOf(item), 0)

/**
 * 往列表里加 `units` 个单位。
 *
 * 可堆叠且已有同键条目 → 数量累加；否则原样 append（`count` 缺省为 1，
 * 不在不可堆叠的条目上塞多余字段，否则装备卡片各处要跟着认它）。
 *
 * @returns 新数组（**总是返回新引用**，Pinia 才能可靠地触发更新）
 */
export const addUnits = (list = [], item, units = 1) => {
  const out = [...(list || [])]
  if (!item) return out
  const n = Math.max(Math.floor(Number(units) || 1), 1)
  if (!isStackable(item)) {
    for (let i = 0; i < n; i += 1) out.push({ ...item })
    return out
  }
  const key = stackKeyOf(item)
  const at = out.findIndex(entry => isStackable(entry) && stackKeyOf(entry) === key)
  if (at >= 0) {
    out[at] = { ...out[at], count: unitsOf(out[at]) + n }
  } else {
    out.push(stackedEntryOf(item, n))
  }
  return out
}

/**
 * 堆叠索引：`list → { map: 堆叠键 → 下标, len: 建索引时的数组长度 }`。
 *
 * 为什么需要（2026-11-11 真档实测）：`gainInto` 原来每次掉落都对整个背包做
 * `findIndex` + 逐条 `isStackable/stackKeyOf`。1,500 游戏天的离线重放里家族工作
 * 天天掉灵植/法器，真实金丹档（1,338 条背包 / 1,436 子嗣）光入栈就 **119 秒**，
 * 占离线结算的 58%。
 *
 * 失效与自愈：数组被 `splice` / 整体替换后索引会过期，所以每次取用都校验
 *   ① 长度没变（`len`）② 该下标上的条目确实还是同一个堆叠键；
 * 不满足就**重建一次**再查。重建是 O(n)，但只在数组真的被改动后发生；
 * 稳态下每次入栈都是 O(1)。
 *
 * ⚠ 用 WeakMap 而不是往数组上挂字段：`list` 是 Pinia 的响应式数组，
 *   挂字段会被存进存档 / 触发无意义的重渲染。
 */
const stackIndexCache = new WeakMap()

const stackIndexEntryOf = list => {
  let entry = stackIndexCache.get(list)
  if (!entry) {
    entry = { map: new Map(), len: -1 }
    stackIndexCache.set(list, entry)
  }
  return entry
}

/** 重建索引：同键多条时取**第一条**（与旧 `findIndex` 的语义一致） */
const rebuildStackIndex = (list, entry) => {
  entry.map.clear()
  for (let i = 0; i < list.length; i += 1) {
    const it = list[i]
    if (!isStackable(it)) continue
    const k = stackKeyOf(it)
    if (!entry.map.has(k)) entry.map.set(k, i)
  }
  entry.len = list.length
}

/**
 * 原地入栈（**会改入参**）：给「每掉一次就该加一件」的热路径用。
 *
 * 为什么不直接用 `addUnits`：那个每次返回新数组，一次掉落在 5,000 条的背包上是 O(n) 拷贝；
 * 离线重放（180 天、每段都有掉落）会把这点开销放大成秒级。
 * 这里的 `list` 是 Pinia 的响应式数组，原地 push / 改 count 一样能触发更新。
 *
 * @returns 是否并入了已有的堆（false = 新开了一条）
 */
export const gainInto = (list = [], item, units = 1) => {
  if (!item) return false
  const n = Math.max(Math.floor(Number(units) || 1), 1)
  if (!isStackable(item)) {
    for (let i = 0; i < n; i += 1) list.push({ ...item })
    return false
  }
  const key = stackKeyOf(item)
  const idx = stackIndexEntryOf(list)
  if (idx.len !== list.length) rebuildStackIndex(list, idx)

  let at = idx.map.get(key)
  // 命中校验：数组可能被同长度替换过（`this.items[i] = …`），所以下标不算数、键才算数
  if (at === undefined || !isStackable(list[at]) || stackKeyOf(list[at]) !== key) {
    rebuildStackIndex(list, idx)
    at = idx.map.get(key)
  }
  if (at !== undefined) {
    list[at].count = unitsOf(list[at]) + n
    return true
  }
  list.push(stackedEntryOf(item, n))
  idx.map.set(key, list.length - 1)
  idx.len = list.length
  return false
}

/** 灵草版的原地入栈（灵草没有 `category`，不能用 `gainInto` 的判据） */
export const gainHerbInto = (list = [], herb, units = 1) => {
  if (!herb) return false
  const n = Math.max(Math.floor(Number(units) || 1), 1)
  const key = herbStackKeyOf(herb)
  const at = list.findIndex(entry => herbStackKeyOf(entry) === key)
  if (at >= 0) {
    list[at].count = unitsOf(list[at]) + n
    return true
  }
  list.push({ ...herb, count: n })
  return false
}

/**
 * 按 id 扣数量。`count` 减到 0 就把条目删掉。
 *
 * `plan` 是 `[{ id, units }]`；同一个 id 出现多次会累加（药浴一次可能吃同一摞好几件）。
 * 找不到 id 或数量不够时**扣到 0 为止**，不抛错 —— 玩法上「材料没了」不该让存档写坏。
 *
 * ⚠ 同一个 id 可能有**多条**（灵草按 `id|品质` 分堆，炼丹只按 id 扣）：
 *   要按顺序吃到够数就停，不能对每条都扣一遍 want。
 *
 * @returns 新数组
 */
export const takeUnits = (list = [], plan = []) => {
  const need = new Map()
  for (const entry of plan || []) {
    if (!entry?.id) continue
    need.set(entry.id, (need.get(entry.id) || 0) + Math.max(Math.floor(Number(entry.units) || 1), 1))
  }
  if (!need.size) return [...(list || [])]
  const out = []
  for (const item of list || []) {
    const want = need.get(item?.id) || 0
    if (!want) {
      out.push(item)
      continue
    }
    const have = unitsOf(item)
    const take = Math.min(have, want)
    need.set(item.id, want - take)
    if (have > take) out.push({ ...item, count: have - take })
  }
  return out
}

/** 把「一个条目 = 一件」的清单按 id 汇总成 `[{ id, units }]`（药浴 `consumed` → 扣料用） */
export const planFromUnits = (entries = []) => {
  const acc = new Map()
  for (const item of entries || []) {
    if (!item?.id) continue
    acc.set(item.id, (acc.get(item.id) || 0) + unitsOf(item))
  }
  return [...acc.entries()].map(([id, units]) => ({ id, units }))
}

/**
 * 迁移：把同一组的多条合并成一条带 `count`，并丢弃**底材已不存在**的条目。
 *
 * 「底材已不存在」= `existsFn(baseId)` 返回 false。2026-10-28 物品池 575→474
 * 删了 101 种 `n_lingcai`，老档里的存量既不能再产出也无处消耗（用户拍板清掉）。
 * 只删**可堆叠**的条目 —— 装备/灵宠实例一律不动，哪怕底材查不到（宁可留着让玩家自己卖）。
 *
 * 2026-11-07：顺带给缺 `id` 的可堆叠条目补 id（见 `stackedEntryOf` 的注释），
 * `stackVersion` 由 2 升到 3 触发老档重跑一次。
 *
 * @param existsFn (baseId) => boolean
 * @returns {{ list, changed, mergedGroups, droppedIds, backfilledIds }}
 */
export const normalizeStacks = (list = [], existsFn = () => true) => {
  const out = []
  const indexOfKey = new Map()
  let mergedGroups = 0
  let backfilledIds = 0
  const droppedIds = []
  for (const item of list || []) {
    if (!item) continue
    if (!isStackable(item)) {
      out.push(item)
      continue
    }
    const baseId = item.baseId || item.id
    // 炼器产物与百艺消耗品的 baseId 是**配方 id**，物品池里查不到 ——
    // 不能按「底材已删除」清掉（B11-a2 起丹药/符箓/阵法也走这条路）。
    if (
      baseId &&
      item.category !== CRAFTED_CATEGORY &&
      !CONSUMABLE_CATEGORIES.includes(item.category) &&
      !existsFn(baseId)
    ) {
      droppedIds.push(baseId)
      continue
    }
    const key = stackKeyOf(item)
    const at = indexOfKey.get(key)
    if (at === undefined) {
      indexOfKey.set(key, out.length)
      if (!item.id) backfilledIds += 1
      out.push(stackedEntryOf(item, unitsOf(item)))
    } else {
      mergedGroups += 1
      out[at] = { ...out[at], count: unitsOf(out[at]) + unitsOf(item) }
    }
  }
  const changed = mergedGroups > 0 || droppedIds.length > 0 || backfilledIds > 0 || out.length !== (list || []).length
  return { list: out, changed, mergedGroups, droppedIds, backfilledIds }
}

/**
 * 灵草的同类迁移。灵草条目没有 `category`/`baseId`，只有 `id` + `quality`，
 * 所以用一套独立的键，别和 items 的 `stackKeyOf` 混用。
 */
export const herbStackKeyOf = herb => `${herb?.id || ''}|${herb?.quality || ''}`

export const normalizeHerbStacks = (list = []) => {
  const out = []
  const indexOfKey = new Map()
  let mergedGroups = 0
  for (const herb of list || []) {
    if (!herb) continue
    const key = herbStackKeyOf(herb)
    const at = indexOfKey.get(key)
    if (at === undefined) {
      indexOfKey.set(key, out.length)
      out.push({ ...herb, count: unitsOf(herb) })
    } else {
      mergedGroups += 1
      out[at] = { ...out[at], count: unitsOf(out[at]) + unitsOf(herb) }
    }
  }
  return { list: out, changed: mergedGroups > 0 || out.length !== (list || []).length, mergedGroups }
}

/** 灵草按 id 的株数（成就口径：合并后条数 ≠ 株数） */
export const herbUnitsOf = (id, list = []) =>
  (list || []).reduce((sum, herb) => (herb?.id === id ? sum + unitsOf(herb) : sum), 0)

/** 灵草总株数（成就「收集 100 / 200 株」的分子） */
export const herbTotalUnits = list => countUnits(list)

/** 某一品质的灵草株数（成就「收集 100 株稀有 / 极品 / 仙品」） */
export const herbUnitsOfQuality = (quality, list = []) =>
  (list || []).reduce((sum, herb) => (herb?.quality === quality ? sum + unitsOf(herb) : sum), 0)

/**
 * 往灵草库存里加。**不能用 `addUnits`** —— 灵草没有 `category: 灵植` 字段，
 * `isStackable` 会把它判成不可堆叠，于是又变回一条一株。
 */
export const addHerbs = (list = [], herb, units = 1) => {
  const out = [...(list || [])]
  if (!herb) return out
  const n = Math.max(Math.floor(Number(units) || 1), 1)
  const key = herbStackKeyOf(herb)
  const at = out.findIndex(entry => herbStackKeyOf(entry) === key)
  if (at >= 0) out[at] = { ...out[at], count: unitsOf(out[at]) + n }
  else out.push({ ...herb, count: n })
  return out
}
