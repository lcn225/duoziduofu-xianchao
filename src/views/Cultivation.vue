<template>
  <n-layout>
    <n-layout-header bordered>
      <n-page-header>
        <template #title>修行</template>
      </n-page-header>
    </n-layout-header>
    <n-layout-content>
      <!-- B5.5（2026-10-31）：外层 n-card + n-divider → page-stack + 分区框。
           只改结构与样式，内容一字未动。 -->
      <div class="page-stack">
      <n-alert type="info" show-icon>
        <template #icon>
          <n-icon><book-outline /></n-icon>
        </template>
        <b>修炼在「镇守」的练功环节自动进行（自动打坐、自动突破）；本页只做配置与数据查看。</b>
        <br />
        综合契合度 = 功法 × 同参 × 灵地（连乘，任何一项短板都会把整体拉低），它决定门槛能否达标；
        速度由灵地基础产出驱动。普通小境界积满修为即可突破，门槛节点（三、六、九层与筑基、金丹）
        还需契合度达标，筑基起还要求灵地品阶。本命决定灵根，也决定同参该找什么标签，灵气共 7 类
        （金木水火土 + 兽 + 器）。
      </n-alert>

      <section class="zone">
        <div class="zone-head">
          <span class="zone-title">当前境界</span>
        </div>
        <div class="zone-body">
          <div class="realm-line">
            <span class="realm-name">{{ playerStore.realm }}</span>
            <n-progress
              type="line"
              :percentage="pctOf(playerStore.cultivation, playerStore.maxCultivation)"
              :height="10"
            />
            <span class="realm-num">{{ playerStore.cultivation }} / {{ playerStore.maxCultivation }}</span>
          </div>
          <div class="realm-line">
            <span class="realm-name">{{ playerStore.bodyRealm }}</span>
            <n-progress
              type="line"
              color="var(--ui-gold)"
              rail-color="var(--ui-track)"
              :percentage="pctOf(playerStore.bodyCultivation, playerStore.maxBodyCultivation)"
              :height="10"
            />
            <span class="realm-num">{{ playerStore.bodyCultivation }} / {{ playerStore.maxBodyCultivation }}</span>
          </div>

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
        </div>
      </section>

      <section class="zone">
        <div class="zone-head">
          <span class="zone-title">契合度</span>
        </div>
        <div class="zone-body">
      <div class="harmony-row">
        <div class="harmony-cell harmony-radar-cell">
          <!-- gate 传 0：门槛看的是**连乘综合**，画「每维一条参考线」会暗示
               「每维都要单独过线」，是错的。达标与否由右侧数字表达。 -->
          <HarmonyRadar :dims="dims" :gate="0" />
        </div>
        <div class="harmony-cell harmony-desc-cell">
          <n-descriptions bordered :column="1">
            <n-descriptions-item label="门槛契合度">
              <b>{{ pct(playerStore.overallHarmony) }}</b>
              <span class="hint">
                ＝ 功法 {{ pct(playerStore.harmony.qiArt) }} × 同参
                {{ pct(playerStore.harmony.fateItem) }} × 灵地
                {{ pct(playerStore.harmony.spiritLand) }}
                （不含熟练度，只管突破）
              </span>
            </n-descriptions-item>
            <n-descriptions-item label="速度契合度">
              <b>{{ pct(playerStore.speedHarmony) }}</b>
              <span class="hint">
                ＝ 功法 {{ pct(playerStore.harmonyPair.speedQiArt) }} × 同参
                {{ pct(playerStore.harmonyPair.fateItem) }} × 灵地
                {{ pct(playerStore.harmonyPair.spiritLand) }}
                （含熟练度，只管修炼速度）
              </span>
            </n-descriptions-item>
            <n-descriptions-item label="本命灵根">
              <n-tag v-for="f in fateList" :key="f.id" size="small" :bordered="false" style="margin-right: 6px">
                {{ f.name }}（{{ elementName(f.element) }} · {{ tierName(f.tier) }}）
              </n-tag>
              <span class="hint">决定灵气属性，也决定同参的标签重合度</span>
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
        </div>
      </section>

      <section class="zone">
        <div class="zone-head">
          <span class="zone-title">修行配置</span>
        </div>
        <div class="zone-body">
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
            同参<strong>不能升级，只能更换</strong>，切换无代价。列表 = <strong>已拥有的物品</strong>
            （背包 / 已装备 / 出战中的灵宠）+ 开局五件，灵器 / 灵兽 / 灵植 / 灵材都能当同参。
            契合度 = <strong>标签重合度</strong>
            （交集权重 ÷ 本命总权重：顶层 1.0 / 中层 0.4 / 底层 0.25）。
            撞不上本命的核心意象就是 <strong>0</strong>，没有保底。
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
        </div>
      </section>

      <section v-if="legacyTraits.length" class="zone">
        <div class="zone-head">
          <span class="zone-title">传承词条</span>
        </div>
        <div class="zone-body">
          <n-space vertical :size="4">
            <n-space :size="6">
              <n-tag
                v-for="(t, i) in legacyTraits"
                :key="`${t.id}-${i}`"
                size="small"
                :bordered="false"
                type="warning"
              >
                {{ t.name }} +{{ ((Number(t.effect) || 0) * 100).toFixed(0) }}% · 得自 {{ t.fromChildName }}
              </n-tag>
            </n-space>
            <span class="hint">
              子嗣陨落 / 寿终时把自身词条交给桂冈，可叠加；与子嗣加成共用同一条软上限
              （练气 +200% / 筑基 +400% / 金丹 +700%）。
            </span>
          </n-space>
        </div>
      </section>

      <section class="zone">
        <div class="zone-head">
          <span class="zone-title">修炼详情</span>
        </div>
        <div class="zone-body">
      <n-descriptions bordered>
        <n-descriptions-item label="灵力获取速率">
          {{ playerStore.spiritPerGameHour.toFixed(2) }} / 游戏小时
          <span class="hint">（只在「镇守」的练功环节产出）</span>
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
        <n-descriptions-item label="内功修为上限">{{ playerStore.maxCultivation }}</n-descriptions-item>
        <n-descriptions-item label="外功修为上限">{{ playerStore.maxBodyCultivation }}</n-descriptions-item>
      </n-descriptions>

      <log-panel ref="logRef" title="配置日志" />
        </div>
      </section>

      <section class="zone">
        <div class="zone-head">
          <span class="zone-title">散功重修</span>
        </div>
        <div class="zone-body">
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
        </div>
      </section>
      </div>
    </n-layout-content>
  </n-layout>
</template>

<script setup>
  import { usePlayerStore } from '../stores/player'
  import { ref, computed } from 'vue'
  import { NIcon } from 'naive-ui'
  import { BookOutline } from '@vicons/ionicons5'
  import LogPanel from '../components/LogPanel.vue'
  import HarmonyRadar from '../components/HarmonyRadar.vue'
  import SwitchList from '../components/SwitchList.vue'
  import {
    QI_ARTS,
    SPIRIT_LANDS,
    artGradeOf,
    landOutput,
    fateItemViewOf
  } from '../plugins/cultivationData'
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

  /** 传承词条（子嗣陨落 / 寿终返还的 A 类词条，§15.5.4） */
  const legacyTraits = computed(() => playerStore.practice?.legacyTraits || [])

  /** 门槛不达标时，把「还差多少」和「哪一维最值得练」说清楚 */
  const gateHintDimension = computed(() => playerStore.bestImprovement)

  // 阈值只针对内功；外功没有契合度门槛，但本页不再提供修炼/突破按钮
  const blockedByGate = computed(() => playerStore.isBreakthroughBlocked)
  const nextRealmName = computed(() => getRealmName(playerStore.level + 1).name)

  // ---------- 契合度雷达图（三维）----------
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

  /**
   * 可选同参 = 已拥有的物品 + 开局五件 + 当前在用的那件（2026-10-22）。
   *
   * 以前这里只列 FATE_ITEMS 五件；宝匣/探索拿到的灵器灵兽灵植灵材全都
   * 进不了列表。现在按《模块一》§9.1「同一件物品可装备、可出战、可当同参」
   * 放开到所有已拥有物品，契合度按三层标签现算（B7，2026-10-28）。
   */
  const fateItemItems = computed(() => {
    const ids = new Set(playerStore.ownedFateItemIds || [])
    for (const id of Object.keys(playerStore.practice.fateItems.known || {})) ids.add(id)
    const active = playerStore.practice.fateItems.active
    if (active) ids.add(active)
    return [...ids]
      .map(id => fateItemViewOf(id))
      .filter(Boolean)
      .map(item => ({ ...item, preview: previewFateItemHarmony(playerStore.practice, item.id) }))
      .sort((a, b) => b.preview - a.preview || String(a.name).localeCompare(String(b.name)))
  })

  const spiritLandItems = computed(() =>
    SPIRIT_LANDS.map(land => ({ ...land, preview: previewSpiritLandHarmony(playerStore.practice, land.id) }))
  )

  const lockedLandIds = computed(() =>
    SPIRIT_LANDS.filter(l => !playerStore.practice.spiritLand.unlocked.includes(l.id)).map(l => l.id)
  )

  // ---------- 配置日志 ----------
  const showMessage = (type, content) => logRef.value?.addLog(type, content)

  // ---------- 切换修行配置 / 散功重修 ----------
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
    /* V1.2 验收线：辅助字号 ≥13px */
    opacity: 0.75;
    font-size: 13px;
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
