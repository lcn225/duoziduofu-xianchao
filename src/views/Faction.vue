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
            <span class="hint">解锁后：贡献点任务 / 飞鹰阁兑换。</span>
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
                  <span class="k">职位</span>
                  <span class="v">{{ salaryRank.name }} · {{ salaryMonthlyStone2 }} 二阶/月</span>
                  <span class="sub">
                    {{ salaryNextRankGap > 0 ? `距下一级还差 ${salaryNextRankGap} 累计` : '已到顶' }}
                  </span>
                </div>
                <div class="stat">
                  <span class="k">可提现</span>
                  <span class="v">{{ salaryWithdrawable }} 二阶</span>
                  <span class="sub">
                    俸禄的 10%，累积后可随时提现
                    <n-button
                      v-if="salaryWithdrawable > 0"
                      size="tiny"
                      type="primary"
                      text
                      @click="onWithdraw"
                    >
                      提现
                    </n-button>
                  </span>
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
              <span class="hint">
                普通任务 {{ weekRefreshIn }} 后刷新 · 困难任务 {{ monthRefreshIn }} 后刷新
              </span>
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
                    class="garrison-select"
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

          <!-- ============ 4. 剧情任务线（灵地解锁，P56-b）============ -->
          <section class="zone">
            <div class="zone-head">
              <span class="zone-title">门派剧情 · 灵地</span>
              <span class="hint">四步走完，九处灵地全部收回 · 贡献点一次性扣除</span>
            </div>
            <div class="zone-body">
              <div v-for="q in storyQuests" :key="q.id" class="task-row">
                <div class="task-main">
                  <div class="task-title">
                    <strong>{{ q.step }}. {{ q.name }}</strong>
                    <n-tag size="small" :bordered="false" :type="q.done ? 'success' : 'default'">
                      {{ q.done ? '已完成' : `需 ${realmNameOf(q.minInnerLevel)}` }}
                    </n-tag>
                    <span class="reward">-{{ q.cost }} 贡献点</span>
                  </div>
                  <span class="hint">{{ q.desc }}</span>
                  <span class="hint">解锁：{{ landNamesOf(q.lands) }}</span>
                </div>
                <div class="task-actions">
                  <span v-if="!q.done && !q.hasLevel" class="hint">
                    还差 {{ q.levelGap }} 层
                  </span>
                  <span v-else-if="!q.done && !q.hasContribution" class="hint">
                    还差 {{ q.pointGap }} 点
                  </span>
                  <n-button
                    size="small"
                    type="primary"
                    :disabled="!q.canComplete"
                    @click="onStory(q)"
                  >
                    {{ q.done ? '已了结' : '了结' }}
                  </n-button>
                </div>
              </div>
            </div>
          </section>

          <!-- ============ 5. 飞鹰阁（2026-11-06 B8-b：秘库 + 大库合并）============ -->
          <section class="zone">
            <div class="zone-head">
              <span class="zone-title">飞鹰阁</span>
              <template v-if="vaultUnlocked">
                <span class="hint">
                  每月自动换货（{{ monthRefreshIn }} 后）· 下次手动刷新 {{ vaultRefreshCost }} 点
                </span>
                <n-button size="small" @click="onManualRefresh">手动刷新</n-button>
              </template>
              <n-tag v-else size="small" type="warning" :bordered="false">
                🔒 练气 8 层开放
              </n-tag>
            </div>
            <div v-if="vaultUnlocked" class="zone-body">
              <div class="vault-head">功法栏 · 3 个库位（心法整本）</div>
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
                    {{ entry.sold ? '已换走' : entry.learned ? '已学会' : '贡献点换取' }}
                  </n-button>
                </div>
              </div>

              <div class="vault-head">物资栏 · 6 个库位（灵器 / 灵兽 / 灵材 / 灵植）</div>
              <div v-if="!vaultGoods.length" class="empty">这一批的货都被换走了，等下次刷新。</div>
              <div v-for="entry in vaultGoods" :key="entry.id" class="task-row">
                <div class="task-main">
                  <div class="task-title">
                    <strong>{{ entry.item?.name || entry.baseId }}</strong>
                    <n-tag size="small" :bordered="false">{{ entry.category }}</n-tag>
                    <n-tag size="small" :bordered="false">{{ entry.tier }} 阶</n-tag>
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
                    :disabled="entry.sold"
                    @click="onBuyGoods(entry)"
                  >
                    {{ entry.sold ? '已换走' : '贡献点换取' }}
                  </n-button>
                </div>
              </div>
            </div>
            <div v-else class="zone-body">
              <span class="hint">突破练气八层后开放。每月 9 个库位全部重随。</span>
            </div>
            <!-- 老九带货 · 待领取（2026-11-10）：到货不进背包，先摆在这里；**本区不受月刷影响** -->
            <div v-if="vaultUnlocked && brokerDelivery" class="zone-body broker-block">
              <div class="vault-head">老九带货 · 已到货，等你收取</div>
              <div class="task-row">
                <div class="task-main">
                  <div class="task-title">
                    <strong>{{ brokerDelivery.displayName }}</strong>
                    <n-tag v-if="brokerDelivery.category" size="small" :bordered="false">
                      {{ brokerDelivery.category }}
                    </n-tag>
                    <n-tag size="small" :bordered="false">{{ brokerDelivery.tier }} 阶</n-tag>
                    <span class="reward">{{ brokerDelivery.price }} 贡献点</span>
                  </div>
                  <span class="hint">
                    {{ brokerDelivery.gap > 0
                      ? `到货已补 ${brokerDelivery.gap} 点`
                      : brokerDelivery.gap < 0
                        ? `到货已退 ${-brokerDelivery.gap} 点`
                        : '按预扣结清' }}
                    · 本区不受每月刷新影响
                  </span>
                </div>
                <div class="task-actions">
                  <n-button size="small" type="primary" @click="onClaimDelivery">收货</n-button>
                </div>
              </div>
            </div>
            <div v-if="vaultUnlocked" class="zone-body broker-block">
              <div class="vault-head">老九订货 · 预扣 500 贡献点 / 一单</div>
              <template v-if="!broker">
                <span class="hint">
                  下单后老九亮出几个标签，你选一个；一个「飞鹰门月」后带回 1 件，
                  按货架价 ×2 多退少补。
                </span>
                <div class="task-actions">
                  <n-button size="small" :disabled="!!brokerDelivery" @click="onOrderBroker">
                    向老九下单
                  </n-button>
                </div>
                <span v-if="brokerDelivery" class="hint">先把上面那件货收了，才能下新单。</span>
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
                <span v-if="broker.gap > 0" class="hint">
                  到货需补 {{ broker.gap }} 贡献点（当前持有
                  {{ (faction.contribution || 0).toLocaleString() }}）
                </span>
                <span v-else-if="broker.gap < 0" class="hint">
                  到货退还 {{ -broker.gap }} 贡献点
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
  import { computed, onUnmounted, reactive, ref } from 'vue'
  import { useMessage } from 'naive-ui'
  import { usePlayerStore } from '../stores/player'
  import { FACTION_TUNING, refreshRemainingOf, taskRemainingSecondsOf } from '../plugins/faction'
  import { SPIRIT_LAND_MAP } from '../plugins/cultivationData'
  import { getRealmName } from '../plugins/realm'
  import { formatGameDate, formatRealCountdown } from '../plugins/dayDate'
  import { formatSpiritual } from '../plugins/currency'

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

  /** 职位 / 俸禄（B8-b）：累计贡献点升职；10% 累积为可提现额度 */
  const salaryRank = computed(() => playerStore.salaryRank)
  const salaryMonthlyStone2 = computed(() => playerStore.salaryMonthlyStone2)
  const salaryNextRankGap = computed(() => playerStore.salaryNextRankGap)
  const salaryWithdrawable = computed(() => playerStore.salaryWithdrawable)

  const onWithdraw = () => {
    const result = playerStore.withdrawSalary()
    if (!result.ok) {
      message.warning(result.message || '无法提现')
      return
    }
    message.success(`已提现 ${result.stone2} 二阶灵石（${formatSpiritual(result.stone1)}）`)
  }

  /**
   * 飞鹰门按**现实时间**刷新，倒计时必须每秒走一格 ——
   * 存档里的 `realSeconds` 只在日结钩子推进（练气 96 秒 / 筑基 4 秒一次），
   * 所以这里挂一个 1 秒的心跳，读 `factionLiveRealSeconds`（它会把墙钟零头补上）。
   */
  const nowTick = ref(Date.now())
  const ticker = setInterval(() => {
    nowTick.value = Date.now()
  }, 1000)
  onUnmounted(() => clearInterval(ticker))

  const liveSeconds = computed(() => {
    void nowTick.value
    return playerStore.factionLiveRealSeconds
  })
  // 现实秒 → `分:秒`，必须走 formatRealCountdown（分钟档的 formatDuration 一分钟才动一格）
  const weekRefreshIn = computed(() =>
    formatRealCountdown(refreshRemainingOf('normal', liveSeconds.value))
  )
  const monthRefreshIn = computed(() =>
    formatRealCountdown(refreshRemainingOf('hard', liveSeconds.value))
  )

  /** 剧情任务线（P56-b）—— 灵地的唯一获取途径 */
  const storyQuests = computed(() => playerStore.storyQuestView)
  const realmNameOf = level => getRealmName(level).name
  const landNamesOf = ids => ids.map(id => SPIRIT_LAND_MAP[id]?.name || id).join(' / ')

  const onStory = q => {
    const result = playerStore.completeStoryQuest(q.id)
    if (!result.ok) {
      message.warning(result.message || '无法了结')
      return
    }
    message.success(
      result.done ? '这一步已经了结了' : `了结「${q.name}」，解锁 ${result.lands.length} 处灵地`
    )
  }

  const vaultArts = computed(() => playerStore.vaultArtsView)
  const vaultGoods = computed(() => playerStore.vaultGoodsView)
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
  // 老九已到货、待收取（2026-11-10）：到货不进背包，先摆在这里让玩家看得见
  const brokerDelivery = computed(() => playerStore.brokerDeliveryView)

  const onClaimDelivery = () => {
    const result = playerStore.claimBrokerDelivery()
    if (!result.ok) {
      message.warning(result.message || '无法收货')
      return
    }
    message.success(`已收入背包：「${result.name}」`)
  }
  const brokerCountdown = computed(() => {
    if (!broker.value) return ''
    const left = Math.max((Number(broker.value.readyAt) || 0) - liveSeconds.value, 0)
    return left > 0 ? formatRealCountdown(left) : '即将到货'
  })

  const onOrderBroker = () => {
    const result = playerStore.orderBroker()
    if (!result.ok) {
      message.warning(result.message || '无法下单')
      return
    }
    message.success('已下单（预扣 500 点），选一个标签锁定')
  }

  const onChooseTag = tag => {
    const result = playerStore.chooseBrokerTag(tag)
    if (!result.ok) {
      message.warning(result.message || '无法锁定')
      return
    }
    const tail =
      result.gap > 0 ? `，到货需补 ${result.gap} 点` : result.gap < 0 ? `，到货退 ${-result.gap} 点` : ''
    message.success(`已请老九留「${result.name}」${tail}`)
  }

  const onBuyGoods = entry => {
    const result = playerStore.buyVaultGoods(entry.id)
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
      // 境界名走 getRealmName：11 层起是筑基，别再硬拼「练气N层」
      label: `${child.name} · ${realmNameOf(child.realmLevel)}`,
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
      return `派 ${req.count} 名${realmNameOf(req.minRealmLevel)}以上子嗣 · ${task.days} 游戏天`
    }
    return `桂冈 + 3 名子嗣 + 出战灵宠出行 · 5 层微型副本 · ${task.days} 游戏天`
  }

  // 飞鹰门的时间轴是**现实秒**（96 秒 = 一游戏天），所以倒计时走 `formatRealCountdown`
  // （分:秒，每秒动一格）；`formatCountdown` 是游戏内 15 分档、`formatDuration` 是分钟档，
  // 拿后两者显示现实秒会「一分钟才动一次」。
  const countdownOf = task => {
    const left = taskRemainingSecondsOf(task, liveSeconds.value)
    return left > 0 ? formatRealCountdown(left) : '即将结算'
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
  /* 驻扎任务的子嗣选择器：桌面定宽，窄屏跟行动区一起换行铺满（见下方 @media）。
     ⚠ 别改回内联 style —— 内联样式赢不过媒体查询，窄屏就没法收窄了。 */
  .garrison-select {
    min-width: 200px;
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

  /* 窄屏（手机）：任务行改上下排 —— 原来「左边说明 + 右边选择器/按钮」横向排，
     选完子嗣后标签把选择器撑宽，`.task-actions { flex: none }` 不缩，按钮直接被
     `.zone { overflow: hidden }` 裁掉，接不了驻扎任务（2026-11-04 实测）。
     与 Estate.vue 同一断点、同一手法。 */
  @media (max-width: 720px) {
    .zone {
      padding: 18px;
    }
    .task-row {
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
    }
    .task-actions {
      width: 100%;
      flex-wrap: wrap;
    }
    .garrison-select {
      min-width: 0;
      width: 100%;
    }
    .stat {
      min-width: calc(50% - 14px);
    }
  }
</style>
