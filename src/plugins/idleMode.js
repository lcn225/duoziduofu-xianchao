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
//     2. **旧档残留的养伤记录**（2026-11-26 起新战败不再产生）到期前不能出门；
//     3. 秘境挑战没结束时不能切走（首版由顶栏禁用兜底）。

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

/**
 * 模式层不产任何数值（2026-11-19 结案：旧注释「数值全部是占位」已作废）。
 * 产出数值的真源：`dayLoop.js` 的 TUNING · `realm.js` 的 `INNER_PACE` / `OUTER_PACE` ·
 * `innerCourt` 的受孕率，逐项登记在《数值真值表》Sheet 4。
 *
 * 2026-11-26 #2：探索战败不再产生养伤（`TUNING.injuryGameDays` / `injuryUntilOf` /
 * `injuryLabelOf` 已删除）。`isInjuredAt` 保留，只服务老档里尚未到期的养伤记录。
 */

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

/**
 * 是否还在养伤（只服务老档残留记录）。
 * ⚠ 边界是**左闭右开**：`until` 那一刻已经可以出门。
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
