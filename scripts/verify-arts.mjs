// 百艺纯函数与 store 底座断言（B11-a1，2026-11-07，《模块七》§11）。
//
// 覆盖：
//   · 配方表完整性（id 唯一 / 凡俗有槽位 / 灵器 baseId 在池内 / 阶位口径）
//   · 熟练度四档（阈值 / 降耗时 / 只缩短总时长）
//   · 进度条（一轮 +45 分钟 / 满则完成）
//   · 扣料（按 type 匹配 / 阶上限 / 先低阶后高阶 / 缺料）
//   · 配方锁（只锁配平会用到的品种）
//   · 产物（凡俗 tier 0；灵器升一阶、带 craftedClone、可合并）
//   · store（推进一轮扣料 + 熟练度 + 已做配方）
//   · 老档迁移（默认不勾 / 补学开局配方 / 幂等）
//
//   node scripts/verify-arts.mjs           完整输出
//   node scripts/verify-arts.mjs --list    只列断言标题
//   VERIFY_FILTER=扣料 node scripts/verify-arts.mjs --quiet
import {
  ARTS,
  RECIPES,
  STARTER_RECIPE_IDS,
  TUNING,
  recipeById,
  recipesOfArt,
  proficiencyOf,
  proficiencyIndex,
  fragmentsNeededOf,
  recipeSecondsOf,
  requiredSecondsOf,
  advanceProgress,
  materialTierCapOf,
  planMaterialsOf,
  lockedBaseIdsOf,
  upgradedBaseOf,
  buildRecipeOutput,
  buildCraftedItem
} from '../src/plugins/arts.js'
import { itemById } from '../src/plugins/items.js'
import { isCraftedClone, stackKeyOf, unitsOf } from '../src/plugins/stacks.js'
import { state as artsState, getters as artsGetters, actions as artsActions } from '../src/stores/modules/arts.js'

let failures = 0
let skipped = 0
const results = []
const labels = []
const FILTER = (process.env.VERIFY_FILTER || '').toLowerCase()
const LIST = process.argv.includes('--list')

const eq = (a, b) => {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-6
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => eq(v, b[i]))
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a)
    const kb = Object.keys(b)
    return (
      ka.length === kb.length &&
      ka.every(k => Object.prototype.hasOwnProperty.call(b, k) && eq(a[k], b[k]))
    )
  }
  return a === b
}
const check = (label, actual, expected) => {
  if (FILTER && !label.toLowerCase().includes(FILTER)) {
    skipped += 1
    return
  }
  labels.push(label)
  if (LIST) return
  const ok = eq(actual, expected)
  if (!ok) failures += 1
  results.push({ ok, label, actual, expected })
}

/** 造一份假 store：state + getters + actions */
const makeStore = (patch = {}) => {
  const base = artsState()
  const store = {
    arts: base.arts,
    items: [],
    saved: 0,
    saveData() {
      this.saved += 1
    },
    gainItem(item) {
      if (!this.items) this.items = []
      this.items.push({ ...item, count: (item.count || 1) })
    }
  }
  Object.assign(store, artsGetters)
  Object.assign(store, artsActions)
  return Object.assign(store, patch)
}

/** 一件底材 */
const mat = (id, baseId, type, tier, count = 1, category = '灵材') => ({
  id,
  baseId,
  name: baseId,
  category,
  type,
  tier,
  count
})

// ================= 一、配方表完整性 =================
check('配方：id 唯一', new Set(RECIPES.map(r => r.id)).size, RECIPES.length)
check(
  '配方：art 都合法',
  RECIPES.every(r => ARTS.includes(r.art)),
  true
)
check(
  '配方：凡俗都有槽位与数值（阶位 1，B2 的杂物 tier 0 未做）',
  RECIPES.filter(r => r.output?.kind === 'crafted').every(r => !!r.slot && !!r.stats && r.tier === 1),
  true
)
check(
  '配方：灵器 baseId 都在物品池里',
  RECIPES.filter(r => r.output?.kind === '灵器').every(r => !!itemById(r.output.baseId)),
  true
)
check(
  '配方：灵器都是 1 阶（练气段个人产二阶）',
  [...new Set(RECIPES.filter(r => r.output?.kind === '灵器').map(r => r.tier))],
  [1]
)
check('配方：炼器 7 条（凡俗 3 + 灵器 4）', recipesOfArt('forge').length, 7)
check('开局配方：7 条都认得', STARTER_RECIPE_IDS.length, 7)
check('开局配方：都指向存在的配方', STARTER_RECIPE_IDS.every(id => !!recipeById(id)), true)

// ================= 二、熟练度 =================
check('熟练度：熟练 0 次', proficiencyOf(0).name, '熟练')
check('熟练度：29 次仍是熟练', proficiencyOf(29).name, '熟练')
check('熟练度：30 次精通', proficiencyOf(30).name, '精通')
check('熟练度：100 次大师', proficiencyOf(100).name, '大师')
check('熟练度：300 次宗师', proficiencyOf(300).name, '宗师')
check('熟练度：下标 0/1/2/3', [0, 30, 100, 300].map(proficiencyIndex), [0, 1, 2, 3])
check(
  '熟练度：降耗时 0 / 10% / 25% / 50%',
  TUNING.proficiency.map(r => r.timeReduction),
  [0, 0.1, 0.25, 0.5]
)

// ================= 三、进度条 =================
const oneRound = RECIPES.find(r => r.rounds === 1 && r.art === 'forge')
check('耗时：1 轮 = 2700 秒', recipeSecondsOf(oneRound), 2700)
check('耗时：熟练下需 2700 秒', requiredSecondsOf(oneRound, 0), 2700)
check('耗时：宗师下只缩短总量（1350 秒）', requiredSecondsOf(oneRound, 300), 1350)
check('进度：跑半轮没完成', advanceProgress(oneRound, 0, 1350, 0).done, false)
check('进度：跑满一轮完成', advanceProgress(oneRound, 1350, 1350, 0).done, true)
check('进度：宗师下同样一轮完成', advanceProgress(oneRound, 0, 2700, 300).done, true)
check(
  '进度：完成后进度夹在需求值',
  advanceProgress(oneRound, 0, 99999, 0).progress,
  2700
)

// ================= 四、扣料 =================
const recipeMix = RECIPES.find(r => r.output?.kind === '灵器' && r.inputs.some(i => i.type === '宝晶'))
check('耗料阶上限：凡俗按 1 阶算', materialTierCapOf({ tier: 0 }), 1)
check('耗料阶上限：二阶配方 = 2', materialTierCapOf({ tier: 2 }), 2)

const bagFull = [
  mat('a1', 'jin_1', '金属', 1, 5),
  mat('a2', 'jing_1', '宝晶', 1, 3),
  mat('b1', 'jin_2', '金属', 2, 5)
]
const fullPlan = planMaterialsOf(recipeMix, bagFull)
check('扣料：料齐 = ok', fullPlan.ok, true)
check(
  '扣料：按 type 各取所需（金属 2 / 宝晶 1）',
  fullPlan.plan.map(p => [p.baseId, p.units]).sort(),
  [
    ['jin_1', 2],
    ['jing_1', 1]
  ]
)
check(
  '扣料：**不吃高阶料**（二阶金属没被挑中）',
  fullPlan.plan.some(p => p.baseId === 'jin_2'),
  false
)

const bagLowTierFirst = [
  mat('h1', 'jin_3', '金属', 3, 5),
  mat('l1', 'jin_1', '金属', 1, 5),
  mat('j1', 'jing_1', '宝晶', 1, 5)
]
const lowFirst = planMaterialsOf(recipeMix, bagLowTierFirst)
check(
  '扣料：先低阶后高阶（三阶金属没被挑中）',
  lowFirst.plan.map(p => p.baseId).sort(),
  ['jin_1', 'jing_1']
)

const bagShort = [mat('a1', 'jin_1', '金属', 1, 1), mat('a2', 'jing_1', '宝晶', 1, 3)]
const shortPlan = planMaterialsOf(recipeMix, bagShort)
check('扣料：料不够 = 不 ok', shortPlan.ok, false)
check('扣料：缺料写明 type 与数量', shortPlan.missing[0], { type: '金属', need: 2, have: 1 })

const bagWrongCategory = [mat('x1', 'jin_1', '金属', 1, 5, '灵器')]
check('扣料：只认灵植/灵材（灵器不当底材）', planMaterialsOf(recipeMix, bagWrongCategory).ok, false)

// ================= 五、配方锁 =================
check(
  '配方锁：只锁配平会用到的品种',
  lockedBaseIdsOf(recipeMix, bagFull).sort(),
  ['jin_1', 'jing_1']
)
check('配方锁：没料时不锁东西', lockedBaseIdsOf(recipeMix, []), [])

// ================= 六、产物 =================
const up = upgradedBaseOf('huiguang_1', 1)
check('产物：辉光剑升阶后 = 辉光镇魔剑', up.name, '辉光镇魔剑')
check('产物：升阶后阶位 2', up.tier, 2)

const spiritRecipe = recipeById('forge_huiguang')
const spiritOut = buildRecipeOutput(spiritRecipe)
check('产物：灵器 category 是「灵器」', spiritOut.category, '灵器')
check('产物：灵器阶位 = 配方阶 + 1', spiritOut.tier, 2)
check('产物：灵器带 craftedClone 标记', spiritOut.craftedClone, true)
check('产物：灵器不 roll 词条（否则不能合并）', spiritOut.traits.length, 0)
check('产物：灵器可合并', isCraftedClone(spiritOut) && stackKeyOf(spiritOut).includes('|2|'), true)
check('产物：灵器能装备（有 equipSlot）', !!spiritOut.equipSlot, true)

const trinket = buildCraftedItem(recipeById('jin_zan'), { seq: 1 })
check('产物：凡俗仍是 crafted', trinket.category, 'crafted')
check('产物：凡俗阶位 = 1（仍可回收）', trinket.tier, 1)
check('产物：凡俗可合并', isCraftedClone(trinket), true)

// 同配方两次产物 → 合并键一致
const spiritOut2 = buildRecipeOutput(recipeById('forge_huiguang'))
check('产物：同配方两次合并键一致', stackKeyOf(spiritOut), stackKeyOf(spiritOut2))
check(
  '产物：不同阶不同合并键',
  stackKeyOf(spiritOut) === stackKeyOf(trinket),
  false
)

// ================= 七、store：推进一轮 =================
check('store：没设过排班 → 默认落在灵器配方', makeStore().activeRecipeOf('forge')?.id, 'forge_huiguang')

const store = makeStore()
store.arts.selected = ['forge']
store.arts.activeRecipe = { forge: 'forge_huiguang' }
store.items = [mat('m1', 'jin_1', '金属', 1, 4), mat('m2', 'jing_1', '宝晶', 1, 2)]

const first = store.advanceArtRound('forge')
check('store：第一轮就完成（1 轮配方）', first.completed, true)
check('store：产出辉光镇魔剑', first.product?.name, '辉光镇魔剑')
check('store：扣掉金属 2 件', unitsOf(store.items.find(i => i.id === 'm1')), 2)
check('store：扣掉宝晶 1 件', unitsOf(store.items.find(i => i.id === 'm2')), 1)
check('store：熟练度 +1', store.arts.skill.forge, 1)
check('store：已做配方记下', store.arts.craftedRecipes.includes('forge_huiguang'), true)
check('store：累计产出 +1', store.arts.crafted.forge, 1)
check('store：进度清零', store.arts.progress.forge_huiguang, undefined)

// 缺料时本轮空转（不涨进度、不扣料）
const empty = makeStore()
empty.arts.selected = ['forge']
empty.arts.activeRecipe = { forge: 'forge_huiguang' }
empty.items = []
const blocked = empty.advanceArtRound('forge')
check('store：缺料 blocked = materials', blocked.blocked, 'materials')
check('store：缺料不涨进度', empty.arts.progress.forge_huiguang, undefined)
check('store：缺料熟练度不涨', empty.arts.skill.forge, undefined)

// 没勾选就不做
const off = makeStore()
off.arts.activeRecipe = { forge: 'forge_huiguang' }
check('store：没勾选 → null', off.advanceArtRound('forge'), null)

// 熟练度门槛
const gated = makeStore()
gated.arts.selected = ['forge']
gated.arts.activeRecipe = { forge: 'forge_huiguang' }
gated.arts.knownRecipes = ['forge_huiguang']
gated.items = [mat('m1', 'jin_1', '金属', 1, 4), mat('m2', 'jing_1', '宝晶', 1, 2)]
const gatedRecipe = recipeById('forge_huiguang')
gatedRecipe.skill = 3
check('store：熟练度不够 blocked = skill', gated.advanceArtRound('forge').blocked, 'skill')
gatedRecipe.skill = 0

// 多轮配方：跑一轮不完成
const multi = makeStore()
multi.arts.selected = ['forge']
multi.arts.activeRecipe = { forge: 'forge_huiguang' }
multi.arts.knownRecipes = ['forge_huiguang']
multi.items = [mat('m1', 'jin_1', '金属', 1, 40), mat('m2', 'jing_1', '宝晶', 1, 40)]
const multiRecipe = recipeById('forge_huiguang')
const savedRounds = multiRecipe.rounds
multiRecipe.rounds = 3
const step1 = multi.advanceArtRound('forge')
check('store：3 轮配方跑 1 轮不完成', step1.completed, false)
check('store：进度记到 2700 秒', multi.arts.progress.forge_huiguang, 2700)
check('store：没完成不扣料', unitsOf(multi.items.find(i => i.id === 'm1')), 40)
multiRecipe.rounds = savedRounds

// ================= 八、老档迁移 =================
const legacy = makeStore({
  arts: {
    manuals: [],
    knownRecipes: ['su_jin_ring', 'jin_zan', 'jin_chai'],
    selected: ['forge'],
    focus: 100,
    bodyEnabled: false,
    patrolHours: 2,
    crafted: { forge: 12 }
  }
})
check('迁移：老档跑一次 = true', legacy.migrateArtsV2(), true)
check('迁移：版本号变 2', legacy.arts.artsVersion, 2)
check('迁移：默认不勾', legacy.arts.selected, [])
check('迁移：补学灵器配方', legacy.arts.knownRecipes.length, 7)
check('迁移：保留累计产出', legacy.arts.crafted.forge, 12)
check('迁移：幂等（第二次 false）', legacy.migrateArtsV2(), false)

// ================= 九、静态扫描：纯函数层不碰 Vue/Pinia =================
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(root, 'src/plugins/arts.js'), 'utf8')
check('纯函数层：不 import vue', /from ['"]vue['"]/.test(src), false)
check('纯函数层：不 import pinia', /from ['"]pinia['"]/.test(src), false)
check('纯函数层：不 import store', /stores\//.test(src), false)

// ================= 汇总 =================
if (LIST) {
  for (const label of labels) console.log(`[LIST] ${label}`)
} else {
  for (const r of results) {
    if (!r.ok) {
      console.log(`[ FAIL ] ${r.label}\n         实际: ${JSON.stringify(r.actual)}\n         期望: ${JSON.stringify(r.expected)}`)
    }
  }
  const passed = results.filter(r => r.ok).length
  console.log(`${passed}/${results.length} 通过${skipped ? `（过滤掉 ${skipped} 条）` : ''}`)
  if (failures) console.log(`${failures} 条断言失败`)
  process.exit(failures ? 1 : 0)
}
