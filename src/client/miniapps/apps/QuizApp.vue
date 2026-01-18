<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import { useMiniApp } from '../useMiniApp'

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

const props = defineProps<{
  campaignId: string
  isGM?: boolean
  currentUser?: { oderId: string; username: string }
}>()

const { state, dispatch } = useMiniApp<QuizState>('quiz')

// GM input state
const questionInput = ref('')
const optionInputs = ref(['', '', '', ''])
const correctIndexInput = ref(0)
const timeLimitInput = ref(15)

// Timer state
const timeRemaining = ref(0)
let timerInterval: ReturnType<typeof setInterval> | null = null

const currentState = computed(() => state.value ?? {
  phase: 'idle',
  question: '',
  options: [],
  correctIndex: 0,
  answers: [],
  timeLimit: 15,
  startTime: 0,
})

const myAnswer = computed(() => {
  if (!props.currentUser) return null
  return currentState.value.answers.find(a => a.oderId === props.currentUser!.oderId)
})

const hasAnswered = computed(() => myAnswer.value != null)

// Winner is the first correct answer by timestamp
const winner = computed(() => {
  const correct = currentState.value.answers
    .filter(a => a.answerIndex === currentState.value.correctIndex)
    .sort((a, b) => a.timestamp - b.timestamp)
  return correct.length > 0 ? correct[0] : null
})

// All other answers sorted by timestamp (excluding winner)
const otherAnswers = computed(() => {
  const winnerId = winner.value?.oderId
  return currentState.value.answers
    .filter(a => a.oderId !== winnerId)
    .sort((a, b) => a.timestamp - b.timestamp)
})

function isCorrect(answer: PlayerAnswer): boolean {
  return answer.answerIndex === currentState.value.correctIndex
}

function getTimeRemaining(answer: PlayerAnswer): number {
  const elapsed = (answer.timestamp - currentState.value.startTime) / 1000
  return Math.max(0, currentState.value.timeLimit - elapsed)
}

// Timer logic
watch(() => currentState.value.phase, (phase) => {
  if (phase === 'question') {
    startTimer()
  } else {
    stopTimer()
  }
}, { immediate: true })

function startTimer() {
  stopTimer()
  updateTimeRemaining()
  timerInterval = setInterval(updateTimeRemaining, 100)
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }
}

function updateTimeRemaining() {
  const elapsed = (Date.now() - currentState.value.startTime) / 1000
  timeRemaining.value = Math.max(0, currentState.value.timeLimit - elapsed)
}

onUnmounted(() => {
  stopTimer()
})

function startQuestion() {
  const validOptions = optionInputs.value.filter(o => o.trim())
  if (!questionInput.value.trim() || validOptions.length < 2) return

  dispatch('start-question', {
    question: questionInput.value.trim(),
    options: validOptions,
    correctIndex: Math.min(correctIndexInput.value, validOptions.length - 1),
    timeLimit: timeLimitInput.value,
  })
}

function submitAnswer(index: number) {
  if (hasAnswered.value) return
  dispatch('submit-answer', { answerIndex: index })
}

function revealResults() {
  dispatch('reveal-results')
}

function resetQuiz() {
  dispatch('reset')
  questionInput.value = ''
  optionInputs.value = ['', '', '', '']
  correctIndexInput.value = 0
}

function getOptionClass(index: number): string {
  if (currentState.value.phase === 'results') {
    if (index === currentState.value.correctIndex) return 'option-correct'
    if (myAnswer.value?.answerIndex === index) return 'option-wrong'
  }
  if (currentState.value.phase === 'question' && myAnswer.value?.answerIndex === index) {
    return 'option-selected'
  }
  return ''
}

const optionColors = ['option-red', 'option-blue', 'option-yellow', 'option-green']
</script>

<template>
  <div class="quiz-app">
    <!-- GM Controls: Setup phase -->
    <template v-if="isGM && currentState.phase === 'idle'">
      <div class="setup-section">
        <h4>Create Question</h4>
        <input
          v-model="questionInput"
          type="text"
          placeholder="Enter your question..."
          class="question-input"
        />

        <div class="options-setup">
          <div
            v-for="(_, index) in optionInputs"
            :key="index"
            class="option-setup-row"
          >
            <input
              type="radio"
              :name="'correct-answer'"
              :value="index"
              v-model="correctIndexInput"
              class="correct-radio"
            />
            <input
              v-model="optionInputs[index]"
              type="text"
              :placeholder="`Option ${index + 1}${index < 2 ? ' (required)' : ' (optional)'}`"
              :class="['option-input', optionColors[index]]"
            />
          </div>
        </div>

        <div class="time-limit-row">
          <label>Time limit:</label>
          <select v-model="timeLimitInput" class="time-select">
            <option :value="10">10 seconds</option>
            <option :value="15">15 seconds</option>
            <option :value="20">20 seconds</option>
            <option :value="30">30 seconds</option>
            <option :value="45">45 seconds</option>
            <option :value="60">60 seconds</option>
          </select>
        </div>

        <button
          @click="startQuestion"
          :disabled="!questionInput.trim() || optionInputs.filter(o => o.trim()).length < 2"
          class="start-btn"
        >
          Start Question
        </button>
      </div>
    </template>

    <!-- Question Phase -->
    <template v-if="currentState.phase === 'question' || currentState.phase === 'results'">
      <div class="question-display">
        <div class="question-header">
          <h3 class="question-text">{{ currentState.question }}</h3>
          <div v-if="currentState.phase === 'question'" class="timer-display">
            <div
              class="timer-bar"
              :style="{ width: `${(timeRemaining / currentState.timeLimit) * 100}%` }"
            ></div>
            <span class="timer-text">{{ Math.ceil(timeRemaining) }}s</span>
          </div>
        </div>

        <div class="options-grid">
          <button
            v-for="(option, index) in currentState.options"
            :key="index"
            @click="submitAnswer(index)"
            :disabled="isGM || hasAnswered || currentState.phase === 'results'"
            :class="['option-btn', optionColors[index], getOptionClass(index)]"
          >
            <span class="option-label">{{ option }}</span>
            <span v-if="currentState.phase === 'results'" class="answer-count">
              {{ currentState.answers.filter(a => a.answerIndex === index).length }}
            </span>
          </button>
        </div>

        <!-- Player waiting message -->
        <div v-if="!isGM && hasAnswered && currentState.phase === 'question'" class="waiting-message">
          Answer locked in! Waiting for results...
        </div>

        <!-- GM Controls during question -->
        <div v-if="isGM && currentState.phase === 'question'" class="gm-controls">
          <div class="answer-count-display">
            {{ currentState.answers.length }} answer{{ currentState.answers.length !== 1 ? 's' : '' }} received
          </div>
          <button @click="revealResults" class="reveal-btn">
            Reveal Results
          </button>
        </div>

        <!-- Results display -->
        <div v-if="currentState.phase === 'results'" class="results-section">
          <div class="results-header">
            <span class="correct-label">Correct Answer:</span>
            <span class="correct-answer">{{ currentState.options[currentState.correctIndex] }}</span>
          </div>

          <!-- Winner display -->
          <div v-if="winner" class="winner-display">
            <span class="winner-crown">👑</span>
            <span class="winner-name">{{ winner.username }}</span>
            <span class="winner-time">{{ getTimeRemaining(winner).toFixed(1) }}s remaining</span>
          </div>
          <div v-else class="no-winner">
            No correct answers!
          </div>

          <!-- Other answers list -->
          <ul v-if="otherAnswers.length > 0" class="results-list">
            <li
              v-for="answer in otherAnswers"
              :key="answer.oderId"
              :class="['result-item', isCorrect(answer) ? 'correct' : 'incorrect']"
            >
              <span class="result-icon">{{ isCorrect(answer) ? '✓' : '✗' }}</span>
              <span class="result-name">{{ answer.username }}</span>
              <span class="result-time">{{ getTimeRemaining(answer).toFixed(1) }}s</span>
            </li>
          </ul>

          <button v-if="isGM" @click="resetQuiz" class="next-btn">
            Next Question
          </button>
        </div>
      </div>
    </template>

    <!-- Player idle state -->
    <div v-if="!isGM && currentState.phase === 'idle'" class="player-waiting">
      <span class="waiting-icon">?</span>
      <span class="waiting-text">Waiting for the GM to start a question...</span>
    </div>
  </div>
</template>

<style scoped>
.quiz-app {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
}

.setup-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.setup-section h4 {
  margin: 0;
  color: #dcddde;
  font-size: 0.875rem;
  text-transform: uppercase;
}

.question-input {
  padding: 0.75rem;
  background: #40444b;
  border: none;
  border-radius: 4px;
  color: #dcddde;
  font-size: 1rem;
}

.question-input::placeholder {
  color: #72767d;
}

.options-setup {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.option-setup-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.correct-radio {
  accent-color: #3ba55c;
}

.option-input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  background: #40444b;
  border: none;
  border-left: 3px solid #72767d;
  border-radius: 4px;
  color: #dcddde;
}

.option-input::placeholder {
  color: #72767d;
}

.option-input.option-red { border-left-color: #ed4245; }
.option-input.option-blue { border-left-color: #5865f2; }
.option-input.option-yellow { border-left-color: #faa61a; }
.option-input.option-green { border-left-color: #3ba55c; }

.time-limit-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #b9bbbe;
  font-size: 0.875rem;
}

.time-select {
  padding: 0.5rem;
  background: #40444b;
  border: none;
  border-radius: 4px;
  color: #dcddde;
}

.start-btn {
  padding: 0.75rem;
  background: #5865f2;
  color: white;
  border: none;
  border-radius: 4px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.start-btn:hover:not(:disabled) {
  background: #4752c4;
}

.start-btn:disabled {
  background: #4f545c;
  cursor: not-allowed;
}

.question-display {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.question-header {
  text-align: center;
}

.question-text {
  margin: 0 0 0.75rem 0;
  color: #ffffff;
  font-size: 1.25rem;
}

.timer-display {
  position: relative;
  height: 24px;
  background: #40444b;
  border-radius: 12px;
  overflow: hidden;
}

.timer-bar {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(90deg, #ed4245, #faa61a, #3ba55c);
  transition: width 0.1s linear;
}

.timer-text {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: white;
  font-weight: 600;
  font-size: 0.875rem;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.options-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
}

.option-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  min-height: 60px;
}

.option-btn.option-red { background: #ed4245; }
.option-btn.option-blue { background: #5865f2; }
.option-btn.option-yellow { background: #faa61a; }
.option-btn.option-green { background: #3ba55c; }

.option-btn:hover:not(:disabled) {
  transform: scale(1.02);
  filter: brightness(1.1);
}

.option-btn:disabled {
  cursor: default;
  opacity: 0.8;
}

.option-btn.option-selected {
  box-shadow: inset 0 0 0 3px white;
}

.option-btn.option-correct {
  box-shadow: inset 0 0 0 3px #3ba55c, 0 0 10px rgba(59, 165, 92, 0.5);
}

.option-btn.option-wrong {
  box-shadow: inset 0 0 0 3px #ed4245;
  opacity: 0.6;
}

.option-label {
  flex: 1;
  text-align: left;
}

.answer-count {
  background: rgba(0, 0, 0, 0.3);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.875rem;
}

.waiting-message {
  text-align: center;
  color: #3ba55c;
  font-size: 0.875rem;
  padding: 0.5rem;
}

.gm-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-top: 0.5rem;
  border-top: 1px solid #40444b;
}

.answer-count-display {
  color: #b9bbbe;
  font-size: 0.875rem;
}

.reveal-btn {
  padding: 0.75rem 1.5rem;
  background: #faa61a;
  color: white;
  border: none;
  border-radius: 4px;
  font-weight: 600;
  cursor: pointer;
}

.reveal-btn:hover {
  background: #d4900f;
}

.results-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #40444b;
}

.results-header {
  text-align: center;
}

.correct-label {
  display: block;
  color: #72767d;
  font-size: 0.75rem;
  text-transform: uppercase;
  margin-bottom: 0.25rem;
}

.correct-answer {
  color: #3ba55c;
  font-size: 1.25rem;
  font-weight: 600;
}

.winner-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1.5rem;
  background: linear-gradient(135deg, #faa61a 0%, #f57c00 100%);
  border-radius: 12px;
  animation: winner-pop 0.3s ease-out;
}

@keyframes winner-pop {
  0% { transform: scale(0.8); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

.winner-crown {
  font-size: 2.5rem;
}

.winner-name {
  font-size: 1.5rem;
  font-weight: 700;
  color: white;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.winner-time {
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.8);
  font-weight: 500;
}

.no-winner {
  text-align: center;
  padding: 1.5rem;
  background: #40444b;
  border-radius: 12px;
  color: #72767d;
  font-size: 1rem;
}

.results-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: #40444b;
  border-radius: 6px;
}

.result-icon {
  font-size: 1rem;
  font-weight: 700;
  width: 1.5rem;
  text-align: center;
}

.result-item.correct .result-icon {
  color: #3ba55c;
}

.result-item.incorrect .result-icon {
  color: #ed4245;
}

.result-name {
  flex: 1;
  color: #dcddde;
  font-size: 0.9rem;
}

.result-time {
  color: #72767d;
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
}

.next-btn {
  padding: 0.75rem;
  background: #5865f2;
  color: white;
  border: none;
  border-radius: 4px;
  font-weight: 600;
  cursor: pointer;
}

.next-btn:hover {
  background: #4752c4;
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
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #40444b;
  border-radius: 50%;
  color: #5865f2;
  font-weight: bold;
}

.waiting-text {
  font-size: 0.875rem;
  text-align: center;
}
</style>
