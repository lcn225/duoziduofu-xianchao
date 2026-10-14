// 五行体系
//
//   相生：木 → 火 → 土 → 金 → 水 → 木
//   相克：木克土、土克水、水克火、火克金、金克木
//
// 方向性说明：判定函数会返回 dir（主生客 / 客生主），但**默认同权** ——
// A生B 与 B生A 对契合度的加成相同。理由：契合度衡量的是「搭不搭」而不是
// 「谁养谁」，拆方向权只会增加玩家理解成本，不增加策略深度。
// 保留 dir 是为了留一个「只改常量就能拆权」的口子。

export const ELEMENTS = {
  metal: '金',
  wood: '木',
  water: '水',
  fire: '火',
  earth: '土'
}

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
