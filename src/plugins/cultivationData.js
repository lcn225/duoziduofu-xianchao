// 修行系统静态数据：功法 / 同参 / 灵地 / 本命
//
// 数据取自《design/new/灵气系统 — 最终设计文档.md》§3（灵地）与 §8（功法）。
// 名称为小说《多子多福：开创仙朝》原文用词。
//
// 本期不做获取途径：unlockAtStart 为 true 的即为开局赠送，其余留待
// 模块四（封地）/ 模块五（任务战斗）提供来源。

// 带 .js 后缀是刻意的：见 harmony.js 顶部的说明
import { LAND_OUTPUT, landOutputOf } from './tiers.js'

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
    feature: '居中守土，次第生长',
    description: '讲「次第」法门，过三槛时各有观想之法。与桂冈的兽/器本命不匹配。'
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
 * 同参（《灵气系统》§4.3）
 *
 * 同参契合 = 接近度系数 × 品阶系数，两条判定链：
 *   正主   bondFateId 命中某个本命      → 1.0
 *   同系列 series 与本命 series 相同    → 0.7
 *   同类型 kind 与本命 kind 相同        → 0.4
 *   无关                              → 0.15（下限，不是 0）
 *
 * ⚠ `kind` 必须与 PLAYER_FATES.kind 用**同一套词汇**（'灵兽' / '器物'），
 *   否则「同类型 0.4」那档永远命中不了，成为死代码。
 * ⚠ 同参灵气只影响「能否使用」，不进契合度。
 * ⚠ 同参不能升级，只能更换；没有「祭炼」机制。
 */
export const FATE_ITEMS = [
  {
    id: 'taotie_shield',
    name: '饕餮纹风磨铜镶青金石玉盾',
    kind: '器物',
    series: 'taotie',
    bondFateId: null,
    element: 'earth',
    tier: '1中',
    description: '重盾，正面防护约一百四十度。与本命饕餮纹玉牌同系列。'
  },
  {
    id: 'wu_li_zhu_yao',
    name: '乌鬣猪妖',
    kind: '灵兽',
    series: 'boar',
    bondFateId: null,
    element: 'fire',
    tier: '1下',
    description: '桂冈本命刃背乌鬣猪的活体，与本命同系列。'
  },
  {
    id: 'qingyu_sword',
    name: '青玉剑',
    kind: '器物',
    series: 'qingyu',
    bondFateId: null,
    element: 'wood',
    tier: '1下',
    description: '温润飞剑，练气修士常用之物。与玉牌同属器物，但不同系列。'
  },
  {
    id: 'jinggang_ci',
    name: '精钢刺',
    kind: '器物',
    series: 'jinggang',
    bondFateId: null,
    element: 'metal',
    tier: '1下',
    description: '精钢所制，朴实无华，胜在锋锐。与玉牌同属器物，但不同系列。'
  },
  {
    id: 'lingteng_shield',
    name: '灵藤木盾',
    kind: '器物',
    series: 'lingteng',
    bondFateId: null,
    element: 'wood',
    tier: 'none',
    description: '灵藤编成的盾，聊胜于无。不入品。'
  }
]

/**
 * 灵地（《灵气系统》§3.1）
 *
 * `elements` 是灵气权重表（和恒为 1）。单属性写成一条，混合属性写多条。
 * `tier` 决定基础产出（见 tiers.js 的 LAND_OUTPUT），**不影响契合度**。
 *
 * 万兽谷兽栏是为解结丹期死锁新增的：六地中唯一的三阶是「郑家山门核心（木）」，
 * 对桂冈（兽+器）匹配 0%，结丹综合只有 68% < 85%，永远过不去。
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
 * `tier` 是本命品阶（《灵气系统》§1.4），**封顶同参契合**：同参品阶高于本命时按本命算。
 * 桂冈两个本命都是四阶 → `min(同参品阶, 1.00) = 同参品阶`，这个封顶对他是惰性的。
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
    // 开局必须是快子峰顶木屋 —— 综合契合度 56.6% 隐含这个前提
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
