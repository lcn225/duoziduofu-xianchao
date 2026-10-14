import {
  buildInitialPractice,
  QI_ART_MAP,
  FATE_ITEM_MAP,
  SPIRIT_LAND_MAP,
  artGradeOf
} from '../../plugins/cultivationData'
import { TUNING, calcHarmony, speedMultiplierOf, qiArtProficiency, fateItemRefinement } from '../../plugins/harmony'
import { getRealmName, getBreakthroughRequirement, INITIAL_REALM_NAME } from '../../plugins/realm'

// 修行路径：功法 / 同参 / 灵地 / 本命
//
// 命名说明：不能叫 `cultivation` —— core.js 已有同名的 state 字段（修为值），
// 而 index.js 的 Object.assign 合并会让同名键**静默覆盖**且 assertUnique 不检查 state。
// 这里用单个顶层键 `practice`，与既有 9 个模块的 state 零碰撞可能。
export const state = () => ({
  practice: buildInitialPractice()
})

export const getters = {
  // ---------- 当前选中项 ----------
  activeQiArt() {
    return QI_ART_MAP[this.practice.qiArts.active] || null
  },
  activeQiArtEntry() {
    return this.practice.qiArts.known[this.practice.qiArts.active] || null
  },
  activeFateItem() {
    return FATE_ITEM_MAP[this.practice.fateItems.active] || null
  },
  activeFateItemEntry() {
    return this.practice.fateItems.known[this.practice.fateItems.active] || null
  },
  currentSpiritLand() {
    return SPIRIT_LAND_MAP[this.practice.spiritLand.current] || null
  },

  // ---------- 熟练度 / 祭炼（由原始秒数现算） ----------
  qiArtProficiency() {
    return qiArtProficiency(this.activeQiArtEntry)
  },
  fateItemRefinement() {
    return fateItemRefinement(this.activeFateItemEntry)
  },
  activeQiArtMaxLevel() {
    return artGradeOf(this.activeQiArt).maxLevel
  },

  // ---------- 契合度 ----------
  /** 当前境界阶段（qi / foundation / core），本命契合用到 */
  realmTier() {
    return getRealmName(this.level).tier
  },
  /** 四维 + 综合，UI 与数值判定都读它 */
  harmony() {
    return calcHarmony(this.practice, this.realmTier)
  },
  overallHarmony() {
    return this.harmony.total
  },
  /** 灵力获取倍率：0% → 0.5，50% → 1.0，100% → 2.0 */
  harmonySpeedMultiplier() {
    return speedMultiplierOf(this.overallHarmony)
  },

  // ---------- 突破门槛 ----------
  /** 突破到下一级所需契合度（普通小境界为 0） */
  nextGateRequirement() {
    return getBreakthroughRequirement(this.level + 1)
  },
  /**
   * 是否被契合度门槛拦住。
   * 刻意做成 getter 而非 state：契合度一切换就自动翻转，
   * 不会因为「切了功法却忘了清除标记」而留下脏状态，也不进存档。
   */
  isBreakthroughBlocked() {
    const req = this.nextGateRequirement
    return req > 0 && this.overallHarmony < req
  },
  /** 四维中低于当前门槛的维度，用于 UI 精确提示该提升哪一维 */
  blockingDimensions() {
    const req = this.nextGateRequirement
    if (req <= 0) return []
    return [
      { key: 'qiArt', name: '功法契合', value: this.harmony.qiArt },
      { key: 'fateItem', name: '同参契合', value: this.harmony.fateItem },
      { key: 'spiritLand', name: '灵地契合', value: this.harmony.spiritLand },
      { key: 'destiny', name: '本命契合', value: this.harmony.destiny }
    ].filter(d => d.value < req)
  },

  // ---------- 炼体加成（派生值，不写 state） ----------
  bodyBonus() {
    const lv = this.bodyLevel
    const scale = 1 + lv / 18
    return {
      health: Math.floor(TUNING.body.healthPerLevel * lv * scale),
      defense: Math.floor(TUNING.body.defensePerLevel * lv * scale)
    }
  },
  /** 生命/防御的**全量真值** = 本体(含装备/灵宠) + 炼体。UI 与战斗都应读这两个。 */
  totalHealth() {
    return this.baseAttributes.health + this.bodyBonus.health
  },
  totalDefense() {
    return this.baseAttributes.defense + this.bodyBonus.defense
  },

  // ---------- 散功重修补偿（派生值，不写 state） ----------
  rebirthCultivationMultiplier() {
    return 1 + this.practice.scatterCount
  },
  rebirthSpiritMultiplier() {
    return 1 + 0.1 * this.practice.scatterCount
  }
}

export const actions = {
  /** 设置打坐路线：'inner'（内功·练气）| 'outer'（外功·炼体） */
  setActivePath(path) {
    if (path !== 'inner' && path !== 'outer') return
    this.practice.activePath = path
    this.saveData()
  },

  /** 切换主修功法（无代价：换功法本身就是靠散功重修来体现的） */
  switchQiArt(id) {
    const arts = this.practice.qiArts
    if (!QI_ART_MAP[id] || !arts.known[id]) {
      return { success: false, message: '尚未习得该功法' }
    }
    if (arts.active === id) return { success: false, message: '已在修习该功法' }
    arts.active = id
    this.saveData()
    return { success: true, message: `改修《${QI_ART_MAP[id].name}》` }
  },

  /**
   * 切换主同参。
   * 设计文档：切换后祭炼程度保留 50% —— 落实为把**旧同参**的祭炼砍半，
   * 使反复横跳有真实代价。
   */
  switchFateItem(id) {
    const items = this.practice.fateItems
    if (!FATE_ITEM_MAP[id] || !items.known[id]) {
      return { success: false, message: '尚未拥有该同参' }
    }
    if (items.active === id) return { success: false, message: '已在祭炼该同参' }
    const old = items.known[items.active]
    if (old) old.refineSeconds *= 0.5
    items.active = id
    this.saveData()
    return { success: true, message: `改以「${FATE_ITEM_MAP[id].name}」为同参` }
  },

  /** 迁往灵地（只能去已解锁的） */
  switchSpiritLand(id) {
    const land = this.practice.spiritLand
    if (!SPIRIT_LAND_MAP[id]) return { success: false, message: '灵地不存在' }
    if (!land.unlocked.includes(id)) return { success: false, message: '尚未获得该灵地' }
    if (land.current === id) return { success: false, message: '已在该灵地修行' }
    land.current = id
    this.saveData()
    return { success: true, message: `迁往「${SPIRIT_LAND_MAP[id].name}」` }
  },

  /**
   * 累积功法熟练度与同参祭炼。
   * 存**原始秒数**而非百分点 —— 调 TUNING 立即生效，不需要迁移存档。
   * 带 seconds 参数是为了让将来的离线结算模块能直接传离线时长复用同一条路径。
   *
   * 注意：本 action **不自己 saveData**，由每秒 tick 末尾的 gainSpirit 统一落盘，
   * 避免每秒写两次 IndexedDB。
   */
  accumulatePractice(seconds = 1) {
    const delta = Math.min(Math.max(Number(seconds) || 0, 0), TUNING.maxSecondsPerTick)
    if (delta <= 0) return
    const art = this.activeQiArtEntry
    if (art) art.practiceSeconds += delta
    const item = this.activeFateItemEntry
    if (item) item.refineSeconds += delta
  },

  /**
   * 散功重修（最小可行版）：
   * 清空灵力与内功修为，契合度保留 50%，换取永久加成。
   * **外功不动** —— 内外两线独立进度是既定决策。
   */
  scatterCultivation() {
    if (this.level <= 3) {
      return { success: false, message: '境界过低，散功重修毫无意义' }
    }
    this.practice.scatterCount += 1

    this.spirit = 0
    // 内功归零
    this.level = 1
    this.realm = INITIAL_REALM_NAME
    this.cultivation = 0
    this.maxCultivation = getRealmName(1).maxCultivation

    // 契合度保留 50%（等级与收集不清）
    for (const entry of Object.values(this.practice.qiArts.known)) entry.practiceSeconds *= 0.5
    for (const entry of Object.values(this.practice.fateItems.known)) entry.refineSeconds *= 0.5

    this.saveData()
    return {
      success: true,
      message: `散功重修完成（第 ${this.practice.scatterCount} 次）—— 重修时将快 ${this.rebirthCultivationMultiplier} 倍`
    }
  }
}
