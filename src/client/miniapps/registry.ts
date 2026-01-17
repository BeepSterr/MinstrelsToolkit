import type { MiniAppRegistration } from './types'

const registry = new Map<string, MiniAppRegistration>()

export function registerMiniApp(app: MiniAppRegistration): void {
  registry.set(app.id, app)
}

export function getMiniApp(id: string): MiniAppRegistration | undefined {
  return registry.get(id)
}

export function getAllMiniApps(): MiniAppRegistration[] {
  return Array.from(registry.values())
}
