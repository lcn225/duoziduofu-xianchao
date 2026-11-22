<template>
  <!--
    「飞鹰门解锁」弹窗（2026-11-22 S2 · 引导触点 3）—— 第 3 档居中弹窗。
    「模块解锁」是四类之一，所以不新增档位。
    ⚠ **不暂停时钟**（不进 `PAUSE_ROUTES`）；遮罩 / ESC / 「稍后」都能关。
    ⚠ 只弹一次：标记存在存档 `faction.unlockNoticeShown`，老档在读档归一化里静默置 true。
  -->
  <n-modal
    :show="open"
    preset="card"
    title="飞鹰门 · 解锁"
    :closable="true"
    :mask-closable="true"
    :close-on-esc="true"
    :style="{ maxWidth: '92vw', width: '420px' }"
    class="faction-unlock-notice"
    @update:show="open = $event"
  >
    <div class="fu-body">
      <p class="fu-title">门主传音：乡侯府既已立起，飞鹰门愿纳你入内。</p>
      <p class="fu-desc">
        接取任务可换 <strong>贡献点</strong>；练气四层起开放<strong>飞鹰阁</strong>，
        用贡献点换功法与物资。俸禄按月发放。
      </p>
      <ul class="fu-list">
        <li>新手任务：交上探索来的废料，当场换贡献点</li>
        <li>职位越高俸禄越高；10% 累积为可提现额度</li>
      </ul>
    </div>
    <template #footer>
      <n-space justify="end">
        <n-button @click="open = false">稍后</n-button>
        <n-button type="primary" @click="go">前往飞鹰门</n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup>
  import { ref, watch } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { usePlayerStore } from '../stores/player'

  const playerStore = usePlayerStore()
  const router = useRouter()
  const route = useRoute()
  const open = ref(false)

  const go = () => {
    open.value = false
    router.push('/faction')
  }

  watch(
    () => [playerStore.factionUnlocked, playerStore.sessionHydrated],
    ([unlocked, hydrated]) => {
      // 读档完成前 factionUnlocked 恒 false；读档后老档已在归一化里把标记置 true。
      // 两个值一起监听：deepMerge 与 `sessionHydrated = true` 不在同一个微任务里落地。
      if (!unlocked || !hydrated) return
      if (playerStore.faction?.unlockNoticeShown) return
      playerStore.markFactionUnlockNotified()
      // 本人正停在飞鹰门页时不弹（页面本身就是最完整的引导）
      if (route.path !== '/faction') open.value = true
    },
    { immediate: true }
  )
</script>

<style scoped>
  .faction-unlock-notice {
    background: var(--ui-surface);
  }

  .fu-title {
    margin: 0 0 8px;
    font-size: 15px;
    font-weight: 700;
    color: var(--ui-jade);
  }

  .fu-desc {
    margin: 0 0 8px;
    font-size: 13px;
    line-height: 1.8;
    color: var(--ui-ink);
  }

  .fu-list {
    margin: 0;
    padding-left: 18px;
    font-size: 12px;
    line-height: 1.9;
    color: var(--ui-ink-sub);
  }
</style>
