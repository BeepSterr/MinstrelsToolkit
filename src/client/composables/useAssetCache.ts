import { openDB, type IDBPDatabase } from 'idb'
import type { Asset, CachedAsset } from '../types'

const DB_NAME = 'bardbox-cache'
const DB_VERSION = 1
const STORE_NAME = 'assets'

let db: IDBPDatabase | null = null

async function getDB(): Promise<IDBPDatabase> {
  if (db) return db

  db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('campaignId', 'campaignId')
      }
    },
  })

  return db
}

export function useAssetCache() {
  async function getCachedAsset(assetId: string): Promise<CachedAsset | null> {
    const database = await getDB()
    return await database.get(STORE_NAME, assetId) || null
  }

  async function cacheAsset(asset: Asset, blob: Blob): Promise<void> {
    const database = await getDB()
    const cachedAsset: CachedAsset = {
      id: asset.id,
      campaignId: asset.campaignId,
      blob,
      size: asset.size,
      cachedAt: Date.now(),
    }
    await database.put(STORE_NAME, cachedAsset)
  }

  async function removeCachedAsset(assetId: string): Promise<void> {
    const database = await getDB()
    await database.delete(STORE_NAME, assetId)
  }

  async function clearCampaignCache(campaignId: string): Promise<void> {
    const database = await getDB()
    const tx = database.transaction(STORE_NAME, 'readwrite')
    const index = tx.store.index('campaignId')
    const keys = await index.getAllKeys(campaignId)

    for (const key of keys) {
      await tx.store.delete(key)
    }

    await tx.done
  }

  async function getAssetUrl(
    campaignId: string,
    asset: Asset
  ): Promise<string> {
    const cached = await getCachedAsset(asset.id)

    if (cached && cached.size === asset.size) {
      return URL.createObjectURL(cached.blob)
    }

    const response = await fetch(
      `/api/campaigns/${campaignId}/assets/${asset.id}/file`
    )

    if (!response.ok) {
      throw new Error('Failed to fetch asset')
    }

    const blob = await response.blob()
    await cacheAsset(asset, blob)

    return URL.createObjectURL(blob)
  }

  function revokeAssetUrl(url: string): void {
    if (url.startsWith('blob:')) {
      URL.revokeObjectURL(url)
    }
  }

  return {
    getCachedAsset,
    cacheAsset,
    removeCachedAsset,
    clearCampaignCache,
    getAssetUrl,
    revokeAssetUrl,
  }
}
