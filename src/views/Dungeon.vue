<template>
  <n-layout>
    <n-layout-header bordered>
      <n-page-header>
        <template #title>秘境</template>
        <template #subtitle>
          <n-space align="center" :size="8">
            <n-select
              size="small"
              style="width: 168px"
              :value="playerStore.secretRealm.difficulty"
              :options="difficultyOptions"
              :disabled="!!isRunActive"
              @update:value="changeDifficulty"
            />
            <n-tag size="small" type="warning">最高 {{ playerStore.secretRealm.highestFloor }} 层</n-tag>
            <n-tag size="small" type="info">已通 Boss 段 {{ playerStore.secretRealmSweepLimit }} 层</n-tag>
            <n-tag size="small">宝匣 {{ chestTierName(playerStore.secretRealmChestTier) }}</n-tag>
            <n-tag v-if="playerStore.secretRealm.run && isRunActive" size="small" type="error">
              挑战中 · 第 {{ playerStore.secretRealm.run.floor }} 层
            </n-tag>
          </n-space>
        </template>
      </n-page-header>
    </n-layout-header>

    <n-layout-content>
      <div class="realm-wrap">
        <n-alert v-if="playerStore.idleModeNotice" type="warning" closable @close="playerStore.clearIdleModeNotice()">
          {{ playerStore.idleModeNotice }}
        </n-alert>
        <n-alert v-if="playerStore.idleMode === 'exploration'" type="warning" show-icon>
          正在探索中。请先回镇守，再进秘境。
        </n-alert>
        <n-alert v-if="playerStore.isInjured" type="error" show-icon>
          正在养伤，剩余 {{ formatCountdown(playerStore.injuryRemainingSeconds) }}。养伤期间无法进秘境。
        </n-alert>

        <n-tabs type="line" animated>
          <!-- ================= 挑战 ================= -->
          <n-tab-pane name="run" tab="挑战">
            <!-- 没有挑战：配置队伍 -->
            <!-- B5.5（2026-10-31）：外层 n-card → 分区框；区内子块（队伍 / 起始层 / 血线）
                 仍是 :bordered="false" 的 n-card（规范 §2.1 规则 4）。只改结构与样式。 -->
            <section v-if="!hasRun" class="zone">
              <div class="zone-head">
                <span class="zone-title">整备出发</span>
              </div>
              <!-- ⚠ 不要换回 <n-space vertical>：2026-10-22 用户截图里战斗血条被渲染了 4 份，
                   与子嗣页 2026-10-20 的 NSpace 重复渲染同一个坑（动态子节点 0 → N 时）。 -->
              <div class="zone-body stack">
                <!-- P41 #3：**出发条置顶固定**。整备页原来「按钮在最底下」，滑到子嗣名单一半
                     就看不见还可不可以出发了；现在一进页面就能点。 -->
                <div class="launch-bar">
                  <n-space align="center" justify="space-between" :size="12" wrap>
                    <n-space align="center" :size="10" wrap>
                      <n-text strong>
                        子嗣 {{ draftOffspringIds.length }} / {{ companionSlots }} · 灵宠
                        {{ draftPetIds.length }} / {{ petSlots }}
                      </n-text>
                      <n-text depth="3">队伍战力 <b style="color: var(--ui-jade)">{{ partyPower }}</b></n-text>
                      <n-text depth="3" style="font-size: 12px">
                        难度 {{ playerStore.secretRealm.difficulty }} · 从第 {{ draftStartFloor }} 层起
                      </n-text>
                    </n-space>
                    <n-button
                      type="primary"
                      size="large"
                      :disabled="!playerStore.canStartSecretRealm || !partyShapeOk"
                      @click="startRun"
                    >
                      开始挑战（最多 {{ MAX_TIME_COST_DAYS }} 天）
                    </n-button>
                  </n-space>
                </div>

                <!-- 常驻三块：队伍 / 起始层 / 血线。其余说明收进页面底部的折叠 -->
                <n-card title="队伍" size="small" :bordered="false">
                  <div class="stack">
                    <n-descriptions :column="2" bordered size="small">
                      <n-descriptions-item label="桂冈">
                        Lv.{{ playerStore.level }} · {{ playerStore.realm }} · 战力
                        <b>{{ playerPower }}</b>
                      </n-descriptions-item>
                      <n-descriptions-item label="体力">
                        {{ Math.round(playerStore.stamina) }} / {{ Math.round(playerStore.staminaMax) }}
                      </n-descriptions-item>
                    </n-descriptions>

                    <div>
                      <n-space align="center" :size="10">
                        <n-text strong>出战子嗣</n-text>
                        <!-- 与灵宠同一套排序工具：默认战力，另两档按境界/灵根找特定的人 -->
                        <n-radio-group
                          v-if="playerStore.adultOffspringCandidates.length > 1"
                          v-model:value="offspringSortMode"
                          size="small"
                        >
                          <n-radio-button
                            v-for="opt in OFFSPRING_SORT_OPTIONS"
                            :key="opt.value"
                            :value="opt.value"
                          >
                            {{ opt.label }}
                          </n-radio-button>
                        </n-radio-group>
                      </n-space>
                      <n-empty
                        v-if="!playerStore.adultOffspringCandidates.length"
                        size="small"
                        description="还没有可出战的子嗣（需有灵根并到练气二层）"
                      />
                      <n-checkbox-group v-else v-model:value="draftOffspringIds">
                        <n-space vertical :size="2">
                          <n-checkbox
                            v-for="child in sortedOffspring"
                            :key="child.id"
                            :value="child.id"
                          >
                            <!-- P41 #4：点名字弹详情卡。@click.stop 挡住冒泡，否则一点名字就顺手勾上了 -->
                            <n-button text type="primary" size="small" @click.stop="openDetail(child)">
                              {{ child.name }}
                            </n-button>
                            · {{ rootCountName(child.rootCount) }} ·
                            {{ growthText(child) }} ·
                            <n-tooltip trigger="hover" placement="right">
                              <template #trigger>
                                <n-text strong>战力 {{ powerOf('off', child.id) }}</n-text>
                              </template>
                              {{ statsTip('off', child.id) }}
                            </n-tooltip>
                          </n-checkbox>
                        </n-space>
                      </n-checkbox-group>
                    </div>

                    <div>
                      <n-space align="center" :size="10">
                        <n-text strong>出战灵宠</n-text>
                        <n-text
                          v-if="playerStore.petCultivationPaused"
                          depth="3"
                          style="font-size: 12px"
                        >
                          （桂冈瓶颈，同修暂停）
                        </n-text>
                        <!-- P51 #4：名单默认按战力排；另两档找特定那只 -->
                        <n-radio-group v-if="playerStore.petCandidates.length > 1" v-model:value="petSortMode" size="small">
                          <n-radio-button v-for="opt in PET_SORT_OPTIONS" :key="opt.value" :value="opt.value">
                            {{ opt.label }}
                          </n-radio-button>
                        </n-radio-group>
                      </n-space>
                      <n-empty
                        v-if="!playerStore.petCandidates.length"
                        size="small"
                        description="背包里还没有灵宠"
                      />
                      <n-checkbox-group v-else v-model:value="draftPetIds">
                        <n-space vertical :size="2">
                          <n-checkbox v-for="pet in sortedPets" :key="pet.id" :value="pet.id">
                            {{ pet.name }} ·
                            <n-text :style="{ color: petQualityInfoOf(pet).color }">
                              {{ petQualityInfoOf(pet).name }}
                            </n-text>
                            · 同修 Lv.{{ petLevelOf(pet) }} ·
                            <n-tooltip trigger="hover" placement="right">
                              <template #trigger>
                                <n-text strong>战力 {{ powerOf('pet', pet.id) }}</n-text>
                              </template>
                              {{ statsTip('pet', pet.id) }}
                            </n-tooltip>
                          </n-checkbox>
                        </n-space>
                      </n-checkbox-group>
                    </div>
                  </div>
                </n-card>

                <!-- 起始层（2026-10-23）：默认第 1 层把机缘拿满；也可跳过已经走过的路 -->
                <n-card title="起始层" size="small" :bordered="false">
                  <div class="stack-tight">
                    <n-radio-group v-model:value="draftStartMode">
                      <n-space vertical :size="6">
                        <n-radio value="first">从第 1 层开始（机缘拿满）</n-radio>
                        <n-radio value="skip" :disabled="!canSkipFloors">
                          从第 {{ nextStartFloor }} 层开始（跳过已走过的路，少拿机缘）
                        </n-radio>
                      </n-space>
                    </n-radio-group>
                    <n-text depth="3" style="font-size: 12px">
                      每通关 5 层给一次机缘，从中间起打就只剩剩下的那几次；用时只按本趟真正走过的段算
                      （每 10 层 1 天）。
                    </n-text>
                  </div>
                </n-card>

                <n-card title="血线" size="small" :bordered="false">
                  <div class="stack-tight">
                    <n-space align="center" :size="16" wrap>
                      <n-text>自动撤退血量（每人）：{{ draftAutoRetreat }}%</n-text>
                      <n-slider v-model:value="draftAutoRetreat" :min="0" :max="50" :step="5" style="width: 220px" />
                      <n-checkbox v-model:checked="draftPermadeath">关闭自动撤退，允许子嗣陨落</n-checkbox>
                    </n-space>
                    <n-text depth="3" style="font-size: 12px">
                      撤退线按每个人自己算：谁掉到线以下谁自己退出（不陨落），其余人继续打；
                      <b>桂冈自己退出则挑战结束</b>；灵宠不参与撤退。
                    </n-text>
                    <n-alert v-if="draftPermadeath" type="error" show-icon>
                      已关闭自动撤退：战败时倒地的子嗣会<b>真陨落</b>，只返还少量修为。没有替死道具。
                    </n-alert>
                  </div>
                </n-card>

                <!-- 其余说明收进折叠（P41 #3）：规则看一遍就够，不该常年占着首屏 -->
                <n-collapse>
                  <n-collapse-item title="规则与说明" name="rules">
                    <n-space vertical :size="12">
                      <n-alert type="info" show-icon>
                        难度 {{ playerStore.secretRealm.difficulty }}（已解锁 1 ~
                        {{ playerStore.secretRealm.maxDifficulty }}）· 共
                        {{ FLOORS_PER_DIFFICULTY }} 层。
                        时间按<b>已通关的 Boss 层</b>结算：<b>每 10 层 1 天</b>（满 50 层 5 天，战败/撤退按已通的
                        Boss 层算；从中间起打只算实际打过的段）。每 5 层 Boss 给
                        <b>{{ chestTierName(playerStore.secretRealmChestTier) }}宝匣</b> ×1。
                        队伍 = 桂冈 + 最多 {{ companionSlots }} 名可出战的子嗣 + {{ petSlots }} 只灵宠
                        （子嗣需<b>有灵根</b>且到<b>练气二层</b>，无灵根者只能做工）。
                      </n-alert>
                      <n-text depth="3" style="font-size: 12px">
                        撤退线<b>按每个人自己算</b>：谁的血量掉到线以下，谁自己退出这一趟（不陨落），其余人继续打；
                        吃致命伤也只退他一个人。<b>桂冈自己退出则挑战结束</b>。
                        灵宠不参与撤退，倒地一层后照常登场。
                      </n-text>
                    </n-space>
                  </n-collapse-item>
                </n-collapse>

                <!-- P51 #3：**底部再放一颗「开始挑战」**。
                     顶部那条虽然写了 sticky，但整页滚动容器是 `.n-layout`（Naive 自带
                     `overflow: hidden`），sticky 实际上不生效；改完下面的起始层/血线
                     还得滚回顶部。用户给的两个方案里取了「上下各一个」，比动全局滚动容器稳。 -->
                <n-space align="center" justify="end" :size="12" wrap class="launch-bottom">
                  <n-text depth="3" style="font-size: 12px">
                    子嗣 {{ draftOffspringIds.length }} / {{ companionSlots }} · 灵宠
                    {{ draftPetIds.length }} / {{ petSlots }} · 队伍战力 {{ partyPower }}
                  </n-text>
                  <n-button
                    type="primary"
                    :disabled="!playerStore.canStartSecretRealm || !partyShapeOk"
                    @click="startRun"
                  >
                    开始挑战（最多 {{ MAX_TIME_COST_DAYS }} 天）
                  </n-button>
                </n-space>
              </div>
            </section>

            <!-- 有挑战：战况 / Buff / 结果 -->
            <template v-else>
              <!-- Buff 三选一 —— 必须排在战况卡前面（= 流水账上方）。
                   2026-10-22 用户反馈：夹在日志下面时要滚很久才能点到，倒计时先走完了。 -->
              <section v-if="run.status === 'buff' && run.pendingBuff && segmentDone" class="zone">
                <div class="zone-head">
                  <span class="zone-title">机缘选择</span>
                </div>
                <div class="zone-body stack">
                  <!-- 选之前先看已有的，避免为了一样的效果重复拿 -->
                  <n-space v-if="runBuffs.length" align="center" :size="8" wrap>
                    <n-text depth="3" style="font-size: 12px">本轮机缘</n-text>
                    <n-tag
                      v-for="buff in runBuffs"
                      :key="buff.id"
                      size="small"
                      :type="buffTagType(buff.quality)"
                      :bordered="false"
                    >
                      {{ buff.name }}{{ buff.count > 1 ? ` ×${buff.count}` : '' }}
                    </n-tag>
                  </n-space>
                  <n-text depth="3">
                    {{ Math.ceil(playback.countdownLeft.value) }} 秒后自动选择品质最高的一项。
                  </n-text>
                  <n-grid :cols="3" :x-gap="12" :y-gap="12" responsive="screen" item-responsive>
                    <n-grid-item v-for="opt in run.pendingBuff.options" :key="opt.id">
                      <n-card
                        size="small"
                        hoverable
                        :class="`buff-${opt.quality}`"
                        @click="chooseBuff(opt.id)"
                      >
                        <n-space vertical :size="6">
                          <n-tag size="small" :type="buffTagType(opt.quality)">
                            {{ qualityLabel(opt.quality) }}
                          </n-tag>
                          <n-text strong>{{ opt.name }}</n-text>
                          <n-text depth="3" style="font-size: 13px">{{ opt.description }}</n-text>
                        </n-space>
                      </n-card>
                    </n-grid-item>
                  </n-grid>
                </div>
              </section>

              <!-- 结果已经算出来了，但回放还没放完时，仍要保住战况卡：
                   否则会出现「战斗卡消失、结果卡又还没显示」的空白期。 -->
              <section
                v-if="run.status !== 'finished' || !segmentDone"
                class="zone"
              >
                <div class="zone-head">
                  <span class="zone-title">第 {{ displayFloor }} 层</span>
                </div>
                <div class="zone-body stack">
                  <!-- 本轮已获得的机缘：战斗中与选 Buff 时都看得到，方便做取舍 -->
                  <n-space v-if="runBuffs.length" align="center" :size="8" wrap>
                    <n-text depth="3" style="font-size: 12px">本轮机缘</n-text>
                    <n-tooltip v-for="buff in runBuffs" :key="buff.id">
                      <template #trigger>
                        <n-tag size="small" :type="buffTagType(buff.quality)" :bordered="false">
                          {{ buff.name }}{{ buff.count > 1 ? ` ×${buff.count}` : '' }}
                        </n-tag>
                      </template>
                      {{ buff.description }}
                    </n-tooltip>
                  </n-space>

                  <n-space justify="space-between" align="center" wrap>
                    <n-space :size="8">
                      <n-button
                        v-for="s in [1, 2, 4]"
                        :key="s"
                        size="small"
                        :type="playback.speed.value === s ? 'primary' : 'default'"
                        @click="setSpeed(s)"
                      >
                        {{ s }}x
                      </n-button>
                    </n-space>
                    <n-space :size="8">
                      <n-button size="small" :disabled="!playback.playing.value" @click="playback.skip()">
                        跳过回放
                      </n-button>
                    </n-space>
                  </n-space>

                  <n-progress type="line" :percentage="playback.progressPct.value" :show-indicator="false" processing />

                  <!-- 队伍血条 -->
                  <n-grid :cols="4" :x-gap="12" :y-gap="12" responsive="screen" item-responsive>
                    <n-grid-item v-for="unit in partyRows" :key="unit.uid">
                      <n-card size="small" :bordered="false" class="unit-card" :class="{ 'unit-out': unit.withdrawn }">
                        <!-- ⚠ 这里是普通 div 不是 NSpace：`已退出` 标签会在回放中动态出现/消失，
                             正好踩「动态子节点 0 → N 重复渲染」那个坑（见 .stack 的注释）。 -->
                        <div class="unit-body">
                          <n-text strong>{{ unit.name }}</n-text>
                          <!-- 2026-10-23：撤退改成「谁触线谁走」，退出的那个人留在卡位上标一下 -->
                          <template v-if="unit.withdrawn">
                            <n-tag size="small" type="warning" :bordered="false">已退出</n-tag>
                          </template>
                          <template v-else>
                            <n-progress
                              type="line"
                              :percentage="unit.pct"
                              :show-indicator="false"
                              :status="unit.pct <= 0 ? 'error' : unit.pct < 30 ? 'warning' : 'success'"
                            />
                            <n-text depth="3" style="font-size: 12px">
                              {{ Math.max(Math.round(unit.hp), 0) }} / {{ Math.round(unit.max) }}
                            </n-text>
                          </template>
                        </div>
                      </n-card>
                    </n-grid-item>
                  </n-grid>

                  <!-- 当前敌人 -->
                  <n-card v-if="currentEnemy" size="small" :bordered="false" class="enemy-card">
                    <n-space vertical :size="4">
                      <n-space justify="space-between">
                        <n-text strong>{{ currentEnemy.name }}</n-text>
                        <n-tag size="small" type="error">{{ currentEnemy.floor }} 层</n-tag>
                      </n-space>
                      <n-progress
                        type="line"
                        :percentage="currentEnemy.pct"
                        :show-indicator="false"
                        status="error"
                      />
                      <n-text depth="3" style="font-size: 12px">
                        {{ Math.max(Math.round(currentEnemy.hp), 0) }} / {{ Math.round(currentEnemy.max) }}
                      </n-text>
                    </n-space>
                  </n-card>

                  <div ref="battleLogEl" class="battle-log">
                    <div v-if="!battleLog.length" class="battle-log-empty">等待开战……</div>
                    <div v-for="(row, i) in battleLog" :key="i" :class="`frame-${row.type}`">
                      <span class="frame-floor">[{{ row.floor || displayFloor }}]</span>
                      {{ row.text }}
                    </div>
                  </div>
                </div>
              </section>

              <!-- 结果 -->
              <section v-if="run.status === 'finished' && run.result && segmentDone" class="zone">
                <div class="zone-head">
                  <span class="zone-title">挑战结束</span>
                </div>
                <div class="zone-body stack">
                  <n-alert :type="resultAlertType" show-icon>
                    {{ resultHeadline }}
                    止步第 {{ run.result.floor }} 层，共 {{ run.result.rounds || '—' }} 回合，
                    用时 <b>{{ run.result.days ?? 0 }}</b> 天
                    <template v-if="run.result.unlockedDifficulty">
                      。已解锁 <b>难度 {{ run.result.unlockedDifficulty }}</b>，从第 1 层重新开始
                    </template>
                    。
                  </n-alert>
                  <n-descriptions :column="3" bordered size="small">
                    <n-descriptions-item label="一阶灵石">
                      +{{ run.result.loot?.spiritual ?? 0 }}
                    </n-descriptions-item>
                    <n-descriptions-item label="宝匣">{{ resultChestSummary }}</n-descriptions-item>
                    <n-descriptions-item label="洗命符">
                      {{ run.result.loot?.fateCharms ? `+${run.result.loot.fateCharms}` : '—' }}
                    </n-descriptions-item>
                    <n-descriptions-item label="洗练石">
                      +{{ run.result.loot?.refinementStones || 0 }}
                    </n-descriptions-item>
                    <n-descriptions-item label="灵草 / 丹方">
                      {{ run.result.loot?.herbs || 0 }} / {{ run.result.loot?.pillFragments || 0 }}
                    </n-descriptions-item>
                    <n-descriptions-item label="用时">
                      {{ run.result.days ?? 0 }} 天
                    </n-descriptions-item>
                  </n-descriptions>
                  <n-space v-if="runBuffs.length" align="center" :size="8" wrap>
                    <n-text depth="3">本轮机缘</n-text>
                    <n-tag
                      v-for="buff in runBuffs"
                      :key="buff.id"
                      size="small"
                      :type="buffTagType(buff.quality)"
                      :bordered="false"
                    >
                      {{ buff.name }}{{ buff.count > 1 ? ` ×${buff.count}` : '' }}
                    </n-tag>
                  </n-space>
                  <n-space v-if="run.result.withdrawn?.length" align="center" :size="8" wrap>
                    <n-text depth="3">本趟退出</n-text>
                    <n-tag
                      v-for="unit in run.result.withdrawn"
                      :key="unit.uid"
                      size="small"
                      type="warning"
                      :bordered="false"
                    >
                      {{ unit.name }}
                    </n-tag>
                    <n-text depth="3" style="font-size: 12px">（只是撤出，不算陨落）</n-text>
                  </n-space>
                  <n-alert v-if="run.result.deaths?.length" type="error" show-icon>
                    陨落：{{ run.result.deaths.map(d => d.name).join('、') }}。已供奉于内宅的英烈祠。
                  </n-alert>
                  <n-space>
                    <n-button type="primary" @click="restartRun">再次挑战</n-button>
                    <n-button @click="resetSetup">重新整备</n-button>
                    <n-button @click="leaveRealm">回镇守</n-button>
                  </n-space>
                </div>
              </section>
            </template>
          </n-tab-pane>

          <!-- ================= 扫荡 ================= -->
          <n-tab-pane name="sweep" tab="扫荡">
            <section class="zone">
              <div class="zone-head">
                <span class="zone-title">扫荡</span>
              </div>
              <div class="zone-body">
                <n-alert type="info" show-icon>
                  只能扫荡<b>已通关的完整 Boss 段</b>：当前可扫 1 ~
                  {{ playerStore.secretRealmSweepLimit }} 层，用时
                  <b>{{ playerStore.secretRealmSweepDays }}</b> 天（每 10 层 1 天）。
                  扫荡给基础掉落 + 每 5 层 1 个宝匣，<b>不重复给 Boss 首破与 50 层首杀</b>。
                </n-alert>
                <n-descriptions :column="3" bordered size="small">
                  <n-descriptions-item label="可扫荡层数">
                    {{ playerStore.secretRealmSweepLimit }}
                  </n-descriptions-item>
                  <n-descriptions-item label="已通关最高层">
                    {{ playerStore.secretRealm.highestFloor }}
                  </n-descriptions-item>
                  <n-descriptions-item label="宝匣">
                    {{ chestTierName(playerStore.secretRealmChestTier) }} ×
                    {{ Math.floor(playerStore.secretRealmSweepLimit / 5) }}
                  </n-descriptions-item>
                </n-descriptions>
                <!-- 不用 NSpace：进度条 v-if 出现/消失正好踩「动态子节点 0 → N 重复渲染」的坑 -->
                <div class="sweep-actions">
                  <n-button
                    type="primary"
                    :loading="sweeping"
                    :disabled="
                      !playerStore.secretRealmCanSweep ||
                      playerStore.idleMode !== 'garrison' ||
                      sweeping
                    "
                    @click="sweep"
                  >
                    {{
                      sweeping
                        ? '扫荡中…'
                        : `开始扫荡（${playerStore.secretRealmSweepDays} 天）`
                    }}
                  </n-button>
                  <n-progress
                    v-if="sweeping"
                    type="line"
                    :percentage="sweepPct"
                    :show-indicator="false"
                    processing
                  />
                </div>
              </div>
            </section>
          </n-tab-pane>

        </n-tabs>
      </div>
    </n-layout-content>

    <!-- P41 #4：整备页 / 战斗中点子嗣名字看到的详情卡 -->
    <OffspringDetail
      :show="!!detailChildId"
      :child-id="detailChildId"
      @update:show="value => { if (!value) detailChildId = '' }"
    />
  </n-layout>
</template>

<script setup>
  import { computed, nextTick, ref, watch, onMounted, onUnmounted } from 'vue'
  import { useRouter } from 'vue-router'
  import { useMessage } from 'naive-ui'
  import { usePlayerStore } from '../stores/player'
  import { useRealmPlayback } from '../composables/useRealmPlayback'
  import {
    TUNING,
    buffListOf,
    buildOffspringUnit,
    buildPetUnit,
    buildPlayerUnit,
    chestTierOfDifficulty,
    combatPowerOf
  } from '../plugins/secretRealm'
  import { formatOffspringGrowth, rootCountName } from '../plugins/innerCourt'
  import { formatCountdown } from '../plugins/dayDate'
  // P51 #4：灵宠成色标签统一走 petUnit（下品/中品/上品/极品），不再按 rarity 显示旧文案
  import { petQualityInfoOf, petLevelOf } from '../plugins/petUnit'
  // P41 #4：子嗣详情卡（子嗣页 / 秘境整备 / 家族树 / 历练流水共用同一张）
  import OffspringDetail from '../components/OffspringDetail.vue'

  const playerStore = usePlayerStore()

  /** 整备页点子嗣名字弹详情卡（只存 id，理由同详情组件里的注释） */
  const detailChildId = ref('')
  const openDetail = child => {
    if (child?.id) detailChildId.value = child.id
  }

  /** 子嗣成长文案（P14 仙凡双轨）。秘境不暂停时间，但候选名单只在配置时刷新，够用 */
  const growthText = child => formatOffspringGrowth(child, playerStore.clockGameTime)
  const router = useRouter()
  const message = useMessage()
  const playback = useRealmPlayback()

  const companionSlots = TUNING.companionSlots
  const petSlots = TUNING.petSlots
  const FLOORS_PER_DIFFICULTY = TUNING.floorsPerDifficulty
  /** 满层的时间成本上限（文案用） */
  const MAX_TIME_COST_DAYS = Math.ceil(FLOORS_PER_DIFFICULTY / TUNING.floorsPerDay)

  const chestTierName = tier => `${['', '一', '二', '三', '四', '五', '六', '七'][tier] || tier}阶`

  /** 难度下拉：只列已解锁的；每个难度带上它对应的宝匣阶，方便挑着刷 */
  const difficultyOptions = computed(() =>
    Array.from({ length: Math.max(playerStore.secretRealm.maxDifficulty || 1, 1) }, (_, i) => {
      const d = i + 1
      return { label: `难度 ${d} · ${chestTierName(chestTierOfDifficulty(d))}宝匣`, value: d }
    })
  )

  const changeDifficulty = value => {
    const result = playerStore.selectSecretRealmDifficulty(value)
    if (!result?.ok && result?.reason) message.warning(result.reason)
  }

  const draftOffspringIds = ref([])
  /**
   * 默认带上背包里「出战」的那只灵宠（2026-10-31 用户要求）。
   *
   * ⚠ 两处「出战」不同义：`activePet`（背包按钮）是随身主宠，秘境编成是另一套；
   *   默认勾上它只是省一次手动勾选，**玩家仍可取消**，也不影响谁吃同修经验。
   */
  const defaultPetIds = () => {
    const active = playerStore.activePet
    if (!active?.id) return []
    return playerStore.petCandidates.some(pet => pet.id === active.id) ? [active.id] : []
  }
  const draftPetIds = ref(defaultPetIds())
  const draftAutoRetreat = ref(playerStore.secretRealm.retreatThreshold || 20)
  const draftPermadeath = ref(false)
  /** 起始层（2026-10-23）：first = 第 1 层；skip = 跳过已走过的路 */
  const draftStartMode = ref('first')
  /** 跳过时的起点 = 本难度最高层 + 1（封顶 50），与 `clampStartFloor` 同口径 */
  const nextStartFloor = computed(() =>
    Math.min((Number(playerStore.secretRealm.highestFloor) || 0) + 1, FLOORS_PER_DIFFICULTY)
  )
  const canSkipFloors = computed(() => (Number(playerStore.secretRealm.highestFloor) || 0) >= 1)
  /** 出发条上的「从第几层起」（P41 #3） */
  const draftStartFloor = computed(() => (draftStartMode.value === 'skip' ? nextStartFloor.value : 1))
  const hpMap = ref({})
  const maxMap = ref({})
  /** 回放里已经「退出本次秘境」的单位（按帧累积，不等下一段快照） */
  const withdrawnMap = ref({})
  const battleLogEl = ref(null)
  /** 本段回放是否放完。没放完时不能选 Buff，也不能提前看结果 */
  const segmentDone = ref(true)

  const run = computed(() => playerStore.secretRealm.run)
  const hasRun = computed(() => !!run.value)

  /**
   * 本轮已获得的 Buff。`run.buffs` 只存 id，展示信息从物品池反查；
   * 同一项可以重复获得，这里按 id 合并成「名字 ×N」，避免一排重复标签。
   * 未知 id 由 `buffListOf` 过滤（老档里可能有已删除的 Buff）。
   */
  const runBuffs = computed(() => {
    const counts = new Map()
    for (const buff of buffListOf(run.value?.buffs)) {
      const entry = counts.get(buff.id)
      if (entry) entry.count += 1
      else counts.set(buff.id, { ...buff, count: 1 })
    }
    return [...counts.values()]
  })
  const isRunActive = computed(() => playerStore.secretRunActive)
  /** P43：子嗣 3 坑 + 灵兽 1 坑各占各的，超了任何一边都不能出发 */
  const partyShapeOk = computed(
    () => draftOffspringIds.value.length <= companionSlots && draftPetIds.value.length <= petSlots
  )

  /**
   * 候选战力（2026-10-23 用户反馈：编队时看不出谁强，没法决策）。
   *
   * **不另立一套公式** —— 直接跑实战同一套 `build*Unit` 再压成一个数字
   * （`combatPowerOf`，真源《数值真值表》§5.5）。这样名单上的数字和真打起来
   * 用的面板永远同源，改战斗公式时不用再回来同步一次。
   */
  const powerRows = computed(() => {
    const rows = {}
    const nowSeconds = playerStore.clockGameTime
    for (const child of playerStore.adultOffspringCandidates) {
      const unit = buildOffspringUnit(child, { nowSeconds })
      if (unit) rows[`off:${child.id}`] = { power: combatPowerOf(unit), stats: unit.stats }
    }
    for (const pet of playerStore.petCandidates) {
      const unit = buildPetUnit(pet)
      if (unit) rows[`pet:${pet.id}`] = { power: combatPowerOf(unit), stats: unit.stats }
    }
    return rows
  })

  const playerUnit = computed(() => buildPlayerUnit(playerStore.buildPlayerSnapshot()))
  const playerPower = computed(() => combatPowerOf(playerUnit.value))

  const powerOf = (kind, id) => powerRows.value[`${kind}:${id}`]?.power ?? 0

  /**
   * 子嗣名单的排序（2026-10-27，用户反馈「灵宠有排序、子嗣没有」）。
   *
   * 与灵宠同一套交互：默认**战力从高到低**（3 个坑，先挑最强的）；
   * 「境界」按小境界、同层再按战力；「灵根」按系数从少到多（系数少 = 修炼快、通常更强）。
   */
  const OFFSPRING_SORT_OPTIONS = [
    { label: '战力', value: 'power' },
    { label: '境界', value: 'realm' },
    { label: '灵根', value: 'roots' }
  ]
  const offspringSortMode = ref('power')
  const sortedOffspring = computed(() => {
    const power = child => powerOf('off', child.id)
    const realm = child => Number(child.realmLevel) || 0
    const roots = child => Math.max(Number(child.rootCount) || 5, 1)
    const list = [...(playerStore.adultOffspringCandidates || [])]
    const primary =
      offspringSortMode.value === 'realm'
        ? realm
        : offspringSortMode.value === 'roots'
          ? child => -roots(child)
          : power
    return list.sort(
      (a, b) =>
        primary(b) - primary(a) ||
        power(b) - power(a) ||
        realm(b) - realm(a) ||
        roots(a) - roots(b)
    )
  })

  /**
   * 灵宠名单的排序（P51 #4，2026-10-26）。
   *
   * 默认**战力从高到低** —— 秘境只有 1 个灵宠坑，玩家要的就是「谁最强」。
   * 另外两档用来按等级/成色找特定那只（成色看 下/中/上/极，同档再按战力）。
   */
  const PET_SORT_OPTIONS = [
    { label: '战力', value: 'power' },
    { label: '等级', value: 'level' },
    { label: '成色', value: 'quality' }
  ]
  const petSortMode = ref('power')
  const QUALITY_RANK = { 极: 4, 上: 3, 中: 2, 下: 1 }
  const sortedPets = computed(() => {
    const power = pet => powerOf('pet', pet.id)
    const rank = pet => QUALITY_RANK[petQualityInfoOf(pet).quality] || 0
    const list = [...(playerStore.petCandidates || [])]
    const primary =
      petSortMode.value === 'level' ? pet => petLevelOf(pet) : petSortMode.value === 'quality' ? rank : power
    return list.sort(
      (a, b) => primary(b) - primary(a) || rank(b) - rank(a) || power(b) - power(a) || petLevelOf(b) - petLevelOf(a)
    )
  })
  /** 悬停明细：战力只是个加权数字，四属性才是决策依据 */
  const statsTip = (kind, id) => {
    const stats = powerRows.value[`${kind}:${id}`]?.stats
    if (!stats) return '暂无面板'
    return `气血 ${Math.round(stats.maxHealth)} · 攻击 ${Math.round(stats.damage)} · 防御 ${Math.round(stats.defense)} · 速度 ${Math.round(stats.speed)}`
  }

  /** 队伍战力 = 桂冈 + 已勾选的子嗣/灵宠（加总，只做展示） */
  const partyPower = computed(() => {
    const picked =
      draftOffspringIds.value.reduce((sum, id) => sum + powerOf('off', id), 0) +
      draftPetIds.value.reduce((sum, id) => sum + powerOf('pet', id), 0)
    return playerPower.value + picked
  })

  /** 结果面板文案：通关 50 层 / 撤退 / 战败 三种收尾 */
  const resultAlertType = computed(() => {
    const result = run.value?.result
    if (!result) return 'info'
    if (result.clearedDifficulty) return 'success'
    return result.retreated ? 'warning' : 'error'
  })
  const resultHeadline = computed(() => {
    const result = run.value?.result
    if (!result) return ''
    if (result.clearedDifficulty) return '通关本难度 50 层大 Boss。'
    // 2026-10-23：撤退从「整队回家」改成「谁触线谁走」，终点也变成三种：
    // 全员撤出 / 桂冈撤出（带队的人走了，挑战结束）/ 战败
    if (!result.retreated) return '队伍战败。'
    return result.withdrawn?.some(unit => unit.source === 'player')
      ? '桂冈伤势过重退出，挑战结束。'
      : '队伍撤出秘境。'
  })
  /** 宝匣按「阶 × 数量」展示；50 层首杀的高一阶宝匣单独列出 */
  const resultChestSummary = computed(() => {
    const loot = run.value?.result?.loot
    if (!loot) return '—'
    const parts = []
    if (loot.chests) parts.push(`${chestTierName(loot.chestTier)} ×${loot.chests}`)
    if (loot.bonusChests) parts.push(`${chestTierName(loot.bonusChestTier)} ×${loot.bonusChests}`)
    return parts.length ? parts.join(' + ') : '—'
  })
  const displayFloor = computed(() => {
    if (playback.currentFrame.value?.floor) return playback.currentFrame.value.floor
    if (run.value?.floor) return run.value.floor
    return 1
  })

  const partyRows = computed(() => {
    const view = run.value?.partyView || []
    return view.map(unit => {
      // Buff 会改最大生命，所以上限以回放帧里的最新值为准
      const max = maxMap.value[unit.uid] || unit.maxHealth
      const hp = hpMap.value[unit.uid] ?? max
      return {
        ...unit,
        // 快照里的 withdrawn 是「进入这一段之前」的状态；回放中刚退出的看 withdrawnMap
        withdrawn: !!unit.withdrawn || !!withdrawnMap.value[unit.uid],
        hp,
        max,
        pct: max > 0 ? Math.min((hp / max) * 100, 100) : 0
      }
    })
  })

  const currentEnemy = computed(() => {
    const frames = playback.frames.value
    const end = Math.min(playback.cursor.value, frames.length)
    for (let i = end - 1; i >= 0; i -= 1) {
      const frame = frames[i]
      const enemyUid = String(frame?.target || '').startsWith('enemy:')
        ? frame.target
        : String(frame?.attacker || '').startsWith('enemy:')
          ? frame.attacker
          : null
      if (!enemyUid) continue
      const max = frame.target === enemyUid ? frame.targetMax : frame.attackerMax
      const hp = frame.target === enemyUid ? frame.hp : frame.attackerHp
      return {
        name: frame.target === enemyUid ? frame.targetName : frame.attackerName,
        floor: frame.floor || displayFloor.value,
        max: max || 1,
        hp: hp == null ? max || 1 : hp,
        pct: max > 0 ? Math.min(((hp == null ? max : hp) / max) * 100, 100) : 0
      }
    }
    return null
  })

  const battleLog = computed(() => {
    const frames = playback.frames.value
    const end = Math.min(playback.cursor.value, frames.length)
    // 取最近 14 条后**倒序** —— 最新的在最上面（P15.2）
    return frames
      .slice(0, end)
      .filter(frame => frame?.text)
      .slice(-14)
      .reverse()
  })

  watch(
    () => playback.currentFrame.value,
    frame => {
      if (!frame) return
      if (frame.target && frame.hp != null) hpMap.value[frame.target] = frame.hp
      if (frame.attacker && frame.attackerHp != null) hpMap.value[frame.attacker] = frame.attackerHp
      if (frame.target && frame.targetMax) maxMap.value[frame.target] = frame.targetMax
      if (frame.attacker && frame.attackerMax) maxMap.value[frame.attacker] = frame.attackerMax
      // 撤退改成单人之后，回放到「X 退出本次秘境」这一帧就把他的卡位标成已退出
      if (frame.type === 'withdraw' && frame.actor) withdrawnMap.value[frame.actor] = true
    }
  )

  watch(
    () => battleLog.value.length,
    async () => {
      await nextTick()
      // 最新在上 → 回到顶部
      if (battleLogEl.value) battleLogEl.value.scrollTop = 0
    }
  )

  const qualityLabel = q => ({ common: '普通', rare: '稀有', epic: '史诗' })[q] || '普通'
  const buffTagType = q => ({ common: 'default', rare: 'info', epic: 'warning' })[q] || 'default'

  const initHp = () => {
    const hp = {}
    const max = {}
    for (const unit of run.value?.partyView || []) {
      hp[unit.uid] = unit.maxHealth
      max[unit.uid] = unit.maxHealth
    }
    hpMap.value = hp
    maxMap.value = max
    // 每段开头清空「回放中刚退出」的标记：之前几段退出的人已经写进 partyView.withdrawn，
    // 不会再丢掉（不清的话，重新进页面重放会提前显示已退出）。
    withdrawnMap.value = {}
  }

  /** 播放一段帧；放完后根据 run.status 决定下一步 */
  const playFrames = () => {
    segmentDone.value = false
    initHp()
    const frames = playerStore.takeSecretRealmFrames()
    playback.load(frames, () => {
      segmentDone.value = true
      afterPlayback()
    })
    if (!frames.length) segmentDone.value = true
  }

  const afterPlayback = () => {
    segmentDone.value = true
    const current = run.value
    if (!current) return
    if (current.status === 'buff') {
      startBuffCountdown()
      return
    }
    if (current.status === 'finished') return
    if (current.status === 'fighting') {
      playerStore.continueSecretRealmRun()
      playFrames()
    }
  }

  const startBuffCountdown = () => {
    playback.cancelCountdown()
    playback.startCountdown(TUNING.buffAutoPickSeconds, () => {
      playerStore.autoChooseSecretRealmBuff()
      playFrames()
    })
  }

  const chooseBuff = id => {
    playback.cancelCountdown()
    if (playerStore.chooseSecretRealmBuff(id)) playFrames()
  }

  const setSpeed = s => {
    playback.setSpeed(s)
    playerStore.secretRealm.speed = s
  }

  const startRun = () => {
    if (!partyShapeOk.value) return
    playerStore.secretRealm.retreatThreshold = draftAutoRetreat.value
    playerStore.secretRealm.retreatEnabled = draftAutoRetreat.value > 0
    const result = playerStore.startSecretRealmRun({
      offspringIds: draftOffspringIds.value,
      petIds: draftPetIds.value,
      permadeath: draftPermadeath.value,
      startFloor: draftStartMode.value === 'skip' ? nextStartFloor.value : 1
    })
    if (!result.ok) return
    playFrames()
  }

  const restartRun = () => {
    // 沿用上一趟的起始层模式：跳过过就从「新的最高层 + 1」继续，否则还是第 1 层
    const wasSkipped = Number(run.value?.startFloor) > 1
    const cfg = {
      offspringIds: (run.value?.party || []).filter(r => r.kind === 'offspring').map(r => r.id),
      petIds: (run.value?.party || []).filter(r => r.kind === 'pet').map(r => r.id),
      permadeath: !!run.value?.permadeath,
      startFloor: wasSkipped ? nextStartFloor.value : 1
    }
    playerStore.leaveSecretRealm()
    const result = playerStore.startSecretRealmRun(cfg)
    if (result.ok) playFrames()
  }

  const leaveRealm = () => {
    playback.stop()
    playback.cancelCountdown()
    playerStore.leaveSecretRealm()
    router.push('/')
  }

  const resetSetup = () => {
    playback.stop()
    playback.cancelCountdown()
    playerStore.clearSecretRealmRun()
  }

  /**
   * 扫荡读条（2026-10-23 用户反馈：扫荡瞬间完成，可以按住连点反复刷）。
   *
   * ⚠ 纯演出，**不是游戏计时器**：结算在点下的一刻就已经同步落地
   *   （`startSecretRealmSweep` 扣天数、发掉落），这里只是现实时间 1.5 秒内
   *   禁用按钮 + 画一条进度，挡误触和连点。别把结算挪到读条结束 ——
   *   中途切页/刷新会把玩家已经按下的那一次吞掉。
   */
  const SWEEP_READ_MS = 1500
  const sweeping = ref(false)
  const sweepPct = ref(0)
  let sweepRaf = 0
  let sweepTimer = 0
  let sweepEndsAt = 0
  let sweepToast = null

  const stopSweepBar = () => {
    if (sweepRaf) cancelAnimationFrame(sweepRaf)
    if (sweepTimer) clearTimeout(sweepTimer)
    sweepRaf = 0
    sweepTimer = 0
  }

  const finishSweepBar = () => {
    stopSweepBar()
    sweeping.value = false
    sweepPct.value = 0
    const toast = sweepToast
    sweepToast = null
    if (toast) toast()
  }

  const playSweepBar = () => {
    stopSweepBar()
    sweeping.value = true
    sweepPct.value = 0
    sweepEndsAt = performance.now() + SWEEP_READ_MS
    // 进度条只负责画面，收尾交给 setTimeout：后台标签页里 rAF 会被冻结，
    // 只靠 rAF 判定的话按钮会永远停在「扫荡中」。
    const draw = () => {
      const left = sweepEndsAt - performance.now()
      const ratio = Math.min(Math.max((SWEEP_READ_MS - left) / SWEEP_READ_MS, 0), 1)
      sweepPct.value = ratio * 100
      if (ratio < 1) sweepRaf = requestAnimationFrame(draw)
    }
    sweepRaf = requestAnimationFrame(draw)
    sweepTimer = setTimeout(finishSweepBar, SWEEP_READ_MS)
  }

  const sweep = () => {
    if (sweeping.value) return
    const result = playerStore.startSecretRealmSweep()
    if (!result.ok) {
      if (result.reason) message.warning(result.reason)
      return
    }
    // 结果文案等读条走完再弹，否则「扫荡完成」会和进度条同时出现，自相矛盾
    sweepToast = () => message.success(`扫荡完成：1 ~ ${result.cap} 层 · 用时 ${result.days} 天`)
    playSweepBar()
  }

  onMounted(() => {
    playback.setSpeed(playerStore.secretRealm.speed || 1)
    const current = run.value
    if (!current) return
    if (current.status === 'finished') return
    if (current.status === 'buff') {
      segmentDone.value = true
      startBuffCountdown()
      return
    }
    // fighting：读档/重新进入页面时继续预演
    playerStore.continueSecretRealmRun()
    playFrames()
  })

  onUnmounted(() => {
    playback.stop()
    playback.cancelCountdown()
    // 读条只是演出：页面走了就停，结算早就落地了，别在卸载后再弹 toast
    stopSweepBar()
    sweepToast = null
    // 结果已经出来的挑战，离开页面就回镇守，避免时钟暂停持有者泄漏
    if (playerStore.secretRealm.run?.status === 'finished') playerStore.leaveSecretRealm()
  })
</script>

<style scoped>
  .realm-wrap {
    /* 2026-10-31 用户要求：秘境页正文和探索页一样，左右与上面的状态条对齐。
       原来 `max-width: 1180px` + `padding: 12px` 让卡片比内容区窄、内缩 12px；
       `.content-wrapper` 已经给了 16px 内边距，这里不再加任何边距。 */
  }

  /* 页签条跟标题一起缩进 16px —— 否则去掉内边距之后，它成了页面里唯一
     贴内容区左边缘的东西（标题已按 ui.css 补了同样的 16px）。 */
  .realm-wrap :deep(.n-tabs-nav) {
    padding-left: 16px;
  }

  .unit-card,
  .enemy-card {
    background: color-mix(in srgb, var(--ui-ink) 6%, transparent);
  }

  /* 替代 <n-space vertical size="large">：NSpace 在动态子节点 0 → N 时会重复渲染
     （子嗣页 2026-10-20 踩过，秘境血条 2026-10-22 又踩了一次）。 */
  .stack {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /**
   * 出发条固定在顶部（P41 #3）。
   * `top: 0` 是相对**窗口**滚动容器：页面滚到卡内时这条一直贴在视口顶上，
   * 所以必须给底色 + 下标线，否则下面的子嗣名单会从字缝里透出来。
   */
  .launch-bar {
    position: sticky;
    top: 0;
    z-index: 10;
    padding: 10px 12px;
    border-radius: 6px;
    background: var(--ui-surface);
    box-shadow: var(--ui-shadow);
    border: 1px solid var(--ui-line);
  }

  /* P51 #3：底部那颗「开始挑战」—— 与顶部条留出同样的呼吸，便于一眼看到 */
  .launch-bottom {
    padding: 8px 12px;
    border-top: 1px dashed var(--ui-line);
  }

  /* 扫荡按钮 + 读条：竖向排开，按钮按内容宽，进度条占满一行 */
  .sweep-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .sweep-actions .n-button {
    align-self: flex-start;
  }

  .battle-log {
    height: 280px;
    overflow-y: auto;
    padding: 8px 12px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--ui-ink) 6%, transparent);
    font-size: 13px;
    line-height: 1.9;
  }

  .frame-floor {
    color: var(--ui-ink-sub);
    margin-right: 6px;
  }

  .frame-victory {
    color: var(--ui-jade);
    font-weight: 600;
  }

  .frame-defeat {
    color: var(--ui-cinnabar);
    font-weight: 600;
  }

  .frame-retreat,
  .frame-withdraw {
    color: var(--ui-gold);
    font-weight: 600;
  }

  /* 血条卡内部：替代 <n-space vertical>，见模板里的注释 */
  .unit-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  /* 已经退出本趟的成员：卡位留着，但不画血条 */
  .unit-out {
    opacity: 0.6;
  }

  /* 起始层那块：单选框 + 一行说明 */
  .stack-tight {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .frame-skip {
    color: var(--ui-ink-sub);
  }

  .battle-log-empty {
    color: var(--ui-ink-sub);
    text-align: center;
    padding: 24px 0;
  }

  /* 机缘三档：普通=淡墨、稀有=青玉、史诗=暗金（V1.2 蓝/橙已废弃） */
  .buff-common {
    border: 1px solid color-mix(in srgb, var(--ui-ink) 30%, transparent);
  }

  .buff-rare {
    border: 1px solid color-mix(in srgb, var(--ui-jade) 60%, transparent);
  }

  .buff-epic {
    border: 1px solid var(--ui-gold);
  }
</style>
