import { ref, watch, onUnmounted, type Ref } from 'vue'
import { useWebSocket } from './useWebSocket'
import { useAssetCache } from './useAssetCache'
import type { Asset, PlaybackState } from '../types'

export function usePlayback(
  campaignId: Ref<string | null>,
  assets: Ref<Asset[]>
) {
  const { playbackState, play, pause, seek, selectAsset, onMessage } = useWebSocket()
  const { getAssetUrl, revokeAssetUrl } = useAssetCache()

  const currentAsset = ref<Asset | null>(null)
  const assetUrl = ref<string | null>(null)
  const mediaElement = ref<HTMLAudioElement | HTMLVideoElement | null>(null)
  const loading = ref(false)

  async function loadAsset(asset: Asset): Promise<void> {
    if (assetUrl.value) {
      revokeAssetUrl(assetUrl.value)
      assetUrl.value = null
    }

    if (!campaignId.value) return

    loading.value = true
    try {
      assetUrl.value = await getAssetUrl(campaignId.value, asset)
      currentAsset.value = asset
    } finally {
      loading.value = false
    }
  }

  function syncPlayback(state: PlaybackState): void {
    if (!mediaElement.value || !currentAsset.value) return
    if (currentAsset.value.type === 'image') return

    const el = mediaElement.value
    const elapsed = (Date.now() - state.timestamp) / 1000
    const targetTime = state.playing
      ? state.currentTime + elapsed
      : state.currentTime

    if (Math.abs(el.currentTime - targetTime) > 0.5) {
      el.currentTime = targetTime
    }

    if (state.playing && el.paused) {
      el.play().catch(() => {})
    } else if (!state.playing && !el.paused) {
      el.pause()
    }
  }

  watch(
    () => playbackState.value.assetId,
    async (assetId) => {
      if (!assetId) {
        currentAsset.value = null
        if (assetUrl.value) {
          revokeAssetUrl(assetUrl.value)
          assetUrl.value = null
        }
        return
      }

      const asset = assets.value.find((a) => a.id === assetId)
      if (asset) {
        await loadAsset(asset)
      }
    },
    { immediate: true }
  )

  // Only sync on timing-relevant changes (not queue changes)
  watch(
    () => ({
      playing: playbackState.value.playing,
      currentTime: playbackState.value.currentTime,
      timestamp: playbackState.value.timestamp,
    }),
    () => {
      syncPlayback(playbackState.value)
    }
  )

  const unsubscribe = onMessage((message) => {
    // Only sync on playback-state, not queue-updated
    if (message.type === 'playback-state') {
      syncPlayback(message.playback)
    }
  })

  onUnmounted(() => {
    unsubscribe()
    if (assetUrl.value) {
      revokeAssetUrl(assetUrl.value)
    }
  })

  function setMediaElement(el: HTMLAudioElement | HTMLVideoElement | null): void {
    mediaElement.value = el
    if (el) {
      syncPlayback(playbackState.value)
    }
  }

  function handleSelect(assetId: string | null): void {
    selectAsset(assetId)
  }

  function handlePlay(): void {
    play()
  }

  function handlePause(): void {
    pause()
  }

  function handleSeek(time: number): void {
    seek(time)
  }

  return {
    currentAsset,
    assetUrl,
    loading,
    playbackState,
    setMediaElement,
    selectAsset: handleSelect,
    play: handlePlay,
    pause: handlePause,
    seek: handleSeek,
  }
}
