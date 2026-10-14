import { planCultivationToBreakthrough } from '../plugins/cultivationMath'

// 「一键修炼到突破」的批量计算。
//
// 只做纯计算，不持有状态、不判突破；扣灵力/加修为/突破都由主线程负责。
// worker 是 `new Worker(..., { type: 'module' })` 创建的，可以直接用 ESM import。
//
// level 由主线程传入 —— 内功传 level、外功传 bodyLevel，协议无需区分。
self.onmessage = ({ data }) => {
  const { type, playerData } = data
  if (type !== 'cultivateUntilBreakthrough') return
  try {
    const { level, spirit, cultivation, maxCultivation, luck } = playerData
    const plan = planCultivationToBreakthrough(level, spirit, cultivation, maxCultivation, luck)
    if (!plan.ok) {
      self.postMessage({ type: 'error', message: plan.reason })
      return
    }
    self.postMessage({
      type: 'success',
      result: {
        spiritCost: plan.spiritCost,
        cultivationGain: plan.cultivationGain,
        doubleGainTimes: plan.doubleGainTimes
      }
    })
  } catch (error) {
    self.postMessage({ type: 'error', message: '修炼计算出错' })
  }
}
