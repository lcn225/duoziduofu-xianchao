// 灵兽系统（**2026-10-25 P43 重写**；**2026-11-16 零散 #3** 加初始等级 / 吞噬 / 兽苑）
//
// 真源：《数值真值表》§5.8 +《下一步》P43 / 零散 #3。
//   · 面板 = 白板(T1~T5) × 成色 × 本体乘区（`petUnit.petPanelOf`，唯一口径）
//   · 等级靠**同修**：桂冈镇守打坐拿到的修为，出战灵兽额外获得 50%（不扣桂冈）
//   · **兽苑**：未出战灵兽每只再拿 25%，受益只数 2/4/6（按战力降序、满级兽跳过）
//   · **吞噬**：狗粮累计同修经验 1:1 转给主兽，免费、无倍率；出战 / 秘境在途的不能当狗粮
//   · 上限 = 主角小境界；本命同源 +1；**初始等级 = 按品阶**（1/5/10/15/20，夹到主角层）
//
// ⚠ **精华 / 升级 / 升星整条线已删除**（`petEssence` / `upgradePet` / `evolvePet`）。
//   老档字段在 `migratePetsV2` 里直接删、不补偿；`star` 只留作历史字段、不参与任何计算。
// ⚠ 出战灵兽仍给桂冈一份平加面板（老口径保留）：面板随等级变化，
//   所以升级后必须 `refreshActivePetPanel()` 先扣旧值再加新值，否则 `baseAttributes` 会漂。

import {
  gardenSlotsOf,
  growPet,
  petDevourPlanOf,
  petLevelCapOf,
  petLevelOf,
  petPanelOf,
  petSameSeriesOf,
  petTierOf,
  relinkPetRecord
} from '../../plugins/petUnit.js'
// #5（2026-11-26）：开局赠送的 1 阶下品乌鬣猪妖（纯函数在 plugins/items.js）
import { createStarterPetInstance } from '../../plugins/items.js'
import { playerFates } from '../../plugins/harmony.js'
// 战力只用于**排序 / 警示**（与秘境名单同一套 `combatPowerOf`，不另写公式）。
// ⚠ 本文件是 store；`plugins/secretRealm` 不 import 任何 store，无环。
import { combatPowerOf } from '../../plugins/secretRealm.js'

/**
 * 兽苑候选（未出战、未满级），**战力降序**；同战力按等级 → 品阶 → id 稳定兜底。
 *
 * 满级兽**不进候选** —— 它们的经验会被 `growPet` 清零，占名额纯浪费；
 * 这是「按战斗力降序」的落地细节，不是额外规则（参见《灵兽系统重构（零散 #3）》§三）。
 */
const gardenCandidatesOf = store => {
  const level = Number(store.estate?.buildings?.beastGarden) || 0
  const slots = gardenSlotsOf(level)
  if (!slots) return []
  const fateSeries = store.playerFateSeries || []
  const activeId = store.activePet?.id || null
  const rows = []
  for (const pet of store.items || []) {
    if (pet?.type !== 'pet' || pet.id === activeId) continue
    const cap = petLevelCapOf(store.level, petSameSeriesOf(pet, fateSeries))
    if (petLevelOf(pet) >= cap) continue
    rows.push({ pet, cap, power: combatPowerOf(petPanelOf(pet)) })
  }
  rows.sort(
    (a, b) =>
      b.power - a.power ||
      petLevelOf(b.pet) - petLevelOf(a.pet) ||
      (petTierOf(b.pet) || 0) - (petTierOf(a.pet) || 0) ||
      String(a.pet.id).localeCompare(String(b.pet.id))
  )
  return rows.slice(0, slots)
}

export const state = () => ({
  activePet: null // 当前出战的灵兽（同修经验只给它）
})

export const getters = {
  /** 出战灵兽的当前面板（UI 与桂冈加成共用） */
  activePetPanel() {
    return this.activePet ? petPanelOf(this.activePet) : null
  },
  /** 玩家里程本命的 series 集合（判断灵兽是否「本命同源」） */
  playerFateSeries() {
    return playerFates(this.practice).map(fate => fate.series).filter(Boolean)
  },
  /**
   * 桂冈修为已满、又被突破门槛拦住 —— 打坐停止（`dayLoop.meditateInSlice` 的 break），
   * 出战灵兽的同修也就跟着暂停。UI 要明确写出来，否则玩家只会看到「灵兽等级不涨」。
   *
   * 普通情况（修为没满 / 门槛够）返回 false；是否在镇守由调用方自行判断。
   */
  petCultivationPaused() {
    return !!(this.isBreakthroughBlocked && this.cultivation >= this.maxCultivation)
  },
  /**
   * 兽苑当前受益的灵兽 id（UI 打标签用）。
   * 与 `gainGardenPetCultivation` 共用同一份候选 / 排序 —— 别在 UI 里另写一套。
   */
  gardenPetIds() {
    return gardenCandidatesOf(this).map(row => row.pet.id)
  }
}

export const actions = {
  /** 同修经验入账（只给**出战**的那只；它才是随桂冈打坐的灵兽） */
  gainPetCultivation(amount) {
    // ⚠ 必须拿 `items` 里的那只：存档把 items 与 activePet 各存一份，读档后是两个对象。
    //   只改 activePet 的话，背包列表读 items 永远显示旧等级，召回再出战时还会被打回 Lv.1。
    this.relinkActivePet()
    const pet = this.activePet
    if (!pet || !(Number(amount) > 0)) return null
    const before = pet.level || 1
    const result = growPet(pet, amount, {
      playerLevel: this.level,
      sameSeries: petSameSeriesOf(pet, this.playerFateSeries)
    })
    pet.level = result.level
    pet.xp = result.xp
    if (result.level !== before) this.refreshActivePetPanel()
    this.saveData()
    // `fromLevel` / `name` 给流水账用（dayLoop 打印「同修 Lv.4 → Lv.5」）
    return { ...result, fromLevel: before, name: pet.name || '灵宠' }
  },

  /**
   * **兽苑**：给每只受益灵兽发一份经验（`amountPerPet`，跟随桂冈实际打坐）。
   *
   * 受益名单 / 顺序见 `gardenCandidatesOf`（战力降序、满级跳过、出战那只不算）。
   * 每只按自己的上限 `growPet`；一次 `saveData`。
   *
   * @returns {{ count:number, xpPerPet:number }|null} 没建兽苑 / 无候选 / 数值 ≤ 0 返回 null
   */
  gainGardenPetCultivation(amountPerPet) {
    const amount = Number(amountPerPet) || 0
    if (amount <= 0) return null
    const rows = gardenCandidatesOf(this)
    if (!rows.length) return null
    const fateSeries = this.playerFateSeries || []
    for (const { pet, cap } of rows) {
      const result = growPet(pet, amount, {
        playerLevel: this.level,
        sameSeries: petSameSeriesOf(pet, fateSeries)
      })
      pet.level = Math.min(result.level, cap)
      pet.xp = result.xp
    }
    this.saveData()
    return { count: rows.length, xpPerPet: amount }
  },

  /**
   * **吞噬**（零散 #3，2026-11-16）：`food` 消失，累计同修经验 1:1 转给 `target`。
   *
   * 限制（用户 2026-11-16 拍板）：
   *   · **出战中**的灵兽不能当狗粮（先从详情页召回）；
   *   · **秘境在途队伍里**的灵兽也不能当狗粮（下一段会少一个单位）；
   *   · 不能吃自己。
   *
   * 目标升到上限就停，溢出经验作废 —— UI 必须先在弹窗里给出「吞噬前后面板战力对比」，
   * 下降时按钮变红 + 二次确认（《灵兽系统重构（零散 #3）》§二.2）。
   *
   * @returns {{ok:boolean, message?:string, ...}}
   */
  devourPet(targetId, foodId) {
    this.relinkActivePet()
    const items = this.items || []
    const target = items.find(item => item?.type === 'pet' && item.id === targetId)
    const food = items.find(item => item?.type === 'pet' && item.id === foodId)
    if (!target || !food) return { ok: false, message: '灵兽不存在' }
    if (target.id === food.id) return { ok: false, message: '不能吞噬自己' }
    if (this.activePet?.id === food.id) {
      return { ok: false, message: `「${food.name || '灵宠'}」正在出战，请先召回再吞噬` }
    }
    const run = this.secretRealm?.run
    const inRun =
      run &&
      ['fighting', 'buff'].includes(run.status) &&
      (run.party || []).some(ref => ref.kind === 'pet' && ref.id === food.id)
    if (inRun) {
      return { ok: false, message: `「${food.name || '灵宠'}」正在秘境征战中，不能吞噬` }
    }

    const fateSeries = this.playerFateSeries || []
    const plan = petDevourPlanOf(target, food, {
      playerLevel: this.level,
      sameSeries: petSameSeriesOf(target, fateSeries)
    })
    const fromLevel = petLevelOf(target)
    target.level = plan.level
    target.xp = plan.xp

    const index = items.indexOf(food)
    if (index > -1) items.splice(index, 1)
    // 主兽就是出战那只 → 面板整块变了，按「先扣旧值再加新值」刷新桂冈加成
    if (this.activePet?.id === target.id) this.refreshActivePetPanel()
    this.saveData()
    return {
      ok: true,
      plan,
      fromLevel,
      toLevel: petLevelOf(target),
      targetName: target.name || '灵宠',
      foodName: food.name || '灵宠'
    }
  },

  /**
   * 把 `activePet` 重新指回 `items` 里的同一只（读档后必做一次）。
   *
   * **为什么需要**：`saveData()` 存的是整个 `$state`，`items` 数组与 `activePet`
   * 各自序列化一份；`deepMerge` 又对每个键 `structuredClone`。于是读档后它们是
   * **两个互不相干的对象**。同修只改 `activePet`，而背包/秘境名单读 `items` ——
   * 表现就是「灵兽等级永远不涨」，召回再出战时等级还会被旧对象覆盖回去。
   *
   * 以 `activePet` 的等级/经验为准回写 `items`（它才是上次一直在练的那只），
   * 然后让两者共享同一个引用。找不到对应物品时保持原样，不擅自清空出战位。
   */
  relinkActivePet() {
    const live = relinkPetRecord(this.activePet, this.items)
    if (!live) return false
    this.activePet = live
    return true
  },

  /**
   * **开局赠送**（#5，2026-11-26）：1 阶下品乌鬣猪妖，**自动出战**。
   *
   * 调用口只有一处：`persistence.initializePlayer` 在**无存档 / 存档被作废**时调用。
   * 老档不补发 = 预期行为；已经有出战灵宠时直接跳过（幂等，重复调用不会发第二只）。
   *
   * 为什么自动出战：同修经验只给出战那只（桂冈打坐的 50%），不出战等于开局没送；
   * 面板加成也只在出战时才加到桂冈身上（`applyPetBonuses`）。
   *
   * @returns 实例（成功）/ null（已有出战宠或底材缺失）
   */
  grantStarterPet({ save = true } = {}) {
    if (this.activePet) return null
    const pet = createStarterPetInstance()
    if (!pet) return null
    // 入包走 `gainItem`（灵宠不并堆，一次 push 一条）+ 直接占出战位。
    // 不用 `deployPet`：它在「已有出战宠」时会先召回，这里已经挡掉了，省一次分支。
    this.gainItem(pet, { save: false })
    this.activePet = pet
    // ⚠ `gainInto` 对不可堆叠物品是 **push 一份拷贝**，上面那条已经不在 items 里了。
    //   不指回去就会重演「同修只涨出战位、背包显示旧等级」那个老 bug（见 relinkActivePet）。
    this.relinkActivePet()
    this.syncActivePetPanel()
    this.applyPetBonuses()
    if (save) this.saveData()
    return this.activePet
  },

  // 使用灵宠（出战/召回）
  usePet(pet) {
    if (!this.activePet) return this.deployPet(pet)
    if (this.activePet.id === pet.id) return this.recallPet()
    this.recallPet()
    return this.deployPet(pet)
  },
  // 召回灵宠
  recallPet() {
    if (!this.activePet) return { success: false, message: '当前没有出战的灵宠' }
    this.resetPetBonuses()
    this.activePet = null
    this.saveData()
    return { success: true, message: '召回成功' }
  },
  // 出战灵宠
  deployPet(pet) {
    if (this.activePet) this.recallPet()
    this.activePet = pet
    this.syncActivePetPanel()
    this.applyPetBonuses()
    this.saveData()
    return { success: true, message: '出战成功' }
  },
  /** 把等级/成色算出来的面板写回实例（只写出战那只） */
  syncActivePetPanel() {
    if (!this.activePet) return false
    this.activePet.combatAttributes = petPanelOf(this.activePet)
    return true
  },
  /**
   * 等级变化后刷新桂冈面板：**先扣旧面板、再算新面板、再加回去**。
   * 灵兽升一级面板是整块变化的，直接再 apply 一次会重复叠加。
   */
  refreshActivePetPanel() {
    if (!this.activePet) return false
    this.resetPetBonuses()
    this.syncActivePetPanel()
    this.applyPetBonuses()
    return true
  },
  // 重置灵宠属性加成
  resetPetBonuses() {
    if (!this.activePet) return
    const petBonus = this.activePet.combatAttributes
    if (!petBonus) return
    // 保存原始属性值
    const originalBaseAttributes = { ...this.baseAttributes }
    const originalCombatAttributes = { ...this.combatAttributes }
    const originalCombatResistance = { ...this.combatResistance }
    const originalSpecialAttributes = { ...this.specialAttributes }
    // 更新基础属性
    this.baseAttributes.attack = originalBaseAttributes.attack - (petBonus.attack || 0)
    this.baseAttributes.defense = originalBaseAttributes.defense - (petBonus.defense || 0)
    this.baseAttributes.health = originalBaseAttributes.health - (petBonus.health || 0)
    this.baseAttributes.speed = originalBaseAttributes.speed - (petBonus.speed || 0)
    // 更新战斗属性
    Object.keys(this.combatAttributes).forEach(key => {
      this.combatAttributes[key] = originalCombatAttributes[key] - (petBonus[key] || 0)
    })
    // 更新战斗抗性
    Object.keys(this.combatResistance).forEach(key => {
      this.combatResistance[key] = originalCombatResistance[key] - (petBonus[key] || 0)
    })
    // 更新特殊属性
    Object.keys(this.specialAttributes).forEach(key => {
      this.specialAttributes[key] = originalSpecialAttributes[key] - (petBonus[key] || 0)
    })
  },
  // 应用灵宠属性加成
  applyPetBonuses() {
    if (!this.activePet) return
    const petBonus = this.activePet.combatAttributes
    if (!petBonus) return
    // 保存原始属性值
    const originalBaseAttributes = { ...this.baseAttributes }
    const originalCombatAttributes = { ...this.combatAttributes }
    const originalCombatResistance = { ...this.combatResistance }
    const originalSpecialAttributes = { ...this.specialAttributes }
    // 更新基础属性
    this.baseAttributes.attack = originalBaseAttributes.attack + (petBonus.attack || 0)
    this.baseAttributes.defense = originalBaseAttributes.defense + (petBonus.defense || 0)
    this.baseAttributes.health = originalBaseAttributes.health + (petBonus.health || 0)
    this.baseAttributes.speed = originalBaseAttributes.speed + (petBonus.speed || 0)
    // 更新战斗属性
    Object.keys(this.combatAttributes).forEach(key => {
      this.combatAttributes[key] = originalCombatAttributes[key] + (petBonus[key] || 0)
    })
    // 更新战斗抗性
    Object.keys(this.combatResistance).forEach(key => {
      this.combatResistance[key] = originalCombatResistance[key] + (petBonus[key] || 0)
    })
    // 更新特殊属性
    Object.keys(this.specialAttributes).forEach(key => {
      this.specialAttributes[key] = originalSpecialAttributes[key] + (petBonus[key] || 0)
    })
  }
}
