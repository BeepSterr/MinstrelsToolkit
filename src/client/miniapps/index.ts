import { registerMiniApp } from './registry'
import MediaDisplayApp from './apps/MediaDisplayApp.vue'
import MediaDisplayControls from './apps/MediaDisplayControls.vue'
import DiceRollerApp from './apps/DiceRollerApp.vue'
import QuizApp from './apps/QuizApp.vue'

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
  description: 'Kahoot-style trivia questions for players',
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
