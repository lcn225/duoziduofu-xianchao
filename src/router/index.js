import { createRouter, createWebHashHistory } from 'vue-router'
import { usePlayerStore } from '../stores/player'
import Day from '../views/Day.vue'
import Cultivation from '../views/Cultivation.vue'
import Inventory from '../views/Inventory.vue'
import Exploration from '../views/Exploration.vue'
import Achievements from '../views/Achievements.vue'
import Settings from '../views/Settings.vue'
import GM from '../views/GM.vue'
import Alchemy from '../views/Alchemy.vue'
import Dungeon from '../views/Dungeon.vue'
import Shop from '../views/Shop.vue'
import InnerCourt from '../views/InnerCourt.vue'
import Estate from '../views/Estate.vue'
import Faction from '../views/Faction.vue'

const routes = [
  {
    // 「桂冈的一天」是主界面（P10）。⚠ **不要**把它加进 PAUSE_ROUTES ——
    // 它是观战页（《桂冈的一天》§十一：观战型进主界面、配置型留独立页），
    // 加进去这一页就变成一块死屏。routeKeyOf('/') 是空串，天然不在表里。
    path: '/',
    name: 'Day',
    component: Day
  },
  {
    path: '/cultivation',
    name: 'Cultivation',
    component: Cultivation
  },
  {
    path: '/inventory',
    name: 'Inventory',
    component: Inventory
  },
  {
    path: '/exploration',
    name: 'Exploration',
    component: Exploration
  },
  {
    path: '/achievements',
    name: 'Achievements',
    component: Achievements
  },
  {
    path: '/settings',
    name: 'Settings',
    component: Settings
  },
  {
    path: '/gm',
    name: 'gm',
    component: GM,
    beforeEnter: (to, from, next) => {
      const playerStore = usePlayerStore()
      if (!playerStore.isGMMode) {
        next('/cultivation')
      } else {
        next()
      }
    }
  },
  {
    path: '/alchemy',
    name: 'alchemy',
    component: Alchemy
  },
  {
    path: '/dungeon',
    name: 'Dungeon',
    component: Dungeon
  },
  {
    // 郑家宝阁（P17）：替代已删除的抽奖页。抽奖池作废，改「宝箱 + 商店」。
    path: '/shop',
    name: 'Shop',
    component: Shop
  },
  {
    // 路径首段 'innercourt' 必须与 clock.js 的 PAUSE_ROUTES 里那一项一致
    // （routeKeyOf 取 path 第一段，不是路由 name）
    path: '/innercourt',
    name: 'InnerCourt',
    component: InnerCourt
  },
  {
    // 模块四 · 封地（B3）：「乡间建设」。⚠ **不进 PAUSE_ROUTES** ——
    // 它是看着进度条跑的观战页（同内宅），暂停会变成死屏。
    path: '/estate',
    name: 'Estate',
    component: Estate
  },
  {
    // 模块五 · 飞鹰门（2026-10-30 筑基功法批）：贡献点周任务 + 秘库。
    // ⚠ **进 PAUSE_ROUTES** —— 它是「任务派遣」配置页（clock.js 里点名的类型）
    path: '/faction',
    name: 'Faction',
    component: Faction
  }
]

// 探索动画 spike 的临时测试页（P28.2），只在开发期注册。
// import.meta.env.DEV 是静态替换，构建时整段被摇掉，产物里没有这条路由。
if (import.meta.env.DEV) {
  routes.push({
    path: '/animtest',
    name: 'AnimTest',
    component: () => import('../views/AnimTest.vue')
  })
}

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

/**
 * 进入「管理模块」即暂停游戏时间（《时间系统》§3.2）。
 * 放在路由守卫而不是每个 view 的 onMounted/onUnmounted 里，免得漏。
 * 暂停表见 stores/modules/clock.js 的 PAUSE_ROUTES。
 */
router.afterEach(to => {
  usePlayerStore().syncClockPause(to.path)
})

export default router
