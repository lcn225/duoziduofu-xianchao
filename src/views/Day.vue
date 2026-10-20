<template>
  <n-layout>
    <n-layout-header bordered>
      <n-page-header>
        <template #title>镇守</template>
        <template #subtitle>
          <n-space align="center" :size="8">
            <n-text depth="3">桂冈的一天</n-text>
            <n-tag :type="timeTagType" size="small" :bordered="false">{{ timeLabel }}</n-tag>
            <n-text depth="3">{{ dateText }}</n-text>
          </n-space>
        </template>
      </n-page-header>
    </n-layout-header>

    <n-layout-content>
      <n-card :bordered="false">
        <n-space vertical size="large">
          <!-- 新手礼包：从旧首页搬过来，否则新玩家没有领取入口 -->
          <n-alert v-if="playerStore.isNewPlayer" type="success" title="新玩家礼包" show-icon>
            <n-space align="center" :size="12">
              <n-text>开局赠送 20000 灵石。</n-text>
              <n-button type="success" size="small" @click="receiveNewPlayerGift">领取</n-button>
            </n-space>
          </n-alert>

          <!-- ============ 双资源 ============ -->
          <n-space vertical size="small">
            <n-space align="center" :wrap="false">
              <n-text depth="3" style="white-space: nowrap; width: 88px">体力</n-text>
              <n-progress
                type="line"
                style="flex: 1 1 auto"
                :percentage="staminaPct"
                :color="staminaColor"
                :show-indicator="false"
              />
              <n-text style="white-space: nowrap; width: 96px; text-align: right">
                {{ Math.round(playerStore.stamina) }} / {{ playerStore.staminaMax }}
              </n-text>
            </n-space>

            <n-space align="center" :wrap="false">
              <n-text depth="3" style="white-space: nowrap; width: 88px">
                精力
                <n-tooltip trigger="hover">
                  <template #trigger><n-text depth="3" style="cursor: help">ⓘ</n-text></template>
                  百艺的脑力。练功打坐 +10/时、睡觉 +5/时；炼器每天消耗 35，耗尽会自动打坐一轮后提前下班。
                </n-tooltip>
              </n-text>
              <n-progress
                type="line"
                style="flex: 1 1 auto"
                :percentage="focusPct"
                color="#2080f0"
                :show-indicator="false"
              />
              <n-text style="white-space: nowrap; width: 96px; text-align: right">
                {{ Math.round(playerStore.focus) }} / {{ playerStore.focusMax }}
              </n-text>
            </n-space>
          </n-space>

          <!-- ============ 修行进度 ============ -->
          <n-space vertical size="small">
            <n-space align="center" :wrap="false">
              <n-text depth="3" style="white-space: nowrap; width: 88px">内功</n-text>
              <n-text style="white-space: nowrap; width: 76px">{{ playerStore.realm }}</n-text>
              <n-progress
                type="line"
                style="flex: 1 1 auto"
                :percentage="cultivationPct"
                color="#2080f0"
                :show-indicator="false"
              />
              <n-text style="white-space: nowrap; width: 132px; text-align: right">
                修为 {{ Math.floor(playerStore.cultivation) }} / {{ playerStore.maxCultivation }}
              </n-text>
            </n-space>
            <n-space align="center" :wrap="false">
              <n-text depth="3" style="white-space: nowrap; width: 88px">外功</n-text>
              <n-text style="white-space: nowrap; width: 76px">{{ playerStore.bodyRealm }}</n-text>
              <n-progress
                type="line"
                style="flex: 1 1 auto"
                :percentage="bodyCultivationPct"
                color="#f0a020"
                :show-indicator="false"
              />
              <n-text style="white-space: nowrap; width: 132px; text-align: right">
                体魄 {{ Math.floor(playerStore.bodyCultivation) }} / {{ playerStore.maxBodyCultivation }}
              </n-text>
            </n-space>
            <n-text depth="3" style="font-size: 12px">
              修为只在**练功**环节涨：练功产灵力，打坐把灵力换成修为 —— 两件事在同一小时里发生。
              白天拿去做别的，修为就少。
            </n-text>

            <!-- 2026-10-20 引导：修为顶到上限、但被契合度/灵地门槛拦住时，
                 玩家在镇守页只会看到进度条停住，不知道要去哪处理。 -->
            <n-alert v-if="breakthroughBlocked" type="warning" show-icon>
              修为已到门槛，但突破条件还没满足。
              <n-button text type="warning" style="font-weight: 600" @click="goCultivation">
                前往【修炼】页面确认 →
              </n-button>
              <br />
              <n-text depth="3" style="font-size: 12px">
                {{
                  !playerStore.isLandTierSufficient
                    ? `需要更高品阶的灵地，当前在「${playerStore.currentSpiritLand?.name}」。`
                    : `契合度还差 ${(playerStore.nextGateGap * 100).toFixed(1)}%。`
                }}
              </n-text>
            </n-alert>
          </n-space>

          <!-- ============ 养伤 ============ -->
          <n-card v-if="playerStore.isInjured" title="养伤" size="small" :bordered="true">
            <n-space vertical size="large">
              <n-alert type="error" show-icon>
                探索战败，重伤回家。养伤期间**不能干活、不能外出**，镇守日常暂停。
              </n-alert>
              <n-descriptions :column="2" size="small" bordered>
                <n-descriptions-item label="剩余">
                  {{ formatDuration(playerStore.injuryRemainingSeconds) }}
                </n-descriptions-item>
                <n-descriptions-item label="状态">养伤中 · 日常暂停</n-descriptions-item>
              </n-descriptions>
              <n-progress
                type="line"
                :percentage="playerStore.injuryProgressPct"
                indicator-placement="inside"
                status="error"
              />
              <n-text depth="3">
                这 1 个游戏天不会练功、巡视或互动；养伤结束会自动恢复日常。
              </n-text>
            </n-space>
          </n-card>

          <template v-if="!playerStore.isInjured">
            <!-- ============ 当前任务 ============ -->
            <n-card size="small" :bordered="true" embedded>
            <n-space vertical size="small">
              <n-space align="center" justify="space-between">
                <n-text strong>当前：{{ taskView?.label || '—' }}</n-text>
                <n-text depth="3">
                  {{ taskView ? `剩余 ${formatDuration(taskView.remainingSeconds)}` : '' }}
                </n-text>
              </n-space>
              <n-progress
                type="line"
                :percentage="taskView?.progressPct || 0"
                :color="phaseColor"
                :show-indicator="false"
              />
            </n-space>
          </n-card>

          <!-- ============ 今日安排 ============ -->
          <n-card title="今日安排" size="small" :bordered="true">
            <div class="day-stage">
              <div class="day-stage-anim">
                <DayAnimation :kind="taskView?.kind || 'idle'" :height="300" />
              </div>
              <div ref="scheduleBox" class="day-stage-schedule">
                <div
                  v-for="row in schedule"
                  :key="row.key"
                  class="schedule-row"
                  :class="{ 'is-doing': row.status === 'doing' }"
                >
                  <span class="mark">{{ MARK[row.status] }}</span>
                  <n-text :depth="row.status === 'todo' ? 3 : 1">{{ row.label }}</n-text>
                  <n-tag v-if="row.deferred" size="tiny" :bordered="false">待模块七</n-tag>
                  <n-text v-else-if="row.note" depth="3" style="font-size: 12px">{{ row.note }}</n-text>
                </div>
              </div>
            </div>
          </n-card>

          <!-- ============ 今日统计 ============ -->
          <n-grid :cols="5" :x-gap="12" :y-gap="8">
            <n-grid-item><n-statistic label="练功" :value="summary.practice" suffix=" 轮" /></n-grid-item>
            <n-grid-item><n-statistic label="炼体" :value="summary.body" suffix=" 轮" /></n-grid-item>
            <n-grid-item><n-statistic label="炼器" :value="summary.forge" suffix=" 轮" /></n-grid-item>
            <n-grid-item><n-statistic label="互动" :value="summary.interact" suffix=" 位" /></n-grid-item>
            <n-grid-item>
              <n-statistic label="练功时长" :value="summary.spiritHours.toFixed(1)" suffix=" 游戏小时" />
            </n-grid-item>
          </n-grid>

          <!-- ============ 流水账 ============ -->
          <n-card title="流水账" size="small" :bordered="true">
            <div ref="logBox" class="day-log">
              <n-empty v-if="!log.length" description="今日还没有记录" size="small" />
              <div v-for="(entry, i) in log" :key="i" class="log-line">
                <span class="log-time">{{ formatClock(entry.at) }}</span>
                <span>{{ entry.text }}</span>
              </div>
            </div>
          </n-card>

          <!-- ============ 介入 ============ -->
          <n-card title="调整" size="small" :bordered="true">
            <n-space vertical size="medium">
              <!-- 巡视时长：标签/滑杆/说明分三层，窄屏也不会挤在一起 -->
              <div class="patrol-config">
                <div class="patrol-head">
                  <n-text depth="3">巡视乡间</n-text>
                  <n-text depth="3" style="font-size: 12px">当前 {{ patrolHours }} 小时</n-text>
                </div>
                <n-slider
                  style="width: 100%; max-width: 320px"
                  :value="patrolHours"
                  :min="1"
                  :max="5"
                  :step="1"
                  :marks="{ 1: '1h', 2: '2h', 3: '3h', 4: '4h', 5: '5h' }"
                  @update:value="playerStore.setDayPatrolHours"
                />
                <n-text depth="3" style="font-size: 12px">封地未开放：占时间、扣体力，无产出</n-text>
              </div>

              <n-space align="center">
                <n-checkbox
                  :checked="bodyEnabled"
                  @update:checked="playerStore.setDayBodyEnabled"
                >
                  小循环里加入炼体（1 小时/轮，体力 −15，练功轮次减半）
                </n-checkbox>
              </n-space>

              <n-space align="center">
                <n-checkbox
                  :checked="forgeEnabled"
                  @update:checked="playerStore.setArtEnabled('forge', $event)"
                >
                  小循环里加入炼器（45 分钟/轮，体力 −6/h，精力 −35/天）
                </n-checkbox>
              </n-space>

              <n-space align="center">
                <n-button size="small" :disabled="dayPhase === 'sleep'" @click="playerStore.interruptDayLoop">
                  打断循环
                </n-button>
                <n-button size="small" :disabled="dayPhase !== 'evening'" @click="playerStore.stopDayInteracting">
                  今晚不互动
                </n-button>
                <n-text depth="3" style="font-size: 12px">
                  「打断循环」做完手上这轮就下班；「今晚不互动」直接去睡，换更多睡眠。
                </n-text>
              </n-space>
            </n-space>
          </n-card>
          </template>
        </n-space>
      </n-card>
    </n-layout-content>
  </n-layout>
</template>

<script setup>
  import { computed, nextTick, ref, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import { useMessage } from 'naive-ui'
  import { usePlayerStore } from '../stores/player'
  import { formatGameDate, formatClock, formatDuration } from '../plugins/dayDate'
  import DayAnimation from '../components/DayAnimation.vue'

  const playerStore = usePlayerStore()
  const message = useMessage()
  const router = useRouter()

  const MARK = { done: '✅', doing: '🔄', todo: '⬜' }

  const dateText = computed(() => formatGameDate(playerStore.clockGameTime))
  const taskView = computed(() => playerStore.dayTaskView)
  const schedule = computed(() => playerStore.daySchedule)
  const summary = computed(() => playerStore.daySummary)
  const log = computed(() => playerStore.dayLog)
  const dayPhase = computed(() => playerStore.dayPhase)
  const patrolHours = computed(() => playerStore.dayLoop?.patrolHours ?? 2)
  const bodyEnabled = computed(() => !!playerStore.dayLoop?.bodyEnabled)
  /** 炼器默认勾选（arts.selected 的默认值是 ['forge']） */
  const forgeEnabled = computed(() => (playerStore.arts?.selected || []).includes('forge'))

  const timeState = computed(() => playerStore.gameClockState.state)
  const timeTagType = computed(() => {
    if (timeState.value === 'paused') return 'warning'
    if (timeState.value === 'paused_event') return 'error'
    return 'success'
  })
  const timeLabel = computed(() => {
    if (timeState.value === 'paused') return '⏸ 已暂停'
    if (timeState.value === 'paused_event') return '⏸ 事件处理中'
    return '▶ 推进中'
  })

  const staminaPct = computed(() =>
    playerStore.staminaMax ? Math.round((playerStore.stamina / playerStore.staminaMax) * 100) : 0
  )
  /** 体力见底是「今天干不动了」的信号，所以低的时候要变脸 */
  const staminaColor = computed(() =>
    staminaPct.value <= 15 ? '#d03050' : staminaPct.value <= 35 ? '#f0a020' : '#18a058'
  )
  const focusPct = computed(() =>
    playerStore.focusMax ? Math.round((playerStore.focus / playerStore.focusMax) * 100) : 0
  )

  const cultivationPct = computed(() =>
    playerStore.maxCultivation ? Math.round((playerStore.cultivation / playerStore.maxCultivation) * 100) : 0
  )
  /** 修为顶到上限、但门槛没过 —— 自动突破会一直停在这里，需要一句引导 */
  const breakthroughBlocked = computed(
    () =>
      playerStore.cultivation >= playerStore.maxCultivation &&
      playerStore.isBreakthroughBlocked
  )
  const goCultivation = () => router.push('/cultivation')
  const bodyCultivationPct = computed(() =>
    playerStore.maxBodyCultivation
      ? Math.round((playerStore.bodyCultivation / playerStore.maxBodyCultivation) * 100)
      : 0
  )

  const PHASE_COLOR = {
    patrol: '#2080f0',
    idle: '#909399',
    loop: '#18a058',
    evening: '#f0a020',
    sleep: '#8a2be2'
  }
  const phaseColor = computed(() => PHASE_COLOR[dayPhase.value] || '#2080f0')

  const receiveNewPlayerGift = () => {
    // P17：旧 20,000 灵石 × 10 = 200,000 大子（= 2,000 金页子，约 5.7 二阶）
    playerStore.gainCurrency('secular', 200000)
    playerStore.isNewPlayer = false
    message.success('获得 200,000 大子（= 2,000 金页子）')
  }

  /** 流水账自动滚到底 —— 照 InnerCourt.vue 的做法：watch 条数 + nextTick + 原生 scrollTop */
  const logBox = ref(null)
  watch(
    () => log.value.length,
    async () => {
      await nextTick()
      if (logBox.value) logBox.value.scrollTop = logBox.value.scrollHeight
    }
  )

  /** 「今日安排」卷轴：当前 doing 行自动居中。只在 doing 变化时滚，不跟着每秒刻度抖 */
  const scheduleBox = ref(null)
  watch(
    () => schedule.value.find(row => row.status === 'doing')?.key || '',
    async () => {
      await nextTick()
      const box = scheduleBox.value
      if (!box) return
      const row = box.querySelector('.schedule-row.is-doing')
      if (!row) return
      const top = row.offsetTop - box.clientHeight / 2 + row.clientHeight / 2
      box.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' })
    },
    { immediate: true }
  )
</script>

<style scoped>
  .day-stage {
    display: flex;
    gap: 16px;
    align-items: stretch;
  }

  .day-stage-anim {
    flex: 0 0 auto;
    width: 400px;
    max-width: 45%;
    display: flex;
    align-items: center;
  }

  .day-stage-schedule {
    position: relative;
    flex: 1 1 auto;
    height: 300px;
    overflow-y: auto;
    padding: 4px;
    scrollbar-width: thin;
    -webkit-mask-image: linear-gradient(
      to bottom,
      transparent 0,
      #000 20px,
      #000 calc(100% - 20px),
      transparent 100%
    );
    mask-image: linear-gradient(
      to bottom,
      transparent 0,
      #000 20px,
      #000 calc(100% - 20px),
      transparent 100%
    );
  }

  .schedule-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 8px;
    transition: background-color 0.2s ease;
  }

  .schedule-row.is-doing {
    background: rgba(32, 128, 240, 0.12);
  }

  .schedule-row .mark {
    width: 18px;
    text-align: center;
  }

  /* 巡视时长：标签一行、滑杆一行、说明一行 */
  .patrol-config {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  /* 2026-10-20：「巡视乡间」和「当前 N 小时」原来用 space-between 拉到两端，
     中间空出一大截，读起来像两件事。改成紧挨着排。 */
  .patrol-head {
    display: flex;
    align-items: baseline;
    justify-content: flex-start;
    gap: 8px;
  }

  @media (max-width: 720px) {
    .day-stage {
      flex-direction: column;
    }

    .day-stage-anim {
      width: 100%;
      max-width: 100%;
    }

    .day-stage-schedule {
      height: 240px;
    }
  }

  .day-log {
    max-height: 220px;
    overflow-y: auto;
    font-size: 13px;
    line-height: 1.9;
    font-variant-numeric: tabular-nums;
  }

  .day-log .log-line {
    display: flex;
    gap: 10px;
  }

  .day-log .log-time {
    color: var(--n-text-color-3);
    flex: 0 0 auto;
  }
</style>
