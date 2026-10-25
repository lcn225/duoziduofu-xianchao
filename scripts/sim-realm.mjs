// 秘境战力 / 怪物阈值曲线模拟器
//
// 用法：
//   npm run sim:realm                          # 默认胜率矩阵
//   npm run sim:realm -- --solve               # **反推**：每格求出「练气几层能 90% 通过」
//   npm run sim:realm -- --n=100               # 每组对战场次
//   npm run sim:realm -- --party=solo|trio     # 1 名 / 3 名同质子嗣（默认 trio = 校准口径）
//   npm run sim:realm -- --difficulty=1,2,3 --floors=5,10,20
//   npm run sim:realm -- --roots=1,2 --tiers=1,3
//   npm run sim:realm -- --scale=0.9           # 敌人生命/攻击/防御整体缩放（试算用，不改 TUNING）
//   npm run sim:realm -- --gear=2:中         # 装备档（**默认 2:中 = 校准口径**；off = 裸装）
//   npm run sim:realm -- --lord=follow       # 桂冈（**默认 follow = 跟子嗣同境界**；off = 不进队）
//   npm run sim:realm -- --body=0              # 桂冈炼体外功等级（只给生命/防御，默认 0）
//
// 口径：
//   · 读的是生产代码 `src/plugins/secretRealm.js` 的纯函数，不碰 Pinia、不写存档。
//   · 2026-10-23 P36 第 6 步起，**默认队伍 = 桂冈 + 3 名同境界单灵根子嗣，全穿 T2 中品**
//     （秘境实机队伍的形状）。装备面板是**平加**、阶位封在练气段上限，低境界受益最大，
//     按裸装反推的 P25 旧阈值已经对不上实机。
//   · 要复现 P25 的裸装老表：`--gear=off --lord=off`。
//   · 队伍由 `scripts/lib/sim-party.mjs` 统一构造（`verify-idle` 的锚点断言用同一份）。
//   · 「练气几层能过」= 同质子嗣里最低能 90% 赢的那个层数；9 层也不行就记 `>9`。

import { buildEnemy, simulateBattle, realmCoefOf, TUNING } from '../src/plugins/secretRealm.js'
import { offspringUnits, lordUnit, petUnit } from './lib/sim-party.mjs'

const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find(a => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const flag = name => process.argv.slice(2).includes(`--${name}`)

const N = Math.max(parseInt(arg('n', '200'), 10) || 200, 1)
const PARTY = arg('party', 'trio')
const PARTY_SIZE = PARTY === 'solo' ? 1 : PARTY === 'duo' ? 2 : 3
const DIFFICULTIES = arg('difficulty', '1,2,3')
  .split(',')
  .map(Number)
  .filter(n => Number.isFinite(n) && n >= 1)
const FLOORS = arg('floors', '1,5,10,20,30,40,50')
  .split(',')
  .map(Number)
  .filter(n => Number.isFinite(n) && n >= 1)
const ROOTS = arg('roots', '1').split(',').map(Number)
const TIERS = arg('tiers', '1').split(',').map(Number)
const SCALE = Number(arg('scale', '1')) || 1
/**
 * `--gear=阶:成色`。**默认 `2:中` = 当前校准口径**（练气段上限 T2、中品）。
 * 子嗣只能穿练气段上限 T1–T2（`offspringEquipment.SEGMENT_MAX_TIER`），这里不额外拦，
 * 传 T3 以上就等于模拟「还没落地的筑基子嗣」，数字只能当试算看。
 * 想看 P25 的裸装老表就加 `--gear=off`。
 */
const GEAR = (() => {
  const spec = arg('gear', '2:中')
  if (!spec || spec === 'off') return null
  const [tier, quality = '下'] = spec.split(':')
  return { tier: Math.min(Math.max(Math.floor(Number(tier) || 1), 1), 5), quality }
})()
/**
 * `--lord=off|follow|内功层数`。**默认 `follow` = 当前校准口径**：
 * 桂冈跟子嗣同境界一起成长（秘境实机队伍永远是「桂冈 + 最多 3 人」，他不是可选项）。
 */
const LORD_ARG = arg('lord', 'follow')
const LORD_FOLLOW = LORD_ARG === 'follow'
const LORD_LEVEL = LORD_ARG === 'off' || LORD_FOLLOW ? (LORD_FOLLOW ? -1 : 0) : Math.max(Math.floor(Number(LORD_ARG) || 1), 1)
const LORD_BODY = Math.max(Math.floor(Number(arg('body', '0')) || 0), 0)
/** `--pet=off` 去掉灵兽（对照 P42 前的 4 人队） */
const PET_ON = arg('pet', 'on') !== 'off'

// 可复现随机源（mulberry32）
const seeded = seed => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** 桂冈（`follow` 时跟子嗣同境界；`off` 时返回空数组） */
const buildLord = childLevel => {
  const lv = LORD_FOLLOW ? Math.max(Math.floor(Number(childLevel) || 1), 1) : LORD_LEVEL
  if (!lv) return []
  return [lordUnit({ level: lv, gear: GEAR, bodyLevel: LORD_BODY })]
}

/** 子嗣 + 灵兽（P43：灵兽是独立第 5 坑，`--pet=off` 可以去掉做对照） */
const buildAllies = (level, rootCount, fateTier) => [
  ...offspringUnits({ level, rootCount, fateTier, gear: GEAR, count: PARTY_SIZE }),
  ...(PET_ON ? [petUnit({ level, gear: GEAR })] : [])
]

const makeEnemy = (floor, difficulty, rng) => {
  const enemy = buildEnemy(floor, { difficulty, rng, tuning: TUNING })
  if (SCALE !== 1) {
    enemy.stats.health *= SCALE
    enemy.stats.maxHealth = enemy.stats.health
    enemy.stats.damage *= SCALE
    enemy.stats.defense *= SCALE
    // ⚠ 必须同步 currentHealth：战斗读的是它，不是 stats.health。
    //   2026-10-23 修 —— 只改 stats 会让敌人「伤害翻倍、血量没翻」，反推表整体偏松。
    enemy.currentHealth = enemy.stats.health
  }
  return enemy
}

const winRate = (level, rootCount, fateTier, difficulty, floor, battles = N) => {
  let wins = 0
  for (let i = 0; i < battles; i += 1) {
    const rng = seeded(1009 + i * 7919 + floor * 131 + difficulty * 17 + level * 7 + rootCount * 3)
    const res = simulateBattle(
      {
        allies: [...buildLord(level), ...buildAllies(level, rootCount, fateTier)],
        enemies: [makeEnemy(floor, difficulty, rng)],
        autoRetreatPct: 0, // 关掉撤退：问的是「能不能打赢」，不是「能不能活」
        permadeath: false,
        maxRounds: TUNING.maxRoundsPerBattle
      },
      rng
    )
    if (res.outcome === 'victory') wins += 1
  }
  return wins / battles
}

/** 「能 90% 打赢」的最低练气层数；9 层仍打不过就返回 '>9' */
const minLevelFor = (difficulty, floor, rootCount, fateTier, threshold = 0.9) => {
  for (let level = 2; level <= 9; level += 1) {
    if (winRate(level, rootCount, fateTier, difficulty, floor, 40) >= threshold) return level
  }
  return '>9'
}

const pct = v => `${Math.round(v * 100)}%`.padStart(4)
const teamLabel = PARTY_SIZE === 1 ? '单人子嗣' : `${PARTY_SIZE} 名子嗣`
const gearLabel = GEAR ? `${GEAR.tier} 阶 ${GEAR.quality}品` : '裸装'
const lordLabel = LORD_FOLLOW
  ? `桂冈同境界（炼体 ${LORD_BODY}）`
  : LORD_LEVEL
    ? `桂冈${LORD_LEVEL}层（炼体 ${LORD_BODY}）`
    : '无桂冈'
const partyLabel = `${teamLabel} · ${gearLabel} · ${lordLabel}${PET_ON ? ' · 1 灵兽' : ' · 无灵兽'}`

// 队伍面板自检：装备/桂冈到底加了多少，比看胜率矩阵直观
const panelLine = (level, rootCount, fateTier) => {
  const allies = [...buildLord(level), ...buildAllies(level, rootCount, fateTier)]
  return allies
    .map(u => `${u.name} 血${u.stats.maxHealth.toFixed(0)} 攻${u.stats.damage.toFixed(1)} 防${u.stats.defense.toFixed(1)} 速${u.stats.speed.toFixed(1)}`)
    .join(' | ')
}
console.log(`\n队伍：${partyLabel}`)
for (const lv of [2, 5, 9]) console.log(`  练气${lv}层  ${panelLine(lv, ROOTS[0], TIERS[0])}`)

if (flag('solve')) {
  console.log(`\n反推：每格 = ${teamLabel}能 90% 通过的**最低练气层数**（敌人缩放 ${SCALE}）`)
  console.log(['难度 \\ 层数', ...FLOORS.map(f => `F${f}`.padStart(6))].join('  '))
  for (const difficulty of DIFFICULTIES) {
    const cells = FLOORS.map(f => String(minLevelFor(difficulty, f, ROOTS[0], TIERS[0])).padStart(6))
    console.log([`难度 ${difficulty}`.padEnd(8), ...cells].join('  '))
  }
  console.log('')
} else {
  console.log(`\n秘境模拟：每组 ${N} 场 · ${partyLabel} · 敌人缩放 ${SCALE}`)
  for (const difficulty of DIFFICULTIES) {
    for (const tier of TIERS) {
      console.log(`\n—— 难度 ${difficulty} · 本命 tier ${tier} ——`)
      console.log(['子嗣 \\ 层数', ...FLOORS.map(f => `F${f}`.padStart(5))].join('  '))
      for (let level = 2; level <= 9; level += 1) {
        for (const rootCount of ROOTS) {
          const cells = FLOORS.map(f => pct(winRate(level, rootCount, tier, difficulty, f)))
          console.log(`练气${level}层·${rootCount}根 ${cells.join('  ')}`)
        }
      }
    }
  }
  console.log('\n境界系数（单灵根 = realmCoef × 2.0）')
  for (let level = 1; level <= 9; level += 1) {
    console.log(`  练气${level}层  ${(realmCoefOf(level) * 2).toFixed(3)}`)
  }
  console.log('')
}
