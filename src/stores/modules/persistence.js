import { toRaw } from 'vue'
import { GameDB } from '../db'
import { encryptData, decryptData, validateData, SAVE_VERSION } from '../../plugins/crypto'
import { setCurrentTime, clearEventPauses } from '../../plugins/gameClock'
import { shouldSettleOffline } from '../../plugins/offlineSimulation'
import { MODES } from '../../plugins/idleMode'
import { createSaveScheduler } from '../../plugins/saveThrottle'
import {
  mapLegacyRealmLevel,
  legacyMaxCultivationOf,
  getRealmName,
  getBodyRealmName,
  REALM_MAX_LEVEL
} from '../../plugins/realm'
import { offspringLevelCostOf, TUNING as INNER_TUNING } from '../../plugins/innerCourt'
import { QI_ART_MAP } from '../../plugins/cultivationData'
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

/**
 * 落盘节流器（2026-10-29 P58）。
 *
 * ⚠ **刻意放模块闭包、不进 state**：它带着定时器句柄与「脏」标记，
 *   进 state 就会被序列化、被 `$reset()` 重建（旧定时器还挂着 → 幽灵落盘）。
 *
 * 为什么需要它：tick 里每秒至少一次 `saveData`（练功切片 `gainSpirit` + `cultivate` 各一次），
 * 每次整档加密写库 ⇒ 主线程 100%（P58 实测主界面 1.7 帧）。
 * 现在最多 5 秒一次，关键点用 `saveData({ force: true })` / `flushSave()` 顶穿。
 */
let saveScheduler = null
const schedulerOf = store => {
  if (!saveScheduler) {
    saveScheduler = createSaveScheduler({ write: () => store.persistSnapshot() })
  }
  return saveScheduler
}

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
  ageScaleVersion: 0,
  /**
   * 境界刻度版本（2026-10-30，18 级 → 30 级）。
   *
   * 10 = 已迁到 30 级表；0 = 老档（18 级表，未迁移）。
   * ⚠ 默认值**同样必须是 0** —— 理由同上：导入老档后必须真的跑一遍 `migrateRealmScale`。
   */
  realmScaleVersion: 0
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
        // 2026-10-29 P58：解密改成异步（WebCrypto AES-GCM），老档的 CryptoJS 通路也走这里
        const decryptedData = await decryptData(savedData)
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
    //   2. 货币 v4（2026-10-31 回滚 A1）：`spiritual1/2/3` 三档合并回 `spiritual` 总一阶数；
    //   3. 旧 `spiritStones` 1:1 当一阶灵石，90% 留一阶、10% 拆金页子/大子；
    //   4. 已经按旧 1:10 迁移过的存档，补一次差额。
    // 四步都幂等，新档 no-op。
    // 功法库 90 本（2026-10-31）：删掉的《御器诀》要从老档里摘干净，
    // 否则 `active` 指向不存在的 id，契合度恒为 0，破境直接卡死。
    const qiArtsMigrated = this.migrateQiArtsV2()
    const structureMigrated = this.migrateCurrencyV2()
    const tiersMerged = this.migrateCurrencyV4()
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
    // 2026-10-29（P55-a）：仙龄刻度统一到 365 天/岁（练气期 1:1）。
    // 必须早于 `normalizeInnerCourtOnLoad` —— 那边的老死判定/阶段回填都按新刻度
    // 读 `birthTime`，先迁才不会误判超龄。
    const ageScaleMigrated = this.migrateAgeScale()
    // 2026-10-30：18 级 → 30 级（每个大境界 10 层）。必须早于同样的那些判定：
    //   寿终看 `realmTierOf`、子嗣修炼看 `offspringLevelCostOf`、离线分段看 `isAscendedLevelOf`。
    const realmScaleMigrated = this.migrateRealmScale()
    // 2026-10-29（P57）：灵植/灵材/灵草合并成「一条带 count」。
    // 必须在 `migrateItemInstances` 之后（那边补 equipSlot/category 相关字段），
    // 且必须在离线结算之前 —— 否则重放期间又会往碎片数组里加，白合并一遍。
    const stacksMigrated = this.migrateStacks()
    if (
      qiArtsMigrated ||
      structureMigrated ||
      tiersMerged ||
      legacyMigrated ||
      legacyFixed ||
      itemsMigrated ||
      equipMigrated ||
      petsMigrated ||
      petsRelinked ||
      ageScaleMigrated ||
      realmScaleMigrated ||
      stacksMigrated
    ) {
      // 读档路径上的落盘一律 force：迁移结果必须当场进库，
      // 不能等节流窗口（这期间玩家可能直接关页，虽然 pagehide 会兜底，但没必要赌）
      await this.saveData({ force: true })
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
    if (pregnancyChanged) await this.saveData({ force: true })
    // 飞鹰门（模块五 §13）：老档没有 `faction` 字段，补齐默认形状。
    // 刷新不在这里做 —— 交给下一次日结，避免读档与日界各刷一次。
    const factionChanged = this.normalizeFactionOnLoad()
    if (factionChanged) await this.saveData({ force: true })
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
      if (this.resetExplorationRuntime(this.clockGameTime)) await this.saveData({ force: true })
      // 秘境：丢掉回放帧、修队伍引用、Buff 门自动选（避免模式永久卡住）。
      // 2026-10-21 起还会给老档的在途 run 补难度轴字段 —— 改过就要落盘。
      if (this.resetSecretRealmRuntime()) await this.saveData({ force: true })
    } else if (this.idleMode !== MODES.GARRISON) {
      // 重放已经推进了当前挂机模式；dayLoop 是上一段镇守的旧状态，先清掉，
      // 回镇守时由 `resumeGarrisonMode` 按「归来时刻」重新接上。
      // ⚠ 反过来：**镇守模式重放过就不能 reset**，否则 180 天的当日状态白推。
      this.resetDayLoop()
    }

    // 结算完成：基线换成「现在」，下次读档从此刻起算
    preservedLastOnlineRealMs = null
    // force：离线重放的产出必须当场进库（否则玩家刷新一次就白赚一份）
    if (settled) await this.saveData({ force: true })
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
   * 境界刻度迁移：18 级表 → 30 级表（2026-10-30）。
   *
   * 层号映射走 `mapLegacyRealmLevel`（初/中/后/圆满 → 一/四/七/十层，按「走完该大境界几成」）；
   * **已攒的修为按 `新旧上限比` 等比缩放**，否则一个满格筑基老号会瞬间掉级。
   * 子嗣同理（上限读 `offspringLevelCostOf`，含筑基段加税）；灵兽等级直接映射层号。
   *
   * ⚠ `realmBreakthroughs` 的**键是层号**，必须跟着重映射 ——
   *   不迁的话老键 15（结丹初期）在新表里会变成「筑基五层」，
   *   讣告会把「四十七岁金丹」写成「四十七岁筑基」。
   *
   * 幂等靠 `realmScaleVersion`；>= 10 直接 no-op。
   */
  /**
   * 功法库 90 本（2026-10-31）：清理库中已删 / 不存在的功法 id。
   *
   * 90 本落盘时删掉了《御器诀》（`vessel_jue`，三维去重时被《兽器双修经》吃掉）。
   * 老档可能：① `known.vessel_jue` 还在；② `active` 正指着它；③ `artFragments` 里有残页。
   * **不迁的后果**：`QI_ART_MAP[active]` 是 undefined → 功法契合 0 → 综合契合 0 →
   * 所有门槛都过不去，玩家会以为存档坏了。
   *
   * 幂等：没有残留就直接 no-op。
   */
  migrateQiArtsV2() {
    const arts = this.practice?.qiArts
    if (!arts || typeof arts !== 'object') return false
    let changed = false
    const known = arts.known && typeof arts.known === 'object' ? arts.known : {}
    for (const id of Object.keys(known)) {
      if (!QI_ART_MAP[id]) {
        delete known[id]
        changed = true
      }
    }
    arts.known = known
    if (!QI_ART_MAP[arts.active]) {
      // 回落顺序：开局三本优先，再退到任意一本已学的；一本都没有就留空
      const fallback =
        ['gui_blood', 'lv_sequential', 'yuan_ming'].find(id => known[id]) ||
        Object.keys(known)[0] ||
        ''
      if (arts.active !== fallback) {
        arts.active = fallback
        changed = true
      }
    }
    const fragments = this.practice.artFragments
    if (fragments && typeof fragments === 'object') {
      for (const id of Object.keys(fragments)) {
        if (!QI_ART_MAP[id]) {
          delete fragments[id]
          changed = true
        }
      }
    }
    return changed
  },

  migrateRealmScale() {
    if (Number(this.realmScaleVersion) >= 10) return false
    const scaleProgress = (value, oldMax, newMax) => {
      const ratio = Number(oldMax) > 0 ? Number(newMax) / Number(oldMax) : 0
      return Math.min(Number(newMax), Math.max(0, (Number(value) || 0) * ratio))
    }
    // ---- 内功 ----
    const oldInner = Math.floor(Number(this.level) || 1)
    const newInner = Math.min(mapLegacyRealmLevel(oldInner) || 1, REALM_MAX_LEVEL)
    const innerRealm = getRealmName(newInner)
    // 层号 > 18 = 已经是新表（脏档 / 版本字段丢了），按存档自带的旧上限缩，别拿 1 当分母
    const oldInnerMax =
      oldInner > 18 ? Number(this.maxCultivation) || innerRealm.maxCultivation : legacyMaxCultivationOf(oldInner, 'inner')
    this.cultivation = scaleProgress(this.cultivation, oldInnerMax, innerRealm.maxCultivation)
    this.level = newInner
    this.realm = innerRealm.name
    this.maxCultivation = innerRealm.maxCultivation
    // ---- 外功 ----
    const oldOuter = Math.floor(Number(this.bodyLevel) || 1)
    const newOuter = Math.min(mapLegacyRealmLevel(oldOuter) || 1, REALM_MAX_LEVEL)
    const outerRealm = getBodyRealmName(newOuter)
    const oldOuterMax =
      oldOuter > 18 ? Number(this.maxBodyCultivation) || outerRealm.maxCultivation : legacyMaxCultivationOf(oldOuter, 'outer')
    this.bodyCultivation = scaleProgress(this.bodyCultivation, oldOuterMax, outerRealm.maxCultivation)
    this.bodyLevel = newOuter
    this.bodyRealm = outerRealm.name
    this.maxBodyCultivation = outerRealm.maxCultivation
    // ---- 子嗣 ----
    // ⚠ 这里算的是**老表**的子嗣加税，永远是「L11 起 ×4.8」那一版；
    //   别读 `costBump.byTier`（那是 30 级表的新口径，拿来算旧进度会错)。
    const bump = INNER_TUNING.offspringCultivation.costBump
    const legacyCostOf = lv => {
      const base = legacyMaxCultivationOf(lv, 'inner')
      const taxed = bump && lv >= Number(bump.from) && lv <= Number(bump.to ?? Infinity)
      return taxed ? base * (Number(bump.multiplier) || 1) : base
    }
    for (const child of this.offspring?.list || []) {
      const oldLevel = Math.floor(Number(child?.realmLevel) || 0)
      if (!oldLevel) continue
      const newLevel = Math.min(mapLegacyRealmLevel(oldLevel), INNER_TUNING.offspringCultivation.maxLevel)
      // 同上：层号 > 18 说明已经是新表，新旧上限相同 ⇒ 不缩放
      const oldCost = oldLevel > 18 ? offspringLevelCostOf(oldLevel) : legacyCostOf(oldLevel)
      child.cultivation = scaleProgress(child.cultivation, oldCost, offspringLevelCostOf(newLevel))
      child.realmLevel = newLevel
      const stamps = child.realmBreakthroughs
      if (stamps && typeof stamps === 'object') {
        const next = {}
        for (const [levelText, atSeconds] of Object.entries(stamps)) {
          const mapped = mapLegacyRealmLevel(Number(levelText))
          next[mapped || levelText] = atSeconds
        }
        child.realmBreakthroughs = next
      }
    }
    // ---- 灵兽（等级 = 小境界；灵兽实例住在 `items` 里，`type: 'pet'`）----
    // ⚠ 用 Set 去重：`relinkActivePet` 跑过之后 `activePet` 与 `items` 里那只是**同一个对象**，
    //   重复映射会把它推两级（14 → 20 → 30）。
    const seenPets = new Set()
    const remapPet = pet => {
      if (!pet || pet.type !== 'pet' || seenPets.has(pet) || Number(pet.level) <= 0) return
      seenPets.add(pet)
      pet.level = Math.min(mapLegacyRealmLevel(pet.level), REALM_MAX_LEVEL)
    }
    for (const item of this.items || []) remapPet(item)
    // activePet 是同一只的第二份拷贝（见 `relinkActivePet`），漏了它会同修经验对不上
    remapPet(this.activePet)
    this.realmScaleVersion = 10
    return true
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
  /**
   * 标脏 + 按节流窗口决定要不要现在写（2026-10-29 P58）。
   *
   * ⚠ **已经不是「调了就写」了**：默认最多 5 秒才真落一次盘（见 `plugins/saveThrottle.js`）。
   *   需要「立刻进库」的地方传 `{ force: true }`，或者直接 `await flushSave()` ——
   *   哪些地方需要，见 App.vue 的 pagehide / 读档收尾 / 导出。
   */
  async saveData({ force = false } = {}) {
    // 离线重放期间：所有模块的 saveData 一律吞掉，结束时统一存一次
    if (saveBatchDepth > 0) return
    await schedulerOf(this).markDirty({ force })
  },

  /** 顶穿节流：把当前状态立刻写进去（关页 / 切后台 / 读档收尾 / 导出前） */
  async flushSave() {
    if (saveBatchDepth > 0) return
    await schedulerOf(this).flush()
  },

  /**
   * 真正的那一次落盘：`toRaw` 剥掉响应式代理 → 序列化 → 加密 → IndexedDB。
   *
   * `toRaw` 不是洁癖：实测同一份 4.96MB 明文，`JSON.stringify(代理)` 275ms、
   * `toRaw` 后 61ms（差 4.5 倍，全是 Proxy 的 get/ownKeys 陷阱）。
   *
   * 附带存档版本号，读档时据此判断是否兼容。
   * `lastOnlineRealMs` 是离线结算的**唯一基线**：重放过程中必须写旧值，
   * 否则迁移/诞生弹窗的提前落盘会把离线时长清零。
   * 它也**跟着写盘走** —— 所以离线时长最多偏差一个节流窗口，这是 P58 明码登记的代价。
   */
  async persistSnapshot() {
    const envelope = {
      ...toRaw(this.$state),
      saveVersion: SAVE_VERSION,
      lastOnlineRealMs: preservedLastOnlineRealMs ?? Date.now()
    }
    const encryptedData = await encryptData(envelope)
    if (!encryptedData) {
      // 抛出去让节流器保持「脏」并重试；这里只负责说清楚原因
      console.error('数据加密失败')
      throw new Error('encrypt failed')
    }
    try {
      await GameDB.setData('playerData', encryptedData)
    } catch (error) {
      console.error('数据保存失败:', error)
      throw error
    }
  },
  // 导出存档数据
  async exportData() {
    try {
      // ⚠ 节流之后必须先把脏写掉，否则导出的可能是 5 秒前的档（玩家刚做的事不在里面）
      await this.flushSave()
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
