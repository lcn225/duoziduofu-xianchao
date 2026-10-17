// 三大挂机系统的「模式层」—— 纯函数，无副作用，可被 node 直接加载跑断言。
//
// 只回答一个问题：**桂冈现在人在哪**。
//   garrison      镇守（大本营，桂冈的一天）
//   exploration   探索（文字挂机）
//   secretRealm   秘境（爬塔）
//
// ⚠ 它不负责「怎么探索」「怎么打」，那些在 exploration.js / secretRealm.js。
//   模式层只保证三件事：
//     1. 同一时间只有一个模式；
//     2. 受伤时不能出门；
//     3. 秘境挑战没结束时不能切走（首版由顶栏禁用兜底）。
import { GAME_SECONDS_PER_DAY } from './innerCourt.js'

export const MODES = Object.freeze({
  GARRISON: 'garrison',
  EXPLORATION: 'exploration',
  SECRET_REALM: 'secretRealm'
})

export const MODE_LABELS = Object.freeze({
  [MODES.GARRISON]: '镇守',
  [MODES.EXPLORATION]: '探索',
  [MODES.SECRET_REALM]: '秘境'
})

/** 数值全部是占位，等《数值真源表》替换 */
export const TUNING = {
  /** 探索战败后回家养伤 1 个游戏天（《三大挂机》§三） */
  injuryGameDays: 1
}

export const isMode = value => Object.values(MODES).includes(value)

/**
 * 路由 → 模式。只用于顶栏高亮，**不用于自动切模式** ——
 * 点开 /exploration 只是进大厅，点「出发」才真的离开镇守。
 * 管理页（背包/设置等）返回 null，表示「不表态」。
 */
export const modeOfRoute = path => {
  const key = String(path || '').replace(/^\//, '').split('/')[0]
  if (key === '') return MODES.GARRISON
  if (key === 'exploration') return MODES.EXPLORATION
  if (key === 'dungeon') return MODES.SECRET_REALM
  return null
}

/** 受伤到期时刻（绝对游戏秒） */
export const injuryUntilOf = (nowSeconds, days = TUNING.injuryGameDays) => {
  const now = Number.isFinite(Number(nowSeconds)) ? Math.max(Number(nowSeconds), 0) : 0
  const d = Number.isFinite(Number(days)) ? Math.max(Number(days), 0) : 0
  return now + d * GAME_SECONDS_PER_DAY
}

/**
 * 是否还在养伤。
 * ⚠ 边界是**左闭右开**：`until` 那一刻已经可以出门。
 *   探索战败当场把 until 设成 now + 1 天，所以「再等一天」是精确的。
 */
export const isInjuredAt = (nowSeconds, injuryUntilSeconds) => {
  const now = Number(nowSeconds) || 0
  const until = Number(injuryUntilSeconds) || 0
  return until > now
}

/**
 * 模式转换的合法判定。返回 `{ ok, reason }`，不抛异常。
 *
 * @param target      想去的模式
 * @param activeMode  当前模式
 * @param injured     当前是否在养伤
 * @param runActive   秘境挑战是否进行中
 */
export const canEnterMode = ({
  target,
  activeMode = MODES.GARRISON,
  injured = false,
  runActive = false
} = {}) => {
  if (!isMode(target)) return { ok: false, reason: '未知模式' }
  if (target === activeMode) return { ok: true, reason: '' }

  // 挑战没结束不能切走 —— 5 天已经扣了，切走会让 run 悬空
  if (runActive && target !== MODES.SECRET_REALM) {
    return { ok: false, reason: '秘境挑战尚未结束' }
  }
  if (target === MODES.GARRISON) return { ok: true, reason: '' }

  if (injured) return { ok: false, reason: '正在养伤，无法外出' }

  if (target === MODES.EXPLORATION && activeMode === MODES.SECRET_REALM) {
    return { ok: false, reason: '请先回镇守，再出发探索' }
  }
  if (target === MODES.SECRET_REALM && activeMode === MODES.EXPLORATION) {
    return { ok: false, reason: '请先回镇守，再进秘境' }
  }

  return { ok: true, reason: '' }
}
