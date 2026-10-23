# UI 视觉规范：分区框（`.zone`）

> **2026-10-22 P35 首落地（子嗣页），拟作为全项目页面布局的统一写法。**
> 真源：本文是「页面怎么分区」的唯一口径；具体页面的分区顺序仍以对应模块文档为准
> （如子嗣页见《模块二》§13.3）。

---

## 一、一句话口径

**一个页面里「一块完整信息」= 一个分区框。** 分区框 = 标题栏（蓝条 + 标题 + 右侧操作）+ 内容区，
外框 1px、底色比页面深一档；区与区之间 20px。

反面（P28.5 第一轮的教训）：只有部分区块成卡、其余裸放，页面读起来是
「一大团散装内容 + 几张卡」，不是几个区。

---

## 二、结构（照抄）

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
| 1 | 外层纵向容器用**普通 flex + `gap: 20px`**，**不要** `n-space vertical`（0 → N 动态子节点会重复渲染） |
| 2 | 每区必须有 `.zone-head` + `.zone-title`，四个字左右；没有标题的裸区块不叫分区 |
| 3 | `.zone-head` 右侧只放此区专属操作；窄屏放不下就回正文首行（见 `.zone-head { flex-wrap: wrap }`） |
| 4 | 区内还要分子块时，用 **`:bordered="false"` 的 `n-card`**：它仍有面板底色，会浮在区底色上；**不要再套带边框的卡**（双层框） |
| 5 | 区标题里的数字 / 实时状态放 `.zone-head` 右侧，别塞进标题文字 |

---

## 三、样式（唯一实现，直接复制）

```css
/* 分区框（2026-10-22 P35）：页面级的分区单元。
   边框和底色都用 --n-text-color 调（暗色是白字、亮色是黑字），
   一套值两套主题都成立：亮色下是「浅灰底 + 深灰框」，暗色下是「提亮底 + 提亮框」。*/
.zone {
  border: 1px solid color-mix(in srgb, var(--n-text-color) 20%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--n-text-color) 4%, transparent);
  overflow: hidden; /* 子块底色 / 表格横向滚动别溢出圆角 */
}
.zone-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap; /* 窄屏标题和右侧操作各占一行 */
  padding: 10px 14px;
  /* 分隔线比外框淡一档（20% → 14%），标题栏看得出是一条「栏」但不抢外框 */
  border-bottom: 1px solid color-mix(in srgb, var(--n-text-color) 14%, transparent);
}
.zone-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
}
.zone-title::before {
  content: '';
  width: 3px;
  height: 14px;
  border-radius: 2px;
  background: #2080f0;
}
.zone-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
}
/* 区内的无边框子块：靠 n-card 自身面板底色浮起，标题下加一条淡边线 */
.zone-body :deep(.n-card-header) {
  border-bottom: 1px solid color-mix(in srgb, var(--n-text-color) 12%, transparent);
  padding-bottom: 8px;
}
```

**颜色只认这几个数**（改强度就改这里，别在页面里另写一套）：

| 用途 | 值 |
|---|---|
| 外框 | `--n-text-color` × **20%** |
| 标题栏下边线 | `--n-text-color` × **14%** |
| 区底色 | `--n-text-color` × **4%** |
| 区标题蓝条 | **`#2080f0`**（硬编码，见坑 2） |
| 区间距 | **20px** |
| 区标题字号 | **14px / 600** |

---

## 四、什么时候用 / 不用

**用**：

- 一个页面/页签里有两块以上的并列信息（统计 + 汇报 + 列表 + 配置）。
- 原来用「一大张卡把整页包起来」或「一堆散装块直接摊在页面上」的地方。

**不用**：

- 整页只有一块内容 —— 直接一个 `n-card` 就行，不需要外套分区框。
- 弹窗、抽屉内部 —— 空间太小，用 `n-card` 即可。
- 卡片内部的从属信息 —— 那是子块（`:bordered="false"`），不是分区。

---

## 五、坑（踩过的）

1. **不要写死 `rgba(255,255,255,…)`** 做底色/边框。第一版这么写，亮色主题下等于隐形
   （白色叠白），截图才发现。一律用 `color-mix(in srgb, var(--n-text-color) N%, transparent)`。
2. **不要用 `var(--n-border-color)` 做外框**。它取的是 Card 的 `dividerColor`（暗色仅 9% 白），
   做卡片边框刚好、做页面级外框偏淡；而且它是「颜色」不是「强度」，亮暗两套主题调不动。
   蓝条同理不要用 `var(--n-primary-color)`：暗色主题的 `primaryColor` 是青绿 `#63e2b7`，
   和项目里其它强调点（进度条、计划点）用的 `#2080f0` 不是一个色。
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
8. **一行里放多个分区标题会互相打架**：分区是「整行独占」的块，不要做左右并排的分区框
   （真要并排，见 `子嗣页` 的做法：一个分区框内部用 `.report-grid` 两列子块）。

---

## 六、迁移清单（全项目统一时按这个走）

| 页面 | 文件 | 现状 | 建议 |
|---|---|---|---|
| 子嗣页 | `views/InnerCourt.vue` | ✅ 已是三区 `zone` | 作为样板 |
| 内宅页签 | `views/InnerCourt.vue` | ✅ **两个 zone**：内宅概况 / 侍妾与流水 | 2026-10-23 已改。侍妾名单与内宅流水**仍左右并列**，收进同一个 `zone` 的两个 `:bordered="false"` 子块（同子嗣页「今日汇报」），不是两个并排 `zone` |
| 家族树页签 | `views/InnerCourt.vue` | `n-space vertical` + 多张卡 | 改成 2~3 个 `zone` |
| 桂冈的一天 | `views/Day.vue` | 外层 `n-card :bordered="false"` 包 `n-space`，内层多张小卡 | 外层卡换成若干 `zone` |
| 修行 | `views/Cultivation.vue` | 外层 `n-card title="修行"` + 内层小卡 + `n-divider` 小节 | 外层卡换成 `zone` |
| 坊市 | `views/Shop.vue` | 四张并列 `n-card` | 四个 `zone` 或一个大 `zone` 内四个子块 |
| 秘境 / 镇守 | `views/Dungeon.vue` 等 | `n-card` + `n-grid` | 同上 |
| 背包 / 炼丹 / 成就 | `views/*.vue` | `n-card` + `n-divider` 小节 | 先保持，等页面重做时再套 |

> 迁移时**只改结构与样式，不改内容**；一页一提交，方便对照截图回滚。

---

## 七、验收

1. `npm run verify:quiet` —— 纯 UI 改动**不应新增断言**，总数保持通过。
2. 截图两种宽度（`scripts/shot.mjs`，不能点按）：

```bash
node scripts/shot.mjs --url='http://localhost:2025/#/innercourt' --out=.tmp/a-1440.png --w=1440 --h=1200 --wait=12000
node scripts/shot.mjs --url='http://localhost:2025/#/innercourt' --out=.tmp/a-700.png  --w=700  --h=1700 --wait=12000
```

   页面页签默认不是目标页签时，临时改 `views/InnerCourt.vue` 的 `const tab = ref('…')`，
   **截完改回**（别提交）。
3. **亮、暗两套主题各看一眼**。暗色要临时把 `stores/modules/persistence.js` 里
   `isDarkMode` 的初值改成 `true`（`state()` 的默认值和 `initializePlayer()` 里各一处），
   **截完改回**。无头截图默认是亮色，只看亮色会漏掉坑 1。
4. `.tmp/` 不在 `.gitignore` 里，截完 `rm -rf .tmp`，别让截图进提交。

---

## 八、来源

- 2026-10-23：内宅页签迁移（内宅概况 / 侍妾与流水两个 `zone`；名单与流水保持左右并列，
  作为同一区内的两个无边框子块）。页面外层的 `.offspring-stack` 同时改名 `page-stack`，
  子嗣 / 内宅两个页签共用。
- 首落地：P35（2026-10-22）子嗣页三区分隔第二轮 —— 《模块二》§13.3、
  《当前实现》P28.5、[2026-10-22 日报](../90-历史归档/日报/2026-10-22%20日报.md) §十三.7。
- 第一轮（P28.5 复盘，已被本轮取代）：统计条裸 `n-grid` + 裸小标题 + 只给主表套卡。
