# 多子多福：开创仙朝 — 项目约定

放置修仙游戏。基于开源项目 `setube/vue-idle-xiuxian` 二次开发，以小说《多子多福：开创仙朝》为世界观。
**Vue 3.5 + Vite 6 + Pinia 3 + Naive UI 2.41**。分支 `duoziduofu`（`main` 保持上游原样）。

> **实现细节 / 代码约定 / 15 条坑 / 验证 / 部署 / 提交远端，都在
> [`design/00-总览与状态/开发手册.md`](design/00-总览与状态/开发手册.md)。**
> 本文只留：启动方式、命令、进度速查、硬口径、改动影响地图、文档索引。
> **改代码前先看「改动影响地图」，不要整份重读设计文档。**

---

## ⚠️ 启动方式（2026-10-20 踩过）

**必须在仓库根目录启动 Claude**：`C:\Users\lcn_k\OneDrive\Project\duoziduofu`。
终端当前目录是 `design/` 时启动，`src/`、`scripts/`、根 `CLAUDE.md` 都会被
`blockReadsOutsideWorkingDirectories` 挡在工作区外，每个文件都要确认。

> **2026-10-29 仓库目录改名**：`Project\多子多福` → `Project\duoziduofu`（全 ASCII），
> 会话目录也跟着变成 `~/.claude/projects/C--Users-lcn-k-OneDrive-Project-duoziduofu`。
> 中文名留下的老会话在 `...-Project-----` 下，别混着找。

```powershell
cd C:\Users\lcn_k\OneDrive\Project\duoziduofu
claude
```

判断会话在哪：`pwd`，或看 `~/.claude/projects/` 下会话目录是否以 `------design` 结尾。
临时补救：`/add-dir C:\Users\lcn_k\OneDrive\Project\duoziduofu`。

项目级审批白名单在 `.claude/settings.json`：`npm run verify*`、`check:docs`、`docs:toc`、
`node scripts/*`、`git status/diff/log/show` 等已允许，文件编辑走 `acceptEdits`；
破坏性 git（`push --all/--tags`、`clean`、`reset --hard`、`filter-branch`）已 deny。
**2026-10-20 用户点头后**又放开了 `npx vite*`、`npm run dev`、以及一次性代码
（`node -e` / `node -`、`python -c` / `python -`、`python scripts/*`）——等于任意代码可直接跑，
审阅门槛比之前低，改动前自己看一遍命令再执行。
改完白名单若本会话仍弹确认，重开会话或看 `/permissions`。

**别给命令加 `cd 仓库 && ` 前缀**（2026-10-20 量化过）：白名单是**前缀匹配**，
`cd X && npm run verify` 匹配不上 `Bash(npm run verify:*)`，等于白配。
历史 1340 次手动 Bash 确认里 93% 带 `cd`，其中 746 次剥掉 cd 后本可自动放行。
Bash 工具的当前目录本来就是仓库根（每次调用会重置回来），要别的目录用绝对路径。
自查用 `npm run enter-report`。

**别把「扫文档 / 扫代码」派给 Explore 或 general-purpose 子代理**（2026-10-31 连踩三次）：
它们的 Bash 会被自动加上 `cd "C:\…" && ` 前缀，再叠上 `$(…)` / `for` / `&&` / 重定向，
解析器判不了就**每次都弹确认**给用户。要用子代理就用 `.claude/agents/doc-scout.md`
（只有 Read / Grep / Glob，没有 Bash）；否则自己用 Grep + `Read(offset, limit)`。
子代理本身也遵守这条：**不要为了统计行数去跑 shell**。

**管道 / `;` / `&&` / `$()` 一样会废掉白名单**（2026-10-22 查过 bebed01a 的 45 次手动确认）：
`npm run token-report 2>&1 | tail -60`、`git log ...; echo ---; head ...` 都不是「以某命令开头」的单条
命令，白名单里明明有 `npm run token-report:*`、`git log:*`、`grep:*`，照样弹框。
过滤用命令自带的 `--limit=` / `--since=` / `--filter=`，别接 `| tail`；要串几步就分几条命令跑。

### 验证纪律（2026-10-20 上锁）

- 跑验证 / 探针前，正文先写一行 **`测试目的：因为改了 X，要确认 Y`**；
  没写会被 `scripts/hooks/verify-guard.mjs` 拦掉。写不出来 = 这次测试不该跑。
- 验证入口只有 `npm run verify:quiet` 和 `npm run check:docs`。**工作区没变就重跑会被拦**；
  同样输入连续失败两次也会被拦（再跑还是同样结果）。
- 一次性探针（`node -e` / `python -c`）**连续 3 次、中间没改文件 → 提醒换法子**；
  有价值的探针固化成 `verify-all` 的断言，别留在会话里反复手搓。
- 真要破例：用 Write 往 `.claude/.state/override` 写任意内容，下一条命令放行并自动删掉（一次性）。
- 数据入口：`npm run enter-report` 里的「工具调用构成」（实现 / 验证 / 探针各多少次）。

---

## 常用命令

| 命令 | 用途 |
|---|---|
| `npm run dev` | 端口 2025，浏览器自动打开。也可双击根目录「启动游戏.bat」 |
| `npm run verify:quiet` | **2108 条**纯函数断言，只打失败项 + 汇总（日常必跑） |
| `npm run verify` | 完整断言输出（约 55KB，别日常用） |
| `node scripts/verify-all.mjs --list --filter=宝匣` | 列出匹配的断言标题，不用整份读断言文件 |
| `node scripts/verify-all.mjs --quiet --filter=宝匣` | 只跑匹配的断言 |
| `npm run check:docs` | grep 旧口径 + 坏链接，全部设计文档 1 秒出 |
| `npm run docs:toc` | 给大文档刷新顶部行号目录（`--check` 只检查） |
| `npm run token-report` | 统计历史会话 token 花在哪（`--all` 看全部项目） |
| `npm run enter-report` | 「我到底在为什么按 ENTER」：手动确认 / 白按 / 真实缺口（`--session=`、`--since=`、`--json`） |
| `node scripts/shot.mjs --url=… --out=…` | 无头 Chrome 截图验收（`--w/--h/--wait`），别手搓 chrome 命令 |
| `python scripts/import-anims.py` | 素材/SS → src/assets/anim（300px 动态 WebM + 海报 + manifest；需 ffmpeg 或 `pip install imageio-ffmpeg`） |
| `python scripts/build-items.py` | 掌门路 xlsx + 设计表 → `items.data.js`（依赖本地 xlsx，日常不用跑） |
| `npm run build` | 生成 `docs/`。**开发期别用**，见下 |

**开发期验打包**：`npx vite build --minify esbuild --outDir .buildcheck`，验完 `rm -rf .buildcheck`。
`npm run build` 会覆盖已提交的 `docs/`（部署产物），且 `terser` 已在 devDependencies 里。

**只推 `duoziduofu` 分支**：`git push --all` / `--tags` 会把 `main` 和上游 tag 一起推上去。
部署细节（Cloudflare Worker、pnpm 锁文件）见开发手册 §九。

---

## 当前进度（截至 2026-10-31）

| 模块 | 设计 | 代码 |
|---|---|---|
| A 期地基 | — | ✅ |
| 模块一 · 修行与突破 | ✅ | ✅ 连乘体系 + 30 级境界表 + 门槛 0.15 / 0.24 / 0.35 / 0.40 / 0.76 |
| 时间系统 | ✅ | ✅ 练气 1:1 + 筑基后 24×（在线）+ 离线按境界两套 |
| 模块二 · 多子多福（含模块三内宅） | ✅ | 🟡 最小闭环 + 成长/繁育/软上限 + 子嗣修炼/历练/家族工作 + 子嗣页 + 家族树/族谱 + 子嗣寿命 + **P60 词条 v2（2026-10-31）**；派遣/分封待做 |
| 模块四 · 封地经营 | ✅ v1.2 | 🟡 4 建筑 / 3 条进度条 / 教程三步 / 药浴池；`/estate` |
| P10 · 桂冈的一天 | ✅ | ✅ v1（巡视/练功/炼体/互动/睡觉 + 双资源）；小循环 06:00+S |
| 三大挂机 · 镇守/探索/秘境 | ✅ | 🟡 探索 v1.0 + 子嗣历练 + 秘境返工 + 叙事弹窗 + 首破公式；探索动画与镇守数值待做 |
| 模块五 · 任务战斗 | ✅ | 🟡 飞鹰门（贡献点 + 周任务 + 秘库 + 老九订货）；官位 / 内政 / 俸禄留 B8 |
| 模块六 · 经济交易 | ✅ v2.3 | 🟡 **货币 v3 三档拆账（A1，2026-10-31）** + 按档计价 + 宝箱定价 + 坊市宝匣/回收；订货 / 商队未做；A2 重定价在 B8 |
| 模块七 · 百艺科技 | ✅ | 🟡 炼器已落地；炼丹 / 制符 / 炼阵是数据位 |
| 模块八 · 事件叙事 | ✅ | 🟡 v1 落点 = 探索叙事弹窗；正式内容未做 |
| 模块九 · 离线结算 | ✅ v2.1（180 游戏天） | ✅ 已落地 |
| 模块十 · 门派政治 | ❌ 废案 | — |

**逐项「设计 vs 代码」以《[当前实现](design/00-总览与状态/当前实现.md)》为准**；
待办见《[下一步](design/00-总览与状态/下一步.md)》，产出见《[产出登记表](design/00-总览与状态/产出登记表.md)》。

> **已完成批次（P12~P61、B0~B12）的逐条叙述不在本文件。**
> 状态查《下一步》的 **P 编号索引**；落地细节查
> [《下一步-已完成批》](design/90-历史归档/落地记录/下一步-已完成批.md) 与
> [《当前实现-批次史》](design/90-历史归档/落地记录/当前实现-批次史.md)。
> **施工顺序唯一真源 = 《下一步》顶部的排序链（链头现在是 P60）。**

### 当前硬口径（别改错）

- **当前可玩边界：练气十层**（2026-10-29 修正，旧口径「练气八层」已过期）。
  筑基可达但**概率极低** —— 练气段不掉三阶，只能靠二阶宝匣 5% 升阶开出三阶同参
  （`0.6 × 0.849 = 0.509 > 0.40`），不需要《万兽御器经》。门派任务 / 秘库**提前到练气后期**
  开放（P55 §十）是本轮正路。早期门槛路线（B7 复核）：三层吕氏 **0.206** / 六层《兽器双修经》
  **0.325** / 九层猪妖系 **0.374**，其中《兽器双修经》由探索「无字石碑」获得。**这是预期行为，不是 bug**。
- **货币 = 三档独立记账（A1 拆账，2026-10-31 已落地）**：`currency` 五字段
  `{ secular, spiritual1, spiritual2, spiritual3, strategic }`，**不自动进位**。
  老档按 100 一阶 = 1 二阶、800 二阶 = 1 三阶**一次性折算落档**（`migrateCurrencyV3`，
  `currencyVersion: 3`）；这两个汇率从此只作折算与参考。
  **跨档只能向上、单向、有损耗**：110 一阶 = 1 二阶、880 二阶 = 1 三阶（约 9%）；
  **不设向下兑换**。产出口一律走 `inventory.gainSpiritual(tier, amount)`，
  **A1 阶段全部传 1**（可玩边界练气十层，数值零改动），筑基/金丹分支等 B9。
  按档计价：宝匣 / 封地建设 / 筑基后侍妾**直接收对应档**（`spendPrice` / 多档价格），
  **多档价格必须每档都够才成交**。真源 `plugins/currency.js`；UI 兑换在 `views/Shop.vue`。
- **门派俸禄 2026-10-27 改二阶**（A2）：设计 = 下柱 **833** / 中柱 **1,500** / 上柱 **2,500 二阶/月**，
  开局即生效；兼职（大盾将 / 乡侯 / 驿守）按剧情叠加。**B8 必须排在 `A1` 之后**：
  24× 一上，按现实小时计的收放全部 ×24，重定价会当场作废；A1 拆账已落地（2026-10-31），
  重定价现在有档位可落。
  代码 `plugins/salary.js` 在 B8 之前仍发 6,000 大子/月（未落地旧值）。**改二阶必须同批重定价
  二阶计价商品**（宝匣 1/3/13.5/54/194、封地 36 二阶起），方法 = 收入 → 每月买得起几件 →
  购买价 → 回收价 ×30%。「≤税收 30% / ≤P9 月饷」已作废。开局不再送 200,000 大子；
  成就不再发奖励，只记录完成。
- **境界表 = 30 级（2026-10-30 P61 落地）**：练气 10 + 筑基 10 + **金丹** 10（「结丹」已统一改名，
  代码里 `tier: 'core'` 仍叫 core）。外功同构：炼体 / 锻骨 / 洗髓各 10 层。**元婴 31~40 未落地**。
  硬口径三条：① **段总量守恒**（练气 22,070 / 筑基 145,000 / 金丹 720,000；外功 17,680 / 116,000 /
  576,000），改曲线必须让三段各自求和不变，否则宪法第二章锚点作废；② **大门层号**：练气 3/6/9、
  **筑基 11（不变）**、**金丹 21（原 15）**，`LAND_GATES` 跟着改；③ **凡是「拿 level 当量级」的公式**
  （丹药、事件、桂冈境界乘区）必须先过 `realm.powerLevelOf` 映射回 18 格等效刻度，
  **不要直接乘 30 级层号**。老档迁移走 `persistence.migrateRealmScale`（`realmScaleVersion`，
  初/中/后/圆满 → 一/四/七/十层），`realmBreakthroughs` 的**键是层号，必须一起重映射**。
- **门槛以《模块一》§6.1 为准**：**0.15 / 0.24 / 0.35 / 0.40 / 0.76**（2026-10-28 B7 重算）。
  ⚠ **2026-10-30 翻案：练功时长重新算进门槛** —— **心法等级加成进品阶分、进 GateFit**；
  B7 的「熟练度只加速、不帮门槛」**作废**。「熟练度」与「心法等级加成」**合并成一项**
  （100h 一层与 50h +1% 上限 20% 同在 1,000h 到顶，并存等于同一段时间算两遍）。
  **P56 重算门槛必须把等级加成吸收进去**，否则纯挂机就能过练气三层，§6.2「一槛一换」整条塌掉。
- **同参契合 = 三层标签重合度**（2026-10-28 B7）：`Σ(交集权重) / Σ(本命权重)`，顶层 1.0 /
  中层 0.4 / 底层 0.25（《模块一》§4.3）；**同一件 = 1.0、非原物封顶 0.95、撞不上 = 0（没有保底）**；
  顶层可走**一跳**关系（同参词作键查本命词），中层/底层只认字面交集。
  引擎 `src/plugins/tagHarmony.js`，数据 `src/plugins/itemTags.data.js`（`npm run tags:build`）。
  **六档、0.1 保底、开局五件 `affinity` 硬编、`affinityOf`/`isNearName`/`isNearKind` 全删了**，
  别再按名字 / series / 器型判定同参。校准工具 `npm run sim:companion`。
- **筑基/九层的门 = 双轨**：宝箱/秘境看脸（**概率不改**）+ **秘库兜底**。
  秘库：**练气八层开放**；**两栏** —— 功法栏（心法整本、全随机、排除已学、不保底）+
  同参底材栏（按境界段 10~12 件、**限购 1 件/月/段**）；**没有配方栏**、不卖洗命符 / 特殊道具；
  《万兽御器经》在功法栏、**不限购**。月刷 3~4 件 200~300 点 · 残页 3 张 ×600 ·
  手动刷新 50→100→200→400 · 老九订货 400/次。贡献点 **≈690/游戏月**；中柱累计 **1,500**、上柱 **5,000**。
- **封地 MVP 只有 3 条进度条**（建设/征收/产出），**建造位 4 个**（乡侯府/灵田/鸦巢舍/亭卫）——
  情报条与政策条已砍，长岭驿**不进 MVP**；**药浴池是唯一例外**（不在 MVP 四建筑里，
  乡侯府 Lv.2 后从科技树挪进建造列表第 5 个）；告急关停；粮草事件空过；**封地产出绝不叠 R07**；
  徭役按人口自动分配（拖拽留第二批）。三条硬口径：**成本 二阶×100 记一阶** /
  **付款与进度同速（总付款 = 总成本）** / **首建 0 成本、工期 = Lv1→2 的一半**。
  乡侯府 Lv1 征收未开、鸦巢舍/亭卫无结算对象 = 预期行为。**家族工作仍是直产**，
  不要顺手接成「加速建筑」（会和直产并存，等矿场/工坊/商队一起切）。
- **药浴池（B4b）**：状态是 `bath.pool = { stock, lastConvertSeconds, convertedTotal }` —— **独立仓**，
  不占背包；**1 件/游戏小时**、按整小时**懒结算**（`convertBathPool`）。**空转不攒**：五系满 /
  存量空 / 外功满级 → 游标照推，不把没转的次数存起来以后一次吐出；**外功满级一口不吃**；
  **建池后浴桶关闭**（`instantTopUp:false`）。结算点 = tick + `advanceDayLoop` + 离线收尾
  （探索/秘境不走 dayLoop），`settleBathPool` **自己不落盘**。品种锁 = **`baseId` 一物一行**。
- **离线结算**（模块九）：**上限 180 游戏天（≈4.8 现实小时）**，**P55-c 起按相位两套**：
  练气 96 现实秒/游戏天、筑基后 4 秒/天，筑基段配额**暂按 180 天**（3650 等聚合引擎 · R33）。
  世界日历只走结算天数 / 100% 平 / **三大挂机严格三选一** / 子嗣历练与家族工作**全量参与** /
  **满足即自动突破，不满足修为卡 100% 不溢出** / 宝匣进背包不开 / 叙事按 20 秒自动善意直接入账 /
  子嗣诞生自动取名不弹窗 / 讣告**按妻妾·子嗣计数聚合** / 唯一暂停点 = 子嗣陨落。
  **旧口径 12 小时 / 450 天已作废**（R23）。
- **时间锚点 = 练气期 96 现实秒/游戏天；筑基后 24× ⇒ 4 现实秒/游戏天**（P55-b）。
  「1 月 = 48 现实分钟」是**名义值（不睡）**，实际约 **34~42 分钟**；配平用名义值，写玩家预期用实际值。
  分界点**只有一个**：`realm.isAscendedLevelOf`（内功 ≥ 11）。**游戏时钟按 15 游戏分整步推进**
  （`GAME_STEP_SECONDS = 900`）：练气期 1 小时轮 = 4 个 tick；**筑基后 1 现实秒 = 24 整步
  = 6 游戏小时**。**倒计时向下取整到 15 分档**（`formatCountdown`），静态时长才用 `formatDuration`。
- **`saveData()` 自 P58 起是「标脏 + 5 秒节流」，不是「调了就落盘」**（真源 `plugins/saveThrottle.js`）。
  需要立刻进库的地方**必须** `saveData({ force: true })` 或 `await flushSave()`：关页/切后台
  （**状态没变也要写**，否则暂停页挂着的时长会被当离线重算）、读档路径上的迁移与离线结算、导出前。
  写盘实现只有 `persistence.persistSnapshot()`（`toRaw($state)` → stringify → 加密 → IDB），
  **别在别处再写一份 stringify+setData**。存档加密 = WebCrypto AES-GCM（密文 `vux2:` 前缀），
  **老档 CryptoJS 只读不写**，读到即转新格式；换加密**不升 `SAVE_VERSION`**（升了就是清档）。
- 校验：`verify:quiet` 确认 **2495** 全过。
- **飞鹰门全部按「现实秒」记账**（2026-10-30）：锚点 **96 现实秒 = 1 游戏天**，
  任务刷新/时长、秘库月刷、手动刷新重置、老九倒计时全走 `faction.realSeconds`
  （墙钟差累计，上限 180×96 秒）。**筑基后 24× 不加速飞鹰门** —— 它是玩家操作驱动的系统，
  跟世界日历走会让一游戏月 = 2 现实分钟、贡献点白送。真源 `plugins/faction.js` 的
  `FACTION_SECONDS_PER_DAY`；**别改回 `clockGameTime`**。一游戏周 = 11.2 现实分钟、
  一游戏月 = 48 现实分钟、杀怪 1 天 = 96 现实秒。
- **巡视加速 = `(24+S)/24`**（P53）：**只有巡视时段 ×2**，S = 当天实际巡视小时数。
  `plugins/estate.js` 的 `patrolFactorOf` 是唯一算法（产出/建设/征收三处共用）；store 必须
  **先用 `patrolSettledInWindow` 门控再读 `patrolHoursOfDay`**（后者有 minHours 兜底，探索/秘境
  冻结时会返回旧日期的 S）。**税收金额不变**，只改进度入库时点。旧口径「巡视过 ⇒ 整日 ×2」作废（R04）。
- **小循环 = 06:00 + 巡视时长 S 开工，18:00 硬下班，`L = 12 − S`**（Q8）。默认 S=2 → 10 小时；
  **S=1 → 11 小时**。实现上 `patrolEndSeconds` 就是小循环起点，**没有「候工」段**、也没有
  `LOOP_START_HOUR`。巡视时长是**今天的快照**：「今天还在跑」→ 拖短当场结束；「今天已跑完」→ 只改明天。
- **筑基后「小循环退场」是 UI 层的事，不是引擎层**（P55-b）：24× 下引擎照跑（与离线同一条路），
  Day 页隐藏实时任务卡/日程/统计/流水账，改显示**「昨日战报」**（`dayLoopLastReport`）。
  **别再写一套日聚合结算**。配套三条：① **24× 下禁用睡觉快进**；② 战报**不能放 `dayLoop` 里**
  （`resetDayLoop()` 会置 null），是独立字段；③ 空账不覆盖战报。
- **侍妾池按境界整池切换**（P55-b）：练气期 P1–P3 凡女 **20 金页子**；**筑基后 P9 练气女修 6 二阶**
  （= 该位阶 20 个月月饷）。真源 `plugins/shop.js` 的 `TUNING.maiden` + `maidenPoolOf(ascended)`；
  生成真源 `innerCourt.generateMaiden({ ascended })`。B8 二阶重定价时会再走一遍。
- **`dayLoop` 里所有任务的结束时刻必须是「当日 06:00 的绝对函数」**：读档接手中途时
  `taskStartSeconds` 锚到**本段真正起点**（巡视 06:00 / 本轮起点），不能锚接手时刻 ——
  否则「剩余 11 分钟 + 进度 0%」会回来（P51 #9）。
- **秘境结算面板显示「整趟」**：`segment.loot` 只是那 5 层的账、**已即时入账**，面板读 `run.lootTotal`
  （`mergeLoot` 累进）。别为了「面板数不对」去改入账，也别在结算时重复入账。离线秘境的内层循环
  必须 `run = segment.run`（`runSegment` **不改入参**）。
- **秘境难度加成 = 开箱 pick+1**（段内 1–4 / 5–8 / 9–10 → +0 / +1 / +2，换阶重置），
  **宝匣个数恒定**（每 5 层 1 个）。旧「每 10 难度每趟 +1 宝匣」作废。
- **词条数值 = 每条词条自己的 `effect`，稀有度不换算**（R44 / P60，2026-10-31 已填数）：
  `TUNING.bonus.traitCoef` 与 `secretRealm.offspring.traitCoef` **已删除**；读数值只走
  `innerCourt.traitEffectOf / traitEffectSumOf / traitArtOf`（通道 `cultivation` / `combat` /
  `specialty` / `job` / `art`，`null` = 闲趣纯展示）。**`grade` 只管抽卡**。
  **池子三条**：修士 35 条（普通 20 / 稀有 10 / 传说 5 = **4:2:1**）· 凡人 21 条（岗位 6 + 闲趣 15，**抽 1 条**）
  · 专精 47 条（细类 43 / 大类 4，**独立抽、最多 1 条**：稀有槽 20% / 传说槽 30%）。
  **数值：修行 / 战力 / 功法 1% / 2% / 4%；岗位 +10%；专精 ×1.2 / ×1.1。**
  老档按 id 回填 `effect`（不重掷），「剑心通明」已原地改造为「**剑专精**」。
  **子嗣专精只管装备**（细类按器型、大类按近战/防御/远程/法宝），**取最高不叠乘、不给修炼加成**；
  `飞剑` 按 `剑` 算。功法类词条**子嗣在世时 0**，返还桂冈才生效（目前只有心法有消费点）。
- **视觉层唯一色源 = `src/styles/tokens.css`**（V1.2 亮暗两套 `--ui-*`）：业务代码只写 `var(--ui-*)`，
  页面里不许出现第二种色值；蓝条 `#2080f0` 与 `var(--n-border-color)` / `var(--n-primary-color)`
  当分区色都已废弃。**新页面直接用 V1.2**。多页重复的排版原子放 `src/styles/ui.css` ——
  **tokens.css 只管色值，ui.css 只管用法**。
- **通知只准四档**：静默 / 红点 / 横幅 / 居中弹窗（弹窗**只有五类**：解锁、离线报告、二选一叙事、
  **突破**；筑基「仙凡永别」并入解锁档），见《模块解锁方针》§四；未解锁入口**必须灰显占位**。
  **寿终讣告与子嗣陨落都走第 2 档横幅**（已发生、不需确认），同次结算合并一条、不堆叠。
- **突破提示 = 第 3 档弹窗**（A1-3）：`components/BreakthroughNotice.vue` +
  `plugins/breakthroughNotice.js`（文案 / 合并 / 队列上限 5 的唯一真源）。**不暂停时钟**、
  遮罩与 ESC 都可关；同一次结算连升多级合并成一条（`batchId`），跨结算分开弹；
  **离线只进报告不弹**（`setBreakthroughSilent`）。绝对值取 `combatPanel`（含装备/灵宠/炼体），
  **增量取前后差**（只算本体），一位小数、整数省略 `.0`。改这里要同步真值表 §5.10 与开发手册 §二。
- **掉落阶按境界段，不按地图阶**（P30）：物品和宝匣都是练气 一/二阶、筑基 二/三阶、金丹 三/四阶；
  地图只给段内高阶概率（0/30/60/90%）。所以**练气永远不掉三阶**，这是预期行为。
- **功法库 90 本（2026-10-31 已落盘，数值零改动）**：真源
  [`design/20-系统设计/功法系统.md`](design/20-系统设计/功法系统.md) +
  [`30-数据与决议/功法表-90.md`](design/30-数据与决议/功法表-90.md) §9.1。
  代码数据 `cultivationData.QI_ARTS` **90 本**、`grade` 用 **四阶四品十六档**编码
  （`qi_low`…`nascent_peak`），`ART_GRADES` / `ART_FRAGMENT_NEEDED`（按 tier 10/15/20/25）已切。
  **品阶分仍是三档** —— `harmony.js` 用 `legacyGradeOf` 折回 `qi/foundation/core` 查旧表，
  **P56 换成十六档表后删这层**。**心法取最高、非心法叠加走软上限 B、心法等级进门槛、
  非心法实际效果**全部**未做（P56）**；**心法不直接加修炼速度**（只抬 Fit，`0.98 + 0.32×Fit`）。
  **只有心法有残页**；探索：无字石碑 → 心法残页、传承印记 → 非心法整本（按境界段）；
  秘库功法栏**只卖心法**、宝匣残页池**只收心法**。御器诀 `vessel_jue` **已删**，
  老档走 `persistence.migrateQiArtsV2`。⚠ **门槛必须重算（P56）**：四阶极品 0.50 + 覆盖率
  1.0×40% = 0.90 早已越过筑基 0.40；重算前**别单独改某一个门槛**，也别把非心法叠加当已生效。
- **凡俗物品 = 杂物**（B2）：`tier:0` / `tierKey:'none'` / **无属性、不可装备**、**禁止进本命池与同参池**；
  金饰三件（素金戒指 / 金簪 / 金钗）降级为杂物、老档已穿的卸回背包；回收 **30 大子/件**；
  **炼器默认勾选改为不勾**（P12.4 作废）。
- **两个本命是三阶**（2026-10-30）：代码 `PLAYER_FATES` 仍是 `tier:'4'`，改时注意 `masterItemId`
  还指向四阶原物 —— **本命原物到底几阶待核**，它决定同参「同一件 = 1.0」落在哪件上。
- **子嗣寿元（B1）**：凡人 **80** / 练气 **120** / 筑基 **200** / 金丹 **500** 仙龄岁，
  外加 **±5% 稳定随机**（`FNV-1a(id + name) → [-5%,+5%]`），**按当前境界实时同步**（升级即延寿）；
  预告线 = 寿元 **90%**（第 1 档红点 + 流水一行）。判定顺序**先修炼突破、再判寿终**
  （`settleOffspringLifespan` 在 `advanceInnerCourtDay` 里排在修炼之后、繁育之前）；读档在
  `realmLevel` 回填之后判一次 —— **存量会成批寿终，这是预期行为，不是 bug**。死前先摘 `job` /
  历练配置 / 秘境 `run.party`，**数组条目不删**（家族树要读）；「活着」的唯一口径 =
  `isAliveOffspringOf`（`fallen` 与 `passed_away` 都不算）。陨落**返还词条**走 `legacyTraits`，
  **凡人子嗣不返还**。
- **子嗣词条进日增 + 传承合并**：日增 = 基础 × 灵根 × (1+同参) × (1+灵地) ×
  **(1 + 软上限(Σ词条, 子嗣自己境界 cap))**；`practice.legacyTraits` 与子嗣加成**合并成同一个 raw
  再套一次 cap**，不各开一份额度，返还只落 **A 类**。校准表 `sim:offspring` 是 `--trait=0` 基线。
  突破时间戳 `realmBreakthroughs`（讣告写「几岁筑基、几岁金丹」）；战斗陨落带 `killerName`。
- **装备白板是几何 ×3/阶**（T1 5 → T5 405）：主/副属性、词条、回收价都不跟着变。改白板 = 改整条装备曲线，
  必须重跑 `sim:realm` 并重标 `realmScale`（现为 **8.4**）。
- **灵植 / 灵材 / 灵草是「一条带 `count`」的堆**（P57）：真源 `plugins/stacks.js`。
  合并键 = **`baseId + 成色`**（灵草 `id + 品质`）—— **不能只按 baseId**，回收价按成色系数走。
  **灵器 / 灵宠一律不合并**。加物品走 `gainItem` / `gainHerb`，**不要再 `items.push` / `herbs.push`**；
  扣数量走 `takeUnits` + `planFromUnits`；读件数用 `unitsOf` / `countUnits`，**`items.length` 是条目数不是件数**。
  为什么：一物一条把用户档堆到 12,189 条、4.96MB，每秒加密一次 = 主线程 100%（P58 的基线）。
- **灵兽面板只有一个真源：`plugins/petUnit.js`** —— 白板(T1~T5) × 成色倍率 × 境界系数；等级靠同修
  （出战灵兽拿桂冈打坐修为的 50%），**不要再从 `petEssence` / `star` 读任何数值**。
  **读档必须 `relinkActivePet()`**：`items` 与 `activePet` 是两份拷贝，不指回同一对象，
  同修等级只会涨在出战那份上，背包/秘境名单永远显示旧等级。
- **仙龄刻度 = 365 游戏天/岁（练气期 1:1）**（P55-a；P54 的 45 天/岁（3×）与 15 天/岁都作废）：
  子嗣两条轨、妻妾两条轨**全部拉平到 365**，「仙师老得慢」改由境界寿元表表达，**仙凡同龄是预期行为**。
  子嗣成长边界 `growth.boundaries` **两轨一律** `[0, 3650, 5110, 6570, 10950]` = 启蒙 **0 岁** /
  上工 10 / 婚配 14 / 成年 18 / 中年 30。**启蒙 0 岁是 1:1 成立的前提**。**孕期 90+10 天刻意不动**
  （受孕窗口 5,475 天；**不设胎数上限**，靠修士 `pregCoef` 自然收敛）。老档迁移 =
  `rebaseBirthTimeOf(b, now, fromPerYear, 365)`，幂等靠 `ageScaleVersion`：**0/缺失 = 15 天/岁、
  1/3 = 45 天/岁、2 = 已是 365、≥10 = 迁完**（`AGE_SCALE_VERSION = 10`）。**改刻度时三处一起改**：
  `growth.daysPerAge` + `growth.boundaries` / `lifecycle.daysPerYear` + `cultivatorDaysPerYear` / 迁移公式。
  **经期已取消**：`TUNING.cycle` 只留字段形状，**任何判定都不准再读**（三处已摘掉）；老档残留的
  `status: 'period'` 在读档归一化和每日结算时清成 `idle`。受孕只看 35 岁衰减 / 50 岁归零。
- **子嗣修炼曲线**（P55-a 重标，真源 `TUNING.offspringCultivation`）：日增 =
  `2 × 1.2^(层-1) × 灵根系数 × (1 + 配给同参)`，升级所需 = **桂冈同层上限**，**加税按境界段两档**
  （`costBump.byTier`：**筑基 ×7.8 / 金丹 ×39.6**），**封顶 30 级 = 金丹十层**。
  灵根系数 **{1:1.0, 2:0.68, 3:0.4, 4:0.13, 5:0.04}**（跨度 25 倍）。按「同参 0.6」标定
  （`npm run sim:offspring`）：单 5.7 岁筑基 / 81.7 岁金丹 / 352 圆满；双 8.4 / 120（擦线）/ 518（超寿元）；
  三 14.2 / 204（金丹无望）；四 43.8 / 628；**五 142 岁筑基 ⇒ 寿元 120 前够不到 = 死也筑基不了**。
  ⚠ **30 级表下单一倍率压不住**（金丹对上了、圆满从 352 掉到 132）—— 必须按段两档。
  ⚠ **同参 1.0 + 纯打坐**这一极限下五灵根仍能在 102 岁筑基，是已知残余，不是 bug。
  **改系数/加税必须重跑 `sim:offspring` 并同步方案 §4.4.2。**
- **上工门槛 = 10 岁**（P55-a）：`familyJobs.minAgeYears` **必须 ≤ 10**，否则改 `workStage` 等于没改。
  女儿 10~13 岁是 P55-a 新开出的上工窗口。⚠ 练气期 1:1 下「上工 10 岁 = 3,650 游戏天 ≈ **4.1 现实天**」——
  家族 6 个经济岗要等 4 天，不是 4 小时（4 小时是**筑基后 24×** 那一栏）。
- **子嗣的同参 = 家族配给**（B7）：从背包 / 已装备 / 出战灵宠 / 开局五件里，按子嗣**自己的本命标签**
  挑契合最高的一件，**不消耗、可共享、没有保底**。真源 `innerCourt.offspringCompanionFitOf`；
  `companionFitFallback 0.6` 只给老档回填用。家里囤的物件直接决定子孙修炼速度 —— 这是设计，不是 bug。
- **任何新增/减少产出都要先登记**，再按宪法第二章重算门槛，最后才改代码。**收益减少也要登记** ——
  只记加不记减，门槛重算会拿旧产出当基准。
- 兽/器 5 本功法里，**练气篇 3 本（兽吼功/御器诀/兽器双修经）已可由探索「无字石碑 / 传承印记」获得**；
  筑基《万兽御器经》、金丹《兽器同源经》仍无来源。子嗣加成是**修炼速度**侧线，不是突破门槛。
- **看起来像 bug 的预期行为**（内宅不暂停、老档多 8 位侍妾、探索切页继续、巡视无产出……）
  见《当前实现》§四，**先查再修**。
- 代码约定、模块实现细节、15 条坑、验证与部署 → 开发手册。

---

## 改动影响地图

> **改之前先看这一行，别整份文档重读。** 只读表里列的文件；
> 改完跑 `npm run verify:quiet && npm run check:docs`。

| 改动类型 | 必看 / 必改 | 断言 |
|---|---|---|
| 本命 / 灵根 / 词条 / 子嗣加成 | `plugins/innerCourt.js`（`TUNING.bonus` / `rollOffspring` / **`traitEffectOf` / `traitEffectSumOf` / `offspringBonusOf` / `offspringTraitBonusOf`**）· `plugins/innerCourtData.js`（`TRAIT_POOL` 的 **`effect`**）· `plugins/secretRealm.js`（`buildOffspringUnit` 读同一条 effect）· `plugins/items.js`（`rollFateSet` / `clampFateTiers`）· 模块二 §6.2/§9/§15.5.4 · 物品池 §5.2/§5.3 · 真值表 §5.1/§5.7 · 产出登记表 R07 / R39 / **R44** | `verify-harmony` 8d/§9.2/公式先行 · `verify-idle`（战力词条）· `verify-items` §五 |
| **仙龄刻度 / 子嗣成长 / 寿元 / 寿终** | `plugins/innerCourt.js`（`AGE_SCALE_VERSION` / `ageScaleFromPerYearOf` / `lifecycle` / `offspringLifespan`·`lifespanJitter`·`lifespanWarnRatio` / `growth.daysPerAge` + `boundaries` / `workStage` / `rebaseBirthTimeOf` / **`offspringLifespanOf`·`offspringAgeYearsOf`·`isAliveOffspringOf`·`formatOffspringObituaryOf`**）· `stores/modules/innerCourt.js`（`migrateAgeScale` / `normalizeInnerCourtOnLoad` / **`settleOffspringLifespan`·`noteOffspringBreakthroughs`·`grantLegacyTraitsOf`**）· `plugins/notice.js`（横幅文案）· 模块二 §7.1/§15.5/§16.1 · 真值表 §5.7 · 产出登记表 **R30 / R35 / R39** | `verify-harmony`（§8b / 迁移 / 寿元 / 讣告） |
| **子嗣修炼曲线 / 灵根系数** | `plugins/innerCourt.js`（`offspringCultivation.rootCoef` / `costBump` / `maxLevel` / `offspringLevelCostOf` / `offspringCultivationGainOf`）· 真值表 §5.7（校准表）· 产出登记表 R16 / R31 | `verify-harmony` · **`npm run sim:offspring` 必跑** |
| **时钟倍率 / 24× / 小循环退场 / 离线分段** | `plugins/gameClock.js`（`ASCENDED_TIME_SCALE` / `GAME_STEP_SECONDS`）· `realm.isAscendedLevelOf`（唯一分界点）· `stores/modules/clock.js`（`syncClockRealm`）· `plugins/offline.js`（`OFFLINE_TUNING.maxGameDays` / 分段）· Day 页 `dayLoopLastReport` · 时间系统 §2.1 · 模块九 §一 · 日常循环 §十五 · 真值表 §0.1 / §1.2 · 产出登记表 R33 / R34 | `verify-idle`（24× 切换 / 离线分段）· `verify-dayloop`（战报） |
| **货币 / 分档 / 商店 / 价格** | `plugins/currency.js`（三档唯一真源）· `plugins/shop.js`（按档价格）· `stores/modules/inventory.js`（`gainSpiritual` / `spendPrice` / 迁移）· 原作物价表 · 模块六 §0.2 / §九 / §十 / §十之二 / §十之三 | `verify-shop` · `verify-estate` · `verify-persist` |
| 封地 / 民心 / 税收 / 建设 | `plugins/estate.js`（建筑表/民心/徭役/报价/日结）· `stores/modules/estate.js` · 模块四 §四/§十/**§十一** · 真值表 §6.8 | `verify-estate` |
| 物品池 / 品阶 / 宝箱 | `plugins/items.js` · `plugins/tiers.js` · `plugins/chest.js` · 数据定案 §七 · 物品池设计方案 | `verify-items` |
| **物品数量 / 堆叠 / 存档体量** | `plugins/stacks.js`（唯一真源）· `stores/modules/inventory.js`（`gainItem` / `gainHerb` / `sellItem` / `migrateStacks`）· `plugins/shop.js`（按件计价）· `plugins/bath.js`（`planTopUp` / `planPoolFill` 按单位展开）· `plugins/achievements.js`（灵草成就按株数）· `plugins/pills.js` · 当前实现 §P57 | `verify-items`（§堆叠 38 条） |
| **存档 / 落盘 / 加密格式** | `plugins/saveThrottle.js`（节流策略唯一真源）· `stores/modules/persistence.js`（`saveData` / `flushSave` / `persistSnapshot` / 迁移顺序）· `plugins/crypto.js`（两种密文格式 + `SAVE_VERSION`）· `App.vue` 的 pagehide · 开发手册 坑 §17 · 当前实现 §P58 | `verify-persist`（加密往返 / 老档兼容 / 节流时序） |
| 装备 / 子嗣装备 | `plugins/equipment.js` · `plugins/offspringEquipment.js` · `stores/modules/attributes.js` · `stores/modules/innerCourt.js` · 装备系统 §十一/§十八 · 真值表 §5.5/§5.9 | `verify-items` · `verify-idle`（子嗣装备） |
| **灵兽 / 同修** | `plugins/petUnit.js`（面板/经验/上限唯一真源）· `stores/modules/pets.js` · `inventory.migratePetsV2` · 真值表 §5.8 · 三大挂机 §4.4 | `verify-idle`（面板/同修/5 坑）· `verify-items`（灵兽实例） |
| **修行 / 契合度 / 灵地 / K** | `plugins/harmony.js` · `realm.js` · `tiers.js` · 模块一 · 真值表 §2/§3 | `verify-harmony` |
| **同参标签 / 门槛** | `plugins/tagHarmony.js`（公式唯一真源）· `plugins/itemTags.data.js`（生成，别手改）· `design/30-数据与决议/物品标签-474.json` + `同参标签关系表.json`（真源，改完跑 `npm run tags:build`）· 模块一 §4.3/§6 · 真值表 §2.8 · 产出登记表 R25 | `verify-harmony`（§0b / §3 / §5）· `verify-items`（标签数据）· `npm run sim:companion` 重算门槛 |
| **功法库 / 品阶 / 残页 / 秘库** | **`design/20-系统设计/功法系统.md`（唯一汇总）**· `design/30-数据与决议/功法表-90.md`（90 本结构）· `plugins/cultivationData.js`（`QI_ARTS` / `ART_GRADES` / `ART_FRAGMENT_NEEDED`）· `plugins/harmony.js`（`gradeFit` / `qiArtHarmonyOf`）· 模块一 §4.2/§6.1/§8.1 · 模块五 §13.2.1/§13.3.3 · 探索系统 §4.4 · 数据定案 §六 | `verify-harmony` · `verify-shop`（秘库）· **改品阶分或 `maxLevel` 必跑 P56 门槛重算 + `sim:companion`** |
| 日常循环 / 体力 / 精力 | `plugins/dayLoop.js` · 日常循环 §4/§六 · 真值表 Sheet 4 · 开发手册 §六 | `verify-dayloop` |
| **炼体 / 药浴 / 药浴池** | `plugins/bath.js`（产气 / 漏斗 / 软上限 / 吸收 / **池子转换**的唯一真源）· `stores/modules/bath.js` · `core.cultivateBody`（循环突破 + 余数）· `plugins/estate.js`（`bathhouse` 解锁）· 《炼体药浴》· 真值表 §5.11 / §5.11b | `verify-bath` · `verify-estate`（解锁）· `verify-dayloop`（体魄计划） |
| 探索 / 秘境 / 三挂机 | `plugins/locations.js` · `exploration.js` · `items.pickBaseItemForEvent` · `secretRealm.js` · `stores/modules/exploration.js` · `inventory.chests` · `practice.learnQiArt` · 探索系统 · 三大挂机 · 开发手册 §七 | `verify-idle` · `verify-items` |
| **飞鹰门 / 贡献点 / 秘库 / 老九订货** | `plugins/faction.js`（`FACTION_SECONDS_PER_DAY` / 抽任务 / 货架 / 暗池）· `stores/modules/faction.js` · `views/Faction.vue` · 模块五 §13.2/§13.3 · 真值表 §6.4c · 模块解锁方针 §五 · 产出表 **R36 / R37** | `verify-faction` · `verify-offline`（日结钩子） |
| 模块二实现 / 代码约定 / 坑 | 开发手册 §二/§五/§八 · 模块二 · 当前实现 §四 | `verify-harmony` |
| **UI 布局 / 分区框 / 页面样式 / 颜色** | [`src/styles/tokens.css`](src/styles/tokens.css)（`--ui-*` 唯一色源）· [`design/20-系统设计/UI 视觉规范.md`](design/20-系统设计/UI%20视觉规范.md)（视觉层 V1.2 + `.zone` 结构层 + 11 条坑）· 开发手册 §二 · 对应模块文档 | 纯 UI，无新增断言；`verify:quiet` 确认 2028 全过 |
| **解锁条件 / 锁态入口 / 通知** | [`design/20-系统设计/模块解锁方针.md`](design/20-系统设计/模块解锁方针.md)（显性条件 + 四档通知）· 开发手册 §二 · 对应模块文档 | 纯 UI + 条件判定；通知不新增断言 |
| **纯数值小改**（不动规则） | 只改 `TUNING` + `npm run verify:quiet`；**文档收工时一次性同步** | 对应脚本 |
| **规则 / 语义改动**（如本命→灵根） | 先跑 `npm run sim:fates` 看分布，再改代码 + 断言，最后同步 3~4 份真源 | `verify` + `check:docs` |

**工具**：

- `npm run check:docs` —— grep 旧口径 + 坏链接。
- `npm run sim:fates` —— 本命 / 灵根分布模拟（默认 5 万次，`--n=200000` 可调）。
- `npm run sim:realm -- --solve` —— 秘境阈值反推表。**默认就是校准口径**
  （桂冈 + 3 名 T2 中品子嗣，队伍构造在 `scripts/lib/sim-party.mjs`）；
  `-- --gear=off --lord=off` 复现 P25 裸装老表。
- `npm run sim:offspring` —— 子嗣成长校准表：算出每种灵根「多少岁到练气十层 / 筑基一层 /
  金丹一层 / 金丹十层」，并标 ✗ = 已超寿元。`--fit=` 同参档（默认 0 / 0.3 / 0.6 三档）、
  `--bump=` 临时把加税压成单一倍率（试算）、
  `--eff=` 修行效率（1 打坐 / 0.9 半打坐 / 0.8 仅历练）、`--trait=` 词条加成
  （**已套软上限**的比例，默认 0 = 校准基线）、`--bump=` 临时换筑基段税、
  `--solve` 按方案 §4.4.2 反推系数。**改 `rootCoef` / `costBump` / 词条系数必跑。**
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
| 页面分区 / 卡片 / UI 样式 | `design/20-系统设计/UI 视觉规范.md`（分区框唯一口径） |

**灵力/秒只有一个真源**：`practice.js` 的 `spiritPerSecond` getter。UI 和实得都读它。
**哪些页面暂停时间**只看 `src/stores/modules/clock.js` 的 `PAUSE_ROUTES`；
内宅**不在**里面（观战页），别顺手加回去。

---

## 文档

`design/` 按文档类型分文件夹，入口是 [`design/README.md`](design/README.md)：

```
design/00-总览与状态/   最高宪法 · 当前实现 · 下一步 · 产出登记表 · 数值真值表 · 开发手册
design/10-模块设计/     模块一~九（一模块一文件；内宅并入模块二）
design/20-系统设计/     时间系统 · 三大挂机（含探索） · 日常循环 · 宝箱 · 功法系统 · 同参标签 · 装备
design/30-数据与决议/   数据定案 · 物品池设计方案/调整 · 原作物价表 · 宝匣定价计算表 · 数据 JSON
design/90-历史归档/     旧版设计 · 旧版总览 · 讨论-YYYY-MM-DD（清单 + 产出） · 日报
design/原作/            小说原文 + 原始数据表（不入库）
```

**单一真源**：公式进模块文档，数值进《数值真值表》，产出进《产出登记表》，
其他文档只链接、不复制。详见 README 顶部的「单一真源」表。

**`design/new/` 当日清空**：里面是用户和网页端 AI 商量的稿子（网页端读不到本项目文件），
**冲突默认新压旧、但要抓"想当然"错误、判不准就问、逐条清点不遗漏**；每条必须有去向，
**否定也是去向**。完整流程（四判据 / 九个去向 / 收尾自检）见开发手册 **§十一**。

**要谈数据先看 [`design/30-数据与决议/数据定案.md`](design/30-数据与决议/数据定案.md)** ——
本命/同参/灵地/功法/品阶的条目，以及 C/D/E 三组决议（物品池、容量、封地建筑 22 种、灵岩池）。

**每天收尾固定五步**（日报 → 明日讨论 → 真源回写 → 文档门禁 → 提交），
见开发手册 [`§十二`](design/00-总览与状态/开发手册.md)：日报一段会话一节、明日讨论只写没定的且每条带出处、
`docs:toc` + `check:docs`、一个批一次提交。

**改设计时注意**：`design/` 里跨文档的相对链接在移动文件后要一起改。
《当前实现》和《模块一》是「主状态」与「主设计」，多数改动要同步这两份。
