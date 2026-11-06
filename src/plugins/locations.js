// 【探索地图与事件池】—— 纯数据（无副作用，可被 node 直接加载跑断言）
//
// 设计真源：`design/20-系统设计/探索系统.md` v1.0（2026-10-20 定稿）。
//   · 练气四图：长岭乡外（1 层）/ 诸猎人山口（3 层）/ 长岭关外（6 层）/ 飞鹰镇外（9 层）。
//   · **筑基四图（2026-11-01 B9-a）**：一线天峡谷（11）/ 七连寨（14）/
//     炼石废墟（17）/ 地火断崖（20），结构逐条照抄练气四图，见 §2.2 / §6.5~6.8。
//   · **金丹四图（2026-11-06 B16）**：死亡沼泽（21）/ 黑河坊（24）/
//     南口关（27）/ 小魔渊（30），结构逐条照抄筑基四图，见 §2.2 / §6.9~6.12。
//   · 每图 16 / 17 / 18 / 18 条事件（每段一样），练气文案见附录 A–D。
//   · 45 是设计层的**模板数**，69 是**每段文案数**；代码里直接写地图事件，
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
 *
 * `highTierChance` = 段内掷中**高阶**的概率（2026-10-22 P30）。
 * 阶本身由玩家/子嗣的境界段决定（练气 1~2 / 筑基 2~3 / 结丹 3~4，见
 * `exploration.tierBandOf`），地图只负责在这两档里加权：
 *   长岭乡外 0 → 恒一阶；诸猎人山口 30%；长岭关外 60%；飞鹰镇外 90%。
 * ⚠ 旧字段 `mapTier`（地图阶 = 物品阶）已删除：那是旧版「探索地等级」表的残留，
 *   会在练气六层掉三阶材料。物品阶和宝匣阶现在**同一条口径**。
 */
export const locations = [
  {
    id: 'changling_xiangwai',
    name: '长岭乡外',
    description: '长岭乡外的荒山野径，灵植与灵材零星散布，山兽不凶，适合初入修行的修士。',
    minLevel: 1,
    highTierChance: 0,
    elementBias: { metal: 18, wood: 28, water: 18, fire: 18, earth: 18 },
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
          items: [{ category: '灵材', types: ['灵木', '金属'], count: [0, 1], tierPolicy: 'low' }],
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
        // 叙事事件：弹窗两选一（《探索系统》§9.1）。只做善意/离开两个分支。
        // 奖励写在 `help` 选项里 —— 结算时只把这一支滚好，等玩家选完才入账。
        narrative: {
          autoChoice: 'help',
          options: [
            {
              id: 'help',
              label: '相助',
              text: '你把采药人的腿骨接上，搀他回村。他家人塞来几枚灵石相谢。',
              reward: {
                stones: [1, 3],
                fragment: { chance: 0.1, amount: [1, 1] }
              }
            },
            { id: 'leave', label: '离开', text: '你摇头走开，身后的哀声渐渐被山风吹散。' }
          ]
        }
      },
      {
        id: 'cl_refugees',
        name: '流民求带路',
        category: 'narrative',
        text: '一队流民迷失方向，恳求你带他们出山。',
        narrative: {
          autoChoice: 'help',
          options: [
            {
              id: 'help',
              label: '带路',
              text: '你领着流民绕过兽径，出山时他们跪谢不止，凑出几枚灵石。',
              reward: {
                stones: [1, 3],
                fragment: { chance: 0.1, amount: [1, 1] }
              }
            },
            { id: 'leave', label: '离开', text: '你指了个大略方向便转身入林，流民在后面犹豫着不敢跟。' }
          ]
        }
      }
    ]
  },
  {
    id: 'zhulieren_shankou',
    name: '诸猎人山口',
    description: '猎户踏出的山口，骨材与灵木渐多，妖兽也开始成群，独行需谨慎。',
    minLevel: 3,
    highTierChance: 0.3,
    elementBias: { metal: 28, wood: 18, water: 18, fire: 18, earth: 18 },
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
        narrative: {
          autoChoice: 'help',
          options: [
            {
              id: 'help',
              label: '相助',
              text: '你掰开兽夹、替他敷上止血的草药，他摸出贴身带的灵石相赠。',
              reward: {
                stones: [4, 12],
                fragment: { chance: 0.1, amount: [1, 1] }
              }
            },
            { id: 'leave', label: '离开', text: '兽夹不是你能徒手掰开的，你绕开血渍继续赶路。' }
          ]
        }
      },
      {
        id: 'zl_rogue',
        name: '散修求助',
        category: 'narrative',
        text: '一名衣衫褴褛的散修拦住你，说被劫修追了三天，求你指条活路。',
        narrative: {
          autoChoice: 'help',
          options: [
            {
              id: 'help',
              label: '相助',
              text: '你把他藏进一处石缝，又引开追兵。他脱身后追上来，硬塞给你几枚灵石。',
              reward: {
                stones: [4, 12],
                fragment: { chance: 0.1, amount: [1, 1] }
              }
            },
            { id: 'leave', label: '离开', text: '你不想沾上劫修的事，加快脚步离开，散修的呼喊很快落在身后。' }
          ]
        }
      }
    ]
  },
  {
    id: 'changling_guanwai',
    name: '长岭关外',
    description: '古关之外的风沙荒滩，劫修与妖兽出没，偶有古修洞府现世，机缘与凶险并存。',
    minLevel: 6,
    highTierChance: 0.6,
    elementBias: { metal: 18, wood: 18, water: 18, fire: 18, earth: 28 },
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
          items: [{ category: '灵材', types: ['骨材'], count: [2, 3], tierPolicy: 'high' }]
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
          art: { chance: 1, kind: 'heart_fragment' }
        }
      },
      // —— 叙事 2 ——
      {
        id: 'cg_caravan',
        name: '商队遇劫',
        category: 'narrative',
        text: '一支商队被劫修围在道中，货物散落一地，商队管事远远向你求救。',
        narrative: {
          autoChoice: 'help',
          options: [
            {
              id: 'help',
              label: '拔刀相助',
              text: '你从侧翼出手，劫修见势不妙四散。管事捧出一袋灵石道谢。',
              reward: {
                stones: [12, 36],
                fragment: { chance: 0.1, amount: [1, 1] }
              }
            },
            { id: 'leave', label: '离开', text: '劫修人多，你贴着山壁绕了过去，只当没听见。' }
          ]
        }
      },
      {
        id: 'cg_enemy',
        name: '仇家追杀',
        category: 'narrative',
        text: '一名满面血污的修士跌跌撞撞跑来，身后追着三名带刀修士，他认出你，求你看在旧识份上救他一命。',
        narrative: {
          autoChoice: 'help',
          options: [
            {
              id: 'help',
              label: '迎战',
              text: '你横杖挡在道中，三名带刀修士迟疑片刻，退了。他喘匀了气，解下钱袋塞给你。',
              reward: {
                stones: [12, 36],
                fragment: { chance: 0.1, amount: [1, 1] }
              }
            },
            { id: 'leave', label: '离开', text: '你侧身让过。旧识的眼神暗下去，脚步声很快消失在林子里。' }
          ]
        }
      }
    ]
  },
  {
    id: 'feiying_zhenwai',
    name: '飞鹰镇外',
    description: '飞鹰镇外的荒田与乱石，灵石与残页散落，奇遇最多，也最招是非。',
    minLevel: 9,
    highTierChance: 0.9,
    elementBias: { metal: 18, wood: 18, water: 28, fire: 18, earth: 18 },
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
            tierPolicy: 'low'
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
          art: { chance: 1, kind: 'heart_fragment' }
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
          art: { chance: 1, kind: 'other_art' }
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
        narrative: {
          autoChoice: 'help',
          options: [
            {
              id: 'help',
              label: '配合',
              text: '你如实说明来意，又替他们指了作乱散修的去向。领头的弟子拱拱手，放你过去。',
              reward: {
                stones: [48, 96],
                fragment: { chance: 0.1, amount: [1, 1] }
              }
            },
            { id: 'leave', label: '离开', text: '你懒得与他们纠缠，绕道进了镇子。身后传来几句不满的呵斥。' }
          ]
        }
      },
      {
        id: 'fy_rogue',
        name: '散修求助',
        category: 'narrative',
        text: '一名散修在镇外被人下了毒，撑着一口气求你就救。',
        narrative: {
          autoChoice: 'help',
          options: [
            {
              id: 'help',
              label: '相助',
              text: '你把随身灵草喂他服下，毒气压住。他缓过来说出报酬藏处，你取了几块灵石。',
              reward: {
                stones: [48, 96],
                fragment: { chance: 0.1, amount: [1, 1] }
              }
            },
            { id: 'leave', label: '离开', text: '你看出这毒不好解，摇摇头走开。他望着你的背影，慢慢闭上了眼。' }
          ]
        }
      }
    ]
  },
  // ===================================================================
  // —— 筑基四图（2026-11-01 B9-a）——
  //
  // 结构**逐条照抄练气四图**（Q7③「不新增玩法、只做数据参数化复制」）：
  // 事件数 16 / 17 / 18 / 18、段内高阶 0 / 30 / 60 / 90%，事件类别分布与
  // 长岭乡外 / 诸猎人山口 / 长岭关外 / 飞鹰镇外 一一对应。
  //
  // `minLevel` = **11 / 14 / 17 / 20**（2026-11-01 拍板）：30 级表下筑基段是 11~20，
  // 四张图按四等分铺开，不再沿用旧 18 级表的「每小境界一张」（那会变成 10 张图）。
  //
  // 数值口径（2026-11-01 拍板「按境界系数平移」）：
  //   灵石区间 = 飞鹰镇外对应区间的数值 × realmCoefAt(本图 minLevel) / realmCoefAt(9)
  //   系数 = 2.19 / 2.93 / 3.66 / 4.39（四张依次）。
  //   段内的真实涨头靠**物品阶**（筑基段 = 二阶低 / 三阶高）而不是灵石本身。
  //   ⚠ 24× 时钟下 1 游戏天 = 4 现实秒，游戏天收益看着很大 —— 那是 B8 重定价的事，
  //     不要在这里为了「现实秒手感」单独压数。
  //
  // 掉落阶**不在这张表里判**：阶由玩家境界段决定（`exploration.tierBandOf`，
  // 筑基段 = 11~20 → 二阶 / 三阶），地图只给段内高阶概率 `highTierChance`。
  {
    id: 'qingshi_gudao',
    name: '一线天峡谷',
    description: '东边群山入口的一线天峡谷，旧驿道穿谷而过，青石板上只剩车辙与苔痕，谷口还立着废弃的老君庙。',
    minLevel: 11,
    highTierChance: 0,
    elementBias: { metal: 18, wood: 18, water: 18, fire: 18, earth: 28 },
    eventTendencies: ['灵植', '灵材', '边境'],
    events: [
      // —— 空包 4 ——
      {
        id: 'qd_shelter',
        name: '避雨打坐',
        category: 'nothing',
        text: '山雨落在青石板上，你钻进路边坍塌的驿亭，盘膝打坐半日，雨停方归。',
        reward: {}
      },
      {
        id: 'qd_nothing',
        name: '一无所获',
        category: 'nothing',
        text: '古道两旁荒草齐腰，你走了半日，除了几只受惊的雉鸟，一无所获。',
        reward: {}
      },
      {
        id: 'qd_lost',
        name: '迷路',
        category: 'nothing',
        text: '古道的岔口太多，车辙又早已模糊，你绕了半日才寻回原路。',
        reward: {}
      },
      {
        id: 'qd_post',
        name: '驿站残垣',
        category: 'nothing',
        text: '旧驿站只剩半堵土墙，你在墙根歇脚，看风从断口里穿过。',
        reward: {}
      },
      // —— 采集·灵植 3 ——
      {
        id: 'qd_herb',
        name: '发现灵植',
        category: 'gatherHerb',
        text: '青石板缝里钻出一丛{灵植名}，根须扎进石隙，叶上还挂着晨露，你小心采下。',
        reward: {
          stones: [0, 210],
          items: [{ category: '灵植', types: ['草', '花'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'qd_orchard',
        name: '灵果园',
        category: 'gatherHerb',
        text: '驿道旁一片无人打理的果林，枝头还挂着{灵果名}，你攀枝摘了数枚。',
        reward: {
          stones: [0, 210],
          items: [{ category: '灵材', types: ['果'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'qd_flower',
        name: '灵花丛',
        category: 'gatherHerb',
        text: '乱石间开着一片{灵花名}，花瓣莹白，你在花丛里挑开得最盛的摘了一捧。',
        reward: {
          stones: [0, 210],
          items: [{ category: '灵材', types: ['花'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      // —— 采集·灵材 2 ——
      {
        id: 'qd_mine',
        name: '废弃矿洞',
        category: 'gatherMaterial',
        text: '古道旁一处塌了半边的矿洞，你在碎石堆里翻出几块{灵材名}。',
        reward: {
          stones: [50, 210],
          items: [{ category: '灵材', types: ['金属', '宝晶', '灵土'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'qd_soil',
        name: '发现灵土',
        category: 'gatherMaterial',
        text: '路基下露出一层暗红的土，触手温润，是常年浸了灵气的{灵土名}，你掘了一袋。',
        reward: {
          stones: [50, 210],
          items: [{ category: '灵材', types: ['灵土'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      // —— 拾遗 2 ——
      {
        id: 'qd_pouch',
        name: '储物袋',
        category: 'pickup',
        text: '道旁躺着一名死去的散修，腰间储物袋还鼓着，你解下来，里面是灵石和半卷残页。',
        textMiss: '道旁躺着一名死去的散修，腰间储物袋还鼓着，你解下来，里面只剩灵石。',
        reward: {
          stones: [130, 310],
          fragment: { chance: 0.005, amount: [1, 1] }
        }
      },
      {
        id: 'qd_camp',
        name: '废弃营地',
        category: 'pickup',
        text: '一处废弃的宿营地，火堆早冷，帐篷下压着散落的灵石和几页残纸。',
        textMiss: '一处废弃的宿营地，火堆早冷，你翻遍了帐篷，只找出些散落的灵石。',
        reward: {
          stones: [130, 310],
          fragment: { chance: 0.1, amount: [1, 1] }
        }
      },
      // —— 战斗 2 ——
      {
        id: 'qd_bandit',
        name: '匪修劫道',
        category: 'battle',
        text: '两名匪修见你独行，从路侧的枯林里闪出。你没等他们开口，先一步出手，放翻在地。',
        reward: {
          stones: [210, 400],
          items: [{ category: '灵材', types: ['骨材', '金属'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'qd_beasts',
        name: '山魈群',
        category: 'battle',
        text: '一群山魈从崖上扑下，尖啸声在古道里来回撞。你杀退了头一只，其余才散。',
        reward: {
          stones: [260, 530],
          items: [{ category: '灵材', types: ['骨材'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      // —— 奇遇 1 ——
      {
        id: 'qd_spring',
        name: '灵泉',
        category: 'adventure',
        text: '古道尽头的岩缝里渗出一眼灵泉，泉底沉着几株{灵植名}，你俯身捞起。',
        reward: {
          stones: [300, 560],
          items: [{ category: '灵植', types: ['草', '花'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      // —— 叙事 2 ——
      {
        id: 'qd_herbalist',
        name: '采药人求救',
        category: 'narrative',
        text: '一名采药人摔在驿道坡下，腿骨错位，喊了半日也没人来。',
        narrative: {
          autoChoice: 'help',
          options: [
            {
              id: 'help',
              label: '相助',
              text: '你把他的腿骨接上，搀他走到最近的村子。他家人凑了几块灵石相谢。',
              reward: {
                stones: [110, 210],
                fragment: { chance: 0.1, amount: [1, 1] }
              }
            },
            { id: 'leave', label: '离开', text: '你摇摇头走开。古道上风很硬，喊声很快就被吹散了。' }
          ]
        }
      },
      {
        id: 'qd_refugees',
        name: '流民求带路',
        category: 'narrative',
        text: '一队流民拖家带口堵在驿道上，说北边的矿脉塌了，想绕去飞鹰镇。',
        narrative: {
          autoChoice: 'help',
          options: [
            {
              id: 'help',
              label: '带路',
              text: '你带他们绕过兽径，赶到镇口时天已擦黑，几户人家凑出灵石谢你。',
              reward: {
                stones: [110, 210],
                fragment: { chance: 0.1, amount: [1, 1] }
              }
            },
            { id: 'leave', label: '离开', text: '你指了个方向便自往前走。回头时，他们还站在原地面面相觑。' }
          ]
        }
      }
    ]
  },
  {
    id: 'wanshou_gukou',
    name: '七连寨',
    description: '大山深处的七连寨，各寨自成一脉；寨外草甸兽径纵横，灵气里带着一股野性。',
    minLevel: 14,
    highTierChance: 0.3,
    elementBias: { metal: 18, wood: 28, water: 18, fire: 18, earth: 18 },
    eventTendencies: ['骨材', '灵材', '妖兽'],
    events: [
      // —— 空包 3 ——
      {
        id: 'wk_shelter',
        name: '避雨打坐',
        category: 'nothing',
        text: '谷口起了雾，你在巨石背后避雨打坐，雾散时草叶上已结了一层水珠。',
        reward: {}
      },
      {
        id: 'wk_nothing',
        name: '一无所获',
        category: 'nothing',
        text: '草甸上只剩兽蹄印，你循着走了半日，什么也没找到。',
        reward: {}
      },
      {
        id: 'wk_rest',
        name: '原地休整',
        category: 'nothing',
        text: '你在一处背风的洼地歇了一日，烤干粮，磨短刀，什么都没做。',
        reward: {}
      },
      // —— 采集·灵植 2 ——
      {
        id: 'wk_herb',
        name: '发现灵植',
        category: 'gatherHerb',
        text: '兽径边上生着一丛{灵植名}，草叶被踩断了一半，根却还在，你连根挖出。',
        reward: {
          stones: [0, 280],
          items: [{ category: '灵植', types: ['草', '花'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'wk_vine',
        name: '发现古藤',
        category: 'gatherHerb',
        text: '一株不知长了几百年的古藤缠满岩壁，藤心沁着灵气，你割了几段下来。',
        reward: {
          stones: [0, 280],
          items: [{ category: '灵植', types: ['树', '草'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      // —— 采集·灵材 3 ——
      {
        id: 'wk_mine',
        name: '废弃矿洞',
        category: 'gatherMaterial',
        text: '谷口石壁上有个人工凿出的洞，早塌了，你在碎石里挑出几块{灵材名}。',
        reward: {
          stones: [70, 280],
          items: [{ category: '灵材', types: ['金属', '宝晶', '灵土'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'wk_bones',
        name: '骨材堆',
        category: 'gatherMaterial',
        text: '草甸上堆着一具巨大的兽骸，死了不知多少年，骨头还硬得能割手，你挑了几块。',
        reward: {
          stones: [70, 280],
          items: [{ category: '灵材', types: ['骨材'], count: [2, 3], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'wk_wood',
        name: '发现灵木',
        category: 'gatherMaterial',
        text: '一株被雷劈断的老树立在谷口，木心未朽，灵纹还在，你锯下一段。',
        reward: {
          stones: [70, 280],
          items: [{ category: '灵材', types: ['灵木'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      // —— 拾遗 2 ——
      {
        id: 'wk_pouch',
        name: '储物袋',
        category: 'pickup',
        text: '一具被兽爪撕烂的尸首横在草丛里，储物袋还完整，你解下来，里面有灵石和几页残纸。',
        textMiss: '一具被兽爪撕烂的尸首横在草丛里，储物袋还完整，你解下来，只倒出些灵石。',
        reward: {
          stones: [180, 410],
          fragment: { chance: 0.005, amount: [1, 1] }
        }
      },
      {
        id: 'wk_corpse',
        name: '尸体',
        category: 'pickup',
        text: '草丛里伏着一具散修的尸身，怀里的东西还没人动过，你翻出灵石和一页残纸。',
        textMiss: '草丛里伏着一具散修的尸身，怀里的东西早被人翻过，只剩些灵石。',
        reward: {
          stones: [180, 410],
          fragment: { chance: 0.1, amount: [1, 1] }
        }
      },
      // —— 战斗 3 ——
      {
        id: 'wk_beast',
        name: '妖兽袭击',
        category: 'battle',
        text: '一头二阶妖兽从草浪里直冲出来，你侧身让过，一刀斩在它颈侧。',
        reward: {
          stones: [280, 530],
          items: [{ category: '灵材', types: ['骨材'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'wk_pack',
        name: '兽群',
        category: 'battle',
        text: '七八头妖兽成群而来，你退到岩壁下，借着地势一个个放倒。',
        reward: {
          stones: [350, 700],
          items: [{ category: '灵材', types: ['骨材'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'wk_robbers',
        name: '劫修拦路',
        category: 'battle',
        text: '三名劫修堵在谷口，说这条道他们包了。你没答话，先动的手。',
        reward: {
          stones: [280, 530],
          items: [{ category: '灵材', types: ['骨材', '金属'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      // —— 奇遇 2 ——
      {
        id: 'wk_spring',
        name: '灵泉',
        category: 'adventure',
        text: '兽群饮水的洼地底下涌着一眼灵泉，泉水清得能看见底，你取了几葫芦，又捞了几株灵植。',
        reward: {
          stones: [400, 750],
          items: [{ category: '灵植', types: ['草', '花'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'wk_relic',
        name: '古修遗蜕',
        category: 'adventure',
        text: '石壁凹处坐着一具古修遗蜕，身上衣袍已朽成灰，指骨间还捏着东西，你取出几件灵材。',
        reward: {
          stones: [440, 880],
          items: [{ category: '灵材', types: ['金属', '宝晶', '灵木'], count: [1, 2], tierPolicy: 'mixed' }],
          fragment: { chance: 0.1, amount: [1, 1] }
        }
      },
      // —— 叙事 2 ——
      {
        id: 'wk_herbalist',
        name: '采药人求救',
        category: 'narrative',
        text: '一名采药人被兽群惊落崖下，挂在半腰的藤上，声音越来越弱。',
        narrative: {
          autoChoice: 'help',
          options: [
            {
              id: 'help',
              label: '相助',
              text: '你攀下岩壁把他背上来。他喘匀了气，从药篓里分出一半灵石塞给你。',
              reward: {
                stones: [140, 280],
                fragment: { chance: 0.1, amount: [1, 1] }
              }
            },
            { id: 'leave', label: '离开', text: '你看了看那根藤，估计撑不了半日，还是转身走了。' }
          ]
        }
      },
      {
        id: 'wk_rogue',
        name: '散修求助',
        category: 'narrative',
        text: '一名散修被妖兽咬穿了肩，靠在一棵树上求你就救。',
        narrative: {
          autoChoice: 'help',
          options: [
            {
              id: 'help',
              label: '相助',
              text: '你替他封住伤口，又护着他退到谷口。他把腕上的储物环解下来送了你。',
              reward: {
                stones: [140, 280],
                fragment: { chance: 0.1, amount: [1, 1] }
              }
            },
            { id: 'leave', label: '离开', text: '你摇了摇头。谷口的草很高，走出一段就看不见他了。' }
          ]
        }
      }
    ]
  },
  {
    id: 'kugu_zhanchang',
    name: '炼石废墟',
    description: '两山之间的远古炼石遗迹，枯骨与断兵半埋在黄沙下，风一起就呜咽。',
    minLevel: 17,
    highTierChance: 0.6,
    elementBias: { metal: 28, wood: 18, water: 18, fire: 18, earth: 18 },
    eventTendencies: ['战斗', '骨材', '奇遇'],
    events: [
      // —— 空包 3 ——
      {
        id: 'kg_shelter',
        name: '避雨打坐',
        category: 'nothing',
        text: '风沙骤起，你躲进一具半埋的兽骨下避风，闭目打坐，直到风声渐歇。',
        reward: {}
      },
      {
        id: 'kg_lost',
        name: '迷路',
        category: 'nothing',
        text: '风把沙丘的形状一夜之间全改了，你走了半日才发现自己在原地绕圈。',
        reward: {}
      },
      {
        id: 'kg_weather',
        name: '天气突变',
        category: 'nothing',
        text: '天色骤暗，霜气从地缝里冒出来，你只能裹紧衣袍等这阵异象过去。',
        reward: {}
      },
      // —— 采集·灵植 2 ——
      {
        id: 'kg_herb',
        name: '发现灵植',
        category: 'gatherHerb',
        text: '枯骨缝里钻出一株{灵植名}，根须缠着骨节，反倒长得极盛。',
        reward: {
          stones: [0, 350],
          items: [{ category: '灵植', types: ['草', '花'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'kg_field',
        name: '药田遗迹',
        category: 'gatherHerb',
        text: '沙下露出一片规整的田垄，是古修的药田，野化多年，还残留着几株{灵植名}。',
        reward: {
          stones: [0, 350],
          items: [{ category: '灵植', types: ['草', '花', '树'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      // —— 采集·灵材 3 ——
      {
        id: 'kg_mine',
        name: '废弃矿洞',
        category: 'gatherMaterial',
        text: '战场的边缘有一处被血锈蚀红的矿洞，你在洞壁敲下几块{灵材名}。',
        reward: {
          stones: [90, 350],
          items: [{ category: '灵材', types: ['金属', '宝晶', '灵土'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'kg_vein',
        name: '发现矿脉',
        category: 'gatherMaterial',
        text: '沙层下露出一条矿脉，断口泛着幽光，你顺着脉线凿了一串{宝晶名}。',
        reward: {
          stones: [90, 350],
          items: [{ category: '灵材', types: ['宝晶', '金属'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'kg_relic',
        name: '古战场残骸',
        category: 'gatherMaterial',
        text: '一具披甲的白骨半跪在那里，甲片早已锈透，骨节里却凝着一层灵纹，你取了几块。',
        reward: {
          stones: [90, 350],
          items: [{ category: '灵材', types: ['骨材', '金属'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      // —— 拾遗 2 ——
      {
        id: 'kg_pouch',
        name: '储物袋',
        category: 'pickup',
        text: '沙里半埋着一只储物袋，袋口的禁制早已失效，里面是灵石和一页残纸。',
        textMiss: '沙里半埋着一只储物袋，袋口的禁制早已失效，里面只剩些灵石。',
        reward: {
          stones: [220, 510],
          fragment: { chance: 0.005, amount: [1, 1] }
        }
      },
      {
        id: 'kg_scraps',
        name: '遗迹残片',
        category: 'pickup',
        text: '断墙下散着几片带字的铜片，字迹被风沙磨得模糊，你收起来。',
        reward: {
          stones: [220, 510],
          fragment: { chance: 1, amount: [2, 2] }
        }
      },
      // —— 战斗 4 ——
      {
        id: 'kg_beast',
        name: '妖兽袭击',
        category: 'battle',
        text: '一头妖兽在枯骨间伏了不知多久，见你走近才扑出。你迎上去，一合便分了生死。',
        reward: {
          stones: [350, 660],
          items: [{ category: '灵材', types: ['骨材'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'kg_robbers',
        name: '劫修拦路',
        category: 'battle',
        text: '四名劫修从断墙后现身，为首的拔刀喝你留下储物袋。你把刀迎了上去。',
        reward: {
          stones: [350, 660],
          items: [{ category: '灵材', types: ['骨材', '金属'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'kg_pack',
        name: '兽群',
        category: 'battle',
        text: '一群被血气养惯了的妖兽围上来，你踩着枯骨且战且退，把它们一头头留下。',
        reward: {
          stones: [440, 880],
          items: [{ category: '灵材', types: ['骨材'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'kg_boss',
        name: '妖兽头目',
        category: 'battle',
        text: '一头三阶妖兽盘踞在战场的中心，骨甲上还嵌着旧箭。你与它缠斗半日，终于斩落。',
        reward: {
          stones: [530, 1050],
          items: [{ category: '灵材', types: ['骨材'], count: [2, 3], tierPolicy: 'high' }]
        }
      },
      // —— 奇遇 2（古修洞府固定 1%）——
      {
        id: 'kg_cave',
        name: '古修洞府',
        category: 'adventure',
        fixedWeightPct: 1,
        text: '战场中央塌下一个深坑，底下竟是一座未被掘过的古修洞府，石台上宝匣静置，灵光未散。',
        reward: {
          stones: [1100, 1830],
          items: [{ category: '灵材', types: ['金属', '宝晶', '灵土', '灵木'], count: [1, 2], tierPolicy: 'mixed' }],
          fragment: { chance: 0.2, amount: [1, 1] },
          chest: true
        }
      },
      {
        id: 'kg_stele',
        name: '无字石碑',
        category: 'adventure',
        text: '战场最深处立着一块无字石碑，碑身被血浸成了暗红。你以灵力探入，碑中浮起一篇心法残篇。',
        textMiss: '战场最深处立着一块无字石碑，碑身被血浸成了暗红。你以灵力探入，碑中字痕早已散尽，只余几页残篇。',
        reward: {
          stones: [0, 0],
          art: { chance: 1, kind: 'heart_fragment' }
        }
      },
      // —— 叙事 2 ——
      {
        id: 'kg_caravan',
        name: '商队遇劫',
        category: 'narrative',
        text: '一支绕行战场的商队被劫修围住，护卫死伤过半，货主隔着车阵朝你大喊求救。',
        narrative: {
          autoChoice: 'help',
          options: [
            {
              id: 'help',
              label: '相助',
              text: '你从侧翼杀入，劫修一哄而散。货主拜谢再三，硬塞给你一袋灵石。',
              reward: {
                stones: [180, 350],
                fragment: { chance: 0.1, amount: [1, 1] }
              }
            },
            { id: 'leave', label: '离开', text: '你绕开战场走了。身后传来车辕断裂的声响，很快就听不见了。' }
          ]
        }
      },
      {
        id: 'kg_feud',
        name: '仇家追杀',
        category: 'narrative',
        text: '一名修士浑身是血地撞进你面前，说身后有仇家追了三日，求你替他挡一挡。',
        narrative: {
          autoChoice: 'help',
          options: [
            {
              id: 'help',
              label: '相助',
              text: '你替他在断墙后藏了半日，追兵过去了。他把随身的一半灵石给了你。',
              reward: {
                stones: [180, 350],
                fragment: { chance: 0.1, amount: [1, 1] }
              }
            },
            { id: 'leave', label: '离开', text: '你说自己还有事，绕开了。他愣了一瞬，转身往风沙里跑去。' }
          ]
        }
      }
    ]
  },
  {
    id: 'dihuo_duanya',
    name: '地火断崖',
    description: '妖兽地界深处，地火自崖底涌出的断崖，热气常年不散，崖壁上的灵材都经了火淬。',
    minLevel: 20,
    highTierChance: 0.9,
    elementBias: { metal: 17, wood: 17, water: 17, fire: 32, earth: 17 },
    eventTendencies: ['灵石', '残页', '功法', '宝匣 1%'],
    events: [
      // —— 空包 2 ——
      {
        id: 'dh_shelter',
        name: '避雨打坐',
        category: 'nothing',
        text: '烟气把天遮成了暗红，你退回崖洞避火，闭目打坐，直到崖底的轰鸣渐弱。',
        reward: {}
      },
      {
        id: 'dh_nothing',
        name: '一无所获',
        category: 'nothing',
        text: '断崖上除了裂缝就是热风，你走了半日，什么也没找到。',
        reward: {}
      },
      // —— 采集·灵植 2 ——
      {
        id: 'dh_herb',
        name: '发现灵植',
        category: 'gatherHerb',
        text: '崖缝里长出一株{灵植名}，被地火熏得叶缘焦黑，药性却比别处更足。',
        reward: {
          stones: [0, 420],
          items: [{ category: '灵植', types: ['草', '花'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'dh_tea',
        name: '灵茶园',
        category: 'gatherHerb',
        // 叶属于灵材；池子里「叶」找不到同阶时换同阶花/果
        text: '断崖背风处竟有一片野茶树，叶背泛红，是地火养出的{灵叶名}，你采了一兜。',
        reward: {
          stones: [0, 420],
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
        id: 'dh_mine',
        name: '废弃矿洞',
        category: 'gatherMaterial',
        text: '断崖半腰有一处被火气熏黑的矿洞，你在洞壁上撬下几块{灵材名}。',
        reward: {
          stones: [100, 420],
          items: [{ category: '灵材', types: ['金属', '宝晶', '灵土'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'dh_crystal',
        name: '宝晶矿',
        category: 'gatherMaterial',
        text: '崖壁裂处透出赤红的光，是一脉被地火煅过的宝晶，你贴着岩面凿下{宝晶名}。',
        reward: {
          stones: [100, 420],
          items: [{ category: '灵材', types: ['宝晶'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      // —— 拾遗 3 ——
      {
        id: 'dh_pouch',
        name: '储物袋',
        category: 'pickup',
        text: '崖边歪着一具被烤焦的尸首，腰间储物袋还完好，你解下来，里面有灵石和半卷残页。',
        textMiss: '崖边歪着一具被烤焦的尸首，腰间储物袋还完好，你解下来，里面只剩灵石。',
        reward: {
          stones: [260, 610],
          fragment: { chance: 0.005, amount: [1, 1] }
        }
      },
      {
        id: 'dh_artifact',
        name: '遗失法器',
        category: 'pickup',
        text: '热风把一件法器吹落在岩缝里，你拾起来，器身烧得发黑，底材却还完整。',
        textMiss: '热风把一件法器吹落在岩缝里，你拾起来，器身烧得发黑，一碰就散了。',
        reward: {
          stones: [260, 610],
          items: [{
            category: '灵材',
            types: ['金属'],
            count: [1, 1],
            chance: 0.5,
            tierPolicy: 'low'
          }],
          fragment: { chance: 0.1, amount: [1, 1] }
        }
      },
      {
        id: 'dh_rubble',
        name: '遗迹残片',
        category: 'pickup',
        text: '断崖下埋着半间石室，你在灰烬里翻出几片带字的残页，边缘已被烧卷。',
        reward: {
          stones: [260, 610],
          fragment: { chance: 1, amount: [2, 2] }
        }
      },
      // —— 战斗 3 ——
      {
        id: 'dh_robbers',
        name: '劫修拦路',
        category: 'battle',
        text: '两名劫修守在断崖唯一的窄道上，见你上来便亮了兵器。你先把窄道夺了过来。',
        reward: {
          stones: [420, 790],
          items: [{ category: '灵材', types: ['骨材', '金属'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'dh_duel',
        name: '散修斗法波及',
        category: 'battle',
        // 战斗大类里唯一**无风险**的事件：只捡漏，不掷胜率
        noBattle: true,
        text: '两名散修在崖顶斗法，火光把半边天都映红了。你贴着岩壁绕开，等他们打完，捡了些散落的灵石。',
        reward: {
          stones: [260, 530]
        }
      },
      {
        id: 'dh_soul',
        name: '古兽残魂',
        category: 'battle',
        text: '地火的裂缝里游出一缕古兽残魂，赤目如炬。你以灵力将它打散，魂散处留下一枚兽核。',
        reward: {
          stones: [530, 1050],
          items: [{ category: '灵材', types: ['骨材'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      // —— 奇遇 4（古修洞府固定 1%）——
      {
        id: 'dh_cave',
        name: '古修洞府',
        category: 'adventure',
        fixedWeightPct: 1,
        text: '地火在崖底烧穿了一层石壁，露出后面的古修洞府。石室中宝匣静置，火光照得灵纹流转。',
        reward: {
          stones: [1300, 2200],
          items: [{ category: '灵材', types: ['金属', '宝晶', '灵土', '灵木'], count: [1, 2], tierPolicy: 'mixed' }],
          fragment: { chance: 0.2, amount: [1, 1] },
          chest: true
        }
      },
      {
        id: 'dh_stele',
        name: '无字石碑',
        category: 'adventure',
        text: '断崖最高处立着一块无字石碑，地火在碑下烧了不知多少年。你以灵力探入，碑中浮起一篇心法残篇。',
        textMiss: '断崖最高处立着一块无字石碑，地火在碑下烧了不知多少年。你以灵力探入，碑中只剩几页残篇。',
        reward: {
          stones: [0, 0],
          art: { chance: 1, kind: 'heart_fragment' }
        }
      },
      {
        id: 'dh_sigil',
        name: '传承印记',
        category: 'adventure',
        text: '火痕最深处的岩台上嵌着一枚传承印记，你触之，一道完整的功法诀要入脑。',
        textMiss: '火痕最深处的岩台上嵌着一枚传承印记，你触之，印记早已被火气磨尽，只余几页残篇。',
        reward: {
          stones: [0, 0],
          art: { chance: 1, kind: 'other_art' }
        }
      },
      {
        id: 'dh_rift',
        name: '秘境入口',
        category: 'adventure',
        // ⚠ 设计硬规则：全池只有「古修洞府」给宝匣。
        text: '崖底的地火里裂开一道空间缝隙，像是通往某处秘境。热浪太盛，你不敢久留，只在边缘拾了些灵石。',
        reward: {
          stones: [880, 1750],
          fragment: { chance: 1, amount: [2, 2] }
        }
      },
      // —— 叙事 2 ——
      {
        id: 'dh_sect',
        name: '门派弟子盘问',
        category: 'narrative',
        text: '四名飞鹰门弟子守在断崖下，说此处地火异动，要盘查你的来历。',
        narrative: {
          autoChoice: 'help',
          options: [
            {
              id: 'help',
              label: '配合',
              text: '你如实说明来意，又把方才看见的异动指给他们。领头的弟子拱拱手，放你过去。',
              reward: {
                stones: [210, 420],
                fragment: { chance: 0.1, amount: [1, 1] }
              }
            },
            { id: 'leave', label: '离开', text: '你懒得多说，转身从另一侧的岩道绕上去。身后传来几句呵斥，也没人追。' }
          ]
        }
      },
      {
        id: 'dh_rogue',
        name: '散修求助',
        category: 'narrative',
        text: '一名散修被地火燎去了半边面容，趴在崖道上求你就救。',
        narrative: {
          autoChoice: 'help',
          options: [
            {
              id: 'help',
              label: '相助',
              text: '你把随身灵草敷在他脸上，又背他下了崖。他喘过气来，把藏在石缝里的灵石指给你。',
              reward: {
                stones: [210, 420],
                fragment: { chance: 0.1, amount: [1, 1] }
              }
            },
            { id: 'leave', label: '离开', text: '你看了看那张脸，摇了摇头。崖道很窄，你侧身走了过去。' }
          ]
        }
      }
    ]
  },
  // ==================== 金丹四图（2026-11-06 B16） ====================
  // 真源《探索系统》§2.2 / §6.9~6.12。结构逐条照抄筑基四图（§6.5~6.8），
  // 只换地名、文案；解锁 21 / 24 / 27 / 30，段内高阶 0 / 30 / 60 / 90%。
  // 灵石区间 = **筑基图同位置 × 3**（`realmCoefAt(21/24/27/30)/realmCoefAt(11/14/17/20)`），
  //   等价于 × realmCoefAt(minLevel)/realmCoefAt(9) = 6.59 / 8.78 / 10.98 / 13.17。
  //   ⚠ 2026-11-06 草稿里按 2.2 / 2.9 / 3.7 / 4.4（筑基段系数）填的占位值偏低约 27%，已按此重算。
  {
    id: 'siwang_zhaoze',
    name: '死亡沼泽',
    description: '南疆边缘的广袤沼泽，水体呈黑色、恶臭，生灵难以存活。腐木与黑水之间，偶有灵物生长。',
    minLevel: 21,
    highTierChance: 0,
    elementBias: { metal: 18, wood: 18, water: 28, fire: 18, earth: 18 },
    eventTendencies: ['灵植', '灵材', '毒物'],
    events: [
      // —— 空包 4 ——
      {
        id: 'sw_shelter',
        name: '避雨打坐',
        category: 'nothing',
        text: '瘴气漫上来，你撑起灵力护罩，闭目调息。半日过去，护罩上凝了一层黑露。',
        reward: {}
      },
      {
        id: 'sw_nothing',
        name: '一无所获',
        category: 'nothing',
        text: '神识铺开，方圆百里尽是腐木黑水，没有一样值得你出手的东西。',
        reward: {}
      },
      {
        id: 'sw_lost',
        name: '迷路',
        category: 'nothing',
        text: '沼泽的路在你脚下自己会变。你走了一日，最后发现还在原地。',
        reward: {}
      },
      {
        id: 'sw_chat',
        name: '路人闲聊',
        category: 'nothing',
        text: '一名采药人远远看见你，扔下药篓就跪。你摆摆手，他连滚带爬地跑了。',
        reward: {}
      },
      // —— 采集·灵植 3 ——
      {
        id: 'sw_herb',
        name: '发现灵植',
        category: 'gatherHerb',
        text: '腐木上生着一丛{灵植名}，根须扎进烂泥，叶脉却泛着青光。你隔空一引，连根拔起。',
        reward: {
          stones: [0, 630],
          items: [{ category: '灵植', types: ['草', '花'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'sw_orchard',
        name: '灵果园',
        category: 'gatherHerb',
        text: '一株野果树泡在黑水里，果子却红得发亮。你袖袍一拂，{灵果名}尽数落入掌心。',
        reward: {
          stones: [0, 630],
          items: [{ category: '灵材', types: ['果'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'sw_flower',
        name: '灵花丛',
        category: 'gatherHerb',
        text: '泥沼深处开着一片{灵花名}，花瓣莹白，不沾半点污泥。你掐了个诀，整片采下。',
        reward: {
          stones: [0, 630],
          items: [{ category: '灵材', types: ['花'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      // —— 采集·灵材 2 ——
      {
        id: 'sw_mine',
        name: '废弃矿洞',
        category: 'gatherMaterial',
        text: '沼泽底下沉着一座废弃矿洞，你破开泥层下去，从积水里捞出几块{灵材名}。',
        reward: {
          stones: [150, 630],
          items: [{ category: '灵材', types: ['金属', '宝晶', '灵土'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'sw_soil',
        name: '发现灵土',
        category: 'gatherMaterial',
        text: '一处黑泥泛着幽幽青光，是浸了不知多少年灵气的{灵土名}。你以灵力裹住，收了一袋。',
        reward: {
          stones: [150, 630],
          items: [{ category: '灵材', types: ['灵土'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      // —— 拾遗 2 ——
      {
        id: 'sw_pouch',
        name: '储物袋',
        category: 'pickup',
        text: '一具半沉在泥里的修士尸首，储物袋还挂着。你挑起来，倒出灵石和半卷残页。',
        textMiss: '一具半沉在泥里的修士尸首，储物袋还挂着。你挑起来，只倒出些灵石。',
        reward: {
          stones: [390, 930],
          fragment: { chance: 0.005, amount: [1, 1] }
        }
      },
      {
        id: 'sw_camp',
        name: '废弃营地',
        category: 'pickup',
        text: '一处被沼泽吞了一半的营地，帐篷早烂了。你在泥里翻出几块灵石和一捆{灵材名}。',
        textMiss: '一处被沼泽吞了一半的营地，帐篷早烂了。你在泥里翻出几块灵石。',
        reward: {
          stones: [390, 930],
          items: [{ category: '灵材', types: ['灵木', '金属'], count: [0, 1], tierPolicy: 'low' }],
          fragment: { chance: 0.1, amount: [1, 1] }
        }
      },
      // —— 战斗 2 ——
      {
        id: 'sw_snake',
        name: '妖兽袭击',
        category: 'battle',
        text: '一头三阶毒蟒从泥里窜出，獠牙还没张开，你抬手一道剑气，蟒头已经落了地。',
        reward: {
          stones: [630, 1200],
          items: [{ category: '灵材', types: ['骨材'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'sw_swarm',
        name: '毒虫群',
        category: 'battle',
        text: '腐叶下涌出一片瘴虫，黑压压地扑上来。你袖袍一挥，虫群在护罩外炸成一片黑雾。',
        reward: {
          stones: [780, 1590],
          items: [{ category: '灵材', types: ['骨材'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      // —— 奇遇 1 ——
      {
        id: 'sw_spring',
        name: '灵泉',
        category: 'adventure',
        text: '沼泽最深处竟有一眼灵泉，泉水清澈得不像人间。泉底沉着几株{灵植名}，你俯身捞起。',
        reward: {
          stones: [900, 1680],
          items: [{ category: '灵植', types: ['草', '花'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      // —— 叙事 2 ——
      {
        id: 'sw_herbalist',
        name: '采药人求救',
        category: 'narrative',
        text: '一名采药人陷进泥沼，只剩半截身子，见你落下，喊得嗓子都哑了。',
        narrative: {
          autoChoice: 'help',
          options: [
            {
              id: 'help',
              label: '相助',
              text: '你伸手一抓，把他从泥里提了出来。他缓过气，掏出贴身带的灵石相谢。',
              reward: {
                stones: [330, 630],
                fragment: { chance: 0.1, amount: [1, 1] }
              }
            },
            { id: 'leave', label: '离开', text: '你看了他一眼，摇了摇头。泥沼很快就把那点动静吞了回去。' }
          ]
        }
      },
      {
        id: 'sw_refugees',
        name: '流民求带路',
        category: 'narrative',
        text: '一队流民被困在沼泽边缘，进退不得，看见你从天而降，齐齐跪了下来。',
        narrative: {
          autoChoice: 'help',
          options: [
            {
              id: 'help',
              label: '带路',
              text: '你袖袍一卷，托着他们掠过沼泽，落在官道上。他们磕头不止，凑出一袋灵石。',
              reward: {
                stones: [330, 630],
                fragment: { chance: 0.1, amount: [1, 1] }
              }
            },
            { id: 'leave', label: '离开', text: '你转身就走。身后传来哭声，很快被瘴气盖住了。' }
          ]
        }
      }
    ]
  },
  {
    id: 'heihe_fang',
    name: '黑河坊',
    description: '黑河航道上的十字路口，散修与商队往来不绝。金丹修士在此是大人物，但坊市里鱼龙混杂。',
    minLevel: 24,
    highTierChance: 0.3,
    elementBias: { metal: 28, wood: 18, water: 18, fire: 18, earth: 18 },
    eventTendencies: ['灵植', '灵材', '骨材', '战斗'],
    events: [
      // —— 空包 3 ——
      {
        id: 'hh_shelter',
        name: '避雨打坐',
        category: 'nothing',
        text: '雨落在河面上，你站在船头，雨珠还没近身就被护罩弹开。你闭目听雨，半日方睁眼。',
        reward: {}
      },
      {
        id: 'hh_nothing',
        name: '一无所获',
        category: 'nothing',
        text: '坊市里转了一圈，散修们卖的东西，没有一样入得了你的眼。',
        reward: {}
      },
      {
        id: 'hh_rest',
        name: '原地休整',
        category: 'nothing',
        text: '你在渡口租了一间静室，打坐一日。窗外人声鼎沸，与你无关。',
        reward: {}
      },
      // —— 采集·灵植 2 ——
      {
        id: 'hh_herb',
        name: '发现灵植',
        category: 'gatherHerb',
        text: '河心洲上生着一丛{灵植名}，你隔空一引，整丛连泥带水飞入手中。',
        reward: {
          stones: [0, 840],
          items: [{ category: '灵植', types: ['草', '花'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'hh_vine',
        name: '发现古藤',
        category: 'gatherHerb',
        text: '一株不知年岁的古藤从河堤垂进水里，你截了一段，藤心沁着水灵气。',
        reward: {
          stones: [0, 840],
          items: [{ category: '灵植', types: ['树', '草'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      // —— 采集·灵材 3 ——
      {
        id: 'hh_mine',
        name: '废弃矿洞',
        category: 'gatherMaterial',
        text: '河岸塌了半边，露出一处旧矿洞。你走进去，从积水里拣出几块{灵材名}。',
        reward: {
          stones: [210, 840],
          items: [{ category: '灵材', types: ['金属', '宝晶', '灵土'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'hh_bones',
        name: '骨材堆',
        category: 'gatherMaterial',
        text: '码头边堆着一座鱼骨山，是船家宰妖鱼留下的。你挑了几根成色好的{骨材名}。',
        reward: {
          stones: [210, 840],
          items: [{ category: '灵材', types: ['骨材'], count: [2, 3], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'hh_wood',
        name: '发现灵木',
        category: 'gatherMaterial',
        text: '一截沉船木横在浅滩上，泡了几十年还没朽，你截下一段{灵木名}。',
        reward: {
          stones: [210, 840],
          items: [{ category: '灵材', types: ['灵木'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      // —— 拾遗 2 ——
      {
        id: 'hh_pouch',
        name: '储物袋',
        category: 'pickup',
        text: '渡口的烂泥里埋着一只储物袋，你挑起一看，里面是灵石和半张残页。',
        textMiss: '渡口的烂泥里埋着一只储物袋，你挑起一看，里面只剩灵石。',
        reward: {
          stones: [540, 1230],
          fragment: { chance: 0.005, amount: [1, 1] }
        }
      },
      {
        id: 'hh_corpse',
        name: '尸体',
        category: 'pickup',
        text: '一具散修尸首漂在岸边，怀里还护着一只钱袋。你拾起来，替他合上眼。',
        textMiss: '一具散修尸首漂在岸边，怀里的钱袋早被人摸走了，只剩散落的灵石。',
        reward: {
          stones: [540, 1230],
          fragment: { chance: 0.1, amount: [1, 1] }
        }
      },
      // —— 战斗 3 ——
      {
        id: 'hh_beast',
        name: '妖兽袭击',
        category: 'battle',
        text: '一头河妖从水里翻上来，鳞甲泛着青光。你抬手一压，它被按回河底。',
        reward: {
          stones: [840, 1590],
          items: [{ category: '灵材', types: ['骨材'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'hh_wolves',
        name: '野兽袭击',
        category: 'battle',
        text: '三头水狼结伴蹿上码头，你抬手一道剑气，三头齐齐栽进水里。',
        reward: {
          stones: [840, 1590],
          items: [{ category: '灵材', types: ['骨材'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'hh_pack',
        name: '兽群',
        category: 'battle',
        text: '一群妖鱼跃出水面，黑压压地扑向渡船。你剑光一扫，河面浮起一片白肚。',
        reward: {
          stones: [1050, 2100],
          items: [{ category: '灵材', types: ['骨材'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      // —— 奇遇 2 ——
      {
        id: 'hh_spring',
        name: '灵泉',
        category: 'adventure',
        text: '河底涌出一眼灵泉，泉水清冽，河沙底下沉着几株{灵植名}。你俯身捞起。',
        reward: {
          stones: [1200, 2250],
          items: [{ category: '灵植', types: ['草', '花'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'hh_relic',
        name: '古修遗蜕',
        category: 'adventure',
        text: '旧码头底下埋着半具古修遗骸，指骨间还捏着东西。你取出来，是{灵材名}和半张残页。',
        textMiss: '旧码头底下埋着半具古修遗骸，指骨间还捏着东西。你取出来，是{灵材名}。',
        reward: {
          stones: [1320, 2640],
          items: [{ category: '灵材', types: ['金属', '宝晶', '灵木'], count: [1, 2], tierPolicy: 'mixed' }],
          fragment: { chance: 0.1, amount: [1, 1] }
        }
      },
      // —— 叙事 2 ——
      {
        id: 'hh_herbalist',
        name: '采药人求救',
        category: 'narrative',
        text: '一名采药人在渡口被人打断腿，抢了药篓，趴在雨里动弹不得。',
        narrative: {
          autoChoice: 'help',
          options: [
            {
              id: 'help',
              label: '相助',
              text: '你弹出一缕灵力，替他把断骨接上。他哆嗦着摸出藏着的灵石，全塞给了你。',
              reward: {
                stones: [420, 840],
                fragment: { chance: 0.1, amount: [1, 1] }
              }
            },
            { id: 'leave', label: '离开', text: '你从他身边走过去。雨下得很大，身后的声音很快就没了。' }
          ]
        }
      },
      {
        id: 'hh_rogue',
        name: '散修求助',
        category: 'narrative',
        text: '一名散修被人追债，躲在货堆后面，见你落下，扑出来求你庇护。',
        narrative: {
          autoChoice: 'help',
          options: [
            {
              id: 'help',
              label: '相助',
              text: '你往货堆前一站，追债的人看了你一眼，掉头就走。散修磕了个头，捧出灵石。',
              reward: {
                stones: [420, 840],
                fragment: { chance: 0.1, amount: [1, 1] }
              }
            },
            { id: 'leave', label: '离开', text: '你说这事与你无关，转身入了坊市。身后的哀声被叫卖声盖住了。' }
          ]
        }
      }
    ]
  },
  {
    id: 'nankou_guan',
    name: '南口关',
    description: '醒狮谷南方的雄关，御兽门围绕此关建立了严密的防御体系。边境漫长，各节点均有元婴守望。',
    minLevel: 27,
    highTierChance: 0.6,
    elementBias: { metal: 28, wood: 18, water: 18, fire: 18, earth: 18 },
    eventTendencies: ['战斗', '骨材', '残页', '宝匣 1%'],
    events: [
      // —— 空包 3 ——
      {
        id: 'nk_shelter',
        name: '避雨打坐',
        category: 'nothing',
        text: '关墙上风大，你负手而立，风沙还没近身就被护罩挡开。你站了一夜，一动不动。',
        reward: {}
      },
      {
        id: 'nk_lost',
        name: '迷路',
        category: 'nothing',
        text: '关外的荒原一望无际，但神识铺开，哪里是路，哪里是绝地，一目了然。没什么可迷的。',
        reward: {}
      },
      {
        id: 'nk_weather',
        name: '天气突变',
        category: 'nothing',
        text: '兽潮预警的钟声响了三下，关墙上人影奔走。你抬头看了看，天边没什么异样。',
        reward: {}
      },
      // —— 采集·灵植 2 ——
      {
        id: 'nk_herb',
        name: '发现灵植',
        category: 'gatherHerb',
        text: '关墙根下生着一丛{灵植名}，被战火燎过几回，根还在，药性反而更烈。',
        reward: {
          stones: [0, 1050],
          items: [{ category: '灵植', types: ['草', '花'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'nk_field',
        name: '药田遗迹',
        category: 'gatherHerb',
        text: '关后一片被废弃的药田，田垄还整整齐齐，几株{灵植名}野化多年，长得极盛。',
        reward: {
          stones: [0, 1050],
          items: [{ category: '灵植', types: ['草', '花', '树'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      // —— 采集·灵材 3 ——
      {
        id: 'nk_mine',
        name: '废弃矿洞',
        category: 'gatherMaterial',
        text: '关下一处戍卒挖的矿洞，早废弃了。你走进去，从碎石里挑出几块{灵材名}。',
        reward: {
          stones: [270, 1050],
          items: [{ category: '灵材', types: ['金属', '宝晶', '灵土'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'nk_vein',
        name: '发现矿脉',
        category: 'gatherMaterial',
        text: '关外的山壁裂开一道缝，露出一条矿脉，你顺手撬了几块{灵材名}，成色不错。',
        reward: {
          stones: [270, 1050],
          items: [{ category: '灵材', types: ['宝晶', '金属'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'nk_battlefield',
        name: '古战场残骸',
        category: 'gatherMaterial',
        text: '关外的荒滩上散落着无数断兵枯骨，你走了一圈，拣出几件尚有灵性的{骨材名}。',
        reward: {
          stones: [270, 1050],
          items: [{ category: '灵材', types: ['骨材', '金属'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      // —— 拾遗 2 ——
      {
        id: 'nk_pouch',
        name: '储物袋',
        category: 'pickup',
        text: '一名战死的御兽门修士半埋在沙里，储物袋还在。你解下来，里面是灵石和半张残页。',
        textMiss: '一名战死的御兽门修士半埋在沙里，储物袋还在。你解下来，里面只剩灵石。',
        reward: {
          stones: [660, 1530],
          fragment: { chance: 0.005, amount: [1, 1] }
        }
      },
      {
        id: 'nk_rubble',
        name: '遗迹残片',
        category: 'pickup',
        text: '半截残碑立在关外，碑上的符文被风沙磨去了大半。你拓了一纸，算作残页。',
        reward: {
          stones: [660, 1530],
          fragment: { chance: 1, amount: [2, 2] }
        }
      },
      // —— 战斗 4 ——
      {
        id: 'nk_beast',
        name: '妖兽袭击',
        category: 'battle',
        text: '一头铁背妖狼从沙丘后扑出，还没落地，你一道剑气已经穿透了它的喉咙。',
        reward: {
          stones: [1050, 1980],
          items: [{ category: '灵材', types: ['骨材'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'nk_robbers',
        name: '劫修拦路',
        category: 'battle',
        text: '三名劫修拦在关道上，看清你的境界，转身就跑。你抬手一抓，钱袋飞入手中。',
        reward: {
          stones: [1050, 1980],
          items: [{ category: '灵材', types: ['骨材', '金属'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'nk_pack',
        name: '兽群',
        category: 'battle',
        text: '兽潮冲上关墙，黑压压一片。你一步跨出，剑气横扫，前排的妖兽齐齐倒下。',
        reward: {
          stones: [1320, 2640],
          items: [{ category: '灵材', types: ['骨材'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'nk_king',
        name: '妖兽头目',
        category: 'battle',
        text: '一头五阶兽王盘踞在关外，连御兽门都不敢轻动。你与它缠斗三日，终于斩落。',
        reward: {
          stones: [1590, 3150],
          items: [{ category: '灵材', types: ['骨材'], count: [2, 3], tierPolicy: 'high' }]
        }
      },
      // —— 奇遇 2（古修洞府固定 1%）——
      {
        id: 'nk_cave',
        name: '古修洞府',
        category: 'adventure',
        fixedWeightPct: 1,
        text: '关外荒丘下塌出一角石门，你推开进去，石室中灵光未散，案上摆着一只宝匣。',
        reward: {
          stones: [3300, 5490],
          items: [{ category: '灵材', types: ['金属', '宝晶', '灵土', '灵木'], count: [1, 2], tierPolicy: 'mixed' }],
          fragment: { chance: 0.2, amount: [1, 1] },
          chest: true
        }
      },
      {
        id: 'nk_stele',
        name: '无字石碑',
        category: 'adventure',
        text: '一块无字石碑立在风沙里，你以灵力探入，碑中浮起一篇心法残篇。',
        textMiss: '一块无字石碑立在风沙里，你以灵力探入，碑中字痕已散，只余几页残篇。',
        reward: {
          stones: [0, 0],
          art: { chance: 1, kind: 'heart_fragment' }
        }
      },
      // —— 叙事 2 ——
      {
        id: 'nk_caravan',
        name: '商队遇劫',
        category: 'narrative',
        text: '一支绕行关外的商队被劫修围住，护卫死伤过半，货主隔着车阵朝你大喊。',
        narrative: {
          autoChoice: 'help',
          options: [
            {
              id: 'help',
              label: '拔刀相助',
              text: '你从侧翼出手，劫修一哄而散。货主拜谢再三，硬塞给你一袋灵石。',
              reward: {
                stones: [540, 1050],
                fragment: { chance: 0.1, amount: [1, 1] }
              }
            },
            { id: 'leave', label: '绕道走开', text: '你绕开关道走了。身后传来车辕断裂的声响，很快就听不见了。' }
          ]
        }
      },
      {
        id: 'nk_enemy',
        name: '仇家追杀',
        category: 'narrative',
        text: '一名修士浑身是血地撞到你面前，说身后有仇家追了三日，求你挡一挡。',
        narrative: {
          autoChoice: 'help',
          options: [
            {
              id: 'help',
              label: '迎战',
              text: '你横杖挡在道中，追兵看了你一眼，退了。他喘匀了气，解下钱袋塞给你。',
              reward: {
                stones: [540, 1050],
                fragment: { chance: 0.1, amount: [1, 1] }
              }
            },
            { id: 'leave', label: '退开', text: '你侧身让过。那修士的眼神暗下去，脚步声很快消失在风沙里。' }
          ]
        }
      }
    ]
  },
  {
    id: 'xiaomoyuan',
    name: '小魔渊',
    description: '外海极东之处的深渊之下，魔气弥漫，鬼修、魂修、尸修、魔修聚集，是法外之地。',
    minLevel: 30,
    highTierChance: 0.9,
    elementBias: { metal: 18, wood: 18, water: 18, fire: 18, earth: 28 },
    eventTendencies: ['灵石', '残页', '功法', '宝匣 1%'],
    events: [
      // —— 空包 2 ——
      {
        id: 'xm_shelter',
        name: '避雨打坐',
        category: 'nothing',
        text: '魔气从深渊里涌上来，你撑起护罩，盘膝坐在崖边。半日过去，护罩外结了薄薄一层黑霜。',
        reward: {}
      },
      {
        id: 'xm_nothing',
        name: '一无所获',
        category: 'nothing',
        text: '深渊之下传来低语，你听了半日，什么也没听清，什么也没找到。',
        reward: {}
      },
      // —— 采集·灵植 2 ——
      {
        id: 'xm_herb',
        name: '发现灵植',
        category: 'gatherHerb',
        text: '崖缝里长出一株{灵植名}，叶脉泛黑，药性却比别处更烈。你隔空一引，连根拔起。',
        reward: {
          stones: [0, 1260],
          items: [{ category: '灵植', types: ['草', '花'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'xm_tea',
        name: '灵茶园',
        category: 'gatherHerb',
        // 叶属于灵材；池子里「叶」找不到同阶时换同阶花/果
        text: '崖背风处有一片野茶树，叶背泛黑，是魔气养出的{灵叶名}。你袖袍一拂，采了一兜。',
        reward: {
          stones: [0, 1260],
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
        id: 'xm_mine',
        name: '废弃矿洞',
        category: 'gatherMaterial',
        text: '深渊半腰有一处被魔气熏黑的矿洞，你在洞壁上撬下几块{灵材名}。',
        reward: {
          stones: [300, 1260],
          items: [{ category: '灵材', types: ['金属', '宝晶', '灵土'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'xm_crystal',
        name: '宝晶矿',
        category: 'gatherMaterial',
        text: '崖壁裂缝里透出幽紫色的光，是一脉被魔气浸过的宝晶。你贴着岩面凿下{宝晶名}。',
        reward: {
          stones: [300, 1260],
          items: [{ category: '灵材', types: ['宝晶'], count: [1, 2], tierPolicy: 'mixed' }]
        }
      },
      // —— 拾遗 3 ——
      {
        id: 'xm_pouch',
        name: '储物袋',
        category: 'pickup',
        text: '崖边歪着一具被魔气侵蚀的修士尸首，储物袋还完好。你解下来，里面是灵石和残页。',
        textMiss: '崖边歪着一具被魔气侵蚀的修士尸首，储物袋还完好。你解下来，里面只剩灵石。',
        reward: {
          stones: [780, 1830],
          fragment: { chance: 0.005, amount: [1, 1] }
        }
      },
      {
        id: 'xm_artifact',
        name: '遗失法器',
        category: 'pickup',
        text: '一件法器落在岩缝里，器身泛着魔纹。你拾起来看了看，底材还完整。',
        textMiss: '一件法器落在岩缝里，器身泛着魔纹。你拾起来看了看，一碰就散了。',
        reward: {
          stones: [780, 1830],
          items: [{
            category: '灵材',
            types: ['金属'],
            count: [1, 1],
            chance: 0.5,
            tierPolicy: 'low'
          }],
          fragment: { chance: 0.1, amount: [1, 1] }
        }
      },
      {
        id: 'xm_rubble',
        name: '遗迹残片',
        category: 'pickup',
        text: '深渊底下埋着半间石室，你在灰烬里翻出几片带魔纹的残页。',
        reward: {
          stones: [780, 1830],
          fragment: { chance: 1, amount: [2, 2] }
        }
      },
      // —— 战斗 3 ——
      {
        id: 'xm_robbers',
        name: '魔修拦路',
        category: 'battle',
        text: '三名魔修从暗处闪出，说要借你的储物袋一用。你没答话，剑已经出了鞘。',
        reward: {
          stones: [1260, 2370],
          items: [{ category: '灵材', types: ['骨材', '金属'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      {
        id: 'xm_duel',
        name: '鬼修斗法波及',
        category: 'battle',
        // 战斗大类里唯一**无风险**的事件：只捡漏，不掷胜率
        noBattle: true,
        text: '一名鬼修与一名尸修在崖顶斗法，阴气冲天。你远远绕开，等他们打完，捡了些散落的灵石。',
        reward: {
          stones: [780, 1590]
        }
      },
      {
        id: 'xm_soul',
        name: '古兽残魂',
        category: 'battle',
        text: '深渊裂缝里游出一缕残魂，赤目如炬，是魂修驱使的。你以灵力将它打散，魂散处留下一枚兽核。',
        reward: {
          stones: [1590, 3150],
          items: [{ category: '灵材', types: ['骨材'], count: [1, 1], tierPolicy: 'mixed' }]
        }
      },
      // —— 奇遇 4（古修洞府固定 1%）——
      {
        id: 'xm_cave',
        name: '古修洞府',
        category: 'adventure',
        fixedWeightPct: 1,
        text: '魔气在崖底侵蚀穿了一层石壁，露出后面的古修洞府。石室中宝匣静置，灵光流转。',
        reward: {
          stones: [3900, 6600],
          items: [{ category: '灵材', types: ['金属', '宝晶', '灵土', '灵木'], count: [1, 2], tierPolicy: 'mixed' }],
          fragment: { chance: 0.2, amount: [1, 1] },
          chest: true
        }
      },
      {
        id: 'xm_stele',
        name: '无字石碑',
        category: 'adventure',
        text: '断崖最高处立着一块无字石碑，魔气在碑下盘旋。你以灵力探入，碑中浮起一篇心法残篇。',
        textMiss: '断崖最高处立着一块无字石碑，魔气在碑下盘旋。你以灵力探入，碑中只剩几页残篇。',
        reward: {
          stones: [0, 0],
          art: { chance: 1, kind: 'heart_fragment' }
        }
      },
      {
        id: 'xm_sigil',
        name: '传承印记',
        category: 'adventure',
        text: '魔纹最深处的岩台上嵌着一枚传承印记，你触之，一道完整的功法诀要入脑。',
        textMiss: '魔纹最深处的岩台上嵌着一枚传承印记，你触之，印记已被魔气磨尽，只余几页残篇。',
        reward: {
          stones: [0, 0],
          art: { chance: 1, kind: 'other_art' }
        }
      },
      {
        id: 'xm_rift',
        name: '秘境入口',
        category: 'adventure',
        // ⚠ 设计硬规则：全池只有「古修洞府」给宝匣。
        text: '崖底裂开一道空间缝隙，像是通往某处秘境。魔气太盛，你不敢久留，只在边缘拾了些灵石。',
        reward: {
          stones: [2640, 5250],
          fragment: { chance: 1, amount: [2, 2] }
        }
      },
      // —— 叙事 2 ——
      {
        id: 'xm_sect',
        name: '魔修盘问',
        category: 'narrative',
        text: '三名魔修拦住你，问你来小魔渊做什么，是买货还是寻仇。',
        narrative: {
          autoChoice: 'help',
          options: [
            {
              id: 'help',
              label: '配合',
              text: '你说了来意，又顺手报了个在深渊里混得开的名字。领头的魔修拱拱手，让开了道。',
              reward: {
                stones: [630, 1260],
                fragment: { chance: 0.1, amount: [1, 1] }
              }
            },
            { id: 'leave', label: '隐瞒', text: '你懒得答话，径直往前走。身后传来几句嘀咕，也没人敢追。' }
          ]
        }
      },
      {
        id: 'xm_rogue',
        name: '散修求助',
        category: 'narrative',
        text: '一名散修被魔修追杀了三日，躲在岩缝里，见你落下，扑出来求你救命。',
        narrative: {
          autoChoice: 'help',
          options: [
            {
              id: 'help',
              label: '相助',
              text: '你弹出一缕灵力，替他封住伤势，又挡了一记追来的魔气。他捧出灵石相谢。',
              reward: {
                stones: [630, 1260],
                fragment: { chance: 0.1, amount: [1, 1] }
              }
            },
            { id: 'leave', label: '离开', text: '你看了他一眼，摇了摇头。岩缝很窄，你侧身走了过去。' }
          ]
        }
      }
    ]
  }
]

/**
 * 子嗣历练的简化大类权重（《探索系统》§七，2026-10-20 拍板）。
 *
 * 去掉奇遇 5 + 叙事 5 后，剩余 90 点**按比例归一**到 100：
 *   空包 35→38.9、采植 20→22.2、采材 10→11.1、战斗 15→16.7、拾遗 10→11.1。
 * 取整为 39 / 22 / 11 / 17 / 11，合计 100。
 *
 * ⚠ 子嗣历练**不触发宝匣**（古修洞府属奇遇，已被移出池子）；
 *   这是 §七.1 的定稿，报告模板里的「2 阶宝匣 ×2」已作废。
 */
export const CHILD_CATEGORY_WEIGHTS = Object.freeze({
  nothing: 39,
  gatherHerb: 22,
  gatherMaterial: 11,
  battle: 17,
  pickup: 11
})

/** 子嗣历练只走这五类，顺序固定（与 CHILD_CATEGORY_WEIGHTS 对齐） */
export const CHILD_CATEGORY_ORDER = Object.freeze([
  'nothing',
  'gatherHerb',
  'gatherMaterial',
  'battle',
  'pickup'
])

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
const buildWeightTable = (location, weights, order) => {
  const events = location?.events || []
  const groups = new Map()
  for (const event of events) {
    if (!groups.has(event.category)) groups.set(event.category, [])
    groups.get(event.category).push(event)
  }

  const table = []
  for (const category of order) {
    const group = groups.get(category) || []
    if (!group.length) continue
    const total = weights[category]

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

export const eventWeightTable = location =>
  buildWeightTable(location, CATEGORY_WEIGHTS, CATEGORY_ORDER)

/** 子嗣历练专用：五类简化池（无奇遇/叙事，也不产宝匣） */
export const childEventWeightTable = location =>
  buildWeightTable(location, CHILD_CATEGORY_WEIGHTS, CHILD_CATEGORY_ORDER)
