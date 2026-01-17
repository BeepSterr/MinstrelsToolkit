import { readdir, mkdir } from 'fs/promises'
import { join } from 'path'
import type { Playlist } from '../types'
import { getCampaign } from './campaign'

const STORAGE_PATH = './storage/campaigns'

function getPlaylistsPath(campaignId: string): string {
  return join(STORAGE_PATH, campaignId, 'playlists')
}

function getPlaylistJsonPath(campaignId: string, playlistId: string): string {
  return join(getPlaylistsPath(campaignId), `${playlistId}.json`)
}

async function ensurePlaylistsDir(campaignId: string): Promise<void> {
  await mkdir(getPlaylistsPath(campaignId), { recursive: true })
}

export async function listPlaylists(campaignId: string): Promise<Playlist[]> {
  const campaign = await getCampaign(campaignId)
  if (!campaign) return []

  await ensurePlaylistsDir(campaignId)

  const playlistsPath = getPlaylistsPath(campaignId)
  const entries = await readdir(playlistsPath, { withFileTypes: true }).catch(() => [])
  const playlists: Playlist[] = []

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.json')) {
      const playlistId = entry.name.replace('.json', '')
      const playlist = await getPlaylist(campaignId, playlistId)
      if (playlist) {
        playlists.push(playlist)
      }
    }
  }

  return playlists.sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
}

export async function getPlaylist(
  campaignId: string,
  playlistId: string
): Promise<Playlist | null> {
  const jsonPath = getPlaylistJsonPath(campaignId, playlistId)
  const file = Bun.file(jsonPath)

  if (await file.exists()) {
    return await file.json()
  }

  return null
}

export async function createPlaylist(
  campaignId: string,
  data: Pick<Playlist, 'name'> & { assetIds?: string[] }
): Promise<Playlist | null> {
  const campaign = await getCampaign(campaignId)
  if (!campaign) return null

  await ensurePlaylistsDir(campaignId)

  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const playlist: Playlist = {
    id,
    campaignId,
    name: data.name,
    assetIds: data.assetIds || [],
    createdAt: now,
    updatedAt: now,
  }

  await Bun.write(
    getPlaylistJsonPath(campaignId, id),
    JSON.stringify(playlist, null, 2)
  )

  return playlist
}

export async function updatePlaylist(
  campaignId: string,
  playlistId: string,
  data: Partial<Pick<Playlist, 'name' | 'assetIds'>>
): Promise<Playlist | null> {
  const playlist = await getPlaylist(campaignId, playlistId)
  if (!playlist) return null

  const updated: Playlist = {
    ...playlist,
    ...data,
    updatedAt: new Date().toISOString(),
  }

  await Bun.write(
    getPlaylistJsonPath(campaignId, playlistId),
    JSON.stringify(updated, null, 2)
  )

  return updated
}

export async function deletePlaylist(
  campaignId: string,
  playlistId: string
): Promise<boolean> {
  const playlist = await getPlaylist(campaignId, playlistId)
  if (!playlist) return false

  const { rm } = await import('fs/promises')
  await rm(getPlaylistJsonPath(campaignId, playlistId), { force: true })

  return true
}
