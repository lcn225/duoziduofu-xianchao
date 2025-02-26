<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  title: {
    type: String,
    default: '系统日志'
  },
  messages: {
    type: Array,
    default: () => []
  }
})

// 日志数组和滚动引用
const logs = ref([])
const scrollRef = ref(null)

// 创建Web Worker实例
const logWorker = ref(null)

// 初始化Web Worker
onMounted(() => {
  logWorker.value = new Worker(new URL('../workers/log.js', import.meta.url), { type: 'module' })

  // 监听Worker消息
  logWorker.value.onmessage = (e) => {
    if (e.data.type === 'LOGS_UPDATED') {
      logs.value = e.data.logs
      // 下一帧滚动到底部
      setTimeout(() => {
        if (scrollRef.value) {
          scrollRef.value.scrollTo({ top: 99999, behavior: 'smooth' })
        }
      })
    }
  }
})

// 组件卸载时清理Worker
onUnmounted(() => {
  if (logWorker.value) {
    logWorker.value.terminate()
  }
})

// 添加日志的方法
const addLog = (type, content) => {
  if (logWorker.value) {
    logWorker.value.postMessage({
      type: 'ADD_LOG',
      data: { type, content }
    })
  }
}

// 暴露方法给父组件
defineExpose({
  addLog
})
</script>

<template>
  <n-divider>{{ title }}</n-divider>
  <n-card class="log-panel" :style="$attrs.style">
    <n-scrollbar ref="scrollRef" trigger="none" style="max-height: 200px;">
      <div class="log-container" v-if="logs.length">
        <div v-for="(log, index) in logs" :key="index" class="log-item">
          <n-tag :type="log.type" size="small" class="log-type">
            {{ log.time }}
          </n-tag>
          <span class="log-content">
            <n-gradient-text :type="log.type">
              {{ log.content }}
            </n-gradient-text>
          </span>
        </div>
      </div>
      <n-empty v-else description="暂无日志" />
    </n-scrollbar>
  </n-card>
</template>

<style scoped>
.log-panel {
  margin-top: 12px;
}

.log-container {
  padding: 8px;
}

.log-item {
  margin-bottom: 8px;
  display: flex;
  align-items: flex-start;
}

.log-type {
  margin-right: 8px;
  flex-shrink: 0;
}

.log-content {
  flex-grow: 1;
  word-break: break-all;
}
</style>