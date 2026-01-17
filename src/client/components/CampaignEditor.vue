<script setup lang="ts">
import { ref } from 'vue'
import type { Campaign } from '../types'

const props = defineProps<{
  campaign?: Campaign
}>()

const emit = defineEmits<{
  save: [campaign: Campaign]
  cancel: []
}>()

const name = ref(props.campaign?.name ?? '')
const description = ref(props.campaign?.description ?? '')
const saving = ref(false)
const error = ref<string | null>(null)

async function handleSubmit() {
  if (!name.value.trim()) {
    error.value = 'Name is required'
    return
  }

  saving.value = true
  error.value = null

  try {
    const url = props.campaign
      ? `/api/campaigns/${props.campaign.id}`
      : '/api/campaigns'

    const response = await fetch(url, {
      method: props.campaign ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.value.trim(),
        description: description.value.trim(),
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to save campaign')
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
  <div class="campaign-editor">
    <h2>{{ campaign ? 'Edit Campaign' : 'New Campaign' }}</h2>

    <form @submit.prevent="handleSubmit">
      <div class="field">
        <label for="name">Name</label>
        <input
          id="name"
          v-model="name"
          type="text"
          placeholder="Campaign name"
          :disabled="saving"
        />
      </div>

      <div class="field">
        <label for="description">Description</label>
        <textarea
          id="description"
          v-model="description"
          placeholder="Optional description"
          rows="3"
          :disabled="saving"
        ></textarea>
      </div>

      <div v-if="error" class="error">{{ error }}</div>

      <div class="actions">
        <button type="button" @click="emit('cancel')" :disabled="saving">
          Cancel
        </button>
        <button type="submit" class="btn-primary" :disabled="saving">
          {{ saving ? 'Saving...' : 'Save' }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.campaign-editor {
  padding: 1rem;
  max-width: 500px;
}

h2 {
  margin-top: 0;
  margin-bottom: 1.5rem;
}

.field {
  margin-bottom: 1rem;
}

label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

input,
textarea {
  width: 100%;
  padding: 0.75rem;
  background: #40444b;
  border: 1px solid #40444b;
  border-radius: 4px;
  color: #fff;
  font-size: 1rem;
  box-sizing: border-box;
}

input:focus,
textarea:focus {
  border-color: #5865f2;
  outline: none;
}

input::placeholder,
textarea::placeholder {
  color: #72767d;
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
