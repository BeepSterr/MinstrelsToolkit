import { registerMiniApp } from './registry'
import MediaDisplayApp from './apps/MediaDisplayApp.vue'
import MediaDisplayControls from './apps/MediaDisplayControls.vue'
import DiceRollerApp from './apps/DiceRollerApp.vue'

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
