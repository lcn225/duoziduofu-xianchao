<template>
  <div class="page-stack">
    <section class="zone">
      <div class="zone-head">
        <span class="zone-title">百艺</span>
        <n-text depth="3" style="font-size: 13px">
          桂冈亲手做，产高一阶；一阶配方解锁本艺即可做，二阶起集齐残页自动学会。
        </n-text>
      </div>
      <div class="zone-body">
        <!-- 四艺总览 -->
        <section class="arts-summary">
          <div
            v-for="view in artViewList"
            :key="view.art"
            class="arts-sum-cell"
            :class="{ on: view.unlocked }"
          >
            <div class="arts-sum-k">{{ view.label }}</div>
            <div class="arts-sum-v">
              <n-tag size="small" :type="view.unlocked ? 'success' : 'default'" :bordered="false">
                {{ view.unlocked ? '已解锁' : '未解锁' }}
              </n-tag>
              <span class="arts-sum-note">残页 {{ view.fragments }}</span>
            </div>
          </div>
        </section>

        <n-tabs type="line" v-model:value="activeArt">
          <n-tab-pane
            v-for="view in artViewList"
            :key="view.art"
            :name="view.art"
            :tab="view.unlocked ? view.label : `🔒${view.label}`"
          >
            <n-empty
              v-if="!view.unlocked"
              :description="`${view.label}尚未解锁 —— 探索 / 秘境 / 宝匣掉落的百艺残页，拿到第一张即解锁`"
            />
            <n-space v-else vertical :size="14">
              <!-- 状态行 -->
              <n-space align="center" :size="10" wrap>
                <n-checkbox
                  :checked="view.enabled"
                  @update:checked="playerStore.setArtEnabled(view.art, $event)"
                >
                  小循环里加入{{ view.label }}
                </n-checkbox>
                <n-tag size="small" :bordered="false">
                  熟练度 {{ view.skill.rank.name }} · 亲手做过 {{ view.skill.done }} 次
                </n-tag>
                <n-tag size="small" :bordered="false">
                  降耗时 {{ Math.round(view.skill.rank.timeReduction * 100) }}%
                </n-tag>
                <n-tag size="small" :bordered="false">累计 {{ view.crafted }} 件</n-tag>
                <n-tag size="small" type="info" :bordered="false">宗师被动 · 未开放</n-tag>
              </n-space>

              <!-- 排班与进度 -->
              <div class="arts-row">
                <n-text depth="3" style="font-size: 12px">排班配方</n-text>
                <n-select
                  size="small"
                  style="width: 260px"
                  :value="view.current?.id || null"
                  :options="view.options"
                  :disabled="!view.options.length"
                  @update:value="playerStore.setArtRecipe(view.art, $event)"
                />
                <template v-if="view.progress">
                  <n-progress
                    type="line"
                    style="width: 200px"
                    :percentage="Math.round(view.progress.ratio * 100)"
                    :show-indicator="false"
                  />
                  <n-text depth="3" style="font-size: 12px">
                    {{ Math.round(view.progress.ratio * 100) }}% · {{ view.current.rounds }} 轮
                  </n-text>
                </template>
                <n-text v-if="!view.options.length" depth="3" style="font-size: 12px">
                  {{
                    view.art === 'array'
                      ? '炼阵配方从筑基段起（骨材最低二阶），练气期先把残页攒着'
                      : '本艺暂无可用配方'
                  }}
                </n-text>
              </div>

              <!-- 材料与配方锁 -->
              <div v-if="view.current" class="arts-row">
                <n-text depth="3" style="font-size: 12px">所需材料</n-text>
                <n-tag
                  v-for="input in view.current.inputs"
                  :key="input.type"
                  size="small"
                  :type="view.missingFor(input.type) > 0 ? 'warning' : 'default'"
                  :bordered="false"
                >
                  {{ input.type }} ×{{ input.count
                  }}{{ view.missingFor(input.type) > 0 ? `（缺 ${view.missingFor(input.type)}）` : '' }}
                </n-tag>
                <n-tag v-if="view.lockedNames.length" size="small" type="info" :bordered="false">
                  配方锁：{{ view.lockedNames.join('、') }}
                </n-tag>
              </div>

              <!-- 配方图鉴 -->
              <div>
                <n-text depth="3" style="font-size: 12px">配方图鉴</n-text>
                <div class="recipe-grid">
                  <div
                    v-for="entry in view.recipes"
                    :key="entry.recipe.id"
                    class="recipe-card"
                    :class="{ on: entry.active, locked: entry.state !== 'known' }"
                  >
                    <div class="recipe-head">
                      <span class="recipe-name">{{ entry.recipe.name }}</span>
                      <n-tag size="tiny" :bordered="false" :type="stateTypeOf(entry)">
                        {{ stateLabelOf(entry) }}
                      </n-tag>
                    </div>
                    <div class="recipe-line">
                      耗料 {{ inputsTextOf(entry.recipe) }} · {{ entry.recipe.rounds }} 轮
                    </div>
                    <div class="recipe-line">
                      {{ effectTextOf(entry.recipe.effect) || '凡俗杂物' }} · 产
                      {{ outputTierOf(entry.recipe) }} 阶
                    </div>
                    <div v-if="entry.state === 'fragment'" class="recipe-line">
                      残页 {{ entry.fragmentsHave }}/{{ entry.fragmentsNeed }}
                      <n-progress
                        type="line"
                        :percentage="pctOf(entry)"
                        :show-indicator="false"
                        :height="6"
                        style="margin-top: 4px"
                      />
                    </div>
                    <div v-else-if="entry.state === 'realm'" class="recipe-line">
                      {{ entry.realmLabel }}后开放
                    </div>
                  </div>
                </div>
              </div>

              <n-text depth="3" style="font-size: 12px">
                一阶配方：解锁本艺即可做；二阶起：集齐「5 × 配方阶」张残页自动学会（二阶 = 10 张）。
                残页来源：探索 / 秘境 / 宝匣。熟练度只涨「亲手做」，乡间自动不涨（B11-b）。
              </n-text>
            </n-space>
          </n-tab-pane>
        </n-tabs>
      </div>
    </section>
  </div>
</template>

<script setup>
  import { computed, ref } from 'vue'
  import { usePlayerStore } from '../stores/player'
  import {
    ART_LABELS,
    ARTS,
    effectTextOf,
    lockedBaseIdsOf,
    planMaterialsOf
  } from '../plugins/arts.js'
  import { itemById } from '../plugins/items.js'

  const playerStore = usePlayerStore()

  /** 默认停在炼器（唯一开局解锁的艺），锁定页签也能进来看残页进度 */
  const activeArt = ref('forge')

  const inputsTextOf = recipe =>
    (recipe?.inputs || []).map(input => `${input.type}×${input.count}`).join(' + ')

  /** 产物阶：凡俗按配方阶（1），灵器 / 消耗品 = 配方阶 + 1（个人产高一阶） */
  const outputTierOf = recipe =>
    recipe?.output?.kind === 'crafted' ? Number(recipe.tier) || 1 : (Number(recipe?.tier) || 1) + 1

  const stateLabelOf = entry => {
    if (entry.state === 'known') return entry.active ? '已排班' : '可做'
    if (entry.state === 'fragment') return `残页 ${entry.fragmentsHave}/${entry.fragmentsNeed}`
    if (entry.state === 'realm') return '境界未到'
    return '未解锁'
  }

  const stateTypeOf = entry =>
    entry.state === 'known' ? 'success' : entry.state === 'fragment' ? 'warning' : 'default'

  const pctOf = entry =>
    entry.fragmentsNeed > 0
      ? Math.min(100, Math.round((entry.fragmentsHave / entry.fragmentsNeed) * 100))
      : 0

  const buildView = art => {
    const unlocked = playerStore.artUnlockedOf(art)
    const enabled = (playerStore.arts?.selected || []).includes(art)
    const skill = playerStore.proficiencyOf(art)
    const recipes = playerStore.artRecipeViewOf(art)
    const current = playerStore.activeRecipeOf(art)
    const progress = current ? playerStore.recipeProgressOf(current, art) : null
    const plan = current
      ? planMaterialsOf(current, playerStore.items || [])
      : { ok: true, plan: [], missing: [] }
    const lockedNames = current
      ? lockedBaseIdsOf(current, playerStore.items || []).map(
          baseId => itemById(baseId)?.name || baseId
        )
      : []
    const fragments = recipes.reduce((sum, entry) => sum + entry.fragmentsHave, 0)
    const crafted = Number(playerStore.arts?.crafted?.[art]) || 0
    return {
      art,
      label: ART_LABELS[art] || art,
      unlocked,
      enabled,
      skill,
      recipes,
      crafted,
      fragments,
      current,
      progress,
      lockedNames,
      options: recipes
        .filter(entry => entry.state === 'known' && entry.realmOk)
        .map(entry => ({ label: `${entry.recipe.name}（${entry.recipe.rounds} 轮）`, value: entry.recipe.id })),
      /** 某类材料缺多少（0 = 够） */
      missingFor: type => {
        const miss = (plan.missing || []).find(item => item.type === type)
        return miss ? Math.max(0, miss.need - miss.have) : 0
      }
    }
  }

  const artViewList = computed(() => ARTS.map(buildView))
</script>

<style scoped>
  .arts-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 6px;
  }

  .arts-sum-cell {
    flex: 1 1 150px;
    border: 1px solid var(--ui-line);
    border-radius: 8px;
    padding: 10px 12px;
    background: var(--ui-surface);
    opacity: 0.7;
  }

  .arts-sum-cell.on {
    opacity: 1;
    border-color: var(--ui-line-strong);
  }

  .arts-sum-k {
    font-size: 14px;
    font-weight: 700;
    color: var(--ui-ink);
    margin-bottom: 6px;
  }

  .arts-sum-v {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .arts-sum-note {
    font-size: 12px;
    color: var(--ui-ink-sub);
  }

  .arts-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 10px;
  }

  /* 图鉴卡片：自适应列宽（n-grid 的响应式断点在这里没生效，用 CSS Grid 更稳） */
  .recipe-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 10px;
    margin-top: 8px;
  }

  .recipe-card {
    border: 1px solid var(--ui-line);
    border-radius: 8px;
    padding: 10px 12px;
    background: var(--ui-surface);
    height: 100%;
  }

  .recipe-card.on {
    border-color: var(--ui-jade);
  }

  .recipe-card.locked {
    opacity: 0.72;
  }

  .recipe-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
  }

  .recipe-name {
    font-weight: 700;
    color: var(--ui-ink);
  }

  .recipe-line {
    font-size: 12px;
    color: var(--ui-ink-sub);
    line-height: 1.7;
  }
</style>
