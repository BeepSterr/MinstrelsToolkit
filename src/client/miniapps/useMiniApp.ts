import { computed } from 'vue'
import { useWebSocket } from '../composables/useWebSocket'

export function useMiniApp<T>(appId: string) {
  const { miniAppState, dispatchMiniAppAction } = useWebSocket()

  const state = computed<T>(() => miniAppState.value.appStates[appId] as T)

  function dispatch(action: string, payload?: unknown): void {
    dispatchMiniAppAction(appId, action, payload)
  }

  return { state, dispatch }
}
