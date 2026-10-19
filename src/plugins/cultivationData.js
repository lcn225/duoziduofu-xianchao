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
    feature: '修命铸骨，金锐之气',
    description: '金丹级功法，练气期即可入手。品阶分高，但灵气与桂冈不匹配。'
  }
]

/**
 * 同参（《同参系统》§3.1 / §3.4）
 *
 * 同参契合 = **六档亲和度**（连乘体系下直接相乘，不再乘品阶系数）：
 *   正主 1.0 / 准正主 0.8 / 同系列 0.6 / 近类型 0.4 / 同类型 0.25 / 无关 0.1
 *
 * ⚠ **判定规则暂不实现**（§3.4「先硬编」）。每件物品的 `affinity` 字段就是写死的档位：
 *   桂冈开局五件按「与本命的亲疏」硬编成三档（2026-10-18 用户口径）——
 *     乌鬣猪妖 `series` 0.6（本命刃背乌鬣猪的同系列活体）
 *     饕餮纹盾 `nearType` 0.4（默认主同参；为保住「开局 0.08 → 吕氏 0.152」的破境数学，
 *       它刻意不按 series 的 0.6 算，见《同参系统》§3.4 的已知不一致）
 *     青玉剑 / 精钢刺 / 灵藤木盾 `type` 0.25（同为器物，但与本命无关）
 *   以后物品池打标签时，这三档会被判定规则整体替换。
 * ⚠ 同参灵气只影响「能否使用」，不进契合度。
 * ⚠ 同参不能升级，只能更换；没有「祭炼」机制。
 */
/**
 * 开局五件同参 —— **P17 起是物品池的兼容视图**（2026-10-19）。
 *
 * 底材（id / name / category / series / tier / fateElement / description）全部来自
 * `plugins/items.js`，这里只保留三样**旧口径**：
 *   · `affinity`：**硬编**的六档亲和度。判定规则还没接（《模块一》§4.3 的「先硬编」），
 *     而且盾必须留在 0.4 —— 改成 series 的 0.6 会让「开局 0.08 → 吕氏 0.152」直接断掉。
 *   · `element`：旧字段的单值灵气（当前不参与契合度计算，只作展示/老档兼容）。
 *   · `tier`：旧的「基阶+成色」字符串（如 `1中`），给 UI/老存档原样读。
 *
 * ⚠ 新增同参**不要再往这里加**。同参 = 物品池视图，用 `items.js` 的
 *   `affinityOf` 判定；这张表只服务开局那五件。
 */
const OPENING_ITEM_OVERRIDES = [
  { id: 'taotie_shield', affinity: 'nearType', element: 'earth', tier: '1中' },
  { id: 'wu_li_zhu_yao', affinity: 'series', element: 'fire', tier: '1下' },
  { id: 'qingyu_sword', affinity: 'type', element: 'wood', tier: '1下' },
  { id: 'jinggang_ci', affinity: 'type', element: 'metal', tier: '1下' },
  { id: 'lingteng_shield', affinity: 'type', element: 'wood', tier: 'none' }
]

export const FATE_ITEMS = OPENING_ITEM_OVERRIDES.map(override => {
  const base = itemById(override.id)
  return {
    id: base.id,
    name: base.name,
    kind: KIND_OF_CATEGORY[base.category],
    series: base.series,
    bondFateId: null,
    affinity: override.affinity,
    element: override.element,
    tier: override.tier,
    description: base.description
  }
})

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
 * `kind` 与 FATE_ITEMS.kind 同一套词汇；`series` 供同参判「同系列」。
 * `tier` 是本命品阶，**只用于展示** —— 2026-10-18 起品阶不再封顶同参契合，
 * 同参只看六档亲和度（见 harmony.js 的 `TUNING.fateItem.affinity`）。
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
  activePath: 'inner',
  scatterCount: 0
})

/** 功法品阶配置（含层数上限，仅供展示） */
export const artGradeOf = art => ART_GRADES[art?.grade] || ART_GRADES.qi

/** 灵地基础产出表（供 UI 直接展示，避免再引一次 tiers） */
export { LAND_OUTPUT }
