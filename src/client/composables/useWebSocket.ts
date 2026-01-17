import { ref, shallowRef } from 'vue'
import type { ClientMessage, ServerMessage, PlaybackState, DiscordUser } from '../types'

const ws = shallowRef<WebSocket | null>(null)
const connected = ref(false)
const identified = ref(false)
const currentCampaignId = ref<string | null>(null)
const playbackState = ref<PlaybackState>({
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
})
const users = ref<DiscordUser[]>([])
const error = ref<string | null>(null)
let pendingIdentify: DiscordUser | null = null

type MessageHandler = (message: ServerMessage) => void
const messageHandlers: Set<MessageHandler> = new Set()

function getWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}

function send(message: ClientMessage): void {
  if (ws.value && ws.value.readyState === WebSocket.OPEN) {
    ws.value.send(JSON.stringify(message))
  }
}

function handleMessage(event: MessageEvent): void {
  const message: ServerMessage = JSON.parse(event.data)

  switch (message.type) {
    case 'campaign-joined':
      currentCampaignId.value = message.campaignId
      playbackState.value = message.playback
      users.value = message.users
      break
    case 'playback-state':
      playbackState.value = message.playback
      break
    case 'queue-updated':
      // Update queue without triggering playback sync
      playbackState.value = message.playback
      break
    case 'asset-selected':
      playbackState.value = {
        ...playbackState.value,
        assetId: message.assetId,
        playing: false,
        currentTime: 0,
        timestamp: Date.now(),
        playlistId: null,
        playlistIndex: -1,
        playlistLength: 0,
        nextAssetId: null,
      }
      break
    case 'user-joined':
      if (!users.value.some((u) => u.id === message.user.id)) {
        users.value = [...users.value, message.user]
      }
      break
    case 'user-left':
      users.value = users.value.filter((u) => u.id !== message.userId)
      break
    case 'error':
      error.value = message.message
      break
  }

  for (const handler of messageHandlers) {
    handler(message)
  }
}

export function useWebSocket() {
  function connect(): void {
    if (ws.value) return

    const socket = new WebSocket(getWsUrl())

    socket.onopen = () => {
      connected.value = true
      error.value = null
      // If we have a pending identity, send it now
      if (pendingIdentify) {
        send({ type: 'identify', user: pendingIdentify })
        identified.value = true
        pendingIdentify = null
      }
    }

    socket.onclose = () => {
      connected.value = false
      identified.value = false
      ws.value = null
      currentCampaignId.value = null
      users.value = []
    }

    socket.onerror = () => {
      error.value = 'WebSocket connection error'
    }

    socket.onmessage = handleMessage

    ws.value = socket
  }

  function disconnect(): void {
    if (ws.value) {
      ws.value.close()
      ws.value = null
    }
  }

  function identify(user: DiscordUser): void {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      send({ type: 'identify', user })
      identified.value = true
    } else {
      // Store for later when connection opens
      pendingIdentify = user
    }
  }

  function joinCampaign(campaignId: string): void {
    send({ type: 'join-campaign', campaignId })
  }

  function leaveCampaign(): void {
    send({ type: 'leave-campaign' })
    currentCampaignId.value = null
    users.value = []
  }

  function play(): void {
    send({ type: 'playback-command', command: 'play' })
  }

  function pause(): void {
    send({ type: 'playback-command', command: 'pause' })
  }

  function seek(time: number): void {
    send({ type: 'playback-command', command: 'seek', time })
  }

  function next(): void {
    send({ type: 'playback-command', command: 'next' })
  }

  function prev(): void {
    send({ type: 'playback-command', command: 'prev' })
  }

  function selectAsset(assetId: string | null): void {
    send({ type: 'asset-select', assetId })
  }

  function playPlaylist(playlistId: string): void {
    send({ type: 'playlist-play', playlistId })
  }

  function stopPlaylist(): void {
    send({ type: 'playlist-stop' })
  }

  function setLoop(loop: boolean): void {
    send({ type: 'playlist-settings', loop })
  }

  function setShuffle(shuffle: boolean): void {
    send({ type: 'playlist-settings', shuffle })
  }

  function queueAsset(assetId: string): void {
    send({ type: 'queue-asset', assetId })
  }

  function jumpToAsset(assetId: string): void {
    send({ type: 'queue-jump', assetId })
  }

  function onMessage(handler: MessageHandler): () => void {
    messageHandlers.add(handler)
    return () => messageHandlers.delete(handler)
  }

  return {
    connected,
    identified,
    currentCampaignId,
    playbackState,
    users,
    error,
    connect,
    disconnect,
    identify,
    joinCampaign,
    leaveCampaign,
    play,
    pause,
    seek,
    next,
    prev,
    selectAsset,
    playPlaylist,
    stopPlaylist,
    setLoop,
    setShuffle,
    queueAsset,
    jumpToAsset,
    onMessage,
  }
}
