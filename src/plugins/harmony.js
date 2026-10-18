// 连乘契合度：修行系统的唯一真源
//
//   综合契合度 = 功法契合 × 同参契合 × 灵地契合                  每维归一到 [0,1]
//   修炼速度   = 灵地基础产出 × (0.7 + 综合契合度 × 0.6) × spiritRate
//                × 本命数量系数 × 行功带宽 × (1 + 子嗣修炼加成) × 门控补偿
//
// ⚠ **2026-10-18 起废弃三维加权**（功法×0.15 + 同参×0.50 + 灵地×0.35）。
//   连乘下任何一维短板都会把整体拉低 —— 这正是「门槛动作 = 换功法 / 换同参 / 换灵地」
//   要成立的前提。旧权重表与 `FATE_ITEM_TIER_COEFF` 已整表删除，**不要再引回来**：
//   品阶系数会把「换到更接近本命的同参」稀释成一档小加成，连乘的惩罚感就没了。
//
// 契合度是**门票**不是收益引擎：0% → 100% 只把速度从 0.98× 拉到 1.30×。
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

/** 调参集中在这里，改数值只动这一处 */
export const TUNING = {
  /** 单次累积上限（秒），供将来的离线结算模块直接传离线时长 */
  maxSecondsPerTick: 86400,

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

  /**
   * 同参亲和度**六档**（《同参系统》§3.1）。
   *
   *   正主 1.0 · 准正主 0.8 · 同系列 0.6 · 近类型 0.4 · 同类型 0.25 · 无关 0.1
   *
   * 桂冈开局五件同参按 §3.4「先硬编」全部写死为近类型 0.4（见 cultivationData.js）。
   * 判定规则**尚未实现** —— 物品上有 `affinity` 字段就用它，没有才走最粗的回落链。
   */
  fateItem: {
    affinity: {
      owner: 1.0,
      quasiOwner: 0.8,
      series: 0.6,
      nearType: 0.4,
      type: 0.25,
      none: 0.1
    }
  },

  /**
   * 灵地保底：匹配百分比再低也按 20% 算。
   * 连乘下 0 会把整个综合契合度归零，保底是给「属性不合的灵地」留一条活路；
   * 它**不是**让不匹配的灵地变好用 —— 20% 仍然会把综合压到五分之一。
   */
  spiritLand: { minFit: 0.2 },

  /**
   * 速度里的契合度项：0% → base，100% → base + span。
   *
   * 2026-10-18 连乘重构后**重新标定**：连乘的综合契合度天然比加权和小得多
   * （开局 0.5025 → 0.08），沿用旧的 0.7 + 0.6×Fit 会让开局灵力直接掉 25%。
   * 这里按「旧曲线在各阶段的实际速度」反推一条新直线：
   *
   * | 阶段 | 旧综合 → 旧因子 | 新综合 → 新因子 |
   * |---|---|---|
   * | 开局 | 0.5025 → 1.0015 | 0.08 → 1.0056 |
   * | 同系列同参 | 0.6425 → 1.0855 | 0.24 → 1.0568 |
   * | 筑基配置 | 0.7175 → 1.1305 | 0.56 → 1.1592 |
   * | 结丹配置 | 0.85 → 1.2100 | 0.80 → 1.2360 |
   * | 满配 | 1.0 → 1.3000 | 1.0 → 1.3000 |
   *
   * 新曲线与原曲线的偏差在 ±3% 以内。契合度仍然主要管**门票**，速度带宽刻意收窄
   * （0.98~1.30），防止连乘把速度曲线也一起放大。
   */
  speed: { base: 0.98, span: 0.32 },

  /**
   * **修行速度的总补偿系数 = 9.6**。它其实是两个因子乘出来的，拆开看才不糊涂：
   *
   * | 因子 | 值 | 补的是什么 |
   * |---|---|---|
   * | 门控补偿 | 24 / 10 = **2.4** | 灵力从「24 小时都在产」变成「只有练功 10 小时产」（《桂冈的一天》§十二） |
   * | 时钟补偿 | **4** | `SECONDS_PER_GAME_HOUR` 1 → 0.25，一个游戏天从 24 现实秒变成 96 现实秒 |
   *
   * 只补门控（2.4）的话，**每游戏天**产出与改造前持平，但现实节奏慢了 4 倍 ——
   * 实测就是「练气一层要 45 现实分钟」。再乘上时钟补偿，才回到改造前的现实节奏
   * （练气一层约 14 分钟）。
   *
   * 原注释（留档）：**练功门控的补偿系数**（《桂冈的一天》§十二「练功是主业」）。
   *
   * 灵力现在只在**练功**环节产出，而一天 24 小时里小循环只占 10 小时（08:00~18:00）。
   * 不补偿的话修行速度会掉到 10/24 ≈ 42%，突破时间表整体慢 2.4 倍。
   * `24 / 10 = 2.4` 的含义是：**按「默认的一天」（巡视 2h + 全练功 10h）标定，
   * 让每个游戏天的总产出与门控前持平**。
   *
   * ⚠ 这个系数是按默认天算的 —— 玩家把巡视拉长、或勾上炼体，当天练功小时数就变少，
   *   产出**真的**下降。那正是「白天怎么分配」这条取舍本身，不是 bug。
   */
  practiceGateCompensation: 9.6,

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
  // 注：原 `childrenBonus: 0` 占位常量已随模块二接入**删除**。
  // 子嗣加成的真源是 stores/modules/innerCourt.js 的 `offspringCultivationBonus`
  // （按宿主大境界的软上限，系数表在 plugins/innerCourt.js 的 TUNING.bonus）。
  // 这里不留常量：一个没人读、却与那个 getter 名字近似的数，早晚会被误加进公式。

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

// ---------- 三个维度 ----------

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
 * 例外：功法可以带 `baseFit` 直接写死基础值（吕氏练气次第论 = 0.38）。
 * 那是原著「散功重修、按次第破境」的路线，不是品阶分能解释的 ——
 * 练气篇的品阶分只有 0.20，而吕氏必须在 0 熟练度时就能过练气三层。
 *
 * 拆成好处是 verify 脚本能用合成功法覆盖「品阶/覆盖率」的每一种组合
 * （§7.3 里的「金丹级部分匹配」在现有数据里还不存在）。
 */
export const qiArtHarmonyOf = (art, entry, practice) => {
  if (!art || !entry) return 0
  const base =
    art.baseFit ??
    (TUNING.qiArt.gradeScore[art.grade] ?? TUNING.qiArt.gradeScore.qi) +
      TUNING.qiArt.coverageScale * artCoverage(art, playerElements(practice))
  return clamp01(base + qiArtProficiency(entry))
}

export const calcQiArtHarmony = practice => {
  const id = practice?.qiArts?.active
  return qiArtHarmonyOf(QI_ART_MAP[id], practice?.qiArts?.known?.[id], practice)
}

/** 亲和档位 → 系数。未知档位按「无关」兜底，避免脏数据把连乘变成 NaN */
export const affinityCoeffOf = tier => TUNING.fateItem.affinity[tier] ?? TUNING.fateItem.affinity.none

/**
 * 同参与某个本命的亲和档位。
 *
 * ⚠ **判定规则暂不实现**（《同参系统》§3.4「先硬编」）：
 *   1. 物品上有 `affinity` 字段 → 直接用它（桂冈开局五件 = 'nearType'）；
 *   2. 没有才走最粗的回落链：正主 → 同系列 → 近类型（同 kind）→ 无关。
 *
 * 「准正主」与「同类型」这两档**至今没有判定规则**，只能靠 `affinity` 显式标注。
 * 等物品池打上标签（§十一）再统一迁移，别在这里临时加名字/品类比较。
 */
export const affinityTierOf = (item, fate) => {
  if (!item) return 'none'
  if (item.affinity && TUNING.fateItem.affinity[item.affinity] !== undefined) return item.affinity
  if (!fate) return 'none'
  if (item.bondFateId && item.bondFateId === fate.id) return 'owner'
  if (item.series && item.series === fate.series) return 'series'
  if (item.kind && item.kind === fate.kind) return 'nearType'
  return 'none'
}

/** 单个本命下的亲和系数（旧名字保留，供 UI / 断言读） */
export const proximityVs = (item, fate) => affinityCoeffOf(affinityTierOf(item, fate))

/** 取与本命集合中最优的那一档（用于 UI 展示接近度） */
export const proximityOf = (item, practice) =>
  playerFates(practice).reduce((best, fate) => Math.max(best, proximityVs(item, fate)), TUNING.fateItem.affinity.none)

/**
 * 同参契合 = 六档亲和系数。**不再乘品阶系数，也不再被本命品阶封顶。**
 *
 * 多本命时逐个本命判档、取最高的那一档。
 * 不含熟练度、不含祭炼 —— 同参不能升级，只能更换。
 */
export const fateItemHarmonyOf = (item, practice) => {
  if (!item) return 0
  const fates = playerFates(practice)
  if (!fates.length) return TUNING.fateItem.affinity.none
  let best = 0
  for (const fate of fates) best = Math.max(best, affinityCoeffOf(affinityTierOf(item, fate)))
  return clamp01(best)
}

export const calcFateItemHarmony = practice => {
  const id = practice?.fateItems?.active
  if (!practice?.fateItems?.known?.[id]) return 0
  return fateItemHarmonyOf(FATE_ITEM_MAP[id], practice)
}

/**
 * 灵地契合 = max(匹配百分比, 0.2)。
 *
 * 保底是连乘的必要件：0 会把综合契合度整个归零，玩家换错灵地后连「还差多少」
 * 都看不出来。灵地品阶仍然只管基础产出，**不进契合度**。
 */
export const calcSpiritLandHarmony = practice => {
  const land = SPIRIT_LAND_MAP[practice?.spiritLand?.current]
  if (!land) return 0
  return Math.max(landFit(land, playerElements(practice)), TUNING.spiritLand.minFit)
}

/** 连乘 + 综合 */
export const calcHarmony = practice => {
  const qiArt = calcQiArtHarmony(practice)
  const fateItem = calcFateItemHarmony(practice)
  const spiritLand = calcSpiritLandHarmony(practice)
  return { qiArt, fateItem, spiritLand, total: qiArt * fateItem * spiritLand }
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
/**
 * 灵力**每游戏小时**的产出（`practice.js` 的 `spiritPerGameHour` getter 是它的转发）。
 *
 * ⚠ 单位是**游戏小时**不是现实秒 —— 原因见 `core.gainSpirit`。
 * ⚠ 末尾乘了 `practiceGateCompensation`：灵力只在练功环节产出，这个系数把它补回原节奏。
 */
export const spiritPerSecondOf = ({
  landOutput: output = 0,
  fitFactor = 0,
  spiritRate = 1,
  fateCoef = 1,
  bandwidth = 1,
  childrenBonus = 0
} = {}) => output * fitFactor * spiritRate * fateCoef * bandwidth * (1 + childrenBonus) * TUNING.practiceGateCompensation

// ---------- 预览：换成另一件之后该维度会变成多少 ----------
// 切换器的信息核心 —— 让玩家在**切换之前**就看出会变好还是变坏，而不是切完才发现。
// 纯函数，不碰 store。

export const previewQiArtHarmony = (practice, id) =>
  calcQiArtHarmony({ ...practice, qiArts: { ...practice.qiArts, active: id } })

export const previewFateItemHarmony = (practice, id) =>
  calcFateItemHarmony({ ...practice, fateItems: { ...practice.fateItems, active: id } })

export const previewSpiritLandHarmony = (practice, id) =>
  calcSpiritLandHarmony({ ...practice, spiritLand: { ...practice.spiritLand, current: id } })
