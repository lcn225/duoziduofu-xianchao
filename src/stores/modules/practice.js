import {
  buildInitialPractice,
  QI_ART_MAP,
  FATE_ITEM_MAP,
  SPIRIT_LAND_MAP,
  artGradeOf
} from '../../plugins/cultivationData'
import {
  TUNING,
  calcHarmony,
  fitFactorOf,
  fateSpeedCoef,
  spiritLandOutputOf,
  spiritPerSecondOf,
  qiArtProficiency,
  qiArtLevelOf
} from '../../plugins/harmony'
import { isTierAtLeast } from '../../plugins/tiers'
import {
  getRealmName,
  getBreakthroughRequirement,
  getLandTierRequirement,
  INITIAL_REALM_NAME
} from '../../plugins/realm'

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

  // ---------- 熟练度 / 功法层数（均由原始秒数现算） ----------
  qiArtProficiency() {
    return qiArtProficiency(this.activeQiArtEntry)
  },
  activeQiArtMaxLevel() {
    return artGradeOf(this.activeQiArt).maxLevel
  },
  /** 功法层数：由修炼时长派生，仅供展示，不加任何属性 */
  qiArtLevel() {
    return qiArtLevelOf(this.activeQiArtEntry, this.activeQiArt)
  },

  // ---------- 契合度 ----------
  /** 三维（加权）+ 综合，UI 与数值判定都读它 */
  harmony() {
    return calcHarmony(this.practice)
  },
  overallHarmony() {
    return this.harmony.total
  },
  /** 速度公式里的契合度项：0% → 0.7，100% → 1.3 */
  fitFactor() {
    return fitFactorOf(this.overallHarmony)
  },
  /** 三维明细（含权重与各自贡献），供 UI 展示「加权式」 */
  dimensionBreakdown() {
    const h = this.harmony
    return [
      { key: 'fateItem', name: '同参契合', value: h.fateItem, weight: h.weights.fateItem },
      { key: 'spiritLand', name: '灵地契合', value: h.spiritLand, weight: h.weights.spiritLand },
      { key: 'qiArt', name: '功法契合', value: h.qiArt, weight: h.weights.qiArt }
    ].map(d => ({ ...d, contribution: d.value * d.weight }))
  },

  // ---------- 速度 ----------
  /** 本命数量系数：本命越多修炼越慢（桂冈双本命双灵根 = 0.8×） */
  fateSpeedCoef() {
    return fateSpeedCoef(this.practice)
  },
  /** 当前灵地的基础产出（由灵地品阶决定，不进契合度） */
  spiritLandOutput() {
    return spiritLandOutputOf(this.practice)
  },
  /** 行功带宽占位：五种散功 + 边际衰减 + 上限尚未实现，恒 1.0 */
  actionBandwidth() {
    return TUNING.bandwidth
  },
  /**
   * 子嗣修炼加成 —— 模块二接入完成，由有灵根子嗣现算（上限 +200%）。
   * 真源在 innerCourt 模块的 `offspringCultivationBonus`，这里只做跨模块转发，
   * 好让下面的 spiritPerGameHour 继续只认这一个名字。
   */
  childrenCultivationBonus() {
    return this.offspringCultivationBonus
  },
  /**
   * **灵力 / 游戏小时** —— 唯一真源。UI 显示与实得都走它，物理上不可能分叉。
   *
   * ⚠ 单位是**游戏小时**，不是现实秒（2026-10-16 改，原名 spiritPerSecond）。
   *   灵力若按现实秒结算，时钟一放慢，一个游戏天的 tick 数变多、每游戏天的灵力就白送 ——
   *   详见 `core.gainSpirit`。门控练功后的补偿系数见 `harmony.js` 的 `TUNING.speed`。
   *
   * 散功重修的补偿倍率已折进来（沿用现有实现），所以这就是玩家实际拿到的速率。
   */
  spiritPerGameHour() {
    return (
      spiritPerSecondOf({
        landOutput: this.spiritLandOutput,
        fitFactor: this.fitFactor,
        spiritRate: this.spiritRate,
        fateCoef: this.fateSpeedCoef,
        bandwidth: this.actionBandwidth,
        childrenBonus: this.childrenCultivationBonus
      }) * this.rebirthSpiritMultiplier
    )
  },

  // ---------- 突破门槛 ----------
  /** 突破到下一级所需综合契合度（普通小境界为 0） */
  nextGateRequirement() {
    return getBreakthroughRequirement(this.level + 1)
  },
  /** 突破到下一级所需的灵地品阶（无要求为 null） */
  nextLandRequirement() {
    return getLandTierRequirement(this.level + 1)
  },
  /** 当前灵地是否满足下一级的品阶要求 —— 灵地是硬条件 */
  isLandTierSufficient() {
    return isTierAtLeast(this.currentSpiritLand?.tier, this.nextLandRequirement)
  },
  /** 还差多少综合契合度才够下一道门槛 */
  nextGateGap() {
    return Math.max(0, this.nextGateRequirement - this.overallHarmony)
  },
  /**
   * 是否被门槛拦住（契合度不足 **或** 灵地品阶不够）。
   * 刻意做成 getter 而非 state：状态一切换就自动翻转，
   * 不会因为「切了功法却忘了清除标记」而留下脏状态，也不进存档。
   */
  isBreakthroughBlocked() {
    if (!this.isLandTierSufficient) return true
    return this.nextGateRequirement > 0 && this.overallHarmony < this.nextGateRequirement
  },
  /**
   * 提升空间最大的一维（用于 UI 提示「该练什么」）。
   *
   * 旧版的 blockingDimensions 在加权制下**语义失效** —— 某一维低于门槛值
   * 不代表被卡住，别的维度可以补上来。改为按「还能涨多少分」排序。
   */
  bestImprovement() {
    // ⚠ `dimensionBreakdown` 是 **getter（computed 属性）**，不是方法 ——
    //   写成 `this.dimensionBreakdown()` 会去调用那个**数组**，抛
    //   `this.dimensionBreakdown is not a function`。
    //   而这一行只在**被门槛拦住时**才求值（Cultivation.vue 的 `v-if="blockedByGate"`），
    //   所以它一直没被发现：练气一层→二层是普通小境界、没有门槛，
    //   **第一次触发是「练气二层圆满冲击练气三层」** —— 那一刻修炼页整页白屏
    //   （渲染函数抛错 → 路由视图挂不上、菜单高亮也停在原处）。
    return this.dimensionBreakdown
      .map(d => ({ ...d, potential: (1 - d.value) * d.weight }))
      .sort((a, b) => b.potential - a.potential)[0] || null
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
   *
   * 同参**不能升级，只能更换**，且没有「祭炼」机制 —— 契合度完全由
   * 「接近度 × 品阶系数」决定，所以切换没有任何代价，是纯粹的策略选择。
   */
  switchFateItem(id) {
    const items = this.practice.fateItems
    if (!FATE_ITEM_MAP[id] || !items.known[id]) {
      return { success: false, message: '尚未拥有该同参' }
    }
    if (items.active === id) return { success: false, message: '已以此物为同参' }
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
   * 累积功法熟练度（同参已无「祭炼」，不再累积）。
   * 存**原始秒数**而非百分点 —— 调 TUNING 立即生效，不需要迁移存档。
   * 带 seconds 参数是为了让将来的离线结算模块能直接传离线时长复用同一条路径。
   *
   * 注意：本 action **不自己 saveData**，由每秒 tick 末尾统一落盘，
   * 避免每秒写两次 IndexedDB。
   */
  accumulatePractice(seconds = 1) {
    const delta = Math.min(Math.max(Number(seconds) || 0, 0), TUNING.maxSecondsPerTick)
    if (delta <= 0) return
    const art = this.activeQiArtEntry
    if (art) art.practiceSeconds += delta
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

    this.saveData()
    return {
      success: true,
      message: `散功重修完成（第 ${this.practice.scatterCount} 次）—— 重修时将快 ${this.rebirthCultivationMultiplier} 倍`
    }
  }
}
