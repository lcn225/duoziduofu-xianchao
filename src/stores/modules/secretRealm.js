// 【秘境】store 侧 —— 纯函数在 plugins/secretRealm.js，这里只做落账、存档与模式切换。
//
// ⚠ 战斗是**预演**：`runSegment` 一次算完整段 frames，视图只负责回放。
//   回放帧放在模块闭包里（不进 state/存档），刷新最多丢动画，不丢结果。
// ⚠ 时间成本（2026-10-21 改）：**结局才知道扣几天** —— `ceil(已通关 Boss 层 / 10)`，
//   所以不再在 startRun 预扣，而是在挑战结束 / 扫荡时按实际通关层数结算。
//   回放期间仍用事件暂停持有时钟，保证结算前后时间连贯。
import { skipTo } from '../../plugins/gameClock'
import {
  TUNING,
  autoPickBuff,
  buildOffspringUnit,
  buildPetUnit,
  buildPlayerUnit,
  floorKind,
  canFight,
  chestTierOfDifficulty,
  clampStartFloor,
  difficultyProgressOf,
  emptyLoot,
  mergeLoot,
  runSegment,
  shrineBonuses,
  sweepLimitOf,
  sweepLoot,
  timeCostDaysOf,
  withDifficultyProgress
} from '../../plugins/secretRealm'
import { getRandomHerb } from '../../plugins/herbs'
import { pillRecipes } from '../../plugins/pills'
import { MODES } from '../../plugins/idleMode'
import { GAME_SECONDS_PER_DAY, offspringRealmNameOf } from '../../plugins/innerCourt.js'
import { emitNotice } from '../../plugins/notice.js'
import { addSpiritualTier } from '../../plugins/currency.js'

/** 回放帧是过程数据，绝不进 Pinia state（会被写进存档） */
let pendingFrames = []

export const state = () => ({
  secretRealm: {
    /** 当前挑战；finished 时保留结果面板，下一次开始时覆盖 */
    run: null,
    /**
     * 当前**选中**的难度（1 起步，只能选已解锁的）。
     * 每难度 50 层，顺序解锁；已解锁的难度可以回刷。
     */
    difficulty: 1,
    /** 已解锁的最高难度 */
    maxDifficulty: 1,
    /** 按难度分槽的进度：{ [难度]: { highestFloor, highestBossCleared, bossFirstClears, finalBossFirstKill } } */
    difficultyProgress: {},
    // 下面四个字段是**当前选中难度**的工作副本（切换难度时与进度槽互相读写）
    highestFloor: 0,
    highestBossCleared: 0,
    /** { '5': true, '10': true } —— 当前难度的首破账本，扫荡不写 */
    bossFirstClears: {},
    /** 当前难度的 50 层首杀是否已拿（每难度一次） */
    finalBossFirstKill: false,
    retreatEnabled: true,
    /** 百分比（20 = 20%） */
    retreatThreshold: TUNING.autoRetreatDefaultPct,
    speed: 1,
    /** 英烈祠：{ id, name, quality, rootCount, fate, bestFloor, deathFloor, diedAt } */
    shrine: [],
    stats: { runs: 0, kills: 0, deaths: 0, firstClears: 0, sweeps: 0 }
  }
})

export const getters = {
  secretRealmSweepLimit() {
    return sweepLimitOf(this.secretRealm?.highestBossCleared)
  },
  /** 当前难度对应的宝匣阶（1–5） */
  secretRealmChestTier() {
    return chestTierOfDifficulty(this.secretRealm?.difficulty)
  },
  /** 扫荡当前上限需要几天：ceil(可扫层数 / 10) */
  secretRealmSweepDays() {
    return timeCostDaysOf(this.secretRealmSweepLimit)
  },
  secretRealmCanSweep() {
    return this.secretRealmSweepLimit > 0 && !this.secretRunActive
  },
  shrineCultivationBonus() {
    return shrineBonuses(this.secretRealm?.shrine?.length).cultivationBonus
  },
  shrineRootChanceBonus() {
    return shrineBonuses(this.secretRealm?.shrine?.length).rootChanceBonus
  },
  /** 可出战的子嗣：有灵根 + 练气二层 + 没陨落（2026-10-20，见 innerCourt.TUNING.offspringCultivation） */
  adultOffspringCandidates() {
    const now = this.clockGameTime
    return (this.offspring?.list || []).filter(child => canFight(child, now))
  },
  /** 拥有的灵宠（背包里的 + 当前出战的那只） */
  petCandidates() {
    const active = this.activePet
    // 出战那只**优先用 activePet 对象**：读档后它与 items 里的同 id 项是两份拷贝，
    // 等级/经验只在 activePet 上更新（`pets.relinkActivePet` 前尤其如此）。
    const list = (this.items || [])
      .filter(item => item && item.type === 'pet')
      .map(item => (active?.id && item.id === active.id ? active : item))
    if (active && active.id && !list.some(p => p.id === active.id)) list.push(active)
    return list
  }
}

export const actions = {
  /** 把 store 的玩家属性压成一个普通对象，交给纯函数构建战斗单位 */
  buildPlayerSnapshot() {
    return {
      name: this.name,
      level: this.level,
      realm: this.realm,
      stats: {
        health: this.totalHealth,
        maxHealth: this.totalHealth,
        damage: this.combatPanel.attack,
        defense: this.totalDefense,
        speed: this.combatPanel.speed,
        ...this.combatAttributes,
        ...this.combatResistance,
        ...this.specialAttributes
      }
    }
  },

  /** 按 run.party 的引用重建满血队伍模板（每层 clone） */
  buildSecretRealmParty(run = this.secretRealm.run) {
    const units = [buildPlayerUnit(this.buildPlayerSnapshot())]
    const children = new Map((this.offspring?.list || []).map(c => [c.id, c]))
    const pets = new Map(this.petCandidates.map(p => [p.id, p]))
    for (const ref of run?.party || []) {
      if (ref.kind === 'offspring') {
        const child = children.get(ref.id)
        const unit = child && buildOffspringUnit(child, { nowSeconds: this.clockGameTime })
        if (unit) units.push(unit)
      } else if (ref.kind === 'pet') {
        const pet = pets.get(ref.id)
        const unit = pet && buildPetUnit(pet)
        if (unit) units.push(unit)
      }
    }
    return units
  },

  /**
   * 开始挑战。**不预扣时间**（2026-10-21 改）：结算时按已通关 Boss 层扣
   * `ceil(层数 / 10)` 天，见 `finishSecretRealmRun`。这里只预演第一段。
   *
   * 2026-10-23 加 `startFloor`：整备时可选「跳过已走过的路」（多蹭 Buff 就走第 1 层）。
   * 起点夹在 [1, 本难度最高层 + 1]，越界一律回落，不信任 UI 传值。
   *
   * @param {{ offspringIds?: string[], petIds?: string[], permadeath?: boolean, startFloor?: number }} config
   */
  startSecretRealmRun(config = {}) {
    if (this.idleMode !== MODES.GARRISON) {
      this.setIdleModeNotice('请先回镇守，再进秘境')
      return { ok: false, reason: '不在镇守' }
    }
    if (this.isInjured) {
      this.setIdleModeNotice('正在养伤，无法进秘境')
      return { ok: false, reason: '养伤中' }
    }
    if (this.secretRunActive) return { ok: false, reason: '已有挑战进行中' }

    const adultIds = new Set(this.adultOffspringCandidates.map(c => c.id))
    const petIds = new Set(this.petCandidates.map(p => p.id))
    const offspringIds = (config.offspringIds || []).filter(id => adultIds.has(id))
    const chosenPetIds = (config.petIds || []).filter(id => petIds.has(id))
    // P43：子嗣与灵兽各占各的坑（3 + 1），不再互相挤占
    const party = [
      ...offspringIds.slice(0, TUNING.companionSlots).map(id => ({ kind: 'offspring', id })),
      ...chosenPetIds.slice(0, TUNING.petSlots).map(id => ({ kind: 'pet', id }))
    ]

    // 起始层：默认第 1 层（机缘拿满）；选择跳过时也只在「本难度已到的最高层 + 1」之内
    const startFloor = clampStartFloor(config.startFloor, this.secretRealm.highestFloor)

    // 先切模式：garrisonLeftAtSeconds 记的是「离开的那一刻」
    this.switchIdleMode(MODES.SECRET_REALM)
    // 回放期间持有时钟：时间成本在结算时一次性扣，看打斗的这几分钟不能再走游戏时间
    this.pauseClockForEvent('secretRealm')
    const now = Number(this.clockGameTime) || 0

    this.secretRealm.run = {
      status: 'fighting',
      floor: startFloor,
      startFloor,
      highestFloorReached: startFloor - 1,
      // 本趟自己退出的人（uid）。撤退是「谁触线谁走」，不是整队回家（2026-10-23）
      withdrawn: [],
      difficulty: this.secretRealm.difficulty,
      finalBossFirstKill: !!this.secretRealm.finalBossFirstKill,
      buffs: [],
      party,
      autoRetreatPct: this.secretRealm.retreatEnabled ? this.secretRealm.retreatThreshold : 0,
      permadeath: !!config.permadeath,
      startedAt: now,
      pendingBuff: null,
      // 整趟掉落累计。挑战被切成若干 5 层段，`segment.loot` 只是**这一段**的账；
      // 结果面板要显示整趟，见 finishSecretRealmRun（2026-10-27 修）
      lootTotal: emptyLoot(),
      result: null
    }
    this.secretRealm.stats.runs += 1
    this.dungeonTotalRuns += 1
    this.continueSecretRealmRun()
    this.saveData()
    return { ok: true }
  },

  /**
   * 预演下一段（到下一个 Buff 门或挑战结束）。
   *
   * @param opts.rng     注入随机源（离线重放要可复现）
   * @param opts.silent  离线重放：不落盘、结算时不自己扣时间（时间由离线游标统一记）
   */
  continueSecretRealmRun({ rng = Math.random, silent = false } = {}) {
    const run = this.secretRealm.run
    if (!run || run.status !== 'fighting') return

    const partyBase = this.buildSecretRealmParty(run)
    const withdrawnNow = new Set((run.withdrawn || []).map(String))
    // 给视图用的轻量队伍快照（不含战斗过程状态）。
    // 已经退出本趟的人仍然留在列表里，只是打上 withdrawn 标记 —— 血条区要有地方显示「已退出」。
    run.partyView = partyBase.map(unit => ({
      uid: unit.uid,
      name: unit.name,
      maxHealth: unit.stats.maxHealth,
      source: unit.source,
      withdrawn: withdrawnNow.has(String(unit.uid))
    }))
    const segment = runSegment({
      run,
      partyBase,
      bossFirstClears: this.secretRealm.bossFirstClears,
      rng
    })
    if (!silent) pendingFrames = segment.frames

    this.applySecretRealmSegment(segment)

    if (segment.result) {
      this.finishSecretRealmRun(segment.result, { applyTime: !silent })
      return
    }
    // 停在 Buff 门，等玩家选（或 10 秒后 autoChoose）
    if (!silent) this.saveData()
  },

  /**
   * 把一段的账记下来：首破 / 最高层 / 扫荡上限 / 掉落 / 击杀 / 阵亡 / run 状态。
   * **不结算时间、不切模式** —— 在线由 `continueSecretRealmRun` 继续，离线由游标统一记天。
   */
  applySecretRealmSegment(segment) {
    const run = this.secretRealm.run
    const oldFirstClears = Object.keys(this.secretRealm.bossFirstClears || {}).length
    this.secretRealm.bossFirstClears = segment.firstClears
    const newFirstClears = Object.keys(segment.firstClears || {}).length
    this.secretRealm.stats.firstClears += Math.max(newFirstClears - oldFirstClears, 0)
    this.secretRealm.highestFloor = Math.max(
      this.secretRealm.highestFloor,
      segment.run.highestFloorReached
    )
    // 扫荡上限看「已通关的完整 Boss 层」，直接用本趟最高层推，不依赖首破账本
    // （第二次爬塔不会产生新的首破，旧写法会把上限卡住不动）。
    this.secretRealm.highestBossCleared = Math.max(
      this.secretRealm.highestBossCleared,
      sweepLimitOf(segment.run.highestFloorReached)
    )
    // 50 层首杀（每难度一次）：本段拿过就持久化，重复爬塔/扫荡不再给
    if (segment.run.finalBossFirstKill) this.secretRealm.finalBossFirstKill = true
    this.applySecretRealmLoot(segment.loot)
    this.recordSecretRealmKills(segment.frames)
    this.recordSecretRealmDeaths(segment.deaths, segment.result?.floor || segment.run.floor)

    if (!run) return
    // 整趟累计（面板用）。老档没有 lootTotal，从空开始算 —— 面板会少算读档前的那几段，
    // 但**入账不受影响**（每段照旧在 applySecretRealmLoot 里落账）。
    run.lootTotal = mergeLoot({ ...(run.lootTotal || emptyLoot()) }, segment.loot)
    Object.assign(run, {
      floor: segment.run.floor,
      highestFloorReached: segment.run.highestFloorReached,
      buffs: segment.run.buffs,
      withdrawn: segment.run.withdrawn || [],
      status: segment.run.status,
      finalBossFirstKill: segment.run.finalBossFirstKill,
      pendingBuff: segment.pendingBuff || null
    })
  },

  chooseSecretRealmBuff(id) {
    const run = this.secretRealm.run
    if (!run || run.status !== 'buff' || !run.pendingBuff?.options?.length) return false
    const option = run.pendingBuff.options.find(o => o.id === id)
    if (!option) return false
    run.buffs = [...(run.buffs || []), id]
    run.pendingBuff = null
    run.status = 'fighting'
    this.saveData()
    this.continueSecretRealmRun()
    return true
  },

  autoChooseSecretRealmBuff() {
    const run = this.secretRealm.run
    if (!run?.pendingBuff?.options?.length) return false
    const best = autoPickBuff(run.pendingBuff.options)
    return best ? this.chooseSecretRealmBuff(best.id) : false
  },

  /**
   * 结算一次挑战：扣时间、解锁难度、更新统计/英烈祠/旧 dungeon* 字段。
   *
   * @param opts.applyTime 默认 true。**离线重放必须传 false** —— `skipTo` 会
   *   补触发 day / month 边界钩子（内宅日结、月俸），而离线游标自己已经调过一遍，
   *   不关掉就是双重结算。天数由 `result.days` 交给离线层记账。
   */
  finishSecretRealmRun(result, { applyTime = true } = {}) {
    const run = this.secretRealm.run
    // ⚠ 结果面板显示**整趟**的账，不是最后一段的账（2026-10-27 修）。
    //   `result.loot` 只带最后那 5 层（46–50），结算面板会因此看起来「只给了 2 个宝匣」，
    //   实际整趟 10 个 Boss 层早就逐段入账了。入账逻辑不在这里，别把它改成重复入账。
    if (result && run?.lootTotal) result.loot = { ...run.lootTotal }
    // 时间成本 = ceil(已通关 Boss 层 / 10)：挑战/撤退/战败都按已通关的最后一个 Boss 层算。
    // 从中间起打（跳过已走过的路）时只算本趟真正打过的那一段，见 timeCostDaysOf。
    // 先跳过时间再写结果，结果面板里的「用时」才是这一趟真正的成本。
    const days = timeCostDaysOf(run?.highestFloorReached ?? 0, run?.startFloor ?? 1)
    if (days > 0 && applyTime) {
      const target = (Number(this.clockGameTime) || 0) + days * GAME_SECONDS_PER_DAY
      skipTo(target)
      this.clockGameTime = target
      // 这几天是「在外闯荡」：dayLoop 不能把离开的时段补算成镇守日常
      this.resetDayLoop()
    }
    if (result) result.days = days

    if (run) {
      run.status = 'finished'
      run.result = result
      run.finishedAt = this.clockGameTime
    }

    // 旧成就页还读这些字段，保持更新（击杀数在 recordSecretRealmKills 里已累加）。
    // ⚠ 必须放在「解锁下一难度、进度清零」**之前**取最高层，否则通 50 层后会被清零抹掉。
    this.dungeonHighestFloor = Math.max(
      this.dungeonHighestFloor,
      this.secretRealm.highestFloor,
      Number(run?.highestFloorReached) || 0
    )

    // 通关 50 层大 Boss → 解锁下一难度，并自动切过去（进度从第 1 层开始，§4.2）。
    // 老难度的进度先写回槽，之后还能从下拉里切回来回刷。
    if (result?.clearedDifficulty) {
      this.syncDifficultyProgress()
      const next = Math.max(Number(this.secretRealm.maxDifficulty) || 1, 1) + 1
      this.secretRealm.maxDifficulty = next
      this.secretRealm.difficulty = next
      this.loadDifficultyProgress(next)
      result.unlockedDifficulty = next
    }

    const retreatOrWipe = result.outcome !== 'victory'
    const hasLoot = !!(
      result.loot &&
      (result.loot.spiritual ||
        result.loot.refinementStones ||
        result.loot.herbs ||
        result.loot.pillFragments ||
        result.loot.chests ||
        result.loot.fateCharms)
    )
    if (hasLoot) this.dungeonTotalRewards += 1
    this.dungeonDeathCount += retreatOrWipe ? 1 : 0
    if (result.outcome === 'defeat') this.dungeonLastFailedFloor = result.floor
    this.dungeonStreakKills = retreatOrWipe ? 0 : (this.dungeonStreakKills || 0) + 1

    // ⚠ 这里**不切模式、不释放暂停**：让玩家留在秘境页看结果/回放。
    //   切回镇守由「回镇守」按钮或离开页面触发，届时 switchIdleMode 会释放暂停。
    //   读档时若 run 已 finished，resetIdleRuntime 会自动回镇守。
    this.saveData()
  },

  /** 用 frames 里的致死攻击统计击杀；敌人 uid 以 enemy: 开头 */
  recordSecretRealmKills(frames = []) {
    let kills = 0
    let bossKills = 0
    for (const frame of frames) {
      if (frame.type !== 'attack' || !frame.lethal) continue
      if (String(frame.target).startsWith('enemy:')) {
        kills += 1
        if (floorKind(frame.floor) !== 'normal') bossKills += 1
      }
    }
    this.secretRealm.stats.kills += kills
    this.dungeonTotalKills += kills
    this.dungeonBossKills += bossKills
    this.dungeonEliteKills += bossKills
    // 记录到 run 上，供 finish 时更新成就字段
    if (this.secretRealm.run) {
      this.secretRealm.run.lastKills = { kills, bossKills }
    }
  },

  /** 子嗣陨落：标记 fallen（不删条目），写英烈祠，返还修为 + 词条 */
  recordSecretRealmDeaths(deaths = [], floor = 0) {
    if (!deaths.length) return
    const children = new Map((this.offspring?.list || []).map(c => [c.id, c]))
    const banner = []
    let returnedTotal = 0
    let traitTotal = 0
    for (const death of deaths) {
      const child = children.get(death.refId)
      if (!child || child.status === 'fallen' || child.status === 'passed_away') continue
      const marked = this.markOffspringFallen(child.id, {
        atSeconds: this.clockGameTime,
        floor,
        // B1：陨落讣告要写「亡于谁」，敌人名在 `simulateBattle` 的 deaths 里带回
        killerName: death.killerName || null
      })
      if (!marked) continue
      traitTotal += marked.traits || 0
      this.secretRealm.shrine.push({
        id: child.id,
        name: child.name,
        quality: child.quality,
        rootCount: child.rootCount,
        fate: child.fate,
        bestFloor: this.secretRealm.highestFloor,
        deathFloor: floor,
        diedAt: this.clockGameTime,
        killerName: death.killerName || null
      })
      this.secretRealm.stats.deaths += 1
      // 修行返还：按当前修为上限的一小部分返还（占位比例）
      const returned = Math.max(this.maxCultivation * TUNING.deathReturnRatio, 1)
      this.cultivate(returned)
      returnedTotal += returned
      // 第 2 档横幅要展示「名字 + 境界」，让玩家知道是谁（§15.5.3）
      banner.push({
        name: child.name,
        realm: offspringRealmNameOf(child.realmLevel)
      })
    }
    // 一个结算周期只出一条（不同周期各出一条，不跨周期合并、不堆叠）
    if (banner.length) {
      emitNotice({ kind: 'fall', deaths: banner, cultivation: returnedTotal, traits: traitTotal })
    }
    this.saveData()
  },

  /** 掉落落到现有资源/物品体系；高阶功法/同参等真源表出来后再接 */
  applySecretRealmLoot(loot = emptyLoot()) {
    if (!loot) return
    // 基础灵石走**一阶灵石（spiritual）**，金额见《数值真值表》§6.4（总 ÷9）。
    // 老档的 run.result.loot 可能还是 `secular` / `daZi`（P17 过渡口径），读的时候兜一下。
    const spiritual =
      Math.max(Number(loot.spiritual ?? loot.secular ?? loot.daZi) || 0, 0)
    // A1 拆账：掉落金额仍按一阶口径书写 ⇒ 统一进一阶档（筑基段分支等 B9）
    this.currency = addSpiritualTier(this.currency, 1, spiritual)
    this.refinementStones += Math.max(Number(loot.refinementStones) || 0, 0)
    for (let i = 0; i < (Number(loot.herbs) || 0); i += 1) {
      const herb = getRandomHerb()
      // P57：走 gainHerb 按 `id + 品质` 叠加，别 push（一条一株会把 herbs 撑成几千条）
      if (herb) this.gainHerb(herb, 1, { save: false })
    }
    for (let i = 0; i < (Number(loot.pillFragments) || 0); i += 1) {
      const recipe = pillRecipes[Math.floor(Math.random() * pillRecipes.length)]
      if (recipe) this.gainPillFragment(recipe.id)
    }
    // 宝匣：同难度同阶，按数量一次入账
    this.gainChest(loot.chestTier || 1, loot.chests || 0, { save: false })
    this.gainChest(loot.bonusChestTier || 1, loot.bonusChests || 0, { save: false })
    if (loot.fateCharms) this.fateCharms += Math.max(Number(loot.fateCharms) || 0, 0)
  },

  /** 扫荡：按最后一个已通关 Boss 层扣时间与掉落，不写首破、不给 50 层首杀 */
  startSecretRealmSweep() {
    if (this.secretRunActive) return { ok: false, reason: '已有挑战进行中' }
    if (this.idleMode !== MODES.GARRISON) return { ok: false, reason: '请先回镇守' }
    const cap = this.secretRealmSweepLimit
    if (!cap) return { ok: false, reason: '还没有可扫荡的 Boss 段' }

    const days = timeCostDaysOf(cap)
    const now = Number(this.clockGameTime) || 0
    const target = now + days * GAME_SECONDS_PER_DAY
    skipTo(target)
    this.clockGameTime = target
    // 这几天是「在家等」，没有离开镇守；dayLoop 的下一个 tick 必须以 target 为锚，
    // 否则会把这几天当成「今天已经过去」补算一遍。
    this.resetDayLoop()
    this.applySecretRealmLoot(
      sweepLoot(cap, Math.random, TUNING, this.secretRealm.difficulty)
    )
    this.secretRealm.stats.sweeps += 1
    this.dungeonTotalRuns += 1
    this.dungeonTotalRewards += 1
    this.saveData()
    return { ok: true, cap, days }
  },

  /** 取出本段回放帧（取完即清空） */
  takeSecretRealmFrames() {
    const frames = pendingFrames
    pendingFrames = []
    return frames
  },

  /** 结果面板上的「回镇守」。switchIdleMode 会释放 secretRealm 的时钟暂停 */
  leaveSecretRealm() {
    return this.switchIdleMode(MODES.GARRISON)
  },

  /** 清掉已结束的挑战，回到「整备出发」界面 */
  clearSecretRealmRun() {
    this.secretRealm.run = null
    if (this.idleMode === MODES.SECRET_REALM) this.switchIdleMode(MODES.GARRISON)
    this.saveData()
  },

  // ---------- 难度切换（P24b，2026-10-21） ----------

  /** 把当前难度的四个进度字段写回进度槽（切换/解锁前必须调用） */
  syncDifficultyProgress() {
    this.secretRealm.difficultyProgress = withDifficultyProgress(
      this.secretRealm.difficultyProgress,
      this.secretRealm.difficulty,
      {
        highestFloor: this.secretRealm.highestFloor,
        highestBossCleared: this.secretRealm.highestBossCleared,
        bossFirstClears: this.secretRealm.bossFirstClears,
        finalBossFirstKill: this.secretRealm.finalBossFirstKill
      }
    )
  },

  /** 把进度槽里某个难度的值读进当前工作副本（缺省给空进度） */
  loadDifficultyProgress(difficulty) {
    const progress = difficultyProgressOf(this.secretRealm.difficultyProgress, difficulty)
    this.secretRealm.highestFloor = progress.highestFloor
    this.secretRealm.highestBossCleared = progress.highestBossCleared
    this.secretRealm.bossFirstClears = progress.bossFirstClears
    this.secretRealm.finalBossFirstKill = progress.finalBossFirstKill
  },

  /**
   * 切换难度：只能选**已解锁**的（1 ~ maxDifficulty），挑战进行中不能切。
   * 切走前先把当前进度写回槽，切回来才能看到原来的层数/首破账本。
   * @returns {{ ok: boolean, reason?: string }}
   */
  selectSecretRealmDifficulty(difficulty) {
    if (this.secretRunActive) return { ok: false, reason: '挑战进行中，不能切换难度' }
    const max = Math.max(Number(this.secretRealm.maxDifficulty) || 1, 1)
    const target = Math.min(Math.max(Math.floor(Number(difficulty) || 1), 1), max)
    if (target === this.secretRealm.difficulty) return { ok: true }
    // 已结束的旧战况属于旧难度，切走就收起 —— 否则结果面板会挂着另一个难度的数据
    if (this.secretRealm.run?.status === 'finished') this.clearSecretRealmRun()
    this.syncDifficultyProgress()
    this.secretRealm.difficulty = target
    this.loadDifficultyProgress(target)
    this.saveData()
    return { ok: true }
  },

  /**
   * 读档自愈：丢掉帧；Buff 门自动选最优；坏 run 直接收尾。
   * @returns {boolean} 是否改写过存档字段（调用方据此决定要不要落盘）
   */
  resetSecretRealmRuntime() {
    pendingFrames = []
    let changed = false

    // 2026-10-21 P24b：难度进度槽。老档 / P24 首版没有这张表 —— 把当前的扁平进度
    // 落到「当前难度」，其余已解锁难度补空槽（幂等，新档只在第一次建表）。
    const realm = this.secretRealm
    if (realm) {
      const map = realm.difficultyProgress
      const mapEmpty =
        !map || typeof map !== 'object' || Array.isArray(map) || Object.keys(map).length === 0
      if (mapEmpty) {
        const max = Math.max(Number(realm.maxDifficulty) || Number(realm.difficulty) || 1, 1)
        const current = Math.min(Math.max(Number(realm.difficulty) || 1, 1), max)
        let next = {}
        for (let d = 1; d < current; d += 1) next = withDifficultyProgress(next, d, {})
        next = withDifficultyProgress(next, current, {
          highestFloor: realm.highestFloor,
          highestBossCleared: realm.highestBossCleared,
          bossFirstClears: realm.bossFirstClears,
          finalBossFirstKill: realm.finalBossFirstKill
        })
        realm.difficultyProgress = next
        realm.maxDifficulty = max
        changed = true
      } else if (
        !Number.isFinite(Number(realm.maxDifficulty)) ||
        Number(realm.maxDifficulty) < Number(realm.difficulty)
      ) {
        realm.maxDifficulty = Math.max(Number(realm.difficulty) || 1, 1)
        changed = true
      }
    }

    const run = this.secretRealm?.run
    // 2026-10-21：老档里挑战中的 run 没有难度轴字段，按当前难度补上（幂等）
    if (run && !Number.isFinite(Number(run.difficulty))) {
      run.difficulty = Math.max(Number(this.secretRealm?.difficulty) || 1, 1)
      changed = true
    }
    if (run && typeof run.finalBossFirstKill !== 'boolean') {
      run.finalBossFirstKill = !!this.secretRealm?.finalBossFirstKill
      changed = true
    }
    // 2026-10-23：老档没有「本趟退出名单」和「起始层」，补齐（幂等）
    if (run && !Array.isArray(run.withdrawn)) {
      run.withdrawn = []
      changed = true
    }
    if (run && !Number.isFinite(Number(run.startFloor))) {
      run.startFloor = 1
      changed = true
    }
    if (!run) return changed
    if (!['fighting', 'buff', 'finished'].includes(run.status)) {
      this.secretRealm.run = null
      this.idleMode = MODES.GARRISON
      this.resumeClockFromEvent('secretRealm')
      return true
    }
    if (run.status === 'finished') return changed
    // 挑战还没结束：读档后重新持有时钟暂停（clearEventPauses 刚把它清掉）
    this.pauseClockForEvent('secretRealm')
    // 队伍引用失效的成员清掉（子嗣可能已陨落/灵宠被卖），并按 P43 的 3 + 1 坑位截断
    // —— 老档在途 run 可能带着「3 只灵兽」这种旧编成，读档后要拉回合法形状。
    const adultIds = new Set(this.adultOffspringCandidates.map(c => c.id))
    const petIds = new Set(this.petCandidates.map(p => p.id))
    const alive = (run.party || []).filter(ref =>
      ref.kind === 'offspring' ? adultIds.has(ref.id) : petIds.has(ref.id)
    )
    let offspringCount = 0
    let petCount = 0
    run.party = alive.filter(ref => {
      if (ref.kind === 'offspring') {
        if (offspringCount >= TUNING.companionSlots) return false
        offspringCount += 1
        return true
      }
      if (petCount >= TUNING.petSlots) return false
      petCount += 1
      return true
    })
    if (run.status === 'buff') {
      if (run.pendingBuff?.options?.length) {
        // 刷新时停在选 Buff：自动选最优，避免模式永久卡住
        const best = autoPickBuff(run.pendingBuff.options)
        if (best) {
          run.buffs = [...(run.buffs || []), best.id]
          run.pendingBuff = null
          run.status = 'fighting'
        }
      } else {
        // 脏数据：没有候选就当作已选完，继续预演
        run.status = 'fighting'
      }
    }
    return changed
  }
}
