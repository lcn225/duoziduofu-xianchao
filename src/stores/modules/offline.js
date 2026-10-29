// 【离线结算】store 侧编排（模块九 v2.0，2026-10-26 B2）
//
// 分工：纯函数在 `plugins/offlineSimulation.js`（换算 / 切窗 / 报告聚合 / 探索与秘境驱动），
// 这里只做**唯一能读写 store 的那一层**：调各模块自己的推进函数、记快照、落报告。
//
// ⚠ 三条铁律：
//   1. **绝不调 `advance()` / `skipTo()`** —— 它们会补触发 day / month 边界钩子，
//      而离线游标自己已经显式调过内宅日结与月俸，两套一起就是双重结算。
//   2. **按 00:00 切窗、单段 ≤24 游戏小时** —— `stepDay` 有 128 次阶段转换的保险丝，
//      一次丢 180 天进去会静默丢进度。
//   3. **报告只信快照差与 action 返回值** —— `dayLoop.log` 上限 40、内宅流水上限 50，
//      180 天必然覆盖，从日志反推一定是错的。

import { MODES } from '../../plugins/idleMode.js'
import { locationById, TUNING as EXP_TUNING } from '../../plugins/exploration.js'
import { clampStartFloor } from '../../plugins/secretRealm.js'
import {
  GAME_SECONDS_PER_DAY,
  offlineGameDaysOf,
  offlineCappedOf,
  shouldSettleOffline,
  planOfflineWindows,
  createOfflineReport,
  absorbRewards,
  absorbObituary,
  addOfflineEvent,
  rewardsOfResolution,
  runOfflineExplorationSlice,
  createOfflineSecretRun,
  stepOfflineSecretRealmSegment,
  secretRunDaysOf
} from '../../plugins/offlineSimulation.js'
import { countUnits } from '../../plugins/stacks.js'

const num = (value, fallback = 0) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

const sumChests = chests =>
  Object.values(chests || {}).reduce((sum, n) => sum + Math.max(num(n), 0), 0)

export const state = () => ({
  /**
   * 离线汇总报告；非空 = 上线要弹「闭关归来」。
   * 只有「子嗣陨落」会让它带上 `pausedByFall`，并在读档末尾冻结时钟。
   */
  offlineReport: null
})

export const getters = {
  hasOfflineReport() {
    return !!this.offlineReport
  }
}

export const actions = {
  /**
   * 离线结算总入口（由 `persistence.initializePlayer` 在读档中途调用）。
   *
   * @param realSeconds    离开的现实秒数（`Date.now() − lastOnlineRealMs`）
   * @param fromGameSeconds 存档里的游戏时间（重放起点）
   * @returns 报告对象；不足 60 秒 / 数据非法时返回 null（不弹窗）
   */
  runOfflineSimulation({ realSeconds = 0, fromGameSeconds = 0 } = {}) {
    if (!shouldSettleOffline(realSeconds)) return null
    const from = Math.max(num(fromGameSeconds), 0)
    const capped = offlineCappedOf(realSeconds)
    // 只推进**结算得到的**天数：世界日历不出现「过了时间但没结算」
    const gameSeconds = Math.floor(offlineGameDaysOf(realSeconds) * GAME_SECONDS_PER_DAY)
    if (gameSeconds <= 0) return null

    const to = from + gameSeconds
    const mode = this.idleMode || MODES.GARRISON
    const report = createOfflineReport({
      realSeconds,
      fromGameSeconds: from,
      toGameSeconds: to,
      mode,
      capped
    })
    const before = this.offlineSnapshot()
    this.clockGameTime = from

    try {
      if (mode === MODES.EXPLORATION) this.settleOfflineExploration({ from, to, report })
      else if (mode === MODES.SECRET_REALM) this.settleOfflineSecretRealm({ from, to, report })
      else this.settleOfflineGarrison({ from, to, report })
    } finally {
      // 重放期间**不许**留着睡眠倍率（它是 gameClock 的模块闭包状态，$reset 清不掉）
      this.stopSleepFastForward?.()
    }

    // 药浴池（B4b）：镇守线由 `advanceDayLoop` 逐窗转换，探索 / 秘境不走那条线，
    // 所以在这里统一补到最后一个游戏秒 —— 否则报告里「转换了 X 件」会少掉整段离线。
    this.settleBathPool(this.clockGameTime)

    this.finalizeOfflineReport(report, before, this.offlineSnapshot())
    this.offlineReport = report
    return report
  },

  /** 报告确认（UI 调）：清报告，并释放「子嗣陨落」造成的时钟冻结 */
  acknowledgeOfflineReport() {
    const hadFall = !!this.offlineReport?.pausedByFall
    this.offlineReport = null
    if (hadFall) this.resumeClockFromEvent?.('offlineFall')
    this.saveData()
  },

  // ---------- 三种挂机模式 ----------

  /** 镇守：日常循环按天推；00:00 处插内宅日结与月俸 */
  settleOfflineGarrison({ from, to, report }) {
    const windows = planOfflineWindows({ fromGameSeconds: from, gameSeconds: to - from })
    let practiceGameSeconds = 0
    for (const window of windows) {
      const gained = this.advanceOfflineGarrisonWindow(window.to) || {}
      practiceGameSeconds += num(gained.spiritGameSeconds)
      report.cultivation.gained += num(gained.cultivationGained)
      // 炼体同样在镇守线里跑（`advanceDayLoop` 的 body 切片），但报告以前只显示修为（P53 #6）。
      // ⚠ 不能用 `counters.body` 差：`createDayState` / `rebaseDayState` 跨天会重置它。
      report.cultivation.bodyGained += num(gained.bodyCultivationGained)
      this.settleOfflineMidnight(window)
      report.windows += 1
      if (report.pausedByFall) break
    }
    this.clockGameTime = Math.min(this.clockGameTime, to)
    report.daysSettled = Math.max(this.clockGameTime - from, 0) / GAME_SECONDS_PER_DAY
    // 成就口径补偿：在线是「每个练功 tick +1」，离线按 900 游戏秒 = 1 现实秒折算。
    // 不补的话「累计修炼 7 天」这类成就在离线玩家身上永远推不动。
    const ticks = Math.floor(practiceGameSeconds / 900)
    if (ticks > 0) this.totalCultivationTime += ticks
  },

  advanceOfflineGarrisonWindow(toSeconds) {
    // 养伤：伤没好就整段跳过（不产出、不推进日常循环）
    const injuredUntil = num(this.injuryUntilSeconds)
    if (injuredUntil > num(this.clockGameTime)) {
      if (injuredUntil >= toSeconds) {
        this.clockGameTime = toSeconds
        return null
      }
      this.clockGameTime = injuredUntil
      this.advanceInjury?.(injuredUntil)
    }
    const result = this.advanceDayLoop(toSeconds, { syncClock: true, offline: true })
    this.clockGameTime = toSeconds
    return result || null
  },

  /** 探索：纯函数推事件 + 共用落账；战败记养伤，养好继续 */
  settleOfflineExploration({ from, to, report }) {
    const exp = this.exploration
    const location = exp?.locationId ? locationById(exp.locationId) : null
    if (!location) {
      // 地点被删 / 数据坏了：退回镇守口径，别让玩家 180 天白等
      this.settleOfflineGarrison({ from, to, report })
      return
    }
    const ctx = {
      location,
      playerLevel: this.level,
      knownQiArts: Object.keys(this.practice?.qiArts?.known || {}),
      tuning: EXP_TUNING
    }
    const windows = planOfflineWindows({ fromGameSeconds: from, gameSeconds: to - from })
    let session = exp
    let injury = num(this.injuryUntilSeconds)
    for (const window of windows) {
      const slice = runOfflineExplorationSlice({
        session,
        fromSeconds: window.from,
        toSeconds: window.to,
        injuryUntilSeconds: injury,
        ctx
      })
      session = slice.session
      injury = slice.injuryUntilSeconds
      this.exploration = session
      if (slice.resolutions.length) {
        this.applyExplorationBatch(slice.resolutions, { narrative: 'auto', nowSeconds: window.to })
        for (const resolution of slice.resolutions) {
          // 只记快照差看不见的两类；灵石/物品/宝匣统一由 finalizeOfflineReport 结算
          absorbRewards(report, rewardsOfResolution(resolution), {
            only: ['pill_fragment', 'qi_art']
          })
        }
      }
      if (slice.defeatedAt) {
        addOfflineEvent(report, '探索中重伤败退，养伤 12 个游戏日后继续上路。', 'warn')
      }
      this.clockGameTime = window.to
      this.settleOfflineMidnight(window)
      report.windows += 1
    }
    this.injuryUntilSeconds = injury
    this.clockGameTime = to
    report.daysSettled = Math.max(to - from, 0) / GAME_SECONDS_PER_DAY
  },

  /**
   * 秘境：按「趟」续跑。
   *
   * 与在线的差别只有两处：
   *   · `finishSecretRealmRun(..., { applyTime:false })` —— 不让它 `skipTo` 补触发日/月钩子；
   *   · Buff 门自动选（史诗 > 稀有 > 普通），不等人。
   * 子嗣陨落是**唯一暂停点**：先记账（英烈祠 / 修行返还都走在线同一套），再停。
   */
  settleOfflineSecretRealm({ from, to, report }) {
    const savedRun = this.secretRealm?.run
    const party = Array.isArray(savedRun?.party) ? savedRun.party : []
    if (!party.length) {
      // 没有队伍就没什么可跑的（脏档兜底）——退回镇守口径
      this.settleOfflineGarrison({ from, to, report })
      return
    }
    const startFloorBase = clampStartFloor(savedRun.startFloor, this.secretRealm.highestFloor)
    const permadeath = !!savedRun.permadeath
    let startFloor = startFloorBase
    let cursor = from
    let guard = 0

    while (cursor < to - 1e-9 && guard < 400 && !report.pausedByFall) {
      guard += 1
      const difficulty = Math.max(num(this.secretRealm.difficulty, 1), 1)
      // ⚠ `let`：内层循环必须把 run 往前推。写成 const 的话每一段都会拿最初那个
      //   run（floor = startFloor）重打一遍 1~5 层，一趟能刷出 20 份同段掉落
      //   （2026-10-27 修；`runSegment` 不改入参，返回值才是推进后的状态）。
      let run = createOfflineSecretRun({
        difficulty,
        startFloor,
        highestFloorReached: startFloor - 1,
        autoRetreatPct: savedRun.autoRetreatPct,
        permadeath
      })
      run.party = party
      // ⚠ 50 层首杀是「每难度一次」的持久账本。不带上它，离线续跑会重复发
      //   高一阶宝匣 + 洗命符（在线 `startSecretRealmRun` 也是这么接的）。
      run.finalBossFirstKill = !!this.secretRealm.finalBossFirstKill
      this.secretRealm.run = run
      this.secretRealm.stats.runs += 1
      this.dungeonTotalRuns = (num(this.dungeonTotalRuns) || 0) + 1
      this.clockGameTime = cursor

      let finished = false
      let segGuard = 0
      while (!finished && segGuard < 20) {
        segGuard += 1
        const partyBase = this.buildSecretRealmParty(run)
        if (!partyBase.length) {
          finished = true
          break
        }
        const segment = stepOfflineSecretRealmSegment({
          run,
          partyBase,
          bossFirstClears: this.secretRealm.bossFirstClears,
          rng: Math.random
        })
        this.secretRealm.run = segment.run
        run = segment.run
        this.applySecretRealmSegment(segment)
        // 资源走快照差；这里只补残页（`pillFragments` 没有可对齐的顶层计数）
        absorbRewards(report, this.offlineLootRewards(segment.loot), {
          only: ['pill_fragment']
        })
        if (segment.deaths?.length) {
          const names = this.offlineFallenNames(segment.deaths)
          // 讣告统一由 finalizeOfflineReport 的快照差记（见 settleOfflineMidnightsBetween 注释）
          report.pausedByFall = {
            names,
            floor: segment.result?.floor || segment.run?.floor || 0,
            difficulty
          }
          addOfflineEvent(report, `子嗣在秘境第 ${report.pausedByFall.floor} 层陨落，结算中断。`, 'danger')
          finished = true
          break
        }
        if (segment.result) {
          const days = secretRunDaysOf(segment.run)
          this.finishSecretRealmRun(segment.result, { applyTime: false })
          this.offlineNoteFirstClear(report, segment.result)
          // ⚠ `Math.max(days, 1)`：一层 Boss 都没通时在线成本是 0 天（`timeCostDaysOf`），
          //   离线直接照搬会变成「打一趟 0 天」的死循环。兜 1 天是**离线专属保险丝**，
          //   代价是极端情况少送 ≤1 天收益 —— 这是预期行为，不是 bug。
          const spanEnd = Math.min(cursor + Math.max(days, 1) * GAME_SECONDS_PER_DAY, to)
          this.settleOfflineMidnightsBetween(cursor, spanEnd)
          cursor = spanEnd
          // 通关 50 层：下一趟从第 1 层起，难度已由 finishSecretRealmRun 递增
          startFloor = segment.result.clearedDifficulty
            ? 1
            : clampStartFloor(savedRun.startFloor, this.secretRealm.highestFloor)
          finished = true
          break
        }
        // 停在 Buff 门：`stepOfflineSecretRealmSegment` 已经自动选好并继续
      }
      if (!this.secretRealm.run || this.secretRealm.run.status === 'fighting') {
        // 安全阀：没跑完但也没结果，别死循环
        cursor = Math.min(cursor + GAME_SECONDS_PER_DAY, to)
      }
      if (guard >= 400) break
    }
    this.clockGameTime = Math.min(cursor, to)
    report.daysSettled = Math.max(this.clockGameTime - from, 0) / GAME_SECONDS_PER_DAY
  },

  // ---------- 通用小工具 ----------

  /** 一个窗口跑完，如果正好跨过 00:00：内宅日结 + 月俸各一次 */
  settleOfflineMidnight(window) {
    this.settleOfflineMidnightsBetween(window.from, window.to)
  },

  /**
   * 把 (from, to] 里的每个 00:00 都补上一次内宅日结与月俸。
   *
   * ⚠ **讣告不在这里记**（2026-10-28 修）：`finalizeOfflineReport` 用「开始/结束快照差」
   *   统一统计死亡。以前这里按每个 00:00 增量记一遍，收尾时快照差再记一遍，
   *   同一批寿终会在报告里翻倍（180 天能刷出「妻妾 20 人已作古」而实际只死了 10 位）。
   *   秘境分支的 `absorbObituary` 同理，已删。
   */
  settleOfflineMidnightsBetween(fromSeconds, toSeconds) {
    let midnight = (Math.floor(num(fromSeconds) / GAME_SECONDS_PER_DAY) + 1) * GAME_SECONDS_PER_DAY
    while (midnight <= num(toSeconds) + 1e-9) {
      this.clockGameTime = midnight
      this.advanceInnerCourtDay(midnight, { silent: true })
      // 模块四封地：挂在同一个 00:00 结算点。资源差异由 offlineSnapshot 快照差自动覆盖，
      // 不需要在报告里另开字段（B3 口径）。
      this.advanceEstateDay(midnight, { silent: true })
      this.paySalaryUpTo(midnight, { announce: false })
      midnight += GAME_SECONDS_PER_DAY
    }
  },

  /** 开始 / 结束时的状态快照：报告里的资源差全部从这里来 */
  offlineSnapshot() {
    const list = this.offspring?.list || []
    return {
      stones: num(this.currency?.spiritual),
      secular: num(this.currency?.secular),
      // P57：一条可能是一整摞，报件数
      items: countUnits(this.items) + countUnits(this.herbs),
      chests: sumChests(this.chests),
      refinementStones: num(this.refinementStones),
      fateCharms: num(this.fateCharms),
      /** 药浴池累计转换件数 —— 用累计计数做差，别用存量差（存量会被投入 / 取出改变） */
      bathConverted: num(this.bath?.pool?.convertedTotal),
      offspring: list.length,
      rooted: list.filter(child => child?.hasRoot).length,
      level: num(this.level),
      realm: this.realm || '',
      cultivation: num(this.cultivation),
      breakthroughs: num(this.breakthroughCount),
      passedWives: this.offlinePassedWifeNames(),
      fallenIds: this.offlineFallenIds()
    }
  },

  offlinePassedWifeNames() {
    return (this.wives || []).filter(w => w?.status === 'passed_away').map(w => w.name)
  },

  offlineFallenIds() {
    return (this.offspring?.list || []).filter(c => c?.status === 'fallen').map(c => c.id)
  },

  offlineFallenNames(deaths = []) {
    const list = this.offspring?.list || []
    const names = []
    for (const death of deaths) {
      const child = list.find(c => String(c.id) === String(death.refId))
      if (child) names.push(child.name)
    }
    return names
  },

  /** 秘境掉落 → 报告用的「奖励描述」（不落账，只统计） */
  offlineLootRewards(loot = {}) {
    const rewards = []
    if (num(loot.spiritual) > 0) {
      rewards.push({ type: 'spiritual_stone', amount: num(loot.spiritual) })
    }
    if (num(loot.herbs) > 0) rewards.push({ type: 'herb', amount: num(loot.herbs) })
    if (num(loot.pillFragments) > 0) {
      rewards.push({ type: 'pill_fragment', amount: num(loot.pillFragments) })
    }
    if (num(loot.chests) > 0) rewards.push({ type: 'chest', amount: num(loot.chests) })
    if (num(loot.bonusChests) > 0) rewards.push({ type: 'chest', amount: num(loot.bonusChests) })
    return rewards
  },

  offlineNoteFirstClear(report, result = {}) {
    if (result?.clearedDifficulty) {
      addOfflineEvent(report, '秘境通关 50 层，解锁下一难度。', 'good')
    }
  },

  /** 报告收尾：快照差 + 修为 / 境界 / 突破 */
  finalizeOfflineReport(report, before, after) {
    if (!report) return
    report.gains.stones += Math.max(after.stones - before.stones, 0)
    report.gains.secular += Math.max(after.secular - before.secular, 0)
    report.gains.items += Math.max(after.items - before.items, 0)
    report.gains.chests += Math.max(after.chests - before.chests, 0)
    report.gains.refinementStones += Math.max(after.refinementStones - before.refinementStones, 0)
    report.gains.fateCharms += Math.max(after.fateCharms - before.fateCharms, 0)
    // 药浴池（§9.4）：转换件数用累计值做差；药力占比取五系里最高的那条，给一句直观的「池子满没满」
    if (report.bath) {
      report.bath.converted = Math.max(num(after.bathConverted) - num(before.bathConverted), 0)
      const pct = this.bathMedicinePct || {}
      report.bath.medicinePct = Math.round(Math.max(0, ...Object.values(pct).map(n => num(n))))
    }
    report.births.count = Math.max(after.offspring - before.offspring, 0)
    report.births.withSpiritRoot = Math.max(after.rooted - before.rooted, 0)
    // ⚠ 修为**不能**用快照差：突破会把 `cultivation` 清零，跨突破会算成 +0。
    //   真值来自 `advanceDayLoop` 逐切片返回的掷出量（`report.cultivation.gained` 已在结算时累加）。
    report.cultivation.fromRealm = before.realm
    report.cultivation.toRealm = after.realm
    report.cultivation.breakthroughCount = Math.max(after.breakthroughs - before.breakthroughs, 0)
    // 修为卡满又过不了门槛：报告要明说，别让玩家以为「挂了一夜没收益」
    if (this.isBreakthroughBlocked && after.cultivation >= this.maxCultivation) {
      report.cultivation.blocked = true
      addOfflineEvent(report, '修为已满，请上线更换功法 / 同参 / 灵地。', 'warn')
    }
    const newWives = after.passedWives.filter(name => !before.passedWives.includes(name))
    if (newWives.length) absorbObituary(report, { wives: newWives.map(name => ({ name })) })
    const newFallen = after.fallenIds.filter(id => !before.fallenIds.includes(id))
    if (newFallen.length) {
      const names = this.offlineFallenNames(newFallen.map(refId => ({ refId })))
      absorbObituary(report, { offspring: names.map(name => ({ name })) })
    }
    report.toGameSeconds = Math.max(num(this.clockGameTime), report.fromGameSeconds)
    report.gameSeconds = report.toGameSeconds - report.fromGameSeconds
    report.gameDays = report.gameSeconds / GAME_SECONDS_PER_DAY
    if (report.capped) {
      addOfflineEvent(report, `离线时长已触上限，只结算了 ${report.gameDays.toFixed(0)} 个游戏日。`, 'info')
    }
  },

}
