<template>
  <n-layout>
    <n-layout-header bordered>
      <n-page-header>
        <template #title>郑家宝阁</template>
        <template #subtitle>宝匣买入 · 跨层兑换 · 物品回收（P28.3，2026-10-22）</template>
      </n-page-header>
    </n-layout-header>

    <n-layout-content class="shop-content">
      <div class="wallet">
        <n-tag size="large" :bordered="false">
          凡俗 {{ formatSecular(playerStore.currency.secular) }}
        </n-tag>
        <n-tag size="large" :bordered="false">
          修仙 {{ formatSpiritual(playerStore.currency.spiritual) }}
        </n-tag>
        <n-tag v-if="playerStore.currency.strategic > 0" size="large" :bordered="false">
          战略 {{ formatStrategic(playerStore.currency.strategic) }}
        </n-tag>
      </div>

      <n-tabs v-model:value="tab" type="line" animated>
        <!-- ==================== 侍妾池 ==================== -->
        <n-tab-pane name="maiden" tab="侍妾池">
          <n-card title="侍妾池" size="small">
            <template #header-extra>
              <n-tag size="small" type="success">已开放</n-tag>
            </template>
            <div class="stack">
              <n-descriptions :column="2" size="small" label-placement="left">
                <n-descriptions-item label="单价">
                  {{ formatMaidenPrice() }} / 位
                </n-descriptions-item>
                <n-descriptions-item label="内宅">
                  {{ playerStore.livingWives.length }} / {{ HOUSEHOLD_CAP }} 人
                </n-descriptions-item>
              </n-descriptions>
              <n-text depth="3" style="font-size: 12px">
                随机凡女（P1–P6），正妾与女修不入此池。人数满 {{ HOUSEHOLD_CAP }} 位后无法再迎入。
              </n-text>
              <div class="row-actions">
                <n-button
                  type="primary"
                  :disabled="playerStore.maidenDrawCapacity <= 0"
                  @click="buyMaidens(1)"
                >
                  迎入 1 位（{{ formatMaidenPrice() }}）
                </n-button>
                <n-button
                  secondary
                  :disabled="playerStore.maidenDrawCapacity <= 0"
                  @click="buyMaidens(10)"
                >
                  迎入 10 位（{{ formatSecular(MAIDEN.price * 10) }}）
                </n-button>
              </div>
            </div>
          </n-card>
        </n-tab-pane>

        <!-- ==================== 宝匣 ==================== -->
        <n-tab-pane name="chest" tab="宝匣">
          <n-card title="宝匣买入" size="small">
            <template #header-extra>
              <n-tag size="small" type="success">1~5 阶按境界解锁</n-tag>
            </template>
            <n-text depth="3" style="font-size: 12px">
              七阶宝匣是宝匣阶级，不是物品基阶。买入后进背包「宝匣」页，不自动开启；
              <strong>宝匣不能回卖</strong>（Q3 定稿，防低买高卖）。
              <strong>按境界解锁</strong>：一/二阶练气、三阶筑基、四阶结丹、五阶结婴（P41）。
            </n-text>
            <n-table :bordered="false" :single-line="false" size="small" class="table-gap">
              <thead>
                <tr>
                  <th>阶级</th>
                  <th>材质</th>
                  <th>单价</th>
                  <th>解锁</th>
                  <th>持有</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="chest in CHEST_TIERS" :key="chest.tier">
                  <td>{{ chest.name }}</td>
                  <td>{{ chest.material }}</td>
                  <td>{{ chest.status === 'open' ? formatChestPrice(chest.tier) : '—' }}</td>
                  <td>
                    <n-text v-if="chest.status !== 'open'" depth="3">—</n-text>
                    <n-text
                      v-else
                      :depth="isUnlocked(chest.tier) ? 1 : 3"
                      :style="isUnlocked(chest.tier) ? '' : 'color:#d03050'"
                    >
                      {{ chestUnlockLabelOf(chest.tier) }}
                    </n-text>
                  </td>
                  <td>{{ playerStore.chests?.[chest.tier] || 0 }}</td>
                  <td>
                    <template v-if="chest.status === 'open' && isUnlocked(chest.tier)">
                      <n-button
                        size="small"
                        type="primary"
                        :disabled="!canAffordChest(chest.tier)"
                        @click="buyChest(chest)"
                      >
                        购买
                      </n-button>
                    </template>
                    <n-tag v-else-if="chest.status === 'open'" size="small" type="warning" :bordered="false">
                      未解锁
                    </n-tag>
                    <n-tag v-else size="small">暂不流通</n-tag>
                  </td>
                </tr>
              </tbody>
            </n-table>
            <n-text depth="3" style="font-size: 12px">
              结账走修仙层灵石（一阶）：1 二阶 = 100 一阶。灵石不足时按钮置灰，
              可先在「兑换」页用大子买入。
              当前境界 {{ playerStore.realm }}（Lv.{{ playerStore.level }}）。
            </n-text>
          </n-card>
        </n-tab-pane>

        <!-- ==================== 兑换 ==================== -->
        <n-tab-pane name="exchange" tab="兑换">
          <n-card title="兑换：凡俗 ↔ 修仙" size="small">
            <template #header-extra>
              <n-tag size="small" type="success">不限额</n-tag>
            </template>
            <div class="stack">
              <n-text depth="3" style="font-size: 12px">
                买 1 一阶 = {{ formatSecular(EXCHANGE.buyRate) }}（3.8 金页子）；
                卖 1 一阶 = {{ formatSecular(EXCHANGE.sellRate) }}（3.2 金页子）。
                价差即手续费，按整一阶成交。
              </n-text>
              <div class="row-actions">
                <n-input-number
                  v-model:value="exchangeCount"
                  :min="1"
                  :step="1"
                  style="width: 140px"
                />
                <n-text depth="3">一阶灵石</n-text>
              </div>
              <n-text depth="3">
                买需 {{ formatSecular(exchangeBuyCost) }} · 可买 {{ maxBuy }}
              </n-text>
              <div class="row-actions">
                <n-button type="primary" secondary @click="doBuySpiritual">买入一阶</n-button>
                <n-button secondary @click="doSellSpiritual">卖出一阶</n-button>
              </div>
            </div>
          </n-card>
        </n-tab-pane>

        <!-- ==================== 回收 ==================== -->
        <n-tab-pane name="recycle" tab="回收">
          <n-card title="物品回收" size="small">
            <template #header-extra>
              <n-tag size="small" type="success">
                可卖 {{ sellableSummary.count }} 件 · {{ formatSpiritual(sellableSummary.total) }}
              </n-tag>
            </template>

            <n-text depth="3" style="font-size: 12px">
              回收价 = 基础价（1~5 阶 6/24/96/384/1,536）× 30%，逐件取整到一阶灵石，
              即 2 / 7 / 29 / 115 / 461；**成色不影响价格**。
              装备中、出战中灵宠、品种锁定不参与；特殊道具 / 残页 / 功法 / 宝匣不收。
            </n-text>

            <div class="filters">
              <n-select
                v-model:value="recycleCategory"
                :options="categoryOptions"
                size="small"
                style="width: 130px"
              />
              <n-select
                v-model:value="recycleTier"
                :options="tierOptions"
                size="small"
                style="width: 110px"
              />
              <n-button
                type="primary"
                secondary
                :disabled="sellableSummary.count === 0"
                @click="confirmSellAll"
              >
                一键售出（全部未锁定）
              </n-button>
            </div>

            <n-table
              v-if="filteredRows.length"
              :bordered="false"
              :single-line="false"
              size="small"
              class="table-gap"
            >
              <thead>
                <tr>
                  <th>物品</th>
                  <th>类别</th>
                  <th>成色</th>
                  <th>数量</th>
                  <th>回收</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in pagedRows" :key="row.item.id">
                  <td>{{ row.item.displayName || row.item.name }}</td>
                  <td>{{ row.item.category }}</td>
                  <td>{{ row.item.quality || '—' }}</td>
                  <td>{{ row.units }}</td>
                  <td>{{ row.total }}</td>
                  <td>
                    <div class="row-actions">
                      <n-button
                        size="tiny"
                        :type="row.locked ? 'warning' : 'default'"
                        secondary
                        :disabled="!row.item.baseId"
                        @click="toggleLock(row)"
                      >
                        {{ row.locked ? '解除品种锁' : '锁定此品种' }}
                      </n-button>
                      <n-button
                        size="tiny"
                        type="primary"
                        :disabled="!row.sellable"
                        @click="confirmSellOne(row)"
                      >
                        {{ row.active ? '出战中' : '卖出' }}
                      </n-button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </n-table>
            <n-empty v-else description="没有可回收的物品——探索、开宝匣或炼器产物会出现在这里" />

            <n-pagination
              v-if="filteredRows.length > PAGE_SIZE"
              v-model:page="page"
              :page-size="PAGE_SIZE"
              :item-count="filteredRows.length"
              class="table-gap"
            />
          </n-card>
        </n-tab-pane>
      </n-tabs>
    </n-layout-content>
  </n-layout>
</template>

<script setup>
  import { computed, ref, watch } from 'vue'
  import { useDialog, useMessage } from 'naive-ui'
  import { usePlayerStore } from '../stores/player'
  import {
    formatSecular,
    formatSpiritual,
    formatStrategic,
    maxSpiritualPurchase
  } from '../plugins/currency'
  import {
    CHEST_TIERS,
    SELLABLE_CATEGORIES,
    TUNING as SHOP_TUNING,
    chestPriceOf,
    chestUnlockLabelOf,
    formatChestPrice,
    formatMaidenPrice,
    isChestUnlockedAt,
    sellPriceOf,
    sumRecycle
  } from '../plugins/shop'
  import { unitsOf } from '../plugins/stacks'
  import { TUNING as COURT_TUNING } from '../plugins/innerCourt'

  const playerStore = usePlayerStore()
  const message = useMessage()
  const dialog = useDialog()

  const MAIDEN = SHOP_TUNING.maiden
  const EXCHANGE = SHOP_TUNING.exchange
  /** 内宅人数上限的真源在 innerCourt 的 TUNING（store 只暴露 maidenDrawCapacity） */
  const HOUSEHOLD_CAP = COURT_TUNING.gacha.householdCap

  const tab = ref('maiden')

  /** 跨层兑换：按整一阶成交，买 / 卖共用这个数量 */
  const exchangeCount = ref(1)
  const exchangeBuyCost = computed(
    () => Math.max(Number(exchangeCount.value) || 0, 0) * EXCHANGE.buyRate
  )
  const maxBuy = computed(() => maxSpiritualPurchase(playerStore.currency))

  // ---------- 宝匣买入 ----------
  /** 境界解锁（P41 #2）：真源在 shop.js，store 的 buyChest 也会再拦一次 */
  const isUnlocked = tier => isChestUnlockedAt(tier, playerStore.level)

  const canAffordChest = tier => {
    const price = chestPriceOf(tier)
    return price != null && (Number(playerStore.currency.spiritual) || 0) >= price
  }

  const buyChest = chest => {
    const result = playerStore.buyChest(chest.tier, 1)
    if (!result.ok) {
      message.error(result.message || '买入失败')
      return
    }
    message.success(`买入 ${chest.name} ×1，花费 ${formatSpiritual(result.cost)}`)
  }

  // ---------- 物品回收 ----------
  const PAGE_SIZE = 20
  const recycleCategory = ref('all')
  const recycleTier = ref('all')
  const page = ref(1)

  const categoryOptions = [
    { label: '全部类别', value: 'all' },
    ...SELLABLE_CATEGORIES.map(category => ({ label: category, value: category }))
  ]
  const tierOptions = [
    { label: '全部阶', value: 'all' },
    ...[1, 2, 3, 4, 5].map(tier => ({ label: `${tier} 阶`, value: tier }))
  ]

  /**
   * 回收页的完整清单：**包含已锁定 / 出战中的条目**，否则锁上之后
   * 那一行就消失、玩家再也解不开。价格仍是真源算的，视图只做筛选。
   */
  const recycleRows = computed(() => {
    const locked = playerStore.lockedSpecies || []
    const activePetId = playerStore.activePet?.id || null
    return (playerStore.items || [])
      .filter(item => SELLABLE_CATEGORIES.includes(item.category))
      .map(item => {
        const price = sellPriceOf(item)
        const units = unitsOf(item)
        const isLocked = !!item.baseId && locked.includes(item.baseId)
        const isActive = !!activePetId && item.id === activePetId
        return {
          item,
          price,
          units,
          // P57：灵植/灵材一行就是一整摞，卖出价 = 单价 × 件数
          total: price == null ? null : price * units,
          locked: isLocked,
          active: isActive,
          sellable: price != null && !isLocked && !isActive
        }
      })
      .filter(row => row.price != null)
  })

  const filteredRows = computed(() =>
    recycleRows.value.filter(row => {
      if (recycleCategory.value !== 'all' && row.item.category !== recycleCategory.value) return false
      if (recycleTier.value !== 'all' && Number(row.item.tier) !== recycleTier.value) return false
      return true
    })
  )

  const pagedRows = computed(() => {
    const start = (page.value - 1) * PAGE_SIZE
    return filteredRows.value.slice(start, start + PAGE_SIZE)
  })

  // 换筛选条件回到第一页，否则会停在一个空页
  watch([recycleCategory, recycleTier], () => {
    page.value = 1
  })

  /** 一键售出范围**不受筛选影响**：全部未锁定物品（设计 §4.1） */
  const sellableSummary = computed(() =>
    sumRecycle(playerStore.items, playerStore.recycleOptions())
  )

  const toggleLock = row => {
    const nowLocked = playerStore.toggleSpeciesLock(row.item.baseId)
    message.success(`${row.item.name}：${nowLocked ? '已锁定，不再参与回收' : '已解除锁定'}`)
  }

  const confirmSellOne = row => {
    dialog.warning({
      title: '卖出物品',
      content: `确定卖出「${row.item.displayName || row.item.name}」${
        row.units > 1 ? `×${row.units}` : ''
      }，获得 ${formatSpiritual(row.total)}？`,
      positiveText: '卖出',
      negativeText: '取消',
      onPositiveClick: () => {
        const result = playerStore.sellItem(row.item.id)
        if (!result.ok) {
          message.error(result.message || '卖出失败')
          return
        }
        message.success(
          `卖出「${result.item.displayName || result.item.name}」${
            result.units > 1 ? `×${result.units}` : ''
          }，获得 ${formatSpiritual(result.price)}`
        )
      }
    })
  }

  const confirmSellAll = () => {
    const { count, total } = sellableSummary.value
    if (!count) {
      message.warning('没有可出售的物品')
      return
    }
    dialog.warning({
      title: '一键售出',
      content: `将卖出 ${count} 件未锁定物品，合计 ${formatSpiritual(total)}，确认？`,
      positiveText: '全部卖出',
      negativeText: '取消',
      onPositiveClick: () => {
        const result = playerStore.sellAllUnlocked()
        if (!result.ok) {
          message.error(result.message || '卖出失败')
          return
        }
        page.value = 1
        message.success(`已售出 ${result.count} 件，获得 ${formatSpiritual(result.total)}`)
      }
    })
  }

  // ---------- 侍妾池 ----------
  /**
   * 买侍妾。**先按内宅容量钳一次再计费** —— 和旧抽奖页同一条教训：
   * 否则玩家会花 10 个人的钱只拿到剩下的那几个。
   */
  const buyMaidens = count => {
    const room = playerStore.maidenDrawCapacity
    const draws = Math.min(count, room)
    if (draws <= 0) {
      message.error('内宅已满，无处安置')
      return
    }
    if (draws < count) message.warning(`内宅将满，本次只迎入 ${draws} 位`)

    const cost = draws * MAIDEN.price
    if (!playerStore.spendCurrency(MAIDEN.currency, cost)) {
      message.error(`凡俗层不足：需要 ${formatSecular(cost)}，可先在「兑换」页换`)
      return
    }
    const result = playerStore.recruitMaidens(draws)
    if (!result.success) {
      // 兜底退款：正常走不到（容量已经钳过），但扣钱后不给人是不能接受的
      playerStore.gainCurrency(MAIDEN.currency, cost)
      message.error(result.message || '迎入失败')
      return
    }
    message.success(`迎入 ${draws} 位姑娘 · 花费 ${formatSecular(cost)}`)
  }

  const doBuySpiritual = () => {
    const result = playerStore.exchangeSecularToSpiritual(exchangeCount.value)
    if (!result.ok) {
      message.error(`凡俗层不足：需要 ${formatSecular(result.costSecular)}`)
      return
    }
    message.success(`买入 ${result.gainedSpiritual} 一阶，花费 ${formatSecular(result.costSecular)}`)
  }

  const doSellSpiritual = () => {
    const result = playerStore.exchangeSpiritualToSecular(exchangeCount.value)
    if (!result.ok) {
      message.error(`修仙层不足：需要 ${result.costSpiritual} 一阶`)
      return
    }
    message.success(`卖出 ${result.costSpiritual} 一阶，得到 ${formatSecular(result.gainedSecular)}`)
  }
</script>

<style scoped>
  .shop-content {
    padding: 16px;
  }

  .wallet {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0 0 12px;
  }

  .stack {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .row-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin: 12px 0;
  }

  .table-gap {
    margin-top: 10px;
  }
</style>
