// 修行系统静态数据：功法 / 同参 / 灵地 / 本命
//
// 数据取自《design/new/灵气系统 — 最终设计文档.md》§3（灵地）与 §8（功法）。
// 名称为小说《多子多福：开创仙朝》原文用词。
//
// 本期不做获取途径：unlockAtStart 为 true 的即为开局赠送，其余留待
// 模块四（封地）/ 模块五（任务战斗）提供来源。

// 带 .js 后缀是刻意的：见 harmony.js 顶部的说明
import { LAND_OUTPUT, landOutputOf } from './tiers.js'
import { KIND_OF_CATEGORY, itemById } from './items.js'
import { itemTagsOf } from './tagHarmony.js'

/**
 * 功法品阶 → 层数上限。
 *
 * ⚠ 层数**不再影响契合度**（《灵气系统》§4.2 的功法契合 = 品阶分 + 覆盖率×40% + 熟练度）。
 * 层数现在只由修炼时长派生、在 UI 展示，不加任何属性——等模块五（任务战斗）
 * 上线后再按战力补加成。层数上限保留在这里是为了展示用。
 */
export const ART_GRADES = {
  qi: { name: '练气篇', maxLevel: 10 },
  foundation: { name: '筑基级', maxLevel: 15 },
  core: { name: '金丹级', maxLevel: 20 }
}

/**
 * 功法（《灵气系统》§8.1 / §8.2）
 *
 * `elements` = 这本功法覆盖的灵气集合，用于算「覆盖率」：
 *   覆盖率 = |功法的 elements ∩ 修士的灵气| / |修士的灵气|
 * 桂冈是兽 + 器 → 兽器双修经覆盖 2/2 = 100%（完全匹配）；
 *                兽吼功覆盖 1/2 = 50%（部分匹配）；
 *                开局三本火/土/金覆盖 0/2 = 0%（不匹配）。
 */
/**
 * 功法残页集齐张数（2026-10-21）。参考丹方 `fragmentsNeeded = 5 × 品阶 + 5`：
 * 练气篇 10 / 筑基级 15 / 金丹级 20。
 */
export const ART_FRAGMENT_NEEDED = { qi: 10, foundation: 15, core: 20 }

export const QI_ARTS = [
  // —— 桂冈可用的兽/器功法（数据存在，但开局不送：见 buildInitialPractice）——
  {
    id: 'beast_roar',
    name: '兽吼功',
    elements: ['beast'],
    grade: 'qi',
    unlockAtStart: false,
    feature: '以声拟兽，震慑心神',
    description: '练气篇兽系功法，只覆盖单一兽灵气（部分匹配）。'
  },
  {
    id: 'vessel_jue',
    name: '御器诀',
    elements: ['vessel'],
    grade: 'qi',
    unlockAtStart: false,
    feature: '御物如臂，灵机相引',
    description: '练气篇器系功法，只覆盖单一器灵气（部分匹配）。'
  },
  {
    id: 'beast_vessel_dual',
    name: '兽器双修经',
    elements: ['beast', 'vessel'],
    grade: 'qi',
    unlockAtStart: false,
    feature: '兽器同参，双脉并进',
    description: '练气篇双修功法，兽、器两条灵气齐备，与桂冈本命完全匹配。'
  },
  {
    id: 'beast_vessel_found',
    name: '万兽御器经',
    elements: ['beast', 'vessel'],
    grade: 'foundation',
    unlockAtStart: false,
    feature: '万兽为兵，御器成阵',
    description: '筑基级双修功法，品阶高于练气篇。'
  },
  {
    id: 'beast_vessel_core',
    name: '兽器同源经',
    elements: ['beast', 'vessel'],
    grade: 'core',
    unlockAtStart: false,
    feature: '兽器同源，本命归一',
    description: '金丹级双修功法，与桂冈本命完全匹配。'
  },

  // —— 开局三本：都不匹配，练气六层需要换掉其中之一 ——
  {
    id: 'gui_blood',
    name: '桂氏气血经练气篇',
    elements: ['fire'],
    grade: 'qi',
    unlockAtStart: true,
    feature: '气血搬运，刚猛直进',
    description: '桂冈家传功法。行功刚猛，与桂冈的兽/器本命不匹配。'
  },
  {
    id: 'lv_sequential',
    name: '吕氏练气次第论',
    elements: ['earth'],
    grade: 'qi',
    unlockAtStart: true,
    /**
     * 吕氏破境（2026-10-18）：原著里桂冈散功重修、照吕氏次第法门过三槛。
     * 练气篇的品阶分只有 0.20，按常规公式过不了第一门槛，所以**基础契合硬编 0.38**
     * —— 0.38 × 同参 0.40 × 灵地 1.00 = **0.152**，刚好跨过练气三层的 0.15。
     * 这不是品阶分能解释的加成，不要再按 grade 表去「纠正」它。
     */
    baseFit: 0.38,
    feature: '居中守土，次第生长',
    description: '讲「次第」法门，过三槛时各有观想之法。与桂冈的兽/器本命不匹配，但次第法门本身契合桂冈的破境路线。'
  },
  {
    id: 'yuan_ming',
    name: '元氏修命经',
    elements: ['metal'],
    grade: 'core',
    unlockAtStart: true,
    /**
     * 2026-10-21 用户拍板「功法不回收，元氏调低」：
     * 金丹级品阶分 0.40 会让「元氏 × 乌鬣猪妖」= 0.40 × 0.60 = **0.24**，
     * 开局免费组合恰好卡线连过三层（0.15）和六层（0.24），门槛形同虚设。
     * 这里按「品阶高但灵气不合」下调到 0.38（与吕氏同分）：
     *   · 元氏 × 盾 0.40 = 0.152 —— 仍可过三层，给玩家第二条路；
     *   · 元氏 × 猪妖 0.60 = 0.228 —— 过不了六层，六层必须去探索拿《兽器双修经》。
     * 金丹级的价值改由 maxLevel 20（熟练度上限）体现，不再靠门槛分。
     */
    baseFit: 0.38,
    feature: '修命铸骨，金锐之气',
    description: '金丹级功法，练气期即可入手。品阶虽高，灵气却与桂冈不匹配，破境并不占便宜。'
  }
]

/**
 * 同参（《模块一》§4.3，2026-10-28 B7 起）
 *
 * 同参契合 = **三层标签重合度**：`Σ(交集权重) / Σ(本命权重)`，0~1 连续，
 * 由 `plugins/tagHarmony.js` 算。**没有六档、没有保底、没有名字/系列比较。**
 *   开局默认盾对「饕餮纹玉牌」= 1.65 / 3.05 = 54.1%（《装备词条表》§8 算例）。
 * ⚠ 同参灵气只影响「能否使用」，不进契合度。
 * ⚠ 同参不能升级，只能更换；没有「祭炼」机制。
 */
/**
 * 开局五件同参 —— **P17 起是物品池的兼容视图**（2026-10-19）。
 *
 * 底材（id / name / category / series / tier / fateElement / description）全部来自
 * `plugins/items.js`，这里只保留两样**旧口径**：
 *   · `element`：旧字段的单值灵气（不参与契合度计算，只作展示/老档兼容）。
 *   · `tier`：旧的「基阶+成色」字符串（如 `1中`），给 UI/老存档原样读。
 *
 * ⚠ **2026-10-28 B7 删掉了 `affinity` 硬编**（盾 0.4 / 猪妖 0.6 / 其余 0.25）。
 *   现在五件的契合度全部按标签现算：盾 54.1%、猪妖 62.3%、青玉剑 8.2%……
 *   开局破境数学（桂氏 0.20 × 同参 × 1.00）随之重算，门槛见 `realm.js` 的新表。
 * ⚠ 新增同参**不要再往这里加**；这张表只服务开局那五件（决定 `fateItems.known`）。
 */
const OPENING_ITEM_OVERRIDES = [
  { id: 'taotie_shield', element: 'earth', tier: '1中' },
  { id: 'wu_li_zhu_yao', element: 'fire', tier: '1下' },
  { id: 'qingyu_sword', element: 'wood', tier: '1下' },
  { id: 'jinggang_ci', element: 'metal', tier: '1下' },
  { id: 'lingteng_shield', element: 'wood', tier: 'none' }
]

export const FATE_ITEMS = OPENING_ITEM_OVERRIDES.map(override => {
  const base = itemById(override.id)
  return {
    id: base.id,
    name: base.name,
    kind: KIND_OF_CATEGORY[base.category],
    category: base.category,
    type: base.type,
    series: base.series,
    bondFateId: null,
    element: override.element,
    tier: override.tier,
    description: base.description,
    tags: itemTagsOf(base.id)
  }
})

const FATE_ITEM_MAP_CACHE = new Map()

/**
 * 同参栏的统一视图（2026-10-22；2026-10-28 B7 起统一按标签算）。
 *
 * 开局五件与其余物品走**同一条**判定：`tagHarmony.companionHarmonyOf`
 * （2026-10-28 删掉了开局五件的 `affinity` 硬编，两套口径合并成一套）。
 *
 * @param {string} id 底材 id
 * @returns 同参视图或 null
 */
export const fateItemViewOf = id => {
  if (!id) return null
  if (FATE_ITEM_MAP[id]) return FATE_ITEM_MAP[id]
  if (FATE_ITEM_MAP_CACHE.has(id)) return FATE_ITEM_MAP_CACHE.get(id)
  const base = itemById(id)
  if (!base) {
    FATE_ITEM_MAP_CACHE.set(id, null)
    return null
  }
  const view = {
    id: base.id,
    name: base.name,
    kind: KIND_OF_CATEGORY[base.category] || '杂物',
    category: base.category,
    type: base.type,
    series: base.series,
    bondFateId: null,
    element: base.fateElement,
    tier: base.tier,
    description: base.description,
    tags: itemTagsOf(base.id)
  }
  FATE_ITEM_MAP_CACHE.set(id, view)
  return view
}

/**
 * 灵地（《灵气系统》§3.1）
 *
 * `elements` 是灵气权重表（和恒为 1）。单属性写成一条，混合属性写多条。
 * `tier` 决定基础产出（见 tiers.js 的 LAND_OUTPUT），**不影响契合度**。
 *
 * 万兽谷兽栏是为解结丹期死锁新增的：六地中唯一的三阶是「郑家山门核心（木）」，
 * 对桂冈（兽+器）匹配 0% → 保底 0.2，连乘下结丹综合只有 0.8×1.0×0.2 = **0.16**，
 * 远低于 0.80 门槛，永远过不去。
 */
export const SPIRIT_LANDS = [
  {
    id: 'feiying_village',
    name: '飞鹰镇外村庄',
    elements: { earth: 1.0 },
    tier: '1下',
    unlockAtStart: true,
    description: '灵气稀薄，但胜在安稳。'
  },
  {
    id: 'kuaizi_hut',
    name: '快子峰顶木屋',
    elements: { beast: 0.6, vessel: 0.4 },
    tier: '1中',
    unlockAtStart: true,
    description: '快子峰顶的木屋，老四修建，视野开阔。兽器混合灵气，与桂冈本命完全匹配。'
  },
  {
    id: 'xiaojiashan_waist',
    name: '萧家山门半山腰',
    elements: { water: 1.0 },
    tier: '1上',
    unlockAtStart: true,
    description: '原萧家山门所在，半山腰一处水气充沛的静室。'
  },
  {
    id: 'feiying_cave',
    name: '飞鹰山顶洞府',
    elements: { fire: 1.0 },
    tier: '2下',
    unlockAtStart: false,
    description: '洪晃开辟的洞府，火气充盈。'
  },
  {
    id: 'honghuang_stone',
    name: '洪晃石室',
    elements: { earth: 1.0 },
    tier: '2中',
    unlockAtStart: false,
    description: '门主闭关之所，土气厚重。'
  },
  {
    id: 'zhengjia_core',
    name: '郑家山门核心',
    elements: { wood: 1.0 },
    tier: '3',
    unlockAtStart: false,
    description: '郑家山门的核心灵地，非其亲信不得入。产出最高，但与桂冈不匹配。'
  },
  {
    id: 'wanshou_valley',
    name: '万兽谷兽栏',
    elements: { beast: 0.7, vessel: 0.3 },
    tier: '3',
    unlockAtStart: false,
    description: '万兽谷中一处圈养妖兽的兽栏。三阶灵地，且兽器兼有，桂冈结丹所需。'
  }
]

/**
 * 玩家本命（小说原文）：刃背乌鬣猪（兽）+ 饕餮纹暗金镶青金石玉牌（器）
 *
 * 双本命双灵根 → 本命数量系数 0.8×（本命越多修炼越慢，这是纯惩罚）。
 * `kind` 与 FATE_ITEMS.kind 同一套词汇；`series` 只用于抽本命时「同系列不重复」，
 * **同参判定不看 series**（2026-10-28 B7 起只看三层标签，见 tagHarmony.js）。
 * `tier` 是本命品阶，只用于展示 —— 品阶从不封顶同参契合。
 */
export const PLAYER_FATES = [
  { id: 'dao_back_boar', name: '刃背乌鬣猪', element: 'beast', kind: '灵兽', series: 'boar', tier: '4' },
  { id: 'taotie_jade', name: '饕餮纹暗金镶青金石玉牌', element: 'vessel', kind: '器物', series: 'taotie', tier: '4' }
]

/** 开局已解锁的本命技（小说原文） */
export const INITIAL_FATE_SKILLS = ['猪王战吼', '气机导引']

/** 开局已收集的本命之物 —— 集齐可触发「本命共鸣」 */
export const INITIAL_FATE_ITEMS = ['dao_back_boar']

const byId = list => Object.fromEntries(list.map(x => [x.id, x]))

export const QI_ART_MAP = byId(QI_ARTS)
export const FATE_ITEM_MAP = byId(FATE_ITEMS)
export const SPIRIT_LAND_MAP = byId(SPIRIT_LANDS)

/** 灵地基础产出（由 tier 派生，不存进存档） */
export const landOutput = land => landOutputOf(land?.tier)

/**
 * 初始 practice 状态（store 与重置逻辑共用）
 *
 * ⚠ entry 里**没有 level**：功法层数由 practiceSeconds 派生（见 harmony.qiArtLevelOf）；
 *   同参不能升级，entry 是空对象。
 */
export const buildInitialPractice = () => ({
  qiArts: {
    active: 'gui_blood',
    known: Object.fromEntries(
      QI_ARTS.filter(a => a.unlockAtStart).map(a => [a.id, { practiceSeconds: 0 }])
    )
  },
  fateItems: {
    active: 'taotie_shield',
    known: Object.fromEntries(FATE_ITEMS.map(i => [i.id, {}]))
  },
  spiritLand: {
    // 开局必须是快子峰顶木屋 —— 连乘下它是唯一对桂冈 1.00 的灵地，
    // 换到别的灵地综合会立刻掉到 0.08 × (保底 0.2) = 0.016
    current: 'kuaizi_hut',
    unlocked: SPIRIT_LANDS.filter(l => l.unlockAtStart).map(l => l.id)
  },
  destiny: {
    fates: PLAYER_FATES.map(f => f.id),
    skills: [...INITIAL_FATE_SKILLS],
    items: [...INITIAL_FATE_ITEMS]
  },
  /**
   * 功法残页（2026-10-21 新增）：`{ [artId]: 张数 }`。
   * 集齐 `ART_FRAGMENT_NEEDED[grade]` 张自动解锁整本。
   * 与丹方残页（`pills.pillFragments`）同构，老档靠 deepMerge 补空对象。
   */
  artFragments: {},
  /**
   * **传承词条**（2026-10-30 B1，《模块二》§15.5.4）：子嗣陨落 / 寿终时把自身词条
   * 返还给桂冈，可叠加。当前只落 **A 类（修炼加成）**；B 类 / 专精 / 搞笑词条
   * 等 #41 词条池扩充后再分流（那时这里会多出 `type` 分支）。
   *
   * 条目形状：`{ id, name, type:'cultivation', effect, fromChildId, fromChildName }`
   * `effect` = 该词条 `effect.cultivation` 的快照（**没填就是 0**；稀有度不换算，
   * 2026-10-30 公式先行）。所以 P60 填数之前，返还进来的也是 0，属预期。
   */
  legacyTraits: [],
  activePath: 'inner',
  scatterCount: 0
})

/** 功法品阶配置（含层数上限，仅供展示） */
export const artGradeOf = art => ART_GRADES[art?.grade] || ART_GRADES.qi

/** 灵地基础产出表（供 UI 直接展示，避免再引一次 tiers） */
export { LAND_OUTPUT }
