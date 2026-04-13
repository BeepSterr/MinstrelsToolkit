<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Character, CharacterRole, DiscordUser } from '../types'

const props = defineProps<{
  campaignId: string
}>()

const emit = defineEmits<{
  edit: [character: Character]
  create: []
}>()

const characters = ref<Character[]>([])
const knownUsers = ref<DiscordUser[]>([])
const loading = ref(true)

async function fetchCharacters() {
  loading.value = true
  try {
    const response = await fetch(`/api/campaigns/${props.campaignId}/characters`)
    characters.value = await response.json()
  } finally {
    loading.value = false
  }
}

async function fetchKnownUsers() {
  const response = await fetch(`/api/campaigns/${props.campaignId}/known-users`)
  knownUsers.value = await response.json()
}

async function deleteCharacter(id: string) {
  if (!confirm('Delete this character?')) return
  await fetch(`/api/campaigns/${props.campaignId}/characters/${id}`, {
    method: 'DELETE',
  })
  await fetchCharacters()
}

const roleColors: Record<CharacterRole, string> = {
  NONE: '#72767d',
  DPS: '#ed4245',
  TANK: '#5865f2',
  HEALER: '#3ba55c',
}

function getUserName(discordUserId: string | null): string | null {
  if (!discordUserId) return null
  const user = knownUsers.value.find(u => u.id === discordUserId)
  return user?.global_name || user?.username || discordUserId
}

watch(() => props.campaignId, () => {
  fetchCharacters()
  fetchKnownUsers()
}, { immediate: true })

defineExpose({ refresh: fetchCharacters })
</script>

<template>
  <div class="character-panel">
    <div class="panel-header">
      <h3>Characters</h3>
      <button @click="emit('create')" class="btn-add">+ New</button>
    </div>

    <div v-if="loading" class="loading">Loading...</div>

    <div v-else-if="characters.length === 0" class="empty">
      No characters yet
    </div>

    <ul v-else class="character-list">
      <li v-for="character in characters" :key="character.id" class="character-item" :style="{ borderLeftColor: roleColors[character.role || 'NONE'] }">
        <div class="character-info">
          <span class="character-name">{{ character.name }}</span>
          <span v-if="character.discordUserId" class="assigned-user">
            {{ getUserName(character.discordUserId) }}
          </span>
          <span v-else class="unassigned">Unassigned</span>
        </div>
        <div class="character-actions">
          <button @click="emit('edit', character)" class="btn-icon" title="Edit">✏️</button>
          <button @click="deleteCharacter(character.id)" class="btn-icon" title="Delete">🗑️</button>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.character-panel {
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

.loading, .empty {
  color: #72767d;
  font-size: 0.875rem;
  text-align: center;
  padding: 1rem;
}

.character-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.character-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.5rem 0.5rem 0.75rem;
  background: #40444b;
  border-radius: 4px;
  margin-bottom: 0.5rem;
  border-left: 3px solid #72767d;
}

.character-info {
  flex: 1;
  min-width: 0;
}

.character-name {
  display: block;
  font-size: 0.875rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.assigned-user {
  display: block;
  font-size: 0.75rem;
  color: #5865f2;
}

.unassigned {
  display: block;
  font-size: 0.75rem;
  color: #72767d;
  font-style: italic;
}

.character-actions {
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
</style>
