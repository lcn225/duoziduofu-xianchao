<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { usePlayerStore } from '../stores/player'
import { locations, LOCATION_TIERS, calculateExplorationRewards, checkLocationRequirements, calculateSpecialEventProbability, refreshLocationHerbs } from '../plugins/locations'
import { EVENT_TYPES, calculateEventRewards, checkEventCooldown, handleReward, triggerRandomEvent, triggerSpecialEvent, eventsList, SPECIAL_EVENTS } from '../plugins/events'
import { getRandomHerb, HERB_QUALITIES } from '../plugins/herbs'
import { getRealmName } from '../plugins/realm'
import LogPanel from '../components/LogPanel.vue'

const playerStore = usePlayerStore()
const logRef = ref(null)
const exploring = ref(false)
const selectedLocation = ref(null)
const locationHerbs = ref([])
const lastEventTimes = ref({})

// 计算可用地点
const availableLocations = computed(() => {
  return locations.filter(location =>
    checkLocationRequirements(location, playerStore.level, playerStore.unlockedLocations)
  )
})

// 计算探索消耗
const explorationCost = computed(() => {
  if (!selectedLocation.value) return 0
  const tier = LOCATION_TIERS[selectedLocation.value.tier]
  return Math.round(50 * Math.pow(tier.difficultyMod, 1.5))
})

// 计算探索奖励
const potentialRewards = computed(() => {
  if (!selectedLocation.value) return null
  return calculateExplorationRewards(
    selectedLocation.value,
    playerStore.level,
    playerStore.luck
  )
})

// 选择地点
const selectLocation = (location) => {
  try {
    selectedLocation.value = location
    // 刷新地点灵草
    locationHerbs.value = refreshLocationHerbs(location, playerStore.level)
  } catch (error) {
    console.error('刷新地点灵草失败:', error)
    logRef.value?.addLog('error', '刷新地点灵草失败')
    locationHerbs.value = []
  }
}

// 添加一个计算属性来显示可采集的灵草
const availableHerbs = computed(() => {
  const now = Date.now()
  return locationHerbs.value.filter(herb => herb.refreshTime <= now)
})

// 开始探索
const startExploration = async () => {
  if (!selectedLocation.value || exploring.value) return
  if (!canExplore.value) {
    logRef.value?.addLog('error', '冷却中，无法探索')
    return
  }

  exploring.value = true
  playerStore.spirit -= explorationCost.value

  try {
    // 记录探索时间
    playerStore.recordExploration(selectedLocation.value.id)

    // 基础奖励
    const rewards = calculateExplorationRewards(
      selectedLocation.value,
      playerStore.level,
      playerStore.luck
    )

    // 灵石奖励
    const spiritStones = Math.floor(
      rewards.spiritStones.min +
      Math.random() * (rewards.spiritStones.max - rewards.spiritStones.min)
    )
    if (spiritStones > 0) {
      playerStore.spiritStones += spiritStones
      logRef.value?.addLog('success', `获得${spiritStones}灵石`)
    }

    // 灵草奖励
    for (let i = 0; i < rewards.herbs.max; i++) {
      const herb = getRandomHerb(playerStore.level, playerStore.luck)
      if (herb) {
        playerStore.herbs.push(herb)
        logRef.value?.addLog(
          'success',
          `获得${HERB_QUALITIES[herb.quality].name}品质的${herb.name}`
        )
      }
    }

    // 检查特殊事件
    const eventProb = calculateSpecialEventProbability(
      selectedLocation.value,
      playerStore.level,
      playerStore.luck
    )

    if (Math.random() < eventProb) {
      // 遍历可能的事件类型
      for (const [eventType, config] of Object.entries(EVENT_TYPES)) {
        if (!checkEventCooldown(eventType, lastEventTimes.value)) continue

        if (Math.random() < config.probability) {
          const eventRewards = calculateEventRewards(
            eventType,
            playerStore.level,
            playerStore.luck
          )

          if (eventRewards) {
            handleReward(eventType, eventRewards, playerStore, logRef)
            lastEventTimes.value[eventType] = Date.now()
            break
          }
        }
      }
    }

    // 尝试触发随机事件
    triggerRandomEvent(playerStore, (type, message) => {
      logRef.value?.addLog(type, message)
    })

    // 检查特殊事件
    const specialEvent = triggerSpecialEvent(
      selectedLocation.value,
      playerStore.level,
      playerStore.luck
    )
    if (specialEvent) {
      handleSpecialEvent(specialEvent)
    }

    // 更新地点灵草
    locationHerbs.value = refreshLocationHerbs(selectedLocation.value, playerStore.level)

    // 保存游戏
    playerStore.saveData()

  } catch (error) {
    console.error('探索出错:', error)
    logRef.value?.addLog('error', '探索过程出现错误')
  } finally {
    exploring.value = false
  }
}

// 处理特殊事件
const handleSpecialEvent = (event) => {
  logRef.value?.addLog('info', `触发特殊事件: ${event.name}`)
  event.effect(playerStore, (type, message) => {
    logRef.value?.addLog(type, message)
  })
}

// 获取地点标签类型
const getLocationTagType = (location) => {
  const tier = LOCATION_TIERS[location.tier]
  if (playerStore.level < tier.minLevel) return 'error'
  if (playerStore.level > tier.maxLevel) return 'info'
  return 'success'
}

// 获取倍率标签类型
const getMultiplierTagType = (rate) => {
  if (rate >= 1.5) return 'success'
  if (rate >= 1.0) return 'info'
  return 'warning'
}

// 获取事件概率标签类型
const getEventRateTagType = (rate) => {
  if (rate >= 0.5) return 'success'
  if (rate >= 0.3) return 'info'
  return 'warning'
}

// 检查是否是新地点
const isNewLocation = (location) => {
  return playerStore.unlockedLocations.includes(location.id) &&
    !playerStore.visitedLocations.includes(location.id)
}

// 获取特殊事件名称和描述
const getSpecialEventName = (eventId) => {
  if (!SPECIAL_EVENTS || !eventId) return '未知事件'
  const event = SPECIAL_EVENTS[eventId]
  return event ? event.name : eventId
}

const getSpecialEventDescription = (eventId) => {
  if (!SPECIAL_EVENTS || !eventId) return '暂无描述'
  const event = SPECIAL_EVENTS[eventId]
  return event ? event.description : ''
}

// 格式化时间函数
const formatTime = (ms) => {
  if (ms < 60000) {
    return `${Math.ceil(ms / 1000)}秒`
  } else if (ms < 3600000) {
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.ceil((ms % 60000) / 1000)
    return `${minutes}分${seconds}秒`
  } else {
    const hours = Math.floor(ms / 3600000)
    const minutes = Math.floor((ms % 3600000) / 60000)
    return `${hours}时${minutes}分`
  }
}

// 冷却时间显示
const cooldownTime = ref('')
const updateCooldown = () => {
  if (!selectedLocation.value) {
    cooldownTime.value = ''
    return
  }

  if (!playerStore.checkExploreCooldown(selectedLocation.value.id)) {
    const lastTime = playerStore.lastExploreTime[selectedLocation.value.id] || 0
    const cooldown = 5 * 60 * 1000 // 5分钟冷却
    const remaining = Math.max(0, cooldown - (Date.now() - lastTime))
    cooldownTime.value = formatTime(remaining)
  } else {
    cooldownTime.value = '可探索'
  }
}

// 启动定时器
onMounted(() => {
  const timer = setInterval(updateCooldown, 1000)
  onUnmounted(() => clearInterval(timer))
})

// 检查是否可以探索
const canExplore = computed(() => {
  if (!selectedLocation.value) return false
  if (exploring.value) return false
  if (playerStore.spirit < explorationCost.value) return false
  return playerStore.checkExploreCooldown(selectedLocation.value.id)
})

const iscanExplore = (bool) => {
  
}
</script>

<template>
  <n-card title="探索">
    <n-space vertical>
      <!-- 地点选择 -->
      <n-grid :cols="1" :x-gap="12" :y-gap="8">
        <n-grid-item v-for="location in availableLocations" :key="location.id">
          <n-card :class="{ 'location-card': true, 'selected': selectedLocation?.id === location.id }" hoverable @click="selectLocation(location)">
            <template #header>
              <n-space align="center" justify="space-between">
                <n-space>
                  <n-text :type="selectedLocation?.id === location.id ? 'primary' : ''">
                    {{ location.name }}
                  </n-text>
                  <n-tag size="small" :type="getLocationTagType(location)">
                    {{ getRealmName(LOCATION_TIERS[location.tier].minLevel) }}
                  </n-tag>
                </n-space>
                <n-tag size="small" type="warning" v-if="isNewLocation(location)">新</n-tag>
              </n-space>
            </template>
            <n-space vertical :size="8">
              <n-text depth="3" class="location-description">
                {{ location.description }}
              </n-text>
              <n-divider />
              <n-space justify="space-between">
                <n-space>
                  <n-tooltip trigger="hover">
                    <template #trigger>
                      <n-tag :type="getMultiplierTagType(location.baseHerbRate)">
                        灵草: {{ location.baseHerbRate }}x
                      </n-tag>
                    </template>
                    灵草获取倍率
                  </n-tooltip>
                  <n-tooltip trigger="hover">
                    <template #trigger>
                      <n-tag :type="getEventRateTagType(location.baseEventRate)">
                        事件: {{ (location.baseEventRate * 100).toFixed(0) }}%
                      </n-tag>
                    </template>
                    事件触发概率
                  </n-tooltip>
                </n-space>
                <n-space v-if="location.specialEvents?.length">
                  <n-tooltip trigger="hover" v-for="eventId in location.specialEvents" :key="eventId">
                    <template #trigger>
                      <n-tag type="info" size="small">
                        {{ getSpecialEventName(eventId) }}
                      </n-tag>
                    </template>
                    {{ getSpecialEventDescription(eventId) }}
                  </n-tooltip>
                </n-space>
              </n-space>
            </n-space>
            <!-- 探索信息和按钮 -->
            <n-card v-if="selectedLocation" style="margin-top: 10px;" embedded>
                <n-space vertical>
                <n-space justify="space-between">
                    <n-text>消耗灵力: {{ explorationCost }}</n-text>
                    <n-text :type="cooldownTime === '可探索' ? 'success' : 'warning'">
                    冷却时间: {{ cooldownTime }}
                    </n-text>
                </n-space>
                <n-button type="primary" block :loading="exploring" :disabled="!canExplore || LOCATION_TIERS[location.tier].minLevel > playerStore.level" @click="startExploration">
                    开始探索
                </n-button>
                </n-space>
            </n-card>
          </n-card>
        </n-grid-item>
      </n-grid>
      <!-- 日志面板 -->
      <LogPanel ref="logRef" />
    </n-space>
  </n-card>
</template>

<style scoped>
</style>