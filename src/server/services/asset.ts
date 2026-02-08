import { readdir, rename, rm, unlink } from 'fs/promises'
import { join, extname } from 'path'
import { spawn } from 'child_process'
import type { Asset } from '../types'
import { getCampaign } from './campaign'

const STORAGE_PATH = './storage/campaigns'

// Audio compression settings
const AUDIO_BITRATE = '96k' // 96kbps Opus ≈ 128kbps MP3 quality
const AUDIO_CODEC = 'libopus'
const AUDIO_EXT = '.ogg'
const AUDIO_MIME = 'audio/ogg'
const SKIP_BITRATE_THRESHOLD = 96000 // Skip re-encoding if source is lossy and at/below this

const LOSSY_FORMATS = new Set([
  'mp3', 'aac', 'ogg', 'opus', 'wma', 'vorbis', 'm4a',
])

async function getAudioBitrate(filePath: string): Promise<{ bitrate: number; codec: string } | null> {
  return new Promise((resolve) => {
    const probe = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ])

    let stdout = ''
    probe.stdout?.on('data', (data: Buffer) => { stdout += data.toString() })
    probe.on('close', (code) => {
      if (code !== 0) { resolve(null); return }
      try {
        const info = JSON.parse(stdout)
        const audioStream = info.streams?.find((s: any) => s.codec_type === 'audio')
        const bitrate = parseInt(audioStream?.bit_rate || info.format?.bit_rate || '0', 10)
        const codec = (audioStream?.codec_name || '').toLowerCase()
        resolve({ bitrate, codec })
      } catch { resolve(null) }
    })
    probe.on('error', () => resolve(null))
  })
}

async function compressAudio(inputPath: string, outputPath: string): Promise<boolean> {
  // FFmpeg can't write to the same file it's reading from, so use a temp file
  const tempPath = outputPath + '.tmp.ogg'
  return new Promise((resolve) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-vn', // Strip album art / video streams
      '-codec:a', AUDIO_CODEC,
      '-b:a', AUDIO_BITRATE,
      '-vbr', 'on',
      '-y', // Overwrite output
      tempPath
    ])

    let stderr = ''
    ffmpeg.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    ffmpeg.on('close', async (code) => {
      if (code !== 0) {
        console.error(`[compress] ffmpeg failed (code ${code}) for ${inputPath}:\n${stderr}`)
        await unlink(tempPath).catch(() => {})
        resolve(false)
      } else {
        try {
          // Remove original if different from output, then move temp to output
          if (inputPath !== outputPath) {
            await unlink(inputPath).catch(() => {})
          }
          await rename(tempPath, outputPath)
          resolve(true)
        } catch (err) {
          console.error(`[compress] Failed to rename temp file for ${inputPath}:`, err)
          resolve(false)
        }
      }
    })

    ffmpeg.on('error', async (err) => {
      console.error(`[compress] ffmpeg spawn error for ${inputPath}:`, err.message)
      await unlink(tempPath).catch(() => {})
      resolve(false)
    })
  })
}

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
  file: File,
): Promise<Asset | null> {
  const campaign = await getCampaign(campaignId)
  if (!campaign) return null

  const id = crypto.randomUUID()
  const originalExt = extname(file.name) || '.bin'
  const now = new Date().toISOString()

  // Write the original file first
  const arrayBuffer = await file.arrayBuffer()
  const originalPath = getAssetFilePath(campaignId, id, originalExt)
  await Bun.write(originalPath, arrayBuffer)

  const asset: Asset = {
    id,
    campaignId,
    name: file.name.replace(originalExt, ''),
    type: getAssetType(file.type),
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    createdAt: now,
  }

  await Bun.write(getAssetJsonPath(campaignId, id), JSON.stringify(asset, null, 2))

  return asset
}

// Compress an asset in the background after upload. Returns a promise that resolves when done.
export async function compressNewAsset(
  campaignId: string,
  asset: Asset,
): Promise<boolean> {
  if (asset.type !== 'audio') return false

  const originalExt = extname(asset.filename) || '.bin'
  const originalPath = getAssetFilePath(campaignId, asset.id, originalExt)

  // Check if source is already a low-bitrate lossy format
  const probeResult = await getAudioBitrate(originalPath)
  const isLossy = probeResult && LOSSY_FORMATS.has(probeResult.codec)
  const alreadySmall = isLossy && probeResult.bitrate > 0 && probeResult.bitrate <= SKIP_BITRATE_THRESHOLD

  if (alreadySmall) {
    console.log(`[compress] Skipping "${asset.name}" — already ${probeResult.codec} at ${Math.round(probeResult.bitrate / 1000)}kbps`)
    return false
  }

  const compressedPath = getAssetFilePath(campaignId, asset.id, AUDIO_EXT)
  const success = await compressAudio(originalPath, compressedPath)

  if (success) {
    const compressedFile = Bun.file(compressedPath)
    const updatedAsset: Asset = {
      ...asset,
      filename: asset.name + AUDIO_EXT,
      mimeType: AUDIO_MIME,
      size: compressedFile.size,
      compressed: true,
    }
    await Bun.write(getAssetJsonPath(campaignId, asset.id), JSON.stringify(updatedAsset, null, 2))
    console.log(`[compress] Compressed "${asset.name}" (${asset.size} -> ${compressedFile.size} bytes)`)
    return true
  }

  return false
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

export async function compressExistingAsset(
  campaignId: string,
  assetId: string
): Promise<{ success: boolean; originalSize: number; newSize: number; skipped?: boolean } | null> {
  const asset = await getAsset(campaignId, assetId)
  if (!asset) return null

  // Only compress audio files
  if (asset.type !== 'audio') {
    return { success: false, originalSize: asset.size, newSize: asset.size }
  }

  // Skip if already compressed
  if (asset.compressed) {
    return { success: true, originalSize: asset.size, newSize: asset.size, skipped: true }
  }

  const originalExt = extname(asset.filename) || '.bin'
  const originalPath = getAssetFilePath(campaignId, assetId, originalExt)
  const originalFile = Bun.file(originalPath)

  if (!(await originalFile.exists())) {
    console.error(`[compress] File not found on disk: ${originalPath}`)
    return null
  }

  const originalSize = asset.size

  // Check if source is already a low-bitrate lossy format
  const probeResult = await getAudioBitrate(originalPath)
  const isLossy = probeResult && LOSSY_FORMATS.has(probeResult.codec)
  const alreadySmall = isLossy && probeResult.bitrate > 0 && probeResult.bitrate <= SKIP_BITRATE_THRESHOLD

  if (alreadySmall) {
    console.log(`[compress] Skipping "${asset.name}" — already ${probeResult.codec} at ${Math.round(probeResult.bitrate / 1000)}kbps`)
    return { success: true, originalSize, newSize: originalSize, skipped: true }
  }

  // Compress to new path
  const compressedPath = getAssetFilePath(campaignId, assetId, AUDIO_EXT)
  const success = await compressAudio(originalPath, compressedPath)

  if (!success) {
    return { success: false, originalSize, newSize: originalSize }
  }

  const compressedFile = Bun.file(compressedPath)
  const newSize = compressedFile.size

  // Update asset metadata
  const updatedAsset: Asset = {
    ...asset,
    filename: asset.name + AUDIO_EXT,
    mimeType: AUDIO_MIME,
    size: newSize,
    compressed: true,
  }

  await Bun.write(getAssetJsonPath(campaignId, assetId), JSON.stringify(updatedAsset, null, 2))

  return { success: true, originalSize, newSize }
}

export async function compressAllAudioAssets(
  campaignId: string
): Promise<{ total: number; compressed: number; skipped: number; savedBytes: number }> {
  const assets = await listAssets(campaignId)
  const audioAssets = assets.filter(a => a.type === 'audio')

  let compressed = 0
  let skipped = 0
  let savedBytes = 0

  for (const asset of audioAssets) {
    console.log(`[compress] Compressing asset "${asset.name}" (${asset.id})`)
    const result = await compressExistingAsset(campaignId, asset.id)
    if (result?.success) {
      if (result.skipped) {
        console.log(`[compress] Skipped "${asset.name}" (already compressed)`)
        skipped++
      } else {
        compressed++
        savedBytes += result.originalSize - result.newSize
        console.log(`[compress] Compressed "${asset.name}" (${result.originalSize} -> ${result.newSize} bytes)`)
      }
    } else {
      console.log(`[compress] Failed to compress "${asset.name}"`)
    }
  }

  return { total: audioAssets.length, compressed, skipped, savedBytes }
}
