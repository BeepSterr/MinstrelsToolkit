<script setup lang="ts">
import { computed } from 'vue'
import type { Asset } from '../types'

interface LayerInfo {
  id: string
  name: string
  volume: number
}

const props = defineProps<{
  currentAsset: Asset | null
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  hasPlaylist: boolean
  playlistIndex: number
  playlistLength: number
  isLayered: boolean
  layeredTrackCount?: number
  layers?: LayerInfo[]
  shuffle: boolean
  loop: boolean
}>()

const emit = defineEmits<{
  play: []
  pause: []
  next: []
  prev: []
  seek: [time: number]
  'update:volume': [volume: number]
  'update:shuffle': [shuffle: boolean]
  'update:loop': [loop: boolean]
  'fade-to-layer': [assetId: string]
}>()

const progress = computed(() => {
  if (!props.duration) return 0
  return (props.currentTime / props.duration) * 100
})

function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function handleSeek(event: MouseEvent) {
  const bar = event.currentTarget as HTMLElement
  const rect = bar.getBoundingClientRect()
  const percent = (event.clientX - rect.left) / rect.width
  const time = percent * props.duration
  emit('seek', time)
}

function togglePlayback() {
  if (props.isPlaying) {
    emit('pause')
  } else {
    emit('play')
  }
}

const trackIcon = computed(() => {
  if (props.isLayered) return '🎚️'
  if (!props.currentAsset) return '🎵'
  return props.currentAsset.type === 'video' ? '🎬' : '🎵'
})

const trackName = computed(() => {
  if (props.isLayered) return 'Layered Playlist'
  return props.currentAsset?.name ?? 'No track selected'
})

const trackSubtitle = computed(() => {
  if (props.isLayered && props.layeredTrackCount) {
    return `${props.layeredTrackCount} tracks playing`
  }
  if (props.hasPlaylist) {
    return `Track ${props.playlistIndex + 1} of ${props.playlistLength}`
  }
  return null
})

const hasTrack = computed(() => props.currentAsset !== null || props.isLayered)

const activeLayer = computed(() => {
  if (!props.layers || props.layers.length === 0) return null
  return props.layers.reduce((max, layer) => layer.volume > max.volume ? layer : max, props.layers[0])
})
</script>

<template>
  <div class="music-bar">
    <!-- Track Info -->
    <div class="track-info">
      <span class="track-icon">{{ trackIcon }}</span>
      <div class="track-details">
        <span class="track-name">{{ trackName }}</span>
        <span v-if="trackSubtitle" class="track-subtitle">{{ trackSubtitle }}</span>
      </div>
    </div>

    <!-- Playback Controls -->
    <div class="playback-controls">
      <button
        v-if="hasPlaylist && !isLayered"
        @click="emit('prev')"
        class="btn-control"
        :disabled="!hasTrack"
      >
        ⏮
      </button>
      <button
        @click="togglePlayback"
        class="btn-play"
        :disabled="!hasTrack"
      >
        {{ isPlaying ? '⏸' : '▶' }}
      </button>
      <button
        v-if="hasPlaylist && !isLayered"
        @click="emit('next')"
        class="btn-control"
        :disabled="!hasTrack"
      >
        ⏭
      </button>

      <!-- Progress Bar -->
      <span class="time">{{ formatTime(currentTime) }}</span>
      <div class="progress-bar" :class="{ 'interact': !isLayered}" @click="!isLayered && handleSeek($event)">
        <div class="progress-fill" :style="{ width: `${progress}%` }"></div>
      </div>
      <span class="time">{{ formatTime(duration) }}</span>
    </div>

    <!-- Layer Quick Fade Buttons -->
    <div v-if="isLayered && layers && layers.length > 0" class="layer-buttons">
      <button
        v-for="layer in layers"
        :key="layer.id"
        @click="emit('fade-to-layer', layer.id)"
        :class="['btn-layer', { active: layer.volume > 0.5 }]"
        :title="layer.name"
      >
        {{ layer.name.slice(0, 8) }}{{ layer.name.length > 8 ? '…' : '' }}
      </button>
    </div>

    <!-- Playlist Controls -->
    <div v-if="hasPlaylist && !isLayered" class="playlist-controls">
      <button
        @click="emit('update:loop', !loop)"
        :class="['btn-toggle', { active: loop }]"
        title="Repeat"
      >
        🔁
      </button>
      <button
          @click="emit('update:shuffle', !shuffle)"
          :class="['btn-toggle', { active: shuffle }]"
          title="Shuffle"
      >
        🔀
      </button>
    </div>

    <!-- Volume Control -->
    <div class="volume-section">
      <span class="volume-icon">{{ volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊' }}</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        :value="volume"
        @input="emit('update:volume', parseFloat(($event.target as HTMLInputElement).value))"
        class="volume-slider"
      />
    </div>
  </div>
</template>

<style scoped>
.music-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: #2f3136;
  border-top: 1px solid #40444b;
  height: 72px;
  box-sizing: border-box;
}

.track-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 240px;
  min-width: 180px;
}

.track-icon {
  font-size: 1.5rem;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #40444b;
  border-radius: 4px;
}

.track-details {
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.track-name {
  font-size: 0.875rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-subtitle {
  font-size: 0.75rem;
  color: #72767d;
}

.playback-controls {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-control {
  background: transparent;
  color: #b9bbbe;
  border: none;
  padding: 0.5rem;
  cursor: pointer;
  font-size: 1rem;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-control:hover:not(:disabled) {
  color: #fff;
}

.btn-control:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.btn-play {
  background: #fff;
  color: #000;
  border: none;
  padding: 0.5rem;
  cursor: pointer;
  font-size: 1rem;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-play:hover:not(:disabled) {
  transform: scale(1.05);
}

.btn-play:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.time {
  font-size: 0.75rem;
  color: #a3a6aa;
  min-width: 36px;
  text-align: center;
}

.progress-bar {
  flex: 1;
  height: 4px;
  background: #4f545c;
  border-radius: 2px;
  //cursor: pointer;
  position: relative;
}

.progress-bar.interact {
  background: #4f545c;
  cursor: pointer;
}


.progress-bar.interact:hover  {
  height: 6px;
}


.progress-fill {
  height: 100%;
  background: #b9bbbe;
  border-radius: 2px;
  transition: width 0.1s linear;
}

/*
.progress-bar:hover .progress-fill {
  background: #5865f2;
}
 */

.layer-buttons {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  max-width: 300px;
  overflow-x: auto;
}

.btn-layer {
  background: #40444b;
  color: #72767d;
  border: none;
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  font-size: 0.6875rem;
  border-radius: 4px;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
}

.btn-layer:hover {
  background: #5865f2;
  color: #fff;
}

.btn-layer.active {
  background: #5865f2;
  color: #fff;
}

.playlist-controls {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.btn-toggle {
  background: transparent;
  border: none;
  padding: 0.5rem;
  cursor: pointer;
  font-size: 0.875rem;
  border-radius: 4px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  filter: grayscale(100%);
  opacity: 0.5;
  transition: filter 0.15s, opacity 0.15s;
}

.btn-toggle:hover {
  opacity: 0.7;
}

.btn-toggle.active {
  filter: none;
  opacity: 1;
}

.volume-section {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 140px;
  justify-content: flex-end;
}

.volume-icon {
  font-size: 1rem;
}

.volume-slider {
  width: 90px;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: #4f545c;
  border-radius: 2px;
  cursor: pointer;
}

.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  background: #fff;
  border-radius: 50%;
  cursor: pointer;
}

.volume-slider::-moz-range-thumb {
  width: 12px;
  height: 12px;
  background: #fff;
  border-radius: 50%;
  cursor: pointer;
  border: none;
}
</style>
