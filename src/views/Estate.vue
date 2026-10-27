<template>
  <n-layout>
    <n-layout-content>
      <div class="page-stack">
        <!-- ============ 1. 封地概况 ============ -->
        <section class="zone">
          <div class="zone-head">
            <span class="zone-title">{{ view.name }} · 乡侯府 Lv.{{ view.manorLevel }}</span>
            <n-tag v-if="view.tutorialDone" size="small" type="success" :bordered="false">
              新手引导已完成
            </n-tag>
            <n-tag v-if="view.patrolled" size="small" type="success">
              今日巡视 {{ view.patrolHours }} 小时 · 三进度 +{{ view.patrolBonusPct }}%
            </n-tag>
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
            <span class="hint">
              民心基准 {{ view.moraleBaseline }}（50 + 5 × 乡侯府等级），每天按 2 × 乡侯府等级靠拢。
              民心系数同时乘税收、产出与徭役效率。
            </span>
          </div>
        </section>

        <!-- ============ 2. 建筑与进度 ============ -->
        <section class="zone">
          <div class="zone-head">
            <span class="zone-title">建筑与进度</span>
            <span class="hint">
              徭役满足率 {{ Math.round(view.satisfaction * 100) }}%
              <template v-if="view.laborStop">（低于 50%，全部停工）</template>
            </span>
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
                <span class="hint">{{ b.effectText }}</span>

                <!-- 建设条 -->
                <div v-if="b.job" class="bar-block">
                  <n-progress
                    type="line"
                    :percentage="Math.round(b.job.progress)"
                    :height="6"
                    :show-indicator="false"
                    color="var(--ui-jade)"
                    rail-color="var(--ui-track)"
                  />
                  <span class="hint">
                    建设中 → Lv.{{ b.job.targetLevel }} · {{ Math.round(b.job.progress) }}% ·
                    应付 {{ formatStones(b.job.costStones) }} · 工期 {{ b.job.days }} 天
                  </span>
                  <span v-if="stallHint(b)" class="hint warn">
                    {{ stallHint(b) }}
                  </span>
                </div>

                <!-- 产出条（灵田） -->
                <div v-else-if="b.outputPerDay > 0" class="bar-block">
                  <n-progress
                    type="line"
                    :percentage="productionBar"
                    :height="6"
                    :show-indicator="false"
                    color="var(--ui-jade)"
                    rail-color="var(--ui-track)"
                  />
                  <span class="hint">
                    今日产出 {{ b.outputPerDay }} / 天（按当天巡视时长加算）
                  </span>
                </div>
              </div>

              <div class="build-acts">
                <template v-if="b.job">
                  <span class="hint">施工中…</span>
                </template>
                <template v-else-if="!b.level">
                  <n-button size="small" type="primary" @click="doBuild(b)">建造</n-button>
                  <span class="hint">
                    首建免费 · 工期 {{ b.quote?.days }} 天 · 徭役 {{ b.quote?.labor }}
                  </span>
                </template>
                <template v-else-if="b.quote">
                  <!-- 开工不预付，但要付得起「首日工钱」，否则一开工就停工（看得懂比能点更重要） -->
                  <n-button size="small" :disabled="!canAffordUpgrade(b)" @click="doUpgrade(b)">
                    升级 Lv.{{ b.level + 1 }}
                  </n-button>
                  <span class="hint">
                    {{ formatStones(b.quote.costStones) }} · {{ b.quote.days }} 天 · 徭役 {{ b.quote.labor }}
                  </span>
                  <span v-if="!canAffordUpgrade(b)" class="hint warn">
                    灵石不足：开工后每天约需 {{ dailyPayOf(b.quote) }} 一阶
                  </span>
                </template>
                <span v-else class="hint">已满级</span>
              </div>
            </div>

            <span class="hint">
              建设按天分期付款：进度推多少就付多少，总付款恒等于总成本；灵石不够当天就停工，补上后继续。
            </span>
          </div>
        </section>

        <!-- ============ 3. 征收 ============ -->
        <section class="zone">
          <div class="zone-head">
            <span class="zone-title">征收</span>
            <span v-if="view.taxUnlocked" class="hint">
              满格入库 {{ view.taxMonthly.toFixed(1) }} 金页子 · 每游戏月至多 1 次
            </span>
            <span v-else class="hint">乡侯府 Lv.2 解锁</span>
          </div>
          <div class="zone-body">
            <template v-if="view.taxUnlocked">
              <n-progress
                type="line"
                :percentage="Math.round(view.taxProgress)"
                :height="6"
                :show-indicator="false"
                color="var(--ui-jade)"
                rail-color="var(--ui-track)"
              />
              <span class="hint">
                每天 +1/30，按当天巡视时长加算（S 小时 ⇒ (24+S)/24）；每月最多入库 1 次（提前满不叠下月）。
                <strong>进度每天 00:00 结算一次</strong>（现实约 96 秒），不是实时条。
              </span>
            </template>
            <template v-else>
              <!-- Lv.1 不画一条永远 0% 的绿条：那看起来像卡住了。这里直接说清未解锁与怎么开。 -->
              <n-alert type="warning" :show-icon="true">
                征收未开：乡侯府还是 Lv.{{ view.manorLevel }}。升到 Lv.2 后进度条才会开始走
                （每天 +1/30，按当天巡视时长加算）。现在显示 0 是预期行为，不是卡住。
              </n-alert>
              <div class="tutorial-actions">
                <n-button
                  v-if="manorBuilding?.quote && !manorBuilding?.job"
                  size="small"
                  type="primary"
                  @click="doUpgrade(manorBuilding)"
                >
                  升级乡侯府到 Lv.2（{{ formatStones(manorBuilding.quote.costStones) }} · {{ manorBuilding.quote.days }} 天）
                </n-button>
                <span v-else-if="manorBuilding?.job" class="hint">
                  乡侯府升级中 → Lv.{{ manorBuilding.job.targetLevel }} · {{ Math.round(manorBuilding.job.progress) }}%
                </span>
                <span v-else class="hint">乡侯府已满级</span>
              </div>
            </template>
          </div>
        </section>

        <!-- ============ 4. 新手引导 ============
             2026-10-27：三步建完就**自动收起**（不再留一张永远挂着的清单）；
             收起后如果还有「下一目标」（征收要乡侯府 Lv.2）就换成一条新引导，
             目标达成后整块消失。 -->
        <section v-if="!view.tutorialDone || nextObjective" class="zone">
          <div class="zone-head">
            <span class="zone-title">新手引导</span>
            <n-tag v-if="view.tutorialDone" size="small" type="success">建造三步已完成</n-tag>
            <span v-else class="hint">
              第 {{ view.tutorialStep + 1 }} / {{ tutorialSteps.length }} 步
            </span>
          </div>
          <div class="zone-body">
            <template v-if="!view.tutorialDone">
              <n-alert type="info" :show-icon="false">
                下一步：建造 <strong>{{ tutorialCurrent?.name }}</strong>
                <template v-if="tutorialCurrent"> —— {{ tutorialCurrent.effectText }}</template>
                。建完这一步会自动跳到下一步，三步建完本引导自动收起。
              </n-alert>
              <div v-for="(step, i) in tutorialSteps" :key="step.id" class="tutorial-row">
                <span class="tutorial-mark">{{ tutorialMark(i) }}</span>
                <span>{{ step.name }}</span>
                <span class="hint">{{ step.effectText }}</span>
              </div>
            </template>
            <template v-else>
              <n-alert type="success" :show-icon="false">
                建造三步已完成。下一目标：<strong>{{ nextObjective.title }}</strong> ——
                {{ nextObjective.desc }}
              </n-alert>
              <div class="tutorial-actions">
                <n-button
                  v-if="manorBuilding?.quote && !manorBuilding?.job"
                  size="small"
                  type="primary"
                  @click="doUpgrade(manorBuilding)"
                >
                  升级乡侯府（{{ formatStones(manorBuilding.quote.costStones) }} · {{ manorBuilding.quote.days }} 天）
                </n-button>
                <span v-else-if="manorBuilding?.job" class="hint">
                  乡侯府升级中 → Lv.{{ manorBuilding.job.targetLevel }} · {{ Math.round(manorBuilding.job.progress) }}%
                </span>
                <span v-else class="hint">乡侯府已满级</span>
              </div>
            </template>
            <span class="hint">
              乡侯府开局即有；建完灵田 → 鸦巢舍 → 亭卫，封地自动运转。
              鸦巢舍与亭卫的效果要等情报 / 告急系统上线 —— 现在建它们是为了走完教程与占位。
            </span>
          </div>
        </section>

        <!-- ============ 5. 封地流水 ============ -->
        <section class="zone">
          <div class="zone-head">
            <span class="zone-title">封地流水</span>
            <span class="hint">最新在上 · 上限 40 条</span>
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
            <span class="hint">{{ view.techTree.length }} 种建筑占位</span>
          </div>
          <div class="zone-body">
            <div class="tech-grid">
              <div v-for="b in view.techTree" :key="b.id" class="tech-item">
                <strong>{{ b.name }}</strong>
                <span class="hint">{{ b.effectText }}</span>
                <span class="hint">{{ b.unlockText }}</span>
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

  /** 产出条：按当日已过时间走，巡视那几小时多算（纯展示，结算在 00:00） */
  const productionBar = computed(() =>
    Math.round(
      productionBarOf(playerStore.clockGameTime, {
        patrolStartSeconds: view.value.patrolStartSeconds,
        patrolEndSeconds: view.value.patrolEndSeconds
      })
    )
  )

  /** 灵田日产（Lv1 × 民心系数 × (24+S)/24） */
  const farmDaily = computed(() => {
    const farm = view.value.buildings.find(b => b.id === 'farm')
    return farm?.outputPerDay || 0
  })

  const tutorialSteps = TUTORIAL_IDS.map(id => buildingById(id))
  const tutorialCurrent = computed(() => tutorialSteps[view.value.tutorialStep] || null)
  const tutorialMark = i => {
    if (i < view.value.tutorialStep) return '✅'
    if (i === view.value.tutorialStep) return '🔄'
    return '⬜'
  }

  const manorBuilding = computed(
    () => view.value.buildings.find(building => building.id === 'manor') || null
  )

  /**
   * 建造三步完成后**接上下一条引导**（2026-10-27）。
   *
   * 只接一条硬门槛：征收要乡侯府 Lv.2。这是玩家最容易卡住的地方 ——
   * 不升乡侯府，征收条永远是 0，看起来像坏了。目标达成后 `nextObjective` 变 null，
   * 整块引导自动消失（不再留一张读完的清单）。
   */
  const nextObjective = computed(() => {
    if (!view.value.tutorialDone) return null
    if (view.value.manorLevel < 2) {
      return {
        title: '乡侯府升到 Lv.2',
        desc: '解锁征收：每天 +1/30，满格入库一次；民心基准也会 +5。'
      }
    }
    return null
  })

  /** 成本显示：一阶账本整数 → 面额串（100 一阶 = 1 二阶） */
  const formatStones = total => formatSpiritual(total)

  /** 首日工钱（付款按天分期，至少付得起一天才有意义） */
  const dailyPayOf = quote =>
    quote?.costStones ? Math.ceil(quote.costStones / Math.max(quote.days, 1)) : 0
  const canAffordUpgrade = b =>
    (Number(playerStore.currency?.spiritual) || 0) >= dailyPayOf(b?.quote)

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
  /* 分区框：照《UI 视觉规范》§2.2（唯一实现，直接复制）。InnerCourt.vue 那份是 scoped，不能跨页复用。
     2026-10-27 B3.5：从 --n-text-color 的 color-mix 换成 --ui-* token —— 本页是第一块吃 V1.2 的页面。 */
  .page-stack {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .zone {
    background: var(--ui-surface);
    border: 1px solid var(--ui-line);
    border-radius: var(--ui-radius);
    padding: 28px;
    box-shadow: var(--ui-shadow);
    overflow: hidden; /* 子块底色 / 表格横向滚动别溢出圆角 */
  }
  .zone-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 22px;
  }
  .zone-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: var(--ui-font-title);
    font-weight: 700;
    letter-spacing: 1px;
    color: var(--ui-ink);
  }
  .zone-title::before {
    /* V1.2 视觉锚点：暗金菱形，替代已废弃的蓝色竖条 */
    content: '';
    width: 5px;
    height: 5px;
    background: var(--ui-gold);
    transform: rotate(45deg);
  }
  .zone-body {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  /* 正文里的小字：辅助字号 ≥13px（规范 §六 验收线，原来一律 12px） */
  .hint {
    font-size: 13px;
    line-height: 1.6;
    color: var(--ui-ink-sub);
  }
  .hint.warn {
    color: var(--ui-cinnabar);
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
    color: var(--ui-ink-sub);
  }
  .stat .v {
    font-size: 18px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--ui-ink);
  }
  .stat .sub {
    font-size: 13px;
    color: var(--ui-ink-sub);
  }

  /* 建筑行：左标题 + 进度，右操作。行与行靠间距 + 极淡虚线分隔，不实线框死 */
  .build-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 14px;
    border-bottom: 1px dashed var(--ui-line);
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
    color: var(--ui-ink);
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
    color: var(--ui-ink);
  }
  .tutorial-mark {
    width: 18px;
    text-align: center;
  }
  .tutorial-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  /* 流水：字号 14 / 行高 32（§1.6）；时间戳极淡，事件名青玉 */
  .log-row {
    display: flex;
    gap: 10px;
    font-size: 14px;
    line-height: 32px;
    color: var(--ui-ink);
  }
  .log-day {
    flex: 0 0 auto;
    color: var(--ui-ink-fade);
    font-variant-numeric: tabular-nums;
  }
  .log-built {
    color: var(--ui-jade);
    font-weight: 700;
  }

  /* 科技树（灰显占位） */
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
    background: color-mix(in srgb, var(--ui-ink) 4%, transparent);
    color: var(--ui-ink);
    opacity: 0.75;
  }

  @media (max-width: 720px) {
    .zone {
      padding: 18px;
    }
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
