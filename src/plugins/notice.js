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

/**
 * 「叮」的合并窗口（真实毫秒）。
 *
 * 练气期 1 游戏天 = 96 现实秒，有喜本来就很稀疏；**筑基后 24× / 金丹 168×**
 * 一天只有 4 / 0.57 现实秒，自动留宿几乎天天有人有喜 —— 如果每次受孕都弹一条，
 * 金丹下约每秒一条，屏幕会被横幅糊死（2026-11-08 用户拍板「合并弹」）。
 *
 * 口径：**窗口内第一条立刻弹**（不延迟首条），窗口内的后续有喜累计起来，
 * 窗口结束时补一条「子嗣加 N」。
 */
export const DING_MERGE_MS = 8000

/** 当前窗口起点（0 = 无窗口，下一条立刻弹） */
let dingWindowStart = 0
/** 窗口内待合并的 payload */
let dingBuffered = null
/** 窗口结束的补发定时器 */
let dingTimer = null

const flushBufferedDing = () => {
  dingTimer = null
  dingWindowStart = 0
  const buffered = dingBuffered
  dingBuffered = null
  if (buffered) emitNotice({ kind: 'ding', ...buffered })
}

/**
 * 触发一次「叮」（有喜）。payload = { at, count, names }
 *
 * 合并见 `DING_MERGE_MS`：同一条总线上，后到的 payload 只累加 `count`，
 * `names` 取最新一份（它本来就是「当前孕育中侍妾名单」，不是增量名单）。
 */
export const emitDing = (payload = {}) => {
  const now = Date.now()
  const incoming = payload || {}
  const incomingCount = Math.max(1, Math.floor(Number(incoming.count) || 1))

  // 新窗口：第一条立刻弹，用户不会等 8 秒才看到「叮」
  if (!dingWindowStart || now - dingWindowStart >= DING_MERGE_MS) {
    if (dingTimer) clearTimeout(dingTimer)
    dingTimer = null
    dingBuffered = null
    dingWindowStart = now
    emitNotice({ kind: 'ding', ...incoming })
    return
  }

  // 窗口内：累计，窗口结束时补一条汇总
  const merged = dingBuffered || { at: incoming.at, count: 0, names: [] }
  merged.count += incomingCount
  if (Array.isArray(incoming.names) && incoming.names.length) merged.names = incoming.names
  if (incoming.at != null) merged.at = incoming.at
  dingBuffered = merged
  if (!dingTimer) {
    dingTimer = setTimeout(flushBufferedDing, DING_MERGE_MS - (now - dingWindowStart))
    // node（断言脚本）里不要因此挂住事件循环
    if (typeof dingTimer?.unref === 'function') dingTimer.unref()
  }
}

/** 测试/重置用：清空所有订阅，并丢弃未发放的合并窗口 */
export const clearDingListeners = () => {
  listeners.clear()
  if (dingTimer) clearTimeout(dingTimer)
  dingTimer = null
  dingBuffered = null
  dingWindowStart = 0
}

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

/**
 * 老九带货到货（第 2 档横幅，2026-11-10）。
 *
 * 到货**不直接进背包**，先摆在飞鹰阁「老九带货」区等玩家收取
 * （`settleBroker` → `vault.delivery` → `claimBrokerDelivery`）。
 * 这条横幅的作用 = 玩家多半不在飞鹰阁页，只有流水一行会错过到货。
 *
 * 离线不弹（`settleBroker({ silent: true })`），进离线日志。
 *
 * ```
 * 老九带货归来
 * 「青玉符」已在飞鹰阁等你收取 · 694 点（补 194 点）
 * 去飞鹰阁「老九带货」点「收货」
 * ```
 */
export const formatBrokerText = ({ name = '', price = 0, gap = 0 } = {}) => {
  if (!name) return { title: '', message: '', rollCall: '' }
  const p = Math.max(Math.round(Number(price) || 0), 0)
  const g = Math.round(Number(gap) || 0)
  const tail = g > 0 ? `补 ${g} 点` : g < 0 ? `退 ${-g} 点` : '按预扣结清'
  return {
    title: '老九带货归来',
    message: `「${name}」已在飞鹰阁等你收取 · ${p} 点（${tail}）`,
    rollCall: '去飞鹰阁「老九带货」点「收货」'
  }
}

/**
 * 资源不足引导（第 2 档横幅，2026-11-22 S2）。
 *
 * 玩家点「消耗资源」的按钮却不够时，除了原来的 `message.error` 之外再补一条横幅：
 * 横幅负责回答「那我该去哪」，短提示负责说清差多少。**不加第 5 档** ——
 * 它就是第 2 档横幅，只是多带一组跳转按钮。
 *
 * `resource` 决定文案与跳转；未知值按灵石处理（宁可给一条通用引导，也别静默）。
 */
export const RESOURCE_GUIDE = {
  spiritual: {
    title: '灵石不足',
    rollCall: '可前往【探索】获取，或去【飞鹰门】做任务换取',
    actions: [
      { label: '去探索', to: '/exploration' },
      { label: '去飞鹰门', to: '/faction' }
    ]
  },
  secular: {
    title: '大子不足',
    rollCall: '可在【郑家宝阁】把灵石兑换成大子，或去【飞鹰门】做任务换取',
    actions: [
      { label: '去宝阁', to: '/shop' },
      { label: '去飞鹰门', to: '/faction' }
    ]
  },
  contribution: {
    title: '贡献点不足',
    rollCall: '先回【飞鹰门】做任务攒贡献点',
    actions: [{ label: '去飞鹰门', to: '/faction' }]
  },
  material: {
    title: '材料不足',
    rollCall: '可前往【探索】或【秘境】获取',
    actions: [
      { label: '去探索', to: '/exploration' },
      { label: '去秘境', to: '/dungeon' }
    ]
  },
  stone: {
    title: '强化石不足',
    rollCall: '可前往【秘境】或【探索】获取',
    actions: [
      { label: '去秘境', to: '/dungeon' },
      { label: '去探索', to: '/exploration' }
    ]
  },
  charm: {
    title: '洗命符不足',
    rollCall: '可前往【秘境】或【探索】获取',
    actions: [
      { label: '去秘境', to: '/dungeon' },
      { label: '去探索', to: '/exploration' }
    ]
  }
}

/**
 * 同一种资源 **8 现实秒**内只弹一次 —— 玩家连点买不起的按钮时，
 * `message.error` 每条都在（那是点击反馈），横幅只留一条，别把屏幕刷满。
 */
export const SHORTAGE_MERGE_MS = 8000
let lastShortage = { resource: '', at: 0 }

/** 重置合并窗口（断言 / 测试用） */
export const resetShortageWindow = () => {
  lastShortage = { resource: '', at: 0 }
}

/** 发出一条资源不足横幅；同资源 8 秒内重复的直接丢弃 */
export const emitResourceShortage = (payload = {}) => {
  const resource = RESOURCE_GUIDE[payload.resource] ? payload.resource : 'spiritual'
  const now = Date.now()
  if (lastShortage.resource === resource && now - lastShortage.at < SHORTAGE_MERGE_MS) return
  lastShortage = { resource, at: now }
  emitNotice({ kind: 'resource', ...payload, resource })
}

/**
 * 资源不足横幅文案。
 * `detail` = 调用方原有的「需要 X，当前 Y」；没给就退回通用一句。
 */
export const formatResourceText = ({ resource = 'spiritual', detail = '' } = {}) => {
  const guide = RESOURCE_GUIDE[resource] || RESOURCE_GUIDE.spiritual
  return {
    title: guide.title,
    message: detail || '这次消耗没有成功',
    rollCall: guide.rollCall,
    actions: guide.actions
  }
}

/** 统一入口：调用方给 payload，UI 拿到 { title, message, rollCall, actions? } */
export const formatNoticeText = (payload = {}) => {
  if (payload.kind === 'obituary') return formatObituaryText(payload)
  if (payload.kind === 'fall') return formatFallText(payload)
  if (payload.kind === 'broker') return formatBrokerText(payload)
  if (payload.kind === 'resource') return formatResourceText(payload)
  return formatDingText(payload)
}
