<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  progress: number  // 0-100
  size?: number
  strokeWidth?: number
  trackColor?: string
  progressColor?: string
}>(), {
  size: 24,
  strokeWidth: 3,
  trackColor: 'rgba(255, 255, 255, 0.2)',
  progressColor: '#5865f2',
})

const radius = computed(() => (props.size - props.strokeWidth) / 2)
const circumference = computed(() => 2 * Math.PI * radius.value)
const strokeDashoffset = computed(() => {
  const clampedProgress = Math.max(0, Math.min(100, props.progress))
  return circumference.value - (clampedProgress / 100) * circumference.value
})
const center = computed(() => props.size / 2)
</script>

<template>
  <svg
    class="circular-progress"
    :width="size"
    :height="size"
    :viewBox="`0 0 ${size} ${size}`"
  >
    <!-- Background track -->
    <circle
      class="track"
      :cx="center"
      :cy="center"
      :r="radius"
      :stroke="trackColor"
      :stroke-width="strokeWidth"
      fill="none"
    />
    <!-- Progress arc -->
    <circle
      class="progress"
      :cx="center"
      :cy="center"
      :r="radius"
      :stroke="progressColor"
      :stroke-width="strokeWidth"
      :stroke-dasharray="circumference"
      :stroke-dashoffset="strokeDashoffset"
      fill="none"
      stroke-linecap="round"
    />
  </svg>
</template>

<style scoped>
.circular-progress {
  transform: rotate(-90deg);
}

.progress {
  transition: stroke-dashoffset 0.2s ease;
}
</style>
