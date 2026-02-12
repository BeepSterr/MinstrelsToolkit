<script setup lang="ts">
import { ref, computed, watch } from 'vue'
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
const searchQuery = ref('')
const editingId = ref<string | null>(null)
const editingName = ref('')
const compressing = ref(false)
const compressResult = ref<string | null>(null)

const filteredAssets = computed(() => {
  const query = searchQuery.value.toLowerCase().trim()
  if (!query) return assets.value
  return assets.value.filter(a => a.name.toLowerCase().includes(query))
})

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

function startRename(asset: Asset) {
  editingId.value = asset.id
  editingName.value = asset.name
}

async function submitRename(asset: Asset) {
  const newName = editingName.value.trim()
  editingId.value = null
  if (!newName || newName === asset.name) return

  await fetch(`/api/campaigns/${props.campaignId}/assets/${asset.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
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

async function compressAll() {
  compressing.value = true
  compressResult.value = null
  try {
    const response = await fetch(`/api/campaigns/${props.campaignId}/compress-audio`, {
      method: 'POST',
    })
    const data = await response.json()
    compressResult.value = `Compressed ${data.compressed}/${data.total}, skipped ${data.skipped}, saved ${formatSize(data.savedBytes)}`
    await fetchAssets()
    setTimeout(() => { compressResult.value = null }, 5000)
  } catch {
    compressResult.value = 'Compression failed'
    setTimeout(() => { compressResult.value = null }, 5000)
  } finally {
    compressing.value = false
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const totalSize = computed(() => formatSize(assets.value.reduce((sum, a) => sum + a.size, 0)))

watch(() => props.campaignId, fetchAssets, { immediate: true })

defineExpose({ refresh: fetchAssets, assets })
</script>

<template>
  <div class="asset-list">
    <div class="header">
      <div>
        <h3>Assets</h3>
        <span v-if="assets.length > 0" class="total-size">{{ assets.length }} files · {{ totalSize }}</span>
      </div>
      <div class="header-actions">
        <button
          @click="compressAll"
          :disabled="compressing"
          class="btn-compress"
          title="Compress all audio assets"
        >
          <span :class="{ spinning: compressing }">↻</span>
        </button>
        <button @click="emit('upload')" class="btn-primary">Upload</button>
      </div>
    </div>
    <div v-if="compressResult" class="compress-result">{{ compressResult }}</div>

    <div v-if="loading" class="loading">Loading assets...</div>

    <template v-else>
      <input
        v-if="assets.length > 0"
        v-model="searchQuery"
        type="text"
        placeholder="Search assets..."
        class="search-input"
      />

      <div v-if="assets.length === 0" class="empty">
        No assets yet. Upload some to get started.
      </div>

      <div v-else-if="filteredAssets.length === 0" class="empty">
        No matches found
      </div>

      <ul v-else class="list">
        <li
          v-for="asset in filteredAssets"
          :key="asset.id"
          :class="['item', { selected: asset.id === selectedAssetId }]"
        >
          <div class="info" @click="emit('select', asset)">
            <span class="icon">{{ getTypeIcon(asset.type) }}</span>
            <div class="details">
              <input
                v-if="editingId === asset.id"
                v-model="editingName"
                class="rename-input"
                @keydown.enter="submitRename(asset)"
                @keydown.escape="editingId = null"
                @blur="submitRename(asset)"
                @click.stop
                ref="renameInput"
                @vue:mounted="($event: any) => $event.el.focus()"
              />
              <span v-else class="name" @dblclick.stop="startRename(asset)">{{ asset.name }}</span>
              <span class="meta">{{ asset.type }} · {{ formatSize(asset.size) }}</span>
            </div>
          </div>
          <button @click.stop="deleteAsset(asset.id)" class="btn-delete">×</button>
        </li>
      </ul>
    </template>
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

.total-size {
  font-size: 0.75rem;
  color: #72767d;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.btn-compress {
  background: #40444b;
  color: #dcddde;
  border: none;
  width: 32px;
  height: 32px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1.125rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-compress:hover:not(:disabled) {
  background: #5865f2;
}

.btn-compress:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinning {
  display: inline-block;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.compress-result {
  font-size: 0.75rem;
  color: #3ba55c;
  text-align: center;
  padding: 0.25rem 0;
  margin-bottom: 0.5rem;
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

.search-input {
  width: 100%;
  padding: 0.5rem;
  margin-bottom: 0.75rem;
  background: #40444b;
  border: 1px solid #40444b;
  border-radius: 4px;
  color: #fff;
  font-size: 0.875rem;
  box-sizing: border-box;
}

.search-input:focus {
  border-color: #5865f2;
  outline: none;
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

.rename-input {
  background: #40444b;
  border: 1px solid #5865f2;
  border-radius: 3px;
  color: #fff;
  font-size: 0.875rem;
  padding: 0.125rem 0.25rem;
  width: 100%;
  box-sizing: border-box;
  outline: none;
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
