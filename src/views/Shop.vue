<template>
  <n-layout>
    <n-layout-header bordered>
      <n-page-header>
        <template #title>郑家宝阁</template>
        <template #subtitle>回收口与兑换 · 抽奖池已废弃（P17，2026-10-19）</template>
      </n-page-header>
    </n-layout-header>

    <n-layout-content class="shop-content">
      <n-alert type="info" :bordered="false" title="货币 v2：同层自动进位，跨层手动兑换">
        凡俗层记总大子（100 大子 = 1 金页子），修仙层记总一阶（100 一阶 = 1 二阶，
        800 二阶 = 1 三阶），显示时自动拆面额。凡俗 ↔ 修仙只能在本页手动兑换：
        买 3.8 金页子 / 卖 3.2 金页子 = 1 一阶，价差即手续费。
      </n-alert>

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

      <div class="shop-grid">
        <!-- 侍妾池 -->
        <n-card title="侍妾池" size="small">
          <template #header-extra>
            <n-tag size="small" type="success">已开放</n-tag>
          </template>
          <n-space vertical :size="12">
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
            <n-space>
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
            </n-space>
          </n-space>
        </n-card>

        <!-- 兑换（跨层，手动，价差即手续费） -->
        <n-card title="兑换：凡俗 ↔ 修仙" size="small">
          <template #header-extra>
            <n-tag size="small" type="success">不限额</n-tag>
          </template>
          <n-space vertical :size="12">
            <n-text depth="3" style="font-size: 12px">
              买 1 一阶 = {{ formatSecular(EXCHANGE.buyRate) }}（3.8 金页子）；
              卖 1 一阶 = {{ formatSecular(EXCHANGE.sellRate) }}（3.2 金页子）。
              价差即手续费，按整一阶成交。
            </n-text>
            <n-space align="center">
              <n-input-number
                v-model:value="exchangeCount"
                :min="1"
                :step="1"
                style="width: 140px"
              />
              <n-text depth="3">一阶灵石</n-text>
            </n-space>
            <n-space align="center">
              <n-text depth="3">
                买需 {{ formatSecular(exchangeBuyCost) }} · 可买 {{ maxBuy }}
              </n-text>
            </n-space>
            <n-space>
              <n-button type="primary" secondary @click="doBuySpiritual">买入一阶</n-button>
              <n-button secondary @click="doSellSpiritual">卖出一阶</n-button>
            </n-space>
          </n-space>
        </n-card>

        <!-- 宝匣 -->
        <n-card title="宝匣" size="small" class="span-2">
          <template #header-extra>
            <n-tag size="small">未开放</n-tag>
          </template>
          <n-text depth="3" style="font-size: 12px">
            七阶宝匣是**宝匣阶级**，不是物品基阶；系统（TC 树 / 首通 / 扫荡）属 P17 第 2–3 步。
          </n-text>
          <n-table :bordered="false" :single-line="false" size="small" style="margin-top: 10px">
            <thead>
              <tr>
                <th>阶级</th>
                <th>材质</th>
                <th>单价</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="chest in CHEST_TIERS" :key="chest.tier">
                <td>{{ chest.name }}</td>
                <td>{{ chest.material }}</td>
                <td>{{ formatChestPrice(chest.tier) }}</td>
                <td>
                  <n-tag size="small" :type="chest.status === 'open' ? 'success' : 'default'">
                    {{ chest.status === 'open' ? '可购买' : '未开放' }}
                  </n-tag>
                </td>
              </tr>
            </tbody>
          </n-table>
        </n-card>

        <!-- 洗命符 -->
        <n-card title="洗命符" size="small">
          <template #header-extra>
            <n-tag size="small">不可购买</n-tag>
          </template>
          <n-space vertical :size="8">
            <n-text>当前持有：{{ playerStore.fateCharms }} 张</n-text>
            <n-text depth="3" style="font-size: 12px">
              开局 5 张，不可购买（P17 决议 4）。后续只从四阶以上宝箱 / 秘境大 Boss 首杀
              极低概率掉落 —— 两者都还没落地。
            </n-text>
          </n-space>
        </n-card>

        <!-- 订货 -->
        <n-card title="郑家订货" size="small">
          <template #header-extra>
            <n-tag size="small">未开放</n-tag>
          </template>
          <n-text depth="3" style="font-size: 12px">
            定向订购带 `series` 标签的底材（练气九层卡点的方案 A）。
            依赖物品池与宝箱底材（P17 第 2 步），订货加价按 ×3~5 预留。
          </n-text>
        </n-card>
      </div>
    </n-layout-content>
  </n-layout>
</template>

<script setup>
  import { computed, ref } from 'vue'
  import { useMessage } from 'naive-ui'
  import { usePlayerStore } from '../stores/player'
  import {
    formatSecular,
    formatSpiritual,
    formatStrategic,
    maxSpiritualPurchase
  } from '../plugins/currency'
  import {
    CHEST_TIERS,
    TUNING as SHOP_TUNING,
    formatChestPrice,
    formatMaidenPrice
  } from '../plugins/shop'
  import { TUNING as COURT_TUNING } from '../plugins/innerCourt'

  const playerStore = usePlayerStore()
  const message = useMessage()

  const MAIDEN = SHOP_TUNING.maiden
  const EXCHANGE = SHOP_TUNING.exchange
  /** 内宅人数上限的真源在 innerCourt 的 TUNING（store 只暴露 maidenDrawCapacity） */
  const HOUSEHOLD_CAP = COURT_TUNING.gacha.householdCap

  /** 跨层兑换：按整一阶成交，买 / 卖共用这个数量 */
  const exchangeCount = ref(1)
  const exchangeBuyCost = computed(
    () => Math.max(Number(exchangeCount.value) || 0, 0) * EXCHANGE.buyRate
  )
  const maxBuy = computed(() => maxSpiritualPurchase(playerStore.currency))

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
      message.error(`凡俗层不足：需要 ${formatSecular(cost)}，可先在右侧兑换`)
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
    margin: 12px 0;
  }

  .shop-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 16px;
  }

  .span-2 {
    grid-column: 1 / -1;
  }
</style>
