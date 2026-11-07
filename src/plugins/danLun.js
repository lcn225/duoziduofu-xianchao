// 【丹论】—— 结丹时立一条「道」，纯叙事、0 数值（2026-11-06）
//
// 真源：`design/20-系统设计/丹论系统.md`（27 条候选 / 阈值 / 弹窗形态）
//
// 三条硬口径：
//   1. **0 数值** —— 不加战力、不加契合度、不进门槛。选了只写存档。
//   2. **候选来自玩家自己的行为** —— 用和成就系统一样的 `test(signals)` 判定，
//      不是为了「复用成就容器」；成就是可全解锁的列表，丹论是**单选、一辈子一次**。
//   3. **同 theme 最多取 1 条** —— 避免三张卡都像「我孩子多」。
//
// 本文件不 import Vue / Pinia，保持 plugins 层能被 node 直接加载（断言直接跑）。

import { QI_ART_MAP } from './cultivationData.js'
import { isAliveOffspringOf, isAliveWife } from './innerCourt.js'
import { totalPopulationOf } from './estate.js'

/** 触发等级：金丹一层（内功扁平 21） */
export const DAN_LUN_LEVEL = 21

/** 候选张数 */
export const DAN_LUN_CANDIDATE_COUNT = 3

const MIN = 1

/**
 * 候选池。每条：
 *   - `id` / `theme` / `name`（论名）/ `verse`（论辞）/ `lines`（四句释义）/ `source`（自注）
 *   - `weight` 越大越优先；`test(signals)` 为真即命中
 *
 * ⚠ 出典 2026-11-07 统一改成「自注」文言体：**第一人称、史笔记事、一句到底，必须以 `自注：` 开头**。
 *   别再写回第二人称「你……」的白话 —— 27 条混着来，一读就看出哪几条是凑的。
 */
export const DAN_LUN_POOL = [
  // ---------- A 五行与器 ----------
  {
    id: 'dao_water',
    theme: 'element_water',
    name: '水之污浊',
    verse: '水无常形，浊者能容；容而成海，清者反枯。',
    lines: ['凿池求清，清极无鱼；', '引浊灌园，浑水生鳞。', '世人以清自矜，', '我以浊自广。'],
    source: '自注：少习《观潮经并注》，出入风涛，遂知水性。',
    weight: 50,
    test: s => s.mainElement === 'water' && (s.elementPracticed?.water || 0) >= 2
  },
  {
    id: 'dao_fire',
    theme: 'element_fire',
    name: '焚尽方生',
    verse: '火非焚物，焚其旧也；旧尽新出，丹乃可结。',
    lines: ['山火过处，三载而林愈密；', '一念焚心，百骸而垢自消。', '灰未冷时，丹已温 ——', '故曰：不焚不生。'],
    source: '自注：一生所修皆火，所历险地，焦土过半。',
    weight: 50,
    test: s => s.mainElement === 'fire' && (s.elementPracticed?.fire || 0) >= 2
  },
  {
    id: 'dao_wood',
    theme: 'element_wood',
    name: '草木有本心',
    verse: '草木有本心，何求美人折。',
    lines: ['石罅之草，不问沃瘠；', '断枝之木，不祷春风。', '荣枯自守，风雨自承 ——', '吾道如是，不求人知。'],
    source: '自注：习木法以养身，见枯者必问其土。',
    weight: 50,
    test: s => s.mainElement === 'wood' && (s.elementPracticed?.wood || 0) >= 2
  },
  {
    id: 'dao_metal',
    theme: 'element_metal',
    name: '百炼成器',
    verse: '金可折而不可弯，器可钝而不可废。',
    lines: ['百炼之铁，绕指为柔；', '千锤之刃，断水无声。', '世笑刚者易折 ——', '折者非刚，未炼也。'],
    source: '自注：修金法，所信者千锤百炼而已。',
    weight: 50,
    test: s => s.mainElement === 'metal' && (s.elementPracticed?.metal || 0) >= 2
  },
  {
    id: 'dao_earth',
    theme: 'element_earth',
    name: '厚土无言',
    verse: '厚土不言，载万类而不争其功。',
    lines: ['山不自高，而万人仰之；', '地不自厚，而九泉归之。', '吾积其基，日不见增 ——', '岁计之，则厚矣。'],
    source: '自注：修土法，日积寸功，未尝求速。',
    weight: 50,
    test: s => s.mainElement === 'earth' && (s.elementPracticed?.earth || 0) >= 2
  },
  {
    id: 'dao_vessel',
    theme: 'element_vessel',
    name: '器以载道',
    verse: '器者，道之舍也；舍固则道安，舍朽则道徙。',
    lines: ['剑不利，不足卫道；', '剑太利，反伤持者。', '养器如养心 ——', '心正刃正，刃正道行。'],
    source: '自注：平生所佩，无一物无来历。',
    weight: 45,
    test: s => s.mainElement === 'vessel' && (s.equippedCount || 0) >= 4
  },
  {
    id: 'dao_beast',
    theme: 'element_beast',
    name: '兽性即天心',
    verse: '人未必高于兽，兽未必低于人；各全其性，即是天心。',
    lines: ['人持礼而心役，', '兽无礼而心全。', '饥食渴饮，无非道也 ——', '吾学其真，不学其野。'],
    source: '自注：与灵兽同修，信器，亦信生灵。',
    weight: 45,
    test: s => s.mainElement === 'beast' && !!s.hasPet
  },

  // ---------- B 同参 ----------
  {
    id: 'dao_collect',
    theme: 'collect',
    name: '万象皆备于我',
    verse: '万物皆备于我，用与不用，皆我之资。',
    lines: ['不羡一器之珍，', '不弃一芥之微。', '聚非贪，散非费 ——', '取之有道，用之有度，是谓有馀。'],
    source: '自注：家中底材，堆案盈箱。',
    weight: 50,
    test: s => (s.companionKinds || 0) >= 200
  },

  // ---------- C 灵地 ----------
  {
    id: 'dao_land_many',
    theme: 'land',
    name: '登高见天',
    verse: '登高者见天之大，涉远者知地之厚。',
    lines: ['井蛙不可语海，夏虫不可语冰 ——', '非其愚也，居使之然。', '故三迁吾居，非逐高也，', '惧为井蛙耳。'],
    source: '自注：天下灵地，足迹逾半。',
    weight: 55,
    test: s => (s.landUnlocked || 0) >= 8
  },
  {
    id: 'dao_land_stay',
    theme: 'land',
    name: '一隅足矣',
    verse: '天下名山尽可居，吾独安此一隅。',
    lines: ['鹪鹩巢林，不过一枝；', '偃鼠饮河，不过满腹。', '以一隅易天下 ——', '非不欲，是不必。'],
    source: '自注：灵地虽众，独守快子峰不去。',
    weight: 40,
    test: s => (s.landUnlocked || 0) >= 8 && s.landCurrent === 'kuaizi_hut'
  },

  // ---------- D 家族 ----------
  {
    id: 'dao_family',
    theme: 'family',
    name: '人性无定，众而御之',
    verse: '人性非善非恶非真，唯无定也。无定，故可御。',
    lines: ['一人之念如风，', '众人之念如潮。', '御潮者不塞其流，', '只择其向 —— 御众者，先御己。'],
    source: '自注：膝下子孙成群，一室灯烛不夜。',
    weight: 50,
    test: s => (s.aliveOffspring || 0) >= 300
  },
  {
    id: 'dao_family_root',
    theme: 'heir',
    name: '根深叶茂',
    verse: '我修一世，彼修数世；树向其天，根赴其地。',
    lines: ['本固则枝荣，根深则叶茂。', '桃李不言，下自成蹊 ——', '吾家之蹊，儿孙自辟。'],
    source: '自注：诸子三十，先后履仙途。',
    weight: 55,
    test: s => (s.heirsAtFoundation || 0) >= 30
  },
  {
    id: 'dao_loss',
    theme: 'loss',
    name: '生死一如',
    verse: '生者寄也，死者归也；送之再三，乃知归者不孤。',
    lines: ['庄周鼓盆，人或讥其无情；', '及吾亲历，方知非无情也，情尽而理见。', '哭有时，止有时 ——', '不哭不足以言道，不止不足以言仙。'],
    source: '自注：亲送子嗣，非止一人。',
    weight: 45,
    test: s => (s.offspringLost || 0) >= 20
  },

  // ---------- E 内宅 ----------
  {
    id: 'dao_wives',
    theme: 'wives',
    name: '红袖满楼',
    verse: '世人讥我贪，我笑世人不知寒。',
    lines: ['长夜无灯，纵有仙骨亦是冷的。', '一屋人声，', '是我为这一世留的暖。', '暖处生丹，丹不孤。'],
    source: '自注：内宅之灯，数十年未熄。',
    weight: 45,
    test: s => (s.aliveWives || 0) >= 20
  },

  // ---------- F 门派 ----------
  {
    id: 'dao_merit',
    theme: 'faction',
    name: '功成不必在我',
    verse: '山门在，则路在；功成不必在我。',
    lines: ['匠石运斤，不居其巧；', '大禹疏河，不有其身。', '吾治此门如治一渠 ——', '渠成水自流，流者不必知我。'],
    source: '自注：山门庶务，多经我手。',
    weight: 50,
    test: s => (s.contributionTotal || 0) >= 50000
  },
  {
    id: 'dao_rank',
    theme: 'faction',
    name: '执掌一宗',
    verse: '权者，众心所寄；寄重者，行不可轻。',
    lines: ['水能载舟，亦能覆舟 ——', '非水之无常，操舟者有失也。', '居万人之上，', '如临深渊，如履薄冰。'],
    source: '自注：位居上柱，门中事半听我号令。',
    weight: 60,
    test: s => (s.contributionTotal || 0) >= 240000
  },

  // ---------- G 封地 ----------
  {
    id: 'dao_estate',
    theme: 'estate',
    name: '寸土必争',
    verse: '一亩不问天时，一瓦皆是道基。',
    lines: ['筑室者未必居其室，', '凿井者未必饮其井。', '室成而人安，井成而人活 ——', '此其所以为道也。'],
    source: '自注：乡中屋宇二十，多起于我在位时。',
    weight: 50,
    test: s => (s.manorLevel || 0) >= 5
  },
  {
    id: 'dao_people',
    theme: 'estate',
    name: '民为道基',
    verse: '仙不耕而食，仙不织而衣；所食所衣，皆民之力。',
    lines: ['民犹土也，道犹木也；', '土瘠则木槁，民困则道孤。', '吾不敢疾取其力 ——', '非不欲疾，恐根先绝。'],
    source: '自注：治下乡民，逾万。',
    weight: 50,
    test: s => (s.population || 0) >= 14000
  },

  // ---------- H 探索 ----------
  {
    id: 'dao_star',
    theme: 'explore',
    name: '星之无垠',
    verse: '星雪自然，尽为我所用；天人往复，皆我之途。',
    lines: ['少时只识参宿一颗，', '后来方知，满天皆是路。', '不执一星，不弃一星 ——', '故能行远。'],
    source: '自注：十二图，足迹及于大半。',
    weight: 60,
    test: s => (s.visitedLocations || 0) >= 10
  },
  {
    id: 'dao_mortal',
    theme: 'mortal',
    name: '见众生，见自己',
    verse: '少时见溺者必援，见饥者必食之；久而力穷，乃知一人之手，渡不尽万人。',
    lines: ['故择其可渡者渡之 ——', '非薄情，量力也。', '渡人者先渡己，', '渡己者终渡人。'],
    source: '自注：道途所遇，不可胜数。',
    weight: 45,
    test: s => (s.eventTriggered || 0) >= 10000
  },

  // ---------- I 财富 ----------
  {
    id: 'dao_wealth',
    theme: 'wealth',
    name: '涓流成海',
    verse: '一文不弃，故能成海；一饭不奢，故能有馀。',
    lines: ['人笑我惜一文之微，', '不知海者，万涓之积也。', '道亦如是 ——', '寸进而已。'],
    source: '自注：囊中所有，久不数矣。',
    weight: 45,
    test: s => (s.spiritual || 0) >= 20000000
  },

  // ---------- J 战斗 ----------
  {
    id: 'dao_now',
    theme: 'combat',
    name: '全知现在',
    verse: '知本我之现在，知他人之现在，知万物之现在，知大道之现在。',
    lines: ['不追古，不窥来，', '不绝世道人情。', '爱恨情仇，皆在当下 ——', '此即我所求之「全知」。'],
    source: '自注：秘境深处，独行数层。',
    weight: 55,
    test: s => (s.dungeonFloor || 0) >= 40
  },

  // ---------- K 外功 ----------
  {
    id: 'dao_body',
    theme: 'body',
    name: '形为道之器',
    verse: '形者，道之器也；器敝则道无所寄。',
    lines: ['皮之不存，毛将焉附；', '形之不固，神将焉宅。', '故炼形者非爱形 ——', '爱其所寄也。'],
    source: '自注：外功至洗髓，苦倍于人。',
    weight: 50,
    test: s => (s.bodyLevel || 1) >= 20
  },

  // ---------- L 性情 ----------
  {
    id: 'dao_kind',
    theme: 'kind',
    name: '逍遥逐本心',
    verse: '屠刀已是莲花座，针囊如今燃檀香；佛前忏悟前尘错，从此逍遥逐本心。',
    lines: ['昔执针以伤人，今拈花以度己；', '昔横刀以快意，今合掌以问心。', '放下屠刀，非放下因果 ——', '因果自偿，吾行吾路。'],
    source: '自注：遇事多援手，未尝坐视。',
    weight: 40,
    test: s => (s.helpChoices || 0) >= 100
  },

  // ---------- M 兜底（永远命中，权重最低） ----------
  {
    id: 'dao_keep',
    theme: 'fallback_a',
    name: '守拙',
    verse: '大巧若拙，大辩若讷；吾守其一，以待其万。',
    lines: ['早开者早谢，', '慢行者不迷。', '今日之事今日毕 ——', '明日，自有机缘。'],
    source: '自注：行不疾，而未尝失一步。',
    weight: 2,
    test: () => true
  },
  {
    id: 'dao_flow',
    theme: 'fallback_b',
    name: '随道逐流',
    verse: '人乃倮虫，赤倮之虫，随道逐流。',
    lines: ['道使我善则善，使我恶则恶。', '不与天争，不与人争。', '水送我到何处 ——', '便在何处生根。'],
    source: '自注：本无必行之路，故处处可行。',
    weight: 1,
    test: () => true
  },
  {
    id: 'dao_alone',
    theme: 'fallback_c',
    name: '吾道不孤',
    verse: '独行非孤，后至者踵相接也。',
    lines: ['独行久者，疑无同路。', '及至回望 ——', '身后印痕早生。', '深浅虽异，所向同归。'],
    source: '自注：行之久矣，回望者渐众。',
    weight: 0,
    test: () => true
  }
]

/** 判定用的信号空表（断言与老档兜底） */
export const emptyDanLunSignals = () => ({
  mainElement: '',
  elementPracticed: {},
  equippedCount: 0,
  hasPet: false,
  companionKinds: 0,
  landUnlocked: 0,
  landCurrent: '',
  aliveOffspring: 0,
  offspringLost: 0,
  heirsAtFoundation: 0,
  aliveWives: 0,
  contributionTotal: 0,
  manorLevel: 0,
  population: 0,
  visitedLocations: 0,
  eventTriggered: 0,
  spiritual: 0,
  dungeonFloor: 0,
  bodyLevel: 1,
  helpChoices: 0
})

/**
 * 从 store 抽一份**纯数据**的信号表。
 *
 * 为什么要抽出来：判定理应是纯函数，断言直接喂 signals 即可，不需要造一个 store。
 * ⚠ `ownedFateItemIds` 是 getter；node 断言里的 mock 没有它时按 0 处理。
 */
export function buildDanLunSignalsOf(store) {
  const practice = store?.practice || {}
  const qiArts = practice.qiArts || {}
  const known = qiArts.known || {}
  const activeArt = QI_ART_MAP[qiArts.active] || null

  // 主修取 elements 的第一项：多元素功法（兽器双修）固定落在「兽」——可预期优先于随机
  const mainElement = Array.isArray(activeArt?.elements) ? activeArt.elements[0] || '' : ''

  const elementPracticed = {}
  for (const id of Object.keys(known)) {
    if ((Number(known[id]?.practiceSeconds) || 0) <= 0) continue
    const art = QI_ART_MAP[id]
    for (const el of art?.elements || []) {
      elementPracticed[el] = (elementPracticed[el] || 0) + 1
    }
  }

  const offspring = store?.offspring?.list || []
  const alive = offspring.filter(isAliveOffspringOf)
  const wives = store?.innerCourt?.wives || []
  const land = practice.spiritLand || {}
  const estate = store?.estate || {}

  return {
    mainElement,
    elementPracticed,
    equippedCount: Object.values(store?.equippedArtifacts || {}).filter(Boolean).length,
    hasPet: !!store?.activePet,
    companionKinds: Array.isArray(store?.ownedFateItemIds) ? store.ownedFateItemIds.length : 0,
    landUnlocked: (land.unlocked || []).length,
    landCurrent: land.current || '',
    aliveOffspring: alive.length,
    offspringLost: Math.max(offspring.length - alive.length, 0),
    heirsAtFoundation: alive.filter(o => (Number(o?.realmLevel) || MIN) >= 11).length,
    aliveWives: wives.filter(isAliveWife).length,
    contributionTotal: Number(store?.faction?.contributionTotal) || 0,
    manorLevel: Number(estate?.buildings?.manor) || 0,
    population: totalPopulationOf(estate, alive.length),
    visitedLocations: (store?.visitedLocations || []).length,
    eventTriggered: Number(store?.eventTriggered) || 0,
    spiritual: Number(store?.currency?.spiritual) || 0,
    dungeonFloor: Number(store?.dungeonHighestFloor) || 0,
    bodyLevel: Number(store?.bodyLevel) || MIN,
    helpChoices: Number(store?.narrativeChoiceCounts?.help) || 0
  }
}

/**
 * 选出候选：命中 → 按权重降序 → 同 theme 只取 1 → 取前 `count` 条。
 * 兜底三条的 weight 最低，所以只有「真命中不足」时才会补上来。
 *
 * @param signals `buildDanLunSignalsOf` 或 `emptyDanLunSignals` 的形状
 * @returns 候选数组（新数组，元素是池里的对象）
 */
export function pickDanLunCandidatesOf(signals, { count = DAN_LUN_CANDIDATE_COUNT } = {}) {
  const s = signals || emptyDanLunSignals()
  const cap = Math.max(1, Math.floor(Number(count) || 1))
  const hits = DAN_LUN_POOL.filter(entry => {
    try {
      return typeof entry.test === 'function' && entry.test(s)
    } catch {
      return false
    }
  })
  // 稳定排序：权重相同保持池内顺序
  const sorted = hits
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => (b.entry.weight || 0) - (a.entry.weight || 0) || a.index - b.index)
    .map(item => item.entry)

  const out = []
  const themes = new Set()
  for (const entry of sorted) {
    if (out.length >= cap) break
    if (themes.has(entry.theme)) continue
    themes.add(entry.theme)
    out.push(entry)
  }
  return out
}

/** 按 id 取一条（存档里只存 id，展示时回查文案） */
export const danLunById = id => DAN_LUN_POOL.find(entry => entry.id === id) || null

/** 存档用的精简快照：丢掉 `test`（函数不能进存档） */
export const danLunSnapshotOf = entry =>
  entry
    ? {
        id: entry.id,
        name: entry.name,
        verse: entry.verse,
        lines: [...(entry.lines || [])],
        source: entry.source
      }
    : null
