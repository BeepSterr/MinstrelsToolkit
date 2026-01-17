<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { Campaign } from '../types'

const emit = defineEmits<{
  select: [campaign: Campaign]
  create: []
}>()

const campaigns = ref<Campaign[]>([])
const loading = ref(true)

async function fetchCampaigns() {
  loading.value = true
  try {
    const response = await fetch('/api/campaigns')
    campaigns.value = await response.json()
  } finally {
    loading.value = false
  }
}

async function deleteCampaign(id: string) {
  if (!confirm('Delete this campaign and all its assets?')) return

  await fetch(`/api/campaigns/${id}`, { method: 'DELETE' })
  await fetchCampaigns()
}

onMounted(fetchCampaigns)

defineExpose({ refresh: fetchCampaigns })
</script>

<template>
  <div class="campaign-list">
    <div class="header">
      <h2>Campaigns</h2>
      <button @click="emit('create')" class="btn-primary">New Campaign</button>
    </div>

    <div v-if="loading" class="loading">Loading campaigns...</div>

    <div v-else-if="campaigns.length === 0" class="empty">
      No campaigns yet. Create one to get started.
    </div>

    <ul v-else class="list">
      <li v-for="campaign in campaigns" :key="campaign.id" class="item">
        <div class="info" @click="emit('select', campaign)">
          <span class="name">{{ campaign.name }}</span>
          <span class="description">{{ campaign.description }}</span>
        </div>
        <button @click.stop="deleteCampaign(campaign.id)" class="btn-delete">
          Delete
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.campaign-list {
  padding: 1rem;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.header h2 {
  margin: 0;
}

.btn-primary {
  background: #5865f2;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
}

.btn-primary:hover {
  background: #4752c4;
}

.loading,
.empty {
  color: #72767d;
  text-align: center;
  padding: 2rem;
}

.list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: #2f3136;
  border-radius: 8px;
  margin-bottom: 0.5rem;
}

.info {
  flex: 1;
  cursor: pointer;
}

.name {
  display: block;
  font-weight: 500;
  color: #fff;
}

.description {
  display: block;
  font-size: 0.875rem;
  color: #72767d;
  margin-top: 0.25rem;
}

.btn-delete {
  background: transparent;
  color: #ed4245;
  border: 1px solid #ed4245;
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
}

.btn-delete:hover {
  background: #ed4245;
  color: white;
}
</style>
