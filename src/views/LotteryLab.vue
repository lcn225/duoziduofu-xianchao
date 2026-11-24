<template>
  <!--
    气运轮盘 · 模拟台（2026-11-25，开发期临时页 `/#/lottery-lab`）。
    ⚠ **只用纯函数、不碰 store / 不落盘**：这里的抽奖不会进背包、不加货币，
      和真档完全隔离。路由只在 `import.meta.env.DEV` 下注册（同 `/animtest`）。
  -->
  <n-layout>
    <n-layout-content>
      <div class="page-stack">
        <div class="zone">
          <div class="zone-head">
            <div class="zone-title">气运轮盘 · 模拟台</div>
            <n-space :size="8" align="center">
              <n-tag size="small" type="warning" :bordered="false">开发页 · 不落盘</n-tag>
              <n-button size="tiny" @click="goBack">回背包</n-button>
            </n-space>
          </div>
          <div class="zone-body">
            <div class="lab-row">
              <span class="lab-label">随机种子</span>
              <n-input-number v-model:value="seed" size="small" :min="0" :max="999999999" style="width: 150px" />
              <n-button size="small" @click="reseed">重置序列</n-button>
              <span class="lab-hint">同一种子 + 同样操作 = 同样结果（mulberry32）</span>
            </div>

            <div class="lab-row">
              <span class="lab-label">直接抽单档</span>
              <n-select v-model:value="tier" size="small" :options="tierOptions" style="width: 130px" />
              <n-input-number v-model:value="times" size="small" :min="1" :max="200" style="width: 110px" />
              <n-button size="small" type="primary" @click="drawDirect">抽 {{ times }} 次</n-button>
            </div>

            <div class="lab-row">
              <span class="lab-label">模拟出生</span>
              <n-input-number v-model:value="achievements" size="small" :min="0" :max="30" style="width: 110px" />
              <span class="lab-hint">成就数 k → {{ lotteryDrawCountOf(achievements) }} 抽：</span>
              <n-tag
                v-for="(item, index) in previewTiers"
                :key="index"
                size="small"
                :class="tierToneOf(item)"
              >
                {{ LOTTERY_TIER_META[item].name }}
              </n-tag>
              <n-button size="small" type="primary" @click="appendBirth">加进队列</n-button>
            </div>

            <div class="lab-row">
              <span class="lab-label">队列</span>
              <span class="lab-hint">待抽 {{ queuePending }} 次</span>
              <n-tag v-if="!queue.length" size="small" :bordered="false">空</n-tag>
              <n-tag v-for="row in queueSummaryRows" :key="row.tier" size="small" :class="row.tone">
                {{ row.name }} ×{{ row.count }}
              </n-tag>
              <n-button size="small" type="primary" @click="pullQueue">拉杆</n-button>
              <n-button size="small" @click="queue = []">清空队列</n-button>
            </div>
          </div>
        </div>

        <div v-if="results.length" class="zone">
          <div class="zone-head">
            <div class="zone-title">本次结果（{{ results.length }} 抽）</div>
            <n-button size="small" @click="results = []">清空结果</n-button>
          </div>
          <div class="zone-body">
            <div class="lab-tiles">
              <div v-for="tile in resultTiles" :key="tile.key" class="lab-tile" :class="tile.tone">
                <span class="lab-tile-name">{{ tile.name }}</span>
                <span v-if="tile.count > 1" class="lab-tile-count">×{{ tile.count }}</span>
                <span class="lab-tile-note">{{ tile.note }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="zone">
          <div class="zone-head">
            <div class="zone-title">批量统计</div>
            <n-space :size="8">
              <n-select v-model:value="batchTier" size="small" :options="tierOptions" style="width: 130px" />
              <n-input-number v-model:value="batchCount" size="small" :min="10" :max="20000" style="width: 130px" />
              <n-button size="small" type="primary" @click="runBatch">跑 {{ batchCount }} 抽</n-button>
            </n-space>
          </div>
          <div class="zone-body">
            <div v-if="batch" class="lab-stats">
              <span>
                实测均值：<strong>{{ batch.averageText }}</strong> / 抽
                <span class="lab-hint">（{{ batch.cashText }}）</span>
              </span>
              <span class="lab-hint">
                R74 记账值：{{ R74_EXPECT[batchTier] }} 一阶 / 抽（灰档只按 30 大子/抽记）
              </span>
            </div>
            <div v-if="batch" class="lab-batch-grid">
              <div class="lab-batch-col">
                <div class="lab-batch-title">品类</div>
                <div v-for="row in batch.categoryRows" :key="row.key" class="lab-batch-row">
                  <span>{{ row.key }}</span>
                  <span>{{ row.count }} <span class="lab-hint">({{ row.pct }}%)</span></span>
                </div>
              </div>
              <div class="lab-batch-col">
                <div class="lab-batch-title">成色</div>
                <div v-for="row in batch.qualityRows" :key="row.key" class="lab-batch-row">
                  <span>{{ row.key }}</span>
                  <span>{{ row.count }} <span class="lab-hint">({{ row.pct }}%)</span></span>
                </div>
                <div v-if="!batch.qualityRows.length" class="lab-hint">灰档没有成色</div>
              </div>
            </div>
            <n-empty v-else description="选一档跑一批，看分布与均值" />
          </div>
        </div>

        <div class="zone">
          <div class="zone-head">
            <div class="zone-title">子嗣成就（20 条定稿）</div>
            <span class="lab-hint">判定基准 = 已落盘子嗣（含孙辈），只在出生瞬间判一次</span>
          </div>
          <div class="zone-body">
            <n-data-table
              size="small"
              :bordered="false"
              :single-line="false"
              :columns="achievementColumns"
              :data="achievementRows"
              :pagination="{ pageSize: 10 }"
            />
          </div>
        </div>
      </div>
    </n-layout-content>
  </n-layout>
</template>

<script setup>
  import { computed, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import {
    LOTTERY_TIERS,
    LOTTERY_TIER_META,
    lotteryDrawCountOf,
    lotteryPendingCountOf,
    lotteryQueueSummaryOf,
    lotteryTierOfIndex,
    rollLotteryDrawOf,
    rollLotteryQueueOf
  } from '../plugins/lottery.js'
  import { OFFSPRING_ACHIEVEMENTS } from '../plugins/offspringAchievements.js'
  import { itemColorClassOf } from '../plugins/tiers.js'

  const router = useRouter()
  const goBack = () => router.push('/inventory')

  /** R74 记账值（每抽一阶期望）—— 灰档那条只按 30 大子/抽计，批量统计会露出实抽差异 */
  const R74_EXPECT = { gray: 0.09, white: 2, green: 2, blue: 7, purple: 7 }

  const TIER_OPTIONS = LOTTERY_TIERS.map(tier => ({
    label: `${LOTTERY_TIER_META[tier].name} · ${LOTTERY_TIER_META[tier].label}`,
    value: tier
  }))
  const tierOptions = TIER_OPTIONS

  // ---------- 可复现随机数（mulberry32） ----------
  const makeRng = seedValue => {
    let a = (Number(seedValue) || 0) >>> 0
    return () => {
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }
  const seed = ref(20261124)
  let rng = makeRng(seed.value)
  const reseed = () => {
    rng = makeRng(seed.value)
  }

  // ---------- 单抽 / 队列 ----------
  const tier = ref('white')
  const times = ref(10)
  const achievements = ref(1)
  const queue = ref([])
  const results = ref([])

  const previewTiers = computed(() => {
    const count = lotteryDrawCountOf(achievements.value)
    return Array.from({ length: count }, (_, index) => lotteryTierOfIndex(index))
  })

  const queuePending = computed(() => lotteryPendingCountOf(queue.value))
  const queueSummaryRows = computed(() => {
    const summary = lotteryQueueSummaryOf(queue.value)
    return LOTTERY_TIERS.map(item => ({
      tier: item,
      name: LOTTERY_TIER_META[item].name,
      count: summary[item] || 0,
      tone: tierToneOf(item)
    })).filter(row => row.count > 0)
  })

  const tierToneOf = item => `ui-tier-${item}`

  const drawDirect = () => {
    const list = []
    for (let i = 0; i < times.value; i += 1) {
      const entry = rollLotteryDrawOf(tier.value, rng)
      if (entry) list.push(entry)
    }
    results.value = list
  }

  const appendBirth = () => {
    const at = Date.now()
    const count = lotteryDrawCountOf(achievements.value)
    for (let i = 0; i < count; i += 1) {
      const nextTier = lotteryTierOfIndex(i)
      const last = queue.value[queue.value.length - 1]
      if (last && last.tier === nextTier && last.at === at) last.count += 1
      else queue.value.push({ tier: nextTier, count: 1, at })
    }
  }

  const pullQueue = () => {
    if (!queuePending.value) return
    const rolled = rollLotteryQueueOf(queue.value, rng)
    results.value = rolled.entries
    queue.value = []
  }

  // ---------- 结果格子（按 名称 + 阶 + 成色 合并） ----------
  const QUALITY_ORDER = { 下: 1, 中: 2, 上: 3, 极: 4 }
  const resultTiles = computed(() => {
    const map = new Map()
    for (const entry of results.value) {
      const isCurrency = entry.kind === 'currency'
      const meta = isCurrency ? { tier: 0 } : LOTTERY_TIER_META[entry.tier] || { tier: 0 }
      const quality = entry.quality || ''
      const name = entry.name
      const key = `${name}|${meta.tier}|${quality}`
      const found = map.get(key)
      if (found) {
        found.count += 1
        continue
      }
      map.set(key, {
        key,
        count: 1,
        name,
        note: isCurrency
          ? `${entry.amount} 大子 · 凡俗`
          : `${meta.tier} 阶 · ${entry.category}`,
        tone: isCurrency ? 'ui-tier-gray' : itemColorClassOf(meta.tier, quality),
        tierRank: meta.tier || 0,
        qualityRank: QUALITY_ORDER[quality] || 0
      })
    }
    return [...map.values()].sort(
      (a, b) =>
        (b.tierRank || 0) - (a.tierRank || 0) ||
        (b.qualityRank || 0) - (a.qualityRank || 0) ||
        String(a.name).localeCompare(String(b.name))
    )
  })

  // ---------- 批量统计 ----------
  const batchTier = ref('purple')
  const batchCount = ref(1000)
  const batch = ref(null)

  /** 回收口径（R74）：一阶 2 / 二阶 7 一阶灵石；灰档按大子记 */
  const recycleOf = meta => (Number(meta.tier) >= 2 ? 7 : 2)

  const runBatch = () => {
    const total = Math.max(Math.floor(Number(batchCount.value) || 0), 1)
    const category = new Map()
    const quality = new Map()
    let cash = 0
    let stone1 = 0
    const bump = (map, key) => map.set(key, (map.get(key) || 0) + 1)
    for (let i = 0; i < total; i += 1) {
      const entry = rollLotteryDrawOf(batchTier.value, rng)
      if (!entry) continue
      if (entry.kind === 'currency') {
        cash += Number(entry.amount) || 0
        bump(category, '凡俗货币 / 物品')
        continue
      }
      bump(category, entry.category || '未知')
      bump(quality, entry.quality || '—')
      stone1 += recycleOf(LOTTERY_TIER_META[entry.tier] || {})
    }
    const toRows = map =>
      [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([key, count]) => ({ key, count, pct: ((count / total) * 100).toFixed(1) }))
    batch.value = {
      total,
      categoryRows: toRows(category),
      qualityRows: toRows(quality),
      averageText:
        batchTier.value === 'gray'
          ? `${(cash / total).toFixed(1)} 大子`
          : `${(stone1 / total).toFixed(3)} 一阶`,
      cashText:
        batchTier.value === 'gray'
          ? `折合 ${(cash / total / 320).toFixed(3)} 一阶 · 按卖价 320 大子/一阶`
          : `回收口径：一阶 2 / 二阶 7 一阶灵石`
    }
  }

  // ---------- 成就参考表 ----------
  const achievementColumns = [
    { title: 'id', key: 'id', width: 170 },
    { title: '名称', key: 'name', width: 150 },
    { title: '说明', key: 'desc' }
  ]
  const achievementRows = OFFSPRING_ACHIEVEMENTS
</script>

<style scoped>
  .lab-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
  }

  .lab-label {
    min-width: 84px;
    font-weight: 600;
    color: var(--ui-ink);
  }

  .lab-hint {
    font-size: 12.5px;
    color: var(--ui-ink-fade);
  }

  .lab-tiles {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .lab-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-width: 110px;
    padding: 10px;
    border: 1px solid var(--ui-line);
    border-radius: var(--ui-radius);
    background: var(--ui-surface);
  }

  .lab-tile-name {
    font-weight: 600;
    font-size: 13px;
    text-align: center;
    color: var(--ui-ink);
  }

  .lab-tile-count {
    font-size: 12px;
    color: var(--ui-ink-sub);
  }

  .lab-tile-note {
    font-size: 11.5px;
    color: var(--ui-ink-fade);
  }

  .lab-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: baseline;
    font-size: 13px;
    color: var(--ui-ink);
  }

  .lab-batch-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 32px;
  }

  .lab-batch-col {
    min-width: 220px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .lab-batch-title {
    font-weight: 700;
    color: var(--ui-ink);
  }

  .lab-batch-row {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    font-size: 13px;
    color: var(--ui-ink-sub);
    border-bottom: 1px dashed var(--ui-line);
    padding-bottom: 4px;
  }
</style>
