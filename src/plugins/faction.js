// 【飞鹰门】—— 贡献点 / 周任务 / 秘库货架的数值真源（纯数据 + 纯函数）
//
// 真源：
//   任务刷新与奖励 —— 《模块五》§13.1 / §13.2.1（2026-10-30 #04「最小子集」）
//   贡献点月产 690 —— 《数值真值表》§6.4c
//   秘库两栏 / 限购 / 手动刷新 / 老九订货 —— 《模块五》§13.3.3（2026-10-30 #03）
//   解锁 —— 《模块解锁方针》§五（内政：练气六层 + 乡侯府 Lv.1；秘库：练气八层）
//
// 本文件只做**纯计算**：这周该刷哪几个模板、奖励多少、够不够接、货架怎么摆。
// 谁进背包、谁扣贡献点、谁占子嗣，全在 `stores/modules/faction.js`。
//
// 2026-10-30 第一批只落「贡献点 + 周任务 + 秘库货架」，**官位 / 内政 / 俸禄不做**
// （留给 B8 剩余）。所以本文件里没有任何职位、升迁、月俸字段。

/**
 * ⚠ **飞鹰门用「现实秒」记账，不用游戏秒**（2026-10-30 定，用户提出的问题）。
 *
 * 原因：筑基后时钟 24×（4 现实秒 = 1 游戏天），而飞鹰门是**玩家操作驱动**的系统
 * （接任务 / 点交付 / 刷货架）。若跟着游戏日历走，筑基后一游戏周 = 28 现实秒、
 * 一游戏月 = 2 现实分钟 ⇒ 690 贡献点/2 分钟、秘库白送。
 *
 * 锚点 = **练气期基准 96 现实秒/游戏天**：
 *   1 游戏天 = 96 现实秒 · 1 周 = 11.2 现实分钟 · 1 月 = 48 现实分钟，**跨境界不变**。
 * 练气期（1:1）下这个换算是恒等变换，玩家感受到的数值与设计表完全一致。
 */
export const FACTION_SECONDS_PER_DAY = 96

/** 现实秒累计的上限：与离线上限 180 游戏天 × 96 秒同量级（≈4.8 现实小时） */
export const FACTION_MAX_REAL_STEP_SECONDS = 180 * FACTION_SECONDS_PER_DAY

export const FACTION_TUNING = {
  /** 贡献点奖励：固定不随难度浮动（《模块五》§13.2.1） */
  contribution: { normal: 30, hard: 100 },
  /** 同时最多接 3 个（含普通与困难） */
  maxAccepted: 3,
  /** 普通 3 个/游戏周（交物品 / 杀怪 / 驻扎 各 1） */
  normalPerWeek: 3,
  /** 困难 3 个/游戏月（4 个模板随机抽 3） */
  hardPerMonth: 3,
  /** 驻扎子嗣门槛 = 练气二层（与出战门槛同口径） */
  garrisonMinRealmLevel: 2,
  /** 杀怪任务扣 1 游戏天 */
  combatDays: 1,
  daysPerWeek: 7,
  /** 内政解锁：练气六层 + 乡侯府 Lv.1 */
  unlock: { innerLevel: 6, building: 'manor', buildingLevel: 1 },
  /** 秘库解锁：练气八层（2026-10-30 A1 改，不再随内政解锁） */
  vaultUnlockInnerLevel: 8,
  /** 秘库：月刷 3~4 件 */
  vaultRefresh: { min: 3, max: 4 },
  /** 秘库：手动刷新当月价格序列，下月重置 */
  vaultManualRefreshCosts: [50, 100, 200, 400],
  /** 老九订货：400 点 + 1 游戏月 */
  broker: { cost: 400, delayMonths: 1, poolMin: 5, poolMax: 10, tagChoices: 5 },
  /** 同参底材栏：每段 10~12 件、限购 1 件/月/段 */
  vaultMaterials: { perSectionMin: 10, perSectionMax: 12, limitPerMonth: 1 }
}

// ==================== 任务模板 ====================

/**
 * 模板池（《模块五》§13.2.1）。
 *
 * `bond` 只用于展示「这是哪一类」；`tierMin/tierMax` 是**交物品**的要求，
 * 由 `collectRequirementOf` 按主角境界段放大（§13.1「动态难度」）。
 *
 * `dungeonDifficulty` = 杀怪任务折算的秘境难度，Boss 层固定第 5 层
 * （「固定 5 层微型副本，第 5 层 Boss 即完成」—— 前 4 层视为清场，只打 Boss，
 * 不做逐层血量继承。这是本批的 MVP 口径，别当成「5 层只打了 1 层」的 bug）。
 */
export const TASK_TEMPLATES = [
  // —— 普通 · 交物品（每游戏周 1 个）——
  {
    id: 'gather_herb',
    kind: 'collect',
    difficulty: 'normal',
    name: '收药',
    category: '灵植',
    countMin: 3,
    countMax: 8
  },
  {
    id: 'gather_material',
    kind: 'collect',
    difficulty: 'normal',
    name: '收材',
    category: '灵材',
    countMin: 3,
    countMax: 8
  },
  {
    id: 'gather_artifact',
    kind: 'collect',
    difficulty: 'normal',
    name: '收器',
    category: '灵器',
    countMin: 1,
    countMax: 2
  },
  // —— 普通 · 杀怪（每游戏周 1 个）——
  {
    id: 'hunt_beast',
    kind: 'combat',
    difficulty: 'normal',
    name: '清剿兽群',
    powerMin: 200,
    powerMax: 400,
    dungeonDifficulty: 1
  },
  {
    id: 'hunt_bandit',
    kind: 'combat',
    difficulty: 'normal',
    name: '清剿劫修',
    powerMin: 300,
    powerMax: 500,
    dungeonDifficulty: 2
  },
  {
    id: 'patrol_pass',
    kind: 'combat',
    difficulty: 'normal',
    name: '巡逻山口',
    powerMin: 250,
    powerMax: 450,
    dungeonDifficulty: 1
  },
  // —— 普通 · 驻扎（每游戏周 1 个）——
  {
    id: 'guard_gate',
    kind: 'garrison',
    difficulty: 'normal',
    name: '驻守山门',
    minCount: 1,
    maxCount: 3,
    daysMin: 5,
    daysMax: 7
  },
  {
    id: 'patrol_border',
    kind: 'garrison',
    difficulty: 'normal',
    name: '巡视边境',
    minCount: 2,
    maxCount: 3,
    daysMin: 7,
    daysMax: 10
  },
  {
    id: 'escort_caravan',
    kind: 'garrison',
    difficulty: 'normal',
    name: '护送商队',
    minCount: 1,
    maxCount: 2,
    daysMin: 3,
    daysMax: 5
  },
  // —— 困难 · 杀怪（每游戏月从 4 个模板抽 3）——
  {
    id: 'slay_beast_lord',
    kind: 'combat',
    difficulty: 'hard',
    name: '讨伐妖兽头目',
    powerMin: 700,
    powerMax: 900,
    dungeonDifficulty: 3
  },
  {
    id: 'raid_nest',
    kind: 'combat',
    difficulty: 'hard',
    name: '清剿巢穴',
    powerMin: 800,
    powerMax: 1000,
    dungeonDifficulty: 4
  },
  {
    id: 'snipe_elite',
    kind: 'combat',
    difficulty: 'hard',
    name: '截杀精英',
    powerMin: 750,
    powerMax: 950,
    dungeonDifficulty: 3
  },
  {
    id: 'explore_ruin',
    kind: 'combat',
    difficulty: 'hard',
    name: '探索遗迹',
    powerMin: 900,
    powerMax: 1200,
    dungeonDifficulty: 5
  }
]

export const TEMPLATE_MAP = Object.fromEntries(TASK_TEMPLATES.map(t => [t.id, t]))

/** 普通模板按 kind 分组 —— 每周每种各刷 1 个 */
export const NORMAL_TEMPLATES_BY_KIND = {
  collect: TASK_TEMPLATES.filter(t => t.difficulty === 'normal' && t.kind === 'collect'),
  combat: TASK_TEMPLATES.filter(t => t.difficulty === 'normal' && t.kind === 'combat'),
  garrison: TASK_TEMPLATES.filter(t => t.difficulty === 'normal' && t.kind === 'garrison')
}

export const HARD_TEMPLATES = TASK_TEMPLATES.filter(t => t.difficulty === 'hard')

// ==================== 时间键 ====================

/** 周序号（0 起）：每 7 「飞鹰门天」一周，与「月 = 30 天」不对齐 */
export const weekIndexOf = factionSeconds =>
  Math.floor(
    Math.max(Number(factionSeconds) || 0, 0) / (FACTION_SECONDS_PER_DAY * FACTION_TUNING.daysPerWeek)
  )

/** 月序号（0 起） */
export const monthIndexOf = factionSeconds =>
  Math.floor(Math.max(Number(factionSeconds) || 0, 0) / (FACTION_SECONDS_PER_DAY * 30))

/** 某难度任务该挂在哪个时间键上（普通看周、困难看月） */
export const keyOfTask = (difficulty, factionSeconds) =>
  difficulty === 'hard' ? monthIndexOf(factionSeconds) : weekIndexOf(factionSeconds)

/** 下一个刷新点（飞鹰门秒）：普通任务用周、困难任务与秘库用月 */
export const nextWeekStartOf = factionSeconds => {
  const now = Math.max(Number(factionSeconds) || 0, 0)
  const unit = FACTION_SECONDS_PER_DAY * FACTION_TUNING.daysPerWeek
  return (Math.floor(now / unit) + 1) * unit
}

export const nextMonthStartOf = factionSeconds => {
  const now = Math.max(Number(factionSeconds) || 0, 0)
  const unit = FACTION_SECONDS_PER_DAY * 30
  return (Math.floor(now / unit) + 1) * unit
}

/**
 * 距离下一次刷新还有多少秒（UI 倒计时用）。
 * **普通任务看周、困难任务与秘库月刷看月** —— 三条倒计时是两个不同的周期。
 */
export const refreshRemainingOf = (difficulty, factionSeconds) =>
  difficulty === 'hard'
    ? Math.max(nextMonthStartOf(factionSeconds) - (Number(factionSeconds) || 0), 0)
    : Math.max(nextWeekStartOf(factionSeconds) - (Number(factionSeconds) || 0), 0)

// ==================== 抽模板 ====================

const pick = (list, rng) => list[Math.min(Math.floor(rng() * list.length), list.length - 1)]
const randInt = (min, max, rng) => min + Math.min(Math.floor(rng() * (max - min + 1)), max - min)

/**
 * 境界段（1 练气 / 2 筑基 / 3 结丹 / 4 元婴）—— 只用来放大交物品的阶位要求，
 * **不参与奖励与刷新**。与 `shop.js` 的宝匣 `unlockLevel` 用同一组等级边界。
 */
export const realmSectionOf = innerLevel => {
  const level = Math.floor(Number(innerLevel)) || 1
  if (level >= 19) return 4
  if (level >= 15) return 3
  if (level >= 11) return 2
  return 1
}

/**
 * 交物品要求（动态难度）：阶位跟着主角当前境界段走。
 * 练气段 = 一~二阶、筑基段 = 二~三阶……**不要求上一段拿不到的东西**。
 */
export const collectRequirementOf = (template, innerLevel, rng = Math.random) => {
  const section = realmSectionOf(innerLevel)
  const tierMin = Math.min(section, 5)
  const tierMax = Math.min(section + 1, 5)
  return {
    category: template.category,
    tierMin,
    tierMax,
    count: randInt(template.countMin, template.countMax, rng)
  }
}

const buildTask = (template, { rng, nowSeconds, id }) => {
  const difficulty = template.difficulty
  const days =
    template.kind === 'combat'
      ? FACTION_TUNING.combatDays
      : template.kind === 'garrison'
        ? randInt(template.daysMin, template.daysMax, rng)
        : 0
  const task = {
    id,
    templateId: template.id,
    kind: template.kind,
    difficulty,
    name: template.name,
    reward: FACTION_TUNING.contribution[difficulty],
    days,
    key: keyOfTask(difficulty, nowSeconds),
    status: 'open',
    acceptedAt: 0,
    dueAt: 0,
    assignees: [],
    /** 交物品：接受时快照要求，避免境界涨了旧任务跟着变 */
    requirements: null
  }
  if (template.kind === 'collect') {
    // 模板值先记下，接受时再按当时境界段定阶（见 store 的 acceptTask）
    task.requirements = {
      category: template.category,
      tierMin: 1,
      tierMax: 2,
      count: randInt(template.countMin, template.countMax, rng),
      dynamic: true
    }
  } else if (template.kind === 'garrison') {
    task.requirements = {
      count: randInt(template.minCount, template.maxCount, rng),
      minRealmLevel: FACTION_TUNING.garrisonMinRealmLevel
    }
  } else {
    task.requirements = { dungeonDifficulty: template.dungeonDifficulty }
  }
  return task
}

/**
 * 本期的任务池：**只算「应该存在哪几条」**，保留哪条由调用方决定。
 *
 * @param {'normal'|'hard'} difficulty
 * @param {{ rng?: Function, nowSeconds?: number, startId?: number, exclude?: string[] }} opts
 *   `exclude` = 已被接取/已完成的模板 id（「已接或已完成的任务不再刷新」）
 * @returns {Array} 新任务
 */
export const rollTasksOf = (difficulty, opts = {}) => {
  const { rng = Math.random, nowSeconds = 0, startId = 1, exclude = [] } = opts
  const picked = []
  if (difficulty === 'hard') {
    // 4 个模板抽 3：洗牌后按顺序取，跳过被排除的
    const pool = HARD_TEMPLATES.filter(t => !exclude.includes(t.id))
    const shuffled = [...pool]
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    picked.push(...shuffled.slice(0, FACTION_TUNING.hardPerMonth))
  } else {
    for (const kind of ['collect', 'combat', 'garrison']) {
      const pool = NORMAL_TEMPLATES_BY_KIND[kind].filter(t => !exclude.includes(t.id))
      if (pool.length) picked.push(pick(pool, rng))
    }
  }
  let id = startId
  return picked.map(template =>
    buildTask(template, { rng, nowSeconds, id: `task-${id++}` })
  )
}

// ==================== 任务判定 ====================

/** 一条任务此刻该不该留在货架上（过期未接的自动消失） */
export const isTaskExpired = (task, nowSeconds) => {
  if (!task || task.status !== 'open') return false
  return keyOfTask(task.difficulty, nowSeconds) !== task.key
}

/**
 * 背包里满足「交物品」要求的合计件数。
 * `items` 是**条目数组**（灵植/灵材是堆叠条目，带 `count`）—— 按件算见 `unitsOf`。
 */
export const countCollectMatches = (items = [], requirements, unitsOf) => {
  if (!requirements) return 0
  const { category, tierMin, tierMax } = requirements
  let total = 0
  for (const item of items) {
    if (!item || item.category !== category) continue
    const tier = Number(item.tier) || 0
    if (tier < tierMin || tier > tierMax) continue
    // 堆叠条目（灵植 / 灵材）一条带 count，件数真源在 stacks.js —— 这里只累加件数
    total += typeof unitsOf === 'function' ? unitsOf(item) : 1
  }
  return total
}

/** 驻扎人选是否合格：活着 + 境界够 + 没被别的活占着 */
export const isGarrisonCandidate = (child, task, { isAlive } = {}) => {
  if (!child) return false
  if (typeof isAlive === 'function' && !isAlive(child)) return false
  const level = Number(child.realmLevel) || 1
  const need = task?.requirements?.minRealmLevel ?? FACTION_TUNING.garrisonMinRealmLevel
  if (level < need) return false
  // 家族工作 / 历练 / 秘境出战 / 其它任务 都算占用（《模块五》§12.1 #13）
  if (child.job) return false
  if (child.expeditionMode && child.expeditionMode !== 'cultivate') return false
  if (child.factionTaskId) return false
  return true
}

/** 任务的预计完成时刻（**飞鹰门秒** = 现实秒，1 天 = 96 秒） */
export const taskDueAtOf = (acceptedAt, days) =>
  (Number(acceptedAt) || 0) + (Math.max(Number(days) || 0, 0) * FACTION_SECONDS_PER_DAY)

/** 任务的剩余秒数（负数按 0） */
export const taskRemainingSecondsOf = (task, nowSeconds) =>
  Math.max((Number(task?.dueAt) || 0) - (Number(nowSeconds) || 0), 0)

// ==================== 秘库货架 ====================

/**
 * 同参底材栏卖哪两阶：**当前段 + 下一段，不卖上一段**（《模块五》§13.3.3）。
 *
 * 段 ↔ 阶：练气 = 一阶、筑基 = 二阶、结丹 = 三阶、元婴 = 四阶。
 * 所以「当前段 + 下一段」= `[section, section + 1]`，但**练气段是唯一的例外**：
 * 一阶自己能打到，秘库只挂二阶（过筑基槛用的那档）。
 *
 * | 境界段 | 卖 | 例 |
 * |---|---|---|
 * | 练气 | 二阶 | 8 层 → 2 |
 * | 筑基 | 二阶 + 三阶 | 12 层 → 2,3 |
 * | 结丹 | 三阶 + 四阶 | 16 层 → 3,4 |
 * | 元婴 | 四阶 + 五阶 | 20 层 → 4,5 |
 */
export const materialTiersOf = innerLevel => {
  const section = realmSectionOf(innerLevel)
  // 练气段只挂二阶这一档；其余段是「本段 + 下一段」
  if (section <= 1) return [2]
  return [section, Math.min(section + 1, 5)].filter((t, i, arr) => arr.indexOf(t) === i)
}

/**
 * **功法栏**的随机范围：练气 = 一 + 二阶心法、筑基 = 二 + 三阶、结丹 = 三 + 四阶、元婴 = 四阶。
 *
 * ⚠ 和**底材栏**不是同一条线（`materialTiersOf`）：底材栏「不卖上一段」，
 * 练气段只挂二阶；功法栏要把**本段也挂上**，否则《万兽御器经》（二阶）之外的
 * 练气心法永远刷不到。两条线别合并。
 */
export const artTiersOf = innerLevel => {
  const section = realmSectionOf(innerLevel)
  return [section, Math.min(section + 1, 4)].filter((t, i, arr) => arr.indexOf(t) === i)
}

/**
 * 每段该摆多少件：10~12（数量随机、**名单不确定**）。
 */
export const materialCountOf = (rng = Math.random) => {
  const { perSectionMin, perSectionMax } = FACTION_TUNING.vaultMaterials
  return randInt(perSectionMin, perSectionMax, rng)
}

/** 当月第 n 次手动刷新的价格（n 从 1 起）；超出序列按最后一档 */
export const manualRefreshCostOf = timesUsed => {
  const costs = FACTION_TUNING.vaultManualRefreshCosts
  if (!costs.length) return 0
  const idx = Math.min(Math.max(Math.floor(Number(timesUsed) || 0), 0), costs.length - 1)
  return costs[idx]
}

/**
 * 功法品阶 = 境界段（一阶练气 / 二阶筑基 / 三阶结丹 / 四阶元婴）。
 * 现库 `QI_ARTS` 只有 `grade`（qi / foundation / core），**没有 `tier` 字段** ——
 * 功法库 90 本落盘时会补上；在那之前按 grade 派生，落盘后这里换成读 `tier` 即可。
 */
export const artTierOf = art => {
  const grade = art?.grade || 'qi'
  if (grade === 'foundation') return 2
  if (grade === 'core') return 3
  if (grade === 'nascent') return 4
  return 1
}

/** 功法栏单件价：200~300 点（《数值真值表》§6.4c） */
export const artPriceOf = (art, rng = Math.random) =>
  randInt(200, 300, rng)

/** 同参底材单件价：二阶 200~300，每高一阶 +50（按阶递增，封顶 400） */
export const materialPriceOf = (base, rng = Math.random) => {
  const tier = Math.max(Number(base?.tier) || 2, 2)
  return randInt(200, 300, rng) + (tier - 2) * 50
}

/**
 * 功法栏货架：按境界段**全随机**、**排除已学会的**、不保底。
 * 池子很小的时候（如今只有 8 本）可能出现「只有 1 本可刷」——这是数据量问题，
 * 功法库 90 本落盘后自然变宽，不是 bug。
 */
export const rollVaultArts = ({
  arts = [],
  knownIds = [],
  innerLevel = 1,
  count = 3,
  rng = Math.random,
  startId = 1
} = {}) => {
  const tiers = artTiersOf(innerLevel)
  const pool = arts.filter(
    art => art && !knownIds.includes(art.id) && tiers.includes(artTierOf(art))
  )
  const shuffled = [...pool]
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  let id = startId
  return shuffled.slice(0, Math.max(Math.floor(count) || 0, 0)).map(art => ({
    id: `vault-art-${id++}`,
    artId: art.id,
    price: artPriceOf(art, rng),
    sold: false
  }))
}

/**
 * 同参底材栏：按**两个本命**的标签算契合度、取较高值降序，取前 N 件。
 *
 * 「契合度与阶位无关；阶位只决定哪一段能拿到」（《模块五》§13.3.3）——
 * 所以先按段筛阶位，再按契合度排序。
 *
 * @param {{ pool: Array, masters: string[], innerLevel: number, count: number,
 *   harmonyOf: (item, masters: string[]) => number, rng?: Function, startId?: number }} opts
 */
export const rollVaultMaterials = ({
  pool = [],
  masters = [],
  innerLevel = 1,
  count = 10,
  harmonyOf,
  rng = Math.random,
  startId = 1
} = {}) => {
  const tiers = materialTiersOf(innerLevel)
  const candidates = pool.filter(item => item && tiers.includes(Number(item.tier)))
  const scored = candidates.map(item => ({
    item,
    fit: typeof harmonyOf === 'function' ? harmonyOf(item, masters) : 0,
    // 同契合度时用 id 做稳定次序，避免每次刷新顺序抖动
    id: item.id
  }))
  scored.sort((a, b) => (b.fit - a.fit) || a.id.localeCompare(b.id))
  let id = startId
  return scored.slice(0, Math.max(Math.floor(count) || 0, 0)).map(({ item }) => ({
    id: `vault-mat-${id++}`,
    baseId: item.id,
    price: materialPriceOf(item, rng),
    sold: false
  }))
}

/**
 * 老九订货的暗池：5~10 件高阶底材，其中**保底 1~2 件高契合**（标签高度重合）。
 * 暗池只存在存档里，UI 只看得到 `brokerTagsOf` 亮出来的 4~5 个标签。
 */
export const rollBrokerPool = ({
  pool = [],
  masters = [],
  innerLevel = 1,
  harmonyOf,
  rng = Math.random
} = {}) => {
  const tiers = materialTiersOf(innerLevel)
  const candidates = pool.filter(item => item && tiers.includes(Number(item.tier)))
  const scored = candidates
    .map(item => ({ item, fit: typeof harmonyOf === 'function' ? harmonyOf(item, masters) : 0 }))
    .sort((a, b) => (b.fit - a.fit) || a.item.id.localeCompare(b.item.id))
  const { poolMin, poolMax } = FACTION_TUNING.broker
  const size = randInt(poolMin, poolMax, rng)
  // 保底：契合度最高的 1~2 件先进暗池，其余随机补满
  const guaranteed = scored.slice(0, Math.min(2, scored.length))
  const rest = scored.slice(guaranteed.length)
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  const picked = [...guaranteed, ...rest.slice(0, Math.max(size - guaranteed.length, 0))]
  return picked.map(entry => entry.item.id)
}

/** 暗池亮给玩家的 4~5 个标签（顶层词优先，不够再用中层词补） */
export const brokerTagsOf = (poolIds = [], tagsOf, cap = FACTION_TUNING.broker.tagChoices) => {
  const high = []
  const mid = []
  for (const id of poolIds) {
    const tags = typeof tagsOf === 'function' ? tagsOf(id) : null
    for (const word of tags?.high || []) if (!high.includes(word)) high.push(word)
    for (const word of tags?.mid || []) if (!mid.includes(word)) mid.push(word)
  }
  return [...high, ...mid].slice(0, Math.max(Math.floor(cap) || 0, 0))
}

/**
 * 老九带货：按选定标签在暗池里**加权抽取**（选中标签权重极高），带回 1~2 件。
 * @returns {string[]} 底材 id 列表
 */
export const brokerDrawOf = (poolIds = [], chosenTag, tagsOf, rng = Math.random) => {
  const weightOf = id => {
    const tags = typeof tagsOf === 'function' ? tagsOf(id) : null
    if (!chosenTag) return 1
    if ((tags?.high || []).includes(chosenTag)) return 8
    if ((tags?.mid || []).includes(chosenTag)) return 4
    if ((tags?.low || []).includes(chosenTag)) return 2
    return 1
  }
  const pool = [...poolIds]
  const picked = []
  const n = Math.min(randInt(1, 2, rng), pool.length)
  for (let i = 0; i < n; i += 1) {
    const weights = pool.map(weightOf)
    const total = weights.reduce((sum, w) => sum + w, 0)
    let roll = rng() * total
    let idx = pool.length - 1
    for (let k = 0; k < pool.length; k += 1) {
      roll -= weights[k]
      if (roll <= 0) {
        idx = k
        break
      }
    }
    picked.push(pool[idx])
    pool.splice(idx, 1)
  }
  return picked
}
