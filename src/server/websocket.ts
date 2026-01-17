import type { ServerWebSocket } from 'bun'
import type {
  WebSocketData,
  ClientMessage,
  ServerMessage,
  RoomState,
  PlaybackState,
  DiscordUser,
} from './types'
import * as playlistService from './services/playlist'

const rooms = new Map<string, RoomState>()
const connections = new Map<string, ServerWebSocket<WebSocketData>>()

function getDefaultPlaybackState(): PlaybackState {
  return {
    assetId: null,
    playing: false,
    currentTime: 0,
    timestamp: Date.now(),
    playlistId: null,
    playlistIndex: -1,
    playlistLength: 0,
    loop: false,
    shuffle: false,
    nextAssetId: null,
  }
}

function getOrCreateRoom(campaignId: string): RoomState {
  let room = rooms.get(campaignId)
  if (!room) {
    room = {
      campaignId,
      playback: getDefaultPlaybackState(),
      connections: new Set(),
      users: new Map(),
      playlistOrder: [],
    }
    rooms.set(campaignId, room)
  }
  return room
}

function broadcast(campaignId: string, message: ServerMessage, excludeConnectionId?: string): void {
  const room = rooms.get(campaignId)
  if (!room) return

  const payload = JSON.stringify(message)
  for (const connectionId of room.connections) {
    if (connectionId === excludeConnectionId) continue
    const ws = connections.get(connectionId)
    if (ws) {
      ws.send(payload)
    }
  }
}

function send(ws: ServerWebSocket<WebSocketData>, message: ServerMessage): void {
  ws.send(JSON.stringify(message))
}

function shuffleArray<T>(array: T[]): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function handleOpen(ws: ServerWebSocket<WebSocketData>): void {
  connections.set(ws.data.id, ws)
}

export function handleClose(ws: ServerWebSocket<WebSocketData>): void {
  const { id, campaignId, user } = ws.data
  connections.delete(id)

  if (campaignId) {
    const room = rooms.get(campaignId)
    if (room) {
      room.connections.delete(id)

      if (user) {
        room.users.delete(id)
        broadcast(campaignId, { type: 'user-left', userId: user.id })
      }

      if (room.connections.size === 0) {
        rooms.delete(campaignId)
      }
    }
  }
}

export function handleMessage(
  ws: ServerWebSocket<WebSocketData>,
  raw: string | Buffer
): void {
  let message: ClientMessage
  try {
    message = JSON.parse(typeof raw === 'string' ? raw : raw.toString())
  } catch {
    send(ws, { type: 'error', message: 'Invalid message format' })
    return
  }

  switch (message.type) {
    case 'identify':
      handleIdentify(ws, message.user)
      break
    case 'join-campaign':
      handleJoinCampaign(ws, message.campaignId)
      break
    case 'leave-campaign':
      handleLeaveCampaign(ws)
      break
    case 'playback-command':
      handlePlaybackCommand(ws, message.command, message.time)
      break
    case 'asset-select':
      handleAssetSelect(ws, message.assetId)
      break
    case 'playlist-play':
      handlePlaylistPlay(ws, message.playlistId)
      break
    case 'playlist-stop':
      handlePlaylistStop(ws)
      break
    case 'playlist-settings':
      handlePlaylistSettings(ws, message.loop, message.shuffle)
      break
    case 'queue-asset':
      handleQueueAsset(ws, message.assetId)
      break
    case 'queue-jump':
      handleQueueJump(ws, message.assetId)
      break
    default:
      send(ws, { type: 'error', message: 'Unknown message type' })
  }
}

function handleIdentify(
  ws: ServerWebSocket<WebSocketData>,
  user: DiscordUser
): void {
  ws.data.user = user
}

function handleJoinCampaign(
  ws: ServerWebSocket<WebSocketData>,
  campaignId: string
): void {
  const { id, user } = ws.data

  if (ws.data.campaignId) {
    handleLeaveCampaign(ws)
  }

  const room = getOrCreateRoom(campaignId)
  room.connections.add(id)
  ws.data.campaignId = campaignId

  // Only add to users list and broadcast if user is identified (players)
  // GM connects without identifying and just observes
  if (user) {
    room.users.set(id, user)
    broadcast(campaignId, { type: 'user-joined', user }, id)
  }

  send(ws, {
    type: 'campaign-joined',
    campaignId,
    playback: room.playback,
    users: Array.from(room.users.values()),
  })
}

function handleLeaveCampaign(ws: ServerWebSocket<WebSocketData>): void {
  const { id, campaignId, user } = ws.data
  if (!campaignId) return

  const room = rooms.get(campaignId)
  if (room) {
    room.connections.delete(id)

    if (user) {
      room.users.delete(id)
      broadcast(campaignId, { type: 'user-left', userId: user.id })
    }

    if (room.connections.size === 0) {
      rooms.delete(campaignId)
    }
  }

  ws.data.campaignId = null
}

function handlePlaybackCommand(
  ws: ServerWebSocket<WebSocketData>,
  command: 'play' | 'pause' | 'seek' | 'next' | 'prev',
  time?: number
): void {
  const { campaignId } = ws.data
  if (!campaignId) {
    send(ws, { type: 'error', message: 'Not in a campaign' })
    return
  }

  const room = rooms.get(campaignId)
  if (!room) return

  const pb = room.playback

  switch (command) {
    case 'play':
      pb.playing = true
      pb.timestamp = Date.now()
      break
    case 'pause':
      pb.playing = false
      pb.timestamp = Date.now()
      break
    case 'seek':
      if (typeof time === 'number') {
        pb.currentTime = time
        pb.timestamp = Date.now()
      }
      break
    case 'next':
      advancePlaylist(room, 1)
      break
    case 'prev':
      advancePlaylist(room, -1)
      break
  }

  broadcast(campaignId, { type: 'playback-state', playback: pb })
}

function advancePlaylist(room: RoomState, direction: 1 | -1): void {
  const pb = room.playback
  const order = room.playlistOrder

  if (order.length === 0) return

  // If there's a queued next track and we're going forward, play it
  if (direction === 1 && pb.nextAssetId) {
    pb.assetId = pb.nextAssetId
    pb.nextAssetId = null
    // Find the index of this asset in the order (for display purposes)
    const idx = order.indexOf(pb.assetId)
    pb.playlistIndex = idx >= 0 ? idx : pb.playlistIndex
    pb.currentTime = 0
    pb.timestamp = Date.now()
    return
  }

  let newIndex = pb.playlistIndex + direction

  if (newIndex >= order.length) {
    if (pb.loop) {
      newIndex = 0
    } else {
      pb.playing = false
      pb.timestamp = Date.now()
      return
    }
  } else if (newIndex < 0) {
    if (pb.loop) {
      newIndex = order.length - 1
    } else {
      newIndex = 0
    }
  }

  pb.playlistIndex = newIndex
  pb.assetId = order[newIndex]
  pb.currentTime = 0
  pb.timestamp = Date.now()
}

function handleAssetSelect(
  ws: ServerWebSocket<WebSocketData>,
  assetId: string | null
): void {
  const { campaignId } = ws.data
  if (!campaignId) {
    send(ws, { type: 'error', message: 'Not in a campaign' })
    return
  }

  const room = rooms.get(campaignId)
  if (!room) return

  // Clear playlist state when selecting a single asset
  room.playback.playlistId = null
  room.playback.playlistIndex = -1
  room.playback.playlistLength = 0
  room.playback.nextAssetId = null
  room.playlistOrder = []

  room.playback.assetId = assetId
  room.playback.playing = false
  room.playback.currentTime = 0
  room.playback.timestamp = Date.now()

  broadcast(campaignId, { type: 'asset-selected', assetId })
  broadcast(campaignId, { type: 'playback-state', playback: room.playback })
}

async function handlePlaylistPlay(
  ws: ServerWebSocket<WebSocketData>,
  playlistId: string
): Promise<void> {
  const { campaignId } = ws.data
  if (!campaignId) {
    send(ws, { type: 'error', message: 'Not in a campaign' })
    return
  }

  const room = rooms.get(campaignId)
  if (!room) return

  const playlist = await playlistService.getPlaylist(campaignId, playlistId)
  if (!playlist || playlist.assetIds.length === 0) {
    send(ws, { type: 'error', message: 'Playlist not found or empty' })
    return
  }

  const pb = room.playback
  pb.playlistId = playlistId
  pb.playlistLength = playlist.assetIds.length
  pb.nextAssetId = null

  // Build order, shuffling if needed
  room.playlistOrder = pb.shuffle ? shuffleArray(playlist.assetIds) : [...playlist.assetIds]
  pb.playlistIndex = 0
  pb.assetId = room.playlistOrder[0]
  pb.playing = true
  pb.currentTime = 0
  pb.timestamp = Date.now()

  broadcast(campaignId, { type: 'playback-state', playback: pb })
}

function handlePlaylistStop(ws: ServerWebSocket<WebSocketData>): void {
  const { campaignId } = ws.data
  if (!campaignId) {
    send(ws, { type: 'error', message: 'Not in a campaign' })
    return
  }

  const room = rooms.get(campaignId)
  if (!room) return

  const pb = room.playback
  pb.playlistId = null
  pb.playlistIndex = -1
  pb.playlistLength = 0
  pb.nextAssetId = null
  room.playlistOrder = []

  pb.assetId = null
  pb.playing = false
  pb.currentTime = 0
  pb.timestamp = Date.now()

  broadcast(campaignId, { type: 'playback-state', playback: pb })
}

async function handlePlaylistSettings(
  ws: ServerWebSocket<WebSocketData>,
  loop?: boolean,
  shuffle?: boolean
): Promise<void> {
  const { campaignId } = ws.data
  if (!campaignId) {
    send(ws, { type: 'error', message: 'Not in a campaign' })
    return
  }

  const room = rooms.get(campaignId)
  if (!room) return

  const pb = room.playback

  if (typeof loop === 'boolean') {
    pb.loop = loop
  }

  if (typeof shuffle === 'boolean') {
    const wasShuffled = pb.shuffle
    pb.shuffle = shuffle

    // If shuffle changed and we have a playlist playing, rebuild the order
    if (wasShuffled !== shuffle && pb.playlistId && room.playlistOrder.length > 0) {
      const playlist = await playlistService.getPlaylist(campaignId, pb.playlistId)
      if (playlist) {
        const currentAssetId = pb.assetId

        if (shuffle) {
          room.playlistOrder = shuffleArray(playlist.assetIds)
        } else {
          room.playlistOrder = [...playlist.assetIds]
        }

        // Keep current asset playing, find its new index
        const newIndex = room.playlistOrder.indexOf(currentAssetId!)
        pb.playlistIndex = newIndex >= 0 ? newIndex : 0
      }
    }
  }

  // Don't update timestamp - settings change doesn't affect playback timing
  broadcast(campaignId, { type: 'queue-updated', playback: pb })
}

function handleQueueAsset(
  ws: ServerWebSocket<WebSocketData>,
  assetId: string
): void {
  const { campaignId } = ws.data
  if (!campaignId) {
    send(ws, { type: 'error', message: 'Not in a campaign' })
    return
  }

  const room = rooms.get(campaignId)
  if (!room) return

  // Simply set as next track (replaces any previous queued track)
  room.playback.nextAssetId = assetId

  broadcast(campaignId, { type: 'queue-updated', playback: room.playback })
}

function handleQueueJump(
  ws: ServerWebSocket<WebSocketData>,
  assetId: string
): void {
  const { campaignId } = ws.data
  if (!campaignId) {
    send(ws, { type: 'error', message: 'Not in a campaign' })
    return
  }

  const room = rooms.get(campaignId)
  if (!room) return

  const pb = room.playback
  const order = room.playlistOrder

  // Find the asset in the playlist order and jump to it
  const index = order.indexOf(assetId)
  if (index >= 0) {
    pb.playlistIndex = index
    pb.assetId = assetId
    pb.nextAssetId = null // Clear any queued track
    pb.currentTime = 0
    pb.playing = true
    pb.timestamp = Date.now()
  }

  broadcast(campaignId, { type: 'playback-state', playback: pb })
}

export function createWebSocketData(): WebSocketData {
  return {
    id: crypto.randomUUID(),
    campaignId: null,
    user: null,
  }
}

export function broadcastAssetsUpdated(campaignId: string): void {
  const room = rooms.get(campaignId)
  if (!room) return

  const payload = JSON.stringify({ type: 'assets-updated', campaignId })
  for (const connectionId of room.connections) {
    const ws = connections.get(connectionId)
    if (ws) {
      ws.send(payload)
    }
  }
}

export function broadcastPlaylistsUpdated(campaignId: string): void {
  const room = rooms.get(campaignId)
  if (!room) return

  const payload = JSON.stringify({ type: 'playlists-updated', campaignId })
  for (const connectionId of room.connections) {
    const ws = connections.get(connectionId)
    if (ws) {
      ws.send(payload)
    }
  }
}

// Called when a track ends - advance to next in playlist
export function handleTrackEnded(campaignId: string): void {
  const room = rooms.get(campaignId)
  if (!room || !room.playback.playlistId) return

  advancePlaylist(room, 1)
  broadcast(campaignId, { type: 'playback-state', playback: room.playback })
}
