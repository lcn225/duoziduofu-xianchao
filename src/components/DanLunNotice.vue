<template>
  <!--
    「结丹之论」（2026-11-06，《丹论系统》§三）。

    ⚠ **暂停时钟**（`progress.syncDanLunNotice` 里 `pauseClockForEvent('danlun')`）：
      金丹 168×，不暂停读 30 秒 = 走过 52 游戏天。
    ⚠ **不可关**：没有关闭按钮 / ESC / 遮罩关闭 —— 必须立一条论。
    ⚠ 候选是**触发时存进存档的快照**，刷新不重掷（`danLunCandidates`）。
  -->
  <n-modal
    :show="visible"
    preset="card"
    :closable="false"
    :mask-closable="false"
    :close-on-esc="false"
    :style="{ maxWidth: '92vw', width: '620px' }"
    class="danlun-notice"
  >
    <div class="danlun">
      <div class="danlun-title">结 丹 之 论</div>
      <div class="danlun-oath">
        论曰：{{ selectedEntry ? selectedEntry.verse : '……' }}
      </div>

      <div class="danlun-cards">
        <button
          v-for="entry in candidates"
          :key="entry.id"
          type="button"
          class="danlun-card"
          :class="{ 'is-active': entry.id === selectedId }"
          @click="selectedId = entry.id"
        >
          <div class="card-name">{{ entry.name }}</div>
          <div class="card-lines">
            <p v-for="(line, index) in entry.lines" :key="index">{{ line }}</p>
          </div>
          <div class="card-source">· {{ entry.source }}</div>
        </button>
      </div>

      <div class="danlun-foot">
        <span class="danlun-hint">此后结婴，皆从此论中求。</span>
        <div class="danlun-actions">
          <span class="hint-flow">自此时间流逝再快一重：游戏一日，约合现实半秒。</span>
          <n-button type="primary" size="small" :disabled="!selectedId" @click="confirm">
            立 此 论
          </n-button>
        </div>
      </div>
    </div>
  </n-modal>
</template>

<script setup>
  import { computed, ref, watch } from 'vue'
  import { usePlayerStore } from '../stores/player'

  const playerStore = usePlayerStore()

  const visible = computed(() => !!playerStore.danLunNoticeVisible)
  const candidates = computed(() => playerStore.danLunCandidates || [])

  /** 当前选中的那一条；初始默认第一条，省一次点击 */
  const selectedId = ref('')
  watch(
    () => candidates.value.map(entry => entry.id).join(','),
    () => {
      selectedId.value = candidates.value[0]?.id || ''
    },
    { immediate: true }
  )

  const selectedEntry = computed(
    () => candidates.value.find(entry => entry.id === selectedId.value) || candidates.value[0] || null
  )

  const confirm = () => {
    if (!selectedId.value) return
    playerStore.chooseDanLun(selectedId.value)
  }
</script>

<style scoped>
  .danlun-notice {
    background: var(--ui-surface);
  }

  .danlun {
    padding: 6px 2px 0;
  }

  .danlun-title {
    text-align: center;
    font-size: 19px;
    letter-spacing: 0.32em;
    color: var(--ui-gold);
    margin-bottom: 14px;
  }

  .danlun-oath {
    text-align: center;
    font-size: 15px;
    line-height: 1.8;
    color: var(--ui-ink);
    padding: 8px 12px 16px;
    border-bottom: 1px solid var(--ui-line);
    margin-bottom: 16px;
  }

  .danlun-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 12px;
  }

  .danlun-card {
    display: block;
    width: 100%;
    text-align: left;
    padding: 12px 14px;
    border: 1px solid var(--ui-line);
    border-radius: var(--ui-radius);
    background: transparent;
    color: var(--ui-ink);
    cursor: pointer;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .danlun-card:hover {
    border-color: var(--ui-line-strong);
  }

  .danlun-card.is-active {
    border-color: var(--ui-gold);
    box-shadow: 0 0 0 1px var(--ui-gold) inset;
  }

  .card-name {
    font-size: 16px;
    letter-spacing: 0.08em;
    color: var(--ui-gold);
    margin-bottom: 8px;
  }

  .card-lines p {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.75;
    color: var(--ui-ink);
  }

  .card-source {
    margin-top: 8px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--ui-ink-sub);
  }

  .danlun-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 18px;
  }

  /* 流速提示紧贴确认按钮左侧（2026-11-07）：玩家的视线在按钮上，
     提示必须落在同一行；窄屏时整组换行、按钮仍在提示下方。 */
  .danlun-actions {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }

  .danlun-hint {
    font-size: 12px;
    color: var(--ui-ink-sub);
  }
</style>
