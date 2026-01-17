<script setup lang="ts">
import { computed } from 'vue'
import { useWebSocket } from '../composables/useWebSocket'
import { getMiniApp } from '../miniapps/registry'

defineProps<{
  campaignId: string
  isGM?: boolean
}>()

const { miniAppState, currentUser } = useWebSocket()

const enabledApps = computed(() => {
  return miniAppState.value.enabledApps
    .map((id) => getMiniApp(id))
    .filter((app) => app !== undefined)
})

const hasEnabledApps = computed(() => enabledApps.value.length > 0)
</script>

<template>
  <div class="mini-apps-container">
    <template v-if="hasEnabledApps">
      <div
        v-for="app in enabledApps"
        :key="app.id"
        class="mini-app-wrapper"
      >
        <component
          :is="app.component"
          :campaign-id="campaignId"
          :is-g-m="isGM"
          :current-user="currentUser ? { oderId: currentUser.id, username: currentUser.username } : undefined"
        />
      </div>
    </template>
    <div v-else class="waiting-state">
<!--      <p class="waiting-text">Waiting for GM...</p>-->
<!--      <span class="waiting-hint">The game master will enable apps when ready</span>-->
    </div>
  </div>
</template>

<style scoped>
.mini-apps-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
}

.mini-app-wrapper {
  flex: 1;
  min-height: 200px;
  display: flex;
  flex-direction: column;
}

.waiting-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #72767d;
}

.waiting-text {
  font-size: 1.25rem;
  margin: 0 0 0.5rem;
}

.waiting-hint {
  font-size: 0.875rem;
}
</style>
