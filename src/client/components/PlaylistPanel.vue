<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Playlist, Asset } from '../types'
import { useWebSocket } from '../composables/useWebSocket'

const props = defineProps<{
  campaignId: string
  assets: Asset[]
}>()

const emit = defineEmits<{
  edit: [playlist: Playlist]
  create: []
}>()

const { playbackState, playPlaylist, stopPlaylist, setLoop, setShuffle, queueAsset, jumpToAsset, next, prev } = useWebSocket()

const playlists = ref<Playlist[]>([])
const loading = ref(true)
const expandedPlaylistId = ref<string | null>(null)
const clickTimers = ref<Record<string, number>>({})

const isPlaying = computed(() => playbackState.value.playlistId !== null)
const currentPlaylistId = computed(() => playbackState.value.playlistId)

async function fetchPlaylists() {
  loading.value = true
  try {
    const response = await fetch(`/api/campaigns/${props.campaignId}/playlists`)
    playlists.value = await response.json()
  } finally {
    loading.value = false
  }
}

async function deletePlaylist(id: string) {
  if (!confirm('Delete this playlist?')) return
  await fetch(`/api/campaigns/${props.campaignId}/playlists/${id}`, {
    method: 'DELETE',
  })
  await fetchPlaylists()
}

function toggleExpand(playlistId: string) {
  expandedPlaylistId.value = expandedPlaylistId.value === playlistId ? null : playlistId
}

function handlePlaylistPlay(playlist: Playlist) {
  if (currentPlaylistId.value === playlist.id) {
    stopPlaylist()
  } else {
    playPlaylist(playlist.id)
  }
}

function getAssetName(assetId: string): string {
  const asset = props.assets.find(a => a.id === assetId)
  return asset?.name || 'Unknown'
}

function getAssetType(assetId: string): string {
  const asset = props.assets.find(a => a.id === assetId)
  return asset?.type || 'audio'
}

function isCurrentTrack(assetId: string): boolean {
  return playbackState.value.assetId === assetId && playbackState.value.playlistId !== null
}

function isQueuedNext(assetId: string): boolean {
  return playbackState.value.nextAssetId === assetId
}

function handleTrackClick(assetId: string, playlistId: string) {
  const key = `${playlistId}-${assetId}`

  if (clickTimers.value[key]) {
    // Double click - jump to track now
    clearTimeout(clickTimers.value[key])
    delete clickTimers.value[key]

    if (currentPlaylistId.value !== playlistId) {
      // Start playlist first, then jump
      playPlaylist(playlistId)
      setTimeout(() => jumpToAsset(assetId), 100)
    } else {
      jumpToAsset(assetId)
    }
  } else {
    // Single click - queue for next
    clickTimers.value[key] = window.setTimeout(() => {
      delete clickTimers.value[key]

      if (currentPlaylistId.value === playlistId) {
        queueAsset(assetId)
      }
    }, 300)
  }
}

watch(() => props.campaignId, fetchPlaylists, { immediate: true })

defineExpose({ refresh: fetchPlaylists })
</script>

<template>
  <div class="playlist-panel">
    <div class="panel-header">
      <h3>Playlists</h3>
      <button @click="emit('create')" class="btn-add">+ New</button>
    </div>

    <div class="playback-controls" v-if="isPlaying">
      <button @click="prev" class="btn-control" title="Previous">⏮</button>
      <button @click="stopPlaylist" class="btn-control btn-stop" title="Stop">⏹</button>
      <button @click="next" class="btn-control" title="Next">⏭</button>
      <button
        @click="setLoop(!playbackState.loop)"
        :class="['btn-control', { active: playbackState.loop }]"
        title="Loop"
      >🔁</button>
      <button
        @click="setShuffle(!playbackState.shuffle)"
        :class="['btn-control', { active: playbackState.shuffle }]"
        title="Shuffle"
      >🔀</button>
    </div>

    <div v-if="loading" class="loading">Loading...</div>

    <div v-else-if="playlists.length === 0" class="empty">
      No playlists yet
    </div>

    <ul v-else class="playlist-list">
      <li v-for="playlist in playlists" :key="playlist.id" class="playlist-item">
        <div class="playlist-header">
          <button
            @click="handlePlaylistPlay(playlist)"
            :class="['btn-play', { playing: currentPlaylistId === playlist.id }]"
          >
            {{ currentPlaylistId === playlist.id ? '⏹' : '▶' }}
          </button>
          <span class="playlist-name" @click="toggleExpand(playlist.id)">
            {{ playlist.name }}
            <span class="track-count">({{ playlist.assetIds.length }})</span>
          </span>
          <div class="playlist-actions">
            <button @click="emit('edit', playlist)" class="btn-icon" title="Edit">✏️</button>
            <button @click="deletePlaylist(playlist.id)" class="btn-icon" title="Delete">🗑️</button>
          </div>
        </div>

        <ul v-if="expandedPlaylistId === playlist.id" class="track-list">
          <li
            v-for="assetId in playlist.assetIds"
            :key="assetId"
            :class="['track-item', {
              current: isCurrentTrack(assetId),
              queued: isQueuedNext(assetId)
            }]"
            @click="handleTrackClick(assetId, playlist.id)"
          >
            <span class="track-icon">
              {{ getAssetType(assetId) === 'audio' ? '🎵' : getAssetType(assetId) === 'video' ? '🎬' : '🖼️' }}
            </span>
            <span class="track-name">{{ getAssetName(assetId) }}</span>
            <span v-if="isCurrentTrack(assetId)" class="now-playing">▶</span>
            <span v-else-if="isQueuedNext(assetId)" class="queued-badge">Next</span>
          </li>
        </ul>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.playlist-panel {
  padding: 0.75rem;
  border-top: 1px solid #40444b;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.panel-header h3 {
  margin: 0;
  font-size: 0.875rem;
  color: #72767d;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.btn-add {
  background: transparent;
  border: 1px solid #5865f2;
  color: #5865f2;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
}

.btn-add:hover {
  background: #5865f2;
  color: white;
}

.playback-controls {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 0.75rem;
  padding: 0.5rem;
  background: #202225;
  border-radius: 4px;
}

.btn-control {
  background: #40444b;
  border: none;
  color: #dcddde;
  padding: 0.375rem 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
}

.btn-control:hover {
  background: #5865f2;
}

.btn-control.active {
  background: #5865f2;
}

.btn-control.btn-stop {
  background: #ed4245;
}

.loading, .empty {
  color: #72767d;
  font-size: 0.875rem;
  text-align: center;
  padding: 1rem;
}

.playlist-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.playlist-item {
  margin-bottom: 0.5rem;
}

.playlist-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background: #40444b;
  border-radius: 4px;
}

.btn-play {
  background: #5865f2;
  border: none;
  color: white;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-play.playing {
  background: #ed4245;
}

.playlist-name {
  flex: 1;
  cursor: pointer;
  font-size: 0.875rem;
}

.track-count {
  color: #72767d;
  font-size: 0.75rem;
}

.playlist-actions {
  display: flex;
  gap: 0.25rem;
}

.btn-icon {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0.25rem;
  font-size: 0.875rem;
  opacity: 0.6;
}

.btn-icon:hover {
  opacity: 1;
}

.track-list {
  list-style: none;
  padding: 0;
  margin: 0.25rem 0 0 0;
  background: #2f3136;
  border-radius: 4px;
  overflow: hidden;
}

.track-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  font-size: 0.8125rem;
  border-left: 3px solid transparent;
}

.track-item:hover {
  background: #36393f;
}

.track-item.current {
  background: rgba(88, 101, 242, 0.2);
  border-left-color: #5865f2;
}

.track-item.queued {
  background: rgba(250, 166, 26, 0.1);
  border-left-color: #faa61a;
}

.track-icon {
  font-size: 0.875rem;
}

.track-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.now-playing {
  color: #5865f2;
  font-size: 0.75rem;
}

.queued-badge {
  background: #faa61a;
  color: #000;
  font-size: 0.625rem;
  padding: 0.125rem 0.375rem;
  border-radius: 10px;
  font-weight: 600;
}
</style>
