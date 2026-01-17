import { readdir, rm } from 'fs/promises'
import { join, extname } from 'path'
import type { Asset } from '../types'
import { getCampaign } from './campaign'

const STORAGE_PATH = './storage/campaigns'

function getAssetsPath(campaignId: string): string {
  return join(STORAGE_PATH, campaignId, 'assets')
}

function getAssetJsonPath(campaignId: string, assetId: string): string {
  return join(getAssetsPath(campaignId), `${assetId}.json`)
}

function getAssetFilePath(campaignId: string, assetId: string, ext: string): string {
  return join(getAssetsPath(campaignId), `${assetId}${ext}`)
}

function getAssetType(mimeType: string): 'image' | 'audio' | 'video' {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('video/')) return 'video'
  return 'image'
}

export async function listAssets(campaignId: string): Promise<Asset[]> {
  const campaign = await getCampaign(campaignId)
  if (!campaign) return []

  const assetsPath = getAssetsPath(campaignId)
  const entries = await readdir(assetsPath, { withFileTypes: true }).catch(() => [])
  const assets: Asset[] = []

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.json')) {
      const assetId = entry.name.replace('.json', '')
      const asset = await getAsset(campaignId, assetId)
      if (asset) {
        assets.push(asset)
      }
    }
  }

  return assets.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}

export async function getAsset(campaignId: string, assetId: string): Promise<Asset | null> {
  const jsonPath = getAssetJsonPath(campaignId, assetId)
  const file = Bun.file(jsonPath)

  if (await file.exists()) {
    return await file.json()
  }

  return null
}

export async function createAsset(
  campaignId: string,
  file: File
): Promise<Asset | null> {
  const campaign = await getCampaign(campaignId)
  if (!campaign) return null

  const id = crypto.randomUUID()
  const ext = extname(file.name) || '.bin'
  const now = new Date().toISOString()

  const asset: Asset = {
    id,
    campaignId,
    name: file.name.replace(ext, ''),
    type: getAssetType(file.type),
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    createdAt: now,
  }

  const arrayBuffer = await file.arrayBuffer()
  await Bun.write(getAssetFilePath(campaignId, id, ext), arrayBuffer)
  await Bun.write(getAssetJsonPath(campaignId, id), JSON.stringify(asset, null, 2))

  return asset
}

export async function updateAsset(
  campaignId: string,
  assetId: string,
  data: Partial<Pick<Asset, 'name'>>
): Promise<Asset | null> {
  const asset = await getAsset(campaignId, assetId)
  if (!asset) return null

  const updated: Asset = {
    ...asset,
    ...data,
  }

  await Bun.write(getAssetJsonPath(campaignId, assetId), JSON.stringify(updated, null, 2))

  return updated
}

export async function deleteAsset(campaignId: string, assetId: string): Promise<boolean> {
  const asset = await getAsset(campaignId, assetId)
  if (!asset) return false

  const ext = extname(asset.filename) || '.bin'

  await rm(getAssetJsonPath(campaignId, assetId), { force: true })
  await rm(getAssetFilePath(campaignId, assetId, ext), { force: true })

  return true
}

export async function getAssetFile(
  campaignId: string,
  assetId: string
): Promise<{ file: ReturnType<typeof Bun.file>; asset: Asset } | null> {
  const asset = await getAsset(campaignId, assetId)
  if (!asset) return null

  const ext = extname(asset.filename) || '.bin'
  const filePath = getAssetFilePath(campaignId, assetId, ext)
  const file = Bun.file(filePath)

  if (!(await file.exists())) return null

  return { file, asset }
}
