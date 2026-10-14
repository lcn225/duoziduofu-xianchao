<template>
  <n-card title="修行">
    <n-space vertical>
      <n-alert type="info" show-icon>
        <template #icon>
          <n-icon><book-outline /></n-icon>
        </template>
        四维契合度（功法 / 同参 / 灵地 / 本命）决定灵力积累的快慢。普通小境界积满修为即可突破，
        门槛节点（三、六、九层与筑基、结丹）还需契合度达标。
      </n-alert>

      <n-radio-group v-model:value="activePath" size="large">
        <n-radio-button value="inner">内功 · 练气</n-radio-button>
        <n-radio-button value="outer">外功 · 炼体</n-radio-button>
      </n-radio-group>

      <n-card size="small" :title="`当前境界 · ${pathLabel}`">
        <n-space vertical>
          <div class="realm-line">
            <span class="realm-name">{{ playerStore.realm }}</span>
            <n-progress
              type="line"
              :percentage="pctOf(playerStore.cultivation, playerStore.maxCultivation)"
              :height="10"
              processing
            />
            <span class="realm-num">{{ playerStore.cultivation }} / {{ playerStore.maxCultivation }}</span>
          </div>
          <div class="realm-line">
            <span class="realm-name">{{ playerStore.bodyRealm }}</span>
            <n-progress
              type="line"
              color="#f0a020"
              :percentage="pctOf(playerStore.bodyCultivation, playerStore.maxBodyCultivation)"
              :height="10"
            />
            <span class="realm-num">{{ playerStore.bodyCultivation }} / {{ playerStore.maxBodyCultivation }}</span>
          </div>
        </n-space>
      </n-card>

      <n-space vertical>
        <n-button type="primary" size="large" block @click="cultivate" :disabled="playerStore.spirit < cultivationCost">
          {{ isOuter ? '修体魄' : '打坐修炼' }} (消耗 {{ cultivationCost }} 灵力 · 得 {{ cultivationGain }} 点)
        </n-button>
        <n-button
          :type="isAutoCultivating ? 'warning' : 'success'"
          size="large"
          block
          @click="toggleAutoCultivation"
        >
          {{ isAutoCultivating ? '停止自动修炼' : '开始自动修炼' }}
        </n-button>
        <n-button
          type="info"
          size="large"
          block
          @click="cultivateUntilBreakthrough"
          :disabled="playerStore.spirit < breakthroughCost || blockedByGate"
        >
          一键突破至{{ nextRealmName }}
        </n-button>
      </n-space>

      <n-alert v-if="blockedByGate" type="warning" show-icon>
        契合度不足，无法冲击{{ nextRealmName }}：需 {{ pct(playerStore.nextGateRequirement) }}，当前
        {{ pct(playerStore.overallHarmony) }}。
        <template v-if="playerStore.blockingDimensions.length">
          其中
          <b>{{ playerStore.blockingDimensions.map(d => `${d.name} ${pct(d.value)}`).join('、') }}</b>
          未达线 —— 试试改修更相合的功法、换个同参或迁往别处灵地。
        </template>
      </n-alert>

      <n-divider>契合度</n-divider>
      <div class="harmony-row">
        <div class="harmony-cell harmony-radar-cell">
          <HarmonyRadar :dims="dims" :gate="playerStore.nextGateRequirement" />
        </div>
        <div class="harmony-cell harmony-desc-cell">
          <n-descriptions bordered :column="1">
            <n-descriptions-item label="综合契合度">
              <b>{{ pct(playerStore.overallHarmony) }}</b>
            </n-descriptions-item>
            <n-descriptions-item label="灵力获取倍率">
              {{ playerStore.harmonySpeedMultiplier.toFixed(2) }} ×
              <span class="hint">（契合 0% 时半速，100% 时双倍）</span>
            </n-descriptions-item>
            <n-descriptions-item label="下一门槛">
              <template v-if="playerStore.nextGateRequirement > 0">
                {{ pct(playerStore.nextGateRequirement) }}
                <n-tag :type="blockedByGate ? 'error' : 'success'" size="small" :bordered="false">
                  {{ blockedByGate ? '未达标' : '已达标' }}
                </n-tag>
              </template>
              <template v-else>
                <span class="hint">普通小境界，无需契合度</span>
              </template>
            </n-descriptions-item>
            <n-descriptions-item label="炼体加成">
              <span class="hint">生命 +{{ playerStore.bodyBonus.health }} · 防御 +{{ playerStore.bodyBonus.defense }}</span>
            </n-descriptions-item>
          </n-descriptions>
        </div>
      </div>

      <n-divider>修行配置</n-divider>
      <n-tabs type="line">
        <n-tab-pane name="qiArt" tab="功法">
          <SwitchList :items="qiArtItems" :active-key="playerStore.practice.qiArts.active" @switch="onSwitchQiArt">
            <template #meta="{ item }">
              <div class="meta-line">
                <n-tag size="small" :bordered="false">{{ elementName(item.element) }}属性</n-tag>
                <n-tag size="small" :bordered="false">{{ artGradeOf(item).name }}</n-tag>
                <span class="hint">{{ item.level }} / {{ artGradeOf(item).maxLevel }} 层</span>
              </div>
              <div class="meta-line">
                <span>契合 {{ pct(item.preview) }}</span>
                <span class="hint">{{ item.feature }}</span>
              </div>
            </template>
          </SwitchList>
        </n-tab-pane>

        <n-tab-pane name="fateItem" tab="同参">
          <SwitchList :items="fateItemItems" :active-key="playerStore.practice.fateItems.active" @switch="onSwitchFateItem">
            <template #meta="{ item }">
              <div class="meta-line">
                <n-tag size="small" :bordered="false">{{ elementName(item.element) }}属性</n-tag>
                <n-tag size="small" :bordered="false">{{ item.quality }}</n-tag>
                <span class="hint">{{ item.kind }}</span>
              </div>
              <div class="meta-line">
                <span>契合 {{ pct(item.preview) }}</span>
                <span class="hint">{{ item.description }}</span>
              </div>
            </template>
          </SwitchList>
          <n-alert type="default" style="margin-top: 12px">
            切换同参会令<strong>原同参的祭炼程度减半</strong>（设计文档：切换后祭炼保留 50%）。
          </n-alert>
        </n-tab-pane>

        <n-tab-pane name="spiritLand" tab="灵地">
          <SwitchList
            :items="spiritLandItems"
            :active-key="playerStore.practice.spiritLand.current"
            :disabled-keys="lockedLandIds"
            @switch="onSwitchSpiritLand"
          >
            <template #meta="{ item }">
              <div class="meta-line">
                <n-tag size="small" :bordered="false">{{ elementName(item.element) }}属性</n-tag>
                <n-tag size="small" :bordered="false">{{ landLevelName(item.level) }}</n-tag>
              </div>
              <div class="meta-line">
                <span>契合 {{ pct(item.preview) }}</span>
                <span class="hint">{{ item.description }}</span>
              </div>
            </template>
          </SwitchList>
        </n-tab-pane>
      </n-tabs>

      <n-divider>修炼详情</n-divider>
      <n-descriptions bordered>
        <n-descriptions-item label="灵力获取速率">
          {{ (baseGainRate * playerStore.spiritRate * playerStore.harmonySpeedMultiplier).toFixed(2) }} / 秒
        </n-descriptions-item>
        <n-descriptions-item label="修炼效率">{{ cultivationGain }} 修为 / 次</n-descriptions-item>
        <n-descriptions-item label="突破所需修为">{{ pathMax }}</n-descriptions-item>
      </n-descriptions>

      <log-panel ref="logRef" title="修炼日志" />

      <n-divider />
      <n-popconfirm @positive-click="onScatter">
        <template #trigger>
          <n-button type="error" block :disabled="playerStore.level <= 3">
            散功重修{{ playerStore.practice.scatterCount ? `（已重修 ${playerStore.practice.scatterCount} 次）` : '' }}
          </n-button>
        </template>
        将清空灵力与内功修为、境界回到练气一层，契合度保留 50%，<br />
        换取永久加成：重修后修炼速度 ×{{ playerStore.rebirthCultivationMultiplier }}、灵力获取
        +{{ Math.round((playerStore.rebirthSpiritMultiplier - 1) * 100) }}%。<br />
        <b>外功不受影响。</b>确定要散功重修吗？
      </n-popconfirm>
    </n-space>
  </n-card>
</template>

<script setup>
  import { usePlayerStore } from '../stores/player'
  import { ref, computed, onUnmounted } from 'vue'
  import { NIcon } from 'naive-ui'
  import { BookOutline } from '@vicons/ionicons5'
  import LogPanel from '../components/LogPanel.vue'
  import HarmonyRadar from '../components/HarmonyRadar.vue'
  import SwitchList from '../components/SwitchList.vue'
  import { getCultivationCost, getCultivationGain, rollCultivationGain } from '../plugins/cultivationMath'
  import {
    QI_ARTS,
    FATE_ITEMS,
    SPIRIT_LANDS,
    LAND_LEVEL_NAMES,
    artGradeOf
  } from '../plugins/cultivationData'
  import { previewQiArtHarmony, previewFateItemHarmony, previewSpiritLandHarmony } from '../plugins/harmony'
  import { elementName } from '../plugins/wuxing'
  import { getRealmName } from '../plugins/realm'

  const playerStore = usePlayerStore()
  const logRef = ref(null)

  const baseGainRate = 1 // 基础灵力获取率
  const autoGainInterval = 1000 // 自动修炼的间隔（毫秒）

  const pct = v => `${((Number(v) || 0) * 100).toFixed(1)}%`
  const pctOf = (a, b) => Number((((Number(a) || 0) / (Number(b) || 1)) * 100).toFixed(2))
  const landLevelName = key => LAND_LEVEL_NAMES[key] || key

  // ---------- 修行路线 ----------
  const activePath = computed({
    get: () => playerStore.practice.activePath,
    set: value => playerStore.setActivePath(value)
  })
  const isOuter = computed(() => playerStore.practice.activePath === 'outer')
  const pathLabel = computed(() => (isOuter.value ? '外功 · 炼体' : '内功 · 练气'))

  // 内外功共用同一套公式，只是喂进去的等级不同
  const pathLevel = computed(() => (isOuter.value ? playerStore.bodyLevel : playerStore.level))
  const pathMax = computed(() => (isOuter.value ? playerStore.maxBodyCultivation : playerStore.maxCultivation))

  const cultivationCost = computed(() => getCultivationCost(pathLevel.value))
  const cultivationGain = computed(() => getCultivationGain(pathLevel.value))
  const nextRealmName = computed(() => getRealmName(pathLevel.value + 1).name)

  // 外功刻意不设契合度门槛 —— 内功被卡住时，炼体是一条始终可推进的路
  const blockedByGate = computed(() => !isOuter.value && playerStore.isBreakthroughBlocked)

  /** 「一键突破」大概需要多少灵力（按每次都拿基础收益保守估算） */
  const breakthroughCost = computed(() => {
    const remaining = Math.max(0, pathMax.value - (isOuter.value ? playerStore.bodyCultivation : playerStore.cultivation))
    return Math.ceil(remaining / Math.max(1, cultivationGain.value)) * cultivationCost.value
  })

  // ---------- 契合度雷达图 ----------
  const dims = computed(() => [
    { key: 'qiArt', name: '功法', value: playerStore.harmony.qiArt },
    { key: 'fateItem', name: '同参', value: playerStore.harmony.fateItem },
    { key: 'spiritLand', name: '灵地', value: playerStore.harmony.spiritLand },
    { key: 'destiny', name: '本命', value: playerStore.harmony.destiny }
  ])

  // ---------- 修行配置列表（带「切过去会是多少」的预览） ----------
  const qiArtItems = computed(() =>
    QI_ARTS.map(art => ({
      ...art,
      level: playerStore.practice.qiArts.known[art.id]?.level ?? 1,
      preview: previewQiArtHarmony(playerStore.practice, art.id)
    }))
  )

  const fateItemItems = computed(() =>
    FATE_ITEMS.map(item => ({
      ...item,
      level: playerStore.practice.fateItems.known[item.id]?.level ?? 1,
      preview: previewFateItemHarmony(playerStore.practice, item.id)
    }))
  )

  const spiritLandItems = computed(() =>
    SPIRIT_LANDS.map(land => ({ ...land, preview: previewSpiritLandHarmony(playerStore.practice, land.id) }))
  )

  const lockedLandIds = computed(() =>
    SPIRIT_LANDS.filter(l => !playerStore.practice.spiritLand.unlocked.includes(l.id)).map(l => l.id)
  )

  // ---------- 日志 ----------
  const showMessage = (type, content) => logRef.value?.addLog(type, content)

  // ---------- 修炼 ----------
  const applyGain = (amount, doubled) => {
    if (isOuter.value) playerStore.cultivateBody(amount)
    else playerStore.cultivate(amount)
    if (doubled) showMessage('success', '福缘不错，获得双倍收益！')
  }

  const cultivate = () => {
    const cost = cultivationCost.value
    if (playerStore.spirit < cost) {
      showMessage('error', '灵力不足！')
      return
    }
    const oldRealm = isOuter.value ? playerStore.bodyRealm : playerStore.realm
    playerStore.spirit -= cost
    const base = cultivationGain.value
    const gained = rollCultivationGain(pathLevel.value, playerStore.luck)
    applyGain(gained, gained > base)
    const newRealm = isOuter.value ? playerStore.bodyRealm : playerStore.realm
    if (newRealm !== oldRealm) {
      showMessage('success', `突破成功！已入${newRealm}！`)
    } else if (!isOuter.value && playerStore.isBreakthroughBlocked) {
      showMessage('info', `修为已满，但契合度不足（需 ${pct(playerStore.nextGateRequirement)}）`)
    }
  }

  // 自动修炼
  const isAutoCultivating = ref(false)
  const cultivationTimer = ref(null)

  const autoTick = () => {
    if (playerStore.spirit < cultivationCost.value) return
    const oldRealm = isOuter.value ? playerStore.bodyRealm : playerStore.realm
    playerStore.spirit -= cultivationCost.value
    const base = cultivationGain.value
    const gained = rollCultivationGain(pathLevel.value, playerStore.luck)
    applyGain(gained, gained > base)
    const newRealm = isOuter.value ? playerStore.bodyRealm : playerStore.realm
    if (newRealm !== oldRealm) showMessage('success', `突破成功！已入${newRealm}！`)
  }

  const toggleAutoCultivation = () => {
    isAutoCultivating.value = !isAutoCultivating.value
    if (isAutoCultivating.value) {
      if (!cultivationTimer.value) cultivationTimer.value = setInterval(autoTick, autoGainInterval)
    } else {
      stopAutoCultivation()
    }
  }

  const stopAutoCultivation = () => {
    if (cultivationTimer.value) {
      clearInterval(cultivationTimer.value)
      cultivationTimer.value = null
    }
    isAutoCultivating.value = false
  }

  // ---------- 一键突破（走 Worker 批量计算） ----------
  const cultivationWorker = new Worker(new URL('../workers/cultivation.js', import.meta.url), { type: 'module' })
  // Worker 是异步的，用这个记住发起时选的是哪条线，避免中途切换路线导致收益记错
  let pendingOuter = false

  cultivationWorker.onmessage = ({ data }) => {
    if (data.type === 'error') {
      showMessage('error', data.message)
      return
    }
    if (data.type !== 'success') return
    const { spiritCost, cultivationGain: gained, doubleGainTimes } = data.result
    const target = pendingOuter
    playerStore.spirit -= spiritCost
    if (target) playerStore.cultivateBody(gained)
    else playerStore.cultivate(gained)
    if (doubleGainTimes > 0) showMessage('success', `福缘不错，获得 ${doubleGainTimes} 次双倍收益！`)

    if (playerStore.cultivation >= playerStore.maxCultivation || playerStore.bodyCultivation >= playerStore.maxBodyCultivation) {
      if (!target && playerStore.isBreakthroughBlocked) {
        showMessage('info', `修为已满，但契合度不足（需 ${pct(playerStore.nextGateRequirement)}）`)
      } else {
        showMessage('success', '修炼完成，已积满修为')
      }
    } else {
      showMessage('success', '修炼成功！')
    }
  }

  const cultivateUntilBreakthrough = () => {
    if (blockedByGate.value) {
      showMessage('error', `契合度不足，无法冲击${nextRealmName.value}`)
      return
    }
    // 修为已满则不必再打坐，直接突（外功由 cultivateBody 内部自动触发）
    const progress = isOuter.value ? playerStore.bodyCultivation : playerStore.cultivation
    if (progress >= pathMax.value) {
      const ok = isOuter.value ? playerStore.tryBodyBreakthrough() : playerStore.tryBreakthrough()
      showMessage(ok ? 'success' : 'error', ok ? `突破成功！已入${isOuter.value ? playerStore.bodyRealm : playerStore.realm}！` : '契合度不足，突破受阻')
      return
    }
    pendingOuter = isOuter.value
    cultivationWorker.postMessage({
      type: 'cultivateUntilBreakthrough',
      playerData: {
        level: pathLevel.value,
        spirit: playerStore.spirit,
        cultivation: progress,
        maxCultivation: pathMax.value,
        luck: playerStore.luck
      }
    })
  }

  // ---------- 切换修行配置 ----------
  const onSwitchQiArt = id => {
    const r = playerStore.switchQiArt(id)
    showMessage(r.success ? 'success' : 'error', r.message)
  }
  const onSwitchFateItem = id => {
    const r = playerStore.switchFateItem(id)
    showMessage(r.success ? 'success' : 'error', r.message)
  }
  const onSwitchSpiritLand = id => {
    const r = playerStore.switchSpiritLand(id)
    showMessage(r.success ? 'success' : 'error', r.message)
  }

  const onScatter = () => {
    const r = playerStore.scatterCultivation()
    showMessage(r.success ? 'success' : 'error', r.message)
  }

  onUnmounted(stopAutoCultivation)
</script>

<style scoped>
  .realm-line {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .realm-name {
    flex: 0 0 88px;
    font-weight: 500;
  }

  .realm-line :deep(.n-progress) {
    flex: 1 1 auto;
  }

  .realm-num {
    flex: 0 0 auto;
    font-size: 12px;
    opacity: 0.7;
  }

  .meta-line {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 4px;
    font-size: 13px;
  }

  .hint {
    opacity: 0.65;
    font-size: 12px;
  }

  /* 用 flex 而非响应式 grid：窄屏自动换行，且不会横向溢出 */
  .harmony-row {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .harmony-cell {
    min-width: 0;
  }

  .harmony-radar-cell {
    flex: 1 1 260px;
  }

  .harmony-desc-cell {
    flex: 2 1 320px;
  }
</style>
