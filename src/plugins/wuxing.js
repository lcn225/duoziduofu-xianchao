// 五行体系
//
//   相生：木 → 火 → 土 → 金 → 水 → 木
//   相克：木克土、土克水、水克火、火克金、金克木
//
// 方向性说明：判定函数会返回 dir（主生客 / 客生主），但**默认同权** ——
// A生B 与 B生A 对契合度的加成相同。理由：契合度衡量的是「搭不搭」而不是
// 「谁养谁」，拆方向权只会增加玩家理解成本，不增加策略深度。
// 保留 dir 是为了留一个「只改常量就能拆权」的口子。

// 7 类灵气：五行之外的两类特殊灵气（《灵气系统》§2.1）。
//   灵兽/妖兽 → 兽；器物/法器 → 器（注意：武器是「器」灵根，不是金灵根）
// 兽 / 器 与五行之间**没有**相生相克关系，getRelation 对它们天然返回 neutral。
export const ELEMENTS = {
  metal: '金',
  wood: '木',
  water: '水',
  fire: '火',
  earth: '土',
  beast: '兽',
  vessel: '器',
  // 功法专用（《功法系统》§2.1）：所有修士视同完全匹配，不参与相生相克
  universal: '通用'
}

/** 参与相生相克的只有五行；兽/器不参与 */
export const FIVE_ELEMENTS = ['metal', 'wood', 'water', 'fire', 'earth']

const GENERATES = { wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', water: 'wood' }
const OVERCOMES = { wood: 'earth', earth: 'water', water: 'fire', fire: 'metal', metal: 'wood' }

/**
 * 判定主客五行关系。
 * @returns {{ kind: 'same'|'generate'|'overcome'|'neutral', dir: 'none'|'forward'|'reverse' }}
 *          forward 表示「主生/克客」，reverse 表示「客生/克主」
 */
export const getRelation = (subject, object) => {
  if (!subject || !object) return { kind: 'neutral', dir: 'none' }
  if (subject === object) return { kind: 'same', dir: 'none' }
  if (GENERATES[subject] === object) return { kind: 'generate', dir: 'forward' }
  if (GENERATES[object] === subject) return { kind: 'generate', dir: 'reverse' }
  if (OVERCOMES[subject] === object) return { kind: 'overcome', dir: 'forward' }
  if (OVERCOMES[object] === subject) return { kind: 'overcome', dir: 'reverse' }
  return { kind: 'neutral', dir: 'none' }
}

/**
 * 按系数表给关系打分。
 *
 * coeffs 支持两种写法：
 *   { same: 0.3, generate: 0.4, overcome: -0.1 }                  ← 同权（当前用法）
 *   { generate: { forward: 0.4, reverse: 0.2 } }                  ← 拆方向权
 * 将来若要区分主客，只改常量即可，公式不用动。
 */
export const matchScore = (subject, object, coeffs) => {
  const { kind, dir } = getRelation(subject, object)
  const entry = coeffs ? coeffs[kind] : undefined
  if (entry === undefined || entry === null) return 0
  if (typeof entry === 'object') return entry[dir] ?? entry.forward ?? 0
  return entry
}

export const elementName = key => ELEMENTS[key] || key

/**
 * 判定两组灵气是否「同属」——按**集合完全相等**判定。
 *
 * ⚠ 用途只剩散功重修分档（《修炼系统》§1.2 的「五行相同、类型相同」）。
 *   原本声明的第二个用途——子嗣修炼加成的「同五行」系数——已**作废**：
 *   桂冈的本命是兽 + 器（非五行），拿子嗣本命的单个 element 去比对玩家的
 *   双元素集合永远为 false，那一档是死代码，模块二落地时整档删除
 *   （见 plugins/innerCourt.js 的 TUNING.bonus.fateFitCoef，只剩三档）。
 *   所以本函数当前**没有任何调用方** —— 留着是因为散功重修细化时还要用。
 *
 * 注意这不用于契合度：功法匹配与灵地匹配走的是「覆盖率」，不是「关系」。
 */
export const isSameElementGroup = (a, b) => {
  const x = [...new Set(a || [])].sort()
  const y = [...new Set(b || [])].sort()
  return x.length > 0 && x.length === y.length && x.every((e, i) => e === y[i])
}
