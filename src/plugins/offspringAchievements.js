// 子嗣成就（气运轮盘的抽数 / 档位来源）—— 纯函数层（2026-11-24 施工）
//
// 真源：《模块二》§6.0.2.1 子嗣成就清单（20 条，定稿）。
//
// 口径（别改错）：
//   1. **判定基准 = 已落盘的子嗣（含孙辈）**；`motherId` 为空的（老档 / 孙辈）
//      不进同胞类，**不补发**。老档存量子嗣没有 `achievementIds`，不回溯补判 ——
//      成就只在出生瞬间判一次（设计 §6.0.2.1 规则 2）。
//   2. **配置表式**：每加一条成就只加一行 `OFFSPRING_ACHIEVEMENTS`，
//      判定按**类**分组（首位 / 计数 / 词条 / 同胞 / 本命），**不要为每条写一个 if**。
//   3. 可达性不是 bug：`ten_thousand_child` 万子当前不可达（人口上限 3,200）；
//      `thousandth_root_child` 千灵根金丹段在临界点。别为它们调产。
//   4. 计数器由调用方维护（在线 = 按 list 增量缓存；离线 = `buildOffspringIndexOf`
//      的 `achievementCounters`）。**判定前传的是「这次出生之前」的计数**。
//
// 存档落点：子嗣对象上的 `achievementIds: string[]`（只存 id，别存对象）。

/** 成就在家族树 / 子嗣详情里的展示顺序 */
export const OFFSPRING_ACHIEVEMENT_CLASSES = [
  { key: 'first', name: '首位' },
  { key: 'count', name: '计数' },
  { key: 'root', name: '计数 · 灵根' },
  { key: 'trait', name: '词条' },
  { key: 'sibling', name: '同胞' },
  { key: 'fate', name: '本命' }
]

/**
 * 20 条定稿（顺序 = 《模块二》§6.0.2.1 表）。
 * `cls` 只用于分组展示与断言计数，判定逻辑见 `evaluateOffspringAchievementsOf`。
 */
export const OFFSPRING_ACHIEVEMENTS = [
  { id: 'first_child', name: '首位子嗣', cls: 'first', desc: '全族第 1 个出生' },
  { id: 'first_root', name: '首位灵根子嗣', cls: 'first', desc: '第 1 个有灵根的子嗣' },
  { id: 'first_double_root', name: '首位双灵根子嗣', cls: 'first', desc: '第 1 个双灵根及以上的子嗣' },
  { id: 'first_triple_root', name: '首位三灵根子嗣', cls: 'first', desc: '第 1 个三灵根及以上的子嗣' },
  { id: 'first_trait', name: '首位天赋词条子嗣', cls: 'first', desc: '第 1 个带词条的子嗣' },

  { id: 'second_child', name: '复数子嗣', cls: 'count', desc: '全族第 2 个出生' },
  { id: 'tenth_child', name: '双位数子嗣', cls: 'count', desc: '全族第 10 个出生' },
  { id: 'hundredth_child', name: '百子', cls: 'count', desc: '全族第 100 个出生' },
  { id: 'thousandth_child', name: '千子', cls: 'count', desc: '全族第 1,000 个出生' },
  { id: 'ten_thousand_child', name: '万子', cls: 'count', desc: '全族第 10,000 个出生（当前不可达）' },

  { id: 'tenth_root_child', name: '十灵根子嗣', cls: 'root', desc: '全族第 10 个有灵根的子嗣' },
  { id: 'hundredth_root_child', name: '百灵根子嗣', cls: 'root', desc: '全族第 100 个有灵根的子嗣' },
  { id: 'thousandth_root_child', name: '千灵根子嗣', cls: 'root', desc: '全族第 1,000 个有灵根的子嗣（金丹段临界）' },

  { id: 'first_legend_trait', name: '首位传说词条子嗣', cls: 'trait', desc: '第 1 个带传说词条的子嗣' },
  { id: 'first_dual_trait', name: '首位双词条子嗣', cls: 'trait', desc: '第 1 个带两条词条的子嗣' },

  { id: 'three_from_one', name: '同母三子', cls: 'sibling', desc: '同一生母名下第 3 个' },
  { id: 'five_from_one', name: '同母五子', cls: 'sibling', desc: '同一生母名下第 5 个' },
  { id: 'ten_from_one', name: '同母十子', cls: 'sibling', desc: '同一生母名下第 10 个' },

  { id: 'first_beast_fate', name: '首位兽类本命子嗣', cls: 'fate', desc: '第 1 个本命含灵兽的子嗣' },
  { id: 'first_plant_fate', name: '首位灵植本命子嗣', cls: 'fate', desc: '第 1 个本命含灵植的子嗣' }
]

const ACHIEVEMENT_BY_ID = new Map(OFFSPRING_ACHIEVEMENTS.map(item => [item.id, item]))

export const offspringAchievementByIdOf = id => ACHIEVEMENT_BY_ID.get(id) || null

export const offspringAchievementNameOf = id => ACHIEVEMENT_BY_ID.get(id)?.name || id

/** 子嗣词条里有没有传说档（`grade` 只管抽卡，这里只用它分类） */
const hasLegendTraitOf = traits => (traits || []).some(trait => trait?.grade === 'legend')

/** 本命品类集合（老档只有 `fate` 单件，兼容读） */
const fateCategoriesOf = child => {
  const fates = Array.isArray(child?.fates) && child.fates.length ? child.fates : child?.fate ? [child.fate] : []
  const set = new Set()
  for (const fate of fates) if (fate?.category) set.add(fate.category)
  return set
}

/**
 * 出生计数器。**只增**：出生 +1、有灵根 +1、同母计数 +1；布尔位一旦为真不再回退。
 * 不含本次出生的那个孩子 —— 判定时传「之前」的计数。
 */
export const buildBirthCountersOf = (list = []) => {
  const counters = {
    born: 0,
    rooted: 0,
    anyDoubleRoot: false,
    anyTripleRoot: false,
    anyTrait: false,
    anyDualTrait: false,
    anyLegendTrait: false,
    anyBeastFate: false,
    anyPlantFate: false,
    /** motherId → 该生母名下已出生数（孙辈 motherId 为空，不进桶） */
    motherBirths: new Map()
  }
  for (const child of list || []) absorbBirthCountersOf(counters, child)
  return counters
}

/** 把一个已落盘的子嗣并入计数器（在线缓存 / 离线索引共用） */
export const absorbBirthCountersOf = (counters, child) => {
  if (!counters || !child) return counters
  counters.born += 1
  if (child.hasRoot) counters.rooted += 1
  const rootCount = Number(child.rootCount) || 0
  if (rootCount >= 2) counters.anyDoubleRoot = true
  if (rootCount >= 3) counters.anyTripleRoot = true
  const traits = Array.isArray(child.traits) ? child.traits : []
  if (traits.length > 0) counters.anyTrait = true
  if (traits.length >= 2) counters.anyDualTrait = true
  if (hasLegendTraitOf(traits)) counters.anyLegendTrait = true
  const fateCategories = fateCategoriesOf(child)
  if (fateCategories.has('灵兽')) counters.anyBeastFate = true
  if (fateCategories.has('灵植')) counters.anyPlantFate = true
  if (child.motherId) {
    counters.motherBirths.set(child.motherId, (counters.motherBirths.get(child.motherId) || 0) + 1)
  }
  return counters
}

/** 首位 / 计数类：出生序号 → 成就 id */
const BORN_ORDINAL_ACHIEVEMENTS = {
  1: 'first_child',
  2: 'second_child',
  10: 'tenth_child',
  100: 'hundredth_child',
  1000: 'thousandth_child',
  10000: 'ten_thousand_child'
}

/** 计数 · 灵根类：有灵根子嗣的序号 → 成就 id */
const ROOT_ORDINAL_ACHIEVEMENTS = {
  1: 'first_root',
  10: 'tenth_root_child',
  100: 'hundredth_root_child',
  1000: 'thousandth_root_child'
}

/** 同胞类：同母第 N 个 → 成就 id */
const MOTHER_ORDINAL_ACHIEVEMENTS = {
  3: 'three_from_one',
  5: 'five_from_one',
  10: 'ten_from_one'
}

/**
 * 判定**本次出生**新达成的成就。
 *
 * @param {object} child 刚出生的子嗣（尚未计入 `counters`）
 * @param {object} counters `buildBirthCountersOf` 的形状（本次出生之前）
 * @returns {string[]} 成就 id 数组（按类顺序，无重复）
 */
export const evaluateOffspringAchievementsOf = (child, counters) => {
  if (!child) return []
  const c = counters || buildBirthCountersOf([])
  const ids = []

  // ---------- 首位 / 计数（按全族出生序号） ----------
  const bornOrdinal = c.born + 1
  if (BORN_ORDINAL_ACHIEVEMENTS[bornOrdinal]) ids.push(BORN_ORDINAL_ACHIEVEMENTS[bornOrdinal])

  // ---------- 首位 / 计数 · 灵根（按有灵根子嗣序号） ----------
  if (child.hasRoot) {
    const rootOrdinal = c.rooted + 1
    if (ROOT_ORDINAL_ACHIEVEMENTS[rootOrdinal]) ids.push(ROOT_ORDINAL_ACHIEVEMENTS[rootOrdinal])
    const rootCount = Number(child.rootCount) || 0
    if (rootCount >= 2 && !c.anyDoubleRoot) ids.push('first_double_root')
    if (rootCount >= 3 && !c.anyTripleRoot) ids.push('first_triple_root')
  }

  // ---------- 词条类 ----------
  const traits = Array.isArray(child.traits) ? child.traits : []
  if (traits.length > 0 && !c.anyTrait) ids.push('first_trait')
  if (traits.length >= 2 && !c.anyDualTrait) ids.push('first_dual_trait')
  if (hasLegendTraitOf(traits) && !c.anyLegendTrait) ids.push('first_legend_trait')

  // ---------- 同胞类（只算有 motherId 的：桂冈亲生） ----------
  if (child.motherId) {
    const motherOrdinal = (c.motherBirths.get(child.motherId) || 0) + 1
    if (MOTHER_ORDINAL_ACHIEVEMENTS[motherOrdinal]) ids.push(MOTHER_ORDINAL_ACHIEVEMENTS[motherOrdinal])
  }

  // ---------- 本命类 ----------
  const fateCategories = fateCategoriesOf(child)
  if (fateCategories.has('灵兽') && !c.anyBeastFate) ids.push('first_beast_fate')
  if (fateCategories.has('灵植') && !c.anyPlantFate) ids.push('first_plant_fate')

  return ids
}
