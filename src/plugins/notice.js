// 系统「叮」通知的纯事件总线（2026-10-19）
//
// 触发点：**有喜的当晚**（innerCourt.interactEvening 判定受孕成功后），
// 不是诞生时。诞生弹窗只负责起名/洗命，不再重复「叮」。
//
// 这里不 import Vue/Pinia —— 保持 plugins 层可被 node 直接加载；
// 订阅方（DingNotice.vue）自己持有 reactive 状态，卸载时退订。

const listeners = new Set()

/** 订阅「叮」事件；返回退订函数 */
export const onDing = fn => {
  if (typeof fn !== 'function') return () => {}
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** 触发一次「叮」；payload = { at, count, names } */
export const emitDing = (payload = {}) => {
  for (const fn of [...listeners]) fn(payload)
}

/** 测试/重置用：清空所有订阅 */
export const clearDingListeners = () => listeners.clear()

/**
 * 「叮」的三行文案。
 *
 *   count = 1 → 「子嗣加一」
 *   count > 1 → 「子嗣加 N」
 *   names     → 当前孕育中的侍妾名单，每人一个（1）
 */
export const formatDingText = ({ names = [], count = 1 } = {}) => {
  const n = Math.max(1, Math.floor(Number(count) || 1))
  const list = Array.isArray(names) ? names.filter(Boolean) : []
  return {
    title: '叮！',
    message: `宿主您好，系统显示您子嗣加${n === 1 ? '一' : n}，请注意查看`,
    rollCall: `孕育中子嗣：${list.length ? list.map(name => `${name}（1）`).join('，') : '暂无'}！`
  }
}
