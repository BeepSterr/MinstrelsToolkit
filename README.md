# Bardbox

A Discord Activity for synchronized media playback during tabletop RPG sessions. The Game Master controls audio, video, and images that play in perfect sync for all connected players.

## Features

### Synchronized Playback
- Play background music, ambient sounds, and sound effects
- All players hear audio at the exact same time
- Support for audio files (MP3, WAV, OGG, etc.) and video

### Asset Management
- Upload and organize media files by campaign
- Create playlists for different moods or scenes
- Queue system for seamless transitions
- Shuffle and loop modes

### Mini-Apps
Interactive widgets the GM can enable during gameplay:

- **Media Display** - Show images and videos to all players (maps, character art, scenes)
- **Dice Bank** - Shared dice rolling visible to everyone, with fudge support for GMs
- **Quiz** - Kahoot-style multiple choice questions with real-time player responses
- **Blackjack** - Card game for session breaks

### Discord Integration
- Runs as a Discord Activity inside voice channels
- Players see each other's Discord avatars
- No additional accounts needed - uses Discord OAuth

## How It Works

1. **GM** opens the admin panel in a browser
2. **Players** join the Discord Activity in a voice channel
3. GM selects a campaign and controls playback
4. All players see/hear synchronized media in real-time

## Quick Start

### Prerequisites
- [Bun](https://bun.sh/) runtime
- Discord Application with Activity enabled

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd bardbox2

# Install dependencies
bun install

# Set up environment variables
cp .env.example .env
# Edit .env with your Discord credentials
```

### Development

```bash
# Start development server (with hot reload)
bun run dev
```

Access points:
- **GM Panel**: http://localhost:3000/admin
- **Player View**: Embedded in Discord Activity

### Production

```bash
# Build for production
bun run build

# Start production server
bun run start
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DISCORD_CLIENT_ID` | Your Discord application's client ID |
| `DISCORD_CLIENT_SECRET` | Your Discord application's client secret |
| `PORT` | Server port (default: 3000) |

## Tech Stack

- **Runtime**: Bun
- **Frontend**: Vue 3 + TypeScript
- **Backend**: Hono + Bun WebSocket
- **Build**: Vite
- **Auth**: Discord Embedded App SDK

## Project Structure

```
src/
├── client/          # Vue 3 frontend (GM + Player apps)
│   ├── components/  # UI components
│   ├── composables/ # Vue composables (state management)
│   └── miniapps/    # Mini-app system
└── server/          # Bun backend
    ├── services/    # Business logic
    └── websocket.ts # Real-time sync
```

See [AGENTS.md](./AGENTS.md) for detailed architecture documentation.

## License

MIT
