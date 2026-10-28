// 游戏时钟的 store 侧接线：**只放 actions/getters，不放 state**
//
// 计时器句柄与钩子表活在 gameClock.js 的模块闭包里 —— 进 state 就会被序列化
// 进存档，而且 $reset() 会重建 state 却清不掉旧 timer。
// 这里只把 clockState 这个 reactive 影子对象透出去给 UI 读。
import {
  clockState,
  register,
  start,
  stop,
  pause,
  resume,
  // 加下划线别名：这两个与下面的 action 方法同名，别名开避免读代码时混淆
  pauseForEvent as _pauseForEvent,
  resumeFromEvent as _resumeFromEvent
} from '../../plugins/gameClock'
import { MODES } from '../../plugins/idleMode'

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
 * 其余路由（修行 / 探索 / 秘境 / 首页 / **内宅**）属自动推进模块，时间照走。
 *
 * 键是**路径去掉前导斜杠**（'inventory'），不是路由 name ——
 * 现有路由的 name 大小写不统一（'Inventory' / 'gm' / 'alchemy'），路径才是干净的。
 *
 * ⚠ **内宅不在表里是有意的**：它是一个「看着它自己跑」的页面 ——
 *   时间继续流动，晚间到点自动留宿，流水账往下滚。所以它既不是管理页，
 *   也不能靠暂停来节流（节流阀是体力，不是时间）。
 *   判断「某页该不该暂停」的标准是**玩家是不是在做一个需要停下来思考的配置**，
 *   而不是「它是不是一个新模块」。
 *
 * 后续模块上线时往这里加（若确实需要暂停）：封地经营 / 经济交易 /
 * 任务派遣 / 事件处理 / 离线报告 / 流水账。
 */
// P17：'gacha' 已随抽奖页删除，替换为 'shop'（郑家宝阁是配置/消费页，需要停下来操作）
export const PAUSE_ROUTES = new Set(['inventory', 'settings', 'gm', 'achievements', 'shop', 'alchemy', 'cultivation'])

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
  },
  /** 当前游戏秒（只读影子）。探索/秘境的启动与结算用它，避免各处直接 import clockState */
  nowGameSeconds() {
    return clockState.currentTime
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
      register('tick', () => {
        // 先把时间写回 state —— 后面的结算（含末尾的 saveData）才能把它一起落盘
        this.clockGameTime = clockState.currentTime
        /**
         * 叙事弹窗的 20 秒超时（《探索系统》§9.1）。
         * 放在模式分支**之前**、且不判断探索模式：玩家中途回镇守时队列还在，
         * 不能因为「已经不在探索」就让弹窗永久挂着。
         * 弹窗本身不暂停时钟，所以这条只做「到点自动选善意」。
         */
        this.expireNarratives(clockState.currentTime)
        /**
         * 药浴池：**全天候转换**（1 件/游戏小时），所以不挂在镇守分支里 ——
         * 探索 / 秘境时 dayLoop 冻结，池子照样要转（《炼体药浴》§9.2）。
         * 懒结算：按「上次结算 → 现在」的整小时数转，没到整小时就什么都不做。
         * 离线重放不走 tick，由 `advanceDayLoop` 补一次（同一个 action，幂等）。
         */
        this.settleBathPool(clockState.currentTime)
        /**
         * 「桂冈的一天」接管了每秒结算。
         *
         * 它内部按**任务边界**把这一 tick 切成若干片，只在**练功**那一片上调 gainSpirit
         * （灵力 + 熟练度都只在练功产出），睡觉片上回体力，其余只记账，最后统一落盘。
         *
         * ⚠ 这里不再无条件调 gainSpirit —— 那等于「24 小时都在练功」，
         *   白天怎么分配就没有取舍了（《桂冈的一天》§十二「练功是主业」）。
         *
         * ⚠ 三大挂机是**互斥**的：不在镇守时，练功/炼体/互动一律不结算，
         *   只有探索按游戏时间推进。秘境没有每秒进度（5 天在开局一次性扣）。
         */
        if (this.idleMode === MODES.GARRISON) {
          // 养伤期间镇守日常冻结，只推进「养伤读条」；到期后 advanceInjury 会重新锚定。
          // ⚠ 判据是 `injuryUntilSeconds > 0`（还有养伤记录），不是 `isInjured` ——
          //   后者在到期那一 tick 已经是 false，会漏掉收尾。
          if (Number(this.injuryUntilSeconds) > 0) this.advanceInjury(clockState.currentTime)
          else this.advanceDayLoop(clockState.currentTime)
        } else if (this.idleMode === MODES.EXPLORATION) {
          this.advanceExploration(clockState.currentTime)
        }
      })
      /**
       * 模块二：内宅的每日推进（孕程、产后恢复、位阶晋升）。
       * ⚠ 体力**不再**在这里回满 —— 改由「桂冈的一天」的睡觉阶段回补，见 dayLoop。
       *
       * 用钩子给的 gameTime（= 日边界，i × 86400）而不是 clockState.currentTime ——
       * 后者最多可能超前 5 游戏小时（MAX_TICK_REAL_SECONDS 的钳制），不是干净的边界。
       *
       * ⚠ 这个 `hooked` 布尔是全模块唯一的防重复注册机制，绝不能去掉：
       *   重复注册会让每天结算跑多次（App.vue 挂载 + HMR 各来一次就够了）。
       * onHour 已用于晚间留宿；onMonth 已用于月俸（见下）；onYear 仍不注册，
       * 接口留在 gameClock.register。
       */
      register('day', gameTime => {
        this.advanceInnerCourtDay(gameTime)
        // 模块四封地：与内宅同一处 00:00 边界。巡视 ×2 由 estate 自己读 dayLoop 判定
        // （tick 先于边界钩子触发，所以此刻 dayLoop 已推进到该刻）。
        this.advanceEstateDay(gameTime)
      })
      /**
       * 模块六：月俸（2026-10-21）。
       *
       * 一个游戏月 = 30 游戏天 ≈ 48 现实分钟。跨边界时 `checkBoundary` 会补触发，
       * 所以掉帧跨了多个月也能一次补发多月，不会吞。
       * 发的是凡俗层大子，数额锚点见 `plugins/salary.js`。
       */
      register('month', gameTime => {
        this.paySalaryUpTo(gameTime)
      })
      /**
       * 模块二：晚间到点自动留宿。
       *
       * 挂在 hour 而不是 day，是因为设计 §5.1 写的是「进入晚间（游戏时间 20:00）」——
       * 一晚是 24 现实秒，20 点在每天的第 20 秒。checkBoundary 会逐个补触发
       * 掉帧跨过的边界，所以一次 tick 推进 5 个游戏小时也不会漏掉 20 点这一次。
       * 非自动模式时这个回调什么都不做（一行判断退出）。
       */
      register('hour', gameTime => {
        // 不在镇守时晚间互动停止（《三大挂机》§1.1）。日内其他推进（孕程、位阶）
        // 仍走 day 钩子，不受影响。
        if (this.idleMode !== MODES.GARRISON) return
        this.onInnerCourtHour(gameTime)
      })
    }
    start()
  },

  stopClock() {
    stop()
  },

  /**
   * 按当前路由同步暂停状态。由 router 的 afterEach 调用。
   * @param routeKey 路径去掉前导斜杠（形如 'cultivation'）；也接受完整 path
   *
   * **一行都不用改**就能与事件暂停共存：`resume()` 只清路由持有者，
   * 事件持有者还在时 gameClock.applyState() 依然派生 'paused_event'。
   * 详见 gameClock.js 的「暂停持有者」注释。
   */
  syncClockPause(routeKey) {
    const key = routeKeyOf(routeKey)
    if (PAUSE_ROUTES.has(key)) pause(key)
    else resume()
  },

  /**
   * 事件暂停：诞生弹窗开着时冻结时间。
   * 与 syncClockPause 走的路由暂停是两条独立的线，互相不会踩掉。
   */
  pauseClockForEvent(reason = null) {
    _pauseForEvent(reason)
  },

  resumeClockFromEvent(reason = null) {
    _resumeFromEvent(reason)
  }
}
