<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { Campaign } from '../types'

const emit = defineEmits<{
  select: [campaign: Campaign]
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

onMounted(fetchCampaigns)
</script>

<template>
  <div class="player-select">
    <div class="header">
      <h1>Bardbox</h1>
      <p class="subtitle">Select a campaign to join</p>
    </div>

    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>Loading campaigns...</p>
    </div>

    <div v-else-if="campaigns.length === 0" class="empty">
      <p>No campaigns available</p>
      <span class="hint">Ask the game master to create one</span>
    </div>

    <div v-else class="campaign-grid">
      <button
        v-for="campaign in campaigns"
        :key="campaign.id"
        class="campaign-card"
        @click="emit('select', campaign)"
      >
        <span class="campaign-name">{{ campaign.name }}</span>
        <span v-if="campaign.description" class="campaign-desc">
          {{ campaign.description }}
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.player-select {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem;
}

.header {
  text-align: center;
  margin-bottom: 2rem;
}

.header h1 {
  margin: 0;
  font-size: 2rem;
  color: #fff;
}

.subtitle {
  margin: 0.5rem 0 0;
  color: #72767d;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  color: #72767d;
  margin-top: 3rem;
}

.spinner {
  width: 40px;
  height: 40px;
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

.empty {
  text-align: center;
  color: #72767d;
  margin-top: 3rem;
}

.empty p {
  margin: 0;
  font-size: 1.125rem;
}

.hint {
  font-size: 0.875rem;
}

.campaign-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 1rem;
  width: 100%;
  max-width: 800px;
}

.campaign-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 1.25rem;
  background: #2f3136;
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
}

.campaign-card:hover {
  background: #36393f;
  border-color: #5865f2;
}

.campaign-name {
  font-size: 1.125rem;
  font-weight: 600;
  color: #fff;
}

.campaign-desc {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: #72767d;
}
</style>
