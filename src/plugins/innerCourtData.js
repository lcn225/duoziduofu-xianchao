// 内宅 / 子嗣的**名词**数据 —— 位阶名、本命池、词条池、姓名池、开局预置
//
// 分工（与 cultivationData.js / tiers.js / harmony.js 三件套对齐）：
//   本文件  = 只放**名词**（名字、池子、模板）
//   innerCourt.js 的 TUNING = 只放**数字**（系数、概率、天数、上限）
// 改一个池子的内容来这里；改任何数值去 TUNING。
//
// 本文件**零 import**（同 tiers.js）—— 纯字面量，node 可直接加载。

/**
 * 位阶名。本批只有 P1-P6 可达（P7+ 是女修段，女修还没有获取途径），
 * 但表要完整，否则 UI 读到 P9 会显示空白。
 */
export const RANK_NAMES = {
  1: '通房丫鬟',
  2: '一等丫鬟',
  3: '三等侍妾',
  4: '四等如夫人',
  5: '五等夫人',
  6: '六等正妻',
  7: '七等夫人',
  8: '八等夫人',
  9: '九等夫人',
  10: '十等夫人',
  11: '十一等夫人',
  12: '十二等夫人',
  13: '十三等夫人'
}

/**
 * 子嗣本命池（设计 §6.3），按品质分组。
 *
 * ⚠ **两条硬约束，verify 会断言**：
 *   1. `kind` 只能用 '灵兽' / '器物' / '草木' / '杂物' 这套词汇。
 *      前两个与 PLAYER_FATES（cultivationData.js）**同一套** —— 玩家的本命是
 *      刃背乌鬣猪（'灵兽'）与饕餮纹玉牌（'器物'），写错词汇会让「同类型 1.2」
 *      变成永远命中不了的死代码（cultivationData.js 已为这个坑写过警告）。
 *   2. 玩家两个本命 id **必须出现在池子里**（见 high / top），否则「完全相同 1.5」
 *      同样是死档 —— 子嗣本命跟父亲撞上本来就是「子承父业」的爽点。
 *
 * `element` 必须是 wuxing.js 的 ELEMENTS 键（含兽 / 器两类特殊灵气）。
 */
export const FATE_POOL = {
  // 下品：凡兽 / 凡物
  low: [
    { id: 'wild_boar', name: '野猪', element: 'beast', kind: '灵兽' },
    { id: 'mountain_cat', name: '山猫', element: 'beast', kind: '灵兽' },
    { id: 'grey_wolf', name: '灰狼', element: 'beast', kind: '灵兽' },
    { id: 'blue_stone', name: '青石', element: 'earth', kind: '杂物' },
    { id: 'sand_thorn', name: '沙棘草', element: 'wood', kind: '草木' },
    { id: 'crude_iron_rod', name: '粗铁棍', element: 'metal', kind: '器物' }
  ],
  // 中品：灵兽 / 有灵之物
  mid: [
    { id: 'red_flame_marten', name: '赤炎貂', element: 'fire', kind: '灵兽' },
    { id: 'black_water_turtle', name: '玄水龟', element: 'water', kind: '灵兽' },
    { id: 'spirit_fox', name: '灵狐', element: 'wood', kind: '灵兽' },
    { id: 'iron_womb_bow', name: '铁胎弓', element: 'metal', kind: '器物' },
    { id: 'soul_nurturing_wood', name: '养魂木', element: 'wood', kind: '草木' }
  ],
  // 上品：王级变异兽
  high: [
    { id: 'dao_back_boar', name: '刃背乌鬣猪', element: 'beast', kind: '灵兽' },
    { id: 'golden_wing_eagle', name: '金翅雕', element: 'metal', kind: '灵兽' },
    { id: 'earth_split_bear', name: '裂地熊', element: 'earth', kind: '灵兽' }
  ],
  // 极品：神兽 / 仙器
  top: [
    { id: 'taotie_jade', name: '饕餮纹暗金镶青金石玉牌', element: 'vessel', kind: '器物' },
    { id: 'nine_heaven_robe', name: '九天不灭炼火霓裳', element: 'fire', kind: '器物' },
    { id: 'jade_qilin', name: '玉麒麟', element: 'earth', kind: '灵兽' }
  ]
}

/**
 * 词条池。数量按品质定（下品 1 普通 / 中品 1 稀有 / 上品 2 稀有 / 极品 3 稀有 + 1 传说），
 * 系数在 innerCourt.TUNING.bonus.traitCoef。
 */
export const TRAIT_POOL = {
  normal: [
    { id: 't_hale', name: '体健' },
    { id: 't_quick', name: '机敏' },
    { id: 't_diligent', name: '勤勉' },
    { id: 't_honest', name: '敦厚' },
    { id: 't_deft', name: '手巧' }
  ],
  rare: [
    { id: 't_sword_heart', name: '剑心通明' },
    { id: 't_alchemy_hand', name: '丹心妙手' },
    { id: 't_business_talent', name: '经商奇才' },
    { id: 't_photographic', name: '过目不忘' }
  ],
  legend: [
    { id: 't_deep_fortune', name: '福缘深厚' },
    { id: 't_innate_dao_body', name: '天生道体' }
  ]
}

/**
 * 品质的显示元数据（设计 §6.2 的四档）。
 * 放这里而不是各自写在组件里 —— 内宅页与诞生弹窗都要用，
 * 两份各写一份迟早会分叉（颜色尤其容易）。
 */
export const QUALITY_META = {
  low: { name: '下品', color: '#9e9e9e' },
  mid: { name: '中品', color: '#2196f3' },
  high: { name: '上品', color: '#9c27b0' },
  top: { name: '极品', color: '#ff9800' }
}

/** 侍妾状态的显示元数据 */
export const STATUS_META = {
  idle: { label: '待孕', type: 'success' },
  pregnant: { label: '已孕', type: 'info' },
  recovering: { label: '产后恢复', type: 'warning' }
}

/** 随机凡女的姓名池（抽奖用。刻意与开局预置那 8 位不重名） */
export const SURNAMES = [
  '赵', '钱', '孙', '李', '周', '吴', '郑', '王', '沈', '韩',
  '杨', '朱', '秦', '许', '何', '吕', '施', '张', '孔', '曹'
]

export const GIVEN_NAMES = [
  '春桃', '夏荷', '秋菊', '冬梅', '素娥', '翠儿', '巧儿', '月娘',
  '云娘', '阿秀', '小莲', '紫鹃', '碧桃', '杏儿', '桃夭', '芙蕖'
]

/**
 * 子嗣的随机名池（中性/仙侠向）。
 * ⚠ 与侍妾的 GIVEN_NAMES 分开：那批是丫鬟名，给儿子起「春桃」很出戏。
 */
export const OFFSPRING_GIVEN_NAMES = [
  '青云', '长风', '承影', '怀瑾', '明远', '知微', '星河', '玄月', '景行', '思远',
  '玉衡', '清和', '无咎', '归尘', '听澜', '惊蛰', '观澜', '寒山', '照野', '松声'
]

/** 洗命符：消耗后重抽子嗣的本命与词条（不改灵根/品质） */
export const FATE_CHARM = {
  id: 'fate_charm',
  name: '洗命符',
  description: '洗去子嗣既定的本命与词条，重新抽取一次。'
}

/**
 * 开局预置的 8 位侍妾 —— 姓名/位阶/好感逐字取自设计 §13.2 的 UI 示例，
 * 全部是小说原文里的真实角色（`design/原作/多子多福：开创仙朝1-58.txt`）。
 *
 * ⚠ **两个刻意的处理**（与设计文档有出入，是决策不是疏漏）：
 *   1. 位阶直接给 P3/P4，不追究她们按位阶规则当年怎么升上来的 —— 她们是府里的老人，
 *      当既成事实处理。
 *   2. §13.2 里冯珠儿标「例假」、冯大妮标「已孕」，本批状态机只有
 *      待孕/已孕/产后恢复三种（例假属事件系统），所以**一律给「待孕」**。
 *      理由：首充礼包（第一个子嗣必定有灵根）必须是玩家人为互动得来的，
 *      开局就有一胎在跑会打乱「第一个子嗣」的语义。
 *
 * ⚠ **这份名单只能生效一次**：`persistence.js` 的 deepMerge 对数组是整体替换，
 * 玩家存过档后 `wives` 就进档了，以后再改这里老档不会更新。
 */
export const PRESET_WIVES = [
  { name: '萧金桂', rank: 4, affinity: 85 },
  { name: '丁赛喜', rank: 4, affinity: 72 },
  { name: '冯珠儿', rank: 4, affinity: 45 },
  { name: '叶梨儿', rank: 3, affinity: 68 },
  { name: '丁金宝', rank: 4, affinity: 55 },
  { name: '林多儿', rank: 4, affinity: 60 },
  { name: '黄娇', rank: 3, affinity: 50 },
  { name: '冯大妮', rank: 4, affinity: 70 }
]

/**
 * 侍妾对象的**唯一模板** —— 预置与抽奖都走这里。
 *
 * ⚠ 以后加字段**必须**先在这里补默认值：deepMerge 对嵌套对象是递归合并，
 * 老档的 wife 里没有该键时，就会永远读到 `undefined`（persistence.js 的已知边界）。
 * ⚠ `childrenIds` 只存字符串 id，**不存对象引用** —— 存引用会让
 * JSON.stringify 把同一个子嗣序列化多份，deepMerge 还会把它们变成互不相干的两个副本。
 */
export const newWife = (overrides = {}) => ({
  id: '',
  name: '',
  rank: 1,
  affinity: 50,
  /** 'idle' 待孕 | 'pregnant' 已孕 | 'recovering' 产后恢复 */
  status: 'idle',
  /** 状态结束的**绝对游戏秒**（idle 时为 null） */
  statusEndTime: null,
  /** 受孕 / 产后恢复开始的绝对游戏秒；旧档没有这两个字段，由 normalizePregnancy 反推 */
  pregnancyStartTime: null,
  recoveryStartTime: null,
  interactionCount: 0,
  pregnancyCount: 0,
  /** 连续未孕次数（怀孕保底用） */
  pregPity: 0,
  rootChildrenCount: 0,
  topChildrenCount: 0,
  childrenIds: [],
  /** 'preset' | 'gacha' */
  origin: 'preset',
  sourceDetail: '',
  lastInteractionTime: null,
  ...overrides
})

/**
 * 子嗣对象的唯一模板。
 *
 * ⚠ **没有 bonus 字段** —— 加成是派生值，由 innerCourt.offspringBonusOf 现算。
 *   存进 state 会随 TUNING 改动过期，也会在 deepMerge 后与现算值打架。
 */
export const newOffspring = (overrides = {}) => ({
  id: '',
  name: '',
  motherId: '',
  motherName: '',
  motherRankAtBirth: 1,
  birthTime: 0,
  hasRoot: false,
  quality: null,
  rootCount: 0,
  roots: [],
  fate: null,
  traits: [],
  /** alive | fallen —— 秘境陨落后不删条目（生母的 childrenIds 还指着它） */
  status: 'alive',
  diedAtSeconds: null,
  deathFloor: null,
  ...overrides
})

/** 内宅初始状态（store 与重置逻辑共用，同 buildInitialPractice 的写法） */
export const buildInitialInnerCourt = () => ({
  wives: PRESET_WIVES.map((w, i) => newWife({ ...w, id: `w_${i + 1}`, sourceDetail: '开局内宅' })),
  // 只存「今日已耗」；上限 = 100 + 炼体等级 × 5 由 getter 派生，绝不存 max
  energy: { spentToday: 0 },
  lastInteractionDay: -1,
  /**
   * 'auto' | 'manual'。默认 auto —— 内宅**不暂停时间**，它的主要体验就是
   * 「留在页面里看它自己跑、流水往下滚」。想自己挑人随时切 manual。
   * ⚠ 加字段**必须**先在这里补默认值：deepMerge 对嵌套对象是递归合并，
   *   老档的 innerCourt 里没有这个键时会永远读到 undefined。
   */
  nightMode: 'auto',
  /** 自动模式的挑人规则，见 plugins/innerCourt.js 的 AUTO_RULES */
  autoRule: 'relation',
  /** 流水账。**按时间正序追加**（最新的在最后一行），UI 负责自动滚到底 */
  interactionLog: [],
  nextWifeSeq: PRESET_WIVES.length + 1
})

/** 子嗣初始状态 */
export const buildInitialOffspring = () => ({
  list: [],
  /** 待玩家确认的诞生卡（BirthModal 的数据源） */
  pendingBirthIds: [],
  gacha: { totalDraws: 0, pityNoRoot: 0 },
  nextChildSeq: 1
})
