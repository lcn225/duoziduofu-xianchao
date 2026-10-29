<template>
  <n-config-provider :theme="playerStore.isDarkMode ? darkTheme : null">
    <n-message-provider>
      <n-dialog-provider>
        <n-spin :show="isLoading" description="正在加载游戏数据...">
          <n-layout>
            <n-layout-header class="top-bar">
              <div class="header-content">
                <!-- 第一行：标题 + 核心资源（UI 视觉规范 §1.3）。无底线，靠留白分隔。
                     这里只放「随时要看的三个数」：灵石 / 时间；其余资源留在下面的状态条。 -->
                <div class="nav-top">
                  <div class="brand">
                    <span class="brand-title">多子多福</span>
                    <span class="brand-sub">开创仙朝</span>
                  </div>
                  <div class="nav-core">
                    <span class="core-item">
                      <span class="k">灵石</span>
                      <span class="v">{{ formatSpiritual(playerStore.currency.spiritual) }}</span>
                    </span>
                    <time-status-indicator />
                    <n-button quaternary circle size="small" @click="playerStore.toggle">
                      <template #icon>
                        <n-icon>
                          <Sunny v-if="playerStore.isDarkMode" />
                          <Moon v-else />
                        </n-icon>
                      </template>
                    </n-button>
                  </div>
                </div>
                <!-- 第二行：模块页签（书签/卷标） -->
                <main-nav />
              </div>
            </n-layout-header>
            <n-layout-content>
              <div class="content-wrapper">
                <n-alert
                  v-if="saveWiped"
                  type="warning"
                  closable
                  style="margin-bottom: 16px"
                  @close="saveWiped = false"
                >
                  因版本更新，旧存档与新的修行系统不兼容，已重置为<strong>练气一层</strong>的新档。
                  这不是丢档，是契合度体系整体重做的必要代价。
                </n-alert>
                <n-alert
                  v-if="playerStore.isInjured && route.path !== '/'"
                  type="error"
                  show-icon
                  style="margin-bottom: 16px"
                >
                  探索战败，正在养伤 {{ formatCountdown(playerStore.injuryRemainingSeconds) }}。
                  期间镇守日常暂停、不能外出。回「镇守」可以看养伤进度。
                </n-alert>
                <n-card size="small" class="status-card">
                  <!-- 顶部状态分两行：第一行身份 + 修为，第二行货币与家当。
                       两行都靠 flex-wrap 兜窄屏（2026-10-27 用户要求：货币不能和道号挤同一行）。 -->
                  <div class="status-line">
                    <span class="status-item is-main">
                      <span class="k">道号</span><span class="v">{{ playerStore.name }}</span>
                    </span>
                    <span class="status-item is-main">
                      <span class="k">境界</span><span class="v">{{ getRealmName(playerStore.level).name }}</span>
                    </span>
                    <span class="status-item is-main">
                      <span class="k">外功</span><span class="v">{{ playerStore.bodyRealm }}</span>
                    </span>
                    <span class="status-item">
                      <span class="k">契合度</span>{{ (playerStore.overallHarmony * 100).toFixed(1) }}%
                    </span>
                    <span class="status-item">
                      <span class="k">修为</span>{{ Math.floor(playerStore.cultivation) }} /
                      {{ playerStore.maxCultivation }}
                    </span>
                    <!-- 2026-10-20 引导：修为满了却突破不了时，进度条只会停住；
                         顶栏给一个常驻入口，免得玩家不知道去修炼页看门槛。 -->
                    <n-button
                      v-if="breakthroughBlocked"
                      size="tiny"
                      type="warning"
                      secondary
                      @click="router.push('/cultivation')"
                    >
                      修为已到门槛 · 前往【修炼】确认 →
                    </n-button>
                  </div>

                  <div class="status-line is-assets">
                    <!-- 货币 v2：凡俗层与修仙层分开显示，同层自动拆面额、不折算。
                         灵力不在这里显示（它是中间物），要看去「修炼」页。 -->
                    <span class="status-item">
                      <span class="k">凡俗货币</span>{{ formatSecular(playerStore.currency.secular) }}
                    </span>
                    <span class="status-item">
                      <span class="k">灵石</span>{{ formatSpiritual(playerStore.currency.spiritual) }}
                    </span>
                    <span class="status-item">
                      <span class="k">材料</span>{{ materialSummary }}
                    </span>
                    <span class="status-item"><span class="k">强化石</span>{{ playerStore.reinforceStones }}</span>
                    <span class="status-item"><span class="k">洗命符</span>{{ playerStore.fateCharms }}</span>
                    <n-button text size="tiny" class="status-toggle" @click="showDetail = !showDetail">
                      {{ showDetail ? '收起详细信息' : '详细信息' }}
                    </n-button>
                  </div>

                  <n-progress
                    type="line"
                    :percentage="Number(((playerStore.cultivation / playerStore.maxCultivation) * 100).toFixed(2))"
                    rail-color="var(--ui-track)"
                    color="var(--ui-jade)"
                    :show-indicator="false"
                    :height="6"
                    class="status-progress"
                  />

                  <n-collapse-transition :show="showDetail">
                    <div class="status-detail">
                        <n-divider>基础属性</n-divider>
                        <n-descriptions bordered :column="2">
                          <n-descriptions-item label="生命值">
                            {{ (playerStore.totalHealth || 0).toFixed(0) }}
                          </n-descriptions-item>
                          <n-descriptions-item label="攻击力">
                            {{ (playerStore.combatPanel.attack || 0).toFixed(0) }}
                          </n-descriptions-item>
                          <n-descriptions-item label="防御力">
                            {{ (playerStore.totalDefense || 0).toFixed(0) }}
                          </n-descriptions-item>
                          <n-descriptions-item label="速度">
                            {{ (playerStore.combatPanel.speed || 0).toFixed(0) }}
                          </n-descriptions-item>
                        </n-descriptions>
                        <n-divider>战斗属性</n-divider>
                        <n-descriptions bordered :column="3">
                          <n-descriptions-item label="暴击率">
                            {{ (playerStore.combatAttributes.critRate * 100).toFixed(1) }}%
                          </n-descriptions-item>
                          <n-descriptions-item label="连击率">
                            {{ (playerStore.combatAttributes.comboRate * 100).toFixed(1) }}%
                          </n-descriptions-item>
                          <n-descriptions-item label="反击率">
                            {{ (playerStore.combatAttributes.counterRate * 100).toFixed(1) }}%
                          </n-descriptions-item>
                          <n-descriptions-item label="眩晕率">
                            {{ (playerStore.combatAttributes.stunRate * 100).toFixed(1) }}%
                          </n-descriptions-item>
                          <n-descriptions-item label="闪避率">
                            {{ (playerStore.combatAttributes.dodgeRate * 100).toFixed(1) }}%
                          </n-descriptions-item>
                          <n-descriptions-item label="吸血率">
                            {{ (playerStore.combatAttributes.vampireRate * 100).toFixed(1) }}%
                          </n-descriptions-item>
                        </n-descriptions>
                        <n-divider>战斗抗性</n-divider>
                        <n-descriptions bordered :column="3">
                          <n-descriptions-item label="抗暴击">
                            {{ (playerStore.combatResistance.critResist * 100 || 0).toFixed(1) }}%
                          </n-descriptions-item>
                          <n-descriptions-item label="抗连击">
                            {{ (playerStore.combatResistance.comboResist * 100 || 0).toFixed(1) }}%
                          </n-descriptions-item>
                          <n-descriptions-item label="抗反击">
                            {{ (playerStore.combatResistance.counterResist * 100 || 0).toFixed(1) }}%
                          </n-descriptions-item>
                          <n-descriptions-item label="抗眩晕">
                            {{ (playerStore.combatResistance.stunResist * 100 || 0).toFixed(1) }}%
                          </n-descriptions-item>
                          <n-descriptions-item label="抗闪避">
                            {{ (playerStore.combatResistance.dodgeResist * 100 || 0).toFixed(1) }}%
                          </n-descriptions-item>
                          <n-descriptions-item label="抗吸血">
                            {{ (playerStore.combatResistance.vampireResist * 100 || 0).toFixed(1) }}%
                          </n-descriptions-item>
                        </n-descriptions>
                        <n-divider>特殊属性</n-divider>
                        <n-descriptions bordered :column="4">
                          <n-descriptions-item label="强化治疗">
                            {{ (playerStore.specialAttributes.healBoost * 100 || 0).toFixed(1) }}%
                          </n-descriptions-item>
                          <n-descriptions-item label="强化爆伤">
                            {{ (playerStore.specialAttributes.critDamageBoost * 100 || 0).toFixed(1) }}%
                          </n-descriptions-item>
                          <n-descriptions-item label="弱化爆伤">
                            {{ (playerStore.specialAttributes.critDamageReduce * 100 || 0).toFixed(1) }}%
                          </n-descriptions-item>
                          <n-descriptions-item label="最终增伤">
                            {{ (playerStore.specialAttributes.finalDamageBoost * 100 || 0).toFixed(1) }}%
                          </n-descriptions-item>
                          <n-descriptions-item label="最终减伤">
                            {{ (playerStore.specialAttributes.finalDamageReduce * 100 || 0).toFixed(1) }}%
                          </n-descriptions-item>
                          <n-descriptions-item label="战斗属性提升">
                            {{ (playerStore.specialAttributes.combatBoost * 100 || 0).toFixed(1) }}%
                          </n-descriptions-item>
                          <n-descriptions-item label="战斗抗性提升">
                            {{ (playerStore.specialAttributes.resistanceBoost * 100 || 0).toFixed(1) }}%
                          </n-descriptions-item>
                        </n-descriptions>
                    </div>
                  </n-collapse-transition>
                </n-card>
                <router-view />
              </div>
            </n-layout-content>
          </n-layout>
        </n-spin>
        <!-- 离线报告优先：报告未确认前不让诞生窗压在它上面（两个居中弹窗会叠） -->
        <offline-report />
        <!-- 诞生弹窗必须挂在全局：子嗣在任何页面都可能临产（日钩子驱动） -->
        <birth-modal v-if="!playerStore.offlineReport" />
        <!-- 「叮」挂在全局：有喜可能发生在任何页面（晚间自动留宿） -->
        <ding-notice />
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
  import { useRouter, useRoute } from 'vue-router'
  import { usePlayerStore } from './stores/player'
  import { computed, ref } from 'vue'
  import { darkTheme } from 'naive-ui'
  import { Moon, Sunny } from '@vicons/ionicons5'
  import { getRealmName } from './plugins/realm'
  import { formatCountdown } from './plugins/dayDate'
  import { formatSecular, formatSpiritual } from './plugins/currency'
  import { herbTotalUnits, unitsOf } from './plugins/stacks'
  import { SAVE_WIPED_KEY } from './stores/modules/persistence'
  import TimeStatusIndicator from './components/TimeStatusIndicator.vue'
  import BirthModal from './components/BirthModal.vue'
  import OfflineReport from './components/OfflineReport.vue'
  import DingNotice from './components/DingNotice.vue'
  import MainNav from './components/MainNav.vue'

  const router = useRouter()
  const route = useRoute()
  const playerStore = usePlayerStore()
  /**
   * 顶栏材料汇总：探索产出在 `items`（灵植/灵材），旧灵草库存在 `herbs`。
   * 显示数量而不是明细 —— 明细去背包「材料 / 灵草」页签看。
   */
  const materialSummary = computed(() => {
    const items = playerStore.items || []
    // P57：灵植/灵材是「一条带 count」的堆，顶栏要报**件数**不是条目数
    const plantCount = items.filter(item => item.category === '灵植').reduce((s, i) => s + unitsOf(i), 0)
    const materialCount = items.filter(item => item.category === '灵材').reduce((s, i) => s + unitsOf(i), 0)
    const legacyHerbs = herbTotalUnits(playerStore.herbs)
    const parts = [`灵植 ${plantCount}`, `灵材 ${materialCount}`]
    if (legacyHerbs > 0) parts.push(`灵草 ${legacyHerbs}`)
    return parts.join(' · ')
  })
  /** 修为顶到上限、但被契合度/灵地门槛拦住 —— 自动突破不会发生，需要引导去修炼页 */
  const breakthroughBlocked = computed(
    () =>
      playerStore.cultivation >= playerStore.maxCultivation &&
      playerStore.isBreakthroughBlocked &&
      route.path !== '/cultivation'
  )
  const isLoading = ref(true) // 添加加载状态
  /** 顶部状态条默认只显示一行；基础/战斗/抗性等详情按需展开 */
  const showDetail = ref(false)
  /** 存档因版本更新被重置时置位 —— 用一条 alert 解释，避免玩家以为丢档 */
  const saveWiped = ref(false)

  // 初始化数据加载
  playerStore.initializePlayer().then(() => {
    isLoading.value = false
    // ⚠ P12.3：时钟必须在**读档完成之后**启动。之前放在 onMounted 里，
    //   旧档还没回灌就开始按默认 state tick，会先跑掉一段进度甚至覆盖存档。
    playerStore.startClock()
    playerStore.syncClockPause(route.path)
    // 读档时人还在外面（探索/秘境），别把玩家扔回一个冻住的镇守主界面
    if (route.path === '/') {
      if (playerStore.idleMode === 'secretRealm') router.push('/dungeon')
      else if (playerStore.idleMode === 'exploration') router.push('/exploration')
    }
  })

  // ⚠ 这里**过去**有一个 watch：非新玩家且停在 `/` 时自动跳 `/cultivation`。
  //   自「桂冈的一天」起 `/` 就是主界面，再跳走等于把玩家从主界面赶出去 —— 已删除。
  //   新玩家礼包的入口已搬进 `views/Day.vue`（`isNewPlayer` 为真时显示一条领取条）。

  /**
   * 关页 / 切走时补一次落盘。
   *
   * ⚠ 离线结算的**唯一基线**是存档里的 `lastOnlineRealMs`。各模块的 saveData 是节流的
   *   （睡觉、巡视等非练功时段可能很久才存一次），不补这一笔，离线时长会从「上一次存盘」
   *   起算 —— 等于把此前已在线跑掉的时间又算成离线收益。
   */
  const saveOnHide = () => playerStore.saveData()
  const onVisibilityHide = () => {
    if (document.visibilityState === 'hidden') saveOnHide()
  }

  onMounted(() => {
    // 游戏时钟在读档完成后的 initializePlayer().then 里启动（见上，P12.3）。
    // 存档因版本更新被清掉时解释一句
    if (localStorage.getItem(SAVE_WIPED_KEY) === '1') {
      saveWiped.value = true
      localStorage.removeItem(SAVE_WIPED_KEY)
    }
    window.addEventListener('pagehide', saveOnHide)
    document.addEventListener('visibilitychange', onVisibilityHide)
  })

  onUnmounted(() => {
    window.removeEventListener('pagehide', saveOnHide)
    document.removeEventListener('visibilitychange', onVisibilityHide)
    playerStore.stopClock()
  })

</script>

<style>
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  :root {
    --n-color: rgb(16, 16, 20);
    --n-text-color: rgba(255, 255, 255, 0.82);
  }

  /* 页面底色归 tokens.css 管（html / body 都是 --ui-paper），这里不再单独写。
     注意 .n-layout / .n-layout-content 自带 background-color: var(--n-color)，
     不盖掉的话「旧宣纸」只在页面边缘露一圈。 */

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans',
      'Helvetica Neue', sans-serif;
  }

  .n-config-provider,
  .n-layout {
    height: 100%;
    min-height: 100vh;
  }

  /* 特异度压过 Naive 自己的 .n-layout（0,1,0），不受样式注入顺序影响 */
  body .n-layout,
  body .n-layout-content {
    background-color: var(--ui-paper);
  }

  .header-content {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 16px;
  }

  /* ===== 一级导航第一行：标题 + 核心资源（UI 视觉规范 §1.3） =====
     无底线，靠留白与字号权重分隔。 */
  .n-layout-header.top-bar {
    background-color: var(--ui-paper);
  }

  .nav-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px 24px;
    flex-wrap: wrap;
    padding: 16px 0 6px;
  }

  .brand {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
  }

  .brand-title {
    font-size: 21px;
    font-weight: 700;
    letter-spacing: 3px;
    color: var(--ui-ink);
  }

  .brand-sub {
    font-size: 13px;
    letter-spacing: 2px;
    color: var(--ui-ink-sub);
  }

  .nav-core {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }

  .core-item {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    white-space: nowrap;
  }

  .core-item .k {
    font-size: 13px;
    color: var(--ui-ink-sub);
  }

  .core-item .v {
    font-size: 16px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--ui-ink);
  }

  @media (max-width: 720px) {
    .nav-top {
      padding: 12px 0 4px;
    }

    .brand-title {
      font-size: 18px;
    }
  }

  .content-wrapper {
    max-width: 1200px;
    margin: 0 auto;
    padding: 16px;
  }

  .n-card {
    margin-bottom: 16px;
  }

  /* ===== 顶部状态条：一行显示，详情按需展开 ===== */
  .status-card .n-card__content {
    padding: 10px 14px;
  }

  .status-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 16px;
    font-size: 13px;
    line-height: 1.7;
  }

  /* 第二行（货币 / 材料 / 强化石 / 洗命符）：与第一行留一点呼吸，别看成同一条 */
  .status-line.is-assets {
    margin-top: 4px;
  }

  .status-item {
    white-space: nowrap;
    color: var(--n-text-color);
  }

  /* 标签加粗 + 弱化色，数值保持正文色：一眼能分出「这是什么」和「是多少」 */
  .status-item .k {
    color: var(--n-text-color-3);
    font-weight: 700;
    letter-spacing: 0.02em;
    margin-right: 5px;
  }

  /* 身份信息：**数值**（桂冈 / 练气五层 / 炼体一层）比资源大两个字号；
     标签反而收小，避免「道号」「境界」抢视觉重心。 */
  .status-item.is-main {
    line-height: 1.45;
  }

  .status-item.is-main .k {
    font-size: 12px;
    font-weight: 600;
  }

  .status-item.is-main .v {
    font-size: 17px;
    font-weight: 700;
  }

  .status-toggle {
    margin-left: auto;
    opacity: 0.75;
    font-size: 12px;
  }

  .status-progress {
    margin-top: 6px;
  }

  .status-detail {
    padding-top: 8px;
  }

  .footer-content {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 12px;
  }

  ::-webkit-scrollbar {
    width: 12px;
    height: 12px;
  }

  ::-webkit-scrollbar-track {
    background-color: rgba(0, 0, 0, 0.03);
  }

  ::-webkit-scrollbar-thumb {
    background-color: rgba(0, 0, 0, 0.2);
    border-radius: 6px;
    border: 3px solid transparent;
    background-clip: padding-box;
  }

  ::-webkit-scrollbar-thumb:hover {
    background-color: rgba(0, 0, 0, 0.3);
  }

  html.dark ::-webkit-scrollbar-track {
    background-color: rgba(255, 255, 255, 0.03);
  }

  html.dark ::-webkit-scrollbar-thumb {
    background-color: rgba(255, 255, 255, 0.2);
  }

  html.dark ::-webkit-scrollbar-thumb:hover {
    background-color: rgba(255, 255, 255, 0.3);
  }
</style>
