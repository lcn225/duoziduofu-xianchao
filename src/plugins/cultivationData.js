// 修行系统静态数据：功法 / 同参 / 灵地 / 本命
//
// 数据全部取自设计文档《模块一（最终修订版）：修行与突破系统设计方案》，
// 名称为小说《多子多福：开创仙朝》原文用词。
//
// 本期不做获取途径，数组里列出的即为开局赠送。后续模块会从这里裁剪出
// 「可通过探索/任务/封地获得」的子集。

/** 功法品阶 → 层数上限。层数上限直接决定「功法契合」的上限： */
//   练气篇 10 层 → 相生0.40 + 10×2% + 熟练度0.20 = 0.80
//   筑基级 15 层 → 0.40 + 15×2% + 0.20 = 0.90
//   金丹级 20 层 → 0.40 + 20×2% + 0.20 = 1.00  ← 结丹门槛（100%）靠它才可达
export const ART_GRADES = {
  qi: { name: '练气篇', maxLevel: 10 },
  foundation: { name: '筑基级', maxLevel: 15 },
  core: { name: '金丹级', maxLevel: 20 }
}

/** 灵地等级系数（设计文档 §3.3） */
export const LAND_LEVEL_COEFF = {
  '1下': 0.5,
  '1中': 0.7,
  '1上': 0.9,
  '2下': 1.0,
  '2中': 1.2,
  '3': 1.5
}

export const LAND_LEVEL_NAMES = {
  '1下': '一阶下品',
  '1中': '一阶中品',
  '1上': '一阶上品',
  '2下': '二阶下品',
  '2中': '二阶中品',
  '3': '三阶'
}

/** 功法（设计文档 §3.1 表格） */
export const QI_ARTS = [
  {
    id: 'gui_blood',
    name: '桂氏气血经练气篇',
    element: 'fire',
    grade: 'qi',
    feature: '气血搬运，刚猛直进',
    description: '桂冈家传功法。行功刚猛，与本命刃背乌鬣猪（火属）相合。'
  },
  {
    id: 'lv_sequential',
    name: '吕氏练气次第论',
    element: 'earth',
    grade: 'qi',
    feature: '居中守土，次第生长',
    description: '讲「次第」法门，过三槛时各有观想之法。与本命玉牌（土属）相合。'
  },
  {
    id: 'yuan_ming',
    name: '元氏修命经',
    element: 'metal',
    grade: 'core',
    feature: '修命铸骨，金锐之气',
    description: '金丹级功法，练气期即可入手，层数上限远高于练气篇。'
  }
]

/** 同参（设计文档 §3.2 表格）—— 与本命对应的实体物事 */
export const FATE_ITEMS = [
  {
    id: 'taotie_shield',
    name: '饕餮纹风磨铜镶青金石玉盾',
    kind: '法器',
    element: 'earth',
    quality: '一阶中品',
    description: '重盾，正面防护约一百四十度。与本命饕餮纹玉牌同源。'
  },
  {
    id: 'qingyu_sword',
    name: '青玉剑',
    kind: '飞剑',
    element: 'wood',
    quality: '一阶下品',
    description: '温润飞剑，练气修士常用之物。'
  },
  {
    id: 'jinggang_ci',
    name: '精钢刺',
    kind: '飞剑',
    element: 'metal',
    quality: '一阶下品',
    description: '精钢所制，朴实无华，胜在锋锐。'
  },
  {
    id: 'wu_li_zhu_yao',
    name: '乌鬣猪妖',
    kind: '灵宠',
    element: 'fire',
    quality: '一阶',
    description: '桂冈本命刃背乌鬣猪的活体，与本命同源，契合极高。'
  },
  {
    id: 'lingteng_shield',
    name: '灵藤木盾',
    kind: '法器',
    element: 'wood',
    quality: '不入品',
    description: '灵藤编成的盾，聊胜于无。'
  }
]

/** 灵地（设计文档 §3.3 表格）。unlockAtStart 为 false 的留待后续模块开放。 */
export const SPIRIT_LANDS = [
  {
    id: 'feiying_village',
    name: '飞鹰镇外村庄',
    element: 'earth',
    level: '1下',
    unlockAtStart: true,
    description: '灵气稀薄，但胜在安稳。'
  },
  {
    id: 'kuaizi_hut',
    name: '快子峰顶木屋',
    element: 'metal',
    level: '1中',
    unlockAtStart: true,
    description: '快子峰顶的木屋，老四修建，视野开阔。'
  },
  {
    id: 'xiaojiashan_waist',
    name: '萧家山门半山腰',
    element: 'water',
    level: '1上',
    unlockAtStart: true,
    description: '原萧家山门所在，半山腰一处水气充沛的静室。'
  },
  {
    id: 'feiying_cave',
    name: '飞鹰山顶洞府',
    element: 'fire',
    level: '2下',
    unlockAtStart: false,
    description: '洪晃开辟的洞府，火气充盈。'
  },
  {
    id: 'honghuang_stone',
    name: '洪晃石室',
    element: 'earth',
    level: '2中',
    unlockAtStart: false,
    description: '门主闭关之所，土气厚重。'
  },
  {
    id: 'zhengjia_core',
    name: '郑家山门核心',
    element: 'wood',
    level: '3',
    unlockAtStart: false,
    description: '郑家山门的核心灵地，非其亲信不得入。'
  }
]

/**
 * 玩家本命（小说原文）：刃背乌鬣猪（火）+ 饕餮纹暗金镶青金石玉牌（土）
 *
 * ⚠ 已知问题（待重做）：功法/同参的五行匹配目前是「对全部本命取最大值」，
 * 而玩家这两个本命互为相生（火生土），导致**同一维内几乎所有候选并列**
 * —— 实测三本功法全 42.0%、五个同参全 53.0%，五行选择失去区分度。
 * 已确认这块设计后续会推翻重做，故暂不修。
 */
export const PLAYER_FATES = [
  { id: 'dao_back_boar', name: '刃背乌鬣猪', element: 'fire', kind: '王级变异兽' },
  { id: 'taotie_jade', name: '饕餮纹暗金镶青金石玉牌', element: 'earth', kind: '本命物' }
]

/** 开局已解锁的本命技（小说原文） */
export const INITIAL_FATE_SKILLS = ['猪王战吼', '气机导引']

/** 开局已收集的本命之物 —— 集齐可触发「本命共鸣」 */
export const INITIAL_FATE_ITEMS = ['dao_back_boar']

const byId = list => Object.fromEntries(list.map(x => [x.id, x]))

export const QI_ART_MAP = byId(QI_ARTS)
export const FATE_ITEM_MAP = byId(FATE_ITEMS)
export const SPIRIT_LAND_MAP = byId(SPIRIT_LANDS)

/** 初始 practice 状态（store 与重置逻辑共用） */
export const buildInitialPractice = () => ({
  qiArts: {
    active: 'gui_blood',
    known: Object.fromEntries(QI_ARTS.map(a => [a.id, { level: 1, practiceSeconds: 0 }]))
  },
  fateItems: {
    active: 'taotie_shield',
    known: Object.fromEntries(FATE_ITEMS.map(i => [i.id, { level: 1, refineSeconds: 0 }]))
  },
  spiritLand: {
    current: 'feiying_village',
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

/** 功法品阶配置（含层数上限） */
export const artGradeOf = art => ART_GRADES[art?.grade] || ART_GRADES.qi
