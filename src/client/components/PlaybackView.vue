<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { Asset, Playlist } from '../types'
import AssetList from './AssetList.vue'
import AssetUploader from './AssetUploader.vue'
import PlaylistPanel from './PlaylistPanel.vue'
import PlaylistEditor from './PlaylistEditor.vue'
import MiniAppsPanel from './MiniAppsPanel.vue'
import MiniAppsContainer from './MiniAppsContainer.vue'
import MusicBar from './MusicBar.vue'
import { useWebSocket } from '../composables/useWebSocket'
import { usePlayback } from '../composables/usePlayback'
import { useAssetCache } from '../composables/useAssetCache'

const props = defineProps<{
  campaignId: string
  campaignName: string
}>()

const emit = defineEmits<{
  back: []
}>()

const {
  connected,
  reconnecting,
  users,
  playbackState: wsPlaybackState,
  miniAppState,
  joinCampaign,
  leaveCampaign,
  onMessage,
  next,
  prev,
  setLoop,
  setShuffle,
  fadeToLayer,
  reloadPlayers,
} = useWebSocket()

const hasEnabledApps = computed(() => miniAppState.value.enabledApps.length > 0)
const isLayeredPlaylist = computed(() => wsPlaybackState.value.playlistType === 'layered' && wsPlaybackState.value.playlistId !== null)

const { preCacheAllAssets, getAssetUrl, revokeAssetUrl } = useAssetCache()

const isCaching = ref(false)
const cachedCount = ref(0)
const totalCount = ref(0)

const assetListRef = ref<InstanceType<typeof AssetList> | null>(null)
const playlistPanelRef = ref<InstanceType<typeof PlaylistPanel> | null>(null)

type SidebarView = 'assets' | 'upload' | 'playlists' | 'playlist-edit' | 'apps'
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

// Track media time for the music bar
const mediaCurrentTime = ref(0)
const mediaDuration = ref(0)

// Layered playlist state
const layeredAudioRefs = ref<Map<string, HTMLAudioElement>>(new Map())
const layeredAssetUrls = ref<Map<string, string>>(new Map())
const layeredAssetsLoading = ref(false)

// Animated layer volumes (for smooth fading)
const animatedLayerVolumes = ref<Record<string, number>>({})
let fadeAnimationFrame: number | null = null
const FADE_SPEED = 1 // Units per second (0 to 1 takes 0.5 seconds)

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

// Layered playlist asset IDs from the playback state
const layeredAssetIds = computed(() => {
  if (!isLayeredPlaylist.value) return []
  return Object.keys(wsPlaybackState.value.layerVolumes)
})

// Get asset info for a layer
function getLayeredAsset(assetId: string): Asset | undefined {
  return assets.value.find(a => a.id === assetId)
}

// Layer info for the music bar
const layers = computed(() => {
  if (!isLayeredPlaylist.value) return []
  return layeredAssetIds.value.map(id => ({
    id,
    name: getLayeredAsset(id)?.name ?? 'Unknown',
    volume: animatedLayerVolumes.value[id] ?? wsPlaybackState.value.layerVolumes[id] ?? 0,
  }))
})

// Load all assets for a layered playlist
async function loadLayeredAssets(assetIds: string[]) {
  layeredAssetsLoading.value = true

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

  layeredAssetsLoading.value = false
}

// Sync all layered audio elements (time and play/pause only, not volume)
function syncLayeredPlayback() {
  if (!isLayeredPlaylist.value) return

  const state = wsPlaybackState.value
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

  const targetVolumes = wsPlaybackState.value.layerVolumes
  let needsMoreAnimation = false

  for (const assetId of Object.keys(targetVolumes)) {
    const target = targetVolumes[assetId] ?? 0
    const current = animatedLayerVolumes.value[assetId] ?? 0

    if (Math.abs(target - current) > 0.001) {
      // Lerp toward target
      const direction = target > current ? 1 : -1
      const step = FADE_SPEED * deltaTime
      const newValue = current + direction * step

      // Clamp to not overshoot
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

  // Initialize animated volumes if empty
  const targetVolumes = wsPlaybackState.value.layerVolumes
  for (const assetId of Object.keys(targetVolumes)) {
    if (!(assetId in animatedLayerVolumes.value)) {
      animatedLayerVolumes.value[assetId] = targetVolumes[assetId] ?? 0
    }
  }

  // Start animation if not already running
  if (!fadeAnimationFrame) {
    lastFadeTime = 0
    fadeAnimationFrame = requestAnimationFrame(animateFade)
  }
}

// Register a layered audio element
function registerLayeredAudio(assetId: string, el: HTMLAudioElement | null) {
  if (el) {
    layeredAudioRefs.value.set(assetId, el)
    // Apply initial volume from animated state
    const animatedVolume = animatedLayerVolumes.value[assetId] ?? wsPlaybackState.value.layerVolumes[assetId] ?? 0
    el.volume = animatedVolume * volume.value
    syncLayeredPlayback()

    // Track time from first layered audio for the progress bar
    if (layeredAudioRefs.value.size === 1) {
      el.addEventListener('timeupdate', () => {
        mediaCurrentTime.value = el.currentTime
      })
      el.addEventListener('loadedmetadata', () => {
        mediaDuration.value = el.duration
      })
    }
  } else {
    layeredAudioRefs.value.delete(assetId)
  }
}

// Watch for layered playlist changes
watch(layeredAssetIds, async (ids, oldIds) => {
  if (ids.length > 0 && JSON.stringify(ids) !== JSON.stringify(oldIds || [])) {
    // Initialize animated volumes for new playlist
    const targetVolumes = wsPlaybackState.value.layerVolumes
    animatedLayerVolumes.value = { ...targetVolumes }
    await loadLayeredAssets(ids)
  } else if (ids.length === 0) {
    // Clear layered assets
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
    playing: wsPlaybackState.value.playing,
    currentTime: wsPlaybackState.value.currentTime,
    timestamp: wsPlaybackState.value.timestamp,
  }),
  () => syncLayeredPlayback()
)

// Watch for layer volume changes to trigger fade animation
watch(
  () => wsPlaybackState.value.layerVolumes,
  () => startFadeAnimation(),
  { deep: true }
)

// Watch master volume changes to update layered audio
watch(volume, () => applyAnimatedVolumes())

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
  mediaCurrentTime.value = el.currentTime

  if (!playbackState.value.playing) return

  const drift = Math.abs(el.currentTime - playbackState.value.currentTime)
  if (drift > 2) {
    seek(el.currentTime)
  }
}

function handleLoadedMetadata(event: Event) {
  const el = event.target as HTMLMediaElement
  mediaDuration.value = el.duration
}

function handleCanPlay(event: Event) {
  const el = event.target as HTMLMediaElement
  // When new track is ready to play, start it if playback state says we should be playing
  if (playbackState.value.playing && el.paused) {
    el.play().catch(() => {})
  }
}

function handleSeekFromBar(time: number) {
  seek(time)
  // Also update the local media element
  if (audioRef.value) audioRef.value.currentTime = time
  if (videoRef.value) videoRef.value.currentTime = time
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
  // Clean up fade animation
  if (fadeAnimationFrame) {
    cancelAnimationFrame(fadeAnimationFrame)
  }
  // Clean up layered asset URLs
  for (const url of layeredAssetUrls.value.values()) {
    revokeAssetUrl(url)
  }
})
</script>

<template>
  <div class="playback-view">
    <header class="toolbar">
      <button @click="emit('back')" class="btn-back">← Back</button>
      <h2>{{ campaignName }}</h2>
      <div class="status">
        <span :class="['connection', { connected, reconnecting }]">
          {{ connected ? 'Connected' : reconnecting ? 'Reconnecting...' : 'Connecting...' }}
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
        <button @click="reloadPlayers" class="btn-reload" title="Reload player views">
          Reload Players
        </button>
      </div>
    </header>

    <div v-if="isCaching && totalCount > 0" class="cache-progress">
      <span>Caching assets: {{ cachedCount }}/{{ totalCount }}</span>
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: `${(cachedCount / totalCount) * 100}%` }"></div>
      </div>
    </div>

    <div class="content">
      <main class="playback-area">
        <!-- Hidden audio elements for layered playlist -->
        <template v-if="isLayeredPlaylist">
          <audio
            v-for="assetId in layeredAssetIds"
            :key="assetId"
            :ref="(el) => registerLayeredAudio(assetId, el as HTMLAudioElement)"
            :src="layeredAssetUrls.get(assetId)"
            loop
          ></audio>
        </template>

        <!-- Hidden audio/video elements for regular playback -->
        <template v-else-if="currentAsset">
          <audio
            v-if="currentAsset.type === 'audio'"
            ref="audioRef"
            :src="assetUrl!"
            @timeupdate="handleTimeUpdate"
            @loadedmetadata="handleLoadedMetadata"
            @canplay="handleCanPlay"
            @ended="handleTrackEnded"
          ></audio>
          <video
            v-else-if="currentAsset.type === 'video'"
            ref="videoRef"
            :src="assetUrl!"
            @timeupdate="handleTimeUpdate"
            @loadedmetadata="handleLoadedMetadata"
            @canplay="handleCanPlay"
            @ended="handleTrackEnded"
            class="hidden-video"
          ></video>
          <div v-else-if="currentAsset.type === 'image'" class="image-view">
            <img :src="assetUrl!" :alt="currentAsset.name" />
          </div>
        </template>

        <!-- Mini Apps Section -->
        <MiniAppsContainer v-if="hasEnabledApps" :campaign-id="campaignId" :is-g-m="true" />
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
          <button
            :class="['tab', { active: sidebarView === 'apps' }]"
            @click="sidebarView = 'apps'"
          >Apps</button>
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

          <MiniAppsPanel
            v-else-if="sidebarView === 'apps'"
            :campaign-id="campaignId"
          />
        </div>
      </aside>
    </div>

    <MusicBar
      :current-asset="currentAsset"
      :is-playing="isPlaying"
      :current-time="mediaCurrentTime"
      :duration="mediaDuration"
      :volume="volume"
      :has-playlist="hasPlaylist"
      :playlist-index="playbackState.playlistIndex"
      :playlist-length="playbackState.playlistLength"
      :is-layered="isLayeredPlaylist"
      :layered-track-count="layeredAssetIds.length"
      :shuffle="wsPlaybackState.shuffle"
      :loop="wsPlaybackState.loop"
      @play="play"
      @pause="pause"
      @next="next"
      @prev="prev"
      @seek="handleSeekFromBar"
      @update:volume="v => volume = v"
      @update:shuffle="setShuffle"
      @update:loop="setLoop"
    />
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

.connection.reconnecting {
  color: #faa61a;
}

.users {
  color: #72767d;
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
  max-width: 300px;
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

.btn-reload {
  background: #40444b;
  color: #dcddde;
  border: none;
  padding: 0.375rem 0.75rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
}

.btn-reload:hover {
  background: #5865f2;
  color: white;
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
  gap: 1rem;
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

.hidden-video {
  display: none;
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
