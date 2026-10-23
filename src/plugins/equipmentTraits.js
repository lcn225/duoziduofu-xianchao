// 装备词条表（课题 A / P36 第 1 步）
//
// **唯一真源是文档**：`design/30-数据与决议/装备词条表.md` §9「机器可读版」。
// 本文件是那份 JSON 的**代码副本**，改词表先改文档，再同步到这里。
// 课题 B（同参标签）的打标脚本读的是同一份文档表，两边不要各写一份。
//
// 90 个词 = A 纯增益 52 / B 条件克制 12 / C 复合 17 / D 无战斗映射 9。
// D 类只给课题 B 算契合，**不进装备 roll 池**（`pool: false`）。
//
// ⚠ 词条数值是**乘区**，乘在这件装备的「白板 + 主属性」上，不是乘在角色总面板上
//   （《装备词条表》§0、《装备系统》§一）。所以 applyTraits() 只改这一件装备的 stats。

/** 层级权重（课题 B 用；本文件只在词条记录上带出来） */
export const TRAIT_LAYERS = { 顶层: 1.0, 中层: 0.4, 底层: 0.25 }

/** 装备槽（中文，与文档表一致）→ 代码槽位键 */
export const SLOT_KEY_BY_TRAIT_SLOT = {
  武器: 'weapon',
  防具: 'body',
  头饰: 'head',
  饰品: 'accessory',
  法宝: 'artifact'
}

/** 六种抗性（「五方揭谛 / 金刚 / 罗汉」随机一条） */
export const RANDOM_RESIST_KEYS = [
  'critResist',
  'comboResist',
  'counterResist',
  'stunResist',
  'dodgeResist',
  'vampireResist'
]

/**
 * 词条主表 —— 《装备词条表》§9 的逐行转录（26 组 / 90 词）。
 *
 * - `stats`：目标属性。`randomResist` 是占位，roll 时按 `RANDOM_RESIST_KEYS` 选一条。
 * - `slots`：能出现的槽（中文，消费时换成 `SLOT_KEY_BY_TRAIT_SLOT`）。
 * - `qualityCap`：品质上限。B 类封在「稀有」，传说位不会抽到。
 * - `coef`：套完 tier×品质基础值后要乘的系数（A 1.0 / B 2.0 / C 0.6）。
 */
export const TRAIT_ENTRIES = [
  { id: 'sharp', words: ['锋锐', '极锋锐'], layer: '顶层', category: 'A', stats: ['attackPct'], slots: ['武器'], pool: true, qualityCap: '传说', coef: 1.0 },
  { id: 'pierce', words: ['破甲'], layer: '顶层', category: 'A', stats: ['attackPct'], slots: ['武器'], pool: true, qualityCap: '传说', coef: 1.0 },
  { id: 'swift', words: ['绝影', '追风'], layer: '顶层', category: 'A', stats: ['speedPct'], slots: ['武器', '饰品'], pool: true, qualityCap: '传说', coef: 1.0 },
  { id: 'solid', words: ['坚固', '极坚固', '不灭', '不动'], layer: '顶层', category: 'A', stats: ['defensePct'], slots: ['防具', '头饰'], pool: true, qualityCap: '传说', coef: 1.0 },
  { id: 'heavy', words: ['沉重', '极沉重'], layer: '顶层', category: 'A', stats: ['healthPct'], slots: ['武器', '防具'], pool: true, qualityCap: '传说', coef: 1.0 },
  { id: 'drain', words: ['锁魂', '饮血', '摄魂', '吞灵'], layer: '顶层', category: 'A', stats: ['vampireRate'], slots: ['武器', '饰品'], pool: true, qualityCap: '传说', coef: 1.0 },
  { id: 'element', words: ['极寒', '玄冰', '寒冰', '灼火', '离火', '烈阳', '辉光', '雷火', '蓄火', '月华', '日光'], layer: '顶层', category: 'A', stats: ['critRate'], slots: ['武器'], pool: true, qualityCap: '传说', coef: 1.0 },
  { id: 'illusion', words: ['万幻', '镜影', '幻身', '幻术', '五蜂毒'], layer: '顶层', category: 'A', stats: ['comboRate'], slots: ['武器', '饰品'], pool: true, qualityCap: '传说', coef: 1.0 },
  { id: 'formless', words: ['无形'], layer: '顶层', category: 'A', stats: ['dodgeRate'], slots: ['饰品', '防具'], pool: true, qualityCap: '传说', coef: 1.0 },
  { id: 'calm', words: ['凝神'], layer: '顶层', category: 'A', stats: ['stunResist'], slots: ['头饰'], pool: true, qualityCap: '传说', coef: 1.0 },
  { id: 'soulstill', words: ['镇魂'], layer: '顶层', category: 'A', stats: ['stunRate'], slots: ['头饰', '法宝'], pool: true, qualityCap: '传说', coef: 1.0 },
  { id: 'nurture', words: ['养魂', '回气', '疗伤', '再生'], layer: '顶层', category: 'A', stats: ['healthPct'], slots: ['防具', '头饰'], pool: true, qualityCap: '传说', coef: 1.0 },
  { id: 'guard', words: ['护体', '道德', '功德', '玄德'], layer: '顶层', category: 'A', stats: ['finalDamageReduce'], slots: ['防具', '法宝'], pool: true, qualityCap: '传说', coef: 1.0 },
  { id: 'lowcost', words: ['低需'], layer: '顶层', category: 'A', stats: ['speedPct'], slots: ['饰品', '法宝'], pool: true, qualityCap: '传说', coef: 1.0 },
  { id: 'magnet', words: ['天磁', '精金'], layer: '顶层', category: 'A', stats: ['comboResist'], slots: ['防具', '饰品'], pool: true, qualityCap: '传说', coef: 1.0 },
  { id: 'jade', words: ['青玉'], layer: '中层', category: 'A', stats: ['comboResist'], slots: ['防具', '饰品'], pool: true, qualityCap: '传说', coef: 1.0 },
  { id: 'dissolve', words: ['分水', '分火', '分金'], layer: '顶层', category: 'A', stats: ['critResist'], slots: ['防具', '头饰'], pool: true, qualityCap: '传说', coef: 1.0 },
  { id: 'ward', words: ['辟水', '辟火', '辟邪'], layer: '顶层', category: 'A', stats: ['vampireResist'], slots: ['防具', '头饰'], pool: true, qualityCap: '传说', coef: 1.0 },
  { id: 'counter', words: ['镇邪', '镇魔', '斩鬼', '诛邪', '破土', '破水', '反五行', '克土', '克金', '克水', '斩雪', '威压'], layer: '顶层', category: 'B', stats: ['attackPct'], slots: ['武器', '饰品', '法宝'], pool: true, qualityCap: '稀有', coef: 2.0 },
  { id: 'trinity', words: ['三花', '三才', '两仪', '四象'], layer: '顶层', category: 'C', stats: ['healthPct', 'defensePct'], slots: ['法宝', '防具'], pool: true, qualityCap: '传说', coef: 0.6 },
  { id: 'marks', words: ['三相', '清心', '清音', '禅唱'], layer: '顶层', category: 'C', stats: ['stunResist', 'counterResist', 'vampireResist'], slots: ['头饰', '法宝'], pool: true, qualityCap: '传说', coef: 0.6 },
  { id: 'linked', words: ['同心', '连环'], layer: '顶层', category: 'C', stats: ['comboRate', 'counterRate'], slots: ['饰品', '法宝'], pool: true, qualityCap: '传说', coef: 0.6 },
  { id: 'beast', words: ['黑炎凤', '冰猿', '万豹'], layer: '顶层', category: 'C', stats: ['critRate', 'speedPct'], slots: ['武器', '饰品'], pool: true, qualityCap: '传说', coef: 0.6 },
  { id: 'guardian', words: ['五方揭谛', '金刚', '罗汉'], layer: '顶层', category: 'C', stats: ['randomResist'], slots: ['法宝'], pool: true, qualityCap: '传说', coef: 0.6 },
  { id: 'gilded', words: ['鎏金'], layer: '顶层', category: 'C', stats: ['attackPct', 'defensePct', 'healthPct'], slots: ['防具', '饰品'], pool: true, qualityCap: '传说', coef: 0.6 },
  { id: 'nomap', words: ['驯宠', '通灵', '蓄灵', '纳物', '祥瑞', '镇宅', '通神', '锁灵', '自疗'], layer: '顶层', category: 'D', stats: [], slots: [], pool: false, qualityCap: null, coef: null }
]

/** 词条总数（90 词）。改词表时 verify-items 会对着它数 */
export const TRAIT_WORD_COUNT = TRAIT_ENTRIES.reduce((sum, entry) => sum + entry.words.length, 0)

/** 成色 → 词条条数（《装备系统》§6.1） */
export const TRAIT_COUNT_BY_QUALITY = { 下: 0, 中: 1, 上: 2, 极: 3 }

/**
 * 成色 → 每条词条的品质概率与降级规则。
 * - 中品：固定 1 条普通
 * - 上品：每条 80/20；两条都出稀有 → 第 2 条降普通
 * - 极品：每条 75/20/5；出 2 条传说 → 降 1 条为稀有；出 3 条稀有 → 降 1 条为普通
 */
export const TRAIT_QUALITY_ROLL = {
  中: [['普通', 1]],
  上: [['普通', 0.8], ['稀有', 0.2]],
  极: [['普通', 0.75], ['稀有', 0.2], ['传说', 0.05]]
}

/** tier × 品质的**基础值**（纯增益类，整数百分比；B ×2、C ×0.6 之后再取整） */
export const TRAIT_VALUE_TABLE = {
  1: { 普通: [1, 3], 稀有: [3, 5], 传说: [5, 8] },
  2: { 普通: [2, 4], 稀有: [4, 7], 传说: [7, 10] },
  3: { 普通: [3, 5], 稀有: [5, 9], 传说: [9, 12] },
  4: { 普通: [4, 6], 稀有: [6, 11], 传说: [11, 14] },
  5: { 普通: [5, 8], 稀有: [8, 13], 传说: [13, 16] }
}

/** 乘区类词条 → 它乘的那条白板属性 */
export const PCT_STAT_TARGET = {
  attackPct: 'attack',
  defensePct: 'defense',
  healthPct: 'health',
  speedPct: 'speed'
}

/** 品质 → 数值倍率，用于「条件克制 ×2 / 复合 ×0.6」后的端点取整 */
const ENTRY_COEF = { A: 1.0, B: 2.0, C: 0.6 }

/** 允许出现的类别：传说位只抽 A / C（B 类封顶稀有） */
const CATEGORIES_BY_QUALITY = {
  普通: ['A', 'B', 'C'],
  稀有: ['A', 'B', 'C'],
  传说: ['A', 'C']
}

const pickOne = (list, rng) => list[Math.min(Math.floor(rng() * list.length), list.length - 1)]

/** 词条组可用槽（代码键） */
const slotsOfEntry = entry => entry.slots.map(name => SLOT_KEY_BY_TRAIT_SLOT[name]).filter(Boolean)

/**
 * 一条词条在这件装备上的实际属性效果（**未合并**）。
 *
 * @returns {{ stats:Object, statKeys:string[] }} stats 是「百分比 / 小数」，
 *   乘区类（attackPct…）留给 applyTraits 去乘白板，几率类直接加。
 */
const effectOf = (entry, value, { rng, occupied }) => {
  const stats = {}
  const statKeys = []
  for (const key of entry.stats) {
    if (key === 'randomResist') {
      const free = RANDOM_RESIST_KEYS.filter(k => !occupied.has(k))
      const chosen = free.length ? pickOne(free, rng) : null
      if (!chosen) return null
      stats[chosen] = value
      statKeys.push(chosen)
    } else {
      // 鎏金：三条属性各取 1/3（《装备词条表》§3.3 第 25 行）
      stats[key] = entry.id === 'gilded' ? value / 3 : value
      statKeys.push(key)
    }
  }
  return { stats, statKeys }
}

/** 从 tier×品质的基础区间取一个整数百分比，套类别系数后返回小数（0.03 之类） */
const rollValue = (tier, quality, entry, rng) => {
  const range = (TRAIT_VALUE_TABLE[tier] || TRAIT_VALUE_TABLE[1])[quality]
  if (!range) return 0
  const coef = ENTRY_COEF[entry.category] ?? 1
  // 端点向上取整（《装备系统》§6.3 的取整规则），再在 [lo, hi] 里均匀取整数
  const lo = Math.ceil(range[0] * coef)
  const hi = Math.ceil(range[1] * coef)
  const pct = lo + Math.min(Math.floor(rng() * (hi - lo + 1)), hi - lo)
  return pct / 100
}

/**
 * roll 一件装备的词条（《装备词条表》§5 的「先抽属性、后挑皮肤」）。
 *
 * @param {object} input
 * @param {string} input.slotKey  代码槽位键（weapon/body/head/accessory/artifact）
 * @param {number} input.tier     基阶 1~5
 * @param {string} input.quality  成色：下/中/上/极
 * @param {Function} input.rng    随机源（默认 Math.random，测试可注入）
 * @returns {Array} 词条记录；下品返回空数组
 */
export const rollTraits = ({ slotKey, tier = 1, quality = '中', rng = Math.random } = {}) => {
  const count = TRAIT_COUNT_BY_QUALITY[quality] || 0
  if (!count) return []
  const t = Math.min(Math.max(Math.floor(Number(tier) || 1), 1), 5)
  const qualityList = settleQualitiesWith(quality, rng)
  const occupied = new Set()
  const traits = []

  for (let i = 0; i < count; i += 1) {
    const traitQuality = qualityList[i]
    if (!traitQuality) break
    const allowed = CATEGORIES_BY_QUALITY[traitQuality] || ['A']
    // 先挑类别、再挑词条；类别之间等概率（《装备词条表》§5）
    const eligibleByCategory = allowed
      .map(category => ({
        category,
        entries: TRAIT_ENTRIES.filter(
          entry =>
            entry.pool &&
            entry.category === category &&
            slotsOfEntry(entry).includes(slotKey) &&
            !entry.stats.some(key =>
              key === 'randomResist'
                ? RANDOM_RESIST_KEYS.every(k => occupied.has(k))
                : occupied.has(key)
            )
        )
      }))
      .filter(group => group.entries.length)

    if (!eligibleByCategory.length) break
    const group = pickOne(eligibleByCategory, rng)
    const entry = pickOne(group.entries, rng)
    const value = rollValue(t, traitQuality, entry, rng)
    const effect = effectOf(entry, value, { rng, occupied })
    if (!effect) break
    effect.statKeys.forEach(key => occupied.add(key))
    traits.push({
      id: entry.id,
      word: pickOne(entry.words, rng),
      layer: entry.layer,
      weight: TRAIT_LAYERS[entry.layer] ?? 0.25,
      category: entry.category,
      quality: traitQuality,
      value,
      stats: effect.stats,
      statKeys: effect.statKeys
    })
  }
  return traits
}

const settleQualitiesWith = (quality, rng) => {
  if (quality === '上') {
    const rolled = [rollQualityWith(TRAIT_QUALITY_ROLL.上, rng), rollQualityWith(TRAIT_QUALITY_ROLL.上, rng)]
    if (rolled.every(q => q === '稀有')) rolled[1] = '普通'
    return rolled
  }
  if (quality === '极') {
    const rolled = [0, 1, 2].map(() => rollQualityWith(TRAIT_QUALITY_ROLL.极, rng))
    if (rolled.filter(q => q === '传说').length >= 2) {
      rolled[rolled.lastIndexOf('传说')] = '稀有'
    }
    if (rolled.filter(q => q === '稀有').length >= 3) rolled[2] = '普通'
    return rolled
  }
  return [rollQualityWith(TRAIT_QUALITY_ROLL[quality] || TRAIT_QUALITY_ROLL.中, rng)]
}

const rollQualityWith = (list, rng) => {
  const r = rng()
  let acc = 0
  for (const [quality, weight] of list) {
    acc += weight
    if (r < acc) return quality
  }
  return list[list.length - 1][0]
}

/**
 * 把词条效果合并进一件装备的属性。
 *
 * 乘区类（attackPct 等）乘**这一件装备**的白板 + 主属性 + 副属性；
 * 几率/抗性类直接加。返回新对象，不改入参。
 */
export const applyTraits = (flatStats = {}, traits = []) => {
  const out = { ...flatStats }
  for (const trait of traits) {
    for (const [key, value] of Object.entries(trait.stats)) {
      const target = PCT_STAT_TARGET[key]
      if (target) {
        if (typeof out[target] === 'number') {
          out[target] = round1(out[target] * (1 + value))
        }
      } else {
        out[key] = round4((Number(out[key]) || 0) + value)
      }
    }
  }
  return out
}

export const round1 = value => Math.round(value * 10) / 10
export const round4 = value => Math.round(value * 10000) / 10000
