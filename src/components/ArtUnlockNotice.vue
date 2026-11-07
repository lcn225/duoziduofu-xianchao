<template>
  <!--
    「百艺解锁」提示（B11-a2）—— 第 3 档居中弹窗。
    ⚠ **不暂停时钟**（不进 clock.js 的 PAUSE_ROUTES）；遮罩 / ESC 都可以关。
    ⚠ 队列留在组件里，不进存档（同 BreakthroughNotice）。
  -->
  <n-modal
    :show="!!current"
    preset="card"
    title="百艺解锁"
    :closable="true"
    :mask-closable="true"
    :close-on-esc="true"
    :style="{ maxWidth: '92vw', width: '380px' }"
    class="art-unlock-notice"
    @update:show="onShowChange"
  >
    <div v-if="current" class="au-body">
      <div class="au-title">{{ artUnlockMessageOf(current) }}</div>
      <div class="au-desc">
        去「百艺」页即可排班；<strong>二阶配方</strong>要集齐残页才会自动学会。
      </div>
      <div class="au-foot">
        <span v-if="restCount > 0" class="au-rest">还有 {{ restCount }} 条待看</span>
        <n-button type="primary" size="small" @click="next">好</n-button>
      </div>
    </div>
  </n-modal>
</template>

<script setup>
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
  import { NButton } from 'naive-ui'
  import { artUnlockMessageOf, onArtUnlock } from '../plugins/artUnlockNotice.js'

  const queue = ref([])
  const current = computed(() => queue.value[0] || null)
  const restCount = computed(() => Math.max(queue.value.length - 1, 0))

  let off = null

  onMounted(() => {
    off = onArtUnlock(payload => {
      // 同一次结算最多解锁三个艺，队列上限 5 足够；重复的直接并掉
      if (queue.value.some(item => item.art === payload.art)) return
      queue.value = [...queue.value, payload]
    })
  })

  onBeforeUnmount(() => {
    if (off) off()
  })

  const next = () => {
    queue.value = queue.value.slice(1)
  }

  const onShowChange = show => {
    if (!show) next()
  }
</script>

<style scoped>
  .art-unlock-notice {
    background: var(--ui-surface);
  }

  .au-title {
    font-size: 18px;
    font-weight: 700;
    color: var(--ui-jade);
    letter-spacing: 0.04em;
    margin-bottom: 10px;
  }

  .au-desc {
    font-size: 13px;
    color: var(--ui-ink-sub);
    line-height: 1.7;
  }

  .au-foot {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 18px;
  }

  .au-rest {
    font-size: 12px;
    color: var(--ui-ink-sub);
  }
</style>
