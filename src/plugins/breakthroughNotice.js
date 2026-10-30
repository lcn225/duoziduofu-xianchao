// 【突破提示】—— 第 3 档居中弹窗（A1-3，2026-10-30）
//
// 真源：
//   · 《模块解锁方针》§四 —— 第 3 档弹窗四类里的「突破」那一格
//   · 《下一步》A1-3 —— 形态 / 合并 / 队列 / 文案口径
//   · 《数值真值表》§5.10 —— 增量按 `combatPanel` 前后差（只算本体）
//
// 三条硬口径（别改错）：
//   1. **不暂停时钟** —— 不进 `clock.js` 的 `PAUSE_ROUTES`，不调 `pauseClockForEvent`。
//      遮罩 / ESC 都可以关（与「诞生」弹窗相反：那个暂停时钟，所以不可关）。
//   2. **同一次突破结算内连升多级合并成一条** —— `batchId` 相同就并进队尾那一条，
//      起点用旧的、终点与面板用新的。外功一轮药浴连跳数级就靠这个。
//   3. **跨结算分开弹，队列上限 5**；超出部分折叠成「突破至 X 层（共 M 次）」放队尾，
//      M 是**总突破次数**（不是折叠的条数）。
//
// ⚠ **离线只进报告、不弹窗**（`setBreakthroughSilent(true)` 由 offline.js 在读档重放期间打开）：
//   重放走 `beginSaveBatch`，一秒弹几十个会卡死主线程，而且离线报告本来就是集中展示。
//
// 这里不 import Vue/Pinia —— 保持 plugins 层能被 node 直接加载（断言直接跑）；
// 订阅方 `components/BreakthroughNotice.vue` 自己持有 reactive 队列，卸载时退订。

import { getRealmName, getBodyRealmName } from './realm.js'

/** 队列上限：超过就把末尾几条折叠成一条汇总（《下一步》A1-3 §2.1 #4） */
export const BREAKTHROUGH_NOTICE_LIMIT = 5

/** 内功：四项全写（攻 / 生命 / 防御 / 速度） */
export const INNER_ROWS = [
  { key: 'attack', label: '攻' },
  { key: 'health', label: '生命' },
  { key: 'defense', label: '防御' },
  { key: 'speed', label: '速度' }
]

/** 外功：只写生命 / 防御（炼体加成只加这两项，见 `practice.bodyBonus`） */
export const BODY_ROWS = [
  { key: 'health', label: '生命' },
  { key: 'defense', label: '防御' }
]

// ---------- 数字格式 ----------

/**
 * 属性值的显示口径：**一位小数、整数省略 `.0`**。
 *
 *   `toFixed(1)` 之后再 `parseFloat` 去浮点尾 —— 直接用 `toFixed` 会得到 `208.0`，
 *   而 `208.0` 和示例里的 `208` 不是一回事（《下一步》A1-3 §2.2）。
 */
export function formatAttrNumber(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0'
  return String(parseFloat(n.toFixed(1)))
}

/** 带符号的增量：`+3.6` / `-1.2` / `0` */
export function formatAttrDelta(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n === 0) return '0'
  return `${n > 0 ? '+' : ''}${formatAttrNumber(n)}`
}

// ---------- 记录 ----------

/**
 * 造一条突破记录（store 侧在等级跳变的那一处调用）。
 *
 * @param kind        'inner' 内功 / 'body' 外功
 * @param fromLevel   突破前的扁平索引（1..18）
 * @param toLevel     突破后的扁平索引
 * @param panelBefore 突破前 `combatPanel` 快照（**绝对值**含装备 / 灵宠 / 炼体）
 * @param panelAfter  突破后 `combatPanel` 快照
 * @param batchId     同一次结算的批次号；空串 = 不与任何东西合并
 */
export function buildBreakthroughRecord({
  kind = 'inner',
  fromLevel,
  toLevel,
  panelBefore = {},
  panelAfter = {},
  batchId = ''
} = {}) {
  const realmOf = kind === 'body' ? getBodyRealmName : getRealmName
  return {
    kind,
    batchId,
    fromLevel: Number(fromLevel) || 0,
    toLevel: Number(toLevel) || 0,
    fromLabel: realmOf(fromLevel)?.name || '',
    toLabel: realmOf(toLevel)?.name || '',
    panelBefore: { ...panelBefore },
    panelAfter: { ...panelAfter },
    count: 1,
    collapsed: false
  }
}

/** 一条记录的四项（或两项）明细：`[{ key, label, value, delta }]` */
export function breakthroughRowsOf(record) {
  const rows = record?.kind === 'body' ? BODY_ROWS : INNER_ROWS
  return rows.map(({ key, label }) => {
    const after = Number(record?.panelAfter?.[key]) || 0
    const before = Number(record?.panelBefore?.[key]) || 0
    return {
      key,
      label,
      value: formatAttrNumber(after),
      delta: formatAttrDelta(after - before)
    }
  })
}

/**
 * 弹窗标题：
 *   · 普通 → 「练气六层 → 练气九层」
 *   · 折叠 → 「突破至练气九层（共 3 次）」
 */
export function breakthroughTitleOf(record) {
  if (!record) return ''
  if (record.collapsed) {
    const times = Math.max(1, Math.floor(Number(record.count) || 1))
    return `突破至${record.toLabel}（共 ${times} 次）`
  }
  return `${record.fromLabel} → ${record.toLabel}`
}

/** 离线报告用的一行：「练气六层→练气九层。攻 20.8（+3.6） · 生命 208（+36）」 */
export function breakthroughLineOf(record) {
  if (!record) return ''
  const head = `${record.fromLabel}→${record.toLabel}。`
  // `delta` 自己已经带符号（`formatAttrDelta`），别再补 `+`
  const body = breakthroughRowsOf(record)
    .map(row => `${row.label} ${row.value}（${row.delta}）`)
    .join(' · ')
  return head + body
}

// ---------- 队列 ----------

/**
 * 同一批次的两条合并成一条：**起点与旧面板取前一条，终点与新面板取后一条**，
 * `count` 累加（折叠文案里的 M 用它）。
 */
export function mergeBreakthroughRecord(prev, next) {
  const a = prev || {}
  const b = next || {}
  return {
    ...b,
    fromLevel: a.fromLevel,
    fromLabel: a.fromLabel,
    panelBefore: { ...(a.panelBefore || {}) },
    count: Math.max(1, Math.floor(Number(a.count) || 1)) + Math.max(1, Math.floor(Number(b.count) || 1)),
    collapsed: false
  }
}

/** 把一撮记录折叠成一条汇总（`collapsed = true`） */
export function collapseBreakthroughRecords(list = []) {
  const items = (list || []).filter(Boolean)
  if (!items.length) return null
  const head = items[0]
  const tail = items[items.length - 1]
  const count = items.reduce((sum, r) => sum + Math.max(1, Math.floor(Number(r.count) || 1)), 0)
  return {
    ...tail,
    fromLevel: head.fromLevel,
    fromLabel: head.fromLabel,
    panelBefore: { ...(head.panelBefore || {}) },
    count,
    collapsed: true
  }
}

/**
 * 入队（纯函数，返回**新数组**，不改入参）。
 *
 *   ① 队尾那条同批次 → 合并（连升多级一条）；
 *   ② 否则追加；
 *   ③ 超过 `limit` → 从第 `limit−1` 条起折叠成一条汇总压到队尾（长度回到 `limit`）。
 */
export function enqueueBreakthrough(queue, record, { limit = BREAKTHROUGH_NOTICE_LIMIT } = {}) {
  const out = Array.isArray(queue) ? [...queue] : []
  if (!record) return out
  const last = out[out.length - 1]
  if (last && record.batchId && last.batchId === record.batchId) {
    out[out.length - 1] = mergeBreakthroughRecord(last, record)
    return out
  }
  out.push(record)
  const cap = Math.max(1, Math.floor(Number(limit) || 1))
  if (out.length > cap) {
    const overflow = out.splice(cap - 1)
    const folded = collapseBreakthroughRecords(overflow)
    if (folded) out.push(folded)
  }
  return out
}

// ---------- 事件总线 ----------

const listeners = new Set()
let silent = false

/** 订阅突破提示；返回退订函数 */
export const onBreakthrough = fn => {
  if (typeof fn !== 'function') return () => {}
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** 触发一条突破提示（离线重放期间被 `silent` 吞掉） */
export const emitBreakthrough = record => {
  if (silent || !record) return
  for (const fn of [...listeners]) fn(record)
}

/** 离线重放开关：true = 只记报告、不弹窗（offline.js 的 try/finally 里配对） */
export const setBreakthroughSilent = value => {
  silent = !!value
}

export const isBreakthroughSilent = () => silent

/** 测试/重置用 */
export const clearBreakthroughListeners = () => listeners.clear()
