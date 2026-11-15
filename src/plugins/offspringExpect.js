// 【子嗣历练 · 离线期望值结算】（P62 优化方向 6，2026-11-14）
//
// 为什么要这个文件：金丹档块长 180 天，`resolveOffspringExpeditionDay` 在块内
// **仍逐个事件掷骰** —— 每人每块最多 12 × 1 × 0.8 × 180 = 1,728 次，
// 上限 10 人 × 168 块 ≈ 145~290 万次 `rollExploreEvent`。真档测速里历练单独占 7.0 秒。
//
// 更要命的是块化近似本身是错的：
//   · `for … if (ev.kind === 'defeat') break` —— **一次战败作废本块剩余全部事件**；
//   · 开头 `if (wasInjured) return` —— 上一块留下的 1 天养伤，会让**整整 180 天**颗粒无收。
//   实战里块内只掷出几十个事件就断了 ⇒ 离线历练产出只有逐日口径的**零头**。
//
// 这里不取 E1 那种近似式（`N/(1+q)`），而是把**逐日状态机**的期望**精确**解出来：
//
//   设一天有 n = 12 × 探索占比 × 80% 个事件槽，单一事件的战败概率
//   d = 战斗事件占比 × (1 − 胜率)，令 s = 1 − d、q = s^n（一天内一次都没败）。
//
//   · 健康日内：E[已结算事件] = (1−q)/d；E[有产出事件] = s·(1−q)/d；
//     E[当日战败次数] = 1−q（战败事件本身占槽但无产出，并让**次日**养伤）。
//   · 「健康 / 养伤」两状态链的健康天数用 `expectedHealthyDaysOf` 精确求和。
//   · 事件的分类目期望（掉落阶 / 底材 / 成色 / 功法 / 宝匣）走
//     `explorationExpect.addExpectedRewardsOfEvent` —— **不复制第二份掉落表**。
//
// 全部闭式（O(事件类目)），与块长无关。
//
// 口径纪律：
//   · **在线一行不改**：`days === 1` 仍走逐事件掷骰（`resolveOffspringExpeditionDay`）；
//   · 落账用随机舍入（`stochasticRound`），期望无偏；
//   · 修为也吃「健康天数」——逐日路径在养伤当天本来就不给修为（函数开头早退）。

import {
  addExpectedRewardsOfEvent,
  expandExpectedBuckets,
  expectedHealthyDaysOf,
  healthyProbAfterOf,
  probabilitiesOfTable,
  stochasticRound
} from './explorationExpect.js'
import { TUNING as EXPLORE_TUNING, battleWinChanceOf } from './exploration.js'
import { childEventWeightTable } from './locations.js'

const num = (value, fallback = 0) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}
const clamp01 = value => Math.min(Math.max(num(value), 0), 1)

/** 与 `explorationExpect` 同口径：叙事事件不算战斗（`noBattle` 是「假战斗」标记） */
const isBattleEvent = event => event?.category === 'battle' && !event?.noBattle

/**
 * 历练的**一天模型**（纯函数，便于断言）。
 *
 * @returns {{
 *   slots: number, probs: Array, battleP: number, winChance: number,
 *   defeatP: number, safeP: number, cleanDayP: number,
 *   eventsPerHealthyDay: number, rewardsPerHealthyDay: number
 * }}
 */
export const expeditionDayModelOf = ({
  map = null,
  playerLevel = 1,
  share = 1,
  expeditionTuning = null,
  exploreTuning = EXPLORE_TUNING
} = {}) => {
  const E = expeditionTuning || {}
  const slots =
    Math.max(num(E.eventsPerDay), 0) * Math.max(num(share), 0) * Math.max(num(E.outputRatio), 0)
  // ⚠ 必须用**历练自己的简化事件池**（`childEventWeightTable`），不是桂冈的 `eventWeightTable`
  const probs = map ? probabilitiesOfTable(childEventWeightTable(map)) : []
  let battleP = 0
  for (const row of probs) if (isBattleEvent(row.event)) battleP += row.p
  const winChance = map
    ? clamp01(battleWinChanceOf(playerLevel, map.minLevel, exploreTuning))
    : 0
  const defeatP = clamp01(battleP * (1 - winChance))
  const safeP = 1 - defeatP
  const cleanDayP = Math.pow(safeP, Math.max(slots, 0))
  // E[已结算事件 | 健康日] = Σ_{j=1..n} s^(j−1) = (1 − s^n)/d（d = 0 时退化为 n）
  const eventsPerHealthyDay = defeatP > 0 ? (1 - cleanDayP) / defeatP : Math.max(slots, 0)
  // E[有产出事件 | 健康日] = Σ_{j=1..n} s^j = s · 上面那一项
  const rewardsPerHealthyDay = safeP * eventsPerHealthyDay
  return {
    slots,
    probs,
    battleP,
    winChance,
    defeatP,
    safeP,
    cleanDayP,
    eventsPerHealthyDay,
    rewardsPerHealthyDay
  }
}

/**
 * **单位健康日的期望账本缓存**（P62 第二刀，2026-11-15）。
 *
 * 为什么可以缓存：`addExpectedRewardsOfEvent` 里每个桶的金额都只乘同一个
 * `rewardEvents`（有产出事件的期望数），所以账本与块长 / 健康天数**线性**相关。
 * 缓存「单位健康日」这一份，块内每人只做一次乘法。
 *
 * 为什么值得：真档里历练期望模型独占 0.9 秒，几乎全在这一段 ——
 * 每人每块都要把 5~6 条事件 × 每条 1~2 个掉落阶 × 底材 × 4 成色重建成
 * 几百个 Map 桶（1,680 次调用 ≈ 1.1 秒，见 `.tmp/bench-expect-parts.mjs`）。
 *
 * 键 = `(地图, 境界, 已学功法)`：掉落阶带（`tierBandOf`）与胜率只吃境界，
 * 候选池 / 高阶概率 / 五系偏斜只吃地图，功法池只吃 `knownQiArts`。
 * ⚠ **只在默认探索 tuning 下启用**（自定义 tuning 的断言 / 回滚路径一律现算）。
 */
const unitAccCache = new WeakMap()

const unitAccOf = ({ map, playerLevel, knownQiArts = [], model, denom, exploreTuning }) => {
  const build = () => {
    const acc = new Map()
    for (const row of model.probs) {
      const winFactor = isBattleEvent(row.event) ? model.winChance : 1
      addExpectedRewardsOfEvent(
        acc,
        { event: row.event, location: map, playerLevel, knownQiArts, tuning: exploreTuning },
        (row.p * winFactor) / denom
      )
    }
    return acc
  }
  if (!map || exploreTuning !== EXPLORE_TUNING) return build()
  const key = `${playerLevel}\u0000${knownQiArts.join(',')}`
  let byKey = unitAccCache.get(map)
  if (!byKey) {
    byKey = new Map()
    unitAccCache.set(map, byKey)
  }
  let acc = byKey.get(key)
  if (!acc) {
    acc = build()
    byKey.set(key, acc)
  }
  return acc
}

/**
 * 一块（`days` 个游戏天）的**精确期望**。
 *
 * 返回形状对齐 `resolveOffspringExpeditionDay` 的 `result`，另加：
 *   · `healthyDays` —— 修为要乘它（逐日路径在养伤当天不给修为）；
 *   · `defeats` —— 期望战败次数（报表用）；
 *   · `injuredEnd` —— 块末仍养伤的概率（0/1 随机舍入，喂下一块的 `injuryDays`）。
 */
export const planOffspringExpeditionExpectation = ({
  map = null,
  playerLevel = 1,
  days = 1,
  share = 1,
  injuredDays = 0,
  knownQiArts = [],
  expeditionTuning = null,
  exploreTuning = EXPLORE_TUNING,
  rng = Math.random
} = {}) => {
  const total = Math.max(Math.floor(num(days, 1)) || 1, 1)
  // 块首已在养伤：那几天什么都不产（逐日路径在 `wasInjured` 时整体早退）
  const injured = Math.min(Math.max(Math.floor(num(injuredDays)), 0), total)
  const model = expeditionDayModelOf({ map, playerLevel, share, expeditionTuning, exploreTuning })
  const remaining = total - injured
  const healthyDays = expectedHealthyDaysOf(remaining, model.cleanDayP)

  const events = model.eventsPerHealthyDay * healthyDays
  const rewardEvents = model.rewardsPerHealthyDay * healthyDays
  const defeats = (1 - model.cleanDayP) * healthyDays

  // 分母 = s：Σ_事件 (p × 胜率因子) = 1 − d，归一后正好还原「有产出事件」总数
  const denom = model.safeP > 0 ? model.safeP : 1
  const acc = unitAccOf({ map, playerLevel, knownQiArts, model, denom, exploreTuning })

  let gatherP = 0
  let pickupP = 0
  for (const row of model.probs) {
    const cat = row.event?.category
    if (cat === 'gatherHerb' || cat === 'gatherMaterial') gatherP += row.p
    else if (cat === 'pickup') pickupP += row.p
  }

  return {
    map,
    healthyDays,
    events: stochasticRound(events, rng),
    battles: stochasticRound((rewardEvents * model.battleP * model.winChance) / denom + defeats, rng),
    wins: stochasticRound((rewardEvents * model.battleP * model.winChance) / denom, rng),
    losses: stochasticRound(defeats, rng),
    defeats,
    gathers: stochasticRound((rewardEvents * gatherP) / denom, rng),
    pickups: stochasticRound((rewardEvents * pickupP) / denom, rng),
    // 账本是「单位健康日」的 ⇒ 这里按 `rewardEvents`（有产出事件的期望数）一次乘上去
    rewards: expandExpectedBuckets(acc, rng, rewardEvents),
    injuredEnd: stochasticRound(1 - healthyProbAfterOf(remaining, model.cleanDayP), rng) > 0 ? 1 : 0
  }
}
