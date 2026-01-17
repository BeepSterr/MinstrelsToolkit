<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  campaignId: string
}>()

const emit = defineEmits<{
  uploaded: []
  cancel: []
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const files = ref<File[]>([])
const uploading = ref(false)
const progress = ref(0)
const error = ref<string | null>(null)

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files) {
    files.value = Array.from(input.files)
  }
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer?.files) {
    files.value = Array.from(event.dataTransfer.files)
  }
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
}

function removeFile(index: number) {
  files.value = files.value.filter((_, i) => i !== index)
}

async function uploadFiles() {
  if (files.value.length === 0) return

  uploading.value = true
  error.value = null
  progress.value = 0

  try {
    for (let i = 0; i < files.value.length; i++) {
      const file = files.value[i]
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(
        `/api/campaigns/${props.campaignId}/assets`,
        {
          method: 'POST',
          body: formData,
        }
      )

      if (!response.ok) {
        throw new Error(`Failed to upload ${file.name}`)
      }

      progress.value = ((i + 1) / files.value.length) * 100
    }

    emit('uploaded')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Upload failed'
  } finally {
    uploading.value = false
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <div class="asset-uploader">
    <h3>Upload Assets</h3>

    <div
      class="drop-zone"
      @drop="handleDrop"
      @dragover="handleDragOver"
      @click="fileInput?.click()"
    >
      <input
        ref="fileInput"
        type="file"
        multiple
        accept="image/*,audio/*,video/*"
        @change="handleFileSelect"
        style="display: none"
      />
      <p>Drop files here or click to select</p>
      <span class="hint">Images, audio, and video files</span>
    </div>

    <ul v-if="files.length > 0" class="file-list">
      <li v-for="(file, index) in files" :key="index" class="file-item">
        <span class="file-name">{{ file.name }}</span>
        <span class="file-size">{{ formatSize(file.size) }}</span>
        <button
          @click="removeFile(index)"
          :disabled="uploading"
          class="btn-remove"
        >
          ×
        </button>
      </li>
    </ul>

    <div v-if="uploading" class="progress">
      <div class="progress-bar" :style="{ width: `${progress}%` }"></div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div class="actions">
      <button @click="emit('cancel')" :disabled="uploading">Cancel</button>
      <button
        @click="uploadFiles"
        :disabled="files.length === 0 || uploading"
        class="btn-primary"
      >
        {{ uploading ? 'Uploading...' : 'Upload' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.asset-uploader {
  padding: 1rem;
  max-width: 500px;
}

h3 {
  margin-top: 0;
  margin-bottom: 1rem;
}

.drop-zone {
  border: 2px dashed #40444b;
  border-radius: 8px;
  padding: 2rem;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s;
}

.drop-zone:hover {
  border-color: #5865f2;
}

.drop-zone p {
  margin: 0 0 0.5rem;
}

.hint {
  font-size: 0.875rem;
  color: #72767d;
}

.file-list {
  list-style: none;
  padding: 0;
  margin: 1rem 0;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background: #40444b;
  border-radius: 4px;
  margin-bottom: 0.25rem;
}

.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  font-size: 0.875rem;
  color: #72767d;
}

.btn-remove {
  background: transparent;
  border: none;
  color: #72767d;
  cursor: pointer;
  font-size: 1.25rem;
  line-height: 1;
  padding: 0.25rem;
}

.btn-remove:hover:not(:disabled) {
  color: #ed4245;
}

.progress {
  height: 4px;
  background: #40444b;
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 1rem;
}

.progress-bar {
  height: 100%;
  background: #5865f2;
  transition: width 0.2s;
}

.error {
  color: #ed4245;
  margin-bottom: 1rem;
}

.actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

button {
  padding: 0.75rem 1.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
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
</style>
