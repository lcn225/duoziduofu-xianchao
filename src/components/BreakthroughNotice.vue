<template>
  <!--
    「突破」提示（A1-3，2026-10-30）—— 第 3 档居中弹窗里的那一格。

    ⚠ **不暂停时钟**：不进 clock.js 的 PAUSE_ROUTES，也不调 pauseClockForEvent。
      所以遮罩 / ESC / 关闭按钮**都可以关**（与「诞生」弹窗相反 —— 那个暂停时钟）。
    ⚠ 队列留在组件里（reactive 数组），**不进存档**：刷新页面丢掉未读提示无所谓，
      弄进 $state 反而会被 toRaw 序列化进去、白占存档体积（P57/P58 的教训）。
    ⚠ 离线重放期间 `plugins/breakthroughNotice` 是 silent，不会推到这里
      —— 离线只进「闭关归来」报告（同一条文案格式）。
  -->
  <n-modal
    :show="!!current"
    preset="card"
    title="突破"
    :closable="true"
    :mask-closable="true"
    :close-on-esc="true"
    :style="{ maxWidth: '92vw', width: '420px' }"
    class="breakthrough-notice"
    @update:show="onShowChange"
  >
    <div v-if="current" class="bt-body">
      <div class="bt-title">{{ breakthroughTitleOf(current) }}</div>

      <!-- 2×2 网格：宽屏四列、窄屏两列，增量不折行（《下一步》A1-3 §2.2） -->
      <div class="bt-grid">
        <div v-for="row in rows" :key="row.key" class="bt-cell">
          <span class="bt-k">{{ row.label }}</span>
          <span class="bt-v">{{ row.value }}</span>
          <span class="bt-d">（{{ row.delta }}）</span>
        </div>
      </div>

      <div class="bt-foot">
        <span v-if="restCount > 0" class="bt-rest">还有 {{ restCount }} 条待看</span>
        <n-button type="primary" size="small" @click="next">好</n-button>
      </div>
    </div>
  </n-modal>
</template>

<script setup>
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
  import { NButton } from 'naive-ui'
  import {
    breakthroughRowsOf,
    breakthroughTitleOf,
    enqueueBreakthrough,
    onBreakthrough
  } from '../plugins/breakthroughNotice.js'

  /** 待展示的队列；`current` 永远是队首 */
  const queue = ref([])
  const current = computed(() => queue.value[0] || null)
  const rows = computed(() => (current.value ? breakthroughRowsOf(current.value) : []))
  const restCount = computed(() => Math.max(queue.value.length - 1, 0))

  let off = null

  onMounted(() => {
    off = onBreakthrough(record => {
      queue.value = enqueueBreakthrough(queue.value, record)
    })
  })

  onBeforeUnmount(() => {
    if (off) off()
  })

  /** 关掉队首（按钮 / 关闭图标 / 遮罩 / ESC 都走这里） */
  const next = () => {
    queue.value = queue.value.slice(1)
  }

  /** `n-modal` 的关闭回调：只有「关」才出队，别把「弹出来」也当成关闭 */
  const onShowChange = show => {
    if (!show) next()
  }
</script>

<style scoped>
  .breakthrough-notice {
    background: var(--ui-surface);
  }

  .bt-title {
    font-size: 17px;
    font-weight: 700;
    color: var(--ui-jade);
    letter-spacing: 0.04em;
    margin-bottom: 14px;
  }

  .bt-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 8px 12px;
  }

  .bt-cell {
    display: flex;
    align-items: baseline;
    gap: 4px;
    font-size: 14px;
    white-space: nowrap;
  }

  .bt-k {
    color: var(--ui-ink-sub);
  }

  .bt-v {
    color: var(--ui-ink);
    font-weight: 600;
  }

  .bt-d {
    color: var(--ui-jade);
  }

  .bt-foot {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 18px;
  }

  .bt-rest {
    font-size: 12px;
    color: var(--ui-ink-sub);
  }
</style>
