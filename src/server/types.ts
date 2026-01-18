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
  type: 'sequential' | 'layered' | 'progressive'
  assetIds: string[]
  layerVolumes?: Record<string, number>  // For layered playlists: assetId -> default volume (0-1)
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
  playlistType: 'sequential' | 'layered' | 'progressive'
  playlistIndex: number
  playlistLength: number
  loop: boolean
  shuffle: boolean
  // Single queued track (overrides normal playlist order)
  nextAssetId: string | null
  // Layered playlist: current volumes for each track
  layerVolumes: Record<string, number>
}

export interface DiscordUser {
  id: string
  username: string
  avatar: string | null
  discriminator: string
  global_name: string | null
}

export interface MiniAppState {
  enabledApps: string[]
  appStates: Record<string, unknown>
}

export interface RoomState {
  campaignId: string
  playback: PlaybackState
  connections: Set<string>  // All connection IDs in the room (for broadcasting)
  users: Map<string, DiscordUser>  // Map of connection ID -> user info (only identified users)
  // Internal playlist tracking (not synced to clients)
  playlistOrder: string[]  // Current order of asset IDs (may be shuffled)
  // Mini-apps state
  miniApps: MiniAppState
}

export interface WebSocketData {
  id: string
  campaignId: string | null
  user: DiscordUser | null
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
  | { type: 'layer-volume'; assetId: string; volume: number }
  | { type: 'layer-fade-to'; assetId: string; duration?: number }
  | { type: 'miniapp-enable'; appId: string }
  | { type: 'miniapp-disable'; appId: string }
  | { type: 'miniapp-action'; appId: string; action: string; payload?: unknown }
  | { type: 'reload-players' }

export type ServerMessage =
  | { type: 'campaign-joined'; campaignId: string; playback: PlaybackState; users: DiscordUser[]; miniApps: MiniAppState }
  | { type: 'playback-state'; playback: PlaybackState }
  | { type: 'queue-updated'; playback: PlaybackState }
  | { type: 'asset-selected'; assetId: string | null }
  | { type: 'assets-updated'; campaignId: string }
  | { type: 'playlists-updated'; campaignId: string }
  | { type: 'user-joined'; user: DiscordUser }
  | { type: 'user-left'; userId: string }
  | { type: 'error'; message: string }
  | { type: 'miniapp-state'; miniApps: MiniAppState }
  | { type: 'miniapp-updated'; appId: string; state: unknown }
  | { type: 'reload' }
