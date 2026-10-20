<template>
  <n-config-provider :theme="playerStore.isDarkMode ? darkTheme : null">
    <n-message-provider>
      <n-dialog-provider>
        <n-spin :show="isLoading" description="正在加载游戏数据...">
          <n-layout>
            <n-layout-header bordered>
              <div class="header-content">
                <n-page-header>
                  <template #title>多子多福：开创仙朝</template>
                  <template #extra>
                    <n-space align="center" :size="16">
                      <time-status-indicator />
                      <n-button quaternary circle @click="playerStore.toggle">
                        <template #icon>
                          <n-icon>
                            <Sunny v-if="playerStore.isDarkMode" />
                            <Moon v-else />
                          </n-icon>
                        </template>
                      </n-button>
                    </n-space>
                  </template>
                </n-page-header>
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
                  探索战败，正在养伤 {{ formatDuration(playerStore.injuryRemainingSeconds) }}。
                  期间镇守日常暂停、不能外出。回「镇守」可以看养伤进度。
                </n-alert>
                <n-card size="small" class="status-card">
                  <!-- 顶部状态：压成一行，窄屏自然换行。详细信息按需展开 -->
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
                    <span class="status-item"><span class="k">灵力</span>{{ playerStore.spirit.toFixed(2) }}</span>
                    <!-- 货币 v2：凡俗层与修仙层分开显示，同层自动拆面额、不折算 -->
                    <span class="status-item">
                      <span class="k">凡俗</span>{{ formatSecular(playerStore.currency.secular) }}
                    </span>
                    <span class="status-item">
                      <span class="k">灵石</span>{{ formatSpiritual(playerStore.currency.spiritual) }}
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
                    indicator-text-color="rgba(255, 255, 255, 0.82)"
                    rail-color="rgba(32, 128, 240, 0.2)"
                    color="#2080f0"
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
                            {{ (playerStore.baseAttributes.attack || 0).toFixed(0) }}
                          </n-descriptions-item>
                          <n-descriptions-item label="防御力">
                            {{ (playerStore.totalDefense || 0).toFixed(0) }}
                          </n-descriptions-item>
                          <n-descriptions-item label="速度">
                            {{ (playerStore.baseAttributes.speed || 0).toFixed(0) }}
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
        <!-- 诞生弹窗必须挂在全局：子嗣在任何页面都可能临产（日钩子驱动） -->
        <birth-modal />
        <!-- 「叮」挂在全局：有喜可能发生在任何页面（晚间自动留宿） -->
        <ding-notice />
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
  import { useRouter, useRoute } from 'vue-router'
  import { usePlayerStore } from './stores/player'
  import { ref } from 'vue'
  import { darkTheme } from 'naive-ui'
  import { Moon, Sunny } from '@vicons/ionicons5'
  import { getRealmName } from './plugins/realm'
  import { formatDuration } from './plugins/dayDate'
  import { formatSecular, formatSpiritual } from './plugins/currency'
  import { SAVE_WIPED_KEY } from './stores/modules/persistence'
  import TimeStatusIndicator from './components/TimeStatusIndicator.vue'
  import BirthModal from './components/BirthModal.vue'
  import DingNotice from './components/DingNotice.vue'
  import MainNav from './components/MainNav.vue'

  const router = useRouter()
  const route = useRoute()
  const playerStore = usePlayerStore()
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

  onMounted(() => {
    // 游戏时钟在读档完成后的 initializePlayer().then 里启动（见上，P12.3）。
    // 存档因版本更新被清掉时解释一句
    if (localStorage.getItem(SAVE_WIPED_KEY) === '1') {
      saveWiped.value = true
      localStorage.removeItem(SAVE_WIPED_KEY)
    }
  })

  onUnmounted(() => {
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

  html.dark {
    background-color: var(--n-color);
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans',
      'Helvetica Neue', sans-serif;
  }

  .n-config-provider,
  .n-layout {
    height: 100%;
    min-height: 100vh;
  }

  .header-content {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 16px;
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

  .n-page-header__title {
    padding: 16px 0;
    margin: 0 16px;
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
