# 金丹四图 · `locations.js` 数据结构（草稿）

> 文案已按确认稿填入。**灵石区间是占位值**（按筑基四图同构比例放大），等 `realmCoefAt(21/24/27/30)` 实际值确认后调整。

> 物品阶、tierPolicy、事件分布、奇遇固定权重全部照抄筑基四图。

---

## 一、死亡沼泽（21 层，16 条）

```js
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

id: 'sw_shelter', name: '避雨打坐', category: 'nothing',

text: '瘴气漫上来，你撑起灵力护罩，闭目调息。半日过去，护罩上凝了一层黑露。',

reward: {}

},

{

id: 'sw_nothing', name: '一无所获', category: 'nothing',

text: '神识铺开，方圆百里尽是腐木黑水，没有一样值得你出手的东西。',

reward: {}

},

{

id: 'sw_lost', name: '迷路', category: 'nothing',

text: '沼泽的路在你脚下自己会变。你走了一日，最后发现还在原地。',

reward: {}

},

{

id: 'sw_chat', name: '路人闲聊', category: 'nothing',

text: '一名采药人远远看见你，扔下药篓就跪。你摆摆手，他连滚带爬地跑了。',

reward: {}

},

// —— 采集·灵植 3 ——

{

id: 'sw_herb', name: '发现灵植', category: 'gatherHerb',

text: '腐木上生着一丛{灵植名}，根须扎进烂泥，叶脉却泛着青光。你隔空一引，连根拔起。',

reward: {

stones: [0, 460], // 占位：筑基第1图 × 2.2

items: [{ category: '灵植', types: ['草', '花'], count: [1, 1], tierPolicy: 'mixed' }]

}

},

{

id: 'sw_orchard', name: '灵果园', category: 'gatherHerb',

text: '一株野果树泡在黑水里，果子却红得发亮。你袖袍一拂，{灵果名}尽数落入掌心。',

reward: {

stones: [0, 460],

items: [{ category: '灵材', types: ['果'], count: [1, 2], tierPolicy: 'mixed' }]

}

},

{

id: 'sw_flower', name: '灵花丛', category: 'gatherHerb',

text: '泥沼深处开着一片{灵花名}，花瓣莹白，不沾半点污泥。你掐了个诀，整片采下。',

reward: {

stones: [0, 460],

items: [{ category: '灵材', types: ['花'], count: [1, 2], tierPolicy: 'mixed' }]

}

},

// —— 采集·灵材 2 ——

{

id: 'sw_mine', name: '废弃矿洞', category: 'gatherMaterial',

text: '沼泽底下沉着一座废弃矿洞，你破开泥层下去，从积水里捞出几块{灵材名}。',

reward: {

stones: [0, 460],

items: [{ category: '灵材', types: ['金属', '宝晶', '灵土'], count: [1, 2], tierPolicy: 'mixed' }]

}

},

{

id: 'sw_soil', name: '发现灵土', category: 'gatherMaterial',

text: '一处黑泥泛着幽幽青光，是浸了不知多少年灵气的{灵土名}。你以灵力裹住，收了一袋。',

reward: {

stones: [0, 460],

items: [{ category: '灵材', types: ['灵土'], count: [1, 2], tierPolicy: 'mixed' }]

}

},

// —— 拾遗 2 ——

{

id: 'sw_pouch', name: '储物袋', category: 'pickup',

text: '一具半沉在泥里的修士尸首，储物袋还挂着。你挑起来，倒出灵石和半卷残页。',

textMiss: '一具半沉在泥里的修士尸首，储物袋还挂着。你挑起来，只倒出些灵石。',

reward: {

stones: [130, 310],

fragment: { chance: 0.005, amount: [1, 1] }

}

},

{

id: 'sw_camp', name: '废弃营地', category: 'pickup',

text: '一处被沼泽吞了一半的营地，帐篷早烂了。你在泥里翻出几块灵石和一捆{灵材名}。',

textMiss: '一处被沼泽吞了一半的营地，帐篷早烂了。你在泥里翻出几块灵石。',

reward: {

stones: [130, 310],

items: [{ category: '灵材', types: ['灵木', '金属'], count: [0, 1], tierPolicy: 'low' }],

fragment: { chance: 0.1, amount: [1, 1] }

}

},

// —— 战斗 2 ——

{

id: 'sw_snake', name: '妖兽袭击', category: 'battle',

text: '一头三阶毒蟒从泥里窜出，獠牙还没张开，你抬手一道剑气，蟒头已经落了地。',

reward: {

stones: [130, 310],

items: [{ category: '灵材', types: ['骨材'], count: [1, 1], tierPolicy: 'mixed' }]

}

},

{

id: 'sw_swarm', name: '毒虫群', category: 'battle',

text: '腐叶下涌出一片瘴虫，黑压压地扑上来。你袖袍一挥，虫群在护罩外炸成一片黑雾。',

reward: {

stones: [130, 310],

items: [{ category: '灵材', types: ['骨材'], count: [1, 1], tierPolicy: 'mixed' }]

}

},

// —— 奇遇 1 ——

{

id: 'sw_spring', name: '灵泉', category: 'adventure',

text: '沼泽最深处竟有一眼灵泉，泉水清澈得不像人间。泉底沉着几株{灵植名}，你俯身捞起。',

reward: {

stones: [130, 370],

items: [{ category: '灵植', types: ['草', '花'], count: [1, 2], tierPolicy: 'mixed' }]

}

},

// —— 叙事 2 ——

{

id: 'sw_herbalist', name: '采药人求救', category: 'narrative',

text: '一名采药人陷进泥沼，只剩半截身子，见你落下，喊得嗓子都哑了。',

narrative: {

autoChoice: 'help',

options: [

{

id: 'help', label: '相助',

text: '你伸手一抓，把他从泥里提了出来。他缓过气，掏出贴身带的灵石相谢。',

reward: {

stones: [60, 180],

fragment: { chance: 0.1, amount: [1, 1] }

}

},

{ id: 'leave', label: '离开', text: '你看了他一眼，摇了摇头。泥沼很快就把那点动静吞了回去。' }

]

}

},

{

id: 'sw_refugees', name: '流民求带路', category: 'narrative',

text: '一队流民被困在沼泽边缘，进退不得，看见你从天而降，齐齐跪了下来。',

narrative: {

autoChoice: 'help',

options: [

{

id: 'help', label: '带路',

text: '你袖袍一卷，托着他们掠过沼泽，落在官道上。他们磕头不止，凑出一袋灵石。',

reward: {

stones: [60, 180],

fragment: { chance: 0.1, amount: [1, 1] }

}

},

{ id: 'leave', label: '离开', text: '你转身就走。身后传来哭声，很快被瘴气盖住了。' }

]

}

}

]

}
```

---

## 二、黑河坊（24 层，17 条）

```js
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

id: 'hh_shelter', name: '避雨打坐', category: 'nothing',

text: '雨落在河面上，你站在船头，雨珠还没近身就被护罩弹开。你闭目听雨，半日方睁眼。',

reward: {}

},

{

id: 'hh_nothing', name: '一无所获', category: 'nothing',

text: '坊市里转了一圈，散修们卖的东西，没有一样入得了你的眼。',

reward: {}

},

{

id: 'hh_rest', name: '原地休整', category: 'nothing',

text: '你在渡口租了一间静室，打坐一日。窗外人声鼎沸，与你无关。',

reward: {}

},

// —— 采集·灵植 2 ——

{

id: 'hh_herb', name: '发现灵植', category: 'gatherHerb',

text: '河心洲上生着一丛{灵植名}，你隔空一引，整丛连泥带水飞入手中。',

reward: {

stones: [0, 620],

items: [{ category: '灵植', types: ['草', '花'], count: [1, 1], tierPolicy: 'mixed' }]

}

},

{

id: 'hh_vine', name: '发现古藤', category: 'gatherHerb',

text: '一株不知年岁的{灵藤名}从河堤垂进水里，你截了一段，藤心沁着水灵气。',

reward: {

stones: [0, 620],

items: [{ category: '灵植', types: ['藤'], count: [1, 1], tierPolicy: 'mixed' }]

}

},

// —— 采集·灵材 3 ——

{

id: 'hh_mine', name: '废弃矿洞', category: 'gatherMaterial',

text: '河岸塌了半边，露出一处旧矿洞。你走进去，从积水里拣出几块{灵材名}。',

reward: {

stones: [0, 620],

items: [{ category: '灵材', types: ['金属', '宝晶', '灵土'], count: [1, 2], tierPolicy: 'mixed' }]

}

},

{

id: 'hh_bones', name: '骨材堆', category: 'gatherMaterial',

text: '码头边堆着一座鱼骨山，是船家宰妖鱼留下的。你挑了几根成色好的{骨材名}。',

reward: {

stones: [0, 620],

items: [{ category: '灵材', types: ['骨材'], count: [1, 2], tierPolicy: 'mixed' }]

}

},

{

id: 'hh_wood', name: '发现灵木', category: 'gatherMaterial',

text: '一截沉船木横在浅滩上，泡了几十年还没朽，你截下一段{灵木名}。',

reward: {

stones: [0, 620],

items: [{ category: '灵材', types: ['灵木'], count: [1, 2], tierPolicy: 'mixed' }]

}

},

// —— 拾遗 2 ——

{

id: 'hh_pouch', name: '储物袋', category: 'pickup',

text: '渡口的烂泥里埋着一只储物袋，你挑起一看，里面是灵石和半张残页。',

textMiss: '渡口的烂泥里埋着一只储物袋，你挑起一看，里面只剩灵石。',

reward: {

stones: [340, 780],

fragment: { chance: 0.005, amount: [1, 1] }

}

},

{

id: 'hh_corpse', name: '尸体', category: 'pickup',

text: '一具散修尸首漂在岸边，怀里还护着一只钱袋。你拾起来，替他合上眼。',

reward: {

stones: [340, 780],

fragment: { chance: 0.1, amount: [1, 1] }

}

},

// —— 战斗 3 ——

{

id: 'hh_beast', name: '妖兽袭击', category: 'battle',

text: '一头河妖从水里翻上来，鳞甲泛着青光。你抬手一压，它被按回河底。',

reward: {

stones: [340, 780],

items: [{ category: '灵材', types: ['骨材'], count: [1, 1], tierPolicy: 'mixed' }]

}

},

{

id: 'hh_wolves', name: '野兽袭击', category: 'battle',

text: '三头水狼结伴蹿上码头，你抬手一道剑气，三头齐齐栽进水里。',

reward: {

stones: [340, 780],

items: [{ category: '灵材', types: ['骨材'], count: [1, 1], tierPolicy: 'mixed' }]

}

},

{

id: 'hh_pack', name: '兽群', category: 'battle',

text: '一群妖鱼跃出水面，黑压压地扑向渡船。你剑光一扫，河面浮起一片白肚。',

reward: {

stones: [480, 960],

items: [{ category: '灵材', types: ['骨材'], count: [1, 2], tierPolicy: 'mixed' }]

}

},

// —— 奇遇 2 ——

{

id: 'hh_spring', name: '灵泉', category: 'adventure',

text: '河底涌出一眼灵泉，泉水清冽，河沙底下沉着几株{灵植名}。你俯身捞起。',

reward: {

stones: [340, 960],

items: [{ category: '灵植', types: ['草', '花'], count: [1, 2], tierPolicy: 'mixed' }]

}

},

{

id: 'hh_relic', name: '古修遗蜕', category: 'adventure',

text: '旧码头底下埋着半具古修遗骸，指骨间还捏着东西。你取出来，是{灵材名}和半张残页。',

textMiss: '旧码头底下埋着半具古修遗骸，指骨间还捏着东西。你取出来，是{灵材名}。',

reward: {

stones: [480, 1120],

items: [{ category: '灵材', types: ['骨材', '金属', '宝晶'], count: [1, 1], tierPolicy: 'mixed' }],

fragment: { chance: 0.5, amount: [1, 1] }

}

},

// —— 叙事 2 ——

{

id: 'hh_herbalist', name: '采药人求救', category: 'narrative',

text: '一名采药人在渡口被人打断腿，抢了药篓，趴在雨里动弹不得。',

narrative: {

autoChoice: 'help',

options: [

{

id: 'help', label: '相助',

text: '你弹出一缕灵力，替他把断骨接上。他哆嗦着摸出藏着的灵石，全塞给了你。',

reward: {

stones: [160, 420],

fragment: { chance: 0.1, amount: [1, 1] }

}

},

{ id: 'leave', label: '离开', text: '你从他身边走过去。雨下得很大，身后的声音很快就没了。' }

]

}

},

{

id: 'hh_rogue', name: '散修求助', category: 'narrative',

text: '一名散修被人追债，躲在货堆后面，见你落下，扑出来求你庇护。',

narrative: {

autoChoice: 'help',

options: [

{

id: 'help', label: '相助',

text: '你往货堆前一站，追债的人看了你一眼，掉头就走。散修磕了个头，捧出灵石。',

reward: {

stones: [160, 420],

fragment: { chance: 0.1, amount: [1, 1] }

}

},

{ id: 'leave', label: '离开', text: '你说这事与你无关，转身入了坊市。身后的哀声被叫卖声盖住了。' }

]

}

}

]

}
```

---

## 三、南口关（27 层，18 条）

```js
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

id: 'nk_shelter', name: '避雨打坐', category: 'nothing',

text: '关墙上风大，你负手而立，风沙还没近身就被护罩挡开。你站了一夜，一动不动。',

reward: {}

},

{

id: 'nk_lost', name: '迷路', category: 'nothing',

text: '关外的荒原一望无际，但神识铺开，哪里是路，哪里是绝地，一目了然。没什么可迷的。',

reward: {}

},

{

id: 'nk_weather', name: '天气突变', category: 'nothing',

text: '兽潮预警的钟声响了三下，关墙上人影奔走。你抬头看了看，天边没什么异样。',

reward: {}

},

// —— 采集·灵植 2 ——

{

id: 'nk_herb', name: '发现灵植', category: 'gatherHerb',

text: '关墙根下生着一丛{灵植名}，被战火燎过几回，根还在，药性反而更烈。',

reward: {

stones: [0, 760],

items: [{ category: '灵植', types: ['草', '花'], count: [1, 1], tierPolicy: 'mixed' }]

}

},

{

id: 'nk_field', name: '药田遗迹', category: 'gatherHerb',

text: '关后一片被废弃的药田，田垄还整整齐齐，几株{灵植名}野化多年，长得极盛。',

reward: {

stones: [0, 760],

items: [{ category: '灵植', types: ['草', '花'], count: [1, 2], tierPolicy: 'mixed' }]

}

},

// —— 采集·灵材 3 ——

{

id: 'nk_mine', name: '废弃矿洞', category: 'gatherMaterial',

text: '关下一处戍卒挖的矿洞，早废弃了。你走进去，从碎石里挑出几块{灵材名}。',

reward: {

stones: [0, 760],

items: [{ category: '灵材', types: ['金属', '宝晶', '灵土'], count: [1, 2], tierPolicy: 'mixed' }]

}

},

{

id: 'nk_vein', name: '发现矿脉', category: 'gatherMaterial',

text: '关外的山壁裂开一道缝，露出一条矿脉，你顺手撬了几块{灵材名}，成色不错。',

reward: {

stones: [0, 760],

items: [{ category: '灵材', types: ['金属', '宝晶'], count: [1, 2], tierPolicy: 'mixed' }]

}

},

{

id: 'nk_battlefield', name: '古战场残骸', category: 'gatherMaterial',

text: '关外的荒滩上散落着无数断兵枯骨，你走了一圈，拣出几件尚有灵性的{骨材名}。',

reward: {

stones: [0, 760],

items: [{ category: '灵材', types: ['骨材'], count: [1, 2], tierPolicy: 'mixed' }]

}

},

// —— 拾遗 2 ——

{

id: 'nk_pouch', name: '储物袋', category: 'pickup',

text: '一名战死的御兽门修士半埋在沙里，储物袋还在。你解下来，里面是灵石和半张残页。',

textMiss: '一名战死的御兽门修士半埋在沙里，储物袋还在。你解下来，里面只剩灵石。',

reward: {

stones: [480, 1100],

fragment: { chance: 0.005, amount: [1, 1] }

}

},

{

id: 'nk_rubble', name: '遗迹残片', category: 'pickup',

text: '半截残碑立在关外，碑上的符文被风沙磨去了大半。你拓了一纸，算作残页。',

reward: {

stones: [480, 1100],

fragment: { chance: 1, amount: [1, 1] }

}

},

// —— 战斗 4 ——

{

id: 'nk_beast', name: '妖兽袭击', category: 'battle',

text: '一头铁背妖狼从沙丘后扑出，还没落地，你一道剑气已经穿透了它的喉咙。',

reward: {

stones: [480, 1100],

items: [{ category: '灵材', types: ['骨材'], count: [1, 1], tierPolicy: 'mixed' }]

}

},

{

id: 'nk_robbers', name: '劫修拦路', category: 'battle',

text: '三名劫修拦在关道上，看清你的境界，转身就跑。你抬手一抓，钱袋飞入手中。',

reward: {

stones: [720, 1440],

items: [{ category: '灵材', types: ['骨材', '金属'], count: [1, 1], tierPolicy: 'mixed' }]

}

},

{

id: 'nk_pack', name: '兽群', category: 'battle',

text: '兽潮冲上关墙，黑压压一片。你一步跨出，剑气横扫，前排的妖兽齐齐倒下。',

reward: {

stones: [720, 1200],

items: [{ category: '灵材', types: ['骨材'], count: [1, 2], tierPolicy: 'mixed' }]

}

},

{

id: 'nk_king', name: '妖兽头目', category: 'battle',

text: '一头五阶兽王盘踞在关外，连御兽门都不敢轻动。你与它缠斗三日，终于斩落。',

reward: {

stones: [1200, 2160],

items: [{ category: '灵材', types: ['骨材'], count: [2, 3], tierPolicy: 'high' }]

}

},

// —— 奇遇 2（古修洞府固定 1%）——

{

id: 'nk_cave', name: '古修洞府', category: 'adventure', fixedWeightPct: 1,

text: '关外荒丘下塌出一角石门，你推开进去，石室中灵光未散，案上摆着一只宝匣。',

reward: {

stones: [2400, 4000],

items: [{ category: '灵材', types: ['金属', '宝晶', '灵土', '灵木'], count: [1, 2], tierPolicy: 'mixed' }],

fragment: { chance: 0.2, amount: [1, 1] },

chest: true

}

},

{

id: 'nk_stele', name: '无字石碑', category: 'adventure',

text: '一块无字石碑立在风沙里，你以灵力探入，碑中浮起一篇心法残篇。',

textMiss: '一块无字石碑立在风沙里，你以灵力探入，碑中字痕已散，只余几页残篇。',

reward: {

stones: [0, 0],

art: { chance: 1, kind: 'heart_fragment' }

}

},

// —— 叙事 2 ——

{

id: 'nk_caravan', name: '商队遇劫', category: 'narrative',

text: '一支绕行关外的商队被劫修围住，护卫死伤过半，货主隔着车阵朝你大喊。',

narrative: {

autoChoice: 'help',

options: [

{

id: 'help', label: '拔刀相助',

text: '你从侧翼出手，劫修一哄而散。货主拜谢再三，硬塞给你一袋灵石。',

reward: {

stones: [240, 720],

fragment: { chance: 0.1, amount: [1, 1] }

}

},

{ id: 'leave', label: '绕道走开', text: '你绕开关道走了。身后传来车辕断裂的声响，很快就听不见了。' }

]

}

},

{

id: 'nk_enemy', name: '仇家追杀', category: 'narrative',

text: '一名修士浑身是血地撞到你面前，说身后有仇家追了三日，求你挡一挡。',

narrative: {

autoChoice: 'help',

options: [

{

id: 'help', label: '迎战',

text: '你横杖挡在道中，追兵看了你一眼，退了。他喘匀了气，解下钱袋塞给你。',

reward: {

stones: [240, 720],

fragment: { chance: 0.1, amount: [1, 1] }

}

},

{ id: 'leave', label: '退开', text: '你侧身让过。那修士的眼神暗下去，脚步声很快消失在风沙里。' }

]

}

}

]

}
```

---

## 四、小魔渊（30 层，18 条）

```js
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

id: 'xm_shelter', name: '避雨打坐', category: 'nothing',

text: '魔气从深渊里涌上来，你撑起护罩，盘膝坐在崖边。半日过去，护罩外结了薄薄一层黑霜。',

reward: {}

},

{

id: 'xm_nothing', name: '一无所获', category: 'nothing',

text: '深渊之下传来低语，你听了半日，什么也没听清，什么也没找到。',

reward: {}

},

// —— 采集·灵植 2 ——

{

id: 'xm_herb', name: '发现灵植', category: 'gatherHerb',

text: '崖缝里长出一株{灵植名}，叶脉泛黑，药性却比别处更烈。你隔空一引，连根拔起。',

reward: {

stones: [0, 880],

items: [{ category: '灵植', types: ['草', '花'], count: [1, 1], tierPolicy: 'mixed' }]

}

},

{

id: 'xm_tea', name: '灵茶园', category: 'gatherHerb',

text: '崖背风处有一片野茶树，叶背泛黑，是魔气养出的{灵叶名}。你袖袍一拂，采了一兜。',

reward: {

stones: [0, 880],

items: [{

category: '灵材', types: ['叶'], fallbackTypes: ['花', '果'],

count: [1, 2], tierPolicy: 'mixed'

}]

}

},

// —— 采集·灵材 2 ——

{

id: 'xm_mine', name: '废弃矿洞', category: 'gatherMaterial',

text: '深渊半腰有一处被魔气熏黑的矿洞，你在洞壁上撬下几块{灵材名}。',

reward: {

stones: [0, 880],

items: [{ category: '灵材', types: ['金属', '宝晶', '灵土'], count: [1, 2], tierPolicy: 'mixed' }]

}

},

{

id: 'xm_crystal', name: '宝晶矿', category: 'gatherMaterial',

text: '崖壁裂缝里透出幽紫色的光，是一脉被魔气浸过的宝晶。你贴着岩面凿下{宝晶名}。',

reward: {

stones: [0, 880],

items: [{ category: '灵材', types: ['宝晶'], count: [1, 2], tierPolicy: 'mixed' }]

}

},

// —— 拾遗 3 ——

{

id: 'xm_pouch', name: '储物袋', category: 'pickup',

text: '崖边歪着一具被魔气侵蚀的修士尸首，储物袋还完好。你解下来，里面是灵石和残页。',

textMiss: '崖边歪着一具被魔气侵蚀的修士尸首，储物袋还完好。你解下来，里面只剩灵石。',

reward: {

stones: [560, 1280],

fragment: { chance: 0.005, amount: [1, 1] }

}

},

{

id: 'xm_artifact', name: '遗失法器', category: 'pickup',

text: '一件法器落在岩缝里，器身泛着魔纹。你拾起来看了看，底材还完整。',

textMiss: '一件法器落在岩缝里，器身泛着魔纹。你拾起来看了看，一碰就散了。',

reward: {

stones: [560, 1280],

items: [{

category: '灵材', types: ['金属'], count: [1, 1], chance: 0.5, tierPolicy: 'low'

}],

fragment: { chance: 0.1, amount: [1, 1] }

}

},

{

id: 'xm_rubble', name: '遗迹残片', category: 'pickup',

text: '深渊底下埋着半间石室，你在灰烬里翻出几片带魔纹的残页。',

reward: {

stones: [560, 1280],

fragment: { chance: 1, amount: [2, 2] }

}

},

// —— 战斗 3 ——

{

id: 'xm_robbers', name: '魔修拦路', category: 'battle',

text: '三名魔修从暗处闪出，说要借你的储物袋一用。你没答话，剑已经出了鞘。',

reward: {

stones: [880, 1680],

items: [{ category: '灵材', types: ['骨材', '金属'], count: [1, 1], tierPolicy: 'mixed' }]

}

},

{

id: 'xm_duel', name: '鬼修斗法波及', category: 'battle', noBattle: true,

text: '一名鬼修与一名尸修在崖顶斗法，阴气冲天。你远远绕开，等他们打完，捡了些散落的灵石。',

reward: {

stones: [560, 1120]

}

},

{

id: 'xm_soul', name: '古兽残魂', category: 'battle',

text: '深渊裂缝里游出一缕残魂，赤目如炬，是魂修驱使的。你以灵力将它打散，魂散处留下一枚兽核。',

reward: {

stones: [1200, 2400],

items: [{ category: '灵材', types: ['骨材'], count: [1, 1], tierPolicy: 'mixed' }]

}

},

// —— 奇遇 4（古修洞府固定 1%）——

{

id: 'xm_cave', name: '古修洞府', category: 'adventure', fixedWeightPct: 1,

text: '魔气在崖底侵蚀穿了一层石壁，露出后面的古修洞府。石室中宝匣静置，灵光流转。',

reward: {

stones: [2800, 4800],

items: [{ category: '灵材', types: ['金属', '宝晶', '灵土', '灵木'], count: [1, 2], tierPolicy: 'mixed' }],

fragment: { chance: 0.2, amount: [1, 1] },

chest: true

}

},

{

id: 'xm_stele', name: '无字石碑', category: 'adventure',

text: '断崖最高处立着一块无字石碑，魔气在碑下盘旋。你以灵力探入，碑中浮起一篇心法残篇。',

textMiss: '断崖最高处立着一块无字石碑，魔气在碑下盘旋。你以灵力探入，碑中只剩几页残篇。',

reward: {

stones: [0, 0],

art: { chance: 1, kind: 'heart_fragment' }

}

},

{

id: 'xm_sigil', name: '传承印记', category: 'adventure',

text: '魔纹最深处的岩台上嵌着一枚传承印记，你触之，一道完整的功法诀要入脑。',

textMiss: '魔纹最深处的岩台上嵌着一枚传承印记，你触之，印记已被魔气磨尽，只余几页残篇。',

reward: {

stones: [0, 0],

art: { chance: 1, kind: 'other_art' }

}

},

{

id: 'xm_rift', name: '秘境入口', category: 'adventure',

text: '崖底裂开一道空间缝隙，像是通往某处秘境。魔气太盛，你不敢久留，只在边缘拾了些灵石。',

reward: {

stones: [2000, 4000],

fragment: { chance: 1, amount: [2, 2] }

}

},

// —— 叙事 2 ——

{

id: 'xm_sect', name: '魔修盘问', category: 'narrative',

text: '三名魔修拦住你，问你来小魔渊做什么，是买货还是寻仇。',

narrative: {

autoChoice: 'help',

options: [

{

id: 'help', label: '配合',

text: '你说了来意，又顺手报了个在深渊里混得开的名字。领头的魔修拱拱手，让开了道。',

reward: {

stones: [480, 960],

fragment: { chance: 0.1, amount: [1, 1] }

}

},

{ id: 'leave', label: '隐瞒', text: '你懒得答话，径直往前走。身后传来几句嘀咕，也没人敢追。' }

]

}

},

{

id: 'xm_rogue', name: '散修求助', category: 'narrative',

text: '一名散修被魔修追杀了三日，躲在岩缝里，见你落下，扑出来求你救命。',

narrative: {

autoChoice: 'help',

options: [

{

id: 'help', label: '相助',

text: '你弹出一缕灵力，替他封住伤势，又挡了一记追来的魔气。他捧出灵石相谢。',

reward: {

stones: [480, 960],

fragment: { chance: 0.1, amount: [1, 1] }

}

},

{ id: 'leave', label: '离开', text: '你看了他一眼，摇了摇头。岩缝很窄，你侧身走了过去。' }

]

}

}

]

}
```

---

## 五、待开发组确认的占位值

| 项 | 状态 |

|---|---|

| **灵石区间** | 按筑基四图同构比例放大（2.2 / 2.9 / 3.7 / 4.4），**等 `realmCoefAt(21~30)` 实际值确认后调整** |

| **`highTierChance`** | 0 / 0.3 / 0.6 / 0.9（照抄） |

| **`elementBias`** | 按地域主题微调（死亡沼泽偏水、黑河坊偏金、南口关偏金、小魔渊偏土） |

| **《兽器同源经》** | 走通用池（传承印记），不做小魔渊专属 |

| **叙事选项** | 每图 2 条 × 2 选项 = 16 条 |

---

## 六、与现有结构的一致性检查

| 项 | 检查 |

|---|---|

| 事件数 | 16 / 17 / 18 / 18 ✅ 与筑基四图一致 |

| 类别分布 | 空包/采植/采材/拾遗/战斗/奇遇/叙事 逐类对应 ✅ |

| `fixedWeightPct` | 古修洞府固定 1%（南口关、小魔渊）✅ |

| `noBattle` | 小魔渊「鬼修斗法波及」标记 ✅ |

| `fallbackTypes` | 小魔渊「灵茶园」叶→花/果 ✅ |

| `textMiss` | 储物袋/古修遗蜕/无字石碑/传承印记 全部带 ✅ |

| 占位符 | `{灵植名}` / `{灵材名}` / `{骨材名}` / `{灵叶名}` / `{宝晶名}` / `{灵土名}` / `{灵木名}` ✅ |

| 叙事结构 | `autoChoice` + `options[help/leave]` ✅ |

**确认后交开发组落代码。**
