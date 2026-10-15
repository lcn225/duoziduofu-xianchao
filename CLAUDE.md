# 多子多福：开创仙朝 — 项目约定

放置修仙游戏。基于开源项目 `setube/vue-idle-xiuxian` 二次开发，以小说《多子多福：开创仙朝》为世界观。
**Vue 3.5 + Vite 6 + Pinia 3 + Naive UI 2.41**。分支 `duoziduofu`（`main` 保持上游原样）。

---

## 常用命令

```bash
npm run dev        # 端口 2025，浏览器自动打开。也可双击根目录「启动游戏.bat」
npm run verify     # 79 条契合度断言，改数值后必跑。也可双击「检查数值.bat」
npm run build      # 生成 docs/。⚠️ 需要先 npm i -D terser（见「坑」§5）
```

**开发期想验证能不能打包**：别用 `npm run build`（会覆盖 `docs/`，那是已提交的部署产物）。
用 `npx vite build --minify esbuild --outDir .buildcheck`，验完 `rm -rf .buildcheck`。

---

## 当前进度（截至 2026-10-15）

| 模块 | 设计 | 代码 |
|---|---|---|
| A 期地基 | — | ✅ |
| 模块一 · 修行与突破 | ✅ | ✅ **已按《灵气系统》整体返工** |
| 时间系统 | ✅ | 🟡 在线部分完成（GameClock + 暂停 + 钩子；离线结算未做） |
| 模块二 · 多子多福（含模块三内宅） | ✅ | ⬜ **← 下一步** |
| 模块四 · 封地经营 | ✅ | ⬜ |
| 模块五 · 任务战斗 | ✅ | ⬜ |
| 模块六 · 经济交易 | ✅ | ⬜ |
| 模块七 · 百艺科技 | ✅ 占位 | ⬜ |
| 模块八 · 事件叙事 | ✅ | ⬜ |
| 模块九 · 离线结算 | ✅ 方案 B | ⬜ |
| 模块十 · 门派政治 | ❌ 废案 | — |

**⚠️ 当前可玩边界：练气五层。** 练气三层靠「换元氏修命经 + 把功法熟练度养到 12%」通；
六层断在物品获取上（三阶同参、兽/器功法都还没有来源）。**这是预期行为，不是 bug**，
代码里有注释，不要当 bug「修」。

**改动前的基线提交是 `e6ca985`。**

### 最近 4 个提交

```
7f5cdeb  chore: 加一键启动与数值校验脚本
8dc55a4  docs: 设计文档按生命周期归档整理
1d2c348  feat(clock): 引入 GameClock，合并两个并行的计时器
7b3b45e  feat(cultivation): 契合度四维改三维加权，本命品阶封顶同参
```

---

## 下一步：P2 内宅 + 多子多福

设计文档：[`design/10-现行设计/模块二：多子多福系统 完整设计方案.md`](design/10-现行设计/模块二：多子多福系统%20完整设计方案.md)（内宅已合并进来）。
子嗣经济延伸见 [`子嗣与家族经济体系 — 完整设计.md`](design/10-现行设计/子嗣与家族经济体系%20—%20完整设计.md)。

### 开工前必须先想清楚的一件事

**侍妾从哪来？** 设计和「兽/器功法」是**同一个坑**：§11.1 列了 7 种获取途径
（郑家购买 / 势力联姻 / 战利品 / 封地征召 / 子嗣联姻 / 随机事件 / 门派赏赐），
但 §11.2 的触发条件全是「内宅稳定度 > 70」「封地民心 > 80」「门派好感 > 60」
—— 依赖的都是 P3~P6 才有的系统。**P2 时一条都走不通。**

先和用户确认这批怎么给侍妾，再动手。

### 需要接的跨模块接口（都已留好，现在是占位）

| 接口 | 位置 | 现状 |
|---|---|---|
| `childrenBonus`（子嗣修炼加成） | `harmony.js` 的 `TUNING.childrenBonus` | 恒 0，上限 +200% |
| 子嗣加成的「同五行」系数 | `wuxing.js` 的 `isSameElementGroup` | 已留，模块二才用 |
| 侍妾位阶解锁条件 | 依赖境界 | 待定 |
| 新页面的暂停 | `stores/modules/clock.js` 的 `PAUSE_ROUTES` | 记得把内宅/子嗣加进去 |
| `onDay` / `onMonth` 钩子 | `plugins/gameClock.js` 的 `register` | 接口已留，**尚未注册任何回调** |

### 建议的切分

模块二设计很厚（位阶 P1-P14、8 态状态机、精力、晚间互动、两步抽卡、14 种家族工作、母子关系）。
建议先做**最小闭环**再补：
`晚间互动 → 当场判孕 → 270 天孕育 → 诞生抽卡 → 加成接进速度公式`，
位阶/状态机/家族工作/母子关系留第二批。

---

## 代码约定

### Store 是有意拆成「单 store + 多模块文件」的

`src/stores/player.js` 只有一个 `defineStore`，`src/stores/modules/index.js` 用 `Object.assign` 把各模块扁平合并。

- `state` **必须是工厂函数**（`$reset` 依赖重新调用）。没有 state 导出的模块（如 `clock.js`）会被 filter 掉
- `actions` / `getters` **必须用方法简写** `foo() {}`，**不能用箭头函数** —— 合并后 `this` 由 Pinia 绑定到 store 实例，跨模块走 `this.xxx()`
- 模块内**禁止** `import { usePlayerStore }`（循环依赖）
- DEV 下只检查 getter/action 重名，**不检查 state 键重名** —— 新增 state 时自己注意

### 纯函数层与运行时层分开

`src/plugins/*.js` 都是**无副作用纯函数**，刻意给相对 import 加了 `.js` 后缀，好让 node 直接加载跑断言。
`src/plugins/gameClock.js` 的计时器句柄与钩子表放在**模块作用域闭包**里，只把 `clockState` 这个
reactive 影子对象透给 UI —— 进 Pinia state 会被序列化进存档，且 `$reset()` 清不掉旧 timer。

### 数值的唯一真源

| 想改什么 | 改哪里 |
|---|---|
| 契合度公式、三维权重、覆盖率/接近度、速度、熟练度、炼体加成 | `src/plugins/harmony.js` 的 `TUNING` |
| 品阶枚举、同参/本命品阶系数、灵地基础产出 | `src/plugins/tiers.js` |
| 境界表、修为曲线、门槛、灵地品阶要求 | `src/plugins/realm.js` |
| 功法/同参/灵地/本命的数据 | `src/plugins/cultivationData.js` |
| 时间节奏、tick 上限 | `src/plugins/gameClock.js` 的 `SECONDS_PER_GAME_HOUR` / `MAX_TICK_REAL_SECONDS` |
| 哪些页面暂停时间 | `src/stores/modules/clock.js` 的 `PAUSE_ROUTES` |

**灵力/秒只有一个真源**：`practice.js` 的 `spiritPerSecond` getter。UI 和实得都读它 ——
旧版页面里另拼了一份公式且漏了因子，两处口径对不上。

---

## 坑（踩过的，别重复踩）

1. **`modules/index.js` 的 state 兜底。** 旧代码 `m[field] || {}` 对没有 `state` 导出的模块兜底成 `{}`，
   而 `{}()` 抛 `factory is not a function`，**整个 store 构建崩**。已修成 `.filter(f => typeof f === 'function')`。

2. **单位换算藏在常量里。** 旧版熟练度写 `hours × 0.01`，而 `hours` 的分母是 `secondsPerGameHour: 2`
   —— 实际 40 现实秒就顶满 20%，比设计快 **100 倍**。现在 `hoursFromSeconds` 是纯换算 `s / 3600`。

3. **两个并行计时器。** 「每 tick 给灵力」这件事一度有两个独立 `setInterval` 在跑
   （`App.vue` 的 worker + `Cultivation.vue` 本地定时器），互不知晓，收益翻倍。
   现在**只有一个** `gameClock` 的 interval，别再加第二个。

4. **bat 文件的两个陷阱。**
   - `chcp 65001` + UTF-8 的 bat **在中文 Windows 上会坏**：cmd 按**字节偏移**读批处理文件，
     执行中途切码页会让后续行解析错位，中文行被当成命令执行。
     要么存成 **GBK**，要么内容保持**纯 ASCII**（当前选择）。
   - **必须 CRLF 行尾**。`if not exist (...)` 这种括号块在 LF 下最容易解析失败。
     git 的 `LF will be replaced by CRLF` 警告就是在提示这个。

5. **`npm run build` 会覆盖 `docs/`**，而 `docs/` 是**已提交的 GitHub Pages 部署产物**。
   它不会自动跟着代码更新 —— **部署前必须重建**，且 `terser` 是可选依赖、本仓库没装，要先 `npm i -D terser`。
   （2026-10-15 曾留过一份「修 bug 之前构建的、启动即崩的」产物，别重演。）

6. **中文路径 + bash 传给 cmd 不可靠。** `cmd //c <中文路径>`、`git mv` 碰到中文路径都可能失败
   （cmd 拿不到正确的 cwd）。本仓库路径是 `.../Project/多子多福`。
   验证 bat 之类的东西时，把它复制到 ASCII 路径下跑。

7. **`git clean -fd` 会被权限拦。** 破坏性 git 命令要用户自己跑（用 `! 命令` 前缀）或明确点名目标。

8. **设计文档的验算表会算错。** 《灵气系统》§7.3 有两行加错了、§4.3 例子的「一阶」用了一阶下品的值。
   所以有了 `npm run verify` —— **改完数值一定跑**，里面还有几条**反向断言**
   （如「开局 50.25% 必须被练气三层拦住」），专门证明门槛不是装饰。

9. **「设计完整 ≠ 可玩」。** §7.2 那张成长路径表假设兽/器功法、三阶同参、第二件本命物**都已到手**，
   而这些在游戏里一条获取途径都没有。做新模块时先查一遍「它依赖的东西存在吗」。

---

## 验证手段（本仓库没有测试框架）

1. **`npm run verify`** —— 79 条纯函数断言（`scripts/verify-harmony.mjs`），秒出，不用起服务器
2. **headless Chrome** —— 本机装了（`C:\Program Files\Google\Chrome\Application\chrome.exe`）。
   ```bash
   npx vite --port 2025 --strictPort &
   "/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu \
     --user-data-dir=/tmp/cs --enable-logging=stderr --v=1 \
     --virtual-time-budget=15000 --dump-dom "http://localhost:2025/#/cultivation"
   ```
   `--enable-logging=stderr --v=1` 会把页面 console 原样打出来（grep `INFO:CONSOLE`）。
   **`factory is not a function` 就是这么抓到的。**
   想真点按钮，可以用 `--remote-debugging-port=9222` + 一个 Node 脚本（Node 24 内置 WebSocket，不用装依赖）。
3. **人工点验** —— `npm run dev` 后手点。

---

## 文档

`design/` 按生命周期分四个桶，入口是 [`design/README.md`](design/README.md)：

```
design/00-总览与状态/   开发进度与方案（主状态文档）· 下一步 · 整体方案说明书 · 跨文档冲突审阅
design/10-现行设计/     12 份现行设计（改代码以这里的为准）
design/90-历史归档/     8 份已被取代的（每份顶部有归档横幅，别照着实现）
design/原作/            小说原文 + 原始数据表
```

**改设计时注意**：`design/` 里跨文档的相对链接在移动文件后要一起改。
《开发进度与方案》和《灵气系统》是「主状态」与「主设计」，多数改动要同步这两份。
