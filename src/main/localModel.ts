// localModel.ts — Local model tier detection, path scanning, and download helpers
// Used by main process to find or download a Gemma 4 GGUF before passing the path
// to aiWorker via the init message. Never imported by the worker itself.

import { app } from 'electron'
import path from 'path'
import os from 'os'
import fs from 'fs'
// node-llama-cpp is ESM-only — loaded via dynamic import() inside downloadModel()

export const MODEL_URIS = {
  small: 'hf:unsloth/gemma-4-E4B-it-GGUF:Q3_K_M',
  default: 'hf:unsloth/gemma-4-E4B-it-GGUF:Q4_K_M',
  large: 'hf:unsloth/gemma-4-E4B-it-GGUF:Q5_K_M',
} as const

export const MODEL_FILENAMES = {
  small: 'hf_unsloth_gemma-4-E4B-it.Q3_K_M.gguf',
  default: 'hf_unsloth_gemma-4-E4B-it.Q4_K_M.gguf',
  large: 'hf_unsloth_gemma-4-E4B-it.Q5_K_M.gguf',
} as const

export type ModelTier = 'small' | 'default' | 'large'

/**
 * Detect the appropriate model tier based on available system RAM.
 * >= 16 GB -> large | >= 8 GB -> default | < 8 GB -> small
 */
export function detectModelTier(): ModelTier {
  const ramGB = os.totalmem() / (1024 * 1024 * 1024)
  if (ramGB >= 16) return 'large'
  if (ramGB >= 8) return 'default'
  return 'small'
}

/**
 * Returns the directory where AInotepad downloads models.
 * Creates the directory if it does not exist.
 */
export function getModelStoragePath(): string {
  const dir = path.join(app.getPath('userData'), 'models')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Walk a directory recursively and collect all file paths.
 * Skips directories that don't exist.
 */
function walkDir(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  const results: string[] = []
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return results
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath))
    } else {
      results.push(fullPath)
    }
  }
  return results
}

/**
 * Search well-known locations for an existing GGUF file matching the given tier.
 * Scans LM Studio cache directories and AInotepad's own storage folder.
 * Does NOT scan Ollama paths (Ollama uses SHA256 blob names, not original filenames).
 *
 * @returns Absolute path to the model file, or null if not found.
 */
export function findExistingModel(tier: ModelTier): string | null {
  const filename = MODEL_FILENAMES[tier]
  const searchRoots = [
    path.join(os.homedir(), 'AppData', 'Local', 'LMStudio', 'models'),
    path.join(os.homedir(), '.cache', 'lm-studio', 'models'),
    getModelStoragePath(),
  ]

  for (const root of searchRoots) {
    const files = walkDir(root)
    const match = files.find(f => f.endsWith(filename))
    if (match) return match
  }

  return null
}

/**
 * Download the specified model tier using node-llama-cpp's createModelDownloader.
 * Saves to AInotepad's model storage directory.
 *
 * @param tier        Which quantization tier to download.
 * @param onProgress  Optional callback with download progress (0–100 percent).
 * @returns           Absolute path to the downloaded .gguf file.
 */
export async function downloadModel(
  tier: ModelTier,
  onProgress?: (percent: number) => void
): Promise<string> {
  const { createModelDownloader } = await import('node-llama-cpp')
  try {
    const downloader = await createModelDownloader({
      modelUri: MODEL_URIS[tier],
      dirPath: getModelStoragePath(),
      onProgress: onProgress
        ? ({ totalSize, downloadedSize }) => {
            const pct = totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0
            onProgress(pct)
          }
        : undefined,
    })
    const modelPath = await downloader.download()
    return modelPath
  } catch (err) {
    throw new Error(
      `[localModel] Failed to download model tier "${tier}" from ${MODEL_URIS[tier]}: ${String((err as any)?.message ?? err)}`
    )
  }
}
