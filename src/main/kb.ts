import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'

export function kbDir(): string {
  return path.join(app.getPath('userData'), 'kb')
}

export async function ensureKbDir(): Promise<void> {
  await fs.mkdir(kbDir(), { recursive: true })
}

/**
 * Normalize YAML frontmatter so the closing --- is always on its own line.
 * Fixes cases where the AI writes `value ---` on the last frontmatter line.
 */
function normalizeFrontmatter(content: string): string {
  if (!content.startsWith('---')) return content
  return content.replace(
    /^(---[ \t]*\r?\n[\s\S]*?)[ \t]+---[ \t]*([ \t]*\r?\n|$)/m,
    '$1\n---\n'
  )
}

export async function writeKbFile(filename: string, content: string): Promise<void> {
  await ensureKbDir()
  const normalized = normalizeFrontmatter(content)
  // Write to .tmp then rename — avoids Windows partial-write / file lock (STATE.md risk)
  const target = path.join(kbDir(), filename)
  // Ensure subdirectory exists (AI may write to nested paths like concepts/physics/foo.md)
  await fs.mkdir(path.dirname(target), { recursive: true })
  const tmp = target + '.tmp'
  await fs.writeFile(tmp, normalized, 'utf8')
  await fs.rename(tmp, target)
}

export async function readKbFile(filename: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(kbDir(), filename), 'utf8')
  } catch {
    return null
  }
}

async function listKbFilesRecursive(dir: string, base: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const results: string[] = []
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      results.push(...await listKbFilesRecursive(path.join(dir, entry.name), rel))
    } else if (entry.name.endsWith('.md')) {
      results.push(rel)
    }
  }
  return results
}

export async function deleteKbFile(filename: string): Promise<void> {
  try {
    await fs.unlink(path.join(kbDir(), filename))
  } catch {
    // File already gone — safe to ignore
  }
}

export async function listKbFiles(): Promise<string[]> {
  await ensureKbDir()
  return listKbFilesRecursive(kbDir(), '')
}
