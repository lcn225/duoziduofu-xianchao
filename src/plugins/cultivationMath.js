// 修炼数值公式的**唯一定义**
//
// 修炼不再由页面的「打坐 / 自动修炼 / 一键突破」驱动（2026-10-18 P12.2），
// 而是只在「镇守」的练功环节由 dayLoop / core 调用。这里保留三组基础公式。
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
