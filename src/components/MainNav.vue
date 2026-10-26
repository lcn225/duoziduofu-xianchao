<template>
  <div class="main-nav">
    <!-- 一级：三大挂机模块。选中项按**当前页面**算，不按 idleMode 算 ——
         否则停在探索大厅（模式仍是镇守）时，点「镇守」会被判成「已经在镇守」而不跳转。 -->
    <!-- responsive：窄屏时溢出的一级项自动收进「…」子菜单。
         不加这个，Naive 的 horizontal menu 会直接 overflow:hidden 裁掉，
         「多子多福」排在最后，手机上就整个消失了（2026-10-21 用户反馈）。 -->
    <n-menu
      mode="horizontal"
      responsive
      :options="primaryOptions"
      :value="activeModuleKey"
      @update:value="goPrimary"
    />

    <!-- 二级：配置/管理页收进「更多」 -->
    <n-dropdown trigger="click" placement="bottom-end" :options="secondaryOptions" @select="goSecondary">
      <n-button quaternary>
        <n-icon style="margin-right: 6px">
          <AppstoreOutlined />
        </n-icon>
        <span class="more-label">{{ secondaryLabel }}</span>
        <n-icon style="margin-left: 4px">
          <DownOutlined />
        </n-icon>
      </n-button>
    </n-dropdown>
  </div>
</template>

<script setup>
  import { computed, h } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { NIcon, useMessage } from 'naive-ui'
  import {
    AppstoreOutlined,
    BankOutlined,
    BookOutlined,
    CompassOutlined,
    DownOutlined,
    ExperimentOutlined,
    GiftOutlined,
    HomeOutlined,
    MedicineBoxOutlined,
    SettingOutlined,
    SmileOutlined,
    TeamOutlined,
    TrophyOutlined
  } from '@ant-design/icons-vue'
  import { Flash } from '@vicons/ionicons5'
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

  /** 一级菜单的选中项：三个模块页按路由，其他页按「人现在在哪」 */
  const activeModuleKey = computed(() => {
    if (routeKey.value === '') return 'garrison'
    if (routeKey.value === 'innercourt') return 'innercourt'
    if (routeKey.value === 'exploration') return 'exploration'
    if (routeKey.value === 'dungeon') return 'secretRealm'
    // 建设是管理页（不是挂机模式），选中态按路由算，别落到 idleMode 上把「镇守」点亮
    if (routeKey.value === 'estate') return 'estate'
    return playerStore.idleMode
  })

  const primaryOptions = computed(() => [
    // 镇守永远能回（除非秘境挑战还没结束）—— 这是玩家「退出当前活动」的唯一出口
    { label: '镇守', key: 'garrison', icon: renderIcon(HomeOutlined), disabled: locked.value },
    // 三个模式互斥：在秘境里要先回镇守才能去探索，反之亦然
    { label: '探索', key: 'exploration', icon: renderIcon(CompassOutlined), disabled: locked.value || inSecretRealm.value },
    // 挑战进行中，秘境本身要可点 —— 否则离开页面后回不来
    { label: '秘境', key: 'secretRealm', icon: renderIcon(Flash), disabled: exploring.value },
    // 多子多福：与首页并列的一级模块（内宅 / 子嗣 / 家族树）。它不是挂机模式，只是管理页。
    // 放在秘境右边，避免把「镇守/探索/秘境」三个挂机模式拆开。
    { label: '多子多福', key: 'innercourt', icon: renderIcon(TeamOutlined), disabled: locked.value },
    // 建设（模块四 · 乡间建设）：管理与观战混合页，挂机进行中也能进 —— 不进锁态
    { label: '建设', key: 'estate', icon: renderIcon(BankOutlined) }
  ])

  const SECONDARY = [
    // 多子多福同时留一个「更多」入口：窄屏横向菜单再怎么收，这里都点得到
    { label: '多子多福', key: 'innercourt', icon: TeamOutlined },
    { label: '建设', key: 'estate', icon: BankOutlined },
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

  const secondaryLabel = computed(() => {
    const found = secondaryOptions.value.find(item => item.key === routeKey.value)
    return found ? found.label : '更多功能'
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
    justify-content: space-between;
    gap: 12px;
    padding-right: 8px;
    /* 窄屏时允许子项收缩，否则「更多」按钮会被挤出视口 */
    min-width: 0;
  }

  .main-nav :deep(.n-menu) {
    flex: 1 1 auto;
    min-width: 0;
  }

  /* 小屏只留图标，把宽度让给一级菜单 */
  @media (max-width: 720px) {
    .main-nav {
      gap: 4px;
    }

    .more-label {
      display: none;
    }
  }

  /* 一级模块要比普通菜单更显眼；二级收进右侧「更多」 */
  .main-nav :deep(.n-menu-item-content-header) {
    font-size: 15px;
    font-weight: 600;
  }

  .main-nav :deep(.n-menu-item) {
    margin-right: 4px;
  }
</style>
