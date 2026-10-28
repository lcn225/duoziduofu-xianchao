import { GameDB } from '../db'
import { encryptData, decryptData, validateData, SAVE_VERSION } from '../../plugins/crypto'
import { setCurrentTime, clearEventPauses } from '../../plugins/gameClock'
import { shouldSettleOffline } from '../../plugins/offlineSimulation'
import { MODES } from '../../plugins/idleMode'
/**
 * 清档标记的 localStorage 键。
 * **刻意不放 store state** —— 那样它会被写进新档、永久为真，
 * 导致每次启动都弹一次「存档已重置」。
 */
export const SAVE_WIPED_KEY = 'saveWiped'

/**
 * 读档前存档里记的「最后一次在线墙钟时间」（毫秒）。
 *
 * ⚠ **刻意放模块闭包、不进 `$state`**：它一旦进 state，就会被 `deepMerge` 当成普通字段
 * 参与迁移与重置；而离线时长必须是「这次读档一次性算清」的。
 * ⚠ 迁移里的 `saveData()` 必须写回**这个旧值**，不能写 `Date.now()` ——
 * 否则迁移一存，离线时长就被清零，玩家这次的离线收益直接蒸发。
 */
let preservedLastOnlineRealMs = null
/**
 * 保存批次深度。离线重放 180 天会产生上万次 `saveData()`（core/innerCourt/dayLoop 到处都有），
 * 每次都是 IndexedDB 加密写入，不吞掉会卡死。批次内直接 return，结束时统一存一次。
 */
let saveBatchDepth = 0

export const beginSaveBatch = () => {
  saveBatchDepth += 1
}
export const endSaveBatch = () => {
  saveBatchDepth = Math.max(saveBatchDepth - 1, 0)
}
export const isSaveBatching = () => saveBatchDepth > 0

const isPlainObject = value => !!value && typeof value === 'object' && !Array.isArray(value)

/**
 * 深合并存量存档到初始 state 上。
 *
 * - 对象递归合并：新增字段能拿到默认值，旧档缺字段也不会报错
 * - 数组与原始值**整体替换**（items / herbs / equippedArtifacts 绝不能按元素合并）
 * - structuredClone 切断与解密结果的引用共享，避免改到缓存里的对象
 */
export const deepMerge = (target, source) => {
  for (const [key, value] of Object.entries(source || {})) {
    if (value === undefined) continue
    target[key] =
      isPlainObject(value) && isPlainObject(target[key])
        ? deepMerge({ ...target[key] }, value)
        : structuredClone(value)
  }
  return target
}

export const state = () => ({
  // 是否新玩家
  isNewPlayer: true,
  // GM模式开关
  isGMMode: false,
  // 主题设置
  isDarkMode: localStorage.getItem('darkMode') === 'true',
  /**
   * 仙龄刻度版本（2026-10-28）。
   *
   * 3 = 「45 游戏天 = 1 仙龄岁」；0 = 老档（15 天/岁，未迁移）。
   * ⚠ 默认值**必须是 0**：`$reset()`（导入存档 / GM 重置）会把 state 打回默认，
   *   若默认是 3，导入一份老档就会跳过迁移，全族人一夜之间「返老还童」。
   */
  ageScaleVersion: 0
})

export const getters = {}

export const actions = {
  // 更新HTML暗黑模式类
  updateHtmlDarkMode(isDarkMode) {
    const htmlEl = document.documentElement
    if (isDarkMode) {
      htmlEl.classList.add('dark')
    } else {
      htmlEl.classList.remove('dark')
    }
  },
  // 初始化玩家数据
  async initializePlayer() {
    // 每次进这个函数都从「没有基线」开始：老档 / 新档 / 导入存档都不该继承上一次的墙钟时间
    preservedLastOnlineRealMs = null
    try {
      const savedData = await GameDB.getData('playerData')
      if (savedData) {
        const decryptedData = decryptData(savedData)
        if (decryptedData && validateData(decryptedData)) {
          // saveVersion 只用于版本判定，不写进 state
          // lastOnlineRealMs 同理：它是**这次读档要用的基线**，放闭包不放 state
          const { saveVersion, lastOnlineRealMs, ...playerData } = decryptedData
          preservedLastOnlineRealMs = Number.isFinite(Number(lastOnlineRealMs))
            ? Number(lastOnlineRealMs)
            : null
          deepMerge(this.$state, playerData)
        } else {
          // 校验失败（含旧版本存档）：清掉，以新档重开，避免旧数据污染新结构。
          // 落一个标记，供 App.vue 启动时向玩家解释「不是丢档，是版本更新」。
          await GameDB.deleteData('playerData')
          localStorage.setItem(SAVE_WIPED_KEY, '1')
          this.clockGameTime = 0
          console.info('存档数据无效或版本过旧，已丢弃并以新档重开')
        }
        // 把存档里的游戏时间回灌进时钟 —— 少了这一步，刷新页面日期会归零。
        // 放在这里而不是 startClock()：App.vue 的 onMounted 早于 initializePlayer 完成。
        setCurrentTime(this.clockGameTime)
      }
    } catch (error) {
      console.error('加载存档失败:', error)
      preservedLastOnlineRealMs = null
    }

    // 货币迁移，必须早于任何模块读钱，顺序不能反：
    //   1. 货币 v2（2026-10-20）：四字段折叠成 { secular, spiritual, strategic }；
    //   2. 旧 `spiritStones` 1:1 当一阶灵石，90% 留一阶、10% 拆金页子/大子；
    //   3. 已经按旧 1:10 迁移过的存档，补一次差额。
    // 三步都幂等，新档 no-op。
    const structureMigrated = this.migrateCurrencyV2()
    const legacyMigrated = this.migrateLegacyCurrency()
    const legacyFixed = legacyMigrated ? false : this.fixLegacyCurrencyRate()
    // 2026-10-22：老档里开出的灵器/灵兽补上装备部位、面板与灵宠身份
    const itemsMigrated = this.migrateItemInstances()
    // 2026-10-23（P36）：13 槽 → 5 槽。拔下来的只进背包、不自动卖。
    const equipMigrated = this.migrateEquipSlotsV2()
    // 2026-10-25（P43）：灵兽删精华/升星，等级归 1、面板换新口径
    const petsMigrated = this.migratePetsV2()
    // 出战灵兽与背包里的同 id 项是两份拷贝；不重新指回去，同修等级只涨在出战那份上，
    // 背包/秘境名单永远显示旧等级（2026-10-27 修）。
    const petsRelinked = this.relinkActivePet()
    // 2026-10-28：仙龄刻度 15 → 45 天/岁（3×）。必须早于 `normalizeInnerCourtOnLoad`
    // —— 那边的老死判定/阶段回填都按新刻度读 `birthTime`，先迁才不会误判超龄。
    const ageScaleMigrated = this.migrateAgeScale3x()
    if (
      structureMigrated ||
      legacyMigrated ||
      legacyFixed ||
      itemsMigrated ||
      equipMigrated ||
      petsMigrated ||
      petsRelinked ||
      ageScaleMigrated
    ) {
      await this.saveData()
    }

    // 事件暂停的持有者活在 gameClock.js 的**模块闭包**里 —— 刷新页面会清空它，
    // `$reset()`（导入存档 / GM 重置）也清不掉它；而 pendingBirthIds 是存在存档里的。
    // 两边不在这里对齐，就会出现两种坏状态：
    //   · 持有者没了、队列还在 → 弹窗挂着但时钟在走
    //   · 持有者泄漏、队列已空 → 时钟永久卡在 paused_event，且没有任何弹窗能关掉它
    clearEventPauses()
    // P12.3：旧档孕育/恢复归一化 + 逾期结生。必须在 pendingBirthIds 判空**之前**跑，
    // 否则读档结生的子嗣不会触发弹窗；落盘放在冻结时钟之前。
    const pregnancyChanged = this.normalizeInnerCourtOnLoad()
    if (pregnancyChanged) await this.saveData()
    if (this.offspring?.pendingBirthIds?.length) this.pauseClockForEvent('birth')

    // ---- 离线结算（模块九，2026-10-26 B2）----
    // ⚠ 必须排在四个 reset **之前**：那四个 reset 的前提是「不补算离线」，
    //   会把 dayLoop / 探索锚点 / 养伤状态全部按「现在」重置，
    //   重放就没有下线瞬间的配置可续了。
    const settled = await this.settleOfflineOnLoad()

    if (!settled) {
      // 「桂冈的一天」的当日状态锚在**绝对游戏秒**上，读档时必须清成「未初始化」，
      // 让它在下一个 tick 按回灌后的 clockGameTime 重建。
      // 不清的话，上一局的锚点会让第一次推进把中间那些游戏秒当作「今天已经过去」补算一遍。
      this.resetDayLoop()
      // 三大挂机：清掉过期的养伤、修正「模式与进度对不上」的脏数据。
      // 必须在 resetDayLoop 之后 —— 回镇守时它会重新锚定当日状态。
      this.resetIdleRuntime()
      // 探索不补算离线时段：把下一次事件重锚到现在之后（离线结算属模块九）。
      // 旧地点 id 会被直接作废 —— 这一条改写必须落盘，否则刷新后还会复活。
      if (this.resetExplorationRuntime(this.clockGameTime)) await this.saveData()
      // 秘境：丢掉回放帧、修队伍引用、Buff 门自动选（避免模式永久卡住）。
      // 2026-10-21 起还会给老档的在途 run 补难度轴字段 —— 改过就要落盘。
      if (this.resetSecretRealmRuntime()) await this.saveData()
    } else if (this.idleMode !== MODES.GARRISON) {
      // 重放已经推进了当前挂机模式；dayLoop 是上一段镇守的旧状态，先清掉，
      // 回镇守时由 `resumeGarrisonMode` 按「归来时刻」重新接上。
      // ⚠ 反过来：**镇守模式重放过就不能 reset**，否则 180 天的当日状态白推。
      this.resetDayLoop()
    }

    // 结算完成：基线换成「现在」，下次读档从此刻起算
    preservedLastOnlineRealMs = null
    if (settled) await this.saveData()
    // 唯一暂停点：子嗣陨落 → 报告未确认前冻结时钟
    if (this.offlineReport?.pausedByFall) this.pauseClockForEvent('offlineFall')

    // 初始化主题设置
    this.isDarkMode = localStorage.getItem('darkMode') === 'true'
    // 同步暗黑模式状态到HTML标签
    this.updateHtmlDarkMode(this.isDarkMode)
  },
  // 切换暗黑模式
  toggle() {
    this.isDarkMode = !this.isDarkMode
    localStorage.setItem('darkMode', this.isDarkMode)
    // 更新html标签的class
    this.updateHtmlDarkMode(this.isDarkMode)
    this.saveData()
  },
  /**
   * 读档时的离线结算入口。
   *
   * @returns 是否真的重放了（false = 老档没有墙钟基线 / 离开不足 1 分钟 / 出错）
   */
  async settleOfflineOnLoad() {
    const stamp = preservedLastOnlineRealMs
    if (!stamp) return false
    const realSeconds = Math.max((Date.now() - stamp) / 1000, 0)
    if (!shouldSettleOffline(realSeconds)) return false
    beginSaveBatch()
    try {
      const report = this.runOfflineSimulation({
        realSeconds,
        fromGameSeconds: this.clockGameTime
      })
      if (!report) return false
      this.clockGameTime = report.toGameSeconds
      setCurrentTime(this.clockGameTime)
      return true
    } catch (error) {
      // 离线出错不能把玩家卡在读档里：时钟按当前游标落地，四个 reset 照常兜底
      console.error('离线结算失败，已跳过：', error)
      setCurrentTime(this.clockGameTime)
      return false
    } finally {
      endSaveBatch()
    }
  },
  // 保存数据到IndexedDB
  async saveData() {
    // 离线重放期间：所有模块的 saveData 一律吞掉，结束时统一存一次
    if (saveBatchDepth > 0) return
    // 附带存档版本号，读档时据此判断是否兼容。
    // `lastOnlineRealMs` 是离线结算的**唯一基线**：重放过程中必须写旧值，
    // 否则迁移/诞生弹窗的提前落盘会把离线时长清零。
    const encryptedData = encryptData({
      ...this.$state,
      saveVersion: SAVE_VERSION,
      lastOnlineRealMs: preservedLastOnlineRealMs ?? Date.now()
    })
    if (encryptedData) {
      try {
        await GameDB.setData('playerData', encryptedData)
      } catch (error) {
        console.error('数据保存失败:', error)
      }
    } else {
      console.error('数据加密失败')
    }
  },
  // 导出存档数据
  async exportData() {
    try {
      const data = await GameDB.getData('playerData')
      return data
    } catch (error) {
      console.error('导出存档失败:', error)
      throw error
    }
  },
  // 导入存档数据
  async importData(encryptedData) {
    try {
      await GameDB.setData('playerData', encryptedData)
      this.$reset()
      await this.initializePlayer()
    } catch (error) {
      console.error('导入存档失败:', error)
      throw error
    }
  },
  // 清除存档数据
  async clearData() {
    try {
      await GameDB.setData('playerData', null)
    } catch (error) {
      console.error('清除存档失败:', error)
      throw error
    }
  }
}
