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
//
// 口径：
//   · 读的是生产代码 `src/plugins/secretRealm.js` 的纯函数，不碰 Pinia、不写存档。
//   · 默认队伍 = **3 名同境界单灵根子嗣**（《三大挂机》§4.8 的校准口径，桂冈不参与统计）。
//   · 「练气几层能过」= 同质子嗣里最低能 90% 赢的那个层数；9 层也不行就记 `>9`。

import { buildOffspringUnit, buildEnemy, simulateBattle, realmCoefOf, TUNING } from '../src/plugins/secretRealm.js'

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

// 可复现随机源（mulberry32）
const seeded = seed => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const cloneUnit = u => ({
  ...u,
  stats: { ...u.stats },
  currentHealth: u.stats.maxHealth,
  alive: true,
  stunned: false
})

const buildAllies = (level, rootCount, fateTier) => {
  const child = {
    id: 'sim',
    name: '模拟子嗣',
    status: 'alive',
    hasRoot: true,
    rootCount,
    realmLevel: level,
    fate: { tier: fateTier },
    traits: []
  }
  const unit = buildOffspringUnit(child, { nowSeconds: 0 })
  if (!unit) return []
  return Array.from({ length: PARTY_SIZE }, (_, i) => cloneUnit({ ...unit, uid: `${unit.uid}:${i}` }))
}

const makeEnemy = (floor, difficulty, rng) => {
  const enemy = buildEnemy(floor, { difficulty, rng, tuning: TUNING })
  if (SCALE !== 1) {
    enemy.stats.health *= SCALE
    enemy.stats.maxHealth = enemy.stats.health
    enemy.stats.damage *= SCALE
    enemy.stats.defense *= SCALE
  }
  return enemy
}

const winRate = (level, rootCount, fateTier, difficulty, floor, battles = N) => {
  let wins = 0
  for (let i = 0; i < battles; i += 1) {
    const rng = seeded(1009 + i * 7919 + floor * 131 + difficulty * 17 + level * 7 + rootCount * 3)
    const res = simulateBattle(
      {
        allies: buildAllies(level, rootCount, fateTier),
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

if (flag('solve')) {
  console.log(`\n反推：每格 = ${teamLabel}能 90% 通过的**最低练气层数**（敌人缩放 ${SCALE}）\n`)
  console.log(['难度 \\ 层数', ...FLOORS.map(f => `F${f}`.padStart(6))].join('  '))
  for (const difficulty of DIFFICULTIES) {
    const cells = FLOORS.map(f => String(minLevelFor(difficulty, f, ROOTS[0], TIERS[0])).padStart(6))
    console.log([`难度 ${difficulty}`.padEnd(8), ...cells].join('  '))
  }
  console.log('')
} else {
  console.log(`\n秘境模拟：每组 ${N} 场 · ${teamLabel} · 敌人缩放 ${SCALE}`)
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
