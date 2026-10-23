// 子嗣页的两套表格列定义（2026-10-22 P28.5 从 InnerCourt.vue 抽出）
//
// 为什么抽出来：P27 #3「子嗣页太杂乱」要求「列定义抽文件」。视图本身 1200 行，
// 两套列定义占 170 行，改布局要先翻过它们。
//
// 依赖约定：本文件只 import 跨页可复用的纯函数与 Naive UI 组件；
// **视图本地的闭包（读时钟 ref、弹提示、调 store）由调用方从 deps 传进来**，
// 这样列定义不会反过来抓视图状态。
import { h } from 'vue'
import { NButton, NSelect, NTag } from 'naive-ui'
import {
  OFFSPRING_EQUIP_SLOTS,
  offspringEquippedCountOf
} from '../plugins/offspringEquipment'
import {
  TUNING,
  rankName,
  rootCountName,
  fateLabelOf,
  offspringRealmNameOf
} from '../plugins/innerCourt'
import { formatAmount } from '../plugins/currency'

/** 子嗣历练日结明细（原 InnerCourt.vue 876-920）。纯行数据，无视图闭包 */
export function createExpeditionColumns() {
  return [
    { title: '姓名', key: 'name', width: 110 },
    { title: '地图', key: 'mapName', width: 110 },
    { title: '档位', key: 'modeName', width: 110 },
    { title: '事件', key: 'events', width: 64, align: 'right' },
    {
      title: '战斗',
      key: 'battles',
      width: 90,
      render: row => (row.battles ? `${row.wins} 胜 ${row.losses} 负` : '—')
    },
    {
      title: '采集/拾遗',
      key: 'gathers',
      width: 100,
      render: row => `${row.gathers}/${row.pickups}`
    },
    { title: '灵石', key: 'stones', width: 80, align: 'right', render: row => row.stones || '—' },
    { title: '材料', key: 'items', width: 70, align: 'right', render: row => row.items || '—' },
    {
      title: '残页',
      key: 'fragments',
      width: 70,
      align: 'right',
      render: row => row.fragments || '—'
    },
    {
      title: '修为',
      key: 'cultivationGain',
      width: 82,
      align: 'right',
      render: row => (row.cultivationGain > 0 ? `+${formatAmount(row.cultivationGain)}` : '—')
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: row => {
        if (row.injured) return h('span', { style: 'color:#d03050' }, '养伤中')
        if (row.injuredNew) return h('span', { style: 'color:#d03050' }, '战败养伤')
        if (row.leveled) return h('span', { style: 'color:#18a058' }, `晋 ${offspringRealmNameOf(row.level)}`)
        return h('span', { style: 'color:#999' }, row.maxed ? '九层圆满' : '在外')
      }
    }
  ]
}

/**
 * 子嗣主表（原 InnerCourt.vue 956-1125）。
 * 渲染函数直接读 `growthText`，时钟走动时阶段/仙龄会跟着更新 ——
 * 所以这里收的是闭包本身，不是快照值。
 */
export function createOffspringColumns(deps) {
  const {
    genderOf,
    growthText,
    realmText,
    cultivationTip,
    expeditionOptions,
    onSetExpeditionMode,
    workable,
    workBlockedText,
    jobOptions,
    onAssignJob,
    isMarriedOut,
    elementNames,
    onOpenEquipment
  } = deps

  return [
    {
      title: '姓名',
      key: 'name',
      width: 120,
      render: row =>
        h('span', { style: 'display:inline-flex;align-items:center;gap:6px' }, [
          h(
            NTag,
            {
              size: 'small',
              type: row.gender === 'female' ? 'error' : 'info',
              bordered: false
            },
            { default: () => genderOf(row).label }
          ),
          row.name
        ])
    },
    {
      title: '阶段 / 仙龄',
      key: 'birthTime',
      width: 170,
      sorter: (a, b) => (a.birthTime || 0) - (b.birthTime || 0),
      render: row => growthText(row)
    },
    {
      title: '境界',
      key: 'realmLevel',
      width: 132,
      sorter: (a, b) => (a.realmLevel || 0) - (b.realmLevel || 0),
      render: row =>
        row.hasRoot
          ? h('span', { title: cultivationTip(row) }, realmText(row))
          : h('span', { style: 'color:#999' }, '凡人')
    },
    // 2026-10-20 按用户反馈重排：境界、岗位/历练、状态先看；
    // 灵根 / 本命 / 词条平时不查，挪到后半段。
    {
      title: '历练 / 岗位',
      key: 'job',
      width: 160,
      render: row => {
        if (row.status === 'fallen' || row.status === 'passed_away') {
          return h('span', { style: 'color:#999' }, '—')
        }
        if (row.hasRoot) {
          // 有灵根：练气二层起可派历练；不满二层继续后台打坐
          if (!row.expeditionEligible) {
            return h(
              'span',
              {
                style: 'color:#999',
                title: '有灵根子嗣自动修炼；练气二层后可历练'
              },
              '修炼中'
            )
          }
          return h(NSelect, {
            size: 'small',
            value: row.expeditionMode || 'cultivate',
            options: expeditionOptions,
            onUpdateValue: value => onSetExpeditionMode(row.id, value)
          })
        }
        if (!workable(row)) return h('span', { style: 'color:#999' }, workBlockedText(row))
        return h(NSelect, {
          size: 'small',
          value: row.job || null,
          clearable: true,
          placeholder: '安排',
          options: jobOptions,
          onUpdateValue: value => onAssignJob(row.id, value)
        })
      }
    },
    {
      title: '状态',
      key: 'status',
      width: 92,
      render: row => {
        if (row.status === 'fallen') {
          return h(NTag, { size: 'small', bordered: false, type: 'error' }, { default: () => '陨落' })
        }
        if (row.status === 'passed_away') {
          return h(NTag, { size: 'small', bordered: false }, { default: () => '已故' })
        }
        if (row.injuryDays > 0) {
          return h(
            NTag,
            { size: 'small', bordered: false, type: 'warning' },
            { default: () => '养伤中' }
          )
        }
        return h(NTag, { size: 'small', bordered: false, type: 'success' }, { default: () => '存活' })
      }
    },
    // P36 第 3 步子嗣装备：4 槽里只开 攻 / 防（同参走课题 B、灵兽未做）。
    // 陨落 / 已故的子嗣也留按钮 —— 否则装备会永久锁在名单里，没有卸下的出口。
    {
      title: '装备',
      key: 'equipment',
      width: 92,
      render: row => {
        const dead = row.status === 'fallen' || row.status === 'passed_away'
        const count = offspringEquippedCountOf(row)
        if (dead) {
          return count
            ? h(
                NButton,
                {
                  size: 'tiny',
                  quaternary: true,
                  onClick: () => onOpenEquipment(row)
                },
                { default: () => '卸装备' }
              )
            : h('span', { style: 'color:#999' }, '—')
        }
        return h(
          NButton,
          {
            size: 'tiny',
            quaternary: true,
            type: count ? 'primary' : 'default',
            onClick: () => onOpenEquipment(row)
          },
          { default: () => `装备 ${count}/${OFFSPRING_EQUIP_SLOTS.length}` }
        )
      }
    },
    {
      title: '加成',
      key: 'bonus',
      width: 92,
      align: 'right',
      sorter: (a, b) => a.bonus - b.bonus,
      render: row =>
        row.status === 'fallen'
          ? h('span', { style: 'color:#999' }, '—')
          : h(
              'span',
              { style: 'color:#18a058;font-weight:600' },
              `+${(row.bonus * 100).toFixed(1)}%`
            )
    },
    {
      title: '子女',
      key: 'childrenIds',
      width: 76,
      align: 'right',
      sorter: (a, b) => (a.childrenIds?.length || 0) - (b.childrenIds?.length || 0),
      render: row => {
        const n = row.childrenIds?.length || 0
        if (!n) return h('span', { style: 'color:#999' }, '—')
        return `${n}/${TUNING.breeding.maxBirthsPerCouple}`
      }
    },
    {
      title: '配偶',
      key: 'spouse',
      width: 170,
      ellipsis: { tooltip: true },
      render: row => {
        if (row.status === 'fallen') return h('span', { style: 'color:#999' }, '—')
        if (row.gender === 'female') return isMarriedOut(row) ? '已外嫁' : '—'
        if (!row.spouse) return h('span', { style: 'color:#999' }, '未婚')
        const state =
          row.spouseStatus === 'pregnant' ? '（孕）' : row.spouseStatus === 'recovering' ? '（产后）' : ''
        const roots = rootCountName(row.spouse.rootCount)
        return `${row.spouse.name} · ${rankName(row.spouse.rank)} · ${roots}${state}`
      }
    },
    {
      title: '灵根',
      key: 'rootCount',
      width: 170,
      ellipsis: { tooltip: true },
      sorter: (a, b) => (a.rootCount || 0) - (b.rootCount || 0),
      render: row => (row.hasRoot ? `${row.rootCount} 系 · ${elementNames(row.roots)}` : '—')
    },
    {
      title: '本命',
      key: 'fate',
      width: 140,
      ellipsis: { tooltip: true },
      render: row => fateLabelOf(row)
    },
    {
      title: '词条',
      key: 'traits',
      width: 180,
      ellipsis: { tooltip: true },
      render: row =>
        row.hasRoot ? (row.traits || []).map(t => t.name).join('、') || '无' : '—'
    },
    {
      title: '生母',
      key: 'motherName',
      width: 150,
      ellipsis: { tooltip: true },
      render: row => `${row.motherName || '—'}（${rankName(row.motherRankAtBirth)}）`
    }
  ]
}
