import { registerMiniApp } from './registry'
import MediaDisplayApp from './apps/MediaDisplayApp.vue'
import MediaDisplayControls from './apps/MediaDisplayControls.vue'
import DiceRollerApp from './apps/DiceRollerApp.vue'
import QuizApp from './apps/QuizApp.vue'
import BlackjackApp from './apps/BlackjackApp.vue'
import AggroTrackerApp from './apps/AggroTrackerApp.vue'

// Register built-in apps
registerMiniApp({
  id: 'media-display',
  name: 'Media Display',
  description: 'Show images and videos to players',
  icon: '🖼️',
  defaultState: { assetId: null },
  playerInteractive: false,
  component: MediaDisplayApp,
  gmControlsComponent: MediaDisplayControls,
  reducer: (state, action, payload) => {
    const s = state as { assetId: string | null }
    switch (action) {
      case 'set-asset':
        return { ...s, assetId: (payload as { assetId: string | null })?.assetId ?? null }
      case 'clear':
        return { ...s, assetId: null }
      default:
        return s
    }
  },
})

registerMiniApp({
  id: 'dice-roller',
  name: 'Dice Bank',
  description: 'Roll and consume dice rolls',
  icon: '🎲',
  defaultState: { history: [] },
  playerInteractive: false,
  component: DiceRollerApp,
  reducer: (state, action, payload, user) => {
    const s = state as { history: Array<{ id: string; oderId: string; username: string; dice: string; result: number; timestamp: number }> }
    switch (action) {
      case 'roll': {
        const p = payload as { dice: string } | undefined
        const dice = p?.dice ?? 'd20'
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

        return { ...s, history: [entry, ...s.history].slice(0, 500) }
      }
      case 'fudge': {
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

        return { ...s, history: [entry, ...s.history].slice(0, 500) }
      }
      case 'remove': {
        const p = payload as { id: string } | undefined
        if (!p?.id) return s
        return { ...s, history: s.history.filter((r) => r.id !== p.id) }
      }
      case 'clear':
        return { ...s, history: [] }
      default:
        return s
    }
  },
})

interface PlayerAnswer {
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
  answers: PlayerAnswer[]
  timeLimit: number
  startTime: number
}

registerMiniApp({
  id: 'quiz',
  name: 'Quiz',
  description: 'Kashoot yourself',
  icon: '?',
  defaultState: {
    phase: 'idle',
    question: '',
    options: [],
    correctIndex: 0,
    answers: [],
    timeLimit: 15,
    startTime: 0,
  } as QuizState,
  playerInteractive: true,
  component: QuizApp,
  reducer: (state, action, payload, user) => {
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
        const answer: PlayerAnswer = {
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
  },
})

// Blackjack types
interface Card {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades'
  rank: string
  value: number
}

interface BlackjackPlayer {
  oderId: string
  username: string
  hand: Card[]
  status: 'playing' | 'stand' | 'bust' | 'blackjack'
}

interface BlackjackState {
  phase: 'idle' | 'joining' | 'playing' | 'dealer' | 'results'
  players: BlackjackPlayer[]
  dealer: {
    hand: Card[]
    hidden: boolean
  }
  currentPlayerIndex: number
  deck: Card[]
}

function createDeck(): Card[] {
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

  const deck: Card[] = []
  for (const suit of suits) {
    for (const { rank, value } of ranks) {
      deck.push({ suit, rank, value })
    }
  }
  return deck
}

function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

function calculateHandValue(hand: Card[]): number {
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

function drawCard(deck: Card[]): { card: Card; deck: Card[] } {
  const newDeck = [...deck]
  const card = newDeck.pop()!
  return { card, deck: newDeck }
}

registerMiniApp({
  id: 'blackjack',
  name: 'Blackjack',
  description: 'Need i say more?',
  icon: '🃏',
  defaultState: {
    phase: 'idle',
    players: [],
    dealer: { hand: [], hidden: true },
    currentPlayerIndex: 0,
    deck: [],
  } as BlackjackState,
  playerInteractive: true,
  component: BlackjackApp,
  reducer: (state, action, payload, user) => {
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
        const players = s.players.map(p => ({ ...p, hand: [] as Card[], status: 'playing' as BlackjackPlayer['status'] }))
        const dealer = { hand: [] as Card[], hidden: true }

        // Deal 2 cards to each player and dealer
        for (let round = 0; round < 2; round++) {
          for (const player of players) {
            const draw = drawCard(deck)
            player.hand.push(draw.card)
            deck = draw.deck
          }
          const dealerDraw = drawCard(deck)
          dealer.hand.push(dealerDraw.card)
          deck = dealerDraw.deck
        }

        // Check for blackjacks
        for (const player of players) {
          if (calculateHandValue(player.hand) === 21) {
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

          while (calculateHandValue(dealerHand) < 17) {
            const dealerDraw = drawCard(dealerDeck)
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

        const draw = drawCard(s.deck)
        const newHand = [...currentPlayer.hand, draw.card]
        const value = calculateHandValue(newHand)

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

          while (calculateHandValue(dealerHand) < 17) {
            const dealerDraw = drawCard(dealerDeck)
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

          while (calculateHandValue(dealerHand) < 17) {
            const dealerDraw = drawCard(dealerDeck)
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
  },
})

// Aggro Tracker types
interface AggroCharacterHate {
  damage: number
  healing: number
  special: number
}

interface AggroEnemy {
  id: string
  name: string
  hate: Record<string, AggroCharacterHate>
}

type AggroAbilityType = 'stalwart' | 'lucid-dreaming' | 'diversion'

interface AggroActiveAbility {
  type: AggroAbilityType
  turnsRemaining: number
  firstActionUsed: boolean
}

interface AggroState {
  enemies: AggroEnemy[]
  activeEnemyId: string | null
  turnOrder: string[]
  abilities: Record<string, AggroActiveAbility>
}

registerMiniApp({
  id: 'aggro-tracker',
  name: 'Hate Tracker',
  description: 'Combat Hate Tracker',
  icon: '🗡️',
  defaultState: {
    enemies: [],
    activeEnemyId: null,
    turnOrder: [],
    abilities: {},
  } as AggroState,
  playerInteractive: false,
  component: AggroTrackerApp,
  reducer: (state, action, payload) => {
    const s = state as AggroState

    switch (action) {
      case 'add-enemy': {
        const p = payload as { name: string } | undefined
        if (!p?.name) return s
        const enemy: AggroEnemy = {
          id: crypto.randomUUID(),
          name: p.name,
          hate: {},
        }
        const enemies = [...s.enemies, enemy]
        return {
          ...s,
          enemies,
          activeEnemyId: s.activeEnemyId ?? enemy.id,
        }
      }

      case 'remove-enemy': {
        const p = payload as { enemyId: string } | undefined
        if (!p?.enemyId) return s
        const enemies = s.enemies.filter(e => e.id !== p.enemyId)
        const activeEnemyId = s.activeEnemyId === p.enemyId
          ? (enemies[0]?.id ?? null)
          : s.activeEnemyId
        return { ...s, enemies, activeEnemyId }
      }

      case 'select-enemy': {
        const p = payload as { enemyId: string } | undefined
        if (!p?.enemyId) return s
        return { ...s, activeEnemyId: p.enemyId }
      }

      case 'add-hate': {
        const p = payload as { enemyId: string; characterId: string; hateType: keyof AggroCharacterHate; amount: number } | undefined
        if (!p || typeof p.amount !== 'number') return s

        let amount = p.amount
        const ability = s.abilities?.[p.characterId]
        let updatedAbilities = s.abilities ?? {}

        if (ability) {
          switch (ability.type) {
            case 'stalwart':
              if (!ability.firstActionUsed) {
                amount = amount * 2
                updatedAbilities = {
                  ...updatedAbilities,
                  [p.characterId]: { ...ability, firstActionUsed: true },
                }
              }
              if (p.hateType === 'special' && p.amount < 0) {
                amount = Math.abs(p.amount)
              }
              break
            case 'diversion':
              if (amount > 0) amount = Math.floor(amount / 2)
              break
          }
        }

        return {
          ...s,
          abilities: updatedAbilities,
          enemies: s.enemies.map(e => {
            if (e.id !== p.enemyId) return e
            const current = e.hate[p.characterId] ?? { damage: 0, healing: 0, special: 0 }
            return {
              ...e,
              hate: {
                ...e.hate,
                [p.characterId]: {
                  ...current,
                  [p.hateType]: current[p.hateType] + amount,
                },
              },
            }
          }),
        }
      }

      case 'activate-ability': {
        const p = payload as { characterId: string; abilityType: AggroAbilityType } | undefined
        if (!p) return s

        let newState = { ...s }

        if (p.abilityType === 'lucid-dreaming') {
          newState = {
            ...newState,
            enemies: newState.enemies.map(e => {
              const current = e.hate[p.characterId]
              if (!current) return e
              return {
                ...e,
                hate: {
                  ...e.hate,
                  [p.characterId]: {
                    damage: Math.floor(current.damage / 2),
                    healing: Math.floor(current.healing / 2),
                    special: Math.floor(current.special / 2),
                  },
                },
              }
            }),
          }
        }

        return {
          ...newState,
          abilities: {
            ...(newState.abilities ?? {}),
            [p.characterId]: {
              type: p.abilityType,
              turnsRemaining: 2,
              firstActionUsed: false,
            },
          },
        }
      }

      case 'deactivate-ability': {
        const p = payload as { characterId: string } | undefined
        if (!p) return s
        const abilities = { ...(s.abilities ?? {}) }
        delete abilities[p.characterId]
        return { ...s, abilities }
      }

      case 'next-turn': {
        const updated: Record<string, AggroActiveAbility> = {}
        for (const [charId, ability] of Object.entries(s.abilities ?? {})) {
          const remaining = ability.turnsRemaining - 1
          if (remaining > 0) {
            updated[charId] = {
              ...ability,
              turnsRemaining: remaining,
              firstActionUsed: false,
            }
          }
        }
        return { ...s, abilities: updated }
      }

      case 'reset-hate': {
        const p = payload as { enemyId: string } | undefined
        if (!p?.enemyId) return s
        return {
          ...s,
          enemies: s.enemies.map(e => {
            if (e.id !== p.enemyId) return e
            return { ...e, hate: {} }
          }),
        }
      }

      case 'set-turn-order': {
        const p = payload as { turnOrder: string[] } | undefined
        if (!p?.turnOrder) return s
        return { ...s, turnOrder: p.turnOrder }
      }

      case 'clear': {
        return { ...s, enemies: [], activeEnemyId: null, turnOrder: [], abilities: {} }
      }

      default:
        return s
    }
  },
})
