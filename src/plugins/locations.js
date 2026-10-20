// 【探索地图与事件池】—— 纯数据（无副作用，可被 node 直接加载跑断言）
//
// 设计真源：`design/20-系统设计/探索系统.md` v1.0（2026-10-20 定稿）。
//   · 练气四图：长岭乡外（1 层）/ 诸猎人山口（3 层）/ 长岭关外（6 层）/ 飞鹰镇外（9 层）。
//   · 每图 16 / 17 / 18 / 18 条事件，文案逐字取自附录 A–D。
//   · 45 是设计层的**模板数**，69 是**文案数**；代码里直接写 69 条地图事件，
//     不要再建一层 45 模板 —— 两者不矛盾，别拿 69 去对 45。
//
// ⚠ 探索**不发桂冈修为**（2026-10-17 决议，P13.1）。修为唯一主源是镇守练功。
// ⚠ 旧版 5 张上游地图（新手村/天阙峰/…）与新四图不等价，已整体移除。
//   老档里的旧 locationId 由 store 的 `resetExplorationRuntime` 直接作废。
//
// 奖励单位：
//   · `stones` = **一阶灵石**（货币 v2 的 `spiritual`，100 一阶 = 1 二阶）。
//   · `items` = 物品池底材（灵植 / 灵材），只记 category/type/数量，不生成实例。
//   · `fragment` = 丹方残页；`art` = 练气篇功法；`chest` = 宝匣（计数库存）。
//   数值真源：`design/00-总览与状态/数值真值表.md` §6.3、`产出登记表.md` R10。

/** 七大类权重（整数百分比，合计 100，避免浮点累加漂移） */
export const CATEGORY_WEIGHTS = Object.freeze({
  nothing: 35,
  gatherHerb: 20,
  gatherMaterial: 10,
  battle: 15,
  pickup: 10,
  adventure: 5,
  narrative: 5
})

/** 固定的展示/校验顺序 */
export const CATEGORY_ORDER = Object.freeze([
  'nothing',
  'gatherHerb',
  'gatherMaterial',
  'battle',
  'pickup',
  'adventure',
  'narrative'
])

/** 大类中文名（UI 标签用） */
export const CATEGORY_NAMES = Object.freeze({
  nothing: '空包',
  gatherHerb: '采集·灵植',
  gatherMaterial: '采集·灵材',
  battle: '战斗',
  pickup: '拾遗',
  adventure: '奇遇',
  narrative: '叙事'
})

/**
 * 练气四图。`minLevel` 同时是**解锁门槛**和**胜率比较基准**。
 * `mapTier` 决定物品主阶（T1~T4）。
 */
export const locations = [
  {
    id: 'changling_xiangwai',
    name: '长岭乡外',
    description: '长岭乡外的荒山野径，灵植与灵材零星散布，山兽不凶，适合初入修行的修士。',
    minLevel: 1,
    mapTier: 1,
    eventTendencies: ['灵植', '灵材'],
    events: [
      // —— 空包 4 ——
      {
        id: 'cl_shelter',
        name: '避雨打坐',
        category: 'nothing',
        text: '山雨忽至，你寻了处岩穴避雨，盘膝打坐半日，雨停方归。',
        reward: {}
      },
      {
        id: 'cl_nothing',
        name: '一无所获',
        category: 'nothing',
        text: '你在乡间小径转了半日，除几只山雀外一无所获。',
        reward: {}
      },
      {
        id: 'cl_lost',
        name: '迷路',
        category: 'nothing',
        text: '晨雾太重，你绕来绕去迷了路，直到日暮才摸回原道。',
        reward: {}
      },
      {
        id: 'cl_chat',
        name: '路人闲聊',
        category: 'nothing',
        text: '你遇一荷锄老农，闲谈半晌，听了几句乡野趣闻。',
        reward: {}
      },
      // —— 采集·灵植 3 ——
      {
        id: 'cl_herb',
        name: '发现灵植',
        category: 'gatherHerb',
        text: '你在溪边发现一株{灵植名}，叶脉含露，小心采下。',
        reward: {
          stones: [0, 3],
          items: [{ category: '灵植', types: ['草', '花', '树'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'cl_orchard',
        name: '灵果园',
        category: 'gatherHerb',
        // 果属于灵材（《物品池设计方案》§二），所以这条「采集灵植」掉的是灵材
        text: '一处野果林挂满{灵果名}，你攀枝摘了数枚，揣入囊中。',
        reward: {
          stones: [0, 3],
          items: [{ category: '灵材', types: ['果'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'cl_flower',
        name: '灵花丛',
        category: 'gatherHerb',
        text: '崖畔一片{灵花名}开得正盛，你择了几朵品相好的收了。',
        reward: {
          stones: [0, 3],
          items: [{ category: '灵材', types: ['花'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      // —— 采集·灵材 2 ——
      {
        id: 'cl_mine',
        name: '废弃矿洞',
        category: 'gatherMaterial',
        text: '你探入一处废弃矿洞，在碎石堆里翻出几块{灵材名}。',
        reward: {
          stones: [0, 3],
          items: [{ category: '灵材', types: ['金属', '宝晶', '灵土'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'cl_soil',
        name: '发现灵土',
        category: 'gatherMaterial',
        text: '一处土坡颜色泛青，你掘了几捧{灵土名}，土质温润。',
        reward: {
          stones: [0, 3],
          items: [{ category: '灵材', types: ['灵土'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      // —— 拾遗 2 ——
      {
        id: 'cl_pouch',
        name: '储物袋',
        category: 'pickup',
        text: '路边草丛里躺着一只破旧储物袋，你倒出几颗灵石，袋底还沾着半张残页。',
        textMiss: '路边草丛里躺着一只破旧储物袋，你倒出几颗灵石，袋底空空。',
        reward: {
          stones: [2, 5],
          fragment: { chance: 0.005, amount: [1, 1] }
        }
      },
      {
        id: 'cl_camp',
        name: '废弃营地',
        category: 'pickup',
        text: '一处废弃猎户营地，锅灶犹在，你搜出几块灵石和一捆{灵材名}。',
        textMiss: '一处废弃猎户营地，锅灶犹在，你搜出几块灵石。',
        reward: {
          stones: [2, 5],
          items: [{ category: '灵材', types: ['灵木', '金属'], count: [0, 1], tierPolicy: 'lower' }],
          fragment: { chance: 0.1, amount: [1, 1] }
        }
      },
      // —— 战斗 2 ——
      {
        id: 'cl_wolf',
        name: '野兽袭击',
        category: 'battle',
        text: '一头独眼山狼扑出，你侧身避过，反手一击将其毙于杖下，剥皮取骨。',
        reward: {
          stones: [2, 5],
          items: [{ category: '灵材', types: ['骨材'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'cl_bugs',
        name: '毒虫群',
        category: 'battle',
        text: '腐叶下窜出一窝毒虫，你挥袖拂开，踩死大半，拾了几枚毒囊。',
        reward: {
          stones: [2, 5],
          items: [{ category: '灵材', types: ['骨材'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      // —— 奇遇 1 ——
      {
        id: 'cl_spring',
        name: '灵泉',
        category: 'adventure',
        text: '你在乱石间发现一眼灵泉，泉水清冽，泉底沉着几株{灵植名}，你俯身捞起。',
        reward: {
          stones: [2, 6],
          items: [{ category: '灵植', types: ['草', '花'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      // —— 叙事 2 ——
      {
        id: 'cl_herbalist',
        name: '采药人求救',
        category: 'narrative',
        text: '一名采药人跌在坡下，腿骨错位，哀声求救。',
        narrative: { autoChoice: 'help', label: '相助' },
        reward: {
          stones: [1, 3],
          fragment: { chance: 0.1, amount: [1, 1] }
        }
      },
      {
        id: 'cl_refugees',
        name: '流民求带路',
        category: 'narrative',
        text: '一队流民迷失方向，恳求你带他们出山。',
        narrative: { autoChoice: 'help', label: '带路' },
        reward: {
          stones: [1, 3],
          fragment: { chance: 0.1, amount: [1, 1] }
        }
      }
    ]
  },
  {
    id: 'zhulieren_shankou',
    name: '诸猎人山口',
    description: '猎户踏出的山口，骨材与灵木渐多，妖兽也开始成群，独行需谨慎。',
    minLevel: 3,
    mapTier: 2,
    eventTendencies: ['灵植', '灵材', '骨材', '战斗'],
    events: [
      // —— 空包 3 ——
      {
        id: 'zl_shelter',
        name: '避雨打坐',
        category: 'nothing',
        text: '山口风急，你躲进猎户废弃的木棚，就着檐下滴水打坐半日。',
        reward: {}
      },
      {
        id: 'zl_nothing',
        name: '一无所获',
        category: 'nothing',
        text: '你在猎人踩出的小径上走了半日，只惊起几只山雀，别无所得。',
        reward: {}
      },
      {
        id: 'zl_rest',
        name: '原地休整',
        category: 'nothing',
        text: '你在一棵老松下设了简易营地，吃干粮饮水，歇到日头偏西。',
        reward: {}
      },
      // —— 采集·灵植 2 ——
      {
        id: 'zl_herb',
        name: '发现灵植',
        category: 'gatherHerb',
        text: '猎户布下的陷阱旁生着一丛{灵植名}，你避开兽夹，连根挖起。',
        reward: {
          stones: [0, 12],
          items: [{ category: '灵植', types: ['草', '花'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'zl_vine',
        name: '发现古藤',
        category: 'gatherHerb',
        text: '一株不知年岁的{灵藤名}缠在老树上，你割下一段，藤汁微苦带香。',
        reward: {
          stones: [0, 12],
          items: [{ category: '灵植', types: ['藤'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      // —— 采集·灵材 3 ——
      {
        id: 'zl_mine',
        name: '废弃矿洞',
        category: 'gatherMaterial',
        text: '半山腰一处塌了口的旧矿洞，你在碎石里翻出几块{灵材名}。',
        reward: {
          stones: [0, 12],
          items: [{ category: '灵材', types: ['金属', '宝晶', '灵土'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'zl_bones',
        name: '骨材堆',
        category: 'gatherMaterial',
        text: '猎户丢弃的兽骨堆成小山，你挑了几根成色好的{骨材名}收走。',
        reward: {
          stones: [0, 12],
          items: [{ category: '灵材', types: ['骨材'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'zl_wood',
        name: '发现灵木',
        category: 'gatherMaterial',
        text: '一截雷劈过的老木横在溪边，木质乌沉，你锯下一段{灵木名}。',
        reward: {
          stones: [0, 12],
          items: [{ category: '灵材', types: ['灵木'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      // —— 拾遗 2 ——
      {
        id: 'zl_pouch',
        name: '储物袋',
        category: 'pickup',
        text: '一具旧兽皮袋挂在灌木上，你解下来抖了抖，倒出几颗灵石和半张残页。',
        textMiss: '一具旧兽皮袋挂在灌木上，你解下来抖了抖，只倒出几颗灵石。',
        reward: {
          stones: [8, 20],
          fragment: { chance: 0.005, amount: [1, 1] }
        }
      },
      {
        id: 'zl_corpse',
        name: '尸体',
        category: 'pickup',
        text: '一具猎人尸首伏在乱石间，身上还背着弓箭，你替他合上眼，取走干粮袋里的灵石。',
        reward: {
          stones: [8, 20],
          fragment: { chance: 0.1, amount: [1, 1] }
        }
      },
      // —— 战斗 3 ——
      {
        id: 'zl_boar',
        name: '妖兽袭击',
        category: 'battle',
        text: '一头獠牙野猪妖从林子里冲出，你侧身让过獠牙，一杖砸在其天灵盖上。',
        reward: {
          stones: [8, 20],
          items: [{ category: '灵材', types: ['骨材'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'zl_wolves',
        name: '野兽袭击',
        category: 'battle',
        text: '三只灰狼结伴而来，你且战且退，逐个击破，剥下三张狼皮。',
        reward: {
          stones: [8, 20],
          items: [{ category: '灵材', types: ['骨材'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'zl_monkeys',
        name: '兽群',
        category: 'battle',
        text: '一群山猴抢你干粮，你驱散了猴群，捡回散落的灵石，顺手掏了两个猴窝。',
        reward: {
          stones: [12, 24],
          items: [{ category: '灵材', types: ['骨材'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      // —— 奇遇 2 ——
      {
        id: 'zl_spring',
        name: '灵泉',
        category: 'adventure',
        text: '山口石缝间渗出一眼细泉，泉眼边长着几株{灵植名}，你一并取了。',
        reward: {
          stones: [8, 24],
          items: [{ category: '灵植', types: ['草', '花'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'zl_relic',
        name: '古修遗蜕',
        category: 'adventure',
        text: '一处坍塌的猎棚底下，埋着半具古修遗骸，你从骸骨旁拾得{灵材名}和半张残页。',
        textMiss: '一处坍塌的猎棚底下，埋着半具古修遗骸，你从骸骨旁拾得{灵材名}。',
        reward: {
          stones: [12, 28],
          items: [{ category: '灵材', types: ['骨材', '金属', '宝晶'], count: [1, 1], tierPolicy: 'mixed' }],
          fragment: { chance: 0.5, amount: [1, 1] }
        }
      },
      // —— 叙事 2 ——
      {
        id: 'zl_herbalist',
        name: '采药人求救',
        category: 'narrative',
        text: '一名采药人被兽夹夹住了腿，血流不止，见到你便高声呼救。',
        narrative: { autoChoice: 'help', label: '相助' },
        reward: {
          stones: [4, 12],
          fragment: { chance: 0.1, amount: [1, 1] }
        }
      },
      {
        id: 'zl_rogue',
        name: '散修求助',
        category: 'narrative',
        text: '一名衣衫褴褛的散修拦住你，说被劫修追了三天，求你指条活路。',
        narrative: { autoChoice: 'help', label: '相助' },
        reward: {
          stones: [4, 12],
          fragment: { chance: 0.1, amount: [1, 1] }
        }
      }
    ]
  },
  {
    id: 'changling_guanwai',
    name: '长岭关外',
    description: '古关之外的风沙荒滩，劫修与妖兽出没，偶有古修洞府现世，机缘与凶险并存。',
    minLevel: 6,
    mapTier: 3,
    eventTendencies: ['战斗', '骨材', '残页', '宝匣 1%'],
    events: [
      // —— 空包 3 ——
      {
        id: 'cg_shelter',
        name: '避雨打坐',
        category: 'nothing',
        text: '关外风沙大，你缩进一段残墙背后避风，就着风声打坐。',
        reward: {}
      },
      {
        id: 'cg_lost',
        name: '迷路',
        category: 'nothing',
        text: '关外荒滩岔路太多，你辨不清方向，兜了半日才寻回原路。',
        reward: {}
      },
      {
        id: 'cg_storm',
        name: '天气突变',
        category: 'nothing',
        text: '天色骤暗，一场沙暴卷来，你伏在巨石后挨过这阵，身上落满黄沙。',
        reward: {}
      },
      // —— 采集·灵植 2 ——
      {
        id: 'cg_herb',
        name: '发现灵植',
        category: 'gatherHerb',
        text: '关墙根下一丛{灵植名}生得倔强，你蹲身挖出，根须上还沾着沙。',
        reward: {
          stones: [0, 36],
          items: [{ category: '灵植', types: ['草', '花'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'cg_field',
        name: '药田遗迹',
        category: 'gatherHerb',
        text: '一处被风沙掩埋的古药田，你拨开沙土，竟还寻得几株{灵植名}。',
        reward: {
          stones: [0, 36],
          items: [{ category: '灵植', types: ['草', '花'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      // —— 采集·灵材 3 ——
      {
        id: 'cg_mine',
        name: '废弃矿洞',
        category: 'gatherMaterial',
        text: '关外一处废弃的戍卒矿洞，你打着火折子进去，敲下几块{灵材名}。',
        reward: {
          stones: [0, 36],
          items: [{ category: '灵材', types: ['金属', '宝晶', '灵土'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'cg_vein',
        name: '发现矿脉',
        category: 'gatherMaterial',
        text: '一道浅露在地表的矿脉，你顺着矿线撬了几块{灵材名}，成色不错。',
        reward: {
          stones: [0, 36],
          items: [{ category: '灵材', types: ['金属', '宝晶'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'cg_battlefield',
        name: '古战场残骸',
        category: 'gatherMaterial',
        text: '风沙吹开一片古战场，锈刀断戟间散落着{骨材名}，你收了几件。',
        reward: {
          stones: [0, 36],
          items: [{ category: '灵材', types: ['骨材'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      // —— 拾遗 2 ——
      {
        id: 'cg_pouch',
        name: '储物袋',
        category: 'pickup',
        text: '一具风干的尸首半掩在沙里，腰间储物袋尚未腐坏，你解下收了灵石。',
        reward: {
          stones: [24, 60],
          fragment: { chance: 0.005, amount: [1, 1] }
        }
      },
      {
        id: 'cg_rubble',
        name: '遗迹残片',
        category: 'pickup',
        text: '半截残碑埋在沙中，碑上刻着残缺的符文，你拓下拓片，算作残页。',
        reward: {
          stones: [24, 60],
          fragment: { chance: 1, amount: [1, 1] }
        }
      },
      // —— 战斗 4 ——
      {
        id: 'cg_wolf',
        name: '妖兽袭击',
        category: 'battle',
        text: '一头铁背狼妖从沙丘后扑出，你迎上去，一杖砸断其脊，取了妖骨。',
        reward: {
          stones: [24, 60],
          items: [{ category: '灵材', types: ['骨材'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'cg_robbers',
        name: '劫修拦路',
        category: 'battle',
        text: '三名劫修拦在道口，你三招两式放倒两人，剩下一个丢下灵石袋跑了。',
        reward: {
          stones: [36, 72],
          items: [{ category: '灵材', types: ['骨材', '金属'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'cg_pack',
        name: '兽群',
        category: 'battle',
        text: '一群沙狼围上来，你且战且退，杀退狼群，捡了满地的狼牙和灵石。',
        reward: {
          stones: [36, 60],
          items: [{ category: '灵材', types: ['骨材'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'cg_king',
        name: '妖兽头目',
        category: 'battle',
        text: '一头独眼狼王盘踞在关外，你与之缠斗半晌，终将其斩杀，取了妖丹和几块成色上佳的妖骨。',
        reward: {
          stones: [60, 108],
          items: [{ category: '灵材', types: ['骨材'], count: [2, 3], tierPolicy: 'primary' }]
        }
      },
      // —— 奇遇 2（古修洞府固定 1%）——
      {
        id: 'cg_cave',
        name: '古修洞府',
        category: 'adventure',
        fixedWeightPct: 1,
        text: '关外荒丘下露出一角石门，你推开进去，石室中灵光未散，案上摆着一只宝匣。',
        reward: {
          stones: [120, 200],
          items: [{ category: '灵材', types: ['金属', '宝晶', '灵土', '灵木'], count: [1, 2], tierPolicy: 'mixed' }],
          fragment: { chance: 0.2, amount: [1, 1] },
          chest: true
        }
      },
      {
        id: 'cg_stele',
        name: '无字石碑',
        category: 'adventure',
        text: '一块无字石碑立在风沙里，你以手抚碑，指下竟有字痕浮现，是半篇功法。',
        textMiss: '一块无字石碑立在风沙里，你以手抚碑，指下字痕已被人拓过，只得几页残篇。',
        reward: {
          stones: [0, 0],
          art: { chance: 1 }
        }
      },
      // —— 叙事 2 ——
      {
        id: 'cg_caravan',
        name: '商队遇劫',
        category: 'narrative',
        text: '一支商队被劫修围在道中，货物散落一地，商队管事远远向你求救。',
        narrative: { autoChoice: 'help', label: '拔刀相助' },
        reward: {
          stones: [12, 36],
          fragment: { chance: 0.1, amount: [1, 1] }
        }
      },
      {
        id: 'cg_enemy',
        name: '仇家追杀',
        category: 'narrative',
        text: '一名满面血污的修士跌跌撞撞跑来，身后追着三名带刀修士，他认出你，求你看在旧识份上救他一命。',
        narrative: { autoChoice: 'help', label: '迎战' },
        reward: {
          stones: [12, 36],
          fragment: { chance: 0.1, amount: [1, 1] }
        }
      }
    ]
  },
  {
    id: 'feiying_zhenwai',
    name: '飞鹰镇外',
    description: '飞鹰镇外的荒田与乱石，灵石与残页散落，奇遇最多，也最招是非。',
    minLevel: 9,
    mapTier: 4,
    eventTendencies: ['灵石', '残页', '功法', '宝匣 1%'],
    events: [
      // —— 空包 2 ——
      {
        id: 'fy_shelter',
        name: '避雨打坐',
        category: 'nothing',
        text: '飞鹰镇外下起细雨，你在镇口破庙里避雨打坐，香火早断，只剩半截残烛。',
        reward: {}
      },
      {
        id: 'fy_nothing',
        name: '一无所获',
        category: 'nothing',
        text: '你在镇外的荒田里转了半日，除了几只野兔，一无所获。',
        reward: {}
      },
      // —— 采集·灵植 2 ——
      {
        id: 'fy_herb',
        name: '发现灵植',
        category: 'gatherHerb',
        text: '镇外荒田边长着一丛{灵植名}，你蹲身采了，泥土还带着雨气。',
        reward: {
          stones: [0, 96],
          items: [{ category: '灵植', types: ['草', '花'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'fy_tea',
        name: '灵茶园',
        category: 'gatherHerb',
        // 叶属于灵材；池子里「叶」目前只到二阶，找不到同阶时换同阶花/果
        text: '一处废弃茶园，几株老茶树上还挂着{灵叶名}，你摘了一兜，清香扑鼻。',
        reward: {
          stones: [0, 96],
          items: [{
            category: '灵材',
            types: ['叶'],
            fallbackTypes: ['花', '果'],
            count: [1, 2],
            tierPolicy: 'mixed'
          }]
        }
      },
      // —— 采集·灵材 2 ——
      {
        id: 'fy_mine',
        name: '废弃矿洞',
        category: 'gatherMaterial',
        text: '镇外旧矿洞已荒废多年，你在塌方处翻出几块{灵材名}，成色尚可。',
        reward: {
          stones: [24, 96],
          items: [{ category: '灵材', types: ['金属', '宝晶', '灵土'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'fy_crystal',
        name: '宝晶矿',
        category: 'gatherMaterial',
        text: '矿洞深处泛着幽幽蓝光，是一处宝晶矿脉，你敲下几块{宝晶名}。',
        reward: {
          stones: [24, 96],
          items: [{ category: '灵材', types: ['宝晶'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      // —— 拾遗 3 ——
      {
        id: 'fy_pouch',
        name: '储物袋',
        category: 'pickup',
        text: '一具倒在路边的修士尸首，腰间的储物袋还鼓着，你解下来，里面是灵石和半卷残页。',
        textMiss: '一具倒在路边的修士尸首，腰间的储物袋还鼓着，你解下来，里面只剩灵石。',
        reward: {
          stones: [60, 140],
          fragment: { chance: 0.005, amount: [1, 1] }
        }
      },
      {
        id: 'fy_artifact',
        name: '遗失法器',
        category: 'pickup',
        text: '荒草丛里躺着一件残破法器，你拾起来擦了擦，虽有裂纹，底材尚在。',
        textMiss: '荒草丛里躺着一件残破法器，你拾起来看了看，裂纹太深，已无可用之材。',
        reward: {
          stones: [60, 140],
          items: [{
            category: '灵材',
            types: ['金属'],
            count: [1, 1],
            chance: 0.5,
            tierPolicy: 'lower'
          }],
          fragment: { chance: 0.1, amount: [1, 1] }
        }
      },
      {
        id: 'fy_rubble',
        name: '遗迹残片',
        category: 'pickup',
        text: '镇外一处坍塌的古宅，你在废墟里翻出几片带字的残页，字迹已模糊。',
        reward: {
          stones: [60, 140],
          fragment: { chance: 1, amount: [2, 2] }
        }
      },
      // —— 战斗 3 ——
      {
        id: 'fy_robbers',
        name: '劫修拦路',
        category: 'battle',
        text: '两名劫修从林子里闪出，你二话不说迎上去，一人一刀放翻，取走他们的储物袋。',
        reward: {
          stones: [96, 180],
          items: [{ category: '灵材', types: ['骨材', '金属'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'fy_duel',
        name: '散修斗法波及',
        category: 'battle',
        // 这是战斗大类里唯一**无风险**的事件：只捡漏，不掷胜率
        noBattle: true,
        text: '两名散修在前方斗法，灵光四溅，你远远躲开，等他们打完了，捡了些散落的灵石。',
        reward: {
          stones: [60, 120]
        }
      },
      {
        id: 'fy_soul',
        name: '古兽残魂',
        category: 'battle',
        text: '荒田里游荡着一缕古兽残魂，你以灵力将它打散，魂散处留下一枚残破兽核。',
        reward: {
          stones: [120, 240],
          items: [{ category: '灵材', types: ['骨材'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      // —— 奇遇 4（古修洞府固定 1%）——
      {
        id: 'fy_cave',
        name: '古修洞府',
        category: 'adventure',
        fixedWeightPct: 1,
        text: '镇外枯井下连着一处古修洞府，你顺着石阶下去，石室中宝匣静置，灵光流转。',
        reward: {
          stones: [300, 500],
          items: [{ category: '灵材', types: ['金属', '宝晶', '灵土', '灵木'], count: [1, 2], tierPolicy: 'mixed' }],
          fragment: { chance: 0.2, amount: [1, 1] },
          chest: true
        }
      },
      {
        id: 'fy_stele',
        name: '无字石碑',
        category: 'adventure',
        text: '镇外荒丘上立着一块无字石碑，你以灵力探入，碑中浮现一篇功法的残篇。',
        textMiss: '镇外荒丘上立着一块无字石碑，你以灵力探入，碑中字痕已散，只余几页残篇。',
        reward: {
          stones: [0, 0],
          art: { chance: 1 }
        }
      },
      {
        id: 'fy_sigil',
        name: '传承印记',
        category: 'adventure',
        text: '古宅后院的地砖下，藏着一枚传承印记，你触之，一道功法诀要入脑。',
        textMiss: '古宅后院的地砖下，藏着一枚传承印记，你触之，印记早已黯淡，只余几页残篇。',
        reward: {
          stones: [0, 0],
          art: { chance: 1 }
        }
      },
      {
        id: 'fy_rift',
        name: '秘境入口',
        category: 'adventure',
        // ⚠ 设计硬规则：全池只有「古修洞府」给宝匣。原文案写的「散落着一只宝匣」
        //   与硬规则冲突，2026-10-20 用户拍板：守硬规则、改文案。
        text: '镇外乱石中现出一道空间裂隙，像是通往某处秘境。裂隙边缘灵光闪烁，你不敢久留，只在外围拾了些灵石。',
        reward: {
          stones: [200, 400],
          fragment: { chance: 1, amount: [2, 2] }
        }
      },
      // —— 叙事 2 ——
      {
        id: 'fy_sect',
        name: '门派弟子盘问',
        category: 'narrative',
        text: '三名飞鹰门弟子拦住你，说镇外最近有散修作乱，要盘查你的来历。',
        narrative: { autoChoice: 'help', label: '配合' },
        reward: {
          stones: [48, 96],
          fragment: { chance: 0.1, amount: [1, 1] }
        }
      },
      {
        id: 'fy_rogue',
        name: '散修求助',
        category: 'narrative',
        text: '一名散修在镇外被人下了毒，撑着一口气求你就救。',
        narrative: { autoChoice: 'help', label: '相助' },
        reward: {
          stones: [48, 96],
          fragment: { chance: 0.1, amount: [1, 1] }
        }
      }
    ]
  }
]

/**
 * 生成一张地图的逐事件权重表（百分比，合计 100）。
 *
 * 规则（《探索系统》§4.2 注）：
 *   · 非奇遇大类：大类权重 / 该图该大类事件数；
 *   · 奇遇大类：有 `fixedWeightPct` 的事件（古修洞府 = 1）固定，
 *     其余奇遇均分 `5 - 1`；没有古修洞府的地图，5 在全部奇遇间均分；
 *   · 空包的 25 / 10 子权重与「大类内均分」冲突，按后者执行。
 *
 * @returns {{ event: object, weightPct: number }[]}
 */
export const eventWeightTable = location => {
  const events = location?.events || []
  const groups = new Map()
  for (const event of events) {
    if (!groups.has(event.category)) groups.set(event.category, [])
    groups.get(event.category).push(event)
  }

  const table = []
  for (const category of CATEGORY_ORDER) {
    const group = groups.get(category) || []
    if (!group.length) continue
    const total = CATEGORY_WEIGHTS[category]

    if (category === 'adventure') {
      const fixed = group.filter(event => Number(event.fixedWeightPct) > 0)
      const rest = group.filter(event => !(Number(event.fixedWeightPct) > 0))
      const fixedSum = fixed.reduce((sum, event) => sum + Number(event.fixedWeightPct), 0)
      for (const event of fixed) {
        table.push({ event, weightPct: Number(event.fixedWeightPct) })
      }
      const restTotal = Math.max(total - fixedSum, 0)
      if (rest.length && restTotal > 0) {
        const each = restTotal / rest.length
        for (const event of rest) table.push({ event, weightPct: each })
      }
      continue
    }

    const each = total / group.length
    for (const event of group) table.push({ event, weightPct: each })
  }
  return table
}
