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
  rollFate,
  rollTraitList,
  generateMaiden,
  offspringBonusOf,
  sumChildrenBonus,
  playerFateProfile,
  gameDayOf,
  hourOfDay,
  remainingDays,
  normalizePregnancy,
  offspringNameOf,
  AUTO_RULES,
  pickAutoWives
} from '../../plugins/innerCourt'
import { buildInitialInnerCourt, buildInitialOffspring, newOffspring } from '../../plugins/innerCourtData'
import { getRealmName } from '../../plugins/realm'
import { MODES } from '../../plugins/idleMode'

export const state = () => ({
  innerCourt: buildInitialInnerCourt(),
  offspring: buildInitialOffspring()
})

export const getters = {
  // ---------- 时间 ----------
  /** 当前游戏天（从 0 起）。内宅页在 PAUSE_ROUTES 里，所以停留时这个值不会变 */
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
  wives() {
    return this.innerCourt?.wives || []
  },
  availableWives() {
    return this.wives.filter(w => w.status === 'idle')
  },
  pregnantWives() {
    return this.wives.filter(w => w.status === 'pregnant')
  },
  recoveringWives() {
    return this.wives.filter(w => w.status === 'recovering')
  },

  /**
   * 怀孕率预览（设计 §5.5 要求 UI 的怀孕率列**由公式算出，不能手填**）。
   *
   * 返回的是函数而不是值，因为要按「本次计划消耗多少体力」来判疲劳 ——
   * 行动侧同样是按**扣完本次总消耗之后**的剩余体力判疲劳，两边口径完全一致。
   * 传 plannedCost 就能看到「选到第 6 个人时会不会掉 10%」。
   *
   * 自动模式再叠 5%，与 interactEvening({auto:true}) 完全同源。
   */
  wifePregnancyChance() {
    return (wife, plannedCost = 0, auto = false) =>
      pregnancyChanceOf({
        affinity: wife?.affinity,
        rank: wife?.rank,
        fatigued: this.energy - plannedCost < TUNING.pregnancy.fatigueThreshold,
        auto
      })
  },

  /** 自动模式这一夜会挑哪些人（UI 用来预览「今晚会轮到谁」，不改任何状态） */
  autoNightPlan() {
    return pickAutoWives({
      wives: this.wives,
      rule: this.innerCourt?.autoRule,
      energy: this.energy
    })
  },

  /** 内宅页顶部统计条一次取全 */
  courtSummary() {
    const wives = this.wives
    const living = this.livingOffspring
    const rooted = living.filter(c => c.hasRoot).length
    return {
      total: wives.length,
      idle: wives.filter(w => w.status === 'idle').length,
      pregnant: wives.filter(w => w.status === 'pregnant').length,
      recovering: wives.filter(w => w.status === 'recovering').length,
      offspring: living.length,
      fallen: this.offspring.list.length - living.length,
      rooted,
      rootless: living.length - rooted,
      bonus: this.offspringCultivationBonus
    }
  },

  // ---------- 子嗣 ----------
  /**
   * 活着的子嗣。秘境陨落后条目保留（生母的 childrenIds 还指着它），
   * 但所有展示、加成、出战候选都必须过滤掉 fallen。
   */
  livingOffspring() {
    return (this.offspring?.list || []).filter(c => c.status !== 'fallen')
  },

  pendingBirths() {
    const ids = this.offspring?.pendingBirthIds || []
    if (!ids.length) return []
    const byId = new Map(this.offspring.list.map(c => [c.id, c]))
    return ids.map(id => byId.get(id)).filter(Boolean)
  },

  /** 给列表页用：每行补上现算的加成（bonus 不进 state，只在这里派生） */
  offspringRows() {
    const profile = playerFateProfile(this.practice)
    return this.livingOffspring.map(c => ({ ...c, bonus: offspringBonusOf({ child: c, ...profile }) }))
  },
  rootedOffspring() {
    return this.livingOffspring.filter(c => c.hasRoot)
  },

  /**
   * ★ 模块二的核心产出：有灵根子嗣提供的修炼加成（上限 +200%）。
   * practice.js 的 `childrenCultivationBonus` 转读它，再喂给 spiritPerGameHour。
   * 名字刻意不叫 childrenBonus —— 与 harmony.js 里那个占位常量区分开。
   */
  offspringCultivationBonus() {
    if (!this.offspring?.list?.length) return 0
    return sumChildrenBonus(this.livingOffspring, playerFateProfile(this.practice))
  },

  // ---------- 抽奖 ----------
  /** 内宅还能再容纳多少人（Gacha 的侍妾池按它钳制连抽次数与扣费） */
  maidenDrawCapacity() {
    return Math.max(TUNING.gacha.householdCap - this.wives.length, 0)
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
      wives: this.wives,
      rule: this.innerCourt.autoRule,
      energy: this.energy
    })
    if (!ids.length) return { success: false, message: '体力不足以留宿', results: [] }
    return this.interactEvening(ids, { auto: true })
  },

  /**
   * 晚间互动 —— 每晚（每游戏天）一次，当场判孕（设计 §5.1 的核心爽点）。
   *
   * ⚠ 本 action **自己 saveData()**：内宅页在 PAUSE_ROUTES 里，时间暂停，
   *   没有每秒 tick 来兜底落盘（core.gainSpirit 是唯一的每秒落盘点）。
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

    const picked = this.wives.filter(w => wifeIds.includes(w.id) && w.status === 'idle')
    if (!picked.length) {
      return { success: false, message: '没有可选侍妾（已孕、产后恢复中的不可互动）', results: [] }
    }

    const cost = picked.length * TUNING.energy.perInteraction
    if (this.energy < cost) {
      return { success: false, message: `体力不足（需 ${cost}，余 ${this.energy}）`, results: [] }
    }

    this.spendStamina(cost)
    // 疲劳按**扣完本次总消耗之后**的剩余体力判定，与 UI 的预览口径一致
    const fatigued = this.energy < TUNING.pregnancy.fatigueThreshold
    const now = this.clockGameTime

    const results = []
    for (const wife of picked) {
      const chance = pregnancyChanceOf({ affinity: wife.affinity, rank: wife.rank, fatigued, auto })
      const hit = rollPregnancy({ chance, pity: wife.pregPity })

      wife.interactionCount += 1
      wife.lastInteractionTime = now
      if (TUNING.affinityPerInteraction) {
        wife.affinity = Math.min(100, wife.affinity + TUNING.affinityPerInteraction)
      }

      if (hit) {
        wife.status = 'pregnant'
        wife.statusEndTime = now + TUNING.pregnancy.days * GAME_SECONDS_PER_DAY
        wife.pregnancyStartTime = now
        wife.pregPity = 0
        // ⚠ 这里数的是「有喜」（设计 §2.1 的 P3→P4 晋升条件），不是「诞下」
        wife.pregnancyCount += 1
      } else {
        wife.pregPity += 1
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
    const tired = fatigued ? '（体力不济）' : ''
    // 流水左侧已有一列显示「第 N 天」，正文里不再重复
    this.pushCourtLog(
      hitCount
        ? `夜间${who} ${picked.length} 人${tired} —— ${results.filter(r => r.pregnant).map(r => r.name).join('、')}有喜`
        : `夜间${who} ${picked.length} 人${tired} —— 皆无所出`
    )
    this.saveData() // ⚠ 不可省，见上方注释

    return {
      success: true,
      message: hitCount ? `喜讯：${hitCount} 人有喜` : '今夜无讯',
      results
    }
  },

  /**
   * 抽奖迎入凡女（Gacha 的侍妾池调用）。
   *
   * ⚠ **不扣灵石** —— 扣费统一留在 Gacha.vue 的 performGacha 一个点，
   *   本 action 再扣一次就是双扣。调用方要按**钳制后的实际人数**计费。
   * 这里再钳一次人数是为了防 UI 漏改。
   */
  recruitMaidens(count = 1) {
    const room = this.maidenDrawCapacity
    const n = Math.max(Math.min(Math.floor(Number(count) || 0), room), 0)
    if (n <= 0) return { success: false, maidens: [], message: '内宅已满' }

    const maidens = []
    for (let i = 0; i < n; i++) {
      const maiden = generateMaiden({ seq: this.innerCourt.nextWifeSeq++ })
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
    court.energy.spentToday = Math.min(court.energy.spentToday + a, this.energyMax)
  },

  /** 回体力（睡觉）。钳在 0 即止 —— 睡满就停在「已耗 0」。同 spendStamina，不落盘。 */
  recoverStamina(amount) {
    const court = this.innerCourt
    if (!court) return
    const a = Math.max(Number(amount) || 0, 0)
    court.energy.spentToday = Math.max(court.energy.spentToday - a, 0)
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
    if (!court?.wives?.length) return
    const fatherTier = getRealmName(this.level).tier
    let born = 0

    for (const wife of court.wives) {
      const end = wife.statusEndTime || 0
      if (wife.status === 'pregnant' && gameTime >= end) {
        this.deliverOffspring(wife, gameTime, fatherTier)
        born += 1
      } else if (wife.status === 'recovering' && gameTime >= end) {
        wife.status = 'idle'
        wife.statusEndTime = null
        wife.recoveryStartTime = null
      } else if (wife.status === 'idle') {
        // 位阶晋升：严格逐级，且**每游戏天最多升一级**（见 innerCourt.promotedRankOf 的注释）
        const next = promotedRankOf(wife)
        if (next) {
          wife.rank = next
          this.pushCourtLog(`${wife.name} 晋为${rankName(next)}`)
        }
      }
    }

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
   * 读档自愈（P12.3）：
   * 1. 旧档的 270/30 天孕育/恢复 → 按 90/10 等比折算（只命中剩余超过当前完整周期的记录）；
   * 2. 逾期未结算的孕育/恢复当场结生/恢复。
   *
   * ⚠ 不直接调 advanceInnerCourtDay：那个函数还会做位阶晋升，读档重复调用会连升。
   * 返回是否有改动；由 persistence.initializePlayer 决定是否落盘。
   */
  normalizeInnerCourtOnLoad() {
    const court = this.innerCourt
    if (!court?.wives?.length) return false
    const now = this.clockGameTime
    let changed = false

    for (const wife of court.wives) {
      const next = normalizePregnancy(wife, now)
      if (next !== wife) {
        Object.assign(wife, next)
        changed = true
      }
    }

    const fatherTier = getRealmName(this.level).tier
    for (const wife of court.wives) {
      const end = wife.statusEndTime || 0
      if (wife.status === 'pregnant' && now >= end) {
        this.deliverOffspring(wife, now, fatherTier)
        changed = true
      } else if (wife.status === 'recovering' && now >= end) {
        wife.status = 'idle'
        wife.statusEndTime = null
        wife.recoveryStartTime = null
        changed = true
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
    const child = newOffspring({
      id: `c_${String(seq).padStart(4, '0')}`,
      name: offspringNameOf(this.name, seq),
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
    wife.recoveryStartTime = gameTime

    this.pushCourtLog(`${wife.name} 诞下${child.hasRoot ? `有灵根子嗣 ${child.name}` : `子嗣 ${child.name}`}`)
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
   * 洗命：消耗 1 张洗命符，重抽本命与词条。
   * 只动这两项 —— 灵根/品质是诞生时就定死的，洗命符不碰。
   * @returns {{ ok:boolean, message?:string, fate?:object, traits?:array }}
   */
  rerollOffspringFortune(id) {
    const child = this.offspring?.list?.find(c => c.id === id)
    if (!child) return { ok: false, message: '子嗣不存在' }
    if (!child.hasRoot) return { ok: false, message: '无灵根子嗣没有本命与词条，洗不了' }
    if (!child.quality) return { ok: false, message: '子嗣品质缺失，无法洗命' }
    if ((Number(this.fateCharms) || 0) <= 0) return { ok: false, message: '洗命符不足' }

    const fate = rollFate({ quality: child.quality })
    const traits = rollTraitList({ quality: child.quality })
    child.fate = fate
    child.traits = traits
    this.fateCharms -= 1
    this.pushCourtLog(
      `${child.name} 洗命：本命 ${fate?.name || '—'}，词条 ${(traits || []).map(t => t.name).join('、') || '无'}`
    )
    this.saveData()
    return { ok: true, fate, traits }
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
