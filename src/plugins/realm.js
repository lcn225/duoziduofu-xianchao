// 境界体系
//
// 末世设定：此界连遭魔灾鬼灾兽灾，传承断绝，筑基已是大修，金丹只在传说中。
// 因此境界只有三段共 18 级，长度远小于通用修仙游戏。
//
//   内功（内练一口气）：练气一层~十层 → 筑基初/中/后/圆满 → 结丹初/中/后/圆满
//   外功（外练筋骨皮）：炼体一层~十层 → 锻骨初/中/后/圆满 → 洗髓初/中/后/圆满
//
// 两条线进度**互相独立**，不互为前置。
//
// 门槛节点（isGate / harmonyRequired）：突破时需满足**连乘综合契合度**（见 harmony.js）。
//
// 数值调整只改本文件的 CULTIVATION_CURVE，不要在别处硬编码。

/** 境界总级数（内外功各 18 级，取扁平索引 1..18） */
export const REALM_MAX_LEVEL = 18

/**
 * 突破该级所需的**综合契合度**（功法 × 同参 × 灵地，连乘；见 harmony.js）。
 * 未列出的是普通小境界，无门槛。
 *
 * 连乘基准（2026-10-18）：旧加权制的 0.55 / 0.60 / 0.68 / 0.71 / 0.85 已整表废弃。
 */
/**
 * 突破门槛（综合契合度）。
 *
 * **2026-10-28（B7）随同参标签引擎一次性重算** —— 旧表 0.15/0.24/0.40/0.55/0.80
 * 是按六档台阶（0.4/0.6/0.8/1.0）配的，连续值下 0.40 之后的三个门槛全部失效：
 * 练气段（一/二阶掉落）最好的同参只有 0.623，`0.6 × 0.623 = 0.374`
 * 已经顶到天花板，0.40 从此不可达。
 *
 * 新表的锚点（同参 = 该阶段拿得到的最好标签组合，详见《数值真值表》§2.5）：
 *
 * | 门槛 | 玩家动作 | 新综合 | 旧值 |
 * |---|---|---:|---:|
 * | 练气三层 | 换功法（吕氏/元氏 0.38） | 0.38 × 0.541 = 0.206 | 0.15 |
 * | 练气六层 | 换《兽器双修经》（0.6） | 0.6 × 0.541 = 0.325 | 0.24 |
 * | 练气九层 | 再把同参换到 0.623（猪妖系） | 0.6 × 0.623 = 0.374 | 0.40 → **0.35** |
 * | 筑基初期 | 换《万兽御器经》（0.7） | 0.7 × 0.623 = 0.436 | 0.55 → **0.40** |
 * | 结丹初期 | 换《兽器同源经》（0.8）+ 标签完全相同的同参（封顶 0.95） | 0.8 × 0.95 = 0.76 | 0.80 → **0.76** |
 *
 * 前两格不动：开局 0.108 仍被三层拦住，元氏/吕氏 × 猪妖 0.237 仍差一点过不了六层
 * （「六层必须先拿《兽器双修经》」这条硬口径原样成立）。
 *
 * ⚠ 结丹那格看着只降了 0.04，实际是**换了含义**：新引擎里「标签完全相同但不是同一件」
 *   封顶 0.95，所以 0.8 × 0.95 = 0.76 就是「完美同参」的天花板，门槛正好落在天花板上。
 *   三阶最好的非原物（变异恐獾 0.849）只值 0.679，过不了 —— 与旧版一样，
 *   结丹仍然要求「完美同参」，不是随便一件三阶灵兽。
 * ⚠ 进筑基门时玩家还是练气、只有一/二阶（三阶宝匣要筑基一层才解锁），
 *   所以筑基那格用的是**练气段**的 0.623，不是筑基段的 0.849。
 *   校准表：`npm run sim:companion`。
 */
export const BREAKTHROUGH_THRESHOLDS = { 3: 0.15, 6: 0.24, 9: 0.35, 11: 0.4, 15: 0.76 }

/**
 * 突破该级所需的**灵地品阶**——硬条件，不达标不能突破。
 * 品阶枚举见 tiers.js。
 */
const LAND_GATES = { 11: '1下', 15: '3' }

/**
 * 修为上限曲线：基础几何比 1.5，门槛级额外跳一档。
 * 内功末级 24 万，外功同构但整体约低 20%。
 */
const CULTIVATION_CURVE = {
  /**
   * 2026-10-21：练气一层 100 → **70**（用户「练气二层再快一点」）。
   * 当前实际产出约 1.5 修为/练功小时、默认一天只练 6 小时，
   * 100 要 11 天 ≈ 17.7 现实分钟；70 落到 7.6 天 ≈ **3 分钟**。
   * 只动第一格，二层以后曲线不变。
   */
  inner: [70, 150, 300, 450, 700, 1300, 2000, 3000, 5600, 8500, 18000, 27000, 40000, 60000, 120000, 160000, 200000, 240000],
  outer: [80, 120, 240, 360, 560, 1040, 1600, 2400, 4480, 6800, 14400, 21600, 32000, 48000, 96000, 128000, 160000, 192000]
}

const INNER_NAMES = [
  '练气一层', '练气二层', '练气三层', '练气四层', '练气五层',
  '练气六层', '练气七层', '练气八层', '练气九层', '练气十层',
  '筑基初期', '筑基中期', '筑基后期', '筑基圆满',
  '结丹初期', '结丹中期', '结丹后期', '结丹圆满'
]

const OUTER_NAMES = [
  '炼体一层', '炼体二层', '炼体三层', '炼体四层', '炼体五层',
  '炼体六层', '炼体七层', '炼体八层', '炼体九层', '炼体十层',
  '锻骨初期', '锻骨中期', '锻骨后期', '锻骨圆满',
  '洗髓初期', '洗髓中期', '洗髓后期', '洗髓圆满'
]

/** 1..10 练气/炼体，11..14 筑基/锻骨，15..18 结丹/洗髓 */
const tierOf = index => (index <= 10 ? 'qi' : index <= 14 ? 'foundation' : 'core')

const buildLine = (names, curve, path) =>
  names.map((name, i) => {
    const index = i + 1
    const gate = BREAKTHROUGH_THRESHOLDS[index]
    const landGate = LAND_GATES[index]
    return {
      index,
      name,
      path,
      tier: tierOf(index),
      maxCultivation: curve[i],
      isGate: gate !== undefined,
      harmonyRequired: gate ?? 0,
      spiritLandRequired: landGate ?? null
    }
  })

export const innerRealms = buildLine(INNER_NAMES, CULTIVATION_CURVE.inner, 'inner')
export const outerRealms = buildLine(OUTER_NAMES, CULTIVATION_CURVE.outer, 'outer')

export const INITIAL_REALM_NAME = innerRealms[0].name
export const INITIAL_BODY_REALM_NAME = outerRealms[0].name

/**
 * 数值尺度补偿系数。
 *
 * 境界表由上游的 126 级压缩到 18 级后，凡是把 level 当「修为量级」用的公式
 * （装备属性倍率、丹药效果、事件奖励）取值域塌缩约 7 倍。这个系数只用于
 * **补偿幅度**，绝不能用在等级判定/穿戴门槛上——那会让门槛永久锁死。
 */
export const POWER_LEVEL_SCALE = 126 / REALM_MAX_LEVEL

const clamp = level => {
  const n = Math.floor(Number(level))
  if (!Number.isFinite(n)) return 1
  return Math.min(Math.max(n, 1), REALM_MAX_LEVEL)
}

const lineOf = path => (path === 'outer' ? outerRealms : innerRealms)

/**
 * 取指定境界的完整记录。
 * 注意：返回的是**整个对象**，调用方一般取 .name / .maxCultivation。
 * 越界不再返回 undefined，而是钳制到 1..18 —— 避免脏数据/掉级导致读取崩溃。
 */
export const getRealmName = (level, path = 'inner') => lineOf(path)[clamp(level) - 1]

/** 外功（炼体）境界 */
export const getBodyRealmName = level => getRealmName(level, 'outer')

/** 境界总级数（内功，与外功相同） */
export const getRealmLength = () => REALM_MAX_LEVEL

/** 按名称反查（内外功都查） */
export const getRealmByName = name => [...innerRealms, ...outerRealms].find(r => r.name === name) || null

/** 该级是否为门槛节点 */
export const isGateLevel = (level, path = 'inner') => getRealmName(level, path).isGate

/**
 * **筑基以上（含筑基初期 = 11 级）**？
 *
 * 这是「双层时间」的唯一分界点（《时间刻度修订方案（2026-10-29）》）：
 * 练气期 1:1（1 游戏天 = 96 现实秒），筑基后 24×（1 游戏天 = 4 现实秒）。
 * 时钟（P55-b）和离线配额（P55-c）都读这里，**不要在别处再判一次等级**。
 */
export const isAscendedLevelOf = level => realmTierOf(level) !== 'qi'

/** 境界段：'qi'（练气/炼体）· 'foundation'（筑基/锻骨）· 'core'（结丹/洗髓） */
export const realmTierOf = (level, path = 'inner') => getRealmName(level, path).tier

/** 突破到该级所需的综合契合度（普通小境界返回 0） */
export const getBreakthroughRequirement = (level, path = 'inner') => getRealmName(level, path).harmonyRequired

/** 突破到该级所需的灵地品阶（无要求返回 null） */
export const getLandTierRequirement = (level, path = 'inner') => getRealmName(level, path).spiritLandRequired

/** 是否已达当前线路的顶（结丹圆满 / 洗髓圆满） */
export const isMaxRealm = (level, path = 'inner') => clamp(level) >= REALM_MAX_LEVEL
