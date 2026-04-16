import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import { app } from 'electron'
import path from 'path'
import * as schema from '../../drizzle/schema'
import { notes } from '../../drizzle/schema'

let _db: ReturnType<typeof drizzle> | null = null
let _sqlite: ReturnType<typeof Database> | null = null

export function getSqlite(): ReturnType<typeof Database> {
  if (!_sqlite) getDb()
  return _sqlite!
}

export function getDb() {
  if (_db) return _db

  const dbPath = path.join(app.getPath('userData'), 'ainotepad.db')
  const sqlite = new Database(dbPath)
  _sqlite = sqlite

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

  // Migration: add hidden column to notes
  try {
    sqlite.exec("ALTER TABLE notes ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0")
  } catch {
    // Column already exists — safe to ignore
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

  // Migration: add ai_insights column to notes (Phase 04)
  try {
    sqlite.exec('ALTER TABLE notes ADD COLUMN ai_insights TEXT')
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration: create notes_fts FTS5 virtual table (Phase 04)
  sqlite.exec(
    'CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(raw_text, note_id UNINDEXED)'
  )

  // Backfill notes_fts with existing notes (one-time, idempotent)
  try {
    const ftsCount = (sqlite.prepare('SELECT count(*) as c FROM notes_fts').get() as { c: number }).c
    if (ftsCount === 0) {
      sqlite.exec('INSERT INTO notes_fts(raw_text, note_id) SELECT raw_text, id FROM notes')
    }
  } catch {
    // Safe to ignore — may already be populated
  }

  // Migration: create digests table (Phase 04)
  sqlite.exec(
    'CREATE TABLE IF NOT EXISTS digests (' +
    '  id TEXT PRIMARY KEY,' +
    '  period TEXT NOT NULL,' +
    '  period_start TEXT NOT NULL,' +
    '  word_cloud_data TEXT NOT NULL,' +
    '  narrative TEXT NOT NULL,' +
    '  stats TEXT NOT NULL,' +
    '  generated_at TEXT NOT NULL' +
    ')'
  )

  _db = drizzle(sqlite, { schema })
  return _db
}

export function deleteNote(noteId: string): void {
  const db = getDb()
  db.delete(notes).where(eq(notes.id, noteId)).run()
}

export function hideNote(noteId: string): void {
  const db = getDb()
  db.update(notes).set({ hidden: 1 }).where(eq(notes.id, noteId)).run()
}

export function updateNoteAiResult(
  noteId: string,
  aiState: 'complete' | 'failed',
  aiAnnotation: string | null,
  organizedText: string | null = null,
  tags: string = '[]',
  aiInsights: string | null = null
): void {
  const db = getDb()
  db.update(notes)
    .set({ aiState, aiAnnotation, organizedText, tags, aiInsights })
    .where(eq(notes.id, noteId))
    .run()
}

export function insertNoteToFts(noteId: string, rawText: string): void {
  getSqlite().prepare('INSERT INTO notes_fts(raw_text, note_id) VALUES (?, ?)').run(rawText, noteId)
}
