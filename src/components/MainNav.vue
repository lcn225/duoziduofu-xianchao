<template>
  <div class="main-nav">
    <!-- 一级：三大挂机模块 + 管理页。选中项按**当前页面**算，不按 idleMode 算 ——
         否则停在探索大厅（模式仍是镇守）时，点「镇守」会被判成「已经在镇守」而不跳转。

         2026-10-27 B3.5：从 `n-menu` 换成自绘按钮（UI 视觉规范 §1.3「两行式的第二行 = 书签/卷标」）。
         旧的 horizontal menu 必须开 `responsive` 才不会裁掉最后几项（2026-10-21 手机端
         「多子多福」整个消失），现在用 flex-wrap 换行，窄屏一行放不下就折到下一行。 -->
    <div class="nav-tabs">
      <button
        v-for="item in primaryModules"
        :key="item.key"
        type="button"
        class="nav-item"
        :class="{ on: activeModuleKey === item.key }"
        :disabled="item.disabled"
        @click="goPrimary(item.key)"
      >
        {{ item.label }}
      </button>

      <!-- 二级：配置/管理页收进「更多」 -->
      <n-dropdown
        trigger="click"
        placement="bottom-start"
        :options="secondaryOptions"
        @select="goSecondary"
      >
        <button type="button" class="nav-item nav-more" :class="{ on: isSecondaryActive }">
          <span>{{ secondaryLabel }}</span>
          <n-icon :size="12"><DownOutlined /></n-icon>
        </button>
      </n-dropdown>
    </div>
  </div>
</template>

<script setup>
  import { computed, h } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { NIcon, useMessage } from 'naive-ui'
  import {
    BankOutlined,
    BookOutlined,
    DownOutlined,
    ExperimentOutlined,
    GiftOutlined,
    MedicineBoxOutlined,
    SafetyCertificateOutlined,
    SettingOutlined,
    SmileOutlined,
    TeamOutlined,
    TrophyOutlined
  } from '@ant-design/icons-vue'
  import { usePlayerStore } from '../stores/player'

  const route = useRoute()
  const router = useRouter()
  const playerStore = usePlayerStore()
  const message = useMessage()

  const renderIcon = icon => () => h(NIcon, null, { default: () => h(icon) })

  const routeKey = computed(() => route.path.replace(/^\//, '').split('/')[0])
  const locked = computed(() => playerStore.secretRunActive)
  const exploring = computed(() => playerStore.idleMode === 'exploration')
  const inSecretRealm = computed(() => playerStore.idleMode === 'secretRealm')

  /** 一级页签的选中项：三个挂机页按路由，其他页按「人现在在哪」 */
  const activeModuleKey = computed(() => {
    if (routeKey.value === '') return 'garrison'
    if (routeKey.value === 'innercourt') return 'innercourt'
    if (routeKey.value === 'exploration') return 'exploration'
    if (routeKey.value === 'dungeon') return 'secretRealm'
    // 建设是管理页（不是挂机模式），选中态按路由算，别落到 idleMode 上把「镇守」点亮
    if (routeKey.value === 'estate') return 'estate'
    // 飞鹰门同理（2026-10-30）：它也是一级页签，不按路由算就会落到 idleMode
    // 而误点亮「镇守」（点进飞鹰门却显示还在镇守）。
    if (routeKey.value === 'faction') return 'faction'
    return playerStore.idleMode
  })

  /**
   * 一级页签。**不带图标** —— V1.2 废掉了底栏大图标，全靠字号/底色区分。
   * disabled 的口径与旧 n-menu 完全一致，别在改写时改语义。
   */
  const primaryModules = computed(() => [
    // 镇守永远能回（除非秘境挑战还没结束）—— 这是玩家「退出当前活动」的唯一出口
    { label: '镇守', key: 'garrison', disabled: locked.value },
    // 三个挂机模式互斥：在秘境里要先回镇守才能去探索，反之亦然
    { label: '探索', key: 'exploration', disabled: locked.value || inSecretRealm.value },
    // 挑战进行中，秘境本身要可点 —— 否则离开页面后回不来
    { label: '秘境', key: 'secretRealm', disabled: exploring.value },
    // 多子多福：与首页并列的一级模块（内宅 / 子嗣 / 家族树）。它不是挂机模式，只是管理页。
    { label: '多子多福', key: 'innercourt', disabled: locked.value },
    // 建设（模块四 · 乡间建设）：管理与观战混合页，挂机进行中也能进 —— 不进锁态
    { label: '建设', key: 'estate', disabled: false },
    // 飞鹰门（模块五 · 贡献点任务 + 秘库）：未解锁时**仍可点**，页面里给 Checklist 占位
    // （《模块解锁方针》§一：入口不许隐藏；灰显只管「挂机互斥」，不是等级门）
    { label: playerStore.factionUnlocked ? '飞鹰门' : '🔒飞鹰门', key: 'faction', disabled: locked.value }
  ])

  const SECONDARY = [
    // 多子多福同时留一个「更多」入口：窄屏横向页签再怎么折行，这里都点得到
    { label: '多子多福', key: 'innercourt', icon: TeamOutlined },
    { label: '建设', key: 'estate', icon: BankOutlined },
    { label: '飞鹰门', key: 'faction', icon: SafetyCertificateOutlined },
    { label: '修炼', key: 'cultivation', icon: BookOutlined },
    { label: '背包', key: 'inventory', icon: ExperimentOutlined },
    { label: '郑家宝阁', key: 'shop', icon: GiftOutlined },
    { label: '炼丹', key: 'alchemy', icon: MedicineBoxOutlined },
    { label: '成就', key: 'achievements', icon: TrophyOutlined },
    { label: '设置', key: 'settings', icon: SettingOutlined }
  ]

  const secondaryOptions = computed(() => {
    const items = SECONDARY.map(item => ({
      label: item.label,
      key: item.key,
      icon: renderIcon(item.icon)
    }))
    if (playerStore.isGMMode) {
      items.push({ label: 'GM调试', key: 'gm', icon: renderIcon(SmileOutlined) })
    }
    return items
  })

  /** 停在二级页时，按钮直接显示该页名字并点亮 —— 代替旧 n-menu 的内建选中态。
   *  「多子多福 / 建设」两份都在一级页签里，按路由算一级选中，这里不能再点亮成第二个「建设」。 */
  const isSecondaryActive = computed(
    () =>
      !primaryModules.value.some(item => item.key === routeKey.value) &&
      SECONDARY.some(item => item.key === routeKey.value)
  )

  const secondaryLabel = computed(() => {
    if (!isSecondaryActive.value) return '更多'
    return SECONDARY.find(item => item.key === routeKey.value)?.label || '更多'
  })

  const goPrimary = key => {
    if (key === 'garrison') {
      if (playerStore.secretRunActive) {
        message.warning('秘境挑战尚未结束，暂时不能回镇守')
        return
      }
      // 即使 idleMode 已经是 garrison，也要跳路由 ——
      // 「停在探索大厅但还没出发」正是之前点不回去的场景。
      if (playerStore.idleMode !== 'garrison') {
        const result = playerStore.switchIdleMode('garrison')
        if (!result.ok) {
          message.warning(result.reason || '现在不能回镇守')
          return
        }
      }
      if (route.path !== '/') router.push('/')
      return
    }

    if (key === 'innercourt') {
      if (route.path !== '/innercourt') router.push('/innercourt')
      return
    }

    if (key === 'estate') {
      // 建设是纯观战/配置页：探索、秘境进行中也能进（不打断当前挂机）
      if (route.path !== '/estate') router.push('/estate')
      return
    }

    if (key === 'faction') {
      // 飞鹰门：配置页，未解锁也能进（页内显示 Checklist），不进挂机互斥
      if (route.path !== '/faction') router.push('/faction')
      return
    }

    if (key === 'exploration') {
      if (playerStore.secretRunActive) {
        message.warning('秘境挑战尚未结束')
        return
      }
      if (playerStore.idleMode === 'secretRealm') {
        message.warning('请先回镇守，再出发探索')
        return
      }
      if (route.path !== '/exploration') router.push('/exploration')
      return
    }

    if (key === 'secretRealm') {
      if (playerStore.idleMode === 'exploration') {
        message.warning('正在探索，请先回镇守')
        return
      }
      if (route.path !== '/dungeon') router.push('/dungeon')
    }
  }

  const goSecondary = key => {
    router.push(`/${key}`)
  }
</script>

<style scoped>
  .main-nav {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  /* 书签/卷标：一行放不下就折行（旧的 n-menu 是裁掉，见模板顶部注释） */
  .nav-tabs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    padding: 2px 0 12px;
    min-width: 0;
  }

  /* UI 视觉规范 §1.3 */
  .nav-item {
    padding: 7px 16px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--ui-ink-sub);
    font-size: 14px;
    font-family: inherit;
    line-height: 1.4;
    cursor: pointer;
    transition: color 0.18s, background-color 0.18s, border-color 0.18s;
  }

  .nav-item:hover:not(:disabled):not(.on) {
    color: var(--ui-ink);
  }

  .nav-item.on {
    color: var(--ui-jade);
    font-weight: 700;
    background: var(--ui-surface);
    border-color: var(--ui-line-strong);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
  }

  .nav-item:disabled {
    opacity: 0.42;
    cursor: not-allowed;
  }

  .nav-more {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  @media (max-width: 720px) {
    .nav-item {
      padding: 6px 12px;
    }
  }
</style>
