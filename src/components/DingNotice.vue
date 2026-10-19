<template>
  <transition name="ding">
    <div v-if="visible" class="ding-notice">
      <n-alert type="success" show-icon closable @close="visible = false">
        <n-space vertical :size="2">
          <span class="ding-title">{{ text.title }}</span>
          <span>{{ text.message }}</span>
          <span>{{ text.rollCall }}</span>
        </n-space>
      </n-alert>
    </div>
  </transition>
</template>

<script setup>
  import { onBeforeUnmount, onMounted, ref } from 'vue'
  import { NAlert, NSpace } from 'naive-ui'
  import { formatDingText, onDing } from '../plugins/notice'

  const visible = ref(false)
  const text = ref(formatDingText())
  let timer = null
  let off = null

  onMounted(() => {
    off = onDing(payload => {
      text.value = formatDingText(payload)
      visible.value = true
      if (timer) clearTimeout(timer)
      // 「叮」只是提示，不暂停时间、不挡操作；6 秒后自动收起
      timer = setTimeout(() => {
        visible.value = false
      }, 6000)
    })
  })

  onBeforeUnmount(() => {
    if (off) off()
    if (timer) clearTimeout(timer)
  })
</script>

<style scoped>
  .ding-notice {
    position: fixed;
    top: 88px;
    right: 24px;
    z-index: 2000;
    width: min(420px, calc(100vw - 32px));
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
  }

  .ding-title {
    font-size: 18px;
    font-weight: 700;
    line-height: 1.2;
  }

  .ding-enter-active,
  .ding-leave-active {
    transition: opacity 0.2s ease, transform 0.2s ease;
  }

  .ding-enter-from,
  .ding-leave-to {
    opacity: 0;
    transform: translateY(-8px);
  }

  @media (max-width: 720px) {
    .ding-notice {
      right: 16px;
      left: 16px;
      width: auto;
    }
  }
</style>
