// 游戏时钟的 store 侧接线：**只放 actions/getters，不放 state**
//
// 计时器句柄与钩子表活在 gameClock.js 的模块闭包里 —— 进 state 就会被序列化
// 进存档，而且 $reset() 会重建 state 却清不掉旧 timer。
// 这里只把 clockState 这个 reactive 影子对象透出去给 UI 读。
import { clockState, register, start, stop, pause, resume } from '../../plugins/gameClock'

/**
 * 只存**可序列化的游戏时间**。计时器句柄与钩子表活在 gameClock.js 的模块闭包里，
 * 绝不进 state —— 进 state 会被序列化进存档，而且 $reset() 会重建 state 却清不掉旧 timer。
 * 但 currentTime 是个纯数字，必须存，否则刷新页面日期就归零。
 */
export const state = () => ({
  clockGameTime: 0
})

/**
 * 这些路由下时间暂停（《时间系统》§3.2 的「暂停模块」落到现有路由）。
 * 其余路由（修行 / 探索 / 秘境 / 首页）属自动推进模块，时间照走。
 *
 * 键是**路径去掉前导斜杠**（'inventory'），不是路由 name ——
 * 现有路由的 name 大小写不统一（'Inventory' / 'gm' / 'alchemy'），路径才是干净的。
 *
 * 后续模块上线时往这里加：内宅管理 / 子嗣管理 / 封地经营 / 经济交易 /
 * 任务派遣 / 事件处理 / 离线报告 / 流水账。
 */
export const PAUSE_ROUTES = new Set(['inventory', 'settings', 'gm', 'achievements', 'gacha', 'alchemy'])

/** 把路由对象/路径统一成 PAUSE_ROUTES 的键 */
export const routeKeyOf = path => String(path || '').replace(/^\//, '').split('/')[0]

/** 防止 App.vue 多次挂载时重复注册钩子（模块级闭包，不进 state） */
let hooked = false

export const getters = {
  /** 时间状态（reactive 影子对象）：currentTime / state / pausedBy */
  gameClockState() {
    return clockState
  },
  isTimePaused() {
    return clockState.state !== 'running'
  }
}

export const actions = {
  /**
   * 注册时间钩子并启动时钟。App.vue 的 onMounted 调用。
   *
   * onTick 直接调 store action，用的是方法简写里的 `this` ——
   * 所以不需要 import { usePlayerStore }，不违反模块间禁止互相 import 的约定。
   *
   * 熟练度为什么挂在 tick 而不是 onHour：1 现实秒 = 1 游戏小时，两者同频，
   * 都挂会重复累加。tick 还能拿到**精确的游戏秒增量**（含钳制后的值）。
   */
  startClock() {
    if (!hooked) {
      hooked = true
      register('tick', ({ gameSeconds }) => {
        // 先把时间写回 state，gainSpirit 结尾的 saveData 才能把它一起落盘
        this.clockGameTime = clockState.currentTime
        this.gainSpirit(gameSeconds)
      })
      // onHour / onDay / onMonth / onYear 暂不注册：模块二~九还没落地。
      // 接口留在 gameClock.register，接入时直接注册即可。
    }
    start()
  },

  stopClock() {
    stop()
  },

  /**
   * 按当前路由同步暂停状态。由 router 的 afterEach 调用。
   * @param routeKey 路径去掉前导斜杠（形如 'cultivation'）；也接受完整 path
   */
  syncClockPause(routeKey) {
    const key = routeKeyOf(routeKey)
    if (PAUSE_ROUTES.has(key)) pause(key)
    else resume()
  }
}
