// 内宅 / 多子多福的**数值唯一真源**与全部判定纯函数（模块二）
//
//   怀孕概率 = 基础 10% × 母方位阶怀孕系数 + 好感/10（上限 +10%）- 疲劳 10%
//   灵根概率 = 基础 10% × 母方位阶灵根系数 × 父方身份系数     （上限 100%）
//   有灵根后 → 在品质分布里抽（下品 60 / 中品 25 / 上品 12 / 极品 3）
//   子嗣加成 = Σ 灵根系数 × 本命契合系数 × 词条系数           （上限 +200%）
//
// 全部是纯函数：不碰 store、不读全局、**随机性走注入的 rng 参数**。
// 注入 rng 是本文件唯一的风格偏离（现有代码一律直调 Math.random）——
// 代价是每个调用点都要多传一个参数，收益是整个抽卡层变得可断言：
// scripts/verify-harmony.mjs 用常量 rng 就能把概率边界钉死。
//
// 带 .js 后缀是刻意的：本文件被 verify 脚本用 node 直接加载，
// 而 node 的 ESM 解析器不接受省略扩展名的相对路径（vite 两者都接受）。

import {
  FATE_POOL,
  TRAIT_POOL,
  RANK_NAMES,
  SURNAMES,
  GIVEN_NAMES,
  OFFSPRING_GIVEN_NAMES,
  OFFSPRING_GIVEN_NAMES_MALE,
  OFFSPRING_GIVEN_NAMES_FEMALE,
  OFFSPRING_EASTER_EGG_NAMES,
  OFFSPRING_NAME_PARTS,
  newWife
} from './innerCourtData.js'
// 玩家本命与灵气集合的真源在 harmony.js（它已 import cultivationData.js）
import { playerFates, playerElements } from './harmony.js'

/** 调参集中在这里，改数值只动这一处 */
export const TUNING = {
  /**
   * 位阶表。`promote` = **从本位阶升到下一阶**的条件（等价于设计 §2.1 里
   * 「晋升条件」那一列 —— 那一列写的正是「升到本位阶的条件」，两者差一级）。
   *
   * 本批只有 P1-P6 可达（P7+ 是女修段，女修还没有获取途径），
   * 但系数表要完整，否则 UI 读到 P9 会显示空白。
   */
  ranks: {
    1: { pregCoef: 1.0, rootCoef: 0.5, promote: { kind: 'interactions', n: 10 } },
    2: { pregCoef: 1.0, rootCoef: 0.5, promote: { kind: 'firstNight' } },
    3: { pregCoef: 1.0, rootCoef: 0.7, promote: { kind: 'pregnancies', n: 1 } },
    4: { pregCoef: 1.0, rootCoef: 0.8, promote: { kind: 'rootChildren', n: 1 } },
    5: { pregCoef: 1.0, rootCoef: 0.9, promote: { kind: 'topChildren', n: 1 } },
    6: { pregCoef: 1.0, rootCoef: 1.0, promote: null }, // 凡女天花板
    7: { pregCoef: 0.9, rootCoef: 1.2, promote: null },
    8: { pregCoef: 0.8, rootCoef: 1.5, promote: null },
    9: { pregCoef: 0.5, rootCoef: 2.0, promote: null },
    10: { pregCoef: 0.4, rootCoef: 2.5, promote: null },
    11: { pregCoef: 0.3, rootCoef: 3.0, promote: null },
    12: { pregCoef: 0.25, rootCoef: 3.5, promote: null },
    13: { pregCoef: 0.2, rootCoef: 4.0, promote: null }
  },
  /** 本批封顶。P7+ 的 promote 全是 null，所以就算位阶被塞到 7 也不会乱升 */
  rankReachableMax: 6,

  /**
   * 父方（生父）身份系数。**键直接对齐 realm.js 境界对象的 tier 字段**
   * （练气 1-10 / 筑基 11-14 / 结丹 15-18），所以不需要另建映射表。
   *
   * ⚠ 这里修正了设计 §6.1 的自相矛盾：系数表写「练气 2.0」，紧跟着的
   *   「桂冈的子嗣灵根概率」表却直接用 ×4。**以本表为准**（随玩家境界）。
   */
  fatherCoef: { mortal: 1.0, qi: 2.0, foundation: 3.0, core: 4.0 },

  pregnancy: {
    baseChance: 0.1,
    /** 好感加成 = 好感 × 0.001，上限 +10%（即设计 §5.3 的「好感/10」） */
    affinityScale: 0.001,
    affinityCap: 0.1,
    fatigueThreshold: 30,
    fatiguePenalty: 0.1,
    /** 自动模式 -5%（设计 §5.2 末） */
    autoPenalty: 0.05,
    /** 连续未孕达 10 次 → 第 11 次必孕（设计 §5.4）。判定写作 `pity >= pityLimit - 1` */
    pityLimit: 11,
    /**
     * 孕育 **90 游戏天**。
     *
     * ⚠ 原为 270 天。2026-10-16 时钟放慢 4 倍（`SECONDS_PER_GAME_HOUR` 1 → 0.25，
     *   一个游戏天从 24 现实秒变成 96 现实秒）后，270 天会变成 **7.2 现实小时** ——
     *   对一个「多子多福」是招牌机制的游戏来说太久了。
     *   缩到 90 天 → **约 2.4 现实小时**，与改造前（1.8 小时）同一量级。
     *   （设定上就当是仙家手段 —— 多子多福本来就是这本书的核心外挂。）
     *
     * `recoveryDays` 按同一比例缩放（270:30 = 90:10），保持产后恢复与孕育的节奏比不变。
     */
    days: 90,
    recoveryDays: 10,
    /** 旧档口径：受孕 + 270 天 / 产后 + 30 天。读档归一化用它们做等比折算 */
    legacyDays: 270,
    legacyRecoveryDays: 30
  },

  /** 晚间互动（设计 §5.1「进入晚间（游戏时间 20:00）」） */
  night: {
    /** 一天里的第几小时算「晚间」。自动模式在这个点发起互动 */
    eveningHour: 20,
    /** 流水账保留条数。1 游戏天 = 24 现实秒，50 条约等于 20 分钟历史 */
    logLimit: 50
  },

  /**
   * 体力（《桂冈的一天 + 体力体力系统》§1.2 /《睡觉恢复》）。
   *
   * ⚠ **这个字段过去叫「精力」** —— 内宅专用的「一晚能宠几次」的节流阀，每游戏天自动回满。
   *   自「桂冈的一天」起它升级成**全局体力**：白天所有活动（巡视 / 练功 / 炼体）
   *   与晚上的互动都花它，恢复改由**睡觉**驱动（上限/4 每小时，4 小时回满），
   *   **不再每天自动回满**。
   *
   * 字段名与存档结构**刻意不动**（`energy.spentToday` 原样保留），避免存档迁移 ——
   * 只改中文标签与上限公式。新的「精力」（百艺的脑力）是**另一条资源**，
   * 放在 `dayLoop.focus`，**不要**复用这个字段（同一个键两套含义最容易出鬼）。
   */
  energy: {
    base: 145,
    perInteraction: 15,
    /** 睡觉每小时恢复 上限/4 —— 4 小时回满（《睡觉恢复》§一） */
    sleepRestoreDivisor: 4,
    /** 设计 §4.1 的「每 5 名子嗣 +1」「P4+ 每位 +1」本批不做（没有消费口） */
    fromOffspring: 0,
    fromWives: 0
  },

  /**
   * 子嗣性别与命名（P12.6，2026-10-18）。
   *
   * `maleChance` 只作用于**出生那一刻**，不随母方位阶/父方境界变化。
   * 第一代子嗣男女都算「子孙」（Y 染规则：女儿本人的下一代才被排除），
   * 所以这里暂不影响修炼加成。
   */
  offspring: {
    maleChance: 0.5,
    /** 掌门路人物名彩蛋概率（given name，去姓） */
    easterEggRate: 0.2,
    /** 单池连续撞名多少次后换兜底策略 */
    nameAttempts: 60
  },

  draw: {
    baseRootChance: 0.1,
    /** 每 20 抽（= 每 20 个诞生的子嗣）必出有灵根（设计 §6.4） */
    pityRootLimit: 20,
    /** 首充礼包：第一个子嗣必定有灵根（设计 §6.1 末） */
    firstChildGuaranteed: true,
    /** 第二步：**已确定有灵根**前提下的品质条件概率，合计 1.00（设计 §6.2） */
    qualityDist: { low: 0.6, mid: 0.25, high: 0.12, top: 0.03 },
    /** ⚠ 设计未给：中品「四灵根 / 三灵根」的拆分比，本文件新增的旋钮 */
    midSplit: { four: 0.6, three: 0.4 },
    /** 灵根数由品质派生（mid 走 midSplit） */
    rootCountOf: { low: 5, high: 2, top: 1 },
    /** 灵气池：7 类均匀抽（兽/器与五行同权，不额外加权） */
    elementPool: ['metal', 'wood', 'water', 'fire', 'earth', 'beast', 'vessel']
  },

  /**
   * 子嗣修炼加成（设计 §9.1）。
   *
   * ⚠ 已**删掉「同五行 1.0」那一档**（用户决策）：设计写的是「子嗣**本命**与玩家
   *   本命的关系」，但桂冈的本命是兽 + 器（非五行），拿子嗣本命的单个 element
   *   去比对玩家的双元素集合永远为 false，这一档对当前数据是死代码。
   *   删掉后只剩三档，语义反而干净。连带 wuxing.js 的 isSameElementGroup
   *   失去唯一调用方（其注释里声明的用途就是这里）。
   */
  bonus: {
    rootCountCoef: { 5: 0.02, 4: 0.05, 3: 0.1, 2: 0.2, 1: 0.4 },
    fateFitCoef: { exact: 1.5, sameKind: 1.2, none: 0.5 },
    /** 词条系数是**加数**：系数 = 1 + Σ traitCoef（设计 §9.1 写作 +0.05 / +0.10 / +0.20） */
    traitCoef: { normal: 0.05, rare: 0.1, legend: 0.2 },
    /** 上限 +200% */
    cap: 2.0
  },

  gacha: {
    /**
     * 侍妾池单价（灵石）。比装备/灵宠池（100）贵 5 倍 ——「一位侍妾 ≈ 五件装备」。
     * ⚠ 待办：等经济双轨制上线后按原作物价重定。
     */
    maidenPrice: 500,
    /**
     * 内宅人数上限。**不要设太小**：本批没有遣散/休弃机制，设成 24 会让玩家
     * 后期想换高质量侍妾时被软锁。36 同时远高于体力上限（36 × 15 = 540 vs 145~232），
     * 所以体力仍然是真正的节流阀。
     */
    householdCap: 36,
    /** ⚠ 设计未给：抽奖出 P1/P2/P3 的权重 */
    rankWeights: { 1: 0.55, 2: 0.3, 3: 0.15 },
    /** ⚠ 设计未给：抽奖凡女的初始好感区间。刻意低于预置 8 位的 45~85 */
    affinityRange: [30, 60]
  },

  /** 本批好感静态；将来置 1 即开启「互动涨好感」 */
  affinityPerInteraction: 0
}

/** 1 游戏天 = 86400 游戏秒。全模块的时间单位统一用「游戏天」 */
export const GAME_SECONDS_PER_DAY = 86400
export const GAME_SECONDS_PER_HOUR = 3600
/** 游戏秒 → 一天里的第几小时（0-23），给晚间判定用 */
export const hourOfDay = gameSeconds =>
  Math.floor((Number(gameSeconds) || 0) / GAME_SECONDS_PER_HOUR) % 24

export const clamp01 = v => Math.min(1, Math.max(0, v))

// ---------- 位阶 ----------

export const rankCoefOf = rank => TUNING.ranks[rank] || null

/** 位阶名（未知位阶回落到「凡女」，避免读脏数据时 UI 空白） */
export const rankName = rank => RANK_NAMES[rank] || '凡女'

/**
 * 位阶晋升判定：**严格逐级、每次只升一级**，返回新的 rank，或 null 表示不晋升。
 *
 * 「严格逐级」不是洁癖，是必需的：P3 的条件（入房 = 互动过）在第 1 次互动就满足，
 * 而 P2 要互动 10 次。不逐级的话侍妾会在第 1 次互动就直接跳到 P3，
 * 「互动 10 次」这条规则形同虚设。逐级后实际路径是
 * P1 --(互动满 10 次)--> P2 --(次日)--> P3，两条规则都成立。
 *
 * 调用方（innerCourt.advanceInnerCourtDay）还要再限制「每游戏天最多升一级」。
 */
export const promotedRankOf = wife => {
  const cur = Math.floor(Number(wife?.rank) || 1)
  const next = TUNING.ranks[cur]?.promote
  if (!next) return null // 已封顶（P6）或该档不参与晋升（P7+）
  const need = next.n || 1
  switch (next.kind) {
    case 'interactions':
      return (wife.interactionCount || 0) >= need ? cur + 1 : null
    case 'firstNight':
      return (wife.interactionCount || 0) >= 1 ? cur + 1 : null
    case 'pregnancies':
      return (wife.pregnancyCount || 0) >= need ? cur + 1 : null
    case 'rootChildren':
      return (wife.rootChildrenCount || 0) >= need ? cur + 1 : null
    case 'topChildren':
      return (wife.topChildrenCount || 0) >= need ? cur + 1 : null
    default:
      return null
  }
}

// ---------- 体力 ----------

/**
 * 体力上限 = 145 + 外功加成（《睡觉恢复》§五）。
 *
 * 外功按**境界跳档**（与内功的修为曲线同构：小境界平推、跨大境界那级跳一档）：
 *
 *   炼体 一层~十层   每级 +3   → 十层  = 145 + 9×3 = 172
 *   锻骨 初~圆满     每级 +6   → 圆满  = 172 + 4×6 = 196
 *   洗髓 初~圆满     每级 +9   → 圆满  = 196 + 4×9 = 232
 *   19 级起（超级炼体）每级 +25 → 23 级 357、24 级 382（360 的临界点在这两级之间）
 *
 * ⚠ **炼体一层 = 基准 145（开局即此）**，所以加成的第一段从**第 2 级**起算。
 *   写成从 1 级起算会让开局变成 148，与《睡觉恢复》§二的验算对不上。
 *
 * 脏数据（NaN / 负数）一律按 0 级算 —— 上限只能被拉高，不能被脏数据拉低。
 */
const ENERGY_LEVEL_BONUS = [
  { from: 2, to: 10, per: 3 }, // 炼体（第 2 级起；第 1 级是基准）
  { from: 11, to: 14, per: 6 }, // 锻骨
  { from: 15, to: 18, per: 9 }, // 洗髓
  { from: 19, to: Infinity, per: 25 } // 超级炼体
]

export const energyMaxOf = bodyLevel => {
  const lv = Math.max(Math.floor(Number(bodyLevel) || 0), 0)
  let bonus = 0
  for (const seg of ENERGY_LEVEL_BONUS) {
    const top = Math.min(lv, seg.to)
    if (top >= seg.from) bonus += (top - seg.from + 1) * seg.per
  }
  return TUNING.energy.base + bonus
}

// ---------- 怀孕 ----------

export const fatherCoefOf = tier => TUNING.fatherCoef[tier] ?? TUNING.fatherCoef.mortal

/**
 * 单次互动的怀孕概率（设计 §5.3）。
 *
 * `fatigued` 由调用方按**扣完本次体力之后**的剩余值判定，保证一次会话内口径统一。
 * 这条规则的含义是：一夜之间把体力铺满（留不到 30）会让**所有人**的怀孕率掉 10% ——
 * 于是「今晚留宿几个人」本身成了决策。UI 的预览按同一个口径算，玩家勾到第 6 个时
 * 会亲眼看到前面几个的百分比一起往下掉。
 *
 * `auto` = 自动模式，额外 -5%（设计 §5.2）。
 */
export const pregnancyChanceOf = ({ affinity = 0, rank = 1, fatigued = false, auto = false } = {}) => {
  const P = TUNING.pregnancy
  const pregCoef = rankCoefOf(rank)?.pregCoef ?? 1.0
  const aff = Math.min(Math.max(Number(affinity) || 0, 0) * P.affinityScale, P.affinityCap)
  return clamp01(
    P.baseChance * pregCoef +
      aff -
      (fatigued ? P.fatiguePenalty : 0) -
      (auto ? P.autoPenalty : 0)
  )
}

/**
 * 判孕。`pity` 是**已连续未孕的次数**：达到 pityLimit - 1（= 10）时下一次必中。
 * 保底先于掷骰判定，且不吃 rng（掷骰在保底命中时不会被消耗）。
 */
export const rollPregnancy = ({ chance = 0, pity = 0, rng = Math.random } = {}) => {
  if ((Number(pity) || 0) >= TUNING.pregnancy.pityLimit - 1) return true
  return rng() < chance
}

// ---------- 自动模式的挑人规则（设计 §5.2）----------

/** 本批实现的三种规则。设计里的「优先未孕」是隐式的（候选人本来就全是待孕），「自定义顺序」留后 */
export const AUTO_RULES = ['relation', 'rank', 'robin']

/**
 * 按规则给候选侍妾排序（不改原数组）。
 *   relation —— 优先高好感
 *   rank     —— 优先高位阶，同位阶比好感
 *   robin    —— 平均分配：优先**最久没轮到的**（用 lastInteractionTime，没互动过的最先）
 */
export const sortWivesByRule = (wives = [], rule = 'relation') => {
  const list = [...wives]
  if (rule === 'rank') {
    return list.sort((a, b) => (b.rank || 0) - (a.rank || 0) || (b.affinity || 0) - (a.affinity || 0))
  }
  if (rule === 'robin') {
    return list.sort((a, b) => (a.lastInteractionTime ?? -1) - (b.lastInteractionTime ?? -1))
  }
  return list.sort((a, b) => (b.affinity || 0) - (a.affinity || 0))
}

/**
 * 自动模式挑人 —— 返回可以留宿的侍妾 id 数组。
 *
 * ⚠ **会留出 `fatigueThreshold` 点体力不用**。理由很实际：按 `pregnancyChanceOf`
 *   的口径，一夜把体力铺满（留不到 30）会让**所有人**的怀孕率掉 10% ——
 *   自动模式本该是「省心」，要是它每晚都把自己累到掉率，等于给自动模式加了一道
 *   隐形重税（还要再叠 5% 的自动惩罚）。留 30 点保底后，自动夜永远不会触发疲劳，
 *   而手动玩家仍然可以明知故犯地多留宿几位、换更低的单次概率。
 *   145 体力的开局 → 挑 7 人（花 105，正好留 40）。
 */
export const pickAutoWives = ({ wives = [], rule = 'relation', energy = 0 } = {}) => {
  const budget = Math.max((Number(energy) || 0) - TUNING.pregnancy.fatigueThreshold, 0)
  const max = Math.floor(budget / TUNING.energy.perInteraction)
  if (max <= 0) return []
  return sortWivesByRule(wives.filter(w => w.status === 'idle'), rule)
    .slice(0, max)
    .map(w => w.id)
}

// ---------- 灵根与抽卡 ----------

/**
 * 第一步：判有无灵根（设计 §6.1）。
 * 上限 100% —— P11 以上母方位阶的系数会让原始值超过 100%，必须钳制。
 */
export const rootChanceOf = ({ rank = 1, fatherTier = 'mortal', rootBonus = 0 } = {}) =>
  clamp01(
    TUNING.draw.baseRootChance * (rankCoefOf(rank)?.rootCoef ?? 0.5) * fatherCoefOf(fatherTier) +
      (Number(rootBonus) || 0)
  )

/**
 * 子嗣性别：`rng < maleChance` 为男，否则为女。
 * 独立于诞生抽卡调用（不塞进 rollOffspring），避免改变既有 rng 序列的语义。
 */
export const rollOffspringGender = (rng = Math.random) =>
  rng() < TUNING.offspring.maleChance ? 'male' : 'female'

const QUALITY_ORDER = ['low', 'mid', 'high', 'top']

/** 第二步之一：品质分布（累积扫描，区间左闭右开） */
export const rollQuality = (rng = Math.random) => {
  const r = rng()
  let acc = 0
  for (const q of QUALITY_ORDER) {
    acc += TUNING.draw.qualityDist[q]
    if (r < acc) return q
  }
  return 'top'
}

/** 品质 → 灵根数。中品在「四灵根 / 三灵根」之间按 midSplit 拆 */
export const rollRootCount = ({ quality = 'low', rng = Math.random } = {}) => {
  const D = TUNING.draw
  if (quality === 'mid') return rng() < D.midSplit.four ? 4 : 3
  return D.rootCountOf[quality] ?? 5
}

/** 从池子里不放回地抽 n 个（n 超过池子大小时取满为止） */
const pickN = (pool, n, rng) => {
  const work = [...pool]
  const out = []
  for (let i = 0; i < n && work.length; i++) {
    const idx = Math.min(Math.floor(rng() * work.length), work.length - 1)
    out.push(work.splice(idx, 1)[0])
  }
  return out
}

/** 灵气集合：从 elementPool 里不重复地抽 count 个 */
export const rollRootElements = ({ count = 1, rng = Math.random } = {}) => {
  const n = Math.max(Math.min(Math.floor(Number(count) || 1), TUNING.draw.elementPool.length), 1)
  return pickN(TUNING.draw.elementPool, n, rng)
}

/** 词条数量按品质定（设计 §6.2 的「词条」列） */
const TRAIT_SPEC = {
  low: { normal: 1, rare: 0, legend: 0 },
  mid: { normal: 0, rare: 1, legend: 0 },
  high: { normal: 0, rare: 2, legend: 0 },
  top: { normal: 0, rare: 3, legend: 1 }
}

/** 第二步之二：词条（同档内不重复） */
export const rollTraitList = ({ quality = 'low', rng = Math.random } = {}) => {
  const spec = TRAIT_SPEC[quality] || TRAIT_SPEC.low
  const out = []
  for (const grade of ['normal', 'rare', 'legend']) {
    for (const t of pickN(TRAIT_POOL[grade] || [], spec[grade] || 0, rng)) {
      out.push({ id: t.id, name: t.name, grade })
    }
  }
  return out
}

/** 第二步之三：本命（同品质池内均匀） */
export const rollFate = ({ quality = 'low', rng = Math.random } = {}) => {
  const pool = FATE_POOL[quality] || FATE_POOL.low
  return pool[Math.min(Math.floor(rng() * pool.length), pool.length - 1)]
}

/**
 * 诞生抽卡的**唯一入口** —— 两步走 + 两条保底都在这里。
 *
 * 保底优先于掷骰，且掷骰总是先执行（不短路），保证 rng 的消耗次数稳定 ——
 * 否则同一条随机序列在不同保底状态下会走到不同的分支，没法写确定性断言。
 *
 * @returns {{hasRoot, quality, rootCount, roots, fate, traits}}
 *          无灵根时 quality/rootCount/roots/fate/traits 全为空值
 */
export const rollOffspring = ({
  rank = 1,
  fatherTier = 'mortal',
  totalDraws = 0,
  pityNoRoot = 0,
  /** 英烈祠：每块牌位 +0.1% 灵根概率（《秘境系统》§六） */
  rootBonus = 0,
  rng = Math.random
} = {}) => {
  const D = TUNING.draw
  const guaranteed = D.firstChildGuaranteed && (Number(totalDraws) || 0) === 0
  const pityHit = (Number(pityNoRoot) || 0) >= D.pityRootLimit - 1
  const roll = rng()
  const hasRoot =
    guaranteed || pityHit || roll < rootChanceOf({ rank, fatherTier, rootBonus })

  if (!hasRoot) {
    return { hasRoot: false, quality: null, rootCount: 0, roots: [], fate: null, traits: [] }
  }

  const quality = rollQuality(rng)
  const rootCount = rollRootCount({ quality, rng })
  return {
    hasRoot: true,
    quality,
    rootCount,
    roots: rollRootElements({ count: rootCount, rng }),
    fate: rollFate({ quality, rng }),
    traits: rollTraitList({ quality, rng })
  }
}

// ---------- 子嗣修炼加成 ----------

/**
 * 从 practice 对象取出「玩家本命画像」，供加成判定与 verify 复用。
 * 玩家本命与灵气集合的真源在 harmony.js，这里只是整理成好传的形状。
 */
export const playerFateProfile = practice => {
  const fates = playerFates(practice)
  return {
    playerFateIds: fates.map(f => f.id),
    playerKinds: [...new Set(fates.map(f => f.kind))],
    playerElements: playerElements(practice)
  }
}

/**
 * 本命契合系数（设计 §6.3 / §9.1 的关系表）。
 * ⚠ 只有三档：「同五行」已按用户决策删除。判定顺序不可换 ——
 *   完全相同要先于同类型，否则同名本命会掉到 1.2。
 */
export const fateFitOf = ({ child, playerFateIds = [], playerKinds = [] } = {}) => {
  const B = TUNING.bonus.fateFitCoef
  const fate = child?.fate
  if (!fate) return B.none
  if (fate.id && playerFateIds.includes(fate.id)) return B.exact
  if (fate.kind && playerKinds.includes(fate.kind)) return B.sameKind
  return B.none
}

/** 单个子嗣的加成。无灵根 → 0（词条与本命都不作数） */
export const offspringBonusOf = ({ child, playerFateIds = [], playerKinds = [] } = {}) => {
  if (!child?.hasRoot) return 0
  const rootCoef = TUNING.bonus.rootCountCoef[child.rootCount] ?? 0
  const traitCoef = 1 + (child.traits || []).reduce((s, t) => s + (TUNING.bonus.traitCoef[t.grade] || 0), 0)
  return rootCoef * fateFitOf({ child, playerFateIds, playerKinds }) * traitCoef
}

/** 全部子嗣的加成之和，**末尾必须钳到上限**（满配单个 +0.90，20 个就是 +1800%） */
export const sumChildrenBonus = (children, profile = {}) => {
  // 陨落的子嗣不再提供加成（防御性过滤：调用方通常已传 livingOffspring）
  const sum = (children || [])
    .filter(c => c.status !== 'fallen')
    .reduce((s, c) => s + offspringBonusOf({ child: c, ...profile }), 0)
  return Math.min(sum, TUNING.bonus.cap)
}

// ---------- 抽奖凡女 ----------

const pickOne = (arr, rng) => arr[Math.min(Math.floor(rng() * arr.length), arr.length - 1)]

/** 按权重表抽一个键（键是位阶号，返回 number） */
const weightedPick = (weights, rng) => {
  const entries = Object.entries(weights)
  const total = entries.reduce((s, [, w]) => s + w, 0)
  const r = rng() * total
  let acc = 0
  for (const [key, w] of entries) {
    acc += w
    if (r < acc) return Number(key)
  }
  return Number(entries[entries.length - 1][0])
}

/** 随机生成一位凡女（抽奖入宅用）。落在 P1-P3，好感低于预置那 8 位 */
export const generateMaiden = ({ seq = 1, rng = Math.random } = {}) => {
  const G = TUNING.gacha
  const [lo, hi] = G.affinityRange
  return newWife({
    id: `w_${seq}`,
    name: `${pickOne(SURNAMES, rng)}${pickOne(GIVEN_NAMES, rng)}`,
    rank: weightedPick(G.rankWeights, rng),
    affinity: Math.round(lo + rng() * (hi - lo)),
    origin: 'gacha',
    sourceDetail: '抽奖所得'
  })
}

// ---------- 展示用小工具 ----------

const CN_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']

/** 阿拉伯数字 → 中文数字（子嗣命名「桂十二」用）。100 以上原样返回 */
export const cnNumeral = n => {
  const v = Math.max(Math.floor(Number(n) || 0), 0)
  if (v <= 10) return v === 10 ? '十' : CN_DIGITS[v]
  if (v < 20) return `十${CN_DIGITS[v - 10]}`
  if (v < 100) {
    const tens = Math.floor(v / 10)
    const ones = v % 10
    return `${CN_DIGITS[tens]}十${ones ? CN_DIGITS[ones] : ''}`
  }
  return String(v)
}

/**
 * 子嗣命名：桂大 / 桂二 / … / 桂十二。
 * 长子叫「大」不是「一」—— 设计 §13.3 的谱系里是「桂大、桂二、桂四」。
 */
export const offspringNameOf = (surname, seq) =>
  `${String(surname || '桂').charAt(0)}${(Math.floor(Number(seq)) || 1) === 1 ? '大' : cnNumeral(seq)}`

/**
 * 命名池（模块加载时算一次）：
 *   normal = 中性池 + 性别池，去重；
 *   easter = 掌门路彩蛋池，**剔掉与普通池重名的**（两池合并去重）。
 */
const buildNamePool = (shared, gendered, easter) => {
  const normal = [...new Set([...shared, ...gendered])]
  const normalSet = new Set(normal)
  return {
    normal,
    easter: [...new Set(easter)].filter(name => !normalSet.has(name))
  }
}

const NAME_POOLS = {
  male: buildNamePool(
    OFFSPRING_GIVEN_NAMES,
    OFFSPRING_GIVEN_NAMES_MALE,
    OFFSPRING_EASTER_EGG_NAMES.male
  ),
  female: buildNamePool(
    OFFSPRING_GIVEN_NAMES,
    OFFSPRING_GIVEN_NAMES_FEMALE,
    OFFSPRING_EASTER_EGG_NAMES.female
  )
}

/**
 * 老档子嗣没有 `gender` 字段（2026-10-18 之前）。读档时按 id+name 做 FNV-1a
 * 稳定哈希补一个 —— **不能每次刷新重掷**，否则同一名子嗣的性别会来回变。
 * 新档不走这里。
 */
export const legacyOffspringGender = child => {
  const seed = `${child?.id || ''}|${child?.name || ''}`
  let hash = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % 2 === 0 ? 'male' : 'female'
}

/**
 * 给子嗣随机起名：保留父姓（取道号第一个字），按**性别**从对应名池抽。
 *
 * 顺序（P12.6 口径）：
 *   1. 20% 走掌门路彩蛋池，否则走普通池；避开已有名字；
 *   2. 精选池抽满 60 次仍撞名 → 「字1 + 字2」组合（40 × 30 = 1,200 种）；
 *   3. 组合也撞满 → 加两位数字后缀，只作最后兜底。
 *
 * @param {string} fatherName 父方道号，取首字作姓
 * @param {{existing?: string[], rng?: () => number, gender?: 'male'|'female'}} options
 */
export const randomOffspringName = (
  fatherName = '桂',
  { existing = [], rng = Math.random, gender = 'male' } = {}
) => {
  const family = String(fatherName || '桂').charAt(0) || '桂'
  const g = gender === 'female' ? 'female' : 'male'
  const pools = NAME_POOLS[g]
  const parts = OFFSPRING_NAME_PARTS[g]
  const N = TUNING.offspring
  const taken = new Set((existing || []).map(name => String(name || '')))
  const fromPool = pool => `${family}${pickOne(pool, rng)}`

  // 1. 彩蛋 / 普通池
  const useEaster = pools.easter.length > 0 && rng() < N.easterEggRate
  const pool = useEaster ? pools.easter : pools.normal
  for (let i = 0; i < N.nameAttempts; i += 1) {
    const candidate = fromPool(pool)
    if (!taken.has(candidate)) return candidate
  }

  // 2. 组合兜底
  for (let i = 0; i < N.nameAttempts; i += 1) {
    const candidate = `${family}${pickOne(parts.first, rng)}${pickOne(parts.second, rng)}`
    if (!taken.has(candidate)) return candidate
  }

  // 3. 数字后缀（最后兜底，不保证唯一 —— 626 人也到不了这一步）
  return `${fromPool(pool)}${Math.floor(rng() * 90) + 10}`
}

/** 游戏秒 → 游戏天（从 0 开始） */
export const gameDayOf = gameSeconds => Math.floor((Number(gameSeconds) || 0) / GAME_SECONDS_PER_DAY)

/**
 * 子嗣年龄（展示用）：一年 365 天、一月 30 天，余数向下取整。
 * 只用于列表展示，不参与任何数值判定 —— 所以不进 TUNING。
 * @returns {{ totalDays:number, years:number, months:number, days:number }}
 */
export const offspringAgeOf = (birthTime, nowGameSeconds) => {
  const elapsed = (Number(nowGameSeconds) || 0) - (Number(birthTime) || 0)
  const totalDays = Math.max(Math.floor(elapsed / GAME_SECONDS_PER_DAY), 0)
  const years = Math.floor(totalDays / 365)
  const months = Math.floor((totalDays % 365) / 30)
  return {
    totalDays,
    years,
    months,
    // 余下的天数要扣掉整年 + 整月，不能直接 totalDays % 30
    days: totalDays - years * 365 - months * 30
  }
}

/** 年龄文案：X 岁 Y 月 / Y 月 / X 天（不足一月按天显示） */
export const formatOffspringAge = (birthTime, nowGameSeconds) => {
  const { totalDays, years, months, days } = offspringAgeOf(birthTime, nowGameSeconds)
  if (years > 0) return `${years} 岁 ${months} 月`
  if (months > 0) return `${months} 月`
  return `${days ?? totalDays} 天`
}

/** 距某个绝对游戏秒还有多少**天**（向上取整，已过期归 0） */
export const remainingDays = (statusEndTime, nowGameSeconds) =>
  Math.max(
    0,
    Math.ceil(((Number(statusEndTime) || 0) - (Number(nowGameSeconds) || 0)) / GAME_SECONDS_PER_DAY)
  )

/**
 * 读档归一化（P12.3）：把旧档按 **270/30 天**写下的孕育/产后到期时间，等比折算到当前的 **90/10 天**。
 *
 * 只处理「剩余时长 > 当前完整周期」的记录 —— 新档不可能超过 90 天（产后 10 天），
 * 命中它的一定是旧口径。折算保留**已过时长的比例**：
 * 旧档剩 160/270 → 新档剩 160 × (90/270) ≈ 53.3 天。
 *
 * ⚠ 逾期记录（end <= now）不折算，交给读档自愈的结生逻辑。
 * ⚠ 返回新对象；不需要改时返回原对象，调用方可用 `!==` 判断。
 */
export const normalizePregnancy = (wife, nowGameSeconds, tuning = TUNING) => {
  if (!wife) return wife
  const now = Number(nowGameSeconds) || 0
  const end = Number(wife.statusEndTime) || 0
  const P = tuning.pregnancy

  if (wife.status === 'pregnant') {
    const full = P.days * GAME_SECONDS_PER_DAY
    const remaining = end - now
    if (remaining > full) {
      const scaled = remaining * (P.days / P.legacyDays)
      return { ...wife, statusEndTime: now + scaled, pregnancyStartTime: now + scaled - full }
    }
    if (!wife.pregnancyStartTime && end > now) {
      return { ...wife, pregnancyStartTime: end - full }
    }
  }

  if (wife.status === 'recovering') {
    const full = P.recoveryDays * GAME_SECONDS_PER_DAY
    const remaining = end - now
    if (remaining > full) {
      const scaled = remaining * (P.recoveryDays / P.legacyRecoveryDays)
      return { ...wife, statusEndTime: now + scaled, recoveryStartTime: now + scaled - full }
    }
    if (!wife.recoveryStartTime && end > now) {
      return { ...wife, recoveryStartTime: end - full }
    }
  }

  return wife
}
