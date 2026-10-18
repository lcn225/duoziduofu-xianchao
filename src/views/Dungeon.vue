<template>
  <n-layout>
    <n-layout-header bordered>
      <n-page-header>
        <template #title>秘境</template>
        <template #subtitle>
          <n-space align="center" :size="8">
            <n-tag size="small" type="warning">最高 {{ playerStore.secretRealm.highestFloor }} 层</n-tag>
            <n-tag size="small" type="info">已通 Boss 段 {{ playerStore.secretRealmSweepLimit }} 层</n-tag>
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
          正在养伤，剩余 {{ formatDuration(playerStore.injuryRemainingSeconds) }}。养伤期间无法进秘境。
        </n-alert>

        <n-tabs type="line" animated>
          <!-- ================= 挑战 ================= -->
          <n-tab-pane name="run" tab="挑战">
            <!-- 没有挑战：配置队伍 -->
            <n-card v-if="!hasRun" title="整备出发" :bordered="false">
              <n-space vertical size="large">
                <n-alert type="info" show-icon>
                  每次进入秘境固定消耗 <b>{{ TIME_COST_DAYS }}</b> 个游戏天。队伍 =
                  桂冈 + 最多 {{ companionSlots }} 名可出战的子嗣/灵宠
                  （子嗣需<b>有灵根</b>且到<b>少年</b>，无灵根者只能做工）。
                </n-alert>

                <n-descriptions :column="3" bordered size="small">
                  <n-descriptions-item label="桂冈">
                    Lv.{{ playerStore.level }} · {{ playerStore.realm }}
                  </n-descriptions-item>
                  <n-descriptions-item label="体力">
                    {{ Math.round(playerStore.stamina) }} / {{ Math.round(playerStore.staminaMax) }}
                  </n-descriptions-item>
                  <n-descriptions-item label="撤退线">
                    {{ draftAutoRetreat }}%
                  </n-descriptions-item>
                </n-descriptions>

                <n-card title="出战子嗣" size="small" :bordered="false">
                  <n-empty
                    v-if="!playerStore.adultOffspringCandidates.length"
                    description="还没有可出战的子嗣（需有灵根并到少年）"
                  />
                  <n-checkbox-group v-else v-model:value="draftOffspringIds">
                    <n-space vertical>
                      <n-checkbox
                        v-for="child in playerStore.adultOffspringCandidates"
                        :key="child.id"
                        :value="child.id"
                      >
                        {{ child.name }} · {{ rootCountName(child.rootCount) }} ·
                        {{ growthText(child) }}
                      </n-checkbox>
                    </n-space>
                  </n-checkbox-group>
                </n-card>

                <n-card title="出战灵宠" size="small" :bordered="false">
                  <n-empty v-if="!playerStore.petCandidates.length" description="背包里还没有灵宠" />
                  <n-checkbox-group v-else v-model:value="draftPetIds">
                    <n-space vertical>
                      <n-checkbox v-for="pet in playerStore.petCandidates" :key="pet.id" :value="pet.id">
                        {{ pet.name }} · {{ pet.rarity || '灵宠' }} · Lv.{{ pet.level || 1 }}
                      </n-checkbox>
                    </n-space>
                  </n-checkbox-group>
                </n-card>

                <n-space align="center" :size="16" wrap>
                  <n-text>自动撤退血量：{{ draftAutoRetreat }}%</n-text>
                  <n-slider v-model:value="draftAutoRetreat" :min="0" :max="50" :step="5" style="width: 220px" />
                  <n-checkbox v-model:checked="draftPermadeath">关闭自动撤退，允许子嗣陨落</n-checkbox>
                </n-space>

                <n-alert v-if="draftPermadeath" type="error" show-icon>
                  已关闭自动撤退：战败时倒地的子嗣会**真陨落**，只返还少量修为。没有替死道具。
                </n-alert>

                <n-space>
                  <n-button
                    type="primary"
                    size="large"
                    :disabled="!playerStore.canStartSecretRealm || selectedCount > companionSlots"
                    @click="startRun"
                  >
                    开始挑战（消耗 {{ TIME_COST_DAYS }} 天）
                  </n-button>
                  <n-text depth="3">已选 {{ selectedCount }} / {{ companionSlots }}</n-text>
                </n-space>
              </n-space>
            </n-card>

            <!-- 有挑战：战况 / Buff / 结果 -->
            <template v-else>
              <!-- 结果已经算出来了，但回放还没放完时，仍要保住战况卡：
                   否则会出现「战斗卡消失、结果卡又还没显示」的空白期。 -->
              <n-card
                v-if="run.status !== 'finished' || !segmentDone"
                :title="`第 ${displayFloor} 层`"
                :bordered="false"
              >
                <n-space vertical size="large">
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
                      <n-card size="small" :bordered="false" class="unit-card">
                        <n-space vertical :size="4">
                          <n-text strong>{{ unit.name }}</n-text>
                          <n-progress
                            type="line"
                            :percentage="unit.pct"
                            :show-indicator="false"
                            :status="unit.pct <= 0 ? 'error' : unit.pct < 30 ? 'warning' : 'success'"
                          />
                          <n-text depth="3" style="font-size: 12px">
                            {{ Math.max(Math.round(unit.hp), 0) }} / {{ Math.round(unit.max) }}
                          </n-text>
                        </n-space>
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
                </n-space>
              </n-card>

              <!-- Buff 三选一 -->
              <n-card v-if="run.status === 'buff' && run.pendingBuff && segmentDone" title="机缘选择" :bordered="false">
                <n-space vertical size="large">
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
                </n-space>
              </n-card>

              <!-- 结果 -->
              <n-card v-if="run.status === 'finished' && run.result && segmentDone" title="挑战结束" :bordered="false">
                <n-space vertical size="large">
                  <n-alert :type="run.result.retreated ? 'warning' : 'error'" show-icon>
                    {{ run.result.retreated ? '队伍在低血量时撤退了。' : '队伍战败。' }}
                    止步第 {{ run.result.floor }} 层，共 {{ run.result.rounds || '—' }} 回合。
                  </n-alert>
                  <n-descriptions :column="3" bordered size="small">
                    <n-descriptions-item label="灵石">+{{ run.result.loot?.spiritStones || 0 }}</n-descriptions-item>
                    <n-descriptions-item label="洗练石">+{{ run.result.loot?.refinementStones || 0 }}</n-descriptions-item>
                    <n-descriptions-item label="灵草 / 丹方">
                      {{ run.result.loot?.herbs || 0 }} / {{ run.result.loot?.pillFragments || 0 }}
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
                  <n-alert v-if="run.result.deaths?.length" type="error" show-icon>
                    陨落：{{ run.result.deaths.map(d => d.name).join('、') }}。已供奉于内宅的英烈祠。
                  </n-alert>
                  <n-space>
                    <n-button type="primary" @click="restartRun">再次挑战</n-button>
                    <n-button @click="resetSetup">重新整备</n-button>
                    <n-button @click="leaveRealm">回镇守</n-button>
                  </n-space>
                </n-space>
              </n-card>
            </template>
          </n-tab-pane>

          <!-- ================= 扫荡 ================= -->
          <n-tab-pane name="sweep" tab="扫荡">
            <n-card title="扫荡" :bordered="false">
              <n-space vertical size="large">
                <n-alert type="info" show-icon>
                  只能扫荡**已通关的完整 Boss 段**：当前可扫 1 ~ {{ playerStore.secretRealmSweepLimit }} 层。
                  扫荡同样消耗 {{ TIME_COST_DAYS }} 天，只给基础掉落，不重复给 Boss 首破奖励。
                </n-alert>
                <n-descriptions :column="2" bordered size="small">
                  <n-descriptions-item label="可扫荡层数">
                    {{ playerStore.secretRealmSweepLimit }}
                  </n-descriptions-item>
                  <n-descriptions-item label="已通关最高层">
                    {{ playerStore.secretRealm.highestFloor }}
                  </n-descriptions-item>
                </n-descriptions>
                <n-button
                  type="primary"
                  :disabled="!playerStore.secretRealmCanSweep || playerStore.idleMode !== 'garrison'"
                  @click="sweep"
                >
                  开始扫荡（{{ TIME_COST_DAYS }} 天）
                </n-button>
              </n-space>
            </n-card>
          </n-tab-pane>

        </n-tabs>
      </div>
    </n-layout-content>
  </n-layout>
</template>

<script setup>
  import { computed, nextTick, ref, watch, onMounted, onUnmounted } from 'vue'
  import { useRouter } from 'vue-router'
  import { useMessage } from 'naive-ui'
  import { usePlayerStore } from '../stores/player'
  import { useRealmPlayback } from '../composables/useRealmPlayback'
  import { TUNING, buffListOf } from '../plugins/secretRealm'
  import { formatOffspringGrowth, rootCountName } from '../plugins/innerCourt'
  import { formatDuration } from '../plugins/dayDate'

  const playerStore = usePlayerStore()

  /** 子嗣成长文案（P14 仙凡双轨）。秘境不暂停时间，但候选名单只在配置时刷新，够用 */
  const growthText = child => formatOffspringGrowth(child, playerStore.clockGameTime)
  const router = useRouter()
  const message = useMessage()
  const playback = useRealmPlayback()

  const TIME_COST_DAYS = TUNING.timeCostDays
  const companionSlots = TUNING.companionSlots

  const draftOffspringIds = ref([])
  const draftPetIds = ref([])
  const draftAutoRetreat = ref(playerStore.secretRealm.retreatThreshold || 20)
  const draftPermadeath = ref(false)
  const hpMap = ref({})
  const maxMap = ref({})
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
  const selectedCount = computed(() => draftOffspringIds.value.length + draftPetIds.value.length)
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
    if (selectedCount.value > companionSlots) return
    playerStore.secretRealm.retreatThreshold = draftAutoRetreat.value
    playerStore.secretRealm.retreatEnabled = draftAutoRetreat.value > 0
    const result = playerStore.startSecretRealmRun({
      offspringIds: draftOffspringIds.value,
      petIds: draftPetIds.value,
      permadeath: draftPermadeath.value
    })
    if (!result.ok) return
    playFrames()
  }

  const restartRun = () => {
    const cfg = {
      offspringIds: (run.value?.party || []).filter(r => r.kind === 'offspring').map(r => r.id),
      petIds: (run.value?.party || []).filter(r => r.kind === 'pet').map(r => r.id),
      permadeath: !!run.value?.permadeath
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

  const sweep = () => {
    const result = playerStore.startSecretRealmSweep()
    if (result.ok) message.success(`扫荡完成：1 ~ ${result.cap} 层`)
    else if (result.reason) message.warning(result.reason)
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
    // 结果已经出来的挑战，离开页面就回镇守，避免时钟暂停持有者泄漏
    if (playerStore.secretRealm.run?.status === 'finished') playerStore.leaveSecretRealm()
  })
</script>

<style scoped>
  .realm-wrap {
    max-width: 1180px;
    margin: 0 auto;
    padding: 12px;
  }

  .unit-card,
  .enemy-card {
    background: rgba(128, 128, 128, 0.06);
  }

  .battle-log {
    height: 280px;
    overflow-y: auto;
    padding: 8px 12px;
    border-radius: 8px;
    background: rgba(128, 128, 128, 0.06);
    font-size: 13px;
    line-height: 1.9;
  }

  .frame-floor {
    color: #999;
    margin-right: 6px;
  }

  .frame-victory {
    color: #18a058;
    font-weight: 600;
  }

  .frame-defeat {
    color: #d03050;
    font-weight: 600;
  }

  .frame-retreat {
    color: #f0a020;
    font-weight: 600;
  }

  .frame-skip {
    color: #999;
  }

  .battle-log-empty {
    color: #999;
    text-align: center;
    padding: 24px 0;
  }

  .buff-common {
    border: 1px solid rgba(128, 128, 128, 0.35);
  }

  .buff-rare {
    border: 1px solid rgba(32, 128, 240, 0.6);
  }

  .buff-epic {
    border: 1px solid rgba(240, 160, 32, 0.8);
  }
</style>
