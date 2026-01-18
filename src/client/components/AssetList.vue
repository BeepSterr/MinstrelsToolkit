<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Asset } from '../types'

const props = defineProps<{
  campaignId: string
  selectedAssetId?: string | null
}>()

const emit = defineEmits<{
  select: [asset: Asset]
  upload: []
}>()

const assets = ref<Asset[]>([])
const loading = ref(true)

async function fetchAssets() {
  loading.value = true
  try {
    const response = await fetch(`/api/campaigns/${props.campaignId}/assets`)
    assets.value = await response.json()
  } finally {
    loading.value = false
  }
}

async function deleteAsset(id: string) {
  if (!confirm('Delete this asset?')) return

  await fetch(`/api/campaigns/${props.campaignId}/assets/${id}`, {
    method: 'DELETE',
  })
  await fetchAssets()
}

function getTypeIcon(type: Asset['type']): string {
  switch (type) {
    case 'image':
      return '🖼️'
    case 'audio':
      return '🎵'
    case 'video':
      return '🎬'
    default:
      return '📄'
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

watch(() => props.campaignId, fetchAssets, { immediate: true })

defineExpose({ refresh: fetchAssets, assets })
</script>

<template>
  <div class="asset-list">
    <div class="header">
      <h3>Assets</h3>
      <button @click="emit('upload')" class="btn-primary">Upload</button>
    </div>

    <div v-if="loading" class="loading">Loading assets...</div>

    <div v-else-if="assets.length === 0" class="empty">
      No assets yet. Upload some to get started.
    </div>

    <ul v-else class="list">
      <li
        v-for="asset in assets"
        :key="asset.id"
        :class="['item', { selected: asset.id === selectedAssetId }]"
      >
        <div class="info" @click="emit('select', asset)">
          <span class="icon">{{ getTypeIcon(asset.type) }}</span>
          <div class="details">
            <span class="name">{{ asset.name }}</span>
            <span class="meta">{{ asset.type }} · {{ formatSize(asset.size) }}</span>
          </div>
        </div>
        <button @click.stop="deleteAsset(asset.id)" class="btn-delete">×</button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.asset-list {
  border-left: 1px solid #40444b;
  padding: 1rem;
  overflow-y: auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.header h3 {
  margin: 0;
  font-size: 1rem;
}

.btn-primary {
  background: #5865f2;
  color: white;
  border: none;
  padding: 0.375rem 0.75rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
}

.btn-primary:hover {
  background: #4752c4;
}

.loading,
.empty {
  color: #72767d;
  text-align: center;
  padding: 1rem;
  font-size: 0.875rem;
}

.list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.item {
  display: flex;
  align-items: center;
  padding: 0.5rem;
  border-radius: 4px;
  margin-bottom: 0.25rem;
}

.item:hover {
  background: #36393f;
}

.item.selected {
  background: #5865f2;
}

.info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  overflow: hidden;
}

.icon {
  font-size: 1.25rem;
}

.details {
  overflow: hidden;
}

.name {
  display: block;
  font-size: 0.875rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta {
  display: block;
  font-size: 0.75rem;
  color: #72767d;
}

.item.selected .meta {
  color: rgba(255, 255, 255, 0.7);
}

.btn-delete {
  background: transparent;
  color: #72767d;
  border: none;
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  font-size: 1.25rem;
  line-height: 1;
}

.btn-delete:hover {
  color: #ed4245;
}
</style>
