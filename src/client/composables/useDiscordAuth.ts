import { ref, shallowRef } from 'vue'
import { DiscordSDK } from '@discord/embedded-app-sdk'
import type { DiscordUser } from '../types'

const DISCORD_CLIENT_ID = '1415063089795039272'
const SESSION_CACHE_KEY = 'bardbox-session'

interface CachedSession {
  sessionToken: string
  user: DiscordUser
  expiresAt: number
}

const discordSdk = shallowRef<DiscordSDK | null>(null)
const user = ref<DiscordUser | null>(null)
const sessionToken = ref<string | null>(null)
const isGuest = ref(false)
const ready = ref(false)
const error = ref<string | null>(null)
const loading = ref(false)

let authPromise: Promise<void> | null = null

/**
 * The Discord SDK only works inside an activity iframe, which Discord always
 * launches with a frame_id query param. Anywhere else (local dev, a plain
 * browser tab) we fall back to a guest session.
 */
function isDiscordActivity(): boolean {
  return new URLSearchParams(window.location.search).has('frame_id')
}

function getCachedSession(): CachedSession | null {
  try {
    const cached = localStorage.getItem(SESSION_CACHE_KEY)
    if (!cached) return null
    const session = JSON.parse(cached) as CachedSession
    if (!session.sessionToken || !session.user) return null
    if (!session.expiresAt || session.expiresAt <= Date.now()) return null
    return session
  } catch {
    return null
  }
}

function setCachedSession(session: CachedSession): void {
  try {
    localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(session))
  } catch {
    // Ignore storage errors
  }
}

function clearCachedSession(): void {
  try {
    localStorage.removeItem(SESSION_CACHE_KEY)
  } catch {
    // Ignore storage errors
  }
}

function applySession(session: CachedSession, guest: boolean): void {
  user.value = session.user
  sessionToken.value = session.sessionToken
  isGuest.value = guest
}

async function authenticateWithDiscord(): Promise<void> {
  const sdk = new DiscordSDK(DISCORD_CLIENT_ID)
  await sdk.ready()
  discordSdk.value = sdk

  // prompt: 'none' keeps this silent for anyone who already authorized the app,
  // so there is no reason to cache the result across reloads.
  const { code } = await sdk.commands.authorize({
    client_id: DISCORD_CLIENT_ID,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify'],
  })

  const response = await fetch('/api/discord/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })

  if (!response.ok) {
    throw new Error('Failed to exchange Discord authorization code')
  }

  const data = await response.json()

  // Tell Discord the user is authenticated so SDK commands and events work for
  // the rest of this session.
  await sdk.commands.authenticate({ access_token: data.access_token })

  applySession({ sessionToken: data.session_token, user: data.user, expiresAt: data.expires_at }, false)
  clearCachedSession()
}

async function startGuestSession(): Promise<void> {
  const response = await fetch('/api/session/guest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })

  if (!response.ok) {
    throw new Error('Failed to start a guest session')
  }

  const data = await response.json()
  const session: CachedSession = {
    sessionToken: data.session_token,
    user: data.user,
    expiresAt: data.expires_at,
  }
  applySession(session, true)
  setCachedSession(session)
}

async function run(): Promise<void> {
  loading.value = true
  error.value = null

  try {
    if (isDiscordActivity()) {
      await authenticateWithDiscord()
      return
    }

    // Outside Discord, reuse the cached guest session so reloads keep the same
    // identity until it expires.
    const cached = getCachedSession()
    if (cached) {
      applySession(cached, true)
      return
    }

    await startGuestSession()
  } catch (e) {
    console.error('Discord auth error:', e)
    error.value = e instanceof Error ? e.message : 'Failed to authenticate with Discord'
    clearCachedSession()

    // Keep the app usable even when Discord auth fails.
    try {
      await startGuestSession()
    } catch (guestError) {
      console.error('Guest session error:', guestError)
      user.value = null
      sessionToken.value = null
    }
  } finally {
    loading.value = false
    ready.value = true
  }
}

function initAndAuthenticate(): Promise<void> {
  if (!authPromise) {
    authPromise = run()
  }
  return authPromise
}

/**
 * Called when the server rejects our session (expired, or the server restarted).
 * Drops the cached session and runs the whole flow again.
 */
function reauthenticate(): Promise<void> {
  clearCachedSession()
  user.value = null
  sessionToken.value = null
  authPromise = run()
  return authPromise
}

export function useDiscordAuth() {
  return {
    discordSdk,
    user,
    sessionToken,
    isGuest,
    ready,
    error,
    loading,
    initAndAuthenticate,
    reauthenticate,
  }
}
