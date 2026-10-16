<template>
  <n-space align="center" :size="8">
    <n-tag :type="tagType" size="small" :bordered="false" round>{{ label }}</n-tag>
    <span class="game-date">{{ gameDateText }}</span>
  </n-space>
</template>

<script setup>
  import { usePlayerStore } from '../stores/player'
  // 日期/时刻的换算只此一份 —— 主界面「桂冈的一天」也读它（见 plugins/dayDate.js）
  import { formatGameDate } from '../plugins/dayDate'

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
</script>

<style scoped>
  .game-date {
    font-size: 12px;
    opacity: 0.65;
    white-space: nowrap;
  }
</style>
