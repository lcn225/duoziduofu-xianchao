// 模块七 · 百艺的 store 侧
//
// v2（B11-a1，2026-11-07）：配方 = 真实扣料 + 按轮推进进度条 + 完成后出成品。
// 纯函数（配方 / 额度 / 扣料 / 产物形状）全在 `plugins/arts.js`，这里只做状态与落盘。
//
// ⚠ **功法/配方绝不能 push 进 this.items**：`batchSellEquipments` 会把任何
//   带 truthy `type` 且不是 pill/pet 的条目当成装备卖掉（1 强化石）。
// ⚠ 不要再定义名为 `focus` 的 getter —— `stores/modules/dayLoop.js` 已经有同名 getter，
//   DEV 下会报重名，且后声明的会静默覆盖先声明的。

import {
  ARTS,
  STARTER_MANUALS,
  STARTER_RECIPE_IDS,
  recipesOfArt,
  recipeById,
  proficiencyOf,
  proficiencyIndex,
  fragmentsNeededOf,
  advanceProgress,
  planMaterialsOf,
  lockedBaseIdsOf,
  requiredSecondsOf,
  buildRecipeOutput
} from '../../plugins/arts.js'
import { takeUnits } from '../../plugins/stacks.js'
// 巡视时长的默认值只有一份（`plugins/dayLoop.js` 的 TUNING），这里不抄数字
import { TUNING as DAY_TUNING } from '../../plugins/dayLoop.js'

export const state = () => ({
  arts: {
    /**
     * 当前存档的百艺数据版本。0/缺失 = v1（凭空产出），2 = B11-a1 扣料式。
     * ⚠ 默认值**必须是 0** —— `deepMerge` 会用默认值补老档缺的字段，
     *   写成 2 就等于「老档已经是新格式」，`migrateArtsV2` 永远不会跑（同 realmScaleVersion 的坑）。
     */
    artsVersion: 0,
    manuals: STARTER_MANUALS.map(m => ({ ...m })),
    /** 学到的配方（可做，但没做过） */
    knownRecipes: [...STARTER_RECIPE_IDS],
    /** **亲手做过一次**的配方（B11-b 乡间自动的准入条件） */
    craftedRecipes: [],
    /**
     * 已勾选的百艺。
     * **默认不勾**（2026-10-30 B2 翻案；《模块七》§11.8 沿用）—— 百艺是玩家主动开的产线。
     */
    selected: [],
    /**
     * 精力的**跨 resetDayLoop 存档**。
     * 真正的实时值在 `dayLoop.focus`；这个字段只在读档/重置前后做搬运，
     * 否则每次刷新精力都会回到 100（见 stores/modules/dayLoop.js 的 resetDayLoop）。
     */
    focus: 100,
    /**
     * 「炼体」勾选的**跨 resetDayLoop 存档**（2026-10-21 用户反馈：勾上刷新就丢）。
     */
    bodyEnabled: false,
    /** 巡视时长（1~5 小时）的**跨 resetDayLoop 存档**（P51 #9，2026-10-26） */
    patrolHours: DAY_TUNING.patrol.defaultHours,
    /** 每艺的累计产出件数 */
    crafted: { forge: 0 },
    /**
     * 进度条：`recipeId → 已累积的有效秒数`。
     * 换配方**不清零**（《模块七》§三：支持跨多天、随时中断）。
     */
    progress: {},
    /** 熟练度：`art → 桂冈亲手完成的次数`（乡间自动不涨，B11-b） */
    skill: {},
    /** 每艺当前在排班的配方：`art → recipeId` */
    activeRecipe: {},
    /** 配方残页：`recipeId → 已收集张数`（二阶起才用，B11-a2 拼图入口） */
    recipeFragments: {}
  }
})

export const getters = {
  /** 已勾选的百艺（给 Day.vue 与 dayLoop 建队列入参） */
  selectedArts() {
    return this.arts?.selected || []
  },
  /** 已学的配方（UI 展示用） */
  knownRecipes() {
    return (this.arts?.knownRecipes || []).map(id => recipeById(id)).filter(Boolean)
  },
  /** 炼器累计产出 */
  forgedCount() {
    return this.arts?.crafted?.forge || 0
  },

  /**
   * **配方锁**：当前排班配方会用到的材料品种（baseId 数组）。
   * 药浴 / 回收 / 三换二都要把它并进 `lockedSpecies`，否则排好的料会被吃掉。
   */
  recipeLockedSpecies() {
    const out = new Set()
    for (const art of this.arts?.selected || []) {
      const recipe = this.activeRecipeOf(art)
      if (!recipe) continue
      for (const baseId of lockedBaseIdsOf(recipe, this.items || [])) out.add(baseId)
    }
    return [...out]
  }
}

export const actions = {
  /**
   * 某艺当前排班的配方（没设过就取该艺第一条已学配方）。
   *
   * ⚠ **故意做成 action 而不是 getter**：getter 不能带参数，
   *   写成「返回函数」的 getter 再当方法调，拿到的是函数本身而不是配方
   *   —— B11-a1 第一次落地就踩过，产物变成一条空名字的凡俗杂物。
   */
  activeRecipeOf(art) {
    const known = new Set(this.arts?.knownRecipes || [])
    const picked = recipeById(this.arts?.activeRecipe?.[art])
    if (picked && known.has(picked.id)) return picked
    const pool = recipesOfArt(art).filter(r => known.has(r.id))
    // 没设过就默认落在**灵器配方**上（凡俗是 v1 留下的低价值三件）
    return pool.find(r => r.output?.kind === '灵器') || pool[0] || null
  },

  /** 某艺的熟练度档（完成次数 + 下标 + 档位对象） */
  proficiencyOf(art) {
    const done = Number(this.arts?.skill?.[art]) || 0
    return {
      done,
      index: proficiencyIndex(done),
      rank: proficiencyOf(done)
    }
  },

  /**
   * 某条配方的进度视图（给 UI 与战报）。
   * @returns {{ progress:number, required:number, ratio:number, done:boolean }}
   */
  recipeProgressOf(recipe, art = recipe?.art) {
    if (!recipe) return { progress: 0, required: 1, ratio: 0, done: false }
    const done = Number(this.arts?.skill?.[art]) || 0
    const progress = Number(this.arts?.progress?.[recipe.id]) || 0
    const required = requiredSecondsOf(recipe, done)
    return {
      progress,
      required,
      ratio: required > 0 ? Math.min(1, progress / required) : 0,
      done: progress >= required - 1e-6
    }
  },

  /**
   * 老档迁移（B11-a1，2026-11-07）。幂等靠 `artsVersion`；>= 2 直接 no-op。
   *
   * 做三件事，别的一律不动：
   *   1. **补字段**（progress / skill / activeRecipe / craftedRecipes / recipeFragments）；
   *   2. **补学开局配方** —— 老档 `knownRecipes` 只有 v1 的凡俗三件；
   *   3. **默认不勾**（`《数据定案》§7.1` 翻案：炼器默认不勾）。
   *      ⚠ 这会关掉老档正在跑的炼器 —— 是**预期行为**，不是丢设置。
   */
  migrateArtsV2() {
    if (Number(this.arts?.artsVersion) >= 2) return false
    if (!this.arts) this.arts = {}
    const arts = this.arts
    arts.artsVersion = 2

    const known = new Set(Array.isArray(arts.knownRecipes) ? arts.knownRecipes : [])
    for (const id of STARTER_RECIPE_IDS) known.add(id)
    arts.knownRecipes = [...known]

    arts.selected = []
    if (!Array.isArray(arts.craftedRecipes)) arts.craftedRecipes = []
    if (!arts.progress || typeof arts.progress !== 'object') arts.progress = {}
    if (!arts.skill || typeof arts.skill !== 'object') arts.skill = {}
    if (!arts.activeRecipe || typeof arts.activeRecipe !== 'object') arts.activeRecipe = {}
    if (!arts.recipeFragments || typeof arts.recipeFragments !== 'object') arts.recipeFragments = {}
    return true
  },

  /**
   * 推进**一轮**某艺（45 分钟）。dayLoop 每跑完一个百艺轮次调一次。
   *
   * 三种结局：
   *   · 没排班 / 没勾选 / 熟练度不够 → 什么都不做；
   *   · 材料不足 → 本轮空转，返回 `{ blocked: 'materials', missing }`（时间照跑，进度不涨）；
   *   · 材料够 → 推进度；满则扣料 + 出成品 + 熟练度 +1。
   *
   * @param {string} art
   * @param {{ roundSeconds?:number }} opts 默认一轮 45 分钟
   * @returns {{ completed:boolean, product:object|null, blocked?:string,
   *            missing?:Array, progress?:object, recipe?:object } | null}
   */
  advanceArtRound(art, { roundSeconds } = {}) {
    if (!ARTS.includes(art)) return null
    if (!(this.arts?.selected || []).includes(art)) return null

    const recipe = this.activeRecipeOf(art)
    if (!recipe) return null

    const skill = this.proficiencyOf(art)
    if (skill.index < (Number(recipe.skill) || 0)) {
      return { completed: false, product: null, blocked: 'skill', recipe }
    }

    // 材料不足：本轮照跑（已经花掉的时间和体力不退回），但不涨进度。
    // 这是预期行为：百艺产量受**料源**限制，不是 bug（《模块七》§11.6）。
    const plan = planMaterialsOf(recipe, this.items || [])
    if (!plan.ok) {
      return { completed: false, product: null, blocked: 'materials', missing: plan.missing, recipe }
    }

    const seconds = Number(roundSeconds) > 0 ? Number(roundSeconds) : 45 * 60
    if (!this.arts.progress) this.arts.progress = {}
    const before = Number(this.arts.progress[recipe.id]) || 0
    const step = advanceProgress(recipe, before, seconds, skill.done)

    if (!step.done) {
      this.arts.progress[recipe.id] = step.progress
      this.saveData()
      return { completed: false, product: null, progress: step, recipe }
    }

    // 完成：真扣料（`plan` 是 `[{id, units}]`，`takeUnits` 才会拆堆）
    this.items = takeUnits(this.items || [], plan.plan)
    const product = buildRecipeOutput(recipe, {
      seq: (this.arts.crafted?.[art] || 0) + 1
    })
    if (product) this.gainItem(product, { save: false })

    delete this.arts.progress[recipe.id]
    if (!this.arts.crafted) this.arts.crafted = {}
    this.arts.crafted[art] = (this.arts.crafted[art] || 0) + 1
    if (!this.arts.skill) this.arts.skill = {}
    this.arts.skill[art] = skill.done + 1
    if (!Array.isArray(this.arts.craftedRecipes)) this.arts.craftedRecipes = []
    if (!this.arts.craftedRecipes.includes(recipe.id)) this.arts.craftedRecipes.push(recipe.id)

    this.saveData()
    return { completed: true, product, recipe, progress: step }
  },

  /** 选一条配方排班（换配方保留进度） */
  setArtRecipe(art, recipeId) {
    if (!ARTS.includes(art)) return false
    const recipe = recipeById(recipeId)
    if (!recipe || recipe.art !== art) return false
    if (!(this.arts?.knownRecipes || []).includes(recipeId)) return false
    if (!this.arts.activeRecipe) this.arts.activeRecipe = {}
    this.arts.activeRecipe[art] = recipeId
    this.saveData()
    return true
  },

  /** 某条配方还差几张残页（0 = 已可学；UI 图鉴用） */
  fragmentsMissingOf(recipeId) {
    const recipe = recipeById(recipeId)
    if (!recipe) return 0
    const need = fragmentsNeededOf(recipe)
    const have = Number(this.arts?.recipeFragments?.[recipeId]) || 0
    return Math.max(0, need - have)
  },

  /**
   * 勾选 / 取消一个百艺。
   * 只允许勾**有已学配方**的艺 —— 没有配方时勾上等于空转。
   */
  setArtEnabled(art, enabled) {
    if (!ARTS.includes(art)) return
    if (enabled && !recipesOfArt(art).some(r => (this.arts?.knownRecipes || []).includes(r.id))) return

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
