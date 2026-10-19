<template>
  <n-layout>
    <n-layout-content class="gm-content">
      <n-tabs v-model:value="tab" type="line" animated>
        <n-tab-pane name="basic" tab="基础属性">
          <n-card title="基础属性修改">
            <n-form>
              <n-form-item label="道号">
                <n-input v-model:value="baseAttributes.name" />
              </n-form-item>
              <n-form-item label="境界等级">
                <n-input-number v-model:value="baseAttributes.level" />
              </n-form-item>
              <n-form-item label="境界名称">
                <n-input v-model:value="baseAttributes.realm" />
              </n-form-item>
              <n-form-item label="当前修为">
                <n-input-number v-model:value="baseAttributes.cultivation" />
              </n-form-item>
              <n-form-item label="最大修为">
                <n-input-number v-model:value="baseAttributes.maxCultivation" />
              </n-form-item>
              <n-form-item label="灵力">
                <n-input-number v-model:value="baseAttributes.spirit" />
              </n-form-item>
              <n-form-item label="灵力获取倍率">
                <n-input-number v-model:value="baseAttributes.spiritRate" />
              </n-form-item>
              <n-form-item label="幸运值">
                <n-input-number v-model:value="baseAttributes.luck" />
              </n-form-item>
              <n-form-item label="修炼速率">
                <n-input-number v-model:value="baseAttributes.cultivationRate" />
              </n-form-item>
              <n-form-item label="灵草获取倍率">
                <n-input-number v-model:value="baseAttributes.herbRate" />
              </n-form-item>
              <n-form-item label="炼丹成功率加成">
                <n-input-number v-model:value="baseAttributes.alchemyRate" />
              </n-form-item>
              <n-form-item label="大子">
                <n-input-number v-model:value="baseAttributes.currency.daZi" />
              </n-form-item>
              <n-form-item label="金页子">
                <n-input-number v-model:value="baseAttributes.currency.jinYeZi" />
              </n-form-item>
              <n-form-item label="一阶灵石">
                <n-input-number v-model:value="baseAttributes.currency.stone1" />
              </n-form-item>
              <n-form-item label="二阶灵石">
                <n-input-number v-model:value="baseAttributes.currency.stone2" />
              </n-form-item>
              <n-form-item label="灵宠精华">
                <n-input-number v-model:value="baseAttributes.petEssence" />
              </n-form-item>
            </n-form>
            <template #footer>
              <n-space justify="end">
                <n-button type="warning" @click="applyLegacyFix">
                  旧灵石补偿（14,005 → 90% 一阶）
                </n-button>
                <n-button type="info" @click="resetPlayerData">重置数据</n-button>
                <n-button type="primary" @click="updateAttributes">保存修改</n-button>
              </n-space>
            </template>
          </n-card>
        </n-tab-pane>

        <n-tab-pane name="debug" tab="调试日志">
          <DebugLogPanel />
        </n-tab-pane>
      </n-tabs>
    </n-layout-content>
  </n-layout>
</template>

<script setup>
  import { usePlayerStore } from '../stores/player'
  import { ref } from 'vue'
  import { useMessage } from 'naive-ui'
  import DebugLogPanel from '../components/DebugLogPanel.vue'

  const playerStore = usePlayerStore()
  const message = useMessage()
  const tab = ref('basic')

  // 基础属性编辑
  const baseAttributes = ref({
    name: playerStore.name,
    level: playerStore.level,
    realm: playerStore.realm,
    cultivation: playerStore.cultivation,
    maxCultivation: playerStore.maxCultivation,
    spirit: playerStore.spirit,
    spiritRate: playerStore.spiritRate,
    luck: playerStore.luck,
    cultivationRate: playerStore.cultivationRate,
    herbRate: playerStore.herbRate,
    alchemyRate: playerStore.alchemyRate,
    // 双层货币（P17）：对象整体拷一份，避免 GM 页输入直接改到 store
    currency: { ...playerStore.currency },
    petEssence: playerStore.petEssence
  })

  // 更新玩家属性
  const updateAttributes = () => {
    try {
      // 更新基础属性
      Object.entries(baseAttributes.value).forEach(([key, value]) => {
        if (typeof value === 'number') {
          playerStore[key] = Number(value)
        } else {
          playerStore[key] = value
        }
      })
      // 保存数据
      playerStore.saveData()
      message.success('属性更新成功')
    } catch (error) {
      message.error('更新失败：' + error.message)
    }
  }

  /**
   * 一次性旧灵石补偿（2026-10-19）：
   * 2026-10-18 那份存档按旧口径 1 旧 = 10 大子迁移过；这里补成
   * 1 旧 = 1 一阶，90% 留一阶、10% 拆金页子/大子。
   * 自动修复只在「大子 ≥ 140,050 且一阶/二阶为 0」时跑；花过钱就手动点这里。
   */
  const applyLegacyFix = () => {
    const res = playerStore.applyLegacyStoneFix(14005)
    if (!res.ok) {
      message.warning(res.message)
      return
    }
    baseAttributes.value.currency = { ...playerStore.currency }
    message.success(
      `已补偿：一阶 +${res.split.keepStone1} / 金页子 +${res.split.jinYeZi} / 大子 +${res.split.daZi}`
    )
  }

  // 重置玩家数据
  const resetPlayerData = async () => {
    try {
      playerStore.$reset()
      // 调试日志活在模块闭包里，$reset() 清不掉 —— 必须显式清
      playerStore.debugResetAll()
      await playerStore.initializePlayer()
      message.success('数据重置成功')
      // 刷新显示的数据
      Object.entries(playerStore).forEach(([key, value]) => {
        if (key in baseAttributes.value) {
          // currency 是嵌套对象：必须再拷一层，否则 GM 输入框会直接改到 store
          baseAttributes.value[key] = key === 'currency' ? { ...value } : value
        }
      })
    } catch (error) {
      message.error('重置失败：' + error.message)
    }
  }
</script>

<style scoped>
  .gm-content {
    padding: 16px;
  }
</style>
