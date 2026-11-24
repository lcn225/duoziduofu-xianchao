// 气运轮盘（诞生抽奖）的 store 侧（2026-11-24 施工）
//
// 真源：《模块二》§6.0.2 · 《产出登记表》R74。
// 纯函数层在 `plugins/lottery.js` / `plugins/offspringAchievements.js`，这里只做：
//   ① 出生瞬间把「成就 → 抽数 / 档位」锁进队列；
//   ② 拉杆时把队列抽掉并落账。
//
// ⚠ 队列存 `(档位, 次数, 出生时刻)` 段，**出生瞬间锁定档位**（不积攒、不延后抬档）。
// ⚠ 离线只累计不自动抽 —— 重放在影子 store 上跑，队列跟着写回，上线亮红点。

import {
  LOTTERY_TIERS,
  lotteryDrawCountOf,
  lotteryPendingCountOf,
  lotteryQueueSummaryOf,
  rollLotteryQueueOf
} from '../../plugins/lottery.js'
import { evaluateOffspringAchievementsOf } from '../../plugins/offspringAchievements.js'

/** 最近诞生记录保留条数（只给面板看「为什么有抽数」，不参与判定） */
const LOTTERY_RECENT_LIMIT = 20

const emptyLotteryState = () => ({
  /** 待抽队列：`[{ tier, count, at }]`，按出生时刻追加 */
  queue: [],
  /** 累计已抽次数（统计用） */
  pulled: 0,
  /** 最近诞生：`[{ name, at, achievements:[id], draws }]`，最多 20 条 */
  recent: []
})

const normalizeQueueOf = queue =>
  (Array.isArray(queue) ? queue : [])
    .map(segment => ({
      tier: LOTTERY_TIERS.includes(segment?.tier) ? segment.tier : null,
      count: Math.max(Math.floor(Number(segment?.count) || 0), 0),
      at: Number(segment?.at) || 0
    }))
    .filter(segment => segment.tier && segment.count > 0)

export const state = () => ({
  lottery: emptyLotteryState()
})

export const getters = {
  /** 待抽总次数（MainNav 红点 / 面板按钮都读它） */
  lotteryPendingCount() {
    return lotteryPendingCountOf(this.lottery?.queue)
  },
  /** 按档位汇总的待抽次数 `{gray, white, green, blue, purple}` */
  lotteryQueueSummary() {
    return lotteryQueueSummaryOf(this.lottery?.queue)
  }
}

export const actions = {
  /**
   * 把一次出生的抽数锁进队列：第 1 抽灰、每多一抽抬一档、紫封顶。
   * 同一出生里连续同档（紫封顶后）合并成一段，`at` 相同。
   */
  appendLotteryDrawsOf(count, at = 0) {
    if (!this.lottery || typeof this.lottery !== 'object') this.lottery = emptyLotteryState()
    if (!Array.isArray(this.lottery.queue)) this.lottery.queue = []
    const n = Math.max(Math.floor(Number(count) || 0), 0)
    const time = Number(at) || 0
    for (let i = 0; i < n; i += 1) {
      const tier = LOTTERY_TIERS[Math.min(i, LOTTERY_TIERS.length - 1)]
      const last = this.lottery.queue[this.lottery.queue.length - 1]
      if (last && last.tier === tier && Number(last.at) === time) last.count += 1
      else this.lottery.queue.push({ tier, count: 1, at: time })
    }
    return n
  },

  /**
   * 出生挂点：判定子嗣成就 → 写入子嗣 → 把抽数锁进队列。
   *
   * ⚠ **必须在 `off.list.push(child)` 之前调用**：
   *   · 判定的计数口径是「这次出生之前」（在线缓存 / 离线索引都不含这个孩子）；
   *   · 调用顺序由 `deliverOffspring` / `deliverGrandchild` 保证，别挪到 push 之后。
   *
   * @returns {{ ids:string[], draws:number }} 本次达成的成就与新抽数
   */
  noteOffspringBirthAchievements(child, gameTime = 0) {
    if (!child) return { ids: [], draws: 0 }
    const counters = this.birthAchievementCountersOf?.()
    const ids = evaluateOffspringAchievementsOf(child, counters)
    if (ids.length) child.achievementIds = ids
    const draws = lotteryDrawCountOf(ids.length)
    this.appendLotteryDrawsOf(draws, gameTime)
    // 面板「最近诞生」：让玩家看得见抽数是怎么来的（不参与判定）
    if (!this.lottery || typeof this.lottery !== 'object') this.lottery = emptyLotteryState()
    if (!Array.isArray(this.lottery.recent)) this.lottery.recent = []
    this.lottery.recent.unshift({
      name: child.name || '',
      at: Number(gameTime) || 0,
      achievements: ids,
      draws
    })
    if (this.lottery.recent.length > LOTTERY_RECENT_LIMIT) {
      this.lottery.recent.length = LOTTERY_RECENT_LIMIT
    }
    return { ids, draws }
  },

  /**
   * 拉杆：把队列全部抽掉并落账。
   * 灰档直接加凡俗货币；白起档物品走 `gainItem`（灵材 / 消耗品按堆叠合并）。
   */
  pullLottery() {
    if (!this.lottery || typeof this.lottery !== 'object') this.lottery = emptyLotteryState()
    const queue = normalizeQueueOf(this.lottery.queue)
    const pending = lotteryPendingCountOf(queue)
    if (pending <= 0) return { ok: false, message: '暂无可抽次数' }

    const { entries, draws } = rollLotteryQueueOf(queue)
    for (const entry of entries) {
      if (entry.kind === 'currency') {
        this.gainCurrency?.(entry.currency, entry.amount, { save: false })
      } else if (entry.kind === 'item' && entry.item) {
        this.gainItem?.(entry.item, { save: false })
      }
    }
    this.lottery.queue = []
    this.lottery.pulled = (Number(this.lottery.pulled) || 0) + draws
    this.saveData?.()
    return {
      ok: true,
      entries,
      draws,
      // 「≤5 次按出生时间逐条播 / >5 次跳过动画、按品阶降序汇总」
      animated: draws <= 5
    }
  }
}
