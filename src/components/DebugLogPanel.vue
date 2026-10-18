<template>
  <n-space vertical :size="16">
    <n-card title="调试日志（P15.6）" size="small">
      <n-space vertical :size="12">
        <n-space align="center" :size="12" wrap>
          <n-switch :value="enabled" @update:value="toggle" />
          <n-tag :type="enabled ? 'success' : 'default'" size="small">
            {{ enabled ? '每游戏工作日一条' : '不采集' }}
          </n-tag>
          <n-button size="small" @click="chooseDirectory">选择日志目录</n-button>
          <n-button size="small" :disabled="!enabled" @click="flushNow">立即结算当前日</n-button>
          <n-button size="small" :disabled="!records.length" @click="exportLog">导出 JSONL</n-button>
          <n-button size="small" type="error" ghost :disabled="!records.length && !pending" @click="clearLog">
            清空缓冲
          </n-button>
        </n-space>

        <n-alert type="info" :bordered="false" style="padding: 8px 12px">
          日志按<b>游戏工作日</b>（06:00 换日）记一条，只存在于内存和你在下面选的
          <code>log/debug.jsonl</code>，<b>不进游戏存档</b>。刷新页面后目录要重新选一次。
          写盘用 File System Access API —— Chrome / Edge 桌面版可用。
        </n-alert>

        <n-text depth="3">{{ status }}</n-text>
        <n-text v-if="dirName" depth="3">目录：{{ dirName }}</n-text>
        <n-text v-if="writeError" type="error">写盘错误：{{ writeError }}</n-text>
      </n-space>
    </n-card>

    <n-card v-if="pending" title="当天实时进度（未结算）" size="small">
      <n-space :size="20" wrap>
        <n-text>第 {{ pending.day + 1 }} 日</n-text>
        <n-text>练功 {{ fmt(pending.hours?.practice, 2) }}h</n-text>
        <n-text>炼体 {{ fmt(pending.hours?.body, 2) }}h</n-text>
        <n-text>灵力 +{{ fmt(pending.spirit, 1) }}</n-text>
        <n-text>修为 +{{ fmt(pending.cultivation, 1) }}</n-text>
        <n-text>体魄 +{{ fmt(pending.bodyCultivation, 1) }}</n-text>
        <n-text>体力 −{{ fmt(pending.staminaSpent, 0) }}</n-text>
      </n-space>
    </n-card>

    <n-card :title="`已记录 ${records.length} 个工作日`" size="small">
      <n-empty v-if="!records.length" description="还没有记录。开启后等一个游戏工作日（约 96 现实秒）或点「立即结算当前日」。" />
      <n-data-table
        v-else
        :columns="columns"
        :data="rows"
        :bordered="false"
        :single-line="false"
        size="small"
        :max-height="560"
      />
    </n-card>
  </n-space>
</template>

<script setup>
  import { computed, h } from 'vue'
  import { usePlayerStore } from '../stores/player'
  import { useMessage } from 'naive-ui'
  import { saveAs } from 'file-saver'

  const store = usePlayerStore()
  const message = useMessage()

  const debugState = computed(() => store.debugState)
  const enabled = computed(() => debugState.value.enabled)
  const records = computed(() => debugState.value.records)
  const pending = computed(() => store.debugPendingView)
  const status = computed(() => debugState.value.status)
  const dirName = computed(() => debugState.value.dirName)
  const writeError = computed(() => debugState.value.writeError)

  const fmt = (value, digits = 1) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return '—'
    return n.toFixed(digits)
  }

  const pct = value => (value == null ? '—' : `${Math.round(value * 100)}%`)

  /** 实/计划 · 达成率 —— 达成率偏离 100% 时标色 */
  const ratioCell = (actual, expected, ratio, digits = 1) =>
    h('span', {}, [
      h('span', {}, `${fmt(actual, digits)} / ${fmt(expected, digits)}`),
      h(
        'span',
        {
          style: {
            marginLeft: '6px',
            color: ratio == null ? '#999' : ratio >= 0.95 ? '#18a058' : '#d03050'
          }
        },
        pct(ratio)
      )
    ])

  const rows = computed(() => [...records.value].reverse())

  const columns = [
    {
      title: '工作日',
      key: 'label',
      width: 90,
      render: row =>
        h('span', {}, [
          row.label,
          row.partial ? h('span', { style: { color: '#d03050', marginLeft: '4px' } }, '†') : null
        ])
    },
    {
      title: '模式',
      key: 'reason',
      width: 78,
      render: row => (row.reason === 'day' ? '换日' : row.reason === 'manual' ? '手动' : '中断')
    },
    {
      title: '练功 h',
      key: 'practiceHours',
      width: 90,
      render: row => `${fmt(row.hours?.practice, 2)} / ${row.expectedHours?.practice ?? 0}`
    },
    {
      title: '灵力 实/计划',
      key: 'spirit',
      width: 160,
      render: row => ratioCell(row.spirit?.actual, row.spirit?.expected, row.spirit?.ratio)
    },
    {
      title: '修为 实/计划',
      key: 'cultivation',
      width: 160,
      render: row => ratioCell(row.cultivation?.actual, row.cultivation?.expected, row.cultivation?.ratio)
    },
    {
      title: '熟练度 实/计划',
      key: 'proficiency',
      width: 150,
      render: row =>
        ratioCell(
          Number(row.proficiency?.actualPct) * 100,
          Number(row.proficiency?.expectedPct) * 100,
          row.proficiency?.ratio,
          3
        )
    },
    {
      title: '体力 耗/白天计划',
      key: 'stamina',
      width: 130,
      render: row => `${fmt(row.stamina?.spent, 0)} / ${fmt(row.stamina?.expectedSpent, 0)}`
    },
    {
      title: '突破门槛',
      key: 'gate',
      width: 130,
      render: row => {
        const gate = row.gate || {}
        if (!(gate.requirement > 0)) return '无门槛'
        return h(
          'span',
          { style: { color: gate.blocked ? '#d03050' : '#18a058' } },
          `${gate.harmony} / ${gate.requirement}${gate.blocked ? ' ✗' : ' ✓'}`
        )
      }
    },
    {
      title: '覆盖',
      key: 'coveredDays',
      width: 60,
      render: row => (row.coveredDays > 1 ? `${row.coveredDays} 天` : '1 天')
    }
  ]

  const toggle = value => {
    const result = store.debugSetEnabled(value)
    message.info(result.message)
  }

  const chooseDirectory = async () => {
    const result = await store.debugChooseDirectory()
    if (result.success) message.success(result.message)
    else message.warning(result.message)
  }

  const flushNow = () => {
    const result = store.debugFlushNow()
    if (result.success) message.success(result.message)
    else message.warning(result.message)
  }

  const exportLog = () => {
    const text = store.debugExportText()
    if (!text) {
      message.warning('缓冲里还没有记录')
      return
    }
    saveAs(
      new Blob([text], { type: 'application/json;charset=utf-8' }),
      `debug-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jsonl`
    )
    message.success('已导出内存缓冲')
  }

  const clearLog = () => {
    store.debugClear()
    message.success('已清空调试缓冲（不影响游戏存档）')
  }
</script>
