<template>
  <n-layout>
    <n-layout-content>
      <div class="page-stack">
        <!-- ============ 1. 封地概况 ============ -->
        <section class="zone">
          <div class="zone-head">
            <span class="zone-title">{{ view.name }} · 乡侯府 Lv.{{ view.manorLevel }}</span>
            <n-tag v-if="view.tutorialDone" size="small" type="success" :bordered="false">
              新手引导已完成
            </n-tag>
            <n-tag v-if="view.patrolled" size="small" type="success">
              今日巡视 {{ view.patrolHours }} 小时 · 三进度 +{{ view.patrolBonusPct }}%
            </n-tag>
            <n-tag v-else size="small" :bordered="false">今日未巡视 · ×1</n-tag>
          </div>
          <div class="zone-body">
            <div class="stat-row">
              <div class="stat">
                <span class="k">总人口</span>
                <span class="v">{{ Math.floor(view.population).toLocaleString() }}</span>
                <span class="sub">{{ Math.floor(view.villagers).toLocaleString() }} 村民 + {{ view.offspringCount }} 子嗣</span>
              </div>
              <div class="stat">
                <span class="k">徭役</span>
                <span class="v">{{ view.laborUsed }} / {{ view.laborTotal }}</span>
                <span class="sub">已派 / 总数 · 在建需求 {{ view.laborDemand }}</span>
              </div>
              <div class="stat">
                <span class="k">村民上限</span>
                <span class="v">{{ view.townCap.toLocaleString() }}</span>
                <span class="sub">乡侯府 Lv.{{ view.manorLevel }} · 年增 2.5%</span>
              </div>
              <div class="stat">
                <span class="k">繁荣</span>
                <span class="v">{{ view.prosperity }}</span>
              </div>
              <div class="stat">
                <span class="k">灵田产粮</span>
                <span class="v">{{ farmDaily }} / 天</span>
              </div>
              <div class="stat">
                <span class="k">灵石</span>
                <span class="v">{{ formatSpiritual(playerStore.currency.spiritual) }}</span>
              </div>
            </div>
            <span class="hint">
              村民上限由乡侯府等级卡，每年自然增长 2.5%；总人口 = 村民 + 活着的子嗣，徭役 = 总人口 × 25%。
            </span>
          </div>
        </section>

        <!-- ============ 1.5 封地全景（B14-d，2026-11-05，《模块四》§十五） ============
             三态：灰（未解锁 / 未建造）→ 彩（已建成）→ 彩 + 进度条（建造中）。
             灰色地块只显示轮廓 + 解锁条件，**不显示效果详情**（设计口径）。
             地块布局 = 本页 `PLOT_LAYOUT`（§十六 #2 交开发组）；点地块跳到下方建设明细。 -->
        <section class="zone">
          <div class="zone-head">
            <span class="zone-title">封地全景</span>
            <span class="hint">
              已建 {{ builtCount }} / {{ plots.length }} 栋
              <template v-if="buildingCount"> · 在建 {{ buildingCount }}</template>
              · 点地块跳到下方的建设明细
            </span>
          </div>
          <div class="zone-body">
            <div class="estate-map">
              <div
                v-for="plot in plots"
                :key="plot.id"
                class="plot"
                :class="plotClassOf(plot)"
                :style="{ gridArea: plot.area }"
                @click="focusBuilding(plot)"
              >
                <span class="plot-name">{{ plot.name }}</span>
                <span v-if="plot.job" class="plot-state">
                  建造中 → Lv.{{ plot.job.targetLevel }} · {{ Math.round(plot.job.progress) }}%
                </span>
                <span v-else-if="plot.level" class="plot-state">
                  Lv.{{ plot.level }} / {{ plot.maxLevel }}
                </span>
                <span v-else-if="plot.unlocked" class="plot-state">可建造</span>
                <span v-else class="plot-state">{{ plot.unlockText }}</span>
                <n-progress
                  v-if="plot.job"
                  type="line"
                  :percentage="Math.round(plot.job.progress)"
                  :height="4"
                  :show-indicator="false"
                  color="var(--ui-jade)"
                  rail-color="var(--ui-track)"
                />
              </div>
            </div>
            <div class="plot-legend">
              <span class="legend-item"><i class="sw sw-locked" />未解锁 · 只显示解锁条件</span>
              <span class="legend-item"><i class="sw sw-open" />已解锁未建造</span>
              <span class="legend-item"><i class="sw sw-built" />已建成</span>
              <span class="legend-item"><i class="sw sw-building" />建造中（带进度条）</span>
            </div>
          </div>
        </section>

        <!-- ============ 2. 建筑与进度 ============ -->
        <section class="zone">
          <div class="zone-head">
            <span class="zone-title">建筑与进度</span>
            <span class="hint">
              徭役 {{ view.laborUsed }} / {{ view.laborTotal }} 已派
              <template v-if="view.laborDemand > 0">
                · 在建需求 {{ view.laborDemand }}
                <template v-if="view.laborQueued > 0">· {{ view.laborQueued }} 项排队中</template>
              </template>
            </span>
          </div>
          <div class="zone-body">
            <div
              v-for="b in view.activeBuildings"
              :id="`build-row-${b.id}`"
              :key="b.id"
              class="build-row"
              :class="{ 'build-focus': focusId === b.id }"
            >
              <div class="build-main">
                <div class="build-title">
                  <strong>{{ b.name }}</strong>
                  <n-tag v-if="b.level" size="small" :bordered="false">Lv.{{ b.level }} / {{ b.maxLevel }}</n-tag>
                  <n-tag v-else size="small" :bordered="false" type="warning">未建造</n-tag>
                  <n-tag size="small" :bordered="false">{{ TIER_LABELS[b.tier] || '' }}</n-tag>
                </div>
                <span class="hint">{{ b.effectText }}</span>
                <!-- B14-c #7 传功阁：已收录 / 已学弟子 / 平均加成（b − 1） -->
                <span v-if="b.id === 'library' && b.level" class="hint">
                  已收录 {{ libraryView.knownCount }} 本 ·
                  已学弟子 {{ libraryView.learnedCount }} 人 ·
                  平均加成 {{ libraryView.avgBonusPct.toFixed(1) }}%
                </span>
                <!-- 英烈祠（2026-11-05 用户拍板）：不另给加成，展示家族树牌位加成（R13） -->
                <span v-if="b.id === 'shrine'" class="hint">
                  牌位 {{ shrineView.count }} 座 ·
                  打坐修为 +{{ shrineView.cultivationPct }}% ·
                  新生灵根 +{{ shrineView.rootChancePct }}%
                </span>

                <!-- 建设条 -->
                <div v-if="b.job" class="bar-block">
                  <n-progress
                    type="line"
                    :percentage="Math.round(b.job.progress)"
                    :height="6"
                    :show-indicator="false"
                    color="var(--ui-jade)"
                    rail-color="var(--ui-track)"
                  />
                  <span class="hint">
                    建设中 → Lv.{{ b.job.targetLevel }} · {{ Math.round(b.job.progress) }}% ·
                    应付 {{ formatStones(b.job.costStones) }} · 工期 {{ b.job.days }} 天
                  </span>
                  <span v-if="b.laborShare" class="hint">
                    徭役 {{ Math.round(b.laborShare.assigned) }} / {{ b.laborShare.demand }}
                    <template v-if="b.laborShare.waiting">
                      · {{ b.laborShare.reason === 'queue' ? '排队中（先开工的优先）' : '徭役不足' }}
                    </template>
                  </span>
                  <span v-if="stallHint(b)" class="hint warn">
                    {{ stallHint(b) }}
                  </span>
                </div>

                <!-- 产出条（灵田） -->
                <div v-else-if="b.outputPerDay > 0" class="bar-block">
                  <n-progress
                    type="line"
                    :percentage="productionBar"
                    :height="6"
                    :show-indicator="false"
                    color="var(--ui-jade)"
                    rail-color="var(--ui-track)"
                  />
                  <span class="hint">
                    今日产出 {{ b.outputPerDay }} / 天（按当天巡视时长加算）
                  </span>
                </div>
              </div>

              <div class="build-acts">
                <template v-if="b.job">
                  <span class="hint">施工中…</span>
                </template>
                <template v-else-if="!b.level">
                  <n-button size="small" type="primary" @click="doBuild(b)">建造</n-button>
                  <span class="hint">
                    首建免费 · 工期 {{ b.quote?.days }} 天 · 徭役 {{ b.quote?.labor }}
                  </span>
                </template>
                <template v-else-if="b.quote">
                  <!-- 开工不预付，但要付得起「首日工钱」，否则一开工就停工（看得懂比能点更重要） -->
                  <n-button size="small" :disabled="!canAffordUpgrade(b)" @click="doUpgrade(b)">
                    升级 Lv.{{ b.level + 1 }}
                  </n-button>
                  <span class="hint">
                    {{ formatStones(b.quote.costStones) }} · {{ b.quote.days }} 天 · 徭役 {{ b.quote.labor }}
                  </span>
                  <span v-if="!canAffordUpgrade(b)" class="hint warn">
                    灵石不足：开工后每天约需 {{ dailyPayOf(b.quote) }} 一阶
                  </span>
                </template>
                <span v-else class="hint">已满级</span>
              </div>
            </div>

            <span class="hint">
              建设按天分期付款：进度推多少就付多少，总付款恒等于总成本；灵石不够当天就停工，补上后继续。
            </span>
          </div>
        </section>

        <!-- ============ 2.2 经营链 L1（B14-b，2026-11-03） ============ -->
        <section class="zone">
          <div class="zone-head">
            <span class="zone-title">生产链</span>
            <span class="hint">
              <template v-if="view.marketLevel">
                市集 Lv.{{ view.marketLevel }} · 固定价 · 满产约
                {{ formatStones(view.chainFullIncomePerDay) }} / 天
              </template>
              <template v-else>
                市集未建：三条链停摆（不耗原料、不产成品）
              </template>
            </span>
          </div>
          <div class="zone-body">
            <div v-for="row in view.chain" :key="row.building" class="chain-row">
              <div class="chain-main">
                <div class="chain-title">
                  <strong>{{ buildingName(row.building) }}</strong>
                  <n-tag v-if="row.level" size="small" :bordered="false">
                    Lv.{{ row.level }} · {{ row.productName }}
                    <template v-if="row.capacity">×{{ row.capacity }}/天</template>
                  </n-tag>
                  <n-tag v-else size="small" type="warning" :bordered="false">未建造</n-tag>
                  <n-tag size="small" :type="chainTagType(row.reason)" :bordered="false">
                    {{ chainReasonText(row.reason) }}
                  </n-tag>
                </div>
                <span class="hint">
                  原料 {{ STORAGE_LABELS[row.input] }} 库存 {{ Math.floor(row.stock) }} /
                  {{ view.storageCap }}
                  <template v-if="row.capacity">
                    · 日耗 {{ row.intake }} · 转化 {{ row.inputPerOutput }} : 1
                  </template>
                </span>
              </div>
              <div class="chain-acts">
                <!-- 单价 = 基础价 × 2.0 × 市集系数，×1.2 时是 57.6 这种小数，直接插值会漏浮点尾巴 -->
                <span class="hint">单价 {{ formatAmount(row.unitPrice) }} 一阶 / 件</span>
                <strong>{{ formatStones(row.fullIncome) }} / 天</strong>
                <span class="hint">按满产计，原料不足会打折</span>
              </div>
            </div>
            <span class="hint">
              成品按当前大境界换阶：练气「灵酒 / 灵丹 / 法器」· 筑基「玉液 / 玄丹 / 宝器」·
              金丹「仙酿 / 仙丹 / 仙器」。成品即产即卖，不占背包；市集等级抬价 +20% / 级。
            </span>
          </div>
        </section>

        <!-- ============ 2.4 封地仓库（中间产物，不占背包） ============ -->
        <section class="zone">
          <div class="zone-head">
            <span class="zone-title">封地仓库</span>
            <span class="hint">每种上限 {{ view.storageCap }} · 满仓停产、不溢出</span>
          </div>
          <div class="zone-body">
            <div class="stat-row">
              <div v-for="key in view.storageKeys" :key="key" class="stat">
                <span class="k">{{ STORAGE_LABELS[key] }}</span>
                <span class="v">{{ Math.floor(view.storage[key] || 0) }} / {{ view.storageCap }}</span>
              </div>
            </div>
            <span class="hint">
              灵田产粮、药圃产灵植、矿场产矿石；中间产物在「生产链」里被酒坊 / 丹炉 / 工坊消耗。
              仓满停产、不溢出；炭场不产中间产物，只给炼丹 / 炼器提速（B11）。
            </span>
          </div>
        </section>

        <!-- ============ 2.5 药浴池（B4b《炼体药浴》§九） ============
             配置面全部放这里：存量 + 五系占比 + 一键投入 / 全部取出。
             灵材页只加锁图标、Day 页只显示药力条 —— 一个主界面里不摆第二套投入 UI。 -->
        <section v-if="view.bathhouseUnlocked" class="zone">
          <div class="zone-head">
            <span class="zone-title">药浴池</span>
            <n-tag v-if="pool.built" size="small" type="success">Lv.{{ pool.level }}</n-tag>
            <n-tag v-else size="small" type="warning" :bordered="false">未建造</n-tag>
          </div>
          <div class="zone-body">
            <template v-if="pool.built">
              <div class="stat-row">
                <div class="stat">
                  <span class="k">池中存量</span>
                  <span class="v">{{ pool.stockCount }} / {{ pool.stockLimit }}</span>
                  <span class="sub">件 · 不占背包</span>
                </div>
                <div class="stat">
                  <span class="k">转换速率</span>
                  <span class="v">1 件/小时</span>
                  <span class="sub">24 件/天，不随等级变</span>
                </div>
                <div class="stat">
                  <span class="k">药力上限</span>
                  <span class="v">×{{ pool.capMultiplier }}</span>
                  <span class="sub">每系 {{ Math.round(pool.cap) }} · 下限 {{ Math.round(pool.floor) }}</span>
                </div>
                <div class="stat">
                  <span class="k">累计转换</span>
                  <span class="v">{{ pool.convertedTotal }}</span>
                  <span class="sub">件</span>
                </div>
              </div>

              <div class="pool-bars">
                <div v-for="el in BATH_ELEMENTS" :key="el" class="pool-bar">
                  <span class="pool-el">{{ BATH_ELEMENT_LABELS[el] }}</span>
                  <span class="pool-track">
                    <n-progress
                      type="line"
                      :percentage="pool.medicinePct[el]"
                      :height="6"
                      :show-indicator="false"
                      color="var(--ui-jade)"
                      rail-color="var(--ui-track)"
                    />
                  </span>
                  <span class="pool-num">{{ Math.round(pool.medicine[el]) }}/{{ Math.round(pool.cap) }}</span>
                </div>
              </div>

              <div class="tutorial-actions">
                <n-button size="small" type="primary" @click="doFillPool">一键投入</n-button>
                <n-button size="small" :disabled="!pool.stockCount" @click="doEmptyPool">
                  全部取出
                </n-button>
                <span class="hint">
                  按「先低阶 → 同阶先低成色」抓料；装备中 / 品种锁 / 同参 / 出战灵宠自动跳过。
                </span>
              </div>
              <span class="hint">
                建池后浴桶关闭，炼体只从池中汲取药力；未转换的材料可随时取出退回背包，
                <strong>已转化的药力不可逆</strong>。某系到上限就停止转换该系，五系全满则整体停转。
              </span>
            </template>
            <template v-else>
              <n-alert type="info" :show-icon="false">
                乡侯府已到 Lv.{{ view.manorLevel }}，可以在上面的「建筑与进度」里建造药浴池
                <template v-if="bathQuote">（首建免费 · 工期 {{ bathQuote.days }} 天）</template>
                。建成后浴桶关闭，灵材全天候转换。
              </n-alert>
            </template>
          </div>
        </section>

        <!-- ============ 3. 征收 ============ -->
        <section class="zone">
          <div class="zone-head">
            <span class="zone-title">征收</span>
            <span v-if="view.taxUnlocked" class="hint">
              满格入库 {{ view.taxMonthly.toFixed(1) }} 一阶 · 每游戏月至多 1 次
            </span>
            <span v-else class="hint">乡侯府 Lv.2 解锁</span>
          </div>
          <div class="zone-body">
            <template v-if="view.taxUnlocked">
              <n-progress
                type="line"
                :percentage="Math.round(view.taxProgress)"
                :height="6"
                :show-indicator="false"
                color="var(--ui-jade)"
                rail-color="var(--ui-track)"
              />
              <span class="hint">
                每天 +1/30，按当天巡视时长加算（S 小时 ⇒ (24+S)/24）；每月最多入库 1 次（提前满不叠下月）。
                <strong>进度每天 00:00 结算一次</strong>（现实约 96 秒），不是实时条。
              </span>
            </template>
            <template v-else>
              <!-- Lv.1 不画一条永远 0% 的绿条：那看起来像卡住了。这里直接说清未解锁与怎么开。 -->
              <n-alert type="warning" :show-icon="true">
                征收未开：乡侯府还是 Lv.{{ view.manorLevel }}。升到 Lv.2 后进度条才会开始走
                （每天 +1/30，按当天巡视时长加算）。现在显示 0 是预期行为，不是卡住。
              </n-alert>
              <div class="tutorial-actions">
                <n-button
                  v-if="manorBuilding?.quote && !manorBuilding?.job"
                  size="small"
                  type="primary"
                  @click="doUpgrade(manorBuilding)"
                >
                  升级乡侯府到 Lv.2（{{ formatStones(manorBuilding.quote.costStones) }} · {{ manorBuilding.quote.days }} 天）
                </n-button>
                <span v-else-if="manorBuilding?.job" class="hint">
                  乡侯府升级中 → Lv.{{ manorBuilding.job.targetLevel }} · {{ Math.round(manorBuilding.job.progress) }}%
                </span>
                <span v-else class="hint">乡侯府已满级</span>
              </div>
            </template>
          </div>
        </section>

        <!-- ============ 4. 新手引导 ============
             2026-10-27：三步建完就**自动收起**（不再留一张永远挂着的清单）；
             收起后如果还有「下一目标」（征收要乡侯府 Lv.2）就换成一条新引导，
             目标达成后整块消失。 -->
        <section v-if="!view.tutorialDone || nextObjective" class="zone">
          <div class="zone-head">
            <span class="zone-title">新手引导</span>
            <n-tag v-if="view.tutorialDone" size="small" type="success">建造三步已完成</n-tag>
            <span v-else class="hint">
              第 {{ view.tutorialStep + 1 }} / {{ tutorialSteps.length }} 步
            </span>
          </div>
          <div class="zone-body">
            <template v-if="!view.tutorialDone">
              <n-alert type="info" :show-icon="false">
                下一步：建造 <strong>{{ tutorialCurrent?.name }}</strong>
                <template v-if="tutorialCurrent"> —— {{ tutorialCurrent.effectText }}</template>
                。建完这一步会自动跳到下一步，三步建完本引导自动收起。
              </n-alert>
              <div v-for="(step, i) in tutorialSteps" :key="step.id" class="tutorial-row">
                <span class="tutorial-mark">{{ tutorialMark(i) }}</span>
                <span>{{ step.name }}</span>
                <span class="hint">{{ step.effectText }}</span>
              </div>
            </template>
            <template v-else>
              <n-alert type="success" :show-icon="false">
                建造三步已完成。下一目标：<strong>{{ nextObjective.title }}</strong> ——
                {{ nextObjective.desc }}
              </n-alert>
              <div class="tutorial-actions">
                <n-button
                  v-if="manorBuilding?.quote && !manorBuilding?.job"
                  size="small"
                  type="primary"
                  @click="doUpgrade(manorBuilding)"
                >
                  升级乡侯府（{{ formatStones(manorBuilding.quote.costStones) }} · {{ manorBuilding.quote.days }} 天）
                </n-button>
                <span v-else-if="manorBuilding?.job" class="hint">
                  乡侯府升级中 → Lv.{{ manorBuilding.job.targetLevel }} · {{ Math.round(manorBuilding.job.progress) }}%
                </span>
                <span v-else class="hint">乡侯府已满级</span>
              </div>
            </template>
            <span class="hint">
              乡侯府开局即有；建完灵田 → 鸦巢舍 → 亭卫，封地自动运转。
              鸦巢舍与亭卫的效果要等情报 / 告急系统上线 —— 现在建它们是为了走完教程与占位。
            </span>
          </div>
        </section>

        <!-- ============ 5. 封地流水 ============ -->
        <section class="zone">
          <div class="zone-head">
            <span class="zone-title">封地流水</span>
            <span class="hint">最新在上 · 上限 40 条</span>
          </div>
          <div class="zone-body">
            <n-empty v-if="!view.log.length" description="还没有封地记录" size="small" />
            <div v-for="(row, i) in view.log" :key="i" class="log-row" :class="`log-${row.kind}`">
              <span class="log-day">第 {{ row.day + 1 }} 日</span>
              <span>{{ row.text }}</span>
            </div>
          </div>
        </section>
      </div>
    </n-layout-content>
  </n-layout>
</template>

<script setup>
  import { computed, ref, onBeforeUnmount } from 'vue'
  import { useMessage } from 'naive-ui'
  import { usePlayerStore } from '../stores/player'
  import { formatSpiritual, formatAmount } from '../plugins/currency.js'
  import { buildingById, productionBarOf, TUTORIAL_IDS } from '../plugins/estate.js'
  import { BATH_ELEMENTS, BATH_ELEMENT_LABELS } from '../plugins/bath.js'

  const playerStore = usePlayerStore()
  const message = useMessage()

  /** 中间产物显示名（封地独立仓，不占背包） */
  const STORAGE_LABELS = { grain: '粮', herb: '灵植', ore: '矿石' }
  /** 建筑档位（只影响价格；§十六.1） */
  const TIER_LABELS = { small: '小', medium: '中', large: '大' }

  const view = computed(() => playerStore.estateView)

  /**
   * 全景图地块布局（B14-d，《模块四》§十五 · §十六 #2「地块布局交开发组」）。
   *
   * 6 列 × 4 行，同乡侯府居中 2×2。分三条带：
   *   上行 = 北面山野与戍守（木屋 / 矿场 / 炭场 / 烽火台 / 长墙 / 驿道口）
   *   次行 = 田产与工坊（灵田 / 药圃 / 工坊 / 丹炉 / 酒坊 / 市集）
   *   中下 = 府邸与内宅（乡侯府居中，药浴池 / 宅邸 / 传功阁 / 英烈祠 / 亭卫 / 鸦巢舍 / 义庄）
   * 值是 CSS `grid-area`：`行起 / 列起 / 行止 / 列止`。
   */
  const PLOT_LAYOUT = {
    // 北 · 山野与戍守
    woodcutter: '1 / 1 / 2 / 2',
    mine: '1 / 2 / 2 / 3',
    charcoal: '1 / 3 / 2 / 4',
    beacon: '1 / 4 / 2 / 5',
    wall: '1 / 5 / 2 / 6',
    relay: '1 / 6 / 2 / 7',
    // 北 · 田产与工坊
    farm: '2 / 1 / 3 / 2',
    herbGarden: '2 / 2 / 3 / 3',
    workshop: '2 / 3 / 3 / 4',
    furnace: '2 / 4 / 3 / 5',
    winery: '2 / 5 / 3 / 6',
    market: '2 / 6 / 3 / 7',
    // 中枢 · 乡侯府居中 2×2
    bathhouse: '3 / 1 / 4 / 2',
    manor: '3 / 2 / 5 / 4',
    residence: '3 / 4 / 4 / 5',
    library: '3 / 5 / 4 / 6',
    shrine: '3 / 6 / 4 / 7',
    // 南 · 内宅外围
    pavilion: '4 / 1 / 5 / 2',
    rookery: '4 / 4 / 5 / 5',
    mortuary: '4 / 5 / 5 / 6'
  }

  /** 全景图地块：建筑数据 + 格位；未排到的建筑落到自动流（现在 20 栋全排满） */
  const plots = computed(() =>
    view.value.buildings.map(b => ({ ...b, area: PLOT_LAYOUT[b.id] || '' }))
  )
  const builtCount = computed(() => plots.value.filter(b => b.level > 0).length)
  const buildingCount = computed(() => plots.value.filter(b => b.job).length)

  /**
   * 三态（《模块四》§十五）：灰（未解锁 / 未建造）→ 彩（已建成）→ 彩 + 进度条（建造中）。
   * 未解锁与已解锁未建造都走灰底轮廓，靠边框虚实与文案区分。
   */
  const plotClassOf = b => ({
    'plot-locked': !b.unlocked,
    'plot-open': b.unlocked && !b.level && !b.job,
    'plot-built': b.level > 0 && !b.job,
    'plot-building': !!b.job,
    'plot-clickable': b.unlocked
  })

  /** 点地块 → 滚到下方「建筑与进度」对应行并高亮（徭役 / 生产链都在那层） */
  const focusId = ref('')
  let focusTimer = 0
  const focusBuilding = b => {
    if (!b.unlocked) return
    focusId.value = b.id
    const row = document.getElementById(`build-row-${b.id}`)
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.clearTimeout(focusTimer)
    focusTimer = window.setTimeout(() => {
      focusId.value = ''
    }, 2400)
  }
  onBeforeUnmount(() => window.clearTimeout(focusTimer))
  /** B14-c #7 传功阁汇总（已收录 / 已学弟子 / 平均加成） */
  const libraryView = computed(() => playerStore.libraryView)
  /** 英烈祠：牌位加成沿用家族树（R13），建筑卡只做展示、不另给加成 */
  const shrineView = computed(() => ({
    count: playerStore.secretRealm?.shrine?.length || 0,
    cultivationPct: (Number(playerStore.shrineCultivationBonus) * 100).toFixed(0),
    rootChancePct: (Number(playerStore.shrineRootChanceBonus) * 100).toFixed(1)
  }))

  /** 药浴池卡片（B4b）：存量 / 转换速率 / 五系药力 / 累计转换 */
  const pool = computed(() => playerStore.bathPoolView)
  const bathroomBuilding = computed(
    () => view.value.buildings.find(building => building.id === 'bathhouse') || null
  )
  const bathQuote = computed(() => bathroomBuilding.value?.quote || null)

  const doFillPool = () => {
    const result = playerStore.fillBathPool()
    if (!result.ok) message.warning(result.message)
    else message.success(`投入 ${result.count} 件灵材`)
  }

  const doEmptyPool = () => {
    const result = playerStore.emptyBathPool()
    if (!result.ok) message.warning(result.message)
    else message.success(`取回 ${result.count} 件灵材`)
  }

  /** 产出条：按当日已过时间走，巡视那几小时多算（纯展示，结算在 00:00） */
  const productionBar = computed(() =>
    Math.round(
      productionBarOf(playerStore.clockGameTime, {
        patrolStartSeconds: view.value.patrolStartSeconds,
        patrolEndSeconds: view.value.patrolEndSeconds
      })
    )
  )

  /** 灵田日产量（每级 4 粮 × (24+S)/24，v2 不再乘民心） */
  const farmDaily = computed(() => {
    const farm = view.value.buildings.find(b => b.id === 'farm')
    return farm?.outputPerDay || 0
  })

  /** 经营链（b 段）状态文案 */
  const CHAIN_REASON_TEXT = {
    ok: '运转',
    'no-market': '市集未建',
    starved: '原料不足',
    unbuilt: '未建造'
  }
  const CHAIN_REASON_TYPE = {
    ok: 'success',
    'no-market': 'warning',
    starved: 'warning',
    unbuilt: 'default'
  }
  const chainReasonText = reason => CHAIN_REASON_TEXT[reason] || ''
  const chainTagType = reason => CHAIN_REASON_TYPE[reason] || 'default'
  const buildingName = id => buildingById(id)?.name || id

  const tutorialSteps = TUTORIAL_IDS.map(id => buildingById(id))
  const tutorialCurrent = computed(() => tutorialSteps[view.value.tutorialStep] || null)
  const tutorialMark = i => {
    if (i < view.value.tutorialStep) return '✅'
    if (i === view.value.tutorialStep) return '🔄'
    return '⬜'
  }

  const manorBuilding = computed(
    () => view.value.buildings.find(building => building.id === 'manor') || null
  )

  /**
   * 建造三步完成后**接上下一条引导**（2026-10-27）。
   *
   * 只接一条硬门槛：征收要乡侯府 Lv.2。这是玩家最容易卡住的地方 ——
   * 不升乡侯府，征收条永远是 0，看起来像坏了。目标达成后 `nextObjective` 变 null，
   * 整块引导自动消失（不再留一张读完的清单）。
   */
  const nextObjective = computed(() => {
    if (!view.value.tutorialDone) return null
    if (view.value.manorLevel < 2) {
      return {
        title: '乡侯府升到 Lv.2',
        desc: '解锁征收：每天 +1/30，满格入库一次；村民上限与更多建筑也会解锁。'
      }
    }
    return null
  })

  /** 成本显示：一阶账本整数 → 面额串（100 一阶 = 1 二阶） */
  const formatStones = total => formatSpiritual(total)

  /** 首日工钱（付款按天分期，至少付得起一天才有意义） */
  const dailyPayOf = quote =>
    quote?.costStones ? Math.ceil(quote.costStones / Math.max(quote.days, 1)) : 0
  const canAffordUpgrade = b =>
    (Number(playerStore.currency?.spiritual) || 0) >= dailyPayOf(b?.quote)

  /** 停工原因（只有真的会停时才提示，避免常态刷警告） */
  const stallHint = b => {
    if (b?.job && b?.laborShare?.waiting) {
      const pct = Math.round(b.laborShare.satisfaction * 100)
      return b.laborShare.reason === 'queue'
        ? `排队中：徭役先给先开工的项目（本项分到 ${pct}%，需 ≥50%）`
        : `停工：徭役不足（分到 ${pct}%，需 ≥50%）`
    }
    const pay = b?.job ? Math.round(b.job.costStones / Math.max(b.job.days, 1)) : 0
    if (pay > 0 && (playerStore.currency?.spiritual || 0) < pay) {
      return `灵石不足：今天需要 ${pay} 一阶，进度冻结`
    }
    return ''
  }

  const doBuild = b => {
    const result = playerStore.startEstateBuild(b.id)
    if (!result.ok) message.warning(result.message)
    else message.success(`${b.name}动工`)
  }

  const doUpgrade = b => {
    const result = playerStore.startEstateUpgrade(b.id)
    if (!result.ok) message.warning(result.message)
    else message.success(`${b.name}开始升级`)
  }
</script>

<style scoped>
  /* 分区框：照《UI 视觉规范》§2.2（唯一实现，直接复制）。InnerCourt.vue 那份是 scoped，不能跨页复用。
     2026-10-27 B3.5：从 --n-text-color 的 color-mix 换成 --ui-* token —— 本页是第一块吃 V1.2 的页面。 */
  .page-stack {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .zone {
    background: var(--ui-surface);
    border: 1px solid var(--ui-line);
    border-radius: var(--ui-radius);
    padding: 28px;
    box-shadow: var(--ui-shadow);
    overflow: hidden; /* 子块底色 / 表格横向滚动别溢出圆角 */
  }
  .zone-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 22px;
  }
  .zone-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: var(--ui-font-title);
    font-weight: 700;
    letter-spacing: 1px;
    color: var(--ui-ink);
  }
  .zone-title::before {
    /* V1.2 视觉锚点：暗金菱形，替代已废弃的蓝色竖条 */
    content: '';
    width: 5px;
    height: 5px;
    background: var(--ui-gold);
    transform: rotate(45deg);
  }
  .zone-body {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  /* 正文里的小字：辅助字号 ≥13px（规范 §六 验收线，原来一律 12px） */
  .hint {
    font-size: 13px;
    line-height: 1.6;
    color: var(--ui-ink-sub);
  }
  .hint.warn {
    color: var(--ui-cinnabar);
  }

  /* 概况：数值平权（18px / 700），标签 13px 淡色 */
  .stat-row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 28px;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 96px;
  }
  .stat .k {
    font-size: 13px;
    color: var(--ui-ink-sub);
  }
  .stat .v {
    font-size: 18px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--ui-ink);
  }
  .stat .sub {
    font-size: 13px;
    color: var(--ui-ink-sub);
  }

  /* 建筑行：左标题 + 进度，右操作。行与行靠间距 + 极淡虚线分隔，不实线框死 */
  .build-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 14px;
    border-bottom: 1px dashed var(--ui-line);
  }
  .build-row:last-of-type {
    border-bottom: none;
    padding-bottom: 0;
  }
  .build-main {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1 1 auto;
    min-width: 0;
  }
  .build-title {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    color: var(--ui-ink);
  }
  .bar-block {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-width: 520px;
  }
  /* 药浴池：五系药力条（与 Day 页同一套观感，但这里只读） */
  .pool-bars {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 24px;
  }
  .pool-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 220px;
  }
  .pool-el {
    width: 16px;
    color: var(--ui-ink-sub);
    font-size: 13px;
  }
  .pool-track {
    flex: 1 1 auto;
    min-width: 90px;
  }
  .pool-num {
    font-size: 13px;
    color: var(--ui-ink-sub);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .build-acts {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    flex: 0 0 auto;
    text-align: right;
  }

  /* 生产链（b 段）：与建筑行同构，右侧放单价与满产日入 */
  .chain-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 14px;
    border-bottom: 1px dashed var(--ui-line);
  }
  .chain-row:last-of-type {
    border-bottom: none;
    padding-bottom: 0;
  }
  .chain-main {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1 1 auto;
    min-width: 0;
  }
  .chain-title {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    color: var(--ui-ink);
  }
  .chain-acts {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    flex: 0 0 auto;
    text-align: right;
    color: var(--ui-ink);
  }

  /* 教程 */
  .tutorial-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    color: var(--ui-ink);
  }
  .tutorial-mark {
    width: 18px;
    text-align: center;
  }
  .tutorial-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  /* 流水：字号 14 / 行高 32（§1.6）；时间戳极淡，事件名青玉 */
  .log-row {
    display: flex;
    gap: 10px;
    font-size: 14px;
    line-height: 32px;
    color: var(--ui-ink);
  }
  .log-day {
    flex: 0 0 auto;
    color: var(--ui-ink-fade);
    font-variant-numeric: tabular-nums;
  }
  .log-built {
    color: var(--ui-jade);
    font-weight: 700;
  }

  /* ===== 封地全景（B14-d） =====
     地块三态只在这里配：灰 = 未解锁 / 未建造，彩 = 已建成，彩 + 进度条 = 建造中。
     色值一律 var(--ui-*)，不写第二套色（《UI 视觉规范》§1.2）。 */
  .estate-map {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    grid-auto-rows: minmax(72px, auto);
    gap: 8px;
  }
  .plot {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid transparent;
    background: color-mix(in srgb, var(--ui-ink) 4%, transparent);
    color: var(--ui-ink);
    min-width: 0;
    transition: border-color 0.15s ease, background-color 0.15s ease;
  }
  .plot-clickable {
    cursor: pointer;
  }
  .plot-clickable:hover {
    border-color: var(--ui-line-strong);
  }
  .plot-name {
    font-size: 14px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .plot-state {
    font-size: 13px; /* 辅助字号 ≥13px（《UI 视觉规范》§六 验收线） */
    color: var(--ui-ink-sub);
    font-variant-numeric: tabular-nums;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* 灰：未解锁 —— 只有轮廓，文字最淡 */
  .plot-locked {
    background: transparent;
    border: 1px dashed var(--ui-line);
    color: var(--ui-ink-fade);
  }
  .plot-locked .plot-name,
  .plot-locked .plot-state {
    color: var(--ui-ink-fade);
  }
  /* 灰：已解锁未建造 —— 与未解锁同样无彩，但虚线更实、文字正常 */
  .plot-open {
    background: transparent;
    border: 1px dashed var(--ui-line-strong);
  }
  /* 彩：已建成（10% 太淡看不出「彩色地块」，16% 仍然只吃 token） */
  .plot-built {
    background: color-mix(in srgb, var(--ui-jade) 16%, var(--ui-surface));
    border-color: color-mix(in srgb, var(--ui-jade) 45%, transparent);
  }
  /* 彩 + 进度条：建造中（比建成淡一档，进度条自己说明状态） */
  .plot-building {
    background: color-mix(in srgb, var(--ui-jade) 10%, var(--ui-surface));
    border-color: color-mix(in srgb, var(--ui-jade) 45%, transparent);
  }
  /* 图例 */
  .plot-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 20px;
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--ui-ink-sub);
  }
  .sw {
    width: 14px;
    height: 14px;
    border-radius: 3px;
    flex: 0 0 auto;
  }
  .sw-locked {
    border: 1px dashed var(--ui-line);
  }
  .sw-open {
    border: 1px dashed var(--ui-line-strong);
  }
  /* 图例小样要比地块本身更显眼一档，否则 14px 方块缩到几乎看不见 */
  .sw-built {
    background: color-mix(in srgb, var(--ui-jade) 25%, var(--ui-surface));
    border: 1px solid color-mix(in srgb, var(--ui-jade) 55%, transparent);
  }
  .sw-building {
    background: linear-gradient(
      to right,
      color-mix(in srgb, var(--ui-jade) 25%, var(--ui-surface)) 55%,
      var(--ui-surface) 55%
    );
    border: 1px solid color-mix(in srgb, var(--ui-jade) 55%, transparent);
  }
  /* 从全景图跳过来的那一行：短暂金框，2.4 秒后自己消失 */
  .build-focus {
    border-radius: 8px;
    outline: 1px solid var(--ui-line-strong);
    outline-offset: 6px;
  }

  @media (max-width: 720px) {
    .zone {
      padding: 18px;
    }
    .build-row,
    .chain-row {
      flex-direction: column;
      gap: 8px;
    }
    .build-acts,
    .chain-acts {
      align-items: flex-start;
      text-align: left;
    }
    .stat {
      min-width: calc(50% - 14px);
    }
    /* 手机：地块放弃绝对格位，两列自动流（乡侯府的 2×2 也跟着收成 1×1） */
    .estate-map {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .plot {
      grid-area: auto !important;
    }
  }
</style>
