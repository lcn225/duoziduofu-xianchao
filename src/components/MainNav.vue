<template>
  <div class="main-nav">
    <!-- 一级：6 大类（修炼 / 多子多福 / 建设 / 飞鹰门 / 百艺 / 商业）+ 更多。
         选中态按**当前页面**算，不按 idleMode 算 —— 否则停在探索大厅（模式仍是镇守）时，
         点「镇守」会被判成「已经在镇守」而不跳转。

         2026-10-27 B3.5：从 `n-menu` 换成自绘按钮（UI 视觉规范 §1.3「两行式的第二行 = 书签/卷标」）。
         2026-11-14 标签页重构：一级导航从「挂机三连 + 管理页」重排成 6 大类，
         窄屏只显前 4 类（百艺 / 商业 收进「更多」）。
         旧的 horizontal menu 必须开 `responsive` 才不会裁掉最后几项（2026-10-21 手机端
         「多子多福」整个消失），现在用 flex-wrap 换行，窄屏一行放不下就折到下一行。 -->
    <div class="nav-tabs" :class="{ 'has-sub': activeChildren.length }">
      <button
        v-for="item in primaryModules"
        :key="item.key"
        type="button"
        class="nav-item"
        :class="{
          on: activeGroupKey === item.key,
          'has-sub': activeGroupKey === item.key && activeChildren.length,
          'is-wide-only': item.wideOnly
        }"
        :disabled="item.disabled"
        @click="goPrimary(item.key)"
      >
        {{ item.label }}
        <span v-if="item.dot" class="nav-dot" aria-label="有新内容" />
      </button>

      <!-- 二级：配置/管理页收进「更多」；窄屏时百艺 / 商业也并进来 -->
      <n-dropdown
        trigger="click"
        placement="bottom-start"
        :options="secondaryOptions"
        @select="goSecondary"
      >
        <button type="button" class="nav-item nav-more" :class="{ on: moreActive }">
          <span>{{ moreLabel }}</span>
          <n-icon :size="12"><DownOutlined /></n-icon>
        </button>
      </n-dropdown>
    </div>

    <!-- 二级子页签（2026-11-19 零散 #7b · 导航层级统一）：**每个模块的二级都在这里**，
         不再有「路由级在导航、页内级用 n-tabs」两套画法。
         视觉上接在选中父标签下面：父标签底边消失（`.nav-item.on.has-sub`），
         这一行是它的延续面板 —— 父子关系靠共用边框表达，不再单独套金框、也不再重复父名。
         建设 / 飞鹰门 / 更多 没有二级，`activeChildren` 为空，这一行不渲染。 -->
    <div v-if="activeChildren.length" class="nav-sub">
      <button
        v-for="child in activeChildren"
        :key="child.key"
        type="button"
        class="sub-item"
        :class="{ on: isChildActive(child), 'is-locked': child.locked }"
        :disabled="child.disabled"
        @click="goSub(child)"
      >
        {{ child.label }}
        <span v-if="child.dot" class="nav-dot" aria-label="有新内容" />
      </button>
    </div>
  </div>
</template>

<script setup>
  import { computed, h, onBeforeUnmount, onMounted, ref } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { NIcon, useMessage } from 'naive-ui'
  import {
    DownOutlined,
    ExperimentOutlined,
    GiftOutlined,
    MedicineBoxOutlined,
    SettingOutlined,
    SmileOutlined,
    TrophyOutlined
  } from '@ant-design/icons-vue'
  import { usePlayerStore } from '../stores/player'
  import { useUiStore } from '../stores/ui'
  import { ARTS, ART_LABELS } from '../plugins/arts'

  const route = useRoute()
  const router = useRouter()
  const playerStore = usePlayerStore()
  const uiStore = useUiStore()
  const message = useMessage()

  const renderIcon = icon => () => h(NIcon, null, { default: () => h(icon) })

  const routeKey = computed(() => route.path.replace(/^\//, '').split('/')[0])
  const locked = computed(() => playerStore.secretRunActive)
  const exploring = computed(() => playerStore.idleMode === 'exploration')
  const inSecretRealm = computed(() => playerStore.idleMode === 'secretRealm')
  /** 2026-11-22 S2：有子嗣能上工却没排岗 → 多子多福 / 子嗣 亮红点（只算无灵根） */
  const pendingJobs = computed(() => playerStore.pendingJobOffspringCount > 0)

  /** 挂机页路由：修炼组点一级时「默认落当前挂机页」，🏠 快捷入口也读这张表 */
  const IDLE_PATHS = { garrison: '/', exploration: '/exploration', secretRealm: '/dungeon' }

  /** 窄屏判定：只监听 matchMedia，不挂计时器（与 InnerCourt.vue 同做法） */
  const isNarrow = ref(false)
  let narrowMq = null
  const syncNarrow = event => {
    isNarrow.value = event.matches
  }

  onMounted(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    narrowMq = window.matchMedia('(max-width: 720px)')
    isNarrow.value = narrowMq.matches
    narrowMq.addEventListener('change', syncNarrow)
  })

  onBeforeUnmount(() => {
    if (narrowMq) narrowMq.removeEventListener('change', syncNarrow)
  })

  /**
   * 一级分组的选中态。路由 → 分组的映射是**唯一**口径：
   * 「修炼」吞掉四个子页（镇守 / 探索 / 秘境 / 功法·同参），「商业」吞掉背包 / 郑家宝阁，
   * 其余页（成就 / 设置 / GM）不算任何一级分组。
   */
  const activeGroupKey = computed(() => {
    const key = routeKey.value
    if (key === '' || key === 'exploration' || key === 'dungeon' || key === 'cultivation') return 'cultivate'
    if (key === 'innercourt') return 'innercourt'
    if (key === 'estate') return 'estate'
    if (key === 'faction') return 'faction'
    if (key === 'arts') return 'arts'
    if (key === 'inventory' || key === 'shop') return 'commerce'
    return ''
  })

  /**
   * 一级页签。**不带图标** —— V1.2 废掉了底栏大图标，全靠字号/底色区分。
   * `wideOnly` 的项在窄屏由 CSS 隐藏，改从「更多」进（《标签页 UI 重构》§2）。
   * disabled 的口径与旧版完全一致，别在改写时改语义。
   */
  const primaryModules = computed(() => [
    // 修炼组：点一级 = 回当前挂机页；子页在第二行（镇守永远是「退出当前活动」的出口）
    { label: '修炼', key: 'cultivate', disabled: false },
    // 多子多福：与首页并列的一级模块（内宅 / 子嗣 / 家族树在页内页签）。它不是挂机模式。
    { label: '多子多福', key: 'innercourt', disabled: locked.value, dot: pendingJobs.value },
    // 建设（模块四 · 乡间建设）：管理与观战混合页，挂机进行中也能进 —— 不进锁态
    { label: '建设', key: 'estate', disabled: false },
    // 飞鹰门（模块五 · 贡献点任务 + 秘库）：未解锁时**仍可点**，页面里给 Checklist 占位
    // （《模块解锁方针》§一：入口不许隐藏；灰显只管「挂机互斥」，不是等级门）
    { label: playerStore.factionUnlocked ? '飞鹰门' : '🔒飞鹰门', key: 'faction', disabled: locked.value },
    // 百艺 / 商业：窄屏隐藏，改从「更多」进
    { label: '百艺', key: 'arts', disabled: false, wideOnly: true },
    { label: '商业', key: 'commerce', disabled: false, wideOnly: true }
  ])

  /**
   * 当前一级分组的二级页签（2026-11-19 零散 #7b）。
   *
   * 两类条目：
   *   - `routeKey`：真正换路由的页（修炼 / 商业），点击仍走 `goChild` 的互斥 / 锁态逻辑；
   *   - `tab`：同一个路由内的页内页签（多子多福 / 百艺），点击只改 `uiStore.subTab`。
   * 两类在视觉上完全同构 —— 玩家不需要知道它换不换 URL。
   */
  const activeChildren = computed(() => {
    switch (activeGroupKey.value) {
      case 'cultivate':
        return [
          // 镇守永远能回（除非秘境挑战还没结束）—— 这是玩家「退出当前活动」的唯一出口
          { label: '镇守', key: 'garrison', routeKey: '', disabled: locked.value },
          // 三个挂机模式互斥：在秘境里要先回镇守才能去探索，反之亦然
          { label: '探索', key: 'exploration', routeKey: 'exploration', disabled: locked.value || inSecretRealm.value },
          // 挑战进行中，秘境本身要可点 —— 否则离开页面后回不来
          { label: '秘境', key: 'secretRealm', routeKey: 'dungeon', disabled: exploring.value },
          { label: '功法·同参', key: 'cultivation', routeKey: 'cultivation', disabled: false }
        ]
      case 'innercourt':
        return [
          { label: '内宅', key: 'night', tab: 'innercourt' },
          { label: '子嗣', key: 'offspring', tab: 'innercourt', dot: pendingJobs.value },
          { label: '家族树', key: 'family', tab: 'innercourt' }
        ]
      case 'arts':
        return ARTS.map(art => {
          const unlocked = playerStore.artUnlockedOf(art)
          return {
            label: unlocked ? ART_LABELS[art] || art : `🔒${ART_LABELS[art] || art}`,
            key: art,
            tab: 'arts',
            // 未解锁的艺仍可点开看残页进度（与旧版 n-tabs 的锁定页签行为一致），只降透明度
            locked: !unlocked
          }
        })
      case 'commerce':
        return [
          { label: '背包', key: 'inventory', routeKey: 'inventory', disabled: false },
          { label: '郑家宝阁', key: 'shop', routeKey: 'shop', disabled: false }
        ]
      default:
        return []
    }
  })

  /**
   * 二级条目的选中态。
   * ⚠ `garrison` 对应的路由是 `/`，`routeKey` 取出来是**空串** ——
   *   必须用条目自带的 `routeKey` 比，别拿 `child.key` 比，否则镇守永远不高亮。
   */
  const isChildActive = child => {
    if (child.tab) return uiStore.subTab[child.tab] === child.key
    return routeKey.value === child.routeKey
  }

  /** 「更多」里的固定低频项 */
  const SECONDARY = [
    { label: '成就', key: 'achievements', icon: TrophyOutlined },
    { label: '设置', key: 'settings', icon: SettingOutlined }
  ]

  /** 窄屏收进「更多」的两组（顺序 = 一级页签里被隐藏的顺序） */
  const NARROW_ONLY = [
    { label: '百艺', key: 'arts', icon: MedicineBoxOutlined },
    { label: '背包', key: 'inventory', icon: ExperimentOutlined },
    { label: '郑家宝阁', key: 'shop', icon: GiftOutlined }
  ]

  const secondaryOptions = computed(() => {
    const items = [...(isNarrow.value ? NARROW_ONLY : []), ...SECONDARY].map(item => ({
      label: item.label,
      key: item.key,
      icon: renderIcon(item.icon)
    }))
    if (playerStore.isGMMode) {
      items.push({ label: 'GM调试', key: 'gm', icon: renderIcon(SmileOutlined) })
    }
    return items
  })

  /**
   * 「更多」的选中态与文案。
   * 停在「更多」里的页时按钮直接显示该页名字（旧行为保留）；窄屏下当前在百艺 / 商业
   * 也归「更多」—— 因为那一项在一级里被隐藏了（《标签页 UI 重构》§2）。
   */
  const moreLabel = computed(() => {
    const key = routeKey.value
    const fixed = SECONDARY.find(item => item.key === key)
    if (fixed) return fixed.label
    if (isNarrow.value) {
      const narrowItem = NARROW_ONLY.find(item => item.key === key)
      if (narrowItem) return narrowItem.label
    }
    if (key === 'gm' && playerStore.isGMMode) return 'GM调试'
    return '更多'
  })

  const moreActive = computed(() => moreLabel.value !== '更多')

  const goPrimary = key => {
    // 修炼组：默认落**当前挂机页**（《标签页 UI 重构》§1）
    if (key === 'cultivate') {
      const idleKey = IDLE_PATHS[playerStore.idleMode] ? playerStore.idleMode : 'garrison'
      goChild(idleKey)
      return
    }
    if (key === 'commerce') {
      if (route.path !== '/inventory') router.push('/inventory')
      return
    }
    // 其余一级项都是单页
    goChild(key)
  }

  /**
   * 子页 / 单页的统一跳转。`garrison` 要把 idleMode 切回镇守（挂机互斥），
   * 其余三项挂机页走各自的互斥检查；管理页直接路由。
   */
  const goChild = key => {
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
      return
    }

    // 管理页 / 子页：直接路由
    if (route.path !== `/${key}`) router.push(`/${key}`)
  }

  /** 二级条目统一入口：路由项走 `goChild`，页内页签项只改共享 store（不换 URL） */
  const goSub = child => {
    if (child.disabled) return
    if (child.tab) {
      uiStore.setSubTab(child.tab, child.key)
      return
    }
    goChild(child.key)
  }

  const goSecondary = key => goChild(key)
</script>

<style scoped>
  .main-nav {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  /* 书签/卷标：一行放不下就折行（旧的 n-menu 是裁掉，见模板顶部注释）。
     ⚠ 必须占满整行：`.main-nav` 是 flex 容器，`.nav-tabs` 只是弹性项（宽度=内容宽），
     不写 `width: 100%` 的话下面 `.nav-more` 的 `margin-left: auto` 无处可推。 */
  .nav-tabs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    padding: 2px 0 12px;
    min-width: 0;
    width: 100%;
  }

  /* 有二级时不留底距：选中父标签要直接压在二级面板的上边框上（见 .nav-sub） */
  .nav-tabs.has-sub {
    padding-bottom: 0;
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

  /* 有二级的选中父标签：**底边消失**，向下压住二级面板的上边框 ——
     父标签与子行共用一条竖轴，父子关系由结构表达，不再各自套金框。
     没有二级的模块（建设 / 飞鹰门 / 更多）保持完整方框。 */
  .nav-item.on.has-sub {
    border-bottom-color: transparent;
    border-radius: 6px 6px 0 0;
    box-shadow: none;
    position: relative;
    z-index: 1;
    margin-bottom: -1px;
  }

  .nav-item:disabled {
    opacity: 0.42;
    cursor: not-allowed;
  }

  /* 「更多」永远贴到这一行的最右边（2026-10-31 用户要求）。
     窄屏折行时它自己占一行，也是右对齐；`margin-left: auto` 在 flex-wrap 下按「当前行」生效。 */
  .nav-more {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
  }

  /* ===== 二级面板（2026-11-19 零散 #7b · 导航层级统一） =====
     一块与选中父标签同底色、同边框的面板：父标签底边透明并压住它的上边框，
     读起来就是「这个书签打开了下面这一行」。
     左内边距 4px + `.sub-item` 自身 12px = 16px，与一级书签文字的竖线对齐。
     只准 var(--ui-*)，别写裸色值。 */
  .nav-sub {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px;
    /* 4 + 子项自身 12 = 16px，与 `.nav-item` 的 16px 内边距同一条竖线 */
    padding: 6px 8px 6px 4px;
    background: var(--ui-surface);
    border: 1px solid var(--ui-line-strong);
    border-radius: 0 6px 6px 6px;
    margin-bottom: 12px;
    min-width: 0;
  }

  .sub-item {
    padding: 4px 12px;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: var(--ui-ink-sub);
    font-family: inherit;
    font-size: 13px;
    line-height: 1.4;
    cursor: pointer;
    transition: color 0.18s, background-color 0.18s, box-shadow 0.18s;
  }

  .sub-item:hover:not(:disabled):not(.on) {
    color: var(--ui-ink);
  }

  /* 选中 = 青玉文字 + 金色下边。二级**不再套金色方框** —— 金色方框只属于一级。 */
  .sub-item.on {
    color: var(--ui-jade);
    font-weight: 700;
    box-shadow: inset 0 -2px 0 var(--ui-gold);
  }

  .sub-item:disabled {
    opacity: 0.42;
    cursor: not-allowed;
  }

  /* 未解锁的艺（炼丹 / 制符 / 炼阵）：灰显但可点，进去看残页进度 */
  .sub-item.is-locked:not(.on) {
    opacity: 0.55;
  }

  /* 第 1 档通知：入口红点（2026-11-22 S2，色源 tokens.css · 朱砂） */
  .nav-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    margin-left: 4px;
    border-radius: 50%;
    background: var(--ui-cinnabar);
    vertical-align: middle;
  }

  @media (max-width: 720px) {
    .nav-item {
      padding: 6px 12px;
    }

    /* 窄屏只显前 4 类（修炼 / 多子多福 / 建设 / 飞鹰门），百艺 / 商业改从「更多」进 */
    .nav-item.is-wide-only {
      display: none;
    }

    /* 子页签与一级书签一起收 12px 内边距，保持同一条竖线（4 + 8 = 12） */
    .nav-sub {
      padding-left: 4px;
    }

    .sub-item {
      padding: 4px 9px;
    }
  }
</style>
