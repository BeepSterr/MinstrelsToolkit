# Bardbox Project Guide

## What is Bardbox?

Bardbox is a media playback application for tabletop RPG sessions. It has two distinct user interfaces:

1. **GM (Game Master) Panel** - A web dashboard for managing campaigns, uploading assets, controlling playback
2. **Player View** - An embedded Discord Activity that players join to see/hear synced media

## Key Concept: Two Separate Apps

This project builds **two separate Vue applications** from the same codebase:

| Entry Point | HTML | Root Component | Purpose |
|-------------|------|----------------|---------|
| `main.ts` | `index.html` | `App.vue` | **GM Panel** - runs in a browser |
| `player.ts` | `player.html` | `PlayerApp.vue` | **Player View** - runs inside Discord |

### GM Panel (`App.vue`)
- Accessed directly via browser at the server URL
- No Discord authentication required
- Full control: create campaigns, upload assets, manage playlists, control playback
- Uses `PlaybackView.vue` for the main playback interface

### Player View (`PlayerApp.vue`)
- Embedded as a Discord Activity (iframe inside Discord)
- Requires Discord authentication via OAuth
- Read-only: players see what the GM shows them, hear synced audio
- Uses `PlayerPlaybackView.vue` for the player interface

## Project Structure

```
src/
├── client/                    # Frontend (Vue 3 + TypeScript)
│   ├── main.ts               # GM app entry point
│   ├── player.ts             # Player app entry point
│   ├── App.vue               # GM root component
│   ├── PlayerApp.vue         # Player root component
│   ├── types.ts              # Shared TypeScript types
│   │
│   ├── components/
│   │   ├── PlaybackView.vue        # GM's main playback UI
│   │   ├── PlayerPlaybackView.vue  # Player's playback UI
│   │   ├── CampaignList.vue        # Campaign management
│   │   ├── AssetList.vue           # Asset browser
│   │   ├── AssetUploader.vue       # File upload
│   │   ├── PlaylistPanel.vue       # Playlist management
│   │   ├── PlaylistEditor.vue      # Playlist editing
│   │   ├── MiniAppsPanel.vue       # GM's app toggle panel
│   │   └── MiniAppsContainer.vue   # Renders active mini-apps
│   │
│   ├── composables/
│   │   ├── useWebSocket.ts    # WebSocket connection + state sync
│   │   ├── usePlayback.ts     # Media playback logic
│   │   ├── useAssetCache.ts   # Asset URL caching
│   │   └── useDiscordAuth.ts  # Discord OAuth (player only)
│   │
│   └── miniapps/              # Mini-apps system
│       ├── types.ts           # Mini-app type definitions
│       ├── registry.ts        # App registration
│       ├── useMiniApp.ts      # Composable for apps
│       ├── index.ts           # Registers built-in apps
│       └── apps/
│           ├── DiceRollerApp.vue      # Dice Bank app
│           ├── MediaDisplayApp.vue    # Image/video display
│           └── MediaDisplayControls.vue
│
├── server/                    # Backend (Bun + Hono)
│   ├── index.ts              # Server entry point
│   ├── router.ts             # HTTP API routes
│   ├── websocket.ts          # WebSocket handlers + room state
│   ├── types.ts              # Server-side types
│   └── services/
│       ├── campaign.ts       # Campaign CRUD
│       ├── asset.ts          # Asset management
│       └── playlist.ts       # Playlist management
│
└── data/                      # SQLite database + uploaded files
```

## Tech Stack

- **Runtime**: Bun
- **Frontend**: Vue 3 (Composition API, `<script setup>`)
- **Backend**: Hono (HTTP) + Bun WebSocket
- **Database**: SQLite via `bun:sqlite`
- **Build**: Vite
- **Styling**: Scoped CSS (Discord-like dark theme)

## Key Systems

### WebSocket Communication
- All real-time sync goes through `useWebSocket.ts` (client) and `websocket.ts` (server)
- Rooms are keyed by campaign ID
- State includes: playback position, playing/paused, current asset, mini-app states
- Auto-reconnect with exponential backoff

### Mini-Apps
- Extensible system for small interactive widgets (dice roller, media display, etc.)
- GM enables/disables apps via `MiniAppsPanel`
- State is synced to all players via WebSocket
- Apps are registered in `miniapps/index.ts`

### Asset Flow
1. GM uploads files via `AssetUploader`
2. Server stores in `data/assets/` with metadata in SQLite
3. Assets served via `/api/assets/:id/file`
4. Players fetch assets on-demand, cached via `useAssetCache`

## Common Patterns

### Adding a new component
1. Create `.vue` file in `components/`
2. Import and use in parent component
3. Use `<script setup lang="ts">` with Composition API

### Adding a new mini-app
1. Create component in `miniapps/apps/`
2. Register in `miniapps/index.ts` with `registerMiniApp()`
3. Define reducer for state changes
4. Add server-side reducer in `websocket.ts` if needed

### Adding a new WebSocket message
1. Add type to `ClientMessage` or `ServerMessage` in both `client/types.ts` and `server/types.ts`
2. Add handler in `websocket.ts` `handleMessage` switch
3. Add client-side handling in `useWebSocket.ts`

## Running the Project

```bash
# Install dependencies
bun install

# Development (runs both server + vite dev)
bun run dev

# Build for production
bun run build

# Start production server
bun run start
```

## Environment Variables

See `.env.example` for required Discord OAuth credentials and other config.
