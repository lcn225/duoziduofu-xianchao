<template>
  <transition name="ding">
    <div v-if="visible" class="ding-notice">
      <n-alert :type="alertType" show-icon closable @close="visible = false">
        <n-space vertical :size="2">
          <span class="ding-title">{{ text.title }}</span>
          <span v-if="text.message">{{ text.message }}</span>
          <span v-if="text.rollCall">{{ text.rollCall }}</span>
          <!-- 资源不足横幅的跳转（2026-11-22 S2）：给「去哪」，不只给「缺什么」 -->
          <n-space v-if="text.actions?.length" :size="10" class="ding-actions">
            <n-button
              v-for="action in text.actions"
              :key="action.to"
              text
              type="primary"
              size="small"
              @click="goAction(action)"
            >
              {{ action.label }} →
            </n-button>
          </n-space>
        </n-space>
      </n-alert>
    </div>
  </transition>
</template>

<script setup>
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { NAlert, NButton, NSpace } from 'naive-ui'
  import { formatNoticeText, onDing } from '../plugins/notice'

  const router = useRouter()
  const visible = ref(false)
  const text = ref(formatNoticeText())
  const kind = ref('ding')
  // 有喜 / 老九到货 = success；讣告 / 陨落 / 资源不足 = warning（第 2 档横幅，不暂停时钟）
  const alertType = computed(() =>
    kind.value === 'ding' || kind.value === 'broker' ? 'success' : 'warning'
  )
  let timer = null
  let off = null

  /** 跳转按钮：横幅带 actions（资源不足）时多留 4 秒给玩家点 */
  const goAction = action => {
    visible.value = false
    if (action?.to) router.push(action.to)
  }

  onMounted(() => {
    off = onDing(payload => {
      kind.value = payload?.kind || 'ding'
      text.value = formatNoticeText(payload)
      visible.value = true
      if (timer) clearTimeout(timer)
      // 「叮」只是提示，不暂停时间、不挡操作；6 秒后自动收起（带跳转的给 10 秒）
      timer = setTimeout(
        () => {
          visible.value = false
        },
        text.value.actions?.length ? 10000 : 6000
      )
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

  .ding-actions {
    padding-top: 2px;
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
