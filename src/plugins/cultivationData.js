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
 * 功法品阶 —— **四阶 × 四品 = 十六档**（《功法系统》§1.2，2026-10-30 定稿）。
 *
 * 旧的三档 `qi / foundation / core` 编码**已作废**，新编码是 `<阶>_<品>`：
 *   qi_low … qi_peak / foundation_… / core_… / nascent_…
 *
 * `maxLevel` 只跟**阶**走（10 / 15 / 20 / 25），与品无关。
 * 十六档的**品阶分**在 `harmony.js` 的 `TUNING.qiArt.gradeScore`（P56-a 已落地）；
 * 旧的 `legacyGradeOf` 兼容层（十六档 → 三档）已删除。
 */
export const ART_TIER_KEY_OF = { qi: 1, foundation: 2, core: 3, nascent: 4 }
export const ART_TIER_NAMES = { 1: '练气篇', 2: '筑基级', 3: '金丹级', 4: '元婴级' }
export const ART_QUALITY_NAMES = { low: '下品', mid: '中品', high: '上品', peak: '极品' }
export const ART_MAX_LEVEL = { 1: 10, 2: 15, 3: 20, 4: 25 }

/** 十六档表：`qi_low` → `{ tier, quality, name, maxLevel }` */
export const ART_GRADES = Object.freeze(
  Object.entries(ART_TIER_KEY_OF).reduce((acc, [key, tier]) => {
    for (const quality of Object.keys(ART_QUALITY_NAMES)) {
      const grade = `${key}_${quality}`
      acc[grade] = Object.freeze({
        tier,
        quality,
        name: `${ART_TIER_NAMES[tier]}·${ART_QUALITY_NAMES[quality]}`,
        maxLevel: ART_MAX_LEVEL[tier]
      })
    }
    return acc
  }, {})
)

/** 功法阶（1~4）。优先读数据里的 `tier`，没有就按 `grade` 前缀派生 */
export const artTierOf = art => {
  if (art?.tier) return art.tier
  const key = String(art?.grade || 'qi').split('_')[0]
  return ART_TIER_KEY_OF[key] || 1
}

/**
 * 功法残页集齐张数 —— **按阶四档**（《功法系统》§7.2，2026-10-30 翻案）。
 * 旧的 `{ qi:10, foundation:15, core:20 }` 三档作废；张数不按 quality 细分。
 */
export const ART_FRAGMENT_NEEDED = Object.freeze({ 1: 10, 2: 15, 3: 20, 4: 25 })

/** 五大类（《功法系统》§2.2）—— 顺序即 UI 分组顺序 */
export const ART_CATEGORIES = Object.freeze(['心法', '法术', '器诀', '身法', '炼体'])

/**
 * 属性键：数据里存英文键（覆盖率算法与 `PLAYER_FATES.element` 同一套词），
 * UI 用 `ELEMENT_LABELS` 显示中文。`universal` = 通用（所有修士视同完全匹配），
 * `[]` = 无属性（口径待 §8.2 #9，暂按 0 处理）。
 */
export const ELEMENT_LABELS = Object.freeze({
  metal: '金',
  wood: '木',
  water: '水',
  fire: '火',
  earth: '土',
  beast: '兽',
  vessel: '器',
  universal: '通用'
})

/**
 * 功法（《功法系统》§2 / §一）。**90 本**，字段与
 * [`design/30-数据与决议/功法表-90.md`] 一一对应。
 *
 * `elements` = 这本功法覆盖的灵气集合（英文键，与 `PLAYER_FATES.element` 同一套词），
 * 用于算「覆盖率」：
 *   覆盖率 = |功法的 elements ∩ 修士的灵气| / |修士的灵气|
 *   桂冈是兽 + 器 → 兽器双修经覆盖 2/2 = 100%（完全匹配）；
 *                   兽吼功覆盖 1/2 = 50%（部分匹配）；
 *                   开局三本火/土/金覆盖 0/2 = 0%（不匹配）。
 * `['universal']` = 通用（所有修士视同完全匹配，`artCoverage` 直接给 1）；
 * `[]` = 无属性（口径待《功法系统》§8.2 #9，暂按 0）。
 *
 * `grade` = 十六档编码；`tier` / `quality` 由它派生，不手写。
 * `category` = 五大类，只作展示与掉落分池（非心法效果 P56 之后才接数值）。
 */
const art = (id, name, elements, grade, category, feature, description, extra = {}) => {
  const [tierKey, quality] = grade.split('_')
  return {
    id,
    name,
    elements,
    grade,
    tier: ART_TIER_KEY_OF[tierKey],
    quality,
    category,
    unlockAtStart: false,
    feature,
    description,
    ...extra
  }
}

export const QI_ARTS = [
  // ================= T1 · 练气篇 · 25 本 =================
  art('beast_roar', '兽吼功', ['beast'], 'qi_mid', '心法', '声波攻防兼备',
    '以灵力鼓荡喉间，作兽王长吼。吼声可震人心神，亦可凝作气墙挡下飞石暗器，攻守皆在一嗓之间。'),
  art('beast_vessel_dual', '兽器双修经', ['beast', 'vessel'], 'qi_mid', '心法', '兽器双修，灵力可分可合',
    '分灵力为兽、器二脉，各循其道，临阵再合为一股。桂冈家传之外唯一能同时喂饱双本命的练气法门。'),
  art('gui_blood', '桂氏气血经练气篇', ['fire'], 'qi_mid', '心法', '气血温养灵力，开局即得',
    '桂家自小修习的练气法。以气血温养灵力，行功刚猛直进，虽与兽器本命不合，却是打底的稳妥功夫。',
    { unlockAtStart: true }),
  art('lv_sequential', '吕氏练气次第论', ['earth'], 'qi_mid', '心法', '步骤分明，最适合打基础',
    '吕氏散功重修时依仗的法门。一步一观想、一层一印证，次第分明，看似平实，过槛时最不易出错。', {
      unlockAtStart: true,
      /**
       * 吕氏破境（2026-10-18）：原著里桂冈散功重修、照吕氏次第法门过三槛。
       * 练气篇中品的品阶分只有 **0.21**，按常规公式过不了第一门槛，
       * 所以**基础契合硬编 0.38** —— 0.38 × 同参 0.541 × 灵地 1.00 = **0.206**，
       * 跨过练气三层的 0.15（《功法系统》§3.3）。心法等级加成在 0.38 之上另加。
       * 这不是品阶分能解释的加成，别再按 grade 表「纠正」它。
       */
      baseFit: 0.38
    }),
  art('huangting_jing', '黄庭经', ['universal'], 'qi_peak', '心法', '稳固道心的辅助道书',
    '黄庭内景，存思守一。不论灵根如何，修之皆能安定道心、少生心魔，是少见的无属性门槛道书。'),
  art('guanchao_jing', '观潮经并注', ['water'], 'qi_mid', '心法', '观潮悟道，助丹论体悟',
    '借潮起潮落喻灵力升降，注文详尽。修此经者，对结丹时火候涨落格外敏悟，水灵根修士尤宜。'),
  art('quji_bixiong', '趋吉避凶诀', [], 'qi_high', '心法', '卦术风水，灵光一闪',
    '以卦象推演吉凶，以风水勘定行止。修行路上偶得灵光一闪，避开的往往正是一场无妄之灾。'),
  art('lishan_jing', '离山经', ['earth'], 'qi_high', '心法', '土系根本练气经书',
    '离山一脉根本经书。取土之厚、山之静，讲究根基扎稳再谈高远，土灵根修士的练气正途。'),
  art('dumu_jue', '毒木诀', ['wood'], 'qi_high', '法术', '毒木灵力伤敌',
    '引木灵化毒，缠敌于无形。中者初时不觉，待灵力滞涩时毒已入脉，最宜阴人于林间。'),
  art('suichen_ji', '碎尘击', ['earth'], 'qi_low', '法术', '击碎黏土，贯通聚灵阵',
    '最简单的一手土系小术，本用于击碎黏土、掘井通渠，聚灵阵堵塞时也拿它一轰了事。'),
  art('fengyun_jianjue', '蜂云剑诀', ['vessel'], 'qi_high', '器诀', '群蜂之势御剑成阵',
    '御一口飞剑如驱群蜂，散则万点寒芒，聚则一锥穿甲。剑势绵密，最耗神识。'),
  art('pofeng_dunwu', '泼风盾舞', ['earth', 'vessel'], 'qi_mid', '器诀', '风盾旋转护身，攻守兼备',
    '以盾御风，旋转如轮。盾面风刃泼出可伤人，收盾则可护住周身，是少见能攻能守的器诀。'),
  art('yaoji_shenfa', '遥及身法', [], 'qi_mid', '身法', '简练实用，利于争斗近身',
    '不依灵气、不择地形的身法。步法简练，进退如尺，专为争斗中贴敌近身而练。'),
  art('jingang_lianti', '金刚炼体术', ['metal', 'earth'], 'qi_mid', '炼体', '佛门正宗，平和稳健',
    '佛门炼体正法。金土二气淬炼皮膜筋骨，不急不躁，进境虽缓，却极少留下暗伤。'),
  art('cuiti_jue', '淬体诀', ['earth'], 'qi_low', '炼体', '涤荡淬体，去灵力杂质',
    '入门淬体小诀。以土气一遍遍涤荡血肉，逼出灵力杂质，根基因此更纯，进度自然慢些。'),
  art('gengjin_jue', '庚金诀', ['metal'], 'qi_mid', '心法', '金系练气，攻伐锐气',
    '庚金主杀。修此诀者灵力自带一层厚锐气，出手比同阶更利三分，性子也易随之刚硬。'),
  art('qingmu_yin', '青木引', ['wood'], 'qi_low', '心法', '木系入门，养生稳妥',
    '木系最平和的入门引气法。引青木生气入窍，养身多于斗法，却胜在稳妥无险。'),
  art('lihuo_jing', '离火经', ['fire'], 'qi_high', '心法', '火系练气，爆发强',
    '离火焚身亦焚敌。灵力运转迅烈，短时间内爆发极强，只是后劲稍欠，需以心性压住燥意。'),
  art('jinmang_ci', '金芒刺', ['metal'], 'qi_mid', '法术', '金系单体攻伐小术',
    '凝金气为一线细芒，专破护体灵光。威势不大，胜在穿透，点向要害时格外阴狠。'),
  art('yinshui_jue', '引水诀', ['water'], 'qi_mid', '法术', '水系控水，攻守皆备',
    '引水成丝、成幕、成刃，全凭一心。可缠敌、可卸力、可断喉，是水系最实用的两手。'),
  art('kongjin_jue', '控金诀', ['metal', 'vessel'], 'qi_mid', '器诀', '轻小法器操控法门',
    '专为轻小法器而设。飞针、薄刃、铃铛之类，以金气牵之，指哪打哪，省力而精准。'),
  art('yanqi_jue', '焰器诀', ['fire', 'vessel'], 'qi_low', '器诀', '火系御器入门，附灼烧',
    '御器入门法门。法器过火不损，反而带上一层灼意，触之即燎，适合初学者试手。'),
  art('chuanlin_bu', '穿林步', ['wood'], 'qi_mid', '身法', '木系轻身，山林周旋',
    '借林木枝叶卸力转向，林间纵跃如猿。进了山林便如鱼得水，出了林子则平平无奇。'),
  art('liehuo_cuiti', '烈火淬体术', ['fire'], 'qi_peak', '炼体', '火系淬体，肉身带灼热',
    '以烈火反复锻打血肉，练成后皮肉常温如炭，近身相搏者先吃一记燎伤。疼，但值。'),
  art('hansui_lianti', '寒髓炼体', ['water'], 'qi_high', '炼体', '水系淬体，抗火防高',
    '引寒髓入骨，血温比常人低三分。火法临身如泥牛入海，只是自己也难暖起来。'),

  // ================= T2 · 筑基级 · 28 本 =================
  art('liushi_jing', '六识经解', ['metal', 'earth'], 'foundation_low', '心法', '佛家六识粗浅应用',
    '佛家六识之说，此经只取其粗浅应用。眼耳鼻舌身意各有观法，六识渐敏，灵机也渐活。'),
  art('shanshui_dongxuan', '山水洞玄经', ['water', 'earth'], 'foundation_mid', '心法', '山水相济，契合石中水',
    '山静水动，一守一行。此经借山水相济之势调和双灵根，与石中蕴水的本命尤为相得。'),
  art('qingyu_zhengxuan', '青玉正玄功', ['earth'], 'foundation_high', '心法', '道门支脉正宗，可练至元婴',
    '青玉一脉的道门正宗。功法一路直达元婴，只是门槛不低，非心性沉稳者难以行至中段。'),
  art('maoshi_wuji', '毛氏无极功并注', [], 'foundation_mid', '心法', '路子偏锋，资质不契者勿修',
    '毛氏一门的偏锋功法。注文自陈「资质不契者勿修」，只因行功路径与常理相悖，走岔即伤。'),
  art('youying_huandao', '幽影幻道书', ['water'], 'foundation_peak', '心法', '含结婴之秘',
    '水影重重，似幻还真。书末赫然载着结婴之秘，历代得之者多未修到那一页。'),
  art('jihan_bihuo', '极寒碧火诀', ['fire'], 'foundation_mid', '心法', '冷火碧磷，搭配本命威力不俗',
    '火而带寒，色作碧磷。寻常火灵根修之易走火，若本命相契，却能烧出连寒冰都熔的一焰。'),
  art('yanghunmu_mizhuan', '养魂木秘传', ['wood'], 'foundation_mid', '心法', '养魂木本命相关秘传',
    '以养魂木为引的秘传法门。木气入魂，滋养灵识，本命为养魂木者修之，事半功倍。'),
  art('yangjishui_mizhuan', '阳极水秘传', ['water', 'fire'], 'foundation_mid', '心法', '阳极水本命相关秘传',
    '水至阳极而生火，一味两性。本命为阳极水者修之，水火同炉而无相冲之虞。'),
  art('liuhuang_dihuo', '硫磺地火秘传', ['fire', 'earth'], 'foundation_mid', '心法', '硫磺地火祭炼法器',
    '地火自硫磺缝中上涌，最宜祭炼法器。修之者控火老练，炼器成功率也高出一截。'),
  art('duyan_yinban', '独眼银斑蛇秘传', ['beast'], 'foundation_mid', '心法', '独眼银斑蛇本命相合',
    '独眼银斑蛇一脉的秘传。以蛇性入观想，本命相合者修来如鱼得水，不合者徒具其形。'),
  art('beast_vessel_found', '万兽御器经', ['beast', 'vessel'], 'foundation_mid', '心法', '兽器相济，御兽器修核心',
    '万兽御器一门的核心经义。兽为兵、器为锋，两脉相济而不相夺，是兽器双修的进阶正法。'),
  art('jingang_zhenyan', '金刚真言棒法', ['metal', 'earth'], 'foundation_low', '法术', '佛门棒法十八打',
    '佛门护法棒法，共十八打。棍上附金刚真言，专破邪祟幻术，打得越重，真言越亮。'),
  art('xuanguang_tianci', '眩光天磁针法', ['metal', 'vessel'], 'foundation_low', '法术', '眩光磁力伤敌',
    '以磁力牵引细针，再以眩光晃敌眼目。针走磁线，防不胜防，是金系少见的巧技。'),
  art('wansen_jingmu', '万森惊木诀', ['wood'], 'foundation_low', '法术', '配合木阵威力巨大',
    '万木同惊，一令皆动。单施不过寻常，若身边有木阵为基，威势翻上数倍。'),
  art('bilin_zhan', '碧磷斩', ['fire'], 'foundation_mid', '法术', '碧磷冷火成斩',
    '凝聚冷焰成刃，斩落时磷火四溅。火苗沾身不熄，越扑越旺，最克皮糙肉厚之物。'),
  art('qingyu_liaoming', '青玉疗命诀', ['earth'], 'foundation_mid', '法术', '疗命续伤，需青玉本命',
    '以青玉之气续接伤脉，疗伤而不留疤。无青玉本命者强修，多半把自己先疗坏了。'),
  art('tongming_jianjue', '通明剑诀并注', ['vessel'], 'foundation_high', '器诀', '门中剑修通用',
    '通明一系剑修通用的剑诀。剑路端正，攻守有序，注文把每一转都拆得极细，宜作根基。'),
  art('yaoji_shan', '遥及闪', [], 'foundation_mid', '身法', '融合极空闪与遥及身法',
    '取极空闪之迅与遥及身法之稳，合成一步。短距一闪快极，长距又不必耗半分灵气。'),
  art('yinmo_jue', '隐魔诀', ['water'], 'foundation_mid', '身法', '遮掩血修身份的敛息术',
    '水气蒙身，气息尽敛。修至深处连灵识都探不出底细，血修拿它遮掩身份最为得力。'),
  art('lianti_jue', '炼体诀', ['earth'], 'foundation_mid', '炼体', '佛门二阶炼体',
    '佛门二阶炼体法门。在淬体诀之上再进一步，洗髓换血，一身筋骨逐渐如铁。'),
  art('gengjin_zhengfa', '庚金正法', ['metal'], 'foundation_high', '心法', '金系中阶，攻伐凌厉',
    '庚金一脉的中阶正法。比之庚金诀，灵力更沉更利，出手时往往一剑未至而寒气先到。'),
  art('qingmu_yangyuan', '青木养元功', ['wood'], 'foundation_mid', '心法', '木系中阶，续航强',
    '青木养元，生生不息。行功时灵力自复极快，久战不衰，是木系立身之本。'),
  art('xuanshui_zhenjue', '玄水真诀', ['water'], 'foundation_mid', '法术', '水系中阶攻伐术',
    '玄水化寒，寒能透骨。真诀成阵时水汽弥空，敌未近身已然手脚发僵。'),
  art('shouqi_heji', '兽器合击诀', ['beast', 'vessel'], 'foundation_mid', '器诀', '兽器协同，可越阶而战',
    '灵兽扑上、法器随后，一兽一器合于一击。配合得法可越阶而战，配合不好则彼此拖累。'),
  art('yanqi_mijue', '炎器诀', ['fire', 'vessel'], 'foundation_low', '器诀', '火系御器中阶，耗灵剧',
    '焰器诀的进阶法门。火势更盛、器更快，只是灵力消耗翻倍，修浅者御不了几息。'),
  art('dixing_shu', '地行术', ['earth'], 'foundation_mid', '身法', '土系遁地身法',
    '借土气遁入地脉，如潜行于泥下。赶路极快，却瞒不过土灵根的同阶修士。'),
  art('liuhuo_shenfa', '流火身法', ['fire'], 'foundation_mid', '身法', '火系迅捷，短距爆发',
    '化身为流火，短距内快得近乎瞬移。只可一鼓作气，拖久了火势一散便成大喘气。'),
  art('muling_cuiti', '木灵淬体', ['wood'], 'foundation_low', '炼体', '木系淬体，恢复强',
    '木气养身，淬体也带着自愈。受的伤比常人好得更快，只是硬碰硬时仍嫌软些。'),

  // ================= T3 · 金丹级 · 22 本 =================
  art('jujing_jing', '居敬经', [], 'core_mid', '心法', '儒门功法，可修至元婴初期',
    '儒门一脉的养气功夫。居敬持志，不假灵根，一路可修到元婴初期，只是中段之后极吃心性。'),
  art('tongming_jing', '通明经', ['universal'], 'core_high', '心法', '根本道法，剑修不二之选',
    '通明一系的根本道法。不限灵根，剑修尤奉为圭臬，剑意与心性同修同长。'),
  art('moyun_xuanjing', '魔云玄经', ['water', 'fire'], 'core_high', '心法', '魔蛇鳞纹自创魔道心法',
    '魔蛇鳞纹自创的魔道心法。水火相激而不融，行功凶险，成之者一身魔气森然。'),
  art('beast_vessel_core', '兽器同源经', ['beast', 'vessel'], 'core_high', '心法', '兽器同源，攻守浑然一体',
    '追本溯源，兽与器本是一体两面。修至此境，攻守浑然，再无兽器双修的割裂之弊。'),
  art('yuan_ming', '元氏修命经', ['metal'], 'core_high', '心法', '以命理入道，开局即得',
    '元氏以命理入道的金丹级功法。开局即得，可修至金丹中段，只是金气与兽器本命终究隔了一层。', {
      unlockAtStart: true,
      /**
       * 2026-10-21 用户拍板「功法不回收，元氏调低」：
       * 金丹级品阶分（旧三档兼容口径 0.40）会让「元氏 × 乌鬣猪妖」= 0.40 × 0.60 = **0.24**，
       * 开局免费组合恰好卡线连过三层（0.15）和六层（0.24），门槛形同虚设。
       * 这里按「品阶高但灵气不合」下调到 0.38（与吕氏同分）：
       *   · 元氏 × 盾 0.541 = 0.206 —— 仍可过三层，给玩家第二条路；
       *   · 元氏 × 猪妖 0.623 = 0.237 —— 过不了六层 0.26，六层必须去探索拿《兽器双修经》。
       * 金丹级的价值改由 maxLevel 20（层数上限，等级加成上限也更高）体现，不再靠门槛分。
       */
      baseFit: 0.38
    }),
  art('shenxiao_wulei', '神霄五雷正法', ['wood', 'metal', 'fire'], 'core_high', '法术', '正宗道家雷法，需风雷电本命',
    '神霄一脉的正宗雷法。五雷齐落，声势惊天，非风雷电本命者引不来真雷，学了也是空架子。'),
  art('hunyuan_jianyu', '混元剑狱', ['vessel'], 'core_high', '器诀', '封锁困绝更强，与铁风剑契合',
    '万剑成狱，封锁一方。比之寻常剑诀重在困而非杀，与铁风剑一路的刚猛恰好互补。'),
  art('wuqin_duanti', '五禽锻体', ['beast'], 'core_high', '炼体', '模仿禽鸟动作的锻体古法',
    '效虎之扑、鹿之引、熊之晃、猿之攀、鸟之飞，五禽轮转，是一套流传极古的锻体法。'),
  art('kunyuan_houtu', '坤元厚土真经', ['earth'], 'core_high', '心法', '土系高阶，厚重稳固',
    '坤元厚土，载物无疆。真经修成，一身灵力沉如山岳，寻常法术打上去只留一印。'),
  art('qingdi_changsheng', '青帝长生玄经', ['wood'], 'core_mid', '心法', '木系高阶，生机绵长',
    '青帝主生。玄经养出一身绵长生机，寿元也似随之宽出几分，是最不急的功夫。'),
  art('xuanming_zhenshui', '玄冥真水经', ['water'], 'core_mid', '心法', '水系高阶，阴寒深邃',
    '玄冥真水，至阴至寒。行功时周身温度骤降，心性若不够沉，反被寒气所侵。'),
  art('taibai_gengjin', '太白庚金玄经', ['metal'], 'core_mid', '心法', '金系高阶，锋锐无匹',
    '太白主西方金。玄经练就的灵力锋锐无匹，同阶相搏，往往先声夺人。'),
  art('xuanming_hanyu', '玄冥寒狱真法', ['water'], 'core_high', '法术', '水系高阶困杀',
    '寒狱一开，方圆尽冻。困与杀同在一狱，入狱者先失知觉，再失灵力，最后失性命。'),
  art('jiuyang_fentian', '九阳焚天正法', ['fire'], 'core_high', '法术', '火系高阶爆发',
    '九阳并出，焚天灼地。正法施展时三日之内难见清凉，非大阵护持不宜轻用。'),
  art('kunyuan_zhenyue', '坤元镇岳真法', ['earth'], 'core_mid', '法术', '土系高阶镇压',
    '召一岳之形落下，镇压一切。真法重在「镇」字，压住的敌手往往连挣扎的余地都没有。'),
  art('taibai_yujian', '太白金锋御剑经', ['metal', 'vessel'], 'core_high', '器诀', '金系高阶御剑',
    '太白金锋化剑，御之如臂。剑经修至高阶，一息百剑，剑气所过如秋风扫叶。'),
  art('lihuo_yuqi', '离火御器玄经', ['fire', 'vessel'], 'core_mid', '器诀', '火系高阶御器',
    '离火附器，器随身转。玄经御器时火势层层叠叠，攻出去的法器回来时往往更烫。'),
  art('baishou_yuqi', '百兽驭器玄诀', ['beast', 'vessel'], 'core_low', '器诀', '兽群为势，法器为锋',
    '百兽为势，法器为锋。玄诀驱兽群围定，再以法器一线贯入，讲究的是阵而后战。'),
  art('gengjin_dunguang', '庚金遁光真法', ['metal'], 'core_high', '身法', '金系高阶遁光',
    '化庚金为遁光，一线破空。真法修成，遁速冠绝同阶，只是转向笨拙，最怕被人守株。'),
  art('qingmu_huaying', '青木化影玄经', ['wood'], 'core_mid', '身法', '木系高阶化影',
    '借木气化出重重身影，真假难辨。玄经修深，一影换一命，连自己都分不清哪个是真。'),
  art('houtu_jingang', '厚土金刚真身', ['earth'], 'core_high', '炼体', '土系高阶炼体真身',
    '厚土铸身，金刚不坏。真身一现，寻常刀兵法术只当挠痒，只是身沉如岳，跑不快。'),
  art('gengjin_bumie', '庚金不灭金身', ['metal'], 'core_peak', '炼体', '金系顶级炼体金身',
    '庚金不灭，金身永固。金丹段最顶的炼体法门，修成者刀枪不入，连魂魄都带一层金气。'),

  // ================= T4 · 元婴级 · 15 本 =================
  art('fuhu_duofa', '伏虎夺法', ['beast'], 'nascent_mid', '法术', '御兽门霍家虎头夺',
    '御兽门霍家的看家本领。以虎势扑敌，再于扑势中夺取对方气机，一扑一夺，狠辣非常。'),
  art('xihua_gengjin', '西华庚金大道真解', ['metal'], 'nascent_high', '心法', '金系四阶，大道真解',
    '西华一脉的庚金大道真解。四阶心法，讲的是金气如何由锋利归于浑厚，末章「藏锋」最见功夫。'),
  art('jiuyang_yuanying', '九阳焚天至阳真经', ['fire'], 'nascent_peak', '心法', '火系四阶，至阳至烈',
    '九阳至阳，焚天而不息。四阶极品心法，修至深处一身阳炎，寻常阴邪近身即化。'),
  art('kunyuan_yuanying', '坤元厚土载物真经', ['earth'], 'nascent_mid', '心法', '土系四阶，厚重载物',
    '坤元载物，厚德不争。真经走的是以静制动一路，灵力气势沉厚，守多于攻。'),
  art('taibai_poxu', '太白金锋破虚真法', ['metal'], 'nascent_mid', '法术', '金系四阶破虚',
    '太白金锋至锐，可破虚空。真法一剑下去，连空间都似裂开一线，代价是灵力几近抽空。'),
  art('beiming_tuntian', '北冥玄水吞天真法', ['water'], 'nascent_high', '法术', '水系四阶吞纳',
    '北冥有海，其深无底。真法化水成渊，先吞敌之法术，再吞敌之灵力，越打越强。'),
  art('jiuyang_mieshi', '九阳焚天灭世真法', ['fire'], 'nascent_peak', '法术', '火系四阶灭世',
    '九阳齐出，焚尽眼前一切。四阶极品的杀伐之术，出手便无回旋，「慎用」二字刻在篇首。'),
  art('wanqi_guiyuan', '万器归元大道真解', ['vessel'], 'nascent_high', '器诀', '器系四阶总纲',
    '万器归元，一族总纲。天下器诀几乎都能在此找到源头，读懂它，再看别的御器法门如观掌纹。'),
  art('taibai_yuqi', '太白金锋御器真经', ['metal', 'vessel'], 'nascent_mid', '器诀', '金系四阶御器',
    '太白金锋御器的四阶真经。金器相合，锋上加锋，同阶法器在它面前往往一触即折。'),
  art('baishou_yuqi_yy', '百兽驭器归元真诀', ['beast', 'vessel'], 'nascent_low', '器诀', '兽器四阶协同',
    '百兽驭器的四阶归元诀。兽群成阵、法器为眼，兽器之间不再分主次，浑然一体。'),
  art('yuqi_dunkong', '御器遁空无相真法', ['vessel'], 'nascent_high', '身法', '器系四阶遁空',
    '以身附器，遁入虚空。真法修成，可借法器一瞬挪移，来去无痕，是器修最顶的身法。'),
  art('wanshou_dunxing', '万兽遁形无相真法', ['beast'], 'nascent_mid', '身法', '兽系四阶化形',
    '万兽遁形，无相可寻。化兽形入山林，连气息都与禽兽无异，追兵过而不觉。'),
  art('xuanshui_huaying', '玄水化影无痕真诀', ['water'], 'nascent_mid', '身法', '水系四阶化影',
    '玄水化影，去来无痕。真诀施展开来，水汽所至皆是通路，留下的影子仍会替你多走几步。'),
  art('houtu_bumie', '厚土不灭玄身', ['earth'], 'nascent_high', '炼体', '土系四阶不灭玄身',
    '厚土不灭，玄身难摧。四阶炼体，修成后肉身可承元婴一击而不碎，只是养成极耗资源。'),
  art('wanshou_cuiti', '万兽淬体血魄真诀', ['beast'], 'nascent_low', '炼体', '兽系四阶淬体',
    '取万兽血魄淬炼己身。真诀凶险，需以兽血为引，练成后一身气血狂猛如妖兽。')
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
   * 集齐 `ART_FRAGMENT_NEEDED[tier]` 张自动解锁整本。
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
export const artGradeOf = art => ART_GRADES[art?.grade] || ART_GRADES.qi_low

/** 灵地基础产出表（供 UI 直接展示，避免再引一次 tiers） */
export { LAND_OUTPUT }
