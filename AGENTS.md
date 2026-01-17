# Bardbox - Architecture Guide

This document is for AI assistants and developers working on the Bardbox codebase.

## What is Bardbox?

Bardbox is a Discord Activity for synchronized media playback during tabletop RPG sessions. A Game Master (GM) controls audio, video, and images that play in sync for all connected players.

## Key Concept: Two Separate Apps

This project builds **two separate Vue applications** from the same codebase:

| Entry Point | HTML | Root Component | Purpose |
|-------------|------|----------------|---------|
| `main.ts` | `index.html` | `App.vue` | **GM Panel** - runs in browser at `/admin` |
| `player.ts` | `player.html` | `PlayerApp.vue` | **Player View** - runs inside Discord Activity |

### GM Panel (`App.vue`)
- Accessed via browser at `/admin`
- No Discord authentication required
- Full control: create campaigns, upload assets, manage playlists, control playback
- Can reload all connected players, toggle mini-apps

### Player View (`PlayerApp.vue`)
- Embedded as a Discord Activity (iframe inside Discord)
- Requires Discord OAuth authentication
- Read-only playback: players see/hear what the GM broadcasts
- Can interact with enabled mini-apps (quizzes, games, etc.)

## Project Structure

```
src/
├── client/                    # Vue 3 frontend
│   ├── App.vue               # GM root component
│   ├── PlayerApp.vue         # Player root component
│   ├── main.ts               # GM entry point
│   ├── player.ts             # Player entry point
│   ├── types.ts              # Shared client types
│   │
│   ├── components/
│   │   ├── PlaybackView.vue        # GM playback controls
│   │   ├── PlayerPlaybackView.vue  # Player media display
│   │   ├── CampaignList.vue        # Campaign management
│   │   ├── CampaignEditor.vue      # Create/edit campaigns
│   │   ├── AssetList.vue           # Asset browser
│   │   ├── AssetUploader.vue       # File uploads
│   │   ├── PlaylistPanel.vue       # Playlist management
│   │   ├── PlaylistEditor.vue      # Playlist editing
│   │   ├── PlayerCampaignSelect.vue # Player campaign picker
│   │   ├── MiniAppsPanel.vue       # GM's app toggle panel
│   │   └── MiniAppsContainer.vue   # Renders active mini-apps
│   │
│   ├── composables/
│   │   ├── useWebSocket.ts    # WebSocket + app state management
│   │   ├── usePlayback.ts     # Media sync logic
│   │   ├── useAssetCache.ts   # IndexedDB asset caching
│   │   └── useDiscordAuth.ts  # Discord OAuth with localStorage caching
│   │
│   └── miniapps/              # Extensible mini-app system
│       ├── types.ts           # Mini-app type definitions
│       ├── registry.ts        # App registration store
│       ├── useMiniApp.ts      # Composable for apps
│       ├── index.ts           # Registers built-in apps + reducers
│       └── apps/
│           ├── DiceRollerApp.vue       # Dice Bank (shared rolls)
│           ├── MediaDisplayApp.vue     # Image/video display
│           ├── MediaDisplayControls.vue
│           ├── QuizApp.vue             # Kahoot-style quizzes
│           └── BlackjackApp.vue        # Blackjack card game
│
└── server/                    # Bun backend
    ├── index.ts              # Server entry + static serving
    ├── router.ts             # HTTP API routes
    ├── websocket.ts          # WebSocket handlers + room state
    ├── types.ts              # Server-side types
    └── services/
        ├── campaign.ts       # Campaign CRUD
        ├── asset.ts          # Asset management
        └── playlist.ts       # Playlist operations

storage/                       # Runtime data (file-based)
└── campaigns/
    └── [campaignId]/
        ├── campaign.json
        ├── playlists.json
        └── assets/
            ├── [assetId].json
            └── [assetId].[ext]
```

## Tech Stack

- **Runtime**: Bun
- **Frontend**: Vue 3 (Composition API, `<script setup>`)
- **Backend**: Hono (HTTP) + Bun WebSocket
- **Build**: Vite
- **Storage**: File-based (JSON metadata + binary assets)
- **Auth**: Discord OAuth via Embedded App SDK
- **Caching**: IndexedDB for assets, localStorage for auth

## Key Systems

### WebSocket Communication

All real-time sync happens via WebSocket. Message types are defined in `src/client/types.ts` and `src/server/types.ts`.

**Client → Server:**
```
identify, join-campaign, leave-campaign, playback-command,
asset-select, playlist-play, playlist-stop, playlist-settings,
queue-asset, queue-jump, miniapp-enable, miniapp-disable,
miniapp-action, reload-players
```

**Server → Client:**
```
campaign-joined, playback-state, queue-updated, asset-selected,
user-joined, user-left, assets-updated, playlists-updated,
miniapp-state, miniapp-updated, error, reload
```

### Playback Synchronization

`usePlayback.ts` keeps all clients in sync:

1. Server sends `playback-state` with `currentTime` and `timestamp`
2. Client calculates elapsed time since timestamp
3. Seeks media element if drift exceeds 0.5 seconds
4. Works for play, pause, seek, and track changes

### Asset Caching

`useAssetCache.ts` uses IndexedDB (`bardbox-cache` database):

- Caches downloaded assets by ID
- Validates by comparing file size (handles asset updates)
- Provides blob URLs for media elements
- Pre-cache support for loading all campaign assets upfront
- Cleared on GM-triggered player reload

### Discord Auth Caching

`useDiscordAuth.ts` caches auth in localStorage (`bardbox-discord-auth`):

- First load: Full OAuth flow, cache user data + token
- Subsequent loads: Use cached data directly (Discord SDK rejects re-auth in same session)
- Clears cache on auth errors

### Mini-App System

Redux-like reducer pattern for state management:

```typescript
// Register in miniapps/index.ts
registerMiniApp({
  id: 'my-app',
  name: 'My App',
  component: MyApp,
  gmControlsComponent: MyControls,  // Optional
  reducer: (state, action, payload, user) => {
    switch (action) {
      case 'do-thing': return { ...state, done: true }
      default: return state
    }
  },
  defaultState: { done: false }
})

// Use in component
const { state, dispatch } = useMiniApp('my-app')
dispatch('do-thing', { data: 123 })
```

**Built-in apps:**
- **Media Display** - Show images/videos to players
- **Dice Bank** - Shared dice rolling with fudge support
- **Quiz** - Multiple choice questions with player responses
- **Blackjack** - Card game with multiple players

## API Routes

Defined in `src/server/router.ts`:

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/discord/token` | OAuth token exchange |
| GET/POST | `/api/campaigns` | List/create campaigns |
| GET/PUT/DELETE | `/api/campaigns/:id` | Campaign CRUD |
| GET/POST | `/api/campaigns/:id/assets` | List/upload assets |
| GET/DELETE | `/api/campaigns/:id/assets/:assetId` | Asset operations |
| GET | `/api/campaigns/:id/assets/:assetId/file` | Serve asset file |
| GET/POST | `/api/campaigns/:id/playlists` | Playlist operations |
| GET/PUT/DELETE | `/api/campaigns/:id/playlists/:playlistId` | Playlist CRUD |

## Common Tasks

### Adding a New Component
Create in `src/client/components/`, use Composition API with `<script setup>`.

### Adding a New WebSocket Message
1. Add type to `ClientMessage`/`ServerMessage` in both `client/types.ts` and `server/types.ts`
2. Handle on server in `websocket.ts` switch statement
3. Handle on client in `useWebSocket.ts` handleMessage function

### Adding a New Mini-App
1. Create component in `miniapps/apps/`
2. Register in `miniapps/index.ts` with reducer
3. Optionally add GM controls component
4. Use `useMiniApp()` composable in component

### Adding a New API Endpoint
Add route object to `routes` array in `router.ts`:

```typescript
{
  pattern: /^\/api\/my-endpoint$/,
  methods: ['POST'],
  handler: async (req, params) => {
    const body = await req.json()
    return json({ result: true })
  }
}
```

## Development

```bash
bun install          # Install dependencies
bun run dev          # Dev server with hot reload
bun run build        # Production build
bun run preview      # Preview production build
```

## Environment Variables

```
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
PORT=3000  # Optional, defaults to 3000
```
