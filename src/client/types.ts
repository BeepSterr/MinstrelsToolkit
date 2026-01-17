export interface Campaign {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
}

export interface Asset {
  id: string
  campaignId: string
  name: string
  type: 'image' | 'audio' | 'video'
  filename: string
  mimeType: string
  size: number
  createdAt: string
}

export interface Playlist {
  id: string
  campaignId: string
  name: string
  assetIds: string[]
  createdAt: string
  updatedAt: string
}

export interface PlaybackState {
  assetId: string | null
  playing: boolean
  currentTime: number
  timestamp: number
  // Playlist info (for admin UI)
  playlistId: string | null
  playlistIndex: number
  playlistLength: number
  loop: boolean
  shuffle: boolean
  // Single queued track (overrides normal playlist order)
  nextAssetId: string | null
}

export interface DiscordUser {
  id: string
  username: string
  avatar: string | null
  discriminator: string
  global_name: string | null
}

export type ClientMessage =
  | { type: 'identify'; user: DiscordUser }
  | { type: 'join-campaign'; campaignId: string }
  | { type: 'leave-campaign' }
  | { type: 'playback-command'; command: 'play' | 'pause' | 'seek' | 'next' | 'prev'; time?: number }
  | { type: 'asset-select'; assetId: string | null }
  | { type: 'playlist-play'; playlistId: string }
  | { type: 'playlist-stop' }
  | { type: 'playlist-settings'; loop?: boolean; shuffle?: boolean }
  | { type: 'queue-asset'; assetId: string }
  | { type: 'queue-jump'; assetId: string }

export type ServerMessage =
  | { type: 'campaign-joined'; campaignId: string; playback: PlaybackState; users: DiscordUser[] }
  | { type: 'playback-state'; playback: PlaybackState }
  | { type: 'queue-updated'; playback: PlaybackState }
  | { type: 'asset-selected'; assetId: string | null }
  | { type: 'assets-updated'; campaignId: string }
  | { type: 'playlists-updated'; campaignId: string }
  | { type: 'user-joined'; user: DiscordUser }
  | { type: 'user-left'; userId: string }
  | { type: 'error'; message: string }

export interface CachedAsset {
  id: string
  campaignId: string
  blob: Blob
  size: number
  cachedAt: number
}
