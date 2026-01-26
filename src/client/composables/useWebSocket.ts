import { ref, shallowRef } from 'vue'
import type { ClientMessage, ServerMessage, PlaybackState, DiscordUser, MiniAppState } from '../types'

const ws = shallowRef<WebSocket | null>(null)
const connected = ref(false)
const identified = ref(false)
const reconnecting = ref(false)
const currentCampaignId = ref<string | null>(null)
const playbackState = ref<PlaybackState>({
  assetId: null,
  playing: false,
  currentTime: 0,
  timestamp: Date.now(),
  playlistId: null,
  playlistType: 'sequential',
  playlistIndex: -1,
  playlistLength: 0,
  loop: false,
  shuffle: false,
  nextAssetId: null,
  layerVolumes: {},
})
const users = ref<DiscordUser[]>([])
const userSyncProgress = ref<Map<string, number>>(new Map())
const error = ref<string | null>(null)
const miniAppState = ref<MiniAppState>({ enabledApps: [], appStates: {} })
const currentUser = ref<DiscordUser | null>(null)

// Reconnection state
let pendingIdentify: DiscordUser | null = null
let lastIdentity: DiscordUser | null = null
let lastCampaignId: string | null = null
let reconnectAttempts = 0
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
let shouldReconnect = false // Track if we should auto-reconnect
const MAX_RECONNECT_ATTEMPTS = 10
const BASE_RECONNECT_DELAY = 1000 // 1 second

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
      miniAppState.value = message.miniApps
      // Initialize sync progress map from users array
      userSyncProgress.value = new Map(
        message.users.map(u => [u.id, u.syncProgress ?? 100])
      )
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
      userSyncProgress.value.set(message.user.id, message.syncProgress ?? 0)
      break
    case 'user-left':
      users.value = users.value.filter((u) => u.id !== message.userId)
      userSyncProgress.value.delete(message.userId)
      break
    case 'user-sync-progress':
      userSyncProgress.value.set(message.userId, message.progress)
      break
    case 'error':
      error.value = message.message
      break
    case 'miniapp-state':
      miniAppState.value = message.miniApps
      break
    case 'miniapp-updated':
      miniAppState.value = {
        ...miniAppState.value,
        appStates: {
          ...miniAppState.value.appStates,
          [message.appId]: message.state,
        },
      }
      break
    case 'reload':
      // Clear asset cache before reload
      indexedDB.deleteDatabase('bardbox-cache')
      window.location.reload()
      break
  }

  for (const handler of messageHandlers) {
    handler(message)
  }
}

export function useWebSocket() {
  function scheduleReconnect(): void {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      error.value = 'Connection lost. Please refresh the page.'
      reconnecting.value = false
      return
    }

    reconnecting.value = true
    const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts), 30000)
    reconnectAttempts++

    reconnectTimeout = setTimeout(() => {
      reconnectTimeout = null
      doConnect()
    }, delay)
  }

  function doConnect(): void {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) return

    const socket = new WebSocket(getWsUrl())

    socket.onopen = () => {
      connected.value = true
      reconnecting.value = false
      reconnectAttempts = 0
      error.value = null
      shouldReconnect = true

      // Re-identify if we had an identity before
      if (lastIdentity) {
        send({ type: 'identify', user: lastIdentity })
        identified.value = true
        // Re-join campaign if we were in one
        if (lastCampaignId) {
          send({ type: 'join-campaign', campaignId: lastCampaignId })
        }
      } else if (pendingIdentify) {
        send({ type: 'identify', user: pendingIdentify })
        identified.value = true
        lastIdentity = pendingIdentify
        pendingIdentify = null
      }
    }

    socket.onclose = () => {
      connected.value = false
      identified.value = false
      ws.value = null
      users.value = []

      // Schedule reconnect if we were previously connected
      if (shouldReconnect) {
        scheduleReconnect()
      }
    }

    socket.onerror = () => {
      error.value = 'WebSocket connection error'
    }

    socket.onmessage = handleMessage

    ws.value = socket
  }

  function connect(): void {
    if (ws.value) return
    doConnect()
  }

  function disconnect(): void {
    // Clear reconnection state to prevent auto-reconnect
    shouldReconnect = false
    lastIdentity = null
    lastCampaignId = null
    reconnectAttempts = 0
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout)
      reconnectTimeout = null
    }
    reconnecting.value = false

    if (ws.value) {
      ws.value.close()
      ws.value = null
    }
  }

  function identify(user: DiscordUser): void {
    lastIdentity = user
    currentUser.value = user
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      send({ type: 'identify', user })
      identified.value = true
    } else {
      // Store for later when connection opens
      pendingIdentify = user
    }
  }

  function joinCampaign(campaignId: string): void {
    lastCampaignId = campaignId
    send({ type: 'join-campaign', campaignId })
  }

  function leaveCampaign(): void {
    lastCampaignId = null
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

  function setLayerVolume(assetId: string, volume: number): void {
    send({ type: 'layer-volume', assetId, volume })
  }

  function fadeToLayer(assetId: string, duration?: number): void {
    send({ type: 'layer-fade-to', assetId, duration })
  }

  function enableMiniApp(appId: string): void {
    send({ type: 'miniapp-enable', appId })
  }

  function disableMiniApp(appId: string): void {
    send({ type: 'miniapp-disable', appId })
  }

  function dispatchMiniAppAction(appId: string, action: string, payload?: unknown): void {
    send({ type: 'miniapp-action', appId, action, payload })
  }

  function reloadPlayers(): void {
    send({ type: 'reload-players' })
  }

  function sendSyncProgress(progress: number): void {
    send({ type: 'sync-progress', progress })
  }

  function onMessage(handler: MessageHandler): () => void {
    messageHandlers.add(handler)
    return () => messageHandlers.delete(handler)
  }

  return {
    connected,
    identified,
    reconnecting,
    currentCampaignId,
    playbackState,
    users,
    userSyncProgress,
    error,
    miniAppState,
    currentUser,
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
    setLayerVolume,
    fadeToLayer,
    enableMiniApp,
    disableMiniApp,
    dispatchMiniAppAction,
    reloadPlayers,
    sendSyncProgress,
    onMessage,
  }
}
