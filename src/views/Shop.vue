<template>
  <n-layout>
    <n-layout-header bordered>
      <n-page-header>
        <template #title>郑家宝阁</template>
        <template #subtitle>回收口与兑换 · 抽奖池已废弃（P17，2026-10-19）</template>
      </n-page-header>
    </n-layout-header>

    <n-layout-content class="shop-content">
      <n-alert type="info" :bordered="false" title="双层货币，不折算">
        大子 / 金页子走凡俗账，一阶 / 二阶灵石走修仙账。汇率（100 大子 = 1 金页子）只用于本页的
        手动兑换，不用于结算。宝箱与订货属 P17 后续步骤，现在只展示价格。
      </n-alert>

      <div class="wallet">
        <n-tag v-for="key in CURRENCY_KEYS" :key="key" size="large" :bordered="false">
          {{ CURRENCY_META[key].name }} {{ formatAmount(playerStore.currency[key]) }}
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
                {{ MAIDEN.price }} {{ CURRENCY_META[MAIDEN.currency].name }} / 位
              </n-descriptions-item>
              <n-descriptions-item label="内宅">
                {{ playerStore.wives.length }} / {{ HOUSEHOLD_CAP }} 人
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
                迎入 1 位（{{ MAIDEN.price }} 金页子）
              </n-button>
              <n-button
                secondary
                :disabled="playerStore.maidenDrawCapacity <= 0"
                @click="buyMaidens(10)"
              >
                迎入 10 位（{{ MAIDEN.price * 10 }} 金页子）
              </n-button>
            </n-space>
          </n-space>
        </n-card>

        <!-- 兑换 -->
        <n-card title="兑换：大子 → 金页子" size="small">
          <template #header-extra>
            <n-tag size="small" type="warning">手续费/限额待定</n-tag>
          </template>
          <n-space vertical :size="12">
            <n-text depth="3" style="font-size: 12px">
              {{ EXCHANGE.rate }} 大子 = 1 金页子。手续费暂按 0、不限额 ——
              《模块六》§十 反推完再改 `plugins/shop.js`。
            </n-text>
            <n-space align="center">
              <n-input-number
                v-model:value="exchangeJinYeZi"
                :min="1"
                :step="10"
                style="width: 160px"
              />
              <n-text depth="3">金页子 → 需 {{ exchangeCost }} 大子</n-text>
            </n-space>
            <n-button type="primary" secondary @click="doExchange">兑换</n-button>
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
                <th>单价（二阶灵石）</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="chest in CHEST_TIERS" :key="chest.tier">
                <td>{{ chest.name }}</td>
                <td>{{ chest.material }}</td>
                <td>{{ chest.price }}</td>
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
  import { CURRENCY_KEYS, CURRENCY_META, formatAmount } from '../plugins/currency'
  import { CHEST_TIERS, TUNING as SHOP_TUNING } from '../plugins/shop'
  import { TUNING as COURT_TUNING } from '../plugins/innerCourt'

  const playerStore = usePlayerStore()
  const message = useMessage()

  const MAIDEN = SHOP_TUNING.maiden
  const EXCHANGE = SHOP_TUNING.exchange
  /** 内宅人数上限的真源在 innerCourt 的 TUNING（store 只暴露 maidenDrawCapacity） */
  const HOUSEHOLD_CAP = COURT_TUNING.gacha.householdCap

  const exchangeJinYeZi = ref(20)
  const exchangeCost = computed(
    () => Math.round((Number(exchangeJinYeZi.value) || 0) * EXCHANGE.rate * (1 + EXCHANGE.feeRate))
  )

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
      message.error(`金页子不足：需要 ${cost} 金页子，可先在右侧兑换`)
      return
    }
    const result = playerStore.recruitMaidens(draws)
    if (!result.success) {
      // 兜底退款：正常走不到（容量已经钳过），但扣钱后不给人是不能接受的
      playerStore.gainCurrency(MAIDEN.currency, cost)
      message.error(result.message || '迎入失败')
      return
    }
    message.success(`迎入 ${draws} 位姑娘 · 花费 ${cost} 金页子`)
  }

  const doExchange = () => {
    const result = playerStore.exchangeDaZiToJinYeZi(exchangeJinYeZi.value, EXCHANGE.feeRate)
    if (!result.ok) {
      message.error(`大子不足：需要 ${result.costDaZi} 大子`)
      return
    }
    message.success(`兑换 ${result.gainedJinYeZi} 金页子，花费 ${result.costDaZi} 大子`)
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
