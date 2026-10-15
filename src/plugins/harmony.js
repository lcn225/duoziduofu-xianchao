// 三维契合度：修行系统的唯一真源
//
//   综合契合度 = 功法×0.15 + 同参×0.50 + 灵地×0.35            每维归一到 [0,1]
//   修炼速度   = 灵地基础产出 × (0.7 + 综合契合度 × 0.6) × spiritRate
//                × 本命数量系数 × 行功带宽 × (1 + 子嗣修炼加成)
//
// ⚠ 上一版有第四维「本命契合」，已整维删除。它是随境界自动上涨的常数
//   （练气 75% → 筑基自动满值），白送 26 个点，玩家经营不了。
//   本命现在只通过两件事起作用：决定灵根（灵气属性）、以及用**本命品阶**封顶同参契合。
//
// 契合度是**门票**不是收益引擎：0% → 100% 只把速度从 0.70× 拉到 1.30×。
// 真正驱动挂机收益的是 spiritRate（每次内功突破 ×1.2）、子嗣（最高 3×）和行功带宽。
//
// 全部是纯函数：不碰 store、不读全局，方便用 node 直接断言。

// 带 .js 后缀是刻意的：这两个文件被 scripts/verify-harmony.mjs 用 node 直接加载，
// 而 node 的 ESM 解析器不接受省略扩展名的相对路径（vite 两者都接受）。
import {
  QI_ART_MAP,
  FATE_ITEM_MAP,
  SPIRIT_LAND_MAP,
  PLAYER_FATES,
  landOutput,
  artGradeOf
} from './cultivationData.js'
import { FATE_ITEM_TIER_COEFF } from './tiers.js'

/** 调参集中在这里，改数值只动这一处 */
export const TUNING = {
  /** 单次累积上限（秒），供将来的离线结算模块直接传离线时长 */
  maxSecondsPerTick: 86400,

  /** 三维权重（《灵气系统》§4.1）。换同参的效果 = 换功法的 2~3 倍 */
  weights: { qiArt: 0.15, fateItem: 0.5, spiritLand: 0.35 },

  qiArt: {
    /** 品阶分（《灵气系统》§4.2） */
    gradeScore: { qi: 0.2, foundation: 0.3, core: 0.4 },
    /** 灵根匹配分 = coverageScale × 覆盖率 */
    coverageScale: 0.4,
    /** 熟练度：每 100 游戏小时 +1% */
    profPer100Hours: 0.01,
    profCap: 0.2,
    /** 每多少游戏小时升一层（仅供展示，不加属性） */
    hoursPerLevel: 100
  },

  fateItem: {
    /** 接近度系数（《灵气系统》§4.3）*/
    proximity: { owner: 1.0, series: 0.7, type: 0.4, none: 0.15 }
  },

  /** 速度里的契合度项：0% → base，100% → base + span */
  speed: { base: 0.7, span: 0.6 },

  /** 本命数量系数（《灵气系统》§1.3）—— 本命越多修炼越慢，纯惩罚 */
  fateCountCoef: {
    single: 1.0, // 单本命单灵根
    dualSingleRoot: 0.9, // 双本命单灵根
    dualDualRoot: 0.8, // 双本命双灵根
    triple: 0.7, // 三本命
    many: 0.6 // 三本命以上
  },

  /** 行功带宽占位：五种散功 + 边际衰减 + 上限尚未实现，本批恒 1.0 */
  bandwidth: 1.0,
  /** 子嗣修炼加成占位：模块二接入后由有灵根子嗣提供，上限 +200% */
  childrenBonus: 0,

  /**
   * 炼体加成：随外功境界派生（见 practice.js 的 bodyBonus）。
   * 走**纯 getter 派生**而不是写进 baseAttributes —— 现有穿装备/灵宠加成都是
   * 双向增量加减、已有漂移风险，派生值没有任何写操作，物理上不可能漂移。
   * 带上随境界递增的 scale，避免高境界时加成失去存在感。
   */
  body: { healthPerLevel: 20, defensePerLevel: 2 }
}

export const clamp01 = value => Math.min(1, Math.max(0, value))

/**
 * 游戏秒 → 游戏小时。
 *
 * 纯单位换算：1 现实秒 = 1 游戏小时（节奏旋钮在 gameClock.js），
 * 所以 1 游戏小时 = 3600 游戏秒。**不要**再引入 secondsPerGameHour——
 * 旧版用它做分母，导致熟练度快了 100 倍。
 */
export const hoursFromSeconds = seconds => (seconds || 0) / 3600

// ---------- 灵气集合与覆盖率 ----------

/** 玩家本命对象列表 */
export const playerFates = practice =>
  (practice?.destiny?.fates || [])
    .map(id => PLAYER_FATES.find(f => f.id === id))
    .filter(Boolean)

/** 玩家的灵气集合（去重）—— 桂冈 = ['beast', 'vessel'] */
export const playerElements = practice =>
  [...new Set(playerFates(practice).map(f => f.element))]

/**
 * 功法覆盖率：功法灵气覆盖了修士多少比例的灵气。**分母是修士**。
 *
 *   桂冈（兽+器）× 兽吼功（兽）      → 1/2 = 50%  （部分匹配）
 *   桂冈（兽+器）× 兽器双修经（兽+器）→ 2/2 = 100%（完全匹配）
 *   桂冈（兽+器）× 桂氏气血经（火）   → 0/2 = 0%  （不匹配）
 */
export const artCoverage = (art, elements) => {
  const artEls = art?.elements || []
  if (!artEls.length || !elements?.length) return 0
  const covered = artEls.filter(e => elements.includes(e)).length
  return covered / elements.length
}

/**
 * 灵地匹配度：灵地灵气里修士能用上的比例。**分母是灵地**。
 *
 * 与 artCoverage 的分母不同，这是设计有意的 —— 功法看「修士的灵气被覆盖多少」，
 * 灵地看「灵地的灵气修士能吸收多少」。别把两个函数合并。
 *
 *   快子峰（兽60%+器40%）× 桂冈（兽+器）→ 100%
 *   郑家核心（木100%）   × 桂冈（兽+器）→ 0%
 */
export const landFit = (land, elements) => {
  const els = land?.elements
  if (!els || !elements?.length) return 0
  let sum = 0
  for (const [element, weight] of Object.entries(els)) {
    if (elements.includes(element)) sum += weight
  }
  return clamp01(sum)
}

// ---------- 四个维度 ----------

/** 熟练度当前值，由原始秒数现算 —— 改 TUNING 立即生效，无需迁移存档 */
export const qiArtProficiency = entry =>
  Math.min(
    (hoursFromSeconds(entry?.practiceSeconds) / 100) * TUNING.qiArt.profPer100Hours,
    TUNING.qiArt.profCap
  )

/** 功法层数：由修炼时长派生，仅供展示，不加任何属性 */
export const qiArtLevelOf = (entry, art) =>
  Math.min(Math.floor(hoursFromSeconds(entry?.practiceSeconds) / TUNING.qiArt.hoursPerLevel) + 1, artGradeOf(art).maxLevel)

/**
 * 功法契合 = 品阶分 + 灵根匹配分（覆盖率×40%）+ 熟练度
 *
 * 拆成好处是 verify 脚本能用合成功法覆盖「品阶/覆盖率」的每一种组合
 * （§7.3 里的「金丹级部分匹配」在现有数据里还不存在）。
 */
export const qiArtHarmonyOf = (art, entry, practice) => {
  if (!art || !entry) return 0
  const grade = TUNING.qiArt.gradeScore[art.grade] ?? TUNING.qiArt.gradeScore.qi
  const match = TUNING.qiArt.coverageScale * artCoverage(art, playerElements(practice))
  return clamp01(grade + match + qiArtProficiency(entry))
}

export const calcQiArtHarmony = practice => {
  const id = practice?.qiArts?.active
  return qiArtHarmonyOf(QI_ART_MAP[id], practice?.qiArts?.known?.[id], practice)
}

/**
 * 单个本命与同参的「接近度」（《灵气系统》§4.3）。
 * 下限是 0.15（不是 0）—— 「无关」的同参也有底分。
 */
export const proximityVs = (item, fate) => {
  const P = TUNING.fateItem.proximity
  if (!item || !fate) return P.none
  if (item.bondFateId && item.bondFateId === fate.id) return P.owner
  if (item.series && item.series === fate.series) return P.series
  if (item.kind && item.kind === fate.kind) return P.type
  return P.none
}

/** 取与本命集合中最优的那一档（等价于旧的 proximityOf，用于 UI 展示接近度） */
export const proximityOf = (item, practice) =>
  playerFates(practice).reduce((best, fate) => Math.max(best, proximityVs(item, fate)), TUNING.fateItem.proximity.none)

/**
 * 同参契合 = 接近度系数 × **min(同参品阶系数, 本命品阶系数)**。
 *
 * 本命品阶封顶同参 —— 一阶本命拿再多四阶同参也只有 20% 的上限。
 * 桂冈两个本命都是四阶，所以对他这个封顶是惰性的（min(x, 1.00) = x）。
 *
 * 多本命时逐个本命算 `接近度 × min(...)` 再取最大 —— 与「先找最接近的本命、
 * 再用它的品阶封顶」在单本命场景下等价，多本命时取玩家不吃亏的那一档。
 *
 * 不含熟练度、不含祭炼 —— 同参不能升级，只能更换。
 */
export const fateItemHarmonyOf = (item, practice) => {
  if (!item) return 0
  const itemCoeff = FATE_ITEM_TIER_COEFF[item.tier] ?? FATE_ITEM_TIER_COEFF.none
  const fates = playerFates(practice)
  if (!fates.length) return clamp01(TUNING.fateItem.proximity.none * itemCoeff)
  let best = 0
  for (const fate of fates) {
    const fateCoeff = FATE_ITEM_TIER_COEFF[fate.tier] ?? FATE_ITEM_TIER_COEFF.none
    best = Math.max(best, proximityVs(item, fate) * Math.min(itemCoeff, fateCoeff))
  }
  return clamp01(best)
}

export const calcFateItemHarmony = practice => {
  const id = practice?.fateItems?.active
  if (!practice?.fateItems?.known?.[id]) return 0
  return fateItemHarmonyOf(FATE_ITEM_MAP[id], practice)
}

/** 灵地契合 = 纯匹配百分比，与灵地等级无关 */
export const calcSpiritLandHarmony = practice => {
  const land = SPIRIT_LAND_MAP[practice?.spiritLand?.current]
  if (!land) return 0
  return clamp01(landFit(land, playerElements(practice)))
}

/** 三维（加权）+ 综合 */
export const calcHarmony = practice => {
  const W = TUNING.weights
  const qiArt = calcQiArtHarmony(practice)
  const fateItem = calcFateItemHarmony(practice)
  const spiritLand = calcSpiritLandHarmony(practice)
  const total = qiArt * W.qiArt + fateItem * W.fateItem + spiritLand * W.spiritLand
  return { qiArt, fateItem, spiritLand, total, weights: W }
}

/** 速度里的契合度项：0.7 + 契合度 × 0.6。**不是**灵力倍率，别当倍率用 */
export const fitFactorOf = total => TUNING.speed.base + clamp01(total) * TUNING.speed.span

/**
 * 本命数量系数（《灵气系统》§1.3）——按「本命数 + 灵根数」定档。
 * 桂冈 = 双本命双灵根 → 0.8×。
 */
export const fateSpeedCoef = practice => {
  const fates = playerFates(practice)
  const count = fates.length
  const C = TUNING.fateCountCoef
  if (count <= 1) return C.single
  if (count === 2) return new Set(fates.map(f => f.element)).size <= 1 ? C.dualSingleRoot : C.dualDualRoot
  if (count === 3) return C.triple
  return C.many
}

/** 当前灵地的基础产出 */
export const spiritLandOutputOf = practice => landOutput(SPIRIT_LAND_MAP[practice?.spiritLand?.current])

/**
 * 灵力/秒 —— 速度公式的唯一真源。
 *
 * UI 与实得都走这里，物理上不可能分叉（旧版页面里另拼了一份公式，漏了
 * rebirthSpiritMultiplier，两处口径对不上）。
 */
export const spiritPerSecondOf = ({
  landOutput: output = 0,
  fitFactor = 0,
  spiritRate = 1,
  fateCoef = 1,
  bandwidth = 1,
  childrenBonus = 0
} = {}) => output * fitFactor * spiritRate * fateCoef * bandwidth * (1 + childrenBonus)

// ---------- 预览：换成另一件之后该维度会变成多少 ----------
// 切换器的信息核心 —— 让玩家在**切换之前**就看出会变好还是变坏，而不是切完才发现。
// 纯函数，不碰 store。

export const previewQiArtHarmony = (practice, id) =>
  calcQiArtHarmony({ ...practice, qiArts: { ...practice.qiArts, active: id } })

export const previewFateItemHarmony = (practice, id) =>
  calcFateItemHarmony({ ...practice, fateItems: { ...practice.fateItems, active: id } })

export const previewSpiritLandHarmony = (practice, id) =>
  calcSpiritLandHarmony({ ...practice, spiritLand: { ...practice.spiritLand, current: id } })
