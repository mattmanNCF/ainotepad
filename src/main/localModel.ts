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
 * Fine-tuned GGUF filename (FNDR-01 naming convention, Plan 02-08).
 *
 * v001 = E2B quantization trained on the 8GB Nvidia PC (research §Pitfall 2:
 * E4B QLoRA needs ≥10GB VRAM). v002 = E4B on DGX Spark arrival — drop in
 * `notal-gemma4e4b-notes-v002.gguf` beside this one and
 * `resolveModelPath()` prefers whichever file is present. File goes in
 * app.getPath('userData')/models/ — matches the generic-download location
 * used by `findExistingModel`.
 */
export const FINE_TUNED_GGUF_FILENAME = 'notal-gemma4e2b-notes-v001.gguf'

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

/**
 * Absolute path to where the fine-tuned GGUF would live on disk.
 * The file does not need to exist — callers use `hasFineTunedModel()` to test.
 */
export function fineTunedModelPath(): string {
  return path.join(getModelStoragePath(), FINE_TUNED_GGUF_FILENAME)
}

/**
 * True iff the fine-tuned GGUF (Plan 02-04 output) has been deposited in
 * app.getPath('userData')/models/. Drop-in detection: copy the GGUF into that
 * folder and restart Notal — no config change required.
 */
export function hasFineTunedModel(): boolean {
  return fs.existsSync(fineTunedModelPath())
}

/**
 * Canonical resolver for "which GGUF should Notal load right now?".
 *
 * Preference order (Plan 02-08):
 *   1. Fine-tuned Notal model if present on disk (notal-gemma4e2b-notes-v001.gguf).
 *   2. Generic Gemma 4 at the detected tier (prior behavior).
 *
 * Callers in ipc.ts use this instead of computing a tier path directly so the
 * fine-tune preference is enforced in a single place.
 */
export function resolveModelPath(): string {
  if (hasFineTunedModel()) return fineTunedModelPath()
  const tier = detectModelTier()
  return path.join(getModelStoragePath(), MODEL_FILENAMES[tier])
}
