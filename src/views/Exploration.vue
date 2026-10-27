<template>
  <n-layout>
    <n-layout-header bordered>
      <n-page-header>
        <template #title>探索</template>
        <template #subtitle>
          <n-space align="center" :size="8">
            <n-tag size="small" :type="isExploring ? 'success' : 'default'">
              {{ isExploring ? '正在探索' : '尚未出发' }}
            </n-tag>
            <n-tag v-if="playerStore.isInjured" size="small" type="error">
              养伤 {{ formatCountdown(playerStore.injuryRemainingSeconds) }}
            </n-tag>
          </n-space>
        </template>
      </n-page-header>
    </n-layout-header>

    <n-layout-content>
      <div class="explore-wrap">
        <n-alert v-if="playerStore.idleModeNotice" type="warning" closable @close="playerStore.clearIdleModeNotice()">
          {{ playerStore.idleModeNotice }}
        </n-alert>

        <n-alert v-if="playerStore.isInjured" type="error" show-icon>
          探索战败，正在家中养伤。养伤期间无法外出，剩余
          {{ formatCountdown(playerStore.injuryRemainingSeconds) }}。
        </n-alert>

        <!-- 未出发：选地点 -->
        <n-card v-if="!isExploring" title="选择去处" :bordered="false">
          <n-grid :cols="gridCols" :x-gap="12" :y-gap="12">
            <n-grid-item v-for="location in locationCards" :key="location.id">
              <n-card
                :title="location.name"
                size="small"
                hoverable
                class="location-card"
                :class="{ 'is-locked': !location.enterable }"
              >
                <n-space vertical>
                  <n-text depth="3" class="location-desc">{{ location.description }}</n-text>
                  <n-space justify="space-between" align="center">
                    <n-text>推荐境界：{{ realmOf(location.minLevel) }}</n-text>
                    <n-text depth="3" class="location-tier">{{ location.tierLabel }}</n-text>
                  </n-space>
                  <n-space align="center" :size="6">
                    <n-text depth="3">当前胜率</n-text>
                    <n-tag size="small" :type="location.winTagType">{{ location.winLabel }}</n-tag>
                  </n-space>
                  <n-space class="location-tags">
                    <n-tag v-for="tag in location.eventTendencies" :key="tag" size="small" type="info">
                      {{ tag }}
                    </n-tag>
                  </n-space>
                  <n-button
                    type="primary"
                    block
                    :disabled="!playerStore.canStartExploration || !location.enterable"
                    @click="depart(location)"
                  >
                    {{ location.enterable ? '出发' : `${realmOf(location.minLevel)}解锁` }}
                  </n-button>
                </n-space>
              </n-card>
            </n-grid-item>
          </n-grid>
        </n-card>

        <!-- 探索中：状态 + 流水账 -->
        <template v-else>
          <n-card title="正在探索" :bordered="false">
            <n-space vertical size="large">
              <n-descriptions :column="descColumns" label-placement="left" bordered>
                <n-descriptions-item label="去处">
                  {{ playerStore.explorationLocation?.name || '未知' }}
                </n-descriptions-item>
                <n-descriptions-item label="下一次遭遇">
                  {{ formatCountdown(playerStore.explorationNextEventInSeconds) }}
                </n-descriptions-item>
                <n-descriptions-item label="结算节奏">
                  每 1 时辰（2 游戏小时）1 次 · 约 8 现实秒
                </n-descriptions-item>
                <n-descriptions-item label="已遇事件">
                  {{ stats.events }}
                </n-descriptions-item>
                <n-descriptions-item label="战斗胜 / 负">
                  {{ stats.wins }} / {{ stats.losses }}
                </n-descriptions-item>
                <n-descriptions-item label="叙事">
                  {{ stats.narratives }}
                </n-descriptions-item>
                <n-descriptions-item label="灵石（一阶）">
                  {{ stats.stones }}
                </n-descriptions-item>
                <n-descriptions-item label="物品 / 残页">
                  {{ stats.items }} / {{ stats.fragments }}
                </n-descriptions-item>
                <n-descriptions-item label="功法 / 宝匣">
                  {{ stats.arts }} / {{ stats.chests }}
                </n-descriptions-item>
              </n-descriptions>

              <n-progress
                type="line"
                :percentage="eventProgressPct"
                :show-indicator="false"
                processing
              />

              <n-space class="status-row" justify="space-between" align="center">
                <n-text depth="3">
                  同境界胜率 70%，高 1 小境界 90%，高 2 小境界 100%；战败会强制回家养伤
                  {{ injuryLabel }}。切换页面仍会继续。
                </n-text>
                <n-button type="warning" secondary @click="returnHome">回镇守</n-button>
              </n-space>
            </n-space>
          </n-card>

          <n-card title="流水账" :bordered="false">
            <template #header-extra>
              <n-text depth="3" style="font-size: 12px">最新在上</n-text>
            </template>
            <div ref="logEl" class="explore-log">
              <div v-if="!logs.length" class="explore-empty">还没有遭遇，先走走看。</div>
              <div v-for="(entry, i) in logs" :key="i" class="explore-log-row" :class="`kind-${entry.kind}`">
                <span class="explore-time">{{ formatClock(entry.at) }}</span>
                <span class="explore-text">{{ entry.text }}</span>
              </div>
            </div>
          </n-card>
        </template>
      </div>
    </n-layout-content>

    <!--
      叙事弹窗（《探索系统》§9.1，2026-10-22 Q1 定稿）：阻塞 UI，但**不暂停时钟**。
      ⚠ 不进 `clock.js` 的 PAUSE_ROUTES —— 内宅是同类先例，加进去会连带停掉镇守与日常循环。
      ⚠ `:show` 是单向绑定，不是 v-model：遮罩/ESC 都不能关，出口只有两个选项；
        一个都不点，20 秒后由 store 自动选善意（日志标「超时自动」）。
      ⚠ 奖励在选项落地时才入账，所以弹窗开着的时候不扣也不给。
    -->
    <n-modal
      :show="!!narrative"
      preset="dialog"
      :title="narrative?.eventName || '路上遇到'"
      :closable="false"
      :mask-closable="false"
      :close-on-esc="false"
      :style="{ maxWidth: '90vw', width: '560px' }"
    >
      <div v-if="narrative" class="stack">
        <n-text>{{ narrative.prompt }}</n-text>
        <n-progress type="line" :percentage="narrativePct" :show-indicator="false" status="warning" />
        <n-text depth="3" style="font-size: 12px">
          {{ narrativeSecondsLeft }} 秒后自动选择「{{ autoOptionLabel }}」；时钟不会停，探索照常推进。
        </n-text>
        <n-space justify="end">
          <n-button
            v-for="option in narrative.options"
            :key="option.id"
            :type="option.id === narrative.autoChoice ? 'primary' : 'default'"
            @click="chooseNarrative(option.id)"
          >
            {{ option.label }}
          </n-button>
        </n-space>
      </div>
    </n-modal>
  </n-layout>
</template>

<script setup>
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import { usePlayerStore } from '../stores/player'
  import { getRealmName } from '../plugins/realm'
  import { locations } from '../plugins/locations'
  import {
    TUNING as EXP_TUNING,
    battleWinChanceOf,
    canEnterLocation,
    eventIntervalSeconds,
    normalizeExplorationStats,
    tierBandOf
  } from '../plugins/exploration'
  import { formatClock, formatCountdown } from '../plugins/dayDate'
  import { injuryLabelOf } from '../plugins/idleMode'

  const router = useRouter()
  const playerStore = usePlayerStore()
  const logEl = ref(null)

  /**
   * 窄屏列数（2026-10-21 用户反馈：手机上汇总区挤成一团、地点卡两列太窄）。
   *
   * Naive 的 `n-descriptions` 只认数字列数，`n-grid` 的 `responsive` 在 `cols` 是
   * 数字时不解析断点 —— 所以这里用窗口宽度自己算，别指望组件属性。
   */
  const descColumns = ref(3)
  const gridCols = ref(2)
  const syncColumns = () => {
    const w = typeof window === 'undefined' ? 1200 : window.innerWidth
    descColumns.value = w < 640 ? 1 : w < 960 ? 2 : 3
    gridCols.value = w < 720 ? 1 : 2
  }
  syncColumns()
  onMounted(() => window.addEventListener('resize', syncColumns))
  onBeforeUnmount(() => window.removeEventListener('resize', syncColumns))

  const isExploring = computed(() => playerStore.isExploring)
  const injuryLabel = injuryLabelOf()
  // 存储仍按时间正序追加；**渲染时倒过来，最新的在最上面**（P15.2）
  const logs = computed(() => [...(playerStore.exploration.log || [])].reverse())
  const stats = computed(() => normalizeExplorationStats(playerStore.exploration.stats))

  const locationCards = computed(() =>
    locations.map(location => {
      const enterable = canEnterLocation(playerStore.level, location)
      const chance = battleWinChanceOf(playerStore.level, location.minLevel)
      // 阶按**玩家境界段**取两档（练气 一/二阶），地图只调段内高阶概率。
      // 换掉 2026-10-22 之前的「主掉 T3 · 辅掉 T2」：T 是地图阶，不是物品阶，玩家看不懂。
      const band = tierBandOf(playerStore.level)
      const low = tierLabelOf(band.low)
      const high = tierLabelOf(band.high)
      const highPct = Math.round(Math.min(Math.max(Number(location.highTierChance) || 0, 0), 1) * 100)
      const tierLabel =
        highPct <= 0
          ? `主掉${low}材料`
          : highPct >= 100
            ? `主掉${high}材料`
            : highPct > 50
              ? `主掉${high}材料 ${highPct}% · 偶掉${low} ${100 - highPct}%`
              : `主掉${low}材料 ${100 - highPct}% · 偶掉${high} ${highPct}%`
      return {
        ...location,
        enterable,
        tierLabel,
        winLabel: !enterable ? '不可进入' : `${Math.round(chance * 100)}%`,
        winTagType: !enterable ? 'default' : chance >= 1 ? 'success' : chance >= 0.9 ? 'info' : 'warning'
      }
    })
  )

  // —— 叙事弹窗（《探索系统》§9.1）——
  const narrative = computed(() => playerStore.explorationNarrative)
  const narrativeSecondsLeft = computed(() => playerStore.explorationNarrativeSecondsLeft)
  const narrativePct = computed(() =>
    Math.min(Math.max((narrativeSecondsLeft.value / EXP_TUNING.narrativeTimeoutRealSeconds) * 100, 0), 100)
  )
  const autoOptionLabel = computed(() => {
    const current = narrative.value
    if (!current) return ''
    return (current.options || []).find(o => o.id === current.autoChoice)?.label || '相助'
  })
  const chooseNarrative = optionId => playerStore.chooseNarrative(optionId)

  const eventProgressPct = computed(() => {
    const total = eventIntervalSeconds()
    const left = playerStore.explorationNextEventInSeconds
    if (!total) return 0
    return Math.min(Math.max(((total - left) / total) * 100, 0), 100)
  })

  const realmOf = level => getRealmName(Math.max(Number(level) || 1, 1)).name
  /** 1~5 → 一阶…五阶（别再写 T 了，玩家看不懂） */
  const tierLabelOf = tier =>
    `${['', '一', '二', '三', '四', '五'][Number(tier) || 1] || tier}阶`

  const depart = location => {
    const r = playerStore.startExploration(location.id)
    if (!r.ok && r.reason) playerStore.setIdleModeNotice(r.reason)
  }

  const returnHome = () => {
    const r = playerStore.switchIdleMode('garrison')
    if (r.ok) router.push('/')
  }

  // 战败强制回家：模式已由 store 切回镇守，这里把页面也带回主界面
  watch(
    () => playerStore.isInjured,
    injured => {
      if (injured) router.push('/')
    }
  )

  // 最新在上 → 新记录出现时回到**顶部**（不是滚到底）
  watch(
    () => logs.value.length,
    async () => {
      await nextTick()
      if (logEl.value) logEl.value.scrollTop = 0
    }
  )
</script>

<style scoped>
  .explore-wrap {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    max-width: 1100px;
    margin: 0 auto;
  }

  /* 叙事弹窗正文：不用 n-space vertical（动态子节点 0 → N 会重复渲染，踩过两次） */
  .stack {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .is-locked {
    opacity: 0.55;
  }

  /* 四张地点卡等高：描述行数不同也不会让按钮/标签上下错位 */
  .location-card {
    height: 100%;
  }

  .location-card :deep(.n-card__content) {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  /* 只作用于卡片里最外层那个纵向 n-space，不影响内部横向 n-space */
  .location-card :deep(.n-card__content > .n-space) {
    flex: 1;
  }

  /* 按钮永远贴底，左右两列对齐 */
  .location-card :deep(.n-card__content > .n-space > .n-space-item:last-child) {
    margin-top: auto;
  }

  /* 描述固定两行高度、标签行固定一行高度，让中间信息行也对齐 */
  .location-desc {
    display: block;
    min-height: 2.9em;
  }

  .location-tier {
    white-space: nowrap;
  }

  .location-tags {
    min-height: 24px;
  }

  .explore-log {
    /* 小屏占满大半屏会让上面的汇总区完全没有滚动空间 */
    height: min(360px, 45vh);
    overflow-y: auto;
    padding: 8px 12px;
    border-radius: 8px;
    background: rgba(128, 128, 128, 0.06);
    font-size: 14px;
    line-height: 1.9;
  }

  .explore-log-row {
    display: flex;
    gap: 12px;
  }

  /* 窄屏：说明文字与「回镇守」按钮上下排，别互相抢宽度 */
  @media (max-width: 720px) {
    .status-row {
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
    }
  }

  .explore-time {
    flex: 0 0 52px;
    color: #888;
    font-variant-numeric: tabular-nums;
  }

  .explore-text {
    flex: 1;
  }

  .kind-find .explore-text {
    color: #18a058;
  }

  .kind-battle .explore-text {
    color: #2080f0;
  }

  .kind-defeat .explore-text {
    color: #d03050;
    font-weight: 600;
  }

  .kind-adventure .explore-text {
    color: #d48806;
    font-weight: 600;
  }

  .kind-narrative .explore-text {
    color: #7b61ff;
  }

  .kind-nothing .explore-text {
    color: #999;
  }

  .explore-empty {
    color: #999;
    padding: 24px 0;
    text-align: center;
  }
</style>
