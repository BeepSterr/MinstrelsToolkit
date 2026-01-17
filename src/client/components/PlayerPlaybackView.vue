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

const { getAssetUrl, revokeAssetUrl } = useAssetCache()

const assets = ref<Asset[]>([])
const currentAsset = ref<Asset | null>(null)
const assetUrl = ref<string | null>(null)
const loading = ref(false)

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
      <MiniAppsContainer :campaign-id="campaignId" />

      <!-- Hidden audio element for background playback -->
      <audio
        v-if="currentAsset?.type === 'audio'"
        ref="audioRef"
        :src="assetUrl!"
        class="hidden-audio"
      ></audio>
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
</style>
