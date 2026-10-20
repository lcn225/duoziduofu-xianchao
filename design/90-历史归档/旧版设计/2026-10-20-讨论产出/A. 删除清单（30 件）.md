按已锁定计划，执行清单如下。**不要直接手改 `items.data.js`**；应改源手工池/生成脚本输入，再跑 `python scripts/build-items.py`。

---

## A. 删除清单（30 件）

### A1. 删灵兽 10 件：100 → 90

| id | 名称 | 理由 |

|---|---|---|

| `x_lingshou_0053` | 九幽乌蛸 | 一阶通用模板 |

| `x_lingshou_0050` | 剑齿恐兽 | 一阶通用模板 |

| `x_lingshou_0037` | 土灵犀 | 一阶通用模板 |

| `x_lingshou_0045` | 小鳄鱼 | 一阶通用模板 |

| `x_lingshou_0036` | 巨角犀 | 一阶通用模板 |

| `x_lingshou_0049` | 摩云鬣 | 一阶通用模板 |

| `x_lingshou_0038` | 斑斓猛虎 | 一阶通用模板 |

| `x_lingshou_0029` | 斑纹烈角兽 | 一阶通用模板 |

| `x_lingshou_0048` | 棋盘鲤 | 一阶通用模板 |

| `x_lingshou_0042` | 火蚁 | 一阶通用模板 |

### A2. 删灵植 20 件：96 → 76，全部木属性

`g_lingzhi_0001` 灰草、`0002` 碧荆、`0003` 乌树、`0004` 青木、`0005` 墨芝、`0006` 暗树、`0007` 碧树、`0008` 乌竹、`0009` 乌灵参、`0010` 灰神参、`0011` 灰玄竹、`0012` 紫玄木、`0013` 灰玄花、`0014` 乌魔树、`0015` 灰神花、`0017` 白野木、`0018` 暗灵竹、`0019` 乌野草、`0020` 白鬼芝、`0021` 乌仙苔。

删后灵植：木 63 / 水 5 / 火 8 = 76。

---

## B. 修改清单（37 件）

### B1. 灵器 18 件

保留 5 件木灵器：`lingteng_shield`、`lingteng_armor`、`qingmu_2`、`x_lingqi_0123`、`g_lingqi_0127`。

#### 木 → 水/火/土 14 件

| id | 旧名 | 新名 | 新 fate | type/series | 新 description |

|---|---|---|---|---|---|

| `qingyu_sword` | 青玉剑 | 青玉寒水剑 | water | 不变 | 青玉剑身蕴寒水之气，出鞘生凉。 |

| `qingyu_dagger` | 青玉匕 | 青玉寒水匕 | water | 不变 | 青玉短匕，寒水淬锋。 |

| `x_lingqi_0124` | 幻木灵梭 | 幻水灵梭 | water | 不变 | 水气幻化的灵梭，攻守皆备。 |

| `g_lingqi_0146` | 青银刀 | 青银水刀 | water | 不变 | 青银刀身含水意，挥动如波。 |

| `g_lingqi_0141` | 青银镖 | 青银水镖 | water | 不变 | 青银水镖，轻捷难防。 |

| `g_lingqi_0155` | 桃花竹环 | 桃花水环 | water | 不变 | 桃花水环，柔中带韧。 |

| `g_lingqi_0129` | 竹弩 | 赤竹火弩 | fire | 不变 | 赤竹为弩，火气贯矢。 |

| `g_lingqi_0142` | 紫竹锤 | 紫竹火锤 | fire | 不变 | 紫竹火锤，落处生焰。 |

| `x_lingqi_0142` | 如意三花棒 | 如意三花火棒 | fire | 不变 | 三花聚火，棒随意转。 |

| `x_lingqi_0143` | 三花镇魔钵 | 三花镇魔火钵 | fire | 不变 | 三花火钵，镇魔焚邪。 |

| `g_lingqi_0157` | 莲花金矛 | 赤莲火矛 | fire | 不变 | 赤莲火矛，矛尖炽烈。 |

| `x_lingqi_0127` | 鎏花妆匣 | 鎏花土匣 | earth | 不变 | 鎏花土匣，纳物稳厚。 |

| `x_lingqi_0128` | 青玉屋 | 青玉镇土屋 | earth | 不变 | 青玉土屋，落地镇岳。 |

| `g_lingqi_0158` | 葬花玉轮 | 葬花玉土轮 | earth | 不变 | 葬花玉轮，碾尘成土。 |

#### 兽 → 水/火/土 4 件，需改 series

| id | 旧名 | 新名 | 新 fate | type | 新 series | 新 description |

|---|---|---|---|---|---|---|

| `g_lingqi_0122` | 骨鞭 | 玄水鞭 | water | 鞭 | `lingqi_xuanshui` | 玄水凝成的长鞭，柔韧如波。 |

| `g_lingqi_0123` | 骨钉 | 玄水钉 | water | 器 | `lingqi_xuanshui` | 玄水钉，掷出化寒芒。 |

| `g_lingqi_0138` | 紫骨牌 | 紫炎牌 | fire | 牌 | `lingqi_ziyan` | 紫炎牌，火纹流转。 |

| `g_lingqi_0156` | 戮魂骨盘 | 厚土戮魂盘 | earth | 盘 | `lingqi_houtu` | 厚土盘，镇魂压魄。 |

灵器改后：金28 / 木5 / 水17 / 火16 / 土10 / 器28 / 兽0。

### B2. 灵材 19 件

#### 木 → 金/水/火 10 件

| id | 旧名 | 新名 | 新 fate | type/series | 新 description |

|---|---|---|---|---|---|

| `hua_jinxian_rui_2` | 金线花蕊 | 金线花蕊 | metal | 花/不变 | 花蕊含金气，可入丹方。 |

| `g_lingcai_0114` | 紫府神果壳 | 紫府金纹果壳 | metal | 果/不变 | 果壳带金纹，坚而含灵。 |

| `ye_lingcha_1` | 灵茶叶 | 灵水茶叶 | water | 叶/不变 | 叶蕴水润，冲泡安神。 |

| `x_lingcai_0087` | 葫芦状白果 | 葫芦水灵果 | water | 果/不变 | 葫芦状白果，内蕴水灵。 |

| `g_lingcai_0113` | 玄微魔花 | 玄微水魔花 | water | 花/不变 | 玄微魔花，水气幽深。 |

| `g_lingcai_0117` | 元始青灵苔 | 元始水灵苔 | water | **灵木→草** / `lingcai_元` | 青灵苔化草，水气盎然。 |

| `x_lingcai_0093` | 三花 | 三花火蕊 | fire | 花/不变 | 三花聚火，可炼火属丹器。 |

| `g_lingcai_0108` | 五花真花 | 五花真火 | fire | 花/不变 | 五花蕴火，花色如焰。 |

| `g_lingcai_0115` | 南华灰精花 | 南华灰炎花 | fire | 花/不变 | 灰精花含炎气。 |

| `g_lingcai_0119` | 毒龙紫鬼丝 | 毒龙紫火丝 | fire | **灵木→藤** / `lingcai_毒` | 紫鬼丝化藤，火毒相生。 |

#### 兽 → 金/器 9 件，需改 type/series

| id | 旧名 | 新名 | 新 fate | 新 type | 新 series | 新 description |

|---|---|---|---|---|---|---|

| `x_lingcai_0112` | 七彩幻珑晶 | 七彩幻珑晶 | vessel | 骨材→宝晶 | `lingcai_qicai` | 幻珑晶，可作器胚。 |

| `x_lingcai_0114` | 悬灯海蛟内丹 | 悬灯海蛟灵晶 | vessel | 骨材→宝晶 | `lingcai_xuandeng` | 海蛟内丹凝晶，器属灵材。 |

| `x_lingcai_0113` | 通明灵龟内丹 | 通明灵龟玄晶 | vessel | 骨材→宝晶 | `lingcai_tongming` | 灵龟内丹化晶，可炼器。 |

| `x_lingcai_0117` | 墨黑章鱼内丹 | 墨黑章鱼墨晶 | vessel | 骨材→宝晶 | `lingcai_mohei` | 章鱼内丹凝墨晶，器属。 |

| `x_lingcai_0118` | 星雪秘蛇内丹 | 星雪秘蛇星晶 | vessel | 骨材→宝晶 | `lingcai_xingxue` | 秘蛇内丹化星晶，可炼器。 |

| `x_lingcai_0119` | 通明烈阳鸟内丹 | 通明烈阳鸟阳晶 | vessel | 骨材→宝晶 | `lingcai_lieyang` | 烈阳鸟内丹凝阳晶，器属。 |

| `bone_shougu_2` | 妖兽骨 | 庚金精铁 | metal | 骨材→金属 | `lingcai_gengjin` | 妖兽骨炼成的庚金精铁。 |

| `bone_shoujiao_3` | 灵兽角 | 辛金精矿 | metal | 骨材→金属 | `lingcai_xinjin` | 灵兽角炼化的辛金精矿。 |

| `x_lingcai_0103` | 极北冰猿兽晶 | 极北寒金晶 | metal | 骨材→宝晶 | `lingcai_hanjin` | 冰猿兽晶提纯的寒金宝晶。 |

灵材原有 100 件改后：金30 / 木10 / 水8 / 火10 / 土36 / 器6 / 兽0。

---

## C. 新增灵材 200 件清单

### C1. 统一规则

- `category`：`"灵材"`

- `id`：`n_lingcai_0001` → `n_lingcai_0200`

- `name`：`{前缀}{01..10}`，例如 `赤金砂01`

- `tier`：每系列 01–02 为 tier1，03–04 tier2，05–06 tier3，07–08 tier4，09–10 tier5。每系列 tier 各 2 件；200 件合计每 tier 40 件。

- `description` 模板：

- 金：`以{前缀}凝炼的金属灵材，可炼金器。`

- 水：`以{前缀}凝炼的水属灵材，可炼丹炼器。`

- 火：`以{前缀}凝炼的火属灵材，可炼丹炼器。`

- 土：`以{前缀}凝炼的土属灵材，可培灵植、炼土器。`

- 器：`以{前缀}凝炼的器属灵材，宜作器胚。`

- 无骨材、无灵木、无木属性、无兽属性。

### C2. 20 个系列 × 10 件

| id 范围 | name 前缀 | type | series | fateElement | 件数 |

|---|---|---|---|---|---:|

| `n_lingcai_0001`–`0010` | 赤金砂 | 金属 | `metal_chijin` | metal | 10 |

| `n_lingcai_0011`–`0020` | 玄金锭 | 金属 | `metal_xuanjin` | metal | 10 |

| `n_lingcai_0021`–`0030` | 白金星屑 | 金属 | `metal_baijin` | metal | 10 |

| `n_lingcai_0031`–`0040` | 紫金精 | 金属 | `metal_zijin` | metal | 10 |

| `n_lingcai_0041`–`0050` | 曜金晶砂 | 金属 | `metal_yaojin` | metal | 10 |

| `n_lingcai_0051`–`0060` | 万炼器胚 | 金属 | `metal_qipei` | vessel | 10 |

| `n_lingcai_0061`–`0070` | 寒水玉髓 | 宝晶 | `gem_hanshui` | water | 10 |

| `n_lingcai_0071`–`0080` | 玄水宝晶 | 宝晶 | `gem_xuanshui` | water | 10 |

| `n_lingcai_0081`–`0090` | 碧水灵晶 | 宝晶 | `gem_bishui` | water | 10 |

| `n_lingcai_0091`–`0100` | 赤炎晶 | 宝晶 | `gem_chiyan` | fire | 10 |

| `n_lingcai_0101`–`0110` | 离火宝晶 | 宝晶 | `gem_lihuo` | fire | 10 |

| `n_lingcai_0111`–`0120` | 火髓晶 | 宝晶 | `gem_huosui` | fire | 10 |

| `n_lingcai_0121`–`0130` | 厚土灵壤 | 灵土 | `soil_houtu` | earth | 10 |

| `n_lingcai_0131`–`0140` | 赤壤精土 | 灵土 | `soil_chitu` | earth | 10 |

| `n_lingcai_0141`–`0150` | 玄阴土精 | 灵土 | `soil_xuanyin` | earth | 10 |

| `n_lingcai_0151`–`0160` | 镇岳灵砂 | 灵土 | `soil_zhenyue` | earth | 10 |

| `n_lingcai_0161`–`0170` | 赤焰花 | 花 | `hua_chiyan` | fire | 10 |

| `n_lingcai_0171`–`0180` | 朱霞果 | 果 | `guo_zhuxia` | fire | 10 |

| `n_lingcai_0181`–`0190` | 玄水叶 | 叶 | `ye_xuanshui` | water | 10 |

| `n_lingcai_0191`–`0200` | 碧水灵叶 | 叶 | `ye_bishui` | water | 10 |

新增合计：金50 / 水50 / 火50 / 土40 / 器10；type：金属60 / 宝晶60 / 灵土40 / 花10 / 果10 / 叶20。

**示例条目**：

```json
{"id":"n_lingcai_0001","name":"赤金砂01","category":"灵材","type":"金属","series":"metal_chijin","tier":1,"fateElement":"metal","description":"以赤金砂凝炼的金属灵材，可炼金器。"}
```

---

## D. 执行后校验

| 池 | 调整后 |

|---|---|

| 灵器 | 金28 / 木5 / 水17 / 火16 / 土10 / 器28 / 兽0 = 104 |

| 灵兽 | 兽90 = 90 |

| 灵植 | 木63 / 水5 / 火8 = 76 |

| 灵材 | 金80 / 木10 / 水58 / 火60 / 土76 / 器16 / 兽0 = 300 |

| **总池** | **570** |

全局：金108、木78、水80、火84、土86、器44、兽90。

最大两类：**金108 + 兽90 = 198 / 570 = 34.7%**。

木+兽：**78 + 90 = 168 / 570 = 29.5%**。

---

## E. 执行顺序

1. 备份当前手工池与 `items.data.js`。

2. 按 A 删除 30 条。

3. 按 B 修改 37 条，`id` 不变；仅指定条目改 `type/series`。

4. 按 C 新增 200 条，`id` 从 `n_lingcai_0001` 连续到 `0200`。

5. 跑 `python scripts/build-items.py` 重新生成 `items.data.js`。

6. 跑上面的池统计断言，确认总数 570。

清单到此可直接执行。需要我下一步把它落成可粘贴的 JSON patch/生成脚本输入，就说“落成 JSON”。
