<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { Campaign } from './types'
import CampaignList from './components/CampaignList.vue'
import CampaignEditor from './components/CampaignEditor.vue'
import PlaybackView from './components/PlaybackView.vue'
import { useWebSocket } from './composables/useWebSocket'

type View = 'list' | 'create' | 'edit' | 'playback'

const currentView = ref<View>('list')
const selectedCampaign = ref<Campaign | null>(null)
const campaignListRef = ref<InstanceType<typeof CampaignList> | null>(null)

const { connect } = useWebSocket()

function showCampaignList() {
  currentView.value = 'list'
  selectedCampaign.value = null
}

function showCreateCampaign() {
  currentView.value = 'create'
  selectedCampaign.value = null
}

function showEditCampaign(campaign: Campaign) {
  selectedCampaign.value = campaign
  currentView.value = 'edit'
}

function showPlayback(campaign: Campaign) {
  selectedCampaign.value = campaign
  currentView.value = 'playback'
}

function handleCampaignSaved(campaign: Campaign) {
  showPlayback(campaign)
  campaignListRef.value?.refresh()
}

function handleCampaignSelect(campaign: Campaign) {
  showPlayback(campaign)
}

onMounted(() => {
  connect()
})
</script>

<template>
  <div class="app">
    <CampaignList
      v-if="currentView === 'list'"
      ref="campaignListRef"
      @select="handleCampaignSelect"
      @create="showCreateCampaign"
    />

    <CampaignEditor
      v-else-if="currentView === 'create'"
      @save="handleCampaignSaved"
      @cancel="showCampaignList"
    />

    <CampaignEditor
      v-else-if="currentView === 'edit' && selectedCampaign"
      :campaign="selectedCampaign"
      @save="handleCampaignSaved"
      @cancel="showCampaignList"
    />

    <PlaybackView
      v-else-if="currentView === 'playback' && selectedCampaign"
      :campaign-id="selectedCampaign.id"
      :campaign-name="selectedCampaign.name"
      @back="showCampaignList"
    />
  </div>
</template>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
    Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  background: #36393f;
  color: #dcddde;
  line-height: 1.5;
}

.app {
  min-height: 100vh;
}
</style>
