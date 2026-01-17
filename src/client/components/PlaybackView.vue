<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { Asset, Playlist } from '../types'
import AssetList from './AssetList.vue'
import AssetUploader from './AssetUploader.vue'
import PlaylistPanel from './PlaylistPanel.vue'
import PlaylistEditor from './PlaylistEditor.vue'
import { useWebSocket } from '../composables/useWebSocket'
import { usePlayback } from '../composables/usePlayback'

const props = defineProps<{
  campaignId: string
  campaignName: string
}>()

const emit = defineEmits<{
  back: []
}>()

const {
  connected,
  users,
  playbackState: wsPlaybackState,
  joinCampaign,
  leaveCampaign,
  onMessage,
  next,
  prev,
} = useWebSocket()

const assetListRef = ref<InstanceType<typeof AssetList> | null>(null)
const playlistPanelRef = ref<InstanceType<typeof PlaylistPanel> | null>(null)

type SidebarView = 'assets' | 'upload' | 'playlists' | 'playlist-edit'
const sidebarView = ref<SidebarView>('assets')
const editingPlaylist = ref<Playlist | undefined>(undefined)

const assets = ref<Asset[]>([])
const campaignIdRef = computed(() => props.campaignId)

async function fetchAssets() {
  const response = await fetch(`/api/campaigns/${props.campaignId}/assets`)
  assets.value = await response.json()
}

const {
  currentAsset,
  assetUrl,
  loading,
  playbackState,
  setMediaElement,
  selectAsset,
  play,
  pause,
  seek,
} = usePlayback(campaignIdRef, assets)

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

const isPlaying = computed(() => playbackState.value.playing)
const hasPlaylist = computed(() => playbackState.value.playlistId !== null)

function handleAssetSelect(asset: Asset) {
  selectAsset(asset.id)
}

function togglePlayback() {
  if (isPlaying.value) {
    pause()
  } else {
    play()
  }
}

function handleTimeUpdate(event: Event) {
  const el = event.target as HTMLMediaElement
  if (!playbackState.value.playing) return

  const drift = Math.abs(el.currentTime - playbackState.value.currentTime)
  if (drift > 2) {
    seek(el.currentTime)
  }
}

function handleTrackEnded() {
  // When a track ends and we're in playlist mode, advance to next
  if (hasPlaylist.value) {
    next()
  }
}

function handleUploadComplete() {
  sidebarView.value = 'assets'
  fetchAssets()
  assetListRef.value?.refresh()
}

function handleEditPlaylist(playlist: Playlist) {
  editingPlaylist.value = playlist
  sidebarView.value = 'playlist-edit'
}

function handleCreatePlaylist() {
  editingPlaylist.value = undefined
  sidebarView.value = 'playlist-edit'
}

function handlePlaylistSaved() {
  sidebarView.value = 'playlists'
  editingPlaylist.value = undefined
  playlistPanelRef.value?.refresh()
}

function handlePlaylistCancel() {
  sidebarView.value = 'playlists'
  editingPlaylist.value = undefined
}

watch(audioRef, (el) => {
  if (el && currentAsset.value?.type === 'audio') {
    setMediaElement(el)
  }
})

watch(videoRef, (el) => {
  if (el && currentAsset.value?.type === 'video') {
    setMediaElement(el)
  }
})

watch(currentAsset, (asset) => {
  if (!asset) {
    setMediaElement(null)
  } else if (asset.type === 'audio' && audioRef.value) {
    setMediaElement(audioRef.value)
  } else if (asset.type === 'video' && videoRef.value) {
    setMediaElement(videoRef.value)
  }
})

const unsubscribe = onMessage((message) => {
  if (message.type === 'assets-updated') {
    fetchAssets()
    assetListRef.value?.refresh()
  } else if (message.type === 'playlists-updated') {
    playlistPanelRef.value?.refresh()
  }
})

onMounted(async () => {
  await fetchAssets()
  // Wait for connection before joining campaign
  const checkConnection = setInterval(() => {
    if (connected.value) {
      joinCampaign(props.campaignId)
      clearInterval(checkConnection)
    }
  }, 100)
})

onUnmounted(() => {
  unsubscribe()
  leaveCampaign()
})
</script>

<template>
  <div class="playback-view">
    <header class="toolbar">
      <button @click="emit('back')" class="btn-back">← Back</button>
      <h2>{{ campaignName }}</h2>
      <div class="status">
        <span :class="['connection', { connected }]">
          {{ connected ? 'Connected' : 'Connecting...' }}
        </span>
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
        <span v-else class="users">No users</span>
      </div>
    </header>

    <div class="content">
      <main class="playback-area">
        <div v-if="loading" class="loading">Loading asset...</div>

        <div v-else-if="!currentAsset" class="empty">
          Select an asset or playlist to play
        </div>

        <template v-else>
          <div v-if="currentAsset.type === 'image'" class="image-view">
            <img :src="assetUrl!" :alt="currentAsset.name" />
          </div>

          <div v-else-if="currentAsset.type === 'audio'" class="audio-view">
            <div class="audio-info">
              <span class="audio-icon">🎵</span>
              <span class="audio-name">{{ currentAsset.name }}</span>
              <span v-if="hasPlaylist" class="playlist-indicator">
                {{ playbackState.playlistIndex + 1 }} / {{ playbackState.playlistLength }}
              </span>
            </div>
            <audio
              ref="audioRef"
              :src="assetUrl!"
              @timeupdate="handleTimeUpdate"
              @ended="handleTrackEnded"
            ></audio>
          </div>

          <div v-else-if="currentAsset.type === 'video'" class="video-view">
            <video
              ref="videoRef"
              :src="assetUrl!"
              @timeupdate="handleTimeUpdate"
              @ended="handleTrackEnded"
            ></video>
          </div>

          <div v-if="currentAsset.type !== 'image'" class="controls">
            <button v-if="hasPlaylist" @click="prev" class="btn-control">⏮</button>
            <button @click="togglePlayback" class="btn-play">
              {{ isPlaying ? '⏸️ Pause' : '▶️ Play' }}
            </button>
            <button v-if="hasPlaylist" @click="next" class="btn-control">⏭</button>
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
          </div>
        </template>
      </main>

      <aside class="sidebar">
        <div class="sidebar-tabs">
          <button
            :class="['tab', { active: sidebarView === 'assets' || sidebarView === 'upload' }]"
            @click="sidebarView = 'assets'"
          >Assets</button>
          <button
            :class="['tab', { active: sidebarView === 'playlists' || sidebarView === 'playlist-edit' }]"
            @click="sidebarView = 'playlists'"
          >Playlists</button>
        </div>

        <div class="sidebar-content">
          <AssetUploader
            v-if="sidebarView === 'upload'"
            :campaign-id="campaignId"
            @uploaded="handleUploadComplete"
            @cancel="sidebarView = 'assets'"
          />

          <AssetList
            v-else-if="sidebarView === 'assets'"
            ref="assetListRef"
            :campaign-id="campaignId"
            :selected-asset-id="currentAsset?.id"
            @select="handleAssetSelect"
            @upload="sidebarView = 'upload'"
          />

          <PlaylistEditor
            v-else-if="sidebarView === 'playlist-edit'"
            :campaign-id="campaignId"
            :playlist="editingPlaylist"
            :assets="assets"
            @save="handlePlaylistSaved"
            @cancel="handlePlaylistCancel"
          />

          <template v-else-if="sidebarView === 'playlists'">
            <PlaylistPanel
              ref="playlistPanelRef"
              :campaign-id="campaignId"
              :assets="assets"
              @edit="handleEditPlaylist"
              @create="handleCreatePlaylist"
            />
          </template>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.playback-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: #2f3136;
  border-bottom: 1px solid #40444b;
}

.btn-back {
  background: transparent;
  border: none;
  color: #72767d;
  cursor: pointer;
  font-size: 1rem;
  padding: 0.5rem;
}

.btn-back:hover {
  color: #fff;
}

.toolbar h2 {
  flex: 1;
  margin: 0;
  font-size: 1.25rem;
}

.status {
  display: flex;
  gap: 1rem;
  font-size: 0.875rem;
}

.connection {
  color: #ed4245;
}

.connection.connected {
  color: #3ba55c;
}

.users {
  color: #72767d;
}

.user-avatars {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.user-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  overflow: hidden;
  background: #40444b;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #36393f;
  margin-left: -8px;
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
  font-size: 0.75rem;
  font-weight: 600;
}

.content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.playback-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  overflow: hidden;
}

.loading,
.empty {
  color: #72767d;
}

.image-view {
  max-width: 100%;
  max-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-view img {
  max-width: 100%;
  max-height: calc(100vh - 200px);
  object-fit: contain;
  border-radius: 8px;
}

.audio-view {
  text-align: center;
}

.audio-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;
}

.audio-icon {
  font-size: 4rem;
}

.audio-name {
  font-size: 1.25rem;
}

.playlist-indicator {
  color: #72767d;
  font-size: 0.875rem;
}

.video-view {
  max-width: 100%;
  max-height: calc(100vh - 200px);
}

.video-view video {
  max-width: 100%;
  max-height: 100%;
  border-radius: 8px;
}

.controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1rem;
}

.btn-control {
  background: #40444b;
  color: white;
  border: none;
  padding: 0.75rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
}

.btn-control:hover {
  background: #5865f2;
}

.btn-play {
  background: #5865f2;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
}

.btn-play:hover {
  background: #4752c4;
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: 1rem;
  padding-left: 1rem;
  border-left: 1px solid #40444b;
}

.volume-icon {
  font-size: 1.25rem;
}

.volume-slider {
  width: 100px;
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

.sidebar {
  background: #2f3136;
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-tabs {
  display: flex;
  border-bottom: 1px solid #40444b;
}

.tab {
  flex: 1;
  padding: 0.75rem;
  background: transparent;
  border: none;
  color: #72767d;
  cursor: pointer;
  font-size: 0.875rem;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}

.tab:hover {
  color: #dcddde;
}

.tab.active {
  color: #fff;
  border-bottom-color: #5865f2;
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
}
</style>
