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
  -->
  <n-modal
    :show="births.length > 0"
    preset="dialog"
    :title="`子嗣诞生 — ${births.length} 位`"
    :closable="false"
    :mask-closable="false"
    :close-on-esc="false"
    :style="{ maxWidth: '90vw', width: '900px' }"
  >
    <n-space vertical>
      <n-alert :type="rootedCount ? 'success' : 'default'" show-icon>
        本日诞下 {{ births.length }} 位子嗣，其中有灵根 {{ rootedCount }} 位，
        修行加成 +{{ (totalBonus * 100).toFixed(1) }}%
      </n-alert>

      <n-scrollbar style="max-height: 60vh">
        <n-grid :cols="2" :x-gap="12" :y-gap="8">
          <n-grid-item v-for="c in births" :key="c.id">
            <n-card size="small" :style="{ borderColor: qualityOf(c).color }">
              <template #header>
                <n-space justify="space-between" align="center">
                  <span>{{ c.name }}</span>
                  <n-tag size="small" :style="{ color: qualityOf(c).color }">
                    {{ c.hasRoot ? qualityOf(c).name : '无灵根' }}
                  </n-tag>
                </n-space>
              </template>
              <n-space vertical size="small">
                <template v-if="c.hasRoot">
                  <n-text>灵根：{{ c.rootCount }} 系（{{ elementNames(c.roots) }}）</n-text>
                  <n-text>本命：{{ c.fate?.name || '—' }}</n-text>
                  <n-text>词条：{{ (c.traits || []).map(t => t.name).join('、') || '无' }}</n-text>
                  <n-text strong type="primary">修行加成 +{{ (bonusOf(c) * 100).toFixed(1) }}%</n-text>
                </template>
                <n-text v-else depth="3">无灵根 —— 不提供修炼加成</n-text>
                <n-text depth="3">母：{{ c.motherName }}</n-text>
              </n-space>
            </n-card>
          </n-grid-item>
        </n-grid>
      </n-scrollbar>

      <n-text depth="3">
        确认前时间保持冻结。诞生结果已随存档落盘，刷新也不会丢。
      </n-text>
    </n-space>

    <template #action>
      <n-space justify="end">
        <n-button type="primary" @click="confirm">确认</n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup>
  import { computed } from 'vue'
  import { usePlayerStore } from '../stores/player'
  import { offspringBonusOf, playerFateProfile } from '../plugins/innerCourt'
  import { QUALITY_META } from '../plugins/innerCourtData'
  import { ELEMENTS } from '../plugins/wuxing'

  const playerStore = usePlayerStore()

  const births = computed(() => playerStore.pendingBirths)
  const rootedCount = computed(() => births.value.filter(c => c.hasRoot).length)
  const totalBonus = computed(() => playerStore.offspringCultivationBonus)

  const profile = computed(() => playerFateProfile(playerStore.practice))
  const bonusOf = c => offspringBonusOf({ child: c, ...profile.value })
  const qualityOf = c => QUALITY_META[c.quality] || QUALITY_META.low
  const elementNames = roots => (roots || []).map(e => ELEMENTS[e] || e).join('/')

  /**
   * 确认 —— 队列清空后由 action 内部释放 'birth' 事件持有者。
   * 释放后时钟会回到「路由暂停」或「推进中」，取决于当前在哪个页面，
   * 这一步不需要 App.vue 再插手（applyState 是从持有者派生的）。
   */
  const confirm = () => {
    playerStore.acknowledgeBirths(births.value.map(c => c.id))
  }
</script>
