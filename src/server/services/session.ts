import type { DiscordUser } from '../types'

export interface Session {
  token: string
  user: DiscordUser
  expiresAt: number
  isGuest: boolean
}

// Sessions live in memory only - a server restart invalidates them, and clients
// re-authenticate when the websocket answers their identify with 'auth-required'.
const sessions = new Map<string, Session>()

const GUEST_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const MAX_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

function newToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function sweep(): void {
  const now = Date.now()
  for (const [token, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(token)
  }
}

function create(user: DiscordUser, ttlMs: number, isGuest: boolean): Session {
  sweep()
  const session: Session = {
    token: newToken(),
    user,
    expiresAt: Date.now() + Math.min(ttlMs, MAX_SESSION_TTL_MS),
    isGuest,
  }
  sessions.set(session.token, session)
  return session
}

/**
 * Creates a session for a user whose identity was verified against Discord's
 * /users/@me. The session outlives nothing: it expires with the OAuth token
 * that proved the identity, and re-authorizing inside the activity is silent.
 */
export function createDiscordSession(user: DiscordUser, expiresInSeconds: number): Session {
  const ttl = expiresInSeconds > 0 ? expiresInSeconds * 1000 : 24 * 60 * 60 * 1000
  return create(user, ttl, false)
}

/**
 * Creates an unverified session for someone running the player outside Discord
 * (local development, or a plain browser tab). Guest ids are prefixed so they
 * can never collide with a real Discord snowflake.
 */
export function createGuestSession(username?: string): Session {
  const suffix = Math.floor(1000 + Math.random() * 9000)
  const name = username?.trim().slice(0, 32) || `Guest ${suffix}`
  const user: DiscordUser = {
    id: `guest-${newToken().slice(0, 16)}`,
    username: name,
    avatar: null,
    discriminator: '0',
    global_name: null,
  }
  return create(user, GUEST_SESSION_TTL_MS, true)
}

export function getSession(token: string | undefined | null): Session | null {
  if (!token) return null
  const session = sessions.get(token)
  if (!session) return null
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token)
    return null
  }
  return session
}
