<script setup>
import { ref, computed } from 'vue'
import { usePlayerStore } from '../stores/player'
import {
  pillRecipes,
  pillGrades,
  pillTypes,
  calculatePillEffect,
  calculateEffectValue,
  PILL_QUALITIES
} from '../plugins/pills'
import { herbs } from '../plugins/herbs'
import LogPanel from '../components/LogPanel.vue'

const playerStore = usePlayerStore()
const logRef = ref(null)

// 当前选择的丹方
const selectedRecipe = ref(null)

// 已解锁的丹方列表
const unlockedRecipes = computed(() => {
  return pillRecipes.filter(recipe => playerStore.pillRecipes.includes(recipe.id))
})

// 选择丹方
const selectRecipe = (recipe) => {
  selectedRecipe.value = recipe
}

// 检查材料是否充足
const checkMaterials = (recipe) => {
  if (!recipe) return false
  return recipe.materials.every(material => {
    const count = playerStore.herbs.filter(h => h.id === material.herb).length
    return count >= material.count
  })
}

// 获取材料状态文本
const getMaterialStatus = (material) => {
  const count = playerStore.herbs.filter(h => h.id === material.herb).length
  return `${count}/${material.count}`
}

// 获取灵草名称
const getHerbName = (herbId) => {
  const herb = herbs.find(h => h.id === herbId)
  return herb ? herb.name : herbId
}

// 计算炼丹成功率
const calculatePillSuccess = computed(() => {
  const baseRate = 0.6
  const levelBonus = Math.min(0.2, playerStore.level * 0.01)
  const luckBonus = Math.sqrt(playerStore.luck) * 0.05
  const fragmentBonus = (selectedRecipe.value?.fragmentsCollected || 0) * 0.02

  return Math.min(0.95, baseRate + levelBonus + luckBonus + fragmentBonus)
})

// 计算丹药品质
const calculatePillQuality = computed(() => {
  const qualities = ['common', 'uncommon', 'rare', 'epic', 'legendary']
  const baseIndex = Math.floor(Math.random() * 3)
  const luckBonus = Math.floor(Math.sqrt(playerStore.luck) * 0.5)
  const levelBonus = Math.floor(playerStore.level * 0.02)

  return qualities[Math.min(qualities.length - 1, baseIndex + luckBonus + levelBonus)]
})

// 检查材料组合是否有效
const checkMaterialCombination = (materials) => {
  if (!materials || materials.length < 2) return false

  // 检查材料等级匹配
  const tiers = materials.map(m => m.tier)
  const maxTierDiff = Math.max(...tiers) - Math.min(...tiers)
  if (maxTierDiff > 1) return false

  // 检查效果组合
  const effects = materials.flatMap(m => m.effects)
  const uniqueEffects = new Set(effects)
  if (uniqueEffects.size < 2) return false

  return true
}

// 计算当前效果
const currentEffect = computed(() => {
  if (!selectedRecipe.value) return null

  const quality = calculatePillQuality.value
  return calculatePillEffect(selectedRecipe.value, playerStore.level, quality)
})

// 炼制丹药
const craftPill = () => {
  if (!selectedRecipe.value) return

  const result = playerStore.craftPill(
    selectedRecipe.value.id,
    calculatePillSuccess.value,
    calculatePillQuality.value
  )

  if (result.success) {
    logRef.value?.addLog('success', `炼制成功！获得${result.quality}品质的${selectedRecipe.value.name}`)
    const btn = document.querySelector('.craft-button')
    if (btn) {
      btn.classList.add('success-animation')
      setTimeout(() => btn.classList.remove('success-animation'), 1000)
    }
  } else {
    logRef.value?.addLog('error', `炼制失败：${result.message}`)
    const btn = document.querySelector('.craft-button')
    if (btn) {
      btn.classList.add('fail-animation')
      setTimeout(() => btn.classList.remove('fail-animation'), 1000)
    }
  }
}
</script>

<template>
  <n-card title="丹药炼制">
    <n-space vertical>
      <!-- 丹方选择 -->
      <n-collapse>
        <n-collapse-item title="丹方选择" name="recipe">
          <n-space vertical>
            <n-list v-if="unlockedRecipes.length > 0">
              <n-list-item v-for="recipe in unlockedRecipes" :key="recipe.id">
                <n-space justify="space-between">
                  <div>
                    <h3>{{ recipe.name }}</h3>
                    <p>{{ recipe.description }}</p>
                    <n-space>
                      <n-tag>{{ pillGrades[recipe.grade].name }}</n-tag>
                      <n-tag>{{ pillTypes[recipe.type].name }}</n-tag>
                    </n-space>
                  </div>
                  <n-button @click="selectRecipe(recipe)"
                    :type="selectedRecipe?.id === recipe.id ? 'primary' : 'default'">
                    选择
                  </n-button>
                </n-space>
              </n-list-item>
            </n-list>
            <div v-else>暂未掌握任何丹方</div>
          </n-space>
        </n-collapse-item>
      </n-collapse>
      <!-- 材料需求 -->
      <n-collapse v-if="selectedRecipe">
        <n-collapse-item title="材料需求" name="materials">
          <n-list>
            <n-list-item v-for="material in selectedRecipe.materials" :key="material.herb">
              <n-space justify="space-between">
                <n-space>
                  <span>{{ getHerbName(material.herb) }}</span>
                  <n-tag size="small">需要数量: {{ material.count }}</n-tag>
                </n-space>
                <n-tag
                  :type="getMaterialStatus(material) === `${material.count}/${material.count}` ? 'success' : 'warning'">
                  拥有: {{ getMaterialStatus(material) }}
                </n-tag>
              </n-space>
            </n-list-item>
          </n-list>
        </n-collapse-item>
      </n-collapse>
      <!-- 效果预览 -->
      <n-collapse v-if="selectedRecipe && currentEffect">
        <n-collapse-item title="效果预览" name="effect">
          <n-descriptions bordered>
            <n-descriptions-item label="丹药介绍">
              {{ selectedRecipe.description }}
            </n-descriptions-item>
            <n-descriptions-item label="效果数值">
              +{{ (currentEffect.value * 100).toFixed(1) }}%
            </n-descriptions-item>
            <n-descriptions-item label="持续时间">
              {{ Math.floor(currentEffect.duration / 60) }}分钟
            </n-descriptions-item>
            <n-descriptions-item label="成功率">
              {{ (currentEffect.successRate * 100).toFixed(1) }}%
            </n-descriptions-item>
          </n-descriptions>
        </n-collapse-item>
      </n-collapse>
      <!-- 炼制按钮 -->
      <n-button class="craft-button" type="primary" block :disabled="!selectedRecipe || !checkMaterials(selectedRecipe)"
        @click="craftPill">
        开始炼制
      </n-button>
    </n-space>
    <log-panel ref="logRef" title="炼丹日志" />
  </n-card>
</template>

<style scoped>
.n-space {
  width: 100%;
}

.n-button {
  margin-bottom: 12px;
}

.n-collapse {
  margin-top: 12px;
}

.craft-button {
  position: relative;
  overflow: hidden;
}

@keyframes success-ripple {
  0% {
    transform: scale(0);
    opacity: 1;
  }
  100% {
    transform: scale(4);
    opacity: 0;
  }
}

@keyframes fail-shake {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-10px);
  }
  75% {
    transform: translateX(10px);
  }
}

.success-animation::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: 20px;
  height: 20px;
  background: rgba(0, 255, 0, 0.3);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  animation: success-ripple 1s ease-out;
}

.fail-animation {
  animation: fail-shake 0.5s ease-in-out;
}
</style>