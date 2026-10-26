// 调试日志的运行时层（P15.6）。
//
// **不进 Pinia state**：日志与目录句柄都放在模块闭包里，理由与 gameClock 的计时器相同 ——
//   · `saveData()` 会序列化 `{ ...this.$state }`，日志进 state 就会跟着存档膨胀；
//   · FileSystemDirectoryHandle 不可序列化，进 state 还会被 Proxy 包一层，方法调用会坏。
// 代价：刷新页面后日志与目录授权都会丢，需要在 GM 页重新点一次（设计上接受）。
//
// 采集只在**镇守**发生：灵力/修为本来就只在 dayLoop 的切片里产出。
// 探索/秘境期间不结算，`debugCheckDay` 会在回到镇守时把跨越的天数记成 `coveredDays`。
import { reactive } from 'vue'
import {
  DEBUG_TUNING,
  createAccumulator,
  noteSpirit,
  noteCultivation,
  noteStamina,
  noteSlice,
  buildDayRecord,
  formatRecord,
  toJsonLine
} from '../../plugins/debugLog.js'
import { TUNING as DAY_TUNING, patrolHoursOfDay } from '../../plugins/dayLoop.js'

/** 目录句柄：**不能**放进 reactive（Proxy 会破坏 FileSystemDirectoryHandle 的方法） */
let dirHandle = null

/**
 * 写盘串行化。`debugWriteRecord` 是「读全文 → 追加 → 写回」，两条并发会互相覆盖。
 * 自动换日与手动结算可能挨得很近，所以用一条 Promise 链排队。
 */
let writeChain = Promise.resolve()

/**
 * UI 读得到的部分。`records` 是环形缓冲，最新在后。
 * `pending` 是当天正在收集的累加器 —— 不展示全量，只给 GM 页看实时进度用。
 */
const debugState = reactive({
  enabled: false,
  records: [],
  pending: null,
  status: '未启用',
  dirName: '',
  writeError: '',
  lastFlushAt: 0
})

/** 日初快照：计划值全部由它推导（见 plugins/debugLog.js 的 expectedOutputs） */
const snapshotOf = store => ({
  level: Number(store.level) || 1,
  bodyLevel: Number(store.bodyLevel) || 1,
  rate: Number(store.spiritPerGameHour) || 0,
  harmony: Number(store.overallHarmony) || 0,
  luck: Number(store.luck) || 1,
  childrenRaw: Number(store.offspringRawBonus) || 0,
  childrenBonus: Number(store.offspringCultivationBonus) || 0,
  shrineBonus: Number(store.shrineCultivationBonus) || 0,
  // 今天**实际**巡视几小时（按 patrolEndSeconds 快照）—— 中途拖滑杆不改今天的计划值
  patrolHours: Number(store.dayLoop ? patrolHoursOfDay(store.dayLoop) : DAY_TUNING.patrol.defaultHours),
  bodyEnabled: !!store.dayLoop?.bodyEnabled,
  arts: [...(store.dayLoop?.arts || [])]
})

/** 日末读数：只保留记录里要用的字段，避免把整个 store 拍进日志 */
const nowOf = store => ({
  level: Number(store.level) || 1,
  bodyLevel: Number(store.bodyLevel) || 1,
  rate: Number(store.spiritPerGameHour) || 0,
  overallHarmony: Number(store.overallHarmony) || 0,
  nextGateRequirement: Number(store.nextGateRequirement) || 0,
  nextGateGap: Number(store.nextGateGap) || 0,
  isBreakthroughBlocked: !!store.isBreakthroughBlocked,
  isLandTierSufficient: !!store.isLandTierSufficient,
  childrenRaw: Number(store.offspringRawBonus) || 0,
  childrenBonus: Number(store.offspringCultivationBonus) || 0
})

export const getters = {
  debugState() {
    return debugState
  },
  /** 最新一条（GM 页顶部的摘要行） */
  debugLatest() {
    return debugState.records[debugState.records.length - 1] || null
  },
  /** 当天还没结算的实时进度（只读副本，避免 UI 直接改累加器） */
  debugPendingView() {
    const acc = debugState.pending
    if (!acc) return null
    return {
      day: acc.workDayIndex,
      hours: { ...acc.hours },
      spirit: acc.spirit,
      cultivation: acc.cultivation,
      bodyCultivation: acc.bodyCultivation,
      staminaSpent: acc.staminaSpent
    }
  }
}

export const actions = {
  // ---------- 开关与目录 ----------

  /** 开/关采集。关闭时把当天已收集的部分按 partial 记一条，不丢。 */
  debugSetEnabled(on) {
    const next = !!on
    if (next === debugState.enabled) {
      return { success: true, message: next ? '调试日志已在记录' : '调试日志已关闭' }
    }
    if (!next) {
      this.debugFlushDay('disable')
      debugState.enabled = false
      debugState.pending = null
      debugState.status = '已关闭'
      return { success: true, message: '调试日志已关闭' }
    }
    debugState.enabled = true
    debugState.pending = null
    debugState.status = dirHandle
      ? `已开启（写入 ${debugState.dirName}/log/debug.jsonl）`
      : '已开启（仅存内存，未选日志目录）'
    return { success: true, message: debugState.status }
  },

  /**
   * 选择写盘目录（File System Access API）。
   * 用户选**游戏根目录**，代码在里面建 `log/`，写 `debug.jsonl`。
   *
   * ⚠ 只能由点击事件同步调用 —— 浏览器要求用户手势，定时器/自动恢复会抛安全错误。
   * ⚠ 刷新页面后句柄丢失，需要重新选一次（刻意不持久化句柄）。
   */
  async debugChooseDirectory() {
    if (typeof window === 'undefined' || typeof window.showDirectoryPicker !== 'function') {
      debugState.status = '当前浏览器不支持目录写入（需 Chrome / Edge 桌面版）'
      return { success: false, message: debugState.status }
    }
    try {
      dirHandle = await window.showDirectoryPicker({ id: 'duoziduofu-log', mode: 'readwrite' })
      debugState.dirName = dirHandle.name || '(未命名目录)'
      debugState.writeError = ''
      debugState.status = `日志目录：${debugState.dirName}/log/debug.jsonl`
      return { success: true, message: debugState.status }
    } catch (error) {
      if (error?.name === 'AbortError') {
        return { success: false, message: '已取消选择' }
      }
      debugState.writeError = String(error?.message || error)
      debugState.status = `选择目录失败：${debugState.writeError}`
      return { success: false, message: debugState.status }
    }
  },

  debugClear() {
    debugState.records.splice(0, debugState.records.length)
    debugState.pending = null
    debugState.lastFlushAt = 0
    debugState.status = debugState.enabled ? '已清空缓冲（继续记录）' : '已清空缓冲'
  },

  /** 重置存档时一起清掉 —— `$reset()` 清不掉模块闭包，必须显式调用 */
  debugResetAll() {
    debugState.enabled = false
    debugState.records.splice(0, debugState.records.length)
    debugState.pending = null
    debugState.status = '未启用'
    debugState.dirName = ''
    debugState.writeError = ''
    debugState.lastFlushAt = 0
    dirHandle = null
  },

  // ---------- 采集（dayLoop / core / innerCourt 调用） ----------

  /** 懒建当天累加器；跨日则先把旧的那条结算掉 */
  debugEnsureAccumulator() {
    if (!debugState.enabled) return null
    const dayIndex = Number(this.dayLoop?.workDayIndex) || 0
    if (debugState.pending && debugState.pending.workDayIndex !== dayIndex) {
      this.debugFlushDay('day')
    }
    if (!debugState.pending) {
      debugState.pending = createAccumulator({
        workDayIndex: dayIndex,
        gameTime: this.clockGameTime,
        snapshot: snapshotOf(this)
      })
    }
    return debugState.pending
  },

  /** 练功切片：灵力 + 熟练度 */
  debugNoteSpirit(amount, seconds = 0) {
    const acc = this.debugEnsureAccumulator()
    if (acc) noteSpirit(acc, amount, seconds)
  },

  /** 打坐：修为 / 体魄 */
  debugNoteCultivation(parts) {
    const acc = this.debugEnsureAccumulator()
    if (acc) noteCultivation(acc, parts)
  },

  /** 体力：正数回、负数耗 */
  debugNoteStamina(delta) {
    const acc = this.debugEnsureAccumulator()
    if (acc) noteStamina(acc, delta)
  },

  /** 切片：小时数与精力 */
  debugNoteSlice(slice) {
    const acc = this.debugEnsureAccumulator()
    if (acc) noteSlice(acc, slice)
  },

  /**
   * 检查工作日是否变了 —— 变了就把上一日结算掉。
   * `advanceDayLoop` 在 ensureDayLoop 之后与整个 tick 结束时各调一次：
   * 前者处理「离开镇守几天后回来」，后者处理「这一 tick 里跨过了 06:00」。
   */
  debugCheckDay(workDayIndex) {
    if (!debugState.enabled || !debugState.pending) return
    if (debugState.pending.workDayIndex !== Number(workDayIndex)) {
      this.debugFlushDay('day')
    }
  },

  // ---------- 结算与写盘 ----------

  /**
   * 把当前累加器结算成一条日记录。
   * @param reason 'day' | 'disable' | 'mode' | 'manual'
   */
  debugFlushDay(reason = 'day') {
    const acc = debugState.pending
    if (!acc) return null
    debugState.pending = null

    const currentDay = Number(this.dayLoop?.workDayIndex)
    const coveredDays = Number.isFinite(currentDay)
      ? Math.max(1, currentDay - acc.workDayIndex)
      : 1

    const record = buildDayRecord(acc, {
      playerName: this.name,
      now: nowOf(this),
      endedAt: this.clockGameTime,
      coveredDays,
      partial: reason !== 'day' || coveredDays > 1,
      reason
    })

    debugState.records.push(record)
    if (debugState.records.length > DEBUG_TUNING.bufferLimit) {
      debugState.records.splice(0, debugState.records.length - DEBUG_TUNING.bufferLimit)
    }
    debugState.lastFlushAt = Number(this.clockGameTime) || 0
    debugState.status = `已记录 ${record.label} · ${formatRecord(record)}`

    // 写盘是异步副作用，**不 await** —— 它挂在 dayLoop 的结算路径上
    this.debugWriteRecord(record)
    return record
  },

  /** 手动结算（GM 页按钮）—— 不用等下一个 06:00 */
  debugFlushNow() {
    if (!debugState.enabled) {
      return { success: false, message: '先开启调试日志' }
    }
    if (!debugState.pending) {
      return { success: false, message: '当天还没有可结算的数据' }
    }
    const record = this.debugFlushDay('manual')
    return { success: !!record, message: record ? `已结算 ${record.label}` : '结算失败' }
  },

  /** 追加写 `log/debug.jsonl`。没有目录句柄时静默跳过（内存里仍有记录）。 */
  debugWriteRecord(record) {
    if (!dirHandle) return Promise.resolve()
    const handle = dirHandle
    const line = toJsonLine(record)
    writeChain = writeChain
      .then(async () => {
        const logDir = await handle.getDirectoryHandle('log', { create: true })
        const fileHandle = await logDir.getFileHandle('debug.jsonl', { create: true })
        const file = await fileHandle.getFile()
        const existing = await file.text()
        const writable = await fileHandle.createWritable()
        const prefix = existing && !existing.endsWith('\n') ? `${existing}\n` : existing
        await writable.write(`${prefix}${line}\n`)
        await writable.close()
        debugState.writeError = ''
      })
      .catch(error => {
        debugState.writeError = String(error?.message || error)
        debugState.status = `写入失败：${debugState.writeError}（记录仍在内存缓冲里）`
      })
    return writeChain
  },

  /** 导出内存缓冲为 JSONL 文本（不支持目录 API 时的兜底） */
  debugExportText() {
    return debugState.records.map(toJsonLine).join('\n') + (debugState.records.length ? '\n' : '')
  }
}
