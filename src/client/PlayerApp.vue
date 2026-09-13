<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import type { Campaign } from './types'
import PlayerCampaignSelect from './components/PlayerCampaignSelect.vue'
import PlayerPlaybackView from './components/PlayerPlaybackView.vue'
import { useDiscordAuth } from './composables/useDiscordAuth'
import { useWebSocket } from './composables/useWebSocket'

const selectedCampaign = ref<Campaign | null>(null)

const {
  user,
  sessionToken,
  isGuest,
  ready: discordReady,
  error: discordError,
  initAndAuthenticate,
  reauthenticate,
} = useDiscordAuth()
const { connect, identify, onMessage } = useWebSocket()

// When auth completes and we have a session, connect to WebSocket and identify
watch(sessionToken, (token) => {
  if (token) {
    identify(token)
    connect()
  }
})

// The server rejects sessions it no longer knows (expired, or it restarted) -
// authenticate again and identify with the new session.
const unsubscribe = onMessage((message) => {
  if (message.type === 'auth-required') {
    reauthenticate().then(() => {
      if (sessionToken.value) {
        identify(sessionToken.value)
      }
    })
  }
})

onUnmounted(() => {
  unsubscribe()
})

function handleSelect(campaign: Campaign) {
  selectedCampaign.value = campaign
}

function handleLeave() {
  selectedCampaign.value = null
}

onMounted(() => {
  initAndAuthenticate()
})
</script>

<template>
  <div class="player-app">
    <template v-if="!discordReady">
      <div class="loading-screen">
        <div class="spinner"></div>
        <p>Connecting...</p>
      </div>
    </template>

    <template v-else>
      <div v-if="discordError" class="discord-warning">
        {{ discordError }}
      </div>

      <div v-else-if="isGuest" class="guest-notice">
        Playing as {{ user?.username }}
      </div>

      <PlayerPlaybackView
        v-if="selectedCampaign"
        :campaign-id="selectedCampaign.id"
        :campaign-name="selectedCampaign.name"
        @leave="handleLeave"
      />

      <PlayerCampaignSelect v-else @select="handleSelect" />
    </template>
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
  background: #202225;
  color: #dcddde;
  line-height: 1.5;
}

.player-app {
  min-height: 100vh;
}

.loading-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  color: #72767d;
}

.loading-screen .spinner {
  width: 40px;
  height: 40px;
  margin-bottom: 1rem;
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

.discord-warning {
  background: #faa61a;
  color: #000;
  padding: 0.5rem 1rem;
  text-align: center;
  font-size: 0.875rem;
}

.guest-notice {
  background: #4f545c;
  color: #fff;
  padding: 0.5rem 1rem;
  text-align: center;
  font-size: 0.875rem;
}
</style>
