<template>
  <!--
    「筑基之途 · 仙凡永别」（P55-b，《时间刻度修订方案》§6.3）。

    ⚠ 它**不暂停时钟** —— 这是「代价预告」，不是需要玩家决策的阻塞弹窗，
      所以不走 clock 的事件暂停；唯一的出口是「吾已知之」。
    ⚠ 一辈子只弹一次（`ascendedNoticeShown` 进存档）。首次切入 24× 时由
      stores/modules/clock.js 的 syncClockRealm() 打开。
  -->
  <n-modal
    :show="visible"
    preset="card"
    :closable="false"
    :mask-closable="false"
    :close-on-esc="false"
    :style="{ maxWidth: '92vw', width: '560px' }"
    class="ascended-notice"
  >
    <div class="poem">
      <div class="poem-title">筑 基 之 途 · 仙 凡 永 别</div>
      <div class="poem-body">
        <p>昔王质入山观棋，斧柯尽烂，归来无复旧识。</p>
        <p>今君已脱凡胎，山中一局未终，人间几度春秋。</p>
        <p>此后妻妾子孙，仍逐凡岁而生灭 ——</p>
        <p>君坐看一室灯火，尽成草木荣枯。</p>
      </div>
      <div class="poem-foot">
        <n-button type="primary" size="small" @click="playerStore.dismissAscendedNotice()">
          吾 已 知 之
        </n-button>
      </div>
    </div>
  </n-modal>
</template>

<script setup>
  import { computed } from 'vue'
  import { usePlayerStore } from '../stores/player'

  const playerStore = usePlayerStore()
  const visible = computed(() => !!playerStore.ascendedNoticeVisible)
</script>

<style scoped>
  .ascended-notice {
    background: var(--ui-surface);
  }

  .poem {
    padding: 8px 4px 0;
    text-align: center;
  }

  .poem-title {
    font-size: 18px;
    letter-spacing: 0.2em;
    color: var(--ui-gold);
    margin-bottom: 18px;
  }

  .poem-body p {
    margin: 0 0 10px;
    font-size: 15px;
    line-height: 1.9;
    color: var(--ui-ink);
  }

  .poem-foot {
    margin-top: 18px;
  }
</style>
