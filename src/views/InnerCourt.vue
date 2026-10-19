<template>
  <n-layout>
    <n-layout-header bordered>
      <n-page-header>
        <template #title>多子多福</template>
        <template #subtitle>
          <n-space align="center" :size="8">
            <n-tag size="small" :type="isAuto ? 'info' : 'default'" :bordered="false">
              {{ isAuto ? '自动' : '手动' }}
            </n-tag>
            <n-text depth="3" style="font-size: 12px">内宅 · 子嗣 · 家族树</n-text>
          </n-space>
        </template>
      </n-page-header>
    </n-layout-header>
    <n-layout-content>
      <n-card :bordered="false">
        <n-alert type="default" show-icon style="margin-bottom: 12px">
          受多子多福系统影响，妻妾子嗣生命周期加速，此乃仙家手段。
        </n-alert>
        <n-tabs type="line" v-model:value="tab">
          <!-- ============ 内宅 ============ -->
          <n-tab-pane name="night" tab="内宅">
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
              <n-text depth="3" style="font-size: 12px">
                经期 {{ summary.period }} 位 · 已故 {{ summary.passedAway }} 位（已移入家族树）
              </n-text>

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
                        <span>仙龄</span>
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
                            <span class="num dim">{{ ageText(w) }}</span>
                            <span><n-tag size="tiny" :bordered="false">{{ rankName(w.rank) }}</n-tag></span>
                            <span>
                              <n-tag size="tiny" :bordered="false" :type="(STATUS[w.status] || STATUS.idle).type">
                                {{ (STATUS[w.status] || STATUS.idle).label }}
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
              <n-grid :cols="7" :x-gap="12" :y-gap="8">
                <n-grid-item><n-statistic label="子嗣总数" :value="summary.offspring" /></n-grid-item>
                <n-grid-item><n-statistic label="其中孙辈" :value="summary.grandchildren" /></n-grid-item>
                <n-grid-item><n-statistic label="子" :value="summary.males" /></n-grid-item>
                <n-grid-item><n-statistic label="女" :value="summary.females" /></n-grid-item>
                <n-grid-item><n-statistic label="有灵根" :value="summary.rooted" /></n-grid-item>
                <n-grid-item><n-statistic label="无灵根" :value="summary.rootless" /></n-grid-item>
                <n-grid-item>
                  <n-statistic label="修行加成" :value="bonusPct" suffix="%" />
                </n-grid-item>
              </n-grid>

              <n-alert :type="summary.atCap ? 'warning' : 'info'" show-icon>
                有灵根子嗣提供修炼加成：灵根 × 本命契合 × 词条 = <strong>原始 +{{ rawBonusPct }}%</strong>；
                再按宿主大境界套软上限（当前 {{ bonusCapPct }}%），实得 <strong>+{{ bonusPct }}%</strong>。
                子嗣到青年自动婚配并繁育下一代（女儿外嫁、不计其子女）；全族上限
                {{ summary.populationCap }} 人<span v-if="summary.atCap">（已满，暂不再生育）</span>。
                任务列属模块五，暂显示「—」；陨落子嗣不再提供加成。
              </n-alert>

              <n-space justify="space-between" align="center">
                <n-select v-model:value="filter" :options="filterOptions" style="width: 160px" />
                <n-text depth="3">
                  共 {{ filteredRows.length }} 位 · 存活 {{ summary.offspring }} · 陨落 {{ summary.fallen }}
                  · 人口 {{ summary.population }}/{{ summary.populationCap }} · 已婚 {{ summary.married }}
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
                :scroll-x="1356"
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
                    <n-card hoverable>
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
                        </n-space>
                      </template>
                      <n-space vertical size="small">
                        <template v-if="c.hasRoot">
                          <n-text>{{ growthText(c) }} · {{ c.status === 'fallen' ? '陨落' : '存活' }}</n-text>
                          <n-text>灵根：{{ c.rootCount }} 系（{{ elementNames(c.roots) }}）</n-text>
                          <n-text>本命：{{ fateLabelOf(c) }}</n-text>
                          <n-text>词条：{{ (c.traits || []).map(t => t.name).join('、') || '无' }}</n-text>
                          <n-text strong type="primary">单个加成 +{{ (c.bonus * 100).toFixed(1) }}%</n-text>
                        </template>
                        <n-text v-else depth="3">
                          {{ growthText(c) }} · {{ c.status === 'fallen' ? '陨落' : '存活' }} ·
                          无灵根，不提供修炼加成
                        </n-text>
                        <n-text v-if="c.gender === 'male' && c.status !== 'fallen'" depth="3">
                          配偶：{{ c.spouse ? `${c.spouse.name}（${rankName(c.spouse.rank)} · ${rootCountName(c.spouse.rootCount)}）` : '未婚' }}
                          <template v-if="c.childrenIds?.length">
                            · 子女 {{ c.childrenIds.length }}/{{ TUNING.breeding.maxBirthsPerCouple }}
                          </template>
                        </n-text>
                        <n-text v-else-if="isMarriedOut(c)" depth="3">已外嫁（其子女不计入子孙）</n-text>
                        <n-text depth="3">
                          {{ c.fatherName ? `生父：${c.fatherName} · ` : '' }}
                          生母：{{ c.motherName }}（诞下时{{ rankName(c.motherRankAtBirth) }}）
                        </n-text>
                        <n-text depth="3">任务：—（模块五未上线）</n-text>
                      </n-space>
                    </n-card>
                  </n-grid-item>
                </n-grid>
              </template>
            </n-space>
          </n-tab-pane>

          <!-- ============ 家族树（英烈祠并入这里） ============ -->
          <n-tab-pane name="family" tab="家族树">
            <n-space vertical size="large">
              <n-alert type="info" show-icon>
                按代际折叠的家族总览：妻妾、子嗣、已故与英烈都在这里。子嗣的 9 列详细表格仍在「子嗣」页签。
              </n-alert>

              <n-card size="small" title="妻妾">
                <n-space vertical :size="6">
                  <n-text v-for="w in familyWives.living" :key="w.id">
                    <n-tag size="tiny" :bordered="false">{{ rankName(w.rank) }}</n-tag>
                    {{ w.name }} · {{ wifeAgeText(w) }} ·
                    {{ (STATUS[w.status] || STATUS.idle).label }}
                  </n-text>
                  <n-text v-if="!familyWives.living.length" depth="3">暂无在世妻妾</n-text>
                  <template v-if="familyWives.passed.length">
                    <n-divider style="margin: 4px 0" />
                    <n-text
                      v-for="w in familyWives.passed"
                      :key="w.id"
                      depth="3"
                      style="font-size: 12px"
                    >
                      已故：{{ w.name }} · 享年
                      {{ Math.floor(wifeAgeYearsOf(w, playerStore.clockGameTime) || 0) }} 岁
                    </n-text>
                  </template>
                </n-space>
              </n-card>

              <n-collapse v-model:expanded-names="expandedGens">
                <n-collapse-item
                  v-for="g in familyGenerations"
                  :key="g.generation"
                  :name="'g' + g.generation"
                >
                  <template #header>
                    <n-space align="center" :size="8">
                      <span>{{ g.label }}</span>
                      <n-tag size="tiny" :bordered="false">存活 {{ g.alive }}</n-tag>
                      <n-tag v-if="g.fallen" size="tiny" type="error" :bordered="false">
                        英烈 {{ g.fallen }}
                      </n-tag>
                      <n-tag v-if="g.passedAway" size="tiny" :bordered="false">
                        已故 {{ g.passedAway }}
                      </n-tag>
                    </n-space>
                  </template>
                  <n-list v-if="g.members.length" bordered>
                    <n-list-item v-for="c in g.members" :key="c.id">
                      <n-space justify="space-between" align="center">
                        <n-space vertical :size="2">
                          <n-space align="center" :size="6">
                            <n-text strong>{{ c.name }}</n-text>
                            <n-tag
                              size="tiny"
                              :type="c.gender === 'female' ? 'error' : 'info'"
                              :bordered="false"
                            >
                              {{ genderOf(c).label }}
                            </n-tag>
                            <n-tag
                              size="tiny"
                              :bordered="false"
                              :type="
                                c.status === 'fallen'
                                  ? 'error'
                                  : c.status === 'passed_away'
                                    ? 'default'
                                    : 'success'
                              "
                            >
                              {{ familyStatusText(c) }}
                            </n-tag>
                          </n-space>
                          <n-text depth="3" style="font-size: 12px">
                            {{ familyAgeText(c) }} ·
                            {{ c.hasRoot ? rootCountName(c.rootCount) : '无灵根' }} · 生母
                            {{ c.motherName || '—' }}
                            <span v-if="c.spouse"> · 配偶 {{ c.spouse.name }}</span>
                          </n-text>
                        </n-space>
                      </n-space>
                    </n-list-item>
                  </n-list>
                  <n-empty v-else description="这一代还没有子嗣" size="small" />
                </n-collapse-item>
              </n-collapse>
              <n-empty v-if="!familyGenerations.length" description="家族树还是空的" />

              <n-divider>英烈祠</n-divider>
              <n-alert type="info" show-icon>
                在秘境中陨落的子嗣会供奉于此。每块牌位提供打坐修为与后代灵根概率加成；
                陵园数据仍存放在秘境的存档里，这里只是换了入口。
              </n-alert>
              <n-descriptions :column="3" bordered size="small">
                <n-descriptions-item label="牌位">
                  {{ playerStore.secretRealm.shrine.length }}
                </n-descriptions-item>
                <n-descriptions-item label="打坐修为加成">
                  +{{ Math.round(playerStore.shrineCultivationBonus * 100) }}%
                </n-descriptions-item>
                <n-descriptions-item label="灵根概率加成">
                  +{{ (playerStore.shrineRootChanceBonus * 100).toFixed(1) }}%
                </n-descriptions-item>
              </n-descriptions>
              <n-empty v-if="!playerStore.secretRealm.shrine.length" description="还没有陨落的子嗣" />
              <n-list v-else bordered>
                <n-list-item v-for="m in playerStore.secretRealm.shrine" :key="m.id">
                  <n-space justify="space-between" align="center">
                    <n-space vertical :size="2">
                      <n-text strong>{{ m.name }}</n-text>
                      <n-text depth="3" style="font-size: 12px">
                        {{ rootCountName(m.rootCount) }} · 本命 {{ m.fate?.name || '—' }}
                      </n-text>
                    </n-space>
                    <n-text depth="3">止步第 {{ m.deathFloor }} 层</n-text>
                  </n-space>
                </n-list-item>
              </n-list>
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
  import {
    formatOffspringGrowth,
    offspringGrowthOf,
    stageAtLeast,
    rootCountName,
    rankName,
    fateLabelOf,
    wifeAgeYearsOf,
    wifeLifeStageOf,
    TUNING
  } from '../plugins/innerCourt'
  import { STATUS_META, OFFSPRING_GENDER_META } from '../plugins/innerCourtData'
  import { ELEMENTS } from '../plugins/wuxing'

  const playerStore = usePlayerStore()
  const message = useMessage()

  const tab = ref('night')
  const selected = ref([])
  const busy = ref(false)

  const STATUS = STATUS_META
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
  const STATUS_ORDER = { idle: 0, period: 1, pregnant: 2, recovering: 3, passed_away: 4 }
  // 内宅只显示在世妻妾；已故的留在 wives 数组里，家族树单独展示
  const displayWives = computed(() =>
    [...playerStore.livingWives].sort(
      (a, b) =>
        (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
        (b.rank || 0) - (a.rank || 0) ||
        (b.affinity || 0) - (a.affinity || 0)
    )
  )

  /** 仙龄 + 阶段：少女 / 妇人 / 老妇 */
  const ageText = w => {
    const age = wifeAgeYearsOf(w, playerStore.clockGameTime)
    if (age == null) return '—'
    const stage = wifeLifeStageOf(age)
    return `${Math.floor(age)}岁·${stage?.name || ''}`
  }

  const wifeAgeText = w => {
    const age = wifeAgeYearsOf(w, playerStore.clockGameTime)
    return age == null ? '—' : `${Math.floor(age)} 岁`
  }

  // ---------- 家族树（v1：按代折叠 + 妻妾 + 英烈祠） ----------
  const familyWives = computed(() => ({
    living: playerStore.livingWives,
    passed: playerStore.passedAwayWives
  }))

  const familyGenerations = computed(() => {
    const list = playerStore.offspring?.list || []
    const byGen = new Map()
    for (const c of list) {
      const generation = Number(c.generation) || 1
      if (!byGen.has(generation)) byGen.set(generation, [])
      byGen.get(generation).push(c)
    }
    return [...byGen.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([generation, members]) => {
        const alive = members.filter(
          c => c.status !== 'fallen' && c.status !== 'passed_away'
        )
        return {
          generation,
          label: `第 ${generation} 代`,
          members,
          alive: alive.length,
          fallen: members.filter(c => c.status === 'fallen').length,
          passedAway: members.filter(c => c.status === 'passed_away').length,
          folded: alive.length === 0
        }
      })
  })

  const expandedGens = ref([])
  watch(
    familyGenerations,
    gens => {
      if (expandedGens.value.length) return
      expandedGens.value = gens.filter(g => !g.folded).map(g => `g${g.generation}`)
    },
    { immediate: true }
  )

  const familyStatusText = c =>
    c.status === 'fallen' ? '陨落' : c.status === 'passed_away' ? '已故' : '存活'
  const familyAgeText = c => formatOffspringGrowth(offspringGrowthOf(c, playerStore.clockGameTime))

  const summary = computed(() => playerStore.courtSummary)
  const bonusPct = computed(() => (summary.value.bonus * 100).toFixed(1))
  const rawBonusPct = computed(() => (summary.value.rawBonus * 100).toFixed(1))
  const bonusCapPct = computed(() => (summary.value.bonusCap * 100).toFixed(0))
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

  // 怀孕率由公式算出（设计 §5.5）。2026-10-18 起疲劳 −10% 已废除，
  // 所以不再按 plannedCost 判体力；但**自动模式的 −5 个百分点必须传进去**，
  // 否则自动页会显示手动的 11.1%，实际判定却是 6.1%。
  const chancePct = w => `${(playerStore.wifePregnancyChance(w, isAuto.value) * 100).toFixed(1)}%`

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
  const nowGameSeconds = computed(() => playerStore.clockGameTime)
  /** P14：阶段 · 仙龄 · 进度（例：少年 · 9 岁 · 135/180 天）。仙凡双轨，别再按 365 天/年算 */
  const growthText = c => formatOffspringGrowth(c, nowGameSeconds.value)
  const stageOf = c => offspringGrowthOf(c, nowGameSeconds.value)
  /** 女儿到青年外嫁（设计 §7.4；第一版不建模她的配偶与子女） */
  const isMarriedOut = c =>
    c.gender === 'female' &&
    c.status !== 'fallen' &&
    stageAtLeast(stageOf(c), TUNING.growth.marryStage)

  /** 宽屏密集表格的列定义。渲染函数直接读 growthText，时钟走动时阶段/仙龄会跟着更新 */
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
      title: '阶段 / 仙龄',
      key: 'birthTime',
      width: 170,
      sorter: (a, b) => (a.birthTime || 0) - (b.birthTime || 0),
      render: row => growthText(row)
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
      render: row => fateLabelOf(row)
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
      title: '配偶',
      key: 'spouse',
      width: 170,
      ellipsis: { tooltip: true },
      render: row => {
        if (row.status === 'fallen') return h('span', { style: 'color:#999' }, '—')
        if (row.gender === 'female') return isMarriedOut(row) ? '已外嫁' : '—'
        if (!row.spouse) return h('span', { style: 'color:#999' }, '未婚')
        const state =
          row.spouseStatus === 'pregnant' ? '（孕）' : row.spouseStatus === 'recovering' ? '（产后）' : ''
        const roots = rootCountName(row.spouse.rootCount)
        return `${row.spouse.name} · ${rankName(row.spouse.rank)} · ${roots}${state}`
      }
    },
    {
      title: '子女',
      key: 'childrenIds',
      width: 76,
      align: 'right',
      sorter: (a, b) => (a.childrenIds?.length || 0) - (b.childrenIds?.length || 0),
      render: row => {
        const n = row.childrenIds?.length || 0
        if (!n) return h('span', { style: 'color:#999' }, '—')
        return `${n}/${TUNING.breeding.maxBirthsPerCouple}`
      }
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
    grid-template-columns: 26px minmax(3.5em, 1fr) 3.8em 5.4em 4.6em 2.6em 3.6em 3.4em;
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
