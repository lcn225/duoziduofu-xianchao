// 【同参标签契合度】—— B7 引擎，纯函数、无 store、无全局
//
// 真源：《模块一》§4.3（公式）+《同参标签契合度》+《装备词条表》§1（权重）
//       + 交付包《关系表交接说明（修订版）》（关系方向与五条边界）
//
//   契合度 = Σ(本命被命中的标签权重) / Σ(本命全部标签权重)      0 ~ 1
//
// 三条容易写错的：
//   1. **分母永远是本命**（单向除法）。同参标签少不挨罚 —— 诡代法就是这么成立的。
//   2. **关系只影响分子，且只走一跳**：`A → B` = 同参带 A 命中本命 B，
//      表的键是同参词、值里的词是本命词，**不是反过来**（交付包审计第 6 条）。
//   3. **不设保底**：完全不重合就是 0。旧六档的 `none: 0.1` 是过渡值，已删。
//
// 边界：同一本命词只计一次；中层/底层只认字面交集，不查关系表；
//      关系命中按本命词全权重 1.0，不按同参词、也不衰减。

import {
  ITEM_TAGS,
  TOP_RELATIONS,
  TAG_WEIGHTS,
  COMPANION_CAP
} from './itemTags.data.js'

/** 某 id 的三层标签；未打标返回 null（调用方按 0 分处理，别偷偷给保底） */
export const itemTagsOf = id => (id && ITEM_TAGS[id]) || null

/** 标签集合的总权重 —— 永远是**本命**那一侧的和 */
export const tagWeightOf = tags => {
  if (!tags) return 0
  const w = TAG_WEIGHTS
  return (
    (tags.top?.length || 0) * w.top +
    (tags.mid?.length || 0) * w.mid +
    (tags.base?.length || 0) * w.base
  )
}

/**
 * 同参的顶层词 `t` 是否命中本命顶层词 `m`。
 *
 * 字面命中，或者关系表里 `rel[t].derives / implies` 的值里出现 `m`。
 * 只查 `rel[t]`（同参词作键），不反向展开 —— 见文件头第 2 条。
 */
export const topWordHits = (t, m, relations = TOP_RELATIONS) => {
  if (t === m) return true
  const edge = relations[t]
  if (!edge) return false
  return edge.derives.includes(m) || edge.implies.includes(m)
}

/**
 * 纯标签版本：给两组三层标签算契合度（不看 id）。
 *
 * @returns {{ fit:number, hit:number, total:number, matched:{top:string[],mid:string[],base:string[]} }}
 */
export const harmonyOfTags = (itemTags, masterTags, relations = TOP_RELATIONS) => {
  const total = tagWeightOf(masterTags)
  if (!itemTags || !masterTags || total <= 0) {
    return { fit: 0, hit: 0, total, matched: { top: [], mid: [], base: [] } }
  }

  const itemTop = itemTags.top || []
  const matchedTop = []
  let hit = 0
  for (const m of masterTags.top || []) {
    const covered = itemTop.some(t => topWordHits(t, m, relations))
    if (covered) {
      hit += TAG_WEIGHTS.top
      matchedTop.push(m)
    }
  }

  const itemMid = new Set(itemTags.mid || [])
  const matchedMid = (masterTags.mid || []).filter(word => itemMid.has(word))
  hit += matchedMid.length * TAG_WEIGHTS.mid

  const itemBase = new Set(itemTags.base || [])
  const matchedBase = (masterTags.base || []).filter(word => itemBase.has(word))
  hit += matchedBase.length * TAG_WEIGHTS.base

  return {
    fit: Math.min(hit / total, 1),
    hit,
    total,
    matched: { top: matchedTop, mid: matchedMid, base: matchedBase }
  }
}

// ---------- id 对记忆（P62 阶段 K，2026-11-15）----------
//
// 背景：离线重放的影子 store 里 getter **每次访问重算**（`plainStore.js` 约束 2），
// `fateSupplyIds` 每块返回一个新数组 ⇒ `offspringCompanionFitOf` 的 supply 缓存
// （按数组引用判等）每块必失效，于是每块把「supply × 本命」的同一张表从头再算一遍。
// 真档实测：340 件 supply × 79 种本命 × 168 块 ≈ **450 万次** `harmonyOfTags`（4.2 秒），
// 而这 79 种本命一个字都没变。契合只依赖静态标签数据，`(物品, 本命)` 的答案是常量。
//
// 两条边界：
//   1. **只缓存「按表查」的入参**：调用方自带 `tags`（且不是表里那份，例如 verify 里的
//      `{ id: 'copy', tags: ITEM_TAGS.taotie_jade }`）走原路，不污染 id 的答案。
//   2. **有上限**：满了整表清空重来 —— 只影响性能、不影响结果（纯函数）。
//
// ⚠ 命中时返回的是**同一个对象**（调用方只读，别原地改）。真档约 2.7 万条目。
// 两级 Map：`物品 id → 本命 id → 结果`。**不要拼成 `a|b` 当键** —— 热路径每次都要
// 分配一个新字符串，实测命中一次反而要 0.95µs，比直接算（约 1µs）省不下来。
const FIT_CACHE_LIMIT = 50000
const fitCache = new Map()
let fitCacheSize = 0

/** 对象带的 `tags` 是否就是表里那份（FATE_ITEM_MAP 视图会带上，算可缓存） */
const tagsAreFromTable = value => {
  if (!value || typeof value !== 'object' || !value.tags) return true
  return value.tags === itemTagsOf(resolveId(value))
}

/**
 * 物品 → 本命 的同参契合（带「同件 = 1.0 / 非原物封顶 0.95」）。
 *
 * 纯函数 + id 对记忆（见上）。返回对象命中时**共享**，调用方只读。
 *
 * @param {object|string} item   物品（底材 / 实例 / 本命快照）或底材 id
 * @param {object|string} master 本命（同上）
 */
export const companionHarmonyOf = (item, master) => {
  const itemId = resolveId(item)
  const masterId = resolveId(master)
  // 顺序有意义：companionHarmonyOf(a, b) ≠ companionHarmonyOf(b, a)
  const cacheable = !!(itemId && masterId && tagsAreFromTable(item) && tagsAreFromTable(master))
  if (cacheable) {
    const bucket = fitCache.get(itemId)
    const cached = bucket && bucket.get(masterId)
    if (cached) return cached
  }

  const itemTags = resolveTags(item)
  const masterTags = resolveTags(master)
  const result = harmonyOfTags(itemTags, masterTags)
  if (!itemTags || !masterTags) return result
  const sameItem = itemId !== null && itemId === masterId
  const out = Object.freeze({
    ...result,
    fit: sameItem ? 1 : Math.min(result.fit, COMPANION_CAP)
  })
  if (cacheable) {
    if (fitCacheSize >= FIT_CACHE_LIMIT) {
      fitCache.clear()
      fitCacheSize = 0
    }
    let bucket = fitCache.get(itemId)
    if (!bucket) {
      bucket = new Map()
      fitCache.set(itemId, bucket)
    }
    bucket.set(masterId, out)
    fitCacheSize += 1
  }
  return out
}

/** 对象带 tags 就用它，否则按 id 查表 */
const resolveTags = value =>
  value && typeof value === 'object' ? value.tags || itemTagsOf(value.id) : itemTagsOf(value)

const resolveId = value =>
  value && typeof value === 'object' ? value.id || value.baseId || null : value || null

/**
 * 一件物品对**一组本命**的契合度：逐个算，取最高。
 *
 * 桂冈是双本命（刃背乌鬣猪 + 饕餮纹玉牌），同参只能挂一件 ——
 * 设计口径就是「对本命中最好的那个」。没有本命返回 0（不是 0.1）。
 */
export const bestHarmonyOf = (item, masters = []) => {
  let best = 0
  for (const master of masters) best = Math.max(best, companionHarmonyOf(item, master).fit)
  return Math.min(best, 1)
}

export { COMPANION_CAP, TAG_WEIGHTS }
