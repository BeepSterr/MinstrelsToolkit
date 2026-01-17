import type { Component } from 'vue'
import type { DiscordUser } from '../types'

export interface MiniAppDefinition {
  id: string
  name: string
  description: string
  icon: string
  defaultState: unknown
  playerInteractive: boolean
}

export interface MiniAppRegistration extends MiniAppDefinition {
  component: Component
  gmControlsComponent?: Component
  reducer: (state: unknown, action: string, payload?: unknown, user?: DiscordUser) => unknown
}
