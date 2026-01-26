<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { Asset } from '../types'
import { useWebSocket } from '../composables/useWebSocket'
import { useAssetCache } from '../composables/useAssetCache'
import MiniAppsContainer from './MiniAppsContainer.vue'

const props = defineProps<{
  campaignId: string
  campaignName: string
}>()

const emit = defineEmits<{
  leave: []
}>()

const {
  connected,
  reconnecting,
  identified,
  users,
  playbackState,
  joinCampaign,
  leaveCampaign,
  onMessage,
} = useWebSocket()

const { getAssetUrl, revokeAssetUrl, preCacheAllAssets } = useAssetCache()

const assets = ref<Asset[]>([])
const currentAsset = ref<Asset | null>(null)
const assetUrl = ref<string | null>(null)
const loading = ref(false)

// Layered playlist state
const isLayeredPlaylist = computed(() => playbackState.value.playlistType === 'layered' && playbackState.value.playlistId !== null)
const layeredAudioRefs = ref<Map<string, HTMLAudioElement>>(new Map())
const layeredAssetUrls = ref<Map<string, string>>(new Map())

// Animated layer volumes (for smooth fading)
const animatedLayerVolumes = ref<Record<string, number>>({})
let fadeAnimationFrame: number | null = null
const FADE_SPEED = 1 // Units per second (0 to 1 takes 0.5 seconds)

const layeredAssetIds = computed(() => {
  if (!isLayeredPlaylist.value) return []
  return Object.keys(playbackState.value.layerVolumes)
})

const isCaching = ref(false)
const cachedCount = ref(0)
const totalCount = ref(0)

const audioRef = ref<HTMLAudioElement | null>(null)

// Local volume control (not synced)
const volume = ref(parseFloat(localStorage.getItem('bardbox-volume') ?? '1'))

watch(volume, (v) => {
  localStorage.setItem('bardbox-volume', String(v))
  if (audioRef.value) audioRef.value.volume = v
})

watch(audioRef, () => {
  if (audioRef.value) audioRef.value.volume = volume.value
})

async function fetchAssets() {
  const response = await fetch(`/api/campaigns/${props.campaignId}/assets`)
  assets.value = await response.json()
}

async function loadAsset(assetId: string) {
  const asset = assets.value.find((a) => a.id === assetId)
  if (!asset) return

  if (assetUrl.value) {
    revokeAssetUrl(assetUrl.value)
    assetUrl.value = null
  }

  loading.value = true
  try {
    assetUrl.value = await getAssetUrl(props.campaignId, asset)
    currentAsset.value = asset
  } finally {
    loading.value = false
  }
}

function syncPlayback() {
  const state = playbackState.value
  const el = audioRef.value

  if (!el || currentAsset.value?.type !== 'audio') return

  const elapsed = (Date.now() - state.timestamp) / 1000
  const targetTime = state.playing ? state.currentTime + elapsed : state.currentTime

  if (Math.abs(el.currentTime - targetTime) > 0.5) {
    el.currentTime = targetTime
  }

  if (state.playing && el.paused) {
    el.play().catch(() => {})
  } else if (!state.playing && !el.paused) {
    el.pause()
  }
}

// Load all assets for a layered playlist
async function loadLayeredAssets(assetIds: string[]) {
  // Revoke old URLs
  for (const url of layeredAssetUrls.value.values()) {
    revokeAssetUrl(url)
  }
  layeredAssetUrls.value.clear()
  layeredAudioRefs.value.clear()

  // Load new assets
  for (const assetId of assetIds) {
    const asset = assets.value.find(a => a.id === assetId)
    if (asset && (asset.type === 'audio' || asset.type === 'video')) {
      const url = await getAssetUrl(props.campaignId, asset)
      layeredAssetUrls.value.set(assetId, url)
    }
  }
}

// Sync all layered audio elements (time and play/pause only, not volume)
function syncLayeredPlayback() {
  if (!isLayeredPlaylist.value) return

  const state = playbackState.value
  const elapsed = (Date.now() - state.timestamp) / 1000
  const targetTime = state.playing ? state.currentTime + elapsed : state.currentTime

  for (const [assetId, audioEl] of layeredAudioRefs.value.entries()) {
    // Sync time
    if (Math.abs(audioEl.currentTime - targetTime) > 0.5) {
      audioEl.currentTime = targetTime
    }

    // Sync play/pause
    if (state.playing && audioEl.paused) {
      audioEl.play().catch(() => {})
    } else if (!state.playing && !audioEl.paused) {
      audioEl.pause()
    }
  }
}

// Apply current animated volumes to audio elements
function applyAnimatedVolumes() {
  for (const [assetId, audioEl] of layeredAudioRefs.value.entries()) {
    const animatedVolume = animatedLayerVolumes.value[assetId] ?? 0
    audioEl.volume = animatedVolume * volume.value
  }
}

// Animate layer volumes toward target
let lastFadeTime = 0
function animateFade(timestamp: number) {
  if (!isLayeredPlaylist.value) {
    fadeAnimationFrame = null
    return
  }

  const deltaTime = lastFadeTime ? (timestamp - lastFadeTime) / 1000 : 0.016
  lastFadeTime = timestamp

  const targetVolumes = playbackState.value.layerVolumes
  let needsMoreAnimation = false

  for (const assetId of Object.keys(targetVolumes)) {
    const target = targetVolumes[assetId] ?? 0
    const current = animatedLayerVolumes.value[assetId] ?? 0

    if (Math.abs(target - current) > 0.001) {
      const direction = target > current ? 1 : -1
      const step = FADE_SPEED * deltaTime
      const newValue = current + direction * step

      if (direction > 0) {
        animatedLayerVolumes.value[assetId] = Math.min(newValue, target)
      } else {
        animatedLayerVolumes.value[assetId] = Math.max(newValue, target)
      }

      if (Math.abs(animatedLayerVolumes.value[assetId] - target) > 0.001) {
        needsMoreAnimation = true
      }
    }
  }

  applyAnimatedVolumes()

  if (needsMoreAnimation) {
    fadeAnimationFrame = requestAnimationFrame(animateFade)
  } else {
    fadeAnimationFrame = null
    lastFadeTime = 0
  }
}

// Start fade animation when target volumes change
function startFadeAnimation() {
  if (!isLayeredPlaylist.value) return

  const targetVolumes = playbackState.value.layerVolumes
  for (const assetId of Object.keys(targetVolumes)) {
    if (!(assetId in animatedLayerVolumes.value)) {
      animatedLayerVolumes.value[assetId] = targetVolumes[assetId] ?? 0
    }
  }

  if (!fadeAnimationFrame) {
    lastFadeTime = 0
    fadeAnimationFrame = requestAnimationFrame(animateFade)
  }
}

// Pause all layered audio elements
function pauseAllLayeredAudio() {
  for (const audioEl of layeredAudioRefs.value.values()) {
    audioEl.pause()
  }
}

// Register a layered audio element
function registerLayeredAudio(assetId: string, el: HTMLAudioElement | null) {
  if (el) {
    layeredAudioRefs.value.set(assetId, el)
    const animatedVolume = animatedLayerVolumes.value[assetId] ?? playbackState.value.layerVolumes[assetId] ?? 0
    el.volume = animatedVolume * volume.value
    syncLayeredPlayback()
  } else {
    // Element is being unmounted - pause it first
    const oldEl = layeredAudioRefs.value.get(assetId)
    if (oldEl) {
      oldEl.pause()
    }
    layeredAudioRefs.value.delete(assetId)
  }
}

// Watch for layered playlist changes
watch(layeredAssetIds, async (ids, oldIds) => {
  if (ids.length > 0 && JSON.stringify(ids) !== JSON.stringify(oldIds || [])) {
    // Pause old layered audio before switching
    pauseAllLayeredAudio()
    const targetVolumes = playbackState.value.layerVolumes
    animatedLayerVolumes.value = { ...targetVolumes }
    await loadLayeredAssets(ids)
  } else if (ids.length === 0) {
    // Pause all layered audio before clearing
    pauseAllLayeredAudio()
    for (const url of layeredAssetUrls.value.values()) {
      revokeAssetUrl(url)
    }
    layeredAssetUrls.value.clear()
    layeredAudioRefs.value.clear()
    animatedLayerVolumes.value = {}
    if (fadeAnimationFrame) {
      cancelAnimationFrame(fadeAnimationFrame)
      fadeAnimationFrame = null
    }
  }
}, { immediate: true })

// Watch for playback state changes to sync layered audio (time/play state)
watch(
  () => ({
    playing: playbackState.value.playing,
    currentTime: playbackState.value.currentTime,
    timestamp: playbackState.value.timestamp,
  }),
  () => syncLayeredPlayback()
)

// Watch for layer volume changes to trigger fade animation
watch(
  () => playbackState.value.layerVolumes,
  () => startFadeAnimation(),
  { deep: true }
)

// Watch master volume changes to update layered audio
watch(volume, () => applyAnimatedVolumes())

watch(
  () => playbackState.value.assetId,
  async (assetId) => {
    if (!assetId) {
      currentAsset.value = null
      if (assetUrl.value) {
        revokeAssetUrl(assetUrl.value)
        assetUrl.value = null
      }
      return
    }
    await loadAsset(assetId)
  }
)

// Only sync on timing-relevant changes (not queue changes)
watch(
  () => ({
    playing: playbackState.value.playing,
    currentTime: playbackState.value.currentTime,
    timestamp: playbackState.value.timestamp,
  }),
  () => syncPlayback()
)

watch([audioRef, currentAsset], () => {
  syncPlayback()
})

const unsubscribe = onMessage((message) => {
  if (message.type === 'playback-state') {
    syncPlayback()
  } else if (message.type === 'assets-updated') {
    fetchAssets()
  }
})

onMounted(async () => {
  await fetchAssets()

  // Pre-cache all assets
  if (assets.value.length > 0) {
    isCaching.value = true
    totalCount.value = assets.value.length
    cachedCount.value = 0
    await preCacheAllAssets(props.campaignId, assets.value, (cached, total) => {
      cachedCount.value = cached
      totalCount.value = total
    })
    isCaching.value = false
  }

  // Wait for connection and identification before joining campaign
  const checkConnection = setInterval(() => {
    if (connected.value && identified.value) {
      joinCampaign(props.campaignId)
      clearInterval(checkConnection)
    }
  }, 100)
})

onUnmounted(() => {
  unsubscribe()
  leaveCampaign()
  if (assetUrl.value) {
    revokeAssetUrl(assetUrl.value)
  }
  // Pause and clean up layered audio
  pauseAllLayeredAudio()
  for (const url of layeredAssetUrls.value.values()) {
    revokeAssetUrl(url)
  }
  // Cancel fade animation
  if (fadeAnimationFrame) {
    cancelAnimationFrame(fadeAnimationFrame)
  }
})
</script>

<template>
  <div class="player-playback">
    <header class="header">
      <button @click="emit('leave')" class="btn-leave">← Leave</button>
      <div class="campaign-info">
        <h2>{{ campaignName }}</h2>
        <div class="status">
          <span :class="['dot', { connected }]"></span>
          <div class="user-avatars" v-if="users.length > 0">
            <div
              v-for="user in users"
              :key="user.id"
              class="user-avatar"
              :title="user.global_name || user.username"
            >
              <img
                v-if="user.avatar"
                :src="`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=32`"
                :alt="user.global_name || user.username"
              />
              <span v-else class="avatar-fallback">
                {{ (user.global_name || user.username).charAt(0).toUpperCase() }}
              </span>
            </div>
          </div>
          <span v-else>No users</span>
        </div>
      </div>
      <div class="volume-control">
        <span class="volume-icon">{{ volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊' }}</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          v-model.number="volume"
          class="volume-slider"
        />
      </div>
    </header>

    <div v-if="isCaching && totalCount > 0" class="cache-progress">
      <span>Caching assets: {{ cachedCount }}/{{ totalCount }}</span>
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: `${(cachedCount / totalCount) * 100}%` }"></div>
      </div>
    </div>

    <main class="playback-area">
      <MiniAppsContainer :campaign-id="campaignId" />

      <!-- Hidden audio element for regular playback -->
      <audio
        v-if="currentAsset?.type === 'audio' && !isLayeredPlaylist"
        ref="audioRef"
        :src="assetUrl!"
        class="hidden-audio"
        @canplay="syncPlayback"
        @loadedmetadata="syncPlayback"
      ></audio>

      <!-- Hidden audio elements for layered playlist -->
      <template v-if="isLayeredPlaylist">
        <audio
          v-for="assetId in layeredAssetIds"
          :key="assetId"
          :ref="(el) => registerLayeredAudio(assetId, el as HTMLAudioElement)"
          :src="layeredAssetUrls.get(assetId)"
          class="hidden-audio"
          loop
          @canplay="syncLayeredPlayback"
        ></audio>
      </template>
    </main>
  </div>
</template>

<style scoped>
.player-playback {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #202225;
}

.header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: #2f3136;
  border-bottom: 1px solid #40444b;
}

.cache-progress {
  background: #2f3136;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid #40444b;
  display: flex;
  align-items: center;
  gap: 1rem;
  font-size: 0.75rem;
  color: #72767d;
}

.progress-bar {
  flex: 1;
  height: 4px;
  background: #40444b;
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #5865f2;
  transition: width 0.2s ease;
}

.btn-leave {
  background: transparent;
  border: none;
  color: #72767d;
  font-size: 1rem;
  cursor: pointer;
  padding: 0.5rem;
}

.btn-leave:hover {
  color: #fff;
}

.campaign-info {
  flex: 1;
}

.campaign-info h2 {
  margin: 0;
  font-size: 1.125rem;
  color: #fff;
}

.status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: #72767d;
  margin-top: 0.25rem;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ed4245;
}

.dot.connected {
  background: #3ba55c;
}

.user-avatars {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.user-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  overflow: hidden;
  background: #40444b;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #2f3136;
  margin-left: -6px;
}

.user-avatar:first-child {
  margin-left: 0;
}

.user-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-fallback {
  color: #dcddde;
  font-size: 0.625rem;
  font-weight: 600;
}

.playback-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 1rem;
  overflow: hidden;
}

.hidden-audio {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.volume-icon {
  font-size: 1.25rem;
}

.volume-slider {
  width: 80px;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: #40444b;
  border-radius: 2px;
  cursor: pointer;
}

.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  background: #5865f2;
  border-radius: 50%;
  cursor: pointer;
}

.volume-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: #5865f2;
  border-radius: 50%;
  cursor: pointer;
  border: none;
}

/* Hide header when viewport is very small (e.g., Discord activity resized small) */
@media (max-height: 300px) {
  .header {
    display: none;
  }
}
</style>
