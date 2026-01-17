import * as campaignService from './services/campaign'
import * as assetService from './services/asset'
import * as playlistService from './services/playlist'
import { broadcastAssetsUpdated, broadcastPlaylistsUpdated } from './websocket'

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1415063089795039272'
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || ''

type RouteParams = Record<string, string>

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function notFound(message = 'Not found'): Response {
  return json({ error: message }, 404)
}

function badRequest(message = 'Bad request'): Response {
  return json({ error: message }, 400)
}

interface Route {
  pattern: RegExp
  handler: (req: Request, params: RouteParams) => Promise<Response>
  methods: string[]
}

const routes: Route[] = [
  {
    pattern: /^\/api\/debug\/log$/,
    methods: ['POST'],
    handler: async (req) => {
      const body = await req.json()
      const { level, args } = body
      const timestamp = new Date().toISOString()
      console.log(`[CLIENT ${level.toUpperCase()}] ${timestamp}:`, ...args)
      return json({ ok: true })
    },
  },
  {
    pattern: /^\/api\/debug\/ping$/,
    methods: ['GET'],
    handler: async () => {
      console.log('[DEBUG] Ping received!')
      return json({ pong: true })
    },
  },
  {
    pattern: /^\/api\/discord\/token$/,
    methods: ['POST'],
    handler: async (req) => {
      const body = await req.json()
      const { code } = body

      if (!code) {
        return badRequest('Authorization code is required')
      }

      if (!DISCORD_CLIENT_SECRET) {
        console.error('DISCORD_CLIENT_SECRET not configured')
        return json({ error: 'Server not configured for Discord OAuth' }, 500)
      }

      try {
        const response = await fetch('https://discord.com/api/oauth2/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_id: DISCORD_CLIENT_ID,
            client_secret: DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
          }),
        })

        if (!response.ok) {
          const error = await response.text()
          console.error('Discord token exchange failed:', error)
          return json({ error: 'Token exchange failed' }, 400)
        }

        const tokenData = await response.json()
        return json({ access_token: tokenData.access_token })
      } catch (error) {
        console.error('Discord token exchange error:', error)
        return json({ error: 'Token exchange failed' }, 500)
      }
    },
  },
  {
    pattern: /^\/api\/campaigns$/,
    methods: ['GET', 'POST'],
    handler: async (req) => {
      if (req.method === 'GET') {
        const campaigns = await campaignService.listCampaigns()
        return json(campaigns)
      }

      if (req.method === 'POST') {
        const body = await req.json()
        if (!body.name) {
          return badRequest('Name is required')
        }
        const campaign = await campaignService.createCampaign(body)
        return json(campaign, 201)
      }

      return notFound()
    },
  },
  {
    pattern: /^\/api\/campaigns\/(?<id>[^/]+)$/,
    methods: ['GET', 'PUT', 'DELETE'],
    handler: async (req, params) => {
      const { id } = params

      if (req.method === 'GET') {
        const campaign = await campaignService.getCampaign(id)
        return campaign ? json(campaign) : notFound('Campaign not found')
      }

      if (req.method === 'PUT') {
        const body = await req.json()
        const campaign = await campaignService.updateCampaign(id, body)
        return campaign ? json(campaign) : notFound('Campaign not found')
      }

      if (req.method === 'DELETE') {
        const success = await campaignService.deleteCampaign(id)
        return success ? json({ success: true }) : notFound('Campaign not found')
      }

      return notFound()
    },
  },
  {
    pattern: /^\/api\/campaigns\/(?<campaignId>[^/]+)\/assets$/,
    methods: ['GET', 'POST'],
    handler: async (req, params) => {
      const { campaignId } = params

      if (req.method === 'GET') {
        const assets = await assetService.listAssets(campaignId)
        return json(assets)
      }

      if (req.method === 'POST') {
        const formData = await req.formData()
        const file = formData.get('file') as File | null

        if (!file) {
          return badRequest('File is required')
        }

        const asset = await assetService.createAsset(campaignId, file)
        if (asset) {
          broadcastAssetsUpdated(campaignId)
          return json(asset, 201)
        }
        return notFound('Campaign not found')
      }

      return notFound()
    },
  },
  {
    pattern: /^\/api\/campaigns\/(?<campaignId>[^/]+)\/assets\/(?<assetId>[^/]+)$/,
    methods: ['GET', 'PUT', 'DELETE'],
    handler: async (req, params) => {
      const { campaignId, assetId } = params

      if (req.method === 'GET') {
        const asset = await assetService.getAsset(campaignId, assetId)
        return asset ? json(asset) : notFound('Asset not found')
      }

      if (req.method === 'PUT') {
        const body = await req.json()
        const asset = await assetService.updateAsset(campaignId, assetId, body)
        return asset ? json(asset) : notFound('Asset not found')
      }

      if (req.method === 'DELETE') {
        const success = await assetService.deleteAsset(campaignId, assetId)
        if (success) {
          broadcastAssetsUpdated(campaignId)
          return json({ success: true })
        }
        return notFound('Asset not found')
      }

      return notFound()
    },
  },
  {
    pattern: /^\/api\/campaigns\/(?<campaignId>[^/]+)\/assets\/(?<assetId>[^/]+)\/file$/,
    methods: ['GET'],
    handler: async (req, params) => {
      const { campaignId, assetId } = params

      const result = await assetService.getAssetFile(campaignId, assetId)
      if (!result) {
        return notFound('Asset not found')
      }

      // Use RFC 5987 encoding for non-ASCII filenames
      const encodedFilename = encodeURIComponent(result.asset.filename)
      return new Response(result.file, {
        headers: {
          'Content-Type': result.asset.mimeType,
          'Content-Length': result.asset.size.toString(),
          'Content-Disposition': `inline; filename*=UTF-8''${encodedFilename}`,
        },
      })
    },
  },
  {
    pattern: /^\/api\/campaigns\/(?<campaignId>[^/]+)\/playlists$/,
    methods: ['GET', 'POST'],
    handler: async (req, params) => {
      const { campaignId } = params

      if (req.method === 'GET') {
        const playlists = await playlistService.listPlaylists(campaignId)
        return json(playlists)
      }

      if (req.method === 'POST') {
        const body = await req.json()
        if (!body.name) {
          return badRequest('Name is required')
        }
        const playlist = await playlistService.createPlaylist(campaignId, body)
        if (playlist) {
          broadcastPlaylistsUpdated(campaignId)
          return json(playlist, 201)
        }
        return notFound('Campaign not found')
      }

      return notFound()
    },
  },
  {
    pattern: /^\/api\/campaigns\/(?<campaignId>[^/]+)\/playlists\/(?<playlistId>[^/]+)$/,
    methods: ['GET', 'PUT', 'DELETE'],
    handler: async (req, params) => {
      const { campaignId, playlistId } = params

      if (req.method === 'GET') {
        const playlist = await playlistService.getPlaylist(campaignId, playlistId)
        return playlist ? json(playlist) : notFound('Playlist not found')
      }

      if (req.method === 'PUT') {
        const body = await req.json()
        const playlist = await playlistService.updatePlaylist(campaignId, playlistId, body)
        if (playlist) {
          broadcastPlaylistsUpdated(campaignId)
          return json(playlist)
        }
        return notFound('Playlist not found')
      }

      if (req.method === 'DELETE') {
        const success = await playlistService.deletePlaylist(campaignId, playlistId)
        if (success) {
          broadcastPlaylistsUpdated(campaignId)
          return json({ success: true })
        }
        return notFound('Playlist not found')
      }

      return notFound()
    },
  },
]

export async function handleRequest(req: Request): Promise<Response | null> {
  const url = new URL(req.url)
  const path = url.pathname

  for (const route of routes) {
    const match = path.match(route.pattern)
    if (match && route.methods.includes(req.method)) {
      const params = match.groups || {}
      try {
        return await route.handler(req, params)
      } catch (error) {
        console.error('Route error:', error)
        return json({ error: 'Internal server error' }, 500)
      }
    }
  }

  return null
}
