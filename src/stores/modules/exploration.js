// 【探索】store 侧 —— 纯函数在 plugins/exploration.js，这里只做落账与存档。
//
// ⚠ 没有自己的 setInterval。推进入口是 clock.js 的 tick 钩子：
//   只有 idleMode === 'exploration' 时才会调 advanceExploration。
// ⚠ 探索事件是**非 tick 结算**（一 tick 可能补结算多个事件），必须自己 saveData()。
import {
  TUNING,
  advanceExploration as advanceExplorationPure,
  createExplorationSession,
  eventIntervalSeconds,
  locationById
} from '../../plugins/exploration'
import { getRandomHerb } from '../../plugins/herbs'
import { pillRecipes } from '../../plugins/pills'
import { MODES } from '../../plugins/idleMode'

export const state = () => ({
  exploration: {
    active: false,
    locationId: '',
    startedAt: 0,
    nextEventAt: 0,
    /** { at, kind, text } —— at 是游戏秒，UI 用 dayDate 格式化 */
    log: [],
    stats: { events: 0, wins: 0, losses: 0, stones: 0, herbs: 0, fragments: 0, cultivation: 0 }
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

export const actions = {
  /** 出发。地点与等级门槛复用旧数据（locations.js） */
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
    if (Number(this.level) < Number(location.minLevel)) {
      this.setIdleModeNotice(`境界不足，需要 ${location.minLevel} 级`)
      return { ok: false, reason: '境界不足' }
    }

    this.exploration = createExplorationSession({
      nowSeconds: this.clockGameTime,
      locationId
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
      // 数据被改坏：不要卡在探索模式
      exp.active = false
      this.switchIdleMode(MODES.GARRISON)
      return
    }

    const { state: nextState, resolutions, defeated } = advanceExplorationPure(
      exp,
      toSeconds,
      { location, level: this.level, luck: this.luck, tuning: TUNING },
      Math.random
    )
    this.exploration = nextState
    if (!resolutions.length) return

    for (const ev of resolutions) {
      for (const reward of ev.rewards) this.applyExplorationReward(reward)
    }
    this.explorationCount += resolutions.length

    if (defeated) {
      this.forceHomeInjured(toSeconds)
      this.pushExplorationLog({
        at: toSeconds,
        kind: 'defeat',
        text: '重伤败退，被家人抬回镇守。养伤 1 天。'
      })
    }
    this.saveData()
  },

  /** 奖励描述 → 现有资源/物品体系。首版不接功法/同参掉落。 */
  applyExplorationReward(reward) {
    if (!reward) return
    const amount = Math.max(Number(reward.amount) || 0, 0)
    if (!amount) return
    switch (reward.type) {
      case 'spirit_stone':
        this.spiritStones += amount
        break
      case 'herb':
        for (let i = 0; i < amount; i += 1) {
          const herb = getRandomHerb()
          if (herb) this.herbs.push(herb)
        }
        break
      case 'cultivation':
        this.cultivate(amount)
        break
      case 'pill_fragment':
        for (let i = 0; i < amount; i += 1) {
          const recipe = pillRecipes[Math.floor(Math.random() * pillRecipes.length)]
          if (recipe) this.gainPillFragment(recipe.id)
        }
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
   */
  resetExplorationRuntime(nowSeconds = this.clockGameTime) {
    const exp = this.exploration
    if (!exp?.active) return
    if (!locationById(exp.locationId)) {
      exp.active = false
      this.idleMode = MODES.GARRISON
      return
    }
    exp.nextEventAt = Number(nowSeconds) + eventIntervalSeconds(TUNING)
    this.idleMode = MODES.EXPLORATION
  }
}
