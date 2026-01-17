<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMiniApp } from '../useMiniApp'

interface DiceRoll {
  id: string
  oderId: string
  username: string
  dice: string
  result: number
  timestamp: number
}

interface DiceRollerState {
  history: DiceRoll[]
}

const props = defineProps<{
  campaignId: string
  isGM?: boolean
}>()

const { state, dispatch } = useMiniApp<DiceRollerState>('dice-roller')

const diceTypes = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']
const customDice = ref('')
const fudgeValue = ref<number | null>(null)
const rolling = ref<string | null>(null)

const history = computed(() => state.value?.history ?? [])

// Order for grouping dice types (highest to lowest)
const diceOrder = ['d100', 'd20', 'd12', 'd10', 'd8', 'd6', 'd4']

const groupedHistory = computed(() => {
  const groups: Record<string, DiceRoll[]> = {}

  for (const roll of history.value) {
    if (!groups[roll.dice]) {
      groups[roll.dice] = []
    }
    groups[roll.dice].push(roll)
  }

  // Sort groups by dice order, unknown types go at the end
  const sortedKeys = Object.keys(groups).sort((a, b) => {
    const aIndex = diceOrder.indexOf(a)
    const bIndex = diceOrder.indexOf(b)
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b)
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    return aIndex - bIndex
  })

  return sortedKeys.map((dice) => ({ dice, rolls: groups[dice] }))
})

async function rollDice(dice: string) {
  rolling.value = dice
  dispatch('roll', { dice })
  // Animation delay
  setTimeout(() => {
    rolling.value = null
  }, 500)
}

function rollCustom() {
  if (customDice.value) {
    rollDice(customDice.value)
    customDice.value = ''
  }
}

function fudgeRoll() {
  if (fudgeValue.value !== null && customDice.value) {
    dispatch('fudge', { dice: customDice.value, result: fudgeValue.value })
    customDice.value = ''
    fudgeValue.value = null
  }
}

function removeRoll(id: string) {
  dispatch('remove', { id })
}

function clearAll() {
  dispatch('clear')
}

function getMaxForDice(dice: string): number {
  const match = dice.match(/d(\d+)$/)
  return match ? parseInt(match[1], 10) : 0
}

function getRollClass(dice: string, result: number): string {
  const max = getMaxForDice(dice)
  if (result === 1) return 'roll-min'
  if (result === max) return 'roll-max'
  return ''
}
</script>

<template>
  <div class="dice-roller-app">
    <!-- GM-only controls -->
    <template v-if="isGM">
      <div class="dice-buttons">
        <button
          v-for="dice in diceTypes"
          :key="dice"
          @click="rollDice(dice)"
          :class="['dice-btn', { rolling: rolling === dice }]"
        >
          <span class="dice-icon">🎲</span>
          <span class="dice-label">{{ dice }}</span>
        </button>
      </div>

      <div class="custom-roll">
        <input
          v-model="customDice"
          type="text"
          placeholder="Dice (e.g., 2d6)"
          class="custom-input"
          @keyup.enter="rollCustom"
        />
        <button @click="rollCustom" :disabled="!customDice" class="roll-btn">
          Roll
        </button>
      </div>

      <div class="fudge-roll">
        <input
          v-model="customDice"
          type="text"
          placeholder="Dice (e.g., d20)"
          class="fudge-dice-input"
        />
        <input
          v-model.number="fudgeValue"
          type="number"
          placeholder="Result"
          class="fudge-value-input"
        />
        <button
          @click="fudgeRoll"
          :disabled="!customDice || fudgeValue === null"
          class="fudge-btn"
        >
          Fudge
        </button>
      </div>
    </template>

    <!-- Player view - just shows they're waiting -->
    <div v-else class="player-notice">
      <span class="notice-icon">🎲</span>
      <span class="notice-text">The GM controls the dice</span>
    </div>

    <div class="history">
      <div class="history-header">
        <h4>Dice Bank</h4>
        <button v-if="isGM && history.length > 0" @click="clearAll" class="clear-btn">
          Clear All
        </button>
      </div>
      <div v-if="history.length === 0" class="empty-history">
        No rolls yet
      </div>
      <div v-else class="dice-groups">
        <div v-for="group in groupedHistory" :key="group.dice" class="dice-group">
          <span class="group-label">{{ group.dice }}</span>
          <div class="history-grid">
            <div
              v-for="roll in group.rolls"
              :key="roll.id"
              :class="['roll-tile', getRollClass(roll.dice, roll.result)]"
            >
              <button
                v-if="isGM"
                @click="removeRoll(roll.id)"
                class="remove-btn"
                title="Remove roll"
              >×</button>
              <span class="roll-result">{{ roll.result }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dice-roller-app {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
}

.dice-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
}

.dice-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.75rem 1rem;
  background: #40444b;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.dice-btn:hover {
  background: #5865f2;
  transform: scale(1.05);
}

.dice-btn.rolling {
  animation: shake 0.5s ease-in-out;
}

@keyframes shake {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-10deg); }
  50% { transform: rotate(10deg); }
  75% { transform: rotate(-5deg); }
}

.dice-icon {
  font-size: 1.5rem;
}

.dice-label {
  color: #dcddde;
  font-size: 0.75rem;
  font-weight: 600;
}

.custom-roll {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
}

.custom-input {
  padding: 0.5rem;
  background: #40444b;
  border: none;
  border-radius: 4px;
  color: #dcddde;
  width: 120px;
  text-align: center;
}

.custom-input::placeholder {
  color: #72767d;
}

.roll-btn {
  padding: 0.5rem 1rem;
  background: #5865f2;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.roll-btn:hover:not(:disabled) {
  background: #4752c4;
}

.roll-btn:disabled {
  background: #4f545c;
  cursor: not-allowed;
}

.fudge-roll {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  padding-top: 0.5rem;
  border-top: 1px solid #40444b;
}

.fudge-dice-input {
  padding: 0.5rem;
  background: #40444b;
  border: none;
  border-radius: 4px;
  color: #dcddde;
  width: 100px;
  text-align: center;
}

.fudge-value-input {
  padding: 0.5rem;
  background: #40444b;
  border: none;
  border-radius: 4px;
  color: #dcddde;
  width: 70px;
  text-align: center;
}

.fudge-value-input::placeholder,
.fudge-dice-input::placeholder {
  color: #72767d;
}

.fudge-btn {
  padding: 0.5rem 1rem;
  background: #ed4245;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.fudge-btn:hover:not(:disabled) {
  background: #c73e3a;
}

.fudge-btn:disabled {
  background: #4f545c;
  cursor: not-allowed;
}

.player-notice {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  color: #72767d;
}

.notice-icon {
  font-size: 2rem;
}

.notice-text {
  font-size: 0.875rem;
}

.history {
  border-top: 1px solid #40444b;
  padding-top: 1rem;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.history h4 {
  margin: 0;
  font-size: 0.875rem;
  color: #72767d;
  text-transform: uppercase;
}

.clear-btn {
  background: transparent;
  border: 1px solid #40444b;
  color: #72767d;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.625rem;
  cursor: pointer;
}

.clear-btn:hover {
  border-color: #ed4245;
  color: #ed4245;
}

.empty-history {
  text-align: center;
  color: #72767d;
  padding: 1rem;
}

.dice-groups {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: 250px;
  overflow-y: auto;
}

.dice-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.group-label {
  color: #72767d;
  font-size: 0.75rem;
  font-weight: 600;
  min-width: 36px;
  text-align: right;
}

.history-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  justify-content: center;
  flex: 1;
}

.roll-tile {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: #36393f;
  border-radius: 6px;
}

.roll-tile .roll-result {
  font-size: 1.125rem;
  font-weight: 700;
  color: #5865f2;
}

.roll-tile.roll-min {
  background: #442c2e;
}

.roll-tile.roll-min .roll-result {
  color: #ed4245;
}

.roll-tile.roll-max {
  background: #2d4032;
}

.roll-tile.roll-max .roll-result {
  color: #3ba55c;
}

.remove-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  padding: 0;
  background: transparent;
  border: none;
  color: #72767d;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  border-radius: 50%;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s;
}

.roll-tile:hover .remove-btn {
  opacity: 1;
}

.remove-btn:hover {
  background: #ed4245;
  color: white;
}
</style>
