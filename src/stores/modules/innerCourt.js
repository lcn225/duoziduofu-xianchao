// 模块二 · 内宅 / 多子多福的 store 侧
//
// state 两个顶层键：`innerCourt`（侍妾、体力、流水账）与 `offspring`（子嗣、诞生队列）。
// 键名已对着 12 个模块的全量 state 表逐键核对，无碰撞 ——
// ⚠ index.js 的 assertUnique **只查 getter/action 重名，不查 state 键重名**，
//   撞了是静默覆盖（practice.js 记过这个教训）。新增顶层键必须重跑一遍核对。
// ⚠ 尤其**不要**把 `energy` 提升成顶层键：以后任何模块新增顶层 `energy` 都会
//   静默覆盖内宅体力。永远走 `innerCourt.energy`。
//
// 数值与判定全在 plugins/innerCourt.js（纯函数、可被 node 直接断言）；
// 本文件只做状态、副作用与落盘。

import {
  TUNING,
  GAME_SECONDS_PER_DAY,
  rankName,
  promotedRankOf,
  energyMaxOf,
  pregnancyChanceOf,
  rollPregnancy,
  rollOffspring,
  rollOffspringGender,
  legacyOffspringGender,
  rollTraitList,
  generateMaiden,
  offspringBonusOf,
  sumChildrenBonus,
  playerFateProfile,
  gameDayOf,
  hourOfDay,
  remainingDays,
  normalizePregnancy,
  normalizeWifeOnLoad,
  // ---------- 妻妾生命周期 / 经期（2026-10-19） ----------
  wifeAgeYearsOf,
  wifeLifespanOf,
  isAliveWife,
  isWifeInPeriod,
  wifeCycleStateOf,
  rollPregnancyDays,
  randomOffspringName,
  AUTO_RULES,
  pickAutoWives,
  // ---------- P14 成长 / 繁育 ----------
  bonusCapOf,
  rawChildrenBonus,
  canMarryOf,
  canFightOf,
  coupleHasRoomOf,
  generateSpouse,
  rollSpousePregnancy,
  populationCapReached,
  offspringGrowthOf,
  // ---------- P15.5 洗命 / 血脉遗传 ----------
  rollRootProfile,
  legacySpouseRootCount,
  rootCountName,
  qualityOfRootCount,
  legacyFatesOf,
  // ---------- 子嗣修炼 / 家族工作（2026-10-20）----------
  canCultivateOf,
  advanceCultivationOf,
  legacyCultivationLevelOf,
  offspringRealmNameOf,
  offspringCultivationGainOf,
  offspringLevelCostOf,
  canDoFamilyJobOf,
  FAMILY_JOBS,
  familyJobById,
  familyJobOutputOf,
  EXPEDITION_MODES
} from '../../plugins/innerCourt'
import {
  expeditionModeOf,
  expeditionModeNameOf,
  expeditionMapOf,
  canExpeditionOf,
  isInjuredOf,
  pickExpeditionChildren,
  resolveOffspringExpeditionDay
} from '../../plugins/offspringExpedition'
// 子嗣装备（P36 第 3 步）：纯函数在插件层，store 只搬物品与落盘
import {
  OFFSPRING_EQUIP_SLOTS,
  OFFSPRING_EQUIP_SLOT_NAME,
  canOffspringEquip,
  emptyOffspringEquipment
} from '../../plugins/offspringEquipment'
import { RECIPES, buildCraftedItem } from '../../plugins/arts'
import { getRandomHerb } from '../../plugins/herbs'
import {
  addCurrency,
  formatSecular,
  formatSpiritual,
  formatAmount
} from '../../plugins/currency'
import {
  buildInitialInnerCourt,
  buildInitialOffspring,
  newOffspring,
  OFFSPRING_GENDER_META
} from '../../plugins/innerCourtData'
import { getRealmName } from '../../plugins/realm'
import { emitDing } from '../../plugins/notice'
import { MODES } from '../../plugins/idleMode'

export const state = () => ({
  innerCourt: buildInitialInnerCourt(),
  offspring: buildInitialOffspring()
})

export const getters = {
  // ---------- 时间 ----------
  /** 当前游戏天（从 0 起）。内宅页**不在** PAUSE_ROUTES 里，停留时这个值会随游戏时间推进 */
  gameDay() {
    return gameDayOf(this.clockGameTime)
  },

  // ---------- 体力 ----------
  /** 体力上限 = 145 + 外功加成（《睡觉恢复》§五）。**派生值**，不进 state（存了会随炼体升级漂移） */
  energyMax() {
    return energyMaxOf(this.bodyLevel) + TUNING.energy.fromOffspring + TUNING.energy.fromWives
  },
  /**
   * 当前体力 = 上限 − 已耗。**两侧都 clamp**：
   *   下界 0 = 体力耗尽；上界 = 上限（睡觉补过头、或旧档里比新上限还大的 spentToday 都不会溢出）。
   *
   * ⚠ 字段名 `energy` 是历史包袱（存档键不能动），但它的**语义是体力**，
   *   文档与 UI 一律叫「体力」。新的「精力」（百艺的脑力）在 `dayLoop.focus`，别混。
   */
  energy() {
    const spent = this.innerCourt?.energy?.spentToday || 0
    return Math.min(Math.max(this.energyMax - spent, 0), this.energyMax)
  },
  /** 这点体力花得起吗（不部分执行） */
  canPayStamina(cost) {
    return this.energy >= (Number(cost) || 0)
  },
  canInteractToday() {
    return this.innerCourt?.lastInteractionDay !== this.gameDay
  },

  // ---------- 侍妾 ----------
  /** 全量（含已故）—— 家族树要读；内宅互动请走 livingWives / availableWives */
  wives() {
    return this.innerCourt?.wives || []
  },
  livingWives() {
    return this.wives.filter(isAliveWife)
  },
  availableWives() {
    return this.livingWives.filter(w => w.status === 'idle')
  },
  pregnantWives() {
    return this.livingWives.filter(w => w.status === 'pregnant')
  },
  recoveringWives() {
    return this.livingWives.filter(w => w.status === 'recovering')
  },
  periodWives() {
    return this.livingWives.filter(w => w.status === 'period')
  },
  passedAwayWives() {
    return this.wives.filter(w => w.status === 'passed_away')
  },

  /**
   * 怀孕率预览（设计 §5.5 要求 UI 的怀孕率列**由公式算出，不能手填**）。
   *
   * 2026-10-18 起不再按体力判疲劳 —— 疲劳 −10% 已废除，所以不需要 plannedCost。
   * 第二个参数是 **auto（布尔）**，不是 plannedCost；自动模式要传 true 才会减 5 个百分点。
   * 全族 626 上限时预览直接返回 0，与实际判定（atCap 跳过掷骰）一致。
   */
  wifePregnancyChance() {
    return (wife, auto = false) => {
      if (this.offspringAtPopulationCap) return 0
      if (wife?.status && wife.status !== 'idle') return 0
      return pregnancyChanceOf({
        affinity: wife?.affinity,
        rank: wife?.rank,
        auto,
        ageYears: wifeAgeYearsOf(wife, this.clockGameTime)
      })
    }
  },

  /** 自动模式这一夜会挑哪些人（UI 用来预览「今晚会轮到谁」，不改任何状态） */
  autoNightPlan() {
    return pickAutoWives({
      wives: this.livingWives,
      rule: this.innerCourt?.autoRule,
      energy: this.energy,
      now: this.clockGameTime
    })
  },

  /** 内宅页顶部统计条一次取全 */
  courtSummary() {
    const wives = this.livingWives
    const living = this.livingOffspring
    const rooted = living.filter(c => c.hasRoot).length
    const males = living.filter(c => c.gender !== 'female')
    // 2026-10-20：按代汇总。原来只报「孙辈」，到曾孙辈就说不清了。
    const genCounts = new Map()
    for (const c of living) {
      const gen = Math.max(Math.floor(Number(c.generation)) || 1, 1)
      genCounts.set(gen, (genCounts.get(gen) || 0) + 1)
    }
    const GEN_LABELS = { 1: '子辈', 2: '孙辈', 3: '曾孙辈', 4: '玄孙辈' }
    const generations = [...genCounts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([generation, count]) => ({
        generation,
        count,
        label: GEN_LABELS[generation] || `第 ${generation} 代`
      }))
    return {
      total: wives.length,
      idle: wives.filter(w => w.status === 'idle').length,
      period: wives.filter(w => w.status === 'period').length,
      pregnant: wives.filter(w => w.status === 'pregnant').length,
      recovering: wives.filter(w => w.status === 'recovering').length,
      passedAway: this.passedAwayWives.length,
      offspring: living.length,
      males: males.length,
      females: living.length - males.length,
      fallen: this.offspring.list.filter(c => c.status === 'fallen').length,
      passedAwayOffspring: this.offspring.list.filter(c => c.status === 'passed_away').length,
      rooted,
      rootless: living.length - rooted,
      /** 每代存活人数（子辈/孙辈/曾孙辈/玄孙辈…），UI 顶部逐个展示 */
      generations,
      /** 当前已传到第几代（只算活着的） */
      maxGeneration: generations.length ? generations[generations.length - 1].generation : 0,
      /** @deprecated 用 `generations` —— 只报孙辈会在曾孙辈出现后失真 */
      grandchildren: living.filter(c => (c.generation || 1) > 1).length,
      married: males.filter(c => !!c.spouse).length,
      population: living.length,
      populationCap: TUNING.breeding.populationCap,
      atCap: this.offspringAtPopulationCap,
      bonus: this.offspringCultivationBonus,
      rawBonus: this.offspringRawBonus,
      bonusCap: this.offspringBonusCap
    }
  },

  // ---------- 子嗣 ----------
  /**
   * 活着的子嗣。秘境陨落后条目保留（生母的 childrenIds 还指着它），
   * 但所有展示、加成、出战候选都必须过滤掉 fallen。
   */
  livingOffspring() {
    // 2026-10-19：老死（passed_away）与战死（fallen）都不算活着；
    // 条目保留，家族树要读。
    return (this.offspring?.list || []).filter(
      c => c.status !== 'fallen' && c.status !== 'passed_away'
    )
  },

  pendingBirths() {
    const ids = this.offspring?.pendingBirthIds || []
    if (!ids.length) return []
    const byId = new Map(this.offspring.list.map(c => [c.id, c]))
    return ids.map(id => byId.get(id)).filter(Boolean)
  },

  /**
   * 给列表页用：每行补上现算的加成（bonus 不进 state，只在这里派生）。
   *
   * ⚠ **包含陨落子嗣**（P12.5）：列表要显示「存活 / 陨落」状态列，
   *   陨落者的加成按 0 计（`sumChildrenBonus` 本来也会过滤，这里保持展示口径一致）。
   */
  offspringRows() {
    const profile = playerFateProfile(this.practice)
    return (this.offspring?.list || []).map(c => ({
      ...c,
      bonus: c.status === 'fallen' ? 0 : offspringBonusOf({ child: c, ...profile }),
      // 子嗣修炼 / 岗位的展示派生值（不落盘，随层数与时钟现算）
      realmName: offspringRealmNameOf(c.realmLevel),
      realmMaxed: (Number(c.realmLevel) || 0) >= TUNING.offspringCultivation.maxLevel,
      cultivationNeed: offspringLevelCostOf(Math.max(Number(c.realmLevel) || 1, 1)),
      cultivationGain: offspringCultivationGainOf(c),
      jobName: familyJobById(c.job)?.name || '',
      // 历练配置 / 状态（派生值，不进存档）
      expeditionMode: expeditionModeOf(c),
      expeditionModeName: expeditionModeNameOf(expeditionModeOf(c)),
      expeditionMapName: expeditionMapOf(c)?.name || '—',
      expeditionEligible: canExpeditionOf(c, this.clockGameTime),
      injuryDays: Math.max(Math.floor(Number(c.injuryDays) || 0), 0)
    }))
  },
  rootedOffspring() {
    return this.livingOffspring.filter(c => c.hasRoot)
  },

  /** 可出战：有灵根 + 练气二层（秘境队伍、内宅统计共用） */
  fightReadyOffspring() {
    return this.livingOffspring.filter(c => canFightOf(c, this.clockGameTime))
  },

  /** 正在后台修炼（启蒙以上、未满级） */
  cultivatingOffspring() {
    return this.livingOffspring.filter(
      c =>
        canCultivateOf(c, this.clockGameTime) &&
        (Number(c.realmLevel) || 0) < TUNING.offspringCultivation.maxLevel
    )
  },

  /** 当前能安排家族工作的无灵根子嗣（含已安排的） */
  workableOffspring() {
    return this.livingOffspring.filter(c => canDoFamilyJobOf(c, this.clockGameTime))
  },

  /** 家族工作汇总：人数、六岗分布、每日产出预览（UI 顶部卡片） */
  familyWorkSummary() {
    const now = this.clockGameTime
    const workable = this.workableOffspring
    const workers = workable.filter(c => !!c.job)
    const jobs = FAMILY_JOBS.map(job => ({
      ...job,
      count: workers.filter(c => c.job === job.id).length,
      output: familyJobOutputOf(job)
    }))
    const output = { secular: 0, spiritual: 0, herbs: 0, forgeItems: 0 }
    for (const worker of workers) {
      const out = familyJobOutputOf(familyJobById(worker.job))
      for (const key of Object.keys(output)) output[key] += out[key]
    }
    const parts = []
    if (output.secular) parts.push(formatSecular(output.secular))
    // 预览里 spiritual 可能带 0.5（账房），不能按整数面额拆
    if (output.spiritual) {
      parts.push(
        Number.isInteger(output.spiritual)
          ? formatSpiritual(output.spiritual)
          : `${formatAmount(output.spiritual)} 一阶`
      )
    }
    if (output.herbs) parts.push(`${output.herbs} 灵草`)
    if (output.forgeItems) parts.push(`${output.forgeItems} 法器`)
    return {
      workable: workable.length,
      workers: workers.length,
      jobs,
      output,
      outputText: parts.join('、')
    }
  },

  /**
   * 子嗣历练汇总（子嗣页顶部卡片）。
   *
   * `assigned` 是玩家配置了探索的人数；`active` 是真正能出去且没超出 10 人上限的人数。
   * 配置数 > 上限时，排名靠后的当天按打坐结算（配置保留，等人退出后自动补位）。
   */
  offspringExpeditionSummary() {
    const now = this.clockGameTime
    const living = this.livingOffspring
    const eligible = living.filter(child => canExpeditionOf(child, now))
    const assigned = living.filter(child => expeditionModeOf(child) !== 'cultivate')
    const active = pickExpeditionChildren(this.offspring?.list || [], now)
    const cap = TUNING.offspringExpedition.maxExploring
    return {
      eligible: eligible.length,
      assigned: assigned.length,
      active: active.length,
      cap,
      overCap: Math.max(assigned.length - cap, 0),
      injured: living.filter(isInjuredOf).length,
      modes: EXPEDITION_MODES,
      report: this.offspring?.expeditionReport || null
    }
  },

  /** 全族活着的子嗣数（626 人口上限的分子；陨落者腾出名额） */
  offspringPopulation() {
    return this.livingOffspring.length
  },
  offspringAtPopulationCap() {
    return populationCapReached(this.offspring?.list || [])
  },

  /** 宿主当前大境界对应的软上限 cap（练气 2.0 / 筑基 4.0 / 结丹 7.0 / 元婴 10.0） */
  offspringBonusCap() {
    return bonusCapOf(getRealmName(this.level).tier)
  },

  /** 未套软上限的原始加成之和 —— UI 用来展示「原始 +X% → 实际 +Y%」 */
  offspringRawBonus() {
    if (!this.offspring?.list?.length) return 0
    return rawChildrenBonus(this.livingOffspring, playerFateProfile(this.practice))
  },

  /**
   * ★ 模块二的核心产出：有灵根子嗣提供的修炼加成（**按大境界软上限**，设计 §9.1）。
   *
   *   `总加成 = cap × (1 − e^(−原始/cap))`
   *
   * cap 跟宿主当前大境界走（练气 2.0 / 筑基 4.0 / 结丹 7.0 / 元婴 10.0），
   * 突破后立即重算。硬上限 +200% 已删除（2026-10-18）。
   * practice.js 的 `childrenCultivationBonus` 转读它，再喂给 spiritPerGameHour。
   */
  offspringCultivationBonus() {
    if (!this.offspring?.list?.length) return 0
    return sumChildrenBonus(
      this.livingOffspring,
      playerFateProfile(this.practice),
      this.offspringBonusCap
    )
  },

  // ---------- 侍妾池 ----------
  /** 内宅还能再容纳多少人（郑家宝阁的侍妾池按它钳制购买次数与扣费） */
  maidenDrawCapacity() {
    // 已故妻妾不占名额（数组里保留给家族树，但不能再挡着买人）
    return Math.max(TUNING.gacha.householdCap - this.livingWives.length, 0)
  }
}

export const actions = {
  /**
   * 往内宅流水账里记一条。
   *
   * **按时间正序追加**（最新的在最后），UI 负责自动滚到底 —— 这是「流水」的观感：
   * 内宅不暂停时间，玩家待在这一页就能看着记录一行行往下长。
   * 超长时从**头部**裁掉最旧的。
   */
  pushCourtLog(text) {
    if (!this.innerCourt.interactionLog) this.innerCourt.interactionLog = []
    const log = this.innerCourt.interactionLog
    log.push({ day: this.gameDay, text })
    const limit = TUNING.night.logLimit
    if (log.length > limit) log.splice(0, log.length - limit)
  },

  /** 切换 手动 / 自动 模式 */
  setNightMode(mode) {
    if (mode !== 'auto' && mode !== 'manual') return
    this.innerCourt.nightMode = mode
    this.saveData()
  },

  /** 切换自动模式的挑人规则 */
  setAutoRule(rule) {
    if (!AUTO_RULES.includes(rule)) return
    this.innerCourt.autoRule = rule
    this.saveData()
  },

  /**
   * 游戏时钟 onHour 钩子的内宅部分 —— 到「晚间」（默认第 20 小时）就把自动模式跑起来。
   *
   * 用 hour 钩子而不是 day 钩子：设计 §5.1 写的是「进入晚间（游戏时间 20:00）」。
   * gameClock 的 checkBoundary 会逐个补触发掉帧跨过的边界，所以哪怕一次 tick
   * 推进了 1.25 个游戏小时（MAX_TICK_REAL_SECONDS × SECONDS_PER_GAME_HOUR 的钳制），
   * 20 点这一次也不会漏。
   */
  onInnerCourtHour(gameTime) {
    // 不在镇守时晚间互动停止（《三大挂机》§1.1）。clock.js 的 hour 钩子也挡了一道，
    // 这里是第二道 —— 将来若有人绕过时钟直接调这个 action，也不能让互动偷偷跑。
    if (this.idleMode !== MODES.GARRISON) return
    // 养伤期间不自动留宿（人还躺着）
    if (this.isInjured) return
    if (hourOfDay(gameTime) !== TUNING.night.eveningHour) return
    if (this.innerCourt?.nightMode !== 'auto') return
    // ⚠ 白天循环接管夜晚后，20:00 的自动留宿**不该再插手**：
    //   「桂冈的一天」的互动阶段由 dayLoop 驱动，两边都调 interactEvening 会变成一晚两次。
    //   dayLoop 还没上线时这个守卫是空操作，不影响旧行为。
    if (this.dayLoop && this.dayLoop.phase !== 'idle') return
    this.runAutoNight()
  },

  /**
   * 自动留宿一晚：按规则挑人，挑到「预算用完但还留得住 30 点体力」为止。
   * 返回与 interactEvening 相同的结果；没得可挑时返回 success:false 且**不占用当天**。
   */
  runAutoNight() {
    if (!this.canInteractToday) return { success: false, message: '今日已过晚间', results: [] }
    const ids = pickAutoWives({
      wives: this.livingWives,
      rule: this.innerCourt.autoRule,
      energy: this.energy,
      now: this.clockGameTime
    })
    if (!ids.length) return { success: false, message: '体力不足以留宿', results: [] }
    return this.interactEvening(ids, { auto: true })
  },

  /**
   * 晚间互动 —— 每晚（每游戏天）一次，当场判孕（设计 §5.1 的核心爽点）。
   *
   * ⚠ 本 action **自己 saveData()**：互动可能发生在没有 tick 的时刻
   *   （内宅页不暂停时间，但 dayLoop 的 evening / 暂停中的手动互动都可能没有后续 tick），
   *   不能依赖每秒落盘（core.gainSpirit 是唯一的每秒落盘点）。
   *   漏掉这一句，玩家的互动结果会在刷新后消失。
   *
   * @param wifeIds 选中的侍妾 id 数组
   * @param opts.auto 自动模式（-5% 怀孕率，设计 §5.2）
   * @returns {{success, message, results}} results 逐人给出「是否当场有喜」
   */
  interactEvening(wifeIds = [], { auto = false } = {}) {
    if (!this.canInteractToday) {
      return { success: false, message: '今日已过晚间，明日请早', results: [] }
    }

    const now = this.clockGameTime
    const picked = this.wives.filter(
      w => wifeIds.includes(w.id) && w.status === 'idle' && !isWifeInPeriod(w, now)
    )
    if (!picked.length) {
      return {
        success: false,
        message: '没有可选侍妾（已孕、产后恢复、经期中的不可互动）',
        results: []
      }
    }

    const cost = picked.length * TUNING.energy.perInteraction
    if (this.energy < cost) {
      return { success: false, message: `体力不足（需 ${cost}，余 ${this.energy}）`, results: [] }
    }

    this.spendStamina(cost)
    // 2026-10-18：疲劳 −10% 已废除，受孕率只看「正向部分 ×0.6 − 自动 5%」
    // 全族已达 626 → 仍可留宿（流水/将来的好感），但**不受孕**（设计 §7.4）
    const atCap = this.offspringAtPopulationCap

    const results = []
    for (const wife of picked) {
      const chance = atCap
        ? 0
        : pregnancyChanceOf({
            affinity: wife.affinity,
            rank: wife.rank,
            auto,
            ageYears: wifeAgeYearsOf(wife, now)
          })
      // 保底已废除（2026-10-17 决议 / 2026-10-18 落地）：atCap 时直接跳过掷骰
      const hit = atCap ? false : rollPregnancy({ chance })

      wife.interactionCount += 1
      wife.lastInteractionTime = now
      if (TUNING.affinityPerInteraction) {
        wife.affinity = Math.min(100, wife.affinity + TUNING.affinityPerInteraction)
      }

      if (hit) {
        wife.status = 'pregnant'
        // 本次孕期在受孕时锁定（80–100 天），不再用固定 90 天
        wife.pregnancyDays = rollPregnancyDays()
        wife.statusEndTime = now + wife.pregnancyDays * GAME_SECONDS_PER_DAY
        wife.pregnancyStartTime = now
        // ⚠ 这里数的是「有喜」（设计 §2.1 的 P3→P4 晋升条件），不是「诞下」
        wife.pregnancyCount += 1
      }

      results.push({
        id: wife.id,
        name: wife.name,
        rank: wife.rank,
        rankName: rankName(wife.rank),
        pregnant: hit,
        chance
      })
    }

    this.innerCourt.lastInteractionDay = this.gameDay
    const hitCount = results.filter(r => r.pregnant).length
    const who = auto ? '自动留宿' : '留宿'
    // 流水左侧已有一列显示「第 N 天」，正文里不再重复
    this.pushCourtLog(
      hitCount
        ? `夜间${who} ${picked.length} 人 —— ${results.filter(r => r.pregnant).map(r => r.name).join('、')}有喜`
        : `夜间${who} ${picked.length} 人 —— 皆无所出${atCap ? '（子孙已达上限）' : ''}`
    )

    // 「叮」发生在**有喜的当晚**，不是诞生时。
    // 此时 status 已经写成 pregnant，所以 pregnantWives 里包含刚有喜的侍妾。
    if (hitCount) {
      emitDing({
        at: now,
        count: hitCount,
        names: this.pregnantWives.map(w => w.name)
      })
    }

    this.saveData() // ⚠ 不可省，见上方注释

    return {
      success: true,
      message: hitCount ? `喜讯：${hitCount} 人有喜` : '今夜无讯',
      results
    }
  },

  /**
   * 迎入凡女（郑家宝阁的侍妾池调用）。
   *
   * ⚠ **不扣钱** —— 扣费统一留在 `views/Shop.vue` 一个点，
   *   本 action 再扣一次就是双扣。调用方要按**钳制后的实际人数**计费。
   * 这里再钳一次人数是为了防 UI 漏改。
   */
  recruitMaidens(count = 1) {
    const room = this.maidenDrawCapacity
    const n = Math.max(Math.min(Math.floor(Number(count) || 0), room), 0)
    if (n <= 0) return { success: false, maidens: [], message: '内宅已满' }

    const maidens = []
    for (let i = 0; i < n; i++) {
      const maiden = generateMaiden({
        seq: this.innerCourt.nextWifeSeq++,
        now: this.clockGameTime
      })
      this.innerCourt.wives.push(maiden)
      maidens.push(maiden)
    }
    this.pushCourtLog(`迎入 ${n} 位姑娘`)
    this.saveData()
    return { success: true, maidens, message: `迎入 ${n} 位姑娘` }
  },

  /**
   * 花体力 —— **全仓库唯一的一处体力扣减规则**（clamp 到上限即止）。
   *
   * 「花不出去就花不出去」：`spentToday` 钳在 `energyMax` 就等价于「体力归零」，
   * 设计 §五 场景 D（全天炼体 170 > 上限 145 → 白天结束 0）自然成立，
   * 而且睡觉只需要补回**真正用掉的**，不会被那 170 多收账。
   *
   * ⚠ 不在这里 saveData()：调用方（dayLoop 的每 tick 结算 / interactEvening）
   *   自己负责落盘 —— 见 CLAUDE.md「坑 §11」。
   */
  spendStamina(amount) {
    const court = this.innerCourt
    if (!court) return
    const a = Math.max(Number(amount) || 0, 0)
    const before = court.energy.spentToday
    court.energy.spentToday = Math.min(before + a, this.energyMax)
    // 记**实际生效量**（夹过上限之后），否则「需求 170、上限 145」会报成 170
    this.debugNoteStamina(-(court.energy.spentToday - before))
  },

  /** 回体力（睡觉）。钳在 0 即止 —— 睡满就停在「已耗 0」。同 spendStamina，不落盘。 */
  recoverStamina(amount) {
    const court = this.innerCourt
    if (!court) return
    const a = Math.max(Number(amount) || 0, 0)
    const before = court.energy.spentToday
    court.energy.spentToday = Math.max(before - a, 0)
    // 同上：睡满后多出来的恢复量不该记进账
    this.debugNoteStamina(before - court.energy.spentToday)
  },

  /**
   * 游戏时钟的 onDay 钩子 —— 内宅每天唯一入口。
   *
   * ⚠ **必须自己 saveData()**：诞生结算完成后时钟会立刻切到 paused_event，
   *   此后不再有 tick，也就没有 core.gainSpirit 的每秒落盘。漏掉它，
   *   这一天的诞生结果**永远不会进存档**，刷新即丢 —— 本模块最隐蔽的数据丢失路径。
   */
  advanceInnerCourtDay(gameTime) {
    const court = this.innerCourt
    const fatherTier = getRealmName(this.level).tier

    // ⚠ 早退条件**不能**写成 `if (!court?.wives?.length) return`：
    //   P14 之后子嗣繁育也挂在这个日钩子上，没侍妾（理论上不会）不代表没有孙辈要生。
    if (court?.wives?.length) {
      for (const wife of court.wives) {
        if (wife.status === 'passed_away') continue
        const now = Number(gameTime) || 0
        const end = wife.statusEndTime || 0
        const age = wifeAgeYearsOf(wife, now)
        // 女修妻妾（P9+）寿元按境界另算；位阶运行时晋升也能立刻生效
        const lifespan = wifeLifespanOf(wife)

        // 老死：怀孕/产后中顺延，避免诞生队列出现半死状态
        if (
          age != null &&
          age >= lifespan &&
          wife.status !== 'pregnant' &&
          wife.status !== 'recovering'
        ) {
          wife.status = 'passed_away'
          wife.statusEndTime = null
          wife.passedAwayAt = now
          this.pushCourtLog(`${wife.name} 寿终，享年 ${Math.floor(age)} 岁`)
          continue
        }

        if (wife.status === 'pregnant' && now >= end) {
          this.deliverOffspring(wife, now, fatherTier)
          continue
        }
        if (wife.status === 'recovering' && now >= end) {
          wife.status = 'idle'
          wife.statusEndTime = null
          wife.recoveryStartTime = null
          // 下面继续判经期，不要 continue
        }
        if (wife.status === 'period' && now >= end) {
          wife.status = 'idle'
          wife.statusEndTime = null
          wife.periodStartTime = null
        }
        if (wife.status === 'idle') {
          const cycle = wifeCycleStateOf(wife, now)
          if (cycle.inPeriod) {
            wife.status = 'period'
            wife.statusEndTime = cycle.periodEndTime
            wife.periodStartTime = cycle.periodStartTime
            continue
          }
          // 位阶晋升：严格逐级，且**每游戏天最多升一级**（见 innerCourt.promotedRankOf 的注释）
          const next = promotedRankOf(wife)
          if (next) {
            wife.rank = next
            this.pushCourtLog(`${wife.name} 晋为${rankName(next)}`)
          }
        }
      }
    }

    // 2026-10-20：子嗣历练（设计 §七）—— 先结算出去的人，再让剩下的人纯打坐。
    // 出去的人（含养伤中）由历练统一处理修为，不能再按 100% 打坐领一次。
    const expedition = this.advanceOffspringExpedition(gameTime)
    this.advanceOffspringCultivation(gameTime, expedition.skipIds)

    // P14：子嗣成长 → 婚配 → 受孕 → 添孙（设计 §7.4）
    this.advanceOffspringBreeding(gameTime)

    // 2026-10-20：无灵根子嗣的家族工作（设计 §8，MVP 6 岗）
    this.advanceFamilyJobs()

    // ⚠ 这里**过去**有一行「体力每游戏天回满」（`court.energy.spentToday = 0`），
    //   自「桂冈的一天」起已删除：体力改由**睡觉**回补（上限/4 每小时），
    //   由 dayLoop 的切片结算驱动。留着它会在每天 00:00 白送一次满体力，
    //   把「白天多干活 → 晚上互动少」这条核心取舍直接抹平。

    // 诞生队列非空 → 冻结时间弹窗。**一轮结算只调一次**，不要每生一个调一次。
    // ⚠ 先落盘、再冻结（P12.3）：弹窗一出现，时钟就停了，之后没有 tick 兜底；
    //   顺序反了会出现「弹窗已经能点，但诞生结果还没写进 IndexedDB」的窗口。
    const needsBirthModal = this.offspring.pendingBirthIds.length > 0
    this.saveData() // ⚠ 不可省，见上方注释
    if (needsBirthModal) this.pauseClockForEvent('birth')
  },

  /**
   * **子嗣繁育的每日推进**（P14，设计 §7.4）—— 由 advanceInnerCourtDay 调用。
   *
   * 每个游戏天对**每名活着的儿子**走一遍状态机：
   *   未婚 + 到青年 → 自动婚配（人口满则停）
   *   已婚 + 空闲   → 掷一次受孕（10% × 配偶怀孕系数；无疲劳、无保底）
   *   已孕 + 到期   → 生一名孙辈，转入产后恢复 10 天
   *   恢复 + 到期   → 回到空闲
   *
   * ⚠ **第一版只做儿子线**：女儿到青年外嫁，她的子女不计入子孙（Y 染，§6.0），
   *   所以这里直接跳过女性子嗣、不给她们建配偶。
   * ⚠ **孙辈不进诞生弹窗**（用户 2026-10-18 拍板）：弹窗会冻结时钟，
   *   626 人规模下一天可能生好几个，挂机会被反复打断。孙辈只写内宅流水。
   * ⚠ 人口上限用**本地计数**而不是 getter：同一轮里刚生下来的孙辈
   *   必须立刻占掉名额，不能让后面几位还按旧人数去娶亲/受孕。
   */
  advanceOffspringBreeding(gameTime) {
    // ⚠ 先**快照**：deliverGrandchild 会往 this.offspring.list 里 push，
    //   直接 for...of 原数组会把刚出生的婴儿也遍历一遍（虽然后面被 canMarryOf 挡掉）。
    const list = [...(this.offspring?.list || [])]
    if (!list.length) return { born: 0, married: 0 }

    const now = Number(gameTime) || 0
    const B = TUNING.breeding
    let population = list.filter(c => c.status !== 'fallen').length
    let married = 0
    let born = 0

    for (const child of list) {
      if (child.status === 'fallen') continue
      if (child.gender !== 'male') continue
      if (!canMarryOf(child, now)) continue

      // 1) 孕育中 → 到日产子（产完立刻转产后恢复）
      //    ⚠ **已怀的照常出生**（设计 §7.4）：人口上限只拦新的婚配/受孕，
      //      不拦已经怀上的。所以这里故意不再判 population < cap。
      if (child.spouseStatus === 'pregnant') {
        if (now < (child.spouseStatusEndTime || 0)) continue
        if (this.deliverGrandchild(child, now)) {
          population += 1
          born += 1
        }
        child.spouseStatus = 'recovering'
        child.spouseStatusEndTime = now + TUNING.pregnancy.recoveryDays * GAME_SECONDS_PER_DAY
        child.spousePregnancyStartTime = null
        continue
      }

      // 2) 产后恢复 → 到期归位
      if (child.spouseStatus === 'recovering') {
        if (now >= (child.spouseStatusEndTime || 0)) {
          child.spouseStatus = null
          child.spouseStatusEndTime = null
        }
        continue
      }

      // 3) 未婚 → 到青年自动婚配。人口已满就不再娶（娶了也生不了）
      if (!child.spouse) {
        if (population >= B.populationCap) continue
        child.spouse = generateSpouse({ child })
        married += 1
        continue
      }

      // 4) 已婚空闲 → 每日判孕（每对 6 胎、全族 626 两道闸）
      if (!coupleHasRoomOf(child)) continue
      if (population >= B.populationCap) continue
      if (rollSpousePregnancy({ spouse: child.spouse })) {
        child.spouseStatus = 'pregnant'
        child.spousePregnancyStartTime = now
        child.spouseStatusEndTime = now + TUNING.pregnancy.days * GAME_SECONDS_PER_DAY
      }
    }

    // 聚合写法：626 人规模下逐条写流水会把 50 条上限瞬间刷满
    if (married) this.pushCourtLog(`${married} 名子嗣成婚`)
    if (born) this.pushCourtLog(`本日添孙 ${born} 人`)
    return { born, married }
  },

  /**
   * **子嗣修炼每日推进**（设计 §15.2，2026-10-20）—— 挂在 advanceInnerCourtDay 上。
   *
   * 有灵根子嗣到启蒙后自动打坐，每天结算一次；练气二层起可进秘境出战。
   * 626 人规模下不逐条写流水：只在有人突破时聚合一条。
   *
   * `skipIds` = 今天由「子嗣历练」结算过的人（含养伤中）。他们不能再按 100%
   * 打坐领一次；超出 10 人上限、没能出去的配置者不在其中，照常纯打坐。
   */
  advanceOffspringCultivation(gameTime, skipIds = null) {
    const list = this.offspring?.list || []
    if (!list.length) return { trained: 0, breakthroughs: 0, fightReady: 0 }

    const now = Number(gameTime) || 0
    let trained = 0
    let breakthroughs = 0
    let fightReady = 0

    for (const child of list) {
      if (skipIds?.has?.(child.id)) continue
      if (!canCultivateOf(child, now)) continue
      const wasFightReady =
        (Number(child.realmLevel) || 0) >= TUNING.offspringCultivation.fightLevel
      const next = advanceCultivationOf(child)
      if (next.gained > 0) trained += 1

      // advanceCultivationOf 对 level 0 的老档按「练气一层」起算
      child.realmLevel = next.level
      child.cultivation = next.progress

      if (next.leveled) {
        breakthroughs += 1
        if (!wasFightReady && next.level >= TUNING.offspringCultivation.fightLevel) {
          fightReady += 1
        }
      }
    }

    if (breakthroughs) {
      this.pushCourtLog(
        `${breakthroughs} 名子嗣修为精进` +
          (fightReady ? `，其中 ${fightReady} 人晋为练气二层，可入秘境出战` : '')
      )
    }
    return { trained, breakthroughs, fightReady }
  },

  /**
   * **子嗣历练每日结算**（《探索系统》§七，2026-10-20）—— 挂在 advanceInnerCourtDay 上。
   *
   * 只结算「真正能出去」的前 10 人（`pickExpeditionChildren`，境界高者优先）。
   * 每人每天一次日结，不写流水账；全族只往内宅日志写一条聚合摘要。
   *
   * ⚠ 本 action **不自己 saveData()**：上层 advanceInnerCourtDay 统一落盘。
   * ⚠ 奖励走 `applyExplorationReward`（探索模块的同一套落账），传 `{ save:false }`。
   *
   * @returns {{ assigned:number, skipIds:Set, totals?:object }}
   */
  advanceOffspringExpedition(gameTime) {
    const list = this.offspring?.list || []
    const now = Number(gameTime) || 0
    const skipIds = new Set()

    // 没人配置探索：清掉昨天的报表，卡片显示「今日无人在外」
    const selected = list.length ? pickExpeditionChildren(list, now) : []
    const selectedIds = new Set(selected.map(child => child.id))

    // 没被选中的人（没配置 / 超出 10 人上限 / 门槛失效）也要养伤倒计时，
    // 否则切回「仅打坐」后「养伤中」会永久挂在列表里。
    for (const child of list) {
      if (selectedIds.has(child.id)) continue
      const days = Math.max(Math.floor(Number(child.injuryDays) || 0), 0)
      if (days > 0) child.injuryDays = days - 1
    }

    if (!selected.length) {
      if (this.offspring) this.offspring.expeditionReport = null
      return { assigned: 0, skipIds }
    }

    const totals = {
      children: selected.length,
      events: 0,
      battles: 0,
      wins: 0,
      losses: 0,
      gathers: 0,
      pickups: 0,
      stones: 0,
      items: 0,
      fragments: 0,
      cultivation: 0,
      injured: 0,
      newlyInjured: 0,
      levelUps: 0
    }
    const perChild = []

    for (const child of selected) {
      const { result, patch } = resolveOffspringExpeditionDay({ child, now })
      child.expeditionMode = patch.expeditionMode
      child.injuryDays = patch.injuryDays
      child.expeditionCredit = patch.expeditionCredit
      child.realmLevel = patch.realmLevel
      child.cultivation = patch.cultivation

      // 灵石/材料/残页直接进现有资源与背包（探索模块同一套落账）
      for (const reward of result.rewards) {
        this.applyExplorationReward(reward, { save: false })
      }

      totals.events += result.events
      totals.battles += result.battles
      totals.wins += result.wins
      totals.losses += result.losses
      totals.gathers += result.gathers
      totals.pickups += result.pickups
      totals.stones += result.stones
      totals.items += result.items
      totals.fragments += result.fragments
      totals.cultivation += result.cultivationGain
      if (result.injured) totals.injured += 1
      if (result.injuredNew) totals.newlyInjured += 1
      if (result.leveled) totals.levelUps += 1

      perChild.push({
        id: child.id,
        name: child.name,
        mode: result.mode,
        modeName: expeditionModeNameOf(result.mode),
        mapName: result.mapName,
        injured: result.injured,
        injuredNew: result.injuredNew,
        events: result.events,
        battles: result.battles,
        wins: result.wins,
        losses: result.losses,
        gathers: result.gathers,
        pickups: result.pickups,
        stones: result.stones,
        items: result.items,
        fragments: result.fragments,
        cultivationGain: result.cultivationGain,
        levelFrom: result.levelFrom,
        level: result.level,
        leveled: result.leveled,
        maxed: result.maxed
      })
      skipIds.add(child.id)
    }

    this.offspring.expeditionReport = {
      day: gameDayOf(now),
      at: now,
      totals,
      perChild
    }

    // 聚合摘要（626 人规模下不逐人刷屏）
    const actions = []
    if (totals.battles) actions.push(`战斗 ${totals.wins} 胜 ${totals.losses} 负`)
    if (totals.gathers) actions.push(`采集 ${totals.gathers}`)
    if (totals.pickups) actions.push(`拾遗 ${totals.pickups}`)
    if (totals.levelUps) actions.push(`${totals.levelUps} 人突破`)
    const income = []
    if (totals.stones) income.push(`灵石 +${formatSpiritual(totals.stones)}`)
    if (totals.items) income.push(`材料 ${totals.items}`)
    if (totals.fragments) income.push(`残页 +${totals.fragments}`)
    if (totals.cultivation > 0) income.push(`修为 +${formatAmount(totals.cultivation)}`)
    let text = `子嗣历练：${selected.length} 人在外`
    if (actions.length) text += `，${actions.join('、')}`
    if (income.length) text += `；${income.join('、')}`
    if (totals.newlyInjured) text += `；${totals.newlyInjured} 人战败养伤`
    this.pushCourtLog(text)

    return { assigned: selected.length, skipIds, totals }
  },

  /**
   * 设置子嗣历练配置（仅打坐 / 仅探索 / 综合 50/50）。
   *
   * 门槛与出战一致（有灵根 + 练气二层）；同时历练最多 10 人。
   * 已在外的人切档会立即生效，下一次日结按新档计算。
   */
  setOffspringExpeditionMode(childId, mode) {
    const next = EXPEDITION_MODES.find(item => item.id === mode)
    if (!next) return { ok: false, message: '未知的历练配置' }

    const child = (this.offspring?.list || []).find(item => item.id === childId)
    if (!child) return { ok: false, message: '子嗣不存在' }
    if (child.status === 'fallen' || child.status === 'passed_away') {
      return { ok: false, message: '该子嗣已不在' }
    }

    if (next.id !== 'cultivate') {
      if (!canExpeditionOf(child, this.clockGameTime)) {
        return { ok: false, message: '需有灵根且练气二层才能历练' }
      }
      const cap = TUNING.offspringExpedition.maxExploring
      const others = (this.offspring?.list || []).filter(
        item =>
          item.id !== childId &&
          item.status !== 'fallen' &&
          item.status !== 'passed_away' &&
          expeditionModeOf(item) !== 'cultivate' &&
          canExpeditionOf(item, this.clockGameTime)
      ).length
      if (others >= cap) {
        return { ok: false, message: `最多 ${cap} 名子嗣同时历练，请先撤回他人` }
      }
    }

    child.expeditionMode = next.id
    this.saveData()
    return { ok: true, mode: next.id }
  },

  /**
   * **家族工作每日结算**（设计 §8，2026-10-20 MVP）—— 挂在 advanceInnerCourtDay 上。
   *
   * 只结算 6 个经济岗；产出映射到现有资源。`spiritual` 允许小数（账房 0.5/天），
   * 用每名子嗣的 `jobProgress` 存余数，凑够 1 才入账 —— 不把 0.5 灵石塞进货币。
   *
   * ⚠ 本 action **不自己 saveData()**：上层 advanceInnerCourtDay 统一落盘。
   */
  advanceFamilyJobs() {
    const list = this.offspring?.list || []
    if (!list.length) return { workers: 0, output: null }

    const now = this.clockGameTime
    const total = { secular: 0, spiritual: 0, herbs: 0, forgeItems: 0 }
    let workers = 0

    for (const child of list) {
      if (!child.job) continue
      const job = familyJobById(child.job)
      // 岗位失效（外嫁/陨落/改门槛/脏数据）→ 自动撤下
      if (!job || !canDoFamilyJobOf(child, now)) {
        child.job = null
        child.jobProgress = 0
        continue
      }

      const out = familyJobOutputOf(job)
      const spiritual = (Number(child.jobProgress) || 0) + out.spiritual
      const whole = Math.floor(spiritual)
      child.jobProgress = spiritual - whole

      total.secular += out.secular
      total.spiritual += whole
      total.herbs += out.herbs
      total.forgeItems += out.forgeItems
      workers += 1
    }

    if (!workers) return { workers: 0, output: total }

    if (total.secular) this.currency = addCurrency(this.currency, 'secular', total.secular)
    if (total.spiritual) this.currency = addCurrency(this.currency, 'spiritual', total.spiritual)
    for (let i = 0; i < total.herbs; i += 1) {
      const herb = getRandomHerb()
      if (herb) this.herbs.push(herb)
    }
    for (let i = 0; i < total.forgeItems; i += 1) {
      const recipe = RECIPES[Math.floor(Math.random() * RECIPES.length)]
      const item = buildCraftedItem(recipe, { seq: i + 1 })
      if (item) {
        this.items.push(item)
        // inventory 的 state 里没有 itemsFound（成就读取时也做了 || 0 兜底），
        // 这里显式用数字累加，避免 undefined++ 变成 NaN 后一路写进存档。
        this.itemsFound = (Number(this.itemsFound) || 0) + 1
      }
    }

    const parts = []
    if (total.secular) parts.push(formatSecular(total.secular))
    if (total.spiritual) parts.push(formatSpiritual(total.spiritual))
    if (total.herbs) parts.push(`${total.herbs} 灵草`)
    if (total.forgeItems) parts.push(`${total.forgeItems} 法器`)
    if (parts.length) {
      this.pushCourtLog(`家族产业：${workers} 人当值，入${parts.join('、')}`)
    }
    return { workers, output: total }
  },

  /**
   * 安排 / 撤下家族工作岗位。
   * @param {string} id 子嗣 id
   * @param {string|null} jobId 岗位 id；null = 撤下
   */
  assignOffspringJob(id, jobId) {
    const child = this.offspring?.list?.find(c => c.id === id)
    if (!child) return { ok: false, message: '子嗣不存在' }

    if (!jobId) {
      child.job = null
      child.jobProgress = 0
      this.saveData()
      return { ok: true, job: null }
    }

    const job = familyJobById(jobId)
    if (!job) return { ok: false, message: '没有这个岗位' }
    if (!canDoFamilyJobOf(child, this.clockGameTime)) {
      return { ok: false, message: '该子嗣不能做工（需无灵根、启蒙以上、未外嫁）' }
    }
    if (child.job !== jobId) child.jobProgress = 0
    child.job = jobId
    this.saveData()
    return { ok: true, job }
  },

  /**
   * 给子嗣穿装备（P36 第 3 步，子嗣 4 槽里能进战力的 攻 / 防 两槽）。
   *
   * 搬法与桂冈 `equipArtifact` 一致：**整件实例从背包挪到子嗣身上**
   * （`child.equipment[slot]`），所以一键售出天然卖不到身上这件 ——
   * `items` 里已经没有它了。换下的旧件回背包，**不自动卖**。
   */
  equipOffspringItem(childId, itemId) {
    const child = this.offspring?.list?.find(c => c.id === childId)
    if (!child) return { ok: false, message: '子嗣不存在' }
    if (child.status === 'fallen' || child.status === 'passed_away') {
      return { ok: false, message: '子嗣已不在，只能卸下装备' }
    }
    const item = this.items.find(entry => entry.id === itemId)
    if (!item) return { ok: false, message: '背包里没有这件物品' }
    const check = canOffspringEquip(child, item)
    if (!check.ok) return { ok: false, message: check.reason }
    const slot = check.slot
    if (!child.equipment || typeof child.equipment !== 'object') {
      child.equipment = emptyOffspringEquipment()
    }
    if (child.equipment[slot]) this.items.push(child.equipment[slot])
    // 先补旧件再删新件：push 只改变尾部，不影响的 findIndex 结果，但顺序读起来更稳
    const index = this.items.findIndex(entry => entry.id === itemId)
    if (index !== -1) this.items.splice(index, 1)
    child.equipment[slot] = item
    this.saveData()
    return { ok: true, slot, item }
  },

  /**
   * 卸下子嗣装备，回背包。
   * **陨落 / 已故的子嗣也能卸** —— 否则装备会永久锁在名单里，没有任何出口。
   */
  unequipOffspringItem(childId, slot) {
    const child = this.offspring?.list?.find(c => c.id === childId)
    if (!child) return { ok: false, message: '子嗣不存在' }
    if (!OFFSPRING_EQUIP_SLOTS.includes(slot)) return { ok: false, message: '没有这个槽位' }
    const item = child.equipment?.[slot]
    if (!item) return { ok: false, message: '这个槽是空的' }
    this.items.push(item)
    child.equipment[slot] = null
    this.saveData()
    return { ok: true, item, slotName: OFFSPRING_EQUIP_SLOT_NAME[slot] }
  },

  /** 一键把没安排的无灵根子嗣按人数均衡地填进 6 个岗位 */
  autoAssignFamilyJobs() {
    const now = this.clockGameTime
    const idle = (this.offspring?.list || []).filter(
      c => !c.job && canDoFamilyJobOf(c, now)
    )
    if (!idle.length) return { ok: true, count: 0, message: '没有待安排的无灵根子嗣' }

    const counts = Object.fromEntries(FAMILY_JOBS.map(job => [job.id, 0]))
    for (const child of this.offspring.list) {
      if (child.job && counts[child.job] != null) counts[child.job] += 1
    }

    for (const child of idle) {
      const job = FAMILY_JOBS.reduce(
        (best, job) => (counts[job.id] < counts[best.id] ? job : best),
        FAMILY_JOBS[0]
      )
      child.job = job.id
      child.jobProgress = 0
      counts[job.id] += 1
    }
    this.saveData()
    return { ok: true, count: idle.length }
  },

  /** 撤下所有人的岗位（重新分配前用） */
  clearAllFamilyJobs() {
    let count = 0
    for (const child of this.offspring?.list || []) {
      if (child.job) {
        child.job = null
        child.jobProgress = 0
        count += 1
      }
    }
    if (count) this.saveData()
    return { ok: true, count }
  },

  /**
   * 结算一名**孙辈**的诞生（由 advanceOffspringBreeding 调用）。
   *
   * 与 `deliverOffspring`（桂冈亲生）的差别：
   *   · 不写 pendingBirthIds —— 孙辈不弹诞生窗，只在流水里记；
   *   · 生母是儿子的配偶，不是内宅侍妾，所以不碰 `innerCourt.wives`；
   *   · 父方身份系数用**儿子自己**的境界（有灵根按练气 qi、无灵根按凡人）。
   *     ⚠ 儿子的境界没有建模，这是占位口径，等子嗣修炼系统上线再换。
   *
   * @returns 新子嗣对象；不满足条件（没配偶 / 满 6 胎 / 人口满）时返回 null
   */
  deliverGrandchild(son, gameTime) {
    const off = this.offspring
    const spouse = son?.spouse
    if (!spouse) return null
    if (!coupleHasRoomOf(son)) return null
    // ⚠ 这里**不判 626 上限**：已怀的照常出生（§7.4）。上限只在「婚配 / 新受孕」两道闸上。

    const roll = rollOffspring({
      rank: spouse.rank,
      fatherTier: son.hasRoot ? 'qi' : 'mortal',
      totalDraws: off.gacha.totalDraws,
      pityNoRoot: off.gacha.pityNoRoot,
      rootBonus: this.shrineRootChanceBonus,
      // P15.5(b)：血脉遗传只看子嗣繁育的父母 —— 母亲就是儿子的配偶
      motherRootCount: spouse.rootCount || 0
    })
    off.gacha.totalDraws += 1
    off.gacha.pityNoRoot = roll.hasRoot ? 0 : off.gacha.pityNoRoot + 1

    const seq = off.nextChildSeq
    const gender = rollOffspringGender()
    const child = newOffspring({
      id: `c_${String(seq).padStart(4, '0')}`,
      name: randomOffspringName(son.name, {
        existing: off.list.map(c => c.name),
        gender
      }),
      gender,
      generation: (Number(son.generation) || 1) + 1,
      lineage: 'y',
      fatherId: son.id,
      fatherName: son.name,
      motherId: '',
      motherName: spouse.name,
      motherRankAtBirth: spouse.rank,
      birthTime: gameTime,
      ...roll
    })
    off.list.push(child)
    off.nextChildSeq += 1

    if (!Array.isArray(son.childrenIds)) son.childrenIds = []
    son.childrenIds.push(child.id)
    return child
  },

  /**
   * 读档自愈：
   * 1. 旧档子嗣没有 `gender`（P12.6）→ 按 id+name 稳定补男/女；
   * 2. 旧档的 270/30 天孕育/恢复 → 按 90/10 等比折算（只命中剩余超过当前完整周期的记录）；
   * 3. 逾期未结算的孕育/恢复当场结生/恢复。
   *
   * ⚠ 不直接调 advanceInnerCourtDay：那个函数还会做位阶晋升，读档重复调用会连升。
   * 返回是否有改动；由 persistence.initializePlayer 决定是否落盘。
   */
  normalizeInnerCourtOnLoad() {
    let changed = false

    /**
     * 老档的 offspring 数组会被存档整体替换，deepMerge 补不到新字段 —— 只能在这里补。
     *
     * · `gender`（P12.6）：用稳定哈希而不是 Math.random，同一名子嗣的性别不能随刷新变化。
     * · P14 繁育字段：老档没有 generation/spouse/childrenIds，
     *   不补的话 `coupleHasRoomOf` 会读到 undefined（它用 `?.length || 0` 兜底，
     *   但 `child.childrenIds.push` 会直接抛错），婚配也无从谈起。
     */
    const P14_DEFAULTS = {
      generation: 1,
      lineage: 'y',
      fatherId: null,
      fatherName: '',
      spouse: null,
      spouseStatus: null,
      spouseStatusEndTime: null,
      spousePregnancyStartTime: null,
      childrenIds: []
    }
    const nowForOffspring = this.clockGameTime
    for (const child of this.offspring?.list || []) {
      if (!child.gender) {
        child.gender = legacyOffspringGender(child)
        changed = true
      }
      // P17：多本命。老档只有单件 fate，或 fates 与 roots 数量不一致 →
      // 按 roots 稳定补齐（不重掷）。新档的 fates 已经与 roots 一一对应，不动。
      if (!child.hasRoot) {
        if (
          (child.fates || []).length ||
          child.fate ||
          (child.roots || []).length ||
          child.rootCount
        ) {
          child.fates = []
          child.fate = null
          child.roots = []
          child.rootCount = 0
          child.quality = null
          changed = true
        }
      } else {
        const roots = Array.isArray(child.roots) ? [...new Set(child.roots.filter(Boolean))] : []
        const fates = Array.isArray(child.fates) ? child.fates : []
        const rootCount = Math.max(
          Math.min(Number(child.rootCount) || roots.length || 1, 5),
          1
        )
        const fateEls = new Set(fates.map(fate => fate?.fateElement).filter(Boolean))
        const consistent =
          roots.length === rootCount &&
          fates.length === rootCount &&
          fateEls.size === rootCount &&
          roots.every(element => fateEls.has(element))
        if (!consistent) {
          const migrated = legacyFatesOf(child)
          child.fates = migrated
          child.fate = migrated[0] || null
          child.roots = migrated.length
            ? [...new Set(migrated.map(fate => fate.fateElement))]
            : roots
          child.rootCount = Math.max(Math.min(child.roots.length || rootCount, 5), 1)
          child.quality = qualityOfRootCount(child.rootCount)
          changed = true
        }
      }
      for (const [key, value] of Object.entries(P14_DEFAULTS)) {
        const missing = key === 'childrenIds' ? !Array.isArray(child[key]) : child[key] === undefined
        if (missing) {
          child[key] = key === 'childrenIds' ? [] : Array.isArray(value) ? [...value] : value
          changed = true
        }
      }

      // ---------- 2026-10-20 子嗣修炼 / 家族工作 ----------
      // 老档没有修炼等级：有灵根按「启蒙后过了多少天」回填（不重掷），
      // 无灵根恒为 0。这样已经长大的老档子嗣不会全部从练气一层重新爬。
      if (typeof child.realmLevel !== 'number') {
        child.realmLevel = child.hasRoot
          ? legacyCultivationLevelOf(child, nowForOffspring)
          : 0
        child.cultivation = 0
        changed = true
      }
      if (typeof child.cultivation !== 'number') {
        child.cultivation = 0
        changed = true
      }
      if (child.job === undefined) {
        child.job = null
        changed = true
      }
      if (typeof child.jobProgress !== 'number') {
        child.jobProgress = 0
        changed = true
      }
      // 岗位失效（外嫁、改成有灵根、脏 id）→ 撤下，避免每天白算产出
      if (child.job && (!familyJobById(child.job) || !canDoFamilyJobOf(child, nowForOffspring))) {
        child.job = null
        child.jobProgress = 0
        changed = true
      }

      // ---------- 2026-10-23 子嗣装备（P36 第 3 步）----------
      // 装备是**整件实例存在子嗣身上**（同桂冈 equippedArtifacts），不是 id 引用，
      // 所以老档只需要补空槽，不用去背包里找。脏档的非对象值一律重置。
      if (!child.equipment || typeof child.equipment !== 'object') {
        child.equipment = emptyOffspringEquipment()
        changed = true
      } else {
        for (const slot of OFFSPRING_EQUIP_SLOTS) {
          if (child.equipment[slot] === undefined) {
            child.equipment[slot] = null
            changed = true
          }
        }
      }

      // ---------- 2026-10-20 子嗣历练 ----------
      // 老档没有配置键 → 默认「仅打坐」，不把已有子嗣自动派出去。
      if (child.expeditionMode === undefined) {
        child.expeditionMode = 'cultivate'
        changed = true
      } else if (expeditionModeOf(child) !== child.expeditionMode) {
        // 未知字符串（改过档/旧枚举）→ 退回仅打坐
        child.expeditionMode = 'cultivate'
        changed = true
      }
      if (typeof child.injuryDays !== 'number') {
        child.injuryDays = 0
        changed = true
      }
      if (typeof child.expeditionCredit !== 'number') {
        child.expeditionCredit = 0
        changed = true
      }
      // 配置了探索但门槛已不满足（练气回落/失去灵根）→ 退回打坐；
      // 养伤天数与事件余数一并清零，避免以后再开时白扣一天。
      if (expeditionModeOf(child) !== 'cultivate' && !canExpeditionOf(child, nowForOffspring)) {
        child.expeditionMode = 'cultivate'
        child.injuryDays = 0
        child.expeditionCredit = 0
        changed = true
      }

      // P15.5(b)：P14 存档里的配偶还没有灵根档 —— 按「不优于子孙」稳定补一个。
      // roots 只是展示用，老档留空数组即可（提纯只看 rootCount）。
      if (child.spouse && typeof child.spouse.rootCount !== 'number') {
        child.spouse.rootCount = legacySpouseRootCount(child)
        child.spouse.roots = []
        changed = true
      }
    }

    const court = this.innerCourt
    if (!court?.wives?.length) return changed
    const now = this.clockGameTime

    for (const wife of court.wives) {
      // 先补生命周期/经期字段（老档），再折算旧孕期
      const life = normalizeWifeOnLoad(wife, now)
      if (life !== wife) {
        Object.assign(wife, life)
        changed = true
      }
      const next = normalizePregnancy(wife, now)
      if (next !== wife) {
        Object.assign(wife, next)
        changed = true
      }
    }

    const fatherTier = getRealmName(this.level).tier
    for (const wife of court.wives) {
      if (wife.status === 'passed_away') continue
      const end = wife.statusEndTime || 0
      if (wife.status === 'pregnant' && now >= end) {
        this.deliverOffspring(wife, now, fatherTier)
        changed = true
        continue
      }
      if (wife.status === 'recovering' && now >= end) {
        wife.status = 'idle'
        wife.statusEndTime = null
        wife.recoveryStartTime = null
        // 产后恢复结束当天可能正好落在经期，下面继续判，不要 continue
        changed = true
      }
      if (wife.status === 'period' && now >= end) {
        wife.status = 'idle'
        wife.statusEndTime = null
        wife.periodStartTime = null
        changed = true
      }
      if (wife.status === 'idle') {
        const cycle = wifeCycleStateOf(wife, now)
        if (cycle.inPeriod) {
          wife.status = 'period'
          wife.statusEndTime = cycle.periodEndTime
          wife.periodStartTime = cycle.periodStartTime
          changed = true
        }
      }
    }

    return changed
  },

  /**
   * 结算一次诞生（由 advanceInnerCourtDay 调用，不单独对 UI 暴露）。
   * 抽卡结果在这里定死并存进列表，玩家稍后在诞生弹窗里看到的就是这结果。
   */
  deliverOffspring(wife, gameTime, fatherTier) {
    const off = this.offspring
    const roll = rollOffspring({
      rank: wife.rank,
      fatherTier,
      totalDraws: off.gacha.totalDraws,
      pityNoRoot: off.gacha.pityNoRoot,
      // 英烈祠：每块牌位 +0.1% 灵根概率（上限 +1%），见《秘境系统》§六
      rootBonus: this.shrineRootChanceBonus
    })
    off.gacha.totalDraws += 1
    off.gacha.pityNoRoot = roll.hasRoot ? 0 : off.gacha.pityNoRoot + 1

    const seq = off.nextChildSeq
    // 性别在出生时定死（50/50），与灵根/品质无关；名字与 Y 染传承都读它
    const gender = rollOffspringGender()
    const child = newOffspring({
      id: `c_${String(seq).padStart(4, '0')}`,
      // P15.4：默认名直接从姓名池里挑（按性别选池 + 避重名）。
      // 「桂大 / 桂二」只作为老档的既有名字保留，新档不再默认用它。
      name: randomOffspringName(this.name, {
        existing: off.list.map(c => c.name),
        gender
      }),
      gender,
      // 桂冈亲生 = 第一代。第一代男女都算子孙（Y 染只排除「女儿的女儿」，§6.0）
      generation: 1,
      lineage: 'y',
      fatherId: null,
      fatherName: this.name,
      motherId: wife.id,
      motherName: wife.name,
      motherRankAtBirth: wife.rank,
      birthTime: gameTime,
      // ⚠ 只存 id，不存对象引用 —— 存引用会让 JSON.stringify 把同一个子嗣
      //   序列化多份，deepMerge 还会把它们变成互不相干的两个副本
      ...roll
    })
    off.list.push(child)
    off.pendingBirthIds.push(child.id)
    off.nextChildSeq += 1

    wife.childrenIds.push(child.id)
    // ⚠ pregnancyCount 在**受孕时**已 +1，这里不能重复加
    if (roll.hasRoot) wife.rootChildrenCount += 1
    if (roll.quality === 'top') wife.topChildrenCount += 1

    wife.status = 'recovering'
    wife.statusEndTime = gameTime + TUNING.pregnancy.recoveryDays * GAME_SECONDS_PER_DAY
    wife.pregnancyStartTime = null
    wife.pregnancyDays = null
    wife.recoveryStartTime = gameTime
    // 产后恢复结束后从这一天重新起算经期周期
    wife.cycleStartTime = gameTime

    const genderLabel = OFFSPRING_GENDER_META[child.gender]?.long || '子嗣'
    this.pushCourtLog(
      `${wife.name} 诞下${child.hasRoot ? `有灵根的${genderLabel} ${child.name}` : `${genderLabel} ${child.name}`}`
    )
  },

  /**
   * 给子嗣改名（诞生弹窗里用）。空名与重名会被拒绝，返回 { ok, message }。
   * ⚠ 名字上限 8 个字；输入框也做了 maxlength，这里是第二道。
   */
  renameOffspring(id, name) {
    const child = this.offspring?.list?.find(c => c.id === id)
    if (!child) return { ok: false, message: '子嗣不存在' }
    const trimmed = String(name || '').trim().slice(0, 8)
    if (!trimmed) return { ok: false, message: '名字不能为空' }
    if (this.offspring.list.some(c => c.id !== id && c.name === trimmed)) {
      return { ok: false, message: `已有子嗣叫「${trimmed}」` }
    }
    if (child.name === trimmed) return { ok: true }
    child.name = trimmed
    this.saveData()
    return { ok: true }
  },

  /**
   * 洗命（P15.5(a)）：消耗 1 张洗命符，重抽**灵根数量 + 灵根属性 + 本命 + 词条**。
   *
   * ⚠ **无灵根子嗣不能洗**（2026-10-18 用户拍板）—— `hasRoot` 不参与重抽，
   *   所以能洗的子嗣洗完后一定仍有灵根（数量至少 1）。
   * ⚠ 品质由灵根数量派生（P15.5(c)），这里改数量后同步写回 `quality` 即可。
   *
   * @returns {{ ok:boolean, message?:string, rootCount?:number, quality?:string, fate?:object, traits?:array }}
   */
  rerollOffspringFortune(id) {
    const child = this.offspring?.list?.find(c => c.id === id)
    if (!child) return { ok: false, message: '子嗣不存在' }
    if (!child.hasRoot) return { ok: false, message: '无灵根子嗣不能洗命' }
    if ((Number(this.fateCharms) || 0) <= 0) return { ok: false, message: '洗命符不足' }

    const root = rollRootProfile()
    const traits = rollTraitList({ quality: root.quality })
    const fates = root.fates || []

    child.rootCount = root.rootCount
    child.roots = root.roots
    child.quality = root.quality
    // P17：多本命。`fate` 只保留第一件给旧 UI/老档兼容
    child.fates = fates
    child.fate = fates[0] || null
    child.traits = traits

    this.fateCharms -= 1
    this.pushCourtLog(
      `${child.name} 洗命：${rootCountName(root.rootCount)}，` +
        `本命 ${fates.map(fate => fate.name).join('、') || '—'}，` +
        `词条 ${(traits || []).map(t => t.name).join('、') || '无'}`
    )
    this.saveData()
    return { ok: true, rootCount: root.rootCount, quality: root.quality, fates, fate: fates[0] || null, traits }
  },

  /**
   * 秘境陨落：标记 fallen，**不删列表条目**（生母的 childrenIds 还要指着它）。
   * 展示/加成/出战候选由 `livingOffspring` 过滤。
   */
  markOffspringFallen(id, { atSeconds = null, floor = null } = {}) {
    const child = this.offspring?.list?.find(c => c.id === id)
    if (!child || child.status === 'fallen') return false
    child.status = 'fallen'
    child.diedAtSeconds = atSeconds
    child.deathFloor = floor
    this.pushCourtLog(`${child.name} 在秘境陨落`)
    this.saveData()
    return true
  },

  /** 玩家确认诞生弹窗。队列清空后恢复时间（事件暂停持有者随之释放） */
  acknowledgeBirths(ids = []) {
    const set = new Set(ids)
    this.offspring.pendingBirthIds = this.offspring.pendingBirthIds.filter(id => !set.has(id))
    if (!this.offspring.pendingBirthIds.length) this.resumeClockFromEvent('birth')
    this.saveData()
  },

  /** 剩余天数（UI 用）。放在 action 里只是为了模板少 import 一个纯函数 */
  remainingDaysOf(statusEndTime) {
    return remainingDays(statusEndTime, this.clockGameTime)
  }
}
