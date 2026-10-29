// 【子嗣历练】—— 纯函数层（无副作用，可被 node 直接加载跑断言）
//
// 设计真源：`design/20-系统设计/探索系统.md` §七/§八（2026-10-20 拍板）。
//   · 简化事件池：空包 39 / 采植 22 / 采材 11 / 战斗 17 / 拾遗 11（无奇遇/叙事/宝匣）；
//   · 产出 = 桂冈名义的 80%（按子嗣能去的最高图）；修为 = 纯打坐的 80%（仅探索）/
//     90%（综合 50/50）；
//   · 战败停止历练 1 游戏天，养伤当天不探索也不打坐；
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

/** 养伤中（战败后停止历练 1 游戏天） */
export const isInjuredOf = child => Math.floor(Number(child?.injuryDays) || 0) > 0

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
 * 养伤中的也会被选进来 —— 需要每天递减 `injuryDays`，但当天不产出不修炼。
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
  tuning = TUNING
} = {}) => {
  const E = tuning.offspringExpedition
  const mode = expeditionModeOf(child)
  const share = expeditionExploreShareOf(mode)
  const injuryDays = Math.max(Math.floor(Number(child?.injuryDays) || 0), 0)
  const wasInjured = injuryDays > 0
  const levelFrom = Math.max(Math.floor(Number(child?.realmLevel) || 0), 0)

  const result = {
    mode,
    mapId: '',
    mapName: '',
    /** 今天是否在养伤（战败后的第二天） */
    injured: wasInjured,
    /** 今天是否新战败（当天剩余事件作废） */
    injuredNew: false,
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
    injuryDays: wasInjured ? injuryDays - 1 : 0,
    expeditionCredit: Math.max(Number(child?.expeditionCredit) || 0, 0),
    realmLevel: levelFrom,
    cultivation: Math.max(Number(child?.cultivation) || 0, 0)
  }

  // 养伤当天：不探索、不打坐。战败已经用掉一整天，这是 §八 的惩罚。
  if (wasInjured) return { result, patch }

  // ---------- 1. 探索：有效事件数 = 12 × 探索占比 × 80%，小数余数存起来 ----------
  if (share > 0) {
    const map = expeditionMapOf(child)
    result.mapId = map?.id || ''
    result.mapName = map?.name || ''
    if (map) {
      patch.expeditionCredit += E.eventsPerDay * share * E.outputRatio
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

        // 战败：当天剩余事件作废，下一天养伤（不再出去）
        if (ev.kind === 'defeat') {
          result.losses += 1
          result.injuredNew = true
          patch.injuryDays = Math.max(Math.floor(Number(E.injuryDays) || 0), 0)
          break
        }
        if (ev.kind === 'battle') result.wins += 1

        for (const reward of ev.rewards || []) {
          result.rewards.push(reward)
          if (reward.type === 'spiritual_stone') result.stones += Number(reward.amount) || 0
          if (reward.type === 'item') result.items += Number(reward.count) || 0
          if (reward.type === 'pill_fragment') result.fragments += Number(reward.amount) || 0
        }
      }
    }
  }

  // ---------- 2. 修为：纯打坐 × (打坐占比 + 探索占比 × 80%) ----------
  const gainScale = (1 - share) + share * E.cultivationRatio
  if (gainScale > 0 && canCultivateOf(child, now, tuning)) {
    // ⚠ `companionFit` 必须由调用方传（家族配给同参）；不传才会退到 fallback 0.6，
    //   那会让「出去历练的人」用与留在家里的人不同的同参系数（2026-10-29 P55-a 修）。
    const next = advanceCultivationOf(child, tuning, gainScale, companionFit)
    result.cultivationGain = next.gained
    result.level = next.level
    result.leveled = next.leveled
    result.maxed = next.maxed
    patch.realmLevel = next.level
    patch.cultivation = next.progress
  }

  return { result, patch }
}
