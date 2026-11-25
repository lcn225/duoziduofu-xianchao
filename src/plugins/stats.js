import { powerLevelOf, realmPanelMultiplierOf, speedMultiplierOf } from './realm.js'
import { TUNING } from './harmony.js'

// 属性映射配置
export const statNameMapping = {
  // 基础属性
  health: '生命值',
  maxHealth: '生命上限',
  attack: '攻击力',
  defense: '防御力',
  speed: '速度',
  // 战斗属性
  critRate: '暴击率',
  comboRate: '连击率',
  counterRate: '反击率',
  stunRate: '眩晕率',
  dodgeRate: '闪避率',
  vampireRate: '吸血率',
  // 战斗抗性
  critResist: '抗暴击',
  comboResist: '抗连击',
  counterResist: '抗反击',
  stunResist: '抗眩晕',
  dodgeResist: '抗闪避',
  vampireResist: '抗吸血',
  // 特殊属性
  healBoost: '强化治疗',
  critDamageBoost: '强化爆伤',
  critDamageReduce: '弱化爆伤',
  finalDamageBoost: '最终增伤',
  finalDamageReduce: '最终减伤',
  combatBoost: '战斗属性提升',
  resistanceBoost: '战斗抗性提升',
  // 装备词条的乘区属性（P36，2026-10-23）
  // ⚠ 这四条**不写进装备 stats**：生成时已经乘进这一件装备的白板/主副属性
  //   （《装备系统》§一：词条是这件装备的乘区，不是角色总面板的乘区）。
  //   留在这里是因为装备详情与词条表要按它出中文名。
  attackPct: '攻击加成',
  defensePct: '防御加成',
  healthPct: '生命加成',
  speedPct: '速度加成',
  // 其他属性
  cultivationRate: '修炼速率',
  spiritRate: '灵力获取',
  luck: '福缘'
}
// 获取属性的中文名称
export const getStatName = stat => {
  return statNameMapping[stat] || stat
}
// 格式化属性值（处理百分比和数值）
export const formatStatValue = (stat, value) => {
  // 处理null或undefined值
  if (value === null || value === undefined) {
    return '0'
  }
  // 这些属性需要显示为百分比
  const percentageStats = [
    'critRate',
    'comboRate',
    'counterRate',
    'stunRate',
    'dodgeRate',
    'vampireRate',
    'critResist',
    'comboResist',
    'counterResist',
    'stunResist',
    'dodgeResist',
    'vampireResist',
    'healBoost',
    'critDamageBoost',
    'critDamageReduce',
    'finalDamageBoost',
    'finalDamageReduce',
    'combatBoost',
    'resistanceBoost',
    'cultivationRate',
    'spiritRate',
    'luck'
  ]
  if (percentageStats.includes(stat)) {
    return `${(value * 100).toFixed(1)}%`
  }
  return value.toFixed(1)
}

// ---------- 桂冈四属性（P25 / 零散 #10，2026-11-16 定稿） ----------
//
// 真源《2026-11-16 属性公式目标态》§一 /《数值真值表》§5.10：
//   本体四属性 = 基础值 × 大境界基数 × 小境界乘数
//   最终面板   = 本体 + 装备 + 灵宠 + 炼体
//
// **乘区只乘本体**，装备/灵宠/炼体一律平加 —— 否则玩家换一件装备会被境界乘区放大，
// 倍率会随装备滚雪球。速度**不吃大境界基数**（2026-11-16 拍板），
// 走**接续斜坡** `speedMultiplierOf`（2026-11-25：练气 1.0~2.0 / 筑基 2.0~3.0 / 金丹 3.0~4.0，
// 破境不回落；旧「只吃小境界乘数」会让筑基一层比练气十层慢）。
//
// ⚠ 旧口径 `1 + 0.12 × powerLevelOf(层)` 已**整条作废**（用户评「突破没感觉」：
//   练气十层 → 筑基一层本体只 ×1.05）。新表见 `realm.js` 的
//   `realmBaseOf` / `subLevelMultiplierOf` / `realmPanelMultiplierOf`。

/** 四属性的键（顺序固定，断言与 UI 都按这个来） */
export const BASE_ATTRIBUTE_KEYS = ['attack', 'health', 'defense', 'speed']

export {
  REALM_BASE_TABLE,
  SUB_LEVEL_MULTIPLIERS,
  realmBaseOf,
  subLevelMultiplierOf,
  realmPanelMultiplierOf,
  speedMultiplierOf
} from './realm.js'

/**
 * 从「混着加成的 baseAttributes」里反推本体四属性。
 *
 * store 的 `baseAttributes` 同时存着本体 + 装备 + 灵宠（穿脱时原地加减），
 * 而乘区只能乘本体，所以要按记下的两份加成扣回去。
 */
export function innateAttributesOf({ base = {}, artifact = {}, pet = {} } = {}) {
  const out = {}
  for (const key of BASE_ATTRIBUTE_KEYS) {
    out[key] = (Number(base[key]) || 0) - (Number(artifact[key]) || 0) - (Number(pet[key]) || 0)
  }
  return out
}

/**
 * 桂冈四属性真值。
 * @param {{ level?: number, innate?: object, artifact?: object, pet?: object, body?: object }} p
 *   `body` 只给 health / defense（炼体加成，见 practice.js 的 `bodyBonus`）。
 */
export function playerPanel({ level = 1, innate = {}, artifact = {}, pet = {}, body = {} } = {}) {
  const mult = realmPanelMultiplierOf(level)
  const speedMult = speedMultiplierOf(level)
  const out = {}
  for (const key of BASE_ATTRIBUTE_KEYS) {
    out[key] =
      (Number(innate[key]) || 0) * (key === 'speed' ? speedMult : mult) +
      (Number(artifact[key]) || 0) +
      (Number(pet[key]) || 0) +
      (Number(body[key]) || 0)
  }
  return out
}

/**
 * 炼体加成（**唯一真源**，2026-11-25 从绝对值改成本体百分比）。
 *
 *   生命 + = floor(本体生命 × pct)      本体生命 = innate.health × 大境界基数 × 小境界乘数
 *   防御 + = floor(本体防御 × pct)      pct   = min(封顶, 每级占比 × L')
 *
 * `L'` = `powerLevelOf(外功层)`（18 格等效刻度）。参数在 `harmony.TUNING.body`。
 *
 * ⚠ **旧口径已作废**：`floor(20 × L' × (1 + L'/18))` 是 P25 之前的绝对值公式，
 *   本体 ×10 + 大境界基数 1/4/16 之后只剩金丹本体生命的 2.25%（真值表 §5.10 旧表）。
 *   改回绝对值会让「外功 84 小时 ≈ 内功 6 小时」的失衡复发。
 * ⚠ `bodyLevel = 0` 表示不练外功（`powerLevelOf(0)` 会兜到 1，必须显式挡掉）。
 */
export const bodyBonusOf = ({ bodyLevel = 0, level = 1, innate = {} } = {}) => {
  const lv = Number(bodyLevel) > 0 ? powerLevelOf(bodyLevel) : 0
  const mult = realmPanelMultiplierOf(level)
  const healthPct = Math.min(TUNING.body.healthPctCap, TUNING.body.healthPctPerLevel * lv)
  const defensePct = Math.min(TUNING.body.defensePctCap, TUNING.body.defensePctPerLevel * lv)
  // +1e-9 吸收二进制浮点误差：0.0155 × 11 × 4000 会算出 681.9999999999999，
  // 直接 floor 会少 1 点（差 1e-13，不是真值差分）
  const floorSafe = value => Math.floor(value + 1e-9)
  return {
    health: floorSafe((Number(innate.health) || 0) * mult * healthPct),
    defense: floorSafe((Number(innate.defense) || 0) * mult * defensePct)
  }
}
