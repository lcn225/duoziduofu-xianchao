<template>
  <div
    class="explore-scene"
    :class="{ paused: pausedEffective, checker, reduced }"
    :style="styleVars"
    aria-hidden="true"
  >
    <!-- 远景：首尾不相接（色差 193），靠「正图 + 镜像图」交替消接缝 -->
    <div class="track far">
      <img
        v-for="i in 4"
        :key="`far-${i}`"
        :src="assets.far"
        :class="{ flip: farMirror && i % 2 === 0 }"
        alt=""
        draggable="false"
      />
    </div>

    <!-- 近景：底部 15% 有内容（地平线 + 松树），首尾基本相接，正常重复 -->
    <div class="track near">
      <img v-for="i in 4" :key="`near-${i}`" :src="assets.near" alt="" draggable="false" />
    </div>

    <!-- 人物：原地走。必须是带真 alpha 的 webm（黑底 + screen 混合在 Chrome 里不生效） -->
    <div class="hero-wrap" :class="{ flip: heroFlip }">
      <video
        ref="heroEl"
        :src="assets.walkAlpha"
        class="hero"
        autoplay
        loop
        muted
        playsinline
        preload="auto"
        disablepictureinpicture
        disableremoteplayback
      />
      <div class="hero-shadow" />
    </div>
  </div>
</template>

<script setup>
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import assets, { FAR_RATIO, NEAR_RATIO } from '../assets/anim/explore/manifest.js'

  /**
   * 探索场景（P28.2 横版卷轴）—— 纯展示，不读 store、不调度结算。
   * 结算节奏永远归 gameClock；这里只有「背景滚 + 人物走」的表现层。
   *
   * ⚠ 设计口径（《探索系统》§9.2）：
   * - 常态背景左移；事件时停背景，留给下一轮的状态机。
   * - 切页随组件销毁自然停；后台 visibilitychange 暂停、回来重置，**不补播**。
   */
  const props = defineProps({
    /** 场景高度 px */
    sceneHeight: { type: Number, default: 260 },
    /** 远景速度 px/s（慢） */
    farSpeed: { type: Number, default: 18 },
    /** 近景速度 px/s（快） */
    nearSpeed: { type: Number, default: 60 },
    /** 远景在场景高度上的放大倍数 */
    farScale: { type: Number, default: 1 },
    /** 近景在场景高度上的放大倍数（>1 让树更近、重复感更弱） */
    nearScale: { type: Number, default: 1.3 },
    /** 人物显示高度 px（视频按 16:9 自适应宽） */
    heroHeight: { type: Number, default: 110 },
    /** 人物横向位置（相对场景宽度的百分比） */
    heroX: { type: Number, default: 46 },
    /** 脚底离场景底边的高度（占场景高度百分比） */
    heroGround: { type: Number, default: 13 },
    /** 人物是否水平翻转（素材默认朝右，朝右才对） */
    heroFlip: { type: Boolean, default: false },
    /** 远景是否镜像拼接（far.png 已裁掉左边缘白边，默认直接拼即可） */
    farMirror: { type: Boolean, default: false },
    /** 外部暂停（事件触发时停背景用；本轮测试页手动开关） */
    paused: { type: Boolean, default: false },
    /** 调试：隐藏背景铺棋盘格，用来看人物到底透不透明 */
    checker: { type: Boolean, default: false }
  })

  // 人物素材里脚底在 93.4% 高度处，脚下还留 6.6% —— 对齐地面时要把这段扣掉
  const FOOT_GAP = 0.066

  const heroEl = ref(null)
  const hidden = ref(false)
  const reduced = ref(false)

  const pausedEffective = computed(() => props.paused || hidden.value || reduced.value)

  const styleVars = computed(() => {
    const h = props.sceneHeight
    // 轨道一次循环走 2 个图块：时长 = 2 × 显示宽 / 速度
    const farDur = (2 * FAR_RATIO * h * props.farScale) / Math.max(1, props.farSpeed)
    const nearDur = (2 * NEAR_RATIO * h * props.nearScale) / Math.max(1, props.nearSpeed)
    return {
      '--scene-h': `${h}px`,
      '--far-dur': `${farDur.toFixed(2)}s`,
      '--near-dur': `${nearDur.toFixed(2)}s`,
      '--far-scale': String(props.farScale),
      '--near-scale': String(props.nearScale),
      '--hero-h': `${props.heroHeight}px`,
      '--hero-x': `${props.heroX}%`,
      '--hero-bottom': `calc(${props.heroGround}% - ${(props.heroHeight * FOOT_GAP).toFixed(2)}px)`
    }
  })

  const applyPlayState = () => {
    const v = heroEl.value
    if (!v) return
    if (pausedEffective.value) {
      v.pause()
    } else {
      // 自动播放被策略拦掉时静默失败即可，不弹窗
      v.play().catch(() => {})
    }
  }
  watch(pausedEffective, applyPlayState)

  const onVisibility = () => {
    hidden.value = document.hidden
  }

  let mq = null
  const onMotionChange = e => {
    reduced.value = e.matches
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibility)
    hidden.value = document.hidden
    if (window.matchMedia) {
      mq = window.matchMedia('(prefers-reduced-motion: reduce)')
      reduced.value = mq.matches
      mq.addEventListener?.('change', onMotionChange)
    }
    applyPlayState()
  })

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibility)
    mq?.removeEventListener?.('change', onMotionChange)
    // 摘 src 让 Chrome 立刻放开解码器（只 pause 有时会吊住）
    const v = heroEl.value
    if (v) {
      v.pause()
      v.removeAttribute('src')
      v.load()
    }
  })
</script>

<style scoped>
  .explore-scene {
    position: relative;
    isolation: isolate; /* 把 screen 混合关在场景里，别和页面底色混 */
    height: var(--scene-h);
    overflow: hidden;
    border-radius: 8px;
    background: #1a2433;
  }

  /* 调试棋盘格：背景藏起来，人物底下直接是黑白格 —— 黑底一眼就看出来 */
  .explore-scene.checker {
    background:
      repeating-conic-gradient(#b9b9b9 0 25%, #e9e9e9 0 50%) 0 0 / 16px 16px;
  }
  .explore-scene.checker .track {
    visibility: hidden;
  }

  /* 轨道：4 张图 = 2 个循环单元，位移 -50% 后画面与起点完全重合 */
  .track {
    position: absolute;
    left: 0;
    bottom: 0;
    width: max-content;
    display: flex;
    will-change: transform;
    animation: scene-scroll linear infinite;
  }
  .track.far {
    height: calc(var(--scene-h) * var(--far-scale));
    animation-duration: var(--far-dur);
  }
  .track.near {
    height: calc(var(--scene-h) * var(--near-scale));
    animation-duration: var(--near-dur);
  }
  .track img {
    display: block;
    flex: none;
    height: 100%;
    width: auto;
    /* 不写 image-rendering: pixelated：远景要缩到 1/4 左右，最近邻会出摩尔纹 */
    user-select: none;
  }
  .track img.flip {
    transform: scaleX(-1);
  }

  @keyframes scene-scroll {
    to {
      transform: translateX(-50%);
    }
  }

  .explore-scene.paused .track {
    animation-play-state: paused;
  }
  .explore-scene.reduced .track {
    animation: none;
  }

  .hero-wrap {
    position: absolute;
    left: var(--hero-x);
    bottom: var(--hero-bottom);
    transform: translateX(-50%);
  }
  .hero {
    display: block;
    height: var(--hero-h);
    width: auto;
  }
  .hero-wrap.flip .hero {
    transform: scaleX(-1);
  }

  .hero-shadow {
    position: absolute;
    left: 50%;
    bottom: 0;
    width: 58%;
    height: 12%;
    transform: translate(-50%, 50%);
    border-radius: 50%;
    background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.45), transparent 70%);
    pointer-events: none;
  }
</style>
