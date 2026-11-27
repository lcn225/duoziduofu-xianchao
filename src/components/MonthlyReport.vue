<template>
  <!--
    练气期月报（2026-11-27 #3）—— 第 3 档居中弹窗的第五类。
    ⚠ **不暂停时钟**（不进 clock.js 的 PAUSE_ROUTES）；可关、遮罩 / ESC 都能关。
    ⚠ 只在练气段出报；筑基后 Day 页已改为「昨日战报」+ 内宅周报。
    ⚠ 离线跨过的月界不出报（回线后从下一个完整月开始）。
  -->
  <n-modal
    :show="!!report"
    preset="card"
    :title="title"
    :closable="true"
    :mask-closable="true"
    :close-on-esc="true"
    :style="{ maxWidth: '92vw', width: '460px' }"
    class="monthly-report"
    @update:show="onShowChange"
  >
    <div v-if="report" class="mr-body">
      <div class="mr-row">
        <span class="mr-k">收支</span>
        <span class="mr-v">{{ currencyText }}</span>
      </div>
      <div class="mr-row">
        <span class="mr-k">出生</span>
        <span class="mr-v">{{ birthText }}</span>
      </div>
      <div class="mr-row">
        <span class="mr-k">修行</span>
        <span class="mr-v">{{ cultivationText }}</span>
      </div>
      <div class="mr-row">
        <span class="mr-k">寿终</span>
        <span class="mr-v">{{ deathText }}</span>
      </div>
      <div class="mr-row">
        <span class="mr-k">收获</span>
        <span class="mr-v">{{ lootText }}</span>
      </div>
      <div class="mr-foot">
        <span class="mr-hint">月报只做汇总，不暂停时间。</span>
        <n-button type="primary" size="small" @click="close">知道了</n-button>
      </div>
    </div>
  </n-modal>
</template>

<script setup>
  import { computed } from 'vue'
  import { NButton } from 'naive-ui'
  import { usePlayerStore } from '../stores/player'
  import { formatSignedAmountOf } from '../plugins/monthlyReport.js'

  const playerStore = usePlayerStore()
  const report = computed(() => playerStore.monthlyReport)

  const title = computed(() => (report.value ? `${report.value.label} · 月报` : '月报'))

  /** 收支 = 月初 → 月末的净变化（不做收入 / 支出双栏，见 plugins/monthlyReport.js 头注） */
  const currencyText = computed(() => {
    const r = report.value
    if (!r) return ''
    const stone = Math.round(Number(r.spiritual) || 0)
    const secular = Math.round(Number(r.secular) || 0)
    if (!stone && !secular) return '无变化'
    return `灵石 ${formatSignedAmountOf(stone)} 一阶 · 大子 ${formatSignedAmountOf(secular)}`
  })

  const birthText = computed(() => {
    const r = report.value
    if (!r) return ''
    const parts = []
    if (r.births) parts.push(`新生 ${r.births}${r.rootedBirths ? `（带灵根 ${r.rootedBirths}）` : ''}`)
    if (r.grandchildren) parts.push(`添孙 ${r.grandchildren}`)
    return parts.length ? parts.join(' · ') : '无'
  })

  const cultivationText = computed(() => {
    const r = report.value
    if (!r) return ''
    const parts = []
    if (r.innerLevels) parts.push(`内功 +${r.innerLevels} 层`)
    if (r.bodyLevels) parts.push(`外功 +${r.bodyLevels} 层`)
    if (r.breakthroughs) parts.push(`子嗣精进 ${r.breakthroughs} 人`)
    return parts.length ? parts.join(' · ') : '无'
  })

  const deathText = computed(() => {
    const r = report.value
    if (!r) return ''
    const parts = []
    if (r.wifeDeaths) parts.push(`妻妾 ${r.wifeDeaths} 人`)
    if (r.offspringDeaths) parts.push(`子嗣 ${r.offspringDeaths} 人`)
    return parts.length ? parts.join(' · ') : '无'
  })

  const lootText = computed(() => {
    const r = report.value
    if (!r) return ''
    const parts = []
    if (r.materials) parts.push(`灵材 / 灵植 ${r.materials} 件`)
    if (r.chests) parts.push(`宝匣 ${r.chests} 个`)
    return parts.length ? parts.join(' · ') : '无'
  })

  const close = () => {
    playerStore.dismissMonthlyReport()
  }

  const onShowChange = show => {
    if (!show) close()
  }
</script>

<style scoped>
  .monthly-report {
    background: var(--ui-surface);
  }

  .mr-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .mr-row {
    display: flex;
    align-items: baseline;
    gap: 14px;
    font-size: 14px;
    line-height: 1.6;
  }

  .mr-k {
    flex: 0 0 36px;
    color: var(--ui-ink-sub);
  }

  .mr-v {
    color: var(--ui-ink);
  }

  .mr-foot {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 10px;
  }

  .mr-hint {
    font-size: 12px;
    color: var(--ui-ink-sub);
  }
</style>
