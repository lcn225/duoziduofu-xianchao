<template>
  <n-layout>
    <n-layout-header bordered>
      <n-page-header>
        <template #title>探索动画测试</template>
        <template #subtitle>
          <n-space align="center" :size="8">
            <n-tag size="small" type="warning">开发期临时页</n-tag>
            <n-text depth="3">P28.2 横版卷轴 / 长岭乡 · 地址 #/animtest</n-text>
          </n-space>
        </template>
      </n-page-header>
    </n-layout-header>

    <n-layout-content>
      <div class="test-wrap">
        <n-card title="场景" :bordered="false">
          <div class="stage">
            <ExploreScene
              :scene-height="sceneHeight"
              :far-speed="farSpeed"
              :near-speed="nearSpeed"
              :far-scale="farScale"
              :near-scale="nearScale"
              :hero-height="heroHeight"
              :hero-x="heroX"
              :hero-ground="heroGround"
              :hero-flip="heroFlip"
              :far-mirror="farMirror"
              :paused="paused"
              :checker="checker"
            />
          </div>
          <template #footer>
            <n-text depth="3" class="hint">
              远景（裁掉左边缘白边，直接拼接）→ 近景（树 + 地面，更快）→ 人物（真 alpha，原地走）。
              滑杆的值会存到浏览器本地，刷新不丢。
            </n-text>
          </template>
        </n-card>

        <n-card title="调试面板" :bordered="false">
          <n-grid :cols="controlCols" :x-gap="20" :y-gap="16">
            <n-grid-item>
              <div class="field">
                <span class="label">远景速度 <b>{{ farSpeed }}</b> px/s</span>
                <n-slider v-model:value="farSpeed" :min="2" :max="60" :step="1" />
              </div>
            </n-grid-item>

            <n-grid-item>
              <div class="field">
                <span class="label">近景速度 <b>{{ nearSpeed }}</b> px/s</span>
                <n-slider v-model:value="nearSpeed" :min="10" :max="180" :step="2" />
              </div>
            </n-grid-item>

            <n-grid-item>
              <div class="field">
                <span class="label">场景高度 <b>{{ sceneHeight }}</b> px</span>
                <n-slider v-model:value="sceneHeight" :min="180" :max="420" :step="10" />
              </div>
            </n-grid-item>

            <n-grid-item>
              <div class="field">
                <span class="label">人物高度 <b>{{ heroHeight }}</b> px</span>
                <n-slider v-model:value="heroHeight" :min="60" :max="220" :step="2" />
              </div>
            </n-grid-item>

            <n-grid-item>
              <div class="field">
                <span class="label">脚底离地 <b>{{ heroGround }}</b> %（场景高）</span>
                <n-slider v-model:value="heroGround" :min="4" :max="30" :step="1" />
              </div>
            </n-grid-item>

            <n-grid-item>
              <div class="field">
                <span class="label">人物横向 <b>{{ heroX }}</b> %（场景宽）</span>
                <n-slider v-model:value="heroX" :min="20" :max="80" :step="1" />
              </div>
            </n-grid-item>

            <n-grid-item>
              <div class="field">
                <span class="label">远景放大 <b>{{ farScale.toFixed(2) }}</b> ×</span>
                <n-slider v-model:value="farScale" :min="0.8" :max="1.6" :step="0.02" />
              </div>
            </n-grid-item>

            <n-grid-item>
              <div class="field">
                <span class="label">近景放大 <b>{{ nearScale.toFixed(2) }}</b> ×</span>
                <n-slider v-model:value="nearScale" :min="1" :max="2.2" :step="0.02" />
              </div>
            </n-grid-item>

            <n-grid-item>
              <div class="field toggles">
                <span class="label">开关</span>
                <n-space :size="16">
                  <n-checkbox v-model:checked="paused">暂停背景</n-checkbox>
                  <n-checkbox v-model:checked="checker">棋盘格（验 alpha）</n-checkbox>
                  <n-checkbox v-model:checked="farMirror">远景镜像拼接</n-checkbox>
                  <n-checkbox v-model:checked="heroFlip">人物左右翻转</n-checkbox>
                </n-space>
              </div>
            </n-grid-item>
          </n-grid>

          <n-alert v-if="checker" type="info" class="tip">
            棋盘格模式下背景被藏起来了。人物周围如果是一整块黑色方块 → 没有真透明；
            只有人物轮廓、能看到黑白格 → alpha 正常。
          </n-alert>
        </n-card>
      </div>
    </n-layout-content>
  </n-layout>
</template>

<script setup>
  import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
  import { useRoute } from 'vue-router'
  import ExploreScene from '../components/ExploreScene.vue'

  /**
   * 开发期调参页（P28.2）。刻意不接到导航里，路由也只在 DEV 注册。
   * 支持 URL 参数，让 shot.mjs 能截到确定的形态（无头浏览器不能点按）：
   *   #/animtest?scene=260&hero=110&ground=13&far=18&near=60&x=46&checker=1
   */
  const STORE_KEY = 'animtest:v1'
  const DEFAULTS = {
    far: 18,
    near: 60,
    scene: 260,
    hero: 110,
    ground: 13,
    x: 46,
    farScale: 1,
    nearScale: 1.3,
    paused: false,
    checker: false,
    farMirror: false,
    heroFlip: false
  }

  const q = useRoute().query
  let saved = {}
  try {
    saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}
  } catch {
    saved = {}
  }
  // 优先级：URL 参数 > 本地存的值 > 默认值
  const pick = (key, queryKey = key) => {
    const fromQuery = q[queryKey]
    if (fromQuery !== undefined && fromQuery !== '' && !Number.isNaN(Number(fromQuery))) {
      return Number(fromQuery)
    }
    return saved[key] ?? DEFAULTS[key]
  }
  const pickFlag = (key, queryKey = key) => {
    if (q[queryKey] !== undefined) return q[queryKey] === '1'
    return Boolean(saved[key] ?? DEFAULTS[key])
  }

  const farSpeed = ref(pick('far'))
  const nearSpeed = ref(pick('near'))
  const sceneHeight = ref(pick('scene'))
  const heroHeight = ref(pick('hero'))
  const heroGround = ref(pick('ground'))
  const heroX = ref(pick('x'))
  const farScale = ref(pick('farScale'))
  const nearScale = ref(pick('nearScale'))
  const paused = ref(pickFlag('paused'))
  const checker = ref(pickFlag('checker'))
  const farMirror = ref(pickFlag('farMirror'))
  const heroFlip = ref(pickFlag('heroFlip'))

  // 调完刷页不丢：滑杆值回写本地
  const persist = () => {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({
          far: farSpeed.value,
          near: nearSpeed.value,
          scene: sceneHeight.value,
          hero: heroHeight.value,
          ground: heroGround.value,
          x: heroX.value,
          farScale: farScale.value,
          nearScale: nearScale.value,
          paused: paused.value,
          checker: checker.value,
          farMirror: farMirror.value,
          heroFlip: heroFlip.value
        })
      )
    } catch {
      /* 隐私模式写不进去就算了，不影响调参 */
    }
  }
  watch(
    [farSpeed, nearSpeed, sceneHeight, heroHeight, heroGround, heroX, farScale, nearScale, paused, checker, farMirror, heroFlip],
    persist
  )

  // 跟探索页一样按窗口宽切列数
  const winWidth = ref(window.innerWidth)
  const onResize = () => (winWidth.value = window.innerWidth)
  onMounted(() => window.addEventListener('resize', onResize))
  onBeforeUnmount(() => window.removeEventListener('resize', onResize))
  const controlCols = computed(() => (winWidth.value < 720 ? 1 : 2))
</script>

<style scoped>
  .test-wrap {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 1100px;
    margin: 0 auto;
    padding: 12px;
  }
  .stage {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .field .label {
    font-size: 13px;
    opacity: 0.85;
  }
  .toggles {
    justify-content: space-between;
  }
  .hint {
    font-size: 12px;
  }
  .tip {
    margin-top: 12px;
  }
</style>
