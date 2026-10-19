import { GameDB } from '../db'
import { encryptData, decryptData, validateData, SAVE_VERSION } from '../../plugins/crypto'
import { setCurrentTime, clearEventPauses } from '../../plugins/gameClock'
/**
 * 清档标记的 localStorage 键。
 * **刻意不放 store state** —— 那样它会被写进新档、永久为真，
 * 导致每次启动都弹一次「存档已重置」。
 */
export const SAVE_WIPED_KEY = 'saveWiped'

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
  isDarkMode: localStorage.getItem('darkMode') === 'true'
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
    try {
      const savedData = await GameDB.getData('playerData')
      if (savedData) {
        const decryptedData = decryptData(savedData)
        if (decryptedData && validateData(decryptedData)) {
          // saveVersion 只用于版本判定，不写进 state
          const { saveVersion, ...playerData } = decryptedData
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
    }

    // P17 单位迁移：旧 `spiritStones`（1 旧灵石 = 10 大子）搬进 `currency.daZi` 后清零。
    // 必须早于任何模块读钱；幂等，新档是 no-op。不 bump SAVE_VERSION —— 老档照常通过校验。
    if (this.migrateLegacyCurrency()) await this.saveData()

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

    // 「桂冈的一天」的当日状态锚在**绝对游戏秒**上，读档时必须清成「未初始化」，
    // 让它在下一个 tick 按回灌后的 clockGameTime 重建。
    // 不清的话，上一局的锚点会让第一次推进把中间那些游戏秒当作「今天已经过去」补算一遍。
    this.resetDayLoop()
    // 三大挂机：清掉过期的养伤、修正「模式与进度对不上」的脏数据。
    // 必须在 resetDayLoop 之后 —— 回镇守时它会重新锚定当日状态。
    this.resetIdleRuntime()
    // 探索不补算离线时段：把下一次事件重锚到现在之后（离线结算属模块九）
    this.resetExplorationRuntime(this.clockGameTime)
    // 秘境：丢掉回放帧、修队伍引用、Buff 门自动选（避免模式永久卡住）
    this.resetSecretRealmRuntime()
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
  // 保存数据到IndexedDB
  async saveData() {
    // 附带存档版本号，读档时据此判断是否兼容
    const encryptedData = encryptData({ ...this.$state, saveVersion: SAVE_VERSION })
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
