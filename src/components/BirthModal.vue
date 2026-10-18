<template>
  <!--
    全局诞生弹窗。子嗣在任何页面都可能临产（日钩子驱动），所以必须挂在 App.vue 上，
    不能塞进内宅页。

    ⚠ `:show` 是**单向**绑定，不是 v-model —— 写 v-model 到可写 ref 的话，
      玩家能点遮罩/ESC 把弹窗关掉，而 pendingBirthIds 还非空：
      时钟冻结在 paused_event 却没有出口，只能刷新。配合 closable/mask-closable
      全关，**唯一出口就是「确认」按钮**。

    ⚠ 多个子嗣同时诞生是**常态不是边缘情况**：同一晚受孕的侍妾会在同一天边界一起临产。
      所以这里必须批量渲染，而不是「一次弹一张、点完再弹下一张」。

    2026-10-17 新增：
      · 每个子嗣可改名（手输 / 随机 / 保留默认名）
      · 洗命符：消耗 1 张重抽灵根数量/属性/本命/词条（无灵根子嗣不能洗）
  -->
  <n-modal
    :show="births.length > 0"
    preset="dialog"
    :title="`子嗣诞生 — ${births.length} 位`"
    :closable="false"
    :mask-closable="false"
    :close-on-esc="false"
    :style="{ maxWidth: '90vw', width: '940px' }"
  >
    <n-space vertical>
      <!--
        P12.7：三个加成标签必须分清，别把「全家族总加成」写成「这次生娃的增量」：
          · 当前全家族总加成 —— 已套软上限，含本批
          · 本批新增 —— 本批子嗣的**原始**加成之和（未套软上限）
          · 卡片内 —— 该子嗣的单独加成
      -->
      <n-alert :type="rootedCount ? 'success' : 'default'" show-icon>
        <n-space vertical :size="2">
          <span>
            本日诞下 {{ births.length }} 位子嗣（子 {{ genderCounts.male }} · 女 {{ genderCounts.female }}），
            其中有灵根 {{ rootedCount }} 位。
          </span>
          <span>
            当前全家族总加成 <b>+{{ (familyTotalBonus * 100).toFixed(1) }}%</b>
            · 本批新增 <b>+{{ (batchBonus * 100).toFixed(1) }}%</b>
          </span>
        </n-space>
      </n-alert>

      <n-space align="center" justify="space-between">
        <n-text depth="3">确认前时间保持冻结；名字与洗命结果都随存档落盘。</n-text>
        <n-tag size="small" type="warning">{{ FATE_CHARM.name }} ×{{ playerStore.fateCharms }}</n-tag>
      </n-space>

      <n-scrollbar style="max-height: 60vh">
        <n-grid :cols="2" :x-gap="12" :y-gap="8">
          <n-grid-item v-for="c in births" :key="c.id">
            <n-card size="small">
              <template #header>
                <n-space justify="space-between" align="center">
                  <n-space align="center" :size="6">
                    <n-tag size="small" :type="c.gender === 'female' ? 'error' : 'info'" :bordered="false">
                      {{ genderOf(c).label }}
                    </n-tag>
                    <span>{{ nameDrafts[c.id] || c.name }}</span>
                  </n-space>
                </n-space>
              </template>
              <n-space vertical size="small">
                <!-- 改名 -->
                <n-space align="center" :size="6" :wrap="false">
                  <n-text depth="3" style="white-space: nowrap">姓名</n-text>
                  <n-input
                    v-model:value="nameDrafts[c.id]"
                    size="small"
                    maxlength="8"
                    placeholder="手动输入"
                    style="width: 150px"
                  />
                  <n-button size="tiny" secondary @click="randomize(c)">随机</n-button>
                </n-space>

                <template v-if="c.hasRoot">
                  <n-text>灵根：{{ c.rootCount }} 系（{{ elementNames(c.roots) }}）</n-text>
                  <n-text>本命：{{ c.fate?.name || '—' }}</n-text>
                  <n-text>词条：{{ (c.traits || []).map(t => t.name).join('、') || '无' }}</n-text>
                  <n-text strong type="primary">该子嗣加成 +{{ (bonusOf(c) * 100).toFixed(1) }}%</n-text>

                  <n-space align="center" justify="space-between">
                    <n-text depth="3" style="font-size: 12px">
                      洗命重抽灵根（数量与属性）、本命、词条；无灵根子嗣不能洗
                    </n-text>
                    <n-button
                      size="tiny"
                      type="warning"
                      secondary
                      :disabled="playerStore.fateCharms <= 0"
                      @click="reroll(c)"
                    >
                      洗命（消耗 1 张）
                    </n-button>
                  </n-space>
                </template>
                <n-text v-else depth="3">无灵根 —— 没有本命与词条，不提供修炼加成</n-text>
                <n-text depth="3">母：{{ c.motherName }}</n-text>
              </n-space>
            </n-card>
          </n-grid-item>
        </n-grid>
      </n-scrollbar>
    </n-space>

    <template #action>
      <n-space justify="end">
        <n-button type="primary" @click="confirm">确认</n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup>
  import { computed, ref, watch } from 'vue'
  import { useMessage } from 'naive-ui'
  import { usePlayerStore } from '../stores/player'
  import {
    offspringBonusOf,
    playerFateProfile,
    randomOffspringName,
    rootCountName
  } from '../plugins/innerCourt'
  import { FATE_CHARM, OFFSPRING_GENDER_META } from '../plugins/innerCourtData'
  import { ELEMENTS } from '../plugins/wuxing'

  const playerStore = usePlayerStore()
  const message = useMessage()

  const births = computed(() => playerStore.pendingBirths)
  const rootedCount = computed(() => births.value.filter(c => c.hasRoot).length)
  const genderCounts = computed(() => ({
    male: births.value.filter(c => c.gender !== 'female').length,
    female: births.value.filter(c => c.gender === 'female').length
  }))
  /** 全家族当前总加成（已套软上限，含本批） */
  const familyTotalBonus = computed(() => playerStore.offspringCultivationBonus)
  const genderOf = c => OFFSPRING_GENDER_META[c.gender] || OFFSPRING_GENDER_META.male

  const profile = computed(() => playerFateProfile(playerStore.practice))
  const bonusOf = c => offspringBonusOf({ child: c, ...profile.value })
  /** 本批新增 = 本批子嗣的**原始**加成之和（P12.7；不套软上限，与顶部总加成区分） */
  const batchBonus = computed(() => births.value.reduce((sum, c) => sum + bonusOf(c), 0))
  const elementNames = roots => (roots || []).map(e => ELEMENTS[e] || e).join('/')

  // ---------- 改名 ----------
  /** 每个子嗣一份名字草稿；默认就是出生时给的「桂大 / 桂二」 */
  const nameDrafts = ref({})

  watch(
    births,
    list => {
      const next = { ...nameDrafts.value }
      const ids = new Set((list || []).map(c => c.id))
      for (const c of list || []) {
        if (!(c.id in next)) next[c.id] = c.name
      }
      for (const id of Object.keys(next)) {
        if (!ids.has(id)) delete next[id]
      }
      nameDrafts.value = next
    },
    { immediate: true }
  )

  const existingNamesExcept = id =>
    (playerStore.offspring?.list || []).filter(c => c.id !== id).map(c => c.name)

  const randomize = c => {
    nameDrafts.value = {
      ...nameDrafts.value,
      [c.id]: randomOffspringName(playerStore.name, {
        existing: existingNamesExcept(c.id),
        gender: c.gender
      })
    }
  }

  // ---------- 洗命 ----------
  const reroll = c => {
    const result = playerStore.rerollOffspringFortune(c.id)
    if (!result.ok) {
      message.warning(result.message)
      return
    }
    const displayName = nameDrafts.value[c.id] || c.name
    message.success(
      `${displayName} 已洗命：${rootCountName(result.rootCount)}，本命 ${result.fate?.name || '—'}`
    )
  }

  // ---------- 确认 ----------
  const confirm = () => {
    const list = births.value
    const names = list.map(c => String(nameDrafts.value[c.id] || '').trim())

    if (names.some(name => !name)) {
      message.warning('名字不能为空')
      return
    }
    if (names.some(name => name.length > 8)) {
      message.warning('名字最多 8 个字')
      return
    }
    const duplicate = names.find((name, index) => names.indexOf(name) !== index)
    if (duplicate) {
      message.warning(`有两位子嗣都叫「${duplicate}」`)
      return
    }

    for (const c of list) {
      const result = playerStore.renameOffspring(c.id, nameDrafts.value[c.id])
      if (!result.ok) {
        message.warning(result.message)
        return
      }
    }
    playerStore.acknowledgeBirths(list.map(c => c.id))
  }
</script>
