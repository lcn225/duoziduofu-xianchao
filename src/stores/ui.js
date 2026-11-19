import { defineStore } from 'pinia'

/**
 * 纯 UI 层状态（2026-11-19 导航层级统一）。
 *
 * 只装**被提升到导航第二行**的页内页签：多子多福（内宅 / 子嗣 / 家族树）和
 * 百艺（炼丹 / 制符 / 炼阵 / 炼器）。导航层（`components/MainNav.vue`）与页面
 * （`views/InnerCourt.vue` / `views/Arts.vue`）读写同一份，点导航 = 切页签，
 * 两者不再各维护一个 ref。
 *
 * ⚠ 这是**独立 store**，刻意不并进 `stores/modules/` 的 player store：
 *   - 不进存档（`$state` 不参与 persistence 快照），刷新回默认是预期行为；
 *   - 不占 player store 的命名空间，避免以后有人把它当游戏数据迁移。
 *
 * 秘境 / 修行 / 背包 / 宝阁 的三级页签仍留在各自页面内，**不要**搬进来。
 */
export const useUiStore = defineStore('ui', {
  state: () => ({
    subTab: {
      // 多子多福：默认停在「内宅」（与旧版 n-tabs 的默认值一致）
      innercourt: 'night',
      // 百艺：默认停在「炼器」（唯一开局解锁的艺）
      arts: 'forge'
    }
  }),
  actions: {
    setSubTab(page, key) {
      if (!page || !key) return
      this.subTab[page] = key
    }
  }
})
