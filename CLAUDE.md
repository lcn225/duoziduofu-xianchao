# 多子多福：开创仙朝 — 项目约定

放置修仙游戏。基于开源项目 `setube/vue-idle-xiuxian` 二次开发，以小说《多子多福：开创仙朝》为世界观。
**Vue 3.5 + Vite 6 + Pinia 3 + Naive UI 2.41**。分支 `duoziduofu`（`main` 保持上游原样）。

> **实现细节 / 代码约定 / 15 条坑 / 验证 / 部署 / 提交远端，都在
> [`design/00-总览与状态/开发手册.md`](design/00-总览与状态/开发手册.md)。**
> 本文只留：启动方式、命令、进度速查、硬口径、改动影响地图、文档索引。
> **改代码前先看「改动影响地图」，不要整份重读设计文档。**

---

## ⚠️ 启动方式（2026-10-20 踩过）

**必须在仓库根目录启动 Claude**：`C:\Users\lcn_k\OneDrive\Project\多子多福`。
终端当前目录是 `design/` 时启动，`src/`、`scripts/`、根 `CLAUDE.md` 都会被
`blockReadsOutsideWorkingDirectories` 挡在工作区外，每个文件都要确认。

```powershell
cd C:\Users\lcn_k\OneDrive\Project\多子多福
claude
```

判断会话在哪：`pwd`，或看 `~/.claude/projects/` 下会话目录是否以 `------design` 结尾。
临时补救：`/add-dir C:\Users\lcn_k\OneDrive\Project\多子多福`。

项目级审批白名单在 `.claude/settings.json`：`npm run verify*`、`check:docs`、`docs:toc`、
`node scripts/*`、`git status/diff/log/show` 等已允许，文件编辑走 `acceptEdits`；
破坏性 git（`push --all/--tags`、`clean`、`reset --hard`、`filter-branch`）已 deny。
改完白名单若本会话仍弹确认，重开会话或看 `/permissions`。

---

## 常用命令

| 命令 | 用途 |
|---|---|
| `npm run dev` | 端口 2025，浏览器自动打开。也可双击根目录「启动游戏.bat」 |
| `npm run verify:quiet` | **852 条**纯函数断言，只打失败项 + 汇总（日常必跑） |
| `npm run verify` | 完整断言输出（约 55KB，别日常用） |
| `node scripts/verify-all.mjs --list --filter=宝匣` | 列出匹配的断言标题，不用整份读断言文件 |
| `node scripts/verify-all.mjs --quiet --filter=宝匣` | 只跑匹配的断言 |
| `npm run check:docs` | grep 旧口径 + 坏链接，全部设计文档 1 秒出 |
| `npm run docs:toc` | 给大文档刷新顶部行号目录（`--check` 只检查） |
| `npm run token-report` | 统计历史会话 token 花在哪（`--all` 看全部项目） |
| `python scripts/import-anims.py` | 素材/SS → src/assets/anim（300px 动态 WebP + 海报 + manifest） |
| `python scripts/build-items.py` | 掌门路 xlsx + 设计表 → `items.data.js`（依赖本地 xlsx，日常不用跑） |
| `npm run build` | 生成 `docs/`。**开发期别用**，见下 |

**开发期验打包**：`npx vite build --minify esbuild --outDir .buildcheck`，验完 `rm -rf .buildcheck`。
`npm run build` 会覆盖已提交的 `docs/`（部署产物），且 `terser` 已在 devDependencies 里。

**只推 `duoziduofu` 分支**：`git push --all` / `--tags` 会把 `main` 和上游 tag 一起推上去。
部署细节（Cloudflare Worker、pnpm 锁文件）见开发手册 §九。

---

## 当前进度（截至 2026-10-20）

| 模块 | 设计 | 代码 |
|---|---|---|
| A 期地基 | — | ✅ |
| 模块一 · 修行与突破 | ✅ | ✅ 连乘体系（2026-10-18） |
| 时间系统 | ✅ | 🟡 在线部分完成；离线结算未做 |
| 模块二 · 多子多福（含模块三内宅） | ✅ | 🟡 最小闭环 + P14 成长/繁育/软上限 + P15 洗命/血脉 + P18 生命周期/经期/家族树 v1 + **P20 子嗣修炼/6 岗家族工作**；派遣/分封待做 |
| 模块四 · 封地经营 | ✅ v1.1 数值已反推 | ⬜（P19 之后；巡视×2 / 徭役拖拽 / 15+6 建筑） |
| P10 · 桂冈的一天 | ✅ | ✅ v1（巡视/练功/炼体/互动/睡觉 + 双资源） |
| 三大挂机 · 镇守/探索/秘境 | ✅ | 🟡 结构与可玩闭环已落地（数值占位） |
| 模块五 · 任务战斗 | ✅ | ⬜（秘境已由三大挂机先行落地一部分） |
| 模块六 · 经济交易 | ✅ v2.1 | 🟡 双层货币 + 郑家宝阁骨架；宝箱/订货/商队未做 |
| 模块七 · 百艺科技 | ✅ | 🟡 炼器已落地；炼丹/炼符/炼阵是数据位 |
| 模块八 · 事件叙事 | ✅ | ⬜ |
| 模块九 · 离线结算 | ✅ 方案 B | ⬜ |
| 模块十 · 门派政治 | ❌ 废案 | — |

**逐项「设计 vs 代码」以《[当前实现](design/00-总览与状态/当前实现.md)》为准**；
待办见《[下一步](design/00-总览与状态/下一步.md)》，产出见《[产出登记表](design/00-总览与状态/产出登记表.md)》。

**P20（2026-10-20 夜）已完成**：子嗣修炼（有灵根启蒙后自动打坐，练气二层可出战）+
家族工作 MVP（6 个经济岗，产出映射到现有资源）。详见《下一步》P20。

**下一步仍是 P19（网页端定稿落地，文档已同步、代码未动）**，顺序：
货币 v2 → 物品池 570 → 宝箱获取/开箱 → 探索重做 → 秘境每 5 层。详见《下一步》P19。

### 当前硬口径（别改错）

- **当前可玩边界：练气八层。** 练气三层换《吕氏练气次第论》（0.152）或元氏（0.16）；
  六层换猪妖同参（0.6）即可过 0.24；九层需要准正主同参（0.8）或《兽器双修经》，
  **两条都没有获取途径**。**这是预期行为，不是 bug**，代码里有注释，不要当 bug「修」。
- **门槛以《模块一》§6.1 为准**：0.15 / 0.24 / 0.40 / 0.55 / 0.80（六层 2026-10-19 从 0.25 下调）。
  熟练度只加速（SpeedFit），不帮门槛（GateFit）。
- **同参先「硬编」桂冈那几件**，不实现判定规则（《模块一》§4.3）。
- **任何新增/减少产出都要先登记**，再按宪法第二章重算门槛，最后才改代码。
  **收益减少也要登记** —— 只记加不记减，门槛重算会拿旧产出当基准。
- 兽/器那 5 本功法至今没有获取途径；子嗣加成是**修炼速度**侧线，不是突破门槛。
- **看起来像 bug 的预期行为**（内宅不暂停、老档多 8 位侍妾、探索切页继续、巡视无产出……）
  见《当前实现》§四，**先查再修**。
- 代码约定、模块实现细节、15 条坑、验证与部署 → 开发手册。

---

## 改动影响地图

> **改之前先看这一行，别整份文档重读。** 只读表里列的文件；
> 改完跑 `npm run verify:quiet && npm run check:docs`。

| 改动类型 | 必看 / 必改 | 断言 |
|---|---|---|
| 本命 / 灵根 / 词条 / 子嗣加成 | `plugins/innerCourt.js`（`TUNING.bonus` / `rollOffspring`）· `plugins/items.js`（`rollFateSet` / `clampFateTiers`）· 模块二 §6.2/§9 · 物品池 §5.2/§5.3 · 真值表 §5.1 · 产出登记表 R07 | `verify-harmony` 8d/§9.2 · `verify-items` §五 |
| 货币 / 商店 / 价格 | `plugins/currency.js` · `plugins/shop.js` · 原作物价表 · 模块六 §九 | `verify-shop` |
| 封地 / 民心 / 税收 / 建设 | 模块四 §四/§十 · 模块六 §三 · 真值表 §6.8 | `verify-harmony`（门槛）· `dayLoop`（巡视） |
| 物品池 / 品阶 / 宝箱 | `plugins/items.js` · `plugins/tiers.js` · `plugins/chest.js` · 数据定案 §七 · 物品池设计方案 | `verify-items` |
| 修行 / 契合度 / 灵地 / K | `plugins/harmony.js` · `realm.js` · `tiers.js` · 模块一 · 真值表 §2/§3 | `verify-harmony` |
| 日常循环 / 体力 / 精力 | `plugins/dayLoop.js` · 日常循环 §4/§六 · 真值表 Sheet 4 · 开发手册 §六 | `verify-dayloop` |
| 探索 / 秘境 / 三挂机 | `plugins/exploration.js` · `secretRealm.js` · 三大挂机 · 开发手册 §七 | `verify-idle` |
| 模块二实现 / 代码约定 / 坑 | 开发手册 §二/§五/§八 · 模块二 · 当前实现 §四 | `verify-harmony` |
| **纯数值小改**（不动规则） | 只改 `TUNING` + `npm run verify:quiet`；**文档收工时一次性同步** | 对应脚本 |
| **规则 / 语义改动**（如本命→灵根） | 先跑 `npm run sim:fates` 看分布，再改代码 + 断言，最后同步 3~4 份真源 | `verify` + `check:docs` |

**工具**：

- `npm run check:docs` —— grep 旧口径 + 坏链接。
- `npm run sim:fates` —— 本命 / 灵根分布模拟（默认 5 万次，`--n=200000` 可调）。
- `npm run docs:toc` —— 大文档行号目录；读大文档时按目录用 `Read(offset, limit)`。
- `npm run token-report` —— 会话 token 账本，诊断「钱花在哪」。

---

## 单一真源（速查）

| 想改什么 | 真源 |
|---|---|
| 公式 / 规则 | 对应模块文档（`design/10-模块设计/`） |
| 数值 | `design/00-总览与状态/数值真值表.md` |
| 产出 | `design/00-总览与状态/产出登记表.md` |
| 当前代码现状 | `design/00-总览与状态/当前实现.md` |
| 未落地设计 / 决议 | 模块文档 + `design/30-数据与决议/数据定案.md` |
| 代码里的 TUNING | `src/plugins/*.js`；完整对照表见开发手册 §三 |

**灵力/秒只有一个真源**：`practice.js` 的 `spiritPerSecond` getter。UI 和实得都读它。
**哪些页面暂停时间**只看 `src/stores/modules/clock.js` 的 `PAUSE_ROUTES`；
内宅**不在**里面（观战页），别顺手加回去。

---

## 文档

`design/` 按文档类型分文件夹，入口是 [`design/README.md`](design/README.md)：

```
design/00-总览与状态/   最高宪法 · 当前实现 · 下一步 · 产出登记表 · 数值真值表 · 开发手册
design/10-模块设计/     模块一~九（一模块一文件；内宅并入模块二）
design/20-系统设计/     时间系统 · 三大挂机（含探索） · 日常循环 · 宝箱
design/30-数据与决议/   数据定案 · 物品池设计方案 · 原作物价表 · 待拍板-奖励梯度
design/90-历史归档/     旧版设计 · 旧版总览 · 日报
design/原作/            小说原文 + 原始数据表（不入库）
```

**单一真源**：公式进模块文档，数值进《数值真值表》，产出进《产出登记表》，
其他文档只链接、不复制。详见 README 顶部的「单一真源」表。

**要谈数据先看 [`design/30-数据与决议/数据定案.md`](design/30-数据与决议/数据定案.md)** ——
本命/同参/灵地/功法/品阶的条目，以及 C/D/E 三组决议（物品池、容量、封地建筑 21 种、灵岩池）。

**改设计时注意**：`design/` 里跨文档的相对链接在移动文件后要一起改。
《当前实现》和《模块一》是「主状态」与「主设计」，多数改动要同步这两份。
