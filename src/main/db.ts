import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import { app } from 'electron'
import path from 'path'
import * as sqliteVec from 'sqlite-vec'
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

  // Load sqlite-vec extension BEFORE any vec0 CREATE runs (FNDR-06 / Plan 02-08).
  // Mirrors pipeline/rag/vec_store.py's `sqlite_vec.load(conn)` idiom so Notal and
  // the foundry pipeline speak the same virtual-table dialect.
  try {
    sqliteVec.load(sqlite)
  } catch (err) {
    console.error('[db] failed to load sqlite-vec extension:', (err as Error).message)
    throw err
  }

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

  // Migration: create reminders table (Phase 11 — Google Calendar integration).
  // FK cascade on notes(id) — deleting a note automatically drops the reminders row.
  // Plan 11-05 handles the Google-event-delete cascade separately (via
  // privateExtendedProperty=notal_note_id query BEFORE deleteNote()).
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      event_id TEXT,
      event_title TEXT NOT NULL,
      timestamp_utc TEXT NOT NULL,
      original_tz TEXT NOT NULL,
      original_text TEXT NOT NULL,
      confidence REAL NOT NULL,
      calendar_sync_status TEXT NOT NULL DEFAULT 'pending',
      calendar_link TEXT,
      created_at TEXT NOT NULL,
      last_error TEXT
    )
  `)
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_reminders_note_id ON reminders(note_id)
  `)

  // Migration: add wiki_files column to notes (Phase 07 gap)
  try {
    sqlite.exec("ALTER TABLE notes ADD COLUMN wiki_files TEXT NOT NULL DEFAULT '[]'")
  } catch {
    // Column already exists — safe to ignore
  }

  // Migration: RAG chunk tables (FNDR-06 / Plan 02-08).
  // Schema-of-record lives in pipeline/rag/vec_store.py — this DDL must stay
  // bit-for-bit identical (CREATE VIRTUAL TABLE chunks_vec USING vec0 FLOAT[384])
  // so retrievals indexed in the foundry CI match what Notal retrieves at runtime.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      chunk_id INTEGER PRIMARY KEY,
      note_id INTEGER NOT NULL,
      start_offset INTEGER NOT NULL,
      end_offset INTEGER NOT NULL,
      raw_text TEXT NOT NULL,
      token_count INTEGER NOT NULL,
      FOREIGN KEY(note_id) REFERENCES notes(id)
    )
  `)
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_vec USING vec0(chunk_id INTEGER PRIMARY KEY, embedding FLOAT[384])
  `)
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(raw_text, chunk_id UNINDEXED)
  `)

  _db = drizzle(sqlite, { schema })
  return _db
}

export function getNoteWikiFiles(noteId: string): string[] {
  const row = getSqlite()
    .prepare('SELECT wiki_files FROM notes WHERE id = ?')
    .get(noteId) as { wiki_files: string } | undefined
  if (!row) return []
  try { return JSON.parse(row.wiki_files) } catch { return [] }
}

export function setNoteWikiFiles(noteId: string, filenames: string[]): void {
  getSqlite()
    .prepare('UPDATE notes SET wiki_files = ? WHERE id = ?')
    .run(JSON.stringify(filenames), noteId)
}

export function countNotesReferencingWikiFile(filename: string, excludeNoteId: string): number {
  const rows = getSqlite()
    .prepare("SELECT wiki_files FROM notes WHERE hidden=0 AND id != ?")
    .all(excludeNoteId) as Array<{ wiki_files: string }>
  let count = 0
  for (const r of rows) {
    try {
      const files: string[] = JSON.parse(r.wiki_files)
      if (files.includes(filename)) count++
    } catch { /* skip */ }
  }
  return count
}

export function getNotesReferencingWikiFile(filename: string): string[] {
  const rows = getSqlite()
    .prepare("SELECT id, wiki_files FROM notes WHERE hidden=0")
    .all() as Array<{ id: string; wiki_files: string }>
  return rows
    .filter(r => {
      try { return (JSON.parse(r.wiki_files) as string[]).includes(filename) }
      catch { return false }
    })
    .map(r => r.id)
}

export function deleteNote(noteId: string): void {
  const db = getDb()
  db.delete(notes).where(eq(notes.id, noteId)).run()
}

export function hideNote(noteId: string): void {
  const db = getDb()
  db.update(notes).set({ hidden: 1 }).where(eq(notes.id, noteId)).run()
}

export function reprocessNote(noteId: string): void {
  const db = getDb()
  db.update(notes)
    .set({ aiState: 'pending', aiAnnotation: null, organizedText: null, tags: '[]', aiInsights: null })
    .where(eq(notes.id, noteId))
    .run()
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
