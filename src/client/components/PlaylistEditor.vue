<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Playlist, Asset } from '../types'

const props = defineProps<{
  campaignId: string
  playlist?: Playlist
  assets: Asset[]
}>()

const emit = defineEmits<{
  save: [playlist: Playlist]
  cancel: []
}>()

const name = ref(props.playlist?.name ?? '')
const playlistType = ref<'sequential' | 'layered'>(props.playlist?.type ?? 'sequential')
const selectedAssetIds = ref<string[]>(props.playlist?.assetIds ?? [])
const layerVolumes = ref<Record<string, number>>(props.playlist?.layerVolumes ?? {})
const saving = ref(false)
const error = ref<string | null>(null)

const audioAssets = computed(() =>
  props.assets.filter(a => a.type === 'audio' || a.type === 'video')
)

// Initialize volumes for assets when they're added
watch(selectedAssetIds, (ids) => {
  if (playlistType.value === 'layered') {
    for (const id of ids) {
      if (!(id in layerVolumes.value)) {
        // First track defaults to 1, others to 0
        layerVolumes.value[id] = Object.keys(layerVolumes.value).length === 0 ? 1 : 0
      }
    }
    // Remove volumes for removed assets
    for (const id of Object.keys(layerVolumes.value)) {
      if (!ids.includes(id)) {
        delete layerVolumes.value[id]
      }
    }
  }
}, { deep: true })

function getLayerVolume(assetId: string): number {
  return layerVolumes.value[assetId] ?? 0
}

function setLayerVolume(assetId: string, volume: number): void {
  layerVolumes.value[assetId] = volume
}

const searchQuery = ref('')

const availableAssets = computed(() =>
  audioAssets.value.filter(a => !selectedAssetIds.value.includes(a.id))
)

const filteredAvailableAssets = computed(() => {
  const query = searchQuery.value.toLowerCase().trim()
  if (!query) return availableAssets.value
  return availableAssets.value.filter(a => a.name.toLowerCase().includes(query))
})

function addAsset(assetId: string) {
  if (!selectedAssetIds.value.includes(assetId)) {
    selectedAssetIds.value = [...selectedAssetIds.value, assetId]
  }
}

function removeAsset(assetId: string) {
  selectedAssetIds.value = selectedAssetIds.value.filter(id => id !== assetId)
}

function moveAsset(index: number, direction: -1 | 1) {
  const newIndex = index + direction
  if (newIndex < 0 || newIndex >= selectedAssetIds.value.length) return

  const newList = [...selectedAssetIds.value]
  ;[newList[index], newList[newIndex]] = [newList[newIndex], newList[index]]
  selectedAssetIds.value = newList
}

function getAsset(assetId: string): Asset | undefined {
  return props.assets.find(a => a.id === assetId)
}

async function handleSubmit() {
  if (!name.value.trim()) {
    error.value = 'Name is required'
    return
  }

  saving.value = true
  error.value = null

  try {
    const url = props.playlist
      ? `/api/campaigns/${props.campaignId}/playlists/${props.playlist.id}`
      : `/api/campaigns/${props.campaignId}/playlists`

    const response = await fetch(url, {
      method: props.playlist ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.value.trim(),
        type: playlistType.value,
        assetIds: selectedAssetIds.value,
        layerVolumes: playlistType.value === 'layered' ? layerVolumes.value : undefined,
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to save playlist')
    }

    const saved = await response.json()
    emit('save', saved)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'An error occurred'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="playlist-editor">
    <h3>{{ playlist ? 'Edit Playlist' : 'New Playlist' }}</h3>

    <form @submit.prevent="handleSubmit">
      <div class="field">
        <label for="name">Name</label>
        <input
          id="name"
          v-model="name"
          type="text"
          placeholder="Playlist name"
          :disabled="saving"
        />
      </div>

      <div class="field">
        <label>Type</label>
        <div class="type-toggle">
          <button
            type="button"
            :class="['type-btn', { active: playlistType === 'sequential' }]"
            @click="playlistType = 'sequential'"
            :disabled="saving"
          >
            Sequential
          </button>
          <button
            type="button"
            :class="['type-btn', { active: playlistType === 'layered' }]"
            @click="playlistType = 'layered'"
            :disabled="saving"
          >
            Layered
          </button>
        </div>
        <p class="type-hint">
          {{ playlistType === 'sequential'
            ? 'Plays tracks one after another'
            : 'Plays all tracks simultaneously with adjustable volumes'
          }}
        </p>
      </div>

      <div class="tracks-section">
        <div class="tracks-header">
          <span>Tracks ({{ selectedAssetIds.length }})</span>
        </div>

        <ul v-if="selectedAssetIds.length > 0" class="track-list">
          <li v-for="(assetId, index) in selectedAssetIds" :key="assetId" class="track-item">
            <span class="track-number">{{ index + 1 }}</span>
            <span class="track-name">{{ getAsset(assetId)?.name || 'Unknown' }}</span>
            <div v-if="playlistType === 'layered'" class="layer-volume">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                :value="getLayerVolume(assetId)"
                @input="setLayerVolume(assetId, parseFloat(($event.target as HTMLInputElement).value))"
                class="volume-slider"
              />
              <span class="volume-value">{{ Math.round(getLayerVolume(assetId) * 100) }}%</span>
            </div>
            <div class="track-controls">
              <button
                v-if="playlistType === 'sequential'"
                type="button"
                @click="moveAsset(index, -1)"
                :disabled="index === 0"
                class="btn-move"
              >↑</button>
              <button
                v-if="playlistType === 'sequential'"
                type="button"
                @click="moveAsset(index, 1)"
                :disabled="index === selectedAssetIds.length - 1"
                class="btn-move"
              >↓</button>
              <button
                type="button"
                @click="removeAsset(assetId)"
                class="btn-remove"
              >×</button>
            </div>
          </li>
        </ul>
        <div v-else class="empty-tracks">No tracks added yet</div>
      </div>

      <div class="available-section">
        <div class="available-header">Add Tracks</div>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search tracks..."
          class="search-input"
          :disabled="saving || availableAssets.length === 0"
        />
        <ul v-if="filteredAvailableAssets.length > 0" class="available-list">
          <li
            v-for="asset in filteredAvailableAssets"
            :key="asset.id"
            class="available-item"
            @click="addAsset(asset.id)"
          >
            <span class="asset-icon">{{ asset.type === 'audio' ? '🎵' : '🎬' }}</span>
            <span class="asset-name">{{ asset.name }}</span>
            <span class="btn-add-track">+</span>
          </li>
        </ul>
        <div v-else class="empty-available">
          {{ audioAssets.length === 0 ? 'No audio/video assets available' : availableAssets.length === 0 ? 'All assets added' : 'No matches found' }}
        </div>
      </div>

      <div v-if="error" class="error">{{ error }}</div>

      <div class="actions">
        <button type="button" @click="emit('cancel')" :disabled="saving">Cancel</button>
        <button type="submit" class="btn-primary" :disabled="saving">
          {{ saving ? 'Saving...' : 'Save' }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.playlist-editor {
  padding: 1rem;
}

h3 {
  margin: 0 0 1rem;
  font-size: 1rem;
}

.field {
  margin-bottom: 1rem;
}

label {
  display: block;
  margin-bottom: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
}

input {
  width: 100%;
  padding: 0.5rem;
  background: #40444b;
  border: 1px solid #40444b;
  border-radius: 4px;
  color: #fff;
  font-size: 0.875rem;
  box-sizing: border-box;
}

input:focus {
  border-color: #5865f2;
  outline: none;
}

.tracks-section {
  margin-bottom: 1rem;
}

.tracks-header, .available-header {
  font-size: 0.75rem;
  color: #72767d;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
}

.track-list, .available-list {
  list-style: none;
  padding: 0;
  margin: 0;
  background: #2f3136;
  border-radius: 4px;
  max-height: 200px;
  overflow-y: auto;
}

.track-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border-bottom: 1px solid #40444b;
}

.track-item:last-child {
  border-bottom: none;
}

.track-number {
  width: 1.5rem;
  text-align: center;
  color: #72767d;
  font-size: 0.75rem;
}

.track-name {
  flex: 1;
  font-size: 0.8125rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-controls {
  display: flex;
  gap: 0.25rem;
}

.btn-move, .btn-remove {
  background: #40444b;
  border: none;
  color: #dcddde;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
}

.btn-move:hover:not(:disabled) {
  background: #5865f2;
}

.btn-move:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.btn-remove:hover {
  background: #ed4245;
}

.empty-tracks, .empty-available {
  padding: 1rem;
  text-align: center;
  color: #72767d;
  font-size: 0.8125rem;
  background: #2f3136;
  border-radius: 4px;
}

.available-section {
  margin-bottom: 1rem;
}

.search-input {
  margin-bottom: 0.5rem;
}

.available-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  cursor: pointer;
  border-bottom: 1px solid #40444b;
}

.available-item:last-child {
  border-bottom: none;
}

.available-item:hover {
  background: #36393f;
}

.asset-icon {
  font-size: 0.875rem;
}

.asset-name {
  flex: 1;
  font-size: 0.8125rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-add-track {
  color: #5865f2;
  font-weight: bold;
  font-size: 1rem;
}

.error {
  color: #ed4245;
  margin-bottom: 1rem;
  font-size: 0.875rem;
}

.actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

button {
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  border: none;
  background: #40444b;
  color: #fff;
}

button:hover:not(:disabled) {
  background: #36393f;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: #5865f2;
}

.btn-primary:hover:not(:disabled) {
  background: #4752c4;
}

.type-toggle {
  display: flex;
  gap: 0.5rem;
}

.type-btn {
  flex: 1;
  padding: 0.5rem;
  background: #40444b;
  border: 1px solid #40444b;
  border-radius: 4px;
  color: #72767d;
  cursor: pointer;
  font-size: 0.8125rem;
}

.type-btn:hover:not(:disabled) {
  background: #36393f;
  color: #dcddde;
}

.type-btn.active {
  background: #5865f2;
  border-color: #5865f2;
  color: white;
}

.type-hint {
  margin: 0.375rem 0 0;
  font-size: 0.75rem;
  color: #72767d;
}

.layer-volume {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  margin: 0 0.5rem;
}

.layer-volume .volume-slider {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: #40444b;
  border-radius: 2px;
  cursor: pointer;
}

.layer-volume .volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  background: #5865f2;
  border-radius: 50%;
  cursor: pointer;
}

.layer-volume .volume-slider::-moz-range-thumb {
  width: 12px;
  height: 12px;
  background: #5865f2;
  border-radius: 50%;
  cursor: pointer;
  border: none;
}

.volume-value {
  font-size: 0.6875rem;
  color: #72767d;
  min-width: 32px;
  text-align: right;
}
</style>
