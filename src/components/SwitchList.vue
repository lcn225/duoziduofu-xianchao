<template>
  <n-grid :cols="2" :x-gap="12" :y-gap="12">
    <n-grid-item v-for="item in items" :key="item[keyField]">
      <n-card
        size="small"
        hoverable
        :class="{ 'is-active': isActive(item), 'is-locked': isDisabled(item) }"
        @click="onClick(item)"
      >
        <template #header>
          <n-space justify="space-between" align="center" :wrap="false">
            <span class="switch-title">{{ item.name }}</span>
            <n-tag :type="tagType(item)" size="small" :bordered="false">
              {{ tagText(item) }}
            </n-tag>
          </n-space>
        </template>

        <slot name="meta" :item="item" />
      </n-card>
    </n-grid-item>
  </n-grid>
</template>

<script setup>
  const props = defineProps({
    items: { type: Array, required: true },
    activeKey: { type: [String, Number], default: null },
    /** 取哪一列作为唯一键 */
    keyField: { type: String, default: 'id' },
    /** 返回 true 表示该项不可选（如灵地未解锁）。可传函数或数组（默认按 id 判断） */
    disabledKeys: { type: Array, default: () => [] }
  })

  const emit = defineEmits(['switch'])

  const isActive = item => item[props.keyField] === props.activeKey
  const isDisabled = item => props.disabledKeys.includes(item[props.keyField])

  const tagType = item => (isActive(item) ? 'success' : isDisabled(item) ? 'default' : 'info')
  const tagText = item => (isActive(item) ? '当前' : isDisabled(item) ? '未解锁' : '切换')

  const onClick = item => {
    if (isActive(item) || isDisabled(item)) return
    emit('switch', item[props.keyField])
  }
</script>

<style scoped>
  .switch-title {
    font-weight: 500;
  }

  .is-active {
    border-color: #18a058;
  }

  .is-locked {
    opacity: 0.55;
    cursor: not-allowed;
  }
</style>
