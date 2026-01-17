<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { Asset } from '../../types'
import { useMiniApp } from '../useMiniApp'

interface MediaDisplayState {
  assetId: string | null
}

const props = defineProps<{
  campaignId: string
}>()

const { state, dispatch } = useMiniApp<MediaDisplayState>('media-display')

const assets = ref<Asset[]>([])
const selectedAssetId = ref<string | null>(null)

// Filter to only show image and video assets
const mediaAssets = computed(() =>
  assets.value.filter((a) => a.type === 'image' || a.type === 'video')
)

async function fetchAssets() {
  const response = await fetch(`/api/campaigns/${props.campaignId}/assets`)
  assets.value = await response.json()
}

function showAsset() {
  if (selectedAssetId.value) {
    dispatch('set-asset', { assetId: selectedAssetId.value })
  }
}

function clearDisplay() {
  dispatch('clear')
  selectedAssetId.value = null
}

onMounted(() => {
  fetchAssets()
})
</script>

<template>
  <div class="media-display-controls">
    <div class="control-row">
      <select v-model="selectedAssetId" class="asset-select">
        <option :value="null">Select media...</option>
        <option v-for="asset in mediaAssets" :key="asset.id" :value="asset.id">
          {{ asset.type === 'image' ? '🖼️' : '🎬' }} {{ asset.name }}
        </option>
      </select>
      <button @click="showAsset" :disabled="!selectedAssetId" class="btn-show">
        Show
      </button>
    </div>

    <div v-if="state?.assetId" class="current-display">
      <span class="current-label">Currently showing:</span>
      <span class="current-asset">
        {{ mediaAssets.find(a => a.id === state.assetId)?.name || 'Unknown' }}
      </span>
      <button @click="clearDisplay" class="btn-clear">Clear</button>
    </div>
  </div>
</template>

<style scoped>
.media-display-controls {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.control-row {
  display: flex;
  gap: 0.5rem;
}

.asset-select {
  flex: 1;
  padding: 0.5rem;
  background: #40444b;
  border: none;
  border-radius: 4px;
  color: #dcddde;
  font-size: 0.875rem;
}

.btn-show {
  padding: 0.5rem 1rem;
  background: #5865f2;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
}

.btn-show:hover:not(:disabled) {
  background: #4752c4;
}

.btn-show:disabled {
  background: #4f545c;
  cursor: not-allowed;
}

.current-display {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background: #40444b;
  border-radius: 4px;
  font-size: 0.875rem;
}

.current-label {
  color: #72767d;
}

.current-asset {
  flex: 1;
  color: #dcddde;
}

.btn-clear {
  padding: 0.25rem 0.5rem;
  background: #ed4245;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
}

.btn-clear:hover {
  background: #c73e3a;
}
</style>
