<template>
  <n-layout>
    <n-layout-header bordered>
      <n-page-header>
        <template #title>背包</template>
      </n-page-header>
    </n-layout-header>
    <n-layout-content>
      <n-card :bordered="false">
        <n-tabs type="line">
          <n-tab-pane name="equipment" tab="装备">
            <!-- P36 一键装备（《装备系统》§12.1）：桂冈 5 槽 + 所有出战子嗣的攻/防两槽 -->
            <section class="inv-summary">
              <div class="inv-sum-row">
                <span class="inv-sum-key">已装备</span>
                <span class="inv-sum-item">{{ equippedCount }} / {{ equipmentSlotCount }} 槽</span>
                <span class="inv-sum-item is-dim">
                  一键装备：桂冈 5 槽 + 出战子嗣的攻/防两槽一起穿，换下的回背包（不卖）
                </span>
              </div>
              <div class="inv-sum-row">
                <span class="inv-sum-key">操作</span>
                <n-button size="small" type="primary" :disabled="!playerStore.items?.length" @click="handleAutoEquip">
                  一键装备
                </n-button>
              </div>
            </section>
            <div class="inv-grid">
              <div
                v-for="(name, type) in equipmentTypes"
                :key="type"
                class="inv-card is-clickable"
                @click="showEquipmentList(type)"
              >
                <div class="inv-main">
                  <div class="inv-head">
                    <span class="inv-name">{{ name }}</span>
                    <span v-if="!playerStore.equippedArtifacts[type]" class="inv-count">未装备</span>
                  </div>
                  <template v-if="playerStore.equippedArtifacts[type]">
                    <div class="inv-meta">
                      <n-tag size="small" type="info">
                        {{ playerStore.equippedArtifacts[type].qualityInfo?.name || '—' }}
                      </n-tag>
                      <n-tag size="small" type="warning">
                        {{ playerStore.equippedArtifacts[type].tier ?? 1 }} 阶
                      </n-tag>
                    </div>
                    <div class="inv-desc">{{ playerStore.equippedArtifacts[type].name }}</div>
                  </template>
                </div>
                <div v-if="playerStore.equippedArtifacts[type]" class="inv-actions">
                  <n-button
                    size="tiny"
                    @click.stop="showEquipmentDetails(playerStore.equippedArtifacts[type])"
                  >
                    详细
                  </n-button>
                  <n-button size="tiny" type="error" @click.stop="unequipItem(type)">卸下</n-button>
                </div>
              </div>
            </div>
          </n-tab-pane>
          <n-tab-pane name="materials" tab="材料">
            <template v-if="groupedMaterials.length">
              <!-- 材料总览（2026-11-06）：五系 / 品阶 / 锁定。原来只有卡片上的锁图标，
                   玩家分不清「锁了没有」—— 现在统计条 + 卡片上的文字按钮两处都看得到。 -->
              <section class="inv-summary">
                <div class="inv-sum-row">
                  <span class="inv-sum-key">五系</span>
                  <span v-for="el in MATERIAL_ELEMENTS" :key="el.key" class="inv-sum-item">
                    {{ el.label }} {{ fmtUnits(materialStats.byElement[el.key]) }}
                  </span>
                  <span v-if="materialStats.byElement.none" class="inv-sum-item is-dim">
                    无系 {{ fmtUnits(materialStats.byElement.none) }}
                  </span>
                </div>
                <div class="inv-sum-row">
                  <span class="inv-sum-key">品阶</span>
                  <span v-for="row in materialStats.byTier" :key="row.tier" class="inv-sum-item">
                    {{ row.tier }} 阶 {{ fmtUnits(row.count) }}
                  </span>
                </div>
                <div class="inv-sum-row">
                  <span class="inv-sum-key">总览</span>
                  <span class="inv-sum-item">
                    {{ materialStats.groups }} 种 · {{ fmtUnits(materialStats.units) }} 件
                  </span>
                  <span class="inv-sum-item" :class="{ 'is-warn': materialStats.lockedGroups > 0 }">
                    已锁定 {{ materialStats.lockedGroups }} 种 · {{ fmtUnits(materialStats.lockedUnits) }} 件
                  </span>
                </div>
              </section>

              <div class="inv-grid">
                <div
                  v-for="material in groupedMaterials"
                  :key="material.key"
                  class="inv-card"
                  :class="{ 'is-locked': material.locked }"
                >
                  <div class="inv-main">
                    <div class="inv-head">
                      <span class="inv-name">{{ material.name }}</span>
                      <span class="inv-count">×{{ fmtUnits(material.count) }}</span>
                    </div>
                    <div class="inv-meta">
                      <n-tag size="small" type="info">{{ material.category }}</n-tag>
                      <n-tag size="small">{{ material.itemType }}</n-tag>
                      <n-tag size="small" type="warning">
                        {{ material.tier }} 阶 · {{ QUALITY_LABEL[material.quality] || '—' }}
                      </n-tag>
                    </div>
                  </div>
                  <!-- B4b 品种锁：锁住 = 药浴（浴桶 / 药浴池）不吃、一键回收不卖、三换二不参与 -->
                  <div class="inv-actions">
                    <n-button
                      size="tiny"
                      :type="material.locked ? 'warning' : 'default'"
                      :secondary="!material.locked"
                      @click="toggleLock(material)"
                    >
                      {{ material.locked ? '已锁定' : '锁定' }}
                    </n-button>
                  </div>
                </div>
              </div>
              <n-text depth="3" style="font-size: 12px; display: block; margin-top: 10px">
                锁定 = 这个品种（不分成色）不进药浴（浴桶 / 药浴池）、不参与一键回收与三换二。
              </n-text>
            </template>
            <n-empty v-else description="探索采到的灵植 / 灵材会出现在这里" />
          </n-tab-pane>
          <n-tab-pane name="chests" tab="宝匣">
            <section class="inv-summary">
              <div class="inv-sum-row">
                <span class="inv-sum-key">总览</span>
                <span class="inv-sum-item">共 {{ fmtUnits(chestStats.total) }} 个</span>
                <span v-if="chestStats.groups" class="inv-sum-item">
                  {{ chestStats.groups }} 个阶位有货
                </span>
                <span v-if="chestStats.bonus" class="inv-sum-item">
                  其中 {{ fmtUnits(chestStats.bonus) }} 个带难度加成
                </span>
                <span v-for="row in chestStats.byTier" :key="row.tier" class="inv-sum-item">
                  {{ row.name }}阶 {{ fmtUnits(row.count) }}
                </span>
              </div>
              <div class="inv-sum-row">
                <span class="inv-sum-key">提示</span>
                <span class="inv-sum-item is-dim">
                  连开最多 10 个；开出的灵器 / 灵宠 / 残页直接进背包，灵石直接入库
                </span>
              </div>
            </section>
            <div class="inv-grid">
              <div
                v-for="chest in chestList"
                :key="chest.tier"
                class="inv-card"
                :class="{ 'is-empty': chest.count <= 0 }"
              >
                <div class="inv-main">
                  <div class="inv-head">
                    <span class="inv-name">{{ chest.name }}阶宝匣</span>
                    <span class="inv-count">×{{ fmtUnits(chest.count) }}</span>
                  </div>
                  <div class="inv-meta">
                    <n-tag size="small" type="warning">{{ chest.tier }} 阶</n-tag>
                    <n-tag
                      v-for="row in chest.bonus"
                      :key="row.level"
                      size="small"
                      type="success"
                    >
                      开箱 +{{ row.level }} ×{{ fmtUnits(row.count) }}
                    </n-tag>
                  </div>
                </div>
                <div class="inv-actions">
                  <n-button
                    size="small"
                    type="primary"
                    :disabled="chest.count <= 0"
                    @click="handleOpenChest(chest.tier, 1)"
                  >
                    开启
                  </n-button>
                  <n-button
                    size="small"
                    secondary
                    type="primary"
                    :disabled="chest.count < 2"
                    @click="handleOpenChest(chest.tier, 10)"
                  >
                    连开 ×{{ Math.min(chest.count, 10) }}
                  </n-button>
                </div>
              </div>
            </div>
          </n-tab-pane>
          <n-tab-pane name="special" tab="特殊道具">
            <template v-if="specialList.length">
              <section class="inv-summary">
                <div class="inv-sum-row">
                  <span class="inv-sum-key">总览</span>
                  <span class="inv-sum-item">{{ specialList.length }} 种 · {{ fmtUnits(specialUnits) }} 件</span>
                  <span class="inv-sum-item is-dim">用途未知，暂不可使用（待开放）</span>
                </div>
              </section>
              <div class="inv-grid">
                <div v-for="item in specialList" :key="item.id" class="inv-card">
                  <div class="inv-main">
                    <div class="inv-head">
                      <span class="inv-name">{{ item.name }}</span>
                      <span class="inv-count">×{{ fmtUnits(item.count) }}</span>
                    </div>
                    <div class="inv-meta">
                      <n-tag size="small" type="info">特殊道具</n-tag>
                      <n-tag size="small" type="warning">待开放</n-tag>
                    </div>
                    <div class="inv-desc">{{ item.description }}</div>
                  </div>
                </div>
              </div>
            </template>
            <n-empty v-else description="开宝匣有机会得到用途未知的特殊道具" />
          </n-tab-pane>
          <n-tab-pane name="herbs" tab="灵草（旧库存）">
            <template v-if="groupedHerbs.length">
              <section class="inv-summary">
                <div class="inv-sum-row">
                  <span class="inv-sum-key">总览</span>
                  <span class="inv-sum-item">{{ herbStats.groups }} 种 · {{ fmtUnits(herbStats.units) }} 株</span>
                  <span v-for="row in herbStats.byQuality" :key="row.key" class="inv-sum-item">
                    {{ row.label }} {{ fmtUnits(row.count) }}
                  </span>
                  <span class="inv-sum-item is-dim">炼丹底材，按品质分堆</span>
                </div>
              </section>
              <div class="inv-grid">
                <div v-for="herb in groupedHerbs" :key="herb.id" class="inv-card">
                  <div class="inv-main">
                    <div class="inv-head">
                      <span class="inv-name">{{ herb.name }}</span>
                      <span class="inv-count">×{{ fmtUnits(herb.count) }}</span>
                    </div>
                    <div class="inv-meta">
                      <n-tag size="small" type="info">灵草</n-tag>
                      <n-tag size="small" type="warning">
                        {{ herbQualities[herb.quality]?.name || '普通' }}
                      </n-tag>
                    </div>
                    <div class="inv-desc">{{ herb.description }}</div>
                  </div>
                </div>
              </div>
            </template>
            <n-empty v-else description="旧库存里的灵草会出现在这里" />
          </n-tab-pane>
          <n-tab-pane name="consumables" tab="丹符阵">
            <template v-if="groupedConsumables.length">
              <section class="inv-summary">
                <div class="inv-sum-row">
                  <span class="inv-sum-key">总览</span>
                  <span class="inv-sum-item">
                    {{ consumableStats.groups }} 种 · {{ fmtUnits(consumableStats.units) }} 件
                  </span>
                  <span class="inv-sum-item is-dim">
                    秘境里自动使用（B11-a3 接入）；同配方同阶可叠加数量
                  </span>
                </div>
              </section>
              <div class="inv-grid">
                <div
                  v-for="item in groupedConsumables"
                  :key="item.id || item.baseId"
                  class="inv-card"
                >
                  <div class="inv-main">
                    <div class="inv-head">
                      <span class="inv-name">{{ item.name }}</span>
                      <span class="inv-count">×{{ fmtUnits(unitsOf(item)) }}</span>
                    </div>
                    <div class="inv-meta">
                      <n-tag size="small" type="info" :bordered="false">
                        {{ item.category }} · {{ item.tier }} 阶
                      </n-tag>
                      <n-tag v-if="item.effectText" size="small" :bordered="false">
                        {{ item.effectText }}
                      </n-tag>
                    </div>
                    <div class="inv-desc">{{ item.desc }}</div>
                  </div>
                  <div class="inv-actions">
                    <n-tag size="tiny" :bordered="false">秘境自动</n-tag>
                  </div>
                </div>
              </div>
            </template>
            <n-empty v-else description="百艺做出来的丹药 / 符箓 / 阵法会出现在这里" />
          </n-tab-pane>
          <n-tab-pane name="pets" tab="灵宠">
            <n-alert
              v-if="playerStore.petCultivationPaused"
              type="warning"
              :bordered="false"
              style="margin-bottom: 12px"
            >
              桂冈修为已满，且被突破门槛挡住 —— 打坐已停止，出战灵宠的同修也随之暂停。
              桂冈突破后会自动继续（不是灵兽系统坏了）。
            </n-alert>
            <section class="inv-summary">
              <div class="inv-sum-row">
                <span class="inv-sum-key">总览</span>
                <span class="inv-sum-item">{{ petStats.total }} 只</span>
                <span v-for="row in petStats.byQuality" :key="row.key" class="inv-sum-item">
                  {{ row.label }} {{ row.count }}
                </span>
                <span class="inv-sum-item" :class="{ 'is-warn': !playerStore.activePet }">
                  {{
                    playerStore.activePet
                      ? `出战：${petDisplayNameOf(playerStore.activePet)}`
                      : '未出战'
                  }}
                </span>
              </div>
              <div class="inv-sum-row">
                <span class="inv-sum-key">筛选</span>
                <n-select
                  v-model:value="selectedRarityToRelease"
                  :options="options"
                  placeholder="选择放生品阶"
                  style="width: 150px"
                />
                <n-button
                  size="small"
                  @click="showBatchReleaseConfirm = true"
                  :disabled="!petStats.total"
                >
                  一键放生
                </n-button>
                <span class="inv-sum-item is-dim">放生不返还已消耗的道具</span>
              </div>
            </section>
            <n-modal v-model:show="showBatchReleaseConfirm" preset="dialog" title="批量放生确认" style="width: 600px">
              <p>
                确定要放生{{
                  selectedRarityToRelease === 'all'
                    ? '所有'
                    : petQualityInfoOf({ quality: selectedRarityToRelease }).name
                }}成色的未出战灵宠吗？此操作不可撤销。
              </p>
              <n-space justify="end" style="margin-top: 16px">
                <n-button size="small" @click="showBatchReleaseConfirm = false">取消</n-button>
                <n-button size="small" type="error" @click="batchReleasePets">确认放生</n-button>
              </n-space>
            </n-modal>
            <n-pagination
              v-if="filteredPets.length > 12"
              v-model:page="currentPage"
              :page-size="pageSize"
              :item-count="filteredPets.length"
              @update:page-size="onPageSizeChange"
              :page-slot="7"
              style="margin-bottom: 12px"
            />
            <div v-if="displayPets.length" class="inv-grid">
              <div v-for="pet in displayPets" :key="pet.id" class="inv-card">
                <div class="inv-main">
                  <div class="inv-head">
                    <!-- B15-b #2：新档带「阶·名字」，老档没有 tier 就只显示名字 -->
                    <span class="inv-name">{{ petDisplayNameOf(pet) }}</span>
                  </div>
                  <div class="inv-meta">
                    <!-- 老档没有阶：不显示空格子，也不硬凑「一阶」 -->
                    <n-tag v-if="petTierNameOf(pet)" size="small" :bordered="false">
                      {{ petTierNameOf(pet) }}
                    </n-tag>
                    <n-tag size="small" :style="{ color: petQualityInfoOf(pet).color }">
                      {{ petQualityInfoOf(pet).name }}
                    </n-tag>
                    <n-tag size="small">同修 Lv.{{ pet.level || 1 }} / {{ petLevelCap(pet) }}</n-tag>
                    <n-tag v-if="petSameSeries(pet)" size="small" type="success">本命同源</n-tag>
                  </div>
                  <div class="inv-desc">{{ pet.description }}</div>
                </div>
                <div class="inv-actions">
                  <n-button size="tiny" type="primary" @click="useItem(pet)">
                    {{ playerStore.activePet?.id === pet.id ? '召回' : '出战' }}
                  </n-button>
                  <n-button size="tiny" @click="showPetDetails(pet)">详情</n-button>
                </div>
              </div>
            </div>
            <n-empty
              v-else
              :description="petStats.total ? '没有符合筛选的灵宠' : '开宝匣有机会得到灵宠'"
            />
          </n-tab-pane>
        </n-tabs>
      </n-card>
    </n-layout-content>
  </n-layout>
  <!-- 灵宠详情弹窗 -->
  <n-modal v-model:show="showPetModal" preset="dialog" title="灵宠详情" style="width: 600px">
    <template v-if="selectedPet">
      <n-descriptions bordered>
        <n-descriptions-item label="名称">{{ selectedPet.name }}</n-descriptions-item>
        <!-- B15-b #2：老档（P43 之前）没有 tier / species，按「无」显示，不猜 -->
        <n-descriptions-item label="阶">
          {{ petTierNameOf(selectedPet) || '—（旧档）' }}
        </n-descriptions-item>
        <n-descriptions-item label="种类">
          {{ petKindOf(selectedPet) || '—（旧档）' }}
        </n-descriptions-item>
        <n-descriptions-item label="成色">
          <n-tag :style="{ color: petQualityInfoOf(selectedPet).color }">
            {{ petQualityInfoOf(selectedPet).name }}
          </n-tag>
        </n-descriptions-item>
        <n-descriptions-item label="同修等级">
          Lv.{{ selectedPet.level || 1 }} / {{ petLevelCap(selectedPet) }}
        </n-descriptions-item>
        <n-descriptions-item label="本级经验">
          {{ Math.floor(selectedPet.xp || 0) }} / {{ petXpNeed(selectedPet) }}
        </n-descriptions-item>
        <n-descriptions-item label="面板来源" :span="2">
          <template v-if="petTierOf(selectedPet)">
            白板(T{{ petTierOf(selectedPet) }}) × 成色 × 境界系数；随同修等级成长
          </template>
          <template v-else>旧档实例沿用保存时的面板，随同修等级成长</template>
        </n-descriptions-item>
      </n-descriptions>
      <n-divider>同修</n-divider>
      <n-alert v-if="playerStore.petCultivationPaused" type="warning" :bordered="false">
        桂冈修为已满，且被突破门槛挡住 —— 打坐已停止，同修也暂停。桂冈突破后会自动继续。
      </n-alert>
      <n-alert type="info" :bordered="false">
        桂冈镇守打坐时，出战的灵兽额外获得 50% 修为经验（不扣桂冈）。
        上限 = 桂冈小境界{{ petSameSeries(selectedPet) ? ' + 1（本命同源）' : '' }}。
      </n-alert>
      <n-divider>灵宠属性</n-divider>
      <n-collapse>
        <n-collapse-item title="展开" name="1">
          <n-divider>基础属性</n-divider>
          <n-descriptions bordered :column="2">
            <n-descriptions-item label="攻击力">{{ petLivePanel(selectedPet).attack }}</n-descriptions-item>
            <n-descriptions-item label="生命值">{{ petLivePanel(selectedPet).health }}</n-descriptions-item>
            <n-descriptions-item label="防御力">{{ petLivePanel(selectedPet).defense }}</n-descriptions-item>
            <n-descriptions-item label="速度">{{ petLivePanel(selectedPet).speed }}</n-descriptions-item>
          </n-descriptions>
          <n-divider>战斗属性</n-divider>
          <n-descriptions bordered :column="3">
            <n-descriptions-item label="暴击率">
              {{ ((selectedPet.combatAttributes?.critRate || 0) * 100).toFixed(1) }}%
            </n-descriptions-item>
            <n-descriptions-item label="连击率">
              {{ ((selectedPet.combatAttributes?.comboRate || 0) * 100).toFixed(1) }}%
            </n-descriptions-item>
            <n-descriptions-item label="反击率">
              {{ ((selectedPet.combatAttributes?.counterRate || 0) * 100).toFixed(1) }}%
            </n-descriptions-item>
            <n-descriptions-item label="眩晕率">
              {{ ((selectedPet.combatAttributes?.stunRate || 0) * 100).toFixed(1) }}%
            </n-descriptions-item>
            <n-descriptions-item label="闪避率">
              {{ ((selectedPet.combatAttributes?.dodgeRate || 0) * 100).toFixed(1) }}%
            </n-descriptions-item>
            <n-descriptions-item label="吸血率">
              {{ ((selectedPet.combatAttributes?.vampireRate || 0) * 100).toFixed(1) }}%
            </n-descriptions-item>
          </n-descriptions>
          <n-divider>战斗抗性</n-divider>
          <n-descriptions bordered :column="3">
            <n-descriptions-item label="抗暴击">
              {{ ((selectedPet.combatAttributes?.critResist || 0) * 100).toFixed(1) }}%
            </n-descriptions-item>
            <n-descriptions-item label="抗连击">
              {{ ((selectedPet.combatAttributes?.comboResist || 0) * 100).toFixed(1) }}%
            </n-descriptions-item>
            <n-descriptions-item label="抗反击">
              {{ ((selectedPet.combatAttributes?.counterResist || 0) * 100).toFixed(1) }}%
            </n-descriptions-item>
            <n-descriptions-item label="抗眩晕">
              {{ ((selectedPet.combatAttributes?.stunResist || 0) * 100).toFixed(1) }}%
            </n-descriptions-item>
            <n-descriptions-item label="抗闪避">
              {{ ((selectedPet.combatAttributes?.dodgeResist || 0) * 100).toFixed(1) }}%
            </n-descriptions-item>
            <n-descriptions-item label="抗吸血">
              {{ ((selectedPet.combatAttributes?.vampireResist || 0) * 100).toFixed(1) }}%
            </n-descriptions-item>
          </n-descriptions>
          <n-divider>特殊属性</n-divider>
          <n-descriptions bordered :column="3">
            <n-descriptions-item label="强化治疗">
              {{ ((selectedPet.combatAttributes?.healBoost || 0) * 100).toFixed(1) }}%
            </n-descriptions-item>
            <n-descriptions-item label="强化爆伤">
              {{ ((selectedPet.combatAttributes?.critDamageBoost || 0) * 100).toFixed(1) }}%
            </n-descriptions-item>
            <n-descriptions-item label="弱化爆伤">
              {{ ((selectedPet.combatAttributes?.critDamageReduce || 0) * 100).toFixed(1) }}%
            </n-descriptions-item>
            <n-descriptions-item label="最终增伤">
              {{ ((selectedPet.combatAttributes?.finalDamageBoost || 0) * 100).toFixed(1) }}%
            </n-descriptions-item>
            <n-descriptions-item label="最终减伤">
              {{ ((selectedPet.combatAttributes?.finalDamageReduce || 0) * 100).toFixed(1) }}%
            </n-descriptions-item>
            <n-descriptions-item label="战斗属性提升">
              {{ ((selectedPet.combatAttributes?.combatBoost || 0) * 100).toFixed(1) }}%
            </n-descriptions-item>
            <n-descriptions-item label="战斗抗性提升">
              {{ ((selectedPet.combatAttributes?.resistanceBoost || 0) * 100).toFixed(1) }}%
            </n-descriptions-item>
          </n-descriptions>
        </n-collapse-item>
      </n-collapse>
      <n-divider>操作</n-divider>
      <n-space vertical>
        <n-space justify="space-between">
          <span>放生灵宠（不会返还已消耗的道具）</span>
          <n-button size="small" type="error" @click="confirmReleasePet(selectedPet)">放生灵宠</n-button>
          <n-modal v-model:show="showReleaseConfirm" preset="dialog" title="灵宠放生" style="width: 600px">
            <template v-if="petToRelease">
              <p>确定要放生 {{ petToRelease.name }} 吗？此操作不可撤销，且不会返还已消耗的道具。</p>
              <n-space justify="end" style="margin-top: 16px">
                <n-button size="small" @click="cancelReleasePet">取消</n-button>
                <n-button size="small" type="error" @click="releasePet">确认放生</n-button>
              </n-space>
            </template>
          </n-modal>
        </n-space>
      </n-space>
    </template>
  </n-modal>
  <!-- 装备列表弹窗 -->
  <n-modal
    v-model:show="showEquipmentModal"
    preset="dialog"
    :title="`${equipmentTypes[selectedEquipmentType]}列表`"
    style="width: 800px"
  >
    <n-space vertical>
      <n-space justify="space-between">
        <n-select v-model:value="selectedQuality" :options="qualityOptions" style="width: 150px" />
        <n-button type="warning" :disabled="equipmentList.length === 0" @click="batchSellEquipments">一键卖出</n-button>
      </n-space>
      <n-pagination
        v-model:page="currentEquipmentPage"
        :page-size="equipmentPageSize"
        :item-count="filteredEquipmentList.length"
        v-if="equipmentList.length > 8"
        @update:page-size="onEquipmentPageSizeChange"
        :page-slot="7"
      />
      <div v-if="equipmentList.length" class="inv-grid">
        <div
          v-for="equipment in equipmentList"
          :key="equipment.id"
          class="inv-card is-clickable"
          @click="showEquipmentDetails(equipment)"
        >
          <div class="inv-main">
            <div class="inv-head">
              <!-- P62：炼器产物是一条带 count 的堆，卡片上要写清「这条有几件」 -->
              <span class="inv-name">{{ equipment.name }}</span>
              <span v-if="unitsOf(equipment) > 1" class="inv-count">×{{ unitsOf(equipment) }}</span>
            </div>
            <div class="inv-meta">
              <n-tag size="small" :style="{ color: equipment.qualityInfo.color }">
                {{ equipment.qualityInfo.name }}
              </n-tag>
              <!-- P53 #3：成色之外要能看到阶位（炼器产物以前连 tier 字段都没有） -->
              <n-tag size="small" type="warning">{{ equipment.tier ?? 1 }} 阶</n-tag>
            </div>
            <div class="inv-desc">
              境界要求：{{ equipment.requiredRealm ? getRealmName(equipment.requiredRealm).name : '无' }}
            </div>
          </div>
          <div class="inv-actions">
            <n-button size="tiny" type="warning" @click.stop="sellEquipment(equipment)">卖出</n-button>
          </div>
        </div>
      </div>
      <n-empty description="没有任何装备" v-else></n-empty>
    </n-space>
  </n-modal>
  <!-- 装备详情弹窗 -->
  <n-modal v-model:show="showEquipmentDetailModal" preset="dialog" :title="selectedEquipment?.name || '装备详情'">
    <n-descriptions bordered>
      <n-descriptions-item label="品质">
        <span :style="{ color: selectedEquipment?.qualityInfo.color }">
          {{ selectedEquipment?.qualityInfo.name }}
        </span>
      </n-descriptions-item>
      <n-descriptions-item label="阶位">{{ selectedEquipment?.tier ?? 1 }} 阶</n-descriptions-item>
      <n-descriptions-item label="类型">
        {{ equipmentTypes[selectedEquipment?.equipSlot || selectedEquipment?.type] || selectedEquipment?.type }}
      </n-descriptions-item>
      <n-descriptions-item label="强化等级">+{{ selectedEquipment?.enhanceLevel || 0 }}</n-descriptions-item>
      <template v-if="selectedEquipment?.stats">
        <n-descriptions-item v-for="(value, stat) in selectedEquipment.stats" :key="stat" :label="getStatName(stat)">
          {{ formatStatValue(stat, value) }}
        </n-descriptions-item>
      </template>
      <n-descriptions-item
        v-if="selectedEquipment?.traits?.length"
        label="词条"
      >
        <n-space vertical :size="2">
          <n-text v-for="(trait, i) in selectedEquipment.traits" :key="i" depth="2">
            {{ trait.word }}（{{ trait.quality }}）：{{ traitText(trait) }}
          </n-text>
        </n-space>
      </n-descriptions-item>
    </n-descriptions>
    <div
      class="stats-comparison"
      v-if="equipmentComparison && selectedEquipment?.id != playerStore.equippedArtifacts[selectedEquipment?.slot]?.id"
    >
      <n-divider>属性对比</n-divider>
      <n-table :bordered="false" :single-line="false">
        <thead>
          <tr>
            <th>属性</th>
            <th>当前装备</th>
            <th>选中装备</th>
            <th>属性变化</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(comparison, stat) in equipmentComparison" :key="stat">
            <td>{{ getStatName(stat) }}</td>
            <td>{{ formatStatValue(stat, comparison.current) }}</td>
            <td>{{ formatStatValue(stat, comparison.selected) }}</td>
            <td>
              <n-gradient-text :type="comparison.isPositive ? 'success' : 'error'">
                {{ comparison.isPositive ? '+' : '' }}{{ formatStatValue(stat, comparison.diff) }}
              </n-gradient-text>
            </td>
          </tr>
        </tbody>
      </n-table>
    </div>
    <template #action>
      <n-space justify="space-between">
        <n-space>
          <n-button
            type="primary"
            @click="showEnhanceConfirm = true"
            :disabled="(selectedEquipment?.enhanceLevel || 0) >= 100"
          >
            强化
          </n-button>
          <!-- P34 封存（2026-10-26）：灵器洗练会抛 TypeError，洗练石只进不出。
               按 P52 B5 只做「置灰 + 未开放」，不动 plugins/equipment.js 的根因。
               disabled 的 n-button 不触发鼠标事件，所以这里不挂 tooltip（要挂得外面包 span）。 -->
          <n-button type="info" disabled>
            洗练（未开放）
          </n-button>
        </n-space>
        <n-space>
          <n-button
            @click="equipItem(selectedEquipment)"
            :disabled="playerStore.level < selectedEquipment?.requiredRealm"
            v-if="selectedEquipment?.id != playerStore.equippedArtifacts[selectedEquipment?.slot]?.id"
          >
            装备
          </n-button>
          <n-button
            @click="unequipItem(selectedEquipment?.slot)"
            :disabled="playerStore.level < selectedEquipment?.requiredRealm"
            v-else
          >
            卸下
          </n-button>
          <n-button
            type="error"
            @click="sellEquipment(selectedEquipment)"
            v-if="selectedEquipment?.id != playerStore.equippedArtifacts[selectedEquipment?.slot]?.id"
          >
            出售
          </n-button>
        </n-space>
      </n-space>
    </template>
  </n-modal>
  <!-- 强化确认弹窗 -->
  <n-modal v-model:show="showEnhanceConfirm" preset="dialog" title="装备强化">
    <n-space vertical>
      <p>是否消耗 {{ ((selectedEquipment?.enhanceLevel || 0) + 1) * 10 }} 强化石强化装备？</p>
      <p>当前强化石数量：{{ playerStore.reinforceStones }}</p>
    </n-space>
    <template #action>
      <n-space justify="end">
        <n-button @click="showEnhanceConfirm = false">取消</n-button>
        <n-button
          type="primary"
          @click="handleEnhanceEquipment"
          :disabled="playerStore.reinforceStones < ((selectedEquipment?.enhanceLevel || 0) + 1) * 10"
        >
          确认强化
        </n-button>
      </n-space>
    </template>
  </n-modal>
  <!-- 洗练确认弹窗 -->
  <n-modal v-model:show="showReforgeConfirm" preset="dialog" title="洗练结果确认">
    <template v-if="reforgeResult">
      <div class="reforge-compare">
        <div class="old-stats">
          <h3>原始属性</h3>
          <div v-for="(value, key) in reforgeResult.oldStats" :key="key">
            {{ getStatName(key) }}: {{ formatStatValue(key, value) }}
          </div>
        </div>
        <div class="new-stats">
          <h3>新属性</h3>
          <div v-for="(value, key) in reforgeResult.newStats" :key="key">
            {{ getStatName(key) }}: {{ formatStatValue(key, value) }}
          </div>
        </div>
      </div>
    </template>
    <template #action>
      <n-button type="primary" @click="confirmReforgeResult(true)">确认新属性</n-button>
      <n-button @click="confirmReforgeResult(false)">保留原属性</n-button>
    </template>
  </n-modal>
  <!-- 开箱结果（2026-10-22 重做：不显示空包、从左往右排开、高品阶有光、可连开） -->
  <n-modal v-model:show="chestResultVisible" preset="card" style="width: 680px">
    <template #header>
      <n-space align="center" :size="10">
        <span>开箱结果</span>
        <n-tag v-if="chestResult?.opened > 1" size="small" type="primary" :bordered="false">
          连开 {{ chestResult.opened }} 个
        </n-tag>
        <!-- P44 #8：秘境高难度的宝匣每箱多 1~2 次拾取，这里标出本批多吃到几次 -->
        <n-tag v-if="chestResult?.bonusPicks" size="small" type="success" :bordered="false">
          难度加成 +{{ chestResult.bonusPicks }} 次拾取
        </n-tag>
      </n-space>
    </template>
    <div class="chest-grid">
      <div
        v-for="(tile, i) in chestTiles"
        :key="tile.key"
        class="chest-tile"
        :class="[`tile-${tile.kind}`, tile.quality ? `q-${tile.quality}` : '']"
        :style="{ animationDelay: `${Math.min(i * 45, 450)}ms` }"
      >
        <span class="tile-name">{{ tile.name }}</span>
        <span v-if="tile.count > 1" class="tile-count">×{{ tile.count }}</span>
        <span v-if="tile.note" class="tile-note">{{ tile.note }}</span>
      </div>
    </div>
    <n-text v-if="chestResult?.opened > 1" depth="3" style="display: block; margin-top: 12px; font-size: 12px">
      已汇总 {{ chestResult.opened }} 个宝匣的掉落；灵石已直接入库。
    </n-text>
  </n-modal>
  <!-- 一键装备结果（P36）：换装明细，旧 → 新 + 评分 -->
  <n-modal
    v-model:show="showAutoEquipResult"
    preset="card"
    style="width: 680px; max-width: calc(100vw - 32px)"
    title="一键装备结果"
  >
    <n-space vertical size="large">
      <n-alert type="success" :bordered="false" :show-icon="true">
        共换上 {{ autoEquipResult?.changed }} 件。
        桂冈 {{ autoEquipResult?.playerCount }} 件 · {{ autoEquipResult?.childCount }} 名子嗣
        {{ autoEquipResult?.offspringCount }} 件。换下的已回背包（不会自动卖）。
      </n-alert>

      <div v-if="autoEquipResult?.player.length">
        <n-text strong>桂冈</n-text>
        <n-list bordered size="small" style="margin-top: 6px">
          <n-list-item v-for="move in autoEquipResult.player" :key="move.slot">
            <n-space justify="space-between" align="center">
              <n-tag size="small" :bordered="false">{{ EQUIP_SLOT_NAME[move.slot] }}</n-tag>
              <n-text depth="3" style="font-size: 12px">
                {{ move.previous ? equipLabel(move.previous, playerEquipScore) : '空' }}
                <span style="margin: 0 4px">→</span>
                <n-text strong>{{ equipLabel(move.item, playerEquipScore) }}</n-text>
              </n-text>
            </n-space>
          </n-list-item>
        </n-list>
      </div>

      <div v-if="autoEquipGroups.length">
        <n-text strong>子嗣（{{ autoEquipGroups.length }} 名）</n-text>
        <n-text depth="3" style="margin-left: 8px; font-size: 12px">
          子嗣只认攻/防/生命/速，暴击闪避类词条不计分
        </n-text>
        <n-scrollbar style="max-height: 320px; margin-top: 6px">
          <n-list bordered size="small">
            <n-list-item v-for="group in autoEquipGroups" :key="group.childId">
              <n-space vertical :size="2">
                <n-text strong>{{ group.childName || group.childId }}</n-text>
                <n-text
                  v-for="move in group.slots"
                  :key="move.slot"
                  depth="3"
                  style="font-size: 12px"
                >
                  {{ OFFSPRING_EQUIP_SLOT_NAME[move.slot] }}：
                  {{ move.previous ? equipLabel(move.previous, offspringEquipScore) : '空' }}
                  <span style="margin: 0 4px">→</span>
                  <n-text>{{ equipLabel(move.item, offspringEquipScore) }}</n-text>
                </n-text>
              </n-space>
            </n-list-item>
          </n-list>
        </n-scrollbar>
      </div>
    </n-space>
  </n-modal>
</template>

<script setup>
  import { usePlayerStore } from '../stores/player'
  import { ref, computed } from 'vue'
  import { useMessage } from 'naive-ui'
  import { getStatName, formatStatValue } from '../plugins/stats'
  import { getRealmName } from '../plugins/realm'
  // 灵草品质键 → 中文（`common / uncommon / rare / epic / legendary`）
  import { herbQualities } from '../plugins/herbs'
  import { SPECIAL_ITEMS } from '../plugins/chest'
  // 百艺成品（B11-a2）：丹药 / 符箓 / 阵法
  import { CONSUMABLE_CATEGORIES, unitsOf } from '../plugins/stacks'
  // 材料页统计的五系口径：直接用炼体药浴那套（回查底材 fateElement），不要另写一份
  import { elementOf } from '../plugins/bath'
  // ⚠ `reforgeEquipment` 暂不引入：P34 封存，洗练入口置灰（解封时连同根因一起修）
  import {
    enhanceEquipment,
    equipQualityKeyOf,
    EQUIP_SLOT_NAME
  } from '../plugins/equipment'
  // P36 一键装备：结果弹窗按各自口径回显评分（子嗣与桂冈不是同一套）
  import { offspringEquipScore, playerEquipScore } from '../plugins/autoEquip'
  import { OFFSPRING_EQUIP_SLOT_NAME } from '../plugins/offspringEquipment'
  // P43：灵兽同修（等级上限 / 本级经验 / 本命同源）
  import {
    petDisplayNameOf,
    petKindOf,
    petLevelCapOf,
    petPanelOf,
    petQualityInfoOf,
    petQualityOf,
    petSameSeriesOf,
    petTierNameOf,
    petTierOf,
    petXpRequirementOf
  } from '../plugins/petUnit'

  // 分页相关
  const currentPage = ref(1)
  const pageSize = ref(12)

  // 过滤后的灵宠列表（P51 #4：按成色筛，不再按旧 rarity 档位）
  const filteredPets = computed(() => {
    const pets = playerStore.items.filter(item => item.type === 'pet')
    if (selectedRarityToRelease.value === 'all') {
      return pets
    }
    return pets.filter(pet => petQualityOf(pet) === selectedRarityToRelease.value)
  })

  // 当前页显示的灵宠
  const displayPets = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value
    const end = start + pageSize.value
    return filteredPets.value.slice(start, end)
  })

  // 页大小改变处理
  const onPageSizeChange = size => {
    pageSize.value = size
    currentPage.value = 1
  }

  const playerStore = usePlayerStore()
  const message = useMessage()

  // 灵宠总览：只统计有货的成色，顺序固定为 极 → 上 → 中 → 下
  const petStats = computed(() => {
    const pets = (playerStore.items || []).filter(item => item.type === 'pet')
    const counts = new Map()
    for (const pet of pets) {
      const key = petQualityOf(pet)
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    const byQuality = ['极', '上', '中', '下']
      .filter(key => counts.has(key))
      .map(key => ({ key, label: petQualityInfoOf({ quality: key }).name, count: counts.get(key) }))
    return { total: pets.length, byQuality }
  })


  // 灵宠详情相关
  const showPetModal = ref(false)
  const selectedPet = ref(null)

  // 放生确认弹窗
  const showReleaseConfirm = ref(false)
  const showBatchReleaseConfirm = ref(false)
  const petToRelease = ref(null)

  // 显示放生确认弹窗
  const confirmReleasePet = pet => {
    petToRelease.value = pet
    showReleaseConfirm.value = true
  }

  // 取消放生
  const cancelReleasePet = () => {
    petToRelease.value = null
    showReleaseConfirm.value = false
  }

  // 执行放生
  const releasePet = () => {
    if (petToRelease.value) {
      // 如果灵宠正在出战，先取消出战
      if (playerStore.activePet?.id === petToRelease.value.id) {
        playerStore.activePet = null
      }
      // 从背包中移除灵宠
      const index = playerStore.items.findIndex(item => item.id === petToRelease.value.id)
      if (index > -1) {
        playerStore.items.splice(index, 1)
        playerStore.saveData()
        message.success('已放生灵宠')
      }
      // 关闭所有相关弹窗
      showReleaseConfirm.value = false
      showPetModal.value = false
      petToRelease.value = null
    }
  }

  // 选中的放生品阶
  const selectedRarityToRelease = ref('all')

  // 批量放生函数
  const batchReleasePets = () => {
    playerStore.items = playerStore.items.filter(
      item =>
        item.type !== 'pet' ||
        item.id === playerStore.activePet?.id ||
        (selectedRarityToRelease.value !== 'all' && petQualityOf(item) !== selectedRarityToRelease.value)
    )
    showBatchReleaseConfirm.value = false
    message.success(
      `已放生${
        selectedRarityToRelease.value === 'all' ? '所有' : petQualityInfoOf({ quality: selectedRarityToRelease.value }).name
      }成色的未出战灵宠`
    )
  }

  // 显示灵宠详情
  const showPetDetails = pet => {
    selectedPet.value = pet
    showPetModal.value = true
  }

  // P43：同修等级上限 / 本级经验需求（与战斗面板同一套纯函数）
  const petLivePanel = pet => petPanelOf(pet)
  const petLevelCap = pet =>
    petLevelCapOf(playerStore.level, petSameSeriesOf(pet, playerStore.playerFateSeries))
  const petXpNeed = pet =>
    (pet?.level || 1) >= petLevelCap(pet) ? '已满' : petXpRequirementOf(pet?.level || 1)
  const petSameSeries = pet => petSameSeriesOf(pet, playerStore.playerFateSeries)

  // 装备槽配置（5 槽，P36 2026-10-23；旧 13 槽已废）
  const equipmentTypes = {
    weapon: '武器',
    body: '防具',
    head: '头饰',
    accessory: '饰品',
    artifact: '法宝'
  }
  const equipmentSlotCount = Object.keys(equipmentTypes).length
  const equippedCount = computed(
    () => Object.values(playerStore.equippedArtifacts || {}).filter(Boolean).length
  )

  /** 词条一句话：`锋锐 → 攻击加成 +2.0%`（词条数值都是百分比） */
  const traitText = trait => {
    const parts = Object.entries(trait?.stats || {}).map(
      ([key, value]) => `${getStatName(key)} +${(Number(value) * 100).toFixed(1)}%`
    )
    return parts.join('，') || '—'
  }

  // 当前选中的装备类型
  const selectedType = ref('')

  // 显示装备类型弹窗
  const showEquipmentList = type => {
    selectedType.value = type
    selectedEquipmentType.value = type
    showEquipmentModal.value = true
  }

  // 卸下装备
  const unequipItem = slot => {
    const result = playerStore.unequipArtifact(slot)
    if (result) {
      showEquipmentDetailModal.value = false
      message.success('当前装备已卸下')
    } else {
      message.error('卸下装备失败')
    }
  }

  /**
   * 一键装备（P36 /《装备系统》§12.1）。
   * 分配逻辑全在 `store.autoEquipAll()` → `plugins/autoEquip.js`；
   * 这里只把换装明细摊开给玩家看（旧件 → 新件 + 评分）。
   */
  const showAutoEquipResult = ref(false)
  const autoEquipResult = ref(null)
  /** 明细按子嗣分组：一个人可能同时换了攻和防两槽 */
  const autoEquipGroups = computed(() => {
    const list = autoEquipResult.value?.offspring || []
    const groups = new Map()
    for (const move of list) {
      if (!groups.has(move.childId)) {
        groups.set(move.childId, { childId: move.childId, childName: move.childName, slots: [] })
      }
      groups.get(move.childId).slots.push(move)
    }
    return [...groups.values()]
  })
  /** 一件装备的展示名 + 评分（两种口径由调用方传进来） */
  const equipLabel = (item, scoreOf) =>
    item ? `${item.displayName || item.name || ''}（${scoreOf(item.stats)} 分）` : '空'

  const handleAutoEquip = () => {
    const result = playerStore.autoEquipAll()
    if (!result.ok) {
      message.error(result.message || '一键装备失败')
      return
    }
    if (!result.changed) {
      message.info('已经是最好的配置了，没有更值得换的装备')
      return
    }
    autoEquipResult.value = result
    showAutoEquipResult.value = true
  }

  // 装备列表相关
  const showEquipmentModal = ref(false)
  const selectedEquipmentType = ref('')
  const selectedQuality = ref('all')
  const currentEquipmentPage = ref(1)
  const equipmentPageSize = ref(8)

  // 装备品质选项
  // ⚠ 宝匣开出的灵器 quality 是中文（下/中/上/极），炼器产物是英文键；
  //   统一走 equipQualityKeyOf 再统计，否则「中品」筛选会漏掉宝匣装备。
  const qualityOptions = computed(() => {
    const equipmentsByQuality = {}
    playerStore.items
      .filter(item => !selectedEquipmentType.value || (item.equipSlot || item.type) === selectedEquipmentType.value)
      .forEach(item => {
        const key = equipQualityKeyOf(item.quality)
        equipmentsByQuality[key] = (equipmentsByQuality[key] || 0) + 1
      })
    return [
      { label: '全部品质', value: 'all' },
      { label: '仙品', value: 'mythic', disabled: !equipmentsByQuality['mythic'] },
      { label: '极品', value: 'legendary', disabled: !equipmentsByQuality['legendary'] },
      { label: '上品', value: 'epic', disabled: !equipmentsByQuality['epic'] },
      { label: '中品', value: 'rare', disabled: !equipmentsByQuality['rare'] },
      { label: '下品', value: 'uncommon', disabled: !equipmentsByQuality['uncommon'] },
      { label: '凡品', value: 'common', disabled: !equipmentsByQuality['common'] }
    ]
  })

  // 过滤后的装备列表
  const filteredEquipmentList = computed(() => {
    let list = playerStore.items.filter(item => {
      if (!selectedEquipmentType.value) return false
      // 宝匣灵器的部位在 equipSlot，旧炼器装备的 type 本身就是部位
      if ((item.equipSlot || item.type) !== selectedEquipmentType.value) return false
      if (selectedQuality.value !== 'all' && equipQualityKeyOf(item.quality) !== selectedQuality.value) return false
      return true
    })
    return list
  })

  // 当前页显示的装备
  const equipmentList = computed(() => {
    const start = (currentEquipmentPage.value - 1) * equipmentPageSize.value
    const end = start + equipmentPageSize.value
    return filteredEquipmentList.value.slice(start, end)
  })

  // 装备页大小改变处理
  const onEquipmentPageSizeChange = size => {
    equipmentPageSize.value = size
    currentEquipmentPage.value = 1
  }

  // 批量卖出装备
  const batchSellEquipments = async () => {
    const result = await playerStore.batchSellEquipments(
      selectedQuality.value === 'all' ? null : selectedQuality.value,
      selectedEquipmentType.value
    )
    if (result.success) {
      message.success(result.message)
    } else {
      message.error(result.message || '批量卖出失败')
    }
  }

  // 卖出单件装备
  const sellEquipment = async equipment => {
    const result = await playerStore.sellEquipment(equipment)
    if (result.success) {
      message.success(result.message)
      showEquipmentDetailModal.value = false
    } else {
      message.error(result.message || '卖出失败')
    }
  }

  // 显示装备详情
  const showEquipmentDetails = equipment => {
    selectedEquipment.value = equipment
    showEquipmentDetailModal.value = true
  }

  // 装备详情相关
  const showEquipmentDetailModal = ref(false)
  const selectedEquipment = ref(null)

  // 强化确认弹窗
  const showEnhanceConfirm = ref(false)

  // 强化装备
  const handleEnhanceEquipment = () => {
    if (!selectedEquipment.value) return
    const result = enhanceEquipment(selectedEquipment.value, playerStore.reinforceStones)
    if (result.success) {
      playerStore.reinforceStones -= result.cost
      selectedEquipment.value.stats = { ...result.newStats }
      selectedEquipment.value.enhanceLevel = result.newLevel
      message.success('强化成功')
      playerStore.saveData()
    } else {
      message.error(result.message || '强化失败')
    }
  }

  // 洗练确认弹窗
  const showReforgeConfirm = ref(false)
  const reforgeResult = ref(null)

  // 洗练装备 —— 入口已置灰（P34 封存），这里留早退保险：
  // 灵器洗练在 `plugins/equipment.js` 里会抛 TypeError（type 是中文、查不到部位表），
  // 洗练石因此只进不出。解封时连同根因一起修（见《下一步》P34）。
  const handleReforgeEquipment = () => {
    if (!selectedEquipment.value) return
    message.warning('洗练暂未开放')
  }

  // 确认洗练结果
  const confirmReforgeResult = confirm => {
    if (!reforgeResult.value) return
    if (confirm) {
      // 用户确认后，应用新属性
      selectedEquipment.value.stats = reforgeResult.value.newStats
      message.success('已确认新属性')
    } else {
      // 用户取消，保留原属性
      message.info('已保留原有属性')
    }
    showReforgeConfirm.value = false
    reforgeResult.value = null
    playerStore.saveData()
  }

  // 使用装备
  const equipItem = equipment => {
    // 宝匣灵器的部位在 equipSlot（type 是中文形态，不能直接当槽位）
    const slot = equipment.equipSlot || equipment.slot || equipment.type
    const result = playerStore.equipArtifact(equipment, slot)
    if (result.success) {
      message.success(result.message)
      showEquipmentModal.value = false
      showEquipmentDetailModal.value = false
    } else {
      message.error(result.message || '装备失败')
    }
  }

  // 探索产出的灵植 / 灵材（物品实例，与装备/丹药/灵宠混存在 items 里）
  const MATERIAL_CATEGORIES = ['灵植', '灵材']
  const groupedMaterials = computed(() => {
    const groups = {}
    for (const item of playerStore.items || []) {
      if (!MATERIAL_CATEGORIES.includes(item.category)) continue
      const key = `${item.baseId || item.name}|${item.quality || ''}`
      if (!groups[key]) {
        groups[key] = {
          key,
          // 品种锁按 baseId（一物一行）：同品种不同成色共用一把锁
          baseId: item.baseId || item.name,
          // 卡片标题用素名：阶与成色已经由下面的标签表达，`displayName` 会把同一信息再写一遍
          name: item.name,
          category: item.category,
          itemType: item.type,
          tier: item.tier,
          quality: item.quality,
          count: 0
        }
      }
      // P57：同键的条目已经是「一条带 count」的堆，数量按件累加（老档未迁移时 count 缺省 1）
      groups[key].count += unitsOf(item)
    }
    const locks = new Set(playerStore.lockedSpecies || [])
    for (const group of Object.values(groups)) group.locked = locks.has(group.baseId)
    return Object.values(groups).sort(
      (a, b) =>
        String(a.category).localeCompare(String(b.category)) ||
        (Number(a.tier) || 0) - (Number(b.tier) || 0) ||
        String(a.name).localeCompare(String(b.name))
    )
  })

  // ---- 材料总览（2026-11-06）----
  // 统计口径：**件数**（`unitsOf`，一条堆可能几十件），不是条目数。
  const MATERIAL_ELEMENTS = [
    { key: 'metal', label: '金' },
    { key: 'wood', label: '木' },
    { key: 'water', label: '水' },
    { key: 'fire', label: '火' },
    { key: 'earth', label: '土' }
  ]
  const fmtUnits = n => (Number(n) || 0).toLocaleString('zh-CN')

  const materialStats = computed(() => {
    const byElement = { metal: 0, wood: 0, water: 0, fire: 0, earth: 0, none: 0 }
    const tierMap = new Map()
    let units = 0
    let lockedGroups = 0
    let lockedUnits = 0
    for (const group of groupedMaterials.value) {
      units += group.count
      tierMap.set(group.tier, (tierMap.get(group.tier) || 0) + group.count)
      // 五系口径唯一真源是 `bath.elementOf`（回查底材的 fateElement），别在这页另写一套
      const element = elementOf({ baseId: group.baseId }) || 'none'
      byElement[element] += group.count
      if (group.locked) {
        lockedGroups += 1
        lockedUnits += group.count
      }
    }
    const byTier = [...tierMap.entries()]
      .sort((a, b) => (Number(a[0]) || 0) - (Number(b[0]) || 0))
      .map(([tier, count]) => ({ tier, count }))
    return { byElement, byTier, units, lockedGroups, lockedUnits, groups: groupedMaterials.value.length }
  })

  /** 品种锁开关（B4b）：锁住 = 药浴不吃、一键回收不卖；与坊市回收页共用同一份 `lockedSpecies` */
  const toggleLock = material => {
    const nowLocked = playerStore.toggleSpeciesLock(material.baseId)
    message.success(nowLocked ? `已锁定「${material.name}」` : `已解锁「${material.name}」`)
  }

  // 宝匣按阶级计数（开箱走 store 的 openChestAt）
  const CHEST_TIER_NAMES = ['一', '二', '三', '四', '五', '六', '七']
  const chestList = computed(() =>
    CHEST_TIER_NAMES.map((name, index) => {
      // P44 #8：秘境高难度的宝匣带开箱 pick 加成（+1 / +2），这里按阶摊开给玩家看
      const bonusMap = playerStore.chestBonus?.[index + 1] || {}
      const bonus = [2, 1]
        .map(level => ({ level, count: Number(bonusMap[level]) || 0 }))
        .filter(row => row.count > 0)
      return {
        tier: index + 1,
        name,
        count: Number(playerStore.chests?.[index + 1]) || 0,
        bonus,
        bonusTotal: bonus.reduce((sum, row) => sum + row.count, 0)
      }
    })
  )
  // 宝匣总览：只统计有货的阶，避免统计条里挂一串 0
  const chestStats = computed(() => {
    const byTier = chestList.value
      .filter(chest => chest.count > 0)
      .map(chest => ({ tier: chest.tier, name: chest.name, count: chest.count }))
    return {
      groups: byTier.length,
      total: byTier.reduce((sum, row) => sum + row.count, 0),
      bonus: chestList.value.reduce((sum, row) => sum + row.bonusTotal, 0),
      byTier
    }
  })

  const chestResult = ref(null)
  const chestResultVisible = ref(false)

  const CHEST_QUALITY_ORDER = { 下: 1, 中: 2, 上: 3, 极: 4 }
  // 成色 → 中文（开箱结果与材料页的「N 阶 · 中品」标签共用）
  const QUALITY_LABEL = { 下: '下品', 中: '中品', 上: '上品', 极: '极品' }
  const KIND_ORDER = { item: 0, special: 1, fragment: 2, currency: 3 }

  /**
   * 开箱结果 → 从左到右的格子。
   *
   * 2026-10-22 用户反馈：原来的竖列表太长、空包也占一行、十连没法看。
   * 现在：没有掉落的 Pick 直接不显示；同名同成色的合并成 `×N`；
   * 排序按成色高→低（《宝箱系统》§七.2）。
   */
  const chestTiles = computed(() => {
    const entries = chestResult.value?.entries || []
    const map = new Map()
    const bump = (key, make) => {
      const tile = map.get(key)
      if (tile) tile.count += 1
      else map.set(key, { key, count: 1, ...make() })
    }

    for (const entry of entries) {
      if (entry.kind === 'item') {
        bump(`item:${entry.baseId}:${entry.quality}`, () => ({
          kind: 'item',
          name: entry.displayName,
          quality: entry.quality,
          note: entry.base?.category || '',
          tierRank: Number(entry.base?.tier) || 0,
          qualityRank: CHEST_QUALITY_ORDER[entry.quality] || 0
        }))
      } else if (entry.kind === 'special') {
        bump(`special:${entry.id}`, () => ({
          kind: 'special',
          name: entry.name,
          note: '特殊道具 · 待开放',
          qualityRank: 0
        }))
      } else if (entry.kind === 'fragment') {
        bump(`fragment:${entry.id}`, () => ({
          kind: 'fragment',
          name: entry.name,
          note: '残页',
          qualityRank: 0
        }))
      } else if (entry.kind === 'currency') {
        const tile = map.get('currency')
        if (tile) tile.amount += Number(entry.amount) || 0
        else {
          map.set('currency', {
            key: 'currency',
            kind: 'currency',
            name: '一阶灵石',
            amount: Number(entry.amount) || 0,
            count: 1,
            note: '',
            qualityRank: 0
          })
        }
      }
    }

    return [...map.values()]
      .map(tile =>
        tile.kind === 'currency'
          ? { ...tile, name: `${tile.amount} 一阶灵石`, count: 1 }
          : tile
      )
      .sort(
        (a, b) =>
          KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
          (b.tierRank || 0) - (a.tierRank || 0) ||
          (b.qualityRank || 0) - (a.qualityRank || 0) ||
          String(a.name).localeCompare(String(b.name))
      )
  })

  const handleOpenChest = (tier, times = 1) => {
    const result = playerStore.openChestAt(tier, times)
    if (!result.ok) {
      message.warning(result.message)
      return
    }
    const box = result.box
    chestResult.value = box
    // 空包不弹窗（用户 2026-10-22：不要显示空包），只给一句提示
    if (!box.entries.length) {
      message.info(box.opened > 1 ? `连开 ${box.opened} 个，都是空的` : '这箱空空如也')
      return
    }
    chestResultVisible.value = true
  }

  // 特殊道具（10 种占位，只显示持有量 > 0 的）
  const specialList = computed(() => {
    const owned = playerStore.specialItems || {}
    return SPECIAL_ITEMS.filter(item => (Number(owned[item.id]) || 0) > 0).map(item => ({
      ...item,
      count: Number(owned[item.id]) || 0
    }))
  })
  const specialUnits = computed(() => specialList.value.reduce((sum, item) => sum + item.count, 0))

  // 计算灵草分组（P57：条目本身已按「id + 品质」合并成堆，数量直接读 count）
  const groupedHerbs = computed(() => {
    const groups = {}
    playerStore.herbs.forEach(herb => {
      const key = `${herb.name}|${herb.quality || ''}`
      if (!groups[key]) {
        groups[key] = {
          ...herb,
          count: unitsOf(herb)
        }
      } else {
        groups[key].count += unitsOf(herb)
      }
    })
    return Object.values(groups)
  })
  // 灵草总览：种类 / 株数 / 品质分布（quality 是 herbQualities 的键，不是物品成色）
  const herbStats = computed(() => {
    const counts = new Map()
    let units = 0
    for (const herb of groupedHerbs.value) {
      units += herb.count
      const key = herb.quality || 'common'
      counts.set(key, (counts.get(key) || 0) + herb.count)
    }
    const byQuality = Object.entries(herbQualities)
      .filter(([key]) => counts.has(key))
      .map(([key, info]) => ({ key, label: info.name, count: counts.get(key) }))
    return { groups: groupedHerbs.value.length, units, byQuality }
  })

  /**
   * 百艺成品分组（B11-a2）：丹药 / 符箓 / 阵法。
   *
   * 它们是**可堆叠条目**（合并键见 `stacks.stackKeyOf`，带阶），所以这里直接列条目、
   * 用 `unitsOf` 报件数。**效果本批不生效** —— 秘境自动消耗是 B11-a3。
   * 旧「丹方」页签（旧炼丹体系）随本批删除，配方图鉴在 `/arts`。
   */
  const groupedConsumables = computed(() =>
    (playerStore.items || [])
      .filter(item => CONSUMABLE_CATEGORIES.includes(item.category))
      .sort(
        (a, b) =>
          String(a.category).localeCompare(String(b.category)) ||
          Number(a.tier) - Number(b.tier) ||
          String(a.name).localeCompare(String(b.name))
      )
  )
  const consumableStats = computed(() => ({
    groups: groupedConsumables.value.length,
    units: groupedConsumables.value.reduce((sum, item) => sum + unitsOf(item), 0)
  }))
  // 使用物品
  const useItem = item => {
    if (item.type === 'pet') {
      const result = playerStore.usePet(item)
      if (result.success) {
        message.success(result.message)
      } else {
        message.error(result.message || '操作失败')
      }
    }
  }

  // 装备属性对比计算
  const equipmentComparison = computed(() => {
    if (!selectedEquipment.value || !selectedEquipmentType.value) return null
    const currentEquipment = playerStore.equippedArtifacts[selectedEquipmentType.value]
    if (!currentEquipment) return null
    const comparison = {}
    const allStats = new Set([...Object.keys(selectedEquipment.value.stats), ...Object.keys(currentEquipment.stats)])
    allStats.forEach(stat => {
      const selectedValue = selectedEquipment.value.stats[stat] || 0
      const currentValue = currentEquipment.stats[stat] || 0
      const diff = selectedValue - currentValue
      comparison[stat] = {
        current: currentValue,
        selected: selectedValue,
        diff: diff,
        isPositive: diff > 0
      }
    })
    return comparison
  })

  /**
   * 放生筛选 = **成色**四档（P51 #4，2026-10-26）。
   * 旧选项（神品/仙品/玄品/灵品/凡品）是上游灵宠抽奖的遗留档位，
   * 与物品池的 下/中/上/极 对不上（`rarity` 只是 quality 的英文投影），已删。
   */
  const options = [
    { label: '全部成色', value: 'all' },
    { label: '极品', value: '极' },
    { label: '上品', value: '上' },
    { label: '中品', value: '中' },
    { label: '下品', value: '下' }
  ]
</script>

<style scoped>
  .n-card {
    cursor: pointer;
  }

  .reforge-compare {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    margin: 16px 0;
  }

  .old-stats,
  .new-stats {
    flex: 1;
    padding: 16px;
    border-radius: 8px;
    background-color: rgba(0, 0, 0, 0.05);
  }

  .old-stats h3,
  .new-stats h3 {
    margin-top: 0;
    margin-bottom: 12px;
    font-size: 16px;
    color: #666;
  }

  /* ---------- 开箱结果（2026-10-22） ---------- */
  .chest-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
  }

  .chest-tile {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 74px;
    padding: 10px 12px;
    border-radius: 10px;
    border-left: 4px solid rgba(128, 128, 128, 0.35);
    background: rgba(128, 128, 128, 0.07);
    animation: chest-pop 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
  }

  .tile-name {
    font-size: 13px;
    font-weight: 600;
    line-height: 1.45;
    word-break: break-all;
  }

  .tile-note {
    font-size: 11px;
    opacity: 0.65;
  }

  .tile-count {
    position: absolute;
    top: 8px;
    right: 10px;
    font-size: 12px;
    font-weight: 700;
    opacity: 0.85;
  }

  /* 成色：下 / 中 / 上 / 极，越高越亮；极品加一圈呼吸光 */
  .chest-tile.q-下 {
    border-left-color: #9e9e9e;
  }

  .chest-tile.q-中 {
    border-left-color: #2196f3;
    background: rgba(33, 150, 243, 0.1);
  }

  .chest-tile.q-上 {
    border-left-color: #9c27b0;
    background: rgba(156, 39, 176, 0.12);
  }

  .chest-tile.q-极 {
    border-left-color: #ff9800;
    background: rgba(255, 152, 0, 0.16);
    box-shadow: 0 0 0 1px rgba(255, 152, 0, 0.45), 0 0 18px rgba(255, 152, 0, 0.35);
    animation: chest-pop 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.2) both,
      chest-glow 1.8s ease-in-out 0.4s infinite;
  }

  .chest-tile.tile-currency {
    border-left-color: #18a058;
    background: rgba(24, 160, 88, 0.1);
  }

  .chest-tile.tile-special {
    border-left-color: #d48806;
    background: rgba(212, 136, 6, 0.1);
  }

  .chest-tile.tile-fragment {
    border-left-color: #7b61ff;
    background: rgba(123, 97, 255, 0.1);
  }

  @keyframes chest-pop {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.94);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes chest-glow {
    0%,
    100% {
      box-shadow: 0 0 0 1px rgba(255, 152, 0, 0.45), 0 0 10px rgba(255, 152, 0, 0.25);
    }
    50% {
      box-shadow: 0 0 0 1px rgba(255, 152, 0, 0.7), 0 0 22px rgba(255, 152, 0, 0.5);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .chest-tile {
      animation: none;
    }
  }

  /* ---------- 背包各页统一卡片（2026-11-06 材料页起，2026-11-07 推广到全部页签） ----------
     色值一律走 tokens.css 的 --ui-*（UI 视觉规范 V1.2 §一）。
     结构：总览条（inv-summary）+ 自适应卡片网格（inv-grid）。
     卡片左边信息、右边操作；描述类内容放 inv-desc，不另开第二种卡片样式。 */
  .inv-summary {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
    padding: 12px 16px;
    border: 1px solid var(--ui-line);
    border-radius: var(--ui-radius);
    background: var(--ui-surface);
  }

  .inv-sum-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 18px;
    font-size: 13px;
    color: var(--ui-ink);
  }

  .inv-sum-key {
    min-width: 36px;
    color: var(--ui-ink-sub);
    letter-spacing: 1px;
  }

  .inv-sum-item {
    white-space: nowrap;
  }

  .inv-sum-item.is-dim {
    color: var(--ui-ink-fade);
  }

  .inv-sum-item.is-warn {
    color: var(--ui-cinnabar);
  }

  .inv-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
    gap: 10px;
  }

  .inv-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid var(--ui-line);
    border-radius: 10px;
    background: var(--ui-surface);
  }

  .inv-card.is-clickable {
    cursor: pointer;
  }

  .inv-card.is-clickable:hover {
    border-color: var(--ui-line-strong);
  }

  /* 空仓（0 件的宝匣阶）：保留位置，但压暗，避免误以为「没有这一阶」 */
  .inv-card.is-empty {
    opacity: 0.55;
    background: var(--ui-paper);
  }

  /* 锁定品种：虚线框 + 变暗，和按钮文字一起表达锁态 */
  .inv-card.is-locked {
    border-style: dashed;
    border-color: var(--ui-line-strong);
    background: var(--ui-paper);
  }

  .inv-card.is-locked .inv-name,
  .inv-card.is-locked .inv-count {
    color: var(--ui-ink-sub);
  }

  .inv-main {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    flex: 1;
  }

  .inv-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .inv-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--ui-ink);
  }

  .inv-count {
    font-size: 12px;
    color: var(--ui-ink-sub);
  }

  .inv-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }

  .inv-desc {
    font-size: 12px;
    color: var(--ui-ink-sub);
    line-height: 1.5;
    word-break: break-word;
  }

  .inv-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
  }
</style>
