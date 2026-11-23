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

/**
 * 卡在门槛上时，练功是否**停产灵力**（2026-11-23 用户拍板）。
 *
 * 条件 = **修为已封顶 + 突破被门槛拦住** —— 与 `meditateInSlice` 停手用的是同一个判据。
 * 旧行为是「打坐停手、灵力照产」：卡门几天就攒下一大笔，松门后每次打坐都能顶一层，
 * 几秒内连升数级（《日常循环》§2.1 的「限速」只拖慢、不限量）。
 * 现在灵力就此停产，**功法熟练度照涨**（卡门期间练心法正是脱困手段）。
 *
 * ⚠ 未封顶时必须照产：修为条要靠打坐才能填满，停了就把玩家永久卡死。
 */
export const spiritGainBlockedAtGateOf = ({
  cultivation = 0,
  maxCultivation = 0,
  breakthroughBlocked = false
} = {}) => !!breakthroughBlocked && Number(cultivation) >= Number(maxCultivation)
