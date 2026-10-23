// 家族树（《模块二》§15.6.1 / §15.6.2，2026-10-23 定稿）
//
// 树本质是**父系树**：子嗣按 Y 染判定，只有男系往下传。
//   · 第一代（桂冈亲生）：fatherId 为 null，按 motherId 挂到侍妾节点下
//   · 孙辈及以下：按 fatherId 挂到生父节点下，motherId 是空的，只有 motherName
//
// ⚠ 儿媳**不上树**（§15.6.1）：spouse 是子嗣对象里的内嵌对象，没有全局 id，
//   强行上树会逼出一套假 id，还会让「同一人」在树里出现两次。孙辈行旁注
//   `[母：张氏]` 就够了。
//
// ⚠ 本文件是**纯函数**，不读 store、不碰 DOM —— 游戏内渲染和 JSON 导出共用同一棵树。

import { ELEMENTS } from './wuxing.js'
import { offspringRealmNameOf } from './innerCourt.js'

/** 老档兜底节点：既没有 fatherId 也没有 motherId 的子嗣挂这里，不丢人、不猜母 */
export const LOST_BRANCH_ID = '__lost__'

const isAliveOf = node => node?.status !== 'fallen' && node?.status !== 'passed_away'

const rootsOf = child => {
  const list = Array.isArray(child?.roots) ? child.roots : []
  return list.map(element => ELEMENTS[element] || element).filter(Boolean)
}

const fatesOf = child => {
  const list = Array.isArray(child?.fates) ? child.fates : child?.fate ? [child.fate] : []
  return list.map(fate => ({ name: fate?.name || '未名', tier: Number(fate?.tier) || 0 }))
}

/** 排序：出生早的在前，同秒按 id，保证刷新不跳行 */
const byBirth = (a, b) =>
  (Number(a?.birthTime) || 0) - (Number(b?.birthTime) || 0) ||
  String(a?.id || '').localeCompare(String(b?.id || ''))

/**
 * 子嗣 → 树节点。
 * `realm` 对无灵根子嗣是「凡人」——§15.6.1 要求无灵根只显示姓名，由渲染层决定不打印。
 */
const offspringNodeOf = child => {
  const isFemale = child?.gender === 'female'
  return {
    id: child?.id || '',
    name: child?.name || '无名',
    type: 'offspring',
    gender: child?.gender || 'male',
    generation: Number(child?.generation) || 1,
    status: child?.status || 'alive',
    alive: isAliveOf(child),
    realm: child?.hasRoot ? offspringRealmNameOf(child?.realmLevel) : '凡人',
    hasRoot: !!child?.hasRoot,
    rootCount: Number(child?.rootCount) || 0,
    roots: rootsOf(child),
    fates: fatesOf(child),
    motherName: child?.motherName || '',
    /** 女儿一律当外嫁：没有建模后代，💍 叶子节点（§15.6.1） */
    marriedOut: isFemale,
    children: []
  }
}

/** 侍妾 → 树节点。寿终节点保留并变灰，子嗣分支不因她死亡而断 */
const wifeNodeOf = wife => ({
  id: wife?.id || '',
  name: wife?.name || '无名',
  type: 'wife',
  rank: Number(wife?.rank) || 1,
  status: wife?.status || 'idle',
  alive: isAliveOf(wife),
  /** 该侍妾的亲生子女数（不含孙辈；孙辈挂在儿子名下） */
  childCount: 0,
  children: []
})

/**
 * 把平铺的妻妾 + 子嗣组装成嵌套树。
 *
 * @param {object}   opts
 * @param {string}   opts.playerName  桂冈
 * @param {string}   opts.playerRealm 桂冈当前境界文案
 * @param {Array}    opts.wives       **全量**妻妾（含已故）
 * @param {Array}    opts.offspring   子嗣全量
 * @returns {object} 根节点（type: 'player'）
 */
export const buildFamilyTree = ({
  playerName = '桂冈',
  playerRealm = '',
  wives = [],
  offspring = []
} = {}) => {
  const root = {
    id: 'root_player',
    name: playerName,
    type: 'player',
    status: 'alive',
    alive: true,
    realm: playerRealm,
    children: []
  }
  const lost = {
    id: LOST_BRANCH_ID,
    name: '旁系 / 失传',
    type: 'lost',
    status: 'alive',
    alive: true,
    children: []
  }

  const wifeById = new Map()
  for (const wife of wives) {
    const node = wifeNodeOf(wife)
    if (node.id) wifeById.set(node.id, node)
    root.children.push(node)
  }

  const list = [...offspring].sort(byBirth)
  const offspringById = new Map()
  for (const child of list) if (child?.id) offspringById.set(child.id, child)

  const nodeById = new Map()
  /** 缺父缺母、或 parents 指向已不存在的条目 → 兜底 */
  const resolveParent = child => {
    const fatherId = child?.fatherId
    if (fatherId) {
      const father = nodeById.get(fatherId)
      if (father) return father
    }
    const motherId = child?.motherId
    if (motherId && wifeById.has(motherId)) return wifeById.get(motherId)
    return null
  }

  // 两轮：先按出生序把所有节点建出来，再挂父子关系 ——
  // 老档的数组顺序不保证父在前，一轮挂载会丢分支。
  for (const child of list) {
    const node = offspringNodeOf(child)
    node.id = node.id || `off_${nodeById.size}`
    nodeById.set(node.id, node)
  }
  for (const child of list) {
    const node = nodeById.get(child.id)
    if (!node) continue
    const parent = resolveParent(child)
    // 生父是外嫁女儿的脏档：照样不展开，移到兜底节点，别挂在 💍 叶子下面。
    // ⚠ 女儿**自己**照常挂到生母名下（她是叶子，不是隐形人）—— 别写成「跳过 marriedOut 节点」。
    if (parent && !parent.marriedOut) {
      parent.children.push(node)
      continue
    }
    // fatherId 指向不存在的生父（老档/脏档）且没有可用母亲 → 兜底
    lost.children.push(node)
  }

  if (lost.children.length) root.children.push(lost)

  for (const wife of root.children) {
    if (wife.type !== 'wife') continue
    // 亲生子女数 = 挂在本人名下的第一代（老档 childrenIds 可能缺，所以数树而不是读字段）
    wife.childCount = wife.children.length
  }

  return root
}

/**
 * 树 → 扁平行列表，供渲染/虚拟滚动。
 *
 * @param {object}   root
 * @param {Function} isCollapsed  (node) => boolean，返回 true 则该节点的子节点不展开
 * @returns {Array<{node, depth, hasChildren, collapsed}>}
 */
export const flattenFamilyTree = (root, isCollapsed = () => false) => {
  const rows = []
  const walk = (node, depth) => {
    const hasChildren = !!node?.children?.length
    const collapsed = hasChildren && !!isCollapsed(node)
    rows.push({ node, depth, hasChildren, collapsed })
    if (hasChildren && !collapsed) for (const c of node.children) walk(c, depth + 1)
  }
  if (root) walk(root, 0)
  return rows
}

/**
 * 树 → 导出 JSON（§15.6.2）。只留外部生成器要的字段，不带内部状态。
 * `roots` / `fates` 是外部图「单灵根发光、极品本命专属边框」的数据源。
 */
export const familyTreeToExport = root => {
  if (!root) return null
  const pick = node => {
    const out = {
      id: node.id,
      name: node.name,
      type: node.type,
      status: node.status,
      children: (node.children || []).map(pick)
    }
    if (node.type === 'player') out.realm = node.realm
    if (node.type === 'wife') {
      out.rank = node.rank
      out.childCount = node.childCount
    }
    if (node.type === 'offspring') {
      out.generation = node.generation
      out.realm = node.realm
      out.rootCount = node.rootCount
      out.roots = [...node.roots]
      out.fates = node.fates.map(fate => ({ ...fate }))
      out.motherName = node.motherName
      if (node.marriedOut) out.marriedOut = true
    }
    return out
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    root: pick(root)
  }
}
