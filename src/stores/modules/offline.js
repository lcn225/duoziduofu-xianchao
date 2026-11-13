// 【离线结算】store 侧编排（模块九 v2.0，2026-10-26 B2）
//
// 分工：纯函数在 `plugins/offlineSimulation.js`（换算 / 切窗 / 报告聚合 / 探索与秘境驱动），
// 这里只做**唯一能读写 store 的那一层**：调各模块自己的推进函数、记快照、落报告。
//
// ⚠ 三条铁律：
//   1. **绝不调 `advance()` / `skipTo()`** —— 它们会补触发 day / month 边界钩子，
//      而离线游标自己已经显式调过内宅日结与月俸，两套一起就是双重结算。
//   2. **按 00:00 切窗、单段 ≤24 游戏小时** —— `stepDay` 有 128 次阶段转换的保险丝，
//      一次丢 1,500 天进去会静默丢进度。
//   3. **报告只信快照差与 action 返回值** —— `dayLoop.log` 上限 40、内宅流水上限 50，
//      1,500 天必然覆盖，从日志反推一定是错的。

import { MODES } from '../../plugins/idleMode.js'
import { locationById, TUNING as EXP_TUNING } from '../../plugins/exploration.js'
import { clampStartFloor } from '../../plugins/secretRealm.js'
import {
  GAME_SECONDS_PER_DAY,
  OFFLINE_TUNING,
  OFFLINE_PHASES,
  offlinePhaseOfLevel,
  offlinePhasePlanOf,
  offlineBlockDaysOf,
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
import { countUnits, takeUnits } from '../../plugins/stacks.js'
// P62 阶段 D1：离线材料账本（块首建、块内扣、块末一次写回背包）
import { beginOfflineMaterialBag, endOfflineMaterialBag } from '../../plugins/arts.js'
import { addCurrency } from '../../plugins/currency.js'
import { setBreakthroughSilent } from '../../plugins/breakthroughNotice.js'

const num = (value, fallback = 0) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

const sumChests = chests =>
  Object.values(chests || {}).reduce((sum, n) => sum + Math.max(num(n), 0), 0)

/**
 * 离线跨段时的日记文案（键 = **新**相位）。
 * 只解释「为什么后面的天数突然变多」，不参与任何结算。
 */
const PHASE_BREAKTHROUGH_TEXT = {
  [OFFLINE_PHASES.FOUNDATION]: '闭关中破境筑基：此后一日只值四息，山外已是数年。',
  [OFFLINE_PHASES.CORE]: '闭关中结成金丹：此后一日只值半息，人间已过数十载。'
}

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
   * **按相位分段重放**（P55-c，分层时间）：练气期 1 游戏天 = 96 现实秒，
   * 筑基后 4 现实秒、金丹 ≈0.571 现实秒（2026-11-03 A1）。
   * 每段先按「当前境界的速率 + 该相位的配额」算出这一段能走多少游戏天，
   * 跑完再看境界变没变：
   *   · 变了（离线期间筑基 / 结丹）→ 剩下的**现实秒预算**按新速率换算，继续下一段；
   *   · 没变 → 这一段已经用掉预算或配额，结算结束。
   * 所以「下线时练气、离线期间筑基」不是按最终境界一刀切，而是每段各记各的账。
   *
   * ⚠ **筑基 / 金丹段的配额是过渡值 1,500 天**（2026-11-05 B1-a）：
   *   原则 A 的目标态是「现实时长对齐」= 1,500 只是「结算 ≤60 秒」的性能天花板，
   *   R34 聚合引擎落地后抬到 4,320 / 30,240（见 `OFFLINE_TUNING.maxGameDays`）。
   *
   * @param realSeconds    离开的现实秒数（`Date.now() − lastOnlineRealMs`）
   * @param fromGameSeconds 存档里的游戏时间（重放起点）
   * @returns 报告对象；不足 60 秒 / 数据非法时返回 null（不弹窗）
   */
  runOfflineSimulation({ realSeconds = 0, fromGameSeconds = 0 } = {}) {
    if (!shouldSettleOffline(realSeconds)) return null
    const from = Math.max(num(fromGameSeconds), 0)
    const mode = this.idleMode || MODES.GARRISON
    const report = createOfflineReport({ realSeconds, fromGameSeconds: from, mode })
    const before = this.offlineSnapshot()
    this.clockGameTime = from

    let budget = Math.max(num(realSeconds), 0)
    let cursor = from
    const usedDays = Object.fromEntries(
      Object.values(OFFLINE_PHASES).map(phase => [phase, 0])
    )

    // A1-3：重放期间**只记报告、不弹窗**（重放走 beginSaveBatch，弹窗会卡主线程）。
    // 报告里的数值走「开始/结束面板快照差」，所以这里静默不影响任何数字。
    // P62 阶段 C：重放开始前扫一次全族建活跃索引（之后每块只扫各桶）。
    this.beginOfflineCourtIndex?.(from)
    setBreakthroughSilent(true)

    try {
      for (let guard = 0; guard < OFFLINE_TUNING.maxPhases; guard += 1) {
        const phase = offlinePhaseOfLevel(this.level)
        const plan = offlinePhasePlanOf({
          realSecondsLeft: budget,
          phase,
          daysUsedInPhase: usedDays[phase]
        })
        if (!plan.days) break

        const segFrom = cursor
        const to = segFrom + plan.days * GAME_SECONDS_PER_DAY
        const end = this.settleOfflineRange({ from: segFrom, to, report })
        const days = Math.max(end - segFrom, 0) / GAME_SECONDS_PER_DAY
        usedDays[phase] += days
        budget = Math.max(budget - days * plan.rate, 0)
        cursor = Math.max(end, segFrom)
        report.phases.push({ phase, fromGameSeconds: segFrom, toGameSeconds: cursor, days })

        if (report.pausedByFall) break
        // 境界没变 ⇒ 这一段已经用尽预算或配额，收工
        const nextPhase = offlinePhaseOfLevel(this.level)
        if (nextPhase === phase) break
        // 境界变了 ⇒ 记一句，让玩家知道为什么后面的天数突然变多
        addOfflineEvent(
          report,
          PHASE_BREAKTHROUGH_TEXT[nextPhase] || '闭关中境界突破：时间流速再次加快。',
          'good'
        )
      }
    } finally {
      // 重放期间**不许**留着睡眠倍率（它是 gameClock 的模块闭包状态，$reset 清不掉）
      this.stopSleepFastForward?.()
      setBreakthroughSilent(false)
      // P62 阶段 C：索引只活在这段同步重放里，异常退出也要释放
      this.endOfflineCourtIndex?.()
    }
    this.clockGameTime = cursor

    // 药浴池（B4b）：镇守线由 `advanceDayLoop` 逐窗转换，探索 / 秘境不走那条线，
    // 所以在这里统一补到最后一个游戏秒 —— 否则报告里「转换了 X 件」会少掉整段离线。
    this.settleBathPool(this.clockGameTime)

    // 预算还有剩 = 被配额卡住了（子嗣陨落中断不算触顶）
    report.capped = budget > 1e-6 && !report.pausedByFall
    report.daysSettled = Math.max(this.clockGameTime - from, 0) / GAME_SECONDS_PER_DAY
    this.finalizeOfflineReport(report, before, this.offlineSnapshot())
    this.offlineReport = report
    return report
  },

  /** 一个相位的重放：按当前挂机模式分派到三套结算里的一条 */
  settleOfflineRange({ from, to, report }) {
    const mode = this.idleMode || MODES.GARRISON
    if (mode === MODES.EXPLORATION) return this.settleOfflineExploration({ from, to, report })
    if (mode === MODES.SECRET_REALM) return this.settleOfflineSecretRealm({ from, to, report })
    return this.settleOfflineGarrison({ from, to, report, stopAtPhaseChange: true })
  },

  /** 报告确认（UI 调）：清报告，并释放「子嗣陨落」造成的时钟冻结 */
  acknowledgeOfflineReport() {
    const hadFall = !!this.offlineReport?.pausedByFall
    this.offlineReport = null
    if (hadFall) this.resumeClockFromEvent?.('offlineFall')
    this.saveData()
  },

  // ---------- 三种挂机模式 ----------

  /**
   * 镇守：日常循环按天推；00:00 处插内宅日结与月俸。
   *
   * `stopAtPhaseChange`（P55-c）：逐窗检查境界，跨过筑基就**当场收尾**，
   * 把剩下的现实秒预算交给上面按新段位速率重新换算 —— 否则一次离线会把整段
   * 练气段配额（180 天 × 96 秒）吃光，玩家破境反而少拿。
   *
   * @returns 实际推进到的游戏秒（可能小于 `to`，见 `stopAtPhaseChange`）
   */
  settleOfflineGarrison({ from, to, report, stopAtPhaseChange = false }) {
    const phase0 = offlinePhaseOfLevel(this.level)
    // 块步长（2026-11-11）：练气 1 天 / 筑基 7 天 / 金丹 180 天。
    // 窗口仍按天切（`planOfflineWindows` 不动，午夜边界要对齐），但块内的
    // 日常循环 / 内宅 / 封地 / 药浴池全部按块结算 —— 精度换速度，见 OFFLINE_TUNING。
    const blockDays = offlineBlockDaysOf(phase0)
    const windows = planOfflineWindows({ fromGameSeconds: from, gameSeconds: to - from })
    let practiceGameSeconds = 0
    let endedAt = num(from)
    let blockFrom = num(from)
    // 块化（R34，2026-11-11）：块内第一天完整跑 `advanceDayLoop` 拿当天模板，
    // 其余天走 `applyOfflineDayTemplate` 补发（材料/药力照常扣，突破即停）。
    // P62 阶段 D2/D3：其余天从「逐日重放」改成「块内 N 天一次批量」。
    let i = 0
    while (i < windows.length) {
      const window = windows[i]
      // P62 阶段 D1：块首建材料账本，块末一次性写回背包。
      // 块内百艺 / 乡间自动 / 药浴都只扣账本（块内背包材料只减不增）。
      const bagOn = OFFLINE_TUNING.materialBag
      if (bagOn) beginOfflineMaterialBag(this.items)
      try {
        const gained = this.advanceOfflineGarrisonWindow(window.to) || {}
        practiceGameSeconds += num(gained.spiritGameSeconds)
        report.cultivation.gained += num(gained.cultivationGained)
        // 炼体同样在镇守线里跑（`advanceDayLoop` 的 body 切片），但报告以前只显示修为（P53 #6）。
        // ⚠ 不能用 `counters.body` 差：`createDayState` / `rebaseDayState` 跨天会重置它。
        report.cultivation.bodyGained += num(gained.bodyCultivationGained)
        let consumed = 1
        const room = Math.min(blockDays, windows.length - i)
        if (gained.dayTemplate && room > 1) {
          const extra = this.applyOfflineDayTemplate(gained.dayTemplate, room - 1, {
            startGameSeconds: window.to
          })
          consumed += num(extra.days)
          practiceGameSeconds += num(extra.spiritGameSeconds)
          report.cultivation.gained += num(extra.cultivationGained)
          report.cultivation.bodyGained += num(extra.bodyCultivationGained)
        }
        const last = windows[i + consumed - 1] || window
        // 天数 = 本块内跨过的 00:00 个数（首窗可能不是整天，与逐日路径同口径）
        let days = 0
        for (let k = i; k < i + consumed; k += 1) if (windows[k].endsAtMidnight) days += 1
        if (days > 0) {
          this.settleOfflineBlock({ from: blockFrom, to: last.to, days })
        }
        blockFrom = last.to
        endedAt = Math.max(endedAt, num(last.to))
        report.windows += consumed
        i += consumed
      } finally {
        if (bagOn) {
          // 块末：账本汇总的扣减一次性落回背包（只在真有消耗时碰 `items`）
          const spent = endOfflineMaterialBag()
          if (spent.length) this.items = takeUnits(this.items || [], spent)
        }
      }
      const phaseChanged = stopAtPhaseChange && offlinePhaseOfLevel(this.level) !== phase0
      if (report.pausedByFall) break
      if (phaseChanged) break
    }
    this.clockGameTime = endedAt
    // 成就口径补偿：在线是「每个练功 tick +1」，离线按 900 游戏秒 = 1 现实秒折算。
    // 不补的话「累计修炼 7 天」这类成就在离线玩家身上永远推不动。
    const ticks = Math.floor(practiceGameSeconds / 900)
    if (ticks > 0) this.totalCultivationTime += ticks
    return endedAt
  },

  advanceOfflineGarrisonWindow(toSeconds) {
    // P62 阶段 D2：块首把日常循环模型重锚到本块起点 —— 否则上一块只跑了 1 天、
    // `lastSeconds` 落后 blockDays-1 天，`stepDay` 会按 128 次保险丝多算 ~9 天，
    // 再被当成「一天模板」乘出去（离线产出放大一个量级）。
    this.rebaseOfflineDayLoop?.(num(this.clockGameTime))
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

  /**
   * 探索：纯函数推事件 + 共用落账；战败记养伤，养好继续。
   * @returns 实际推进到的游戏秒（探索不做相位中断，恒等于 `to`）
   */
  settleOfflineExploration({ from, to, report }) {
    const exp = this.exploration
    const location = exp?.locationId ? locationById(exp.locationId) : null
    if (!location) {
      // 地点被删 / 数据坏了：退回镇守口径，别让玩家 1,500 天白等
      return this.settleOfflineGarrison({ from, to, report })
    }
    const ctx = {
      location,
      playerLevel: this.level,
      knownQiArts: Object.keys(this.practice?.qiArts?.known || {}),
      tuning: EXP_TUNING
    }
    const windows = planOfflineWindows({ fromGameSeconds: from, gameSeconds: to - from })
    // 粗颗粒度（2026-11-11）：内宅 / 封地 / 药浴池与镇守线共用同一套块结算，
    // 探索事件本身仍逐窗推（事件是事件驱动的，便宜）。
    const blockDays = offlineBlockDaysOf(offlinePhaseOfLevel(this.level))
    let blockFrom = num(from)
    let pendingDays = 0
    let session = exp
    let injury = num(this.injuryUntilSeconds)
    for (let wi = 0; wi < windows.length; wi += 1) {
      const window = windows[wi]
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
            only: ['craft_fragment', 'qi_art']
          })
        }
      }
      if (slice.defeatedAt) {
        addOfflineEvent(report, '探索中重伤败退，养伤 12 个游戏日后继续上路。', 'warn')
      }
      this.clockGameTime = window.to
      if (window.endsAtMidnight) pendingDays += 1
      const isLast = wi === windows.length - 1
      if (pendingDays >= blockDays || isLast) {
        if (pendingDays > 0) {
          this.settleOfflineBlock({ from: blockFrom, to: window.to, days: pendingDays })
        }
        pendingDays = 0
        blockFrom = window.to
      }
      report.windows += 1
    }
    this.injuryUntilSeconds = injury
    this.clockGameTime = to
    return to
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
      return this.settleOfflineGarrison({ from, to, report })
    }
    const startFloorBase = clampStartFloor(savedRun.startFloor, this.secretRealm.highestFloor)
    const permadeath = !!savedRun.permadeath
    let startFloor = startFloorBase
    let cursor = from
    let guard = 0

    // 安全阀按「一个窗口一次」的量级走：1,500 天的配额下最多也就千余趟，
    // 沿用写死的 400 会静默截断（与 `planOfflineWindows` 的 maxWindows 同一个坑）。
    while (cursor < to - 1e-9 && guard < OFFLINE_TUNING.maxWindows && !report.pausedByFall) {
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
          rng: Math.random,
          // B11-a3：离线秘境同样吃消耗品。每段重读库存 —— 上一段已经扣过了，
          // 拿旧快照会把同一批丹药重复算给后面几段。
          consumables: this.secretRealmConsumableStock
        })
        this.secretRealm.run = segment.run
        run = segment.run
        this.applySecretRealmSegment(segment)
        // 资源走快照差；这里只补残页（`craftFragments` 没有可对齐的顶层计数）
        absorbRewards(report, this.offlineLootRewards(segment.loot), {
          only: ['craft_fragment']
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
          // 2026-11-11 粗颗粒度：一趟可能跨几年，一次算完（内部按 blockDays 切块）
          this.settleOfflineSpanByBlock(cursor, spanEnd)
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
    return this.clockGameTime
  },

  // ---------- 通用小工具 ----------

  /** 一个窗口跑完，如果正好跨过 00:00：内宅日结 + 月俸各一次 */
  settleOfflineMidnight(window) {
    this.settleOfflineMidnightsBetween(window.from, window.to)
  },

  /**
   * 把一段游戏时间按块切开逐块结算（秘境通关趟、跨段收尾用）。
   * 只结算**跨过 00:00** 的块 —— 与逐日线「只在午夜结算」的口径一致。
   */
  settleOfflineSpanByBlock(fromSeconds, toSeconds) {
    const blockDays = offlineBlockDaysOf(offlinePhaseOfLevel(this.level))
    const from = Math.max(num(fromSeconds), 0)
    const end = Math.max(num(toSeconds), from)
    let at = from
    let guard = 0
    while (at < end - 1e-9 && guard < OFFLINE_TUNING.maxWindows) {
      guard += 1
      const blockTo = Math.min(at + blockDays * GAME_SECONDS_PER_DAY, end)
      const days = Math.floor(blockTo / GAME_SECONDS_PER_DAY) - Math.floor(at / GAME_SECONDS_PER_DAY)
      if (days > 0) this.settleOfflineBlock({ from: at, to: blockTo, days })
      at = blockTo
    }
  },

  /**
   * **粗颗粒度块结算**（2026-11-11）：一次算 `days` 个游戏天。
   *
   * 三条挂机线（镇守 / 探索 / 秘境）都用它；块长 = `OFFLINE_TUNING.blockDays[phase]`。
   * 块内的近似口径（有意为之，不是 bug）：
   *   · 内宅日结一次带 `days` 倍率（子嗣修炼 / 家族工作 / 繁育），诞生与寿终按块末判定；
   *   · 封地**块内仍逐日算**（经营链有仓满刹车、税按游戏月判定，不能简单乘天数），
   *     但复印 / 钱袋 / 落盘合成块首块末各一次（P62 步骤 1，`OFFLINE_TUNING.estateBlock`）；
   *   · 药浴池块末转换一次（块内体魄结算看到的是块初药力）；
   *   · 俸禄一次补到块末（`paySalaryUpTo` 内部会按月补差）。
   *
   * **凡人四类产出落点**（P62 阶段 B，2026-11-13 · 《模块九》§3.6）：
   *   · 灵植 → 块末入背包（阶段 D1 的材料账本要求「块内只减不增」，所以**保持块末**：
   *     本块产的灵植下一块才可用 —— 有意为之的块粒度近似，总量不变、时点最多偏一个块长）；
   *   · 法器 → 块末入背包；
   *   · 现银 → 直接入账（`advanceFamilyJobs` 内）；
   *   · 灵石 → **封地块结算之后**才入账 ⇒ 下一块的第一天才能花（延迟账户同一口径）。
   *     这就是内宅调用带 `deferFamilyIncome` 的原因：扣下不落，块末再补。
   */
  settleOfflineBlock({ from, to, days }) {
    const span = Math.max(Math.floor(num(days)), 1)
    this.clockGameTime = to
    // 内宅：块末一次，带上 days 倍率；凡人岗位灵石先扣下（B2 落点见上方）
    // P62 阶段 C：`fromSeconds` 给「块内死了只算存活天数」用（家族工作收尾结清）
    const court = this.advanceInnerCourtDay(to, {
      silent: true,
      days: span,
      deferFamilyIncome: true,
      fromSeconds: from
    }) || {}
    // 封地：块内逐日算、块首块末各写一次（起点对齐到块内第一个 00:00）
    if (OFFLINE_TUNING.estateBlock && typeof this.advanceEstateBlock === 'function') {
      // C5：人口块首取一次 —— 内宅已按整块结算完，块内人口不变（与逐日读 getter 同值）。
      // 没有活跃索引（在线/mock）时 getter 返回 null，封地自己退回全族 filter。
      this.advanceEstateBlock({
        from,
        days: span,
        offspringCount: this.offlineCourtAliveCountOf?.()
      })
    } else {
      // 回滚路径（开关关掉 / mock store 没有块入口）：与改前逐位一致
      let midnight = (Math.floor(num(from) / GAME_SECONDS_PER_DAY) + 1) * GAME_SECONDS_PER_DAY
      for (let i = 0; i < span; i += 1) {
        // 块首 normalize 一次即可（`ensure:false`），逐日再跑一遍是纯浪费
        this.advanceEstateDay(midnight, { silent: true, ensure: i === 0 })
        midnight += GAME_SECONDS_PER_DAY
      }
    }
    // P62 阶段 B：凡人岗位灵石在封地块结算之后入账 —— 本块挣的、下一块才能花
    const familySpiritual = num(court.familyIncome?.spiritual)
    if (familySpiritual) {
      this.currency = addCurrency(this.currency, 'spiritual', familySpiritual)
    }
    // 飞鹰门按**墙钟**算现实秒，块内调一次就够（第一次就把离线经过的现实时间补上）
    this.advanceFactionReal(Date.now(), { silent: true })
    // 俸禄：一次补到块末（`salaryDueMonths` 会算这段时间里欠了几个月）
    this.paySalaryUpTo(to, { announce: false })
    // 药浴池：块末转换一次（离线 `advanceDayLoop` 已跳过逐日转换）
    this.settleBathPool(to)
  },

  /**
   * 把 (from, to] 里的每个 00:00 都补上一次内宅日结与月俸。
   *
   * ⚠ **讣告不在这里记**（2026-10-28 修）：`finalizeOfflineReport` 用「开始/结束快照差」
   *   统一统计死亡。以前这里按每个 00:00 增量记一遍，收尾时快照差再记一遍，
   *   同一批寿终会在报告里翻倍（1,500 天能刷出「妻妾 20 人已作古」而实际只死了 10 位）。
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
      // 模块五飞鹰门：任务到点结算 + 周/月任务池刷新。
      // ⚠ 它按**墙钟**算现实秒（96 现实秒 = 一游戏天），不用 `midnight` ——
      //   第一次调用就把离线经过的现实时间补上（上限 ≈4.8 小时），后续近似 0。
      this.advanceFactionReal(Date.now(), { silent: true })
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
      /** A1-3：四属性面板快照 —— 报告里的「攻 20.8（+3.6）」就靠它做差 */
      panel: { ...(this.combatPanel || {}) },
      cultivation: num(this.cultivation),
      breakthroughs: num(this.breakthroughCount),
      passedWives: this.offlinePassedWifeNames(),
      fallenIds: this.offlineFallenIds(),
      /** B1：寿终（passed_away）的子嗣 —— 与战死分开统计，离线报告合并成一行 */
      passedAwayOffspringIds: this.offlinePassedAwayOffspringIds()
    }
  },

  offlinePassedWifeNames() {
    return (this.wives || []).filter(w => w?.status === 'passed_away').map(w => w.name)
  },

  offlineFallenIds() {
    return (this.offspring?.list || []).filter(c => c?.status === 'fallen').map(c => c.id)
  },

  /** 寿终（老死）的子嗣 id —— 战死走 `fallen`，两个状态不能混为一谈 */
  offlinePassedAwayOffspringIds() {
    return (this.offspring?.list || []).filter(c => c?.status === 'passed_away').map(c => c.id)
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
    // 灵草退役（2026-11-08）：秘境掉落改记灵植；老档账本还是 `herbs`，按同名兜一下
    const plants = num(loot.plants ?? loot.herbs)
    if (plants > 0) rewards.push({ type: 'plant', amount: plants })
    if (num(loot.craftFragments) > 0) {
      rewards.push({ type: 'craft_fragment', amount: num(loot.craftFragments) })
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
    // A1-3：报告与弹窗同一套文案 —— 存前后面板，格式化成一行交给 OfflineReport
    report.cultivation.fromPanel = before.panel || null
    report.cultivation.toPanel = after.panel || null
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
    // B1：离线期间的**寿终**（老死）同样进讣告，与战死合并成一张名单
    const beforePassed = before.passedAwayOffspringIds || []
    const newPassed = (after.passedAwayOffspringIds || []).filter(
      id => !beforePassed.includes(id)
    )
    if (newPassed.length) {
      const names = this.offlineFallenNames(newPassed.map(refId => ({ refId })))
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
