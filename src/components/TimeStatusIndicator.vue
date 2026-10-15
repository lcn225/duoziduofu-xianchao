<template>
  <n-space align="center" :size="8">
    <n-tag :type="tagType" size="small" :bordered="false" round>{{ label }}</n-tag>
    <span class="game-date">{{ gameDateText }}</span>
  </n-space>
</template>

<script setup>
  import { usePlayerStore } from '../stores/player'

  const playerStore = usePlayerStore()

  const GAME_SECONDS_PER_HOUR = 3600
  const GAME_SECONDS_PER_DAY = 86400
  const GAME_SECONDS_PER_MONTH = GAME_SECONDS_PER_DAY * 30
  const GAME_SECONDS_PER_YEAR = GAME_SECONDS_PER_DAY * 365

  /** 十二时辰，各辖两个游戏小时。子时跨午夜（23:00–01:00），所以要先把小时 +1 再折半 */
  const SHICHEN = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']

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

  /** 游戏内日期刻度：1 现实秒 = 1 游戏小时 —— 详见 plugins/gameClock.js */
  const gameDateText = computed(() => {
    const t = playerStore.gameClockState.currentTime
    const year = Math.floor(t / GAME_SECONDS_PER_YEAR) + 1
    const month = Math.floor((t % GAME_SECONDS_PER_YEAR) / GAME_SECONDS_PER_MONTH) + 1
    const day = Math.floor((t % GAME_SECONDS_PER_MONTH) / GAME_SECONDS_PER_DAY) + 1
    const hour = Math.floor((t % GAME_SECONDS_PER_DAY) / GAME_SECONDS_PER_HOUR)
    const shichen = SHICHEN[Math.floor(((hour + 1) % 24) / 2)]
    return `第 ${year} 年 · ${month} 月 · ${day} 日 · ${shichen}时`
  })
</script>

<style scoped>
  .game-date {
    font-size: 12px;
    opacity: 0.65;
    white-space: nowrap;
  }
</style>
