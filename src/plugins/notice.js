// 系统「叮」通知的纯事件总线（2026-10-19）
//
// 触发点：**有喜的当晚**（innerCourt.interactEvening 判定受孕成功后），
// 不是诞生时。诞生弹窗只负责起名/洗命，不再重复「叮」。
//
// 2026-10-30（B1）：同一条总线扩成**第 2 档横幅**的通用出口 ——
// 除「叮」（有喜）外，还接**聚合讣告**（子嗣 / 妻妾寿终）。
// 两者都是「已经发生、不需要玩家确认」的事：不弹窗、不暂停时钟。
//
// 这里不 import Vue/Pinia —— 保持 plugins 层可被 node 直接加载；
// 订阅方（DingNotice.vue）自己持有 reactive 状态，卸载时退订。

const listeners = new Set()

/** 订阅横幅事件；返回退订函数 */
export const onDing = fn => {
  if (typeof fn !== 'function') return () => {}
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** 触发一次横幅事件；payload 见 `formatNoticeText` */
export const emitNotice = (payload = {}) => {
  for (const fn of [...listeners]) fn(payload)
}

/** 触发一次「叮」（有喜）。payload = { at, count, names } */
export const emitDing = (payload = {}) => emitNotice({ kind: 'ding', ...payload })

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

/**
 * 姓名点名：**前 3 个列名字，超出写「等 N 人」**（《模块二》§15.5.2）。
 * N 是这一组的总人数，不是剩下的数量。
 */
export const rollCallOf = (names = []) => {
  const list = (names || []).filter(Boolean)
  if (!list.length) return ''
  const head = list.slice(0, 3).join(' · ')
  return list.length > 3 ? `${head} 等 ${list.length} 人` : head
}

/**
 * 聚合讣告（第 2 档横幅，不暂停时钟）。
 *
 * ```
 * 今日寿终 · 妻妾 2 人、子嗣 3 人
 * 张氏 · 李氏 · 王氏 等 2 人
 * 桂某某 · 桂某某 · 桂某某 等 3 人
 * ```
 *
 * @param {{wives?: string[], offspring?: string[], offline?: boolean}} payload
 *        `offline` = 离线报告用（前置「离线期间」），在线横幅不传。
 */
export const formatObituaryText = ({ wives = [], offspring = [], offline = false } = {}) => {
  const w = (wives || []).filter(Boolean)
  const c = (offspring || []).filter(Boolean)
  if (!w.length && !c.length) return { title: '', message: '', rollCall: '' }
  const parts = []
  if (w.length) parts.push(`妻妾 ${w.length} 人`)
  if (c.length) parts.push(`子嗣 ${c.length} 人`)
  return {
    title: `${offline ? '离线期间 · ' : '今日'}寿终 · ${parts.join('、')}`,
    message: rollCallOf(w),
    rollCall: rollCallOf(c)
  }
}

/**
 * 战斗陨落横幅（第 2 档；《模块二》§15.5.3）。
 *
 * ```
 * 陨落 · 2 人
 * 桂某某（练气三层）、某某（凡人）
 * 返还：修为 +120 · 词条 3 条
 * ```
 *
 * 同一结算周期内合并成一条；跨周期各出一条，不堆叠。
 */
export const formatFallText = ({ deaths = [], cultivation = 0, traits = 0 } = {}) => {
  const list = (deaths || []).filter(Boolean)
  if (!list.length) return { title: '', message: '', rollCall: '' }
  const gained = Math.max(Math.round(Number(cultivation) || 0), 0)
  const traitCount = Math.max(Math.floor(Number(traits) || 0), 0)
  return {
    title: `陨落 · ${list.length} 人`,
    message: list.map(d => `${d.name}（${d.realm || '凡人'}）`).join('、'),
    rollCall: `返还：修为 +${gained} · 词条 ${traitCount} 条`
  }
}

/** 统一入口：调用方给 payload，UI 拿到 { title, message, rollCall } */
export const formatNoticeText = (payload = {}) => {
  if (payload.kind === 'obituary') return formatObituaryText(payload)
  if (payload.kind === 'fall') return formatFallText(payload)
  return formatDingText(payload)
}
