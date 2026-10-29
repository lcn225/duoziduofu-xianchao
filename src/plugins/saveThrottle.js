// 落盘节流器（2026-10-29 P58）—— 纯逻辑，不碰 store、不碰 IndexedDB。
//
// **要解决的事**：`saveData` 全仓 130+ 处，`clock` 的 tick 里每秒至少一次
// （练功那一片 `gainSpirit` 存一次、`cultivate` 又存一次，实测内宅页 2.0 次/秒）。
// 每次都是「整档 toRaw 序列化 + 加密 + IndexedDB 写」，2MB 明文下等于主线程 100%，
// 帧率掉到 1.7（《下一步》P58 基线）。
//
// **策略**：调用只标脏；真正写盘最多 `intervalMs`（默认 5 秒）一次；
// 窗口外的调用落到「到点再写」。关键点（关页 / 切后台 / 读档收尾）调用方传 `force`。
//
// **代价（已登记，别当 bug 修）**：最多丢最后 5 秒的进度。
// 存档里的 `lastOnlineRealMs` 也是随写盘走的 —— 正常关页有 pagehide 兜底，
// 所以「离线时长」不会多算；只有进程被强杀才会少算 ≤5 秒。
//
// ⚠ 并发：一次写盘还没结束又来一次，**不并排写第二份**（否则可能后写的旧快照盖掉新快照），
//   而是标脏 + 排到下个窗口。写失败（加密失败 / IDB 抛错）时保持脏，5 秒后自动重试。
export const SAVE_INTERVAL_MS = 5000

/**
 * @param write  () => Promise —— 真正落盘的那一下（由 persistence 注入）
 * @param intervalMs 最短写盘间隔
 * @param now / setTimer / clearTimer 注入点，只给断言用（浏览器里就是 setTimeout）
 */
export const createSaveScheduler = ({
  write,
  intervalMs = SAVE_INTERVAL_MS,
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = id => clearTimeout(id)
} = {}) => {
  let dirty = false
  let timer = null
  let inFlight = null
  /** 上一次**开始**写盘的时刻；初值 -Infinity ⇒ 第一次调用立刻写 */
  let lastWriteAt = -Infinity

  const clearPending = () => {
    if (timer !== null) {
      clearTimer(timer)
      timer = null
    }
  }

  const schedule = delay => {
    if (timer !== null) return
    timer = setTimer(() => {
      timer = null
      // 定时器回调里没有调用方，错误在这里咽掉 —— write 自己已经 console.error 过
      void flush().catch(() => {})
    }, Math.max(0, delay))
  }

  /** 立刻写（脏才写；正在写就等那一次写完，不并排写第二份） */
  const flush = async () => {
    clearPending()
    if (!dirty) return null
    if (inFlight) {
      await inFlight
      return null
    }
    dirty = false
    lastWriteAt = now()
    inFlight = Promise.resolve()
      .then(write)
      .catch(() => {
        // 写失败 = 这一份没落地：重新标脏，下个窗口再试（不能静默丢掉）
        dirty = true
        return null
      })
      .finally(() => {
        inFlight = null
      })
    await inFlight
    // 写盘期间又被标脏 → 排到下个窗口，不紧接着再跑一遍（否则就是忙等）
    if (dirty) schedule(intervalMs)
    return null
  }

  return {
    /** 标脏；`force` 或窗口已到就立刻写，否则排到窗口末 */
    markDirty({ force = false } = {}) {
      dirty = true
      const wait = intervalMs - (now() - lastWriteAt)
      if (force || wait <= 0) return flush()
      schedule(wait)
      return Promise.resolve(null)
    },
    flush,
    isDirty: () => dirty,
    isWriting: () => inFlight !== null,
    /** 距离下一个可写窗口还剩多少毫秒（<=0 表示现在就能写） */
    waitMs: () => intervalMs - (now() - lastWriteAt),
    /** 仅供断言：把内部状态复位（不动已排的定时器） */
    _debug: () => ({ dirty, writing: inFlight !== null, lastWriteAt, hasTimer: timer !== null })
  }
}
