<template>
  <div class="family-tree">
    <div class="family-tree__bar">
      <n-space align="center" :size="8">
        <n-button size="small" secondary @click="expandAll">全部展开</n-button>
        <n-button size="small" secondary @click="collapseToDefault">收起孙辈</n-button>
        <n-text depth="3" style="font-size: 12px">
          共 {{ stats.total }} 人（在世 {{ stats.alive }} · 陨落 {{ stats.fallen }}）
        </n-text>
        <n-button size="small" type="primary" @click="exportJson">导出族谱</n-button>
      </n-space>
    </div>

    <n-empty v-if="!rows.length" description="家族树还是空的" />

    <div v-else class="family-tree__rows">
      <div
        v-for="row in rows"
        :key="row.node.id"
        class="tree-row"
        :class="{ 'tree-row--dead': !row.node.alive, 'tree-row--root': row.depth === 0 }"
        :style="{ paddingLeft: row.depth * 16 + 'px' }"
      >
        <button
          v-if="row.hasChildren"
          class="tree-toggle"
          type="button"
          :title="row.collapsed ? '展开' : '收起'"
          @click="toggle(row.node.id)"
        >
          {{ row.collapsed ? '▸' : '▾' }}
        </button>
        <span v-else class="tree-toggle tree-toggle--leaf">·</span>

        <span class="tree-mark" :class="{ 'tree-mark--dead': statusMark(row.node) === '逝' }">
          {{ statusMark(row.node) }}
        </span>
        <!-- P41 #4：子嗣名字可点，弹与子嗣页同一张详情卡（侍妾 / 桂冈 / 兜底节点不响应） -->
        <n-button
          v-if="row.node.type === 'offspring'"
          text
          type="primary"
          size="small"
          @click="emit('open-detail', row.node.id)"
        >
          {{ row.node.name }}
        </n-button>
        <n-text v-else strong>{{ row.node.name }}</n-text>

        <!-- 桂冈 -->
        <template v-if="row.node.type === 'player'">
          <n-text depth="3" style="font-size: 12px">{{ row.node.realm }}</n-text>
        </template>

        <!-- 侍妾：位阶 + 亲生子女数 -->
        <template v-else-if="row.node.type === 'wife'">
          <n-tag size="tiny" :bordered="false">{{ rankName(row.node.rank) }}</n-tag>
          <n-text depth="3" style="font-size: 12px">
            亲生 {{ row.node.childCount }} 子{{ row.node.alive ? '' : ' · 寿终' }}
          </n-text>
        </template>

        <!-- 子嗣：有灵根才带境界；无灵根只显示姓名（§15.6.1） -->
        <template v-else-if="row.node.type === 'offspring'">
          <n-text v-if="row.node.hasRoot" depth="3" style="font-size: 12px">
            （{{ row.node.realm }}）
          </n-text>
          <n-tag v-if="row.node.hasRoot" size="tiny" :bordered="false" type="success">
            {{ rootCountName(row.node.rootCount) }}
          </n-tag>
          <n-text v-if="row.node.marriedOut" depth="3" style="font-size: 12px">已外嫁</n-text>
          <n-text v-if="row.node.motherName" depth="3" style="font-size: 12px">
            [母：{{ row.node.motherName }}]
          </n-text>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { computed, ref, watch } from 'vue'
  import { useMessage } from 'naive-ui'
  import { familyTreeToExport, flattenFamilyTree } from '../plugins/familyTree.js'
  import { rootCountName, rankName } from '../plugins/innerCourt.js'

  const props = defineProps({
    /** `buildFamilyTree` 的返回值 */
    tree: { type: Object, default: null },
    /** 导出文件名 */
    exportName: { type: String, default: '桂冈家族谱.json' }
  })

  /** P41 #4：点子嗣名字 → 由父级弹共用详情卡（本组件不自己读 store） */
  const emit = defineEmits(['open-detail'])

  const message = useMessage()

  /** 折叠集合（存 node.id）。默认只展开桂冈 + 第一代 = 所有有子孙的子嗣都收起 */
  const collapsedIds = ref(new Set())

  const defaultCollapsedIds = () => {
    const ids = new Set()
    const walk = node => {
      // 第一代挂在侍妾下，它们自己展开了才会露出孙辈 —— 所以默认收起的正是子嗣层
      if (node?.type === 'offspring' && node.children?.length) ids.add(node.id)
      for (const child of node?.children || []) walk(child)
    }
    walk(props.tree)
    return ids
  }

  watch(
    () => props.tree,
    () => {
      collapsedIds.value = defaultCollapsedIds()
    },
    { immediate: true }
  )

  const rows = computed(() =>
    props.tree ? flattenFamilyTree(props.tree, node => collapsedIds.value.has(node.id)) : []
  )

  const toggle = id => {
    const next = new Set(collapsedIds.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    collapsedIds.value = next
  }

  const expandAll = () => {
    collapsedIds.value = new Set()
  }

  const collapseToDefault = () => {
    collapsedIds.value = defaultCollapsedIds()
  }

  /** 统计只看子嗣（侍妾和兜底节点不算人） */
  const stats = computed(() => {
    let total = 0
    let alive = 0
    let fallen = 0
    const walk = node => {
      if (node?.type === 'offspring') {
        total += 1
        if (node.alive) alive += 1
        else if (node.status === 'fallen') fallen += 1
      }
      for (const child of node?.children || []) walk(child)
    }
    walk(props.tree)
    return { total, alive, fallen }
  })

  /**
   * 状态符号（§15.6.1）：存活不打标 / **逝**（陨落与寿终）/ 💍 已外嫁 / 🏠 已分家（未来）。
   * 🏠 要等模块四分家才有数据，这里先不打印。
   * 2026-10-25（P41 #5）：十字架 `✝` 换成中文「逝」（灰色小字），修仙世界不挂十字。
   */
  const statusMark = node => {
    if (!node) return ''
    if (node.type === 'player') return '🏠'
    if (node.type === 'lost') return '⋯'
    if (node.type === 'wife') return node.alive ? '' : '逝'
    if (node.marriedOut) return '💍'
    if (!node.alive) return '逝'
    return ''
  }

  /**
   * 导出 §15.6.2 的 JSON。
   * ⚠ `URL.revokeObjectURL` **不能**紧跟 `a.click()` —— 部分浏览器会当场取消下载，
   *   所以放到 setTimeout 里回收。
   */
  const exportJson = () => {
    if (!props.tree) return
    const payload = familyTreeToExport(props.tree)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = props.exportName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    message.success('族谱已导出，拖进「族谱生成器」就能看大树')
  }
</script>

<style scoped>
  .family-tree__bar {
    margin-bottom: 10px;
  }

  .family-tree__rows {
    border: 1px solid var(--n-border-color, #efeff5);
    border-radius: 6px;
    padding: 6px 8px;
    max-height: 62vh;
    overflow: auto;
  }

  .tree-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-top: 3px;
    padding-bottom: 3px;
    font-size: 13px;
    line-height: 1.5;
    white-space: nowrap;
  }

  .tree-row--root {
    font-size: 14px;
    border-bottom: 1px dashed var(--n-border-color, #efeff5);
    margin-bottom: 4px;
  }

  /* 已故 / 陨落：整行变灰，子嗣分支照样保留（§15.6.1） */
  .tree-row--dead {
    opacity: 0.45;
  }

  .tree-toggle {
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 11px;
    line-height: 16px;
    text-align: center;
    flex: 0 0 16px;
  }

  .tree-toggle--leaf {
    cursor: default;
    opacity: 0.4;
  }

  .tree-mark {
    flex: 0 0 auto;
    font-size: 12px;
  }

  /* 「逝」= 陨落 / 寿终：灰字，不用符咒（P41 #5） */
  .tree-mark--dead {
    color: #909399;
    font-size: 11px;
    letter-spacing: 1px;
  }
</style>
