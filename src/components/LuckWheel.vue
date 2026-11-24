<template>
  <!--
    气运轮盘（2026-11-24，《模块二》§6.0.2）—— 背包页与宝匣并列。

    · 每诞生一名子嗣（含孙辈）+1 抽灰档；每达成一个子嗣成就再 +1 抽、档位依次上抬。
    · 抽数在**出生瞬间**锁定进队列（离线只累计、不自动抽），上线后红点 / 本面板拉杆。
    · ≤5 抽按出生时间逐条播（逐条延迟显出）；>5 抽跳过动画、按品阶降序汇总
      （动画资产 Lottie / WebM 另开，这里先用显出节奏占位）。
  -->
  <div class="wheel-stack">
    <div class="zone">
      <div class="zone-head">
        <div class="zone-title">气运轮盘</div>
        <n-space :size="8" align="center">
          <!-- 开发期直达模拟台（手测分布 / 队列），构建时 `import.meta.env.DEV` 为 false，整段不渲染 -->
          <n-button v-if="isDev" size="tiny" quaternary @click="goLab">模拟台（开发）</n-button>
          <n-button type="primary" :disabled="pending <= 0" @click="pull">
            {{ pending > 0 ? `拉杆 · ${pending} 抽` : '暂无可抽次数' }}
          </n-button>
        </n-space>
      </div>
      <div class="zone-body">
        <div class="wheel-summary">
          <span class="wheel-total">待抽 {{ pending }} 次</span>
          <n-tag v-for="row in summaryRows" :key="row.tier" size="small" :class="row.tone">
            {{ row.name }}档 ×{{ row.count }}
          </n-tag>
          <span v-if="!summaryRows.length" class="wheel-dim">还没有待抽的次数</span>
        </div>
        <p class="wheel-hint">
          每诞生一名子嗣（含孙辈）+1 抽（灰档）；每达成一个子嗣成就再 +1 抽、档位依次上抬
          （灰 → 白 → 绿 → 蓝 → 紫封顶）。抽数在出生瞬间锁定，离线只累计、不自动抽。
        </p>
        <p class="wheel-hint wheel-dim">
          灰档为纯凡俗物品，抽到即折 30 大子；白起档正常入背包。
          万子、千灵根子嗣当前可能不可达（人口上限与灵根率所致），不是故障。
        </p>
      </div>
    </div>

    <div class="zone">
      <div class="zone-head">
        <div class="zone-title">最近诞生</div>
        <span class="wheel-dim">抽数是怎么来的</span>
      </div>
      <div class="zone-body">
        <div v-if="recentRows.length" class="wheel-recent">
          <div v-for="row in recentRows" :key="row.key" class="wheel-recent-row">
            <span class="wheel-recent-name">{{ row.name || '无名' }}</span>
            <span class="wheel-recent-ach">{{ row.achievementsText || '无新成就' }}</span>
            <span class="wheel-recent-draws">+{{ row.draws }} 抽</span>
          </div>
        </div>
        <n-empty v-else description="还没有子嗣诞生" />
      </div>
    </div>

    <n-modal v-model:show="resultVisible" preset="card" style="width: 680px; max-width: calc(100vw - 32px)">
      <template #header>
        <n-space align="center" :size="10">
          <span>轮盘结果</span>
          <n-tag v-if="wheelResult?.draws" size="small" type="primary" :bordered="false">
            {{ wheelResult.animated ? `${wheelResult.draws} 抽` : `连抽 ${wheelResult.draws} 次 · 已汇总` }}
          </n-tag>
        </n-space>
      </template>
      <div class="wheel-grid">
        <div
          v-for="(tile, i) in resultTiles"
          :key="tile.key"
          class="wheel-tile"
          :class="tile.tone"
          :style="{ animationDelay: `${tile.delay}ms` }"
        >
          <span class="wheel-tile-name">{{ tile.name }}</span>
          <span v-if="tile.count > 1" class="wheel-tile-count">×{{ tile.count }}</span>
          <span v-if="tile.note" class="wheel-tile-note">{{ tile.note }}</span>
        </div>
      </div>
      <n-text depth="3" style="display: block; margin-top: 12px; font-size: 12px">
        {{ wheelResult?.animated
          ? '按出生时间逐条开出；灰档已直接折成凡俗货币。'
          : '已按品阶降序汇总；灰档已直接折成凡俗货币。' }}
      </n-text>
    </n-modal>
  </div>
</template>

<script setup>
  import { computed, ref } from 'vue'
  import { useMessage } from 'naive-ui'
  import { useRouter } from 'vue-router'
  import { usePlayerStore } from '../stores/player'
  import { LOTTERY_TIERS, LOTTERY_TIER_META } from '../plugins/lottery.js'
  import { itemColorClassOf } from '../plugins/tiers.js'
  import { offspringAchievementNameOf } from '../plugins/offspringAchievements.js'

  const playerStore = usePlayerStore()
  const message = useMessage()
  const router = useRouter()
  const isDev = import.meta.env.DEV
  const goLab = () => router.push('/lottery-lab')

  const pending = computed(() => playerStore.lotteryPendingCount)
  const summary = computed(() => playerStore.lotteryQueueSummary)

  const summaryRows = computed(() =>
    LOTTERY_TIERS.map(tier => ({
      tier,
      name: LOTTERY_TIER_META[tier].name,
      count: Number(summary.value?.[tier]) || 0,
      tone: `ui-tier-${tier === 'gray' ? 'gray' : tier}`
    })).filter(row => row.count > 0)
  )

  const recentRows = computed(() =>
    (playerStore.lottery?.recent || []).map((row, index) => ({
      key: `${row.at}-${index}`,
      name: row.name,
      draws: Number(row.draws) || 0,
      achievementsText: (row.achievements || []).map(offspringAchievementNameOf).join(' · ')
    }))
  )

  const wheelResult = ref(null)
  const resultVisible = ref(false)

  const TIER_TONE = { gray: 'ui-tier-gray', white: 'ui-tier-white', green: 'ui-tier-green', blue: 'ui-tier-blue', purple: 'ui-tier-purple' }
  const QUALITY_ORDER = { 下: 1, 中: 2, 上: 3, 极: 4 }

  /** 一条抽取记录 → 格子（名称 / 品阶 / 成色） */
  const tileOfEntry = entry => {
    if (entry.kind === 'currency') {
      return {
        name: entry.name,
        note: entry.amount === 30 ? '凡俗 · 折 30 大子' : '凡俗 · 金页子折现',
        tone: TIER_TONE.gray,
        tierRank: 0,
        qualityRank: 0
      }
    }
    const meta = LOTTERY_TIER_META[entry.tier] || { tier: 1 }
    return {
      name: entry.name,
      note: `${meta.tier} 阶 · ${entry.category || ''}`,
      tone: itemColorClassOf(meta.tier, entry.quality),
      tierRank: Number(meta.tier) || 0,
      qualityRank: QUALITY_ORDER[entry.quality] || 0
    }
  }

  const resultTiles = computed(() => {
    const entries = wheelResult.value?.entries || []
    if (!entries.length) return []
    // ≤5 抽：逐条按出生时间播放，不合并
    if (wheelResult.value?.animated) {
      return entries.map((entry, index) => ({
        key: `one-${index}`,
        count: 1,
        delay: index * 700,
        ...tileOfEntry(entry)
      }))
    }
    // >5 抽：按「名称 + 品阶 + 成色」合并，品阶降序
    const map = new Map()
    for (const entry of entries) {
      const tile = tileOfEntry(entry)
      const key = `${tile.name}|${tile.tierRank}|${tile.qualityRank}`
      const found = map.get(key)
      if (found) found.count += 1
      else map.set(key, { key, count: 1, delay: 0, ...tile })
    }
    return [...map.values()].sort(
      (a, b) =>
        (b.tierRank || 0) - (a.tierRank || 0) ||
        (b.qualityRank || 0) - (a.qualityRank || 0) ||
        String(a.name).localeCompare(String(b.name))
    )
  })

  const pull = () => {
    const result = playerStore.pullLottery()
    if (!result.ok) {
      message.warning(result.message)
      return
    }
    wheelResult.value = result
    resultVisible.value = true
  }
</script>

<style scoped>
  .wheel-stack {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .wheel-summary {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .wheel-total {
    font-weight: 700;
    color: var(--ui-ink);
  }

  .wheel-dim {
    color: var(--ui-ink-fade);
    font-size: 12.5px;
  }

  .wheel-hint {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.7;
    color: var(--ui-ink-sub);
  }

  .wheel-recent {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .wheel-recent-row {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding-bottom: 8px;
    border-bottom: 1px dashed var(--ui-line);
  }

  .wheel-recent-row:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .wheel-recent-name {
    min-width: 96px;
    font-weight: 600;
    color: var(--ui-ink);
  }

  .wheel-recent-ach {
    flex: 1;
    font-size: 12.5px;
    color: var(--ui-ink-sub);
  }

  .wheel-recent-draws {
    font-size: 12.5px;
    color: var(--ui-gold);
    white-space: nowrap;
  }

  .wheel-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  /* 与宝匣结果同一种格子节奏：逐条显出 */
  .wheel-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-width: 92px;
    padding: 12px 10px;
    border: 1px solid var(--ui-line);
    border-radius: var(--ui-radius);
    background: var(--ui-surface);
    animation: wheel-tile-in 0.35s ease both;
  }

  @keyframes wheel-tile-in {
    from {
      opacity: 0;
      transform: translateY(6px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  .wheel-tile-name {
    font-weight: 600;
    font-size: 13px;
    text-align: center;
    color: var(--ui-ink);
  }

  .wheel-tile-count {
    font-size: 12px;
    color: var(--ui-ink-sub);
  }

  .wheel-tile-note {
    font-size: 11.5px;
    color: var(--ui-ink-fade);
    text-align: center;
  }
</style>
