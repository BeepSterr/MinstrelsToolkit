<script setup lang="ts">
import { computed } from 'vue'
import { useMiniApp } from '../useMiniApp'

interface Card {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades'
  rank: string
  value: number
}

interface Player {
  oderId: string
  username: string
  hand: Card[]
  status: 'playing' | 'stand' | 'bust' | 'blackjack'
}

interface BlackjackState {
  phase: 'idle' | 'joining' | 'playing' | 'dealer' | 'results'
  players: Player[]
  dealer: {
    hand: Card[]
    hidden: boolean
  }
  currentPlayerIndex: number
  deck: Card[]
}

const props = defineProps<{
  campaignId: string
  isGM?: boolean
  currentUser?: { oderId: string; username: string }
}>()

const { state, dispatch } = useMiniApp<BlackjackState>('blackjack')

const currentState = computed(() => state.value ?? {
  phase: 'idle',
  players: [],
  dealer: { hand: [], hidden: true },
  currentPlayerIndex: 0,
  deck: [],
})

const hasJoined = computed(() => {
  if (!props.currentUser) return false
  return currentState.value.players.some(p => p.oderId === props.currentUser!.oderId)
})

const isMyTurn = computed(() => {
  if (!props.currentUser || currentState.value.phase !== 'playing') return false
  const currentPlayer = currentState.value.players[currentState.value.currentPlayerIndex]
  return currentPlayer?.oderId === props.currentUser.oderId
})

const myPlayer = computed(() => {
  if (!props.currentUser) return null
  return currentState.value.players.find(p => p.oderId === props.currentUser!.oderId)
})

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

function getHandDisplay(hand: Card[], hidden = false): string {
  if (hidden && hand.length > 0) {
    return `${getCardDisplay(hand[0])} ??`
  }
  return hand.map(getCardDisplay).join(' ')
}

function getCardDisplay(card: Card): string {
  const suits: Record<string, string> = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠',
  }
  return `${card.rank}${suits[card.suit]}`
}

function getSuitColor(card: Card): string {
  return card.suit === 'hearts' || card.suit === 'diamonds' ? 'red' : 'black'
}

function getDealerValue(): number | string {
  if (currentState.value.dealer.hidden && currentState.value.dealer.hand.length > 0) {
    return currentState.value.dealer.hand[0].value
  }
  return calculateHandValue(currentState.value.dealer.hand)
}

function getPlayerResult(player: Player): 'win' | 'lose' | 'push' | 'blackjack' | null {
  if (currentState.value.phase !== 'results') return null

  const playerValue = calculateHandValue(player.hand)
  const dealerValue = calculateHandValue(currentState.value.dealer.hand)

  if (player.status === 'bust') return 'lose'
  if (player.status === 'blackjack' && dealerValue !== 21) return 'blackjack'
  if (dealerValue > 21) return 'win'
  if (playerValue > dealerValue) return 'win'
  if (playerValue < dealerValue) return 'lose'
  return 'push'
}

function startRound() {
  dispatch('start-round')
}

function joinGame() {
  dispatch('join')
}

function deal() {
  dispatch('deal')
}

function hit() {
  dispatch('hit')
}

function stand() {
  dispatch('stand')
}

function reset() {
  dispatch('reset')
}
</script>

<template>
  <div class="blackjack-app">
    <!-- Idle phase - GM can start -->
    <template v-if="currentState.phase === 'idle'">
      <div v-if="isGM" class="gm-start">
        <button @click="startRound" class="start-btn">Start New Round</button>
      </div>
      <div v-else class="player-waiting">
        <span class="waiting-icon">🃏</span>
        <span class="waiting-text">Waiting for GM to start a round...</span>
      </div>
    </template>

    <!-- Joining phase -->
    <template v-if="currentState.phase === 'joining'">
      <div class="joining-phase">
        <h4>Players Joining...</h4>
        <div class="player-list">
          <div v-for="player in currentState.players" :key="player.oderId" class="player-chip">
            {{ player.username }}
          </div>
          <div v-if="currentState.players.length === 0" class="no-players">
            No players yet
          </div>
        </div>

        <button
          v-if="!isGM && !hasJoined"
          @click="joinGame"
          class="join-btn"
        >
          Join Game
        </button>
        <div v-if="!isGM && hasJoined" class="joined-message">
          You're in! Waiting for deal...
        </div>

        <button
          v-if="isGM"
          @click="deal"
          :disabled="currentState.players.length === 0"
          class="deal-btn"
        >
          Deal Cards
        </button>
      </div>
    </template>

    <!-- Playing / Dealer / Results phases -->
    <template v-if="currentState.phase === 'playing' || currentState.phase === 'dealer' || currentState.phase === 'results'">
      <div class="game-area">
        <!-- Dealer hand -->
        <div class="dealer-section">
          <div class="section-label">Dealer</div>
          <div class="hand dealer-hand">
            <div
              v-for="(card, idx) in currentState.dealer.hand"
              :key="idx"
              :class="['card', getSuitColor(card), { hidden: currentState.dealer.hidden && idx === 1 }]"
            >
              <template v-if="!(currentState.dealer.hidden && idx === 1)">
                <span class="card-rank">{{ card.rank }}</span>
                <span class="card-suit">{{ { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }[card.suit] }}</span>
              </template>
              <template v-else>
                <span class="card-back">?</span>
              </template>
            </div>
          </div>
          <div class="hand-value">{{ getDealerValue() }}</div>
        </div>

        <!-- Players -->
        <div class="players-section">
          <div
            v-for="(player, idx) in currentState.players"
            :key="player.oderId"
            :class="['player-row', {
              'current-turn': currentState.phase === 'playing' && idx === currentState.currentPlayerIndex,
              'is-me': player.oderId === currentUser?.oderId
            }]"
          >
            <div class="player-info">
              <span class="player-name">{{ player.username }}</span>
              <span :class="['player-status', player.status]">
                {{ player.status === 'blackjack' ? 'BLACKJACK!' : player.status === 'bust' ? 'BUST' : player.status === 'stand' ? 'STAND' : '' }}
              </span>
              <span v-if="currentState.phase === 'results'" :class="['result-badge', getPlayerResult(player)]">
                {{ getPlayerResult(player)?.toUpperCase() }}
              </span>
            </div>
            <div class="hand">
              <div
                v-for="(card, cardIdx) in player.hand"
                :key="cardIdx"
                :class="['card', 'small', getSuitColor(card)]"
              >
                <span class="card-rank">{{ card.rank }}</span>
                <span class="card-suit">{{ { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }[card.suit] }}</span>
              </div>
            </div>
            <div class="hand-value">{{ calculateHandValue(player.hand) }}</div>
          </div>
        </div>

        <!-- Player controls -->
        <div v-if="isMyTurn && myPlayer?.status === 'playing'" class="player-controls">
          <button @click="hit" class="hit-btn">Hit</button>
          <button @click="stand" class="stand-btn">Stand</button>
        </div>

        <!-- Waiting message for players -->
        <div v-if="!isGM && currentState.phase === 'playing' && !isMyTurn && myPlayer?.status === 'playing'" class="waiting-turn">
          Waiting for {{ currentState.players[currentState.currentPlayerIndex]?.username }}...
        </div>

        <!-- GM reset button -->
        <button v-if="isGM && currentState.phase === 'results'" @click="reset" class="reset-btn">
          New Round
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.blackjack-app {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
}

.gm-start {
  display: flex;
  justify-content: center;
  padding: 2rem;
}

.start-btn {
  padding: 1rem 2rem;
  background: #3ba55c;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1.125rem;
  font-weight: 600;
  cursor: pointer;
}

.start-btn:hover {
  background: #2d8049;
}

.player-waiting {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 2rem;
  color: #72767d;
}

.waiting-icon {
  font-size: 3rem;
}

.waiting-text {
  font-size: 0.875rem;
}

.joining-phase {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
}

.joining-phase h4 {
  margin: 0;
  color: #dcddde;
  font-size: 1rem;
}

.player-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
  min-height: 40px;
}

.player-chip {
  padding: 0.5rem 1rem;
  background: #5865f2;
  color: white;
  border-radius: 20px;
  font-size: 0.875rem;
  font-weight: 500;
}

.no-players {
  color: #72767d;
  font-size: 0.875rem;
}

.join-btn {
  padding: 0.75rem 2rem;
  background: #5865f2;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}

.join-btn:hover {
  background: #4752c4;
}

.joined-message {
  color: #3ba55c;
  font-size: 0.875rem;
}

.deal-btn {
  padding: 0.75rem 2rem;
  background: #faa61a;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}

.deal-btn:hover:not(:disabled) {
  background: #d4900f;
}

.deal-btn:disabled {
  background: #4f545c;
  cursor: not-allowed;
}

.game-area {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.dealer-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  background: #2d4a2d;
  border-radius: 12px;
}

.section-label {
  font-size: 0.75rem;
  color: #72767d;
  text-transform: uppercase;
  font-weight: 600;
}

.hand {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: center;
}

.card {
  width: 50px;
  height: 70px;
  background: white;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.card.small {
  width: 40px;
  height: 56px;
  font-size: 0.875rem;
}

.card.red {
  color: #ed4245;
}

.card.black {
  color: #1a1a1a;
}

.card.hidden {
  background: linear-gradient(135deg, #5865f2 25%, #4752c4 25%, #4752c4 50%, #5865f2 50%, #5865f2 75%, #4752c4 75%);
  background-size: 10px 10px;
}

.card-back {
  color: white;
  font-size: 1.5rem;
}

.card-rank {
  font-size: 1rem;
  line-height: 1;
}

.card-suit {
  font-size: 1.25rem;
  line-height: 1;
}

.card.small .card-rank {
  font-size: 0.75rem;
}

.card.small .card-suit {
  font-size: 1rem;
}

.hand-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: #dcddde;
}

.players-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.player-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem;
  background: #40444b;
  border-radius: 8px;
  border: 2px solid transparent;
}

.player-row.current-turn {
  border-color: #faa61a;
  background: #4a4420;
}

.player-row.is-me {
  background: #3d4270;
}

.player-row.is-me.current-turn {
  background: #4a4420;
}

.player-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 100px;
}

.player-name {
  font-weight: 600;
  color: #dcddde;
  font-size: 0.875rem;
}

.player-status {
  font-size: 0.75rem;
  font-weight: 700;
}

.player-status.bust {
  color: #ed4245;
}

.player-status.blackjack {
  color: #faa61a;
}

.player-status.stand {
  color: #72767d;
}

.result-badge {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
  width: fit-content;
}

.result-badge.win, .result-badge.blackjack {
  background: #3ba55c;
  color: white;
}

.result-badge.lose {
  background: #ed4245;
  color: white;
}

.result-badge.push {
  background: #72767d;
  color: white;
}

.player-controls {
  display: flex;
  gap: 1rem;
  justify-content: center;
  padding: 1rem;
}

.hit-btn {
  padding: 0.75rem 2rem;
  background: #3ba55c;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
}

.hit-btn:hover {
  background: #2d8049;
}

.stand-btn {
  padding: 0.75rem 2rem;
  background: #ed4245;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
}

.stand-btn:hover {
  background: #c73e3a;
}

.waiting-turn {
  text-align: center;
  color: #72767d;
  font-size: 0.875rem;
  padding: 0.5rem;
}

.reset-btn {
  padding: 0.75rem;
  background: #5865f2;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  align-self: center;
}

.reset-btn:hover {
  background: #4752c4;
}
</style>
