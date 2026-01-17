<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { Asset } from '../types'
import { useWebSocket } from '../composables/useWebSocket'
import { useAssetCache } from '../composables/useAssetCache'

const props = defineProps<{
  campaignId: string
  campaignName: string
}>()

const emit = defineEmits<{
  leave: []
}>()

const {
  connected,
  identified,
  users,
  playbackState,
  joinCampaign,
  leaveCampaign,
  onMessage,
} = useWebSocket()

const { getAssetUrl, revokeAssetUrl } = useAssetCache()

const assets = ref<Asset[]>([])
const currentAsset = ref<Asset | null>(null)
const assetUrl = ref<string | null>(null)
const loading = ref(false)

const audioRef = ref<HTMLAudioElement | null>(null)
const videoRef = ref<HTMLVideoElement | null>(null)

// Local volume control (not synced)
const volume = ref(parseFloat(localStorage.getItem('bardbox-volume') ?? '1'))

watch(volume, (v) => {
  localStorage.setItem('bardbox-volume', String(v))
  if (audioRef.value) audioRef.value.volume = v
  if (videoRef.value) videoRef.value.volume = v
})

watch([audioRef, videoRef], () => {
  if (audioRef.value) audioRef.value.volume = volume.value
  if (videoRef.value) videoRef.value.volume = volume.value
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
  const el = currentAsset.value?.type === 'audio' ? audioRef.value :
             currentAsset.value?.type === 'video' ? videoRef.value : null

  if (!el || !currentAsset.value) return

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

watch([audioRef, videoRef, currentAsset], () => {
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

    <main class="playback-area">
      <div v-if="loading" class="state-message">
        <div class="spinner"></div>
        <p>Loading...</p>
      </div>

      <div v-else-if="!currentAsset" class="state-message">
        <p class="waiting">Waiting for content...</p>
        <span class="hint">The game master will select what to display</span>
      </div>

      <template v-else>
        <div v-if="currentAsset.type === 'image'" class="media-container">
          <img :src="assetUrl!" :alt="currentAsset.name" />
        </div>

        <div v-else-if="currentAsset.type === 'audio'" class="audio-display">
          <div class="audio-visual">
            <span class="audio-icon">🎵</span>
            <span class="audio-name">{{ currentAsset.name }}</span>
            <span v-if="playbackState.playlistId" class="playlist-info">
              {{ playbackState.playlistIndex + 1 }} / {{ playbackState.playlistLength }}
            </span>
            <span v-if="playbackState.playing" class="playing-indicator">Playing</span>
          </div>
          <audio ref="audioRef" :src="assetUrl!"></audio>
        </div>

        <div v-else-if="currentAsset.type === 'video'" class="media-container">
          <video ref="videoRef" :src="assetUrl!"></video>
        </div>
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
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.state-message {
  text-align: center;
  color: #72767d;
}

.spinner {
  width: 40px;
  height: 40px;
  margin: 0 auto 1rem;
  border: 3px solid #40444b;
  border-top-color: #5865f2;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.waiting {
  font-size: 1.25rem;
  margin: 0 0 0.5rem;
}

.hint {
  font-size: 0.875rem;
}

.media-container {
  max-width: 100%;
  max-height: calc(100vh - 150px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.media-container img,
.media-container video {
  max-width: 100%;
  max-height: calc(100vh - 150px);
  border-radius: 8px;
  object-fit: contain;
}

.audio-display {
  text-align: center;
}

.audio-visual {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.audio-icon {
  font-size: 5rem;
}

.audio-name {
  font-size: 1.5rem;
  color: #fff;
}

.playlist-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #72767d;
  font-size: 0.875rem;
}

.badge {
  font-size: 0.75rem;
}

.playing-indicator {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: #3ba55c;
  color: #fff;
  border-radius: 20px;
  font-size: 0.875rem;
}

.playing-indicator::before {
  content: '';
  width: 8px;
  height: 8px;
  background: #fff;
  border-radius: 50%;
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
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
</style>
