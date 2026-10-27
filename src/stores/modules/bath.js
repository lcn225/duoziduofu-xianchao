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
  bathParamsOf,
  canAbsorb,
  emptyMedicine,
  medicinePctOf,
  planBathRound
} from '../../plugins/bath.js'
import { REALM_MAX_LEVEL } from '../../plugins/realm.js'

export const state = () => ({
  // 五系药力池：{ metal, wood, water, fire, earth }
  bath: { medicine: emptyMedicine() }
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
   * 药力上限倍率。
   * B4a（浴桶）恒为 1；B4b 药浴池落地后改成读 `estate.buildings.bathhouse` 的等级
   * （×1 / 1.5 / 2 / 3 / 4，真值表 §5.11b）。
   */
  bathCapMultiplier() {
    return 1
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

  /**
   * 药浴池建成了没有。
   * **A4（2026-10-26）：浴桶与药浴池不并存 —— 建池后浴桶关闭**，只吸不补，
   * 材料由池子全天候转换。B4a 里 `bathhouse` 还是 `mvp:false`，这里恒 false。
   */
  bathPoolBuilt() {
    return (Number(this.estate?.buildings?.bathhouse) || 0) > 0
  },

  /** 外功已到顶（18 级 + 体魄满）—— 再吃药浴没有意义，直接停嘴 */
  bathMaxed() {
    return (
      Number(this.bodyLevel) >= REALM_MAX_LEVEL &&
      Number(this.bodyCultivation) >= Number(this.maxBodyCultivation)
    )
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
      lockedSpecies: Array.isArray(this.lockedSpecies) ? this.lockedSpecies : [],
      activeFateItemId: this.practice?.fateItems?.active || null,
      activePetId: this.activePet?.id || null,
      equippedIds: []
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
