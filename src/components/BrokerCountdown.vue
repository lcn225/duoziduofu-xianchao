<template>
  <div v-if="visible" class="broker-strip" :class="{ urgent: pending, claimable: !!delivery }">
    <span class="broker-label">老九带货</span>
    <span class="broker-main">{{ mainText }}</span>
    <span v-if="detailText" class="broker-detail">{{ detailText }}</span>
  </div>
</template>

<script setup>
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
  import { usePlayerStore } from '../stores/player'
  import { formatRealCountdown } from '../plugins/dayDate'
  import { itemById } from '../plugins/items'

  // P50 ②（2026-11-10）：**老九倒计时常驻挂件** —— 封地 / 内宅两页共用。
  // 设计口径 = 《模块五》§13.3.3：「老九倒计时常驻在封地 / 内政界面的挂件上」。
  //
  // 四条口径：
  //   ① **只在有在途订单 / 待领取的货时占位** —— 什么都没下不显示，不占版面；
  //   ② **待领取排在最前面**（2026-11-10）：到货后货摆在飞鹰阁不自动进背包，
  //      挂件是玩家在别的页面唯一能看见它的地方，所以整条转暗金；
  //   ③ 倒计时走 `factionLiveRealSeconds` + `formatRealCountdown`（分钟档的 `formatDuration`
  //      一分钟才动一格，用于飞鹰门会看起来卡住，见 B15-c #4）；
  //   ④ `pending` = 已到点但贡献点不够补款（`settleBroker` 会挂起不吞货），单独标红提示。
  const playerStore = usePlayerStore()

  const nowTick = ref(Date.now())
  let ticker = null
  onMounted(() => {
    ticker = setInterval(() => {
      nowTick.value = Date.now()
    }, 1000)
  })
  onBeforeUnmount(() => {
    if (ticker) clearInterval(ticker)
  })

  const broker = computed(() => playerStore.faction?.vault?.broker || null)
  // 已到货、待玩家去飞鹰阁收取（2026-11-10）：挂件必须把这个状态顶在最前面
  const delivery = computed(() => playerStore.brokerDeliveryView)
  const visible = computed(() => !!broker.value || !!delivery.value)

  const liveSeconds = computed(() => {
    void nowTick.value
    return playerStore.factionLiveRealSeconds
  })

  const leftSeconds = computed(() =>
    Math.max((Number(broker.value?.readyAt) || 0) - liveSeconds.value, 0)
  )
  const gap = computed(() => Number(broker.value?.gap) || 0)
  const contribution = computed(() => Number(playerStore.faction?.contribution) || 0)
  const price = computed(() => Number(broker.value?.price) || 0)

  const pending = computed(
    () =>
      !delivery.value &&
      !!broker.value?.chosenTag &&
      leftSeconds.value <= 0 &&
      gap.value > 0 &&
      contribution.value < gap.value
  )

  const mainText = computed(() => {
    // 到货待领取排在所有状态之前 —— 这是玩家唯一会「错过」的那一步
    if (delivery.value) return `已到货待领取「${delivery.value.name}」`
    const b = broker.value
    if (!b) return ''
    if (!b.chosenTag) return '等你选一个标签锁定方向'
    if (pending.value) return `已到城外 · 还差 ${(gap.value - contribution.value).toLocaleString()} 点`
    if (leftSeconds.value <= 0) return '即将到货'
    return `在途 · 还剩 ${formatRealCountdown(leftSeconds.value)}`
  })

  const detailText = computed(() => {
    if (delivery.value) {
      const d = delivery.value
      return [d.price ? `${d.price.toLocaleString()} 点` : '', '去飞鹰阁「收货」']
        .filter(Boolean)
        .join(' · ')
    }
    const b = broker.value
    if (!b || !b.chosenTag) return ''
    const name = b.deliverBaseId ? itemById(b.deliverBaseId)?.name || '' : ''
    const tag = name ? `「${name}」` : ''
    const tail =
      gap.value > 0
        ? `到货补 ${gap.value.toLocaleString()} 点`
        : gap.value < 0
          ? `到货退 ${(-gap.value).toLocaleString()} 点`
          : '按预扣结清'
    return [tag, price.value ? `${price.value.toLocaleString()} 点` : '', tail].filter(Boolean).join(' · ')
  })
</script>

<style scoped>
  .broker-strip {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 10px;
    margin-bottom: 12px;
    padding: 8px 14px;
    border: 1px solid var(--ui-line);
    border-radius: var(--ui-radius);
    background: var(--ui-surface);
    box-shadow: var(--ui-shadow);
    font-size: 13px;
    line-height: 1.5;
  }

  .broker-label {
    font-weight: 600;
    color: var(--ui-gold);
  }

  .broker-main {
    color: var(--ui-ink);
  }

  .broker-detail {
    color: var(--ui-ink-sub);
  }

  .broker-strip.urgent {
    border-color: var(--ui-cinnabar);
  }

  .broker-strip.urgent .broker-main {
    color: var(--ui-cinnabar);
    font-weight: 600;
  }

  /* 已到货待领取：整条转暗金，和「在途」区分开 */
  .broker-strip.claimable {
    border-color: var(--ui-gold);
  }

  .broker-strip.claimable .broker-main {
    color: var(--ui-gold);
    font-weight: 600;
  }
</style>
