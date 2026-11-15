// 【影子 store】P62 优化方向 5（2026-11-15 · 《模块九》§3.16）
//
// 离线重放（30,240 天）里 **Vue 响应式本身**占 3.3 秒（真档 11.8 秒的 27%）：
// `get` / `set` / `isRef` 都是 Proxy 与 computed 的固定开销，读的全是「算完就要丢掉」的中间值。
// 做法：重放期间把状态换成一份**普通对象**，所有 action / getter 的 `this` 指向它 ——
// 逻辑一行不改，跑完一次 `$patch` 写回真 store。
//
// ⚠ 三条硬约束（改动前先读）：
//   1. **状态是浅拷贝、子树共享**：`state` 里传进来的就是 `toRaw(真 store)` 的同一批对象，
//      重放只是原地改它们 —— 没有 4MB 克隆，也不会有「引用没跟着换」的漏网。
//   2. **getter 变成每次访问重算**（不能是 computed：普通对象上没有依赖追踪）。
//      ⇒ 循环里反复读同一个 getter 会变贵；热循环请先提到循环外（见 §3.16 的实测）。
//   3. **写回必须换新身份**：`state[key] = { ...shadow[key] }`，不能直接赋原对象 ——
//      Vue 的 set 陷阱遇到同一个引用会判「没变」不触发，computed 会停在重放前的旧值。
//
// 本文件**不 import 任何东西**（node 断言直接 import 它，不能拖进 Pinia / 浏览器 API）。

const NOOP = () => {}

/**
 * 造一个无响应式的「影子 store」。
 *
 * @param state   顶层状态键（浅拷贝进影子；子树与真 store 共享同一批对象）
 * @param getters 原样传模块的 getters 表 —— 一律定义为**每次访问重算**的取值器
 * @param actions 原样传模块的 actions 表 —— 方法里 `this` 由调用方式绑定到影子
 */
export const createPlainStore = (state = {}, { getters = {}, actions = {} } = {}) => {
  const plain = {}
  const stateKeys = []
  for (const [key, value] of Object.entries(state)) {
    if (key.startsWith('$')) continue
    plain[key] = value
    stateKeys.push(key)
  }
  for (const [key, fn] of Object.entries(getters)) {
    // 与 state 重名时 state 赢（Pinia 里同名也会互相盖，这里只求别静默丢数据）
    if (key in plain) {
      if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
        console.error(`[影子 store] getter 与 state 重名，已跳过: ${key}`)
      }
      continue
    }
    // 不可枚举：写回 / 序列化时不会被当成数据键
    Object.defineProperty(plain, key, { get: () => fn.call(plain), configurable: true })
  }
  for (const [key, fn] of Object.entries(actions)) plain[key] = fn
  // `inventory.migratePetsV2` 会 `hasOwnProperty(this.$state)`；自引用且不可枚举
  Object.defineProperty(plain, '$state', { value: plain, enumerable: false })
  Object.defineProperty(plain, '$plainStateKeys', { value: stateKeys, enumerable: false })
  // 重放期间写盘一律吞掉：外层本来就在 `beginSaveBatch` 里，且影子里没有节流器实例
  plain.saveData = NOOP
  plain.flushSave = NOOP
  return plain
}

/**
 * 这个对象是不是影子 store？（离线重放期间 `this` 就是它）
 *
 * 用途：重放里那几处「按非响应式变量做的缓存」（如 `innerCourt.offspringRawBonus`
 * 的加成 memo）**只对影子开放** —— 真 store 的 getter 是 computed，缓存键里的
 * `aliveCount` 不是响应式依赖，会出现「子嗣死了但 computed 不重算」的陈旧值。
 */
export const isPlainStore = target =>
  !!target && Object.prototype.hasOwnProperty.call(target, '$plainStateKeys')

/**
 * 把影子的状态一次性写回真 store。
 *
 * 每个顶层键都换成**新身份**的浅拷贝 —— 这是让 computed / 组件重新求值的唯一手段
 * （见文件头约束 3）。数组 `slice`、对象 `{...}`，标量原样。
 */
export const adoptPlainState = (store, shadow) => {
  const fresh = value => {
    if (Array.isArray(value)) return value.slice()
    if (value && typeof value === 'object') return { ...value }
    return value
  }
  const write = state => {
    for (const key of shadow.$plainStateKeys) state[key] = fresh(shadow[key])
  }
  // 真 store 走 $patch（写回集中在一批里）；node 里的 mock store 没有 $patch，直接写
  if (typeof store.$patch === 'function') store.$patch(write)
  else write(store)
}
