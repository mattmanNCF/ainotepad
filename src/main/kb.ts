import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'

export function kbDir(): string {
  return path.join(app.getPath('userData'), 'kb')
}

export async function ensureKbDir(): Promise<void> {
  await fs.mkdir(kbDir(), { recursive: true })
}

export async function writeKbFile(filename: string, content: string): Promise<void> {
  await ensureKbDir()
  // Write to .tmp then rename — avoids Windows partial-write / file lock (STATE.md risk)
  const target = path.join(kbDir(), filename)
  const tmp = target + '.tmp'
  await fs.writeFile(tmp, content, 'utf8')
  await fs.rename(tmp, target)
}

export async function readKbFile(filename: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(kbDir(), filename), 'utf8')
  } catch {
    return null
  }
}

export async function listKbFiles(): Promise<string[]> {
  await ensureKbDir()
  const files = await fs.readdir(kbDir())
  return files.filter(f => f.endsWith('.md'))
}
