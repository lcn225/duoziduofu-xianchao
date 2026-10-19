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
              养伤 {{ formatDuration(playerStore.injuryRemainingSeconds) }}
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
          {{ formatDuration(playerStore.injuryRemainingSeconds) }}。
        </n-alert>

        <!-- 未出发：选地点 -->
        <n-card v-if="!isExploring" title="选择去处" :bordered="false">
          <n-grid :cols="2" :x-gap="12" :y-gap="12" responsive="screen" item-responsive>
            <n-grid-item v-for="location in selectableLocations" :key="location.id">
              <n-card :title="location.name" size="small" hoverable>
                <n-space vertical>
                  <n-text depth="3">{{ location.description }}</n-text>
                  <n-space justify="space-between">
                    <n-text>最低境界：{{ realmOf(location.minLevel) }}</n-text>
                    <n-text depth="3">挂机产出 · 低风险</n-text>
                  </n-space>
                  <n-space>
                    <n-tag v-for="tag in rewardTags(location)" :key="tag" size="small" type="info">
                      {{ tag }}
                    </n-tag>
                  </n-space>
                  <n-button
                    type="primary"
                    block
                    :disabled="!playerStore.canStartExploration || !levelOk(location)"
                    @click="depart(location)"
                  >
                    {{ levelOk(location) ? '出发' : '境界不足' }}
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
              <n-descriptions :column="3" label-placement="left" bordered>
                <n-descriptions-item label="去处">
                  {{ playerStore.explorationLocation?.name || '未知' }}
                </n-descriptions-item>
                <n-descriptions-item label="下一次遭遇">
                  {{ formatDuration(playerStore.explorationNextEventInSeconds) }}
                </n-descriptions-item>
                <n-descriptions-item label="结算节奏">
                  每游戏小时 1 次（约 4 现实秒）
                </n-descriptions-item>
                <n-descriptions-item label="已遇事件">
                  {{ playerStore.exploration.stats.events }}
                </n-descriptions-item>
                <n-descriptions-item label="战斗胜/负">
                  {{ playerStore.exploration.stats.wins }} / {{ playerStore.exploration.stats.losses }}
                </n-descriptions-item>
                <n-descriptions-item label="大子">
                  {{ playerStore.exploration.stats.daZi }}
                </n-descriptions-item>
                <n-descriptions-item label="灵草 / 丹方残页">
                  {{ playerStore.exploration.stats.herbs }} / {{ playerStore.exploration.stats.fragments }}
                </n-descriptions-item>
              </n-descriptions>

              <n-progress
                type="line"
                :percentage="eventProgressPct"
                :show-indicator="false"
                processing
              />

              <n-space justify="space-between" align="center">
                <n-text depth="3">
                  探索按游戏时间推进，切换页面也会继续。战败会强制回家养伤 1 天。
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
  </n-layout>
</template>

<script setup>
  import { computed, nextTick, ref, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import { usePlayerStore } from '../stores/player'
  import { getRealmName } from '../plugins/realm'
  import { availableLocations, eventIntervalSeconds } from '../plugins/exploration'
  import { formatClock, formatDuration } from '../plugins/dayDate'

  const router = useRouter()
  const playerStore = usePlayerStore()
  const logEl = ref(null)

  const isExploring = computed(() => playerStore.isExploring)
  // 存储仍按时间正序追加；**渲染时倒过来，最新的在最上面**（P15.2）
  const logs = computed(() => [...(playerStore.exploration.log || [])].reverse())
  const selectableLocations = computed(() => availableLocations(playerStore.level))
  const eventProgressPct = computed(() => {
    const total = eventIntervalSeconds()
    const left = playerStore.explorationNextEventInSeconds
    if (!total) return 0
    return Math.min(Math.max(((total - left) / total) * 100, 0), 100)
  })

  const realmOf = level => getRealmName(Math.max(Number(level) || 1, 1)).name
  const levelOk = location => Number(playerStore.level) >= Number(location.minLevel)

  const REWARD_LABELS = {
    da_zi: '大子',
    herb: '灵草',
    pill_fragment: '丹方残页'
  }
  const rewardTags = location =>
    (location.rewards || []).map(r => REWARD_LABELS[r.type] || r.type).filter(Boolean)

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

  .explore-log {
    height: 360px;
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

  .kind-nothing .explore-text {
    color: #999;
  }

  .explore-empty {
    color: #999;
    padding: 24px 0;
    text-align: center;
  }
</style>
