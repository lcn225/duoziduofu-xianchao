<template>
  <n-layout>
    <n-layout-header bordered>
      <n-page-header>
        <template #title>多子多福</template>
        <template #subtitle>
          <n-space align="center" :size="8">
            <n-tag size="small" :type="isAuto ? 'info' : 'default'" :bordered="false">
              {{ isAuto ? '自动' : '手动' }}
            </n-tag>
            <n-text depth="3" style="font-size: 12px">内宅 · 子嗣 · 家族树</n-text>
          </n-space>
        </template>
      </n-page-header>
    </n-layout-header>
    <n-layout-content>
      <n-card :bordered="false">
        <n-alert type="default" show-icon style="margin-bottom: 12px">
          受多子多福系统影响，妻妾子嗣生命周期加速，此乃仙家手段。
        </n-alert>
        <n-tabs type="line" v-model:value="tab">
          <!-- ============ 内宅 ============ -->
          <n-tab-pane name="night" tab="内宅">
            <n-space vertical size="large">
              <n-alert type="info" show-icon>
                内宅<strong>不暂停时间</strong>。留宿每晚（游戏时间第 {{ eveningHour }} 时）自动进行，
                孕育、产后恢复与流水账都会在你眼前实时推进。
              </n-alert>

              <n-grid :cols="5" :x-gap="12" :y-gap="8">
                <n-grid-item><n-statistic label="侍妾" :value="summary.total" /></n-grid-item>
                <n-grid-item><n-statistic label="待孕" :value="summary.idle" /></n-grid-item>
                <n-grid-item><n-statistic label="已孕" :value="summary.pregnant" /></n-grid-item>
                <n-grid-item><n-statistic label="子嗣" :value="summary.offspring" /></n-grid-item>
                <n-grid-item><n-statistic label="修行加成" :value="bonusPct" suffix="%" /></n-grid-item>
              </n-grid>
              <n-text depth="3" style="font-size: 12px">
                经期 {{ summary.period }} 位 · 已故 {{ summary.passedAway }} 位（已移入家族树）
              </n-text>

              <n-space align="center" :wrap="false">
                <n-text depth="3" style="white-space: nowrap">
                  <!-- 体力现在是**按切片小数结算**的（一个 tick 可能只扣 0.75），
                       所以这里要取整 —— 原始值会在界面上抖出一串小数 -->
                  体力 {{ Math.round(playerStore.energy) }} / {{ Math.round(playerStore.energyMax) }}
                </n-text>
                <n-progress
                  type="line"
                  style="flex: 1 1 auto"
                  :percentage="energyPct"
                  :color="energyColor"
                  :show-indicator="false"
                />
                <n-tag size="small" :type="playerStore.canInteractToday ? 'success' : 'default'">
                  {{ playerStore.canInteractToday ? '今夜未留宿' : '今夜已留宿' }}
                </n-tag>
              </n-space>

              <n-space align="center">
                <n-radio-group :value="nightMode" size="small" @update:value="playerStore.setNightMode">
                  <n-radio-button value="auto">自动</n-radio-button>
                  <n-radio-button value="manual">手动</n-radio-button>
                </n-radio-group>
                <template v-if="isAuto">
                  <n-text depth="3">挑人规则</n-text>
                  <n-select
                    :value="autoRule"
                    :options="ruleOptions"
                    size="small"
                    style="width: 150px"
                    @update:value="playerStore.setAutoRule"
                  />
                  <n-text depth="3" style="font-size: 12px">
                    每日第 {{ eveningHour }} 时自动留宿，怀孕率 -{{ (autoPenalty * 100).toFixed(0) }}%
                  </n-text>
                </template>
              </n-space>

              <n-grid :cols="2" :x-gap="16" :y-gap="12">
                <!-- 左：侍妾名单 -->
                <n-grid-item>
                  <n-card size="small" title="侍妾名单">
                    <template #header-extra>
                      <n-text depth="3" style="font-size: 12px">{{ listHint }}</n-text>
                    </template>

                    <n-empty v-if="!displayWives.length" description="内宅空无一人" size="small" />
                    <template v-else>
                      <div class="wife-head">
                        <span></span>
                        <span>姓名</span>
                        <span>仙龄</span>
                        <span>位阶</span>
                        <span>状态</span>
                        <span>好感</span>
                        <span>怀孕率</span>
                        <span>剩余</span>
                      </div>

                      <n-checkbox-group v-model:value="selected">
                        <div class="wife-list">
                          <div
                            v-for="w in displayWives"
                            :key="w.id"
                            class="wife-row"
                            :class="{ 'is-busy': w.status !== 'idle' }"
                          >
                            <!-- 自动模式：名单是只读的观战面板，标出今晚会轮到谁 -->
                            <span v-if="isAuto" class="plan-dot" :class="{ on: autoPlan.includes(w.id) }">●</span>
                            <n-checkbox v-else :value="w.id" :disabled="w.status !== 'idle'" />

                            <span class="wife-name">{{ w.name }}</span>
                            <span class="num dim age-cell">{{ ageText(w) }}</span>
                            <span><n-tag size="tiny" :bordered="false">{{ rankName(w.rank) }}</n-tag></span>
                            <span>
                              <n-tag size="tiny" :bordered="false" :type="(STATUS[w.status] || STATUS.idle).type">
                                {{ (STATUS[w.status] || STATUS.idle).label }}
                              </n-tag>
                            </span>
                            <span class="num">{{ w.affinity }}</span>
                            <span class="num" :class="{ dim: w.status !== 'idle' }">
                              {{ w.status === 'idle' ? chancePct(w) : '—' }}
                            </span>
                            <span class="num dim">
                              {{ w.status === 'idle' ? '—' : playerStore.remainingDaysOf(w.statusEndTime) + ' 天' }}
                            </span>
                          </div>
                        </div>
                      </n-checkbox-group>
                    </template>

                    <template #action>
                      <n-space v-if="!isAuto" justify="space-between" align="center">
                        <n-space size="small">
                          <n-button size="tiny" quaternary @click="selectAll">全选待孕</n-button>
                          <n-button size="tiny" quaternary @click="selected = []">清空</n-button>
                        </n-space>
                        <n-button type="primary" size="small" :disabled="!canStart" :loading="busy" @click="startNight">
                          留宿 {{ selected.length }} 人（耗 {{ plannedCost }}）
                        </n-button>
                      </n-space>
                      <n-text v-else depth="3" style="font-size: 12px">
                        自动模式会在第 {{ eveningHour }} 时按规则挑人留宿；切成「手动」可自己挑。
                      </n-text>
                    </template>
                  </n-card>
                </n-grid-item>

                <!-- 右：流水账 -->
                <n-grid-item>
                  <n-card size="small" title="内宅流水">
                    <template #header-extra>
                      <n-text depth="3" style="font-size: 12px">最新在上</n-text>
                    </template>
                    <div ref="logBox" class="court-log">
                      <n-empty v-if="!log.length" description="暂无记录" size="small" />
                      <div v-for="(item, i) in log" :key="i" class="log-line">
                        <span class="log-day">第 {{ item.day }} 天</span>
                        <span>{{ item.text }}</span>
                      </div>
                    </div>
                  </n-card>
                </n-grid-item>
              </n-grid>
            </n-space>
          </n-tab-pane>

          <!-- ============ 子嗣 ============ -->
          <n-tab-pane name="offspring" tab="子嗣">
            <!-- ⚠ 这里不用 n-space vertical：2026-10-20 实测，子嗣数据从 0 变成有数据时，
                 NSpace 会把工具栏这类动态子节点重复渲染多份（截图里出现了 4 个筛选器）。
                 换成普通 flex 容器后消失。 -->
            <div class="offspring-stack">
              <!-- P35：三区各自一个分区框（标题栏 + 边框 + 略浅底色），样式见 .zone -->
              <section class="zone">
                <div class="zone-head">
                  <span class="zone-title">子嗣概况</span>
                </div>
                <div class="zone-body">
                  <!-- P28.5：窄屏 4 列两行，宽屏 8 项一行 -->
                  <n-grid :cols="isNarrow ? 4 : 8" :x-gap="12" :y-gap="8">
                    <n-grid-item><n-statistic label="子嗣总数" :value="summary.offspring" /></n-grid-item>
                    <n-grid-item>
                      <n-statistic label="已传" :value="summary.maxGeneration" suffix="代" />
                    </n-grid-item>
                    <n-grid-item><n-statistic label="子" :value="summary.males" /></n-grid-item>
                    <n-grid-item><n-statistic label="女" :value="summary.females" /></n-grid-item>
                    <n-grid-item><n-statistic label="有灵根" :value="summary.rooted" /></n-grid-item>
                    <n-grid-item><n-statistic label="无灵根" :value="summary.rootless" /></n-grid-item>
                    <n-grid-item>
                      <n-statistic label="可出战" :value="fightReadyCount" />
                    </n-grid-item>
                    <n-grid-item>
                      <n-statistic label="修行加成" :value="bonusPct" suffix="%" />
                    </n-grid-item>
                  </n-grid>

                  <!-- 2026-10-20：按代汇总。孙辈之后还有曾孙/玄孙，不能再只报一个「孙辈」。
                       P28.5：改普通 flex 行，别再踩 n-space 动态子节点重复渲染的坑。 -->
                  <div class="gen-row">
                    <n-text depth="3" style="font-size: 12px">各代存活</n-text>
                    <n-tag
                      v-for="g in summary.generations"
                      :key="g.generation"
                      size="small"
                      :bordered="false"
                    >
                      {{ g.label }} {{ g.count }}
                    </n-tag>
                    <n-text v-if="!summary.generations.length" depth="3" style="font-size: 12px">
                      暂无子嗣
                    </n-text>
                  </div>

                  <!-- P28.5：原来常显的 6 行长说明收进折叠项，默认收起（2026-10-22 用户拍板）。
                       「人口已满」这个告警状态挪到标题旁的小标签上，免得收起来就看不见。 -->
                  <n-collapse>
                    <n-collapse-item name="rules">
                      <template #header>
                        <n-space :size="6" align="center">
                          <span>子嗣规则说明</span>
                          <n-tag v-if="summary.atCap" size="tiny" type="warning" :bordered="false">
                            人口已满，暂不再生育
                          </n-tag>
                        </n-space>
                      </template>
                      <n-text depth="3" style="font-size: 12px; line-height: 1.9">
                        有灵根子嗣提供修炼加成：灵根 × 本命契合 × 词条 = <strong>原始 +{{ rawBonusPct }}%</strong>；
                        再按宿主大境界套软上限（当前 {{ bonusCapPct }}%），实得 <strong>+{{ bonusPct }}%</strong>。
                        有灵根子嗣启蒙后自动修炼，<strong>练气二层</strong>可入秘境出战；
                        无灵根子嗣<strong>满 {{ TUNING.familyJobs.minAgeYears }} 岁</strong>后可安排家族工作。
                        子嗣到青年自动婚配并繁育下一代（女儿外嫁、不计其子女）；全族上限
                        {{ summary.populationCap }} 人。陨落子嗣不再提供加成。
                      </n-text>
                    </n-collapse-item>
                  </n-collapse>
                </div>
              </section>

              <section class="zone">
                <div class="zone-head">
                  <span class="zone-title">今日汇报</span>
                </div>
                <div class="zone-body">
                  <!-- 汇报区（P28.5，2026-10-22）：宽屏两框并排、窄屏堆叠。
                       以前两张大卡各占一整行，把主表推到屏幕外；现在合并成一行。
                       普通 div + CSS grid，不用 n-space（见页签顶部那个重复渲染的坑）。 -->
                  <div class="report-grid" :class="{ 'is-narrow': isNarrow }">
                    <!-- 2026-10-20：子嗣历练（《探索系统》§七） -->
                    <n-card size="small" title="子嗣历练" class="report-box" :bordered="false">
                      <template #header-extra>
                        <n-space :size="8" align="center">
                          <n-text depth="3" style="font-size: 12px">
                            在外 {{ expSummary.active }}/{{ expSummary.cap }} 人
                          </n-text>
                          <n-tag
                            v-if="expSummary.overCap"
                            size="small"
                            type="warning"
                            :bordered="false"
                          >
                            超上限 {{ expSummary.overCap }} 人今日打坐
                          </n-tag>
                        </n-space>
                      </template>
                      <n-space vertical :size="8">
                        <n-text depth="3" style="font-size: 12px">
                          有灵根 + 练气二层可派出去历练；产出按子嗣自己可去的最高图，约为桂冈的 80%，
                          <strong>不产宝匣</strong>。战败停止历练 1 天（养伤中），最多
                          {{ expSummary.cap }} 人同时在外。仅探索 = 80% 打坐修为 + 80% 探索产出；
                          综合 = 90% 修为 + 40% 产出。
                        </n-text>
                        <n-space align="center" :size="12">
                          <n-text>可派 <strong>{{ expSummary.eligible }}</strong> 人</n-text>
                          <n-text>已配置 <strong>{{ expSummary.assigned }}</strong> 人</n-text>
                          <n-text>养伤中 <strong>{{ expSummary.injured }}</strong> 人</n-text>
                        </n-space>
                        <n-divider style="margin: 4px 0" />
                        <template v-if="expReport">
                          <n-space justify="space-between" align="center">
                            <n-text strong>第 {{ expReport.day + 1 }} 天 · 日结</n-text>
                            <n-text depth="3" style="font-size: 12px">
                              {{ expReport.totals.children }} 人在外 · 事件
                              {{ expReport.totals.events }} 次
                            </n-text>
                          </n-space>
                          <n-space :size="6" wrap>
                            <n-tag size="small" :bordered="false" type="info">
                              战斗 {{ expReport.totals.wins }} 胜 {{ expReport.totals.losses }} 负
                            </n-tag>
                            <n-tag size="small" :bordered="false">
                              采集 {{ expReport.totals.gathers }}
                            </n-tag>
                            <n-tag size="small" :bordered="false">
                              拾遗 {{ expReport.totals.pickups }}
                            </n-tag>
                            <n-tag size="small" :bordered="false" type="success">
                              灵石 +{{ expReport.totals.stones }}
                            </n-tag>
                            <n-tag size="small" :bordered="false">
                              材料 {{ expReport.totals.items }}
                            </n-tag>
                            <n-tag
                              v-if="expReport.totals.fragments"
                              size="small"
                              :bordered="false"
                            >
                              残页 +{{ expReport.totals.fragments }}
                            </n-tag>
                            <n-tag size="small" :bordered="false" type="warning">
                              修为 +{{ formatAmount(expReport.totals.cultivation) }}
                            </n-tag>
                            <n-tag
                              v-if="expReport.totals.levelUps"
                              size="small"
                              :bordered="false"
                              type="success"
                            >
                              {{ expReport.totals.levelUps }} 人突破
                            </n-tag>
                            <n-tag
                              v-if="expReport.totals.newlyInjured"
                              size="small"
                              :bordered="false"
                              type="error"
                            >
                              {{ expReport.totals.newlyInjured }} 人战败
                            </n-tag>
                          </n-space>
                          <!-- P28.5：11 列明细收进折叠项，框保持矮；展开后半宽内横向滚动。
                               display-directive="if"：表格别在 display:none 下挂载，
                               否则首次展开时列宽要等一次 resize 才量准。 -->
                          <n-collapse display-directive="if">
                            <n-collapse-item
                              :title="`明细（${expReport.perChild.length} 人）`"
                              name="detail"
                            >
                              <n-data-table
                                size="small"
                                :columns="expeditionColumns"
                                :data="expReport.perChild"
                                :row-key="row => row.id"
                                :bordered="false"
                                :single-line="false"
                                :scroll-x="620"
                              />
                            </n-collapse-item>
                          </n-collapse>
                        </template>
                        <n-text v-else depth="3" style="font-size: 12px">
                          今日无子嗣在外历练。给练气二层以上的有灵根子嗣在「历练」列选择档位即可派出。
                        </n-text>
                      </n-space>
                    </n-card>

                    <!-- 2026-10-20：家族工作最小闭环（6 个经济岗，产出映射到现有资源） -->
                    <n-card size="small" title="家族工作" class="report-box" :bordered="false">
                      <template #header-extra>
                        <n-space :size="8">
                          <n-button size="tiny" type="primary" secondary @click="autoAssignJobs">
                            自动分配
                          </n-button>
                          <n-button size="tiny" quaternary @click="clearJobs">全部撤下</n-button>
                        </n-space>
                      </template>
                      <n-space vertical :size="8">
                        <n-text depth="3" style="font-size: 12px">
                          工作按游戏天结算，产出直接进钱袋 / 背包。当前只开放 6 个经济岗位；
                          粮草 / 情报 / 安全 / 好感等岗位属模块四 / 六，暂不开放。
                        </n-text>
                        <n-space align="center" :size="12">
                          <n-text>当值 <strong>{{ familySummary.workers }}</strong> 人</n-text>
                          <n-text depth="3">可安排 {{ familySummary.workable }} 人</n-text>
                          <n-text>日入：<strong>{{ familySummary.outputText || '—' }}</strong></n-text>
                        </n-space>
                        <n-space :size="6">
                          <n-tag
                            v-for="j in familySummary.jobs"
                            :key="j.id"
                            size="small"
                            :bordered="false"
                          >
                            {{ j.name }} {{ j.count }}
                          </n-tag>
                        </n-space>
                      </n-space>
                    </n-card>
                  </div>
                </div>
              </section>

              <!-- 子嗣名册（P28.5 复盘）：主表也成一块，与概况、汇报区凑成三个分区。
                   筛选按钮宽屏放分区标题栏右侧；窄屏放不下，回到正文首行。 -->
              <section class="zone">
                <div class="zone-head">
                  <span class="zone-title">子嗣名册</span>
                  <n-radio-group v-if="!isNarrow" v-model:value="filter" size="small">
                    <n-radio-button
                      v-for="o in filterOptions"
                      :key="o.value"
                      :value="o.value"
                    >
                      {{ o.label }}
                    </n-radio-button>
                  </n-radio-group>
                </div>
                <div class="zone-body">
                  <!-- 2026-10-20：原来这里是个下拉，和表格右下「每页条数」下拉并排时
                       看起来像两个筛选器。改成按钮组，筛选项一眼可见。
                       ⚠ 外层容器也换成了普通 div，原因见子嗣页签顶部的注释。 -->
                  <div class="table-toolbar">
                    <n-radio-group v-if="isNarrow" v-model:value="filter" size="small">
                      <n-radio-button
                        v-for="o in filterOptions"
                        :key="o.value"
                        :value="o.value"
                      >
                        {{ o.label }}
                      </n-radio-button>
                    </n-radio-group>
                    <n-text depth="3">
                      共 {{ filteredRows.length }} 位 · 存活 {{ summary.offspring }} · 陨落 {{ summary.fallen }}
                      · 人口 {{ summary.population }}/{{ summary.populationCap }} · 已婚 {{ summary.married }}
                    </n-text>
                  </div>

                  <n-empty v-if="!filteredRows.length" description="尚无子嗣" />

                  <!-- 宽屏：密集表格（默认按出生时间倒序；可点表头排序） -->
                  <n-data-table
                    v-else-if="!isNarrow"
                    :columns="offspringColumns"
                    :data="filteredRows"
                    :row-key="row => row.id"
                    :pagination="tablePagination"
                    :scroll-x="1680"
                    size="small"
                    :bordered="false"
                    :single-line="false"
                    @update:page="onPageChange"
                    @update:page-size="onPageSizeChange"
                  />

                  <!-- 窄屏（<720px）：退回卡片，避免十列挤成一团 -->
                  <template v-else>
                    <n-pagination
                      v-model:page="page"
                      :page-size="pageSize"
                      :item-count="filteredRows.length"
                      v-if="filteredRows.length > pageSize"
                      :page-slot="7"
                    />
                    <n-grid :cols="1" :x-gap="12" :y-gap="8">
                      <n-grid-item v-for="c in pageRows" :key="c.id">
                        <n-card hoverable>
                          <template #header>
                            <n-space justify="space-between" align="center">
                              <n-space align="center" :size="6">
                                <n-tag
                                  size="small"
                                  :type="c.gender === 'female' ? 'error' : 'info'"
                                  :bordered="false"
                                >
                                  {{ genderOf(c).label }}
                                </n-tag>
                                <span>{{ c.name }}</span>
                              </n-space>
                            </n-space>
                          </template>
                          <n-space vertical size="small">
                            <template v-if="c.hasRoot">
                              <n-text>{{ growthText(c) }} · {{ c.status === 'fallen' ? '陨落' : '存活' }}</n-text>
                              <n-text>境界：{{ realmText(c) }}</n-text>
                              <n-text>灵根：{{ c.rootCount }} 系（{{ elementNames(c.roots) }}）</n-text>
                              <n-text>本命：{{ fateLabelOf(c) }}</n-text>
                              <n-text>词条：{{ (c.traits || []).map(t => t.name).join('、') || '无' }}</n-text>
                              <n-text strong type="primary">单个加成 +{{ (c.bonus * 100).toFixed(1) }}%</n-text>
                            </template>
                            <n-text v-else depth="3">
                              {{ growthText(c) }} · {{ c.status === 'fallen' ? '陨落' : '存活' }} ·
                              无灵根，不提供修炼加成
                            </n-text>
                            <n-text v-if="c.gender === 'male' && c.status !== 'fallen'" depth="3">
                              配偶：{{ c.spouse ? `${c.spouse.name}（${rankName(c.spouse.rank)} · ${rootCountName(c.spouse.rootCount)}）` : '未婚' }}
                              <template v-if="c.childrenIds?.length">
                                · 子女 {{ c.childrenIds.length }}/{{ TUNING.breeding.maxBirthsPerCouple }}
                              </template>
                            </n-text>
                            <n-text v-else-if="isMarriedOut(c)" depth="3">已外嫁（其子女不计入子孙）</n-text>
                            <n-text depth="3">
                              {{ c.fatherName ? `生父：${c.fatherName} · ` : '' }}
                              生母：{{ c.motherName }}（诞下时{{ rankName(c.motherRankAtBirth) }}）
                            </n-text>
                            <n-space
                              v-if="!c.hasRoot && c.status !== 'fallen' && workable(c)"
                              align="center"
                              :size="8"
                            >
                              <n-text depth="3">岗位：</n-text>
                              <n-select
                                size="small"
                                style="width: 130px"
                                :value="c.job || null"
                                :options="jobOptions"
                                clearable
                                placeholder="安排"
                                @update:value="v => onAssignJob(c.id, v)"
                              />
                            </n-space>
                            <n-text
                              v-else-if="!c.hasRoot && c.status !== 'fallen'"
                              depth="3"
                              style="font-size: 12px"
                            >
                              岗位：{{ workBlockedText(c) }}
                            </n-text>
                            <n-space v-else-if="c.hasRoot" align="center" :size="8">
                              <template v-if="c.expeditionEligible">
                                <n-text depth="3">历练：</n-text>
                                <n-select
                                  size="small"
                                  style="width: 130px"
                                  :value="c.expeditionMode || 'cultivate'"
                                  :options="expeditionOptions"
                                  @update:value="v => onSetExpeditionMode(c.id, v)"
                                />
                              </template>
                              <n-text v-else depth="3">后台修炼中，练气二层后可历练</n-text>
                            </n-space>
                          </n-space>
                        </n-card>
                      </n-grid-item>
                    </n-grid>
                  </template>
                </div>
              </section>
            </div>
          </n-tab-pane>

          <!-- ============ 家族树（英烈祠并入这里） ============ -->
          <n-tab-pane name="family" tab="家族树">
            <n-space vertical size="large">
              <n-alert type="info" show-icon>
                按代际折叠的家族总览：妻妾、子嗣、已故与英烈都在这里。子嗣的 9 列详细表格仍在「子嗣」页签。
                <br />
                妻妾栏标的是**亲生子女数**；孙辈记在儿子名下，不算进祖母的计数。
              </n-alert>

              <n-card size="small" title="妻妾">
                <n-space vertical :size="6">
                  <n-text v-for="w in familyWives.living" :key="w.id">
                    <n-tag size="tiny" :bordered="false">{{ rankName(w.rank) }}</n-tag>
                    {{ w.name }} · {{ wifeAgeText(w) }} ·
                    <n-tag size="tiny" :bordered="false" type="success">
                      亲生 {{ childCountOf(w).total }} 子（存活 {{ childCountOf(w).alive }}）
                    </n-tag>
                    · {{ (STATUS[w.status] || STATUS.idle).label }}
                  </n-text>
                  <n-text v-if="!familyWives.living.length" depth="3">暂无在世妻妾</n-text>
                  <template v-if="familyWives.passed.length">
                    <n-divider style="margin: 4px 0" />
                    <n-text
                      v-for="w in familyWives.passed"
                      :key="w.id"
                      depth="3"
                      style="font-size: 12px"
                    >
                      已故：{{ w.name }} · 享年
                      {{ Math.floor(wifeAgeYearsOf(w, playerStore.clockGameTime) || 0) }} 岁 ·
                      亲生 {{ childCountOf(w).total }} 子（存活 {{ childCountOf(w).alive }}）
                    </n-text>
                  </template>
                </n-space>
              </n-card>

              <n-collapse v-model:expanded-names="expandedGens">
                <n-collapse-item
                  v-for="g in familyGenerations"
                  :key="g.generation"
                  :name="'g' + g.generation"
                >
                  <template #header>
                    <n-space align="center" :size="8">
                      <span>{{ g.label }}</span>
                      <n-tag size="tiny" :bordered="false">存活 {{ g.alive }}</n-tag>
                      <n-tag v-if="g.fallen" size="tiny" type="error" :bordered="false">
                        英烈 {{ g.fallen }}
                      </n-tag>
                      <n-tag v-if="g.passedAway" size="tiny" :bordered="false">
                        已故 {{ g.passedAway }}
                      </n-tag>
                    </n-space>
                  </template>
                  <n-list v-if="g.members.length" bordered>
                    <n-list-item v-for="c in g.members" :key="c.id">
                      <n-space justify="space-between" align="center">
                        <n-space vertical :size="2">
                          <n-space align="center" :size="6">
                            <n-text strong>{{ c.name }}</n-text>
                            <n-tag
                              size="tiny"
                              :type="c.gender === 'female' ? 'error' : 'info'"
                              :bordered="false"
                            >
                              {{ genderOf(c).label }}
                            </n-tag>
                            <n-tag
                              size="tiny"
                              :bordered="false"
                              :type="
                                c.status === 'fallen'
                                  ? 'error'
                                  : c.status === 'passed_away'
                                    ? 'default'
                                    : 'success'
                              "
                            >
                              {{ familyStatusText(c) }}
                            </n-tag>
                          </n-space>
                          <n-text depth="3" style="font-size: 12px">
                            {{ familyAgeText(c) }} ·
                            {{ c.hasRoot ? rootCountName(c.rootCount) : '无灵根' }} · 生母
                            {{ c.motherName || '—' }}
                            <span v-if="c.spouse"> · 配偶 {{ c.spouse.name }}</span>
                          </n-text>
                        </n-space>
                      </n-space>
                    </n-list-item>
                  </n-list>
                  <n-empty v-else description="这一代还没有子嗣" size="small" />
                </n-collapse-item>
              </n-collapse>
              <n-empty v-if="!familyGenerations.length" description="家族树还是空的" />

              <n-divider>英烈祠</n-divider>
              <n-alert type="info" show-icon>
                在秘境中陨落的子嗣会供奉于此。每块牌位提供打坐修为与后代灵根概率加成；
                陵园数据仍存放在秘境的存档里，这里只是换了入口。
              </n-alert>
              <n-descriptions :column="3" bordered size="small">
                <n-descriptions-item label="牌位">
                  {{ playerStore.secretRealm.shrine.length }}
                </n-descriptions-item>
                <n-descriptions-item label="打坐修为加成">
                  +{{ Math.round(playerStore.shrineCultivationBonus * 100) }}%
                </n-descriptions-item>
                <n-descriptions-item label="灵根概率加成">
                  +{{ (playerStore.shrineRootChanceBonus * 100).toFixed(1) }}%
                </n-descriptions-item>
              </n-descriptions>
              <n-empty v-if="!playerStore.secretRealm.shrine.length" description="还没有陨落的子嗣" />
              <n-list v-else bordered>
                <n-list-item v-for="m in playerStore.secretRealm.shrine" :key="m.id">
                  <n-space justify="space-between" align="center">
                    <n-space vertical :size="2">
                      <n-text strong>{{ m.name }}</n-text>
                      <n-text depth="3" style="font-size: 12px">
                        {{ rootCountName(m.rootCount) }} · 本命 {{ m.fate?.name || '—' }}
                      </n-text>
                    </n-space>
                    <n-text depth="3">止步第 {{ m.deathFloor }} 层</n-text>
                  </n-space>
                </n-list-item>
              </n-list>
            </n-space>
          </n-tab-pane>
        </n-tabs>
      </n-card>
    </n-layout-content>
  </n-layout>
</template>

<script setup>
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { useMessage } from 'naive-ui'
  import { usePlayerStore } from '../stores/player'
  import {
    formatOffspringGrowth,
    offspringGrowthOf,
    stageAtLeast,
    rootCountName,
    rankName,
    fateLabelOf,
    wifeAgeYearsOf,
    wifeLifeStageOf,
    wifeLifespanOf,
    offspringRealmNameOf,
    offspringCultivationGainOf,
    offspringLevelCostOf,
    canDoFamilyJobOf,
    FAMILY_JOBS,
    EXPEDITION_MODES,
    TUNING
  } from '../plugins/innerCourt'
  import { STATUS_META, OFFSPRING_GENDER_META } from '../plugins/innerCourtData'
  import { ELEMENTS } from '../plugins/wuxing'
  import { formatAmount } from '../plugins/currency'
  // 2026-10-22 P28.5：两套列定义搬到独立文件（P27 #3「列定义抽文件」）
  import { createExpeditionColumns, createOffspringColumns } from './offspringColumns'

  const playerStore = usePlayerStore()
  const message = useMessage()

  const tab = ref('night')
  const selected = ref([])
  const busy = ref(false)

  const STATUS = STATUS_META
  const genderOf = c => OFFSPRING_GENDER_META[c.gender] || OFFSPRING_GENDER_META.male

  const eveningHour = TUNING.night.eveningHour
  const autoPenalty = TUNING.pregnancy.autoPenalty
  const nightMode = computed(() => playerStore.innerCourt.nightMode || 'manual')
  const isAuto = computed(() => nightMode.value === 'auto')
  const autoRule = computed(() => playerStore.innerCourt.autoRule || 'relation')
  const ruleOptions = [
    { label: '优先高好感', value: 'relation' },
    { label: '优先高位阶', value: 'rank' },
    { label: '平均分配', value: 'robin' }
  ]

  /**
   * 名单固定按「待孕 → 已孕 → 产后恢复」分组，组内再按位阶、好感降序。
   * 待孕的排最前，一屏之内先看到能动的；顺序稳定（好感本批不变），不会边看边跳。
   */
  const STATUS_ORDER = { idle: 0, period: 1, pregnant: 2, recovering: 3, passed_away: 4 }
  // 内宅只显示在世妻妾；已故的留在 wives 数组里，家族树单独展示
  const displayWives = computed(() =>
    [...playerStore.livingWives].sort(
      (a, b) =>
        (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
        (b.rank || 0) - (a.rank || 0) ||
        (b.affinity || 0) - (a.affinity || 0)
    )
  )

  /** 仙龄 + 阶段：少女 / 妇人 / 老妇（女修 P9+ 的阶段阈值按寿元等比缩放） */
  const ageText = w => {
    const age = wifeAgeYearsOf(w, playerStore.clockGameTime)
    if (age == null) return '—'
    const stage = wifeLifeStageOf(age, wifeLifespanOf(w))
    return `${Math.floor(age)}岁·${stage?.name || ''}`
  }

  const wifeAgeText = w => {
    const age = wifeAgeYearsOf(w, playerStore.clockGameTime)
    return age == null ? '—' : `${Math.floor(age)} 岁`
  }

  // ---------- 家族树（v1：按代折叠 + 妻妾 + 英烈祠） ----------
  const familyWives = computed(() => ({
    living: playerStore.livingWives,
    passed: playerStore.passedAwayWives
  }))

  /**
   * 某位侍妾的**亲生子女数**（2026-10-21 用户：「至少要能搞清楚每个侍妾生了多少娃」）。
   *
   * 口径：`wife.childrenIds`（出生时 push）∪ `offspring.motherId === wife.id`，
   * 两者任一命中都算 —— 老档在这两处写入不完整时也能数全。
   * 孙辈的 `motherId` 是空的（只记 `motherName`），所以不会算进祖母。
   */
  const childCountOf = wife => {
    const ids = new Set(wife?.childrenIds || [])
    const own = (playerStore.offspring?.list || []).filter(
      c => ids.has(c.id) || c.motherId === wife?.id
    )
    return {
      total: own.length,
      alive: own.filter(c => c.status !== 'fallen' && c.status !== 'passed_away').length
    }
  }

  const familyGenerations = computed(() => {
    const list = playerStore.offspring?.list || []
    const byGen = new Map()
    for (const c of list) {
      const generation = Number(c.generation) || 1
      if (!byGen.has(generation)) byGen.set(generation, [])
      byGen.get(generation).push(c)
    }
    return [...byGen.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([generation, members]) => {
        const alive = members.filter(
          c => c.status !== 'fallen' && c.status !== 'passed_away'
        )
        return {
          generation,
          label: `第 ${generation} 代`,
          members,
          alive: alive.length,
          fallen: members.filter(c => c.status === 'fallen').length,
          passedAway: members.filter(c => c.status === 'passed_away').length,
          folded: alive.length === 0
        }
      })
  })

  const expandedGens = ref([])
  watch(
    familyGenerations,
    gens => {
      if (expandedGens.value.length) return
      expandedGens.value = gens.filter(g => !g.folded).map(g => `g${g.generation}`)
    },
    { immediate: true }
  )

  const familyStatusText = c =>
    c.status === 'fallen' ? '陨落' : c.status === 'passed_away' ? '已故' : '存活'
  const familyAgeText = c => formatOffspringGrowth(offspringGrowthOf(c, playerStore.clockGameTime))

  const summary = computed(() => playerStore.courtSummary)
  const bonusPct = computed(() => (summary.value.bonus * 100).toFixed(1))
  // P28.5：统计条补「可出战」= 有灵根 + 练气二层（与秘境出战同一口径）
  const fightReadyCount = computed(() => playerStore.fightReadyOffspring.length)
  const rawBonusPct = computed(() => (summary.value.rawBonus * 100).toFixed(1))
  const bonusCapPct = computed(() => (summary.value.bonusCap * 100).toFixed(0))
  // 存储按时间正序追加；展示时倒过来，**最新的在最上面**（用户要求）
  const log = computed(() => [...(playerStore.innerCourt.interactionLog || [])].reverse())
  const autoPlan = computed(() => (isAuto.value ? playerStore.autoNightPlan : []))

  /** 名单右上角的一句话提示。今夜已过时不能再显示「今晚约 0 人」——那会被读成「挑不出人」 */
  const listHint = computed(() => {
    if (!isAuto.value) return `已选 ${selected.value.length} 人`
    if (!playerStore.canInteractToday) return '今夜已留宿'
    return `今晚约 ${autoPlan.value.length} 人`
  })

  const energyPct = computed(() =>
    playerStore.energyMax ? Math.round((playerStore.energy / playerStore.energyMax) * 100) : 0
  )
  const energyColor = computed(() =>
    playerStore.energy < TUNING.pregnancy.fatigueThreshold ? '#f0a020' : '#18a058'
  )

  const plannedCost = computed(() => selected.value.length * TUNING.energy.perInteraction)
  const canStart = computed(
    () => playerStore.canInteractToday && selected.value.length > 0 && playerStore.energy >= plannedCost.value
  )

  // 怀孕率由公式算出（设计 §5.5）。2026-10-18 起疲劳 −10% 已废除，
  // 所以不再按 plannedCost 判体力；但**自动模式的 −5 个百分点必须传进去**，
  // 否则自动页会显示手动的 11.1%，实际判定却是 6.1%。
  const chancePct = w => `${(playerStore.wifePregnancyChance(w, isAuto.value) * 100).toFixed(1)}%`

  const selectAll = () => {
    selected.value = playerStore.availableWives.map(w => w.id)
  }

  const startNight = () => {
    const res = playerStore.interactEvening([...selected.value])
    if (!res.success) {
      message.warning(res.message)
      return
    }
    // 内宅页面现在不弹结果窗了 —— 流水账就是结果，弹窗会挡住那片正在滚动的记录
    message[res.results.some(r => r.pregnant) ? 'success' : 'info'](res.message)
    selected.value = []
  }

  // ---------- 流水自动滚动 ----------
  // 用原生 div 而不是 n-scrollbar：只要一行 `scrollTop = scrollHeight`，
  // 不必去猜组件实例把容器暴露在哪个字段上。
  const logBox = ref(null)
  watch(
    () => log.value.length,
    async () => {
      await nextTick()
      // 最新在上：新记录出现时回到顶部，而不是滚到底
      if (logBox.value) logBox.value.scrollTop = 0
    }
  )

  // ---------- 子嗣页签 ----------
  const filter = ref('all')
  const filterOptions = [
    { label: '全部', value: 'all' },
    { label: '有灵根', value: 'rooted' },
    { label: '无灵根', value: 'rootless' },
    { label: '已陨落', value: 'fallen' }
  ]
  const page = ref(1)
  const pageSize = ref(12)

  const filteredRows = computed(() => {
    const rows = playerStore.offspringRows
    let out = rows
    if (filter.value === 'rooted') out = rows.filter(c => c.hasRoot)
    else if (filter.value === 'rootless') out = rows.filter(c => !c.hasRoot)
    else if (filter.value === 'fallen') out = rows.filter(c => c.status === 'fallen')
    // 默认按出生时间倒序（最新在上）；表格列的 sorter 会覆盖这个初始顺序
    return [...out].sort((a, b) => (b.birthTime || 0) - (a.birthTime || 0))
  })
  const pageRows = computed(() =>
    filteredRows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
  )
  watch([filter, pageSize, () => playerStore.offspring.list.length], () => (page.value = 1))

  const onPageChange = p => (page.value = p)
  const onPageSizeChange = size => {
    pageSize.value = size
    page.value = 1
  }
  const tablePagination = computed(() => ({
    page: page.value,
    pageSize: pageSize.value,
    pageSizes: [12, 24, 50],
    showSizePicker: true
  }))

  const elementNames = roots => (roots || []).map(e => ELEMENTS[e] || e).join('/')
  const nowGameSeconds = computed(() => playerStore.clockGameTime)
  /** P14：阶段 · 仙龄 · 进度（例：少年 · 9 岁 · 135/180 天）。仙凡双轨，别再按 365 天/年算 */
  const growthText = c => formatOffspringGrowth(c, nowGameSeconds.value)
  const stageOf = c => offspringGrowthOf(c, nowGameSeconds.value)
  /** 女儿到青年外嫁（设计 §7.4；第一版不建模她的配偶与子女） */
  const isMarriedOut = c =>
    c.gender === 'female' &&
    c.status !== 'fallen' &&
    stageAtLeast(stageOf(c), TUNING.growth.marryStage)

  // ---------- 子嗣修炼 / 家族工作（2026-10-20）----------
  const familySummary = computed(() => playerStore.familyWorkSummary)
  const jobOptions = FAMILY_JOBS.map(job => ({ label: job.name, value: job.id }))
  const workable = c => canDoFamilyJobOf(c, nowGameSeconds.value)
  /** 不能上岗时显示原因 —— 统一写「未启蒙」会把「才 6 岁」也混进去 */
  const workBlockedText = c => {
    const growth = stageOf(c)
    const min = TUNING.familyJobs.minAgeYears
    if (growth && growth.ageYears < min) return `未满 ${min} 岁`
    if (c.gender === 'female' && stageAtLeast(growth, TUNING.growth.marryStage)) return '已外嫁'
    return '未启蒙'
  }

  // ---------- 子嗣历练（《探索系统》§七，2026-10-20）----------
  const expSummary = computed(() => playerStore.offspringExpeditionSummary)
  const expReport = computed(() => expSummary.value.report)
  const expeditionOptions = EXPEDITION_MODES.map(mode => ({ label: mode.name, value: mode.id }))
  const onSetExpeditionMode = (id, mode) => {
    const result = playerStore.setOffspringExpeditionMode(id, mode)
    if (!result.ok) message.warning(result.message)
  }
  // 列定义在 views/offspringColumns.js（2026-10-22 P28.5 抽出）
  const expeditionColumns = createExpeditionColumns()

  /** 境界列：有灵根显示「练气N层 · 进度%」，无灵根显示「凡人」 */
  const realmText = c => {
    if (!c.hasRoot) return '凡人'
    const level = Number(c.realmLevel) || 0
    if (level <= 0) return '未启灵'
    const name = offspringRealmNameOf(level)
    if (level >= TUNING.offspringCultivation.maxLevel) return `${name} · 圆满`
    const need = offspringLevelCostOf(level)
    const pct = Math.max(Math.min((Number(c.cultivation) || 0) / need, 1) * 100, 0)
    return `${name} · ${pct.toFixed(0)}%`
  }
  const cultivationTip = c => {
    if (!c.hasRoot || (Number(c.realmLevel) || 0) <= 0) return ''
    if ((Number(c.realmLevel) || 0) >= TUNING.offspringCultivation.maxLevel) return '已至练气九层'
    return `日增 ${offspringCultivationGainOf(c).toFixed(2)} 修为；升级需 ${offspringLevelCostOf(
      c.realmLevel
    ).toFixed(0)}`
  }

  const onAssignJob = (id, jobId) => {
    const result = playerStore.assignOffspringJob(id, jobId)
    if (!result.ok) message.warning(result.message)
  }
  const autoAssignJobs = () => {
    const result = playerStore.autoAssignFamilyJobs()
    if (result.count) message.success(`已安排 ${result.count} 人当值`)
    else message.info(result.message)
  }
  const clearJobs = () => {
    const result = playerStore.clearAllFamilyJobs()
    if (result.count) message.success(`已撤下 ${result.count} 人的岗位`)
  }

  /**
   * 宽屏密集表格的列定义，在 views/offspringColumns.js（2026-10-22 P28.5 抽出）。
   * 渲染函数直接读 growthText，时钟走动时阶段/仙龄会跟着更新 —— 传的是闭包本身。
   */
  const offspringColumns = createOffspringColumns({
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
    elementNames
  })

  // 窄屏退回卡片（<720px）。只监听 matchMedia，不挂任何计时器。
  const isNarrow = ref(false)
  let narrowMq = null
  const onNarrowChange = e => {
    isNarrow.value = e.matches
  }
  onMounted(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    narrowMq = window.matchMedia('(max-width: 720px)')
    isNarrow.value = narrowMq.matches
    narrowMq.addEventListener?.('change', onNarrowChange)
  })
  onBeforeUnmount(() => narrowMq?.removeEventListener?.('change', onNarrowChange))
</script>

<style scoped>
  /* 子嗣页签的纵向堆叠容器（替代 n-space vertical，见模板里的说明） */
  .offspring-stack {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* 三区分区框（P35）：概况 / 今日汇报 / 名册各成一个框。
     边框和底色都用 --n-text-color 调（暗色下是白字、亮色下是黑字），
     这样亮/暗两套主题下都是「比页面深一点的底 + 比卡片重一点的框」，
     而 n-card 自身的底色仍是纯面板色，于是区内的子块会浮在区底色上。 */
  .zone {
    border: 1px solid color-mix(in srgb, var(--n-text-color) 20%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--n-text-color) 4%, transparent);
    overflow: hidden; /* 子块底色 / 表格横向滚动别溢出圆角 */
  }
  .zone-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap; /* 窄屏标题和右侧操作各占一行 */
    padding: 10px 14px;
    /* 分隔线比外框淡一档（20% → 14%），标题栏看得出是一条「栏」但不抢外框 */
    border-bottom: 1px solid color-mix(in srgb, var(--n-text-color) 14%, transparent);
  }
  .zone-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 600;
  }
  .zone-title::before {
    content: '';
    width: 3px;
    height: 14px;
    border-radius: 2px;
    background: #2080f0;
  }
  .zone-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px;
  }

  /* 汇报区（P28.5）：宽屏两框并排、窄屏堆叠。
     align-items: start —— 家族工作框天然比历练框矮，别把两框拉成等高。
     ⚠ 轨道必须写成 minmax(0, 1fr)：默认的 1fr = minmax(auto, 1fr)，最小值是内容的
     min-content；历练框里那张 scroll-x=620 的明细表一展开就会把左列撑宽、把右列挤细。 */
  .report-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }
  .report-grid.is-narrow {
    grid-template-columns: minmax(0, 1fr);
  }
  .report-grid > * {
    min-width: 0;
  }
  /* App.vue 有一条全局 .n-card { margin-bottom: 16px }；放进网格后会把两框各撑高 16px */
  .report-grid > :deep(.n-card) {
    margin-bottom: 0;
  }

  /* 汇报区两个子块：不画外框（外框已由 .zone 提供），靠面板底色 + 标题下边线区分 */
  .report-box :deep(.n-card-header) {
    border-bottom: 1px solid color-mix(in srgb, var(--n-text-color) 12%, transparent);
    padding-bottom: 8px;
  }

  /* 各代存活标签行（替代 n-space，见模板注释） */
  .gen-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  /* 子嗣表格工具栏：左侧筛选、右侧人数汇总 */
  .table-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  /* 名单用 grid 对齐成表，比一人一张卡片紧凑得多 —— 36 人也一屏扫得完 */
  .wife-head,
  .wife-row {
    display: grid;
    grid-template-columns: 26px minmax(3.5em, 1fr) 5.2em 5.4em 4.6em 2.6em 3.6em 3.4em;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }

  .wife-head {
    padding: 0 10px 4px;
    color: var(--n-text-color-3, #999);
    font-size: 12px;
    border-bottom: 1px solid var(--n-border-color);
  }

  .wife-list {
    max-height: 420px;
    overflow-y: auto;
  }

  .wife-row {
    padding: 5px 10px;
    border-bottom: 1px solid var(--n-border-color);
  }
  .wife-row:last-child {
    border-bottom: none;
  }
  .wife-row.is-busy {
    opacity: 0.55;
  }

  .wife-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* 仙龄列：20岁·少女 不能换行，否则整行会被撑成两行 */
  .age-cell {
    white-space: nowrap;
    font-size: 12px;
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .dim {
    color: var(--n-text-color-3, #999);
  }

  /* 自动模式的「今晚轮到谁」标记 */
  .plan-dot {
    text-align: center;
    font-size: 10px;
    color: transparent;
  }
  .plan-dot.on {
    color: #2080f0;
  }

  .court-log {
    max-height: 420px;
    overflow-y: auto;
    font-size: 12px;
    line-height: 1.7;
  }
  .log-line {
    display: flex;
    gap: 8px;
    padding: 1px 0;
    border-bottom: 1px dashed var(--n-border-color);
  }
  .log-line:last-child {
    border-bottom: none;
  }
  .log-day {
    flex: 0 0 4.6em;
    color: var(--n-text-color-3, #999);
  }
</style>
