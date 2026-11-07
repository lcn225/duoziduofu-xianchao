// 秘境战力体检（手动用，不在 verify 里跑）
//
//   node scripts/diag-realm.mjs <存档文件> [--difficulty=12] [--floors=1-30]
//
// 回答一个问题：**这一队人在当前难度打不过，是谁的问题？**
// 把桂冈 / 子嗣 / 灵兽 / 敌人的四属性与战力并排打出来，并按层跑一遍 sim 战斗。
// 面板全部走生产公式（playerPanel / buildOffspringUnit / buildPetUnit / buildEnemy），
// 不在这里抄第二份 —— 抄了就会和游戏里对不上。
import fs from 'node:fs'
import path from 'node:path'
import { decryptData } from '../src/plugins/crypto.js'
import {
  buildEnemy,
  buildOffspringUnit,
  buildPetUnit,
  buildPlayerUnit,
  cloneUnit,
  combatPowerOf,
  runSegment,
  simulateBattle
} from '../src/plugins/secretRealm.js'
import { innateAttributesOf, playerPanel } from '../src/plugins/stats.js'
import { powerLevelOf } from '../src/plugins/realm.js'
import { TUNING as HARMONY } from '../src/plugins/harmony.js'
import { nonArtEffectsOf, vesselArtBonusForTypeOf, vesselArtBonusMapOf } from '../src/plugins/artEffects.js'
import { specialtyCoefForType } from '../src/plugins/innerCourt.js'
import { EQUIP_SLOT_KEYS } from '../src/plugins/equipment.js'

const args = process.argv.slice(2)
const get = (k, d) => {
  const hit = args.find(a => a.startsWith(`--${k}=`))
  return hit ? hit.slice(k.length + 3) : d
}
const file = args.find(a => !a.startsWith('--'))
if (!file) {
  console.error('用法：node scripts/diag-realm.mjs save/xxx.json [--difficulty=12] [--floors=1-30]')
  process.exit(1)
}
const difficulty = Number(get('difficulty', 12))
const retreatPct = Number(get('retreat', 20))
const [floorLo, floorHi] = String(get('floors', '1-50'))
  .split('-')
  .map(n => Math.max(Math.floor(Number(n) || 1), 1))

const raw = fs.readFileSync(path.resolve(file), 'utf8').trim()
const s = await decryptData(raw)
if (!s) {
  console.error('解密失败：口令或格式变了？')
  process.exit(1)
}

// ---------- 桂冈：与 attributes.js 的 combatPanel 同一条路 ----------
const specialties = (s.practice?.legacyTraits || [])
  .filter(t => t?.type === 'specialty' && t.specialty)
  .map(t => ({ kind: t.specialty.kind, key: t.specialty.key, coef: t.specialty.coef }))
const vesselMap = vesselArtBonusMapOf(s.practice || {})
const artifactFlat = s.artifactBonuses || {}
let artifact = artifactFlat
if (specialties.length || Object.keys(vesselMap).length) {
  artifact = {}
  for (const key of Object.keys(artifactFlat)) artifact[key] = 0
  for (const slot of EQUIP_SLOT_KEYS) {
    const item = s.equippedArtifacts?.[slot]
    if (!item?.stats) continue
    const coef =
      specialtyCoefForType(specialties, item.type) + vesselArtBonusForTypeOf(vesselMap, item.type)
    for (const [key, value] of Object.entries(item.stats)) {
      if (artifact[key] === undefined) continue
      artifact[key] += (Number(value) || 0) * coef
    }
  }
}
// ⚠ 本体反推要用 **artifactBonuses**（穿脱时记下的那一份），不能用重算后的 `artifact`
//   —— 后者已经乘过专精/器诀，扣回去会得到负的本体（P56-c 落地后的坑）。
const innate = innateAttributesOf({
  base: s.baseAttributes || {},
  artifact: artifactFlat,
  pet: s.activePet?.combatAttributes || {}
})
const lv = powerLevelOf(s.level)
const bodyScale = 1 + lv / 18
const body = {
  health: Math.floor(HARMONY.body.healthPerLevel * lv * bodyScale),
  defense: Math.floor(HARMONY.body.defensePerLevel * lv * bodyScale)
}
const panel = playerPanel({ level: s.level, innate, artifact, pet: s.activePet?.combatAttributes || {}, body })
const legacyCombat = (s.practice?.legacyTraits || []).reduce(
  (sum, t) => (t?.type === 'combat' ? sum + Math.max(Number(t?.effect) || 0, 0) : sum),
  0
)
const art = nonArtEffectsOf(s.practice || {})
const combatMult = 1 + legacyCombat
for (const key of Object.keys(panel)) panel[key] *= combatMult * (1 + (Number(art[key]) || 0))

const playerUnit = cloneUnit(
  buildPlayerUnit({
    name: s.name,
    level: s.level,
    realm: s.realm,
    stats: {
      health: panel.health,
      maxHealth: panel.health,
      damage: panel.attack,
      defense: panel.defense,
      speed: panel.speed,
      ...(s.combatAttributes || {}),
      ...(s.combatResistance || {}),
      ...(s.specialAttributes || {})
    }
  })
)

// ---------- 队友：按存档里的 run.party ----------
const now = Number(s.clockGameTime) || 0
const partyRefs = s.secretRealm?.run?.party || []

/**
 * `--bind-pet`：模拟「把队伍里那只灵兽设为出战灵兽」。
 * 出战灵兽给桂冈的是**平加面板**（`applyPetBonuses`），所以直接加到单位四属性上。
 */
if (args.includes('--bind-pet')) {
  const petRef = partyRefs.find(r => r.kind === 'pet')
  const pet = petRef && (s.items || []).find(it => it?.type === 'pet' && it.id === petRef.id)
  if (pet) {
    const panel = buildPetUnit(pet)?.stats
    if (panel) {
      playerUnit.stats.health += panel.maxHealth
      playerUnit.stats.maxHealth += panel.maxHealth
      playerUnit.stats.damage += panel.damage
      playerUnit.stats.defense += panel.defense
      playerUnit.stats.speed += panel.speed
      playerUnit.currentHealth = playerUnit.stats.maxHealth
      console.log(
        `（--bind-pet：桂冈吃 ${pet.name} 面板 ` +
        `+${Math.round(panel.maxHealth)} 血 / +${Math.round(panel.damage)} 攻 / +${Math.round(panel.defense)} 防）`
      )
    }
  }
}
const children = new Map((s.offspring?.list || []).map(c => [c.id, c]))
const pets = new Map((s.items || []).filter(it => it?.type === 'pet').map(p => [p.id, p]))
if (s.activePet?.id) pets.set(s.activePet.id, s.activePet)
const kidsLevel = Number(get('kids-level', 0)) || 0
const allies = [playerUnit]
for (const ref of partyRefs) {
  if (ref.kind === 'offspring') {
    const child = children.get(ref.id)
    // `--kids-level=N`：试算「子嗣也练到这个境界」要多少战力（不改存档，只改本次模拟）
    const unit = buildOffspringUnit(
      child && kidsLevel ? { ...child, realmLevel: kidsLevel } : child,
      { nowSeconds: now }
    )
    if (unit) allies.push(unit)
    else console.log(`⚠ 子嗣 ${ref.id} 构建失败（不能出战）`)
  } else if (ref.kind === 'pet') {
    const unit = pets.get(ref.id) && buildPetUnit(pets.get(ref.id))
    if (unit) allies.push(unit)
    else console.log(`⚠ 灵兽 ${ref.id} 构建失败`)
  }
}

const fmt = n => (Math.round(Number(n) * 10) / 10).toLocaleString('en-US')
const row = (label, stats, power) =>
  `  ${label.padEnd(18)} 生命 ${fmt(stats.health ?? stats.maxHealth).padStart(10)}` +
  `  攻击 ${fmt(stats.damage ?? stats.attack).padStart(8)}` +
  `  防御 ${fmt(stats.defense).padStart(8)}` +
  `  速度 ${fmt(stats.speed).padStart(6)}` +
  `  战力 ${fmt(power).padStart(12)}`

console.log(`存档：${path.basename(file)}`)
console.log(`桂冈：${s.name} ${s.realm}（level ${s.level}，等效 ${lv} 格）`)
console.log(
  `  装备：` +
  EQUIP_SLOT_KEYS.map(slot => {
    const it = s.equippedArtifacts?.[slot]
    if (!it) return `${slot}=空`
    const tier = it.tierKey ?? (it.tier != null ? `T${it.tier}` : '?')
    const name = it.displayName || it.name || it.type || ''
    return `${slot}=${tier}${name}`
  }).join('  ')
)
console.log(
  `  出战灵兽（activePet）：${s.activePet ? `${s.activePet.name} Lv.${s.activePet.level}` : '无 —— 桂冈吃不到灵兽面板'}`
)
console.log(`难度 ${difficulty}，队伍 ${allies.length} 人\n`)

console.log('【我方】')
for (const u of allies) console.log(row(`${u.name}(${u.source})`, u.stats, combatPowerOf(u)))

const topN = Number(get('top', 0)) || 0
if (topN > 0) {
  const ranked = (s.offspring?.list || [])
    .map(c => buildOffspringUnit(c, { nowSeconds: now }))
    .filter(Boolean)
    .map(u => ({ u, power: combatPowerOf(u) }))
    .sort((a, b) => b.power - a.power)
  console.log(`\n【战力前 ${topN} 的可出战子嗣】（当前队伍用 * 标出）`)
  const partyIds = new Set(partyRefs.filter(r => r.kind === 'offspring').map(r => `off:${r.id}`))
  for (const { u, power } of ranked.slice(0, topN)) {
    const mark = partyIds.has(u.uid) ? '*' : ' '
    console.log(row(`${mark}${u.name} Lv${u.level}`, u.stats, power))
  }
}

console.log('\n【队友细节】（子嗣的 realmCoef 是整数层平值，见 realmCoef.js 顶部警告）')
for (const ref of partyRefs.filter(r => r.kind === 'offspring')) {
  const c = children.get(ref.id)
  if (!c) continue
  const traits = (c.traits || []).map(t => `${t.id}:${JSON.stringify(t.effect)}`).join(',')
  const eq = ['weapon', 'body'].map(k => {
    const it = c.equipment?.[k]
    return `${k}=${it ? `T${it.tier}${it.quality}` : '空'}`
  }).join(' ')
  console.log(
    `  ${c.name} 境界 ${c.realmLevel}层 灵根 ${c.hasRoot ? c.rootCount : '无'} ` +
    `本命 tier${c.fate?.tier ?? '?'} ${eq} 词条 [${traits}]`
  )
}

const sumPower = allies.reduce((sum, u) => sum + combatPowerOf(u), 0)

// ---------- 敌人 ----------
console.log('\n【敌人】')
const enemies = []
for (let f = floorLo; f <= Math.min(floorHi, 50); f += 1) {
  const e = buildEnemy(f, { difficulty, rng: () => 0.5 })
  enemies.push(e)
  console.log(row(`第${f}层`, e.stats, combatPowerOf(e)))
}

console.log(`\n【对打】自动撤退 ${retreatPct}%，每层满血重开（不计 Buff）`)
for (const e of enemies) {
  const team = allies.map(u => cloneUnit(u))
  const foe = cloneUnit(e)
  const res = simulateBattle({ allies: team, enemies: [foe], autoRetreatPct: retreatPct }, Math.random)
  const enemyPct = Math.max(foe.currentHealth / foe.stats.maxHealth, 0) * 100
  console.log(
    `  第${e.level}层 ${String(res.outcome).padEnd(9)} 回合 ${String(res.rounds).padStart(2)}` +
    `  敌人剩 ${enemyPct.toFixed(0).padStart(3)}%  撤退 [${res.withdrawn.map(w => w.name).join(', ') || '无'}]`
  )
}

console.log(`\n队伍总战力 ${fmt(sumPower)}（不含速度/暴击）`)

// ---------- 整趟模拟（真实 runSegment，含撤退累积与 Buff） ----------
const runs = Number(get('runs', 0)) || 0
if (runs > 0) {
  const reached = []
  const endedBy = { retreated: 0, defeat: 0, cleared: 0 }
  const withdrawCount = new Map()
  for (let i = 0; i < runs; i += 1) {
    let run = {
      floor: 1,
      difficulty,
      buffs: [],
      withdrawn: [],
      autoRetreatPct: retreatPct,
      permadeath: false,
      finalBossFirstKill: false
    }
    let guard = 0
    let result = null
    while (guard < 200) {
      guard += 1
      const seg = runSegment({ run, partyBase: allies, bossFirstClears: {}, rng: Math.random })
      run = seg.run
      if (seg.pendingBuff) {
        // 10 秒不选 = 自动选品质最高；这里简化成「取第一个」
        run = { ...run, status: 'fighting', buffs: [...run.buffs, seg.pendingBuff.options[0].id] }
        continue
      }
      result = seg.result
      break
    }
    const floorReached = run.highestFloorReached ?? run.floor
    reached.push(floorReached)
    for (const w of result?.withdrawn || []) {
      withdrawCount.set(w.name, (withdrawCount.get(w.name) || 0) + 1)
    }
    if (result?.clearedDifficulty) endedBy.cleared += 1
    else if (result?.outcome === 'defeat') endedBy.defeat += 1
    else endedBy.retreated += 1
  }
  reached.sort((a, b) => a - b)
  const avg = reached.reduce((a, b) => a + b, 0) / Math.max(reached.length, 1)
  console.log(`\n【整趟 ${runs} 次】难度 ${difficulty}，自动撤退 ${retreatPct}%，Buff 取第一个`)
  console.log(`  到达层数：最低 ${reached[0]} / 中位 ${reached[Math.floor(reached.length / 2)]} / 最高 ${reached[reached.length - 1]} / 平均 ${avg.toFixed(1)}`)
  console.log(`  结局：撤退 ${endedBy.retreated} · 战败 ${endedBy.defeat} · 打穿 50 层 ${endedBy.cleared}`)
  console.log(
    `  撤退人次：` +
    [...withdrawCount.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n}×${c}`).join(' · ')
  )
}
