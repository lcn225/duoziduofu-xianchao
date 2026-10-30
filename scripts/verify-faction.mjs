// 飞鹰门（贡献点 / 周任务）纯函数 + store 断言（2026-10-30 筑基功法批）。
//
// 覆盖：
//   · 常量与模板池（普通 3 类各 1 / 困难 4 抽 3、奖励固定 30 / 100）
//   · 时间键（周 = 7 游戏天、月 = 30 游戏天，两者不对齐）
//   · 抽任务（数量、种类、排除、id 自增）
//   · 交物品件数（堆叠条目按件算）
//   · store：接取 / 结算 / 放弃 / 周月刷新 / 读档归一化
//   · 解锁门槛（内政 练气六层 + 乡侯府 Lv.1；秘库 练气八层）
//
// 风格与 verify-shop.mjs 一致：全部常量断言，不做统计。
import {
  FACTION_SECONDS_PER_DAY,
  FACTION_TUNING,
  HARD_TEMPLATES,
  NORMAL_TEMPLATES_BY_KIND,
  TASK_TEMPLATES,
  artPriceOf,
  artTierOf,
  artTiersOf,
  collectRequirementOf,
  countCollectMatches,
  isGarrisonCandidate,
  isTaskExpired,
  keyOfTask,
  manualRefreshCostOf,
  materialCountOf,
  materialPriceOf,
  materialTiersOf,
  monthIndexOf,
  nextMonthStartOf,
  nextWeekStartOf,
  realmSectionOf,
  refreshRemainingOf,
  rollTasksOf,
  rollVaultArts,
  rollVaultMaterials,
  taskDueAtOf,
  taskRemainingSecondsOf,
  weekIndexOf
} from '../src/plugins/faction.js'
import {
  actions as factionActions,
  defaultFactionState,
  getters as factionGetters
} from '../src/stores/modules/faction.js'
import { unitsOf } from '../src/plugins/stacks.js'
import { QI_ARTS } from '../src/plugins/cultivationData.js'

let passed = 0
let failed = 0
let skipped = 0
const labels = []
const FILTER = (process.env.VERIFY_FILTER || '').toLowerCase()
const LIST = process.argv.includes('--list')
const check = (name, actual, expected) => {
  if (FILTER && !name.toLowerCase().includes(FILTER)) {
    skipped += 1
    return
  }
  labels.push(name)
  if (LIST) return
  const ok = Object.is(actual, expected)
  if (ok) passed += 1
  else failed += 1
  console.log(`[${ok ? '  ok  ' : ' FAIL '}] ${name}`.padEnd(64), actual)
}
const checkTrue = (name, actual) => check(name, !!actual, true)

// ⚠ 飞鹰门的时间轴是**现实秒**（96 秒 = 一游戏天），不是游戏秒 86400。
// 见 `plugins/faction.js` 顶部：筑基后 24× 世界时钟不能让飞鹰门跟着 24 倍速。
const DAY = FACTION_SECONDS_PER_DAY
const WEEK = DAY * 7
const MONTH = DAY * 30
const zero = () => 0

// ================= 一、常量与模板池 =================
check('普通任务奖励 30', FACTION_TUNING.contribution.normal, 30)
check('困难任务奖励 100', FACTION_TUNING.contribution.hard, 100)
check('同时最多接 3 个', FACTION_TUNING.maxAccepted, 3)
check('普通任务每周 3 个', FACTION_TUNING.normalPerWeek, 3)
check('困难任务每月 3 个', FACTION_TUNING.hardPerMonth, 3)
check('驻扎子嗣门槛 = 练气二层', FACTION_TUNING.garrisonMinRealmLevel, 2)
check('内政解锁 = 练气六层', FACTION_TUNING.unlock.innerLevel, 6)
check('秘库解锁 = 练气八层', FACTION_TUNING.vaultUnlockInnerLevel, 8)
check('模板总数 13', TASK_TEMPLATES.length, 13)
check('普通·交物品 3 个', NORMAL_TEMPLATES_BY_KIND.collect.length, 3)
check('普通·杀怪 3 个', NORMAL_TEMPLATES_BY_KIND.combat.length, 3)
check('普通·驻扎 3 个', NORMAL_TEMPLATES_BY_KIND.garrison.length, 3)
check('困难·杀怪 4 个', HARD_TEMPLATES.length, 4)
check('模板 id 不重复', new Set(TASK_TEMPLATES.map(t => t.id)).size, 13)

// ================= 二、时间键 =================
check('第 0 周', weekIndexOf(0), 0)
check('第 6 天仍是第 0 周', weekIndexOf(DAY * 6), 0)
check('第 7 天进第 1 周', weekIndexOf(WEEK), 1)
check('第 0 月', monthIndexOf(0), 0)
check('第 29 天仍是第 0 月', monthIndexOf(DAY * 29), 0)
check('第 30 天进第 1 月', monthIndexOf(MONTH), 1)
check('周与月不对齐：第 30 天 = 第 4 周', weekIndexOf(MONTH), 4)
check('普通任务挂周键', keyOfTask('normal', WEEK), 1)
check('困难任务挂月键', keyOfTask('hard', WEEK), 0)

// ================= 二·补、刷新倒计时 =================
check('第 0 秒的下一个周刷新点 = 1 周', nextWeekStartOf(0), WEEK)
check('周中：下一个刷新点仍是本周末尾', nextWeekStartOf(100), WEEK)
check('刚跨周：下一个刷新点 = 2 周', nextWeekStartOf(WEEK), WEEK * 2)
check('第 0 秒的下一个月刷新点 = 1 月', nextMonthStartOf(0), MONTH)
check('普通任务倒计时 = 周内剩余', refreshRemainingOf('normal', 100), WEEK - 100)
check('困难任务倒计时 = 月内剩余', refreshRemainingOf('hard', 100), MONTH - 100)
check('秘库月刷倒计时与困难任务同一条线', refreshRemainingOf('hard', 500), MONTH - 500)
check('刚好在刷新点：倒计时 = 一整周', refreshRemainingOf('normal', WEEK), WEEK)

// ================= 三、抽任务 =================
const normals = rollTasksOf('normal', { rng: zero, nowSeconds: 0, startId: 1 })
check('普通池一次 3 条', normals.length, 3)
check('普通池三种类各 1', new Set(normals.map(t => t.kind)).size, 3)
check('普通池奖励全是 30', normals.every(t => t.reward === 30), true)
check('普通池 id 连续', normals.map(t => t.id).join(','), 'task-1,task-2,task-3')
check('普通池起始 key = 0', normals.every(t => t.key === 0), true)
const hards = rollTasksOf('hard', { rng: zero, nowSeconds: 0, startId: 10 })
check('困难池一次 3 条', hards.length, 3)
check('困难池模板不重复', new Set(hards.map(t => t.templateId)).size, 3)
check('困难池奖励全是 100', hards.every(t => t.reward === 100), true)
check('困难池 id 接着自增', hards[0].id, 'task-10')
const excluded = rollTasksOf('hard', {
  rng: zero,
  startId: 1,
  exclude: HARD_TEMPLATES.slice(0, 3).map(t => t.id)
})
check('排除后只剩 1 个模板可选', excluded.length, 1)
check('排除后抽到的是没排除的那本', excluded[0].templateId, HARD_TEMPLATES[3].id)
const combatTask = normals.find(t => t.kind === 'combat')
check('杀怪任务耗时 1 游戏天', combatTask.days, 1)
const collectTask = normals.find(t => t.kind === 'collect')
check('交物品任务不占时间', collectTask.days, 0)
const garrisonTask = normals.find(t => t.kind === 'garrison')
check('驻扎任务 3~10 天', garrisonTask.days >= 3 && garrisonTask.days <= 10, true)

// ================= 四、境界段与交物品 =================
check('练气段 = 1', realmSectionOf(1), 1)
check('练气十层仍是 1 段', realmSectionOf(10), 1)
check('筑基一层 = 2 段', realmSectionOf(11), 2)
check('结丹一层 = 3 段', realmSectionOf(15), 3)
check('元婴一层 = 4 段', realmSectionOf(19), 4)
const reqQi = collectRequirementOf({ category: '灵植', countMin: 3, countMax: 8 }, 8, zero)
check('练气段交物品要一阶', reqQi.tierMin, 1)
check('练气段交物品封顶二阶', reqQi.tierMax, 2)
const reqFoundation = collectRequirementOf({ category: '灵植', countMin: 3, countMax: 8 }, 12, zero)
check('筑基段交物品要二阶', reqFoundation.tierMin, 2)
check('筑基段交物品封顶三阶', reqFoundation.tierMax, 3)

const stacks = [
  { id: 'a', category: '灵植', tier: 1, count: 5 },
  { id: 'b', category: '灵植', tier: 3, count: 4 },
  { id: 'c', category: '灵材', tier: 1, count: 9 }
]
check(
  '交物品按件算（一阶灵植 5 件）',
  countCollectMatches(stacks, { category: '灵植', tierMin: 1, tierMax: 2 }, unitsOf),
  5
)
check(
  '高阶不在要求范围内',
  countCollectMatches(stacks, { category: '灵植', tierMin: 3, tierMax: 3 }, unitsOf),
  4
)
check(
  '品类不同不计入',
  countCollectMatches(stacks, { category: '灵器', tierMin: 1, tierMax: 5 }, unitsOf),
  0
)

// ================= 五、秘库底材栏与刷新价 =================
check('练气段只挂二阶（一阶自己能打到）', materialTiersOf(8).join(','), '2')
check('筑基段底材卖二阶+三阶', materialTiersOf(12).join(','), '2,3')
check('结丹段底材卖三阶+四阶', materialTiersOf(16).join(','), '3,4')
check('元婴段卖四阶+五阶', materialTiersOf(20).join(','), '4,5')
check('练气段功法栏 = 一阶+二阶', artTiersOf(8).join(','), '1,2')
check('元婴段功法栏只挂四阶', artTiersOf(20).join(','), '4')
check('底材栏不跟功法栏同一条线（练气只挂二阶）', materialTiersOf(8).join(','), '2')
const countLow = materialCountOf(zero)
check('每段至少 10 件', countLow, 10)
check('手动刷新第 1 次 50', manualRefreshCostOf(0), 50)
check('手动刷新第 2 次 100', manualRefreshCostOf(1), 100)
check('手动刷新第 3 次 200', manualRefreshCostOf(2), 200)
check('手动刷新第 4 次 400', manualRefreshCostOf(3), 400)
check('超出序列按最后一档', manualRefreshCostOf(9), 400)

// ================= 六、store：接取 / 结算 / 放弃 =================
const makeMock = (overrides = {}) => {
  const mock = {
    faction: defaultFactionState(),
    level: 8,
    estate: { buildings: { manor: 1 } },
    items: [],
    offspring: { list: [] },
    secretRealm: { run: null },
    clockGameTime: 0,
    saveCount: 0,
    saveData() {
      this.saveCount += 1
    }
  }
  for (const [key, fn] of Object.entries(factionActions)) {
    if (typeof fn === 'function') mock[key] = fn
  }
  // ⚠ overrides 必须在绑定 action **之后**覆盖 —— 否则打桩的 `resolveFactionCombat`
  //   会被真实 action 顶掉，杀怪断言就会真的去建队伍打 Boss。
  Object.assign(mock, overrides)
  // getter 之间有依赖（factionCanAccept → factionAcceptedCount → factionActiveTasks），
  // 只挂最外层那个会让内层返回 undefined（`undefined < 3` 恒为 false，接取全被挡）。
  // 所以**全部** getter 都要挂上。
  for (const [key, fn] of Object.entries(factionGetters)) {
    Object.defineProperty(mock, key, {
      get() {
        return fn.call(this)
      },
      configurable: true
    })
  }
  return mock
}

// —— 交物品：材料不足 ——
const collectMock = makeMock()
collectMock.faction.tasks = [
  {
    id: 't1',
    templateId: 'gather_herb',
    kind: 'collect',
    difficulty: 'normal',
    name: '收药',
    reward: 30,
    days: 0,
    key: 0,
    status: 'open',
    requirements: { category: '灵植', tierMin: 1, tierMax: 2, count: 3 }
  }
]
collectMock.items = [{ id: 'a', category: '灵植', tier: 1, count: 2 }]
const insufficient = collectMock.acceptFactionTask('t1')
check('材料不足：接取失败', insufficient.ok, false)
check('材料不足：背包不动', unitsOf(collectMock.items[0]), 2)
check('材料不足：任务仍在货架', collectMock.faction.tasks[0].status, 'open')

// —— 交物品：足够则当场结算 ——
collectMock.items = [{ id: 'a', category: '灵植', tier: 1, count: 5 }]
const collected = collectMock.acceptFactionTask('t1')
check('交物品：成功', collected.ok, true)
check('交物品：当场完成', collected.completed, true)
check('交物品：奖励 30', collected.reward, 30)
check('交物品：扣掉 3 件、剩 2 件', unitsOf(collectMock.items[0]), 2)
check('交物品：贡献点入账', collectMock.faction.contribution, 30)
check('交物品：累计也加', collectMock.faction.contributionTotal, 30)
check('交物品：任务转 done', collectMock.faction.tasks[0].status, 'done')

// —— 驻扎：门槛 / 占用 / 结算 ——
const garrisonMock = makeMock()
const child = { id: 'c1', name: '甲', status: 'alive', realmLevel: 2, job: null, expeditionMode: 'cultivate' }
garrisonMock.offspring.list = [child]
garrisonMock.faction.tasks = [
  {
    id: 't2',
    templateId: 'guard_gate',
    kind: 'garrison',
    difficulty: 'normal',
    name: '驻守山门',
    reward: 30,
    days: 5,
    key: 0,
    status: 'open',
    requirements: { count: 1, minRealmLevel: 2 }
  }
]
const weakChild = { id: 'c0', name: '乙', status: 'alive', realmLevel: 1 }
garrisonMock.offspring.list = [child, weakChild]
const tooWeak = garrisonMock.acceptFactionTask('t2', { assignees: ['c0'] })
check('驻扎：练气一层不够格', tooWeak.ok, false)
const accepted = garrisonMock.acceptFactionTask('t2', { assignees: ['c1'] })
check('驻扎：接取成功', accepted.ok, true)
check('驻扎：子嗣被占用', child.factionTaskId, 't2')
check('驻扎：任务在跑', garrisonMock.faction.tasks[0].status, 'accepted')
check('驻扎：到期时刻 = 5 天', garrisonMock.faction.tasks[0].dueAt, 5 * DAY)
check(
  '驻扎：占一个名额',
  garrisonMock.faction.tasks.filter(t => t.status === 'accepted').length,
  1
)

// 同一个子嗣不能再被另一个任务占用
garrisonMock.faction.tasks.push({
  id: 't3',
  templateId: 'escort_caravan',
  kind: 'garrison',
  difficulty: 'normal',
  name: '护送商队',
  reward: 30,
  days: 3,
  key: 0,
  status: 'open',
  requirements: { count: 1, minRealmLevel: 2 }
})
const doubleBooked = garrisonMock.acceptFactionTask('t3', { assignees: ['c1'] })
check('驻扎：已占用的子嗣不能再派', doubleBooked.ok, false)

// 到点结算
const settled = garrisonMock.settleFactionTasks(5 * DAY)
check('驻扎：到点结算', settled, true)
check('驻扎：任务完成', garrisonMock.faction.tasks[0].status, 'done')
check('驻扎：子嗣放出来', child.factionTaskId, null)
check('驻扎：贡献点 +30', garrisonMock.faction.contribution, 30)
check('驻扎：没到点的不结算', garrisonMock.faction.tasks[1].status, 'open')

// —— 放弃 ——
const abandonMock = makeMock()
const child2 = { id: 'c2', name: '丙', status: 'alive', realmLevel: 3, job: null, expeditionMode: 'cultivate' }
abandonMock.offspring.list = [child2]
abandonMock.faction.tasks = [
  {
    id: 't4',
    templateId: 'guard_gate',
    kind: 'garrison',
    difficulty: 'normal',
    name: '驻守山门',
    reward: 30,
    days: 5,
    key: 0,
    status: 'open',
    requirements: { count: 1, minRealmLevel: 2 }
  }
]
abandonMock.acceptFactionTask('t4', { assignees: ['c2'] })
check('放弃：任务在跑', abandonMock.faction.tasks[0].status, 'accepted')
check('放弃：成功', abandonMock.abandonFactionTask('t4').ok, true)
check('放弃：任务转 abandoned', abandonMock.faction.tasks[0].status, 'abandoned')
check('放弃：子嗣放出来', child2.factionTaskId, null)

// —— 杀怪：占 1 天，到点打 Boss（战斗本身打桩） ——
const combatMock = makeMock()
combatMock.resolveFactionCombat = () => true
combatMock.faction.tasks = [
  {
    id: 't5',
    templateId: 'hunt_beast',
    kind: 'combat',
    difficulty: 'normal',
    name: '清剿兽群',
    reward: 30,
    days: 1,
    key: 0,
    status: 'open',
    requirements: { dungeonDifficulty: 1 }
  }
]
combatMock.acceptFactionTask('t5')
check('杀怪：接取后进入进行中', combatMock.faction.tasks[0].status, 'accepted')
check('杀怪：到期 = now + 1 天', combatMock.faction.tasks[0].dueAt, DAY)
combatMock.settleFactionTasks(DAY)
check('杀怪：赢了算完成', combatMock.faction.tasks[0].status, 'done')
check('杀怪：贡献点 +30', combatMock.faction.contribution, 30)

const loseMock = makeMock()
loseMock.resolveFactionCombat = () => false
loseMock.faction.tasks = [
  {
    id: 't6',
    templateId: 'hunt_beast',
    kind: 'combat',
    difficulty: 'normal',
    name: '清剿兽群',
    reward: 30,
    days: 1,
    key: 0,
    status: 'accepted',
    acceptedAt: 0,
    dueAt: DAY,
    requirements: { dungeonDifficulty: 1 }
  }
]
loseMock.settleFactionTasks(DAY)
check('杀怪：输了算失败', loseMock.faction.tasks[0].status, 'failed')
check('杀怪：输了不给贡献点', loseMock.faction.contribution, 0)

// —— 同时最多 3 个 ——
const capMock = makeMock()
capMock.resolveFactionCombat = () => true
capMock.faction.tasks = [0, 1, 2, 3].map(i => ({
  id: `cap-${i}`,
  templateId: 'hunt_beast',
  kind: 'combat',
  difficulty: 'normal',
  name: '清剿兽群',
  reward: 30,
  days: 1,
  key: 0,
  status: 'open',
  requirements: { dungeonDifficulty: 1 }
}))
capMock.acceptFactionTask('cap-0')
capMock.acceptFactionTask('cap-1')
capMock.acceptFactionTask('cap-2')
const capped = capMock.acceptFactionTask('cap-3')
check('同时接取上限 = 3', capped.ok, false)
check('第 4 个被挡下', capMock.faction.tasks[3].status, 'open')

// ================= 七、周 / 月刷新 =================
const refreshMock = makeMock()
refreshMock.faction = defaultFactionState()
const firstRefresh = refreshMock.refreshFactionTasks(0, { rng: zero })
check('首次刷新：有变化', firstRefresh, true)
check('首次刷新：3 普通 + 3 困难', refreshMock.faction.tasks.length, 6)
check('首次刷新：周键写成 0', refreshMock.faction.weekKey, 0)
check('首次刷新：月键写成 0', refreshMock.faction.monthKey, 0)
check('同一时刻不重复刷', refreshMock.refreshFactionTasks(DAY, { rng: zero }), false)
check('同一周内数量不变', refreshMock.faction.tasks.length, 6)

const weekTwo = refreshMock.refreshFactionTasks(WEEK, { rng: zero })
check('跨周：有变化', weekTwo, true)
const openNormals = refreshMock.faction.tasks.filter(t => t.status === 'open' && t.difficulty === 'normal')
check('跨周：上周末接的普通任务被换掉', openNormals.every(t => t.key === 1), true)
check('跨周：普通仍是 3 条', openNormals.length, 3)
const openHards = refreshMock.faction.tasks.filter(t => t.status === 'open' && t.difficulty === 'hard')
check('跨周：困难任务不受影响', openHards.length, 3)

const monthTwo = refreshMock.refreshFactionTasks(MONTH, { rng: zero })
check('跨月：有变化', monthTwo, true)
const hardAfterMonth = refreshMock.faction.tasks.filter(t => t.difficulty === 'hard' && t.status === 'open')
check('跨月：困难任务换成第 1 月', hardAfterMonth.every(t => t.key === 1), true)

// 已接的任务跨周不会被清掉
const keepMock = makeMock()
keepMock.resolveFactionCombat = () => true
keepMock.faction = defaultFactionState()
keepMock.refreshFactionTasks(0, { rng: zero })
const firstCombat = keepMock.faction.tasks.find(t => t.kind === 'combat' && t.difficulty === 'normal')
keepMock.acceptFactionTask(firstCombat.id)
keepMock.refreshFactionTasks(WEEK, { rng: zero })
const kept = keepMock.faction.tasks.find(t => t.id === firstCombat.id)
check('跨周：已接的任务保留', kept?.status, 'accepted')

// ================= 八、过期与倒计时 =================
check('未接且跨周 = 过期', isTaskExpired({ status: 'open', difficulty: 'normal', key: 0 }, WEEK), true)
check('已接的不算过期', isTaskExpired({ status: 'accepted', difficulty: 'normal', key: 0 }, WEEK), false)
check('同周内不过期', isTaskExpired({ status: 'open', difficulty: 'normal', key: 0 }, DAY), false)
check('到期时刻 = 起点 + 5 天', taskDueAtOf(100, 5), 100 + 5 * DAY)
check('剩余时间', taskRemainingSecondsOf({ dueAt: DAY }, 0), DAY)
check('已过点按 0', taskRemainingSecondsOf({ dueAt: DAY }, DAY * 2), 0)

// ================= 九、驻扎人选资格 =================
const alive = c => c.status !== 'fallen' && c.status !== 'passed_away'
checkTrue('合格：活着 / 境界够 / 没在忙', isGarrisonCandidate(child, { requirements: { minRealmLevel: 2 } }, { isAlive: alive }))
check(
  '不合格：死了',
  isGarrisonCandidate({ ...child, status: 'passed_away' }, { requirements: { minRealmLevel: 2 } }, { isAlive: alive }),
  false
)
check(
  '不合格：在家族工作',
  isGarrisonCandidate({ ...child, job: 'farm' }, { requirements: { minRealmLevel: 2 } }, { isAlive: alive }),
  false
)
check(
  '不合格：已派给别人',
  isGarrisonCandidate({ ...child, factionTaskId: 'x' }, { requirements: { minRealmLevel: 2 } }, { isAlive: alive }),
  false
)
check(
  '不合格：正在历练',
  isGarrisonCandidate(
    { ...child, expeditionMode: 'explore' },
    { requirements: { minRealmLevel: 2 } },
    { isAlive: alive }
  ),
  false
)
check(
  '合格：历练模式 = cultivate 不算占用',
  isGarrisonCandidate(
    { ...child, expeditionMode: 'cultivate' },
    { requirements: { minRealmLevel: 2 } },
    { isAlive: alive }
  ),
  true
)

// ================= 十、解锁门槛 =================
const unlockAt = (level, manor) =>
  factionGetters.factionUnlocked.call({ level, estate: { buildings: { manor } } })
check('内政：练气六层 + 乡侯府 Lv.1 解锁', unlockAt(6, 1), true)
check('内政：五层不够', unlockAt(5, 1), false)
check('内政：没乡侯府不行', unlockAt(8, 0), false)
check('秘库：练气八层解锁', factionGetters.vaultUnlocked.call({ level: 8 }), true)
check('秘库：七层不够', factionGetters.vaultUnlocked.call({ level: 7 }), false)
const checklist = factionGetters.factionChecklist.call({ level: 5, estate: { buildings: { manor: 0 } } })
check('Checklist 两条条件', checklist.length, 2)
check('Checklist：境界未达成', checklist[0].done, false)
check('Checklist：建筑未达成', checklist[1].done, false)

// ================= 十一、读档归一化 =================
const defaults = defaultFactionState()
check('默认贡献点 = 0', defaults.contribution, 0)
check('默认累计 = 0', defaults.contributionTotal, 0)
check('默认任务池为空', defaults.tasks.length, 0)
check('默认周键 = -1', defaults.weekKey, -1)
check('默认月键 = -1', defaults.monthKey, -1)
const loadMock = { faction: null, saveData() {} }
check('老档：归一化有变化', factionActions.normalizeFactionOnLoad.call(loadMock), true)
check('老档：补齐贡献点', loadMock.faction.contribution, 0)
check('老档：补齐任务数组', Array.isArray(loadMock.faction.tasks), true)
const freshMock = { faction: defaultFactionState(), saveData() {} }
check('新档：归一化 no-op', factionActions.normalizeFactionOnLoad.call(freshMock), false)

// ================= 十二、秘库货架 =================
check('功法阶：练气篇 = 1', artTierOf(QI_ARTS.find(a => a.grade === 'qi')), 1)
check('功法阶：筑基级 = 2', artTierOf(QI_ARTS.find(a => a.grade === 'foundation')), 2)
check('功法阶：金丹级 = 3', artTierOf(QI_ARTS.find(a => a.grade === 'core')), 3)
const qiArtsPool = rollVaultArts({ arts: QI_ARTS, knownIds: [], innerLevel: 8, count: 9, rng: zero, startId: 1 })
check('练气段功法池 = 一阶 5 + 二阶 1', qiArtsPool.length, 6)
checkTrue(
  '练气段能刷到《万兽御器经》（筑基档功法）',
  qiArtsPool.some(entry => entry.artId === 'beast_vessel_found')
)
const knownPool = rollVaultArts({
  arts: QI_ARTS,
  knownIds: ['beast_vessel_found'],
  innerLevel: 8,
  count: 9,
  rng: zero,
  startId: 1
})
check('排除已学会的功法', knownPool.some(entry => entry.artId === 'beast_vessel_found'), false)
check('练气段刷不到金丹功法', qiArtsPool.some(entry => entry.artId === 'beast_vessel_core'), false)
check(
  '功法价格落在 200~300',
  qiArtsPool.every(entry => entry.price >= 200 && entry.price <= 300),
  true
)
const matPool = [
  { id: 'm1', name: '甲', tier: 2 },
  { id: 'm2', name: '乙', tier: 2 },
  { id: 'm3', name: '丙', tier: 3 }
]
const shelf = rollVaultMaterials({
  pool: matPool,
  masters: ['m1', 'm2'],
  innerLevel: 8,
  count: 5,
  harmonyOf: (item, masters) => (item.id === 'm2' ? 0.9 : item.id === 'm1' ? 0.4 : 0.1),
  rng: zero,
  startId: 1
})
check('练气段底材栏只挂二阶', shelf.length, 2)
check('契合度高的排在前面', shelf[0].baseId, 'm2')
check('三阶不在练气段货架上', shelf.some(entry => entry.baseId === 'm3'), false)
check('底材价格：二阶 200~300', shelf[0].price >= 200 && shelf[0].price <= 300, true)
const shelfFoundation = rollVaultMaterials({
  pool: matPool,
  masters: [],
  innerLevel: 12,
  count: 5,
  harmonyOf: () => 0,
  rng: zero,
  startId: 1
})
check('筑基段底材栏挂二阶+三阶', shelfFoundation.length, 3)
check('三阶底材更贵（+50）', materialPriceOf({ tier: 3 }, zero) - materialPriceOf({ tier: 2 }, zero), 50)
check('功法价格随机区间', artPriceOf({}, zero), 200)

// —— 秘库购买（store） ——
const vaultMock = makeMock({ level: 8, contribution: 0 })
vaultMock.faction.contribution = 300
vaultMock.practice = { qiArts: { known: {} } }
vaultMock.learnQiArt = function (id) {
  this.learned = id
  return { success: true, artId: id }
}
vaultMock.faction.vault.arts = [
  { id: 'va1', artId: 'beast_vessel_found', price: 250, sold: false }
]
const boughtArt = vaultMock.buyVaultArt('va1')
check('换功法：成功', boughtArt.ok, true)
check('换功法：扣 250 贡献点', vaultMock.faction.contribution, 50)
check('换功法：学会该功法', vaultMock.learned, 'beast_vessel_found')
check('换功法：货架标记已换走', vaultMock.faction.vault.arts[0].sold, true)
check('换功法：不能换第二次', vaultMock.buyVaultArt('va1').ok, false)

const poorMock = makeMock({ level: 8 })
poorMock.faction.contribution = 100
poorMock.practice = { qiArts: { known: {} } }
poorMock.learnQiArt = () => ({ success: true })
poorMock.faction.vault.arts = [{ id: 'va2', artId: 'beast_roar', price: 250, sold: false }]
check('贡献点不够换不了', poorMock.buyVaultArt('va2').ok, false)
check('换不了就不扣点', poorMock.faction.contribution, 100)

const matMock = makeMock({ level: 8 })
matMock.faction.contribution = 1000
matMock.practice = { qiArts: { known: {} } }
matMock.items = []
matMock.gainItem = function (item) {
  this.items = [...this.items, item]
}
matMock.faction.vault.materials = [
  { id: 'vm1', baseId: 'x_lingzhi_0021', price: 220, sold: false }
]
const boughtMat = matMock.buyVaultMaterial('vm1')
check('换底材：成功', boughtMat.ok, true)
check('换底材：进背包', matMock.items.length, 1)
check('换底材：扣点', matMock.faction.contribution, 780)
check('换底材：本月计数 +1', matMock.faction.vault.materialBoughtThisMonth, 1)
matMock.faction.vault.materials.push({ id: 'vm2', baseId: 'x_lingzhi_0021', price: 220, sold: false })
check('换底材：本期限购 1 件', matMock.buyVaultMaterial('vm2').ok, false)

// —— 手动刷新：50 → 100 → 200 → 400 ——
const refreshVaultMock = makeMock({ level: 8 })
refreshVaultMock.faction.contribution = 1000
refreshVaultMock.practice = { qiArts: { known: {} } }
refreshVaultMock.faction.vault.monthKey = monthIndexOf(0)
const refresh1 = refreshVaultMock.manualRefreshVault({ rng: zero })
check('手动刷新第 1 次 50', refresh1.cost, 50)
check('手动刷新后余额', refreshVaultMock.faction.contribution, 950)
const refresh2 = refreshVaultMock.manualRefreshVault({ rng: zero })
check('手动刷新第 2 次 100', refresh2.cost, 100)
check('手动刷新计数', refreshVaultMock.faction.vault.manualRefreshUsed, 2)

// —— 月刷重置 ——
const monthResetMock = makeMock({ level: 8 })
monthResetMock.practice = { qiArts: { known: {} } }
monthResetMock.faction.vault.manualRefreshUsed = 3
monthResetMock.faction.vault.materialBoughtThisMonth = 1
monthResetMock.faction.vault.monthKey = 0
check('同月不重刷', monthResetMock.refreshVault(DAY), false)
check('下月重刷', monthResetMock.refreshVault(MONTH, { rng: zero }), true)
check('月刷重置手动刷新价', monthResetMock.faction.vault.manualRefreshUsed, 0)
check('月刷重置底材限购', monthResetMock.faction.vault.materialBoughtThisMonth, 0)
check('月刷后货架非空', monthResetMock.faction.vault.arts.length > 0, true)

// ================= 十三、老九订货 =================
const brokerMock = makeMock({ level: 8 })
brokerMock.faction.contribution = 500
brokerMock.practice = { qiArts: { known: {} } }
brokerMock.items = []
brokerMock.gainItem = function (item) {
  this.items = [...this.items, item]
}
const ordered = brokerMock.orderBroker({ rng: zero })
check('老九：下单成功', ordered.ok, true)
check('老九：扣 400 点', brokerMock.faction.contribution, 100)
check('老九：亮出 4~5 个标签', brokerMock.faction.vault.broker.tags.length <= 5, true)
check('老九：标签不为空', brokerMock.faction.vault.broker.tags.length > 0, true)
check('老九：到货时刻 = 一单一个月', brokerMock.faction.vault.broker.readyAt, 30 * FACTION_SECONDS_PER_DAY)
check('老九：一单未完不能下第二单', brokerMock.orderBroker({ rng: zero }).ok, false)
const firstTag = brokerMock.faction.vault.broker.tags[0]
check('老九：锁定标签', brokerMock.chooseBrokerTag(firstTag).ok, true)
check('老九：标签锁定后不能改', brokerMock.chooseBrokerTag(firstTag).ok, false)
check('老九：没到点不交货', brokerMock.settleBroker({ rng: zero }), false)
brokerMock.faction.realSeconds = brokerMock.faction.vault.broker.readyAt
const delivered = brokerMock.settleBroker({ rng: zero })
check('老九：到点交货', delivered, true)
check('老九：带回 1~2 件', brokerMock.items.length >= 1 && brokerMock.items.length <= 2, true)
check('老九：订单清空', brokerMock.faction.vault.broker, null)

const poorBroker = makeMock({ level: 8 })
poorBroker.faction.contribution = 100
check('老九：贡献点不够下不了单', poorBroker.orderBroker({ rng: zero }).ok, false)

// ================= 汇总 =================
console.log('')
if (LIST) {
  console.log(`共 ${labels.length} 条断言`)
} else {
  const total = passed + failed
  console.log(`${passed}/${total} 通过${skipped ? `（跳过 ${skipped}）` : ''}${failed ? `，失败 ${failed}` : ''}`)
  if (failed) process.exitCode = 1
}
