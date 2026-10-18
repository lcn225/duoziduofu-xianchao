<template>
  <n-layout>
    <n-layout-header bordered>
      <n-page-header>
        <template #title>内宅</template>
        <template #subtitle>
          <n-tag size="small" :type="isAuto ? 'info' : 'default'" :bordered="false">
            {{ isAuto ? '自动' : '手动' }}
          </n-tag>
        </template>
      </n-page-header>
    </n-layout-header>
    <n-layout-content>
      <n-card :bordered="false">
        <n-tabs type="line" v-model:value="tab">
          <!-- ============ 晚间互动 ============ -->
          <n-tab-pane name="night" tab="晚间互动">
            <n-space vertical size="large">
              <n-alert type="info" show-icon>
                内宅<strong>不暂停时间</strong>。留宿每晚（游戏时间第 {{ eveningHour }} 时）自动进行，
                孕育、产后恢复与流水账都会在你眼前实时推进。
              </n-alert>

              <n-grid :cols="5" :x-gap="12" :y-gap="8">
                <n-grid-item><n-statistic label="侍妾" :value="summary.total" /></n-grid-item>
                <n-grid-item><n-statistic label="待孕" :value="summary.idle" /></n-grid-item>
                <n-grid-item><n-statistic label="已孕" :value="summary.pregnant" /></n-grid-item>
                <n-grid-item><n-statistic label="子嗣" :value="summary.offspring" /></n-grid-item>
                <n-grid-item><n-statistic label="修行加成" :value="bonusPct" suffix="%" /></n-grid-item>
              </n-grid>

              <n-space align="center" :wrap="false">
                <n-text depth="3" style="white-space: nowrap">
                  <!-- 体力现在是**按切片小数结算**的（一个 tick 可能只扣 0.75），
                       所以这里要取整 —— 原始值会在界面上抖出一串小数 -->
                  体力 {{ Math.round(playerStore.energy) }} / {{ Math.round(playerStore.energyMax) }}
                </n-text>
                <n-progress
                  type="line"
                  style="flex: 1 1 auto"
                  :percentage="energyPct"
                  :color="energyColor"
                  :show-indicator="false"
                />
                <n-tag size="small" :type="playerStore.canInteractToday ? 'success' : 'default'">
                  {{ playerStore.canInteractToday ? '今夜未留宿' : '今夜已留宿' }}
                </n-tag>
              </n-space>

              <n-space align="center">
                <n-radio-group :value="nightMode" size="small" @update:value="playerStore.setNightMode">
                  <n-radio-button value="auto">自动</n-radio-button>
                  <n-radio-button value="manual">手动</n-radio-button>
                </n-radio-group>
                <template v-if="isAuto">
                  <n-text depth="3">挑人规则</n-text>
                  <n-select
                    :value="autoRule"
                    :options="ruleOptions"
                    size="small"
                    style="width: 150px"
                    @update:value="playerStore.setAutoRule"
                  />
                  <n-text depth="3" style="font-size: 12px">
                    每日第 {{ eveningHour }} 时自动留宿，怀孕率 -{{ (autoPenalty * 100).toFixed(0) }}%
                  </n-text>
                </template>
              </n-space>

              <n-grid :cols="2" :x-gap="16" :y-gap="12">
                <!-- 左：侍妾名单 -->
                <n-grid-item>
                  <n-card size="small" title="侍妾名单">
                    <template #header-extra>
                      <n-text depth="3" style="font-size: 12px">{{ listHint }}</n-text>
                    </template>

                    <n-empty v-if="!displayWives.length" description="内宅空无一人" size="small" />
                    <template v-else>
                      <div class="wife-head">
                        <span></span>
                        <span>姓名</span>
                        <span>位阶</span>
                        <span>状态</span>
                        <span>好感</span>
                        <span>怀孕率</span>
                        <span>剩余</span>
                      </div>

                      <n-checkbox-group v-model:value="selected">
                        <div class="wife-list">
                          <div
                            v-for="w in displayWives"
                            :key="w.id"
                            class="wife-row"
                            :class="{ 'is-busy': w.status !== 'idle' }"
                          >
                            <!-- 自动模式：名单是只读的观战面板，标出今晚会轮到谁 -->
                            <span v-if="isAuto" class="plan-dot" :class="{ on: autoPlan.includes(w.id) }">●</span>
                            <n-checkbox v-else :value="w.id" :disabled="w.status !== 'idle'" />

                            <span class="wife-name">{{ w.name }}</span>
                            <span><n-tag size="tiny" :bordered="false">{{ rankName(w.rank) }}</n-tag></span>
                            <span>
                              <n-tag size="tiny" :bordered="false" :type="STATUS[w.status].type">
                                {{ STATUS[w.status].label }}
                              </n-tag>
                            </span>
                            <span class="num">{{ w.affinity }}</span>
                            <span class="num" :class="{ dim: w.status !== 'idle' }">
                              {{ w.status === 'idle' ? chancePct(w) : '—' }}
                            </span>
                            <span class="num dim">
                              {{ w.status === 'idle' ? '—' : playerStore.remainingDaysOf(w.statusEndTime) + ' 天' }}
                            </span>
                          </div>
                        </div>
                      </n-checkbox-group>
                    </template>

                    <template #action>
                      <n-space v-if="!isAuto" justify="space-between" align="center">
                        <n-space size="small">
                          <n-button size="tiny" quaternary @click="selectAll">全选待孕</n-button>
                          <n-button size="tiny" quaternary @click="selected = []">清空</n-button>
                        </n-space>
                        <n-button type="primary" size="small" :disabled="!canStart" :loading="busy" @click="startNight">
                          留宿 {{ selected.length }} 人（耗 {{ plannedCost }}）
                        </n-button>
                      </n-space>
                      <n-text v-else depth="3" style="font-size: 12px">
                        自动模式会在第 {{ eveningHour }} 时按规则挑人留宿；切成「手动」可自己挑。
                      </n-text>
                    </template>
                  </n-card>
                </n-grid-item>

                <!-- 右：流水账 -->
                <n-grid-item>
                  <n-card size="small" title="内宅流水">
                    <template #header-extra>
                      <n-text depth="3" style="font-size: 12px">最新在上</n-text>
                    </template>
                    <div ref="logBox" class="court-log">
                      <n-empty v-if="!log.length" description="暂无记录" size="small" />
                      <div v-for="(item, i) in log" :key="i" class="log-line">
                        <span class="log-day">第 {{ item.day }} 天</span>
                        <span>{{ item.text }}</span>
                      </div>
                    </div>
                  </n-card>
                </n-grid-item>
              </n-grid>
            </n-space>
          </n-tab-pane>

          <!-- ============ 子嗣 ============ -->
          <n-tab-pane name="offspring" tab="子嗣">
            <n-space vertical>
              <n-grid :cols="6" :x-gap="12" :y-gap="8">
                <n-grid-item><n-statistic label="子嗣总数" :value="summary.offspring" /></n-grid-item>
                <n-grid-item><n-statistic label="子" :value="summary.males" /></n-grid-item>
                <n-grid-item><n-statistic label="女" :value="summary.females" /></n-grid-item>
                <n-grid-item><n-statistic label="有灵根" :value="summary.rooted" /></n-grid-item>
                <n-grid-item><n-statistic label="无灵根" :value="summary.rootless" /></n-grid-item>
                <n-grid-item>
                  <n-statistic label="修行加成" :value="bonusPct" suffix="%" />
                </n-grid-item>
              </n-grid>

              <n-alert type="info" show-icon>
                只有有灵根的子嗣提供修炼加成：灵根 × 本命契合 × 词条，合计上限 +200%。
                任务列属模块五，暂显示「—」；陨落子嗣不再提供加成。
              </n-alert>

              <n-space justify="space-between" align="center">
                <n-select v-model:value="filter" :options="filterOptions" style="width: 160px" />
                <n-text depth="3">
                  共 {{ filteredRows.length }} 位 · 存活 {{ summary.offspring }} · 陨落 {{ summary.fallen }}
                </n-text>
              </n-space>

              <n-empty v-if="!filteredRows.length" description="尚无子嗣" />

              <!-- 宽屏：密集表格（默认按出生时间倒序；可点表头排序） -->
              <n-data-table
                v-else-if="!isNarrow"
                :columns="offspringColumns"
                :data="filteredRows"
                :row-key="row => row.id"
                :pagination="tablePagination"
                :scroll-x="1180"
                size="small"
                :bordered="false"
                :single-line="false"
                @update:page="onPageChange"
                @update:page-size="onPageSizeChange"
              />

              <!-- 窄屏（<720px）：退回卡片，避免十列挤成一团 -->
              <template v-else>
                <n-pagination
                  v-model:page="page"
                  :page-size="pageSize"
                  :item-count="filteredRows.length"
                  v-if="filteredRows.length > pageSize"
                  :page-slot="7"
                />
                <n-grid :cols="1" :x-gap="12" :y-gap="8">
                  <n-grid-item v-for="c in pageRows" :key="c.id">
                    <n-card hoverable :style="{ borderColor: qualityOf(c).color }">
                      <template #header>
                        <n-space justify="space-between" align="center">
                          <n-space align="center" :size="6">
                            <n-tag
                              size="small"
                              :type="c.gender === 'female' ? 'error' : 'info'"
                              :bordered="false"
                            >
                              {{ genderOf(c).label }}
                            </n-tag>
                            <span>{{ c.name }}</span>
                          </n-space>
                          <n-tag size="small" :style="{ color: qualityOf(c).color }">
                            {{ c.hasRoot ? qualityOf(c).name : '无灵根' }}
                          </n-tag>
                        </n-space>
                      </template>
                      <n-space vertical size="small">
                        <template v-if="c.hasRoot">
                          <n-text>年龄：{{ ageText(c) }} · 状态：{{ c.status === 'fallen' ? '陨落' : '存活' }}</n-text>
                          <n-text>灵根：{{ c.rootCount }} 系（{{ elementNames(c.roots) }}）</n-text>
                          <n-text>本命：{{ c.fate?.name || '—' }}</n-text>
                          <n-text>词条：{{ (c.traits || []).map(t => t.name).join('、') || '无' }}</n-text>
                          <n-text strong type="primary">单个加成 +{{ (c.bonus * 100).toFixed(1) }}%</n-text>
                        </template>
                        <n-text v-else depth="3">
                          年龄：{{ ageText(c) }} · 状态：{{ c.status === 'fallen' ? '陨落' : '存活' }} ·
                          无灵根，不提供修炼加成
                        </n-text>
                        <n-text depth="3">生母：{{ c.motherName }}（诞下时{{ rankName(c.motherRankAtBirth) }}）</n-text>
                        <n-text depth="3">任务：—（模块五未上线）</n-text>
                      </n-space>
                    </n-card>
                  </n-grid-item>
                </n-grid>
              </template>
            </n-space>
          </n-tab-pane>
        </n-tabs>
      </n-card>
    </n-layout-content>
  </n-layout>
</template>

<script setup>
  import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { NTag, useMessage } from 'naive-ui'
  import { usePlayerStore } from '../stores/player'
  import { formatOffspringAge, rankName, TUNING } from '../plugins/innerCourt'
  import { QUALITY_META, STATUS_META, OFFSPRING_GENDER_META } from '../plugins/innerCourtData'
  import { ELEMENTS } from '../plugins/wuxing'

  const playerStore = usePlayerStore()
  const message = useMessage()

  const tab = ref('night')
  const selected = ref([])
  const busy = ref(false)

  const STATUS = STATUS_META
  const qualityOf = c => QUALITY_META[c.quality] || QUALITY_META.low
  const genderOf = c => OFFSPRING_GENDER_META[c.gender] || OFFSPRING_GENDER_META.male

  const eveningHour = TUNING.night.eveningHour
  const autoPenalty = TUNING.pregnancy.autoPenalty
  const nightMode = computed(() => playerStore.innerCourt.nightMode || 'manual')
  const isAuto = computed(() => nightMode.value === 'auto')
  const autoRule = computed(() => playerStore.innerCourt.autoRule || 'relation')
  const ruleOptions = [
    { label: '优先高好感', value: 'relation' },
    { label: '优先高位阶', value: 'rank' },
    { label: '平均分配', value: 'robin' }
  ]

  /**
   * 名单固定按「待孕 → 已孕 → 产后恢复」分组，组内再按位阶、好感降序。
   * 待孕的排最前，一屏之内先看到能动的；顺序稳定（好感本批不变），不会边看边跳。
   */
  const STATUS_ORDER = { idle: 0, pregnant: 1, recovering: 2 }
  const displayWives = computed(() =>
    [...playerStore.wives].sort(
      (a, b) =>
        (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
        (b.rank || 0) - (a.rank || 0) ||
        (b.affinity || 0) - (a.affinity || 0)
    )
  )

  const summary = computed(() => playerStore.courtSummary)
  const bonusPct = computed(() => (summary.value.bonus * 100).toFixed(1))
  // 存储按时间正序追加；展示时倒过来，**最新的在最上面**（用户要求）
  const log = computed(() => [...(playerStore.innerCourt.interactionLog || [])].reverse())
  const autoPlan = computed(() => (isAuto.value ? playerStore.autoNightPlan : []))

  /** 名单右上角的一句话提示。今夜已过时不能再显示「今晚约 0 人」——那会被读成「挑不出人」 */
  const listHint = computed(() => {
    if (!isAuto.value) return `已选 ${selected.value.length} 人`
    if (!playerStore.canInteractToday) return '今夜已留宿'
    return `今晚约 ${autoPlan.value.length} 人`
  })

  const energyPct = computed(() =>
    playerStore.energyMax ? Math.round((playerStore.energy / playerStore.energyMax) * 100) : 0
  )
  const energyColor = computed(() =>
    playerStore.energy < TUNING.pregnancy.fatigueThreshold ? '#f0a020' : '#18a058'
  )

  const plannedCost = computed(() => selected.value.length * TUNING.energy.perInteraction)
  const canStart = computed(
    () => playerStore.canInteractToday && selected.value.length > 0 && playerStore.energy >= plannedCost.value
  )

  // 怀孕率由公式算出（设计 §5.5），疲劳按**扣完本次总消耗之后**的体力判 ——
  // 与 interactEvening 内部同一口径，所以传 plannedCost。
  const chancePct = w => `${(playerStore.wifePregnancyChance(w, plannedCost.value) * 100).toFixed(1)}%`

  const selectAll = () => {
    selected.value = playerStore.availableWives.map(w => w.id)
  }

  const startNight = () => {
    const res = playerStore.interactEvening([...selected.value])
    if (!res.success) {
      message.warning(res.message)
      return
    }
    // 内宅页面现在不弹结果窗了 —— 流水账就是结果，弹窗会挡住那片正在滚动的记录
    message[res.results.some(r => r.pregnant) ? 'success' : 'info'](res.message)
    selected.value = []
  }

  // ---------- 流水自动滚动 ----------
  // 用原生 div 而不是 n-scrollbar：只要一行 `scrollTop = scrollHeight`，
  // 不必去猜组件实例把容器暴露在哪个字段上。
  const logBox = ref(null)
  watch(
    () => log.value.length,
    async () => {
      await nextTick()
      // 最新在上：新记录出现时回到顶部，而不是滚到底
      if (logBox.value) logBox.value.scrollTop = 0
    }
  )

  // ---------- 子嗣页签 ----------
  const filter = ref('all')
  const filterOptions = [
    { label: '全部', value: 'all' },
    { label: '有灵根', value: 'rooted' },
    { label: '无灵根', value: 'rootless' },
    { label: '已陨落', value: 'fallen' }
  ]
  const page = ref(1)
  const pageSize = ref(12)

  const filteredRows = computed(() => {
    const rows = playerStore.offspringRows
    let out = rows
    if (filter.value === 'rooted') out = rows.filter(c => c.hasRoot)
    else if (filter.value === 'rootless') out = rows.filter(c => !c.hasRoot)
    else if (filter.value === 'fallen') out = rows.filter(c => c.status === 'fallen')
    // 默认按出生时间倒序（最新在上）；表格列的 sorter 会覆盖这个初始顺序
    return [...out].sort((a, b) => (b.birthTime || 0) - (a.birthTime || 0))
  })
  const pageRows = computed(() =>
    filteredRows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
  )
  watch([filter, pageSize, () => playerStore.offspring.list.length], () => (page.value = 1))

  const onPageChange = p => (page.value = p)
  const onPageSizeChange = size => {
    pageSize.value = size
    page.value = 1
  }
  const tablePagination = computed(() => ({
    page: page.value,
    pageSize: pageSize.value,
    pageSizes: [12, 24, 50],
    showSizePicker: true
  }))

  const elementNames = roots => (roots || []).map(e => ELEMENTS[e] || e).join('/')
  const QUALITY_RANK = { low: 0, mid: 1, high: 2, top: 3 }
  const nowGameSeconds = computed(() => playerStore.clockGameTime)
  const ageText = c => formatOffspringAge(c.birthTime, nowGameSeconds.value)

  /** 宽屏密集表格的列定义。渲染函数直接读 ageText，时钟走动时年龄会跟着更新 */
  const offspringColumns = [
    {
      title: '姓名',
      key: 'name',
      width: 120,
      render: row =>
        h('span', { style: 'display:inline-flex;align-items:center;gap:6px' }, [
          h(
            NTag,
            {
              size: 'small',
              type: row.gender === 'female' ? 'error' : 'info',
              bordered: false
            },
            { default: () => genderOf(row).label }
          ),
          row.name
        ])
    },
    {
      title: '年龄',
      key: 'birthTime',
      width: 100,
      sorter: (a, b) => (a.birthTime || 0) - (b.birthTime || 0),
      render: row => ageText(row)
    },
    {
      title: '品质',
      key: 'quality',
      width: 84,
      sorter: (a, b) => (QUALITY_RANK[a.quality] ?? -1) - (QUALITY_RANK[b.quality] ?? -1),
      render: row => {
        if (!row.hasRoot) return h('span', { style: 'color:#999' }, '—')
        const q = qualityOf(row)
        return h(
          NTag,
          { size: 'small', bordered: false, style: { color: q.color } },
          { default: () => q.name }
        )
      }
    },
    {
      title: '灵根',
      key: 'rootCount',
      width: 170,
      ellipsis: { tooltip: true },
      sorter: (a, b) => (a.rootCount || 0) - (b.rootCount || 0),
      render: row => (row.hasRoot ? `${row.rootCount} 系 · ${elementNames(row.roots)}` : '—')
    },
    {
      title: '本命',
      key: 'fate',
      width: 140,
      ellipsis: { tooltip: true },
      render: row => row.fate?.name || '—'
    },
    {
      title: '词条',
      key: 'traits',
      width: 180,
      ellipsis: { tooltip: true },
      render: row =>
        row.hasRoot ? (row.traits || []).map(t => t.name).join('、') || '无' : '—'
    },
    {
      title: '加成',
      key: 'bonus',
      width: 92,
      align: 'right',
      sorter: (a, b) => a.bonus - b.bonus,
      render: row =>
        row.status === 'fallen'
          ? h('span', { style: 'color:#999' }, '—')
          : h(
              'span',
              { style: 'color:#18a058;font-weight:600' },
              `+${(row.bonus * 100).toFixed(1)}%`
            )
    },
    {
      title: '状态',
      key: 'status',
      width: 84,
      render: row =>
        h(
          NTag,
          {
            size: 'small',
            bordered: false,
            type: row.status === 'fallen' ? 'error' : 'success'
          },
          { default: () => (row.status === 'fallen' ? '陨落' : '存活') }
        )
    },
    {
      title: '任务',
      key: 'task',
      width: 76,
      render: () => h('span', { style: 'color:#999', title: '任务系统（模块五）未上线' }, '—')
    },
    {
      title: '生母',
      key: 'motherName',
      width: 150,
      ellipsis: { tooltip: true },
      render: row => `${row.motherName || '—'}（${rankName(row.motherRankAtBirth)}）`
    }
  ]

  // 窄屏退回卡片（<720px）。只监听 matchMedia，不挂任何计时器。
  const isNarrow = ref(false)
  let narrowMq = null
  const onNarrowChange = e => {
    isNarrow.value = e.matches
  }
  onMounted(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    narrowMq = window.matchMedia('(max-width: 720px)')
    isNarrow.value = narrowMq.matches
    narrowMq.addEventListener?.('change', onNarrowChange)
  })
  onBeforeUnmount(() => narrowMq?.removeEventListener?.('change', onNarrowChange))
</script>

<style scoped>
  /* 名单用 grid 对齐成表，比一人一张卡片紧凑得多 —— 36 人也一屏扫得完 */
  .wife-head,
  .wife-row {
    display: grid;
    grid-template-columns: 26px minmax(3.5em, 1fr) 5.4em 4.6em 2.6em 3.6em 3.4em;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }

  .wife-head {
    padding: 0 10px 4px;
    color: var(--n-text-color-3, #999);
    font-size: 12px;
    border-bottom: 1px solid var(--n-border-color);
  }

  .wife-list {
    max-height: 420px;
    overflow-y: auto;
  }

  .wife-row {
    padding: 5px 10px;
    border-bottom: 1px solid var(--n-border-color);
  }
  .wife-row:last-child {
    border-bottom: none;
  }
  .wife-row.is-busy {
    opacity: 0.55;
  }

  .wife-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .dim {
    color: var(--n-text-color-3, #999);
  }

  /* 自动模式的「今晚轮到谁」标记 */
  .plan-dot {
    text-align: center;
    font-size: 10px;
    color: transparent;
  }
  .plan-dot.on {
    color: #2080f0;
  }

  .court-log {
    max-height: 420px;
    overflow-y: auto;
    font-size: 12px;
    line-height: 1.7;
  }
  .log-line {
    display: flex;
    gap: 8px;
    padding: 1px 0;
    border-bottom: 1px dashed var(--n-border-color);
  }
  .log-line:last-child {
    border-bottom: none;
  }
  .log-day {
    flex: 0 0 4.6em;
    color: var(--n-text-color-3, #999);
  }
</style>
