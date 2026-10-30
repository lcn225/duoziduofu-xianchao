// 飞鹰门（贡献点 / 周任务 / 秘库）—— 模块五 §13 的落地。
//
// ⚠ 本批只做「贡献点 + 周任务 + 秘库货架」，**官位 / 内政 / 俸禄不做**（留给 B8 剩余）。
//   所以这里没有职位、没有月俸、没有升迁判定。
//
// 口径（真源《模块五》§13.1 / §13.2.1 / §13.3.3）：
//   · 普通任务 3 个/游戏周（交物品 / 杀怪 / 驻扎 各 1），困难 3 个/游戏月（4 抽 3）
//   · 同时最多接 3 个；奖励固定 30 / 100；放弃无惩罚
//   · 交物品即时完成；杀怪扣 1 游戏天；驻扎 3~10 游戏天，子嗣必须满足练气二层
//   · 子嗣「家族工作 / 历练 / 秘境出战 / 任务」四选一 —— 接任务时占 `factionTaskId`
//
// 时间：刷新与结算都挂在 clock 的 **day 钩子**（与内宅、封地同一处 00:00 边界），
// 离线重放走 `settleOfflineMidnightsBetween`，也是同一条路。
import { PLAYER_FATES, QI_ART_MAP, QI_ARTS } from '../../plugins/cultivationData.js'
import { ITEM_POOL, createItemInstance, itemById, rollItemQuality } from '../../plugins/items.js'
import { bestHarmonyOf, itemTagsOf } from '../../plugins/tagHarmony.js'
import {
  FACTION_MAX_REAL_STEP_SECONDS,
  FACTION_SECONDS_PER_DAY,
  FACTION_TUNING,
  brokerDrawOf,
  brokerTagsOf,
  collectRequirementOf,
  isTaskExpired,
  keyOfTask,
  manualRefreshCostOf,
  materialCountOf,
  monthIndexOf,
  realmSectionOf,
  rollBrokerPool,
  rollTasksOf,
  rollVaultArts,
  rollVaultMaterials,
  taskDueAtOf,
  weekIndexOf
} from '../../plugins/faction.js'
import { isAliveOffspringOf } from '../../plugins/innerCourt.js'
import { takeUnits, unitsOf } from '../../plugins/stacks.js'
import {
  buildEnemy,
  buildOffspringUnit,
  buildPetUnit,
  buildPlayerUnit,
  combatPowerOf,
  simulateBattle
} from '../../plugins/secretRealm.js'

const LOG_LIMIT = 20

/** 存档默认形状（老档没有这个字段时用它补齐） */
export const defaultFactionState = () => ({
  /** 当前持有 */
  contribution: 0,
  /** 累计获得 —— 将来升职只看这个（不扣持有），本期不判定 */
  contributionTotal: 0,
  /**
   * 飞鹰门自己的**现实秒累计**（不是游戏秒）。
   * ⚠ 锚点 96 现实秒/游戏天 = 练气期 1:1；筑基后 24× 世界里这里**不加速**，
   *   否则一游戏月 = 2 现实分钟、贡献点白送。详见 `plugins/faction.js` 顶部口径。
   */
  realSeconds: 0,
  /** 上一次累计现实秒的墙钟（ms）；读档后第一拍用它算离线经过的时间 */
  lastRealMs: 0,
  /** 上次刷新到的周 / 月序号（-1 = 还没刷过，第一次结算补刷） */
  weekKey: -1,
  monthKey: -1,
  /** 任务池：open 在货架上、accepted 在跑、done / failed / abandoned 是历史 */
  tasks: [],
  /** 自增 id，保证跨周期不撞号 */
  seq: 1,
  log: [],
  /**
   * 秘库货架（《模块五》§13.3.3）。
   *   · 功法栏：3~4 本心法整本/月，全随机、排除已学、不保底
   *   · 同参底材栏：10~12 件/月，按两个本命的契合度排序，**限购 1 件/月**
   *   · 手动刷新：50 / 100 / 200 / 400，**每月重置**
   */
  vault: {
    monthKey: -1,
    seq: 1,
    manualRefreshUsed: 0,
    materialBoughtThisMonth: 0,
    arts: [],
    materials: [],
    /** 老九订货：{ tags, chosenTag, orderedAt, readyAt, pool } */
    broker: null
  }
})

export const state = () => ({
  faction: defaultFactionState()
})

export const getters = {
  /** 内政入口解锁：练气六层 + 乡侯府 Lv.1（《模块解锁方针》§五） */
  factionUnlocked() {
    const level = Number(this.level) || 1
    const manor = Number(this.estate?.buildings?.manor) || 0
    return level >= FACTION_TUNING.unlock.innerLevel && manor >= FACTION_TUNING.unlock.buildingLevel
  },
  /** 秘库解锁：练气八层（2026-10-30 A1 改，不再随内政） */
  vaultUnlocked() {
    return (Number(this.level) || 1) >= FACTION_TUNING.vaultUnlockInnerLevel
  },
  /** 未解锁时的 Checklist（导航悬停 / 页面占位共用，最多 3 条） */
  factionChecklist() {
    const level = Number(this.level) || 1
    const manor = Number(this.estate?.buildings?.manor) || 0
    const rows = [
      {
        label: `突破练气${FACTION_TUNING.unlock.innerLevel}层`,
        done: level >= FACTION_TUNING.unlock.innerLevel,
        current: `当前内功 ${level} 层`
      },
      {
        label: `建造乡侯府并升到 Lv.${FACTION_TUNING.unlock.buildingLevel}`,
        done: manor >= FACTION_TUNING.unlock.buildingLevel,
        current: manor > 0 ? `当前 Lv.${manor}` : '未建造'
      }
    ]
    return rows
  },
  factionOpenTasks() {
    return (this.faction?.tasks || []).filter(t => t.status === 'open')
  },
  factionActiveTasks() {
    return (this.faction?.tasks || []).filter(t => t.status === 'accepted')
  },
  factionAcceptedCount() {
    return this.factionActiveTasks.length
  },
  /** 飞鹰门自己的现实秒累计（任务时长 / 刷新都用它，与游戏时钟无关） */
  factionRealSeconds() {
    return Number(this.faction?.realSeconds) || 0
  },
  /** 秘库·功法栏（3~4 本/月） */
  vaultArtsView() {
    const v = this.faction?.vault
    return (v?.arts || []).map(entry => ({
      ...entry,
      art: QI_ART_MAP[entry.artId] || null,
      learned: !!this.practice?.qiArts?.known?.[entry.artId]
    }))
  },
  /** 秘库·同参底材栏（10~12 件/月，含契合度给玩家看） */
  vaultMaterialsView() {
    const v = this.faction?.vault
    const masters = PLAYER_FATES.map(fate => fate.id)
    return (v?.materials || []).map(entry => {
      const base = itemById(entry.baseId)
      return {
        ...entry,
        item: base,
        fit: base ? bestHarmonyOf(base, masters) : 0
      }
    })
  },
  /** 本月底材还能不能买（限购 1 件/月/段） */
  vaultCanBuyMaterial() {
    const bought = Number(this.faction?.vault?.materialBoughtThisMonth) || 0
    return bought < FACTION_TUNING.vaultMaterials.limitPerMonth
  },
  /** 下一次手动刷新的价格 */
  vaultManualRefreshCost() {
    return manualRefreshCostOf(Number(this.faction?.vault?.manualRefreshUsed) || 0)
  },
  /** 还能不能接新任务 */
  factionCanAccept() {
    return this.factionAcceptedCount < FACTION_TUNING.maxAccepted
  },
  /**
   * 能派去驻扎的子嗣：活着 + 练气二层以上 + 没被家族工作 / 历练 / 秘境 / 别的任务占着。
   * 秘境那一份占用在 `acceptFactionTask` 里再查一次（这里只给 UI 候选名单）。
   */
  factionGarrisonCandidates() {
    const inSecretRealm = new Set(
      (this.secretRealm?.run?.party || [])
        .filter(ref => ref.kind === 'offspring')
        .map(ref => ref.id)
    )
    return (this.offspring?.list || []).filter(
      child =>
        isAliveOffspringOf(child) &&
        (Number(child.realmLevel) || 1) >= FACTION_TUNING.garrisonMinRealmLevel &&
        !child.job &&
        !(child.expeditionMode && child.expeditionMode !== 'cultivate') &&
        !child.factionTaskId &&
        !inSecretRealm.has(child.id)
    )
  }
}

export const actions = {
  /**
   * 读档归一化：老档没有 `faction` 字段时补默认形状。
   * 刷新不在这里做 —— 交给下一次日结（`advanceFactionDay`），
   * 否则「读档那一刻」与「日界那一刻」会各刷一次，任务池出现两份。
   */
  normalizeFactionOnLoad() {
    const base = defaultFactionState()
    const current = this.faction || {}
    let changed = false
    for (const key of Object.keys(base)) {
      if (current[key] === undefined) {
        current[key] = base[key]
        changed = true
      }
    }
    if (!Array.isArray(current.tasks)) {
      current.tasks = []
      changed = true
    }
    if (!Array.isArray(current.log)) {
      current.log = []
      changed = true
    }
    this.faction = current
    return changed
  },

  gainContribution(points, { save = true } = {}) {
    const n = Math.max(Math.floor(Number(points) || 0), 0)
    if (!n) return 0
    this.faction.contribution = (Number(this.faction.contribution) || 0) + n
    this.faction.contributionTotal = (Number(this.faction.contributionTotal) || 0) + n
    if (save) this.saveData()
    return n
  },

  spendContribution(points) {
    const n = Math.max(Math.floor(Number(points) || 0), 0)
    if ((Number(this.faction.contribution) || 0) < n) return false
    this.faction.contribution -= n
    this.saveData()
    return true
  },

  pushFactionLog(text, at = this.clockGameTime) {
    const log = Array.isArray(this.faction.log) ? this.faction.log : []
    log.unshift({ at: Number(at) || 0, text })
    this.faction.log = log.slice(0, LOG_LIMIT)
  },

  /**
   * 接取任务。三类分别处理：
   *   · 交物品 —— 当场交齐、当场结算（不占「同时 3 个」的名额）
   *   · 杀怪   —— 占 1 游戏天，到点打第 5 层 Boss
   *   · 驻扎   —— 占 3~10 游戏天，需要指定满足境界的子嗣
   *
   * @param {string} taskId
   * @param {{ assignees?: string[] }} opts
   */
  acceptFactionTask(taskId, { assignees = [] } = {}) {
    const task = (this.faction.tasks || []).find(t => t.id === taskId && t.status === 'open')
    if (!task) return { ok: false, message: '任务不存在或已刷新' }
    if (task.kind !== 'collect' && !this.factionCanAccept) {
      return { ok: false, message: `同时最多接 ${FACTION_TUNING.maxAccepted} 个任务` }
    }

    if (task.kind === 'collect') {
      // 动态难度：要求阶位随主角**当前**境界段（接取这一刻定，之后不再变）
      const template = { category: task.requirements.category, countMin: 1, countMax: 1 }
      const req = collectRequirementOf(template, this.level)
      task.requirements = {
        category: task.requirements.category,
        tierMin: req.tierMin,
        tierMax: req.tierMax,
        count: task.requirements.count
      }
      const plan = []
      let need = task.requirements.count
      for (const item of this.items || []) {
        if (need <= 0) break
        if (item.category !== task.requirements.category) continue
        const tier = Number(item.tier) || 0
        if (tier < task.requirements.tierMin || tier > task.requirements.tierMax) continue
        const take = Math.min(unitsOf(item), need)
        plan.push({ id: item.id, units: take })
        need -= take
      }
      if (need > 0) {
        return {
          ok: false,
          message: `材料不足：还需 ${need} 件${task.requirements.category}（${task.requirements.tierMin}~${task.requirements.tierMax} 阶）`
        }
      }
      this.items = takeUnits(this.items || [], plan)
      task.status = 'done'
      // ⚠ 飞鹰门的时间轴是**现实秒**（见 plugins/faction.js 顶部），不是 clockGameTime
      task.acceptedAt = this.factionRealSeconds
      task.dueAt = task.acceptedAt
      this.gainContribution(task.reward, { save: false })
      this.pushFactionLog(`交付「${task.name}」，得 ${task.reward} 贡献点`)
      this.saveData()
      return { ok: true, completed: true, reward: task.reward }
    }

    const now = this.factionRealSeconds
    if (task.kind === 'garrison') {
      const need = task.requirements?.count || 1
      // 秘境出战也算占用（子嗣三个状态互斥 + 秘境编成，见《模块五》§12.1 #13）
      const inSecretRealm = new Set(
        (this.secretRealm?.run?.party || [])
          .filter(ref => ref.kind === 'offspring')
          .map(ref => ref.id)
      )
      const picked = []
      for (const id of assignees) {
        if (picked.length >= need) break
        const child = (this.offspring?.list || []).find(c => c.id === id)
        if (!child || !isAliveOffspringOf(child)) continue
        if ((Number(child.realmLevel) || 1) < task.requirements.minRealmLevel) continue
        if (child.job || (child.expeditionMode && child.expeditionMode !== 'cultivate')) continue
        if (child.factionTaskId || inSecretRealm.has(id)) continue
        picked.push(child)
      }
      if (picked.length < need) {
        return { ok: false, message: `需要 ${need} 名练气${task.requirements.minRealmLevel}层以上、且没在忙的子嗣` }
      }
      task.assignees = picked.map(c => c.id)
      for (const child of picked) child.factionTaskId = task.id
    }

    task.status = 'accepted'
    task.acceptedAt = now
    task.dueAt = taskDueAtOf(now, task.days)
    this.pushFactionLog(`接下「${task.name}」，${task.days} 天后回报`)
    this.saveData()
    return { ok: true, completed: false }
  },

  /** 放弃任务（随时、无惩罚）：把子嗣放出来 */
  abandonFactionTask(taskId) {
    const task = (this.faction.tasks || []).find(t => t.id === taskId && t.status === 'accepted')
    if (!task) return { ok: false, message: '没有这个进行中的任务' }
    this._releaseFactionAssignees(task)
    task.status = 'abandoned'
    this.pushFactionLog(`放弃「${task.name}」`)
    this.saveData()
    return { ok: true }
  },

  _releaseFactionAssignees(task) {
    for (const id of task?.assignees || []) {
      const child = (this.offspring?.list || []).find(c => c.id === id)
      if (child && child.factionTaskId === task.id) child.factionTaskId = null
    }
  },

  /**
   * 杀怪任务的队伍：桂冈 + 战力最高的 3 名出战候选子嗣 + 出战灵宠。
   * 与秘境整备的默认编成同口径（《三大挂机》§4.4），只是不需要玩家每次手选。
   */
  buildFactionPartyUnits() {
    const units = [buildPlayerUnit(this.buildPlayerSnapshot())]
    const scored = (this.adultOffspringCandidates || [])
      .map(child => {
        const unit = buildOffspringUnit(child, { nowSeconds: this.clockGameTime })
        return unit ? { unit, power: combatPowerOf(unit) } : null
      })
      .filter(Boolean)
      .sort((a, b) => b.power - a.power)
    for (const { unit } of scored.slice(0, 3)) units.push(unit)
    if (this.activePet) {
      const petUnit = buildPetUnit(this.activePet)
      if (petUnit) units.push(petUnit)
    }
    return units
  },

  /**
   * 打一场「微型副本」—— 只打第 5 层 Boss（前 4 层视为清场，不进血量继承）。
   * 赢 = 完成；输 = 任务失败，**不扣人、不养伤、不掉东西**。
   */
  resolveFactionCombat(task) {
    const allies = this.buildFactionPartyUnits()
    const enemies = [buildEnemy(5, { difficulty: task.requirements?.dungeonDifficulty || 1 })]
    const result = simulateBattle({ allies, enemies, autoRetreatPct: 0, permadeath: false })
    return result.outcome === 'victory'
  },

  /** 到点结算所有进行中的任务（日结 / 离线重放共用） */
  settleFactionTasks(nowSeconds, { silent = false } = {}) {
    const now = Number(nowSeconds) || 0
    let changed = false
    for (const task of this.faction.tasks || []) {
      if (task.status !== 'accepted') continue
      if ((Number(task.dueAt) || 0) > now) continue
      let done = true
      if (task.kind === 'combat') done = this.resolveFactionCombat(task)
      this._releaseFactionAssignees(task)
      task.status = done ? 'done' : 'failed'
      changed = true
      if (done) {
        this.gainContribution(task.reward, { save: false })
        // 流水显示的是**游戏日期**（`formatGameDate`），所以这里用 clockGameTime，不用现实秒
        this.pushFactionLog(`「${task.name}」回报，得 ${task.reward} 贡献点`)
      } else {
        this.pushFactionLog(`「${task.name}」失手，无功而返`)
      }
      void silent
    }
    return changed
  },

  /**
   * 周 / 月刷新：普通任务每 7 游戏天换一批、困难任务每 30 游戏天换一批。
   * 规则（《模块五》§13.2.1）：
   *   · 过期未接的普通/困难任务**直接消失**
   *   · 已接的照常跑完
   *   · 「同一周内不重复出现同一模板」—— 靠排除**进行中**任务的模板实现
   */
  refreshFactionTasks(nowSeconds, { rng = Math.random } = {}) {
    const now = Number(nowSeconds) || 0
    const weekKey = weekIndexOf(now)
    const monthKey = monthIndexOf(now)
    const f = this.faction
    const weekChanged = f.weekKey !== weekKey
    const monthChanged = f.monthKey !== monthKey
    if (!weekChanged && !monthChanged) return false

    // 过期未接的先清掉；历史只留最近 10 条，防止任务数组无限长
    const kept = []
    const history = []
    for (const task of f.tasks || []) {
      if (isTaskExpired(task, now)) continue
      if (task.status === 'open' || task.status === 'accepted') kept.push(task)
      else history.push(task)
    }

    const activeTemplates = kept.filter(t => t.status === 'accepted').map(t => t.templateId)
    const next = [...kept]
    let seq = Number(f.seq) || 1
    if (weekChanged) {
      const fresh = rollTasksOf('normal', {
        rng,
        nowSeconds: now,
        startId: seq,
        exclude: activeTemplates
      })
      seq += fresh.length
      next.push(...fresh)
      f.weekKey = weekKey
    }
    if (monthChanged) {
      const fresh = rollTasksOf('hard', {
        rng,
        nowSeconds: now,
        startId: seq,
        exclude: activeTemplates
      })
      seq += fresh.length
      next.push(...fresh)
      f.monthKey = monthKey
    }
    f.seq = seq
    f.tasks = [...next, ...history.slice(0, 10)]
    // 订单中的 id 必须能用 `seq` 继续加，所以不重排
    return true
  },

  /**
   * 飞鹰门的时间推进（clock 的 day 钩子 + 离线重放的每个 00:00 边界都会调）。
   *
   * ⚠ **累计的是现实秒**：用墙钟差，不用游戏秒（`gameTime` 只是个触发信号）。
   *   · 练气期 day 钩子约 96 现实秒来一次、筑基后约 4 秒来一次，差多少记多少；
   *   · 读档/离线：`lastRealMs` 是上一次会话的墙钟，第一拍就把离线经过的时间补上
   *     （上限 `FACTION_MAX_REAL_STEP_SECONDS` = 180 游戏天 × 96 秒 ≈ 4.8 现实小时）。
   *
   * 顺序：先累计时间，再结算到点任务，最后刷新周/月任务池。
   */
  advanceFactionReal(nowMs = Date.now(), { silent = false, rng = Math.random } = {}) {
    if (!this.faction) this.faction = defaultFactionState()
    const last = Number(this.faction.lastRealMs) || 0
    const now = Number(nowMs) || Date.now()
    // 首次进入（last = 0）不补时间，只把基线钉到现在
    const delta = last > 0 ? Math.min(Math.max((now - last) / 1000, 0), FACTION_MAX_REAL_STEP_SECONDS) : 0
    this.faction.lastRealMs = now
    this.faction.realSeconds = (Number(this.faction.realSeconds) || 0) + delta
    const settled = this.settleFactionTasks(this.faction.realSeconds, { silent })
    const refreshed = this.refreshFactionTasks(this.faction.realSeconds, { rng })
    // 秘库跟着同一条现实时间轴按月换货（筑基后不会 24 倍速刷）
    const vaultChanged = this.refreshVault(this.faction.realSeconds, { rng })
    // 老九到点带货
    const brokerArrived = this.settleBroker({ rng })
    if (settled || refreshed || vaultChanged || brokerArrived || delta > 0) this.saveData()
    return settled || refreshed || vaultChanged || brokerArrived
  },

  /**
   * 重摆一次货架（月刷 / 手动刷新共用）。
   * 功法栏 3~4 本、同参底材栏 10~12 件；价格按品阶 / 阶位随机。
   */
  rollVaultShelf({ rng = Math.random } = {}) {
    const v = this.faction.vault
    let seq = Number(v.seq) || 1
    const knownIds = Object.keys(this.practice?.qiArts?.known || {})
    const artCount = 3 + Math.floor(rng() * 2)
    const arts = rollVaultArts({
      arts: QI_ARTS,
      knownIds,
      innerLevel: this.level,
      count: artCount,
      rng,
      startId: seq
    })
    seq += arts.length
    const materials = rollVaultMaterials({
      pool: ITEM_POOL,
      masters: PLAYER_FATES.map(fate => fate.id),
      innerLevel: this.level,
      count: materialCountOf(rng),
      harmonyOf: bestHarmonyOf,
      rng,
      startId: seq
    })
    seq += materials.length
    v.arts = arts
    v.materials = materials
    v.seq = seq
  },

  /** 月刷：每「飞鹰门月」（30 × 96 现实秒）换一批货，顺带重置手动刷新价与限购 */
  refreshVault(nowSeconds, { rng = Math.random, force = false } = {}) {
    const v = this.faction.vault
    const monthKey = monthIndexOf(nowSeconds)
    if (!force && v.monthKey === monthKey) return false
    v.monthKey = monthKey
    v.manualRefreshUsed = 0
    v.materialBoughtThisMonth = 0
    this.rollVaultShelf({ rng })
    return true
  },

  /** 手动刷新：50 → 100 → 200 → 400，当月内递增，下月重置 */
  manualRefreshVault({ rng = Math.random } = {}) {
    if (!this.vaultUnlocked) return { ok: false, message: '秘库尚未开放（练气八层）' }
    const v = this.faction.vault
    const cost = manualRefreshCostOf(v.manualRefreshUsed)
    if ((Number(this.faction.contribution) || 0) < cost) {
      return { ok: false, message: `贡献点不足（需要 ${cost}）` }
    }
    this.faction.contribution -= cost
    v.manualRefreshUsed = (Number(v.manualRefreshUsed) || 0) + 1
    this.rollVaultShelf({ rng })
    this.pushFactionLog(`手动刷新秘库货架，-${cost} 贡献点`)
    this.saveData()
    return { ok: true, cost }
  },

  /** 买功法（整本、一次性）：扣贡献点 → 学功法 */
  buyVaultArt(entryId) {
    if (!this.vaultUnlocked) return { ok: false, message: '秘库尚未开放（练气八层）' }
    const entry = (this.faction.vault.arts || []).find(e => e.id === entryId && !e.sold)
    if (!entry) return { ok: false, message: '这本已经换走了' }
    if (!this.spendContribution(entry.price)) {
      return { ok: false, message: `贡献点不足（需要 ${entry.price}）` }
    }
    const result = this.learnQiArt(entry.artId, { save: false })
    entry.sold = true
    const name = QI_ART_MAP[entry.artId]?.name || entry.artId
    this.pushFactionLog(`从秘库换得《${name}》，-${entry.price} 贡献点`)
    this.saveData()
    return { ok: true, artId: entry.artId, alreadyKnown: !!result.alreadyKnown, name }
  },

  /** 买同参底材（限购 1 件/月/段）：扣贡献点 → 生成一件实例进背包 */
  buyVaultMaterial(entryId, { rng = Math.random } = {}) {
    if (!this.vaultUnlocked) return { ok: false, message: '秘库尚未开放（练气八层）' }
    const v = this.faction.vault
    if (!this.vaultCanBuyMaterial) {
      return { ok: false, message: '同参底材每月限购 1 件' }
    }
    const entry = (v.materials || []).find(e => e.id === entryId && !e.sold)
    if (!entry) return { ok: false, message: '这件已经换走了' }
    const base = itemById(entry.baseId)
    if (!base) return { ok: false, message: '这件货已经不在物品池里' }
    if (!this.spendContribution(entry.price)) {
      return { ok: false, message: `贡献点不足（需要 ${entry.price}）` }
    }
    const item = createItemInstance(base, { quality: rollItemQuality(rng), rng })
    this.gainItem(item, { save: false })
    entry.sold = true
    v.materialBoughtThisMonth = (Number(v.materialBoughtThisMonth) || 0) + 1
    this.pushFactionLog(`从秘库换得「${base.name}」，-${entry.price} 贡献点`)
    this.saveData()
    return { ok: true, item, name: base.name }
  },

  /**
   * 老九订货（《模块五》§13.3.1 ③）：400 点 + 1 个「飞鹰门月」。
   *
   * 下单瞬间按两个本命生成暗池（5~10 件、保底 1~2 件高契合），
   * 亮 4~5 个标签给玩家选；选定后到点按选定标签**加权抽取**带回 1~2 件。
   * 暗池只存存档，UI 只看得到标签。
   */
  orderBroker({ rng = Math.random } = {}) {
    if (!this.vaultUnlocked) return { ok: false, message: '秘库尚未开放（练气八层）' }
    if (this.faction.vault.broker) return { ok: false, message: '上一单还没回来' }
    const cost = FACTION_TUNING.broker.cost
    if ((Number(this.faction.contribution) || 0) < cost) {
      return { ok: false, message: `贡献点不足（需要 ${cost}）` }
    }
    const masters = PLAYER_FATES.map(fate => fate.id)
    const pool = rollBrokerPool({
      pool: ITEM_POOL,
      masters,
      innerLevel: this.level,
      harmonyOf: bestHarmonyOf,
      rng
    })
    if (!pool.length) return { ok: false, message: '这个境界段没有可订的底材' }
    this.faction.contribution -= cost
    const now = this.factionRealSeconds
    this.faction.vault.broker = {
      pool,
      tags: brokerTagsOf(pool, itemTagsOf),
      chosenTag: null,
      orderedAt: now,
      readyAt: now + FACTION_TUNING.broker.delayMonths * 30 * FACTION_SECONDS_PER_DAY
    }
    this.pushFactionLog(`向老九下单，-${cost} 贡献点`)
    this.saveData()
    return { ok: true, tags: this.faction.vault.broker.tags }
  },

  /** 选定暗池标签（选定后不可改，到点才带货） */
  chooseBrokerTag(tag) {
    const broker = this.faction.vault.broker
    if (!broker) return { ok: false, message: '没有进行中的订单' }
    if (broker.chosenTag) return { ok: false, message: '标签已经锁定' }
    if (!(broker.tags || []).includes(tag)) return { ok: false, message: '不在这一单的标签里' }
    broker.chosenTag = tag
    this.saveData()
    return { ok: true }
  },

  /** 到点收货：没选标签就一直等着（不吞单） */
  settleBroker({ rng = Math.random } = {}) {
    const broker = this.faction.vault.broker
    if (!broker || !broker.chosenTag) return false
    if (this.factionRealSeconds < (Number(broker.readyAt) || 0)) return false
    const picked = brokerDrawOf(broker.pool || [], broker.chosenTag, itemTagsOf, rng)
    const names = []
    for (const baseId of picked) {
      const base = itemById(baseId)
      if (!base) continue
      const item = createItemInstance(base, { quality: rollItemQuality(rng), rng })
      this.gainItem(item, { save: false })
      names.push(base.name)
    }
    this.faction.vault.broker = null
    this.pushFactionLog(`老九带货归来：${names.join('、') || '两手空空'}`)
    this.saveData()
    return true
  }
}
