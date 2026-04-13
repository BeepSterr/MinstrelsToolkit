<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Character, CharacterRole, DiscordUser } from '../types'

const props = defineProps<{
  campaignId: string
  character?: Character
}>()

const emit = defineEmits<{
  save: [character: Character]
  cancel: []
}>()

const name = ref('')
const description = ref('')
const role = ref<CharacterRole>('NONE')
const discordUserId = ref<string | null>(null)
const knownUsers = ref<DiscordUser[]>([])
const saving = ref(false)

async function fetchKnownUsers() {
  const response = await fetch(`/api/campaigns/${props.campaignId}/known-users`)
  knownUsers.value = await response.json()
}

function loadCharacter() {
  if (props.character) {
    name.value = props.character.name
    description.value = props.character.description
    role.value = props.character.role || 'NONE'
    discordUserId.value = props.character.discordUserId
  } else {
    name.value = ''
    description.value = ''
    role.value = 'NONE'
    discordUserId.value = null
  }
}

watch(() => props.character, loadCharacter, { immediate: true })
watch(() => props.campaignId, fetchKnownUsers, { immediate: true })

async function handleSubmit() {
  if (!name.value.trim()) return
  saving.value = true

  try {
    const url = props.character
      ? `/api/campaigns/${props.campaignId}/characters/${props.character.id}`
      : `/api/campaigns/${props.campaignId}/characters`

    const response = await fetch(url, {
      method: props.character ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.value.trim(),
        description: description.value.trim(),
        role: role.value,
        discordUserId: discordUserId.value || null,
      }),
    })

    const saved = await response.json()
    emit('save', saved)
  } finally {
    saving.value = false
  }
}

function getUserLabel(user: DiscordUser): string {
  return user.global_name || user.username
}
</script>

<template>
  <div class="character-editor">
    <div class="panel-header">
      <h3>{{ character ? 'Edit Character' : 'New Character' }}</h3>
    </div>

    <form @submit.prevent="handleSubmit" class="editor-form">
      <div class="field">
        <label for="char-name">Name</label>
        <input
          id="char-name"
          v-model="name"
          type="text"
          placeholder="Character name"
          required
        />
      </div>

      <div class="field">
        <label for="char-desc">Description</label>
        <textarea
          id="char-desc"
          v-model="description"
          placeholder="Optional description"
          rows="3"
        ></textarea>
      </div>

      <div class="field">
        <label for="char-role">Role</label>
        <select id="char-role" v-model="role">
          <option value="NONE">None</option>
          <option value="DPS">DPS</option>
          <option value="TANK">Tank</option>
          <option value="HEALER">Healer</option>
        </select>
      </div>

      <div class="field">
        <label for="char-user">Assigned Player</label>
        <select id="char-user" v-model="discordUserId">
          <option :value="null">-- None --</option>
          <option
            v-for="user in knownUsers"
            :key="user.id"
            :value="user.id"
          >
            {{ getUserLabel(user) }}
          </option>
        </select>
        <span v-if="knownUsers.length === 0" class="hint">
          Players appear here after joining this campaign in Discord
        </span>
      </div>

      <div class="actions">
        <button type="button" @click="emit('cancel')" class="btn-cancel">Cancel</button>
        <button type="submit" :disabled="!name.trim() || saving" class="btn-save">
          {{ saving ? 'Saving...' : (character ? 'Save' : 'Create') }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.character-editor {
  padding: 0.75rem;
  border-top: 1px solid #40444b;
}

.panel-header {
  margin-bottom: 0.75rem;
}

.panel-header h3 {
  margin: 0;
  font-size: 0.875rem;
  color: #72767d;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.editor-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.field label {
  font-size: 0.75rem;
  color: #72767d;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.field input,
.field textarea,
.field select {
  background: #40444b;
  border: 1px solid #40444b;
  color: #dcddde;
  padding: 0.5rem;
  border-radius: 4px;
  font-size: 0.875rem;
  font-family: inherit;
}

.field input:focus,
.field textarea:focus,
.field select:focus {
  border-color: #5865f2;
  outline: none;
}

.field select {
  cursor: pointer;
}

.hint {
  font-size: 0.6875rem;
  color: #72767d;
  font-style: italic;
}

.actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  margin-top: 0.25rem;
}

.btn-cancel {
  background: transparent;
  border: 1px solid #72767d;
  color: #72767d;
  padding: 0.375rem 0.75rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8125rem;
}

.btn-cancel:hover {
  color: #dcddde;
  border-color: #dcddde;
}

.btn-save {
  background: #5865f2;
  border: none;
  color: white;
  padding: 0.375rem 0.75rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8125rem;
}

.btn-save:hover:not(:disabled) {
  background: #4752c4;
}

.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
