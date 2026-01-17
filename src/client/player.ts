import { createApp } from 'vue'
import PlayerApp from './PlayerApp.vue'
import { enableRemoteLogging } from './utils/remoteLog'
import './miniapps'

// Enable remote logging for debugging embedded app
enableRemoteLogging()

createApp(PlayerApp).mount('#app')
