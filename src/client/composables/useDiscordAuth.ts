import { ref, shallowRef } from 'vue'
import { DiscordSDK } from '@discord/embedded-app-sdk'
import type { DiscordUser } from '../types'

const DISCORD_CLIENT_ID = '1415063089795039272'

const discordSdk = shallowRef<DiscordSDK | null>(null)
const user = ref<DiscordUser | null>(null)
const ready = ref(false)
const error = ref<string | null>(null)
const loading = ref(false)

let initPromise: Promise<void> | null = null

async function initAndAuthenticate(): Promise<void> {
  if (initPromise) return initPromise

  initPromise = (async () => {
    loading.value = true
    error.value = null

    try {
      // Initialize the Discord SDK
      const sdk = new DiscordSDK(DISCORD_CLIENT_ID)
      await sdk.ready()
      discordSdk.value = sdk

      // Request OAuth authorization
      const { code } = await sdk.commands.authorize({
        client_id: DISCORD_CLIENT_ID,
        response_type: 'code',
        state: '',
        prompt: 'none',
        scope: ['identify'],
      })

      // Exchange code for access token on our server
      const tokenResponse = await fetch('/api/discord/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })

      if (!tokenResponse.ok) {
        throw new Error('Failed to exchange token')
      }

      const { access_token } = await tokenResponse.json()

      // Authenticate with Discord using the access token
      const authResult = await sdk.commands.authenticate({ access_token })

      if (authResult.user) {
        user.value = {
          id: authResult.user.id,
          username: authResult.user.username,
          avatar: authResult.user.avatar ?? null,
          discriminator: authResult.user.discriminator ?? '0',
          global_name: authResult.user.global_name ?? null,
        }
      }

      ready.value = true
    } catch (e) {
      console.error('Discord auth error:', e)
      error.value = e instanceof Error ? e.message : 'Failed to authenticate with Discord'

      // Still mark as ready so the app can continue (possibly in fallback mode)
      ready.value = true
    } finally {
      loading.value = false
    }
  })()

  return initPromise
}

export function useDiscordAuth() {
  return {
    discordSdk,
    user,
    ready,
    error,
    loading,
    initAndAuthenticate,
  }
}
