import { mkdir } from 'fs/promises'
import { join } from 'path'

const STORAGE_PATH = './storage/campaigns'

function getStatePath(campaignId: string): string {
  return join(STORAGE_PATH, campaignId, 'aggro_state.json')
}

export async function loadAggroState(campaignId: string): Promise<unknown | null> {
  const file = Bun.file(getStatePath(campaignId))
  if (await file.exists()) {
    return await file.json()
  }
  return null
}

export async function saveAggroState(campaignId: string, state: unknown): Promise<void> {
  await mkdir(join(STORAGE_PATH, campaignId), { recursive: true })
  await Bun.write(getStatePath(campaignId), JSON.stringify(state, null, 2))
}
