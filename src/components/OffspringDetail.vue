<!--
  子嗣详情卡（P41 #4，2026-10-25）

  凡出现子嗣名的地方（子嗣页 / 秘境整备 / 家族树 / 历练流水）点名字都弹这**同一张**卡，
  所以内容只在这里维护一份。调用方只需给 `childId`。

  ⚠ 只收 **id**，按 id 回 store 里现取 —— 子嗣行每 tick 都会重新 map 出新对象，
    收行对象会读到过期快照（和装备弹窗同一个坑，见 InnerCourt.vue 的注释）。
  ⚠ 「战力」直接跑秘境实战同一套 `buildOffspringUnit` + `combatPowerOf`
    （真源《数值真值表》§5.5），不另立公式；打不了秘境的人（凡人 / 未到练气二层 /
    陨落）unit 为 null，就只列装备面板。
-->
<template>
  <n-modal
    :show="show"
    preset="card"
    style="width: 640px; max-width: calc(100vw - 32px)"
    :bordered="false"
    :title="child ? child.name : '子嗣详情'"
    @update:show="value => emit('update:show', value)"
  >
    <n-empty v-if="!child" description="找不到这名子嗣（可能已被清理）" />

    <n-space v-else vertical size="large">
      <!-- 身份行：性别 / 第几代 / 状态 / 阶段·仙龄 -->
      <n-space align="center" :size="8" wrap>
        <n-tag size="small" :bordered="false" :color="{ color: genderMeta.color, textColor: '#fff' }">
          {{ genderMeta.long }}
        </n-tag>
        <n-tag size="small" :bordered="false">第 {{ child.generation || 1 }} 代</n-tag>
        <n-tag size="small" :bordered="false" :type="statusTag.type">{{ statusTag.label }}</n-tag>
        <n-text depth="3" style="font-size: 12px">{{ growthText }}</n-text>
      </n-space>

      <n-alert v-if="statusTag.note" :type="statusTag.alertType" :show-icon="true">
        {{ statusTag.note }}
      </n-alert>

      <!-- 出身 -->
      <n-descriptions :column="2" size="small" bordered label-placement="left">
        <n-descriptions-item label="生父">{{ child.fatherName || '桂冈' }}</n-descriptions-item>
        <n-descriptions-item label="生母">
          {{ child.motherName || '—' }}（诞下时{{ rankName(child.motherRankAtBirth) }}）
        </n-descriptions-item>
        <n-descriptions-item label="出身血脉" :span="2">
          {{ child.gender === 'female' ? '女儿线：其子女不计入子孙（Y 染只传男系）' : '男系子孙：其后代继续计入家族' }}
        </n-descriptions-item>
      </n-descriptions>

      <!-- 灵根 / 本命 / 词条 -->
      <div v-if="child.hasRoot">
        <n-descriptions :column="1" size="small" bordered label-placement="left">
          <n-descriptions-item label="灵根">
            {{ child.rootCount }} 系 · {{ rootCountName(child.rootCount) }}（{{ elementNames }}）
          </n-descriptions-item>
          <n-descriptions-item label="本命">{{ fateLabelOf(child) }}</n-descriptions-item>
          <n-descriptions-item label="词条">
            {{ traitNames || '无' }}
          </n-descriptions-item>
        </n-descriptions>
      </div>
      <n-alert v-else type="default" :show-icon="true" style="font-size: 12px">
        无灵根：不提供修炼加成，可安排家族岗位、不能出战。
      </n-alert>

      <!-- 修行 / 去处 -->
      <n-descriptions :column="2" size="small" bordered label-placement="left">
        <n-descriptions-item label="境界">
          {{ child.hasRoot ? realmName : '凡人' }}
        </n-descriptions-item>
        <n-descriptions-item label="修为进度">
          <template v-if="child.hasRoot && levelNeed">
            {{ formatAmount(child.cultivation || 0) }} / {{ formatAmount(levelNeed) }}
          </template>
          <!-- 封顶文案跟着 `offspringCultivation.maxLevel` 走，别再手写「练气九层」 -->
          <template v-else-if="child.hasRoot">已至{{ child.realmName }}圆满</template>
          <template v-else>—</template>
        </n-descriptions-item>
        <!-- B1：寿元按当前境界实时同步，凡人 80 / 练气 120 / 筑基 200 / 金丹 500（±5%） -->
        <n-descriptions-item label="仙龄 / 寿元" :span="2">{{ ageLifespanText }}</n-descriptions-item>
        <n-descriptions-item label="去处" :span="2">{{ whereabout }}</n-descriptions-item>
        <n-descriptions-item label="单个加成" :span="2">
          {{ bonusText }}
        </n-descriptions-item>
      </n-descriptions>

      <!-- 战力 / 装备 -->
      <n-descriptions :column="2" size="small" bordered label-placement="left">
        <n-descriptions-item label="战力" :span="2">
          <template v-if="unitPower != null">
            <n-text strong>{{ unitPower }}</n-text>
            <n-text depth="3" style="font-size: 12px">
              （气血 {{ statsText.maxHealth }} · 攻击 {{ statsText.damage }} ·
              防御 {{ statsText.defense }} · 速度 {{ statsText.speed }}）
            </n-text>
          </template>
          <n-text v-else depth="3">不可出战（凡人 / 未到练气二层 / 已不在）</n-text>
        </n-descriptions-item>
        <n-descriptions-item label="装备面板" :span="2">
          攻 +{{ panel.attack }} · 防 +{{ panel.defense }} · 生命 +{{ panel.health }} · 速 +{{ panel.speed }}
          <span style="color: #999; font-size: 12px">（加算在境界/灵根/本命之后）</span>
        </n-descriptions-item>
        <n-descriptions-item v-for="slot in equipSlots" :key="slot.key" :label="slot.name">
          {{ slot.item }}
        </n-descriptions-item>
      </n-descriptions>

      <!-- 家族 -->
      <n-descriptions :column="2" size="small" bordered label-placement="left">
        <n-descriptions-item label="配偶" :span="2">{{ spouseText }}</n-descriptions-item>
        <n-descriptions-item label="子女" :span="2">{{ childrenText }}</n-descriptions-item>
      </n-descriptions>

      <n-space v-if="showEquipButton" justify="end">
        <n-button size="small" type="primary" secondary @click="emit('open-equipment', child.id)">
          查看 / 更换装备
        </n-button>
      </n-space>
    </n-space>
  </n-modal>
</template>

<script setup>
  import { computed } from 'vue'
  import { usePlayerStore } from '../stores/player'
  import {
    formatOffspringGrowth,
    offspringGrowthOf,
    stageAtLeast,
    rootCountName,
    rankName,
    fateLabelOf,
    TUNING
  } from '../plugins/innerCourt'
  import { OFFSPRING_GENDER_META } from '../plugins/innerCourtData'
  import { ELEMENTS } from '../plugins/wuxing'
  import { formatAmount } from '../plugins/currency'
  import { buildOffspringUnit, combatPowerOf } from '../plugins/secretRealm'
  import {
    OFFSPRING_EQUIP_SLOTS,
    OFFSPRING_EQUIP_SLOT_NAME,
    offspringEquipmentOf,
    offspringPanelOf
  } from '../plugins/offspringEquipment'

  const props = defineProps({
    show: { type: Boolean, default: false },
    /** 只收 id：子嗣行每 tick 重新 map，收对象会读到过期快照 */
    childId: { type: String, default: '' },
    /** 只有子嗣页有装备弹窗，别的页面（秘境 / 家族树）不传这个就不显示按钮 */
    showEquipButton: { type: Boolean, default: false }
  })
  const emit = defineEmits(['update:show', 'open-equipment'])

  const playerStore = usePlayerStore()

  /**
   * 取**派生行**（`offspringRows` getter）而不是裸存档条目：
   * 加成 / 境界名 / 历练方式 / 岗位 / 养伤天数都是派生值，裸条目上没有。
   * 与子嗣页主表读的是同一个 getter，两边不会各算一套。
   */
  const child = computed(
    () => (playerStore.offspringRows || []).find(item => item.id === props.childId) || null
  )

  const genderMeta = computed(() => OFFSPRING_GENDER_META[child.value?.gender] || OFFSPRING_GENDER_META.male)

  const growthText = computed(() =>
    child.value ? formatOffspringGrowth(child.value, playerStore.clockGameTime) : ''
  )

  /** 仙龄 / 寿元（`offspringRows` 里的派生值，已含 ±5% 随机） */
  const ageLifespanText = computed(() => {
    const c = child.value
    if (!c) return '—'
    const age = Math.floor(Number(c.lifelongAge) || 0)
    const life = Math.floor(Number(c.lifespanYears) || 0)
    if (!life) return `${age} 岁`
    return `${age} / ${life} 岁${c.lifespanWarn ? '（寿元将尽）' : ''}`
  })

  /** 女儿到婚配阶段即为外嫁 —— 与 InnerCourt.vue 的 `isMarriedOut` 同一口径（判阶段，不读树） */
  const isMarriedOut = computed(() => {
    const c = child.value
    if (!c || c.gender !== 'female') return false
    return stageAtLeast(offspringGrowthOf(c, playerStore.clockGameTime), TUNING.growth.marryStage)
  })

  /**
   * 状态标签。`passed_away` 只有老档会有（子嗣老死不删条目），
   * 陨落者标出第几层，方便回看是哪一趟死的。
   */
  const statusTag = computed(() => {
    const c = child.value
    if (!c) return { label: '—', type: 'default', note: '', alertType: 'default' }
    if (c.status === 'fallen') {
      const floor = Number(c.deathFloor) || 0
      return {
        label: '陨落',
        type: 'error',
        alertType: 'error',
        note: floor ? `在秘境第 ${floor} 层陨落，不再提供修炼加成。` : '已陨落，不再提供修炼加成。'
      }
    }
    if (c.status === 'passed_away') {
      return { label: '逝', type: 'default', alertType: 'default', note: '已寿终（家族树里保留节点）。' }
    }
    if (c.injuryDays > 0) {
      return {
        label: '养伤中',
        type: 'warning',
        alertType: 'warning',
        note: `战败养伤，还剩 ${c.injuryDays} 天。养伤期间不历练、不打坐。`
      }
    }
    if (c.gender === 'female' && isMarriedOut.value) {
      return {
        label: '已外嫁',
        type: 'default',
        alertType: 'default',
        note: '女儿外嫁，其子女不计入子孙（不影响她自己提供的加成）。'
      }
    }
    return { label: '存活', type: 'success', note: '', alertType: 'default' }
  })

  const elementNames = computed(() => {
    const roots = Array.isArray(child.value?.roots) ? child.value.roots : []
    return roots.map(element => ELEMENTS[element] || element).filter(Boolean).join('、') || '—'
  })

  const traitNames = computed(() => (child.value?.traits || []).map(t => t.name).join('、'))

  const realmName = computed(() => child.value?.realmName || '—')

  /** 本境界还差多少修为；已满九层的行 `realmMaxed` 为 true */
  const levelNeed = computed(() => (child.value?.realmMaxed ? 0 : child.value?.cultivationNeed || 0))

  /** 去处：历练方式 / 家族岗位 —— 只挑一条说 */
  const whereabout = computed(() => {
    const c = child.value
    if (!c) return '—'
    if (c.status === 'fallen' || c.status === 'passed_away') return '不在'
    if (!c.hasRoot) {
      return c.jobName ? `家族岗位：${c.jobName}` : '未安排岗位（无灵根，不能出战）'
    }
    return `历练：${c.expeditionModeName || '仅打坐'}`
  })

  const bonusText = computed(() => {
    const c = child.value
    if (!c?.hasRoot) return '—（无灵根不提供修炼加成）'
    if (c.status === 'fallen') return '—（已陨落，加成取消）'
    const raw = Number(c.bonus)
    return Number.isFinite(raw) ? `+${(raw * 100).toFixed(1)}%` : '—'
  })

  const unit = computed(() => {
    const c = child.value
    if (!c) return null
    return buildOffspringUnit(c, { nowSeconds: playerStore.clockGameTime })
  })
  const unitPower = computed(() => (unit.value ? combatPowerOf(unit.value) : null))
  const statsText = computed(() => {
    const stats = unit.value?.stats || {}
    return {
      maxHealth: Math.round(Number(stats.maxHealth ?? stats.health) || 0),
      damage: Math.round(Number(stats.damage) || 0),
      defense: Math.round(Number(stats.defense) || 0),
      speed: Math.round(Number(stats.speed) || 0)
    }
  })

  const panel = computed(() => offspringPanelOf(child.value))

  const equipSlots = computed(() => {
    const equipment = offspringEquipmentOf(child.value)
    return OFFSPRING_EQUIP_SLOTS.map(slot => ({
      key: slot,
      name: OFFSPRING_EQUIP_SLOT_NAME[slot] || slot,
      item: equipment[slot]
        ? `${equipment[slot].displayName || equipment[slot].name}（${equipment[slot].tier} 阶 ${equipment[slot].quality}）`
        : '空'
    }))
  })

  const spouseText = computed(() => {
    const c = child.value
    if (!c) return '—'
    if (c.gender === 'female') return isMarriedOut.value ? '已外嫁' : '未到婚配'
    if (c.status === 'fallen' || c.status === 'passed_away') return '—'
    if (!c.spouse) return '未婚'
    const state =
      c.spouseStatus === 'pregnant' ? ' · 孕中' : c.spouseStatus === 'recovering' ? ' · 产后恢复' : ''
    return `${c.spouse.name}（${rankName(c.spouse.rank)} · ${rootCountName(c.spouse.rootCount)}）${state}`
  })

  const childrenText = computed(() => {
    const c = child.value
    if (!c) return '—'
    if (c.gender === 'female') return '—（女儿线不建模后代）'
    const n = c.childrenIds?.length || 0
    return `${n} / ${TUNING.breeding.maxBirthsPerCouple}（同父同上限）`
  })

</script>
