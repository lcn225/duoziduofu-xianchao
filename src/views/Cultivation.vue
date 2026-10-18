<template>
  <n-card title="修行">
    <n-space vertical>
      <n-alert type="info" show-icon>
        <template #icon>
          <n-icon><book-outline /></n-icon>
        </template>
        综合契合度 = 功法 × 同参 × 灵地（连乘，任何一项短板都会把整体拉低），它决定门槛能否达标；
        速度则由灵地基础产出驱动。普通小境界积满修为即可突破，门槛节点（三、六、九层与筑基、结丹）
        还需契合度达标，筑基起还要求灵地品阶。本命决定灵根与同参的亲和档位，灵气共 7 类
        （金木水火土 + 兽 + 器）。
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
        <template v-if="!playerStore.isLandTierSufficient">
          灵地品阶不足，无法冲击{{ nextRealmName }}：需
          <b>{{ tierName(playerStore.nextLandRequirement) }}</b>
          灵地，当前在「{{ playerStore.currentSpiritLand?.name }}」（{{ tierName(playerStore.currentSpiritLand?.tier) }}）。
          <br />
        </template>
        契合度不足，无法冲击{{ nextRealmName }}：需 {{ pct(playerStore.nextGateRequirement) }}，当前
        {{ pct(playerStore.overallHarmony) }}，还差 {{ pct(playerStore.nextGateGap) }}。
        <template v-if="gateHintDimension">
          提升空间最大的是
          <b>{{ gateHintDimension.name }}（这一维拉满，综合最多还能提升 {{ pct(gateHintDimension.potential) }}）</b>
          —— 试试改修更匹配的功法、换个更接近本命的同参，或迁往属性相合的灵地。
        </template>
      </n-alert>

      <n-divider>契合度</n-divider>
      <div class="harmony-row">
        <div class="harmony-cell harmony-radar-cell">
          <!-- gate 传 0：门槛看的是**连乘综合**，画「每维一条参考线」会暗示
               「每维都要单独过线」，是错的。达标与否由右侧数字表达。 -->
          <HarmonyRadar :dims="dims" :gate="0" />
        </div>
        <div class="harmony-cell harmony-desc-cell">
          <n-descriptions bordered :column="1">
            <n-descriptions-item label="综合契合度">
              <b>{{ pct(playerStore.overallHarmony) }}</b>
              <span class="hint">
                ＝ 功法 {{ pct(playerStore.harmony.qiArt) }} × 同参
                {{ pct(playerStore.harmony.fateItem) }} × 灵地
                {{ pct(playerStore.harmony.spiritLand) }}
              </span>
            </n-descriptions-item>
            <n-descriptions-item label="本命灵根">
              <n-tag v-for="f in fateList" :key="f.id" size="small" :bordered="false" style="margin-right: 6px">
                {{ f.name }}（{{ elementName(f.element) }} · {{ tierName(f.tier) }}）
              </n-tag>
              <span class="hint">决定灵气属性与同参亲和档位</span>
            </n-descriptions-item>
            <n-descriptions-item label="下一门槛">
              <template v-if="playerStore.nextGateRequirement > 0">
                {{ pct(playerStore.nextGateRequirement) }}
                <n-tag :type="blockedByGate ? 'error' : 'success'" size="small" :bordered="false">
                  {{ blockedByGate ? '未达标' : '已达标' }}
                </n-tag>
                <n-tag
                  v-if="playerStore.nextLandRequirement"
                  :type="playerStore.isLandTierSufficient ? 'success' : 'error'"
                  size="small"
                  :bordered="false"
                  style="margin-left: 6px"
                >
                  需 {{ tierName(playerStore.nextLandRequirement) }}灵地
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
                <n-tag size="small" :bordered="false">{{ elementListText(item.elements) }}灵气</n-tag>
                <n-tag size="small" :bordered="false">{{ artGradeOf(item).name }}</n-tag>
                <span class="hint" title="层数由修炼时长派生，不影响契合度">
                  {{ item.level }} / {{ artGradeOf(item).maxLevel }} 层
                </span>
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
                <n-tag size="small" :bordered="false">{{ tierName(item.tier) }}</n-tag>
                <span class="hint">{{ item.kind }} · 灵气 {{ elementName(item.element) }}（只影响能否使用）</span>
              </div>
              <div class="meta-line">
                <span>契合 {{ pct(item.preview) }}</span>
                <span class="hint">{{ item.description }}</span>
              </div>
            </template>
          </SwitchList>
          <n-alert type="default" style="margin-top: 12px">
            同参<strong>不能升级，只能更换</strong>，切换无代价。契合度 = 接近度（正主 1.0 / 同系列 0.7 /
            同类型 0.4 / 无关 0.15）× <strong>min(同参品阶, 本命品阶)</strong> —— 本命品阶封顶同参，同参再好也越不过本命。
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
                <n-tag size="small" :bordered="false">{{ tierName(item.tier) }}</n-tag>
                <span class="hint">{{ landElementText(item.elements) }} · 基础产出 {{ landOutput(item) }}</span>
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
          {{ playerStore.spiritPerGameHour.toFixed(2) }} / 游戏小时
          <span class="hint">（只在「桂冈的一天」的练功环节产出）</span>
        </n-descriptions-item>
        <n-descriptions-item label="灵地基础产出">
          {{ playerStore.spiritLandOutput }}
          <span class="hint">（由灵地品阶决定，等级不进契合度）</span>
        </n-descriptions-item>
        <n-descriptions-item label="契合度项">
          {{ playerStore.fitFactor.toFixed(2) }} ×
          <span class="hint">（0% 契合 0.98×，100% 契合 1.30× —— 契合度是门票，不是收益引擎）</span>
        </n-descriptions-item>
        <n-descriptions-item label="本命数量系数">
          {{ playerStore.fateSpeedCoef.toFixed(1) }} ×
          <span class="hint">（本命越多修炼越慢，纯惩罚）</span>
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
  import { QI_ARTS, FATE_ITEMS, SPIRIT_LANDS, artGradeOf, landOutput } from '../plugins/cultivationData'
  import {
    previewQiArtHarmony,
    previewFateItemHarmony,
    previewSpiritLandHarmony,
    qiArtLevelOf,
    playerFates
  } from '../plugins/harmony'
  import { tierName } from '../plugins/tiers'
  import { elementName } from '../plugins/wuxing'
  import { getRealmName } from '../plugins/realm'
  import { register } from '../plugins/gameClock'

  const playerStore = usePlayerStore()
  const logRef = ref(null)

  const pct = v => `${((Number(v) || 0) * 100).toFixed(1)}%`
  const pctOf = (a, b) => Number((((Number(a) || 0) / (Number(b) || 1)) * 100).toFixed(2))

  /** 灵气属性集合 → 展示文案：['兽'] → 兽；['beast','vessel'] → 兽·器 */
  const elementListText = elements => (elements || []).map(elementName).join('·')

  /** 灵地属性权重表 → 兽 60% · 器 40% */
  const landElementText = elements =>
    Object.entries(elements || {})
      .map(([el, w]) => `${elementName(el)} ${Math.round(w * 100)}%`)
      .join(' · ')

  /** 玩家本命的灵气属性（本命决定灵根） */
  const fateList = computed(() => playerFates(playerStore.practice))

  /** 门槛不达标时，把「还差多少」和「哪一维最值得练」说清楚 */
  const gateHintDimension = computed(() => playerStore.bestImprovement)

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

  // ---------- 契合度雷达图（三维：本命契合整维已删除）----------
  const dims = computed(() => [
    { key: 'fateItem', name: '同参', value: playerStore.harmony.fateItem },
    { key: 'spiritLand', name: '灵地', value: playerStore.harmony.spiritLand },
    { key: 'qiArt', name: '功法', value: playerStore.harmony.qiArt }
  ])

  // ---------- 修行配置列表（带「切过去会是多少」的预览） ----------
  // 功法只列**已习得**的 —— 兽/器系功法在游戏里还没有获取途径（属模块四/五），
  // 列出来只会让玩家以为可以切
  const qiArtItems = computed(() =>
    QI_ARTS.filter(art => playerStore.practice.qiArts.known[art.id]).map(art => {
      const entry = playerStore.practice.qiArts.known[art.id]
      return {
        ...art,
        level: qiArtLevelOf(entry, art),
        preview: previewQiArtHarmony(playerStore.practice, art.id)
      }
    })
  )

  const fateItemItems = computed(() =>
    FATE_ITEMS.map(item => ({ ...item, preview: previewFateItemHarmony(playerStore.practice, item.id) }))
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

  // 自动修炼 —— 挂在全局游戏时钟的 onTick 上，不再自己开 setInterval。
  // 这样时钟一暂停（进管理界面）自动修炼就自动停，页面卸载时注销也不留钩子。
  const isAutoCultivating = ref(false)
  let unregisterAutoTick = null

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

  const stopAutoCultivation = () => {
    if (unregisterAutoTick) {
      unregisterAutoTick()
      unregisterAutoTick = null
    }
    isAutoCultivating.value = false
  }

  const toggleAutoCultivation = () => {
    isAutoCultivating.value = !isAutoCultivating.value
    if (isAutoCultivating.value) {
      if (!unregisterAutoTick) unregisterAutoTick = register('tick', autoTick)
    } else {
      stopAutoCultivation()
    }
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
