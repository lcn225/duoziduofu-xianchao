// 三大挂机系统的模式状态（镇守 / 探索 / 秘境）。
//
// 约定：
//   · 只存**可序列化**的进度字段；计时器、回放帧、战斗实体都不在这里。
//   · 模式转换的判定走纯函数 `plugins/idleMode.js`，这里只做副作用与落盘。
//   · `switchIdleMode` **不负责启动探索** —— 它只收尾/设模式。
//     探索、秘境各自先建好会话，再调它，避免互相递归。
import {
  MODES,
  MODE_LABELS,
  canEnterMode,
  injuryUntilOf,
  isInjuredAt,
  isMode
} from '../../plugins/idleMode'

export const state = () => ({
  /** garrison | exploration | secretRealm */
  idleMode: MODES.GARRISON,
  /** 离开镇守的时刻（绝对游戏秒）。回镇守时用来截断当前任务，避免重放离开期间 */
  garrisonLeftAtSeconds: 0,
  /** 养伤开始时刻（绝对游戏秒）。给进度条用 */
  injuryStartedAtSeconds: 0,
  /** 养伤到期时刻（绝对游戏秒）。0 = 没受伤 */
  injuryUntilSeconds: 0,
  /** 顶栏/页面提示，例如「正在养伤，无法外出」 */
  idleModeNotice: ''
})

export const getters = {
  isInjured() {
    return isInjuredAt(this.clockGameTime, this.injuryUntilSeconds)
  },
  injuryRemainingSeconds() {
    return Math.max((Number(this.injuryUntilSeconds) || 0) - (Number(this.clockGameTime) || 0), 0)
  },
  /** 养伤读条进度（0~100）。用「开始/到期」两个绝对时刻算，刷新后仍然准确 */
  injuryProgressPct() {
    const until = Number(this.injuryUntilSeconds) || 0
    const now = Number(this.clockGameTime) || 0
    if (until <= now) return 100
    const start = Number(this.injuryStartedAtSeconds) || 0
    const total = Math.max(until - start, 1)
    return Math.min(Math.max(((now - start) / total) * 100, 0), 100)
  },
  idleModeLabel() {
    return MODE_LABELS[this.idleMode] || '镇守'
  },
  /** 秘境挑战是否进行中（fighting / buff 两个阶段） */
  secretRunActive() {
    const status = this.secretRealm?.run?.status
    return status === 'fighting' || status === 'buff'
  },
  canStartExploration() {
    return this.idleMode === MODES.GARRISON && !this.isInjured
  },
  canStartSecretRealm() {
    return this.idleMode === MODES.GARRISON && !this.isInjured && !this.secretRunActive
  }
}

export const actions = {
  /**
   * 切换模式。调用前，探索/秘境各自的 start 动作已经把会话建好。
   * @returns {{ ok: boolean, reason?: string }}
   */
  switchIdleMode(target, nowSeconds = this.clockGameTime) {
    const now = Number(nowSeconds) || 0
    const gate = canEnterMode({
      target,
      activeMode: this.idleMode,
      injured: this.isInjured,
      runActive: this.secretRunActive
    })
    if (!gate.ok) {
      this.idleModeNotice = gate.reason || '现在不能切换到该模式'
      return gate
    }
    if (target === this.idleMode) {
      this.idleModeNotice = ''
      return { ok: true }
    }

    const previous = this.idleMode
    // 离开镇守：记下时刻。dayLoop 不在这里改，回镇守时由 rebaseDayState 截断。
    if (previous === MODES.GARRISON) this.garrisonLeftAtSeconds = now
    // 离开探索：会话停止，但统计与日志保留（观战页回来还能看）
    if (previous === MODES.EXPLORATION && this.exploration) this.exploration.active = false
    // 离开秘境：释放回放用的时钟暂停（5 天成本已经扣过，别让暂停持有者泄漏）
    if (previous === MODES.SECRET_REALM) this.resumeClockFromEvent('secretRealm')

    this.idleMode = target
    this.idleModeNotice = ''

    // 回镇守：把当前任务截断到剩余时长，绝不补算离开期间的白日循环
    if (target === MODES.GARRISON) this.resumeGarrisonMode(now)

    this.saveData()
    return { ok: true }
  },

  /**
   * 探索战败：强制回家养伤。
   *
   * ⚠ **这里不调 resumeGarrisonMode**：养伤期间镇守日常要冻结，
   *   由 `advanceInjury` 在养伤结束时重新锚定。否则玩家一边「养伤」一边练功，
   *   看起来就是「说好的养伤呢」。
   */
  forceHomeInjured(nowSeconds = this.clockGameTime) {
    const now = Number(nowSeconds) || 0
    this.injuryStartedAtSeconds = now
    this.injuryUntilSeconds = injuryUntilOf(now)
    if (this.exploration) this.exploration.active = false
    this.idleMode = MODES.GARRISON
    this.idleModeNotice = '探索战败，回家养伤 1 天'
    if (!this.garrisonLeftAtSeconds) this.garrisonLeftAtSeconds = now
    this.saveData()
  },

  /**
   * 养伤期间每 tick 调用（clock.js 在 isInjured 时走这里，不走 advanceDayLoop）。
   * 到期后重新锚定镇守日常，读条结束。
   * @returns {boolean} 是否刚刚伤愈
   */
  advanceInjury(nowSeconds = this.clockGameTime) {
    const now = Number(nowSeconds) || 0
    const until = Number(this.injuryUntilSeconds) || 0
    // ⚠ 不能用 `this.isInjured` 判断：它是 `until > now`，到期那一 tick 已经是 false，
    //   于是永远不会走到「清掉养伤、重锚日常」这一步。
    //   判据必须是「是否还存在一条养伤记录」（until > 0）。
    if (!until) return false
    if (now < until) return false
    this.injuryUntilSeconds = 0
    this.injuryStartedAtSeconds = 0
    this.idleMode = MODES.GARRISON
    this.idleModeNotice = ''
    this.resumeGarrisonMode(now)
    this.pushDayLog('养伤结束，恢复日常')
    this.saveData()
    return true
  },

  setIdleModeNotice(text) {
    this.idleModeNotice = String(text || '')
  },
  clearIdleModeNotice() {
    this.idleModeNotice = ''
  },

  /**
   * 读档后的自愈（persistence.initializePlayer 调用）。
   * 只处理「模式与进度对不上」的脏数据，不主动改变合法状态。
   */
  resetIdleRuntime() {
    if (!isMode(this.idleMode)) this.idleMode = MODES.GARRISON
    if (!isInjuredAt(this.clockGameTime, this.injuryUntilSeconds)) {
      this.injuryUntilSeconds = 0
      this.injuryStartedAtSeconds = 0
    } else {
      // 带着伤读档：人一定在镇守，不能还在探索
      this.idleMode = MODES.GARRISON
      if (this.exploration) this.exploration.active = false
    }
    if (this.idleMode === MODES.EXPLORATION && !this.exploration?.active) {
      this.idleMode = MODES.GARRISON
    }
    if (this.idleMode === MODES.SECRET_REALM && !this.secretRunActive) {
      this.idleMode = MODES.GARRISON
    }
    if (this.idleMode === MODES.GARRISON) this.garrisonLeftAtSeconds = 0
  }
}
