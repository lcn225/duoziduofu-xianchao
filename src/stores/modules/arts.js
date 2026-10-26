// 模块七 · 百艺的 store 侧
//
// v1 只开放炼器：产物进 `inventory.items`，功法与配方留在 `arts` 自己这里。
// 数值、配方与产物形状全在 `plugins/arts.js`（纯函数，可被 node 断言）。
//
// ⚠ **功法/配方绝不能 push 进 this.items**：`batchSellEquipments` 会把任何
//   带 truthy `type` 且不是 pill/pet 的条目当成装备卖掉（1 强化石）。
// ⚠ 不要再定义名为 `focus` 的 getter —— `stores/modules/dayLoop.js` 已经有同名 getter，
//   DEV 下会报重名，且后声明的会静默覆盖先声明的。

import {
  ARTS,
  RECIPES,
  STARTER_MANUALS,
  recipeById,
  rollRecipe,
  buildCraftedItem
} from '../../plugins/arts'
// 巡视时长的默认值只有一份（`plugins/dayLoop.js` 的 TUNING），这里不抄数字
import { TUNING as DAY_TUNING } from '../../plugins/dayLoop'

export const state = () => ({
  arts: {
    manuals: STARTER_MANUALS.map(m => ({ ...m })),
    knownRecipes: RECIPES.map(r => r.id),
    /** 已勾选的百艺。v1 只有 forge，默认勾上（设计 §2.1） */
    selected: ['forge'],
    /**
     * 精力的**跨 resetDayLoop 存档**。
     * 真正的实时值在 `dayLoop.focus`；这个字段只在读档/重置前后做搬运，
     * 否则每次刷新精力都会回到 100（见 stores/modules/dayLoop.js 的 resetDayLoop）。
     */
    focus: 100,
    /**
     * 「炼体」勾选的**跨 resetDayLoop 存档**（2026-10-21 用户反馈：勾上刷新就丢）。
     *
     * 实时开关仍住在 `dayLoop.bodyEnabled`，但 resetDayLoop 会清空 dayLoop，
     * 重建时若还用硬编码 false，刷新一次设置就没了。这里像 focus 一样留一份偏好，
     * ensureDayLoop 从它回灌。
     */
    bodyEnabled: false,
    /**
     * 巡视时长（1~5 小时）的**跨 resetDayLoop 存档**（P51 #9，2026-10-26）。
     *
     * 与 bodyEnabled 同理：实时值住在 `dayLoop.patrolHours`，刷新时由
     * `ensureDayLoop` 从这里回灌 —— 否则滑杆每次刷新都弹回默认 2 小时。
     * 默认值直接取 `dayLoop.TUNING.patrol.defaultHours`（不在这里抄 2）。
     */
    patrolHours: DAY_TUNING.patrol.defaultHours,
    /** 每艺的累计产出件数 */
    crafted: { forge: 0 }
  }
})

export const getters = {
  /** 已勾选的百艺（给 Day.vue 与 dayLoop 建队列入参） */
  selectedArts() {
    return this.arts?.selected || []
  },
  /** 已学的炼器配方（UI 展示用） */
  knownRecipes() {
    return (this.arts?.knownRecipes || []).map(id => recipeById(id)).filter(Boolean)
  },
  /** 炼器累计产出 */
  forgedCount() {
    return this.arts?.crafted?.forge || 0
  }
}

export const actions = {
  /**
   * 炼一轮器：随机配方 → 生成装备 → 进背包 → 计数 → 落盘。
   *
   * ⚠ **自己 saveData()**：`advanceDayLoop` 的末尾落盘在「本 tick 有练功段」时会被
   *   `gainSpirit` 提前做过，但炼器 completion 不一定和练功在同一 tick 收尾。
   *   不在这里落盘，产物会在刷新后消失（CLAUDE.md 坑 §11）。
   *
   * @returns 生成的装备对象；不满足条件时返回 null
   */
  craftArt(art = 'forge') {
    if (!ARTS.includes(art)) return null
    if (!(this.arts?.selected || []).includes(art)) return null

    const recipe = rollRecipe(this.arts.knownRecipes, art)
    if (!recipe) return null

    const seq = (this.arts.crafted?.[art] || 0) + 1
    const item = buildCraftedItem(recipe, { seq, quality: 'common' })
    if (!item) return null

    this.items.push(item)
    if (!this.arts.crafted) this.arts.crafted = {}
    this.arts.crafted[art] = seq
    this.saveData()
    return item
  },

  /**
   * 勾选 / 取消一个百艺。
   * v1 只有 forge 可勾；其余三艺即使传进来也不会进队列。
   */
  setArtEnabled(art, enabled) {
    if (!ARTS.includes(art)) return
    if (art !== 'forge') return // 本批只开放炼器

    const set = new Set(this.arts?.selected || [])
    if (enabled) set.add(art)
    else set.delete(art)
    // 保持固定顺序，避免 UI 与队列随点击顺序抖动
    this.arts.selected = ARTS.filter(a => set.has(a))

    // 当天即生效：重建 dayLoop 的队列（见 dayLoop.js 的同名 action）
    this.setDayArtsSelected(this.arts.selected)
    this.saveData()
  }
}
