# UI 视觉规范：视觉层（蓝皮书 V1.2）+ 结构层（分区框）

<!-- TOC:START -->
> **阅读提示**：别整份读。按行号用 `Read(offset, limit)` 只读目标章节；行号漂了就重跑 `npm run docs:toc`。
- L22 · 一、视觉层（蓝皮书 V1.2）
- L122 · 二、结构层：分区框（`.zone`）
- L217 · 三、什么时候用 / 不用
- L233 · 四、坑（踩过的）
- L270 · 五、落地分两步
- L305 · 六、验收
- L324 · 七、来源
<!-- TOC:END -->

> **2026-10-26 合并**：蓝皮书 V1.2（定稿）与本文原有的 `.zone` 分区规范合成一份。
> 分工：**视觉层 = 蓝皮书 V1.2（色、字、圆角、间距、动效）**；**结构层 = `.zone` 分区框（页面怎么分区）**。
> 视觉层只有 V1.2 一个口径；V1.0 / V1.1 已归档到
> [`90-历史归档/讨论-2026-10-26/`](../90-历史归档/讨论-2026-10-26/归档说明.md)。
> **落地分两步**：第一步先把 token 与两行导航落地、新页面直接用 V1.2；第二步按 §五 逐页刷旧页面。

---

## 一、视觉层（蓝皮书 V1.2）

### 1.1 四条铁律

1. **无高光、去拟物**：禁玻璃拟态、发光渐变、3D 图标；材质一律哑光（旧宣纸 / 风化金属）。
2. **模块解耦**：主界面只留修行与资源，其余系统进独立页签，不堆在一页。
3. **反馈如涟漪**：常态反馈像墨落宣纸般晕开，**不用强闪烁、不用大弹窗**。
   —— 例外是"该停下来选"的四类：模块解锁、寿终讣告、离线报告、二选一叙事。
4. **极简不等于无引导**：靠排版权重（字号/粗细）、微质感锚点（菱形/渐变细线）、
   交互状态（底色/边框）来引导视线，不靠色块和粗线。

### 1.2 Token（唯一色源）

```css
:root {
  /* 亮色：V1.2 原文值 */
  --ui-paper: #F3EFE6;              /* 页面底：旧宣纸 */
  --ui-surface: #FCFBF7;            /* 卡片面：素帛米白 */
  --ui-ink: #3D3D3D;                /* 主文字：柔和松烟墨 */
  --ui-ink-sub: #8A857B;            /* 辅助文字：淡灰墨 */
  --ui-ink-fade: rgba(61,61,61,.4); /* 时间戳等极淡文字 */
  --ui-jade: #2E8B7A;               /* 青玉：进度、正向 */
  --ui-gold: #C9A227;               /* 暗金：边框、菱形、主按钮 */
  --ui-cinnabar: #C0392B;           /* 朱砂：有孕、危险 */
  --ui-line: rgba(201,162,39,.3);   /* 卡片外框 */
  --ui-line-strong: rgba(201,162,39,.4); /* 选中态/悬停 */
  --ui-track: #E6E2D6;              /* 进度条轨道 */
  --ui-radius: 12px;
  --ui-shadow: 0 6px 24px rgba(0,0,0,.04);
  --ui-font-base: 15px;
  --ui-font-title: 18px;
}

/* 暗色：同一批变量换值。
   ✅ 2026-10-27 B3.5 实机验收（封地页亮暗各一张截图）；暗色开关在 App.vue 的 darkTheme，
   `html.dark` 由 persistence.updateHtmlDarkMode 加类。*/
.dark {
  --ui-paper: #1E1C19;
  --ui-surface: #26231F;
  --ui-ink: #E4DED2;
  --ui-ink-sub: #9A9488;
  --ui-ink-fade: rgba(228,222,210,.4);
  --ui-jade: #4FB3A0;
  --ui-gold: #D4B04A;
  --ui-cinnabar: #D9564A;
  --ui-line: rgba(201,162,39,.45);
  --ui-line-strong: rgba(201,162,39,.6);
  --ui-track: #3A3630;
  --ui-shadow: 0 6px 24px rgba(0,0,0,.35);
}
```

**用法**：业务代码只写 `var(--ui-*)`。亮暗两套只在这里改，页面里不允许出现第二种色值。
暗色挂载方式（`.dark` 类 or `themeOverrides`）在 `App.vue` 一处决定，页面不关心。

### 1.3 一级导航：两行式

- **第一行**：左侧游戏大标题，右侧核心资源（灵石 / 贡献 / 时间）。**无底线**，靠留白分隔。
- **第二行**：模块页签，做成"书签/卷标"。
  - 未选中：`--ui-ink-sub` 文字，透明边框。
  - 选中：`--ui-jade` 加粗 + `--ui-surface` 底 + `--ui-line-strong` 1px 边框 + 6px 圆角 + 极浅阴影。
- 废弃：底栏大图标、`#2080f0` 蓝色高亮块、下划线式激活。

```css
.nav-item { padding: 7px 16px; border: 1px solid transparent; border-radius: 6px;
            color: var(--ui-ink-sub); font-size: 14px; }
.nav-item.on { color: var(--ui-jade); font-weight: 700; background: var(--ui-surface);
               border-color: var(--ui-line-strong); box-shadow: 0 2px 8px rgba(0,0,0,.02); }
```

### 1.4 分区 1：总览状态（数值平权）

- 左侧「封地/地名 + Lv」，右侧横排各项数值。
- **数值平权**：所有数值同一个字号 **18px / 700**，不再单独放大某一个。
- 标签 13px / `--ui-ink-sub`；数值用等宽数字（`font-variant-numeric: tabular-nums`）。

### 1.5 分区 2 + 3：功能与流水合并成一张卡

- 操作按钮（巡视、征收…）挂**卡片右上角**（`.acts { margin-left: auto }`）。
- 建设列表每行：左标题（深墨加粗）→ 中进度条（6px 青玉）→ 右时间（淡墨）。
- 行与行靠 **18px 间距**分隔，必要时叠一条极淡虚线；**不用实线框死**。

### 1.6 流水排版

- 字号 **14px**，行高 **32px**（验收底线：辅助字号 ≥13px、行高 ≥28px）。
- 时间戳 `--ui-ink-fade`；事件名 `--ui-jade` 加粗；数值正文 `--ui-ink`。
- 朱砂 `--ui-cinnabar` 只留给"有孕"和危险。

### 1.7 组件

| 组件 | 规范 |
|---|---|
| 卡片 Panel | `--ui-surface` 底 + 1px `--ui-line` + 12px 圆角 + 28px 内边距 + `--ui-shadow` |
| 标题锚点 | 标题左侧 5×5 暗金菱形（`transform: rotate(45deg)`）；可选再接一条由暗金渐隐的 1px 细线 |
| 按钮 | 透明底 + 1px 暗金边 + 暗金文字；主操作 Hover 泛极淡金；次操作纯文字 |
| 进度条 | 高 6px、轨道 `--ui-track`、填充 `--ui-jade`、圆角 3px；动效只做极缓"呼吸" |
| 名册 | 行高 ≥48px、无竖线；有孕名旁一枚朱砂小方印 |

---

## 二、结构层：分区框（`.zone`）

> 真源口径：**一个页面里「一块完整信息」= 一个分区框。**
> 分区框 = 标题栏（菱形锚点 + 标题 + 右侧操作）+ 内容区。区与区之间 24px。
> 反面（P28.5 第一轮教训）：只有部分区块成卡、其余裸放，页面读起来是"散装内容 + 几张卡"。

### 2.1 结构（照抄）

```html
<div class="page-stack">
  <section class="zone">
    <div class="zone-head">
      <span class="zone-title">子嗣概况</span>
      <!-- 可选：右侧只放与本区直接相关的操作（筛选 / 按钮 / 计数） -->
    </div>
    <div class="zone-body">
      …本区内容…
    </div>
  </section>

  <section class="zone">
    <div class="zone-head">
      <span class="zone-title">子嗣名册</span>
      <n-radio-group v-if="!isNarrow" …>
        <!-- 宽屏放标题栏右侧 -->
      </n-radio-group>
    </div>
    <div class="zone-body">
      <!-- 窄屏时同一组筛选器回到正文首行 -->
    </div>
  </section>
</div>
```

规则：

| # | 规则 |
|---|---|
| 1 | 外层纵向容器用**普通 flex + `gap: 24px`**，**不要** `n-space vertical`（0 → N 动态子节点会重复渲染） |
| 2 | 每区必须有 `.zone-head` + `.zone-title`，四个字左右；没有标题的裸区块不叫分区 |
| 3 | `.zone-head` 右侧只放此区专属操作；窄屏放不下就回正文首行（`flex-wrap: wrap`） |
| 4 | 区内还要分子块时，用 **`:bordered="false"` 的 `n-card`**：它仍有面板底色，会浮在区底色上；**不要再套带边框的卡**（双层框） |
| 5 | 区标题里的数字 / 实时状态放 `.zone-head` 右侧，别塞进标题文字 |

### 2.2 样式（唯一实现，直接复制）

```css
.page-stack { display: flex; flex-direction: column; gap: 24px; }

.zone {
  background: var(--ui-surface);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-radius);
  padding: 28px;
  box-shadow: var(--ui-shadow);
  overflow: hidden; /* 子块底色 / 表格横向滚动别溢出圆角 */
}
.zone-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;          /* 窄屏标题和右侧操作各占一行 */
  margin-bottom: 22px;
}
.zone-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: var(--ui-font-title);
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--ui-ink);
}
.zone-title::before {       /* V1.2 视觉锚点：暗金菱形，替代原蓝条 */
  content: '';
  width: 5px;
  height: 5px;
  background: var(--ui-gold);
  transform: rotate(45deg);
}
.zone-body { display: flex; flex-direction: column; gap: 14px; }

/* 区内列表行 / 进度条 */
.bar { height: 6px; background: var(--ui-track); border-radius: 3px; }
.bar i { display: block; height: 100%; background: var(--ui-jade); border-radius: 3px; }

/* 流水 */
.flow { font-size: 14px; line-height: 32px; }
.flow .t { color: var(--ui-ink-fade); }
.flow .e { color: var(--ui-jade); font-weight: 700; }
```

---

## 三、什么时候用 / 不用

**用**：

- 一个页面/页签里有两块以上的并列信息（统计 + 汇报 + 列表 + 配置）。
- 原来用「一大张卡把整页包起来」或「一堆散装块直接摊在页面上」的地方。

**不用**：

- 整页只有一块内容 —— 直接一个 `n-card` 就行，不需要外套分区框。
- 弹窗、抽屉内部 —— 空间太小，用 `n-card` 即可。
- 卡片内部的从属信息 —— 那是子块（`:bordered="false"`），不是分区。
- **分区 1（总览状态）是裸排**：这块按 V1.2 不套卡片，直接放在页面顶部。

---

## 四、坑（踩过的）

1. **业务代码不写死颜色**，一律 `var(--ui-*)`。尤其不要写 `rgba(255,255,255,…)` 做底色/边框
   —— 暗色主题下等于隐形，第一版就是这么翻车的。
2. **不要拿 Naive 的变量当分区色**：`var(--n-border-color)` 是 Card 的 dividerColor（暗色仅 9% 白），
   `var(--n-primary-color)` 在暗色下是青绿 `#63e2b7`。分区外框统一 `--ui-line`，
   强调统一 `--ui-gold` / `--ui-jade`，**蓝条已废弃**（2026-10-26 V1.2）。
3. **区框里不要套带边框的 `n-card`**：会变成双层框。子块一律 `:bordered="false"`，
   靠面板底色和区底色差一档来区分。
4. **全局 `.n-card { margin-bottom: 16px }`**（`src/App.vue`）会叠加到 flex `gap` 上。
   放进 gap 容器 / grid 的卡要显式 `margin-bottom: 0`。
5. **CSS grid 轨道写 `minmax(0, 1fr)`**，不要写 `1fr`。`1fr` = `minmax(auto, 1fr)`，
   最小值是内容的 min-content，里面挂一张 `scroll-x` 的表格就会把列撑宽、把邻列挤成细条。
6. **不要用 `n-space vertical` 包动态子节点**：子节点从 0 变多时会重复渲染
   （2026-10-20 实测出现过 4 个筛选器）。用普通 `div` + flex/grid。
7. **窄屏（<720px）**：`.zone-head` 靠 `flex-wrap` 换行；标题栏放不下的操作回正文首行。
   子嗣页的写法是 `v-if="!isNarrow"` 放标题栏、`v-if="isNarrow"` 放工具栏，两处绑定同一个 `v-model`。
   （V1.2 正文写 700px，**以 720 为准** —— 代码里已有 720 的断点。）
8. **一行里放多个分区标题会互相打架**：分区是「整行独占」的块，不要做左右并排的分区框
   （真要并排，见 `子嗣页` 的做法：一个分区框内部用 `.report-grid` 两列子块）。
9. **页面底 `--ui-paper` 要盖两层**：光给 `html`/`body` 设底色没用 ——
   `.n-layout` 和 `.n-layout-content` 自带 `background-color: var(--n-color)`，
   会盖在上面，只有页面边缘一圈露出「旧宣纸」（2026-10-27 B3.5 实测）。
   写法是 `body .n-layout, body .n-layout-content { background-color: var(--ui-paper) }`
   —— 特异度（0,1,1）压过 Naive 的（0,1,0），不吃样式注入顺序。
10. **一级页签别用 `n-menu`**：它的选中态是 Naive 主题色（暗色下是青绿 `#63e2b7`），
   而且溢出只能靠 `responsive` 收进「…」，窄屏会直接裁掉最后几项。
   B3.5 起改成自绘 `.nav-item` 按钮 + `flex-wrap`，样式全在 `components/MainNav.vue` 里。
   **同一个页面不要同时出现在一级页签和「更多」下拉里点亮**（按路由判定哪一边亮）。
11. **`position: sticky` 在本项目里不生效**（2026-10-26 P51 #3）：滚动容器是窗口，但
   Naive 的 `.n-layout` 自带 `overflow: hidden`，sticky 会以它作为「最近的滚动祖先」，
   于是永远不吸顶。需要「一直看得见」的操作（例：秘境整备的「开始挑战」）就在**上下各放一个**，
   或者改用页面顶部的固定条，别指望 sticky。（`position: fixed` 不受这条影响，
   但祖先一旦有 `transform` / `filter` 就会以祖先为包含块，同样要小心。）

---

## 五、落地分两步

> **排期（2026-10-26 补）**：第一步 = [《下一步》P52](../00-总览与状态/下一步.md) 的 **B3.5**
> （0.5 会话，**必须在 B4 之前**）；第二步 = **B5.5**（1.5 会话，一页一提交）。
> 本文定义「怎么做」，P52 定义「什么时候做」。

**第一步（✅ 2026-10-27 B3.5 已落地）**

1. token 进全局样式（亮暗两套，§1.2）—— `src/styles/tokens.css`，`main.js` 引入、全站可用。
2. `App.vue` 导航改两行式（§1.3）。
3. **新页面直接用 V1.2**：封地经营 ✅ 已改吃 token；秘库、解锁弹窗、秘境整备随后。
4. 旧页面暂不动，避免一次改崩。

落地细节与踩到的坑见
[《当前实现》B3.5](../00-总览与状态/当前实现.md)：`--ui-paper` 必须同时盖掉
`.n-layout` / `.n-layout-content` 自带的 `--n-color`；`n-menu` 换成自绘按钮后靠
`flex-wrap` 折行；「更多」只有在二级页才点亮。

**第二步（逐页刷）**

| 页面 | 文件 | 现状 |
|---|---|---|
| 子嗣页 | `views/InnerCourt.vue` | ✅ 三区 `zone`，结构不动，只换 token |
| 内宅页签 | `views/InnerCourt.vue` | ✅ 两个 zone；名单/流水是同区内的两个无边框子块 |
| 家族树页签 | `views/InnerCourt.vue` | `n-space vertical` + 多张卡 → 改 2~3 个 `zone` |
| 桂冈的一天 | `views/Day.vue` | 外层卡 + `n-space` → 换若干 `zone` |
| 修行 | `views/Cultivation.vue` | 外层卡 + `n-divider` → 换 `zone` |
| 坊市 | `views/Shop.vue` | 四张并列卡 → 四个 `zone` 或一区四子块 |
| 秘境 / 镇守 | `views/Dungeon.vue` 等 | `n-card` + `n-grid` → 同上 |
| 背包 / 炼丹 / 成就 | `views/*.vue` | 先保持，页面重做时再套 |

> 迁移时**只改结构与样式，不改内容**；一页一提交，方便对照截图回滚。

---

## 六、验收

1. **视线引导**：眯眼看，能否一眼找到最重要的信息；找不到 = 字号/粗细对比不够。
2. **质感悬浮**：卡片是否靠微阴影 + 极细金边浮在宣纸底上，而不是糊进背景。
3. **阅读**：辅助字号 ≥13px，流水行高 ≥28px（V1.2 验收线）。
4. 截图两种宽度（`scripts/shot.mjs`，不能点按）：

```bash
node scripts/shot.mjs --url='http://localhost:2025/#/innercourt' --out=.tmp/a-1440.png --w=1440 --h=1200 --wait=12000
node scripts/shot.mjs --url='http://localhost:2025/#/innercourt' --out=.tmp/a-720.png  --w=720  --h=1700 --wait=12000
```

   页面页签默认不是目标页签时，临时改 `views/InnerCourt.vue` 的 `const tab = ref('…')`，
   **截完改回**。5. **亮、暗各看一眼**：暗色要临时把 `stores/modules/persistence.js` 里
   `isDarkMode` 的初值改成 `true`（`state()` 默认值与 `initializePlayer()` 各一处），**截完改回**。
6. 纯 UI 改动**不新增断言**；`npm run verify:quiet` 总数保持通过。`.tmp/` 截完删掉。

---

## 七、来源

- 2026-10-26：蓝皮书 V1.2 并入，成为视觉层唯一口径；`.zone` 原有结构与 8 条坑保留为结构层。
  V1.0 / V1.1 归档到 [讨论-2026-10-26](../90-历史归档/讨论-2026-10-26/归档说明.md)。
- 2026-10-23：内宅页签迁移（内宅概况 / 侍妾与流水两个 `zone`；名单与流水保持左右并列，
  作为同一区内的两个无边框子块）。页面外层 `.offspring-stack` 改名 `page-stack`。
- 首落地：P35（2026-10-22）子嗣页三区分隔第二轮 —— 《模块二》§13.3、
  《当前实现》P28.5、[2026-10-22 日报](../90-历史归档/日报/2026-10-22%20日报.md) §十三.7。
