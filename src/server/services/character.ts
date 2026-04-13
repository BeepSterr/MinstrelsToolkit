import { readdir, mkdir } from 'fs/promises'
import { join } from 'path'
import type { Character } from '../types'

const STORAGE_PATH = './storage/campaigns'

function getCharactersDir(campaignId: string): string {
  return join(STORAGE_PATH, campaignId, 'characters')
}

function getCharacterJsonPath(campaignId: string, characterId: string): string {
  return join(getCharactersDir(campaignId), `${characterId}.json`)
}

export async function listCharacters(campaignId: string): Promise<Character[]> {
  const dir = getCharactersDir(campaignId)
  await mkdir(dir, { recursive: true })

  const entries = await readdir(dir)
  const characters: Character[] = []

  for (const entry of entries) {
    if (entry.endsWith('.json')) {
      const file = Bun.file(join(dir, entry))
      if (await file.exists()) {
        characters.push(await file.json())
      }
    }
  }

  return characters.sort((a, b) => a.name.localeCompare(b.name))
}

export async function getCharacter(campaignId: string, characterId: string): Promise<Character | null> {
  const file = Bun.file(getCharacterJsonPath(campaignId, characterId))
  if (await file.exists()) {
    return await file.json()
  }
  return null
}

export async function createCharacter(
  campaignId: string,
  data: Pick<Character, 'name'> & Partial<Pick<Character, 'description' | 'role' | 'discordUserId'>>
): Promise<Character> {
  const dir = getCharactersDir(campaignId)
  await mkdir(dir, { recursive: true })

  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const character: Character = {
    id,
    campaignId,
    name: data.name,
    description: data.description || '',
    role: data.role || 'NONE',
    discordUserId: data.discordUserId || null,
    createdAt: now,
    updatedAt: now,
  }

  await Bun.write(getCharacterJsonPath(campaignId, id), JSON.stringify(character, null, 2))
  return character
}

export async function updateCharacter(
  campaignId: string,
  characterId: string,
  data: Partial<Pick<Character, 'name' | 'description' | 'role' | 'discordUserId'>>
): Promise<Character | null> {
  const character = await getCharacter(campaignId, characterId)
  if (!character) return null

  const updated: Character = {
    ...character,
    ...data,
    updatedAt: new Date().toISOString(),
  }

  await Bun.write(getCharacterJsonPath(campaignId, characterId), JSON.stringify(updated, null, 2))
  return updated
}

export async function deleteCharacter(campaignId: string, characterId: string): Promise<boolean> {
  const path = getCharacterJsonPath(campaignId, characterId)
  const file = Bun.file(path)

  if (!(await file.exists())) return false

  const { unlink } = await import('fs/promises')
  await unlink(path)
  return true
}
