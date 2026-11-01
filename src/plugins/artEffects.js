// 非心法效果系统（P56-c，2026-11-01）—— **唯一真源**
//
// 真源文档：《功法系统》§四/§五/§8.1 #4~#7（数值 2026-10-31 已定稿）。
//
//   法术 → 攻击     身法 → 速度     炼体 → 气血 + 防御（2:1）     器诀 → 装备百分比
//
//   coef          = 1.12^score，score = 3×(阶−1) + 品序（low 0 / mid 1 / high 2 / peak 3）
//   totalAtMax    = categoryBase × coef
//   valueAtLevel  = totalAtMax × 等级 / maxLevel          （线性按级，公式自带）
//   总加成        = cap × (1 − e^(−原始/cap))              （软上限 B，与子嗣加成同一套）
//
// ⚠ **只有桂冈吃这条**：法术 / 身法 / 炼体 / 器诀 都不进契合度、不进门槛
//   （`harmony.qiArtPoolOf` 只收心法），也不给子嗣 —— 子嗣战力另有 `secretRealm` 的口径。
// ⚠ **心法不在这里**：心法的价值全部通过 Fit 体现（《功法系统》§六），
//   给心法也加攻击/速度会把「买心法是买门票」这件事冲掉。
// ⚠ 器诀的「与词条加算」是**加区**级别的事，不在本文件里合成 ——
//   本文件只算器诀那一份百分比，装备页把它和专精词条**相加**后再乘白板
//   （见 `stores/modules/attributes.js` 的 `artifactPanelWithBonus`）。
//
// 全部纯函数：不碰 store、不读全局，方便 node 直接断言。

// 带 .js 后缀是刻意的：本文件被 scripts/verify-harmony.mjs 用 node 直接加载
import { QI_ART_MAP, artGradeOf, artTierOf } from './cultivationData.js'
import { qiArtLevelOf } from './harmony.js'
// 器型别名（飞剑 → 剑）与专精共用一张表，不要各写一份
import { SPECIALTY_TYPE_ALIAS } from './innerCourtData.js'

/** 调参集中在这里；改数值只动这一处 */
export const TUNING = {
  /**
   * 类别基准 = **一阶下品满级**的效果（《功法系统》§5.3 / §8.1 #6）。
   * `equip` 是器诀专用的虚拟通道：它不进四属性，进装备百分比。
   */
  categoryBase: {
    法术: { attack: 0.05 },
    身法: { speed: 0.05 },
    炼体: { health: 0.04, defense: 0.02 },
    器诀: { equip: 0.04 }
  },
  /** 效果系数底数：`coef = 1.12^score`（1.000 ~ 3.896），不整体缩放 */
  coefBase: 1.12,
  /**
   * 软上限 cap（《功法系统》§8.1 #4）：攻击 +80% / 速度 +60% / 气血 +80% / 防御 +80%。
   * 旧设计里的「修炼速度 +100% / 熟练度 +100%」两项**已删除**
   * （心法不直接加速度，熟练度已并入心法等级）。
   */
  softCap: { attack: 0.8, speed: 0.6, health: 0.8, defense: 0.8 },
  /**
   * 器诀**没有单独 cap** —— §8.1 #4 只给了四项 cap，器诀落在「装备百分比」加区，
   * 与专精词条同区相加。单本满级最高 = 4% × 3.896 ≈ 15.6%。
   * ⚠ 全部器诀都练满时的合计上限设计未给，**别在代码里随手补一个 cap**。
   */
  /** 超过 cap 的这个比例后，UI 追加一行「收益递减」（§4.4，不显示精确上限） */
  decayingHintRatio: 0.7
}

/** 品序：low 0 / mid 1 / high 2 / peak 3 */
export const QUALITY_INDEX = { low: 0, mid: 1, high: 2, peak: 3 }

/** 四属性通道（器诀的 `equip` 不在这里 —— 它走装备区） */
export const NON_ART_STATS = ['attack', 'speed', 'health', 'defense']

/** 吃非心法效果的四大类（心法不在内） */
export const NON_ART_CATEGORIES = Object.keys(TUNING.categoryBase)

/** `score = 3×(阶−1) + 品序`（《功法系统》§5.2） */
export const artEffectScoreOf = art =>
  3 * (artTierOf(art) - 1) + (QUALITY_INDEX[art?.quality] ?? 0)

/** `coef = 1.12^score`：一阶下品 1.000 → 四阶极品 3.896 */
export const artEffectCoefOf = art => Math.pow(TUNING.coefBase, artEffectScoreOf(art))

/** 满级总效果（小数，0.05 = +5%）；未知类别 / 通道返回 0 */
export const artEffectMaxOf = (art, stat) => {
  const base = TUNING.categoryBase[art?.category]?.[stat]
  return base ? base * artEffectCoefOf(art) : 0
}

/**
 * 当前等级的效果：`totalAtMax × 等级 / maxLevel`。
 *
 * ⚠ 等级 1 = 满级的 `1/maxLevel`，**不是 0** —— 「学过就有」是设计口径
 *   （《功法系统》§5.1）；想让某本完全不生效，唯一办法是没学过它。
 */
export const artEffectValueOf = (art, entry, stat) => {
  const max = artEffectMaxOf(art, stat)
  if (!max) return 0
  const maxLevel = artGradeOf(art).maxLevel
  return (max * qiArtLevelOf(entry, art)) / maxLevel
}

/**
 * 已修**非心法**逐本效果清单（UI 与聚合都读它）。
 * 返回 `[{ id, art, entry, level, maxLevel, value: {attack|speed|health|defense|equip} }]`。
 */
export const nonArtEffectPartsOf = practice => {
  const known = practice?.qiArts?.known || {}
  const out = []
  for (const [id, entry] of Object.entries(known)) {
    const art = QI_ART_MAP[id]
    if (!art || !NON_ART_CATEGORIES.includes(art.category)) continue
    const stats = TUNING.categoryBase[art.category]
    const value = {}
    for (const stat of Object.keys(stats)) value[stat] = artEffectValueOf(art, entry, stat)
    out.push({
      id,
      art,
      entry,
      level: qiArtLevelOf(entry, art),
      maxLevel: artGradeOf(art).maxLevel,
      value
    })
  }
  return out
}

/**
 * 软上限 B：`cap × (1 − e^(−原始/cap))`。
 * 与 `innerCourt.applyBonusSoftCap` 是同一条公式 —— 但**不要 import 它**：
 * 那份属于子嗣加成（按境界取 cap），这里按属性取 cap，两者的 cap 来源不同。
 */
export const artEffectSoftCapOf = (raw, cap) => {
  const r = Math.max(0, Number(raw) || 0)
  const c = Number(cap) > 0 ? Number(cap) : 0
  if (!c) return r
  return c * (1 - Math.exp(-r / c))
}

/** 四属性的**原始**加成（未套软上限），供 UI 判断「是否已进收益递减区」 */
export const nonArtRawEffectsOf = practice => {
  const out = { attack: 0, speed: 0, health: 0, defense: 0 }
  for (const part of nonArtEffectPartsOf(practice)) {
    for (const stat of NON_ART_STATS) out[stat] += part.value[stat] || 0
  }
  return out
}

/** 四属性的**实际**加成（已套软上限）—— `combatPanel` 直接乘这个 */
export const nonArtEffectsOf = practice => {
  const raw = nonArtRawEffectsOf(practice)
  const out = {}
  for (const stat of NON_ART_STATS) out[stat] = artEffectSoftCapOf(raw[stat], TUNING.softCap[stat])
  return out
}

/**
 * 器诀的装备百分比：**按器型分摊**。
 *
 * 返回 `{ '*': 通吃所有灵器的合计, 剑: 0.079, 盾: 0.05, ... }`。
 * `equipType` 缺失 = **全部灵器**（《功法系统》§4.3 定稿）—— 御器/焰器这类通吃法宝。
 * 器型先过 `SPECIALTY_TYPE_ALIAS`（物品池的「飞剑」按「剑」算）。
 */
export const vesselArtBonusMapOf = practice => {
  const map = {}
  for (const part of nonArtEffectPartsOf(practice)) {
    if (part.art.category !== '器诀') continue
    const pct = part.value.equip || 0
    if (!pct) continue
    const key = part.art.equipType || '*'
    map[key] = (map[key] || 0) + pct
  }
  return map
}

/** 某件装备能吃到的器诀百分比（通吃那份 + 对应器型那份） */
export const vesselArtBonusForTypeOf = (map, itemType) => {
  if (!map) return 0
  const alias = itemType ? SPECIALTY_TYPE_ALIAS[itemType] || itemType : null
  return (map['*'] || 0) + (alias ? map[alias] || 0 : 0)
}

/** 通道 → 中文名（器诀按器型显示） */
export const STAT_NAMES = { attack: '攻击', speed: '速度', health: '气血', defense: '防御' }

const fmtPct = v => `${((Number(v) || 0) * 100).toFixed(1)}%`

/**
 * UI：一句话描述某本非心法**当前等级**的效果。
 * 例：`攻击 +5.0%` / `气血 +3.1% · 防御 +1.6%` / `剑装备 +7.9%`
 */
export const artEffectTextOf = (art, entry) => {
  const stats = TUNING.categoryBase[art?.category]
  if (!stats) return ''
  return Object.keys(stats)
    .map(stat => {
      const label =
        stat === 'equip' ? (art?.equipType ? `${art.equipType}装备` : '全部灵器') : STAT_NAMES[stat]
      return `${label} +${fmtPct(artEffectValueOf(art, entry, stat))}`
    })
    .join(' · ')
}

/** UI：某个通道是否已进「收益递减」区（原始 > cap × 0.7） */
export const artEffectDecayingOf = (raw, stat) => {
  const cap = TUNING.softCap[stat]
  return !!cap && (Number(raw) || 0) > cap * TUNING.decayingHintRatio
}
