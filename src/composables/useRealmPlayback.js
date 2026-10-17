// 秘境回放：只负责「把已经算好的 frames 按倍速放出来」。
//
// ⚠ 这不是游戏计时器：战斗结算已经由 plugins/secretRealm.js 同步算完，
//   这里只控制演示节奏。整套代码里唯一的游戏计时器仍然是 gameClock。
// ⚠ 用单个 requestAnimationFrame 同时驱动帧推进与 Buff 的 10 秒倒计时；
//   onUnmounted 必须停掉，句柄绝不进 Pinia。
import { computed, onUnmounted, ref } from 'vue'

/** 1 倍速下每帧停留的现实毫秒数（占位，纯演出参数） */
const FRAME_MS = 420

export const useRealmPlayback = () => {
  const frames = ref([])
  const cursor = ref(0)
  const playing = ref(false)
  const speed = ref(1)
  const countdownLeft = ref(0)

  let raf = null
  let lastFrameAt = 0
  let countdownEndsAt = 0
  let countdownCb = null
  let doneCb = null

  const currentFrame = computed(() => (cursor.value > 0 ? frames.value[cursor.value - 1] : null))
  const progressPct = computed(() =>
    frames.value.length ? Math.min((cursor.value / frames.value.length) * 100, 100) : 0
  )

  const ensureLoop = () => {
    if (!raf) raf = requestAnimationFrame(tick)
  }
  const stopLoop = () => {
    if (raf) cancelAnimationFrame(raf)
    raf = null
  }

  const tick = ts => {
    raf = null
    let active = false

    if (playing.value) {
      active = true
      const interval = FRAME_MS / Math.max(Number(speed.value) || 1, 1)
      if (!lastFrameAt) lastFrameAt = ts
      while (ts - lastFrameAt >= interval && cursor.value < frames.value.length) {
        lastFrameAt += interval
        cursor.value += 1
      }
      if (cursor.value >= frames.value.length) {
        playing.value = false
        active = false
        const cb = doneCb
        doneCb = null
        if (cb) cb()
      }
    }

    if (countdownCb) {
      countdownLeft.value = Math.max((countdownEndsAt - ts) / 1000, 0)
      if (countdownLeft.value <= 0) {
        const cb = countdownCb
        countdownCb = null
        countdownLeft.value = 0
        if (cb) cb()
      } else {
        active = true
      }
    }

    if (active) ensureLoop()
    else stopLoop()
  }

  /** 载入一段帧并开始回放。onDone 只在自然放完时触发；skip 也会触发 */
  const load = (newFrames = [], onDone = null) => {
    frames.value = Array.isArray(newFrames) ? newFrames : []
    cursor.value = 0
    lastFrameAt = 0
    doneCb = onDone
    playing.value = frames.value.length > 0
    if (playing.value) ensureLoop()
    else if (doneCb) {
      const cb = doneCb
      doneCb = null
      cb()
    }
  }

  /** 跳过动画：直接到段尾并触发 onDone */
  const skip = () => {
    cursor.value = frames.value.length
    playing.value = false
    stopLoop()
    const cb = doneCb
    doneCb = null
    if (cb) cb()
  }

  const setSpeed = value => {
    speed.value = Math.max(Number(value) || 1, 1)
  }

  /** Buff 10 秒倒计时；到期调用 onExpire（只调一次） */
  const startCountdown = (seconds, onExpire) => {
    countdownEndsAt = performance.now() + Math.max(Number(seconds) || 0, 0) * 1000
    countdownLeft.value = Math.max(Number(seconds) || 0, 0)
    countdownCb = onExpire
    ensureLoop()
  }

  const cancelCountdown = () => {
    countdownCb = null
    countdownLeft.value = 0
  }

  const stop = () => {
    playing.value = false
    countdownCb = null
    stopLoop()
  }

  onUnmounted(stop)

  return {
    frames,
    cursor,
    playing,
    speed,
    countdownLeft,
    currentFrame,
    progressPct,
    load,
    skip,
    setSpeed,
    startCountdown,
    cancelCountdown,
    stop
  }
}
