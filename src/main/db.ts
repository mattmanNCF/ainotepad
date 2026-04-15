import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import { app } from 'electron'
import path from 'path'
import * as schema from '../../drizzle/schema'
import { notes } from '../../drizzle/schema'

let _db: ReturnType<typeof drizzle> | null = null

export function getDb() {
  if (_db) return _db

  const dbPath = path.join(app.getPath('userData'), 'ainotepad.db')
  const sqlite = new Database(dbPath)

  // Enable WAL mode for better concurrent read performance
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  // Create tables if they don't exist (inline migration for v1)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      raw_text TEXT NOT NULL,
      submitted_at TEXT NOT NULL,
      ai_state TEXT NOT NULL DEFAULT 'pending',
      ai_annotation TEXT
    )
  `)

  // Inline migration: add organized_text column (idempotent)
  try {
    sqlite.exec('ALTER TABLE notes ADD COLUMN organized_text TEXT')
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration: add tags column to notes (Phase 03)
  try {
    sqlite.exec("ALTER TABLE notes ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'")
  } catch {
    // Column already exists across app restarts — safe to ignore
  }

  // Migration: create kb_pages table (Phase 03)
  try {
    sqlite.exec(`CREATE TABLE IF NOT EXISTS kb_pages (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      title TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      created TEXT NOT NULL,
      updated TEXT NOT NULL
    )`)
  } catch {
    // Table already exists — safe to ignore
  }

  _db = drizzle(sqlite, { schema })
  return _db
}

export function updateNoteAiResult(
  noteId: string,
  aiState: 'complete' | 'failed',
  aiAnnotation: string | null,
  organizedText: string | null = null,
  tags: string = '[]'
): void {
  const db = getDb()
  db.update(notes)
    .set({ aiState, aiAnnotation, organizedText, tags })
    .where(eq(notes.id, noteId))
    .run()
}
