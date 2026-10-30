// 内宅 / 多子多福的**数值唯一真源**与全部判定纯函数（模块二）
//
//   怀孕概率 = (基础 10% × 母方位阶怀孕系数 + 好感/10（上限 +10%）) × 0.6 − 自动 5%
//              （2026-10-18：无疲劳惩罚、无保底）
//   灵根概率 = 基础 10% × 母方位阶灵根系数 × 父方身份系数     （上限 100%）
//   有灵根后 → 先抽灵根数量（5/4/3/2/1 = 60/15/10/12/3%），品质由数量派生（P15.5(c)）
//   子嗣加成 = Σ 灵根系数 × 本命契合系数 × 词条系数           （按大境界软上限，§9.1）
//   子嗣成长 = 仙凡双轨，按游戏天推进；成年 = 18 仙龄岁      （§7.1，P14）
//
// 全部是纯函数：不碰 store、不读全局、**随机性走注入的 rng 参数**。
// 注入 rng 是本文件唯一的风格偏离（现有代码一律直调 Math.random）——
// 代价是每个调用点都要多传一个参数，收益是整个抽卡层变得可断言：
// scripts/verify-harmony.mjs 用常量 rng 就能把概率边界钉死。
//
// 带 .js 后缀是刻意的：本文件被 verify 脚本用 node 直接加载，
// 而 node 的 ESM 解析器不接受省略扩展名的相对路径（vite 两者都接受）。

import {
  TRAIT_POOL,
  RANK_NAMES,
  SURNAMES,
  GIVEN_NAMES,
  OFFSPRING_GIVEN_NAMES,
  OFFSPRING_GIVEN_NAMES_MALE,
  OFFSPRING_GIVEN_NAMES_FEMALE,
  OFFSPRING_EASTER_EGG_NAMES,
  OFFSPRING_NAME_PARTS,
  OFFSPRING_STAGES,
  CULTIVATOR_SPOUSE_SURNAMES,
  CULTIVATOR_SPOUSE_NAMES,
  newWife
} from './innerCourtData.js'
// 玩家本命与灵气集合的真源在 harmony.js（它已 import cultivationData.js）
import { playerFates, playerElements } from './harmony.js'
// P17：子嗣本命从统一物品池抽（四池底材快照，同系列不重复、灵气可重复；
// 灵根 = 本命 fateElement 去重集合，3 件木系本命 = 单木灵根）
import { rollFateSet, fatesFromRoots, clampFateTiers } from './items.js'
// 子嗣升级所需 = 桂冈同层修为上限（2026-10-27，曲线同源）
import { getRealmName, realmTierOf } from './realm.js'
// 子嗣配给同参按三层标签算（2026-10-28 B7）
import { companionHarmonyOf } from './tagHarmony.js'

/** 调参集中在这里，改数值只动这一处 */
export const TUNING = {
  /**
   * 位阶表。`promote` = **从本位阶升到下一阶**的条件（等价于设计 §2.1 里
   * 「晋升条件」那一列 —— 那一列写的正是「升到本位阶的条件」，两者差一级）。
   *
   * 本批只有 P1-P6 可达（P7+ 是女修段，女修还没有获取途径），
   * 但系数表要完整，否则 UI 读到 P9 会显示空白。
   */
  ranks: {
    1: { pregCoef: 1.0, rootCoef: 0.5, promote: { kind: 'interactions', n: 10 } },
    2: { pregCoef: 1.0, rootCoef: 0.5, promote: { kind: 'firstNight' } },
    3: { pregCoef: 1.0, rootCoef: 0.7, promote: { kind: 'pregnancies', n: 1 } },
    4: { pregCoef: 1.0, rootCoef: 0.8, promote: { kind: 'rootChildren', n: 1 } },
    5: { pregCoef: 1.0, rootCoef: 0.9, promote: { kind: 'topChildren', n: 1 } },
    6: { pregCoef: 1.0, rootCoef: 1.0, promote: null }, // 凡女天花板
    7: { pregCoef: 0.9, rootCoef: 1.2, promote: null },
    8: { pregCoef: 0.8, rootCoef: 1.5, promote: null },
    9: { pregCoef: 0.5, rootCoef: 2.0, promote: null },
    10: { pregCoef: 0.4, rootCoef: 2.5, promote: null },
    11: { pregCoef: 0.3, rootCoef: 3.0, promote: null },
    12: { pregCoef: 0.25, rootCoef: 3.5, promote: null },
    13: { pregCoef: 0.2, rootCoef: 4.0, promote: null }
  },
  /** 本批封顶。P7+ 的 promote 全是 null，所以就算位阶被塞到 7 也不会乱升 */
  rankReachableMax: 6,

  /**
   * 父方（生父）身份系数。**键直接对齐 realm.js 境界对象的 tier 字段**
   * （练气 1-10 / 筑基 11-14 / 结丹 15-18），所以不需要另建映射表。
   *
   * ⚠ 这里修正了设计 §6.1 的自相矛盾：系数表写「练气 2.0」，紧跟着的
   *   「桂冈的子嗣灵根概率」表却直接用 ×4。**以本表为准**（随玩家境界）。
   */
  fatherCoef: { mortal: 1.0, qi: 2.0, foundation: 3.0, core: 4.0 },

  pregnancy: {
    baseChance: 0.1,
    /**
     * 正向部分倍率（《数值真值表》§7.4 的 `chanceScale: 0.6`）。
     *
     * ⚠ 乘在「基础 10% × 位阶系数 + 好感加成」**整块**上，不是只乘基础项 ——
     *   P4/好感 85 = (10% + 8.5%) × 0.6 = **11.1%**，不是 6% + 8.5%。
     *   2026-10-18 按真值表 §5.2/§7.4 对齐；模块二 §5.3 的旧写法已作废。
     */
    chanceScale: 0.6,
    /** 好感加成 = 好感 × 0.001，上限 +10%（即设计 §5.3 的「好感/10」） */
    affinityScale: 0.001,
    affinityCap: 0.1,
    /**
     * 自动模式的体力预留 / UI 低体力提示线。
     *
     * ⚠ 2026-10-18 起**不再影响受孕率**（疲劳 −10% 已废除）。
     *   保留 30 是为了不顺手改掉 `pickAutoWives` / `enterEvening` 的互动次数 ——
     *   互动成本 15→20、0.5h→1h 那批一起返工时再决定是否删。
     */
    fatigueThreshold: 30,
    /** 自动模式 -5%（设计 §5.2 末；在正向部分 ×0.6 之后扣） */
    autoPenalty: 0.05,
    // 怀孕保底（pityLimit）已于 2026-10-17 拍板废除，2026-10-18 落地删除。
    /**
     * 孕育 **90 游戏天**（≈ 2.4 现实小时）。
     *
     * ⚠ 孕期 **90 天刻意不动**（用户拍板「每胎仍只生一个、不要改孕期」）。
     *   2026-10-29 P55-a 把刻度改成 1:1（365 天/岁）之后，35–50 岁的受孕窗口
     *   变成 **5,475 游戏天**，每位妻妾一辈子能怀的胎数按理论最大值会涨很多。
     *   拍板结论（方案 §4.6）：**不设胎数上限，靠修士妻妾的低 `pregCoef` 自然收敛**；
     *   真要收就继续压 P9~P13 的 `pregCoef`，孕期维持不动。
     *
     * 原为 270 天。2026-10-16 时钟放慢 4 倍（`SECONDS_PER_GAME_HOUR` 1 → 0.25，
     *   一个游戏天从 24 现实秒变成 96 现实秒）后，270 天会变成 7.2 现实小时 ——
     *   对一个「多子多福」是招牌机制的游戏来说太久了，缩到 90 天 ≈ 2.4 现实小时。
     *   （设定上就当是仙家手段 —— 多子多福本来就是这本书的核心外挂。）
     *
     * `recoveryDays` 按同一比例缩放（270:30 = 90:10），保持产后恢复与孕育的节奏比不变。
     */
    /**
     * 新档孕妇按 `daysRange` 随机锁定天数（2026-10-19）。
     * `days` 保留为**旧档归一化基准**，不要拿随机值去改它。
     */
    days: 90,
    daysRange: [80, 100],
    recoveryDays: 10,
    /** 旧档口径：受孕 + 270 天 / 产后 + 30 天。读档归一化用它们做等比折算 */
    legacyDays: 270,
    legacyRecoveryDays: 30
  },

  /**
   * 经期（2026-10-19）—— **2026-10-29 P55-a 起取消，字段只留作老档兼容**。
   *
   * 取消理由（《时间刻度修订方案》§4.5）：P55-b 之后筑基期 1 游戏天 = 4 现实秒，
   * 28~35 天的周期折合 2 分钟，等于噪声。判定只看受孕率曲线（35 岁衰减、50 岁归零）。
   *
   * ⚠ **不要再把 `cycle` 接回任何判定**：`advanceInnerCourtDay` / `interactEvening`
   *   都不再读它。`rollWifeCycle` / `wifeCycleStateOf` 保留只为老档字段形状不报错。
   */
  cycle: {
    periodRange: [3, 7],
    cycleRange: [28, 35]
  },

  /**
   * 妻妾生命周期（2026-10-19）。
   *
   * **365 游戏天 = 1 仙龄岁（练气期 1:1）**；凡女 80 岁老死。
   * 老死移出内宅（`status: 'passed_away'`），但**不删数组**——家族树要读。
   * 35 岁后受孕率线性下降，50 岁归零。
   *
   * ⚠ **2026-10-29 P55-a 改写**：P54 的「全局 3×（45 天/岁）」作废，改成
   *   《时间刻度修订方案》的**双层时间**：练气期 1:1（365 天/岁），筑基后靠
   *   P55-b 的 24× 钟速压缩现实时长。所以**规则层只有一个刻度 365**，
   *   「仙师老得慢」改由 B1 的境界寿元表表达，不再用双重刻度模拟。
   *   **仙凡同龄是预期行为，不是 bug。**
   *
   * ⚠ 改刻度必须同批改三处，否则规则会自相矛盾：
   *   ① `growth.daysPerAge` + `growth.boundaries`（子嗣成长）；
   *   ② `lifecycle.daysPerYear` / `cultivatorDaysPerYear`（妻妾年龄）；
   *   ③ `persistence.migrateAgeScale`（老档 `birthTime` 重锚，保持当前仙龄不倒退）。
   *   孕期 90+10 天**刻意不动**（用户拍板「每胎仍只生一个、不要改孕期」）。
   */
  lifecycle: {
    daysPerYear: 365,
    mortalLifespan: 80,
    ageRange: [16, 22],
    fertilityDeclineStart: 35,
    fertilityZeroAt: 50,
    stageNames: [
      { key: 'maiden', name: '少女', toAge: 30 },
      { key: 'matron', name: '妇人', toAge: 50 },
      { key: 'elder', name: '老妇', toAge: 80 }
    ],
    /**
     * 女修妻妾另算（2026-10-20 用户拍板）。
     *
     * P1–P8 仍是凡女轨：寿元 80。
     * P9 及以上是女修（设计 §2.1：P9 练气起点 / P10 筑基 / P11+ 金丹），
     * 寿元按境界 120 / 200 / 500。
     *
     * ⚠ 2026-10-29 P55-a：**刻度拉平**，女修不再是 70 天/岁，与凡人同为 365。
     *   「仙师老得慢」这件事改由寿元表表达（`cultivatorLifespan`），
     *   两套刻度同时存在会让「仙龄」这个词自相矛盾。
     *
     * 目前还没有女修侍妾的获取途径，这条规则先把地基铺好；
     * `lifespanYears` 存档字段会被读档归一化同步成对应的值。
     */
    cultivatorFromRank: 9,
    cultivatorDaysPerYear: 365,
    cultivatorLifespan: { 9: 120, 10: 200, 11: 500 },

    /**
     * **子嗣寿元（B1，2026-10-30 落地）** —— 《模块二》§15.5。
     *
     * 按**当前境界实时同步**（不是出生时锁定）：升级即延长，与「侍妾寿元跟境界走」同一条规则。
     * 分档看 `realm.js` 的 `tierOf`：`1~10` 练气 / `11~14` 筑基 / `15~18` 结丹；
     * 无灵根与「有灵根但还没启灵（realmLevel 0）」都走凡人档。
     *
     * ⚠ **存量会成批寿终**：本批落地前存档里已经堆了越过寿元的子嗣（此前没有判定），
     *   第一次读档会一次性判死整批。这是**预期行为**，不是 bug。
     */
    offspringLifespan: { mortal: 80, qi: 120, foundation: 200, core: 500 },
    /**
     * 寿元随机 **±5%**（P59 #3，2026-10-30 定稿）：
     * `offset = FNV-1a(id + name) → [-5%, +5%]`，**一辈子固定**（刷新/读档不变）。
     * 妻妾与子嗣同规则；寿元实时派生，`lifespanYears` 存档字段只留作老档兼容。
     */
    lifespanJitter: 0.05,
    /** 寿元**预告**线：到这个比例就红点 + 流水一行（《模块二》§15.5.2） */
    lifespanWarnRatio: 0.9
  },

  /** 晚间互动（设计 §5.1「进入晚间（游戏时间 20:00）」） */
  night: {
    /** 一天里的第几小时算「晚间」。自动模式在这个点发起互动 */
    eveningHour: 20,
    /** 流水账保留条数。1 游戏天 = 24 现实秒，50 条约等于 20 分钟历史 */
    logLimit: 50
  },

  /**
   * 体力（《桂冈的一天 + 体力体力系统》§1.2 /《睡觉恢复》）。
   *
   * ⚠ **这个字段过去叫「精力」** —— 内宅专用的「一晚能宠几次」的节流阀，每游戏天自动回满。
   *   自「桂冈的一天」起它升级成**全局体力**：白天所有活动（巡视 / 练功 / 炼体）
   *   与晚上的互动都花它，恢复改由**睡觉**驱动（上限/4 每小时，4 小时回满），
   *   **不再每天自动回满**。
   *
   * 字段名与存档结构**刻意不动**（`energy.spentToday` 原样保留），避免存档迁移 ——
   * 只改中文标签与上限公式。新的「精力」（百艺的脑力）是**另一条资源**，
   * 放在 `dayLoop.focus`，**不要**复用这个字段（同一个键两套含义最容易出鬼）。
   */
  energy: {
    base: 145,
    perInteraction: 15,
    /** 睡觉每小时恢复 上限/4 —— 4 小时回满（《睡觉恢复》§一） */
    sleepRestoreDivisor: 4,
    /** 设计 §4.1 的「每 5 名子嗣 +1」「P4+ 每位 +1」本批不做（没有消费口） */
    fromOffspring: 0,
    fromWives: 0
  },

  /**
   * 子嗣性别与命名（P12.6，2026-10-18）。
   *
   * `maleChance` 只作用于**出生那一刻**，不随母方位阶/父方境界变化。
   * 第一代子嗣男女都算「子孙」（Y 染规则：女儿本人的下一代才被排除），
   * 所以这里暂不影响修炼加成。
   */
  offspring: {
    maleChance: 0.5,
    /** 掌门路人物名彩蛋概率（given name，去姓） */
    easterEggRate: 0.2,
    /** 单池连续撞名多少次后换兜底策略 */
    nameAttempts: 60
  },

  draw: {
    baseRootChance: 0.1,
    /** 每 20 抽（= 每 20 个诞生的子嗣）必出有灵根（设计 §6.4） */
    pityRootLimit: 20,
    /** 首充礼包：第一个子嗣必定有灵根（设计 §6.1 末） */
    firstChildGuaranteed: true,
    /**
     * 第二步：**已确定有灵根**前提下的**灵根数量分布**，合计 1.00。
     *
     * ⚠ 2026-10-18 口径变更（P15.5(c)）：**品质不再是独立随机量**。
     *   真源只有「几灵根」，下品/中品/上品/极品只是叫法：
     *     5 → 下品、4 或 3 → 中品、2 → 上品、1 → 极品。
     *   概率沿用旧的品质分布（下品 60% / 中品 25%，其中四灵根 15%、三灵根 10% /
     *   上品 12% / 极品 3%），所以总产出曲线不变。
     */
    rootCountDist: { 5: 0.6, 4: 0.15, 3: 0.1, 2: 0.12, 1: 0.03 },
    /** 灵气池：7 类均匀抽（兽/器与五行同权，不额外加权） */
    elementPool: ['metal', 'wood', 'water', 'fire', 'earth', 'beast', 'vessel']
  },

  /**
   * 血脉遗传 / 灵根提纯（P15.5(b)，2026-10-18）。
   *
   * **只作用于子嗣繁育**（父母 = 儿子 + 其配偶），宿主侍妾不参与。
   * 规则：子嗣的灵根数量与**母亲（配偶）**落在同一档时，按下列概率减一个灵根（最少 1）：
   *   母亲 5 灵根     → 子 5 变 4：10%
   *   母亲 4 / 3 灵根 → 子 4 变 3 / 3 变 2：15%
   *   母亲 2 / 1 灵根 → 子 2 变 1：20%
   *
   * ⚠ 提纯只改**数量**；品质由数量派生（见 `qualityOfRootCount`），不用另维护。
   * ⚠ 数值集中在这里，方便后面调参。
   */
  heritage: {
    purifyChance: { 5: 0.1, 4: 0.15, 3: 0.15, 2: 0.2, 1: 0.2 }
  },

  /**
   * 子嗣修炼加成（设计 §9.1）。
   *
   * ⚠ 已**删掉「同五行 1.0」那一档**（用户决策）：设计写的是「子嗣**本命**与玩家
   *   本命的关系」，但桂冈的本命是兽 + 器（非五行），拿子嗣本命的单个 element
   *   去比对玩家的双元素集合永远为 false，这一档对当前数据是死代码。
   *   删掉后只剩三档，语义反而干净。连带 wuxing.js 的 isSameElementGroup
   *   失去唯一调用方（其注释里声明的用途就是这里）。
   */
  bonus: {
    /**
     * 灵根数量系数（2026-10-19 配平）。
     *
     * ⚠ 灵根数 = 本命 `fateElement` **去重后的集合大小**，不是本命数量。
     *   允许灵气重复后，灵根分布从旧表的 3/12/10/15/60 变成约
     *   5.0 / 18.0 / 32.7 / 35.2 / 9.0（1~5 灵根）。为保持总期望不变，
     *   本表整体乘 0.6：旧 0.02/0.05/0.10/0.20/0.40 → 新值。
     */
    rootCountCoef: { 5: 0.012, 4: 0.03, 3: 0.06, 2: 0.12, 1: 0.24 },
    fateFitCoef: { exact: 1.5, sameKind: 1.2, none: 0.5 },
    /** 词条系数是**加数**：系数 = 1 + Σ traitCoef（设计 §9.1 写作 +0.05 / +0.10 / +0.20） */
    traitCoef: { normal: 0.05, rare: 0.1, legend: 0.2 },
    /**
     * **按宿主大境界解锁的软上限**（设计 §9.1，2026-10-18 改）。
     *
     * 硬上限已取消，但总和渐近于一档上限：
     *   `总加成 = cap × (1 − e^(−原始加成 / cap))`
     *
     * 为什么不能线性无上限：626 人口上限落地后，线性叠加会把修炼速度直接拉到几十倍。
     * cap 随宿主**当前**大境界切换，突破后立即重算 —— 不是子嗣各自的封顶。
     * `nascent`（元婴）暂时保留，等 22 级境界落地再启用。
     *
     * ⚠ 旧字段 `bonus.cap = 2.0`（硬上限 +200%）已删除，别再按它写代码。
     */
    softCap: { qi: 2.0, foundation: 4.0, core: 7.0, nascent: 10.0 }
  },

  /**
   * 子嗣成长（设计 §7.1，P14）。
   *
   * 世界钟固定「1 游戏天 = 96 现实秒」，按旧的 18 岁成年要 7.3 现实天，
   * 第一代孙辈要一周以上。世界钟不能动，所以把子嗣成长**单独压缩到游戏天**，
   * 并分仙凡两轨（有灵根 = 仙师，走慢轨；无灵根 = 凡人，走快轨）。
   *
   * `boundaries[track][i]` = 「第 i 个阶段结束时的游戏天数」，下标与
   * innerCourtData.OFFSPRING_STAGES 对齐；最后一档「中年」没有边界。
   * `daysPerAge` = 仙龄 1 岁对应多少游戏天。
   *
   * ⚠ **2026-10-29 P55-a 重排（《时间刻度修订方案》§4.2）**：
   *   两条轨**合并**成同一套刻度 365 天/岁，不再分仙凡快慢轨。
   *   五档边界 = 0 / 10 / 14 / 18 / 30 岁：
   *     启蒙 **0 岁**（出生即知灵根、即可修炼 —— 原作：受精即知灵根）
   *     上工 10 岁 / 婚配 14 岁 / 成年 18 岁 / 中年 30 岁
   *   `boundaries[0] = 0` 是刻意的：`offspringGrowthOf` 用 `totalDays < 边界` 找阶段，
   *   0 永不成立 ⇒ 子嗣出生即落在 `awaken`，`infant` 档变成纯历史名词。
   *
   * ⚠ **启蒙 0 岁是 1:1 刻度成立的前提**，不是可选优化：启蒙若按 3 岁算，
   *   「出生 → 练气二层」要 32 现实小时，打穿底线 1（4.8~9.6h）3.4 倍。
   *   `boundaries` 与 `daysPerAge` 是「天数」与「岁数」两套口径，**必须同步改**。
   */
  growth: {
    boundaries: {
      mortal: [0, 3650, 5110, 6570, 10950],
      immortal: [0, 3650, 5110, 6570, 10950]
    },
    daysPerAge: { mortal: 365, immortal: 365 },
    /**
     * 收益门槛（阶段 key，取自 OFFSPRING_STAGES）。
     *   启蒙：仙师开始修炼（0 岁，出生即修）
     *   少年：上工（10 岁，家族工作 / 可派遣）
     *   青年：可婚配、可繁育（14 岁）
     *
     * ⚠ 2026-10-29 P55-a：`workStage` 从 `'awaken'` 改到 **`'youth'`** ——
     *   启蒙提前到 0 岁后，「上工 = 启蒙」等于婴儿干活。
     *   上工从 3 岁 → **10 岁** 是玩法改动：练气期 1:1 下 = 3,650 游戏天 ≈ **4.1 现实天**
     *   （不是 4 小时 —— 4 小时是**筑基后 24×** 那一栏）。
     *   `familyJobs.minAgeYears` 必须 ≤ 10，否则这条门槛被它盖掉。
     */
    workStage: 'youth',
    /**
     * @deprecated 2026-10-20 起出战门槛改读 `TUNING.offspringCultivation.fightLevel`
     *   （练气二层）。字段保留只为老档/旧注释不报错，**不要再接进判定**。
     */
    combatStage: 'youth',
    marryStage: 'junior'
  },

  /**
   * 子嗣修炼（设计 §15.2，2026-10-20 落地；2026-10-27 改曲线）。
   *
   * 日增修为 = 基础值 × 灵根系数 × (1 + 同参契合) × (1 + 灵地加成)
   *   基础值 = 2 × **1.2**^(小境界-1)
   *   每级所需 = **桂冈同层修为上限**（境界表 `CULTIVATION_CURVE.inner`）
   *
   * ⚠ 2026-10-27 为什么改：
   *   旧曲线「日增 ×1.5、升级所需 ×1.5」⇒ 每级耗时**恒定 31 天**，与层数无关；
   *   而桂冈的打坐受灵力限制，每级耗时随层数明显变长
   *   （按 +200% 子嗣加成、快子峰 1 中灵地，练气八层约 105 天/层）。
   *   结果子嗣从练气六层左右开始反超桂冈，与「多子多福」的设计预期相反。
   *   现在改成**与桂冈同一条修为曲线**、日增按 1.2^层 涨（与 spiritRate 同速），
   *   每级耗时随层数上升：单灵根约 22 天（一层）→ 262 天（八层）。
   *   子嗣加成越高，桂冈的余量越大；加成很低时仍可能在中后期被追上（不是硬上限）。
   *
   * 同参：**2026-10-28（B7）起按标签现算** —— 家族按每个子嗣的本命，
   * 从「家里有的物品」里挑契合最高的一件当**配给同参**（不消耗、可共享，
   * 只是账面配给，不会从背包里扣）。见 `offspringCompanionFitOf`。
   * `companionFitFallback` 只给两种场景：① 老档回填（`legacyCultivationLevelOf`，
   * 按当年 0.6 的口径估历史层数，不能拿新规则重算过去）；② 调用方拿不到物品表。
   */
  offspringCultivation: {
    baseGain: 2,
    /** 日增成长（2026-10-27：1.5 → 1.2，与桂冈 spiritRate 同速） */
    gainPerLevel: 1.2,
    /**
     * 灵根系数（2026-10-29 P55-a 重排，`npm run sim:offspring` 校准）。
     *
     * **旧值 {1.0, 0.8, 0.7, 0.6, 0.6} 作废** —— 单灵根与五灵根只差 1.67 倍，
     * 五灵根 89 岁就能结丹圆满，灵根等于没意义。
     * 目标：单灵根铁定筑基、双灵根结丹擦线、三灵根金丹无望、**五灵根死也筑基不了**。
     *
     * ⚠ **子嗣保留 B7 的家族配给同参**（2026-10-29 用户拍板，不按 §4.4 「无同参」字面走），
     *   所以系数是按「配给同参 = 0.6」标定的，比 §4.4.2 的占位值更狠：
     *   跨度 **1 : 0.04 = 25 倍**（方案原写 ≈15 倍，这条已作废）。
     *   五灵根 0.055 → **0.04**，把「同参 0.6 下 103 岁筑基」压到 **142 岁**（寿元 120 ⇒ 无望）。
     *   配给同参越高练得越快，这是设计意图（家里囤对路的东西就是在铺子孙的路）。
     */
    rootCoef: { 1: 1.0, 2: 0.68, 3: 0.4, 4: 0.13, 5: 0.04 },
    /** 只在「没有物品表可算」时使用；正常路径见 offspringCompanionFitOf */
    companionFitFallback: 0.6,
    spiritLandBonus: 0,
    /** 最高 **18 级 = 结丹圆满**（2026-10-29 P55-a：从练气九层放开） */
    maxLevel: 18,
    /**
     * **筑基段起 cost 加税**：`L ≥ from`（11 = 筑基初期）后每级所需修为 × `multiplier`。
     *
     * 理由：子嗣没有灵地 / 功法 / 同参三件套，越往上越该难。
     *
     * ⚠ 方案 §4.4.3 建议的是 `1.35^(L−11)`（**几何**加税），实测不行：
     *   指数是「越高越重」，结丹初期会被压得太轻（单灵根 54 岁结丹）、
     *   结丹圆满又被压得太重，两头都对不上 §4.4.2 的目标表。
     *   改成「筑基起一档**平税**」后四行目标同时成立（`npm run sim:offspring --fit=0`）：
     *     单 筑基 9 岁 / 结丹 130 岁 / 圆满 352 岁
     *     双 筑基 13 岁 / 结丹 191 岁（擦线 ✅） / 圆满 518 岁（超寿元，擦线不及）
     *     三 筑基 23 岁 / 结丹 325 岁（金丹无望）
     *     四 筑基 70 岁（勉强）/ 金丹无望
     *     五 筑基 166 岁（死也筑基不了）
     *   **再动这个数必须重跑 sim 并同步《时间刻度修订方案》§4.4.2。**
     */
    costBump: { from: 11, multiplier: 4.8 },
    /** 出战门槛：练气二层 */
    fightLevel: 2,
    /** 开始修炼的阶段（启蒙） */
    startStage: 'awaken'
  },

  /**
   * 子嗣历练（《探索系统》§七，2026-10-20 拍板落地）。
   *
   * 修为：
   *   仅打坐 = 纯打坐 100%；
   *   仅探索 = 纯打坐 × 80%；
   *   综合   = 打坐半天（100%）+ 探索半天（80%）= 纯打坐 × 90%。
   *
   * 产出（以子嗣可去的最高图为基准）：
   *   仅探索 = 桂冈名义事件的 80%；综合 = 40%。
   *   用 `eventsPerDay × 探索占比 × outputRatio` 折算成「有效事件数」，
   *   小数余数存 `expeditionCredit`，两天 9 + 10 次，长期正好 9.6 次/天。
   *
   * ⚠ **不产宝匣**（§七.1）：简化池已去掉奇遇，古修洞府进不来。
   * ⚠ 战败停止历练 **1 游戏天**（桂冈是半天）；养伤当天不探索也不打坐。
   */
  offspringExpedition: {
    /**
     * 名义事件数：24 游戏小时 / 2 小时一次 = 12。
     * 与 `exploration.js` 的 `TUNING.eventEveryGameHours` 同源；改探索节奏时两处一起看。
     */
    eventsPerDay: 12,
    /** 产出 = 桂冈的 80%（用户 2026-10-20 拍板；真值表 §6.3b 记实际值） */
    outputRatio: 0.8,
    /** 探索那半天的修为效率 = 纯打坐的 80% */
    cultivationRatio: 0.8,
    /** 同时历练上限（用户 2026-10-20 拍板；不限会线性打穿经济） */
    maxExploring: 10,
    /** 战败后停止历练 1 游戏天（§八） */
    injuryDays: 1
  },

  /**
   * 家族工作（设计 §8.1/§8.2，2026-10-20 MVP）。
   *
   * ⚠ MVP 只开放 6 个**经济产出岗位**；管事/商队护卫/驿站/亭卫/家族护卫/
   *   情报暗探/联姻使者/教书先生这 8 个安全/情报/好感岗位仍灰着 ——
   *   它们的消费口属模块四/六。
   * ⚠ 产出映射到现有资源（货币 v2 字段）：
   *   · 粮草 / 灵谷 → 凡俗层 `secular`（大子）/ 灵草（背包灵草页）
   *   · 原设计的「二阶灵石」在本批按 1:1 记作「一阶灵石」——
   *     二阶在现有经济里还是大额单位，照搬会把物价打穿。
   *   模块四/六上线后整表替换，不要在别处再写一套。
   */
  familyJobs: {
    /**
     * 最小上岗年龄 = **10 岁**（2026-10-29 P55-a 从 13 下调）。
     *
     * 2026-10-20 那条「起码 13 岁」是为了挡住「启蒙 3 岁就上工」；
     * 现在启蒙提前到 0 岁、上工阶段定在 10 岁，13 岁会把 `workStage` 整条盖掉。
     * **必须 ≤ `boundaries[1]/365`**，否则改 `workStage` 等于没改。
     * 有灵根子嗣本来就不做工，这条只约束无灵根的凡人子嗣。
     */
    minAgeYears: 10,
    jobs: [
      {
        id: 'steward',
        name: '庄头',
        desc: '管理田庄，收租与杂项',
        /** 50 大子 + 1 金页子 = 150 大子 */
        output: { secular: 150 }
      },
      {
        id: 'accountant',
        name: '账房',
        desc: '管账、放贷',
        output: { spiritual: 0.5 }
      },
      {
        id: 'caravan',
        name: '商队管事',
        desc: '经营商队',
        output: { spiritual: 5 }
      },
      {
        id: 'miner',
        name: '矿场监工',
        desc: '看管矿场',
        output: { spiritual: 2 }
      },
      {
        id: 'farmer',
        name: '灵田佃农',
        desc: '种植灵田',
        output: { herbs: 1 }
      },
      {
        id: 'artisan',
        name: '工坊匠人',
        desc: '制作法器',
        output: { forgeItems: 1 }
      }
    ]
  },

  /**
   * 子嗣繁育（设计 §7.4，P14）。
   *
   * 第一版**只做儿子线**：女儿到青年外嫁，她的子女不建模（Y 染规则，§6.0）。
   * 儿子到青年自动婚配，配偶不入侍妾池；受孕率直接复用 §5.2 的基础 10%，
   * 但**不算宿主疲劳、不设保底**（保底已在 2026-10-17 废除）。
   */
  breeding: {
    /** 全族子孙上限（含桂冈亲生）。陨落者腾出名额 */
    populationCap: 626,
    /** 每对夫妻最多 6 胎 */
    maxBirthsPerCouple: 6,
    /** 受孕率 = 10% × 配偶位阶怀孕系数 / 游戏天 */
    baseChance: 0.1,
    /**
     * 配偶位阶：
     *   无灵根儿子 → 凡女 P1-P3（pregCoef 1.0）
     *   有灵根儿子 → 女修 P7-P9（pregCoef 0.9 / 0.8 / 0.5）
     *
     * ⚠ **儿子自己的境界没有建模**：设计里练气儿子配 P7-P9、筑基儿子配 P10-P12。
     *   当前一律按「练气」给 P7-P9。等子嗣修炼系统上线再把筑基段接进来。
     */
    mortalSpouseRanks: [1, 2, 3],
    cultivatorSpouseRanks: [7, 8, 9],
    /** 配偶初始好感区间（不参与当前任何计算，留给将来的母子关系/联姻） */
    spouseAffinityRange: [40, 80]
  },

  // 侍妾池（原「抽奖」）—— 2026-10-19 P17 起抽奖页已删除，入口在郑家宝阁。
  // ⚠ **单价不在这里**：20 金页子/位 是回收口定价，真源是 `plugins/shop.js` 的 TUNING.maiden。
  gacha: {
    /**
     * 内宅人数上限。**不要设太小**：本批没有遣散/休弃机制，设成 24 会让玩家
     * 后期想换高质量侍妾时被软锁。36 同时远高于体力上限（36 × 15 = 540 vs 145~232），
     * 所以体力仍然是真正的节流阀。
     */
    householdCap: 36,
    /** ⚠ 设计未给：抽奖出 P1/P2/P3 的权重（**练气期池**） */
    rankWeights: { 1: 0.55, 2: 0.3, 3: 0.15 },
    /** ⚠ 设计未给：抽奖凡女的初始好感区间。刻意低于预置 8 位的 45~85 */
    affinityRange: [30, 60],
    /**
     * **筑基后池**（P55-b，《时间刻度修订方案》§二 #5「练气妻妾随筑基解锁」）。
     *
     * 只给 P9 一档：她是「练气期」妻妾（`pregCoef 0.5` / 寿元 120 岁），
     * 正好对上 §4.6「筑基后新人都是低受孕率的女修」。
     * 筑基/结丹妻妾（P10 / P11+）**没有获取途径**，等后续批次 —— 不是漏了。
     */
    cultivatorRankWeights: { 9: 1 },
    /** 女修初始好感略高：她们是带着修为进的府，不是买来的凡女 */
    cultivatorAffinityRange: [50, 80]
  },

  /** 本批好感静态；将来置 1 即开启「互动涨好感」 */
  affinityPerInteraction: 0
}

/**
 * 子嗣历练三档配置（《探索系统》§七）。
 * `exploreShare` = 一天里用于探索的比例；`cultivate` 档为 0。
 * 修为效率 = (1 − exploreShare) + exploreShare × `cultivationRatio`。
 */
export const EXPEDITION_MODES = Object.freeze([
  { id: 'cultivate', name: '仅打坐', exploreShare: 0 },
  { id: 'explore', name: '仅探索', exploreShare: 1 },
  { id: 'mixed', name: '综合 50/50', exploreShare: 0.5 }
])

/** 1 游戏天 = 86400 游戏秒。全模块的时间单位统一用「游戏天」 */
export const GAME_SECONDS_PER_DAY = 86400
export const GAME_SECONDS_PER_HOUR = 3600

/**
 * 仙龄刻度版本号（存档 `ageScaleVersion`）。
 *
 * 版本链（《时间刻度修订方案》§4.3）—— 每一步都**保持当前仙龄不变**：
 *
 * | 存档值 | 含义 | 迁移 |
 * |---|---|---|
 * | 0 / 缺失 | 15 游戏天/岁（P54 之前） | 15 → 365 重锚 |
 * | 1 | 45 天/岁（方案里的占位编号） | 45 → 365 重锚 |
 * | 2 | 365 天/岁（方案里的占位编号） | 不动，只补版本号 |
 * | 3 | **P54 实际写入的值**（AGE_SCALE = 3，45 天/岁） | 45 → 365 重锚 |
 * | ≥ 10 | **P55-a 之后的 365 天/岁** | 不动 |
 *
 * ⚠ 为什么是 10 而不是 4：P54 把 `AGE_SCALE`（=3）直接写进了存档，
 *   方案里的 0/1/2 只是纸面编号。留出 4~9 的空档，以后再改刻度时
 *   不会被别的批「顺手」占掉，读档逻辑也不会把 45 天/岁的档当成迁完的。
 */
export const AGE_SCALE_VERSION = 10

/**
 * 存档版本号 → 老刻度的「游戏天/岁」。返回 `365` 表示**不需要迁移**（只补版本号）。
 *
 * 这张表就是 `AGE_SCALE_VERSION` 注释里那张表，抽成纯函数是为了能断言。
 */
export const ageScaleFromPerYearOf = version => {
  const v = Number(version) || 0
  if (v >= AGE_SCALE_VERSION) return 365
  if (v === 2) return 365
  if (v >= 1) return 45
  return 15
}

/**
 * 仙龄迁移：按新刻度重算 `birthTime`，**当前仙龄一点不变**。
 *
 *   `birthTime' = now − (now − birthTime) × toPerYear / fromPerYear`
 *
 * 推导：age = (now − b)/from = (now − b')/to ⇒ b' = now − age·to = now − (now − b)·to/from。
 * 子嗣两条轨（凡人/仙师）、妻妾两条轨（凡女/女修）**全都同乘一个比**，所以一条公式通吃。
 *
 * @param fromPerYear 老档刻度的「游戏天/岁」（15 或 45）
 * @param toPerYear   新刻度的「游戏天/岁」（365）
 * @returns 新的 birthTime；`birthTime` 非法时返回 null（调用方跳过）。
 * ⚠ 未来时间会夹到 `now`（脏数据兜底，避免负年龄）。
 * ⚠ 幂等不在这里管，由调用方的 `ageScaleVersion` 保证。
 */
export const rebaseBirthTimeOf = (birthTime, nowGameSeconds, fromPerYear, toPerYear = 365) => {
  // ⚠ null 会被 `Number(null)` 当成 0（= 游戏开局那一刻），必须显式挡掉，
  //   否则「没有 birthTime 的妻妾」会被迁成 1970 年出生。
  if (birthTime == null || birthTime === '') return null
  const b = Number(birthTime)
  const now = Number(nowGameSeconds) || 0
  const from = Number(fromPerYear)
  const to = Number(toPerYear)
  if (!Number.isFinite(b) || !Number.isFinite(from) || !Number.isFinite(to)) return null
  if (!(from > 0) || !(to > 0)) return null
  const next = now - (now - b) * (to / from)
  if (!Number.isFinite(next)) return null
  return Math.min(next, now)
}
/** 游戏秒 → 一天里的第几小时（0-23），给晚间判定用 */
export const hourOfDay = gameSeconds =>
  Math.floor((Number(gameSeconds) || 0) / GAME_SECONDS_PER_HOUR) % 24

export const clamp01 = v => Math.min(1, Math.max(0, v))

// ---------- 位阶 ----------

export const rankCoefOf = rank => TUNING.ranks[rank] || null

/** 位阶名（未知位阶回落到「凡女」，避免读脏数据时 UI 空白） */
export const rankName = rank => RANK_NAMES[rank] || '凡女'

/**
 * 位阶晋升判定：**严格逐级、每次只升一级**，返回新的 rank，或 null 表示不晋升。
 *
 * 「严格逐级」不是洁癖，是必需的：P3 的条件（入房 = 互动过）在第 1 次互动就满足，
 * 而 P2 要互动 10 次。不逐级的话侍妾会在第 1 次互动就直接跳到 P3，
 * 「互动 10 次」这条规则形同虚设。逐级后实际路径是
 * P1 --(互动满 10 次)--> P2 --(次日)--> P3，两条规则都成立。
 *
 * 调用方（innerCourt.advanceInnerCourtDay）还要再限制「每游戏天最多升一级」。
 */
export const promotedRankOf = wife => {
  const cur = Math.floor(Number(wife?.rank) || 1)
  const next = TUNING.ranks[cur]?.promote
  if (!next) return null // 已封顶（P6）或该档不参与晋升（P7+）
  const need = next.n || 1
  switch (next.kind) {
    case 'interactions':
      return (wife.interactionCount || 0) >= need ? cur + 1 : null
    case 'firstNight':
      return (wife.interactionCount || 0) >= 1 ? cur + 1 : null
    case 'pregnancies':
      return (wife.pregnancyCount || 0) >= need ? cur + 1 : null
    case 'rootChildren':
      return (wife.rootChildrenCount || 0) >= need ? cur + 1 : null
    case 'topChildren':
      return (wife.topChildrenCount || 0) >= need ? cur + 1 : null
    default:
      return null
  }
}

// ---------- 体力 ----------

/**
 * 体力上限 = 145 + 外功加成（《睡觉恢复》§五）。
 *
 * 外功按**境界跳档**（与内功的修为曲线同构：小境界平推、跨大境界那级跳一档）：
 *
 *   炼体 一层~十层   每级 +3   → 十层  = 145 + 9×3 = 172
 *   锻骨 初~圆满     每级 +6   → 圆满  = 172 + 4×6 = 196
 *   洗髓 初~圆满     每级 +9   → 圆满  = 196 + 4×9 = 232
 *   19 级起（超级炼体）每级 +25 → 23 级 357、24 级 382（360 的临界点在这两级之间）
 *
 * ⚠ **炼体一层 = 基准 145（开局即此）**，所以加成的第一段从**第 2 级**起算。
 *   写成从 1 级起算会让开局变成 148，与《睡觉恢复》§二的验算对不上。
 *
 * 脏数据（NaN / 负数）一律按 0 级算 —— 上限只能被拉高，不能被脏数据拉低。
 */
const ENERGY_LEVEL_BONUS = [
  { from: 2, to: 10, per: 3 }, // 炼体（第 2 级起；第 1 级是基准）
  { from: 11, to: 14, per: 6 }, // 锻骨
  { from: 15, to: 18, per: 9 }, // 洗髓
  { from: 19, to: Infinity, per: 25 } // 超级炼体
]

export const energyMaxOf = bodyLevel => {
  const lv = Math.max(Math.floor(Number(bodyLevel) || 0), 0)
  let bonus = 0
  for (const seg of ENERGY_LEVEL_BONUS) {
    const top = Math.min(lv, seg.to)
    if (top >= seg.from) bonus += (top - seg.from + 1) * seg.per
  }
  return TUNING.energy.base + bonus
}

// ---------- 怀孕 ----------

export const fatherCoefOf = tier => TUNING.fatherCoef[tier] ?? TUNING.fatherCoef.mortal

/**
 * 年龄对受孕率的系数（2026-10-19）。
 *
 *   35 岁前 1.0；35–50 线性降到 0；50 岁后 0。
 * 不传年龄（老档 / 旧断言）时返回 1.0，保持既有概率不变。
 */
export const fertilityCoefOf = ageYears => {
  const L = TUNING.lifecycle
  const age = Number(ageYears)
  if (!Number.isFinite(age)) return 1
  if (age >= L.fertilityZeroAt) return 0
  if (age <= L.fertilityDeclineStart) return 1
  return (L.fertilityZeroAt - age) / (L.fertilityZeroAt - L.fertilityDeclineStart)
}

/**
 * 单次互动的怀孕概率（设计 §5.3 / 真值表 §5.2、§7.4）。
 *
 *   (基础 10% × 位阶怀孕系数 + 好感加成) × chanceScale 0.6 × 年龄系数 − 自动模式 5%
 *
 * ⚠ **疲劳 −10% 已废除**（2026-10-18）：体力低于 30 不再影响受孕率。
 *   自动模式的 30 体力预留仍保留，但它只是节奏阀，不再有「避免掉率」的含义。
 *
 * `auto` = 自动模式，在正向部分 ×0.6 之后额外 -5%（设计 §5.2）。
 * `ageYears` 不传 = 1.0（兼容旧断言与没有年龄字段的老档）。
 */
export const pregnancyChanceOf = ({ affinity = 0, rank = 1, auto = false, ageYears } = {}) => {
  const P = TUNING.pregnancy
  const pregCoef = rankCoefOf(rank)?.pregCoef ?? 1.0
  const aff = Math.min(Math.max(Number(affinity) || 0, 0) * P.affinityScale, P.affinityCap)
  const positive = (P.baseChance * pregCoef + aff) * P.chanceScale
  return clamp01(positive * fertilityCoefOf(ageYears) - (auto ? P.autoPenalty : 0))
}

/**
 * 判孕。**没有保底**（2026-10-17 决议废除，2026-10-18 落地）——
 * 可能连中，也可能长期不中；这是刻意的挂机随机性，不要把 pity 分支加回来。
 */
export const rollPregnancy = ({ chance = 0, rng = Math.random } = {}) => rng() < chance

/** 本次怀孕锁定的天数：80–100 闭区间 */
export const rollPregnancyDays = (rng = Math.random) => {
  const [lo, hi] = TUNING.pregnancy.daysRange
  return lo + Math.floor(rng() * (hi - lo + 1))
}

/** 入府时随机一套经期周期：周期 28–35 天，经期 3–7 天 */
export const rollWifeCycle = (rng = Math.random) => {
  const [cLo, cHi] = TUNING.cycle.cycleRange
  const [pLo, pHi] = TUNING.cycle.periodRange
  return {
    cycleDays: cLo + Math.floor(rng() * (cHi - cLo + 1)),
    periodDays: pLo + Math.floor(rng() * (pHi - pLo + 1))
  }
}

/** 入府年龄：16–22 岁闭区间 */
export const rollEntryAge = (rng = Math.random) => {
  const [lo, hi] = TUNING.lifecycle.ageRange
  return lo + Math.floor(rng() * (hi - lo + 1))
}

/** 妻妾是否走女修轨（P9+）。目前没有女修侍妾来源，但老档/GM 可能已经有。 */
export const wifeIsCultivatorOf = (wife, tuning = TUNING) =>
  (Number(wife?.rank) || 1) >= (Number(tuning.lifecycle.cultivatorFromRank) || 9)

/**
 * 这位妻妾一年按多少游戏天算。
 *
 * ⚠ 2026-10-29 P55-a：两条轨**都改成 365**（练气期 1:1）。
 *   字段保留是因为 B1 之后女修可能再单独调；但**现在两者相等**，
 *   「仙师老得慢」由 `wifeLifespanOf` 的境界寿元表表达，不是靠刻度。
 */
export const wifeDaysPerYearOf = (wife, tuning = TUNING) =>
  wifeIsCultivatorOf(wife, tuning)
    ? Number(tuning.lifecycle.cultivatorDaysPerYear) || 365
    : Number(tuning.lifecycle.daysPerYear) || 365

/**
 * 妻妾寿元。
 *   凡女（P1–P8）：80 岁
 *   女修：P9 练气 120 / P10 筑基 200 / P11+ 金丹 500
 * P12 是金丹圆满、P13 是元婴女修；本作境界只到结丹，元婴先按金丹上限 500 占位。
 */
export const wifeLifespanBaseOf = (wife, tuning = TUNING) => {
  const L = tuning.lifecycle
  if (!wifeIsCultivatorOf(wife, tuning)) return Number(L.mortalLifespan) || 80
  const rank = Math.floor(Number(wife?.rank) || 9)
  const table = L.cultivatorLifespan || {}
  return Number(table[rank]) || Number(table[11]) || 500
}

/**
 * 寿元的**随机偏移**（±`lifecycle.lifespanJitter`，默认 ±5%）。
 *
 * 只吃 `id + name`（FNV-1a 稳定哈希）——**绝不能用 Math.random**，
 * 否则刷新一次寿元就变一次。同一个人一辈子固定，切境界只换 base。
 */
export const lifespanJitterOf = (id, name, tuning = TUNING) => {
  const jitter = Math.max(Number(tuning.lifecycle.lifespanJitter) || 0, 0)
  if (!jitter) return 0
  const unit = stableUnit(`lifespan|${id || ''}|${name || ''}`)
  return (unit * 2 - 1) * jitter
}

/**
 * 妻妾寿元（含 ±5% 随机）。**实时派生**，不吃存档里的 `lifespanYears`。
 * 女修看 `rank`（P9 练气 120 / P10 筑基 200 / P11+ 结丹 500），凡女 80。
 */
export const wifeLifespanOf = (wife, tuning = TUNING) =>
  wifeLifespanBaseOf(wife, tuning) *
  (1 + lifespanJitterOf(wife?.id, wife?.name, tuning))

/** 当前仙龄（岁，可为小数）；缺 birthTime 返回 null */
export const wifeAgeYearsOf = (wife, nowGameSeconds, tuning = TUNING) => {
  const birth = Number(wife?.birthTime)
  if (!Number.isFinite(birth)) return null
  const perYear = wifeDaysPerYearOf(wife, tuning) * GAME_SECONDS_PER_DAY
  return Math.max(0, (Number(nowGameSeconds) - birth) / perYear)
}

/**
 * 生命周期阶段：少女 / 妇人 / 老妇；超过寿元返回「已故」。
 *
 * 2026-10-20：阶段阈值按寿元等比缩放。凡女 80 岁仍是 30/50/80；
 * 女修 120 岁就变成 45/75/120，500 岁变成 187.5/312.5/500。
 */
export const wifeLifeStageOf = (ageYears, lifespan = TUNING.lifecycle.mortalLifespan) => {
  const age = Number(ageYears)
  if (!Number.isFinite(age)) return null
  const L = TUNING.lifecycle
  const life = Number(lifespan) || Number(L.mortalLifespan) || 80
  if (age >= life) return { key: 'passed', name: '已故' }
  const ratio = life / (Number(L.mortalLifespan) || 80)
  const stage = L.stageNames.find(s => age < s.toAge * ratio) || L.stageNames[L.stageNames.length - 1]
  return { key: stage.key, name: stage.name }
}

/** 是否在世（已故妻妾仍留在 wives 数组里，家族树要读） */
export const isAliveWife = wife => !!wife && wife.status !== 'passed_away'

/**
 * 当前经期状态。纯派生，**不依赖 status** —— 时钟跳跃/读档后也能直接算出
 * 当前落在周期的第几天。
 *
 * ⚠ **2026-10-29 P55-a 起经期取消，本函数不再参与任何判定**（商店/内宅都不读它）。
 *   保留只为了：① 老档字段形状不报错；② 断言里还能验「旧数据能算」。
 *   要恢复经期，得先推翻《时间刻度修订方案》§4.5。
 */
export const wifeCycleStateOf = (wife, nowGameSeconds) => {
  const start = Number(wife?.cycleStartTime)
  const cycleDays = Number(wife?.cycleDays)
  const periodDays = Number(wife?.periodDays)
  if (!Number.isFinite(start) || !(cycleDays > 0) || !(periodDays > 0)) {
    return { inPeriod: false, cycleIndex: 0, periodStartTime: null, periodEndTime: null }
  }
  const now = Number(nowGameSeconds) || 0
  const elapsedDays = Math.floor((now - start) / GAME_SECONDS_PER_DAY)
  const cycleIndex = ((elapsedDays % cycleDays) + cycleDays) % cycleDays
  const cycleStartDay = Math.floor(elapsedDays / cycleDays)
  const periodStartTime = start + cycleStartDay * cycleDays * GAME_SECONDS_PER_DAY
  return {
    inPeriod: cycleIndex < periodDays,
    cycleIndex,
    periodStartTime,
    periodEndTime: periodStartTime + periodDays * GAME_SECONDS_PER_DAY
  }
}

/**
 * 是否在经期。**2026-10-29 P55-a 起已从所有判定里摘掉**，只有断言还在用。
 * @deprecated 不要再接回互动/自动挑人/每日结算，见 `wifeCycleStateOf` 的注释。
 */
export const isWifeInPeriod = (wife, nowGameSeconds) =>
  wifeCycleStateOf(wife, nowGameSeconds).inPeriod

// ---------- 自动模式的挑人规则（设计 §5.2）----------

/** 本批实现的三种规则。设计里的「优先未孕」是隐式的（候选人本来就全是待孕），「自定义顺序」留后 */
export const AUTO_RULES = ['relation', 'rank', 'robin']

/**
 * 按规则给候选侍妾排序（不改原数组）。
 *   relation —— 优先高好感
 *   rank     —— 优先高位阶，同位阶比好感
 *   robin    —— 平均分配：优先**最久没轮到的**（用 lastInteractionTime，没互动过的最先）
 */
export const sortWivesByRule = (wives = [], rule = 'relation') => {
  const list = [...wives]
  if (rule === 'rank') {
    return list.sort((a, b) => (b.rank || 0) - (a.rank || 0) || (b.affinity || 0) - (a.affinity || 0))
  }
  if (rule === 'robin') {
    return list.sort((a, b) => (a.lastInteractionTime ?? -1) - (b.lastInteractionTime ?? -1))
  }
  return list.sort((a, b) => (b.affinity || 0) - (a.affinity || 0))
}

/**
 * 自动模式挑人 —— 返回可以留宿的侍妾 id 数组。
 *
 * ⚠ **会留出 `fatigueThreshold` 点体力不用**。2026-10-18 起它只是节奏阀
 *   （受孕率的疲劳 −10% 已废除，不再有「留 30 避免掉率」的含义）。
 *   保留它是因为互动成本 15→20、0.5h→1h 那批还没返工 ——
 *   现在删掉会让每晚互动从 4 涨到 6，和设计的中期状态不一致。
 *   145 体力的开局 → 挑 7 人（花 105，正好留 40）。
 */
export const pickAutoWives = ({ wives = [], rule = 'relation', energy = 0, now = null } = {}) => {
  const budget = Math.max((Number(energy) || 0) - TUNING.pregnancy.fatigueThreshold, 0)
  const max = Math.floor(budget / TUNING.energy.perInteraction)
  if (max <= 0) return []
  // ⚠ 2026-10-29 P55-a：经期取消，不再按 `isWifeInPeriod` 过滤；
  //   只留「过了生育年龄就不挑」这一条（受孕率本来就归零，挑上白花体力）。
  const candidates = wives.filter(w => {
    if (w.status !== 'idle') return false
    if (now === null) return true // 老调用/断言不传时间 → 保持旧行为
    const age = wifeAgeYearsOf(w, now)
    return age == null || fertilityCoefOf(age) > 0
  })
  return sortWivesByRule(candidates, rule)
    .slice(0, max)
    .map(w => w.id)
}

// ---------- 灵根与抽卡 ----------

/**
 * 第一步：判有无灵根（设计 §6.1）。
 * 上限 100% —— P11 以上母方位阶的系数会让原始值超过 100%，必须钳制。
 */
export const rootChanceOf = ({ rank = 1, fatherTier = 'mortal', rootBonus = 0 } = {}) =>
  clamp01(
    TUNING.draw.baseRootChance * (rankCoefOf(rank)?.rootCoef ?? 0.5) * fatherCoefOf(fatherTier) +
      (Number(rootBonus) || 0)
  )

/**
 * 子嗣性别：`rng < maleChance` 为男，否则为女。
 * 独立于诞生抽卡调用（不塞进 rollOffspring），避免改变既有 rng 序列的语义。
 */
export const rollOffspringGender = (rng = Math.random) =>
  rng() < TUNING.offspring.maleChance ? 'male' : 'female'

/**
 * 灵根数量 → 品质「叫法」。
 * ⚠ 品质只是标签，真源是几灵根（P15.5(c)）。无灵根返回 null。
 */
export const qualityOfRootCount = count => {
  const n = Math.floor(Number(count) || 0)
  if (n >= 5) return 'low'
  if (n >= 3) return 'mid'
  if (n === 2) return 'high'
  if (n === 1) return 'top'
  return null
}

/** 灵根数量的中文叫法（1 单 / 2 双 / 3~5） */
export const rootCountName = count => {
  const n = Math.floor(Number(count) || 0)
  if (n <= 0) return '无灵根'
  if (n === 1) return '单灵根'
  if (n === 2) return '双灵根'
  if (n >= 3 && n <= 5) return `${'三四五'[n - 3]}灵根`
  return `${n} 灵根`
}

/**
 * 第二步之一：**本命数量**分布（累积扫描，区间左闭右开）。
 *
 * ⚠ 2026-10-19 修正：这里抽的是**本命件数**，不是灵根数。
 *   灵根数 = 本命 `fateElement` 去重后的集合大小，可能小于本命数
 *   （3 件木系本命 = 单木灵根）。
 *   旧名 `rollRootCount` 保留为别名，避免老调用点/断言一次性全改。
 */
export const rollFateCount = (rng = Math.random) => {
  const dist = TUNING.draw.rootCountDist
  const entries = Object.entries(dist)
    .map(([count, p]) => [Number(count), Number(p)])
    .sort((a, b) => b[0] - a[0]) // 5 → 4 → 3 → 2 → 1，与旧品质顺序一致
  const r = rng()
  let acc = 0
  for (const [count, p] of entries) {
    acc += p
    if (r < acc) return count
  }
  return entries[entries.length - 1][0]
}

/** @deprecated 旧名；语义已改为「本命数量」，新代码用 `rollFateCount` */
export const rollRootCount = rollFateCount

/**
 * 血脉提纯（P15.5(b)）：按母亲（配偶）的灵根档修正子嗣的灵根数量。
 *
 * 只有「子嗣与母亲落在同一档」时才可能 −1，且最少保留 1 个灵根：
 *   母亲 5       + 子 5       → 10% 变 4
 *   母亲 4 / 3   + 子 4 / 3   → 15% 变少一个
 *   母亲 2 / 1   + 子 2       → 20% 变 1（子 1 已到底）
 *
 * ⚠ `motherRootCount <= 0`（宿主侍妾 / 无灵根配偶）时**不消耗 rng**，也没有提纯。
 *   其余情况**总是消耗一次 rng**（不短路），保证随机序列稳定、可断言。
 */
export const purifiedRootCount = (rootCount, motherRootCount = 0, rng = Math.random) => {
  const count = Math.max(Math.floor(Number(rootCount) || 0), 1)
  const mother = Math.floor(Number(motherRootCount) || 0)
  if (mother <= 0) return count

  const roll = rng()
  const chance = Number(TUNING.heritage.purifyChance[mother]) || 0
  const sameBand =
    (mother >= 5 && count >= 5) ||
    (mother >= 3 && mother <= 4 && count >= 3 && count <= 4) ||
    (mother >= 1 && mother <= 2 && count >= 1 && count <= 2)
  return sameBand && count > 1 && roll < chance ? count - 1 : count
}

/** 从池子里不放回地抽 n 个（n 超过池子大小时取满为止） */
const pickN = (pool, n, rng) => {
  const work = [...pool]
  const out = []
  for (let i = 0; i < n && work.length; i++) {
    const idx = Math.min(Math.floor(rng() * work.length), work.length - 1)
    out.push(work.splice(idx, 1)[0])
  }
  return out
}

/** 灵气集合：从 elementPool 里不重复地抽 count 个 */
export const rollRootElements = ({ count = 1, rng = Math.random } = {}) => {
  const n = Math.max(Math.min(Math.floor(Number(count) || 1), TUNING.draw.elementPool.length), 1)
  return pickN(TUNING.draw.elementPool, n, rng)
}

/** 词条数量按品质定（设计 §6.2 的「词条」列） */
const TRAIT_SPEC = {
  low: { normal: 1, rare: 0, legend: 0 },
  mid: { normal: 0, rare: 1, legend: 0 },
  high: { normal: 0, rare: 2, legend: 0 },
  top: { normal: 0, rare: 3, legend: 1 }
}

/** 第二步之二：词条（同档内不重复） */
export const rollTraitList = ({ quality = 'low', rng = Math.random } = {}) => {
  const spec = TRAIT_SPEC[quality] || TRAIT_SPEC.low
  const out = []
  for (const grade of ['normal', 'rare', 'legend']) {
    for (const t of pickN(TRAIT_POOL[grade] || [], spec[grade] || 0, rng)) {
      out.push({ id: t.id, name: t.name, grade })
    }
  }
  return out
}

/**
 * 本命品阶上限（《物品池设计方案》§5.2，2026-10-19 定）。
 *
 * 灵根数量决定本命最高能抽到几阶：**5→1、4/3→2、2→4、1→5**。
 * ⚠ 这是**上限**，不是保底：单灵根也可以抽到 1 阶本命；五灵根只能抽到 1 阶。
 * 目的是恢复《模块二》§6.2「灵根越少、本命越稀有」的方向，同时不强制高阶。
 */
export const FATE_TIER_CAP = { 5: 1, 4: 2, 3: 2, 2: 4, 1: 5 }
export const fateTierCapOf = rootCount => {
  const n = Math.max(Math.min(Math.floor(Number(rootCount) || 1), 5), 1)
  return FATE_TIER_CAP[n] ?? 5
}

/**
 * 第二步之三：本命。
 *
 * ⚠ **P17 起本命是「多件」**：一次抽 `rootCount` 件底材快照，灵根 = 本命
 * `fateElement` 的集合。旧的一件式 API 保留为兼容包装，新代码用
 * `rollFateSet`（`plugins/items.js`）。
 */
export const rollFate = ({ rng = Math.random } = {}) =>
  rollFateSet({ count: 1, maxTier: 5, rng })[0] || null

/**
 * 诞生抽卡的**唯一入口** —— 两步走 + 两条保底都在这里。
 *
 * 保底优先于掷骰，且掷骰总是先执行（不短路），保证 rng 的消耗次数稳定 ——
 * 否则同一条随机序列在不同保底状态下会走到不同的分支，没法写确定性断言。
 *
 * @returns {{hasRoot, quality, rootCount, roots, fate, traits}}
 *          无灵根时 quality/rootCount/roots/fate/traits 全为空值
 */
export const rollOffspring = ({
  rank = 1,
  fatherTier = 'mortal',
  totalDraws = 0,
  pityNoRoot = 0,
  /** 英烈祠：每块牌位 +0.1% 灵根概率（《秘境系统》§六） */
  rootBonus = 0,
  /**
   * 母亲的灵根数量（P15.5(b) 血脉提纯）。
   * ⚠ **只给子嗣繁育传**（母亲 = 儿子的配偶）；宿主侍妾的诞生不传，保持原样。
   */
  motherRootCount = 0,
  rng = Math.random
} = {}) => {
  const D = TUNING.draw
  const guaranteed = D.firstChildGuaranteed && (Number(totalDraws) || 0) === 0
  const pityHit = (Number(pityNoRoot) || 0) >= D.pityRootLimit - 1
  const roll = rng()
  const hasRoot =
    guaranteed || pityHit || roll < rootChanceOf({ rank, fatherTier, rootBonus })

  if (!hasRoot) {
    return { hasRoot: false, quality: null, rootCount: 0, roots: [], fate: null, traits: [] }
  }

  // 2026-10-19 修正：**先定本命，再查表判断灵根**。
  //   ① 抽本命数量 → ② 抽本命（灵气可重复）→ ③ 灵根 = 本命属性去重集合
  //   ④ 血脉提纯去掉一个灵根（连同该灵根的本命）→ ⑤ 按最终灵根数压本命阶数
  const fateCount = rollFateCount(rng)
  let fates = rollFateSet({ count: fateCount, rng })
  let roots = fates.length
    ? [...new Set(fates.map(fate => fate.fateElement))]
    : rollRootElements({ count: fateCount, rng })

  // 血脉提纯：只在「子嗣繁育」传 motherRootCount；命中时移除一个灵根，
  // 并把该灵根下的本命一并移除 —— 本命仍是灵根的来源，不能只改 roots。
  if (roots.length > 1 && purifiedRootCount(roots.length, motherRootCount, rng) < roots.length) {
    const idx = Math.min(Math.floor(rng() * roots.length), roots.length - 1)
    const removed = roots[idx]
    roots = roots.filter(element => element !== removed)
    fates = fates.filter(fate => fate.fateElement !== removed)
  }

  const rootCount = roots.length || Math.max(fateCount, 1)
  fates = clampFateTiers({ fates, maxTier: fateTierCapOf(rootCount), rng })
  const quality = qualityOfRootCount(rootCount)
  return {
    hasRoot: true,
    quality,
    rootCount,
    roots,
    fates,
    // 兼容旧字段：UI 还没全部改成多本命前，fate = 第一件
    fate: fates[0] || null,
    traits: rollTraitList({ quality, rng })
  }
}

/**
 * 洗命（P15.5(a)）：重抽**灵根数量 + 属性 + 本命 + 词条**。
 * 不碰 `hasRoot` —— 无灵根子嗣根本不能洗（store 层会拒绝）。
 * 品质由数量派生，所以不需要单独返回/重抽。
 */
export const rollRootProfile = (rng = Math.random) => {
  const fateCount = rollFateCount(rng)
  let fates = rollFateSet({ count: fateCount, rng })
  const roots = fates.length
    ? [...new Set(fates.map(fate => fate.fateElement))]
    : rollRootElements({ count: fateCount, rng })
  const rootCount = roots.length || Math.max(fateCount, 1)
  fates = clampFateTiers({ fates, maxTier: fateTierCapOf(rootCount), rng })
  return {
    hasRoot: true,
    rootCount,
    quality: qualityOfRootCount(rootCount),
    roots,
    fates
  }
}

/**
 * 老档子嗣的本命迁移：按 `roots` 稳定补齐 `fates[]`，**不重掷**。
 *
 * 旧档（P17 之前）的 `fate` 是单件，且与 `roots` 独立抽的 —— 例如
 * 「五系灵根 + 粗铁棍」这种组合。旧 `粗铁棍`（`crude_iron_rod`）已经不在
 * 当前物品池里，所以这里**以 `roots` 为准**重建本命：
 *   · roots 为空时退回旧 fate 的 element；
 *   · 再不行给一个稳定兜底（wood）；
 *   · 本命数量严格等于灵根数量，阶数受 `fateTierCapOf` 上限约束。
 *
 * 只在 `normalizeInnerCourtOnLoad` 里用；新档走 `rollOffspring`。
 */
export const legacyFatesOf = child => {
  if (!child?.hasRoot) return []
  let roots = Array.isArray(child.roots) ? [...new Set(child.roots.filter(Boolean))] : []
  if (!roots.length) {
    const legacyElement = child?.fate?.fateElement || child?.fate?.element
    if (legacyElement) roots = [legacyElement]
  }
  if (!roots.length) roots = ['wood']
  const rootCount = Math.max(Math.min(roots.length, 5), 1)
  const seed = `${child?.id || ''}|${child?.name || ''}`
  let fates = fatesFromRoots({
    roots,
    maxTier: fateTierCapOf(rootCount),
    seed
  })
  if (!fates.length) {
    fates = fatesFromRoots({ roots: ['wood'], maxTier: 5, seed })
  }
  return fates
}

// ---------- 子嗣修炼加成 ----------

/**
 * 从 practice 对象取出「玩家本命画像」，供加成判定与 verify 复用。
 * 玩家本命与灵气集合的真源在 harmony.js，这里只是整理成好传的形状。
 */
export const playerFateProfile = practice => {
  const fates = playerFates(practice)
  return {
    playerFateIds: fates.map(f => f.id),
    playerKinds: [...new Set(fates.map(f => f.kind))],
    playerElements: playerElements(practice)
  }
}

/**
 * 本命契合系数（设计 §6.3 / §9.1 的关系表）。
 * ⚠ 只有三档：「同五行」已按用户决策删除。判定顺序不可换 ——
 *   完全相同要先于同类型，否则同名本命会掉到 1.2。
 */
export const fateFitOf = ({ child, playerFateIds = [], playerKinds = [] } = {}) => {
  const B = TUNING.bonus.fateFitCoef
  // P17：多本命 —— 任意一件撞上父亲的本命/类型就取对应档；旧档只有单件 fate
  const fates =
    Array.isArray(child?.fates) && child.fates.length
      ? child.fates
      : child?.fate
        ? [child.fate]
        : []
  if (!fates.length) return B.none
  if (fates.some(fate => fate?.id && playerFateIds.includes(fate.id))) return B.exact
  if (fates.some(fate => fate?.kind && playerKinds.includes(fate.kind))) return B.sameKind
  return B.none
}

/** 子嗣的本命列表（新档读 fates，老档回落到单件 fate） */
export const childFatesOf = child => {
  if (Array.isArray(child?.fates) && child.fates.length) return child.fates
  return child?.fate ? [child.fate] : []
}

/** UI 用：`饕餮纹白玉牌、青玉剑`；没有本命 → `—` */
export const fateLabelOf = child => {
  const names = childFatesOf(child)
    .map(fate => fate?.name)
    .filter(Boolean)
  return names.length ? names.join('、') : '—'
}

/** 单个子嗣的加成。无灵根 → 0（词条与本命都不作数） */
export const offspringBonusOf = ({ child, playerFateIds = [], playerKinds = [] } = {}) => {
  if (!child?.hasRoot) return 0
  const rootCoef = TUNING.bonus.rootCountCoef[child.rootCount] ?? 0
  const traitCoef = 1 + (child.traits || []).reduce((s, t) => s + (TUNING.bonus.traitCoef[t.grade] || 0), 0)
  return rootCoef * fateFitOf({ child, playerFateIds, playerKinds }) * traitCoef
}

/** 宿主大境界 → 软上限 cap（未知境界按练气 2.0 兜底） */
export const bonusCapOf = tier => TUNING.bonus.softCap[tier] ?? TUNING.bonus.softCap.qi

/**
 * 软上限：`cap × (1 − e^(−原始/cap))`（设计 §9.1）。
 *   raw = cap     → 63.2%
 *   raw = 2 × cap → 86.5%
 *   raw = 3 × cap → 95%
 * 负值/NaN 一律按 0；cap 非法时回落到练气档。
 */
export const applyBonusSoftCap = (raw, cap = TUNING.bonus.softCap.qi) => {
  const c = Number(cap) > 0 ? Number(cap) : TUNING.bonus.softCap.qi
  const r = Math.max(Number(raw) || 0, 0)
  return c * (1 - Math.exp(-r / c))
}

/**
 * 全部子嗣的**原始**加成之和（未套软上限）。
 * UI 用它展示「原始 +X% → 实际 +Y%」，让玩家看得见软上限在起作用。
 * 陨落的子嗣不再提供加成（防御性过滤：调用方通常已传 livingOffspring）。
 */
export const rawChildrenBonus = (children, profile = {}) =>
  (children || [])
    .filter(c => c.status !== 'fallen' && c.status !== 'passed_away')
    .reduce((s, c) => s + offspringBonusOf({ child: c, ...profile }), 0)

/**
 * 全部子嗣的加成之和，**末尾套软上限**（设计 §9.1）。
 * @param cap 宿主当前大境界的 cap；不传则按练气 2.0（纯函数层不知道宿主境界）
 */
export const sumChildrenBonus = (children, profile = {}, cap = TUNING.bonus.softCap.qi) =>
  applyBonusSoftCap(rawChildrenBonus(children, profile), cap)

// ---------- 抽奖凡女 ----------

const pickOne = (arr, rng) => arr[Math.min(Math.floor(rng() * arr.length), arr.length - 1)]

/** 按权重表抽一个键（键是位阶号，返回 number） */
const weightedPick = (weights, rng) => {
  const entries = Object.entries(weights)
  const total = entries.reduce((s, [, w]) => s + w, 0)
  const r = rng() * total
  let acc = 0
  for (const [key, w] of entries) {
    acc += w
    if (r < acc) return Number(key)
  }
  return Number(entries[entries.length - 1][0])
}

/**
 * 随机生成一位侍妾（纳妾入宅用）。
 *
 * **按境界换池**（P55-b）：练气期抽 P1–P3 凡女（好感 30~60）；
 * 筑基后抽 P9 练气女修（好感 50~80，`pregCoef 0.5`、寿元 120 岁）。
 *
 * @param ascended 是否筑基以上（`realm.isAscendedLevelOf`，由 store 传进来）
 */
export const generateMaiden = ({ seq = 1, rng = Math.random, now = 0, ascended = false } = {}) => {
  const G = TUNING.gacha
  const cultivator = !!ascended
  const [lo, hi] = cultivator ? G.cultivatorAffinityRange : G.affinityRange
  const entryAge = rollEntryAge(rng)
  const cycle = rollWifeCycle(rng)
  // 池子里有哪些位阶由 TUNING 决定；仍按位阶取轨（寿元 / 刻度 / pregCoef 都按 rank 派生）
  const rank = weightedPick(cultivator ? G.cultivatorRankWeights : G.rankWeights, rng)
  const perYear = wifeDaysPerYearOf({ rank }) * GAME_SECONDS_PER_DAY
  const id = `w_${seq}`
  const name = `${pickOne(SURNAMES, rng)}${pickOne(GIVEN_NAMES, rng)}`
  return newWife({
    id,
    name,
    rank,
    affinity: Math.round(lo + rng() * (hi - lo)),
    origin: 'gacha',
    sourceDetail: cultivator ? '筑基后纳妾' : '抽奖所得',
    // 生命周期 / 经期（2026-10-19；女修轨 2026-10-20）
    entryAgeYears: entryAge,
    birthTime: Number(now) - entryAge * perYear,
    // 寿元实时派生（含 ±5% 随机），存档字段只是快照 —— 见 `wifeLifespanOf`
    lifespanYears: wifeLifespanOf({ id, name, rank }),
    cycleStartTime: Number(now) - Math.floor(rng() * cycle.cycleDays) * GAME_SECONDS_PER_DAY,
    cycleDays: cycle.cycleDays,
    periodDays: cycle.periodDays
  })
}

// ---------- 展示用小工具 ----------

const CN_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']

/** 阿拉伯数字 → 中文数字（子嗣命名「桂十二」用）。100 以上原样返回 */
export const cnNumeral = n => {
  const v = Math.max(Math.floor(Number(n) || 0), 0)
  if (v <= 10) return v === 10 ? '十' : CN_DIGITS[v]
  if (v < 20) return `十${CN_DIGITS[v - 10]}`
  if (v < 100) {
    const tens = Math.floor(v / 10)
    const ones = v % 10
    return `${CN_DIGITS[tens]}十${ones ? CN_DIGITS[ones] : ''}`
  }
  return String(v)
}

/**
 * 子嗣命名：桂大 / 桂二 / … / 桂十二。
 * 长子叫「大」不是「一」—— 设计 §13.3 的谱系里是「桂大、桂二、桂四」。
 */
export const offspringNameOf = (surname, seq) =>
  `${String(surname || '桂').charAt(0)}${(Math.floor(Number(seq)) || 1) === 1 ? '大' : cnNumeral(seq)}`

/**
 * 命名池（模块加载时算一次）：
 *   normal = 中性池 + 性别池，去重；
 *   easter = 掌门路彩蛋池，**剔掉与普通池重名的**（两池合并去重）。
 */
const buildNamePool = (shared, gendered, easter) => {
  const normal = [...new Set([...shared, ...gendered])]
  const normalSet = new Set(normal)
  return {
    normal,
    easter: [...new Set(easter)].filter(name => !normalSet.has(name))
  }
}

const NAME_POOLS = {
  male: buildNamePool(
    OFFSPRING_GIVEN_NAMES,
    OFFSPRING_GIVEN_NAMES_MALE,
    OFFSPRING_EASTER_EGG_NAMES.male
  ),
  female: buildNamePool(
    OFFSPRING_GIVEN_NAMES,
    OFFSPRING_GIVEN_NAMES_FEMALE,
    OFFSPRING_EASTER_EGG_NAMES.female
  )
}

/**
 * 老档子嗣没有 `gender` 字段（2026-10-18 之前）。读档时按 id+name 做 FNV-1a
 * 稳定哈希补一个 —— **不能每次刷新重掷**，否则同一名子嗣的性别会来回变。
 * 新档不走这里。
 */
/** FNV-1a 32 位整数哈希。老档补字段一律用它，**不要用 Math.random**。 */
const stableHash = seed => {
  let hash = 2166136261
  const text = String(seed || '')
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** 稳定映射到 [0,1) */
export const stableUnit = seed => stableHash(seed) / 4294967296

export const legacyOffspringGender = child =>
  stableHash(`${child?.id || ''}|${child?.name || ''}`) % 2 === 0 ? 'male' : 'female'

/**
 * 给子嗣随机起名：保留父姓（取道号第一个字），按**性别**从对应名池抽。
 *
 * 顺序（P12.6 口径）：
 *   1. 20% 走掌门路彩蛋池，否则走普通池；避开已有名字；
 *   2. 精选池抽满 60 次仍撞名 → 「字1 + 字2」组合（40 × 30 = 1,200 种）；
 *   3. 组合也撞满 → 加两位数字后缀，只作最后兜底。
 *
 * @param {string} fatherName 父方道号，取首字作姓
 * @param {{existing?: string[], rng?: () => number, gender?: 'male'|'female'}} options
 */
export const randomOffspringName = (
  fatherName = '桂',
  { existing = [], rng = Math.random, gender = 'male' } = {}
) => {
  const family = String(fatherName || '桂').charAt(0) || '桂'
  const g = gender === 'female' ? 'female' : 'male'
  const pools = NAME_POOLS[g]
  const parts = OFFSPRING_NAME_PARTS[g]
  const N = TUNING.offspring
  const taken = new Set((existing || []).map(name => String(name || '')))
  const fromPool = pool => `${family}${pickOne(pool, rng)}`

  // 1. 彩蛋 / 普通池
  const useEaster = pools.easter.length > 0 && rng() < N.easterEggRate
  const pool = useEaster ? pools.easter : pools.normal
  for (let i = 0; i < N.nameAttempts; i += 1) {
    const candidate = fromPool(pool)
    if (!taken.has(candidate)) return candidate
  }

  // 2. 组合兜底
  for (let i = 0; i < N.nameAttempts; i += 1) {
    const candidate = `${family}${pickOne(parts.first, rng)}${pickOne(parts.second, rng)}`
    if (!taken.has(candidate)) return candidate
  }

  // 3. 数字后缀（最后兜底，不保证唯一 —— 626 人也到不了这一步）
  return `${fromPool(pool)}${Math.floor(rng() * 90) + 10}`
}

/** 游戏秒 → 游戏天（从 0 开始） */
export const gameDayOf = gameSeconds => Math.floor((Number(gameSeconds) || 0) / GAME_SECONDS_PER_DAY)

/**
 * 子嗣年龄（展示用）：一年 365 天、一月 30 天，余数向下取整。
 * 只用于列表展示，不参与任何数值判定 —— 所以不进 TUNING。
 * @returns {{ totalDays:number, years:number, months:number, days:number }}
 */
export const offspringAgeOf = (birthTime, nowGameSeconds) => {
  const elapsed = (Number(nowGameSeconds) || 0) - (Number(birthTime) || 0)
  const totalDays = Math.max(Math.floor(elapsed / GAME_SECONDS_PER_DAY), 0)
  const years = Math.floor(totalDays / 365)
  const months = Math.floor((totalDays % 365) / 30)
  return {
    totalDays,
    years,
    months,
    // 余下的天数要扣掉整年 + 整月，不能直接 totalDays % 30
    days: totalDays - years * 365 - months * 30
  }
}

/**
 * 年龄文案：X 岁 Y 月 / Y 月 / X 天（不足一月按天显示）。
 *
 * ⚠ 这是**旧口径**（一年 365 天），保留给诞生弹窗/日志等不分仙凡的场合。
 *   列表里的「阶段 · 仙龄 · 进度」请用 `formatOffspringGrowth`（仙凡双轨）。
 */
export const formatOffspringAge = (birthTime, nowGameSeconds) => {
  const { totalDays, years, months, days } = offspringAgeOf(birthTime, nowGameSeconds)
  if (years > 0) return `${years} 岁 ${months} 月`
  if (months > 0) return `${months} 月`
  return `${days ?? totalDays} 天`
}

// ---------- 子嗣成长（P14，设计 §7.1）----------

/** 走哪条轨：有灵根 = 仙师（慢轨），无灵根 = 凡人（快轨） */
export const growthTrackOf = child => (child?.hasRoot ? 'immortal' : 'mortal')

/**
 * 子嗣成长快照。
 *
 * @returns {{
 *   track: 'mortal'|'immortal',
 *   totalDays: number,       // 出生至今的游戏天
 *   stageIndex: number,      // 0..5，对应 OFFSPRING_STAGES
 *   stageKey: string,        // 'infant' | 'awaken' | 'youth' | 'junior' | 'adult' | 'elder'
 *   stageName: string,
 *   ageYears: number,        // **仙龄**（向下取整）：两条轨都是 365 天/岁（P55-a）
 *   stageStart: number,      // 本阶段起始天数（含）
 *   stageEnd: number|null,   // 本阶段结束天数（不含）；「中年」为 null
 *   progress: number         // 本阶段进度 0..1（中年恒 1）
 * }}
 */
export const offspringGrowthOf = (child, nowGameSeconds, tuning = TUNING) => {
  const G = tuning.growth
  const track = growthTrackOf(child)
  const bounds = G.boundaries[track]
  const perAge = G.daysPerAge[track]
  const elapsed = Math.max((Number(nowGameSeconds) || 0) - (Number(child?.birthTime) || 0), 0)
  const totalDays = Math.floor(elapsed / GAME_SECONDS_PER_DAY)

  // 找第一个「totalDays < 边界」的阶段；都越过了就是「中年」
  let idx = bounds.findIndex(b => totalDays < b)
  if (idx < 0) idx = OFFSPRING_STAGES.length - 1

  const stageStart = idx === 0 ? 0 : bounds[idx - 1]
  const stageEnd = idx < bounds.length ? bounds[idx] : null
  return {
    track,
    totalDays,
    stageIndex: idx,
    stageKey: OFFSPRING_STAGES[idx].key,
    stageName: OFFSPRING_STAGES[idx].name,
    ageYears: Math.floor(totalDays / perAge),
    stageStart,
    stageEnd,
    progress: stageEnd ? Math.min((totalDays - stageStart) / (stageEnd - stageStart), 1) : 1
  }
}

/** 阶段文案：`少年 · 9 岁 · 135/180 天`（中年没有终点，只显示仙龄） */
export const formatOffspringGrowth = (child, nowGameSeconds, tuning = TUNING) => {
  const g = offspringGrowthOf(child, nowGameSeconds, tuning)
  return g.stageEnd == null
    ? `${g.stageName} · ${g.ageYears} 岁`
    : `${g.stageName} · ${g.ageYears} 岁 · ${g.totalDays}/${g.stageEnd} 天`
}

// ---------- 子嗣寿命与寿终（B1，设计 §15.5）----------

/** 是否在世：战死（fallen）与老死（passed_away）都不算；条目保留给家族树 */
export const isAliveOffspringOf = child =>
  !!child && child.status !== 'fallen' && child.status !== 'passed_away'

/** 子嗣当前仙龄（岁，可为小数）；缺 birthTime 返回 null。两轨都是 365 天/岁（P55-a） */
export const offspringAgeYearsOf = (child, nowGameSeconds, tuning = TUNING) => {
  const birth = Number(child?.birthTime)
  if (!Number.isFinite(birth)) return null
  const perAge = (tuning.growth.daysPerAge?.[growthTrackOf(child)] ?? 365) * GAME_SECONDS_PER_DAY
  return Math.max(0, (Number(nowGameSeconds) - birth) / perAge)
}

/**
 * 子嗣寿元（仙龄岁，**含 ±5% 随机**）。
 *
 * 分档按**当前境界实时同步**（§15.5）：未启灵 / 无灵根走凡人档，
 * `1~10` 练气 120、`11~14` 筑基 200、`15~18` 结丹 500。
 * 所以要判寿终必须**先修炼突破、再判**（见 `advanceInnerCourtDay` 的调用顺序）。
 */
export const offspringLifespanOf = (child, tuning = TUNING) => {
  const L = tuning.lifecycle
  const table = L.offspringLifespan || {}
  const level = Math.floor(Number(child?.realmLevel) || 0)
  const tier = level > 0 ? realmTierOf(level) : 'mortal'
  const base = Number(table[tier]) || Number(table.mortal) || Number(L.mortalLifespan) || 80
  return base * (1 + lifespanJitterOf(child?.id, child?.name, tuning))
}

/** 寿元是否已进入预告线（90%，且还没死）—— 第 1 档红点 + 流水一行 */
export const isOffspringLifespanWarningOf = (child, nowGameSeconds, tuning = TUNING) => {
  if (!isAliveOffspringOf(child)) return false
  const age = offspringAgeYearsOf(child, nowGameSeconds, tuning)
  if (age == null) return false
  const ratio = Number(tuning.lifecycle.lifespanWarnRatio) || 0.9
  return age >= offspringLifespanOf(child, tuning) * ratio
}

/** 是否已到寿元（判寿终的唯一口径） */
export const isOffspringLifespanOverOf = (child, nowGameSeconds, tuning = TUNING) => {
  const age = offspringAgeYearsOf(child, nowGameSeconds, tuning)
  if (age == null) return false
  return age >= offspringLifespanOf(child, tuning)
}

/**
 * 子嗣的**首次**筑基 / 结丹岁数（读 `realmBreakthroughs`，§15.5.5）。
 *
 * `realmBreakthroughs = { [level]: gameSeconds }` —— 每次突破时写入的绝对游戏秒。
 * 老档没有这个字段 → 两项都是 `null`（讣告就只写「寿终」，不编造年龄）。
 *
 * @returns {{ foundation: number|null, core: number|null }}
 */
export const offspringBreakthroughAgesOf = (child, tuning = TUNING) => {
  const map = child?.realmBreakthroughs
  const birth = Number(child?.birthTime)
  const result = { foundation: null, core: null }
  if (!map || typeof map !== 'object' || !Number.isFinite(birth)) return result
  const perAge = (tuning.growth.daysPerAge?.[growthTrackOf(child)] ?? 365) * GAME_SECONDS_PER_DAY
  for (const [levelText, atSeconds] of Object.entries(map)) {
    const level = Math.floor(Number(levelText) || 0)
    const at = Number(atSeconds)
    if (level <= 0 || !Number.isFinite(at)) continue
    const tier = realmTierOf(level)
    if (tier !== 'foundation' && tier !== 'core') continue
    const age = Math.floor(Math.max(at - birth, 0) / perAge)
    if (result[tier] == null || age < result[tier]) result[tier] = age
  }
  return result
}

/**
 * 单人讣告流水（§15.5.2）。
 *
 *   `桂某某（凡人 · 79 岁）寿终。`
 *   `桂某某（练气三层 · 79 岁）寿终。十二岁筑基，四十七岁结丹。`
 *
 * 「几岁筑基」读 `realmBreakthroughs`，老档没有就**不写**这句。
 */
export const formatOffspringObituaryOf = (child, nowGameSeconds, tuning = TUNING) => {
  const age = Math.floor(offspringAgeYearsOf(child, nowGameSeconds, tuning) ?? 0)
  const level = Math.floor(Number(child?.realmLevel) || 0)
  const label = level > 0 ? offspringRealmNameOf(level, tuning) : '凡人'
  const head = `${child?.name || '—'}（${label} · ${age} 岁）寿终。`
  const ages = offspringBreakthroughAgesOf(child, tuning)
  const tail = []
  if (ages.foundation != null) tail.push(`${cnNumeral(ages.foundation)}岁筑基`)
  if (ages.core != null) tail.push(`${cnNumeral(ages.core)}岁结丹`)
  return tail.length ? `${head}${tail.join('，')}。` : head
}

/** 阶段是否已达到 `minKey`（按 OFFSPRING_STAGES 的顺序） */
export const stageAtLeast = (growth, minKey) => {
  const min = OFFSPRING_STAGES.findIndex(s => s.key === minKey)
  if (min < 0) return true
  return (growth?.stageIndex ?? 0) >= min
}

/** 可做工 / 可修炼（凡人启蒙、仙师启蒙） */
export const canWorkOf = (child, nowGameSeconds, tuning = TUNING) =>
  !!child &&
  child.status !== 'fallen' &&
  child.status !== 'passed_away' &&
  stageAtLeast(offspringGrowthOf(child, nowGameSeconds, tuning), tuning.growth.workStage)

/**
 * 可出战（设计 §15.2，2026-10-20 起）：**有灵根 + 修为达到练气二层**。
 *
 * ⚠ 旧的「有灵根 + 少年」是过渡口径，已作废；`nowGameSeconds` 保留只为
 *   调用方签名不变，判定不再读年龄。
 */
export const canFightOf = (child, nowGameSeconds, tuning = TUNING) =>
  !!child &&
  child.status !== 'fallen' &&
  child.status !== 'passed_away' &&
  !!child.hasRoot &&
  Math.floor(Number(child.realmLevel) || 0) >= tuning.offspringCultivation.fightLevel

// ---------- 子嗣修炼（设计 §15.2，2026-10-20）----------

/**
 * `0 → 未启灵`；`1..18 → 练气一..十层 / 筑基初·中·后·圆满 / 结丹初·中·后·圆满`。
 *
 * 2026-10-29 P55-a：`maxLevel` 从 9 放开到 18，名字直接读境界表，
 * **不要再手写一张 10 项的中文数组**（旧版到练气十层就 `undefined`）。
 */
export const offspringRealmNameOf = (level, tuning = TUNING) => {
  const max = tuning.offspringCultivation.maxLevel
  const n = Math.max(Math.min(Math.floor(Number(level) || 0), max), 0)
  if (n <= 0) return '未启灵'
  return getRealmName(n).name
}

/**
 * 子嗣的**配给同参契合**（2026-10-28 B7）。
 *
 * 规则：家族从「家里有的物品」（背包 / 已装备 / 出战灵宠 / 开局五件）里，
 * 按每个子嗣的**本命标签**挑契合最高的一件，当他的同参配给。
 *
 * - **不消耗、可共享**：这是账面配给，不从背包扣物品 —— 否则 500 个子孙
 *   会要 500 件同款，规则上根本凑不出来。
 * - 算整组本命取最高（与桂冈「同参服务最好的那个本命」同一条口径）。
 * - 家里一件能对上的都没有就是 **0**（没有保底）—— 大砍是有意的：
 *   想让孩子练得快，家里就得囤对路的物品。
 *
 * 性能：按「物品表签名」缓存 `本命 id → 最大契合`。背包不变时，
 * 每天只按子嗣的本命 id 查表（500 子嗣 × 1~5 个本命，无嵌套扫描）。
 *
 * @param {object} child      子嗣（读 `fates[].id`）
 * @param {string[]} supplyIds 家里可配给的底材 id（调用方去重）
 * @returns {number} 0 ~ 1
 */
let supplySignature = ''
let supplyFitByFate = new Map()

export const offspringCompanionFitOf = (child, supplyIds = []) => {
  const ids = [...new Set(supplyIds.filter(Boolean))].sort()
  if (!ids.length) return 0
  const signature = ids.join(',')
  if (signature !== supplySignature) {
    supplySignature = signature
    supplyFitByFate = new Map()
  }
  const fitOfFate = fateId => {
    if (!fateId) return 0
    if (!supplyFitByFate.has(fateId)) {
      let best = 0
      for (const id of ids) best = Math.max(best, companionHarmonyOf(id, fateId).fit)
      supplyFitByFate.set(fateId, best)
    }
    return supplyFitByFate.get(fateId)
  }

  const fates = Array.isArray(child?.fates) ? child.fates : []
  let best = 0
  for (const fate of fates) best = Math.max(best, fitOfFate(fate?.id || fate?.baseId))
  return Math.min(best, 1)
}

/**
 * 当前小境界的日增修为（纯函数，不含阶段门槛）。
 *
 * `companionFit` 传 `null` 时用 `companionFitFallback`（0.6）——
 * 只有老档回填和拿不到物品表的调用方才走这条；正常每日结算传
 * `offspringCompanionFitOf(child, 家里物品)`。
 */
export const offspringCultivationGainOf = (child, tuning = TUNING, companionFit = null) => {
  const C = tuning.offspringCultivation
  if (!child?.hasRoot) return 0
  const level = Math.max(Math.floor(Number(child.realmLevel) || 1), 1)
  const rootCount = Math.min(Math.max(Math.floor(Number(child.rootCount) || 1), 1), 5)
  const rootCoef = C.rootCoef[rootCount] ?? 1
  const base = C.baseGain * Math.pow(C.gainPerLevel, level - 1)
  const fit = companionFit == null ? C.companionFitFallback : Math.max(0, Math.min(1, companionFit))
  return (
    base *
    rootCoef *
    (1 + fit) *
    (1 + C.spiritLandBonus) *
    (1 + offspringTraitBonusOf(child, tuning))
  )
}

/**
 * 子嗣**自身词条**带来的修炼加速（P59 拍板，2026-10-30：**真加这一项**）。
 *
 * `Σ(词条系数)` 先求和，再按**子嗣自己当前大境界**套软上限（`cap × (1 − e^(−原始/cap))`）——
 * 与桂冈回落的「陨落词条返还」共用同一张 cap 表（练气 2 / 筑基 4 / 结丹 7 / 元婴 10）。
 * 多词条子嗣的日增低于「线性相加」的旧想象，这是设计意图。
 *
 * ⚠ **这是收益增加**：以前子嗣词条只给桂冈加成，不影响子嗣自己修炼。
 *   已登记《产出登记表》R39；校准表（真值表 §5.7）按「无词条」基线，另用
 *   `npm run sim:offspring -- --trait=0.3` 看带词条的档位。
 */
export const offspringTraitBonusOf = (child, tuning = TUNING) => {
  const sum = (child?.traits || []).reduce(
    (s, t) => s + (tuning.bonus.traitCoef[t?.grade] || 0),
    0
  )
  if (!(sum > 0)) return 0
  const level = Math.max(Math.floor(Number(child?.realmLevel) || 1), 1)
  return applyBonusSoftCap(sum, bonusCapOf(realmTierOf(level)))
}

/**
 * 升到下一小境界所需的修为（从 0 起算）。
 *
 * **2026-10-27 起直接复用桂冈的修为曲线**（`CULTIVATION_CURVE.inner`）：
 * 子嗣与桂冈走同一条「越往后越难」的曲线，不再单独维护 `100 × 1.5^层`。
 * 练气一层 70 / 二层 150 / 三层 300 …… 八层 3000。
 *
 * ⚠ **2026-10-29 P55-a：筑基段（L11–14）额外 ×`costBump.multiplier`。**
 *   子嗣没有灵地 / 功法，越往上越该难。加税**只加在筑基段、不加到结丹段**
 *   （理由见 `TUNING.offspringCultivation.costBump`）。校准见 `npm run sim:offspring`。
 */
export const offspringLevelCostOf = (level, tuning = TUNING) => {
  const lv = Math.max(Math.floor(Number(level) || 1), 1)
  const C = tuning.offspringCultivation
  let cost = getRealmName(lv).maxCultivation
  const bump = C.costBump
  if (bump && lv >= Number(bump.from) && lv <= Number(bump.to ?? Infinity)) {
    cost *= Number(bump.multiplier) || 1
  }
  return cost
}

/** 有灵根 + 活着 + 到了启蒙阶段，才会在后台打坐 */
export const canCultivateOf = (child, nowGameSeconds, tuning = TUNING) =>
  !!child &&
  child.status !== 'fallen' &&
  child.status !== 'passed_away' &&
  !!child.hasRoot &&
  stageAtLeast(
    offspringGrowthOf(child, nowGameSeconds, tuning),
    tuning.offspringCultivation.startStage
  )

/**
 * 推进一天修炼（**纯函数**，不修改入参）。
 *
 * `gainScale` 是「这一天的修炼效率」：纯打坐 = 1；子嗣历练按模式打折
 * （仅探索 0.8、综合 0.9），见 `TUNING.offspringExpedition.cultivationRatio`。
 *
 * @returns {{ level, progress, gained, leveled, maxed }}
 */
export const advanceCultivationOf = (child, tuning = TUNING, gainScale = 1, companionFit = null) => {
  const C = tuning.offspringCultivation
  if (!child?.hasRoot) return { level: 0, progress: 0, gained: 0, leveled: false, maxed: true }

  const level = Math.max(Math.floor(Number(child.realmLevel) || 1), 1)
  const progress = Math.max(Number(child.cultivation) || 0, 0)
  if (level >= C.maxLevel) {
    return { level: C.maxLevel, progress: 0, gained: 0, leveled: false, maxed: true }
  }

  const gained = offspringCultivationGainOf(child, tuning, companionFit) *
    Math.max(Number(gainScale) || 0, 0)
  let nextLevel = level
  let nextProgress = progress + gained
  let leveled = false

  // 单日收益远小于一级所需；保留 while 是为以后调大 baseGain 时不丢级
  while (nextLevel < C.maxLevel) {
    const cost = offspringLevelCostOf(nextLevel, tuning)
    if (nextProgress < cost) break
    nextProgress -= cost
    nextLevel += 1
    leveled = true
  }
  if (nextLevel >= C.maxLevel) nextProgress = 0

  return { level: nextLevel, progress: nextProgress, gained, leveled, maxed: nextLevel >= C.maxLevel }
}

/**
 * 老档回填：按「启蒙后过了多少游戏天」估算应到的层数（不重掷、不回退）。
 *
 * 2026-10-27 曲线改成「每级耗时随层数增长」后，不能再拿一层耗时线性外推；
 * 这里从一层开始逐级累加 `所需 / 日增`，走到第几天卡住为止。
 *
 * ⚠ 2026-10-29 P55-a：仙龄迁移改成**保持仙龄不变**之后，`totalDays` 已经是
 *   「当年实际过了多少天」，**不再需要折回旧刻度**（旧的 `/ AGE_SCALE` 已删）。
 *   只影响 P20（2026-10-20）之前、没有 `realmLevel` 的老档。
 */
export const legacyCultivationLevelOf = (child, nowGameSeconds, tuning = TUNING) => {
  const C = tuning.offspringCultivation
  if (!child?.hasRoot) return 0
  const growth = offspringGrowthOf(child, nowGameSeconds, tuning)
  if (!stageAtLeast(growth, C.startStage)) return 0

  const bounds = tuning.growth.boundaries[growth.track] || []
  const awakenStart = bounds[0] || 0
  const days = Math.max(growth.totalDays - awakenStart, 0)
  const rootCount = Math.min(Math.max(Math.floor(Number(child.rootCount) || 1), 1), 5)

  let earned = 1
  let elapsed = 0
  for (let lv = 1; lv < C.maxLevel; lv += 1) {
    const need = offspringLevelCostOf(lv, tuning)
    const gain = offspringCultivationGainOf({ hasRoot: true, rootCount, realmLevel: lv }, tuning)
    if (!(gain > 0)) break
    elapsed += need / gain
    if (elapsed > days) break
    earned = lv + 1
  }
  return Math.min(Math.max(earned, 1), C.maxLevel)
}

// ---------- 家族工作（设计 §8.1/§8.2，2026-10-20 MVP）----------

/** 岗位表（6 个经济岗；真源在 TUNING.familyJobs.jobs） */
export const FAMILY_JOBS = TUNING.familyJobs.jobs

export const familyJobById = id => FAMILY_JOBS.find(job => job.id === id) || null

/**
 * 能不能被安排家族工作：**无灵根 + 活着 + 上工阶段（10 岁）+ 未外嫁**。
 * 有灵根子嗣走修炼/出战线，不做工。
 *
 * 年龄按子嗣自己的成长轨算；`minAgeYears` 与 `workStage` 是同一个门槛的两个表述，
 * 改一个就要看另一个（见 `TUNING.familyJobs.minAgeYears` 的注释）。
 */
export const canDoFamilyJobOf = (child, nowGameSeconds, tuning = TUNING) => {
  if (!child || child.status === 'fallen' || child.status === 'passed_away') return false
  if (child.hasRoot) return false
  if (!canWorkOf(child, nowGameSeconds, tuning)) return false
  const growth = offspringGrowthOf(child, nowGameSeconds, tuning)
  if (growth.ageYears < tuning.familyJobs.minAgeYears) return false
  if (child.gender === 'female' && stageAtLeast(growth, tuning.growth.marryStage)) return false
  return true
}

/** 岗位的固定日产出（未知岗位返回全 0） */
export const familyJobOutputOf = job => {
  const out = { secular: 0, spiritual: 0, herbs: 0, forgeItems: 0 }
  if (!job?.output) return out
  for (const key of Object.keys(out)) {
    out[key] = Math.max(Number(job.output[key]) || 0, 0)
  }
  return out
}

/** 可婚配 / 可繁育（青年） */
export const canMarryOf = (child, nowGameSeconds, tuning = TUNING) =>
  !!child &&
  child.status !== 'fallen' &&
  stageAtLeast(offspringGrowthOf(child, nowGameSeconds, tuning), tuning.growth.marryStage)

// ---------- 子嗣繁育（P14，设计 §7.4）----------

/** 儿子能娶的位阶（有灵根 → 女修 P7-P9；无灵根 → 凡女 P1-P3） */
export const spouseRanksOf = child =>
  child?.hasRoot ? TUNING.breeding.cultivatorSpouseRanks : TUNING.breeding.mortalSpouseRanks

/**
 * 给儿子生成一位配偶。
 * `pregCoef` / `rootCoef` 从位阶表复制一份存进对象 —— 派生值也能现算，
 * 但存下来对存档更稳（将来改位阶表不会让老档的配偶系数漂移）。
 *
 * P15.5(b)：配偶**随机获得，灵根档不优于该子孙**（不能「高攀」）。
 *   单灵根 > 双 > 三 > 四 > 五灵根，所以 `配偶 rootCount >= 子孙 rootCount`。
 *   无灵根子孙 → 凡女配偶（rootCount 0，不产生提纯）。
 */
export const generateSpouse = ({ child, rng = Math.random } = {}) => {
  const B = TUNING.breeding
  const ranks = spouseRanksOf(child)
  const rank = ranks[Math.min(Math.floor(rng() * ranks.length), ranks.length - 1)]
  const coef = rankCoefOf(rank) || { pregCoef: 1.0, rootCoef: 0.5 }
  const [lo, hi] = B.spouseAffinityRange
  const name = child?.hasRoot
    ? `${pickOne(CULTIVATOR_SPOUSE_SURNAMES, rng)}${pickOne(CULTIVATOR_SPOUSE_NAMES, rng)}`
    : `${pickOne(SURNAMES, rng)}${pickOne(GIVEN_NAMES, rng)}`

  const childCount = Math.max(
    Math.floor(Number(child?.rootCount) || 0),
    child?.hasRoot ? 1 : 0
  )
  // 子孙 1 灵根 → 配偶 1~5；子孙 5 灵根 → 只能 5
  const rootCount = child?.hasRoot
    ? childCount + Math.floor(rng() * (6 - childCount))
    : 0
  const roots = rootCount > 0 ? rollRootElements({ count: rootCount, rng }) : []

  return {
    name,
    kind: child?.hasRoot ? 'cultivator' : 'mortal',
    rank,
    affinity: Math.round(lo + rng() * (hi - lo)),
    pregCoef: coef.pregCoef,
    rootCoef: coef.rootCoef,
    // P15.5(b)：配偶的灵根档（只用于血脉提纯与展示）
    rootCount,
    roots
  }
}

/**
 * 老档配偶没有 `rootCount`（P14 存档）。读档时按同一条「不优于子孙」的规则
 * **稳定**补一个（FNV-1a，刷新不重掷）。
 * 无灵根子孙 → 0；有灵根 → 在 `[子.rootCount, 5]` 里取。
 */
export const legacySpouseRootCount = child => {
  if (!child?.hasRoot) return 0
  const sonCount = Math.max(Math.floor(Number(child.rootCount) || 0), 1)
  if (sonCount >= 5) return 5
  const hash = stableHash(`${child.id || ''}|${child.name || ''}|spouse`)
  return sonCount + (hash % (6 - sonCount))
}

/** 配偶每日受孕率 = 10% × 配偶怀孕系数（设计 §7.4：无疲劳、无保底） */
export const spouseChanceOf = spouse =>
  clamp01(TUNING.breeding.baseChance * (Number(spouse?.pregCoef) || 1))

/** 掷一次受孕。纯粹一句 `rng() < chance`，**不设保底**（设计已废除） */
export const rollSpousePregnancy = ({ spouse, rng = Math.random } = {}) =>
  rng() < spouseChanceOf(spouse)

/** 这一对还能不能生（每对 6 胎） */
export const coupleHasRoomOf = child =>
  (child?.childrenIds?.length || 0) < TUNING.breeding.maxBirthsPerCouple

/** 全族是否已达 626 上限（只数活着的；陨落者腾出名额） */
export const populationCapReached = (offspringList = [], cap = TUNING.breeding.populationCap) =>
  (offspringList || []).filter(c => c?.status !== 'fallen' && c?.status !== 'passed_away').length >=
  cap

/** 距某个绝对游戏秒还有多少**天**（向上取整，已过期归 0） */
export const remainingDays = (statusEndTime, nowGameSeconds) =>
  Math.max(
    0,
    Math.ceil(((Number(statusEndTime) || 0) - (Number(nowGameSeconds) || 0)) / GAME_SECONDS_PER_DAY)
  )

const hasNumber = value =>
  value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))

/**
 * 老档妻妾的生命周期 / 经期补全（2026-10-19）。
 *
 * 新档在 `newWife` / `generateMaiden` 里已经写好；老档 wives 数组会被存档整体替换，
 * `deepMerge` 补不到，只能在这里用 **FNV 稳定哈希**补 —— 绝不能 `Math.random()`，
 * 否则刷新一次年龄/经期就变。
 */
export const legacyWifeProfile = (wife, tuning = TUNING) => {
  const seed = `${wife?.id || ''}|${wife?.name || ''}`
  const [aLo, aHi] = tuning.lifecycle.ageRange
  const [cLo, cHi] = tuning.cycle.cycleRange
  const [pLo, pHi] = tuning.cycle.periodRange
  const cycleDays = cLo + Math.floor(stableUnit(`${seed}|cycleDays`) * (cHi - cLo + 1))
  const periodDays = pLo + Math.floor(stableUnit(`${seed}|periodDays`) * (pHi - pLo + 1))
  return {
    entryAgeYears: aLo + Math.floor(stableUnit(`${seed}|age`) * (aHi - aLo + 1)),
    cycleDays,
    periodDays,
    cycleOffsetDays: Math.floor(stableUnit(`${seed}|cycleStart`) * cycleDays)
  }
}

/**
 * 读档补全妻妾的年龄/寿元/经期；返回新对象（无需改动时返回原对象）。
 * 老死判定放在这里，保证读档后立刻把已经超龄的妻妾标成 `passed_away`。
 * ⚠ 怀孕/产后中的妻妾**顺延**到恢复结束再判老死，避免诞生队列出现半死状态。
 */
export const normalizeWifeOnLoad = (wife, nowGameSeconds, tuning = TUNING) => {
  if (!wife) return wife
  const now = Number(nowGameSeconds) || 0
  const profile = legacyWifeProfile(wife, tuning)
  const perYear = tuning.lifecycle.daysPerYear * GAME_SECONDS_PER_DAY
  let changed = false
  const next = { ...wife }

  if (!hasNumber(next.birthTime)) {
    const entry = hasNumber(next.entryAgeYears) ? Number(next.entryAgeYears) : profile.entryAgeYears
    next.entryAgeYears = entry
    next.birthTime = now - entry * perYear
    changed = true
  }
  if (!hasNumber(next.lifespanYears)) {
    next.lifespanYears = wifeLifespanOf(next, tuning)
    changed = true
  } else if (
    // 女修妻妾（P9+）的寿元按境界另算；老档/位阶晋升后同步一次
    wifeIsCultivatorOf(next, tuning) &&
    Number(next.lifespanYears) !== wifeLifespanOf(next, tuning)
  ) {
    next.lifespanYears = wifeLifespanOf(next, tuning)
    changed = true
  }
  if (!hasNumber(next.cycleDays)) {
    next.cycleDays = profile.cycleDays
    changed = true
  }
  if (!hasNumber(next.periodDays)) {
    next.periodDays = profile.periodDays
    changed = true
  }
  if (!hasNumber(next.cycleStartTime)) {
    next.cycleStartTime = now - profile.cycleOffsetDays * GAME_SECONDS_PER_DAY
    changed = true
  }

  // 超龄：只在不孕/不产的状态下判，怀孕/产后顺延。
  // ⚠ 即使字段都齐全（changed=false）也要判，否则老档里已超龄的妻妾要等到第二天才死。
  let died = false
  if (
    next.status !== 'passed_away' &&
    next.status !== 'pregnant' &&
    next.status !== 'recovering'
  ) {
    const age = (now - Number(next.birthTime)) / perYear
    if (age >= Number(next.lifespanYears)) {
      next.status = 'passed_away'
      next.statusEndTime = null
      next.passedAwayAt = now
      died = true
    }
  }

  return changed || died ? next : wife
}

/**
 * 读档归一化（P12.3）：把旧档按 **270/30 天**写下的孕育/产后到期时间，等比折算到当前的 **90/10 天**。
 *
 * 只处理「剩余时长 > 当前完整周期」的记录 —— 新档不可能超过 90 天（产后 10 天），
 * 命中它的一定是旧口径。折算保留**已过时长的比例**：
 * 旧档剩 160/270 → 新档剩 160 × (90/270) ≈ 53.3 天。
 *
 * ⚠ 逾期记录（end <= now）不折算，交给读档自愈的结生逻辑。
 * ⚠ 返回新对象；不需要改时返回原对象，调用方可用 `!==` 判断。
 */
export const normalizePregnancy = (wife, nowGameSeconds, tuning = TUNING) => {
  if (!wife) return wife
  const now = Number(nowGameSeconds) || 0
  const end = Number(wife.statusEndTime) || 0
  const P = tuning.pregnancy

  if (wife.status === 'pregnant') {
    // 新档：本次孕期在受孕时已锁定（80–100 天）；老档没有 pregnancyDays，按 90 天基准。
    const full = (hasNumber(wife.pregnancyDays) ? Number(wife.pregnancyDays) : P.days) * GAME_SECONDS_PER_DAY
    const remaining = end - now
    // 只有「剩余 > 当前完整周期」才可能是旧口径；新档不会命中。
    if (remaining > full) {
      const scaled = remaining * (P.days / P.legacyDays)
      return { ...wife, statusEndTime: now + scaled, pregnancyStartTime: now + scaled - full }
    }
    if (!wife.pregnancyStartTime && end > now) {
      return { ...wife, pregnancyStartTime: end - full }
    }
  }

  if (wife.status === 'recovering') {
    const full = P.recoveryDays * GAME_SECONDS_PER_DAY
    const remaining = end - now
    if (remaining > full) {
      const scaled = remaining * (P.recoveryDays / P.legacyRecoveryDays)
      return { ...wife, statusEndTime: now + scaled, recoveryStartTime: now + scaled - full }
    }
    if (!wife.recoveryStartTime && end > now) {
      return { ...wife, recoveryStartTime: end - full }
    }
  }

  return wife
}
