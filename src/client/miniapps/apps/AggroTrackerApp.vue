<script setup lang="ts">
import { computed, ref, watch, onMounted, nextTick } from 'vue'
import { useMiniApp } from '../useMiniApp'
import type { Character, CharacterRole } from '../../types'

type HateType = 'damage' | 'healing' | 'special'
type AbilityType = 'stalwart' | 'lucid-dreaming' | 'diversion'

interface CharacterHate {
  damage: number
  healing: number
  special: number
}

interface ActiveAbility {
  type: AbilityType
  turnsRemaining: number
  firstActionUsed: boolean
}

interface EnemyTab {
  id: string
  name: string
  hate: Record<string, CharacterHate>
}

interface AggroState {
  enemies: EnemyTab[]
  activeEnemyId: string | null
  turnOrder: string[]
  abilities: Record<string, ActiveAbility>
}

const props = defineProps<{
  campaignId: string
  isGM?: boolean
}>()

const { state, dispatch } = useMiniApp<AggroState>('aggro-tracker')

const characters = ref<Character[]>([])
const newEnemyName = ref('')

// Track which cell is in input mode: "characterId:hateType"
const activeInput = ref<string | null>(null)
const inputValue = ref('')
const inputRef = ref<HTMLInputElement | HTMLInputElement[] | null>(null)

const roleColors: Record<CharacterRole, string> = {
  NONE: '#72767d',
  DPS: '#ed4245',
  TANK: '#5865f2',
  HEALER: '#3ba55c',
}

const hateTypeColors: Record<HateType, string> = {
  damage: '#ed4245',
  healing: '#3ba55c',
  special: '#faa61a',
}

const hateTypeLabels: Record<HateType, string> = {
  damage: 'DMG',
  healing: 'HEAL',
  special: 'SPEC',
}

const roleAbilities: Record<CharacterRole, AbilityType | null> = {
  NONE: null,
  TANK: 'stalwart',
  DPS: 'diversion',
  HEALER: 'lucid-dreaming',
}

const abilityLabels: Record<AbilityType, string> = {
  'stalwart': 'Stalwart',
  'lucid-dreaming': 'Lucid Dreaming',
  'diversion': 'Diversion',
}

const abilityColors: Record<AbilityType, string> = {
  'stalwart': '#5865f2',
  'lucid-dreaming': '#3ba55c',
  'diversion': '#ed4245',
}

async function fetchCharacters() {
  const response = await fetch(`/api/campaigns/${props.campaignId}/characters`)
  characters.value = await response.json()
}

onMounted(fetchCharacters)
watch(() => props.campaignId, fetchCharacters)

const enemies = computed(() => state.value?.enemies ?? [])
const activeEnemyId = computed(() => state.value?.activeEnemyId ?? null)

const activeEnemy = computed(() => {
  if (!activeEnemyId.value) return null
  return enemies.value.find(e => e.id === activeEnemyId.value) ?? null
})

function getHate(characterId: string): CharacterHate {
  return activeEnemy.value?.hate[characterId] ?? { damage: 0, healing: 0, special: 0 }
}

function getTotalHate(characterId: string): number {
  const h = getHate(characterId)
  return h.damage + (h.healing * 2) + (h.special * 4)
}

// Turn order from state, with any new characters appended
const orderedCharacters = computed(() => {
  const savedOrder = state.value?.turnOrder ?? []
  const charIds = characters.value.map(c => c.id)
  const ordered = savedOrder.filter(id => charIds.includes(id))
  const newIds = charIds.filter(id => !ordered.includes(id))
  return [...ordered, ...newIds]
    .map(id => characters.value.find(c => c.id === id))
    .filter((c): c is Character => c !== undefined)
})

// Hate priority rank (1 = most hated, ties share rank)
function getHatePriority(characterId: string): number {
  const totals = characters.value
    .map(c => getTotalHate(c.id))
    .sort((a, b) => b - a)
  const myTotal = getTotalHate(characterId)
  if (myTotal === 0) return '-' as unknown as number
  const uniqueTotals = [...new Set(totals.filter(t => t > 0))]
  return uniqueTotals.indexOf(myTotal) + 1
}

// Drag and drop
const dragIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

function onDragStart(index: number, event: DragEvent) {
  dragIndex.value = index
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
  }
}

function onDragOver(index: number, event: DragEvent) {
  event.preventDefault()
  dragOverIndex.value = index
}

function onDragLeave() {
  dragOverIndex.value = null
}

function onDrop(index: number) {
  if (dragIndex.value === null || dragIndex.value === index) {
    dragIndex.value = null
    dragOverIndex.value = null
    return
  }
  const order = orderedCharacters.value.map(c => c.id)
  const [moved] = order.splice(dragIndex.value, 1)
  order.splice(index, 0, moved)
  dispatch('set-turn-order', { turnOrder: order })
  dragIndex.value = null
  dragOverIndex.value = null
}

function onDragEnd() {
  dragIndex.value = null
  dragOverIndex.value = null
}

function addEnemy() {
  const name = newEnemyName.value.trim()
  if (!name) return
  dispatch('add-enemy', { name })
  newEnemyName.value = ''
}

function removeEnemy(enemyId: string) {
  if (!confirm('Remove this enemy?')) return
  dispatch('remove-enemy', { enemyId })
}

function selectEnemy(enemyId: string) {
  dispatch('select-enemy', { enemyId })
}

function resetAllHate() {
  if (!activeEnemyId.value) return
  if (!confirm('Reset all hate for this enemy?')) return
  dispatch('reset-hate', { enemyId: activeEnemyId.value })
}

function clearAll() {
  if (!confirm('Clear all enemies and hate data?')) return
  dispatch('clear')
}

function openInput(characterId: string, hateType: HateType) {
  const key = `${characterId}:${hateType}`
  if (activeInput.value === key) {
    activeInput.value = null
    return
  }
  activeInput.value = key
  inputValue.value = ''
  nextTick(() => {
    const el = Array.isArray(inputRef.value) ? inputRef.value[0] : inputRef.value
    el?.focus()
  })
}

function submitInput(characterId: string, hateType: HateType) {
  if (!activeEnemyId.value) return
  const raw = inputValue.value.trim()
  if (!raw) {
    activeInput.value = null
    return
  }

  const currentHate = getHate(characterId)[hateType]

  // *N → multiply current value (dispatch as set)
  const mulMatch = raw.match(/^\*\s*(-?\d+(?:\.\d+)?)$/)
  if (mulMatch) {
    const factor = parseFloat(mulMatch[1])
    const newValue = Math.floor(currentHate * factor)
    // Set by dispatching the delta
    dispatch('add-hate', {
      enemyId: activeEnemyId.value,
      characterId,
      hateType,
      amount: newValue - currentHate,
    })
    activeInput.value = null
    inputValue.value = ''
    return
  }

  // =N → set to exact value
  const setMatch = raw.match(/^=\s*(-?\d+(?:\.\d+)?)$/)
  if (setMatch) {
    const newValue = Math.floor(parseFloat(setMatch[1]))
    dispatch('add-hate', {
      enemyId: activeEnemyId.value,
      characterId,
      hateType,
      amount: newValue - currentHate,
    })
    activeInput.value = null
    inputValue.value = ''
    return
  }

  // +N, -N, or plain N → add to current
  const addMatch = raw.match(/^([+-]?\d+(?:\.\d+)?)$/)
  if (addMatch) {
    const amount = Math.floor(parseFloat(addMatch[1]))
    if (amount === 0) {
      activeInput.value = null
      return
    }
    dispatch('add-hate', {
      enemyId: activeEnemyId.value,
      characterId,
      hateType,
      amount,
    })
    activeInput.value = null
    inputValue.value = ''
    return
  }

  // Invalid input, just close
  activeInput.value = null
  inputValue.value = ''
}

function cancelInput() {
  activeInput.value = null
  inputValue.value = ''
}

// Abilities
const abilities = computed(() => state.value?.abilities ?? {})

function getAbility(characterId: string): ActiveAbility | null {
  return abilities.value[characterId] ?? null
}

function getAbilityForRole(role: CharacterRole): AbilityType | null {
  return roleAbilities[role] ?? null
}

function toggleAbility(character: Character) {
  const existing = getAbility(character.id)
  if (existing) {
    dispatch('deactivate-ability', { characterId: character.id })
  } else {
    const abilityType = getAbilityForRole(character.role)
    if (!abilityType) return
    dispatch('activate-ability', { characterId: character.id, abilityType })
  }
}

function nextTurn() {
  dispatch('next-turn')
}
</script>

<template>
  <div class="aggro-app">
    <div class="app-header">
      <h4>Hate Tracker</h4>
      <button v-if="enemies.length > 0" @click="clearAll" class="clear-btn">Clear All</button>
    </div>

    <!-- Add enemy -->
    <div class="add-enemy">
      <input
        v-model="newEnemyName"
        type="text"
        placeholder="Enemy name"
        class="enemy-input"
        @keyup.enter="addEnemy"
      />
      <button @click="addEnemy" :disabled="!newEnemyName.trim()" class="add-btn">+ Add</button>
    </div>

    <div v-if="enemies.length === 0" class="empty">
      Add an enemy to start tracking hate
    </div>

    <template v-else>
      <!-- Enemy tabs -->
      <div class="enemy-tabs">
        <button
          v-for="enemy in enemies"
          :key="enemy.id"
          :class="['enemy-tab', { active: activeEnemyId === enemy.id }]"
          @click="selectEnemy(enemy.id)"
        >
          <span class="enemy-name">{{ enemy.name }}</span>
          <span @click.stop="removeEnemy(enemy.id)" class="remove-enemy">&times;</span>
        </button>
      </div>

      <!-- Hate table -->
      <div v-if="activeEnemy" class="hate-table">
        <div class="table-actions">
          <button @click="nextTurn" class="next-turn-btn">Next Turn</button>
          <button @click="resetAllHate" class="reset-btn">Reset Hate</button>
        </div>

        <!-- Header -->
        <div class="hate-header">
          <span class="col-drag"></span>
          <span class="col-priority">Hate</span>
          <span class="col-name">Character</span>
          <span class="col-ability">Ability</span>
          <span class="col-type" :style="{ color: hateTypeColors.damage }">DMG</span>
          <span class="col-type" :style="{ color: hateTypeColors.healing }">HEAL</span>
          <span class="col-type" :style="{ color: hateTypeColors.special }">SPEC</span>
          <span class="col-total">Total</span>
        </div>

        <div
          v-for="(character, index) in orderedCharacters"
          :key="character.id"
          :class="['hate-row', {
            dragging: dragIndex === index,
            'drag-over': dragOverIndex === index && dragIndex !== index,
          }]"
          :draggable="dragIndex !== null"
          @dragover="onDragOver(index, $event)"
          @dragleave="onDragLeave"
          @drop="onDrop(index)"
          @dragend="onDragEnd"
        >
          <span
            class="col-drag drag-handle"
            draggable="true"
            @dragstart.stop="onDragStart(index, $event)"
          >⠿</span>
          <span :class="['col-priority', 'priority-badge', {
            'priority-1': getHatePriority(character.id) === 1,
            'priority-2': getHatePriority(character.id) === 2,
          }]">{{ getHatePriority(character.id) }}</span>

          <div class="col-name char-info">
            <span
              class="role-indicator"
              :style="{ background: roleColors[character.role || 'NONE'] }"
            ></span>
            <span class="char-name">{{ character.name }}</span>
          </div>

          <div class="col-ability">
            <button
              v-if="getAbilityForRole(character.role)"
              :class="['ability-btn', { active: !!getAbility(character.id) }]"
              :style="getAbility(character.id) ? { background: abilityColors[getAbility(character.id)!.type], borderColor: abilityColors[getAbility(character.id)!.type] } : {}"
              @click="toggleAbility(character)"
              :title="abilityLabels[getAbilityForRole(character.role)!]"
            >
              <template v-if="getAbility(character.id)">
                {{ abilityLabels[getAbility(character.id)!.type] }}
                <span class="turns-badge">{{ getAbility(character.id)!.turnsRemaining }}</span>
              </template>
              <template v-else>
                {{ abilityLabels[getAbilityForRole(character.role)!] }}
              </template>
            </button>
            <span v-else class="no-ability">-</span>
          </div>

          <!-- Damage -->
          <div class="col-type hate-cell">
            <template v-if="activeInput === `${character.id}:damage`">
              <input
                ref="inputRef"
                v-model="inputValue"
                type="text"
                inputmode="numeric"
                class="hate-input"
                @keyup.enter="submitInput(character.id, 'damage')"
                @keyup.escape="cancelInput"
                @blur="cancelInput"
              />
            </template>
            <button
              v-else
              class="hate-value-btn"
              :style="{ borderColor: hateTypeColors.damage }"
              @click="openInput(character.id, 'damage')"
            >
              {{ getHate(character.id).damage }}
            </button>
          </div>

          <!-- Healing -->
          <div class="col-type hate-cell">
            <template v-if="activeInput === `${character.id}:healing`">
              <input
                ref="inputRef"
                v-model="inputValue"
                type="text"
                inputmode="numeric"
                class="hate-input"
                @keyup.enter="submitInput(character.id, 'healing')"
                @keyup.escape="cancelInput"
                @blur="cancelInput"
              />
            </template>
            <button
              v-else
              class="hate-value-btn"
              :style="{ borderColor: hateTypeColors.healing }"
              @click="openInput(character.id, 'healing')"
            >
              {{ getHate(character.id).healing }}
            </button>
          </div>

          <!-- Special -->
          <div class="col-type hate-cell">
            <template v-if="activeInput === `${character.id}:special`">
              <input
                ref="inputRef"
                v-model="inputValue"
                type="text"
                inputmode="numeric"
                class="hate-input"
                @keyup.enter="submitInput(character.id, 'special')"
                @keyup.escape="cancelInput"
                @blur="cancelInput"
              />
            </template>
            <button
              v-else
              class="hate-value-btn"
              :style="{ borderColor: hateTypeColors.special }"
              @click="openInput(character.id, 'special')"
            >
              {{ getHate(character.id).special }}
            </button>
          </div>

          <span class="col-total total-value">{{ getTotalHate(character.id) }}</span>
        </div>

        <div v-if="characters.length === 0" class="empty">
          No characters in this campaign
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.aggro-app {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.app-header h4 {
  margin: 0;
  font-size: 0.875rem;
  color: #72767d;
  text-transform: uppercase;
}

.next-turn-btn {
  background: #5865f2;
  border: none;
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  font-size: 0.6875rem;
  font-weight: 600;
  cursor: pointer;
}

.next-turn-btn:hover {
  background: #4752c4;
}

.clear-btn, .reset-btn {
  background: transparent;
  border: 1px solid #40444b;
  color: #72767d;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.625rem;
  cursor: pointer;
}

.clear-btn:hover, .reset-btn:hover {
  border-color: #ed4245;
  color: #ed4245;
}

.add-enemy {
  display: flex;
  gap: 0.5rem;
}

.enemy-input {
  flex: 1;
  padding: 0.5rem;
  background: #40444b;
  border: 1px solid #40444b;
  border-radius: 4px;
  color: #dcddde;
  font-size: 0.875rem;
}

.enemy-input:focus {
  border-color: #5865f2;
  outline: none;
}

.add-btn {
  padding: 0.5rem 0.75rem;
  background: #5865f2;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8125rem;
}

.add-btn:hover:not(:disabled) {
  background: #4752c4;
}

.add-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.empty {
  text-align: center;
  color: #72767d;
  font-size: 0.875rem;
  padding: 1rem;
}

.enemy-tabs {
  display: flex;
  gap: 0.25rem;
  overflow-x: auto;
  border-bottom: 1px solid #40444b;
  padding-bottom: 0.5rem;
}

.enemy-tab {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  background: #40444b;
  border: none;
  border-radius: 4px 4px 0 0;
  color: #72767d;
  cursor: pointer;
  font-size: 0.8125rem;
  white-space: nowrap;
}

.enemy-tab:hover {
  color: #dcddde;
}

.enemy-tab.active {
  background: #5865f2;
  color: white;
}

.remove-enemy {
  font-size: 1rem;
  line-height: 1;
  opacity: 0.5;
  cursor: pointer;
}

.remove-enemy:hover {
  opacity: 1;
}

.hate-table {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.table-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.hate-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  color: #72767d;
  letter-spacing: 0.05em;
}

.hate-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  background: #2f3136;
  border-radius: 4px;
  transition: opacity 0.15s, background 0.15s;
}

.hate-row:has(.priority-1) {
  background: rgba(237, 66, 69, 0.1);
  border-left: 2px solid #ed4245;
}

.hate-row:has(.priority-2) {
  background: rgba(250, 166, 26, 0.08);
  border-left: 2px solid #faa61a;
}

.hate-row.dragging {
  opacity: 0.4;
}

.hate-row.drag-over {
  background: #3a3d44;
  box-shadow: 0 -2px 0 #5865f2 inset;
}

.col-drag {
  width: 16px;
  flex-shrink: 0;
  text-align: center;
}

.drag-handle {
  cursor: grab;
  color: #4f545c;
  font-size: 0.875rem;
  user-select: none;
}

.drag-handle:hover {
  color: #72767d;
}

.drag-handle:active {
  cursor: grabbing;
}

.col-priority {
  width: 24px;
  text-align: center;
  flex-shrink: 0;
}

.priority-badge {
  font-size: 0.75rem;
  font-weight: 700;
  color: #dcddde;
}

.priority-1 {
  color: #ed4245;
}

.priority-2 {
  color: #faa61a;
}

.col-name {
  flex: 1;
  min-width: 0;
}

.char-info {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.role-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.char-name {
  font-size: 0.8125rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-type {
  width: 56px;
  text-align: center;
  flex-shrink: 0;
}

.col-total {
  width: 44px;
  text-align: center;
  flex-shrink: 0;
}

.total-value {
  font-size: 0.875rem;
  font-weight: 700;
  color: #fff;
}

.hate-cell {
  display: flex;
  justify-content: center;
}

.hate-value-btn {
  width: 48px;
  height: 28px;
  background: #40444b;
  border: 1px solid;
  border-radius: 4px;
  color: #dcddde;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.hate-value-btn:hover {
  background: #4f545c;
}

.hate-input {
  width: 48px;
  height: 28px;
  background: #202225;
  border: 1px solid #5865f2;
  border-radius: 4px;
  color: #fff;
  font-size: 0.8125rem;
  text-align: center;
  outline: none;
}

/* Hide number input spinners */
.hate-input::-webkit-inner-spin-button,
.hate-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.hate-input {
  -moz-appearance: textfield;
}

.col-ability {
  width: auto;
  flex-shrink: 0;
}

.ability-btn {
  position: relative;
  height: 28px;
  padding: 0;
  background: #40444b;
  border: 1px solid #4f545c;
  border-radius: 4px;
  color: #dcddde;
  font-size: 0.5625rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  padding: 0 0.5rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.ability-btn:hover {
  background: #4f545c;
}

.ability-btn.active {
  color: white;
}

.turns-badge {
  display: inline-block;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 50%;
  width: 14px;
  height: 14px;
  font-size: 0.5625rem;
  line-height: 14px;
  text-align: center;
  margin-left: 0.125rem;
}

.no-ability {
  color: #4f545c;
  font-size: 0.75rem;
}
</style>
