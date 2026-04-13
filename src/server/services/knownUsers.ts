import { mkdir } from 'fs/promises'
import { join } from 'path'
import type { DiscordUser } from '../types'

const STORAGE_PATH = './storage/campaigns'

function getKnownUsersPath(campaignId: string): string {
  return join(STORAGE_PATH, campaignId, 'known_users.json')
}

export async function getKnownUsers(campaignId: string): Promise<DiscordUser[]> {
  const file = Bun.file(getKnownUsersPath(campaignId))
  if (await file.exists()) {
    return await file.json()
  }
  return []
}

export async function addKnownUser(campaignId: string, user: DiscordUser): Promise<void> {
  const users = await getKnownUsers(campaignId)

  const existing = users.findIndex(u => u.id === user.id)
  if (existing !== -1) {
    // Update with latest info (username/avatar may change)
    users[existing] = user
  } else {
    users.push(user)
  }

  await mkdir(join(STORAGE_PATH, campaignId), { recursive: true })
  await Bun.write(getKnownUsersPath(campaignId), JSON.stringify(users, null, 2))
}
