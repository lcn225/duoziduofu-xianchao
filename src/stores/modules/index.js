// 把各模块的 state / getters / actions 合并成一个 Pinia store 定义。
//
// 约定（新增模块时务必遵守）：
// 1. 每个模块文件导出 `state`（**必须**是工厂函数，$reset 依赖它重新调用）、`getters`、`actions`
// 2. actions / getters 用方法简写（`foo() {}`），不能用箭头函数 ——
//    展开后 this 由 Pinia 绑定到 store 实例，跨模块的 this.saveData() 才能工作
// 3. 模块内**不要** import { usePlayerStore }（会造成循环依赖），要跨模块一律走 this.xxx
import * as persistence from './persistence'
import * as core from './core'
import * as attributes from './attributes'
import * as inventory from './inventory'
import * as pills from './pills'
import * as pets from './pets'
import * as progress from './progress'
import * as dungeon from './dungeon'
import * as gacha from './gacha'

const modules = { persistence, core, attributes, inventory, pills, pets, progress, dungeon, gacha }

// 名字冲突会让后加载的模块静默覆盖前一个，开发期直接在控制台报出来
const assertUnique = (keys, what) => {
  if (!import.meta.env.DEV) return
  const seen = new Set()
  for (const key of keys) {
    if (seen.has(key)) {
      console.error(`[store] ${what} 重名: ${key} —— 后声明的会静默覆盖先声明的，请改名`)
    }
    seen.add(key)
  }
}

const collect = field => Object.values(modules).map(m => m[field] || {})

const stateFactories = collect('state')
const getterParts = collect('getters')
const actionParts = collect('actions')

assertUnique(getterParts.flatMap(part => Object.keys(part)), 'getter')
assertUnique(actionParts.flatMap(part => Object.keys(part)), 'action')

export const buildStore = () => ({
  state: () => Object.assign({}, ...stateFactories.map(factory => factory())),
  getters: Object.assign({}, ...getterParts),
  actions: Object.assign({}, ...actionParts)
})
