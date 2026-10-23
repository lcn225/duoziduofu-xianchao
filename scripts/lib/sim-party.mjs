// 秘境**校准队伍**的唯一构造口（P36 第 6 步，2026-10-23）
//
// `sim-realm.mjs` 的反推表和 `verify-idle.mjs` 的锚点断言都从这里取队伍：
// 两边各写一套「装备档 / 桂冈怎么算」必然走样，而这个文件的偏移会直接改难度曲线。
//
// 口径（2026-10-23 拍板，真源《装备系统》§十七 第 5 条 +《三大挂机》§4.8）：
//   · 队伍 = 桂冈 + 3 名同境界单灵根子嗣（秘境实机队伍就是这个形状）
//   · 装备 = 练气段上限 **T2 中品**（子嗣 攻/防 两槽、桂冈 5 槽都用这一档）
//   · 桂冈面板走生产公式 `playerPanel`：本体 ×(1 + 0.12×内功层数) + 装备 + 炼体
//
// ⚠ 改这里的任何一项都等于改难度。改完必须重跑 `npm run sim:realm -- --solve`，
//   并把新表写回《数值真值表》§6.4b。
import { buildOffspringUnit, buildPlayerUnit, cloneUnit } from '../../src/plugins/secretRealm.js'
import { generateEquipment } from '../../src/plugins/equipment.js'
import { playerPanel } from '../../src/plugins/stats.js'

/** 校准装备：练气段最高只能穿 T2（`offspringEquipment.SEGMENT_MAX_TIER`），成色取中品 */
export const CALIBRATION_GEAR = { tier: 2, quality: '中' }

/** 桂冈五槽（顺序固定）；子嗣只穿前两槽，见 `OFFSPRING_EQUIP_SLOTS` */
export const LORD_SLOTS = [
  { slot: 'weapon', type: '飞剑' },
  { slot: 'body', type: '盾' },
  { slot: 'head', type: '冠' },
  { slot: 'accessory', type: '牌' },
  { slot: 'artifact', type: '幡' }
]

/** 桂冈本体四属性（`stores/modules/attributes.js` 的 state 初值） */
export const LORD_INNATE = { attack: 10, health: 100, defense: 5, speed: 10 }

/** 可复现随机源（mulberry32）；每件装备一个独立种子，改生成顺序不会串味 */
const seeded = seed => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/**
 * 生成一件模拟装备（走生产代码 `generateEquipment`，不手抄数值）。
 * series 固定 `sim` → 主属性浮动与二选一稳定；词条用固定种子 → 两次跑结果一致。
 */
export const simGear = ({ slot, type }, gear = CALIBRATION_GEAR, seed = 0) =>
  gear ? generateEquipment({ slot, type, tier: gear.tier, quality: gear.quality, series: 'sim', rng: seeded(seed) }) : null

/** 子嗣两槽：攻 = 飞剑（攻 + 速度副）、防 = 盾（防御/生命 + 生命副） */
export const offspringGearOf = (gear = CALIBRATION_GEAR) =>
  gear
    ? {
        weapon: simGear({ slot: 'weapon', type: '飞剑' }, gear, 11),
        body: simGear({ slot: 'body', type: '盾' }, gear, 22)
      }
    : undefined

/**
 * 桂冈单位（1 个）。`level` = 内功层数（realm.js 扁平索引 1..18，练气一层 = 1）。
 * 炼体加成按《装备系统》§十：生命 floor(20L×(1+L/18))、防御 floor(2L×(1+L/18))。
 */
export const lordUnit = ({ level = 1, gear = CALIBRATION_GEAR, bodyLevel = 0 } = {}) => {
  const lv = Math.max(Math.floor(Number(level) || 1), 1)
  const artifact = { attack: 0, health: 0, defense: 0, speed: 0 }
  LORD_SLOTS.forEach((s, i) => {
    const piece = simGear(s, gear, 30 + i)
    if (!piece) return
    for (const key of Object.keys(artifact)) artifact[key] += Number(piece.stats[key]) || 0
  })
  const L = Math.max(Math.floor(Number(bodyLevel) || 0), 0)
  const body = { health: Math.floor(20 * L * (1 + L / 18)), defense: Math.floor(2 * L * (1 + L / 18)) }
  const panel = playerPanel({ level: lv, innate: LORD_INNATE, artifact, body })
  return cloneUnit(
    buildPlayerUnit({
      name: '桂冈',
      level: lv,
      stats: { health: panel.health, damage: panel.attack, defense: panel.defense, speed: panel.speed }
    })
  )
}

/**
 * 三名同质子嗣（校准口径：单灵根 / 本命 tier 1 / 无词条）。
 * `count` 只给试算用，默认 3 = `TUNING.companionSlots`。
 */
export const offspringUnits = ({ level, rootCount = 1, fateTier = 1, gear = CALIBRATION_GEAR, count = 3 } = {}) => {
  const unit = buildOffspringUnit(
    {
      id: 'sim',
      name: '模拟子嗣',
      status: 'alive',
      hasRoot: true,
      rootCount,
      realmLevel: level,
      fate: { tier: fateTier },
      traits: [],
      equipment: offspringGearOf(gear)
    },
    { nowSeconds: 0 }
  )
  if (!unit) return []
  return Array.from({ length: count }, (_, i) => cloneUnit({ ...unit, uid: `${unit.uid}:${i}` }))
}

/** 完整校准队伍：桂冈 + 3 子嗣。`lord: null` 可以只算子嗣（对照用） */
export const calibrationParty = ({ level, rootCount = 1, fateTier = 1, gear = CALIBRATION_GEAR, lord = {} } = {}) => [
  ...(lord ? [lordUnit({ level, gear, ...lord })] : []),
  ...offspringUnits({ level, rootCount, fateTier, gear })
]
