import {
  getRealmName,
  getBodyRealmName,
  REALM_MAX_LEVEL,
  INITIAL_REALM_NAME,
  INITIAL_BODY_REALM_NAME
} from '../../plugins/realm'
// 游戏秒 → 游戏小时（就是 s/3600）。灵力按**游戏小时**结算，见 gainSpirit。
import { hoursFromSeconds } from '../../plugins/harmony'

/** 默认道号（小说主角） */
export const INITIAL_PLAYER_NAME = '桂冈'

// 角色本体：身份、内外功境界、灵力与各项倍率、修炼统计
export const state = () => ({
  // 基础属性
  name: INITIAL_PLAYER_NAME,
  nameChangeCount: 0, // 道号修改次数
  level: 1, // 内功境界等级（扁平索引 1..18）
  realm: INITIAL_REALM_NAME, // 当前内功境界名称
  cultivation: 0, // 当前修为值
  maxCultivation: getRealmName(1).maxCultivation, // 当前境界最大修为值
  // 外功（炼体）平行线：与内功独立进度，不互为前置
  bodyLevel: 1, // 外功境界等级（扁平索引 1..18）
  bodyRealm: INITIAL_BODY_REALM_NAME, // 当前外功境界名称
  bodyCultivation: 0, // 当前体魄值
  maxBodyCultivation: getBodyRealmName(1).maxCultivation, // 当前外功境界最大体魄值
  spirit: 0, // 灵力值
  spiritRate: 1, // 灵力获取倍率
  luck: 1, // 幸运值
  cultivationRate: 1, // 修炼速率
  herbRate: 1, // 灵草获取倍率
  alchemyRate: 1, // 炼丹成功率加成
  // 统计数据
  totalCultivationTime: 0, // 总修炼时间
  breakthroughCount: 0 // 突破次数
})

export const getters = {}

export const actions = {
  /**
   * 一段**练功**的结算。由「桂冈的一天」的 dayLoop 在练功切片上调用
   * （旧版是每 tick 无条件调 —— 那次改动见下）。
   *
   * ⚠ **灵力按游戏小时结算**（`gameSeconds / 3600`），不是每 tick 加一个常数。
   *   历史写法是 `this.spirit += this.spiritPerSecond` —— 那在「1 现实秒 = 1 游戏小时」时
   *   恰好等价，但时钟一放慢就露馅：一个游戏天的 tick 数从 24 变成 96，
   *   **每游戏天白送 4 倍灵力**。现在口径是「灵力 / 游戏小时」，与时钟快慢解耦。
   *   （这正是 CLAUDE.md「坑 §2」那个「单位换算藏在常量里」的同一个形状。）
   *
   * 一并累积功法熟练度 —— 放这里是为了每秒只写一次 IndexedDB，
   * 所以 accumulatePractice 自己不再 saveData。
   *
   * @param gameSeconds 本段推进的游戏秒（由时钟 / dayLoop 给出，含 MAX_TICK_REAL_SECONDS 钳制）
   *
   * 速率直接读 getter `spiritPerGameHour`（唯一真源），不由调用方传 amount ——
   * 旧版 UI 另拼了一份公式且漏了 rebirthSpiritMultiplier，两处口径对不上。
   */
  gainSpirit(gameSeconds = 0) {
    this.accumulatePractice(gameSeconds)
    const gained = this.spiritPerGameHour * hoursFromSeconds(gameSeconds)
    this.spirit += gained
    this.totalCultivationTime += 1
    // 调试日志（P15.6）：记**产出量**而不是余额变化 —— 灵力紧接着就被打坐花掉了。
    // 关闭时 debugEnsureAccumulator 直接返回 null，这里没有额外开销。
    this.debugNoteSpirit(gained, gameSeconds)
    this.saveData()
  },
  // 修炼增加修为
  cultivate(amount) {
    // 确保amount是数字类型
    const numAmount = Number(String(amount).replace(/[^0-9.-]/g, '')) || 0
    this.cultivation = Number(String(this.cultivation).replace(/[^0-9.-]/g, '')) || 0
    this.cultivation += numAmount * this.rebirthCultivationMultiplier
    this.totalCultivationTime += 1 // 增加修炼时间统计
    // 修为封顶：被门槛拦住时不再无限膨胀，也让「还需多少」的显示稳定
    if (this.cultivation > this.maxCultivation) this.cultivation = this.maxCultivation
    // 被契合度门槛拦住时不调用，避免每秒自动修炼都在做一次无效突破尝试
    if (this.cultivation >= this.maxCultivation && !this.isBreakthroughBlocked) {
      this.tryBreakthrough()
    }
    this.saveData()
  },
  // 修炼增加体魄（外功）—— 与 cultivate 同构，只是走 bodyCultivation
  cultivateBody(amount) {
    const numAmount = Number(String(amount).replace(/[^0-9.-]/g, '')) || 0
    this.bodyCultivation = Number(String(this.bodyCultivation).replace(/[^0-9.-]/g, '')) || 0
    this.bodyCultivation += numAmount * this.rebirthCultivationMultiplier
    this.totalCultivationTime += 1
    if (this.bodyCultivation > this.maxBodyCultivation) this.bodyCultivation = this.maxBodyCultivation
    // 外功**不设契合度门槛** —— 内功被门槛卡住时，炼体是一条始终可推进的路
    if (this.bodyCultivation >= this.maxBodyCultivation) {
      this.tryBodyBreakthrough()
    }
    this.saveData()
  },
  // 尝试突破（内功）
  tryBreakthrough() {
    // 检查是否可以突破到下一个境界
    if (this.level < REALM_MAX_LEVEL) {
      // 注意：getRealmName(n) 返回的是「第 n 级」的境界，
      // 所以要突破到下一级就得传 this.level + 1，传 this.level 会停在原地
      const nextRealm = getRealmName(this.level + 1)
      // 门槛节点需**综合契合度**达标；普通小境界 harmonyRequired 为 0，直接放行。
      // 只做门槛拦截，不做随机失败 —— 达标即必定成功。
      if (nextRealm.harmonyRequired > 0 && this.overallHarmony < nextRealm.harmonyRequired) {
        return false
      }
      // 灵地品阶是**硬条件**：不达标时契合度再高也不能突破（筑基要一阶、结丹要三阶）
      if (nextRealm.spiritLandRequired && !this.isLandTierSufficient) {
        return false
      }
      // 更新境界信息
      this.level += 1
      this.realm = nextRealm.name // 使用完整的境界名称（如：练气三层）
      this.maxCultivation = nextRealm.maxCultivation
      this.cultivation = 0 // 重置修为值
      this.breakthroughCount += 1 // 增加突破次数
      // 解锁新境界
      if (!this.unlockedRealms.includes(nextRealm.name)) {
        this.unlockedRealms.push(nextRealm.name)
      }
      // 突破奖励
      this.spirit += 100 * this.level // 获得灵力奖励
      this.spiritRate *= 1.2 // 提升灵力获取倍率
      this.saveData()
      return true
    }
    return false
  },
  // 尝试突破（外功）
  // 与内功对称、进度完全独立。**不设契合度门槛**（纯水磨，符合「外功天然落后」）。
  tryBodyBreakthrough() {
    if (this.bodyLevel < REALM_MAX_LEVEL) {
      const nextRealm = getBodyRealmName(this.bodyLevel + 1)
      this.bodyLevel += 1
      this.bodyRealm = nextRealm.name
      this.maxBodyCultivation = nextRealm.maxCultivation
      this.bodyCultivation = 0
      // 与内功对称的奖励。炼体的生命/防御加成**不在这里发** —— 它由
      // practice.bodyBonus 纯 getter 派生，避免与装备/灵宠的增量加减叠加产生漂移。
      this.spirit += 50 * this.bodyLevel
      this.saveData()
      return true
    }
    return false
  }
}
