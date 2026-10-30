// 境界体系
//
// 末世设定：此界连遭魔灾鬼灾兽灾，传承断绝，筑基已是大修，金丹只在传说中。
// 因此境界只有三段共 **30 级**，长度远小于通用修仙游戏。
//
//   内功（内练一口气）：练气一层~十层 → 筑基一层~十层 → 金丹一层~十层
//   外功（外练筋骨皮）：炼体一层~十层 → 锻骨一层~十层 → 洗髓一层~十层
//
// 两条线进度**互相独立**，不互为前置。
//
// 门槛节点（isGate / harmonyRequired）：突破时需满足**连乘综合契合度**（见 harmony.js）。
//
// 数值调整只改本文件的 CULTIVATION_CURVE，不要在别处硬编码。
//
// ⚠ **2026-10-30：18 级 → 30 级**（用户拍板「每个大境界 10 层」，与原作对齐；
//   「结丹」统一改称「金丹」）。两条线都是 10/10/10。
//   曲线按「**段总量守恒**」重排 —— 每个大境界的修为总量与原 18 级表完全相同
//   （练气 22,070 / 筑基 145,000 / 金丹 720,000；外功 17,680 / 116,000 / 576,000），
//   只是把原来 4 级的那一段切成 10 级，所以**宪法第二章的时间锚点一个字没动**。
//   段内按几何比爬升：筑基 r=1.10、金丹 r=1.14（外功同）。
//   老档迁移走 `mapLegacyRealmLevel`（初/中/后/圆满 → 一层/四层/七层/十层）。

/** 境界总级数（内外功各 30 级，取扁平索引 1..30） */
export const REALM_MAX_LEVEL = 30



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
 * | 筑基一层（11） | 换《万兽御器经》（0.7） | 0.7 × 0.623 = 0.436 | 0.55 → **0.40** |
 * | 金丹一层（21） | 换《兽器同源经》（0.8）+ 标签完全相同的同参（封顶 0.95） | 0.8 × 0.95 = 0.76 | 0.80 → **0.76** |
 *
 * 前两格不动：开局 0.108 仍被三层拦住，元氏/吕氏 × 猪妖 0.237 仍差一点过不了六层
 * （「六层必须先拿《兽器双修经》」这条硬口径原样成立）。
 *
 * ⚠ 金丹那格看着只降了 0.04，实际是**换了含义**：新引擎里「标签完全相同但不是同一件」
 *   封顶 0.95，所以 0.8 × 0.95 = 0.76 就是「完美同参」的天花板，门槛正好落在天花板上。
 *   三阶最好的非原物（变异恐獾 0.849）只值 0.679，过不了 —— 与旧版一样，
 *   金丹仍然要求「完美同参」，不是随便一件三阶灵兽。
 * ⚠ 进筑基门时玩家还是练气、只有一/二阶（三阶宝匣要筑基一层才解锁），
 *   所以筑基那格用的是**练气段**的 0.623，不是筑基段的 0.849。
 *   校准表：`npm run sim:companion`。
 *
 * ⚠ 2026-10-30 起金丹大门 = **21 级**（18 级时代是 15）。门槛值不变，只是层号跟着 30 级表挪了。
 */
export const BREAKTHROUGH_THRESHOLDS = { 3: 0.15, 6: 0.24, 9: 0.35, 11: 0.4, 21: 0.76 }

/**
 * 突破该级所需的**灵地品阶**——硬条件，不达标不能突破。
 * 品阶枚举见 tiers.js。
 */
const LAND_GATES = { 11: '1下', 21: '3' }

/**
 * 修为上限曲线（30 级）。
 *
 * **段总量守恒**（2026-10-30 从 18 级切开）：
 *   内功 —— 练气 22,070 / 筑基 145,000 / 金丹 720,000（与原 18 级表逐段相等）
 *   外功 —— 练气 17,680 / 锻骨 116,000 / 洗髓 576,000
 * 段内几何比：筑基 r=1.10、金丹 r=1.14（外功同）。所以宪法第二章的
 * 「筑基 3h→12h、金丹 24h→60h」时间锚点保持不变 —— 只是把一段切成 10 格。
 *
 * 练气段一个字没动（开局节奏不变）。
 */
const CULTIVATION_CURVE = {
  /**
   * 2026-10-21：练气一层 100 → **70**（用户「练气二层再快一点」）。
   * 当前实际产出约 1.5 修为/练功小时、默认一天只练 6 小时，
   * 100 要 11 天 ≈ 17.7 现实分钟；70 落到 7.6 天 ≈ **3 分钟**。
   * 只动第一格，二层以后曲线不变。
   */
  inner: [
    70, 150, 300, 450, 700, 1300, 2000, 3000, 5600, 8500,
    9100, 10010, 11010, 12110, 13320, 14650, 16120, 17730, 19500, 21450,
    37230, 42450, 48390, 55160, 62890, 71690, 81730, 93170, 106210, 121080
  ],
  outer: [
    80, 120, 240, 360, 560, 1040, 1600, 2400, 4480, 6800,
    7280, 8010, 8810, 9690, 10660, 11720, 12890, 14180, 15600, 17160,
    29790, 33960, 38710, 44130, 50310, 57350, 65380, 74540, 84970, 96860
  ]
}

const INNER_NAMES = [
  '练气一层', '练气二层', '练气三层', '练气四层', '练气五层',
  '练气六层', '练气七层', '练气八层', '练气九层', '练气十层',
  '筑基一层', '筑基二层', '筑基三层', '筑基四层', '筑基五层',
  '筑基六层', '筑基七层', '筑基八层', '筑基九层', '筑基十层',
  '金丹一层', '金丹二层', '金丹三层', '金丹四层', '金丹五层',
  '金丹六层', '金丹七层', '金丹八层', '金丹九层', '金丹十层'
]

const OUTER_NAMES = [
  '炼体一层', '炼体二层', '炼体三层', '炼体四层', '炼体五层',
  '炼体六层', '炼体七层', '炼体八层', '炼体九层', '炼体十层',
  '锻骨一层', '锻骨二层', '锻骨三层', '锻骨四层', '锻骨五层',
  '锻骨六层', '锻骨七层', '锻骨八层', '锻骨九层', '锻骨十层',
  '洗髓一层', '洗髓二层', '洗髓三层', '洗髓四层', '洗髓五层',
  '洗髓六层', '洗髓七层', '洗髓八层', '洗髓九层', '洗髓十层'
]

/** 1..10 练气/炼体，11..20 筑基/锻骨，21..30 金丹/洗髓 */
const tierOf = index => (index <= 10 ? 'qi' : index <= 20 ? 'foundation' : 'core')

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
 * 境界表由上游的 126 级压缩到本作刻度后，凡是把 level 当「修为量级」用的公式
 * （装备属性倍率、丹药效果、事件奖励）取值域会塌缩。这个系数只用于
 * **补偿幅度**，绝不能用在等级判定/穿戴门槛上——那会让门槛永久锁死。
 *
 * ⚠ **2026-10-30：基准钉在「18 格」上，不跟 `REALM_MAX_LEVEL` 走。**
 *   30 级表是 18 级表切出来的，同一段故事位置的「修为量级」没变；
 *   若让系数跟着变成 126/30，金丹段丹药会凭空弱 15%。
 *   所以凡是「拿 level 当量级」的公式，先把层号过一遍 `powerLevelOf`
 *   （练气不变、筑基 11..20 映射到 11..14、金丹 21..30 映射到 15..18），
 *   再乘本系数 —— 这样 18 级时代的所有数值一格都不动。
 */
export const POWER_LEVEL_SCALE = 126 / 18

/**
 * 30 级层号 → 原 18 级刻度的「等效层号」（仅供量级型公式用，不用于门槛/判定）。
 *   1..10   原样
 *   11..20  11 + (lv − 11) × 3/9   → 11..14
 *   21..30  15 + (lv − 21) × 3/9   → 15..18
 */
export const powerLevelOf = level => {
  const lv = Math.min(Math.max(Number(level) || 1, 1), REALM_MAX_LEVEL)
  if (lv <= 10) return lv
  if (lv <= 20) return 11 + ((lv - 11) * 3) / 9
  return 15 + Math.min(lv - 21, 9) * (3 / 9)
}

/**
 * **只读**：18 级时代的修为上限表（2026-10-30 之前的 `CULTIVATION_CURVE`）。
 *
 * 唯一用途是老档迁移 —— 把存档里「已攒的修为」按 `新上限/旧上限` 等比缩放，
 * 否则一个筑基于 60,000 满格的老号迁过来会直接掉到筑基六层。
 * **新逻辑一律不准读这两张表**（门槛、产出、显示都走 `innerRealms` / `outerRealms`）。
 */
export const LEGACY_18_CURVE = {
  inner: [70, 150, 300, 450, 700, 1300, 2000, 3000, 5600, 8500, 18000, 27000, 40000, 60000, 120000, 160000, 200000, 240000],
  outer: [80, 120, 240, 360, 560, 1040, 1600, 2400, 4480, 6800, 14400, 21600, 32000, 48000, 96000, 128000, 160000, 192000]
}

/** 老档某层的修为上限（越界/脏值返回 1，迁移时当「没有进度」处理） */
export const legacyMaxCultivationOf = (level, path = 'inner') => {
  const lv = Math.floor(Number(level) || 0)
  const table = path === 'outer' ? LEGACY_18_CURVE.outer : LEGACY_18_CURVE.inner
  return table[lv - 1] || 1
}

/**
 * 老档层号迁移：18 级表 → 30 级表。
 *   练气 1..10 → 原样
 *   筑基 初/中/后/圆满（11..14） → 筑基 一/四/七/十层（11/14/17/20）
 *   结丹 初/中/后/圆满（15..18） → 金丹 一/四/七/十层（21/24/27/30）
 * 语义是「在原大境界里走到第几成」—— 初=1/4、中=2/4、后=3/4、圆满=4/4。
 * 已迁移过的档（> 18）原样返回，配合 `realmScaleVersion` 幂等。
 */
export const mapLegacyRealmLevel = level => {
  const lv = Math.floor(Number(level) || 0)
  if (!Number.isFinite(lv) || lv <= 0) return 0
  if (lv <= 10) return lv
  if (lv <= 14) return 11 + (lv - 11) * 3
  if (lv <= 18) return 21 + (lv - 15) * 3
  return Math.min(lv, REALM_MAX_LEVEL)
}

const clamp = level => {
  const n = Math.floor(Number(level))
  if (!Number.isFinite(n)) return 1
  return Math.min(Math.max(n, 1), REALM_MAX_LEVEL)
}

const lineOf = path => (path === 'outer' ? outerRealms : innerRealms)

/**
 * 取指定境界的完整记录。
 * 注意：返回的是**整个对象**，调用方一般取 .name / .maxCultivation。
 * 越界不再返回 undefined，而是钳制到 1..30 —— 避免脏数据/掉级导致读取崩溃。
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
 * **筑基以上（含筑基一层 = 11 级）**？
 *
 * 这是「双层时间」的唯一分界点（《时间刻度修订方案（2026-10-29）》）：
 * 练气期 1:1（1 游戏天 = 96 现实秒），筑基后 24×（1 游戏天 = 4 现实秒）。
 * 时钟（P55-b）和离线配额（P55-c）都读这里，**不要在别处再判一次等级**。
 */
export const isAscendedLevelOf = level => realmTierOf(level) !== 'qi'

/** 境界段：'qi'（练气/炼体）· 'foundation'（筑基/锻骨）· 'core'（金丹/洗髓） */
export const realmTierOf = (level, path = 'inner') => getRealmName(level, path).tier

/** 突破到该级所需的综合契合度（普通小境界返回 0） */
export const getBreakthroughRequirement = (level, path = 'inner') => getRealmName(level, path).harmonyRequired

/** 突破到该级所需的灵地品阶（无要求返回 null） */
export const getLandTierRequirement = (level, path = 'inner') => getRealmName(level, path).spiritLandRequired

/** 是否已达当前线路的顶（金丹十层 / 洗髓十层） */
export const isMaxRealm = (level, path = 'inner') => clamp(level) >= REALM_MAX_LEVEL
