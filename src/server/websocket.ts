import type { ServerWebSocket } from 'bun'
import type {
  WebSocketData,
  ClientMessage,
  ServerMessage,
  RoomState,
  PlaybackState,
  DiscordUser,
  MiniAppState,
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

function getDefaultMiniAppState(): MiniAppState {
  return {
    enabledApps: [],
    appStates: {},
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
      miniApps: getDefaultMiniAppState(),
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
    case 'miniapp-enable':
      handleMiniAppEnable(ws, message.appId)
      break
    case 'miniapp-disable':
      handleMiniAppDisable(ws, message.appId)
      break
    case 'miniapp-action':
      handleMiniAppAction(ws, message.appId, message.action, message.payload)
      break
    case 'reload-players':
      handleReloadPlayers(ws)
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
    miniApps: room.miniApps,
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

// Default states for built-in apps
const defaultAppStates: Record<string, unknown> = {
  'media-display': { assetId: null },
  'dice-roller': { history: [] },
  'quiz': {
    phase: 'idle',
    question: '',
    options: [],
    correctIndex: 0,
    answers: [],
    timeLimit: 15,
    startTime: 0,
  },
  'blackjack': {
    phase: 'idle',
    players: [],
    dealer: { hand: [], hidden: true },
    currentPlayerIndex: 0,
    deck: [],
  },
}

function handleMiniAppEnable(
  ws: ServerWebSocket<WebSocketData>,
  appId: string
): void {
  const { campaignId } = ws.data
  if (!campaignId) {
    send(ws, { type: 'error', message: 'Not in a campaign' })
    return
  }

  const room = rooms.get(campaignId)
  if (!room) return

  // Don't add if already enabled
  if (room.miniApps.enabledApps.includes(appId)) return

  room.miniApps.enabledApps.push(appId)

  // Initialize default state if not present
  if (!(appId in room.miniApps.appStates)) {
    room.miniApps.appStates[appId] = defaultAppStates[appId] ?? {}
  }

  broadcast(campaignId, { type: 'miniapp-state', miniApps: room.miniApps })
}

function handleMiniAppDisable(
  ws: ServerWebSocket<WebSocketData>,
  appId: string
): void {
  const { campaignId } = ws.data
  if (!campaignId) {
    send(ws, { type: 'error', message: 'Not in a campaign' })
    return
  }

  const room = rooms.get(campaignId)
  if (!room) return

  const index = room.miniApps.enabledApps.indexOf(appId)
  if (index === -1) return

  room.miniApps.enabledApps.splice(index, 1)
  // Keep the state around in case they re-enable

  broadcast(campaignId, { type: 'miniapp-state', miniApps: room.miniApps })
}

function handleReloadPlayers(ws: ServerWebSocket<WebSocketData>): void {
  const { campaignId, id: senderId } = ws.data
  if (!campaignId) {
    send(ws, { type: 'error', message: 'Not in a campaign' })
    return
  }

  const room = rooms.get(campaignId)
  if (!room) return

  // Send reload message to all clients except the sender (GM)
  for (const connectionId of room.connections) {
    if (connectionId === senderId) continue
    const client = connections.get(connectionId)
    if (client) {
      send(client, { type: 'reload' })
    }
  }
}

function handleMiniAppAction(
  ws: ServerWebSocket<WebSocketData>,
  appId: string,
  action: string,
  payload?: unknown
): void {
  const { campaignId, user } = ws.data
  if (!campaignId) {
    send(ws, { type: 'error', message: 'Not in a campaign' })
    return
  }

  const room = rooms.get(campaignId)
  if (!room) return

  // Only allow actions on enabled apps
  if (!room.miniApps.enabledApps.includes(appId)) {
    send(ws, { type: 'error', message: 'App is not enabled' })
    return
  }

  const currentState = room.miniApps.appStates[appId] ?? {}
  let newState = currentState

  // App-specific reducers
  if (appId === 'media-display') {
    newState = reduceMediaDisplay(currentState, action, payload)
  } else if (appId === 'dice-roller') {
    newState = reduceDiceRoller(currentState, action, payload, user)
  } else if (appId === 'quiz') {
    newState = reduceQuiz(currentState, action, payload, user)
  } else if (appId === 'blackjack') {
    newState = reduceBlackjack(currentState, action, payload, user)
  }

  room.miniApps.appStates[appId] = newState
  broadcast(campaignId, { type: 'miniapp-updated', appId, state: newState })
}

// Reducer for media-display app
function reduceMediaDisplay(
  state: unknown,
  action: string,
  payload?: unknown
): unknown {
  const s = state as { assetId: string | null }

  switch (action) {
    case 'set-asset':
      return { ...s, assetId: (payload as { assetId: string | null })?.assetId ?? null }
    case 'clear':
      return { ...s, assetId: null }
    default:
      return s
  }
}

// Reducer for dice-roller app
function reduceDiceRoller(
  state: unknown,
  action: string,
  payload?: unknown,
  user?: DiscordUser | null
): unknown {
  const s = state as { history: Array<{ id: string; oderId: string; username: string; dice: string; result: number; timestamp: number }> }

  switch (action) {
    case 'roll': {
      const p = payload as { dice: string } | undefined
      const dice = p?.dice ?? 'd20'

      // Parse dice notation (e.g., "d20", "2d6", "d100")
      const match = dice.match(/^(\d*)d(\d+)$/)
      if (!match) return s

      const count = parseInt(match[1] || '1', 10)
      const sides = parseInt(match[2], 10)

      let result = 0
      for (let i = 0; i < count; i++) {
        result += Math.floor(Math.random() * sides) + 1
      }

      const entry = {
        id: crypto.randomUUID(),
        oderId: user?.id ?? 'unknown',
        username: 'GM',
        dice,
        result,
        timestamp: Date.now(),
      }

      // Keep last 50 rolls
      const history = [entry, ...s.history].slice(0, 500)
      return { ...s, history }
    }
    case 'fudge': {
      // GM can set a specific result
      const p = payload as { dice: string; result: number } | undefined
      if (!p || typeof p.result !== 'number') return s

      const entry = {
        id: crypto.randomUUID(),
        oderId: user?.id ?? 'unknown',
        username: 'GM',
        dice: p.dice || 'd20',
        result: p.result,
        timestamp: Date.now(),
      }

      const history = [entry, ...s.history].slice(0, 500)
      return { ...s, history }
    }
    case 'remove': {
      const p = payload as { id: string } | undefined
      if (!p?.id) return s
      return { ...s, history: s.history.filter((r: { id: string }) => r.id !== p.id) }
    }
    case 'clear':
      return { ...s, history: [] }
    default:
      return s
  }
}

interface QuizAnswer {
  oderId: string
  username: string
  answerIndex: number
  timestamp: number
}

interface QuizState {
  phase: 'idle' | 'question' | 'results'
  question: string
  options: string[]
  correctIndex: number
  answers: QuizAnswer[]
  timeLimit: number
  startTime: number
}

// Reducer for quiz app
function reduceQuiz(
  state: unknown,
  action: string,
  payload?: unknown,
  user?: DiscordUser | null
): unknown {
  const s = state as QuizState

  switch (action) {
    case 'start-question': {
      const p = payload as { question: string; options: string[]; correctIndex: number; timeLimit: number } | undefined
      if (!p) return s
      return {
        ...s,
        phase: 'question',
        question: p.question,
        options: p.options,
        correctIndex: p.correctIndex,
        timeLimit: p.timeLimit,
        startTime: Date.now(),
        answers: [],
      }
    }
    case 'submit-answer': {
      const p = payload as { answerIndex: number } | undefined
      if (!p || !user || s.phase !== 'question') return s
      // Check if user already answered
      if (s.answers.some(a => a.oderId === user.id)) return s
      const answer: QuizAnswer = {
        oderId: user.id,
        username: user.username,
        answerIndex: p.answerIndex,
        timestamp: Date.now(),
      }
      return {
        ...s,
        answers: [...s.answers, answer],
      }
    }
    case 'reveal-results': {
      if (s.phase !== 'question') return s
      return {
        ...s,
        phase: 'results',
      }
    }
    case 'reset': {
      return {
        ...s,
        phase: 'idle',
        question: '',
        options: [],
        correctIndex: 0,
        answers: [],
        startTime: 0,
      }
    }
    default:
      return s
  }
}

// Blackjack types
interface BlackjackCard {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades'
  rank: string
  value: number
}

interface BlackjackPlayer {
  oderId: string
  username: string
  hand: BlackjackCard[]
  status: 'playing' | 'stand' | 'bust' | 'blackjack'
}

interface BlackjackState {
  phase: 'idle' | 'joining' | 'playing' | 'dealer' | 'results'
  players: BlackjackPlayer[]
  dealer: {
    hand: BlackjackCard[]
    hidden: boolean
  }
  currentPlayerIndex: number
  deck: BlackjackCard[]
}

function createDeck(): BlackjackCard[] {
  const suits: Array<'hearts' | 'diamonds' | 'clubs' | 'spades'> = ['hearts', 'diamonds', 'clubs', 'spades']
  const ranks = [
    { rank: 'A', value: 11 },
    { rank: '2', value: 2 },
    { rank: '3', value: 3 },
    { rank: '4', value: 4 },
    { rank: '5', value: 5 },
    { rank: '6', value: 6 },
    { rank: '7', value: 7 },
    { rank: '8', value: 8 },
    { rank: '9', value: 9 },
    { rank: '10', value: 10 },
    { rank: 'J', value: 10 },
    { rank: 'Q', value: 10 },
    { rank: 'K', value: 10 },
  ]

  const deck: BlackjackCard[] = []
  for (const suit of suits) {
    for (const { rank, value } of ranks) {
      deck.push({ suit, rank, value })
    }
  }
  return deck
}

function shuffleDeck(deck: BlackjackCard[]): BlackjackCard[] {
  const shuffled = [...deck]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

function calculateBlackjackHandValue(hand: BlackjackCard[]): number {
  let value = 0
  let aces = 0

  for (const card of hand) {
    if (card.rank === 'A') {
      aces++
      value += 11
    } else {
      value += card.value
    }
  }

  while (value > 21 && aces > 0) {
    value -= 10
    aces--
  }

  return value
}

function drawBlackjackCard(deck: BlackjackCard[]): { card: BlackjackCard; deck: BlackjackCard[] } {
  const newDeck = [...deck]
  const card = newDeck.pop()!
  return { card, deck: newDeck }
}

// Reducer for blackjack app
function reduceBlackjack(
  state: unknown,
  action: string,
  payload?: unknown,
  user?: DiscordUser | null
): unknown {
  const s = state as BlackjackState

  switch (action) {
    case 'start-round': {
      const deck = shuffleDeck(createDeck())
      return {
        ...s,
        phase: 'joining',
        players: [],
        dealer: { hand: [], hidden: true },
        currentPlayerIndex: 0,
        deck,
      }
    }

    case 'join': {
      if (s.phase !== 'joining' || !user) return s
      // Already joined?
      if (s.players.some(p => p.oderId === user.id)) return s
      const newPlayer: BlackjackPlayer = {
        oderId: user.id,
        username: user.username,
        hand: [],
        status: 'playing',
      }
      return {
        ...s,
        players: [...s.players, newPlayer],
      }
    }

    case 'deal': {
      if (s.phase !== 'joining' || s.players.length === 0) return s

      let deck = [...s.deck]
      const players: BlackjackPlayer[] = s.players.map(p => ({ ...p, hand: [], status: 'playing' }))
      const dealer = { hand: [] as BlackjackCard[], hidden: true }

      // Deal 2 cards to each player and dealer
      for (let round = 0; round < 2; round++) {
        for (const player of players) {
          const draw = drawBlackjackCard(deck)
          player.hand.push(draw.card)
          deck = draw.deck
        }
        const dealerDraw = drawBlackjackCard(deck)
        dealer.hand.push(dealerDraw.card)
        deck = dealerDraw.deck
      }

      // Check for blackjacks
      for (const player of players) {
        if (calculateBlackjackHandValue(player.hand) === 21) {
          player.status = 'blackjack'
        }
      }

      // Find first active player
      let currentPlayerIndex = 0
      while (currentPlayerIndex < players.length && players[currentPlayerIndex].status !== 'playing') {
        currentPlayerIndex++
      }

      // If all players have blackjack, dealer plays and go to results
      const allDone = players.every(p => p.status !== 'playing')

      if (allDone) {
        // Dealer plays
        let dealerHand = [...dealer.hand]
        let dealerDeck = deck

        while (calculateBlackjackHandValue(dealerHand) < 17) {
          const dealerDraw = drawBlackjackCard(dealerDeck)
          dealerHand.push(dealerDraw.card)
          dealerDeck = dealerDraw.deck
        }

        return {
          ...s,
          phase: 'results',
          players,
          dealer: { hand: dealerHand, hidden: false },
          deck: dealerDeck,
          currentPlayerIndex,
        }
      }

      return {
        ...s,
        phase: 'playing',
        players,
        dealer,
        deck,
        currentPlayerIndex,
      }
    }

    case 'hit': {
      if (s.phase !== 'playing' || !user) return s
      const currentPlayer = s.players[s.currentPlayerIndex]
      if (!currentPlayer || currentPlayer.oderId !== user.id) return s
      if (currentPlayer.status !== 'playing') return s

      const draw = drawBlackjackCard(s.deck)
      const newHand = [...currentPlayer.hand, draw.card]
      const value = calculateBlackjackHandValue(newHand)

      let newStatus: BlackjackPlayer['status'] = 'playing'
      if (value > 21) newStatus = 'bust'
      else if (value === 21) newStatus = 'stand'

      const players = s.players.map((p, i) =>
        i === s.currentPlayerIndex
          ? { ...p, hand: newHand, status: newStatus }
          : p
      )

      // If bust or 21, move to next player
      let currentPlayerIndex = s.currentPlayerIndex
      if (newStatus !== 'playing') {
        currentPlayerIndex++
        while (currentPlayerIndex < players.length && players[currentPlayerIndex].status !== 'playing') {
          currentPlayerIndex++
        }
      }

      // Check if all players done
      const allDone = players.every(p => p.status !== 'playing')

      if (allDone) {
        // Dealer plays
        let dealerHand = [...s.dealer.hand]
        let dealerDeck = draw.deck

        while (calculateBlackjackHandValue(dealerHand) < 17) {
          const dealerDraw = drawBlackjackCard(dealerDeck)
          dealerHand.push(dealerDraw.card)
          dealerDeck = dealerDraw.deck
        }

        return {
          ...s,
          phase: 'results',
          players,
          dealer: { hand: dealerHand, hidden: false },
          deck: dealerDeck,
          currentPlayerIndex,
        }
      }

      return {
        ...s,
        players,
        deck: draw.deck,
        currentPlayerIndex,
      }
    }

    case 'stand': {
      if (s.phase !== 'playing' || !user) return s
      const currentPlayer = s.players[s.currentPlayerIndex]
      if (!currentPlayer || currentPlayer.oderId !== user.id) return s
      if (currentPlayer.status !== 'playing') return s

      const players = s.players.map((p, i) =>
        i === s.currentPlayerIndex
          ? { ...p, status: 'stand' as const }
          : p
      )

      // Move to next player
      let currentPlayerIndex = s.currentPlayerIndex + 1
      while (currentPlayerIndex < players.length && players[currentPlayerIndex].status !== 'playing') {
        currentPlayerIndex++
      }

      // Check if all players done
      const allDone = players.every(p => p.status !== 'playing')

      if (allDone) {
        // Dealer plays
        let dealerHand = [...s.dealer.hand]
        let dealerDeck = [...s.deck]

        while (calculateBlackjackHandValue(dealerHand) < 17) {
          const dealerDraw = drawBlackjackCard(dealerDeck)
          dealerHand.push(dealerDraw.card)
          dealerDeck = dealerDraw.deck
        }

        return {
          ...s,
          phase: 'results',
          players,
          dealer: { hand: dealerHand, hidden: false },
          deck: dealerDeck,
          currentPlayerIndex,
        }
      }

      return {
        ...s,
        players,
        currentPlayerIndex,
      }
    }

    case 'reset': {
      return {
        ...s,
        phase: 'idle',
        players: [],
        dealer: { hand: [], hidden: true },
        currentPlayerIndex: 0,
        deck: [],
      }
    }

    default:
      return s
  }
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
