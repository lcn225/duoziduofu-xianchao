// 【子嗣历练】—— 纯函数层（无副作用，可被 node 直接加载跑断言）
//
// 设计真源：`design/20-系统设计/探索系统.md` §七/§八（2026-10-20 拍板）。
//   · 简化事件池：空包 39 / 采植 22 / 采材 11 / 战斗 17 / 拾遗 11（无奇遇/叙事/宝匣）；
//   · 产出 = 桂冈名义的 80%（按子嗣能去的最高图）；修为 = 纯打坐的 80%（仅探索）/
//     90%（综合 50/50）；
//   · 战败只作废当次事件（2026-11-26 #2：不再停止历练、不再有养伤）；
//   · 同时最多 10 人，境界高者优先。
//
// ⚠ 为什么单独一个文件：`innerCourt.js` 不能 import `exploration.js`
//   （`exploration → idleMode → innerCourt` 会成环）。这里作为「模块二 × 探索」
//   的胶水层，依赖方向固定为：本文件 → innerCourt / exploration / locations。
//
// ⚠ 修为进子嗣自己，**不回馈桂冈**（2026-10-17 决议不变）。

import {
  TUNING,
  EXPEDITION_MODES,
  canFightOf,
  canCultivateOf,
  advanceCultivationOf
} from './innerCourt.js'
import { locations, childEventWeightTable } from './locations.js'
import {
  TUNING as EXPLORE_TUNING,
  rollExploreEvent,
  pickEventFromTable
} from './exploration.js'
import { planOffspringExpeditionExpectation } from './offspringExpect.js'

const MODE_MAP = new Map(EXPEDITION_MODES.map(mode => [mode.id, mode]))
const DEFAULT_MODE = MODE_MAP.get('cultivate')

/** 老档/脏数据一律退回「仅打坐」，读档不会把没配置过的子嗣派出去 */
export const expeditionModeOf = child => {
  const id = child?.expeditionMode
  return MODE_MAP.has(id) ? id : 'cultivate'
}

export const expeditionModeNameOf = mode =>
  (MODE_MAP.get(mode) || DEFAULT_MODE).name

/** 一天里用于探索的比例：仅打坐 0 / 仅探索 1 / 综合 0.5 */
export const expeditionExploreShareOf = mode =>
  (MODE_MAP.get(mode) || DEFAULT_MODE).exploreShare

/**
 * 可历练门槛：**沿用出战门槛** —— 有灵根 + 练气二层（P20）。
 * 不满二层的子嗣配「仅探索」也会退回打坐，不会白算产出。
 */
export const canExpeditionOf = (child, nowGameSeconds, tuning = TUNING) =>
  canFightOf(child, nowGameSeconds, tuning)

/**
 * 子嗣能去的最高图：按自己的练气层数选（1 层 长岭乡外 / 3 层 诸猎人山口 /
 * 6 层 长岭关外 / 9 层 飞鹰镇外）。
 * 用户 2026-10-20 拍板：产出以**子嗣境界**为基准，不跟桂冈当前地图走。
 * 掉落阶同理走子嗣自己的境界段（2026-10-22 P30），不跟地图阶走。
 */
export const expeditionMapOf = (child, maps = locations) => {
  const level = Math.max(Math.floor(Number(child?.realmLevel) || 0), 1)
  const available = (maps || []).filter(map => level >= Math.max(Number(map.minLevel) || 1, 1))
  return available[available.length - 1] || (maps || [])[0] || null
}

/**
 * 选出「今天真的出去历练」的子嗣（上限 10）。
 *
 * 配置了探索但**境界变低/失去灵根**的会自动退出（读档归一化也会清）；
 * 超出上限的按**境界高 → 出生早**排前 10，其余当天按打坐结算（配置不删，等人退出后自动补位）。
 */
export const pickExpeditionChildren = (children = [], nowGameSeconds = 0, tuning = TUNING) => {
  const E = tuning.offspringExpedition
  const cap = Math.max(Math.floor(Number(E.maxExploring) || 0), 0)
  if (!cap) return []
  const candidates = (children || []).filter(
    child => expeditionModeOf(child) !== 'cultivate' && canExpeditionOf(child, nowGameSeconds, tuning)
  )
  candidates.sort(
    (a, b) =>
      (Number(b.realmLevel) || 0) - (Number(a.realmLevel) || 0) ||
      (Number(a.birthTime) || 0) - (Number(b.birthTime) || 0) ||
      String(a.id || '').localeCompare(String(b.id || ''))
  )
  return candidates.slice(0, cap)
}

/**
 * 子嗣历练的**日结纯函数**（注入 rng，可断言；不读 store、不落盘）。
 *
 * @returns {{ result: object, patch: object }}
 *   result 是当天报表（地图/事件/战斗/采集/灵石/材料/残页/修为/养伤）；
 *   patch 是要写回子嗣的字段（模式 / 养伤天数 / 事件余数 / 修为）。
 */
export const resolveOffspringExpeditionDay = ({
  child,
  now = 0,
  rng = Math.random,
  knownQiArts = [],
  companionFit = null,
  /** 传功阁等级（B14-c #7）：只影响已学功法的 `b` 倍率；全局 `k` 恒生效 */
  libraryLevel = 0,
  /**
   * **离线块步长**（2026-11-11）：一次结算 `days` 个游戏天。在线恒为 1。
   * 块内口径：事件数 ×days、修为 ×days；战败只作废当次事件（2026-11-26 #2）。
   */
  days = 1,
  /**
   * **期望值路径开关**（P62 优化方向 6，2026-11-14）：离线块结算时传 `true`。
   * 见 `plugins/offspringExpect.js` —— 闭式精确期望，与块长无关。
   * 在线恒为 `false`，逐事件掷骰一行不改。
   */
  expectation = false,
  tuning = TUNING
} = {}) => {
  const E = tuning.offspringExpedition
  const span = Math.max(Math.floor(Number(days)) || 1, 1)
  const mode = expeditionModeOf(child)
  const share = expeditionExploreShareOf(mode)
  const levelFrom = Math.max(Math.floor(Number(child?.realmLevel) || 0), 0)

  const result = {
    mode,
    mapId: '',
    mapName: '',
    events: 0,
    battles: 0,
    wins: 0,
    losses: 0,
    gathers: 0,
    pickups: 0,
    stones: 0,
    items: 0,
    fragments: 0,
    rewards: [],
    cultivationGain: 0,
    levelFrom,
    level: levelFrom,
    leveled: false,
    maxed: false
  }
  const patch = {
    expeditionMode: mode,
    // 老档残留的 injuryDays 顺手清零（2026-11-26 #2：养伤已删除，不再读这个字段）
    injuryDays: 0,
    expeditionCredit: Math.max(Number(child?.expeditionCredit) || 0, 0),
    realmLevel: levelFrom,
    cultivation: Math.max(Number(child?.cultivation) || 0, 0)
  }

  // ---------- 0. 期望值路径（离线块结算，P62 方向 6）----------
  // ⚠ 块内**不能**沿用下面的逐事件循环：块长 180 天时逐事件掷骰会把读档拖慢到秒级。
  //   这里走闭式精确期望，见 `offspringExpect.js`（2026-11-26 #2 起已无养伤状态链）。
  if (expectation) {
    const map = share > 0 ? expeditionMapOf(child) : null
    result.mapId = map?.id || ''
    result.mapName = map?.name || ''
    const plan = planOffspringExpeditionExpectation({
      map,
      playerLevel: levelFrom,
      days: span,
      share,
      knownQiArts,
      expeditionTuning: E,
      rng
    })
    result.events = plan.events
    result.battles = plan.battles
    result.wins = plan.wins
    result.losses = plan.losses
    result.gathers = plan.gathers
    result.pickups = plan.pickups
    result.rewards = plan.rewards
    for (const reward of plan.rewards) {
      if (reward.type === 'spiritual_stone') result.stones += Number(reward.amount) || 0
      if (reward.type === 'item') result.items += Number(reward.count) || 0
      if (reward.type === 'craft_fragment') result.fragments += Number(reward.amount) || 0
    }
    // 修为：全部天数都算（战败不再停摆）
    const gainScale = (1 - share) + share * E.cultivationRatio
    if (gainScale > 0 && plan.activeDays > 0 && canCultivateOf(child, now, tuning)) {
      const next = advanceCultivationOf(
        child,
        tuning,
        gainScale * plan.activeDays,
        companionFit,
        libraryLevel
      )
      result.cultivationGain = next.gained
      result.level = next.level
      result.leveled = next.leveled
      result.maxed = next.maxed
      patch.realmLevel = next.level
      patch.cultivation = next.progress
    }
    return { result, patch }
  }

  // ---------- 1. 探索：有效事件数 = 12 × 探索占比 × 80%，小数余数存起来 ----------
  if (share > 0) {
    const map = expeditionMapOf(child)
    result.mapId = map?.id || ''
    result.mapName = map?.name || ''
    if (map) {
      patch.expeditionCredit += E.eventsPerDay * share * E.outputRatio * span
      // +1e-9 防止 9.599999999 被 floor 成 9
      const count = Math.floor(patch.expeditionCredit + 1e-9)
      // 保留 6 位小数，避免每天累加出 0.6000000000000014 这种脏余数
      patch.expeditionCredit =
        Math.max(Math.round((patch.expeditionCredit - count) * 1e6) / 1e6, 0)

      const table = childEventWeightTable(map)
      for (let i = 0; i < count; i += 1) {
        const picked = pickEventFromTable(table, rng())
        if (!picked) break
        const ev = rollExploreEvent({
          location: map,
          eventId: picked.id,
          playerLevel: levelFrom,
          knownQiArts,
          rng,
          tuning: EXPLORE_TUNING
        })
        result.events += 1
        if (ev.category === 'battle') result.battles += 1
        if (ev.category === 'gatherHerb' || ev.category === 'gatherMaterial') result.gathers += 1
        if (ev.category === 'pickup') result.pickups += 1

        // 战败：只作废当次事件，继续当天剩余事件（2026-11-26 #2）
        if (ev.kind === 'defeat') {
          result.losses += 1
          continue
        }
        if (ev.kind === 'battle') result.wins += 1

        for (const reward of ev.rewards || []) {
          result.rewards.push(reward)
          if (reward.type === 'spiritual_stone') result.stones += Number(reward.amount) || 0
          if (reward.type === 'item') result.items += Number(reward.count) || 0
          if (reward.type === 'craft_fragment') result.fragments += Number(reward.amount) || 0
        }
      }
    }
  }

  // ---------- 2. 修为：纯打坐 × (打坐占比 + 探索占比 × 80%) ----------
  const gainScale = (1 - share) + share * E.cultivationRatio
  if (gainScale > 0 && canCultivateOf(child, now, tuning)) {
    // ⚠ `companionFit` 必须由调用方传（家族配给同参）；不传才会退到 fallback 0.6，
    //   那会让「出去历练的人」用与留在家里的人不同的同参系数（2026-10-29 P55-a 修）。
    const next = advanceCultivationOf(child, tuning, gainScale * span, companionFit, libraryLevel)
    result.cultivationGain = next.gained
    result.level = next.level
    result.leveled = next.leveled
    result.maxed = next.maxed
    patch.realmLevel = next.level
    patch.cultivation = next.progress
  }

  return { result, patch }
}
