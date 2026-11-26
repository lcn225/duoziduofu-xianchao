// 离线探索的**期望值结算**（P62 阶段 E1，2026-11-14）
//
// 真源：《模块九》§3.5 · 《P62 离线结算 v3 · 设计方案（定稿）》步骤 4.1 ·
//       `design/new/P62 阶段 E 施工单.md`
//
// 为什么要有这个模块：离线 30,240 天的探索是 36 万个事件，逐个 `rollExploreEvent`
// 会卡死读档。这里把「一整段离线」当一次抽样，直接算**数学期望**：
//   · 事件数 / 战斗胜败 / 掉落阶 / 每件底材与成色 / 宝匣 / 功法，全部按概率展开；
//   · 落账时用**随机舍入**（`stochasticRound`）—— 期望严格无偏；
//   · **战败不再吃事件槽**（2026-11-26 #2，R75）：在线战败只作废当次事件、继续赶路，
//     所以这里直接按 `12 槽/天` 铺满，不再有 `q` 养伤折算。金丹段原本就无养伤，
//     现在各段同一条公式。
//
// 口径纪律：
//   · **在线一行不改**：线上仍走 `rollExploreEvent` / `advanceExploration`；
//   · 这里只从 `items.js` 的候选池函数读分布，不复制一份掉落表；
//   · 叙事事件按 `autoChoice` 确定性并入（㉓），**不做两支加权**。

import { eventWeightTable } from './locations.js'
import {
  ART_DROP_KIND,
  TUNING as EXPLORATION_TUNING,
  artDropPoolOf,
  battleWinChanceOf,
  coreEventSlotsOf,
  eventIntervalSeconds,
  tierBandOf
} from './exploration.js'
import {
  DEFAULT_QUALITY_WEIGHTS,
  eventBaseCandidatesOf,
  eventCandidateWeightsOf,
  isFixedQualityCategoryOf,
  qualityOfBaseOf
} from './items.js'
import { QI_ART_MAP } from './cultivationData.js'

const DAY = 86400
const num = (value, fallback = 0) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}
const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

/**
 * **随机舍入**：整数部分照拿，小数余数按概率多拿 1。
 * `E[stochasticRound(v)] === v` —— 这是「期望值不变」的落账保证。
 */
export const stochasticRound = (value, rng = Math.random) => {
  const v = num(value, 0)
  if (v <= 0) return 0
  const base = Math.floor(v)
  return base + (num(rng(), 0) < v - base ? 1 : 0)
}

/** 闭区间整数 roll 的期望（与 `rollIntRange` 同口径：[0,0] 直接 0） */
export const expectedIntRangeOf = (range = [0, 0]) => {
  const min = Math.ceil(num(range?.[0], 0))
  const max = Math.floor(num(range?.[1], min))
  if (max <= min) return Math.max(min, 0)
  return (min + max) / 2
}

/**
 * **任意一张权重表**的事件概率分布（与 `pickEventFromTable` 逐位同口径：
 * 按 weightPct 累加、末尾兜底接住「权重合计不足 100」的余量）。
 *
 * ⚠ 桂冈探索与子嗣历练用的是**两张不同的表**：
 *   · 桂冈 = `eventWeightTable(location)` → `eventProbabilitiesOf`；
 *   · 历练 = `childEventWeightTable(location)`（简化池：空包/采植/采材/战斗/拾遗）。
 *   2026-11-14 就踩过一次：模型拿桂冈表算历练，健康天数偏高 3.5%。
 *
 * @returns {{event: object, p: number}[]}
 */
export const probabilitiesOfTable = (table = []) => {
  const rows = []
  let acc = 0
  for (const row of table || []) {
    const p = Math.max(num(row.weightPct), 0) / 100
    rows.push({ event: row.event, p })
    acc += p
  }
  const last = rows[rows.length - 1]
  if (last) last.p += Math.max(1 - acc, 0)
  return rows.filter(row => row.p > 0)
}

export const eventProbabilitiesOf = location =>
  probabilitiesOfTable(eventWeightTable(location) || [])

const isBattleEvent = event => event?.category === 'battle' && !event?.noBattle

/** 叙事事件按 `autoChoice` 取实际生效的奖励规格（㉓；默认 help） */
const effectiveEventOf = event => {
  if (event?.category !== 'narrative') return event
  const auto = event?.narrative?.autoChoice || 'help'
  const option = (event?.narrative?.options || []).find(o => o.id === auto)
  if (!option || option.id !== 'help') return null
  return { ...event, reward: option.reward || event.reward }
}

const addBucket = (acc, key, amount, payload) => {
  if (!(amount > 0)) return
  const cur = acc.get(key)
  if (cur) {
    cur.amount += amount
    return
  }
  acc.set(key, { key, amount, ...payload })
}

/**
 * 一个事件的**期望奖励**（不掷骰），乘 `factor`（事件概率 × 胜率）累加进 `acc`。
 * 逐段镜像 `resolveEventRewards` 的五类：灵石 / 物品 / 残页 / 功法 / 宝匣。
 */
export const addExpectedRewardsOfEvent = (
  acc,
  { event, location, playerLevel = 1, knownQiArts = [], tuning = EXPLORATION_TUNING } = {},
  factor = 0
) => {
  const target = effectiveEventOf(event)
  if (!target || !(factor > 0)) return
  const spec = target.reward || {}
  const highTierChance = num(location?.highTierChance, tuning.defaultHighTierChance)
  const elementBias = location?.elementBias || null
  const lootUnrestricted = target.category === 'battle' || target.category === 'pickup'
  const band = tierBandOf(playerLevel)

  // 1. 灵石
  const stones = expectedIntRangeOf(spec.stones)
  if (stones > 0) addBucket(acc, 'stones', factor * stones, { type: 'spiritual_stone' })

  // 2. 物品：概率 × 件数 × 阶分布 × 底材分布 × 成色分布
  for (const itemSpec of spec.items || []) {
    const chance = num(itemSpec.chance, 1)
    if (chance < 1 && !(chance > 0)) continue
    const pDrop = clamp(chance, 0, 1)
    const eCount = expectedIntRangeOf(itemSpec.count || [1, 1])
    if (!(pDrop > 0) || !(eCount > 0)) continue
    const tierRows = []
    if (itemSpec.tierPolicy === 'high') tierRows.push({ tier: band.high, p: 1 })
    else if (itemSpec.tierPolicy === 'low') tierRows.push({ tier: band.low, p: 1 })
    else {
      const h = clamp(highTierChance, 0, 1)
      if (h < 1) tierRows.push({ tier: band.low, p: 1 - h })
      if (h > 0) tierRows.push({ tier: band.high, p: h })
    }
    const types = lootUnrestricted && itemSpec.category === '灵材' ? null : itemSpec.types
    for (const row of tierRows) {
      const list = eventBaseCandidatesOf({
        category: itemSpec.category,
        types,
        fallbackTypes: itemSpec.fallbackTypes,
        tier: row.tier
      })
      const weights = eventCandidateWeightsOf(list, elementBias)
      for (let i = 0; i < list.length; i += 1) {
        const base = list[i]
        const baseP = weights[i]
        if (!(baseP > 0)) continue
        // #8（2026-11-26）：灵材 / 灵植的成色是底材固有值，期望里塌成**一条**（概率 1）；
        // 灵器 / 灵兽仍按 50/30/15/5 展开。选 ③ 的理由就是「期望不变、方差归零」。
        const fixedQuality = isFixedQualityCategoryOf(base.category) ? qualityOfBaseOf(base.id) : null
        const qualityRows = fixedQuality ? [fixedQuality] : Object.keys(DEFAULT_QUALITY_WEIGHTS)
        for (const quality of qualityRows) {
          const pQ = fixedQuality ? 1 : num(DEFAULT_QUALITY_WEIGHTS[quality], 0)
          if (!(pQ > 0)) continue
          addBucket(acc, `item|${base.id}|${quality}`, factor * pDrop * eCount * row.p * baseP * pQ, {
            type: 'item',
            baseId: base.id,
            name: base.name,
            category: base.category,
            itemType: base.type,
            tier: base.tier,
            quality
          })
        }
      }
    }
  }

  // 3. 百艺残页
  if (spec.fragment) {
    const pDrop = clamp(num(spec.fragment.chance, 1), 0, 1)
    const eAmount = expectedIntRangeOf(spec.fragment.amount || [1, 1])
    if (pDrop > 0 && eAmount > 0) {
      addBucket(acc, 'fragment', factor * pDrop * eAmount, { type: 'craft_fragment' })
    }
  }

  // 4. 功法：池内每本均分；池空（该段已全学）→ 每次转 2 张百艺残页（与在线同口径）
  //    `spec.art.artId` = 指定书名（残碑）：必掉该本，`amount` = 每次几张。
  if (spec.art) {
    const pDrop = clamp(num(spec.art.chance, 1), 0, 1)
    const kind = spec.art.kind || ART_DROP_KIND.heartFragment
    const copies = Math.max(Math.round(num(spec.art.amount, 1)), 1)
    const fixedId = spec.art.artId ? String(spec.art.artId) : ''
    const eDrops = factor * pDrop
    if (!(eDrops > 0)) return
    if (fixedId) {
      const art = QI_ART_MAP[fixedId]
      const learned = new Set((knownQiArts || []).map(String)).has(fixedId)
      if (art && !learned) {
        addBucket(acc, `qi_art_fragment|${fixedId}`, eDrops * copies, {
          type: 'qi_art_fragment',
          artId: fixedId,
          name: art.name
        })
      } else {
        // 学会后：每次命中转 2 张百艺残页（不是每张残页转 2 张）
        addBucket(acc, 'fragment', eDrops * 2, { type: 'craft_fragment' })
      }
    } else {
      const pool = artDropPoolOf(kind, playerLevel)
      if (pool.length) {
        const each = eDrops / pool.length
        for (const artId of pool) {
          const art = QI_ART_MAP[artId]
          if (!art) continue
          const type = kind === ART_DROP_KIND.otherArt ? 'qi_art' : 'qi_art_fragment'
          addBucket(acc, `${type}|${artId}`, each, { type, artId, name: art.name })
        }
      } else {
        addBucket(acc, 'fragment', eDrops * 2, { type: 'craft_fragment' })
      }
    }
  }

  // 5. 宝匣：按 highTierChance 拆到段内低阶 / 高阶
  if (spec.chest) {
    const h = clamp(highTierChance, 0, 1)
    if (h < 1) addBucket(acc, `chest|${band.low}`, factor * (1 - h), { type: 'chest', tier: band.low })
    if (h > 0) addBucket(acc, `chest|${band.high}`, factor * h, { type: 'chest', tier: band.high })
  }
}

/**
 * 把 `addExpectedRewardsOfEvent` 累计出来的期望账本**落成奖励条目**。
 * 每个桶按 `stochasticRound` 取整 —— 期望严格无偏（㉓）。
 *
 * 提取成独立导出（2026-11-14，P62 方向 6）：子嗣历练的期望结算要同一套展开，
 * 避免第二份「宝匣/功法按条展开」的实现。
 *
 * @param {number} scale 账本整体倍率（P62 第二刀，2026-11-15）：子嗣历练缓存的是
 *   「单位健康日」账本，块内按健康天数一次乘上去，省掉每条事件重建一遍桶。
 */
export const expandExpectedBuckets = (acc, rng = Math.random, scale = 1) => {
  const rewards = []
  for (const bucket of (acc || new Map()).values()) {
    const count = stochasticRound(scale === 1 ? bucket.amount : bucket.amount * scale, rng)
    if (count <= 0) continue
    switch (bucket.type) {
      case 'spiritual_stone':
        rewards.push({ type: 'spiritual_stone', amount: count })
        break
      case 'item':
        rewards.push({
          type: 'item',
          baseId: bucket.baseId,
          name: bucket.name,
          category: bucket.category,
          itemType: bucket.itemType,
          tier: bucket.tier,
          quality: bucket.quality,
          count
        })
        break
      case 'craft_fragment':
        rewards.push({ type: 'craft_fragment', amount: count })
        break
      case 'chest':
        // 落账口一次只给 1 个（`applyExplorationReward` 读的是 tier 不是 amount），按条展开
        for (let i = 0; i < count; i += 1) rewards.push({ type: 'chest', tier: bucket.tier })
        break
      default:
        // qi_art / qi_art_fragment：一次掉落 = 1 本（残页同理），多出来的掉落按条展开
        for (let i = 0; i < count; i += 1) {
          rewards.push(
            bucket.type === 'qi_art'
              ? { type: 'qi_art', artId: bucket.artId, name: bucket.name }
              : { type: 'qi_art_fragment', artId: bucket.artId, name: bucket.name }
          )
        }
    }
  }
  return rewards
}

/**
 * **金丹大事件**（《探索系统》§9.3，2026-11-21 落地；真值表 §6.3c / 产出表 R70）。
 *
 * 一次结算 = `coreEventSlotsOf(TUNING)` 个旧事件槽（K = 84）的**等量期望**：
 *   · 事件表概率 × 胜率 按槽数铺开，走 `addExpectedRewardsOfEvent` 同一套账本；
 *   · 取整用 `stochasticRound` —— 期望严格无偏，只是**分布变粗**（事件更少更大）；
 *   · **不产养伤**：一次大事件把胜负混在一起，表现不了单次战败；平铺 84 不扣养伤
 *     比旧口径高 `q ≈ 10~30%`，已登 R70 作**收益增加**。
 *
 * ⚠ 叙事不弹窗：奖励按 `autoChoice`（默认「相助」）确定性并入（与离线同口径）。
 * ⚠ 金丹段的 `stats.events` 一次 +84：这是**旧事件槽数**，不是「结算次数」，
 *   成就与丹论计数靠它保持与旧口径同节奏。
 *
 * @returns {{kind:'big', category, eventId, eventName, text, rewards, narrative:null,
 *            eventCount:number, wins:number, losses:number, narratives:number, helpChoices:number}}
 */
export const resolveCoreBigEvent = ({
  location,
  playerLevel = 1,
  knownQiArts = [],
  tuning = EXPLORATION_TUNING,
  rng = Math.random
} = {}) => {
  const slots = Math.max(Math.round(coreEventSlotsOf(tuning)), 1)
  const probs = eventProbabilitiesOf(location)
  const winChance = battleWinChanceOf(playerLevel, location?.minLevel, tuning)
  const acc = new Map()
  let battleP = 0
  let narrativeP = 0
  let helpP = 0
  for (const row of probs) {
    const battle = isBattleEvent(row.event)
    addExpectedRewardsOfEvent(
      acc,
      { event: row.event, location, playerLevel, knownQiArts, tuning },
      slots * row.p * (battle ? winChance : 1)
    )
    if (battle) battleP += row.p
    if (row.event?.category === 'narrative') {
      narrativeP += row.p
      if ((row.event?.narrative?.autoChoice || 'help') === 'help') helpP += row.p
    }
  }

  const rewards = expandExpectedBuckets(acc, rng)
  const wins = stochasticRound(slots * battleP * winChance, rng)
  const losses = stochasticRound(slots * battleP * (1 - winChance), rng)
  const narratives = stochasticRound(slots * narrativeP, rng)
  const helpChoices = stochasticRound(slots * helpP, rng)
  return {
    kind: 'big',
    category: 'big',
    eventId: 'core_week',
    eventName: '金丹行止',
    text: `行了一周，遭遇 ${slots} 事（战 ${wins} 胜 ${losses} 负，叙事 ${narratives} 起）。`,
    rewards,
    narrative: null,
    eventCount: slots,
    wins,
    losses,
    narratives,
    helpChoices
  }
}

/** 合并键：同一份东西的奖励条目才合成一条；认不出的类型原样保留（不合并） */
const rewardMergeKeyOf = reward => {
  switch (reward?.type) {
    case 'spiritual_stone':
      return 'spiritual_stone'
    case 'item':
      // 与 `stacks.js` 的合并键同口径：底材 + 成色（灵器/灵宠也按件 push，件数相加等价）
      return `item|${reward.baseId}|${reward.quality || ''}`
    case 'craft_fragment':
      return 'craft_fragment'
    case 'chest':
      return `chest|${Number(reward.tier) || 1}`
    case 'qi_art':
      return `qi_art|${reward.artId || ''}`
    case 'qi_art_fragment':
      return `qi_art_fragment|${reward.artId || ''}`
    default:
      return ''
  }
}

/**
 * **奖励条目合并**（P62 阶段 H，2026-11-15）。
 *
 * 为什么要它：块结算里一个子嗣一块能展开出上千条奖励，10 人 × 168 块 ⇒ 上百万次
 * `applyExplorationReward`，每次都要穿三层 pinia action 包装 + Vue 响应式 `get/set`
 * —— 真档 profile 里这一项占 **6.6 秒**（`gainItemCount` 5.0 / `wrappedAction` 2.2）。
 * 合并成「底材 + 成色」一条后，落账次数按「唯一桶数量」算，两三个数量级往下掉。
 *
 * 口径：
 *   · `spiritual_stone` / `craft_fragment` 合 `amount`，`item` 合 `count`，
 *     `chest` / `qi_art` / `qi_art_fragment` 补 `count`（原来一条 = 1 件）；
 *   · **期望严格不变**：`E[round(a)+round(b)] = E[round(a+b)]`。
 *     但**单次结果不再逐位一致**（每人每块各自舍入 → 全族每块一起舍入），
 *     方差变小，属阶段 E「期望值 + 随机舍入」同一口径，不是产出增减；
 *   · 认不出的奖励类型不合并、原样保留，交给 `applyExplorationReward` 的告警分支。
 *
 * @returns {Array} 新数组（元素是新对象，不改入参）
 */
export const mergeRewardsOf = (rewards = []) => {
  const out = []
  const index = new Map()
  for (const reward of rewards || []) {
    if (!reward) continue
    const key = rewardMergeKeyOf(reward)
    if (!key) {
      out.push(reward)
      continue
    }
    const cur = index.get(key)
    if (!cur) {
      const copy = { ...reward }
      // 统一成「带 count 的件数条目」；`amount` 类保留 amount，不额外加 count
      if (copy.count === undefined && copy.type !== 'spiritual_stone' && copy.type !== 'craft_fragment') {
        copy.count = 1
      }
      index.set(key, copy)
      out.push(copy)
      continue
    }
    if (reward.type === 'spiritual_stone' || reward.type === 'craft_fragment') {
      cur.amount = num(cur.amount) + num(reward.amount)
    } else {
      cur.count = num(cur.count) + (reward.count === undefined ? 1 : num(reward.count))
    }
  }
  return out
}

/**
 * 一整段离线探索的期望结算（纯函数，不碰 store）。
 *
 * @returns {{
 *   events, wins, losses, narratives, helpChoices: number,
 *   rewards: Array, activeSeconds: number
 * }}
 *   奖励已经是**整数**（随机舍入后），可以直接交给 `applyExplorationReward`。
 */
export const planOfflineExplorationExpectation = ({
  location,
  playerLevel = 1,
  knownQiArts = [],
  fromSeconds = 0,
  toSeconds = 0,
  injuryUntilSeconds = 0,
  tuning = EXPLORATION_TUNING,
  rng = Math.random
} = {}) => {
  const empty = { events: 0, wins: 0, losses: 0, narratives: 0, helpChoices: 0, rewards: [], activeSeconds: 0 }
  if (!location) return empty
  const from = Math.max(num(fromSeconds), 0)
  const to = Math.max(num(toSeconds), from)
  const span = to - from
  if (!(span > 0)) return empty
  // 旧档残留的养伤：这段时间不产事件，但也不额外扣（已经发生过了）。
  // 2026-11-26 #2 起新战败不再产生养伤，只有老存档会走到这里。
  const injuredSeconds = clamp(num(injuryUntilSeconds) - from, 0, span)
  const activeSeconds = span - injuredSeconds

  /**
   * ⚠ 离线仍按**旧事件槽**（2 游戏小时）铺开，各段同一条公式。
   *   金丹在线一次大事件 = 84 槽 = 7 天 × 12 槽/天，与这里 12 槽/天 逐日用旧间隔铺开
   *   逐位等价；若按 1 周/槽 再乘 84，反而会把 `plan.events`（成就口径）压成 1/84。
   */
  const interval = eventIntervalSeconds(tuning)
  const slotsPerDay = DAY / interval
  const probs = eventProbabilitiesOf(location)
  const winChance = battleWinChanceOf(playerLevel, location.minLevel, tuning)

  let battleP = 0
  let narrativeP = 0
  for (const row of probs) {
    if (isBattleEvent(row.event)) battleP += row.p
    if (row.event?.category === 'narrative') narrativeP += row.p
  }

  /**
   * 战败只作废当次事件、不再吃额外的养伤槽（2026-11-26 #2，R75）：
   * 每事件占 1 槽，全部 12 槽/天照常结算。
   * 旧公式 `slots ÷ (1 + lossP × 6)` 与 `injuryDays` / `injuredDays` 已删除。
   */
  const days = activeSeconds / DAY
  const rawEvents = slotsPerDay * days

  const acc = new Map()
  for (const row of probs) {
    const winFactor = isBattleEvent(row.event) ? winChance : 1
    addExpectedRewardsOfEvent(
      acc,
      { event: row.event, location, playerLevel, knownQiArts, tuning },
      rawEvents * row.p * winFactor
    )
  }

  const rewards = expandExpectedBuckets(acc, rng)

  const wins = stochasticRound(rawEvents * battleP * winChance, rng)
  const losses = stochasticRound(rawEvents * battleP * (1 - winChance), rng)
  const narratives = stochasticRound(rawEvents * narrativeP, rng)
  return {
    events: stochasticRound(rawEvents, rng),
    wins,
    losses,
    narratives,
    helpChoices: narratives,
    rewards,
    activeSeconds
  }
}
