// 把各模块的 state / getters / actions 合并成一个 Pinia store 定义。
//
// 约定（新增模块时务必遵守）：
// 1. 每个模块文件导出 `state`（**必须**是工厂函数，$reset 依赖它重新调用）、`getters`、`actions`
// 2. actions / getters 用方法简写（`foo() {}`），不能用箭头函数 ——
//    展开后 this 由 Pinia 绑定到 store 实例，跨模块的 this.saveData() 才能工作
// 3. 模块内**不要** import { usePlayerStore }（会造成循环依赖），要跨模块一律走 this.xxx
import { toRaw } from 'vue'
import { createPlainStore, adoptPlainState } from './plainStore.js'
import * as persistence from './persistence'
import * as core from './core'
import * as attributes from './attributes'
import * as inventory from './inventory'
import * as pets from './pets'
import * as progress from './progress'
import * as dungeon from './dungeon'
import * as practice from './practice'
import * as clock from './clock'
import * as innerCourt from './innerCourt'
import * as dayLoop from './dayLoop'
import * as idle from './idle'
import * as exploration from './exploration'
import * as secretRealm from './secretRealm'
import * as salary from './salary'
import * as offline from './offline'
import * as arts from './arts'
import * as debug from './debug'
import * as estate from './estate'
import * as bath from './bath'
import * as faction from './faction'

const modules = {
  persistence,
  core,
  attributes,
  inventory,
  pets,
  progress,
  dungeon,
  practice,
  clock,
  innerCourt,
  dayLoop,
  idle,
  exploration,
  secretRealm,
  salary,
  offline,
  arts,
  debug,
  estate,
  bath,
  faction
}

// 名字冲突会让后加载的模块静默覆盖前一个，开发期直接在控制台报出来
const assertUnique = (keys, what) => {
  // `?.` 兜住「没有 import.meta.env 的运行时」（node 里 import 本文件跑离线重放基准时）——
  // 写成 `import.meta.env.DEV` 在 node 下会直接抛 TypeError
  if (!import.meta.env?.DEV) return
  const seen = new Set()
  for (const key of keys) {
    if (seen.has(key)) {
      console.error(`[store] ${what} 重名: ${key} —— 后声明的会静默覆盖先声明的，请改名`)
    }
    seen.add(key)
  }
}

const collect = field => Object.values(modules).map(m => m[field] || {})

// state 必须只收**函数**：没有 state 的模块（如 clock.js —— 计时器句柄不能进存档）
// 在这里是 undefined，用 `|| {}` 兜底会得到 `{}`，而 `{}()` 会抛
// 「factory is not a function」把整个 store 构建搞崩。getters/actions 兜底成 {} 是对的。
const stateFactories = Object.values(modules)
  .map(m => m.state)
  .filter(factory => typeof factory === 'function')
const getterParts = collect('getters')
const actionParts = collect('actions')

assertUnique(getterParts.flatMap(part => Object.keys(part)), 'getter')
assertUnique(actionParts.flatMap(part => Object.keys(part)), 'action')

const allGetters = Object.assign({}, ...getterParts)
const allActions = Object.assign({}, ...actionParts)

/**
 * 真 store 的**裸状态**：顶层浅拷贝 + 每个值再 `toRaw` 一层。
 *
 * 只剥顶层就够 —— Vue 的 `reactive` 是惰性的，嵌套对象在被 `reactive()` 取值器包住之前
 * 一直是普通对象，所以顶层裸值下面的子树本来就是裸的。
 */
const rawStateOf = storeApi => {
  const raw = toRaw(storeApi.$state) || {}
  const out = {}
  for (const [key, value] of Object.entries(raw)) out[key] = toRaw(value)
  return out
}

export const buildStore = () => ({
  state: () => Object.assign({}, ...stateFactories.map(factory => factory())),
  getters: Object.assign({}, allGetters),
  actions: {
    ...Object.assign({}, allActions),
    /**
     * 造影子 store（P62 方向 5 · 《模块九》§3.16）。离线重放在它上面跑，
     * 结束时用 `adoptPlainReplayStore` 一次性写回。
     *
     * 为什么挂在 store 上而不是让 `offline.js` 自己 import 本文件：
     * `modules/index.js` 会 import 全部模块（含 `offline.js`），反向 import 就是循环依赖，
     * 而且本文件的模块路径都是无扩展名的，node 断言里 import 不了。放成 action 两边都干净。
     */
    makePlainReplayStore() {
      return createPlainStore(rawStateOf(this), { getters: allGetters, actions: allActions })
    },
    adoptPlainReplayStore(shadow) {
      if (!shadow) return
      adoptPlainState(this, shadow)
      // 写回把顶层键换成了**新身份**，`activePet` 与 `items` 里那只的共享引用会断
      // （读档时 `relinkActivePet` 刚把它们指回同一个对象，见 pets.js 的注释）。
      // 离线重放跑在写回之后，这里必须再指一次 —— 否则「灵兽等级只涨在出战那份上」的老 bug 复活。
      this.relinkActivePet?.()
    }
  }
})
