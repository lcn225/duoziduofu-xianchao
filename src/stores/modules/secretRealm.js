// 【秘境】store 侧 —— 纯函数在 plugins/secretRealm.js，这里只做落账、存档与模式切换。
//
// ⚠ 战斗是**预演**：`runSegment` 一次算完整段 frames，视图只负责回放。
//   回放帧放在模块闭包里（不进 state/存档），刷新最多丢动画，不丢结果。
// ⚠ 5 天成本在 startRun 里一次性扣；回放期间用事件暂停持有时钟，保证成本精确。
import { skipTo } from '../../plugins/gameClock'
import {
  TUNING,
  autoPickBuff,
  buildOffspringUnit,
  buildPetUnit,
  buildPlayerUnit,
  floorKind,
  isAdult,
  runSegment,
  runTimeTarget,
  shrineBonuses,
  sweepLimitOf,
  sweepLoot
} from '../../plugins/secretRealm'
import { getRandomHerb } from '../../plugins/herbs'
import { pillRecipes } from '../../plugins/pills'
import { MODES } from '../../plugins/idleMode'
import { GAME_SECONDS_PER_DAY } from '../../plugins/innerCourt.js'

/** 回放帧是过程数据，绝不进 Pinia state（会被写进存档） */
let pendingFrames = []

const emptyLoot = () => ({ spiritStones: 0, refinementStones: 0, herbs: 0, pillFragments: 0, firstClear: false })

export const state = () => ({
  secretRealm: {
    /** 当前挑战；finished 时保留结果面板，下一次开始时覆盖 */
    run: null,
    highestFloor: 0,
    highestBossCleared: 0,
    /** { '5': true, '10': true } —— 首破账本，扫荡不写 */
    bossFirstClears: {},
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
  secretRealmCanSweep() {
    return this.secretRealmSweepLimit > 0 && !this.secretRunActive
  },
  shrineCultivationBonus() {
    return shrineBonuses(this.secretRealm?.shrine?.length).cultivationBonus
  },
  shrineRootChanceBonus() {
    return shrineBonuses(this.secretRealm?.shrine?.length).rootChanceBonus
  },
  /** 达到出战年龄、且没陨落的子嗣 */
  adultOffspringCandidates() {
    const now = this.clockGameTime
    return (this.offspring?.list || []).filter(
      child => child.status !== 'fallen' && isAdult(child.birthTime, now)
    )
  },
  /** 拥有的灵宠（背包里的 + 当前出战的那只） */
  petCandidates() {
    const list = (this.items || []).filter(item => item && item.type === 'pet')
    const active = this.activePet
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
        damage: this.baseAttributes.attack,
        defense: this.totalDefense,
        speed: this.baseAttributes.speed,
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
   * 开始挑战。先扣 5 天，再预演第一段。
   * @param {{ offspringIds?: string[], petIds?: string[], permadeath?: boolean }} config
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
    const party = [
      ...offspringIds.map(id => ({ kind: 'offspring', id })),
      ...chosenPetIds.map(id => ({ kind: 'pet', id }))
    ].slice(0, TUNING.companionSlots)

    // 先切模式，再跳时间：garrisonLeftAtSeconds 记的是「离开的那一刻」
    this.switchIdleMode(MODES.SECRET_REALM)
    // 回放期间持有时钟：5 天已经扣了，看打斗的这几分钟不能再走游戏时间
    this.pauseClockForEvent('secretRealm')
    const now = Number(this.clockGameTime) || 0
    const target = runTimeTarget(now)
    skipTo(target)
    this.clockGameTime = target

    this.secretRealm.run = {
      status: 'fighting',
      floor: 1,
      highestFloorReached: 0,
      buffs: [],
      party,
      autoRetreatPct: this.secretRealm.retreatEnabled ? this.secretRealm.retreatThreshold : 0,
      permadeath: !!config.permadeath,
      startedAt: target,
      pendingBuff: null,
      result: null
    }
    this.secretRealm.stats.runs += 1
    this.dungeonTotalRuns += 1
    this.continueSecretRealmRun()
    this.saveData()
    return { ok: true }
  },

  /** 预演下一段（到下一个 Buff 门或挑战结束） */
  continueSecretRealmRun() {
    const run = this.secretRealm.run
    if (!run || run.status !== 'fighting') return

    const partyBase = this.buildSecretRealmParty(run)
    // 给视图用的轻量队伍快照（不含战斗过程状态）
    run.partyView = partyBase.map(unit => ({
      uid: unit.uid,
      name: unit.name,
      maxHealth: unit.stats.maxHealth,
      source: unit.source
    }))
    const segment = runSegment({
      run,
      partyBase,
      bossFirstClears: this.secretRealm.bossFirstClears,
      rng: Math.random
    })
    pendingFrames = segment.frames

    // 首破账本、最高层、掉落、阵亡 —— 先落账，再决定停在哪
    const oldFirstClears = Object.keys(this.secretRealm.bossFirstClears || {}).length
    this.secretRealm.bossFirstClears = segment.firstClears
    const newFirstClears = Object.keys(segment.firstClears || {}).length
    this.secretRealm.stats.firstClears += Math.max(newFirstClears - oldFirstClears, 0)
    this.secretRealm.highestFloor = Math.max(
      this.secretRealm.highestFloor,
      segment.run.highestFloorReached
    )
    this.secretRealm.highestBossCleared = Math.max(
      this.secretRealm.highestBossCleared,
      ...Object.keys(segment.firstClears).map(Number),
      0
    )
    this.applySecretRealmLoot(segment.loot)
    this.recordSecretRealmKills(segment.frames)
    this.recordSecretRealmDeaths(segment.deaths, segment.result?.floor || segment.run.floor)

    Object.assign(run, {
      floor: segment.run.floor,
      highestFloorReached: segment.run.highestFloorReached,
      buffs: segment.run.buffs,
      status: segment.run.status,
      pendingBuff: segment.pendingBuff || null
    })

    if (segment.result) {
      this.finishSecretRealmRun(segment.result)
      return
    }
    // 停在 Buff 门，等玩家选（或 10 秒后 autoChoose）
    this.saveData()
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

  /** 结算一次挑战：更新统计、英烈祠、旧 dungeon* 字段，然后回镇守 */
  finishSecretRealmRun(result) {
    const run = this.secretRealm.run
    if (run) {
      run.status = 'finished'
      run.result = result
      run.finishedAt = this.clockGameTime
    }
    const retreatOrWipe = result.outcome !== 'victory'
    // 旧成就页还读这些字段，保持更新（击杀数在 recordSecretRealmKills 里已累加）
    this.dungeonHighestFloor = Math.max(this.dungeonHighestFloor, this.secretRealm.highestFloor)
    const hasLoot = !!(
      result.loot &&
      (result.loot.spiritStones ||
        result.loot.refinementStones ||
        result.loot.herbs ||
        result.loot.pillFragments)
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

  /** 子嗣陨落：标记 fallen（不删条目），写英烈祠，返还少量修为 */
  recordSecretRealmDeaths(deaths = [], floor = 0) {
    if (!deaths.length) return
    const children = new Map((this.offspring?.list || []).map(c => [c.id, c]))
    for (const death of deaths) {
      const child = children.get(death.refId)
      if (!child || child.status === 'fallen') continue
      this.markOffspringFallen(child.id, { atSeconds: this.clockGameTime, floor })
      this.secretRealm.shrine.push({
        id: child.id,
        name: child.name,
        quality: child.quality,
        rootCount: child.rootCount,
        fate: child.fate,
        bestFloor: this.secretRealm.highestFloor,
        deathFloor: floor,
        diedAt: this.clockGameTime
      })
      this.secretRealm.stats.deaths += 1
      // 修行返还：按当前修为上限的一小部分返还（占位比例）
      const returned = Math.max(this.maxCultivation * TUNING.deathReturnRatio, 1)
      this.cultivate(returned)
    }
    this.saveData()
  },

  /** 掉落落到现有资源/物品体系；高阶功法/同参等真源表出来后再接 */
  applySecretRealmLoot(loot = emptyLoot()) {
    if (!loot) return
    this.spiritStones += Math.max(Number(loot.spiritStones) || 0, 0)
    this.refinementStones += Math.max(Number(loot.refinementStones) || 0, 0)
    for (let i = 0; i < (Number(loot.herbs) || 0); i += 1) {
      const herb = getRandomHerb()
      if (herb) this.herbs.push(herb)
    }
    for (let i = 0; i < (Number(loot.pillFragments) || 0); i += 1) {
      const recipe = pillRecipes[Math.floor(Math.random() * pillRecipes.length)]
      if (recipe) this.gainPillFragment(recipe.id)
    }
  },

  /** 扫荡：扣 5 天，按最后一个已通关 Boss 层结算基础掉落，不写首破 */
  startSecretRealmSweep() {
    if (this.secretRunActive) return { ok: false, reason: '已有挑战进行中' }
    if (this.idleMode !== MODES.GARRISON) return { ok: false, reason: '请先回镇守' }
    const cap = this.secretRealmSweepLimit
    if (!cap) return { ok: false, reason: '还没有可扫荡的 Boss 段' }

    const now = Number(this.clockGameTime) || 0
    const target = now + TUNING.timeCostDays * GAME_SECONDS_PER_DAY
    skipTo(target)
    this.clockGameTime = target
    // 这 5 天是「在家等」，没有离开镇守；dayLoop 的下一个 tick 必须以 target 为锚，
    // 否则会把 5 天当成「今天已经过去」补算一遍。
    this.resetDayLoop()
    this.applySecretRealmLoot(sweepLoot(cap, Math.random))
    this.secretRealm.stats.sweeps += 1
    this.dungeonTotalRuns += 1
    this.dungeonTotalRewards += 1
    this.saveData()
    return { ok: true, cap }
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

  /** 读档自愈：丢掉帧；Buff 门自动选最优；坏 run 直接收尾 */
  resetSecretRealmRuntime() {
    pendingFrames = []
    const run = this.secretRealm?.run
    if (!run) return
    if (!['fighting', 'buff', 'finished'].includes(run.status)) {
      this.secretRealm.run = null
      this.idleMode = MODES.GARRISON
      this.resumeClockFromEvent('secretRealm')
      return
    }
    if (run.status === 'finished') return
    // 挑战还没结束：读档后重新持有时钟暂停（clearEventPauses 刚把它清掉）
    this.pauseClockForEvent('secretRealm')
    // 队伍引用失效的成员清掉（子嗣可能已陨落/灵宠被卖）
    const adultIds = new Set(this.adultOffspringCandidates.map(c => c.id))
    const petIds = new Set(this.petCandidates.map(p => p.id))
    run.party = (run.party || []).filter(ref =>
      ref.kind === 'offspring' ? adultIds.has(ref.id) : petIds.has(ref.id)
    )
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
  }
}
