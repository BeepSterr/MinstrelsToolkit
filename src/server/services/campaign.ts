import { readdir, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import type { Campaign } from '../types'

const STORAGE_PATH = './storage/campaigns'

async function ensureStorageExists(): Promise<void> {
  await mkdir(STORAGE_PATH, { recursive: true })
}

function getCampaignPath(id: string): string {
  return join(STORAGE_PATH, id)
}

function getCampaignJsonPath(id: string): string {
  return join(getCampaignPath(id), 'campaign.json')
}

export async function listCampaigns(): Promise<Campaign[]> {
  await ensureStorageExists()

  const entries = await readdir(STORAGE_PATH, { withFileTypes: true })
  const campaigns: Campaign[] = []

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const campaign = await getCampaign(entry.name)
      if (campaign) {
        campaigns.push(campaign)
      }
    }
  }

  return campaigns.sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  const jsonPath = getCampaignJsonPath(id)
  const file = Bun.file(jsonPath)

  if (await file.exists()) {
    return await file.json()
  }

  return null
}

export async function createCampaign(
  data: Pick<Campaign, 'name' | 'description'>
): Promise<Campaign> {
  await ensureStorageExists()

  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const campaign: Campaign = {
    id,
    name: data.name,
    description: data.description || '',
    createdAt: now,
    updatedAt: now,
  }

  const campaignPath = getCampaignPath(id)
  await mkdir(campaignPath, { recursive: true })
  await mkdir(join(campaignPath, 'assets'), { recursive: true })

  await Bun.write(getCampaignJsonPath(id), JSON.stringify(campaign, null, 2))

  return campaign
}

export async function updateCampaign(
  id: string,
  data: Partial<Pick<Campaign, 'name' | 'description'>>
): Promise<Campaign | null> {
  const campaign = await getCampaign(id)

  if (!campaign) {
    return null
  }

  const updated: Campaign = {
    ...campaign,
    ...data,
    updatedAt: new Date().toISOString(),
  }

  await Bun.write(getCampaignJsonPath(id), JSON.stringify(updated, null, 2))

  return updated
}

export async function deleteCampaign(id: string): Promise<boolean> {
  const campaign = await getCampaign(id)

  if (!campaign) {
    return false
  }

  await rm(getCampaignPath(id), { recursive: true, force: true })

  return true
}
