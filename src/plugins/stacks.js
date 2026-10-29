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
//   3. **灵器 / 灵宠实例一律不合并**：每一件有自己的成色、词条、等级、经验。
//
// ⚠ 所有函数都是**纯函数**（不改入参），方便断言；store 只负责替换数组与落盘。

/** 可堆叠的品类。灵器/灵宠有实例差异，不在此列。 */
export const STACKABLE_CATEGORIES = ['灵植', '灵材']

/** 一个条目代表几个单位（老档没有 count 字段，按 1 计） */
export const unitsOf = item => Math.max(Math.floor(Number(item?.count) || 1), 1)

/**
 * 能不能合并。
 * 判据是**有没有实例差异**，所以除了品类白名单，还要求「没有装备槽、不是灵宠」——
 * 老档里有灵器缺 `category` 的脏数据，光看品类会把它当灵材合掉。
 */
export const isStackable = item =>
  !!item && !item.equipSlot && !item.slot && item.type !== 'pet' && STACKABLE_CATEGORIES.includes(item.category)

/** 合并键：品类 + 底材 + 成色（见文件头口径 2） */
export const stackKeyOf = item =>
  `${item?.category || ''}|${item?.baseId || item?.id || ''}|${item?.quality || ''}`

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
    out.push({ ...item, count: n })
  }
  return out
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
  const at = list.findIndex(entry => isStackable(entry) && stackKeyOf(entry) === key)
  if (at >= 0) {
    list[at].count = unitsOf(list[at]) + n
    return true
  }
  list.push({ ...item, count: n })
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
 * @param existsFn (baseId) => boolean
 * @returns {{ list, changed, mergedGroups, droppedIds }}
 */
export const normalizeStacks = (list = [], existsFn = () => true) => {
  const out = []
  const indexOfKey = new Map()
  let mergedGroups = 0
  const droppedIds = []
  for (const item of list || []) {
    if (!item) continue
    if (!isStackable(item)) {
      out.push(item)
      continue
    }
    const baseId = item.baseId || item.id
    if (baseId && !existsFn(baseId)) {
      droppedIds.push(baseId)
      continue
    }
    const key = stackKeyOf(item)
    const at = indexOfKey.get(key)
    if (at === undefined) {
      indexOfKey.set(key, out.length)
      out.push({ ...item, count: unitsOf(item) })
    } else {
      mergedGroups += 1
      out[at] = { ...out[at], count: unitsOf(out[at]) + unitsOf(item) }
    }
  }
  const changed = mergedGroups > 0 || droppedIds.length > 0 || out.length !== (list || []).length
  return { list: out, changed, mergedGroups, droppedIds }
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
