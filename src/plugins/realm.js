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
// 门槛节点（isGate / harmonyRequired）：突破时需满足四维契合度。本阶段只落数据，
// 契合度校验留待「修行与突破」模块实现。
//
// 数值调整只改本文件的 CULTIVATION_CURVE，不要在别处硬编码。

/** 境界总级数（内外功各 18 级，取扁平索引 1..18） */
export const REALM_MAX_LEVEL = 18

/** 突破该级所需的四维契合度；未列出的是普通小境界，无门槛 */
const GATES = { 3: 0.2, 6: 0.5, 9: 0.75, 11: 0.8, 15: 1.0 }

/**
 * 修为上限曲线：基础几何比 1.5，门槛级额外跳一档。
 * 内功末级 24 万，外功同构但整体约低 20%。
 */
const CULTIVATION_CURVE = {
  inner: [100, 150, 300, 450, 700, 1300, 2000, 3000, 5600, 8500, 18000, 27000, 40000, 60000, 120000, 160000, 200000, 240000],
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
    const gate = GATES[index]
    return {
      index,
      name,
      path,
      tier: tierOf(index),
      maxCultivation: curve[i],
      isGate: gate !== undefined,
      harmonyRequired: gate ?? 0
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

/** 突破到该级所需的四维契合度（普通小境界返回 0） */
export const getBreakthroughRequirement = (level, path = 'inner') => getRealmName(level, path).harmonyRequired

/** 是否已达当前线路的顶（结丹圆满 / 洗髓圆满） */
export const isMaxRealm = (level, path = 'inner') => clamp(level) >= REALM_MAX_LEVEL
