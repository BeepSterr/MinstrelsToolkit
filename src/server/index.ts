import { handleRequest } from './router'
import {
  handleOpen,
  handleClose,
  handleMessage,
  createWebSocketData,
} from './websocket'
import type { WebSocketData } from './types'

const PORT = parseInt(process.env.PORT || process.env.VIRTUAL_PORT || '3000')
const CLIENT_DIR = './dist/client'

console.log(process.env.DISCORD_CLIENT_SECRET)
async function serveStatic(path: string): Promise<Response | null> {
  // Admin routes serve the admin app
  if (path === '/admin' || path.startsWith('/admin/')) {
    const adminFile = Bun.file(`${CLIENT_DIR}/index.html`)
    if (await adminFile.exists()) {
      return new Response(adminFile)
    }
    return null
  }

  // Root serves the player app
  if (path === '/') {
    const playerFile = Bun.file(`${CLIENT_DIR}/player.html`)
    if (await playerFile.exists()) {
      return new Response(playerFile)
    }
    return null
  }

  // Try exact file match
  const file = Bun.file(`${CLIENT_DIR}${path}`)
  if (await file.exists()) {
    return new Response(file)
  }

  // Fallback to player app for SPA routing
  const playerFile = Bun.file(`${CLIENT_DIR}/player.html`)
  if (await playerFile.exists()) {
    return new Response(playerFile)
  }

  return null
}

const server = Bun.serve<WebSocketData>({
  port: PORT,

  async fetch(req, server) {
    const url = new URL(req.url)

    if (url.pathname === '/ws') {
      const success = server.upgrade(req, {
        data: createWebSocketData(),
      })
      return success
        ? undefined
        : new Response('WebSocket upgrade failed', { status: 500 })
    }

    if (url.pathname.startsWith('/api/')) {
      const response = await handleRequest(req)
      if (response) {
        return response
      }
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const staticResponse = await serveStatic(url.pathname)
    if (staticResponse) {
      return staticResponse
    }

    return new Response('Not found', { status: 404 })
  },

  websocket: {
    open: handleOpen,
    close: handleClose,
    message: handleMessage,
  },
})

console.log(`Server running at http://localhost:${server.port}`)
