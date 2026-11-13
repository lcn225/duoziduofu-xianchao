<template>
  <!-- 挂机页快捷入口（2026-11-14 标签页重构 §3）：整个「🏠 + 时间状态」块可点击，
       落点按当前 idleMode 决定。提示文案只说「挂机页」，避免把镇守叫成主页。 -->
  <n-tooltip trigger="hover" placement="bottom-end">
    <template #trigger>
      <div
        class="time-status"
        role="button"
        tabindex="0"
        :aria-label="tooltipText"
        @click="goIdlePage"
        @keydown.enter.prevent="goIdlePage"
        @keydown.space.prevent="goIdlePage"
      >
        <span class="idle-home" aria-hidden="true">🏠</span>
        <n-space align="center" :size="8">
          <n-tag :type="tagType" size="small" :bordered="false" round>{{ label }}</n-tag>
          <span class="game-date">{{ gameDateText }}</span>
        </n-space>
      </div>
    </template>
    {{ tooltipText }}
  </n-tooltip>
</template>

<script setup>
  import { useRoute, useRouter } from 'vue-router'
  import { usePlayerStore } from '../stores/player'
  // 日期/时刻的换算只此一份 —— 主界面「桂冈的一天」也读它（见 plugins/dayDate.js）
  import { formatGameDate } from '../plugins/dayDate'

  const route = useRoute()
  const router = useRouter()
  const playerStore = usePlayerStore()

  /** running | paused | paused_event */
  const timeState = computed(() => playerStore.gameClockState.state)

  const tagType = computed(() => {
    if (timeState.value === 'paused') return 'warning'
    if (timeState.value === 'paused_event') return 'error'
    return 'success'
  })

  const label = computed(() => {
    if (timeState.value === 'paused') return '⏸ 已暂停'
    if (timeState.value === 'paused_event') return '⏸ 事件处理中'
    return '▶ 推进中'
  })

  /** 游戏内日期刻度：节奏由 plugins/gameClock.js 的 SECONDS_PER_GAME_HOUR 决定 */
  const gameDateText = computed(() => formatGameDate(playerStore.gameClockState.currentTime))

  /** 三个挂机页：与 MainNav.vue 的 IDLE_PATHS 同口径（那边是导航落点，这里只读 idleMode） */
  const IDLE_LABELS = { garrison: '镇守', exploration: '探索', secretRealm: '秘境' }
  const IDLE_PATHS = { garrison: '/', exploration: '/exploration', secretRealm: '/dungeon' }

  const idleMode = computed(() =>
    IDLE_PATHS[playerStore.idleMode] ? playerStore.idleMode : 'garrison'
  )

  const tooltipText = computed(() => `返回挂机页（当前：${IDLE_LABELS[idleMode.value]}）`)

  const goIdlePage = () => {
    const path = IDLE_PATHS[idleMode.value]
    if (route.path !== path) router.push(path)
  }
</script>

<style scoped>
  .time-status {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 2px 6px;
    border-radius: 6px;
    cursor: pointer;
    transition: background-color 0.18s;
  }

  .time-status:hover,
  .time-status:focus-visible {
    background: var(--ui-surface);
    outline: none;
  }

  .idle-home {
    font-size: 14px;
    line-height: 1;
    opacity: 0.8;
  }

  .game-date {
    font-size: 12px;
    opacity: 0.65;
    white-space: nowrap;
  }
</style>
