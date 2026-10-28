<template>
  <!--
    离线汇总报告（《模块九》§四 · 居中弹窗）。

    ⚠ 通知纪律：离线报告只允许是**居中弹窗**（四档里的最高一档），
      所以 closable / mask-closable / close-on-esc 全关，唯一出口是「确认」。
    ⚠ 报告内容**只来自快照差与 action 返回值**，不从 dayLoop.log / 内宅流水反推 ——
      那两个环形日志分别只有 40 / 50 条，180 天必然被覆盖。
  -->
  <n-modal
    :show="!!report"
    preset="dialog"
    title="闭关归来"
    :closable="false"
    :mask-closable="false"
    :close-on-esc="false"
    :style="{ maxWidth: '92vw', width: '720px' }"
  >
    <n-space v-if="report" vertical :size="12">
      <n-alert :type="report.pausedByFall ? 'error' : 'info'" show-icon>
        <n-space vertical :size="2">
          <span>
            你离开了现世 <b>{{ realLabel }}</b>（游戏内经过 <b>{{ daysLabel }}</b>）。
          </span>
          <span v-if="report.capped" depth="3">
            已触离线上限（180 游戏天），超出部分不结算。
          </span>
        </n-space>
      </n-alert>

      <!-- 唯一暂停点：子嗣陨落 -->
      <n-alert v-if="report.pausedByFall" type="error" show-icon>
        子嗣 {{ fallenNames }} 在秘境第 {{ report.pausedByFall.floor }} 层陨落，
        结算在第 {{ report.daysSettled.toFixed(0) }} 个游戏日中断。
      </n-alert>

      <n-card size="small" title="收益汇总">
        <n-descriptions :column="2" size="small" label-placement="left">
          <n-descriptions-item label="修为">
            +{{ Math.round(report.cultivation.gained).toLocaleString() }}
            <template v-if="report.cultivation.breakthroughCount">
              （突破 {{ report.cultivation.breakthroughCount }} 次）
            </template>
          </n-descriptions-item>
          <!-- P53 #6：镇上勾了炼体的话离线也涨体魄，以前只在线上看得到 -->
          <n-descriptions-item label="体魄">
            +{{ Math.round(report.cultivation.bodyGained || 0).toLocaleString() }}
          </n-descriptions-item>
          <n-descriptions-item label="境界">
            {{ report.cultivation.fromRealm || '—' }} → {{ report.cultivation.toRealm || '—' }}
          </n-descriptions-item>
          <n-descriptions-item label="一阶灵石">
            +{{ Math.round(report.gains.stones).toLocaleString() }}
          </n-descriptions-item>
          <n-descriptions-item label="大子">
            +{{ Math.round(report.gains.secular || 0).toLocaleString() }}
          </n-descriptions-item>
          <n-descriptions-item label="灵材 / 灵植">
            {{ Math.round(report.gains.items).toLocaleString() }} 件
          </n-descriptions-item>
          <n-descriptions-item label="宝匣">
            {{ report.gains.chests }} 个（未开启，已入背包）
          </n-descriptions-item>
          <n-descriptions-item label="丹方残页">
            {{ report.gains.fragments }}
          </n-descriptions-item>
          <n-descriptions-item label="洗练石 / 洗命符">
            {{ report.gains.refinementStones }} / {{ report.gains.fateCharms }}
          </n-descriptions-item>
          <!-- B4b（《炼体药浴》§9.4）：药浴池离线也在转，得让玩家看得见 -->
          <n-descriptions-item v-if="report.bath?.converted || report.bath?.medicinePct" label="药浴池">
            转换 {{ report.bath.converted }} 件 · 五系药力最高 {{ report.bath.medicinePct }}%
          </n-descriptions-item>
          <n-descriptions-item label="新添子嗣">
            {{ report.births.count }} 名（有灵根 {{ report.births.withSpiritRoot }}）
          </n-descriptions-item>
        </n-descriptions>
      </n-card>

      <n-card v-if="obituaryTotal > 0" size="small" title="内宅讣告">
        <n-space vertical :size="6">
          <span>
            妻妾 <b>{{ report.obituary.wifeCount }}</b> 人、子嗣
            <b>{{ report.obituary.offspringCount }}</b> 人已作古（已移入家族树）。
          </span>
          <n-collapse>
            <n-collapse-item title="查看名单" name="names">
              <n-space vertical :size="2">
                <span v-if="report.obituary.wives.length">
                  妻妾：{{ report.obituary.wives.map(w => w.name).join('、') }}
                </span>
                <span v-if="report.obituary.offspring.length">
                  子嗣：{{ report.obituary.offspring.map(c => c.name).join('、') }}
                </span>
              </n-space>
            </n-collapse-item>
          </n-collapse>
        </n-space>
      </n-card>

      <n-card v-if="report.events.length" size="small" title="重大事件">
        <n-space vertical :size="2">
          <n-text v-for="(event, i) in report.events" :key="i" :type="eventType(event.kind)">
            {{ event.text }}
          </n-text>
        </n-space>
      </n-card>

      <n-alert v-if="report.cultivation.blocked" type="warning" show-icon>
        修为已满但未突破：请上线更换功法 / 同参 / 灵地。
      </n-alert>
    </n-space>

    <template #action>
      <n-button type="primary" @click="acknowledge">确认</n-button>
    </template>
  </n-modal>
</template>

<script setup>
  import { computed } from 'vue'
  import { usePlayerStore } from '../stores/player'

  const playerStore = usePlayerStore()
  const report = computed(() => playerStore.offlineReport)

  const fallenNames = computed(() => (report.value?.pausedByFall?.names || []).join('、') || '子嗣')

  const realLabel = computed(() => {
    const seconds = Math.max(Number(report.value?.realSeconds) || 0, 0)
    if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟`
    const hours = seconds / 3600
    return `${hours >= 10 ? hours.toFixed(0) : hours.toFixed(1)} 小时`
  })

  const daysLabel = computed(() => {
    const days = Math.max(Number(report.value?.gameDays) || 0, 0)
    return days >= 60 ? `${days.toFixed(0)} 天` : `${days.toFixed(1)} 天`
  })

  const obituaryTotal = computed(
    () =>
      Number(report.value?.obituary?.wifeCount || 0) +
      Number(report.value?.obituary?.offspringCount || 0)
  )

  const eventType = kind =>
    kind === 'danger' ? 'error' : kind === 'warn' ? 'warning' : kind === 'good' ? 'success' : 'info'

  const acknowledge = () => playerStore.acknowledgeOfflineReport()
</script>
