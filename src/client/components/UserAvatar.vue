<script setup lang="ts">
import { computed } from 'vue'
import type { DiscordUser } from '../types'
import CircularProgress from './CircularProgress.vue'

const props = withDefaults(defineProps<{
  user: DiscordUser
  size?: number
  syncProgress?: number
}>(), {
  size: 28,
  syncProgress: 100,
})

const displayName = computed(() => props.user.global_name || props.user.username)

const avatarUrl = computed(() => {
  if (!props.user.avatar) return null
  return `https://cdn.discordapp.com/avatars/${props.user.id}/${props.user.avatar}.png?size=64`
})

const initial = computed(() => displayName.value.charAt(0).toUpperCase())

const isSyncing = computed(() => props.syncProgress < 100)

const tooltipText = computed(() => {
  if (isSyncing.value) {
    return `${displayName.value} (Syncing: ${props.syncProgress}%)`
  }
  return displayName.value
})
</script>

<template>
  <div
    class="user-avatar"
    :style="{ width: `${size}px`, height: `${size}px` }"
    :title="tooltipText"
  >
    <img
      v-if="avatarUrl"
      :src="avatarUrl"
      :alt="displayName"
      class="avatar-image"
      :class="{ dimmed: isSyncing }"
    />
    <span v-else class="avatar-fallback" :class="{ dimmed: isSyncing }">
      {{ initial }}
    </span>

    <!-- Progress overlay when syncing -->
    <div v-if="isSyncing" class="progress-overlay">
      <CircularProgress
        :progress="syncProgress"
        :size="size"
        :stroke-width="2"
        track-color="rgba(0, 0, 0, 0.3)"
        progress-color="#5865f2"
      />
    </div>
  </div>
</template>

<style scoped>
.user-avatar {
  position: relative;
  border-radius: 50%;
  overflow: hidden;
  background: #40444b;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: filter 0.2s ease;
}

.avatar-image.dimmed {
  filter: brightness(0.5);
}

.avatar-fallback {
  color: #dcddde;
  font-size: 0.75rem;
  font-weight: 600;
  transition: opacity 0.2s ease;
}

.avatar-fallback.dimmed {
  opacity: 0.5;
}

.progress-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
</style>
