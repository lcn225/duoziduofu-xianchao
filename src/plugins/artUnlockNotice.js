// 【百艺解锁】—— 第 3 档居中弹窗（B11-a2，2026-11-07）
//
// 口径：
//   · 《模块解锁方针》§四：解锁 = 第 3 档弹窗，**不暂停时钟**、遮罩 / ESC 可关；
//   · 触发点只有一处：`stores/modules/arts.js` 的 `gainRecipeFragment`
//     —— 第一次拿到某艺的残页就解锁该艺（《模块七》§二「凭功法或残页解锁」的残页那条）；
//   · 队列留在组件里（reactive），**不进存档** —— 刷新丢掉未读提示无所谓，
//     进 `$state` 反而会被序列化进存档（P57 / P58 的教训）。
//
// 这里不 import Vue / Pinia —— 保持 plugins 层能被 node 直接加载。

const listeners = new Set()

/** 订阅解锁事件；返回退订函数 */
export const onArtUnlock = fn => {
  if (typeof fn !== 'function') return () => {}
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** 触发一次解锁（`{ art, name }`） */
export const emitArtUnlock = (payload = {}) => {
  if (!payload?.art) return
  for (const fn of [...listeners]) fn(payload)
}

/** 测试 / 重置用 */
export const clearArtUnlockListeners = () => listeners.clear()

/** 弹窗正文（组件与断言共用一条） */
export const artUnlockMessageOf = payload =>
  payload?.name ? `【${payload.name}】已解锁` : '百艺已解锁'
