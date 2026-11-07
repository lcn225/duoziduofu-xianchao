import { INITIAL_REALM_NAME } from '../../plugins/realm.js'
import {
  DAN_LUN_LEVEL,
  buildDanLunSignalsOf,
  danLunById,
  danLunSnapshotOf,
  pickDanLunCandidatesOf
} from '../../plugins/danLun.js'

// 进度与统计：解锁项、成就、以及成就判定要读的各类计数器
export const state = () => ({
  // 成就与解锁项
  unlockedRealms: [INITIAL_REALM_NAME], // 已解锁境界
  unlockedLocations: ['新手村'], // 已解锁地点
  unlockedSkills: [], // 已解锁功法
  completedAchievements: [], // 已完成成就
  // 统计
  explorationCount: 0, // 探索次数
  itemsFound: 0, // 获得物品数量
  eventTriggered: 0, // 触发事件次数
  /**
   * P55-b：筑基后 24× 的「筑基之途 · 仙凡永别」提示。
   * `Shown` 进存档（一辈子只弹一次），`Visible` 是弹窗当前的开关（纯 UI 态）。
   * ⚠ 这个弹窗**不暂停时钟**（《时间刻度修订方案》§6.3），所以不走 clock 的事件暂停。
   */
  ascendedNoticeShown: false,
  ascendedNoticeVisible: false,
  /**
   * 丹论（2026-11-06）：结丹时立一条「道」，**一辈子一次**、纯文案 0 数值。
   * 真源 `design/20-系统设计/丹论系统.md`。
   *   · `danLun` 进存档（`{ id, name, verse, lines, source, chosenAt }`），元婴段要读它
   *   · `danLunCandidates` 是触发时的 3 条快照 —— **必须存**，否则刷新会重掷
   *   · `danLunNoticeVisible` 是纯 UI 态，但也进存档（刷新后接着弹）
   */
  danLun: null,
  danLunCandidates: [],
  danLunNoticeVisible: false,
  /**
   * 走过的探索图 id（`dao_star` 用）。
   * ⚠ `unlockedLocations` 是**死字段**（全库只有初始值 `['新手村']`，从没被写入），
   *   别再拿它数「走过几张图」。
   */
  visitedLocations: [],
  /** 叙事选择累计：`{ help }`（`dao_kind` 用） */
  narrativeChoiceCounts: { help: 0 }
})

export const getters = {
  /** 丹论判定信号（纯数据；断言可直接喂 `pickDanLunCandidatesOf`） */
  danLunSignals() {
    return buildDanLunSignalsOf(this)
  }
}

export const actions = {
  /** 记住走过的探索图（去重）。`startExploration` 里调 */
  noteVisitedLocation(locationId) {
    const id = String(locationId || '')
    if (!id) return
    const list = Array.isArray(this.visitedLocations) ? this.visitedLocations : []
    if (list.includes(id)) return
    this.visitedLocations = [...list, id]
  },

  /** 叙事选「相助」+1。玩家手选与超时/加速自动选都算 */
  noteHelpChoice() {
    const counts = this.narrativeChoiceCounts || {}
    this.narrativeChoiceCounts = { ...counts, help: (Number(counts.help) || 0) + 1 }
  },

  /**
   * 丹论看门狗：**金丹一层起、未立论、离线报告已确认** → 弹一次并暂停时钟。
   * 由 `clock.syncClockRealm()` 每 tick 调一次（和「仙凡永别」同一处）。
   *
   * ⚠ 必须暂停：金丹 168×，不暂停读 30 秒 = 走过 52 游戏天。
   * ⚠ 离线报告优先：两个居中弹窗会叠（同仙凡永别的排队方式）。
   * ⚠ `force` 落盘：「已弹过」与候选快照不能等 5 秒节流。
   */
  syncDanLunNotice() {
    if ((Number(this.level) || 1) < DAN_LUN_LEVEL) return
    if (this.danLun) return
    if (this.offlineReport) return
    if (this.danLunNoticeVisible) {
      // 刷新后重新持有暂停（读档时 clearEventPauses() 清空过事件持有者）
      this.pauseClockForEvent('danlun')
      return
    }
    const picked =
      (this.danLunCandidates || []).length > 0
        ? this.danLunCandidates
        : pickDanLunCandidatesOf(this.danLunSignals).map(danLunSnapshotOf).filter(Boolean)
    if (!picked.length) return
    this.danLunCandidates = picked
    this.danLunNoticeVisible = true
    this.pauseClockForEvent('danlun')
    this.saveData({ force: true })
  },

  /** 立论：写入存档、关弹窗、恢复时钟。返回是否成功 */
  chooseDanLun(id) {
    const list = this.danLunCandidates || []
    const entry =
      list.find(item => item.id === id) ||
      danLunSnapshotOf(danLunById(id)) ||
      list[0] ||
      null
    if (!entry) return false
    this.danLun = { ...entry, lines: [...(entry.lines || [])], chosenAt: Number(this.clockGameTime) || 0 }
    this.danLunNoticeVisible = false
    this.danLunCandidates = []
    this.resumeClockFromEvent('danlun')
    this.saveData({ force: true })
    return true
  }
}
