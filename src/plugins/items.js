// 【物品池】—— 四池唯一的物品数据源（P17 第 2 步，2026-10-19）
//
// 真源：
//   《物品池设计方案》—— 四池、8 字段底材、底材/实例两层模型、`series` 命名、
//   六档同参亲和度（§6.1~§6.3）。
//   《数据定案》§一/§二/§三/§五/§十三/§十四 —— 条目、series、灵材、灵植。
//
// **两条结构铁律**：
//   1. 池子里只存**底材**（8 字段，无成色、无战斗面板）。
//      成色（下/中/上/极）在掉落时 roll，见 `createItemInstance`。
//   2. 同参是**用途，不是分类**。没有「同参表」—— 能不能当同参，取决于
//      `category` / `series` / `name` 与本命的匹配。开局五件的硬编亲和度在
//      `cultivationData.js`（要保住「开局 0.08 → 吕氏 0.152」的破境数学），
//      不要为了统一而改成判定值。
//
// ⚠ 本文件是**纯数据 + 纯函数**，被 `scripts/verify-items.mjs` 用 node 直接加载。
//   相对 import 必须带 `.js` 后缀。
// ⚠ 物品基阶 1~5，**不带成色**；20 品阶 = 5 基阶 × 下/中/上/极 + 不入品。
//   宝匣 7 阶是**宝匣阶级**，不是物品基阶。

import { ITEM_QUALITIES, itemTierKey, itemTierName } from './tiers.js'

/** 四池 */
export const ITEM_CATEGORIES = ['灵器', '灵兽', '灵植', '灵材']

/** 灵气枚举（与 wuxing.js 的 ELEMENTS 键一致） */
export const FATE_ELEMENTS = ['metal', 'wood', 'water', 'fire', 'earth', 'beast', 'vessel']

/** 旧词表 `kind`（模块二的加成判定还在用这套） */
export const KIND_OF_CATEGORY = {
  灵器: '器物',
  灵兽: '灵兽',
  灵植: '草木',
  灵材: '杂物'
}

/**
 * 物品池底材。
 *
 * 每个条目只有 8 个字段：
 *   id / name / category / type / series / tier / fateElement / description
 *
 * - `tier` 是**整数 1~5**，纯基阶，不带成色。
 * - `series` 同 category 内唯一；跨 category 可重名（同参判定先比 category）。
 * - 灵植 series 按形态（shu/cao/hua/guo/ye/teng），灵材按材质。
 */
export const ITEM_POOL = [
  // ======================= 灵兽（兽） =======================
  { id: 'boar_1', name: '乌鬣猪', category: '灵兽', type: '妖兽', series: 'boar', tier: 1, fateElement: 'beast', description: '野性未驯的小兽，鬃毛如铁。' },
  { id: 'boar_2', name: '刃背黑猪妖', category: '灵兽', type: '妖兽', series: 'boar', tier: 2, fateElement: 'beast', description: '背生利刃的黑猪妖，性子凶悍。' },
  { id: 'boar_3', name: '刃背花猪妖', category: '灵兽', type: '妖兽', series: 'boar', tier: 3, fateElement: 'beast', description: '斑纹如花的猪妖，力大无穷。' },
  { id: 'dao_back_boar', name: '刃背乌鬣猪', category: '灵兽', type: '妖兽', series: 'boar', tier: 4, fateElement: 'beast', description: '桂冈本命。刃背如刀，乌鬃似铁。' },
  { id: 'boar_king_4', name: '刃背乌鬣猪王', category: '灵兽', type: '凶兽', series: 'boar', tier: 5, fateElement: 'beast', description: '猪群之王，一声咆哮可令百兽伏地。' },
  { id: 'wu_li_zhu_yao', name: '乌鬣猪妖', category: '灵兽', type: '妖兽', series: 'boar', tier: 1, fateElement: 'beast', description: '桂冈本命刃背乌鬣猪的活体，与本命同系列。' },
  { id: 'huan_1', name: '山獾', category: '灵兽', type: '灵兽', series: 'huan', tier: 1, fateElement: 'beast', description: '山间常见的獾子，还算机灵。' },
  { id: 'huan_2', name: '铁背獾', category: '灵兽', type: '灵兽', series: 'huan', tier: 2, fateElement: 'beast', description: '背甲如铁，善挖洞。' },
  { id: 'huan_3', name: '变异恐獾', category: '灵兽', type: '异种', series: 'huan', tier: 3, fateElement: 'beast', description: '受灵气侵染而变异的巨獾。' },
  { id: 'ya_1', name: '灰鸦', category: '灵兽', type: '灵兽', series: 'ya', tier: 1, fateElement: 'beast', description: '普通的灰羽鸦，能通人言。' },
  { id: 'ya_2', name: '迅风鸦', category: '灵兽', type: '灵兽', series: 'ya', tier: 2, fateElement: 'beast', description: '飞行极快的风鸦，可作传讯之用。' },
  { id: 'ya_3', name: '黑羽鸦', category: '灵兽', type: '妖兽', series: 'ya', tier: 3, fateElement: 'beast', description: '黑羽如墨，能引动一丝阴风。' },
  { id: 'hu_1', name: '灵虎', category: '灵兽', type: '灵兽', series: 'hu', tier: 3, fateElement: 'beast', description: '通灵的猛虎，额间有灵纹。' },
  { id: 'hu_2', name: '斑额云纹虎', category: '灵兽', type: '凶兽', series: 'hu', tier: 4, fateElement: 'beast', description: '额生云纹的巨虎，行走时风云相随。' },
  { id: 'jiao_1', name: '幼蛟', category: '灵兽', type: '异种', series: 'jiao', tier: 3, fateElement: 'beast', description: '尚未化龙的幼蛟，鳞甲初成。' },
  { id: 'jiao_2', name: '大蛟', category: '灵兽', type: '凶兽', series: 'jiao', tier: 5, fateElement: 'beast', description: '盘踞深潭的大蛟，翻江倒海。' },
  { id: 'fox_2', name: '灵狐', category: '灵兽', type: '灵兽', series: 'fox', tier: 2, fateElement: 'beast', description: '尾生三尾的灵狐，颇通人性。' },
  { id: 'marten_2', name: '赤炎貂', category: '灵兽', type: '妖兽', series: 'marten', tier: 2, fateElement: 'beast', description: '周身赤炎的貂，动作快如火光。' },
  { id: 'turtle_2', name: '玄水龟', category: '灵兽', type: '灵兽', series: 'turtle', tier: 2, fateElement: 'beast', description: '背甲蕴水的玄龟，寿元极长。' },
  { id: 'eagle_3', name: '金翅雕', category: '灵兽', type: '妖兽', series: 'eagle', tier: 3, fateElement: 'beast', description: '金翅一展，遮天蔽日。' },
  { id: 'bear_3', name: '裂地熊', category: '灵兽', type: '凶兽', series: 'bear', tier: 3, fateElement: 'beast', description: '一掌可裂地三尺的巨熊。' },
  { id: 'qilin_5', name: '玉麒麟', category: '灵兽', type: '灵兽', series: 'qilin', tier: 5, fateElement: 'beast', description: '传说中的祥瑞之兽，通体如玉。' },

  // ======================= 灵器（器 / 五行材质） =======================
  { id: 'taotie_shield', name: '饕餮纹风磨铜镶青金石玉盾', category: '灵器', type: '盾', series: 'taotie', tier: 1, fateElement: 'vessel', description: '重盾，正面防护约一百四十度。与本命饕餮纹玉牌同系列。' },
  { id: 'taotie_white_2', name: '饕餮纹白玉牌', category: '灵器', type: '牌', series: 'taotie', tier: 2, fateElement: 'vessel', description: '白玉为底的饕餮纹牌，可镇气机。' },
  { id: 'taotie_blue_3', name: '饕餮纹青玉牌', category: '灵器', type: '牌', series: 'taotie', tier: 3, fateElement: 'vessel', description: '青玉牌上饕餮纹路愈显，隐有吞灵之意。' },
  { id: 'taotie_jade', name: '饕餮纹暗金镶青金石玉牌', category: '灵器', type: '牌', series: 'taotie', tier: 4, fateElement: 'vessel', description: '桂冈本命。暗金为框，青金石为心。' },
  { id: 'qingyu_sword', name: '青玉剑', category: '灵器', type: '飞剑', series: 'qingyu', tier: 1, fateElement: 'wood', description: '温润飞剑，练气修士常用之物。' },
  { id: 'qingyu_dagger', name: '青玉匕', category: '灵器', type: '匕', series: 'qingyu', tier: 2, fateElement: 'wood', description: '青玉短匕，轻巧锋利。' },
  { id: 'jinggang_ci', name: '精钢刺', category: '灵器', type: '刺', series: 'jinggang', tier: 1, fateElement: 'metal', description: '精钢所制，朴实无华，胜在锋锐。' },
  { id: 'jinggang_shield', name: '精钢盾', category: '灵器', type: '盾', series: 'jinggang', tier: 2, fateElement: 'metal', description: '精钢重盾，防御扎实。' },
  { id: 'lingteng_shield', name: '灵藤木盾', category: '灵器', type: '盾', series: 'lingteng', tier: 1, fateElement: 'wood', description: '灵藤编成的盾，聊胜于无。' },
  { id: 'lingteng_armor', name: '灵藤木甲', category: '灵器', type: '袍', series: 'lingteng', tier: 2, fateElement: 'wood', description: '灵藤织就的木甲，遇击可再生。' },
  { id: 'xuanbing_1', name: '寒冰刺', category: '灵器', type: '刺', series: 'xuanbing', tier: 1, fateElement: 'water', description: '取极北寒铁所铸，触之刺骨。' },
  { id: 'xuanbing_2', name: '月影玄冰剑', category: '灵器', type: '飞剑', series: 'xuanbing', tier: 2, fateElement: 'water', description: '剑身如月下寒冰，出鞘生霜。' },
  { id: 'xuanbing_3', name: '极寒玄冰剑', category: '灵器', type: '飞剑', series: 'xuanbing', tier: 3, fateElement: 'water', description: '极寒之气凝成的长剑，可冻裂金石。' },
  { id: 'xuanbing_4', name: '万载玄冰剑', category: '灵器', type: '飞剑', series: 'xuanbing', tier: 4, fateElement: 'water', description: '万载玄冰所化，一剑可封百里。' },
  { id: 'huiguang_1', name: '辉光剑', category: '灵器', type: '飞剑', series: 'huiguang', tier: 1, fateElement: 'fire', description: '剑身泛着淡淡辉光，驱邪辟秽。' },
  { id: 'huiguang_2', name: '辉光镇魔剑', category: '灵器', type: '飞剑', series: 'huiguang', tier: 2, fateElement: 'fire', description: '辉光更盛，专克阴邪。' },
  { id: 'huiguang_3', name: '大日镇魔剑', category: '灵器', type: '飞剑', series: 'huiguang', tier: 3, fateElement: 'fire', description: '如大日临空，邪祟无所遁形。' },
  { id: 'huiguang_4', name: '普照镇魔剑', category: '灵器', type: '飞剑', series: 'huiguang', tier: 4, fateElement: 'fire', description: '普照万物，一剑镇魔。' },
  { id: 'jiutian_5', name: '九天不灭炼火霓裳', category: '灵器', type: '袍', series: 'jiutian', tier: 5, fateElement: 'fire', description: '以九天炼火织就，火中不焚。' },
  { id: 'liedi_3', name: '裂地锤', category: '灵器', type: '锤', series: 'liedi', tier: 3, fateElement: 'earth', description: '一锤落地，山岳为裂。' },
  { id: 'qingmu_2', name: '青木杖', category: '灵器', type: '杖', series: 'qingmu', tier: 2, fateElement: 'wood', description: '青木所制，可引草木生机。' },
  { id: 'jinjing_2', name: '金精戒', category: '灵器', type: '戒', series: 'jinjing', tier: 2, fateElement: 'metal', description: '金精打造的指环，聚气凝神。' },
  { id: 'xuanshui_2', name: '玄水铃', category: '灵器', type: '铃', series: 'xuanshui', tier: 2, fateElement: 'water', description: '铃音如流水，可乱敌心神。' },
  { id: 'houtu_3', name: '厚土镜', category: '灵器', type: '镜', series: 'houtu', tier: 3, fateElement: 'earth', description: '厚土之气凝成的宝镜，可挡法术。' },

  // ======================= 灵植（木 / 少量火水） =======================
  { id: 'cao_lingjing_1', name: '灵精草', category: '灵植', type: '草', series: 'cao', tier: 1, fateElement: 'wood', description: '最常见的灵草，蕴含少量灵气。' },
  { id: 'cao_huichun_1', name: '回春草', category: '灵植', type: '草', series: 'cao', tier: 1, fateElement: 'wood', description: '叶脉泛青，嚼之回气。' },
  { id: 'cao_ningshen_2', name: '凝神草', category: '灵植', type: '草', series: 'cao', tier: 2, fateElement: 'wood', description: '可宁心凝神，炼丹常用。' },
  { id: 'cao_longxi_4', name: '龙息草', category: '灵植', type: '草', series: 'cao', tier: 4, fateElement: 'fire', description: '吸收龙气孕育的灵草，极为珍贵。' },
  { id: 'cao_xuanyin_3', name: '玄阴草', category: '灵植', type: '草', series: 'cao', tier: 3, fateElement: 'water', description: '生长在阴寒之地的灵草，性属玄阴。' },
  { id: 'cao_xianyu_5', name: '仙玉草', category: '灵植', type: '草', series: 'cao', tier: 5, fateElement: 'wood', description: '传说中生长在仙境的灵草，可遇不可求。' },
  { id: 'hua_yunwu_1', name: '云雾花', category: '灵植', type: '花', series: 'hua', tier: 1, fateElement: 'wood', description: '生长在云雾缭绕处的灵花，有助于修炼。' },
  { id: 'hua_jinxian_2', name: '金线花', category: '灵植', type: '花', series: 'hua', tier: 2, fateElement: 'wood', description: '花瓣上生有金线，可入丹方。' },
  { id: 'shu_yamu_2', name: '崖木参', category: '灵植', type: '树', series: 'shu', tier: 2, fateElement: 'wood', description: '生于悬崖石缝的老参，根须如木。' },
  { id: 'shu_lingmu_3', name: '灵木', category: '灵植', type: '树', series: 'shu', tier: 3, fateElement: 'wood', description: '整株蕴含灵气的古木。' },
  { id: 'teng_lingteng_3', name: '灵藤', category: '灵植', type: '藤', series: 'teng', tier: 3, fateElement: 'wood', description: '活体灵藤，可编甲制盾。' },
  { id: 'guo_zhuguo_2', name: '朱果', category: '灵植', type: '果', series: 'guo', tier: 2, fateElement: 'fire', description: '色如朱砂的灵果，服之气血翻涌。' },
  { id: 'guo_lingzao_1', name: '灵枣', category: '灵植', type: '果', series: 'guo', tier: 1, fateElement: 'wood', description: '甘甜的灵枣，可补气血。' },
  { id: 'ye_lingcha_1', name: '灵茶叶', category: '灵植', type: '叶', series: 'ye', tier: 1, fateElement: 'wood', description: '可冲泡安神的灵茶叶。' },
  { id: 'ye_hanshuang_2', name: '寒霜叶', category: '灵植', type: '叶', series: 'ye', tier: 2, fateElement: 'water', description: '叶上常凝寒霜，性属水。' },

  // ======================= 灵材（金/土/水/火/木/兽） =======================
  { id: 'ore_fengmo_1', name: '风磨铜块', category: '灵材', type: '金属', series: 'fengmo', tier: 1, fateElement: 'metal', description: '常见的炼器材料，质地坚韧。' },
  { id: 'ore_fengmo_2', name: '风磨铜精', category: '灵材', type: '金属', series: 'fengmo', tier: 2, fateElement: 'metal', description: '提纯后的风磨铜，杂质尽去。' },
  { id: 'ore_fengmo_3', name: '风磨铜髓', category: '灵材', type: '金属', series: 'fengmo', tier: 3, fateElement: 'metal', description: '风磨铜的精华，千金难求。' },
  { id: 'gem_qingjin_1', name: '青金石', category: '灵材', type: '宝晶', series: 'qingjin', tier: 1, fateElement: 'earth', description: '青中带金的灵石，可镶器。' },
  { id: 'gem_qingjin_2', name: '青金精石', category: '灵材', type: '宝晶', series: 'qingjin', tier: 2, fateElement: 'earth', description: '青金石中的精品，灵气内敛。' },
  { id: 'gem_qingjin_3', name: '青金玉髓', category: '灵材', type: '宝晶', series: 'qingjin', tier: 3, fateElement: 'earth', description: '青金石孕育出的玉髓，土气浑厚。' },
  { id: 'ore_anjin_2', name: '暗金锭', category: '灵材', type: '金属', series: 'anjin', tier: 2, fateElement: 'metal', description: '色暗如墨的金属锭，坚不可摧。' },
  { id: 'ore_anjin_4', name: '暗金精', category: '灵材', type: '金属', series: 'anjin', tier: 4, fateElement: 'metal', description: '暗金提纯后的精髓，可铸上品灵器。' },
  { id: 'ore_wugang_2', name: '乌钢块', category: '灵材', type: '金属', series: 'wugang', tier: 2, fateElement: 'metal', description: '乌黑沉重的钢块，锻兵良材。' },
  { id: 'ore_xuantie_2', name: '玄铁', category: '灵材', type: '金属', series: 'xuantie', tier: 2, fateElement: 'metal', description: '沉黑如墨，锻器首选。' },
  { id: 'ore_xuantie_4', name: '玄铁精', category: '灵材', type: '金属', series: 'xuantie', tier: 4, fateElement: 'metal', description: '玄铁中的精华，万载难融。' },
  { id: 'gem_hanbing_3', name: '寒冰晶', category: '灵材', type: '宝晶', series: 'hanbing', tier: 3, fateElement: 'water', description: '寒气凝成的晶石，触手成霜。' },
  { id: 'gem_huojing_3', name: '火晶石', category: '灵材', type: '宝晶', series: 'huojing', tier: 3, fateElement: 'fire', description: '内蕴地火的赤色晶石。' },
  { id: 'soil_chitu_2', name: '赤壤', category: '灵材', type: '灵土', series: 'chitu', tier: 2, fateElement: 'earth', description: '赤红如血的灵土，可培灵植。' },
  { id: 'wood_tiemu_2', name: '铁木', category: '灵材', type: '灵木', series: 'tiemu', tier: 2, fateElement: 'wood', description: '坚逾精铁的灵木。' },
  { id: 'wood_wumu_3', name: '乌木', category: '灵材', type: '灵木', series: 'wumu', tier: 3, fateElement: 'wood', description: '色乌沉香的灵木，可镇魂。' },
  { id: 'wood_yanghun_3', name: '养魂木', category: '灵材', type: '灵木', series: 'yanghun', tier: 3, fateElement: 'wood', description: '温养神魂的灵木，价值不菲。' },
  { id: 'bone_shougu_2', name: '妖兽骨', category: '灵材', type: '骨材', series: 'shougu', tier: 2, fateElement: 'beast', description: '妖兽遗留的坚骨，可炼器。' },
  { id: 'bone_shoujiao_3', name: '灵兽角', category: '灵材', type: '骨材', series: 'shoujiao', tier: 3, fateElement: 'beast', description: '灵兽头顶的角，蕴含兽性灵气。' }
]

const BY_ID = new Map(ITEM_POOL.map(item => [item.id, item]))

/** 底材按 id 查；未知返回 null */
export const itemById = id => BY_ID.get(id) || null

/** 按 category 筛底材（不传则返回全部） */
export const itemsOfCategory = category =>
  category ? ITEM_POOL.filter(item => item.category === category) : [...ITEM_POOL]

/** 8 字段底材快照（不暴露池内引用） */
export const baseSnapshot = item => {
  if (!item) return null
  return {
    id: item.id,
    baseId: item.id,
    name: item.name,
    category: item.category,
    type: item.type,
    series: item.series,
    tier: item.tier,
    fateElement: item.fateElement,
    description: item.description || '',
    // 兼容旧词表：子嗣加成判定读 kind
    kind: KIND_OF_CATEGORY[item.category] || '杂物'
  }
}

/** 同参判定用的 key（同 category 内 series 唯一） */
export const seriesKeyOf = item => `${item?.category || ''}:${item?.series || ''}`

/**
 * 名字近似（准正主的判据）。
 * 初始实现：忽略分隔符后，**一个名字包含另一个**即算近似。
 * 例：刃背乌鬣猪妖·成年 ⊃ 刃背乌鬣猪 → 准正主；
 *     饕餮纹白玉牌 与 饕餮纹暗金镶青金石玉牌 互不包含 → 同系列。
 * ⚠ 这是占位判定，等《模块一》§4.3 的正式规则再换。
 */
export const isNearName = (a, b) => {
  const clean = value => String(value || '').replace(/[·\s]/g, '')
  const x = clean(a)
  const y = clean(b)
  if (!x || !y || x === y) return false
  return x.includes(y) || y.includes(x)
}

/** 同类型判定用的近似 type 组（占位；只影响「近类型 0.4」） */
const TYPE_GROUPS = {
  灵器: [
    ['飞剑', '匕', '刺', '锤', '鞭', '斧', '钩', '叉'],
    ['盾', '袍', '冠'],
    ['簪', '戒', '环', '珠', '铃', '镜', '牌'],
    ['弓', '弩'],
    ['琴', '笛', '笔', '砚', '图']
  ],
  灵兽: [['妖兽', '灵兽', '凶兽', '异种']],
  灵植: [['草', '花', '叶'], ['树', '藤'], ['果']],
  灵材: [['金属', '宝晶'], ['灵土', '灵木'], ['骨材'], ['花', '果', '叶']]
}

export const isNearKind = (category, typeA, typeB) => {
  if (!typeA || !typeB || typeA === typeB) return false
  return (TYPE_GROUPS[category] || []).some(group => group.includes(typeA) && group.includes(typeB))
}

/**
 * 六档同参亲和度（《物品池设计方案》§6.1）。
 *
 * @param item   底材或实例（实例需先反查 baseId）
 * @param master 本命：{ name, category, series, type }
 * @returns {{ tier:'owner'|'quasiOwner'|'series'|'nearType'|'type'|'none', coef:number }}
 *
 * ⚠ 开局五件**不走这条判定** —— 它们的亲和度在 cultivationData.js 硬编。
 */
export const affinityOf = (item, master) => {
  if (!item || !master) return { tier: 'none', coef: 0.1 }
  const sameCategory = item.category === master.category
  const sameSeries = sameCategory && item.series === master.series
  if (item.name === master.name) return { tier: 'owner', coef: 1.0 }
  if (sameSeries && isNearName(item.name, master.name)) return { tier: 'quasiOwner', coef: 0.8 }
  if (sameSeries) return { tier: 'series', coef: 0.6 }
  if (sameCategory && isNearKind(item.category, item.type, master.type)) return { tier: 'nearType', coef: 0.4 }
  if (sameCategory) return { tier: 'type', coef: 0.25 }
  return { tier: 'none', coef: 0.1 }
}

/** 默认成色权重（下 50 / 中 30 / 上 15 / 极 5），宝箱可按阶覆盖 */
export const DEFAULT_QUALITY_WEIGHTS = { 下: 0.5, 中: 0.3, 上: 0.15, 极: 0.05 }

/** roll 成色。rng 返回 1（边界）时不会越界 */
export const rollItemQuality = (rng = Math.random, weights = DEFAULT_QUALITY_WEIGHTS) => {
  const r = rng()
  let acc = 0
  for (const quality of ITEM_QUALITIES) {
    acc += Number(weights[quality]) || 0
    if (r < acc) return quality
  }
  return ITEM_QUALITIES[ITEM_QUALITIES.length - 1]
}

/**
 * 从池子里抽一件底材。
 * tier 区间与 category 都可收窄；`excludeSeries` 用于本命「同系列不重复」。
 */
export const rollBaseItem = ({
  category = null,
  minTier = 1,
  maxTier = 5,
  excludeSeries = new Set(),
  rng = Math.random,
  pool = ITEM_POOL
} = {}) => {
  const lo = Math.max(Math.floor(Number(minTier) || 1), 1)
  const hi = Math.min(Math.floor(Number(maxTier) || 5), 5)
  const candidates = pool.filter(
    item =>
      (!category || item.category === category) &&
      item.tier >= lo &&
      item.tier <= hi &&
      !excludeSeries.has(seriesKeyOf(item))
  )
  if (!candidates.length) return null
  return candidates[Math.min(Math.floor(rng() * candidates.length), candidates.length - 1)]
}

/**
 * 子嗣本命：抽 `count` 件底材快照。
 *
 * 约束（《物品池设计方案》§5.2）：
 *   · 同系列不重复（`category:series`）
 *   · **灵气允许重复**（2026-10-19 修正）：灵根 = 本命 `fateElement` 的**去重集合**，
 *     不是本命数量。3 件木系本命 = 单木灵根；5 件不同属性 = 五灵根。
 *     `usedElements` 已删除，不要再加回来。
 *   · **品阶上限 `maxTier`** 可由调用方传入；子嗣流程在「得到灵根数」之后
 *     再用 `clampFateTiers` 压阶（5→1、4/3→2、2→4、1→5）。这是**上限，不是保底**。
 *   · tier 权重暂按均匀；境界加权等本命强度模型定了再接。
 */
export const rollFateSet = ({ count = 1, maxTier = 5, rng = Math.random, pool = ITEM_POOL } = {}) => {
  const requested = Number(count)
  const n = Number.isFinite(requested)
    ? Math.max(Math.min(Math.floor(requested), 5), 0)
    : 1
  const cap = Math.max(Math.min(Math.floor(Number(maxTier) || 5), 5), 1)
  const eligible = item => Number(item?.tier) <= cap
  const out = []
  const usedSeries = new Set()
  for (let i = 0; i < n; i += 1) {
    // 均匀选一个**还有同系列可用底材的灵气**；灵气可以重复。
    // 这样灵气分布不被池子条目数量带偏（兽类条目多，但不应更容易抽到兽灵根）。
    const availableElements = FATE_ELEMENTS.filter(element =>
      pool.some(
        item =>
          item.fateElement === element && eligible(item) && !usedSeries.has(seriesKeyOf(item))
      )
    )
    const candidatesForElement = element =>
      pool.filter(
        item =>
          item.fateElement === element && eligible(item) && !usedSeries.has(seriesKeyOf(item))
      )

    let item = null
    if (availableElements.length) {
      const element =
        availableElements[
          Math.min(Math.floor(rng() * availableElements.length), availableElements.length - 1)
        ]
      const candidates = candidatesForElement(element)
      item = candidates[Math.min(Math.floor(rng() * candidates.length), candidates.length - 1)]
    } else {
      // 所有系列都用完了：允许同系列重复，保证能抽满
      const candidates = pool.filter(entry => eligible(entry))
      if (candidates.length) {
        item = candidates[Math.min(Math.floor(rng() * candidates.length), candidates.length - 1)]
      }
    }
    if (!item) break
    out.push(baseSnapshot(item))
    usedSeries.add(seriesKeyOf(item))
  }
  return out
}

/**
 * 把一批本命压到 `maxTier` 以内：超阶的换成**同灵气**的低阶底材。
 *
 * 用于「先定本命 → 由本命去重得到灵根数 → 再按灵根数封顶」的第二遍。
 * 换底材不换灵气，所以灵根集合不变；同系列尽量不重复。
 * 换不到同灵气的低阶底材时保留原样（宁可越阶，也不改灵根集合）。
 */
export const clampFateTiers = ({ fates = [], maxTier = 5, rng = Math.random, pool = ITEM_POOL } = {}) => {
  const cap = Math.max(Math.min(Math.floor(Number(maxTier) || 5), 5), 1)
  const out = fates.map(fate => ({ ...fate }))
  for (let i = 0; i < out.length; i += 1) {
    if (Number(out[i]?.tier) <= cap) continue
    const element = out[i].fateElement
    const used = new Set(out.filter((_, j) => j !== i).map(seriesKeyOf))
    const candidates = pool.filter(
      item =>
        item.fateElement === element &&
        Number(item.tier) <= cap &&
        !used.has(seriesKeyOf(item))
    )
    if (!candidates.length) continue
    const item = candidates[Math.min(Math.floor(rng() * candidates.length), candidates.length - 1)]
    out[i] = baseSnapshot(item)
  }
  return out
}

/** FNV-1a：老档补齐本命时的稳定索引（刷新不重掷） */
const stableIndex = (seed, mod) => {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return mod > 0 ? (hash >>> 0) % mod : 0
}

/**
 * 老档迁移：按已有的 `roots` 稳定补齐本命，**不重掷**。
 *
 * P17 之前的 `fate` 是单件、且与 `roots` 独立抽的；读档时要把
 * 「本命数量 = 灵根数量」补回来（**老档迁移例外**：保留旧档已确定的灵根数，
 * 新档走「本命去重 → 灵根」，两者方向相反）。`seed` 用子嗣 id + 名字，
 * 保证刷新稳定。新档不要用这个 —— 新档走 `rollFateSet`。
 */
export const fatesFromRoots = ({ roots = [], maxTier = 5, seed = '', pool = ITEM_POOL } = {}) => {
  const elements = [...new Set((roots || []).filter(Boolean))]
  const cap = Math.max(Math.min(Math.floor(Number(maxTier) || 5), 5), 1)
  const out = []
  const usedSeries = new Set()
  for (let i = 0; i < elements.length; i += 1) {
    const element = elements[i]
    const candidates = pool.filter(
      item =>
        item.fateElement === element &&
        Number(item.tier) <= cap &&
        !usedSeries.has(seriesKeyOf(item))
    )
    // 上限优先：该灵气在上限内没有底材就跳过，宁可少一件，也不越阶。
    // 当前 7 种灵气都有一阶底材，正常走不到这里。
    if (!candidates.length) continue
    const item = candidates[stableIndex(`${seed}|${element}|${i}`, candidates.length)]
    out.push(baseSnapshot(item))
    usedSeries.add(seriesKeyOf(item))
  }
  return out
}

/** 底材显示名：`一阶【寒冰刺】` */
export const baseDisplayNameOf = item => {
  if (!item) return '—'
  return `${item.tier}阶【${item.name}】`
}

/** 实例显示名：`一阶极品【寒冰刺】`；不入品 → `一阶【寒冰刺】` */
export const displayNameOf = (item, quality = '中') => {
  if (!item) return '—'
  return `${itemTierName(itemTierKey(item.tier, quality))}【${item.name}】`
}

let instanceSeq = 0
/**
 * 底材 → 实例（《物品池设计方案》§4.2）。
 * 池子只存模板；掉落后才 roll 成色、生成 stats。
 *
 * @param base   底材（池内对象或快照）
 * @param quality 成色：下/中/上/极/none
 * @param stats  战斗面板（由模块五/百艺生成；本步不实现公式）
 */
export const createItemInstance = (
  base,
  { quality = '中', stats = null, instanceId = null, equippedBy = null, location = 'inventory' } = {}
) => {
  if (!base) return null
  instanceSeq += 1
  const tierKey = itemTierKey(base.tier, quality)
  return {
    instanceId: instanceId || `inst_${Date.now().toString(36)}_${instanceSeq}`,
    baseId: base.id,
    name: base.name,
    category: base.category,
    type: base.type,
    series: base.series,
    tier: base.tier,
    quality,
    tierKey,
    displayName: displayNameOf(base, quality),
    stats,
    equippedBy,
    location
  }
}

/**
 * 子嗣本命池的**兼容视图**（旧代码按品质四档读）。
 *
 * P17 起本命真源是上面的 ITEM_POOL；这里只把底材按基阶粗分四档，
 * 供 `innerCourtData` 继续导出旧名字、供 verify 检查元素/kind 词汇。
 * **新代码不要再用它抽本命** —— 用 `rollFateSet`。
 */
const fateEntryOf = item => ({
  id: item.id,
  name: item.name,
  element: item.fateElement,
  kind: KIND_OF_CATEGORY[item.category] || '杂物'
})

export const FATE_POOL = {
  low: ITEM_POOL.filter(item => item.tier === 1).map(fateEntryOf),
  mid: ITEM_POOL.filter(item => item.tier === 2).map(fateEntryOf),
  high: ITEM_POOL.filter(item => item.tier === 3).map(fateEntryOf),
  top: ITEM_POOL.filter(item => item.tier >= 4).map(fateEntryOf)
}
