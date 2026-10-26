// 【探索】store 侧 —— 纯函数在 plugins/exploration.js，这里只做落账与存档。
//
// ⚠ 没有自己的 setInterval。推进入口是 clock.js 的 tick 钩子：
//   只有 idleMode === 'exploration' 时才会调 advanceExploration。
// ⚠ 探索事件是**非 tick 结算**（一 tick 可能补结算多个事件），必须自己 saveData()。
//   但奖励落账时全部传 `{ save: false }`，末尾统一存一次 —— 否则一个 8 秒 tick
//   会触发十几次 IndexedDB 加密写入。
import {
  TUNING,
  addRewardStats,
  advanceExploration as advanceExplorationPure,
  canEnterLocation,
  createExplorationSession,
  eventIntervalSeconds,
  formatRewardSummary,
  locationById,
  normalizeExplorationStats,
  rewardsOfResolution
} from '../../plugins/exploration'
import { SECONDS_PER_GAME_HOUR } from '../../plugins/gameClock'
import { createItemInstance, itemById } from '../../plugins/items'
import { pillRecipes } from '../../plugins/pills'
import { getRealmName } from '../../plugins/realm'
import { MODES, injuryLabelOf } from '../../plugins/idleMode'

/** 1 现实秒 = 多少游戏秒。叙事弹窗的 20 秒超时按游戏时间存，这里做换算。 */
const GAME_SECONDS_PER_REAL_SECOND = SECONDS_PER_GAME_HOUR * 3600
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback)

export const state = () => ({
  exploration: {
    active: false,
    locationId: '',
    startedAt: 0,
    nextEventAt: 0,
    /** { at, kind, text } —— at 是游戏秒，UI 用 dayDate 格式化 */
    log: [],
    /**
     * 一轮探索的累计。新会话整体替换，老档缺键由 normalizeExplorationStats 补齐。
     * stones = 一阶灵石；items = 灵植/灵材实例数；fragments = 丹方残页；
     * arts = 习得功法；chests = 宝匣；narratives = 叙事事件。
     */
    stats: normalizeExplorationStats(),
    /**
     * 叙事弹窗队列（《探索系统》§9.1）：`{ id, eventId, eventName, prompt,
     * autoChoice, options, at, expiresAt }`。
     * 普通事件不进队列，只进流水账。队长即当前弹窗。
     * ⚠ 老档没有这个键 —— 读档时靠 deepMerge 的默认值补上，不要写成可选链以外的东西。
     */
    narrativeQueue: []
  }
})

export const getters = {
  isExploring() {
    return this.exploration.active && this.idleMode === MODES.EXPLORATION
  },
  explorationLocation() {
    return locationById(this.exploration.locationId)
  },
  explorationNextEventInSeconds() {
    return Math.max((Number(this.exploration.nextEventAt) || 0) - (Number(this.clockGameTime) || 0), 0)
  },
  /** 当前要弹的叙事（队首）；没有就是 null */
  explorationNarrative() {
    return (this.exploration.narrativeQueue || [])[0] || null
  },
  /** 弹窗还剩几秒（现实秒，1x 速度下就是真实的秒数） */
  explorationNarrativeSecondsLeft() {
    const head = this.explorationNarrative
    if (!head) return 0
    const left = num(head.expiresAt) - num(this.clockGameTime)
    return Math.max(Math.ceil(left / GAME_SECONDS_PER_REAL_SECOND), 0)
  }
}

/** 随机一本丹方（残页落账用；纯函数层只给数量，不给具体丹方） */
const randomRecipeId = () => {
  if (!pillRecipes.length) return null
  return pillRecipes[Math.floor(Math.random() * pillRecipes.length)]?.id || null
}

export const actions = {
  /** 出发。境界门槛 = 地图推荐境界，禁止越阶。 */
  startExploration(locationId) {
    if (this.idleMode !== MODES.GARRISON) {
      this.setIdleModeNotice('请先回镇守，再出发探索')
      return { ok: false, reason: '不在镇守' }
    }
    if (this.isInjured) {
      this.setIdleModeNotice('正在养伤，无法外出')
      return { ok: false, reason: '养伤中' }
    }
    const location = locationById(locationId)
    if (!location) return { ok: false, reason: '地点不存在' }
    if (!canEnterLocation(this.level, location)) {
      const realm = getRealmName(Number(location.minLevel) || 1).name
      this.setIdleModeNotice(`境界不足，需要 ${realm}`)
      return { ok: false, reason: '境界不足' }
    }

    this.exploration = {
      ...createExplorationSession({
        nowSeconds: this.clockGameTime,
        locationId,
        tuning: TUNING
      }),
      // ⚠ 上一轮的叙事弹窗可能还没选（回镇守 → 再出发），别换会话时把它丢掉：
      //   丢了等于吞掉那次事件的奖励，而且玩家会觉得弹窗自己消失了。
      narrativeQueue: this.exploration.narrativeQueue || []
    }
    this.switchIdleMode(MODES.EXPLORATION)
    this.saveData()
    return { ok: true }
  },

  /**
   * 每 tick 的唯一入口。补结算到 now，并落账。
   * 战败 → 强制回家养伤（forceHomeInjured 会切回镇守）。
   */
  advanceExploration(toSeconds) {
    const exp = this.exploration
    if (!exp?.active) return
    const location = locationById(exp.locationId)
    if (!location) {
      // 数据被改坏 / 旧地点 id：不要卡在探索模式
      exp.active = false
      exp.locationId = ''
      this.setIdleModeNotice('旧探索地点已移除，请重新出发')
      this.switchIdleMode(MODES.GARRISON)
      return
    }

    const { state: nextState, resolutions, defeated } = advanceExplorationPure(
      exp,
      toSeconds,
      {
        location,
        playerLevel: this.level,
        knownQiArts: Object.keys(this.practice?.qiArts?.known || {}),
        tuning: TUNING
      },
      Math.random
    )
    this.exploration = nextState
    if (!resolutions.length) return

    this.applyExplorationBatch(resolutions, { nowSeconds: toSeconds })

    if (defeated) {
      // ⚠ 养伤从**当前 tick 时刻**起算，不从事件时刻起算：
      //   一次 tick 可能补结算 24 个事件（48 游戏小时），若战败发生在窗口前段，
      //   用事件时刻会让 1 天养伤在玩家看到之前就过期。日志仍记事件发生时刻。
      const defeatAt = resolutions[resolutions.length - 1]?.at ?? toSeconds
      this.forceHomeInjured(toSeconds)
      this.pushExplorationLog({
        at: defeatAt,
        kind: 'defeat',
        text: `重伤败退，被家人抬回镇守。养伤 ${injuryLabelOf()}。`
      })
    }
    this.saveData()
  },

  /**
   * 落一批已结算的探索事件（在线 / 离线共用）。
   *
   * 在线：叙事事件进弹窗队列，奖励等玩家选完才入账。
   * 离线（`narrative:'auto'`）：直接按 `autoChoice`（默认「相助」）入账，
   * **不入队、不弹窗** —— 180 天能积压上千个叙事，队列上限 3 只会把最旧的挤掉。
   *
   * 成就口径不变：`explorationCount` 是「事件次数」不是「出发次数」；
   * `eventTriggered` 是成就 exploration_9/10 读的字段。
   */
  applyExplorationBatch(resolutions = [], { narrative = 'queue', nowSeconds = this.clockGameTime } = {}) {
    if (!resolutions.length) return
    for (const ev of resolutions) {
      if (ev.kind === 'narrative' && ev.narrative) {
        if (narrative === 'auto') {
          for (const reward of rewardsOfResolution(ev)) {
            this.applyExplorationReward(reward, { save: false })
          }
        } else {
          this.enqueueNarrative(ev, { nowSeconds, save: false })
        }
        continue
      }
      for (const reward of ev.rewards || []) this.applyExplorationReward(reward, { save: false })
    }
    this.explorationCount += resolutions.length
    this.eventTriggered += resolutions.length
  },

  /** 奖励描述 → 现有资源/物品体系。批量落账统一传 `{ save: false }`。 */
  applyExplorationReward(reward, { save = false } = {}) {
    if (!reward) return
    const amount = Math.max(Number(reward.amount) || 0, 0)
    switch (reward.type) {
      case 'spiritual_stone':
        if (amount > 0) this.gainCurrency('spiritual', amount, { save })
        break
      case 'item': {
        const base = itemById(reward.baseId)
        if (!base) {
          console.warn('[exploration] 物品底材不存在:', reward.baseId)
          break
        }
        const count = Math.max(Number(reward.count) || 0, 0)
        for (let i = 0; i < count; i += 1) {
          const item = createItemInstance(base, { quality: reward.quality })
          if (item) this.gainItem(item, { save })
        }
        break
      }
      case 'pill_fragment':
        for (let i = 0; i < amount; i += 1) {
          const recipeId = randomRecipeId()
          if (recipeId) this.gainPillFragment(recipeId, { save })
        }
        break
      case 'qi_art': {
        const result = this.learnQiArt(reward.artId, { save })
        if (!result?.success) {
          // 纯函数已经按 knownQiArts 去重；这里是并发/脏档兜底：转 2 残页
          for (let i = 0; i < 2; i += 1) {
            const recipeId = randomRecipeId()
            if (recipeId) this.gainPillFragment(recipeId, { save })
          }
        }
        break
      }
      case 'chest':
        this.gainChest(reward.tier, 1, { save })
        break
      default:
        // 未知奖励类型不静默吞掉：留给控制台排查
        console.warn('[exploration] 未处理的奖励类型:', reward.type)
    }
  },

  /**
   * 叙事事件进弹窗队列（《探索系统》§9.1）。
   *
   * ⚠ 上限 **3**：第 4 个进来时把最旧的自动选善意 —— 不是丢弃，丢弃等于吞奖励。
   * ⚠ 超时按**游戏时间**算（20 现实秒 × 时钟速率）：时钟是唯一计时器，
   *   弹窗本身不暂停时钟，也不加 `PAUSE_ROUTES`。
   */
  enqueueNarrative(resolution, { nowSeconds = this.clockGameTime, save = false } = {}) {
    const narrative = resolution.narrative || {}
    const queue = [...(this.exploration.narrativeQueue || [])]
    queue.push({
      id: `${resolution.eventId || 'narrative'}@${num(resolution.at, nowSeconds)}`,
      eventId: resolution.eventId || '',
      eventName: resolution.eventName || '',
      prompt: narrative.prompt || resolution.text || '',
      autoChoice: narrative.autoChoice || 'help',
      options: narrative.options || [],
      at: num(resolution.at, nowSeconds),
      expiresAt: num(nowSeconds) + TUNING.narrativeTimeoutRealSeconds * GAME_SECONDS_PER_REAL_SECOND
    })
    this.exploration.narrativeQueue = queue
    while (this.exploration.narrativeQueue.length > TUNING.narrativeQueueLimit) {
      const head = this.exploration.narrativeQueue[0]
      this.resolveNarrativeHead(head?.autoChoice || 'help', { nowSeconds, timeout: true, save: false })
    }
    if (save) this.saveData()
  },

  /** 玩家在弹窗里点了一项 */
  chooseNarrative(optionId) {
    return this.resolveNarrativeHead(optionId, { nowSeconds: this.clockGameTime })
  },

  /**
   * 结算队首叙事：落奖励 → 记一行流水账 → 出队。
   * @param optionId   选项 id；缺省用事件声明的 autoChoice
   * @param timeout    true = 超时/积压自动善意，日志标「（超时自动）」
   */
  resolveNarrativeHead(optionId = null, { nowSeconds = this.clockGameTime, timeout = false, save = true } = {}) {
    const queue = [...(this.exploration.narrativeQueue || [])]
    const head = queue.shift()
    if (!head) return null

    const wanted = optionId || head.autoChoice || 'help'
    const option =
      (head.options || []).find(o => o.id === wanted) || (head.options || [])[0] || null
    const rewards = option?.rewards || []
    for (const reward of rewards) this.applyExplorationReward(reward, { save: false })
    this.exploration.stats = addRewardStats(this.exploration.stats, rewards)
    this.exploration.narrativeQueue = queue

    const summary = formatRewardSummary(rewards)
    const choice = option?.label ? `你选择${option.label}` : '你选择了离开'
    const tail = timeout ? `${choice}（超时自动）` : choice
    this.pushExplorationLog({
      at: num(nowSeconds),
      kind: 'narrative',
      text: [head.eventName ? `【${head.eventName}】` : '', option?.text || '', `· ${tail}`, summary ? `· ${summary}` : '']
        .filter(Boolean)
        .join(' ')
    })
    if (save) this.saveData()
    return { option, rewards }
  },

  /**
   * 每 tick 调一次（clock.js 的 tick 钩子）：超时未选的叙事自动选善意。
   * 探索中途回镇守、或者玩家长时间不动，都靠这里兜底。
   */
  expireNarratives(nowSeconds = this.clockGameTime) {
    let changed = false
    while (true) {
      const head = (this.exploration.narrativeQueue || [])[0]
      if (!head || num(head.expiresAt) > num(nowSeconds)) break
      this.resolveNarrativeHead(head.autoChoice || 'help', { nowSeconds, timeout: true, save: false })
      changed = true
    }
    if (changed) this.saveData()
    return changed
  },

  pushExplorationLog(entry) {
    const log = [...(this.exploration.log || []), entry]
    this.exploration.log = log.slice(-TUNING.logLimit)
  },

  /**
   * 读档自愈：不补算离线时段（离线结算属模块九），把下一次事件重锚到现在之后。
   * active 但模式不是探索（存档写了一半）时，修回探索模式。
   *
   * 旧地点 id（上游 5 图）与新四图不等价 → 直接作废会话，不做 id 映射。
   *
   * @returns {boolean} 是否改动了存档（调用方据此决定要不要落盘）
   */
  resetExplorationRuntime(nowSeconds = this.clockGameTime) {
    const exp = this.exploration
    if (!exp?.active) return false
    if (!locationById(exp.locationId)) {
      exp.active = false
      exp.locationId = ''
      this.idleMode = MODES.GARRISON
      this.setIdleModeNotice('旧探索地点已移除，请重新出发')
      return true
    }
    exp.stats = normalizeExplorationStats(exp.stats)
    exp.nextEventAt = Number(nowSeconds) + eventIntervalSeconds(TUNING)
    this.idleMode = MODES.EXPLORATION
    return true
  }
}
