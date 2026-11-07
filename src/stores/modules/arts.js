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
  ART_LABELS,
  STARTER_ARTS,
  STARTER_MANUALS,
  STARTER_RECIPE_IDS,
  RECIPES,
  recipesOfArt,
  recipeById,
  proficiencyOf,
  proficiencyIndex,
  fragmentsNeededOf,
  recipeAvailableAtOf,
  recipeRealmLabelOf,
  recipeFragmentNameOf,
  pickFragmentRecipeOf,
  advanceProgress,
  planMaterialsOf,
  lockedBaseIdsOf,
  requiredSecondsOf,
  buildRecipeOutput
} from '../../plugins/arts.js'
import { emitArtUnlock } from '../../plugins/artUnlockNotice.js'
import { takeUnits } from '../../plugins/stacks.js'
// 巡视时长的默认值只有一份（`plugins/dayLoop.js` 的 TUNING），这里不抄数字
import { TUNING as DAY_TUNING } from '../../plugins/dayLoop.js'

export const state = () => ({
  arts: {
    /**
     * 当前存档的百艺数据版本。
     * 0/缺失 = v1（凭空产出），2 = B11-a1 扣料式，3 = B11-a2 三艺 + 残页解锁。
     * ⚠ 默认值**必须是 0** —— `deepMerge` 会用默认值补老档缺的字段，
     *   写成 3 就等于「老档已经是新格式」，迁移永远不会跑（同 realmScaleVersion 的坑）。
     */
    artsVersion: 0,
    manuals: STARTER_MANUALS.map(m => ({ ...m })),
    /** 已解锁的艺（`forge` 开局即送；另三艺拿到第一张残页就解锁，B11-a2） */
    unlockedArts: [...STARTER_ARTS],
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
     * 每艺按**产物阶**的累计件数：`{ alchemy: { 2: 12, 3: 4 } }`。
     * 成就「炼制 N 颗三阶丹药」用它 —— 产出阶 = 配方阶 + 1，成色已固定为「中」。
     */
    craftedByTier: {},
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
    const realmTier = this.realmTier || 'qi'
    // 已学 **且** 当前境界段能做（tier 2 的配方筑基前是灰的，B11-a2）
    const usable = recipe => !!recipe && known.has(recipe.id) && recipeAvailableAtOf(recipe, realmTier)
    const picked = recipeById(this.arts?.activeRecipe?.[art])
    if (picked && picked.art === art && usable(picked)) return picked
    const pool = recipesOfArt(art).filter(usable)
    // 没设过就默认落在**灵器配方**上（凡俗是 v1 留下的低价值三件）
    return pool.find(r => r.output?.kind === '灵器') || pool[0] || null
  },

  /** 某艺解锁了没有（炼器开局即送；其余靠残页） */
  artUnlockedOf(art) {
    return (this.arts?.unlockedArts || STARTER_ARTS).includes(art)
  },

  /**
   * 解锁一个艺（B11-a2）。
   *
   * 触发点只有一处：`gainRecipeFragment` 里第一次拿到该艺的残页。
   * 解锁时把该艺**一阶配方**全部塞进 `knownRecipes` —— 低阶配方免残页（§11.5），
   * 玩家「做一次」只是为了手感，不是为了授权。炼阵没有一阶配方，所以什么也不加。
   */
  unlockArt(art, { notify = true, save = true } = {}) {
    if (!ARTS.includes(art)) return false
    if (!this.arts) this.arts = {}
    if (!Array.isArray(this.arts.unlockedArts)) this.arts.unlockedArts = [...STARTER_ARTS]
    if (this.arts.unlockedArts.includes(art)) return false

    this.arts.unlockedArts.push(art)
    if (!Array.isArray(this.arts.knownRecipes)) this.arts.knownRecipes = []
    for (const recipe of RECIPES) {
      if (recipe.art !== art || Number(recipe.tier) !== 1) continue
      if (!this.arts.knownRecipes.includes(recipe.id)) this.arts.knownRecipes.push(recipe.id)
    }
    // 第 3 档「模块解锁」弹窗（《模块解锁方针》§四）；离线重放期间由组件侧自行排队，不暂停时钟
    if (notify) emitArtUnlock({ art, name: ART_LABELS[art] || art })
    if (save) this.saveData()
    return true
  },

  /**
   * 获得一张百艺残页（B11-a2）。
   *
   * 两条规则（§11.5）：
   *   ① **第一张残页就解锁该艺** —— 这是本批「凭残页解锁」的落点；
   *   ② 集齐 `5 × 配方阶` 张自动学会该配方（二阶 = 10 张）。
   * 一阶配方不吃残页（`fragmentsNeededOf = 0`），已学会的也不再收。
   *
   * @returns {{ success:boolean, learned:boolean, artUnlocked:boolean, recipe:object|null }}
   */
  gainRecipeFragment(recipeId, { save = true } = {}) {
    const recipe = recipeById(recipeId)
    if (!recipe) return { success: false, learned: false, artUnlocked: false, recipe: null }
    const need = fragmentsNeededOf(recipe)
    if (need <= 0) return { success: false, learned: false, artUnlocked: false, recipe }
    if (!this.arts) this.arts = {}
    if (!Array.isArray(this.arts.knownRecipes)) this.arts.knownRecipes = []
    if (this.arts.knownRecipes.includes(recipe.id)) {
      return { success: false, learned: false, artUnlocked: false, recipe }
    }
    if (!this.arts.recipeFragments || typeof this.arts.recipeFragments !== 'object') {
      this.arts.recipeFragments = {}
    }

    // 先解锁艺（不弹窗、不落盘），再记残页 —— 一次拿残页只发一条通知
    const wasLocked = !this.artUnlockedOf(recipe.art)
    if (wasLocked) {
      this.unlockArt(recipe.art, { notify: true, save: false })
    }

    const have = Number(this.arts.recipeFragments[recipe.id]) || 0
    this.arts.recipeFragments[recipe.id] = have + 1
    let learned = false
    if (have + 1 >= need) {
      this.arts.knownRecipes.push(recipe.id)
      learned = true
    }
    if (save) this.saveData()
    return { success: true, learned, artUnlocked: wasLocked, recipe }
  },

  /** 随机一条「该掉残页的配方」id（探索 / 秘境 / 宝匣掉残页时用） */
  pickRecipeFragmentId() {
    const recipe = pickFragmentRecipeOf({ knownRecipes: this.arts?.knownRecipes || [] })
    return recipe?.id || null
  },

  /**
   * 某艺的**配方图鉴**（`views/Arts.vue` 用，顺序 = RECIPES 源顺序）。
   *
   * `state` 四态：`known` 可做 / `fragment` 残页未齐 / `realm` 境界未到 / `art` 艺未解锁。
   * 一阶配方在艺解锁时就是 `known`，不会出现 `fragment`。
   */
  artRecipeViewOf(art) {
    const known = new Set(this.arts?.knownRecipes || [])
    const realmTier = this.realmTier || 'qi'
    const artUnlocked = this.artUnlockedOf(art)
    return recipesOfArt(art).map(recipe => {
      const isKnown = known.has(recipe.id)
      const need = fragmentsNeededOf(recipe)
      const have = Number(this.arts?.recipeFragments?.[recipe.id]) || 0
      const realmOk = recipeAvailableAtOf(recipe, realmTier)
      let state = 'known'
      if (!artUnlocked) state = 'art'
      else if (!isKnown) state = realmOk || need > 0 ? 'fragment' : 'realm'
      else if (!realmOk) state = 'realm'
      const fragmentName = recipeFragmentNameOf(recipe)
      return {
        recipe,
        state,
        known: isKnown,
        realmOk,
        realmLabel: recipeRealmLabelOf(recipe),
        fragmentsNeed: need,
        fragmentsHave: have,
        fragmentName,
        // 已排班（选中）也标出来，图鉴里能看出当前在做什么
        active: this.arts?.activeRecipe?.[art] === recipe.id
      }
    })
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
   * B11-a2 迁移（2026-11-07）。幂等靠 `artsVersion`；>= 3 直接 no-op。
   *
   * 做四件事：
   *   1. 补 `unlockedArts`（老档只有炼器）；
   *   2. 补炼器一阶配方（与 v2 迁移同口径，防脏档）；
   *   3. **旧丹方残页 → 炼丹残页**，1:1 轮转进未学的二阶配方。
   *      旧 12 条丹方绑的是已绝产的灵草（探索早就不再掉），残页留着也是死资产；
   *      折算成新体系的残页，属于「不静默砍收益」；
   *   4. 清空 `pillFragments` / `pillRecipes`（旧炼丹页与旧丹方随本批删除）。
   */
  migrateArtsV3() {
    if (Number(this.arts?.artsVersion) >= 3) return false
    if (!this.arts) this.arts = {}
    const arts = this.arts
    arts.artsVersion = 3

    if (!Array.isArray(arts.unlockedArts)) arts.unlockedArts = [...STARTER_ARTS]
    if (!arts.unlockedArts.includes('forge')) arts.unlockedArts.push('forge')
    if (!Array.isArray(arts.knownRecipes)) arts.knownRecipes = []
    for (const recipe of RECIPES) {
      if (recipe.art !== 'forge' || Number(recipe.tier) !== 1) continue
      if (!arts.knownRecipes.includes(recipe.id)) arts.knownRecipes.push(recipe.id)
    }
    if (!arts.recipeFragments || typeof arts.recipeFragments !== 'object') arts.recipeFragments = {}

    // 旧丹方残页 → 炼丹残页（1:1，轮转填进未学的二阶配方；填满还有剩余就丢弃）
    const legacy =
      this.pillFragments && typeof this.pillFragments === 'object' ? this.pillFragments : {}
    let pool = 0
    for (const value of Object.values(legacy)) pool += Math.max(0, Math.floor(Number(value) || 0))
    if (pool > 0) {
      const targets = RECIPES.filter(
        recipe => recipe.art === 'alchemy' && fragmentsNeededOf(recipe) > 0
      )
      let cursor = 0
      while (pool > 0 && targets.length && cursor < targets.length * 20) {
        const recipe = targets[cursor % targets.length]
        const have = Number(arts.recipeFragments[recipe.id]) || 0
        if (have < fragmentsNeededOf(recipe)) {
          arts.recipeFragments[recipe.id] = have + 1
          pool -= 1
        }
        cursor += 1
      }
      this.pillFragments = {}
      this.pillRecipes = []
    }
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
    if (!this.artUnlockedOf(art)) return null
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
    if (!this.arts.craftedByTier) this.arts.craftedByTier = {}
    if (!this.arts.craftedByTier[art]) this.arts.craftedByTier[art] = {}
    const outTier = Number(product?.tier) || Math.max(1, Number(recipe.tier) || 1) + 1
    this.arts.craftedByTier[art][outTier] = (Number(this.arts.craftedByTier[art][outTier]) || 0) + 1
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
    if (!this.artUnlockedOf(art)) return false
    const recipe = recipeById(recipeId)
    if (!recipe || recipe.art !== art) return false
    if (!(this.arts?.knownRecipes || []).includes(recipeId)) return false
    // 境界段不到的配方不能排班（tier 2 的配方筑基前是灰的）
    if (!recipeAvailableAtOf(recipe, this.realmTier || 'qi')) return false
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
    if (!this.artUnlockedOf(art)) return
    // 要有**当前境界段能做的**配方才能勾 —— 炼阵在练气期能靠残页学会二阶阵，
    // 但排班会一直空转（`activeRecipeOf` 返回 null），这里直接不让勾。
    if (
      enabled &&
      !recipesOfArt(art).some(
        recipe =>
          (this.arts?.knownRecipes || []).includes(recipe.id) &&
          recipeAvailableAtOf(recipe, this.realmTier || 'qi')
      )
    ) {
      return
    }

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
