// 【封地经营】模块四 · MVP —— 纯函数层（无副作用，可被 node 直接加载跑断言）
//
// 真源：《模块四-封地经营》v1.2 §2/§4/§5/§十 · 《数值真值表》§6.8 ·
//       《下一步》P38（骨架）+ B0 A3（4 建筑 / 3 条进度条 / 告急关停）。
//
// 这一层只算数：建筑表、民心系数、徭役满足率、报价、单日推进。
// 入账 / 落盘 / 日志写在哪由 `stores/modules/estate.js` 决定。
//
// ⚠ 三条硬口径（改之前先读）：
//   1. **MVP 只有 4 个可建建筑**：乡侯府（初始）/ 灵田 / 迅风鸦巢舍 / 亭卫。
//      其余 12 种的数据照写进表里，`mvp:false` ⇒ 科技树灰显，不提供建造按钮。
//   2. **只有 3 类进度条**：建设 / 征收 / 产出。政策条与情报条已砍（B0 A3），
//      告急在 MVP 关停 —— 所以鸦巢舍 / 亭卫的效果**没有结算对象**，属预期行为。
//   3. **钱是一阶灵石整数**（`currency.spiritual`）。设计表的成本单位是**二阶**，
//      这里统一 `× 100` 转成一阶再结算；税收进 `currency.secular`（大子）。

import { GAME_SECONDS_PER_DAY as DAY } from './innerCourt.js'

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback)
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)

/** 一游戏天的秒数（与日常循环 / 内宅同源） */
export const GAME_SECONDS_PER_DAY = DAY

// ---------- 建筑表（数据驱动，16 种；MVP 前 4 个可建） ----------

/**
 * 字段说明：
 *   id          稳定标识（存档里的键，**不要改**）
 *   name        显示名
 *   maxLevel    等级上限
 *   weight      成本 / 工期权重（同时乘成本与工期 ⇒ **月供不随权重变**，§10.4）
 *   mvp         是否在 MVP 可建
 *   initial     是否开局即有（只有乡侯府）
 *   effectText  效果文案（效果是否生效看 `effect.type`，MVP 里只有 manor 生效）
 *   produces    产出 `{ key, perLevel }`：`key` 对应货币键或资源键
 *   unlockText  未开放时的解锁说明（科技树灰显用）
 */
export const BUILDINGS = [
  {
    id: 'manor',
    name: '乡侯府',
    maxLevel: 5,
    weight: 1.2,
    mvp: true,
    initial: true,
    effect: { type: 'morale', perLevel: 5 },
    effectText: '民心基准 +5/级（每级另加快回基准 2/天）',
    produces: null,
    unlockText: ''
  },
  {
    id: 'relay',
    name: '长岭驿',
    maxLevel: 5,
    weight: 0.9,
    mvp: false,
    initial: false,
    effect: { type: 'intel', perLevel: 1 },
    effectText: '情报 +1/天/级（情报条已砍，进 MVP 无结算对象）',
    produces: null,
    unlockText: '等情报 / 告急系统上线'
  },
  {
    id: 'woodcutter',
    name: '快子峰木屋',
    maxLevel: 3,
    weight: 1.0,
    mvp: false,
    initial: false,
    effect: { type: 'cultivationSpeed', perLevel: 0.15 },
    effectText: '修行速度 +15%/级',
    produces: null,
    unlockText: '老四修建（未开放）'
  },
  {
    id: 'beacon',
    name: '烽火台',
    maxLevel: 3,
    weight: 0.7,
    mvp: false,
    initial: false,
    effect: { type: 'warning', perLevel: 0.1 },
    effectText: '预警范围 +10km/级',
    produces: null,
    unlockText: '老四修建（未开放）'
  },
  {
    id: 'rookery',
    name: '迅风鸦巢舍',
    maxLevel: 3,
    weight: 0.7,
    mvp: true,
    initial: false,
    effect: { type: 'intelSpeed', perLevel: 0.2 },
    effectText: '情报传递速度 +20%/级（情报/告急系统上线后生效）',
    produces: null,
    unlockText: ''
  },
  {
    id: 'farm',
    name: '灵田',
    maxLevel: 5,
    weight: 0.9,
    mvp: true,
    initial: false,
    effect: { type: 'produce', perLevel: 10 },
    effectText: '一阶灵石 +10/天/级（乘民心系数）',
    produces: { key: 'spiritual', perLevel: 10 },
    unlockText: ''
  },
  {
    id: 'herbGarden',
    name: '药圃',
    maxLevel: 5,
    weight: 0.8,
    mvp: false,
    initial: false,
    effect: { type: 'produce', perLevel: 5 },
    effectText: '灵植 +5/天/级',
    produces: { key: 'herbs', perLevel: 5 },
    unlockText: '未开放'
  },
  {
    id: 'charcoal',
    name: '炭场',
    maxLevel: 3,
    weight: 0.7,
    mvp: false,
    initial: false,
    effect: { type: 'produce', perLevel: 5 },
    effectText: '银骨木炭 +5/天/级',
    produces: { key: 'charcoal', perLevel: 5 },
    unlockText: '巡查解锁（未开放）'
  },
  {
    id: 'mine',
    name: '矿场',
    maxLevel: 3,
    weight: 1.0,
    mvp: false,
    initial: false,
    effect: { type: 'produce', perLevel: 10 },
    effectText: '一阶灵石 +10/天/级',
    produces: { key: 'spiritual', perLevel: 10 },
    unlockText: '巡查解锁（未开放）'
  },
  {
    id: 'workshop',
    name: '工坊',
    maxLevel: 3,
    weight: 0.9,
    mvp: false,
    initial: false,
    effect: { type: 'produce', perLevel: 1 },
    effectText: '一阶法器 / 符箓 +1/天/级',
    produces: { key: 'craft', perLevel: 1 },
    unlockText: '百艺解锁（未开放）'
  },
  {
    id: 'pavilion',
    name: '亭卫',
    maxLevel: 3,
    weight: 0.8,
    mvp: true,
    initial: false,
    effect: { type: 'borderSafety', perLevel: 0.1 },
    effectText: '边境安全 +10%/级（情报/告急系统上线后生效）',
    produces: null,
    unlockText: ''
  },
  {
    id: 'wall',
    name: '长墙',
    maxLevel: 3,
    weight: 1.0,
    mvp: false,
    initial: false,
    effect: { type: 'familySafety', perLevel: 0.15 },
    effectText: '家族安全 +15%/级',
    produces: null,
    unlockText: '未开放'
  },
  {
    id: 'residence',
    name: '家族宅邸',
    maxLevel: 5,
    weight: 0.9,
    mvp: false,
    initial: false,
    effect: { type: 'innerStability', perLevel: 5 },
    effectText: '内宅稳定度 +5/级',
    produces: null,
    unlockText: '未开放'
  },
  {
    id: 'library',
    name: '传功阁',
    maxLevel: 3,
    weight: 1.0,
    mvp: false,
    initial: false,
    effect: { type: 'offspringGrowth', perLevel: 0.1 },
    effectText: '子孙成长 +10%/级',
    produces: null,
    unlockText: '张谈解锁（未开放）'
  },
  {
    id: 'shrine',
    name: '英烈祠',
    maxLevel: 3,
    weight: 0.8,
    mvp: false,
    initial: false,
    effect: { type: 'offspringFavor', perLevel: 5 },
    effectText: '子嗣好感 +5/级',
    produces: null,
    unlockText: '子嗣陨落后解锁（未开放）'
  },
  {
    id: 'bathhouse',
    name: '药浴池',
    maxLevel: 5,
    weight: 1.0,
    mvp: false,
    initial: false,
    effect: { type: 'medicine', perLevel: 1 },
    effectText: '灵材 → 五系药力（P45 未开放）',
    produces: null,
    unlockText: 'P45 药浴池（未开放）'
  }
]

/** 教程三步（乡侯府开局即有，不在教程里） */
export const TUTORIAL_IDS = ['farm', 'rookery', 'pavilion']

export const buildingById = id => BUILDINGS.find(b => b.id === id) || null
/** MVP 建筑，**按教程顺序**：乡侯府（开局即有）→ 灵田 → 鸦巢舍 → 亭卫 */
export const mvpBuildings = () => {
  const rank = id => (id === 'manor' ? -1 : TUTORIAL_IDS.indexOf(id))
  return BUILDINGS.filter(b => b.mvp).sort((a, b) => rank(a.id) - rank(b.id))
}
export const techTreeBuildings = () => BUILDINGS.filter(b => !b.mvp)

// ---------- 数值 ----------

export const ESTATE_TUNING = {
  /** 封地人口（§3.1 六村合计） */
  population: 5600,
  /** 可供徭役总数（§3.1） */
  laborTotal: 1400,
  /** 繁荣度：MVP 固定不涨，只乘税收 */
  prosperity: 30,
  morale: {
    base: 50,
    perManorLevel: 5,
    /** 每天向基准靠拢 `2 × 乡侯府等级` */
    recoverPerLevelPerDay: 2
  },
  /** 民心分级（§4.2 / 真值表 §6.8.1）。三处共用：税收 / 产出 / 徭役效率 */
  moraleTiers: [
    { min: 90, coef: 1.2, label: '拥戴' },
    { min: 70, coef: 1.1, label: '安定' },
    { min: 50, coef: 1.0, label: '一般' },
    { min: 30, coef: 0.9, label: '不满' },
    { min: 10, coef: 0.8, label: '怨愤' },
    { min: 0, coef: 0.5, label: '崩溃' }
  ],
  /** 升级基准（二阶灵石 / 名义月 / 徭役需求）。索引 = 目标等级 */
  buildLevels: {
    2: { costStone2: 40, months: 4, labor: 100 },
    3: { costStone2: 500, months: 6, labor: 200 },
    4: { costStone2: 1500, months: 10, labor: 350 },
    5: { costStone2: 10000, months: 24, labor: 500 }
  },
  /** 首建：0 成本，工期 = Lv1→2 工期的一半（2026-10-26 拍板） */
  firstBuildDurationRatio: 0.5,
  daysPerMonth: 30,
  /** 1 二阶 = 100 一阶 */
  stone1PerStone2: 100,
  tax: {
    /** 金页子 / 人 / 月 */
    perCapitaJinYeZi: 0.003,
    /** 乡侯府 Lv1 征收未开 */
    minManorLevel: 2,
    /** 征收进度 +1/30 每日 —— 进度条按 0~100 存，所以是 100/30 个百分点/天 */
    progressPerDay: 100 / 30,
    daZiPerJinYeZi: 100
  },
  labor: {
    /** 满足率 < 50% ⇒ 停工（§3.3） */
    stopBelow: 0.5
  },
  /** 封地流水上限（离线 180 天也不会刷爆） */
  logLimit: 40
}

/** 新档的封地状态 */
export const createEstateState = () => ({
  /** id → 等级（只记已建成） */
  buildings: { manor: 1 },
  /** id → 在建任务（支持并行建造） */
  builds: {},
  morale: ESTATE_TUNING.morale.base + ESTATE_TUNING.morale.perManorLevel,
  prosperity: ESTATE_TUNING.prosperity,
  population: ESTATE_TUNING.population,
  laborTotal: ESTATE_TUNING.laborTotal,
  /** 征收进度 0~100 */
  taxProgress: 0,
  /** 本月已征收过（`floor(dayIndex / 30)`）；-1 = 从未 */
  taxCollectedMonth: -1,
  /** 已结算到第几个游戏天（00:00 边界）；-1 = 从未 */
  lastDay: -1,
  /** 封地流水，最新在上 */
  log: []
})

/** 读档归一化：老档没有 estate / 被写成 null 时兜底 */
export const normalizeEstate = raw => {
  const base = createEstateState()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base
  const buildings = { ...(raw.buildings && typeof raw.buildings === 'object' ? raw.buildings : base.buildings) }
  // 乡侯府是封地的根：脏档 / 手改档把它删了，民心基准与征收会一起塌，这里兜回 Lv1
  if (!(Number(buildings.manor) >= 1)) buildings.manor = base.buildings.manor
  const builds = raw.builds && typeof raw.builds === 'object' ? raw.builds : {}
  return {
    ...base,
    ...raw,
    buildings,
    builds: { ...builds },
    log: Array.isArray(raw.log) ? raw.log.slice(0, ESTATE_TUNING.logLimit) : []
  }
}

// ---------- 民心 / 徭役 / 报价 ----------

/** 民心系数（§4.2 六档；`民心/50` 已废弃） */
export const moraleCoefOf = morale =>
  ESTATE_TUNING.moraleTiers.find(tier => num(morale) >= tier.min)?.coef ??
  ESTATE_TUNING.moraleTiers[ESTATE_TUNING.moraleTiers.length - 1].coef

/** 民心等级名（拥戴 / 安定 / …） */
export const moraleLabelOf = morale =>
  ESTATE_TUNING.moraleTiers.find(tier => num(morale) >= tier.min)?.label ??
  ESTATE_TUNING.moraleTiers[ESTATE_TUNING.moraleTiers.length - 1].label

/** 民心基准 = 50 + 5 × 乡侯府等级 */
export const moraleBaselineOf = manorLevel =>
  ESTATE_TUNING.morale.base + ESTATE_TUNING.morale.perManorLevel * Math.max(num(manorLevel), 0)

/**
 * 升级 / 首建报价。
 *
 * @param {string} id 建筑 id
 * @param {number} targetLevel 目标等级（首建传 1）
 * @param {{firstBuild?:boolean}} opts 首建：成本 0、工期 × 0.5
 * @returns {{costStone2:number,costStones:number,days:number,labor:number}|null}
 */
export const upgradeQuote = (id, targetLevel, { firstBuild = false } = {}) => {
  const building = buildingById(id)
  if (!building) return null
  const target = Math.floor(num(targetLevel))
  if (target < 1 || target > building.maxLevel) return null
  // 首建借用 Lv1→2 的基准（设计表从 Lv1→2 起）
  const base = ESTATE_TUNING.buildLevels[Math.max(target, 2)]
  if (!base) return null
  const costStone2 = firstBuild ? 0 : Math.round(base.costStone2 * building.weight)
  const months = base.months * building.weight
  const days = Math.max(
    1,
    Math.round(months * ESTATE_TUNING.daysPerMonth * (firstBuild ? ESTATE_TUNING.firstBuildDurationRatio : 1))
  )
  return {
    costStone2,
    costStones: costStone2 * ESTATE_TUNING.stone1PerStone2,
    days,
    labor: base.labor
  }
}

/** 某建筑的下一次可升级报价；已满级 / 未建成返回 null */
export const nextQuoteOf = (state, id) => {
  const building = buildingById(id)
  if (!building) return null
  const level = num(state?.buildings?.[id])
  if (level <= 0) return upgradeQuote(id, 1, { firstBuild: true })
  if (level >= building.maxLevel) return null
  return upgradeQuote(id, level + 1)
}

/**
 * 徭役满足率 = min(1, 徭役总数 / 在建总需求)。
 * MVP 不做拖拽、不做每项保底 50%（第二批），所以项目之间**自动均分**。
 */
export const laborSatisfactionOf = state => {
  const builds = Object.values(state?.builds || {})
  const demand = builds.reduce((sum, job) => sum + Math.max(num(job?.labor), 0), 0)
  if (demand <= 0) return 1
  const total = Math.max(num(state?.laborTotal, ESTATE_TUNING.laborTotal), 0)
  return clamp(total / demand, 0, 1)
}

/** 在建项目的徭役分配（均分后的实际人数，UI 展示用） */
export const laborAssignedOf = (state, id) => {
  const builds = Object.values(state?.builds || {})
  const demand = builds.reduce((sum, job) => sum + Math.max(num(job?.labor), 0), 0)
  const job = state?.builds?.[id]
  if (!job || demand <= 0) return 0
  const total = Math.max(num(state?.laborTotal, ESTATE_TUNING.laborTotal), 0)
  return Math.min(num(job.labor), (total * num(job.labor)) / demand)
}

/** 月税收（金页子）；乡侯府 Lv1 未开征收 ⇒ 0 */
export const taxMonthlyJinYeZi = state => {
  const manorLevel = num(state?.buildings?.manor)
  if (manorLevel < ESTATE_TUNING.tax.minManorLevel) return 0
  return (
    num(state?.population, ESTATE_TUNING.population) *
    ESTATE_TUNING.tax.perCapitaJinYeZi *
    Math.pow(2, manorLevel - 1) *
    moraleCoefOf(state?.morale) *
    (1 + num(state?.prosperity, ESTATE_TUNING.prosperity) / 100)
  )
}

/** 建筑日产出（取整后的实物数量）；非产出型返回 0 */
export const productionOf = (state, id, { moraleCoef = null, patrolled = false } = {}) => {
  const building = buildingById(id)
  if (!building?.produces) return 0
  const level = num(state?.buildings?.[id])
  if (level <= 0) return 0
  const coef = moraleCoef == null ? moraleCoefOf(state?.morale) : moraleCoef
  const base = building.produces.perLevel * level * coef * (patrolled ? 2 : 1)
  return Math.max(Math.round(base), 0)
}

// ---------- 巡视判定 ----------

/**
 * 某个日历日窗口 `(from, to]` 里巡视是否结束过。
 *
 * `patrolEndSeconds` 是**该工作日 06:00 + 巡视小时数**的绝对游戏秒（dayLoop 的快照）。
 * 探索 / 秘境时 dayLoop 冻结，`patrolEndSeconds` 停在旧日期 ⇒ 天然落在窗口外 ⇒ 不加速。
 */
export const patrolSettledInWindow = (dayState, fromSeconds, toSeconds) => {
  const end = Number(dayState?.patrolEndSeconds)
  if (!Number.isFinite(end) || end <= 0) return false
  return end > num(fromSeconds) && end <= num(toSeconds)
}

/** 产出条展示用：本日历日已过的比例，巡视日一天走两趟 */
export const productionBarOf = (nowSeconds, patrolled = false) => {
  const t = ((num(nowSeconds) % DAY) + DAY) % DAY
  const turns = patrolled ? 2 : 1
  return ((t / DAY) * turns * 100) % 100
}

/** 教程当前步：0=建灵田 · 1=建鸦巢舍 · 2=建亭卫 · 3=完成 */
export const tutorialStepOf = state => {
  for (let i = 0; i < TUTORIAL_IDS.length; i += 1) {
    if (!state?.buildings?.[TUTORIAL_IDS[i]]) return i
  }
  return TUTORIAL_IDS.length
}

// ---------- 单日推进 ----------

/**
 * 浅拷 + 两层深拷。
 * ⚠ `builds` 里的任务对象必须**逐条复制** —— 只 `{...builds}` 会让新旧状态共用
 *   同一个 job 引用，推进旧状态时把输入状态也改了（断言里表现为「同一天重复结算还在涨」）。
 */
const cloneEstate = state => {
  const builds = {}
  for (const [id, job] of Object.entries(state?.builds || {})) builds[id] = { ...job }
  return {
    ...state,
    buildings: { ...(state?.buildings || {}) },
    builds,
    log: Array.isArray(state?.log)
      ? state.log.map(row => (row && typeof row === 'object' ? { ...row } : { day: 0, text: String(row) }))
      : []
  }
}

const pushLog = (state, dayIndex, text, kind = 'info') => {
  // 同一句连续刷（停工状态持续几十天）只留第一条 —— 否则 40 条上限会把完工 / 征收挤掉
  if (state.log[0]?.text === text) return
  state.log.unshift({ day: dayIndex, kind, text })
  if (state.log.length > ESTATE_TUNING.logLimit) state.log.length = ESTATE_TUNING.logLimit
}

/** 完工：只写回等级并删任务（正常路径与「进度已 100 的脏档」共用） */
const finishBuilding = (state, id, job, building, settledDay, out) => {
  const level = num(job.targetLevel)
  state.buildings[id] = Math.max(num(state.buildings[id]), level)
  delete state.builds[id]
  const text = job.firstBuild
    ? `${building.name} 建成（Lv.${level}）`
    : `${building.name} 升至 Lv.${level}`
  pushLog(state, settledDay, text, 'built')
  out.events.push({ kind: 'built', text })
}

/**
 * **封地单日结算**（00:00 边界调用一次）。
 *
 * 顺序固定：幂等 → 民心靠拢 → 民心系数 → 徭役满足率 → 产出 → 建设 → 征收 → 落 lastDay。
 * 三条顺序理由：
 *   ① 产出 / 税收 / 徭役都要用**靠拢后**的民心；
 *   ② 产出与税收要用**日初等级快照** —— 今天完工的升级**明天**才产，
 *      否则「灵田今天建成今天收」「乡侯府今天升 Lv3 今天按 Lv3 收税」会多算一天；
 *   ③ 结算归属的是「刚结束的那个日历日」（`settledDay = midnight/DAY − 1`），
 *      不是 `midnight/DAY` —— 否则首次结算会写成「第 2 日」，征收的月口径也整体偏一天。
 *
 * @param {object} state 封地状态（不改原对象）
 * @param {{midnight?:number, patrolled?:boolean, stones?:number}} ctx
 *   `stones` = 当前一阶灵石余额，只用来判断「今天付不付得起」
 * @returns {{state:object, gains:{spiritual:number,secular:number,taxJinYeZi:number},
 *            spent:number, events:Array, settled:boolean}}
 */
export const advanceEstateDay = (state, { midnight = 0, patrolled = false, stones = 0 } = {}) => {
  const s = cloneEstate(state)
  const settledDay = Math.floor(num(midnight) / DAY) - 1
  const out = {
    state: s,
    gains: { spiritual: 0, secular: 0, taxJinYeZi: 0 },
    spent: 0,
    events: [],
    settled: false
  }

  // ① 幂等：同一天只结一次。gap > 1（异常：老档 / 时钟回拨）只结一天，别补跑。
  if (!(settledDay > num(s.lastDay, -1))) return out

  // ② 民心向基准靠拢（§4.1）；基准用**日初**乡侯府等级
  const manorLevel = num(s.buildings.manor)
  const baseline = moraleBaselineOf(manorLevel)
  const step = ESTATE_TUNING.morale.recoverPerLevelPerDay * manorLevel
  // 脏档 / 手改档没有 morale 时按基准起步，别让它落到 0（那会直接吃 0.5 崩溃系数）
  let morale = num(s.morale, baseline)
  if (step > 0) {
    if (morale < baseline) morale = Math.min(baseline, morale + step)
    else if (morale > baseline) morale = Math.max(baseline, morale - step)
  }
  s.morale = clamp(morale, 0, 100)

  // ③ 民心系数（税收 / 产出 / 徭役效率三处共用）
  const coef = moraleCoefOf(s.morale)
  const speed = coef * (patrolled ? 2 : 1)

  // ④ 徭役快照（今天完工的项目，徭役明天才释放）
  const satisfaction = laborSatisfactionOf(s)
  const laborStop = satisfaction < ESTATE_TUNING.labor.stopBelow

  // 日初等级快照：产出与税收都读它
  const levelSnapshot = { ...s.buildings }
  const levelState = { ...s, buildings: levelSnapshot }

  // ⑤ 产出：每个已建成的产出型建筑按「天」入库
  for (const building of BUILDINGS) {
    if (!building.produces) continue
    if (!num(levelSnapshot[building.id])) continue
    const amount = productionOf(levelState, building.id, { moraleCoef: coef, patrolled })
    if (!amount) continue
    if (building.produces.key === 'spiritual') out.gains.spiritual += amount
    else if (building.produces.key === 'secular') out.gains.secular += amount
    // 其余实物（灵植 / 木炭 / 法器）MVP 不可建，先不落账
  }

  // ⑥ 建设：进度与付款同速 ⇒ 总付款恒等于总成本（§10.5）
  let budget = Math.max(num(stones), 0)
  for (const [id, job] of Object.entries(s.builds)) {
    const building = buildingById(id)
    if (!building || !job) {
      delete s.builds[id]
      continue
    }
    const progress = clamp(num(job.progress), 0, 100)
    const remainingCost = Math.max(num(job.costStones) - num(job.paid), 0)

    // 脏档：进度已经 100 却没结算（中途崩溃 / 手改）→ 先补尾款，付得起才完工
    if (progress >= 100 - 1e-9) {
      if (remainingCost > budget) {
        const text = `${building.name} 停工：灵石不足（需补尾款 ${remainingCost} 一阶）`
        pushLog(s, settledDay, text, 'stall')
        out.events.push({ kind: 'stall', text })
        continue
      }
      budget -= remainingCost
      out.spent += remainingCost
      job.paid = num(job.paid) + remainingCost
      job.progress = 100
      finishBuilding(s, id, job, building, settledDay, out)
      continue
    }

    if (laborStop) {
      const text = `${building.name} 停工：徭役满足率 ${Math.round(satisfaction * 100)}%（需 ≥50%）`
      pushLog(s, settledDay, text, 'stall')
      out.events.push({ kind: 'stall', text })
      continue
    }

    const remainPct = 100 - progress
    const rawDelta = (100 / Math.max(num(job.days, 1), 1)) * satisfaction * speed
    const nextProgress = Math.min(progress + rawDelta, 100)
    const deltaPct = nextProgress - progress
    if (deltaPct <= 0) continue
    // 完工判定看「推进后的进度」，不看 delta 与 remain 的比较 —— 浮点累加时后者可能漏判，
    // 于是任务被删掉却没付尾款（总付款少一笔）。
    const isDone = nextProgress >= 100 - 1e-9
    // 完工时把尾款补齐：避免逐日四舍五入让总付款 ≠ 总成本
    const pay = isDone ? remainingCost : Math.round((remainingCost * deltaPct) / remainPct)

    if (pay > budget) {
      const text = `${building.name} 停工：灵石不足（今日需 ${pay} 一阶）`
      pushLog(s, settledDay, text, 'stall')
      out.events.push({ kind: 'stall', text })
      continue
    }

    budget -= pay
    out.spent += pay
    job.paid = num(job.paid) + pay
    job.progress = clamp(nextProgress, 0, 100)

    if (isDone) {
      job.progress = 100
      finishBuilding(s, id, job, building, settledDay, out)
    }
  }

  // ⑦ 征收：乡侯府 Lv2 起；满格入库，**每月最多 1 次**
  //    「提前满不叠下月」：本月已经收过就不再涨进度 —— 不是攒到 100 等下月一号再收。
  const month = Math.floor(settledDay / ESTATE_TUNING.daysPerMonth)
  if (manorLevel >= ESTATE_TUNING.tax.minManorLevel && s.taxCollectedMonth !== month) {
    s.taxProgress = clamp(
      num(s.taxProgress) + ESTATE_TUNING.tax.progressPerDay * (patrolled ? 2 : 1),
      0,
      100
    )
    if (s.taxProgress >= 100 - 1e-9) {
      // 金额用**日初等级**算：今天从 Lv2 升到 Lv3，今天的税仍按 Lv2
      const jin = taxMonthlyJinYeZi(levelState)
      const daZi = Math.round(jin * ESTATE_TUNING.tax.daZiPerJinYeZi)
      out.gains.taxJinYeZi = jin
      out.gains.secular += daZi
      s.taxCollectedMonth = month
      s.taxProgress = 0
      const text = `征收满格，入库 ${jin.toFixed(1)} 金页子`
      pushLog(s, settledDay, text, 'tax')
      out.events.push({ kind: 'tax', text })
    }
  }

  // ⑧ 落幂等标记（记录的是「刚结束的日历日」）
  s.lastDay = settledDay
  out.settled = true
  return out
}
