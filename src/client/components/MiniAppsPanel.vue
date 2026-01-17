<script setup lang="ts">
import { computed } from 'vue'
import { useWebSocket } from '../composables/useWebSocket'
import { getAllMiniApps, getMiniApp } from '../miniapps/registry'

defineProps<{
  campaignId: string
}>()

const {
  miniAppState,
  enableMiniApp,
  disableMiniApp,
} = useWebSocket()

const allApps = computed(() => getAllMiniApps())

function isEnabled(appId: string): boolean {
  return miniAppState.value.enabledApps.includes(appId)
}

function toggleApp(appId: string): void {
  if (isEnabled(appId)) {
    disableMiniApp(appId)
  } else {
    enableMiniApp(appId)
  }
}

// Get enabled apps with their GM controls
const enabledAppsWithControls = computed(() => {
  return miniAppState.value.enabledApps
    .map((id) => getMiniApp(id))
    .filter((app) => app !== undefined && app.gmControlsComponent)
})
</script>

<template>
  <div class="mini-apps-panel">
    <div class="apps-list">
      <h3>Available Apps</h3>
      <div
        v-for="app in allApps"
        :key="app.id"
        class="app-item"
      >
        <div class="app-info">
          <span class="app-icon">{{ app.icon }}</span>
          <div class="app-details">
            <span class="app-name">{{ app.name }}</span>
            <span class="app-description">{{ app.description }}</span>
          </div>
        </div>
        <label class="toggle">
          <input
            type="checkbox"
            :checked="isEnabled(app.id)"
            @change="toggleApp(app.id)"
          />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <div v-if="enabledAppsWithControls.length > 0" class="app-controls">
      <h3>App Controls</h3>
      <div
        v-for="app in enabledAppsWithControls"
        :key="app.id"
        class="control-section"
      >
        <h4>{{ app.icon }} {{ app.name }}</h4>
        <component
          :is="app.gmControlsComponent"
          :campaign-id="campaignId"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.mini-apps-panel {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1rem;
}

.apps-list h3,
.app-controls h3 {
  margin: 0 0 0.75rem;
  font-size: 0.875rem;
  color: #72767d;
  text-transform: uppercase;
  font-weight: 600;
}

.app-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem;
  background: #36393f;
  border-radius: 8px;
  margin-bottom: 0.5rem;
}

.app-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.app-icon {
  font-size: 1.5rem;
}

.app-details {
  display: flex;
  flex-direction: column;
}

.app-name {
  color: #fff;
  font-weight: 500;
}

.app-description {
  font-size: 0.75rem;
  color: #72767d;
}

/* Toggle switch */
.toggle {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  cursor: pointer;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #72767d;
  border-radius: 24px;
  transition: 0.2s;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  left: 3px;
  bottom: 3px;
  background: #fff;
  border-radius: 50%;
  transition: 0.2s;
}

.toggle input:checked + .toggle-slider {
  background: #3ba55c;
}

.toggle input:checked + .toggle-slider::before {
  transform: translateX(20px);
}

/* App controls section */
.app-controls {
  border-top: 1px solid #40444b;
  padding-top: 1rem;
}

.control-section {
  background: #36393f;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 0.75rem;
}

.control-section h4 {
  margin: 0 0 0.75rem;
  font-size: 0.875rem;
  color: #dcddde;
}
</style>
