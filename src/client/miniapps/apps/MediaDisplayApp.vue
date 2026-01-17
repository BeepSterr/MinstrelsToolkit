<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { Asset } from '../../types'
import { useMiniApp } from '../useMiniApp'
import { useAssetCache } from '../../composables/useAssetCache'

interface MediaDisplayState {
  assetId: string | null
}

const props = defineProps<{
  campaignId: string
  isGM?: boolean
}>()

const { state } = useMiniApp<MediaDisplayState>('media-display')
const { getAssetUrl, revokeAssetUrl } = useAssetCache()

const assets = ref<Asset[]>([])
const currentAsset = ref<Asset | null>(null)
const assetUrl = ref<string | null>(null)
const loading = ref(false)

async function fetchAssets() {
  const response = await fetch(`/api/campaigns/${props.campaignId}/assets`)
  assets.value = await response.json()
}

async function loadAsset(assetId: string) {
  const asset = assets.value.find((a) => a.id === assetId)
  if (!asset || (asset.type !== 'image' && asset.type !== 'video')) return

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

watch(
  () => state.value?.assetId,
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
  },
  { immediate: true }
)

onMounted(async () => {
  await fetchAssets()
  if (state.value?.assetId) {
    await loadAsset(state.value.assetId)
  }
})
</script>

<template>
  <div class="media-display-app">
    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>Loading...</p>
    </div>

    <div v-else-if="!currentAsset" class="empty">
      <span class="empty-icon">🖼️</span>
      <p>No media selected</p>
    </div>

    <template v-else>
      <div v-if="currentAsset.type === 'image'" class="media-container">
        <img :src="assetUrl!" :alt="currentAsset.name" />
      </div>

      <div v-else-if="currentAsset.type === 'video'" class="media-container">
        <video :src="assetUrl!" controls autoplay></video>
      </div>
    </template>
  </div>
</template>

<style scoped>
.media-display-app {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}

.loading,
.empty {
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

.empty-icon {
  font-size: 4rem;
  display: block;
  margin-bottom: 1rem;
}

.media-container {
  max-width: 100%;
  max-height: calc(100vh - 200px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.media-container img,
.media-container video {
  max-width: 100%;
  max-height: calc(100vh - 200px);
  border-radius: 8px;
  object-fit: contain;
}
</style>
