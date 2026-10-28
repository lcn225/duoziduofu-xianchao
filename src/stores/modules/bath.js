// 【炼体药浴】运行时层（B4a，2026-10-27）
//
// 纯函数在 `plugins/bath.js`；这里只做四件事：
//   ① 组装 opts（预览与结算共用同一份，别各拼一次）；
//   ② 一轮炼体结算一次：先补料到 cap → 吸一次 → 把「体魄」交给 `cultivateBody`；
//   ③ 派生 UI 用的药力条 / 预览；
//   ④ 落盘（`cultivateBody` 自己会存，只吃料没吸收时要自己补一次）。
//
// ⚠ 药浴**不烧灵力**（B4a）：body 轮次不再调 `meditateInSlice`，灵力全归内功打坐。
//   体力照旧 15/h —— 白天体力预算的取舍没变（《炼体药浴》§八）。
// ⚠ 老档没有 `bath` 字段：靠 `persistence.deepMerge` 按默认值补齐，
//   **不写 migrate、不动 `SAVE_VERSION`**。

import {
  BATH_ELEMENTS,
  BATH_POOL_UNLOCK_MANOR_LEVEL,
  bathParamsOf,
  bathPoolCapMultiplierOf,
  bathPoolLevelOf,
  bathPoolStockLimitOf,
  canAbsorb,
  convertBathPool,
  createBathPoolState,
  emptyMedicine,
  medicinePctOf,
  normalizeBathPool,
  planBathRound,
  planPoolFill
} from '../../plugins/bath.js'
import { REALM_MAX_LEVEL } from '../../plugins/realm.js'

export const state = () => ({
  // 五系药力池：{ metal, wood, water, fire, earth }
  // pool = 药浴池的独立仓（B4b）：建池后材料从背包搬到这里全天候转换
  bath: { medicine: emptyMedicine(), pool: createBathPoolState() }
})

export const getters = {
  /** 五系药力（老档 / 脏档缺字段时补 0，写回不做，读的地方统一走这里） */
  bathMedicine() {
    const raw = this.bath?.medicine || {}
    const out = emptyMedicine()
    for (const el of BATH_ELEMENTS) {
      const v = Number(raw[el])
      out[el] = Number.isFinite(v) ? v : 0
    }
    return out
  },

  /**
   * 药力上限倍率（真值表 §5.11b）：建了药浴池就按池子等级 ×1 / 1.5 / 2 / 3 / 4，
   * 没建池 = 浴桶口径 ×1。
   */
  bathCapMultiplier() {
    return bathPoolCapMultiplierOf(this.bathPoolLevel)
  },

  bathParams() {
    return bathParamsOf(this.bodyLevel, { capMultiplier: this.bathCapMultiplier })
  },

  /** 五系药力百分比（UI 药力条） */
  bathMedicinePct() {
    return medicinePctOf(this.bathMedicine, this.bathParams.cap)
  },

  bathCanAbsorb() {
    return canAbsorb(this.bathMedicine, this.bathParams)
  },

  /** 药浴池等级；0 = 没建 */
  bathPoolLevel() {
    return bathPoolLevelOf(this.estate?.buildings?.bathhouse)
  },

  /** 药浴池解锁了没有（乡侯府 Lv.2，§9.1） */
  bathPoolUnlocked() {
    return (Number(this.estate?.buildings?.manor) || 0) >= BATH_POOL_UNLOCK_MANOR_LEVEL
  },

  /**
   * 药浴池建成了没有。
   * **A4（2026-10-26）：浴桶与药浴池不并存 —— 建池后浴桶关闭**，只吸不补，
   * 材料由池子全天候转换。
   */
  bathPoolBuilt() {
    return this.bathPoolLevel > 0
  },

  /** 池子独立仓里的材料（脏档兜底：非数组 / 缺 id 的直接扔掉） */
  bathPoolStock() {
    return normalizeBathPool(this.bath?.pool).stock
  },

  /**
   * 封地页「药浴池」卡片要的全部展示值。
   * ⚠ 存量上限 / 药力上限倍率都**只按池子等级算**，转换速率恒定 1 件/小时（§9.2）。
   */
  bathPoolView() {
    const level = this.bathPoolLevel
    const pool = normalizeBathPool(this.bath?.pool)
    const params = this.bathParams
    return {
      level,
      built: level > 0,
      unlocked: this.bathPoolUnlocked,
      stockCount: pool.stock.length,
      stockLimit: bathPoolStockLimitOf(level),
      capMultiplier: bathPoolCapMultiplierOf(level),
      convertedTotal: pool.convertedTotal,
      /** 每小时恒定 1 件（§9.2） */
      perHour: 1,
      /** 转完现货需要多久（游戏小时）；用于文案提示 */
      hoursToConvert: pool.stock.length,
      medicine: this.bathMedicine,
      medicinePct: this.bathMedicinePct,
      cap: params.cap,
      floor: params.floor,
      /** 离下一次转换还有多少游戏秒 */
      secondsToNext: Math.max(
        3600 - (Math.max(Number(this.clockGameTime) || 0, 0) - pool.lastConvertSeconds) % 3600,
        0
      )
    }
  },

  /** 外功已到顶（18 级 + 体魄满）—— 再吃药浴没有意义，直接停嘴 */
  bathMaxed() {
    return (
      Number(this.bodyLevel) >= REALM_MAX_LEVEL &&
      Number(this.bodyCultivation) >= Number(this.maxBodyCultivation)
    )
  },

  /** 药浴的排除项 —— **浴桶与池子共用同一套防呆漏斗**（《炼体药浴》§四 / §9.3） */
  bathExcludeOptions() {
    return {
      lockedSpecies: Array.isArray(this.lockedSpecies) ? this.lockedSpecies : [],
      activeFateItemId: this.practice?.fateItems?.active || null,
      activePetId: this.activePet?.id || null,
      equippedIds: []
    }
  },

  /** 结算 / 预览共用的 opts（改一处两边同时生效，断言里比对 deep equal） */
  bathPlanOptions() {
    return {
      items: this.items || [],
      medicine: this.bathMedicine,
      bodyLevel: this.bodyLevel,
      capMultiplier: this.bathCapMultiplier,
      maxed: this.bathMaxed,
      instantTopUp: !this.bathPoolBuilt,
      ...this.bathExcludeOptions
    }
  },

  /**
   * 下一轮会吃哪些材料（只读预览，《炼体药浴》§六.2 明确要求给玩家看）。
   * 纯函数、不落地 —— 拿完就丢，别把 `medicine` 写回 state。
   */
  bathPreview() {
    const plan = planBathRound(this.bathPlanOptions)
    return {
      picks: plan.consumed,
      absorbed: plan.absorbed,
      gained: plan.gained,
      medicine: plan.medicine,
      params: plan.params
    }
  }
}

export const actions = {
  /**
   * **药浴池的懒结算**：把「上次结算 → nowSeconds」之间的整小时数一次转完（1 件/小时）。
   *
   * 调用点有三处（都幂等，重复调只是空转）：
   *   · `clock.js` 的 tick —— 探索 / 秘境时 dayLoop 冻结，但池子照样全天候转；
   *   · `advanceDayLoop` —— 离线重放不走 tick，靠这一处补上；
   *   · `runOfflineSimulation` 收尾 —— 探索 / 秘境那条线连 dayLoop 都不走。
   *
   * ⚠ 这里**不落盘**：tick 每 15 游戏分跑一次，自己存会把 IndexedDB 打爆；
   *   在线由 tick 末尾的 `saveData`、离线由批次吞掉，两边都已经有落盘点。
   */
  settleBathPool(nowSeconds) {
    if (!this.bathPoolBuilt) return null
    // 快路径：没到整小时就直接走 —— tick 每 15 游戏分（≈0.25 现实秒）一次，
    // 每次都去 normalize 上万件存量会把主线程拖死
    const raw = this.bath?.pool
    const last = Number(raw?.lastConvertSeconds) || 0
    if ((Number(nowSeconds) || 0) - last < 3600) return null
    const result = convertBathPool(normalizeBathPool(raw), {
      nowSeconds,
      medicine: this.bathMedicine,
      params: this.bathParams,
      // 外功满级 = 再吞就是白扔材料（与浴桶「满级停嘴」同规则）
      maxed: this.bathMaxed
    })
    if (result.hours <= 0) return result
    this.bath = { ...(this.bath || {}), medicine: result.medicine, pool: result.pool }
    return result
  },

  /**
   * **一键投入**：按「先低阶 → 同阶先低成色」把背包里的五系灵材搬进池子，填到存量上限。
   * 装备中 / 品种锁 / 同参 / 出战灵宠占用的材料自动跳过（与浴桶同一套漏斗）。
   */
  fillBathPool() {
    if (!this.bathPoolBuilt) return { ok: false, message: '药浴池还没建' }
    const pool = normalizeBathPool(this.bath?.pool)
    const limit = bathPoolStockLimitOf(this.bathPoolLevel)
    if (pool.stock.length >= limit) return { ok: false, message: '池子已经装满' }
    const picks = planPoolFill({
      items: this.items || [],
      stock: pool.stock,
      stockLimit: limit,
      opts: this.bathExcludeOptions
    })
    if (!picks.length) return { ok: false, message: '背包里没有可投入的五系灵材' }

    const ids = new Set(picks.map(item => item.id))
    this.items = (this.items || []).filter(item => !ids.has(item.id))
    // `location:'estate'` = 不占背包容量；取出时再改回 'inventory'
    const moved = picks.map(item => ({ ...item, location: 'estate' }))
    this.bath = { ...this.bath, pool: { ...pool, stock: [...pool.stock, ...moved] } }
    this.saveData()
    return { ok: true, count: moved.length }
  },

  /**
   * **全部取出**：把池子里**还没转换**的材料退回背包（已转化的药力不可逆，见 §9.2）。
   */
  emptyBathPool() {
    const pool = normalizeBathPool(this.bath?.pool)
    if (!pool.stock.length) return { ok: false, message: '池子里没有材料' }
    const back = pool.stock.map(item => ({ ...item, location: 'inventory' }))
    this.items = [...(this.items || []), ...back]
    this.bath = { ...this.bath, pool: { ...pool, stock: [] } }
    this.saveData()
    return { ok: true, count: back.length }
  },

  /**
   * **一轮炼体**（1 游戏小时）结算一次 —— 由 `dayLoop` 的 `completions` 调用。
   *
   * ⚠ 不能按切片结算：一个 body 轮 = 4 个 tick，按切片会吸 4 次、日修为翻四倍。
   *
   * @returns {object} `planBathRound` 的结果（`consumed` / `absorbed` / `gained` 给流水账用）
   */
  settleBodyRound({ offline = false } = {}) {
    const plan = planBathRound(this.bathPlanOptions)
    // 没吃也没吸 —— 药力不足或已满级。不动 state，也不落盘。
    if (!plan.consumed.length && !plan.absorbed) return plan

    if (plan.consumed.length) {
      const ids = new Set(plan.consumed.map(item => item.id))
      this.items = (this.items || []).filter(item => !ids.has(item.id))
    }
    this.bath = { ...this.bath, medicine: plan.medicine }

    if (plan.absorbed) {
      // cultivateBody 内部会 clamp / 突破 / saveData —— 这里不要重复存
      this.cultivateBody(plan.gained, { countTime: !offline })
    } else {
      // 只吃了料、没吸收到：`dayLoop` 末尾那条 save 条件在有练功切片时会跳过，
      // 所以这一笔必须自己落盘，否则刷新就丢了吃掉的材料
      this.saveData()
    }
    return plan
  }
}
