// 修炼数值公式的**唯一定义**
//
// 原先这三组公式散在三个地方各写一份（Cultivation.vue 两份、workers/cultivation.js
// 一份），改数值必须三处同改、极易漏掉。现在统一到这里。
//
// 内外功共用同一套公式，区别只在传入的 level：内功传 level，外功传 bodyLevel。

export const BASE_CULTIVATION_COST = 10
export const BASE_CULTIVATION_GAIN = 1
export const COST_GROWTH = 1.5
export const GAIN_GROWTH = 1.2
/** 每次修炼按 luck 概率翻倍的基础几率 */
export const EXTRA_GAIN_CHANCE = 0.3

/** 打坐一次消耗的灵力 */
export const getCultivationCost = level => Math.floor(BASE_CULTIVATION_COST * Math.pow(COST_GROWTH, level - 1))

/** 打坐一次获得的修为（未计翻倍） */
export const getCultivationGain = level => Math.floor(BASE_CULTIVATION_GAIN * Math.pow(GAIN_GROWTH, level - 1))

/** 掷一次实际获得：以 EXTRA_GAIN_CHANCE × luck 的几率翻倍 */
export const rollCultivationGain = (level, luck = 1) => {
  const base = getCultivationGain(level)
  return Math.random() < EXTRA_GAIN_CHANCE * luck ? base * 2 : base
}

/**
 * 「一键修炼到突破」所需的次数与灵力。
 * 主线程与 worker 共用，避免两边算法漂移。
 */
export const planCultivationToBreakthrough = (level, spirit, cultivation, maxCultivation, luck = 1) => {
  const cost = getCultivationCost(level)
  const gain = getCultivationGain(level)
  if (gain <= 0) return { ok: false, reason: '修炼效率异常' }
  const remaining = Math.max(0, maxCultivation - cultivation)
  const times = Math.ceil(remaining / gain)
  const spiritCost = times * cost
  if (spirit < spiritCost) {
    return { ok: false, reason: `灵力不足！需要 ${spiritCost} 灵力，当前 ${spirit.toFixed(1)}` }
  }
  let totalGain = 0
  let doubleGainTimes = 0
  for (let i = 0; i < times; i++) {
    const rolled = rollCultivationGain(level, luck)
    if (rolled > gain) doubleGainTimes++
    totalGain += rolled
  }
  return { ok: true, spiritCost, cultivationGain: totalGain, doubleGainTimes, times }
}
