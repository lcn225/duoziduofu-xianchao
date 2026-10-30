<template>
  <n-layout>
    <n-layout-content>
      <div class="page-stack">
        <!-- 未解锁：锁态占位（《模块解锁方针》§一，不许隐藏入口） -->
        <section v-if="!unlocked" class="zone">
          <div class="zone-head">
            <span class="zone-title">🔒 飞鹰门 · 内政</span>
          </div>
          <div class="zone-body">
            <div v-for="row in checklist" :key="row.label" class="check-row">
              <span class="check-dot" :class="{ done: row.done }">{{ row.done ? '✓' : '·' }}</span>
              <span>{{ row.label }}</span>
              <span class="hint">当前：{{ row.current }}</span>
            </div>
            <span class="hint">解锁后：贡献点任务 / 秘库兑换。</span>
          </div>
        </section>

        <template v-else>
          <!-- ============ 1. 概况 ============ -->
          <section class="zone">
            <div class="zone-head">
              <span class="zone-title">飞鹰门 · 内政</span>
              <n-tag size="small" :bordered="false">贡献点任务</n-tag>
              <n-tag v-if="!vaultUnlocked" size="small" type="warning" :bordered="false">
                秘库：练气 8 层开放
              </n-tag>
            </div>
            <div class="zone-body">
              <div class="stat-row">
                <div class="stat">
                  <span class="k">贡献点</span>
                  <span class="v">{{ faction.contribution.toLocaleString() }}</span>
                </div>
                <div class="stat">
                  <span class="k">累计获得</span>
                  <span class="v">{{ faction.contributionTotal.toLocaleString() }}</span>
                </div>
                <div class="stat">
                  <span class="k">进行中</span>
                  <span class="v">{{ activeTasks.length }} / {{ maxAccepted }}</span>
                </div>
                <div class="stat">
                  <span class="k">本月产出</span>
                  <span class="v">≈ 690</span>
                  <span class="sub">3 普通/周 × 30 + 3 困难/月 × 100</span>
                </div>
              </div>
            </div>
          </section>

          <!-- ============ 2. 任务货架 ============ -->
          <section class="zone">
            <div class="zone-head">
              <span class="zone-title">任务货架</span>
              <span class="hint">普通任务每 7 游戏天刷新 · 困难任务每 30 游戏天刷新</span>
            </div>
            <div class="zone-body">
              <div v-if="!openTasks.length" class="empty">本周没有可接的任务，等下一次刷新。</div>
              <div v-for="task in openTasks" :key="task.id" class="task-row">
                <div class="task-main">
                  <div class="task-title">
                    <strong>{{ task.name }}</strong>
                    <n-tag
                      size="small"
                      :bordered="false"
                      :type="task.difficulty === 'hard' ? 'warning' : 'default'"
                    >
                      {{ task.difficulty === 'hard' ? '困难' : '普通' }}
                    </n-tag>
                    <n-tag size="small" :bordered="false">{{ kindNameOf(task.kind) }}</n-tag>
                    <span class="reward">+{{ task.reward }} 贡献点</span>
                  </div>
                  <span class="hint">{{ requirementTextOf(task) }}</span>
                </div>
                <div class="task-actions">
                  <n-select
                    v-if="task.kind === 'garrison'"
                    v-model:value="garrisonPick[task.id]"
                    multiple
                    size="small"
                    style="min-width: 200px"
                    :max-tag-count="2"
                    :options="garrisonOptions"
                    placeholder="选择驻扎子嗣"
                  />
                  <n-button
                    size="small"
                    type="primary"
                    :disabled="task.kind !== 'collect' && !canAccept"
                    @click="onAccept(task)"
                  >
                    {{ task.kind === 'collect' ? '交付' : '接取' }}
                  </n-button>
                </div>
              </div>
            </div>
          </section>

          <!-- ============ 3. 进行中 ============ -->
          <section class="zone">
            <div class="zone-head">
              <span class="zone-title">进行中</span>
              <span class="hint">同时最多 {{ maxAccepted }} 个 · 放弃无惩罚</span>
            </div>
            <div class="zone-body">
              <div v-if="!activeTasks.length" class="empty">没有进行中的任务。</div>
              <div v-for="task in activeTasks" :key="task.id" class="task-row">
                <div class="task-main">
                  <div class="task-title">
                    <strong>{{ task.name }}</strong>
                    <n-tag size="small" :bordered="false">{{ kindNameOf(task.kind) }}</n-tag>
                    <span class="reward">+{{ task.reward }} 贡献点</span>
                  </div>
                  <span class="hint">
                    剩余 {{ countdownOf(task) }}
                    <template v-if="task.assignees && task.assignees.length">
                      · 驻扎：{{ assigneeNamesOf(task) }}
                    </template>
                  </span>
                </div>
                <div class="task-actions">
                  <n-button size="small" quaternary @click="onAbandon(task)">放弃</n-button>
                </div>
              </div>
            </div>
          </section>

          <!-- ============ 4. 秘库 ============ -->
          <section class="zone">
            <div class="zone-head">
              <span class="zone-title">秘库</span>
              <template v-if="vaultUnlocked">
                <span class="hint">
                  每月自动换货 · 下次手动刷新 {{ vaultRefreshCost }} 点
                  <template v-if="!canBuyMaterial"> · 本月底材已购</template>
                </span>
                <n-button size="small" @click="onManualRefresh">手动刷新</n-button>
              </template>
              <n-tag v-else size="small" type="warning" :bordered="false">
                🔒 练气 8 层开放
              </n-tag>
            </div>
            <div v-if="vaultUnlocked" class="zone-body">
              <div class="vault-head">功法栏 · 心法整本</div>
              <div v-if="!vaultArts.length" class="empty">这一批没有可换的功法（都学过了）。</div>
              <div v-for="entry in vaultArts" :key="entry.id" class="task-row">
                <div class="task-main">
                  <div class="task-title">
                    <strong>《{{ entry.art?.name || entry.artId }}》</strong>
                    <n-tag size="small" :bordered="false">{{ gradeNameOf(entry.art?.grade) }}</n-tag>
                    <span class="reward">{{ entry.price }} 贡献点</span>
                  </div>
                  <span class="hint">{{ entry.art?.description }}</span>
                </div>
                <div class="task-actions">
                  <n-button
                    size="small"
                    type="primary"
                    :disabled="entry.sold || entry.learned"
                    @click="onBuyArt(entry)"
                  >
                    {{ entry.sold ? '已换走' : entry.learned ? '已学会' : '换取' }}
                  </n-button>
                </div>
              </div>

              <div class="vault-head">同参底材栏 · 限购 1 件/月</div>
              <div v-for="entry in vaultMaterials" :key="entry.id" class="task-row">
                <div class="task-main">
                  <div class="task-title">
                    <strong>{{ entry.item?.name || entry.baseId }}</strong>
                    <n-tag size="small" :bordered="false">{{ entry.item?.tier }} 阶</n-tag>
                    <n-tag size="small" :bordered="false">{{ entry.item?.category }}</n-tag>
                    <span class="reward">{{ entry.price }} 贡献点</span>
                  </div>
                  <span class="hint">
                    本命契合 {{ Math.round((entry.fit || 0) * 100) }}%
                  </span>
                </div>
                <div class="task-actions">
                  <n-button
                    size="small"
                    type="primary"
                    :disabled="entry.sold || !canBuyMaterial"
                    @click="onBuyMaterial(entry)"
                  >
                    {{ entry.sold ? '已换走' : canBuyMaterial ? '换取' : '本月已购' }}
                  </n-button>
                </div>
              </div>
            </div>
            <div v-else class="zone-body">
              <span class="hint">突破练气八层后开放。届时每月自动换一批心法整本与高契合底材。</span>
            </div>
            <div v-if="vaultUnlocked" class="zone-body broker-block">
              <div class="vault-head">老九订货 · 400 贡献点 / 一单</div>
              <template v-if="!broker">
                <span class="hint">
                  下单后老九亮出几个标签，你选一个，一个「飞鹰门月」后带货回来（1~2 件）。
                </span>
                <div class="task-actions">
                  <n-button size="small" @click="onOrderBroker">向老九下单</n-button>
                </div>
              </template>
              <template v-else-if="!broker.chosenTag">
                <span class="hint">选一个标签锁定，老九按它带货：</span>
                <div class="task-actions">
                  <n-button
                    v-for="tag in broker.tags"
                    :key="tag"
                    size="small"
                    @click="onChooseTag(tag)"
                  >
                    {{ tag }}
                  </n-button>
                </div>
              </template>
              <template v-else>
                <span class="hint">
                  已锁定「{{ broker.chosenTag }}」· 老九还在路上（{{ brokerCountdown }}）
                </span>
              </template>
            </div>
          </section>

          <!-- ============ 5. 流水 ============ -->
          <section v-if="faction.log.length" class="zone">
            <div class="zone-head">
              <span class="zone-title">飞鹰门流水</span>
            </div>
            <div class="zone-body">
              <div v-for="(row, index) in faction.log" :key="index" class="log-row">
                <span class="log-time">{{ formatGameDate(row.at) }}</span>
                <span>{{ row.text }}</span>
              </div>
            </div>
          </section>
        </template>
      </div>
    </n-layout-content>
  </n-layout>
</template>

<script setup>
  import { computed, reactive } from 'vue'
  import { useMessage } from 'naive-ui'
  import { usePlayerStore } from '../stores/player'
  import { FACTION_TUNING, taskRemainingSecondsOf } from '../plugins/faction'
  import { formatDuration, formatGameDate } from '../plugins/dayDate'

  const playerStore = usePlayerStore()
  const message = useMessage()

  const faction = computed(() => playerStore.faction)
  const unlocked = computed(() => playerStore.factionUnlocked)
  const vaultUnlocked = computed(() => playerStore.vaultUnlocked)
  const checklist = computed(() => playerStore.factionChecklist)
  const openTasks = computed(() => playerStore.factionOpenTasks)
  const activeTasks = computed(() => playerStore.factionActiveTasks)
  const canAccept = computed(() => playerStore.factionCanAccept)
  const maxAccepted = FACTION_TUNING.maxAccepted

  const vaultArts = computed(() => playerStore.vaultArtsView)
  const vaultMaterials = computed(() => playerStore.vaultMaterialsView)
  const canBuyMaterial = computed(() => playerStore.vaultCanBuyMaterial)
  const vaultRefreshCost = computed(() => playerStore.vaultManualRefreshCost)

  const gradeNameOf = grade =>
    grade === 'foundation' ? '筑基级' : grade === 'core' ? '金丹级' : '练气篇'

  const onManualRefresh = () => {
    const result = playerStore.manualRefreshVault()
    if (!result.ok) {
      message.warning(result.message || '无法刷新')
      return
    }
    message.success(`货架已刷新，-${result.cost} 贡献点`)
  }

  const onBuyArt = entry => {
    const result = playerStore.buyVaultArt(entry.id)
    if (!result.ok) {
      message.warning(result.message || '无法换取')
      return
    }
    message.success(`已换得《${result.name}》`)
  }

  const broker = computed(() => playerStore.faction?.vault?.broker || null)
  const brokerCountdown = computed(() => {
    if (!broker.value) return ''
    const left = Math.max((Number(broker.value.readyAt) || 0) - playerStore.factionRealSeconds, 0)
    return left > 0 ? formatDuration(left) : '即将到货'
  })

  const onOrderBroker = () => {
    const result = playerStore.orderBroker()
    if (!result.ok) {
      message.warning(result.message || '无法下单')
      return
    }
    message.success('已下单，选一个标签锁定')
  }

  const onChooseTag = tag => {
    const result = playerStore.chooseBrokerTag(tag)
    if (!result.ok) message.warning(result.message || '无法锁定')
  }

  const onBuyMaterial = entry => {
    const result = playerStore.buyVaultMaterial(entry.id)
    if (!result.ok) {
      message.warning(result.message || '无法换取')
      return
    }
    message.success(`已换得「${result.name}」，已放进背包`)
  }

  /** 驻扎人选（每个任务单独记一份选择） */
  const garrisonPick = reactive({})
  const garrisonOptions = computed(() =>
    playerStore.factionGarrisonCandidates.map(child => ({
      label: `${child.name} · 练气${child.realmLevel}层`,
      value: child.id
    }))
  )

  const kindNameOf = kind =>
    kind === 'collect' ? '交物品' : kind === 'combat' ? '杀怪' : '驻扎'

  const requirementTextOf = task => {
    const req = task.requirements || {}
    if (task.kind === 'collect') {
      return `交付 ${req.category} · ${req.tierMin}~${req.tierMax} 阶 · ${req.count} 件（当场结算）`
    }
    if (task.kind === 'garrison') {
      return `派 ${req.count} 名练气${req.minRealmLevel}层以上子嗣 · ${task.days} 游戏天`
    }
    return `桂冈 + 3 名子嗣 + 出战灵宠出行 · 5 层微型副本 · ${task.days} 游戏天`
  }

  // 飞鹰门的时间轴是**现实秒**（96 秒 = 一游戏天），所以倒计时直接按时分秒显示，
  // 不用 `formatCountdown`（那个是给游戏内 15 分档倒计时用的）
  const countdownOf = task => {
    const left = taskRemainingSecondsOf(task, playerStore.factionRealSeconds)
    return left > 0 ? formatDuration(left) : '即将结算'
  }

  const assigneeNamesOf = task => {
    const list = playerStore.offspring?.list || []
    return (task.assignees || [])
      .map(id => list.find(c => c.id === id)?.name)
      .filter(Boolean)
      .join('、')
  }

  const onAccept = task => {
    const assignees = task.kind === 'garrison' ? [...(garrisonPick[task.id] || [])] : []
    const result = playerStore.acceptFactionTask(task.id, { assignees })
    if (!result.ok) {
      message.warning(result.message || '无法接取')
      return
    }
    if (task.kind === 'garrison') delete garrisonPick[task.id]
    message.success(result.completed ? `交付完成，+${result.reward} 贡献点` : '已接取')
  }

  const onAbandon = task => {
    const result = playerStore.abandonFactionTask(task.id)
    if (!result.ok) message.warning(result.message || '无法放弃')
  }
</script>

<style scoped>
  /* 页面骨架原子（与 Estate / InnerCourt 同款；这三页重复，将来一并收进 ui.css） */
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
    overflow: hidden;
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
  .hint {
    font-size: 13px;
    line-height: 1.6;
    color: var(--ui-ink-sub);
  }
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

  .check-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
  }
  .check-dot {
    width: 16px;
    text-align: center;
    color: var(--ui-ink-sub);
  }
  .check-dot.done {
    color: var(--ui-jade);
  }
  .task-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 14px;
    border-bottom: 1px dashed var(--ui-line);
  }
  .task-row:last-of-type {
    border-bottom: none;
    padding-bottom: 0;
  }
  .task-main {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1 1 auto;
    min-width: 0;
  }
  .task-title {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .task-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
  }
  .reward {
    color: var(--ui-gold);
    font-weight: 600;
  }
  .empty {
    padding: 4px 0;
    font-size: 13px;
    color: var(--ui-ink-sub);
  }
  .broker-block {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px dashed var(--ui-line);
  }
  .vault-head {
    margin-top: 6px;
    font-size: 14px;
    font-weight: 700;
    color: var(--ui-ink);
  }
  .log-row {
    display: flex;
    gap: 12px;
    padding: 3px 0;
    font-size: 13px;
  }
  .log-time {
    color: var(--ui-ink-fade);
    flex: none;
  }
</style>
