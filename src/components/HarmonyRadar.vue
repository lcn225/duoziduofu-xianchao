<template>
  <div class="harmony-radar">
    <svg :viewBox="`0 0 ${SIZE} ${SIZE}`" role="img" aria-label="四维契合度雷达图">
      <!-- 网格圈 -->
      <polygon v-for="ring in RINGS" :key="ring" :points="ringPoints(ring)" class="grid" />

      <!-- 轴线 -->
      <line
        v-for="(dim, i) in dims"
        :key="`axis-${dim.key}`"
        :x1="CENTER"
        :y1="CENTER"
        :x2="point(i, 1).x"
        :y2="point(i, 1).y"
        class="axis"
      />

      <!-- 下一门槛的参考圈：四个轴上各点一个，提示「每一维都要往这个圈靠」 -->
      <circle
        v-for="(dim, i) in dims"
        v-show="gate > 0"
        :key="`gate-${dim.key}`"
        :cx="point(i, gate).x"
        :cy="point(i, gate).y"
        r="3.5"
        class="gate"
      />

      <!-- 数据多边形 -->
      <polygon :points="dataPoints" class="data" />

      <!-- 顶点 -->
      <circle
        v-for="(dim, i) in dims"
        :key="`dot-${dim.key}`"
        :cx="point(i, clamp(dim.value)).x"
        :cy="point(i, clamp(dim.value)).y"
        r="2.5"
        class="vertex"
      />

      <!-- 轴标签：名称 + 百分比，两行 -->
      <text
        v-for="(dim, i) in dims"
        :key="`label-${dim.key}`"
        :x="labelPoint(i).x"
        :y="labelPoint(i).y"
        :text-anchor="anchorOf(i)"
        class="label"
      >
        <tspan :x="labelPoint(i).x">{{ dim.name }}</tspan>
        <tspan :x="labelPoint(i).x" dy="13" class="label-value">{{ percent(dim.value) }}</tspan>
      </text>
    </svg>
  </div>
</template>

<script setup>
  import { computed } from 'vue'

  const props = defineProps({
    /** [{ key, name, value }]，value ∈ [0,1]，按顺时针顺序 */
    dims: { type: Array, required: true },
    /** 下一门槛的契合度要求（0 表示当前不是门槛节点） */
    gate: { type: Number, default: 0 }
  })

  const SIZE = 300
  const CENTER = SIZE / 2
  const RADIUS = 80
  const RINGS = [0.25, 0.5, 0.75, 1]

  const clamp = v => Math.min(1, Math.max(0, Number(v) || 0))
  const percent = v => `${((Number(v) || 0) * 100).toFixed(0)}%`

  // 从正上方起顺时针：上 / 右 / 下 / 左
  const angleOf = i => -Math.PI / 2 + i * (Math.PI / 2)

  const point = (i, value) => ({
    x: (CENTER + RADIUS * clamp(value) * Math.cos(angleOf(i))).toFixed(1),
    y: (CENTER + RADIUS * clamp(value) * Math.sin(angleOf(i))).toFixed(1)
  })

  const ringPoints = value => props.dims.map((_, i) => `${point(i, value).x},${point(i, value).y}`).join(' ')

  const dataPoints = computed(() =>
    props.dims.map((dim, i) => `${point(i, dim.value).x},${point(i, dim.value).y}`).join(' ')
  )

  // 标签落在轴外侧
  const labelPoint = i => {
    const a = angleOf(i)
    return {
      x: (CENTER + (RADIUS + 20) * Math.cos(a)).toFixed(1),
      y: (CENTER + (RADIUS + 16) * Math.sin(a)).toFixed(1)
    }
  }

  // 左右两侧的标签分别左对齐 / 右对齐，避免溢出画布
  const anchorOf = i => ['middle', 'start', 'middle', 'end'][i] || 'middle'
</script>

<style scoped>
  .harmony-radar {
    width: 100%;
    max-width: 300px;
    margin: 0 auto;
  }

  svg {
    width: 100%;
    height: auto;
    /* 跟随主题前景色，不写死深色 */
    color: var(--n-text-color, #333);
  }

  .grid {
    fill: none;
    stroke: currentColor;
    stroke-opacity: 0.15;
    stroke-width: 1;
  }

  .axis {
    stroke: currentColor;
    stroke-opacity: 0.2;
    stroke-width: 1;
  }

  .data {
    fill: #2080f0;
    fill-opacity: 0.25;
    stroke: #2080f0;
    stroke-width: 2;
    stroke-linejoin: round;
  }

  .vertex {
    fill: #2080f0;
  }

  .gate {
    fill: #f0a020;
    stroke: currentColor;
    stroke-opacity: 0.4;
    stroke-width: 1;
  }

  .label {
    font-size: 12px;
    fill: currentColor;
  }

  .label-value {
    font-size: 11px;
    fill: currentColor;
    opacity: 0.7;
  }
</style>
