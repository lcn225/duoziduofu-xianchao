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
  STORY_QUESTS,
  STORY_QUEST_MAP,
  brokerDrawOf,
  brokerPriceOf,
  brokerTagsOf,
  collectRequirementOf,
  goodsTiersOf,
  isTaskExpired,
  keyOfTask,
  manualRefreshCostOf,
  monthIndexOf,
  rollBrokerPool,
  rollTasksOf,
  rollVaultArts,
  rollVaultGoods,
  storyLevelOkOf,
  taskDueAtOf,
  weekIndexOf
} from '../../plugins/faction.js'
import { isAliveOffspringOf } from '../../plugins/innerCourt.js'
import { emitNotice } from '../../plugins/notice.js'
import { getRealmName } from '../../plugins/realm.js'
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
  /** 当前持有 —— 飞鹰阁唯一货币 */
  contribution: 0,
  /** 累计获得 —— 升职只看这个（不扣持有、不扣提现），阈值见 `plugins/salary.js` 的 SALARY_RANKS */
  contributionTotal: 0,
  /**
   * **可提现额度**（2026-11-06 B8-b）：单位**二阶灵石**，累积、无上限、无手续费。
   * 来源 = 每期俸禄的 10%；`withdrawSalary` 手动提现成 `currency.spiritual`（×100 一阶）。
   * **不进货币三字段、不参与物价、不参与升职门槛** —— 提现那一刻才进钱袋。
   */
  withdrawable: 0,
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
  /**
   * 剧情任务线进度（P56-b）：只记做完了哪几步。
   * 灵地解锁**直接写** `practice.spiritLand.unlocked`，不另存一份 ——
   * 两份清单迟早对不上。`done` 只用于展示与去重。
   */
  story: { done: [] },
  /** 自增 id，保证跨周期不撞号 */
  seq: 1,
  log: [],
  /**
   * **飞鹰阁**货架（2026-11-06 B8-b，《模块五》§13.3.2）。
   *   · 功法栏 3 个库位：心法整本，全随机、排除已学、不保底
   *   · 物资栏 6 个库位：灵器 / 灵兽 / 灵材 / 灵植，按境界段随机
   *   · **只限库位、不限购** —— 买掉一位就空，等下月刷新
   *   · 手动刷新：50 / 100 / 200 / 400，**每月重置**
   *
   * ⚠ 字段名 `vault` 保留不改（老档迁移成本低），语义 = 飞鹰阁。
   */
  vault: {
    monthKey: -1,
    seq: 1,
    manualRefreshUsed: 0,
    arts: [],
    goods: [],
    /** 老九订货：{ tags, chosenTag, orderedAt, readyAt, pool, prepay } */
    broker: null,
    /**
     * **老九已到货、待玩家收取**（2026-11-10）：`{ item, price, gap, arrivedAt }`。
     * 到货**不进背包**，先摆在飞鹰阁「老九带货」区让玩家看得见 —— 否则玩家感知不到买没买到。
     * ⚠ **不在 `rollVaultShelf` 的覆盖范围里**，月刷 / 手动刷新都碰不到它。
     * 未收取时不能下新单（`orderBroker` 拦）。
     */
    delivery: null
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
        label: `突破${getRealmName(FACTION_TUNING.unlock.innerLevel).name}`,
        done: level >= FACTION_TUNING.unlock.innerLevel,
        current: `当前内功 ${getRealmName(level).name}`
      },
      {
        label: `建造乡侯府并升到 Lv.${FACTION_TUNING.unlock.buildingLevel}`,
        done: manor >= FACTION_TUNING.unlock.buildingLevel,
        current: manor > 0 ? `当前 Lv.${manor}` : '未建造'
      }
    ]
    return rows
  },
  /**
   * 剧情任务线视图（灵地解锁的唯一入口，P56-b）。
   *
   * 每行给出「挡在哪儿」：`done` → 已解锁；`needLevel` → 境界不够；
   * `needContribution` → 点数不够。**不是 bug**：练气六层之前整条线都是灰的，
   * 因为飞鹰门入口本身要到练气六层 + 乡侯府 Lv.1 才开。
   */
  storyQuestView() {
    const done = new Set(this.faction?.story?.done || [])
    const level = Number(this.level) || 1
    const points = Number(this.faction?.contribution) || 0
    return STORY_QUESTS.map(q => {
      const isDone = done.has(q.id)
      const hasLevel = storyLevelOkOf(q, level)
      return {
        ...q,
        done: isDone,
        hasLevel,
        hasContribution: points >= q.cost,
        canComplete: !isDone && hasLevel && points >= q.cost,
        /** 差多少境界 / 差多少点，给 UI 直接用 */
        levelGap: Math.max(0, q.minInnerLevel - level),
        pointGap: Math.max(0, q.cost - points)
      }
    })
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
  /**
   * **带小数的实时读数**：存档里的 `realSeconds` 只在日结钩子（96 / 4 现实秒一次）
   * 才推进，直接拿它当倒计时会一跳一跳。这里把「上次结算到现在」的墙钟差补上，
   * 供 UI 每秒重算一次。
   */
  factionLiveRealSeconds() {
    const base = Number(this.faction?.realSeconds) || 0
    const last = Number(this.faction?.lastRealMs) || 0
    if (!last) return base
    return base + Math.max((Date.now() - last) / 1000, 0)
  },
  /** 飞鹰阁·功法栏（3 个库位） */
  vaultArtsView() {
    const v = this.faction?.vault
    return (v?.arts || []).map(entry => ({
      ...entry,
      art: QI_ART_MAP[entry.artId] || null,
      learned: !!this.practice?.qiArts?.known?.[entry.artId]
    }))
  },
  /** 飞鹰阁·物资栏（6 个库位，含本命契合度给玩家看） */
  vaultGoodsView() {
    const v = this.faction?.vault
    const masters = PLAYER_FATES.map(fate => fate.id)
    return (v?.goods || []).map(entry => {
      const base = itemById(entry.baseId)
      return {
        ...entry,
        item: base,
        fit: base ? bestHarmonyOf(base, masters) : 0
      }
    })
  },
  /**
   * 飞鹰阁·「老九带货」待领取（2026-11-10）。
   * 到货不进背包，先摆在这里给玩家看一眼；**本区不受月刷 / 手动刷新影响**。
   */
  brokerDeliveryView() {
    const d = this.faction?.vault?.delivery
    if (!d || !d.item) return null
    const item = d.item
    return {
      item,
      name: item.name || itemById(item.baseId)?.name || item.baseId,
      displayName: item.displayName || item.name || item.baseId,
      category: item.category || '',
      tier: Number(item.tier) || 0,
      quality: item.quality || '',
      price: Number(d.price) || 0,
      gap: Number(d.gap) || 0
    }
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

    // —— 2026-11-06 B8-b 老档迁移 ——
    // ① `faction.credit`（**一阶**挂账）→ 贡献点（1 点 = 1 二阶 = 100 一阶）。
    //    ⚠ **必须 ÷100**，照 1:1 迁会把金丹老档 1,241 万 一阶变成 1,241 万点。
    //    转出来的点也计入 `contributionTotal`（它本来就是俸禄发的），然后删字段。
    if (current.credit !== undefined) {
      const points = Math.floor((Number(current.credit) || 0) / 100)
      if (points > 0) {
        current.contribution = (Number(current.contribution) || 0) + points
        current.contributionTotal = (Number(current.contributionTotal) || 0) + points
      }
      delete current.credit
      changed = true
    }
    // ② 秘库两栏（arts + materials）→ 飞鹰阁（arts + goods）。
    //    功法栏结构没变、直接留；物资栏结构变了（materials → goods），
    //    清空并置 `monthKey = -1`，让下一次日结强制重摆一屏新货。
    if (!current.vault || typeof current.vault !== 'object') {
      current.vault = base.vault
      changed = true
    } else {
      const v = current.vault
      if (!Array.isArray(v.arts)) {
        v.arts = []
        changed = true
      }
      if (!Array.isArray(v.goods)) {
        v.goods = []
        v.monthKey = -1
        delete v.materials
        delete v.materialBoughtThisMonth
        changed = true
      }
      // ④ 老九待领取的货（2026-11-10）：老档没有这个字段，补 null 即可
      if (!('delivery' in v)) {
        v.delivery = null
        changed = true
      }
      // ③ 老九老档订单：旧口径「下单即扣 400、到货再抽签」没有 `deliverBaseId`。
      //    这里补抽一次并补上 `prepay`（旧档按 400 记），否则 `settleBroker` 会当成失手。
      if (v.broker && !v.broker.deliverBaseId && v.broker.chosenTag && Array.isArray(v.broker.pool)) {
        const picked = brokerDrawOf(v.broker.pool, v.broker.chosenTag, itemTagsOf)
        const base = picked.length ? itemById(picked[0]) : null
        v.broker.deliverBaseId = base?.id || null
        v.broker.price = base ? brokerPriceOf(base) : 0
        v.broker.prepay = Number(v.broker.prepay) || 400
        v.broker.gap = v.broker.price - v.broker.prepay
        delete v.broker.pool
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
    // P56-b：剧情任务线进度。老档补 `{ done: [] }` —— 已解锁的灵地不在这里补，
    // 它们本来就在 `practice.spiritLand.unlocked` 里（`story.done` 只用于展示）。
    if (!current.story || typeof current.story !== 'object') {
      current.story = base.story
      changed = true
    } else if (!Array.isArray(current.story.done)) {
      current.story.done = []
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

  /**
   * 完成一步门派剧情任务 → **直接解锁它带来的灵地**（P56-b）。
   *
   * 用户 2026-11-01 拍板：**不做地契道具**，任务完成即 `unlocked.push(landId)`。
   * 解锁写进 `practice.spiritLand.unlocked`（与开局赠送同一个数组），
   * `faction.story.done` 只记「这一步做完了」，不另存一份灵地清单。
   *
   * 幂等：已完成的步再调用直接返回 done，不重复扣点、不重复 push。
   */
  completeStoryQuest(questId) {
    const quest = STORY_QUEST_MAP[questId]
    if (!quest) return { ok: false, message: '没有这个剧情任务' }
    if (!this.faction) this.faction = defaultFactionState()
    const story = this.faction.story || (this.faction.story = { done: [] })
    const done = Array.isArray(story.done) ? story.done : (story.done = [])
    if (done.includes(questId)) return { ok: true, done: true, lands: [] }
    if (!this.factionUnlocked) return { ok: false, message: '飞鹰门尚未开放' }
    if (!storyLevelOkOf(quest, this.level)) {
      return { ok: false, message: `需内功 ${getRealmName(quest.minInnerLevel).name} 以上` }
    }
    const points = Number(this.faction.contribution) || 0
    if (points < quest.cost) {
      return { ok: false, message: `贡献点不足：还需 ${quest.cost - points} 点` }
    }

    this.faction.contribution = points - quest.cost
    const unlocked = this.practice.spiritLand.unlocked || (this.practice.spiritLand.unlocked = [])
    const granted = []
    for (const id of quest.lands) {
      if (!unlocked.includes(id)) {
        unlocked.push(id)
        granted.push(id)
      }
    }
    done.push(questId)
    this.pushFactionLog(
      `「${quest.name}」了结，得灵地 ${granted.length} 处，耗 ${quest.cost} 贡献点`
    )
    this.saveData()
    return { ok: true, done: false, lands: granted }
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
        return {
          ok: false,
          message: `需要 ${need} 名${getRealmName(task.requirements.minRealmLevel).name}以上、且没在忙的子嗣`
        }
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
    // 老九到点带货（离线重放传 silent，只进日志不弹横幅）
    const brokerArrived = this.settleBroker({ rng, silent })
    if (settled || refreshed || vaultChanged || brokerArrived || delta > 0) this.saveData()
    return settled || refreshed || vaultChanged || brokerArrived
  },

  /**
   * 重摆一次货架（月刷 / 手动刷新共用）。
   * 功法栏 3 位（心法整本）、物资栏 6 位（灵器/灵兽/灵材/灵植）。
   */
  rollVaultShelf({ rng = Math.random } = {}) {
    const v = this.faction.vault
    let seq = Number(v.seq) || 1
    const knownIds = Object.keys(this.practice?.qiArts?.known || {})
    const arts = rollVaultArts({
      arts: QI_ARTS,
      knownIds,
      innerLevel: this.level,
      count: FACTION_TUNING.eaglePavilion.artSlots,
      rng,
      startId: seq
    })
    seq += arts.length
    const goods = rollVaultGoods({
      pool: ITEM_POOL,
      innerLevel: this.level,
      count: FACTION_TUNING.eaglePavilion.goodsSlots,
      rng,
      startId: seq
    })
    seq += goods.length
    v.arts = arts
    v.goods = goods
    v.seq = seq
  },

  /** 月刷：每「飞鹰门月」（30 × 96 现实秒）**全部库位重随**，顺带重置手动刷新价 */
  refreshVault(nowSeconds, { rng = Math.random, force = false } = {}) {
    const v = this.faction.vault
    const monthKey = monthIndexOf(nowSeconds)
    if (!force && v.monthKey === monthKey) return false
    v.monthKey = monthKey
    v.manualRefreshUsed = 0
    this.rollVaultShelf({ rng })
    return true
  },

  /** 手动刷新：50 → 100 → 200 → 400，当月内递增，下月重置 */
  manualRefreshVault({ rng = Math.random } = {}) {
    if (!this.vaultUnlocked) return { ok: false, message: '飞鹰阁尚未开放（练气八层）' }
    const v = this.faction.vault
    const cost = manualRefreshCostOf(v.manualRefreshUsed)
    if ((Number(this.faction.contribution) || 0) < cost) {
      return { ok: false, message: `贡献点不足（需要 ${cost}）` }
    }
    this.faction.contribution -= cost
    v.manualRefreshUsed = (Number(v.manualRefreshUsed) || 0) + 1
    this.rollVaultShelf({ rng })
    this.pushFactionLog(`手动刷新飞鹰阁货架，-${cost} 贡献点`)
    this.saveData()
    return { ok: true, cost }
  },

  /**
   * 买功法（整本、一次性）：扣贡献点 → 学功法。
   * 飞鹰阁**只收贡献点**（2026-11-06 B8-b），旧 `payWith: 'credit'` 已删。
   */
  buyVaultArt(entryId) {
    if (!this.vaultUnlocked) return { ok: false, message: '飞鹰阁尚未开放（练气八层）' }
    const entry = (this.faction.vault.arts || []).find(e => e.id === entryId && !e.sold)
    if (!entry) return { ok: false, message: '这本已经换走了' }
    if (!this.spendContribution(entry.price)) {
      return { ok: false, message: `贡献点不足（需要 ${entry.price}）` }
    }
    const result = this.learnQiArt(entry.artId, { save: false })
    entry.sold = true
    const name = QI_ART_MAP[entry.artId]?.name || entry.artId
    this.pushFactionLog(`从飞鹰阁换得《${name}》，-${entry.price} 贡献点`)
    this.saveData()
    return { ok: true, artId: entry.artId, alreadyKnown: !!result.alreadyKnown, name }
  },

  /**
   * 买物资（灵器 / 灵兽 / 灵材 / 灵植）：扣贡献点 → 生成一件实例进背包。
   * **只限库位、不限购** —— 买掉这一位就空，等下月刷新（2026-11-06 B8-b）。
   */
  buyVaultGoods(entryId, { rng = Math.random } = {}) {
    if (!this.vaultUnlocked) return { ok: false, message: '飞鹰阁尚未开放（练气八层）' }
    const v = this.faction.vault
    const entry = (v.goods || []).find(e => e.id === entryId && !e.sold)
    if (!entry) return { ok: false, message: '这件已经换走了' }
    const base = itemById(entry.baseId)
    if (!base) return { ok: false, message: '这件货已经不在物品池里' }
    if (!this.spendContribution(entry.price)) {
      return { ok: false, message: `贡献点不足（需要 ${entry.price}）` }
    }
    const item = createItemInstance(base, { quality: rollItemQuality(rng), rng })
    this.gainItem(item, { save: false })
    entry.sold = true
    this.pushFactionLog(`从飞鹰阁换得「${base.name}」，-${entry.price} 贡献点`)
    this.saveData()
    return { ok: true, item, name: base.name }
  },

  /**
   * 老九订货（《模块五》§13.3.3，**2026-11-06 改**）：**预扣 500 点 + 1 个「飞鹰门月」**。
   *
   * 下单瞬间按两个本命生成暗池（5~10 件、保底 1~2 件高契合），
   * 亮 4~5 个标签给玩家选；选定标签时**立即抽签**（固定 1 件），存下 `deliverBaseId`，
   * 到货按**实际那件的货架价 × 2** 结算，与预扣的 500 **多退少补**（`chooseBrokerTag` 里算的 `gap`）。
   *
   * ⚠ 抽签放在锁标签那一刻、不放结算时：这样 UI 能提前展示「到货需补 X / 退 X」，
   *   玩家可以决定要不要攒点。概率与「到货再抽」完全一致。
   */
  orderBroker({ rng = Math.random } = {}) {
    if (!this.vaultUnlocked) return { ok: false, message: '飞鹰阁尚未开放（练气八层）' }
    if (this.faction.vault.delivery) {
      return { ok: false, message: '上一单的货还没收，先去飞鹰阁「老九带货」收取' }
    }
    if (this.faction.vault.broker) return { ok: false, message: '上一单还没回来' }
    const cost = FACTION_TUNING.broker.prePay
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
      /** 预扣（二阶口径 = 贡献点），到货结算时多退少补 */
      prepay: cost,
      /** 抽签结果，锁标签时填：{ deliverBaseId, price, gap } */
      deliverBaseId: null,
      price: 0,
      gap: 0,
      orderedAt: now,
      readyAt: now + FACTION_TUNING.broker.delayMonths * 30 * FACTION_SECONDS_PER_DAY
    }
    this.pushFactionLog(`向老九下单，预扣 ${cost} 贡献点`)
    this.saveData()
    return { ok: true, tags: this.faction.vault.broker.tags }
  },

  /**
   * 选定暗池标签（选定后不可改）—— 同时**立即抽签**并算好到货价。
   * @returns {{ ok:boolean, message?:string, name?:string, price?:number, gap?:number }}
   *   `gap > 0` = 到货要补的点数；`gap < 0` = 到货会退的点数。
   */
  chooseBrokerTag(tag, { rng = Math.random } = {}) {
    const broker = this.faction.vault.broker
    if (!broker) return { ok: false, message: '没有进行中的订单' }
    if (broker.chosenTag) return { ok: false, message: '标签已经锁定' }
    if (!(broker.tags || []).includes(tag)) return { ok: false, message: '不在这一单的标签里' }
    broker.chosenTag = tag
    const picked = brokerDrawOf(broker.pool || [], tag, itemTagsOf, rng)
    const base = picked.length ? itemById(picked[0]) : null
    broker.deliverBaseId = base?.id || null
    broker.price = base ? brokerPriceOf(base) : 0
    broker.gap = broker.price - (Number(broker.prepay) || 0)
    // 暗池抽完就没用了，删掉省存档体量（P58/P62 的口径：别留无用的整块数据）
    delete broker.pool
    const name = base?.name || '别的货'
    const tail =
      broker.gap > 0 ? `，到货需补 ${broker.gap} 点` : broker.gap < 0 ? `，到货退 ${-broker.gap} 点` : ''
    this.pushFactionLog(`老九记下「${tag}」：${name}${tail}`)
    this.saveData()
    return { ok: true, name, price: broker.price, gap: broker.gap }
  },

  /**
   * 到点交货：没选标签就一直等着（不吞单）。
   *
   * 结算 = 按 `gap` 多退少补：
   *   · `gap < 0` → 退还 |gap| 点（**不计入累计贡献**，只是把预扣的还回来）
   *   · `gap > 0` → 扣 gap 点；**贡献点不够就挂起**，攒够后下一拍自动交付（不吞货）
   *
   * ⚠ **到货只「上架待领取」、不直接进背包**（2026-11-10 用户拍板）：
   *   货写进 `vault.delivery`，摆在飞鹰阁「老九带货」区，玩家点「收货」才 `gainItem`
   *   （见 `claimBrokerDelivery`）。理由：直接进背包玩家感知不到自己买没买到。
   *
   * ⚠ **`vault.delivery` 与 `vault.broker` 都不在 `rollVaultShelf` 的覆盖范围里** ——
   *   飞鹰阁 9 个库位每月 / 每次手动刷新整体重随（覆盖 `v.arts` / `v.goods`），
   *   若把到货写进货架就会被刷掉。**别为了省字段把它塞进 `goods`**。
   *   回归断言见 `verify-faction`「老九：月刷不丢在途订单 / 月刷不丢待领取的货」。
   */
  settleBroker({ rng = Math.random, silent = false } = {}) {
    const broker = this.faction.vault.broker
    if (!broker || !broker.chosenTag) return false
    if (this.factionRealSeconds < (Number(broker.readyAt) || 0)) return false
    const gap = Number(broker.gap) || 0
    const have = Number(this.faction.contribution) || 0
    if (gap > 0 && have < gap) return false
    const base = itemById(broker.deliverBaseId)
    if (!base) {
      // 货已经不在池里（删过底材）：退预扣、清单，别让玩家白丢 500 点
      this.faction.contribution = have - gap
      this.faction.vault.broker = null
      this.pushFactionLog('老九带货失手，预扣已退回')
      this.saveData()
      return true
    }
    this.faction.contribution = have - gap
    const item = createItemInstance(base, { quality: rollItemQuality(rng), rng })
    this.faction.vault.broker = null
    // 先摆上「老九带货」区，等玩家自己收 —— 成色在到货那一刻就定死，收取只是搬运
    this.faction.vault.delivery = {
      item,
      price: Number(broker.price) || 0,
      gap,
      arrivedAt: this.factionRealSeconds
    }
    const tail = gap > 0 ? `，补 ${gap} 点` : gap < 0 ? `，退 ${-gap} 点` : ''
    this.pushFactionLog(`老九带货归来：「${base.name}」，去飞鹰阁收货（${broker.price} 点${tail}）`)
    // 第 2 档横幅：到货已经发生、不需要确认；玩家多半不在飞鹰阁页，流水一行容易错过
    if (!silent) emitNotice({ kind: 'broker', name: base.name, price: broker.price, gap })
    this.saveData()
    return true
  },

  /**
   * 收老九送来的货：`vault.delivery` → 背包。
   *
   * 不收货就一直挂着（不超时、不被刷新刷掉），但**不能下新单**（`orderBroker` 拦），
   * 所以不会堆积成第二件。
   */
  claimBrokerDelivery() {
    const v = this.faction?.vault
    const d = v?.delivery
    if (!d || !d.item) return { ok: false, message: '没有待收的货' }
    const name = d.item.name || itemById(d.item.baseId)?.name || d.item.baseId
    this.gainItem(d.item, { save: false })
    v.delivery = null
    this.pushFactionLog(`收起老九带货：「${name}」`)
    this.saveData()
    return { ok: true, name }
  }
}
