<template>
  <n-layout>
    <n-layout-content>
      <div class="page-stack">
        <!-- ============ 1. 封地概况 ============ -->
        <section class="zone">
          <div class="zone-head">
            <span class="zone-title">{{ view.name }} · 乡侯府 Lv.{{ view.manorLevel }}</span>
            <n-tag v-if="view.patrolled" size="small" type="success">巡视日 · 三进度 ×2</n-tag>
            <n-tag v-else size="small" :bordered="false">今日未巡视 · ×1</n-tag>
          </div>
          <div class="zone-body">
            <div class="stat-row">
              <div class="stat">
                <span class="k">人口</span>
                <span class="v">{{ view.population.toLocaleString() }}</span>
              </div>
              <div class="stat">
                <span class="k">徭役</span>
                <span class="v">{{ view.laborUsed }} / {{ view.laborTotal }}</span>
              </div>
              <div class="stat">
                <span class="k">民心</span>
                <span class="v">{{ Math.round(view.morale) }} · {{ view.moraleLabel }}</span>
                <span class="sub">系数 ×{{ view.moraleCoef.toFixed(2) }}</span>
              </div>
              <div class="stat">
                <span class="k">繁荣</span>
                <span class="v">{{ view.prosperity }}</span>
              </div>
              <div class="stat">
                <span class="k">灵田日产</span>
                <span class="v">{{ farmDaily }} 一阶</span>
              </div>
              <div class="stat">
                <span class="k">灵石</span>
                <span class="v">{{ formatSpiritual(playerStore.currency.spiritual) }}</span>
              </div>
            </div>
            <n-text depth="3" style="font-size: 12px">
              民心基准 {{ view.moraleBaseline }}（50 + 5 × 乡侯府等级），每天按 2 × 乡侯府等级靠拢。
              民心系数同时乘税收、产出与徭役效率。
            </n-text>
          </div>
        </section>

        <!-- ============ 2. 建筑与进度 ============ -->
        <section class="zone">
          <div class="zone-head">
            <span class="zone-title">建筑与进度</span>
            <n-text depth="3" style="font-size: 12px">
              徭役满足率 {{ Math.round(view.satisfaction * 100) }}%
              <template v-if="view.laborStop">（低于 50%，全部停工）</template>
            </n-text>
          </div>
          <div class="zone-body">
            <div
              v-for="b in view.activeBuildings"
              :key="b.id"
              class="build-row"
            >
              <div class="build-main">
                <div class="build-title">
                  <strong>{{ b.name }}</strong>
                  <n-tag v-if="b.level" size="small" :bordered="false">Lv.{{ b.level }} / {{ b.maxLevel }}</n-tag>
                  <n-tag v-else size="small" :bordered="false" type="warning">未建造</n-tag>
                </div>
                <n-text depth="3" style="font-size: 12px">{{ b.effectText }}</n-text>

                <!-- 建设条 -->
                <div v-if="b.job" class="bar-block">
                  <n-progress
                    type="line"
                    :percentage="Math.round(b.job.progress)"
                    :height="6"
                    :show-indicator="false"
                  />
                  <n-text depth="3" style="font-size: 12px">
                    建设中 → Lv.{{ b.job.targetLevel }} · {{ Math.round(b.job.progress) }}% ·
                    应付 {{ formatStones(b.job.costStones) }} · 工期 {{ b.job.days }} 天
                  </n-text>
                  <n-text v-if="stallHint(b)" style="font-size: 12px" type="warning">
                    {{ stallHint(b) }}
                  </n-text>
                </div>

                <!-- 产出条（灵田） -->
                <div v-else-if="b.outputPerDay > 0" class="bar-block">
                  <n-progress
                    type="line"
                    :percentage="productionBar"
                    :height="6"
                    :show-indicator="false"
                  />
                  <n-text depth="3" style="font-size: 12px">
                    今日产出 {{ b.outputPerDay }} / 天（巡视日收两次）
                  </n-text>
                </div>
              </div>

              <div class="build-acts">
                <template v-if="b.job">
                  <n-text depth="3" style="font-size: 12px">施工中…</n-text>
                </template>
                <template v-else-if="!b.level">
                  <n-button size="small" type="primary" @click="doBuild(b)">建造</n-button>
                  <n-text depth="3" style="font-size: 12px">
                    首建免费 · 工期 {{ b.quote?.days }} 天 · 徭役 {{ b.quote?.labor }}
                  </n-text>
                </template>
                <template v-else-if="b.quote">
                  <n-button size="small" @click="doUpgrade(b)">升级 Lv.{{ b.level + 1 }}</n-button>
                  <n-text depth="3" style="font-size: 12px">
                    {{ formatStones(b.quote.costStones) }} · {{ b.quote.days }} 天 · 徭役 {{ b.quote.labor }}
                  </n-text>
                </template>
                <n-text v-else depth="3" style="font-size: 12px">已满级</n-text>
              </div>
            </div>

            <n-text depth="3" style="font-size: 12px">
              建设按天分期付款：进度推多少就付多少，总付款恒等于总成本；灵石不够当天就停工，补上后继续。
            </n-text>
          </div>
        </section>

        <!-- ============ 3. 征收 ============ -->
        <section class="zone">
          <div class="zone-head">
            <span class="zone-title">征收</span>
            <n-text v-if="view.taxUnlocked" depth="3" style="font-size: 12px">
              满格入库 {{ view.taxMonthly.toFixed(1) }} 金页子 · 每游戏月至多 1 次
            </n-text>
            <n-text v-else depth="3" style="font-size: 12px">乡侯府 Lv.2 解锁</n-text>
          </div>
          <div class="zone-body">
            <n-progress
              type="line"
              :percentage="Math.round(view.taxProgress)"
              :height="6"
              :show-indicator="false"
            />
            <n-text depth="3" style="font-size: 12px">
              {{
                view.taxUnlocked
                  ? `每天 +1/30，巡视日 ×2；每月最多入库 1 次（提前满不叠下月）。`
                  : `乡侯府还是 Lv.1，征收未开 —— 升级到 Lv.2 后开始积累。这是预期行为。`
              }}
            </n-text>
          </div>
        </section>

        <!-- ============ 4. 新手引导 ============ -->
        <section class="zone">
          <div class="zone-head">
            <span class="zone-title">新手引导</span>
            <n-tag v-if="view.tutorialDone" size="small" type="success">已完成</n-tag>
            <n-text v-else depth="3" style="font-size: 12px">
              第 {{ view.tutorialStep + 1 }} / {{ tutorialSteps.length }} 步
            </n-text>
          </div>
          <div class="zone-body">
            <div v-for="(step, i) in tutorialSteps" :key="step.id" class="tutorial-row">
              <span class="tutorial-mark">{{ tutorialMark(i) }}</span>
              <span>{{ step.name }}</span>
              <n-text depth="3" style="font-size: 12px">{{ step.effectText }}</n-text>
            </div>
            <n-text depth="3" style="font-size: 12px">
              乡侯府开局即有；建完灵田 → 鸦巢舍 → 亭卫，封地自动运转。
              鸦巢舍与亭卫的效果要等情报 / 告急系统上线 —— 现在建它们是为了走完教程与占位。
            </n-text>
          </div>
        </section>

        <!-- ============ 5. 封地流水 ============ -->
        <section class="zone">
          <div class="zone-head">
            <span class="zone-title">封地流水</span>
            <n-text depth="3" style="font-size: 12px">最新在上 · 上限 40 条</n-text>
          </div>
          <div class="zone-body">
            <n-empty v-if="!view.log.length" description="还没有封地记录" size="small" />
            <div v-for="(row, i) in view.log" :key="i" class="log-row" :class="`log-${row.kind}`">
              <span class="log-day">第 {{ row.day + 1 }} 日</span>
              <span>{{ row.text }}</span>
            </div>
          </div>
        </section>

        <!-- ============ 6. 科技树（灰显） ============ -->
        <section class="zone">
          <div class="zone-head">
            <span class="zone-title">科技树（未开放）</span>
            <n-text depth="3" style="font-size: 12px">{{ view.techTree.length }} 种建筑占位</n-text>
          </div>
          <div class="zone-body">
            <div class="tech-grid">
              <div v-for="b in view.techTree" :key="b.id" class="tech-item">
                <strong>{{ b.name }}</strong>
                <n-text depth="3" style="font-size: 12px">{{ b.effectText }}</n-text>
                <n-text depth="3" style="font-size: 12px">{{ b.unlockText }}</n-text>
              </div>
            </div>
          </div>
        </section>
      </div>
    </n-layout-content>
  </n-layout>
</template>

<script setup>
  import { computed } from 'vue'
  import { useMessage } from 'naive-ui'
  import { usePlayerStore } from '../stores/player'
  import { formatSpiritual } from '../plugins/currency.js'
  import { buildingById, productionBarOf, TUTORIAL_IDS } from '../plugins/estate.js'

  const playerStore = usePlayerStore()
  const message = useMessage()

  const view = computed(() => playerStore.estateView)

  /** 产出条：按当日已过时间走；巡视日一天两趟（纯展示，结算在 00:00） */
  const productionBar = computed(() =>
    Math.round(productionBarOf(playerStore.clockGameTime, view.value.patrolled))
  )

  /** 灵田日产（Lv1 × 民心系数 × 巡视次数） */
  const farmDaily = computed(() => {
    const farm = view.value.buildings.find(b => b.id === 'farm')
    return farm?.outputPerDay || 0
  })

  const tutorialSteps = TUTORIAL_IDS.map(id => buildingById(id))
  const tutorialMark = i => {
    if (i < view.value.tutorialStep) return '✅'
    if (i === view.value.tutorialStep) return '🔄'
    return '⬜'
  }

  /** 成本显示：一阶账本整数 → 面额串（100 一阶 = 1 二阶） */
  const formatStones = total => formatSpiritual(total)

  /** 停工原因（只有真的会停时才提示，避免常态刷警告） */
  const stallHint = b => {
    if (view.value.laborStop) return '停工：徭役满足率低于 50%'
    const pay = b?.job ? Math.round(b.job.costStones / Math.max(b.job.days, 1)) : 0
    if (pay > 0 && (playerStore.currency?.spiritual || 0) < pay) {
      return `灵石不足：今天需要 ${pay} 一阶，进度冻结`
    }
    return ''
  }

  const doBuild = b => {
    const result = playerStore.startEstateBuild(b.id)
    if (!result.ok) message.warning(result.message)
    else message.success(`${b.name}动工`)
  }

  const doUpgrade = b => {
    const result = playerStore.startEstateUpgrade(b.id)
    if (!result.ok) message.warning(result.message)
    else message.success(`${b.name}开始升级`)
  }
</script>

<style scoped>
  /* 分区框：照《UI 视觉规范》§2.2。InnerCourt.vue 那份是 scoped，不能跨页复用。 */
  .page-stack {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .zone {
    border: 1px solid color-mix(in srgb, var(--n-text-color) 20%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--n-text-color) 4%, transparent);
    overflow: hidden;
  }
  .zone-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    padding: 10px 14px;
    border-bottom: 1px solid color-mix(in srgb, var(--n-text-color) 14%, transparent);
  }
  .zone-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 600;
  }
  .zone-title::before {
    content: '';
    width: 3px;
    height: 14px;
    border-radius: 2px;
    background: #2080f0;
  }
  .zone-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px;
  }

  /* 概况：数值平权（18px / 700），标签 13px 淡色 */
  .stat-row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 28px;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 96px;
  }
  .stat .k {
    font-size: 13px;
    color: var(--n-text-color-3);
  }
  .stat .v {
    font-size: 18px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .stat .sub {
    font-size: 12px;
    color: var(--n-text-color-3);
  }

  /* 建筑行：左标题 + 进度，右操作 */
  .build-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 14px;
    border-bottom: 1px dashed color-mix(in srgb, var(--n-text-color) 10%, transparent);
  }
  .build-row:last-of-type {
    border-bottom: none;
    padding-bottom: 0;
  }
  .build-main {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1 1 auto;
    min-width: 0;
  }
  .build-title {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .bar-block {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-width: 520px;
  }
  .build-acts {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    flex: 0 0 auto;
    text-align: right;
  }

  /* 教程 */
  .tutorial-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .tutorial-mark {
    width: 18px;
    text-align: center;
  }

  /* 流水 */
  .log-row {
    display: flex;
    gap: 10px;
    font-size: 13px;
    line-height: 1.8;
  }
  .log-day {
    flex: 0 0 auto;
    color: var(--n-text-color-3);
    font-variant-numeric: tabular-nums;
  }
  .log-built {
    font-weight: 600;
  }

  /* 科技树 */
  .tech-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px 20px;
  }
  .tech-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 10px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--n-text-color) 3%, transparent);
    opacity: 0.75;
  }

  @media (max-width: 720px) {
    .build-row {
      flex-direction: column;
      gap: 8px;
    }
    .build-acts {
      align-items: flex-start;
      text-align: left;
    }
    .stat {
      min-width: calc(50% - 14px);
    }
  }
</style>
