<template>
  <div class="day-animation" :class="{ dim }" :style="{ height: `${height}px` }">
    <img
      v-if="asset && !posterBroken"
      :src="src"
      :alt="label"
      class="anim"
      decoding="async"
      draggable="false"
      @error="onError"
    />
    <div v-else class="fallback">{{ label }}</div>
    <div v-if="asset" class="caption">{{ label }}</div>
  </div>
</template>

<script setup>
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
  import manifest from '../assets/anim/manifest.js'

  const props = defineProps({
    /** dayTaskView.kind：patrol / practice / body / forge / sleep / idle / evening */
    kind: { type: String, default: 'idle' },
    /** 固定高度；宽度按素材比例自适应（巡视是 398×300） */
    height: { type: Number, default: 300 }
  })

  /**
   * 任务 kind → 动画文件。
   * 未来新增动画：把 SS 丢进素材目录、跑 scripts/import-anims.py，
   * 然后在 manifest 里出现同名 kind；这里加一行映射即可。
   */
  const KIND_MAP = {
    patrol: 'patrol',
    practice: 'practice',
    body: 'practice',
    forge: 'forge',
    sleep: 'sleep',
    idle: 'practice',
    evening: 'practice'
  }

  const LABELS = {
    patrol: '巡视乡间',
    practice: '练功',
    body: '炼体',
    forge: '炼器',
    sleep: '睡觉',
    idle: '候工',
    evening: '妻妾互动'
  }

  const asset = computed(() => manifest[KIND_MAP[props.kind]] || manifest.practice || null)
  const label = computed(() => LABELS[props.kind] || '桂冈')

  /** idle/evening 没有专属素材：用练功海报压暗；sleep 已有真动画 */
  const dim = computed(() => props.kind === 'idle' || props.kind === 'evening')

  /** 尊重系统「减少动态效果」；加载失败时退到海报 */
  const reduced = ref(false)
  const animationBroken = ref(false)
  const posterBroken = ref(false)
  let mq = null
  const onMotionChange = e => {
    reduced.value = e.matches
  }
  onMounted(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    reduced.value = mq.matches
    mq.addEventListener?.('change', onMotionChange)
  })
  onBeforeUnmount(() => mq?.removeEventListener?.('change', onMotionChange))

  const usePoster = computed(() => reduced.value || dim.value || animationBroken.value)
  const src = computed(() => {
    const a = asset.value
    if (!a) return ''
    return usePoster.value ? a.poster : a.webp
  })

  const onError = () => {
    if (!usePoster.value) animationBroken.value = true
    else posterBroken.value = true
  }
</script>

<style scoped>
  .day-animation {
    position: relative;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    width: 100%;
    max-width: 400px;
    margin: 0 auto;
    border-radius: 12px;
    background: radial-gradient(circle at 50% 68%, rgba(32, 128, 240, 0.12), transparent 68%);
    overflow: hidden;
  }

  .anim {
    display: block;
    width: auto;
    height: auto;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 10px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
    user-select: none;
  }

  .dim .anim {
    opacity: 0.5;
    filter: saturate(0.65);
  }

  .fallback {
    align-self: center;
    color: var(--n-text-color-3);
    font-size: 13px;
  }

  .caption {
    position: absolute;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    padding: 1px 10px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.38);
    color: rgba(255, 255, 255, 0.82);
    font-size: 12px;
    line-height: 1.6;
    white-space: nowrap;
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .dim .anim {
      opacity: 0.6;
    }
  }
</style>
