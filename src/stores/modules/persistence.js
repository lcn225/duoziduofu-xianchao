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

    // 事件暂停的持有者活在 gameClock.js 的**模块闭包**里 —— 刷新页面会清空它，
    // `$reset()`（导入存档 / GM 重置）也清不掉它；而 pendingBirthIds 是存在存档里的。
    // 两边不在这里对齐，就会出现两种坏状态：
    //   · 持有者没了、队列还在 → 弹窗挂着但时钟在走
    //   · 持有者泄漏、队列已空 → 时钟永久卡在 paused_event，且没有任何弹窗能关掉它
    clearEventPauses()
    if (this.offspring?.pendingBirthIds?.length) this.pauseClockForEvent('birth')
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
