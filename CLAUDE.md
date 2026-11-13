# 多子多福：开创仙朝 — 项目约定

放置修仙游戏。基于开源项目 `setube/vue-idle-xiuxian` 二次开发，以小说《多子多福：开创仙朝》为世界观。
**Vue 3.5 + Vite 6 + Pinia 3 + Naive UI 2.41**。分支 `duoziduofu`（`main` 保持上游原样）。

> **实现细节 / 代码约定 / 15 条坑 / 验证 / 部署 / 提交远端，都在
> [`design/00-总览与状态/开发手册.md`](design/00-总览与状态/开发手册.md)。**
> 本文只留：启动方式、命令、进度速查、硬口径、改动影响地图、文档索引。
> **改代码前先看「改动影响地图」，不要整份重读设计文档。**
> **「旧口径 X 已作废」的记录不在这里** —— 查
> [`踩坑与作废口径.md`](design/00-总览与状态/踩坑与作废口径.md)（按需读，不必每次进场）。

---

## ⚠️ 启动方式

**必须在仓库根目录启动 Claude**：`C:\Users\lcn_k\OneDrive\Project\duoziduofu`。
在 `design/` 下启动时，`src/`、`scripts/`、根 `CLAUDE.md` 会被
`blockReadsOutsideWorkingDirectories` 挡在工作区外，每个文件都要确认。
补救：`/add-dir C:\Users\lcn_k\OneDrive\Project\duoziduofu`。自查：`pwd`。

```powershell
cd C:\Users\lcn_k\OneDrive\Project\duoziduofu
claude
```

项目级白名单在 `.claude/settings.json`：`npm run verify*`、`check:docs`、`docs:toc`、
`node scripts/*`、`git status/diff/log/show` 已允许，编辑走 `acceptEdits`；
破坏性 git（`push --all/--tags`、`clean`、`reset --hard`、`filter-branch`）已 deny。
`npx vite*`、`npm run dev`、`node -e` / `python -c` 等一次性代码也已放开
（等于任意代码可直接跑），**改动前自己看一眼命令**。
改白名单后本会话仍弹确认 → 重开会话或看 `/permissions`。

**别给命令加 `cd 仓库 && ` 前缀**：白名单是**前缀匹配**，`cd X && npm run verify`
匹配不上 `Bash(npm run verify:*)`。Bash 工具的当前目录本来就是仓库根；
要别的目录用绝对路径。自查 `npm run enter-report`。

**别把「扫文档 / 扫代码」派给 Explore / general-purpose**：子代理的 Bash 会被自动加
`cd "C:\…" && ` 前缀，复合命令无法静态分析 ⇒ **每次都弹确认**。
要用子代理就用 `.claude/agents/doc-scout.md`（只有 Read / Grep / Glob）；
否则自己 Grep + `Read(offset, limit)`。**不要为了统计行数去跑 shell。**

**管道 / `;` / `&&` / `$()` 一样废掉白名单**：`npm run token-report | tail`、
`git log ...; echo ---` 都不是"以某命令开头的单条命令"，照样弹框。
过滤用命令自带的 `--limit=` / `--since=` / `--filter=`；要串几步就分几条命令跑。

### 验证纪律

- 跑验证 / 探针前，正文先写 **`测试目的：因为改了 X，要确认 Y`**，否则被
  `scripts/hooks/verify-guard.mjs` 拦掉。写不出来 = 这次测试不该跑。
- 入口只有 `npm run verify:quiet` 和 `npm run check:docs`。**工作区没变就重跑会被拦**；
  同样输入连续失败两次也会被拦。
- 一次性探针（`node -e` / `python -c`）**连续 3 次、中间没改文件 → 换法子**；
  有价值的固化成 `verify-all` 断言。
- 破例：Write 往 `.claude/.state/override` 写任意内容，下一条命令放行并自动删除（一次性）。
- 数据入口：`npm run enter-report` 的「工具调用构成」。

---

## 常用命令

| 命令 | 用途 |
|---|---|
| `npm run dev` | 端口 2025，浏览器自动打开（或双击「启动游戏.bat」） |
| `npm run verify:quiet` | **3,564 条**纯函数断言，只打失败 + 汇总（日常必跑） |
| `npm run verify` | 完整输出（约 55KB，别日常用） |
| `node scripts/verify-all.mjs --list --filter=宝匣` | 列出匹配的断言标题（`--quiet` 只跑） |
| `npm run check:docs` | grep 旧口径 + 坏链接，1 秒出 |
| `npm run docs:toc` | 刷新大文档顶部行号目录（`--check` 只检查） |
| `npm run token-report` | 会话 token 花在哪（`--all` 看全部项目） |
| `npm run enter-report` | 「为什么按 ENTER」：手动确认 / 白按 / 真实缺口 |
| `node scripts/shot.mjs --url=… --out=…` | 无头 Chrome 截图验收（`--w/--h/--wait`） |
| `python scripts/import-anims.py` | 素材/SS → `src/assets/anim`（需 ffmpeg） |
| `python scripts/build-items.py` | 掌门路 xlsx → `items.data.js`（日常不用跑） |
| `npm run build` | 生成 `docs/`。**开发期别用** |

**开发期验打包**：`npx vite build --minify esbuild --outDir .buildcheck`，验完 `rm -rf .buildcheck`。
**只推 `duoziduofu` 分支**：`git push --all` / `--tags` 会把 `main` 和上游 tag 一起推上去。

---

## 当前进度（截至 2026-11-10）

| 模块 | 设计 | 代码 |
|---|---|---|
| A 期地基 | — | ✅ |
| 模块一 · 修行与突破 | ✅ | ✅ 连乘 + 30 级境界表 + 门槛 0.15/0.26/0.35/0.40/0.76 + 十六档品阶分 + 心法等级进门槛 + 取最高（P56-a）+ **丹论（2026-11-06）** |
| 时间系统 | ✅ | ✅ 练气 1:1 + 筑基后 24×（在线）+ 离线按境界两套 |
| 模块二 · 多子多福（含内宅） | ✅ | 🟡 最小闭环 + 成长/繁育/软上限 + 子嗣修炼/历练/工作 + 子嗣页 + 家族树 + 寿命 + 词条 v2 + 修炼位 + **B17-a 孕产模型（2026-11-10）**；派遣/分封待做 |
| 模块四 · 封地经营 | ✅ v2 | 🟡 a/b 段：22 栋 / 删民心 / 人口徭役 / 中间产物仓 / 分段定价 / 三链 + 市集；c 修炼位 + 传功阁 ✅ · d 全景图 ✅（2026-11-05）|
| P10 · 桂冈的一天 | ✅ | ✅ v1（巡视/练功/炼体/互动/睡觉 + 双资源）|
| 三大挂机 · 镇守/探索/秘境 | ✅ | 🟡 探索 + **筑基四图（B9-a）+ 金丹四图（B16）** + 子嗣历练 + 叙事弹窗 + 首破公式；动画与镇守数值待做 |
| 模块五 · 任务战斗 | ✅ | 🟡 飞鹰门（贡献点 + 周任务 + 秘库 + 老九 + **职位/俸禄 B8-a**）；大库 / 兼职待做 |
| 模块六 · 经济交易 | ✅ v2.3 | 🟡 货币 v4 + 宝匣重定价 + 坊市 + **俸禄双轨（B8-a）**；订货 / 商队未做 |
| 模块七 · 百艺科技 | ✅ | ✅ **B11 全批**：炼器 v2 + 炼丹/制符/炼阵 + 秘境消耗品 + **乡间自动百艺（2026-11-08）** |
| 模块八 · 事件叙事 | ✅ | 🟡 v1 落点 = 探索叙事弹窗；正式内容未做 |
| 模块九 · 离线结算 | ✅ v2.1 | ✅ 已落地 |
| 模块十 · 门派政治 | ❌ 废案 | — |

**设计 vs 代码**以《[当前实现](design/00-总览与状态/当前实现.md)》为准；待办见《[下一步](design/00-总览与状态/下一步.md)》；
产出见《[产出登记表](design/00-总览与状态/产出登记表.md)》。**施工顺序唯一真源 = 《下一步》顶部的排序链。**
已完成批次的正文在 `design/90-历史归档/落地记录/`，**不在本文件**。

---

## 当前硬口径（别改错）

### 边界与门槛

- **可玩边界 = 练气十层**。**筑基正路 = 功法 + 同参**：飞鹰阁功法栏（练气八层开放，
  池 = T1+T2 心法 24 本、整本 200~300 点、排除已学、**全随机不保底**）买《万兽御器经》
  （`0.26 + 0.40 = 0.66`）× 猪妖系同参 62.3% = **0.411 > 0.40**（余量 2.8%，
  断言 `verify-harmony`「换万兽御器经」）。二阶宝匣 5% 升阶开出三阶同参
  （`0.6 × 0.849 = 0.509`）只是**备选路**。早期路线：三层吕氏 0.206 / 六层《兽器双修经》
  0.325（探索「无字石碑」得）/ 九层猪妖系 0.374。**不保底是预期行为，不是可达性问题**。
- **境界表 = 30 级**（P61）：练气 10 + 筑基 10 + 金丹 10（代码 `tier: 'core'`）；外功同构。
  **元婴 31~40 未落地**。三条硬口径：① **段总量守恒**（练气 22,070 / 筑基 145,000 /
  金丹 720,000；外功 17,680 / 116,000 / 576,000），改曲线必须三段各自求和不变；
  ② **大门层号**：练气 3/6/9、**筑基 11**、**金丹 21**，`LAND_GATES` 跟着改；
  ③ **凡是「拿 level 当量级」的公式必须先过 `realm.powerLevelOf` 映射回 18 格等效刻度**，
  不要直接乘 30 级层号。老档走 `persistence.migrateRealmScale`，`realmBreakthroughs`
  **键是层号，必须一起重映射**。
- **门槛 = 0.15 / 0.26 / 0.35 / 0.40 / 0.76**（《模块一》§6.1）。心法等级加成
  `0.0025×(等级−1)` 进品阶分，**熟练度那一项已删除**。**金丹槛 = 兽器同源经 × 本命原物 1.0**
  （0.76 × 1.0 卡线）。
- **心法取最高**：契合 = 已修心法取 max + 通用加成（封顶 +0.05）。池的准入 =
  **已练过（`practiceSeconds > 0`）∪ 主修** —— 未练过的已知心法不进池。真源
  `harmony.js` 的 `qiArtPoolOf` / `bestQiArtOf` / `universalBonusOf`。
- **同参契合 = 三层标签重合度**：`Σ(交集权重)/Σ(本命权重)`，顶层 1.0 / 中层 0.4 / 底层 0.25；
  **同一件 = 1.0、非原物封顶 0.95、撞不上 = 0（无保底）**；顶层可走一跳关系。
  引擎 `tagHarmony.js`，数据 `itemTags.data.js`（`npm run tags:build`）。**别按名字 / 器型判定。**
- **筑基 / 九层的门 = 双轨**：宝箱/秘境看脸（概率不改）+ 秘库兜底。秘库练气八层开放，
  功法栏（心法整本、全随机、不保底）+ 同参底材栏（按段 10~12 件、**限购 1 件/月/段**）；
  《万兽御器经》不限购。月刷 3~4 件 200~300 点 · 残页 3×600 · 刷新 50→100→200→400。

### 经济与门阀

- **货币 = 单字段总账 v4**：`currency` 三字段 `{ secular, spiritual, strategic }`，
  `spiritual` 存**总一阶数**；100 一阶 = 1 二阶、800 二阶 = 1 三阶**只用于显示拆分**、
  账本自动进位。老档按 1/100/80000 无损耗合并（`currencyVersion: 4`）。
  产出口走 `addCurrency(..., 'spiritual')` / `gainCurrency`，**数值口径一律按一阶**。
- **物价单位 = 游戏月**（A2）：二阶物价按「该段 1 游戏月可支配收入」锚定（俸禄现银 +
  探索/秘境，不含挂账）。**时钟加速只压缩现实时间，不乘 24×/168×**。跨段价差只来自
  每游戏月收入（约 2~10 倍）。真源《模块六》§1.3/§九 · 《模块四》§10.7。
- **俸禄 + 飞鹰阁（B8-b 2026-11-06）**：下柱 **833** / 中柱 **1,500** / 上柱 **2,500 二阶/月**；
  升职只看**累计贡献 17,000 / 240,000**。**90% → 贡献点（`faction.contribution`）
  + 10% → `faction.withdrawable`（二阶、无上限、手动提现）**。秘库 + 大库合并成 **飞鹰阁**
  （只收贡献点、**功法 3 + 物资 6 共 9 库位**、只限库位不限购）。法器价
  **117/347/1,300/4,680/14,976**，灵兽同价、灵材/灵植 ×10%；老九 **预扣 500、按货架价 ×2
  多退少补、固定 1 件**。练气按月、筑基后每游戏年发一次（`plugins/salary.js`）。
- **飞鹰门全部按「现实秒」记账**：锚点 **96 现实秒 = 1 游戏天**，刷新/月刷/老九倒计时走
  `faction.realSeconds`。**筑基后 24× 不加速飞鹰门**。真源 `FACTION_SECONDS_PER_DAY`，
  **别改回 `clockGameTime`**。一游戏周 = 11.2 现实分钟、一游戏月 = 48 现实分钟。

### 时间与离线

- **时间锚点**：练气 **96 现实秒/游戏天**；筑基 24× ⇒ **4 秒/天**；金丹 168× ⇒ **0.571 秒/天**。
  「1 月 = 48 现实分钟」是名义值，实际 34~42 分钟。真源 `gameClock.TIME_SCALE_BY_TIER` +
  `timeScaleOf(tier)`，判据 `realm.realmTierOf()`（`qi/foundation/core`，无 `nascent`）；
  `isAscendedLevelOf` **只保留「筑基以上」语义，不要当时钟分界点**。
  **时钟按 15 游戏分整步推进**（`GAME_STEP_SECONDS = 900`）；倒计时向下取整到 15 分档
  （`formatCountdown`），静态时长用 `formatDuration`。元婴 720× 是占位。
- **离线结算**：上限单位 = **现实 4.8 小时**（原则 A），**已抬到目标态 180 / 4,320 / 30,240**
  游戏天（R34 聚合引擎，2026-11-11；过渡值 1,500 作废）。
  **块步长 = 练气 1 / 筑基 7 / 金丹 180 游戏天**（`OFFLINE_TUNING.blockDays`）：
  内宅日结 / 药浴池 / 子嗣修炼 / 家族工作按块结算、产出乘块长；**封地块内仍逐日算**
  （仓满刹车），但复印 / 钱袋 / 落盘块首块末各一次（P62 步骤 1，`OFFLINE_TUNING.estateBlock`）；
  **封地延迟账户 = 当天收入次日可用**（块末写回 `available`，不是「期初 + 全部收入」）；
  **凡人岗位四类产出落点** = 现银直给 / 灵植与法器块末 / **灵石在封地块结算之后入账（下一块才花）**
  —— 真源《模块九》§3.6；
  **内宅活跃索引**（P62 阶段 C）= 重放开始 `beginOfflineCourtIndex()` 建桶一次（修士 / 历练 /
  繁育 / 在岗 / 凡人事件线），块间成员不变；**索引是模块级变量、不进 Pinia state，
  只能用 action 读，绝不能写成 getter**（computed 会把非响应式值缓存一辈子）；
  **凡人寿终按真实死亡日（出生 + 寿元）判、家族工作与繁育按存活天数收尾结清**，
  修士寿终仍块末实时判；人口 `aliveCount` 增量维护，块末传给封地 —— 真源《模块九》§3.7；
  **桂冈日常循环只在块首完整跑 1 天，其余天按「一天产出模板」逐天补发**
  （`applyOfflineDayTemplate`：修为 / 灵兽 / 炼体轮 / 百艺轮 / 晚间互动，材料与药力照常扣，突破即停）。
  真档（1,436 子嗣 / 4.7MB）实测：逐日 214 秒 → 块结算 14.8 秒（1,500 天）→ **54 秒（30,240 天）**。
  **这是有意为之的近似**（诞生按块末、日间波动被抹平；凡人寿终自阶段 C 起已按真实死亡日），不是 bug。
  `maxWindows` **必须 ≥ 最大配额**（现 32,000）。**别把「金丹挂一晚只收 14 分钟」再写回文档。**
- **离线材料账本 + 块内批量（P62 阶段 D，2026-11-13）**：镇守块**块首**扫一次背包建索引
  （`plugins/arts.js` 的 `beginOfflineMaterialBag`），百艺 / 乡间自动 / 药浴只扣账本，
  **块末** `takeUnits` 一次写回；开关 `OFFLINE_TUNING.materialBag`。
  **不变量 = 块内背包材料只减不增**：自动百艺成品不是材料、凡人灵植仍按块末入包（下一块才可见，
  有意为之）；探索 / 秘境线**不开账本**（背包会进料）。
  日常循环其余天走 **`applyOfflineDayTemplate` 块内 N 天批量**（修为按到封顶天数切、
  炼体 `k × 轮数`、百艺 `advanceArtDays`、晚间 `次数 × k`），**唯一失效条件 = 本块内突破**；
  开关 `OFFLINE_TUNING.dayLoopBatch` 退回逐日版。
  **块首必须 `rebaseOfflineDayLoop` 重锚 `lastSeconds`** —— 否则 `stepDay` 会把跨块的
  ~9 天当成 1 天模板再乘 `blockDays−1`，离线镇守产出会被高估一个量级（R34 遗留，D2 修）。
  真源《模块九》§3.8。
  规则：只走结算天数 / 100% 平 / **三挂机严格三选一** / 子嗣历练与家族工作全量参与 /
  **满足即自动突破、修为卡 100% 不溢出** / 宝匣进背包不开 / 叙事 20 秒自动善意 / 自动取名 /
  讣告按计数聚合 / **唯一暂停点 = 子嗣陨落**。
- **`maxCultivation` 是有效上限，`baseExp` 是裸值**：`maxCultivation` = 宪法 §2.1
  「游戏内累计」重标后的门槛（进度条分母）；`baseExp` = 原始 `CULTIVATION_CURVE`。
  **子嗣升级与灵兽同修必须读 `baseExpOf(level)`**；**段总量守恒断言也读 `baseExp`**。
  老档走 `persistence.migratePaceScale`（`paceVersion` 3 = 仙龄锚重标）。
- **外功有自己的 `OUTER_PACE`**：口径 = **外功每级现实耗时 = 内功同级**，
  `OUTER_PACE = 5 轮/天 × gain × 内功目标天数`。**`gain` 不决定节奏**，只影响体魄与 PACE 量级。
  改 `BATH_PARAMS.gain` 或内功 PACE **必跑 `npm run sim:body`**。
- **`INNER_PACE` 按「仙龄锚」标定**（`realm.js`，真值表 §2.4c，`npm run sim:pace`）。
  改曲线 / 灵地产出 / 速度公式 / 基准 Fit / 时钟倍率必跑。
- **`saveData()` = 标脏 + 5 秒节流**（`plugins/saveThrottle.js`）。需要立刻落盘必须
  `saveData({ force: true })` 或 `await flushSave()`：关页/切后台（**状态没变也要写**）、
  读档路径的迁移与离线结算、导出前。写盘只有 `persistence.persistSnapshot()`。
  加密 = WebCrypto AES-GCM（`vux2:` 前缀），老档 CryptoJS 只读不写；换加密**不升 `SAVE_VERSION`**。

### 封地与日常

- **封地 v2 a 段**：**22 栋**，解锁由乡侯府 Lv1~5 卡（《模块四》§十六.1）。**民心整条删除**。
  **灵田/药圃/矿场只产中间产物**（粮 4 / 灵植 3 / 矿石 4，每天每级；炭场只提速），进
  `estate.storage` **独立仓**（上限 500/种、满仓停产、不进背包/钱袋）；产出只乘
  `(24+S)/24`。**封地产出绝不叠 R07**；家族工作仍是直产。
- **封地仓 → 背包「取回」**（2026-11-11 · P36 链头）：**只有灵植能取回**（物品池没有粮/矿石
  品类），一次 **10 件**，铸成 **本段阶 + 中成色 + 五系按药力缺口**的实例进背包，供药浴 / 炼丹；
  免费瞬时、不进日结。丹炉照旧吃仓、仓满刹车不变。真源 `estate.planStorageWithdraw`。
- **封地人口与税收**：村民 5,600，上限随乡侯府 5,600 / 7,500 / 10,000 / 14,000 / 20,000，
  年增 2.5%（按天复利）；**总人口 = 村民 + 活着的子嗣**；**徭役 = 总人口 × 25%**。
  税收 = `总人口 × 0.12 一阶 × 2^(乡侯府−1) × (1 + 繁荣/100)`，Lv2 起 `+1/30 每日 ×(24+S)/24`、
  每月最多 1 次；**进 `currency.spiritual`，不进大子**。
- **徭役 = 逐项分配、先开工优先**：真源 `estate.js` 的 **`laborPlanOf`**（`laborSatisfactionOf`
  只做展示，**不参与推进**）。按 `job.seq` 先开工先拿满，单项 `分到/需求 ≥50%` 才推进
  （50~99% 线性），够不到的排队、不占徭役。**别再回到「全体共用满足率」。**
- **封地价格与工期**：`incomeStone2ByRealm` = 练气 88 / 筑基 700 / 金丹 3,000（占位）二阶每游戏月
  × 档位 0.3/0.6/1.0 × 每级 ×2；**报价下单时快照**。工期 4/6/10/24 游戏月
  （快子峰木屋 6/12）；徭役 = 目标等级 × 200；**首建 0 成本、工期 = Lv1→2 的一半**；
  付款与进度同速；成本二阶×100 记一阶。
- **封地经营链**：酒坊 4 粮→2 灵酒 / 丹炉 3 灵植→1 灵丹 / 工坊 4 矿石→1 法器（每级/天）。
  **市集是必建闸门**（乡侯府 Lv2；没建 ⇒ 三链停摆）。成品**即产即卖**进 `currency.spiritual`，
  **不占背包、不进回收口**。基础价 6/24/96 一阶 × 2.0 × 市集系数（1.0/1.2/1.4）。
  **生产者 Lv5 会超过消费者 Lv3 吞吐，仓满停产是预期行为。**真源 `estate.js` 的
  `PRODUCTS` / `CHAIN_LINKS` / `chainViewOf`。
- **巡视加速 = `(24+S)/24`**：只有巡视时段 ×2，S = 当天实际巡视小时。
  `patrolFactorOf` 是唯一算法；store 必须**先用 `patrolSettledInWindow` 门控再读
  `patrolHoursOfDay`**。税收金额不变，只改进度入库时点。
- **小循环 = 06:00 + S 开工，18:00 硬下班，`L = 12 − S`**。`patrolEndSeconds` 就是起点，
  **没有「候工」段**。巡视时长是今天的快照：「今天还在跑」→ 拖短当场结束；「已跑完」→ 只改明天。
- **筑基后「小循环退场」是 UI 层**：引擎照跑（与离线同一条路），Day 页隐藏实时卡片，
  改显示**「昨日战报」**（`dayLoopLastReport`，独立字段，**不能放 `dayLoop` 里**，
  `resetDayLoop()` 会置 null；空账不覆盖）。**别再写一套日聚合结算**；24× 下禁用睡觉快进。
- **`dayLoop` 所有任务的结束时刻必须是「当日 06:00 的绝对函数」**：读档接手时
  `taskStartSeconds` 锚到本段真正起点，不能锚接手时刻。
- **筑基后 24× 探索：叙事不弹窗、单次进度条不显示**。`advanceExploration` 直接走
  `narrative:'auto'`，按 `autoChoice` 入账；**叙事 20 秒超时按境界换算游戏秒**
  （练气 900 / 筑基 21,600）。

### 内宅与子嗣

- **仙龄刻度 = 365 游戏天/岁**（练气 1:1）。子嗣与妻妾两条轨全拉平，**仙凡同龄是预期行为**。
  成长边界 `[0, 3650, 5110, 6570, 10950]` = 启蒙 0 / 上工 10 / 婚配 14 / 成年 18 / 中年 30，
  **启蒙 0 岁是 1:1 的前提**。**不设胎数上限**（产量由终身胎数 B → 休养期收住）。
  老档 `rebaseBirthTimeOf`，幂等靠 `ageScaleVersion`（`AGE_SCALE_VERSION = 10`）。
  **改刻度三处一起改**：`growth.daysPerAge` + `boundaries` / `lifecycle.daysPerYear` +
  `cultivatorDaysPerYear` / 迁移公式。**经期已取消**，`TUNING.cycle` 任何判定都不准再读。
- **受孕率 = 直接给值（2026-11-12 换锚）**：凡人 **30%** / 练气 6.9% / 筑基 3.6% / 金丹 0.85%
  每次留宿，**好感、手动/自动、奖励期都不参与**。产量不看 p，看**终身胎数 B**
  （24/12/8/4）→ **休养期** `recoveryDaysOf`（234 / 1,439 / 4,483 / 25,837 天）。
  奖励期（前 5 个灵根子嗣）**只压孕期 90/10**。孕期 280（250~310）。
  `recovering` 的 UI 文案是「休养」。**别再按 B 反推 p，也别把 p 当产量闸门。**
- **人口上限只管子孙**：全族上限 626 / 1,500 / 2,400 / 3,200 只拦**子嗣婚配/受孕**。
  **桂冈与侍妾永远不受限制** —— `interactEvening` / `wifePregnancyChance` 里
  **不准再出现 `offspringAtPopulationCap`**。桂冈那条线的刹车 = **侍妾育龄窗口**
  （`wifeHasRoomOf` 只判育龄）。**筑基后诞生一律自动取名、不弹窗**（`birthSilent`）。
- **内宅留宿只在镇守跑**（三选一）：探索 / 秘境 / 养伤期间 `advanceDayLoop` 冻结 ⇒
  晚间互动不结算，页面必须显示「桂冈在外」或「养伤中」，**不能显示「今夜未留宿」**。
  筑基后 UI 用 **`innerCourt.weekly`**（每游戏周 7 天）汇总；**按事件时刻分桶**
  （`weekly = { version, buckets[week], seen[week] }`，记录一律传 `atSeconds`），
  **不要用「单一本周累加器」**（离线事件乱序到达会记错周）。`version` 不对整份重置（现 2）。
- **子嗣寿元**：凡人 80 / 练气 120 / 筑基 200 / 金丹 500 仙龄岁 + **±5% 稳定随机**
  （`FNV-1a(id+name)`），按境界实时同步；预告线 = 90%。**先修炼突破、再判寿终**；
  读档在 `realmLevel` 回填后判一次 —— **存量成批寿终是预期行为**。死前摘 `job` / 历练 /
  `run.party`，**数组条目不删**（家族树要读）。「活着」唯一口径 = `isAliveOffspringOf`。
  陨落返词条走 `legacyTraits`，**凡人不返还**。
- **子嗣修炼曲线**：日增 = `2 × 1.2^(层−1) × k 0.80 × 灵根系数 × (1+同参) × b`，
  升级所需 = 桂冈同层上限，**加税按段两档**（筑基 ×7.8 / 金丹 ×39.6），封顶 30 级。
  灵根系数 `{1:1.0, 2:0.68, 3:0.4, 4:0.13, 5:0.04}`（跨度 25 倍）。
  **改系数/加税必跑 `npm run sim:offspring` 并同步方案 §4.4.2**；校准表在真值表 §5.7。
- **修炼位 = 50 + 快子峰木屋等级 × 25**。**木屋未建也照给 50**。排序 = 灵根降序 → 境界降序 →
  出生早 → id；**超出的当日不涨、不攒不补**；**历练中与满级不占名额**。
  真源 `cultivationSlotsOf` / `compareCultivationPriorityOf` / `pickCultivatorIdsOf`。
- **上工门槛 = 10 岁**（`familyJobs.minAgeYears` 必须 ≤ 10）。
  ⚠ 练气 1:1 下「上工 10 岁 ≈ 4.1 现实天」，不是 4 小时。
- **子嗣的同参 = 家族配给**：从背包/已装备/出战灵宠/开局五件里按子嗣自己的本命标签挑最高，
  **不消耗、可共享、无保底**。真源 `offspringCompanionFitOf`。
- **子嗣词条进日增**：日增 = 基础 × 灵根 × (1+同参) × (1+灵地) × **(1 + 软上限(Σ词条, 子嗣境界 cap))**；
  `legacyTraits` 与子嗣加成**合并成同一个 raw 再套一次 cap**，只落 A 类。
- **子嗣取名 = 姓 + 千字文辈分字 + 单字名**：辈分 1 天 / 2 地 / 3 玄 …（`洪` 撞姓跳过），
  同代不重名；**老档不改名**，单字池用尽退回「桂天 + 序号」。
  真源 `GENERATION_CHARS` / `generationCharOf` / `randomOffspringName`。
- **有喜叮各境界都弹**，走 **8 现实秒合并窗口**（`emitDing` / `DING_MERGE_MS`）；离线只进报告。
- **侍妾池按境界整池切换**：练气 P1–P3 凡女 20 金页子；**筑基 P9 练气女修 6 二阶**；
  金丹 P10 / 元婴 P11+ **挂起**（不编获取途径）。真源 `shop.js` 的 `TUNING.maiden` /
  `maidenPoolOf` + `innerCourt.generateMaiden({ ascended })`。

### 物品、功法与战斗

- **词条数值 = 每条自己的 `effect`，稀有度不换算**。读数值只走 `traitEffectOf` /
  `traitEffectSumOf` / `traitArtOf`（通道 `cultivation`/`combat`/`specialty`/`job`/`art`，
  `null` = 闲趣）。**`grade` 只管抽卡**。数值：修行/战力/功法 1%/2%/4%；岗位 +10%；
  专精 ×1.2/×1.1。**子嗣专精只管装备**，取最高不叠乘。`TUNING.bonus.traitCoef` 已删。
- **功法库 90 本**（`QI_ARTS`），四阶四品十六档（`qi_low`…`nascent_peak`），
  品阶分 `TUNING.qiArt.gradeScore`（0.20~0.50）。**心法不直接加修炼速度**（`0.98 + 0.32×Fit`）。
  **只有心法有残页**；秘库功法栏只卖心法。真源 `design/20-系统设计/功法系统.md`。
- **功法升级曲线 = `100 × 1.5^(层−1)` 游戏小时/级**；等级上限 T1 10 / T2 15 / T3 20 / T4 25。
  老档 `migrateQiArtPace` 保留层数与层内进度。改曲线必跑 `verify-harmony` 功法曲线断言 + 门槛验算。
- **非心法效果**（`plugins/artEffects.js`）：法术→攻击 / 身法→速度 / 炼体→气血+防御（2:1）/
  器诀→装备百分比。`coef = 1.12^score`、满级 = `categoryBase × coef`（5/5/4+2/4%）、
  按级线性、同通道先加总再套软上限（cap 攻击 80 / 速度 60 / 气血 80 / 防御 80%）。
  **只有桂冈吃，子嗣吃不到、不进契合度/门槛**。器诀与专精同区加算，器诀没有 cap。
  数值整表真值表 §5.10b。
- **掉落阶按境界段，不按地图阶**：练气 一/二阶、筑基 二/三阶、金丹 三/四阶；
  地图只给段内高阶概率 0/30/60/90%。**练气永远不掉三阶是预期行为。**
- **探索 = 十二图三段**：练气 1/3/6/9 + 筑基 11/14/17/20 + 金丹 21/24/27/30，
  每图 16/17/18/18 条、全库 **12 图 / 207 条**。灵石 = 飞鹰镇外 ×
  `realmCoefAt(minLevel)/realmCoefAt(9)`；段内涨头靠**物品阶**不靠灵石。
- **秘境结算面板显示「整趟」**：读 `run.lootTotal`，`segment.loot` 只是那 5 层的账。
  离线内层循环必须 `run = segment.run`（`runSegment` 不改入参）。
- **秘境难度加成 = 开箱 pick+1**（段内 1–4/5–8/9–10 → +0/+1/+2），**宝匣个数恒定**。
  存储 = `inventory.chests[tier]` 记总件数 + `chestBonus[tier][bonus]` 记带加成的几件，
  开箱 `chestOpenPlanOf` 按加成从高到低取。**50 层首杀高一阶宝匣不给加成**；老档不迁移。
- **宝匣「灵材」池 = 灵材箱**：抽到灵材掉 1~5 阶箱，一箱开 4 件同阶（尽量不重样）。
  开箱口 = 背包页「一键全开」。箱子不可回收 / 不进本命池 / 不可装备；`MATERIAL_BOXES`
  **不进 `ITEM_POOL`**。产出约 ×4（R60）。**灵材是药浴唯一料源**，重算供料上限时要计入。
- **灵植 / 灵材是「一条带 `count`」的堆**（`plugins/stacks.js`）：合并键 = `baseId + 成色`；
  掉落灵器/灵宠**一律不合并**，固定配方产物合并（`isCraftedClone` 排除强化过）。
  加物品走 `gainItem` / `gainHerb`，扣数量走 `takeUnits` + `planFromUnits`，
  读件数用 `unitsOf` / `countUnits` —— **`items.length` 是条目数不是件数**。
  穿/卸/卖炼器产物**按件**处理（`_takeOneUnit` / `instanceOf`），别整条挪走。
- **百艺 = 四艺**：炼器开局送，炼丹/制符/炼阵拿到第一张残页即解锁；一阶配方免残页，
  **二阶起集齐 `5 × 配方阶` 张自动学会**。**配方阶 = 境界段，产出阶 = 配方阶 + 1**。
  **炼阵没有一阶配方、整表从筑基起**；制符只用叶/藤。**所有配方 `skill = 0`**。
  产物可堆叠、**可回收**（基础价 × 30% = 一阶 2 / 二阶 7 / 三阶 29，不按段重标）。
- **乡间自动百艺 = 四栋建筑、两条料路**：丹炉/工坊吃封地仓，符坊/阵堂扣背包；
  **每级每天 1 件** × `(24+S)/24`，**配方轮数不影响乡间**。乡间产本段阶、桂冈个人产高一阶。
  **R53 经营链只剩酒坊一条**。⚠「乡侯府等级卡附属建筑上限」**仍未落地**。
- **秘境消耗品 = 三层槽位、自动、从背包直扣**：丹药每 5 层 1 粒 / 符箓每层 1 张 /
  阵法整趟 1 份；**出发不预扣**，每段结算按 `consumed` 实扣；**扫荡不消耗也不吃 buff**。
  **丹药的 `health` = 生命上限，不是回血**。**消耗结算不用 rng**。`runSegment` 不碰背包。
- **灵兽面板唯一真源 = `plugins/petUnit.js`**：白板 × 成色 × 境界系数；等级靠同修（50%）。
  不要再从 `petEssence` / `star` 读数。**读档必须 `relinkActivePet()`**。
- **装备白板是几何 ×3/阶**（T1 5 → T5 405）。改白板必须重跑 `sim:realm` 并重标
  `realmScale`（现 **8.4**）。
- **两个本命是三阶**（`dao_back_boar` / `taotie_jade`）：能在筑基段掉到，金丹门
  `0.76 × 1.0` 的落点。
- **凡俗物品 = 杂物**：`tier:0`、无属性、不可装备、**禁止进本命/同参池**；回收 30 大子/件。
- **回收价 = 基础价 × 30%，不按境界段重标**（A2 结案）。宝匣阶价（2026-11-01 重标）：
  **148 / 444 / 2,000 / 7,200 / 23,040 二阶**，位置不变；金丹段等 B16 实测后只调四阶一档。

### 工程与 UI

- **丹论 = 结丹三选一弹窗**：金丹一层突破后弹一次、**暂停时钟、不可关**；27 条候选按存档行为
  生成，**0 数值**，写 `player.danLun`；老档不补弹。**`unlockedLocations` 是死字段**，
  数「走过几张图」只认 `visitedLocations`。
- **视觉层唯一色源 = `src/styles/tokens.css`**（V1.2 两套 `--ui-*`）：业务代码只写
  `var(--ui-*)`。排版原子放 `src/styles/ui.css` —— **tokens.css 只管色值，ui.css 只管用法**。
- **通知只准四档**：静默 / 红点 / 横幅 / 居中弹窗（弹窗只有五类）。未解锁入口**必须灰显**。
  **寿终讣告与子嗣陨落走第 2 档横幅**，同次结算合并一条。
- **突破提示 = 第 3 档弹窗**（`BreakthroughNotice.vue` + `plugins/breakthroughNotice.js`）：
  **不暂停时钟**；连升多级合并（`batchId`）；**离线只进报告**。
  改这里同步真值表 §5.10 与开发手册 §二。
- **任何新增/减少产出都要先登记**（《产出登记表》），再按宪法第二章重算门槛，最后改代码。
  **收益减少也要登记**。
- **看起来像 bug 的预期行为**（内宅不暂停、老档多 8 位侍妾、探索切页继续、巡视无产出……）
  见《当前实现》§四，**先查再修**。
- 兽/器 5 本功法：练气篇 3 本可由探索获得；筑基《万兽御器经》走飞鹰阁、金丹《兽器同源经》
  仍无来源。子嗣加成是修炼速度侧线，不是门槛。

---

## 改动影响地图

> **改之前先看这一行，别整份文档重读。** 只读表里列的文件；
> 改完跑 `npm run verify:quiet` + `npm run check:docs`。

| 改动类型 | 必看 / 必改 | 断言 |
|---|---|---|
| 本命 / 灵根 / 词条 / 子嗣加成 | `plugins/innerCourt.js`（`TUNING.bonus` / `rollOffspring` / **`traitEffectOf` / `traitEffectSumOf` / `offspringBonusOf` / `offspringTraitBonusOf`**）· `innerCourtData.js`（`TRAIT_POOL.effect`）· `secretRealm.js`（`buildOffspringUnit`）· `items.js`（`rollFateSet` / `clampFateTiers`）· 模块二 §6.2/§9/§15.5.4 · 真值表 §5.1/§5.7 · 产出表 R07/R39/**R44** | `verify-harmony` 8d/§9.2 · `verify-idle` · `verify-items` §五 |
| **仙龄刻度 / 子嗣成长 / 寿元 / 寿终** | `innerCourt.js`（`AGE_SCALE_VERSION` / `lifecycle` / `offspringLifespan`·`lifespanJitter` / `growth.daysPerAge`+`boundaries` / `workStage` / `rebaseBirthTimeOf` / **`offspringLifespanOf`·`offspringAgeYearsOf`·`isAliveOffspringOf`·`formatOffspringObituaryOf`**）· `stores/modules/innerCourt.js`（`migrateAgeScale` / **`settleOffspringLifespan`·`noteOffspringBreakthroughs`·`grantLegacyTraitsOf`**）· `notice.js` · 模块二 §7.1/§15.5/§16.1 · 真值表 §5.7 · 产出表 **R30/R35/R39** | `verify-harmony`（§8b / 迁移 / 寿元 / 讣告） |
| **子嗣修炼曲线 / 灵根系数 / 修炼位** | `innerCourt.js`（`offspringCultivation.rootCoef` / `costBump` / `maxLevel` / **`slots`** / `offspringLevelCostOf` / **`cultivationSlotsOf`·`compareCultivationPriorityOf`·`pickCultivatorIdsOf`**）· `stores/modules/innerCourt.js`（`offspringCultivationSlots` / `advanceOffspringCultivation`）· `views/InnerCourt.vue` · 模块四 §十四 · 真值表 §5.7 · 产出表 R16/R31/**R54** | `verify-harmony` · **`npm run sim:offspring` 必跑** |
| **子嗣取名 / 千字文辈分** | `innerCourtData.js`（`GENERATION_CHARS` / `GENERATION_TABOO_SURNAMES`）· `innerCourt.js`（`generationCharOf` / `randomOffspringName`）· `stores/modules/innerCourt.js`（`deliverOffspring` 传 `generation`）· `BirthModal.vue` · 模块二 §7.5 | `verify-idle`（辈分 / 避讳 / 同代不重名） |
| **时钟倍率 / 24× / 小循环退场 / 离线分段** | `gameClock.js`（`TIME_SCALE_BY_TIER` / `timeScaleOf` / `GAME_STEP_SECONDS`）· `realm.realmTierOf` · `realm.isAscendedLevelOf` · `stores/modules/clock.js`（`syncClockRealm`）· `offlineSimulation.js`（`OFFLINE_PHASES` / **`materialBag` / `dayLoopBatch` 开关**）· `offline.js`（`maxGameDays` / **`blockDays` 块步长** / `settleOfflineBlock` / **块首块末的材料账本**）· **`innerCourt.js` 的活跃索引**（`buildOffspringIndexOf` / `blockWorkDaysOf` / `beginOfflineCourtIndex`）· **`plugins/arts.js` 材料账本 + `advanceArtDays`** · **`dayLoop.js` 的 `applyOfflineDayTemplate` 批量** · Day 页 `dayLoopLastReport` · 时间系统 §2.1 · 模块九 §3.5/§3.7/**§3.8** · 真值表 §0.1/§1.2 · 产出表 R33/R34 | `verify-idle` · `verify-dayloop` · `verify-offline` · `verify-harmony` · `verify-arts` |
| 货币 / 商店 / 价格 | `plugins/currency.js` · `plugins/shop.js` · 原作物价表 · 模块六 §九 | `verify-shop` |
| 封地 / 人口 / 税收 / 建设 / 经营链 | `plugins/estate.js`（建筑表 / 人口徭役 / **`laborPlanOf`** / `incomeStone2ByRealm` / 独立仓 / **`planStorageWithdraw`** / `PRODUCTS` / `CHAIN_LINKS`）· `stores/modules/estate.js`（下单快照 / `withdrawEstateStorage`）· `views/Estate.vue` · 模块四 §三/§十/**§10.7/§十一/§十二/§12.2/§十四/§十六.1** · 真值表 §6.8.4 | `verify-estate` |
| 物品池 / 品阶 / 宝箱 | `plugins/items.js` · `plugins/tiers.js` · `plugins/chest.js`（`openChest` / `chestPicksOf` / `chestOpenPlanOf`）· `secretRealm.js`（`chestBonusPicksOf`）· `stores/modules/inventory.js`（`chests` / `chestBonus`）· 数据定案 §七 · 物品池设计方案 · 宝箱系统 §2.2 | `verify-items` · `verify-idle` |
| **物品数量 / 堆叠 / 存档体量** | `plugins/stacks.js`（**唯一真源**）· `inventory.js`（`gainItem` / `sellItem` / `migrateStacks`）· `arts.js`（`buildCraftedItem`）· `attributes.js`（`_takeOneUnit`）· `autoEquip.js` · `shop.js`（按件计价）· `bath.js`（`planTopUp`） | `verify-items`（§堆叠 51 条） |
| **存档 / 落盘 / 加密** | `plugins/saveThrottle.js`（**唯一真源**）· `persistence.js`（`saveData` / `flushSave` / `persistSnapshot` / 迁移顺序）· `crypto.js` · `App.vue` 的 pagehide · 开发手册 坑 §17 | `verify-persist` |
| 装备 / 子嗣装备 | `plugins/equipment.js` · `plugins/offspringEquipment.js` · `attributes.js` · `stores/modules/innerCourt.js` · 装备系统 §十一/§十八 · 真值表 §5.5/§5.9 | `verify-items` · `verify-idle` |
| **灵兽 / 同修** | `plugins/petUnit.js`（**唯一真源**）· `stores/modules/pets.js` · `inventory.migratePetsV2` · 真值表 §5.8 · 三大挂机 §4.4 | `verify-idle` · `verify-items` |
| **修行 / 契合度 / 灵地 / 门槛** | `plugins/harmony.js` · `realm.js`（`LAND_GATES` / **`INNER_PACE`**）· `tiers.js`（`LAND_OUTPUT` / `LAND_OUTPUT_COEF`）· `cultivationData.js`（`SPIRIT_LANDS` 12 块）· `faction.js`（`STORY_QUESTS`）· `persistence.migratePaceScale` · 模块一 · 真值表 **§2.4c**/§2.5/§7.6 · 数据定案 §4.1 | `verify-harmony` · `verify-faction` · **必跑 `npm run sim:pace`** |
| **同参标签 / 门槛** | `plugins/tagHarmony.js`（**唯一真源**）· `itemTags.data.js`（生成，别手改）· `design/30-数据与决议/物品标签-474.json` + `同参标签关系表.json`（改完跑 `npm run tags:build`）· 模块一 §4.3/§6 · 真值表 §2.8 · 产出表 R25 | `verify-harmony`（§0b/§3/§5）· `verify-items` · **`npm run sim:companion`** |
| **功法库 / 品阶 / 残页 / 秘库 / 取最高** | **`design/20-系统设计/功法系统.md`（唯一汇总）**· `功法表-90.md` · `cultivationData.js`（`QI_ARTS` / `ART_GRADES` / `ART_FRAGMENT_NEEDED`）· `harmony.js`（`gradeScore` / `qiArtPoolOf` / `bestQiArtOf` / `universalBonusOf`）· `realm.js`（`BREAKTHROUGH_THRESHOLDS`）· 模块一 §4.2/§6.1/§8.1 | `verify-harmony`（§0a/§2a/§2b）· `verify-shop` · **改品阶分/等级加成必重跑门槛验算 + `sim:companion`** |
| **非心法效果 / 功法加战力** | `plugins/artEffects.js`（**唯一真源**）· `practice.js`（`nonArtEffects` / `vesselArtBonusMap`）· `attributes.js`（`combatPanel` / `artifactPanel`）· `cultivationData.js`（器诀 `equipType`）· 真值表 **§5.10b** · 功法系统 §四/§8.1 | `verify-harmony` **§8z**（39 条） |
| 日常循环 / 体力 / 精力 | `plugins/dayLoop.js` · 日常循环 §4/§六 · 真值表 Sheet 4 · 开发手册 §六 | `verify-dayloop` |
| **百艺 / 配方 / 乡间自动** | `plugins/arts.js`（**唯一真源**：`RECIPES` / `TUNING` / `planMaterialsOf` / `buildRecipeOutput` / **`buildAutoRecipeOutput`** / `recipeAvailableAtOf` / `fragmentsNeededOf`）· `estate.js`（**`AUTO_ART_LINES` / `autoArtCapacityOf` / `autoArtViewOf`**）· `stores/modules/arts.js` · `views/Arts.vue` · `views/Estate.vue` · `stacks.js`（`craftedClone` / `CONSUMABLE_CATEGORIES`）· `shop.js`（`SELLABLE_CATEGORIES`）· 模块七 §十一~§十三/**§11.3** · 真值表 **§5.12** · 产出表 R55/R56/S06 | `verify-arts` · `verify-estate`（§六之三） |
| **炼体 / 药浴 / 药浴池 / 外功 PACE** | `plugins/bath.js`（**`BATH_PARAMS` 唯一真源**）· `realm.js`（**`OUTER_PACE`**）· `stores/modules/bath.js` · `core.cultivateBody` · `practice.bodyBonus` + `innerCourt.energyMaxOf`（**必须走 `powerLevelOf`**）· 真值表 §2.4d/§5.10/§5.11 | `verify-bath` · `verify-estate` · `verify-dayloop` · **改 `gain` 或内功 PACE 必跑 `npm run sim:body`** |
| 探索 / 秘境 / 三挂机 | `plugins/locations.js` · `exploration.js` · `items.pickBaseItemForEvent` · `secretRealm.js` · `stores/modules/exploration.js` · `inventory.chests` · `practice.learnQiArt` · 探索系统 · 三大挂机 · 开发手册 §七 | `verify-idle` · `verify-items` |
| **五系掉落配平 / 灵材三换二** | `locations.js`（`elementBias`）· `exploration.js`（`lootUnrestricted`）· `items.js`（`pickBaseItemForEvent` 的 `elements`）· `materialExchange.js`（**唯一真源**）· `inventory.js`（`exchangeMaterial`）· `views/Shop.vue` · `新增灵植20.json` + `build-items.py`（**别塞 items.base.json**）· 真值表 §5.11/§5.11c · 产出表 R49/R50 | `verify-idle` · `verify-items`（三换二 9 条）· **改底材数量必跑 `sim:fates` / `sim:companion`** |
| **飞鹰门 / 贡献点 / 秘库 / 老九** | `plugins/faction.js`（**`FACTION_SECONDS_PER_DAY`** / 抽任务 / 货架 / 暗池）· `stores/modules/faction.js` · `views/Faction.vue` · 模块五 §13.2/§13.3 · 真值表 §6.4c · 模块解锁方针 §五 · 产出表 **R36/R37** | `verify-faction` · `verify-offline` |
| 模块二实现 / 代码约定 / 坑 | 开发手册 §二/§五/§八 · 模块二 · 当前实现 §四 | `verify-harmony` |
| **UI 布局 / 分区框 / 颜色** | [`src/styles/tokens.css`](src/styles/tokens.css)（`--ui-*` 唯一色源）· [UI 视觉规范](design/20-系统设计/UI%20视觉规范.md)（V1.2 + `.zone` + 11 条坑）· 开发手册 §二 | 纯 UI；`verify:quiet` 全过即可 |
| **解锁条件 / 锁态入口 / 通知** | [模块解锁方针](design/20-系统设计/模块解锁方针.md)（四档通知）· 开发手册 §二 | 纯 UI + 条件判定 |
| **纯数值小改**（不动规则） | 只改 `TUNING` + `verify:quiet`；**文档收工时一次性同步** | 对应脚本 |
| **规则 / 语义改动** | 先 `npm run sim:fates` 看分布，再改代码 + 断言，最后同步 3~4 份真源 | `verify` + `check:docs` |

**工具**：

- `npm run check:docs` —— grep 旧口径 + 坏链接。
- `npm run sim:fates` —— 本命 / 灵根分布（默认 5 万次，`--n=200000`）。
- `npm run sim:realm -- --solve` —— 秘境阈值反推（默认校准口径：桂冈 + 3 名 T2 中品子嗣；
  `-- --gear=off --lord=off` 复现 P25 裸装老表）。
- `npm run sim:offspring` —— 子嗣成长校准表。`--fit=`（默认 0/0.3/0.6）、`--eff=`、`--trait=`、
  `--bump=`、`--solve`。**改 `rootCoef` / `costBump` / 词条系数必跑。**
- `npm run sim:pace` —— `INNER_PACE` 标定。**改曲线 / 灵地产出 / 速度公式 / 基准 Fit / 时钟倍率必跑。**
- `npm run sim:body` —— 外功 `OUTER_PACE` 标定（`--md` 出表、`--div=N` 试算）。
- `npm run sim:k` —— 历史口径，已被 `sim:pace` 取代，只留作对照。
- `npm run docs:toc` —— 大文档行号目录；读大文档按目录用 `Read(offset, limit)`。

---

## 单一真源（速查）

| 想改什么 | 真源 |
|---|---|
| 公式 / 规则 | 对应模块文档（`design/10-模块设计/`） |
| 数值 | [`数值真值表.md`](design/00-总览与状态/数值真值表.md)（**索引 + 8 份分册**，节号不变；先查索引的「节号 → 文件」表，再按分册 TOC 取节） |
| 产出 | [`产出登记表.md`](design/00-总览与状态/产出登记表.md)（按 R/S 编号 grep） |
| 当前代码现状 | [`当前实现.md`](design/00-总览与状态/当前实现.md) |
| 未落地设计 / 决议 | 模块文档 + [`数据定案.md`](design/30-数据与决议/数据定案.md) |
| 代码里的 TUNING | `src/plugins/*.js`；对照表见开发手册 §三 |
| 页面分区 / 卡片 / 样式 | [`UI 视觉规范.md`](design/20-系统设计/UI%20视觉规范.md) |
| 旧口径为什么废 | [`踩坑与作废口径.md`](design/00-总览与状态/踩坑与作废口径.md) |

**灵力/秒唯一真源** = `practice.js` 的 `spiritPerSecond` getter。
**哪些页面暂停时间**只看 `clock.js` 的 `PAUSE_ROUTES`；内宅**不在**里面（观战页）。

---

## 文档

`design/` 按类型分文件夹，入口 [`design/README.md`](design/README.md)（含**体量三档**
与**检索边界表**：`90-历史归档/` 2.9MB、`原作/` 1.3MB **默认不读**）：

```
00-总览与状态/   宪法 · 当前实现 · 下一步 · 产出登记表 · 数值真值表 · 开发手册 · 踩坑与作废口径 · 网页端协作流程
10-模块设计/     模块一~九（一模块一文件；内宅并入模块二）
20-系统设计/     时间 · 三大挂机 · 战斗 · 日常循环 · 宝箱 · 功法 · 同参标签 · 装备 · UI · 解锁方针 · 丹论
30-数据与决议/   数据定案 · 物品池设计方案 · 原作物价表 · 宝匣定价 · 功法表-90 · 词条表 · 数据 JSON
90-历史归档/     旧版设计 · 旧版总览 · 落地记录 · 讨论-YYYY-MM-DD · 日报
原作/            小说原文 + 原始数据表（不入库）
```

> **读文档先看 README 的体量三档**：≤400 行整读 / 400~700 按节 / **>700 禁整读**。
> `模块一` / `日常循环` / `物品池设计方案` 已于 2026-11-11 补全 `##` 目录（108 个标题），**按 TOC 取节读**。

**`design/new/` 当日清空**：用户与网页端 AI 的稿子。**新压旧，但要抓"想当然"错误、
判不准就问、逐条清点不遗漏**；每条必须有去向，否定也是去向。流程见开发手册 §十一。

**谈数据先看 [`数据定案.md`](design/30-数据与决议/数据定案.md)**。

**每天收尾固定五步**（日报 → 明日讨论 → 真源回写 → 文档门禁 → 提交），见开发手册 §十二：
日报一段会话一节、明日讨论只写没定的且每条带出处、`docs:toc` + `check:docs`、一个批一次提交。

**改设计时注意**：跨文档相对链接在移动文件后要一起改。《当前实现》与《模块一》是
「主状态」与「主设计」，多数改动要同步这两份。
