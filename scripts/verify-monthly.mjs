// 练气期月报纯函数 / store 断言（2026-11-27 待办 #3，《模块解锁方针》§四）。
//
// 覆盖：
//   · 空计数 / 无活动月份不出报
//   · 收支 = 月初 → 月末净变化（含负数）
//   · 内功 / 外功升级层数（负差夹 0）
//   · 带符号净额文案
//   · store：只认月报字段的 patch、跨月重置、练气段出报、筑基段不出报
//   · store：离线回线跳一个月、读档月序号归一、关闭弹窗
//   · 静态扫描：clock / innerCourt / inventory 的挂点都在
//
//   node scripts/verify-monthly.mjs           完整输出
//   node scripts/verify-monthly.mjs --list    只列断言标题
//   VERIFY_FILTER=收支 node scripts/verify-monthly.mjs --quiet
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MONTHLY_REPORT_VERSION,
  MONTH_SECONDS,
  buildMonthlyReportOf,
  emptyMonthlyStats,
  formatSignedAmountOf,
  hasMonthlyActivityOf,
  isMonthlyStatKey
} from '../src/plugins/monthlyReport.js'
import { actions as monthlyActions } from '../src/stores/modules/monthlyReport.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
let skipped = 0
const results = []
const labels = []
const FILTER = (process.env.VERIFY_FILTER || '').toLowerCase()
const LIST = process.argv.includes('--list')

const eq = (a, b) => {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-6
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => eq(v, b[i]))
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ak = Object.keys(a)
    const bk = Object.keys(b)
    return ak.length === bk.length && ak.every(key => eq(a[key], b[key]))
  }
  return a === b
}
const check = (label, actual, expected) => {
  if (FILTER && !label.toLowerCase().includes(FILTER)) {
    skipped += 1
    return
  }
  labels.push(label)
  if (LIST) return
  const ok = eq(actual, expected)
  if (!ok) failures += 1
  results.push({ ok, label, actual, expected })
}

// ================= 一、纯函数 =================
check('空计数：字段集合', Object.keys(emptyMonthlyStats()).sort(), [
  'autoWashes',
  'births',
  'breakthroughs',
  'chests',
  'grandchildren',
  'materials',
  'offspringDeaths',
  'rootedBirths',
  'wifeDeaths'
])
check('空计数：全部为 0', Object.values(emptyMonthlyStats()).every(v => v === 0), true)
check('字段判定：births 认、interact 不认', [
  isMonthlyStatKey('births'),
  isMonthlyStatKey('interact')
], [true, false])

check(
  '无活动月份：不出报',
  buildMonthlyReportOf({
    month: 0,
    stats: emptyMonthlyStats(),
    currencyStart: { secular: 100, spiritual: 200 },
    currencyEnd: { secular: 100, spiritual: 200 },
    levelStart: 1,
    levelEnd: 1,
    bodyLevelStart: 1,
    bodyLevelEnd: 1
  }),
  null
)

const report = buildMonthlyReportOf({
  month: 2,
  stats: {
    ...emptyMonthlyStats(),
    births: 3,
    rootedBirths: 1,
    grandchildren: 2,
    wifeDeaths: 1,
    offspringDeaths: 2,
    breakthroughs: 4,
    autoWashes: 5,
    materials: 17,
    chests: 3
  },
  currencyStart: { secular: 100, spiritual: 200 },
  currencyEnd: { secular: 50, spiritual: 1_200 },
  levelStart: 5,
  levelEnd: 7,
  bodyLevelStart: 2,
  bodyLevelEnd: 5
})
check('月报：标题按 1 起', report.label, '第 3 月')
check('月报：收支净变化（可负）', [report.spiritual, report.secular], [1_000, -50])
check('月报：出生 / 孙辈 / 寿终 / 精进 / 洗命', [
  report.births,
  report.rootedBirths,
  report.grandchildren,
  report.wifeDeaths,
  report.offspringDeaths,
  report.breakthroughs,
  report.autoWashes
], [3, 1, 2, 1, 2, 4, 5])
check('月报：材料 / 宝匣', [report.materials, report.chests], [17, 3])
check('月报：内外功升级层数', [report.innerLevels, report.bodyLevels], [2, 3])
check('月报：版本号', report.version, MONTHLY_REPORT_VERSION)
check('月报：有活动判定', hasMonthlyActivityOf(report), true)

const shrink = buildMonthlyReportOf({
  month: 0,
  stats: emptyMonthlyStats(),
  currencyStart: { secular: 0, spiritual: 0 },
  currencyEnd: { secular: 0, spiritual: 0 },
  levelStart: 9,
  levelEnd: 3,
  bodyLevelStart: 4,
  bodyLevelEnd: 1
})
check('月报：等级倒退夹 0（只认正向成长）', shrink, null)

check('净额文案：0 / 正 / 负', [
  formatSignedAmountOf(0),
  formatSignedAmountOf(12),
  formatSignedAmountOf(-34)
], ['±0', '+12', '-34'])

// ================= 二、store =================
const makeStore = (patch = {}) =>
  Object.assign(
    {
      monthlyReport: null,
      monthlyReportShownMonth: -1,
      monthlySuppressUntil: -1,
      monthlyStats: {
        version: MONTHLY_REPORT_VERSION,
        month: 0,
        stats: emptyMonthlyStats(),
        currencyStart: { secular: 0, spiritual: 0 },
        levelStart: 1,
        bodyLevelStart: 1
      },
      currency: { secular: 0, spiritual: 0, strategic: 0 },
      level: 5,
      bodyLevel: 1,
      clockGameTime: 0,
      saves: 0,
      saveData() {
        this.saves += 1
      }
    },
    monthlyActions,
    patch
  )

const s1 = makeStore({ clockGameTime: 100, level: 5, bodyLevel: 3 })
s1.noteMonthly({ births: 1, rootedBirths: 1, interact: 99, materials: 4, chests: 1 }, 100)
check('store：只累计月报字段（忽略留宿）', [
  s1.monthlyStats.stats.births,
  s1.monthlyStats.stats.rootedBirths,
  s1.monthlyStats.stats.materials,
  s1.monthlyStats.stats.chests,
  'interact' in s1.monthlyStats.stats
], [1, 1, 4, 1, false])

const s2 = makeStore({ clockGameTime: MONTH_SECONDS * 2 + 10, level: 5 })
s2.noteMonthly({ births: 1 }, MONTH_SECONDS * 2 + 10)
check('store：跨月自动重置计数', [s2.monthlyStats.month, s2.monthlyStats.stats.births], [2, 1])

const boundaryStore = makeStore({
  clockGameTime: MONTH_SECONDS,
  level: 6,
  bodyLevel: 2,
  currency: { secular: 20, spiritual: 300, strategic: 0 }
})
boundaryStore.noteMonthly({ births: 2, breakthroughs: 1 }, MONTH_SECONDS - 10)
boundaryStore.onMonthlyReportBoundary(MONTH_SECONDS)
check('store：练气段月界出报', [
  boundaryStore.monthlyReport?.births,
  boundaryStore.monthlyReport?.breakthroughs,
  boundaryStore.monthlyReport?.spiritual,
  boundaryStore.monthlyReportShownMonth
], [2, 1, 300, 0])
check('store：出报后计数器进入下一个月', boundaryStore.monthlyStats.month, 1)
check('store：出报落盘一次', boundaryStore.saves >= 1, true)

const foundationStore = makeStore({
  clockGameTime: MONTH_SECONDS,
  level: 12,
  monthlyStats: {
    version: MONTHLY_REPORT_VERSION,
    month: 0,
    stats: { ...emptyMonthlyStats(), births: 1 },
    currencyStart: { secular: 0, spiritual: 0 },
    levelStart: 11,
    bodyLevelStart: 1
  }
})
foundationStore.onMonthlyReportBoundary(MONTH_SECONDS)
check('store：筑基段不出报', foundationStore.monthlyReport, null)

const suppressed = makeStore({
  clockGameTime: MONTH_SECONDS * 3,
  level: 5,
  monthlySuppressUntil: 3,
  monthlyStats: {
    version: MONTHLY_REPORT_VERSION,
    month: 2,
    stats: { ...emptyMonthlyStats(), births: 1 },
    currencyStart: { secular: 0, spiritual: 0 },
    levelStart: 1,
    bodyLevelStart: 1
  }
})
suppressed.onMonthlyReportBoundary(MONTH_SECONDS * 3)
check('store：离线回线跳过的月界不出报', suppressed.monthlyReport, null)
check('store：跳过月界后计数进入新月份', suppressed.monthlyStats.month, 3)

suppressed.noteMonthly({ chests: 2 }, MONTH_SECONDS * 3 + 10)
suppressed.onMonthlyReportBoundary(MONTH_SECONDS * 4)
check('store：下一个完整月恢复出报', suppressed.monthlyReport?.chests, 2)

const emptyStore = makeStore({
  clockGameTime: MONTH_SECONDS,
  level: 5,
  monthlyStats: {
    version: MONTHLY_REPORT_VERSION,
    month: 0,
    stats: emptyMonthlyStats(),
    currencyStart: { secular: 0, spiritual: 0 },
    levelStart: 5,
    bodyLevelStart: 1
  }
})
emptyStore.onMonthlyReportBoundary(MONTH_SECONDS)
check('store：空月不弹窗', emptyStore.monthlyReport, null)

const dismissStore = makeStore({ monthlyReport: report })
check('store：关闭月报', [dismissStore.dismissMonthlyReport(), dismissStore.monthlyReport], [true, null])

const offlineStore = makeStore({
  clockGameTime: MONTH_SECONDS * 2 + 777,
  monthlyReport: report,
  monthlyStats: {
    version: MONTHLY_REPORT_VERSION,
    month: 2,
    stats: { ...emptyMonthlyStats(), births: 9 },
    currencyStart: { secular: 0, spiritual: 0 },
    levelStart: 1,
    bodyLevelStart: 1
  }
})
offlineStore.startMonthlyReportCleanSlate()
check('store：回线清旧报 + 跳当前月', [
  offlineStore.monthlyReport,
  offlineStore.monthlyStats.month,
  offlineStore.monthlyStats.stats.births,
  offlineStore.monthlySuppressUntil
], [null, 2, 0, 3])

const loadStore = makeStore({
  clockGameTime: MONTH_SECONDS * 5 + 1,
  monthlyStats: {
    version: MONTHLY_REPORT_VERSION,
    month: 0,
    stats: emptyMonthlyStats(),
    currencyStart: { secular: 0, spiritual: 0 },
    levelStart: 1,
    bodyLevelStart: 1
  }
})
check('store：读档月序号对不上就归一', [
  loadStore.normalizeMonthlyReportOnLoad(),
  loadStore.monthlyStats.month,
  loadStore.monthlySuppressUntil
], [true, 5, -1])

const badVersion = makeStore({
  monthlyReport: { version: 0, month: 0 },
  monthlyStats: { version: 0, month: 0, stats: {}, currencyStart: {} }
})
check('store：版本不对整份重置', [
  badVersion.normalizeMonthlyReportOnLoad(),
  badVersion.monthlyReport,
  badVersion.monthlyStats.version
], [true, null, MONTHLY_REPORT_VERSION])

// ================= 三、静态挂点 =================
const clockSrc = readFileSync(join(root, 'src/stores/modules/clock.js'), 'utf8')
const courtSrc = readFileSync(join(root, 'src/stores/modules/innerCourt.js'), 'utf8')
const inventorySrc = readFileSync(join(root, 'src/stores/modules/inventory.js'), 'utf8')
const persistenceSrc = readFileSync(join(root, 'src/stores/modules/persistence.js'), 'utf8')
check('挂点：clock 月界调用月报结算', clockSrc.includes('onMonthlyReportBoundary'), true)
check('挂点：内宅周报同步月报计数', courtSrc.includes('noteMonthly'), true)
check('挂点：入包 / 入匣各记一次', [
  inventorySrc.includes('noteMonthly?.({ materials: n })'),
  inventorySrc.includes('noteMonthly?.({ chests: n })')
], [true, true])
check('挂点：离线回线清一次计数', persistenceSrc.includes('startMonthlyReportCleanSlate'), true)

// ================= 输出 =================
if (LIST) {
  for (const label of labels) console.log(`[LIST] ${label}`)
  console.log(`\n共 ${labels.length} 条断言`)
  process.exit(0)
}

const width = Math.max(...results.map(r => r.label.length), 10)
console.log('\n练气期月报断言（《模块解锁方针》§四 · 收支 / 计数 / 离线跳过 / 挂点）\n')
for (const r of results) {
  const mark = r.ok ? '  ok  ' : ' FAIL '
  console.log(`[${mark}] ${r.label.padEnd(width)} ${JSON.stringify(r.actual)}`)
}
const passed = results.length - failures
console.log(`\n${passed}/${results.length} 通过`)
if (failures > 0) {
  console.error(`\n${failures} 条断言失败\n`)
  process.exit(1)
}
console.log('全部通过 ✅\n')
if (skipped) console.log(`（${skipped} 条被 VERIFY_FILTER 跳过）`)
