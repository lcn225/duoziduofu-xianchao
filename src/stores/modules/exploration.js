// 【探索】store 侧 —— 纯函数在 plugins/exploration.js，这里只做落账与存档。
//
// ⚠ 没有自己的 setInterval。推进入口是 clock.js 的 tick 钩子：
//   只有 idleMode === 'exploration' 时才会调 advanceExploration。
// ⚠ 探索事件是**非 tick 结算**（一 tick 可能补结算多个事件），必须自己 saveData()。
//   但奖励落账时全部传 `{ save: false }`，末尾统一存一次 —— 否则一个 8 秒 tick
//   会触发十几次 IndexedDB 加密写入。
import {
  TUNING,
  advanceExploration as advanceExplorationPure,
  canEnterLocation,
  createExplorationSession,
  eventIntervalSeconds,
  locationById,
  normalizeExplorationStats
} from '../../plugins/exploration'
import { createItemInstance, itemById } from '../../plugins/items'
import { pillRecipes } from '../../plugins/pills'
import { getRealmName } from '../../plugins/realm'
import { MODES, injuryLabelOf } from '../../plugins/idleMode'

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
    stats: normalizeExplorationStats()
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

    this.exploration = createExplorationSession({
      nowSeconds: this.clockGameTime,
      locationId,
      tuning: TUNING
    })
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

    for (const ev of resolutions) {
      for (const reward of ev.rewards) this.applyExplorationReward(reward, { save: false })
    }
    // 成就口径：explorationCount 是「事件次数」不是「出发次数」；
    // eventTriggered 是成就 exploration_9/10 读的字段，以前探索从不加。
    this.explorationCount += resolutions.length
    this.eventTriggered += resolutions.length

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
