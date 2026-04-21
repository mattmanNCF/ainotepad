import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  rawText: text('raw_text').notNull(),
  submittedAt: text('submitted_at').notNull(),
  aiState: text('ai_state').notNull().default('pending'),
  aiAnnotation: text('ai_annotation'),
  organizedText: text('organized_text'),
  tags: text('tags').notNull().default('[]'),
  aiInsights: text('ai_insights'),
  hidden: integer('hidden').notNull().default(0),
})

export type Note = typeof notes.$inferSelect
export type NewNote = typeof notes.$inferInsert

export const kbPages = sqliteTable('kb_pages', {
  id: text('id').primaryKey(),          // filename without .md, e.g. "quantum-entanglement"
  filename: text('filename').notNull(), // e.g. "quantum-entanglement.md"
  title: text('title').notNull(),       // human display title
  tags: text('tags').notNull().default('[]'), // JSON array: ["physics", "TOT"]
  created: text('created').notNull(),   // ISO date
  updated: text('updated').notNull(),   // ISO date
})

export type KbPage = typeof kbPages.$inferSelect
export type NewKbPage = typeof kbPages.$inferInsert

export const digests = sqliteTable('digests', {
  id: text('id').primaryKey(),
  period: text('period').notNull(),
  periodStart: text('period_start').notNull(),
  wordCloudData: text('word_cloud_data').notNull(),
  narrative: text('narrative').notNull(),
  stats: text('stats').notNull(),
  generatedAt: text('generated_at').notNull(),
})

export type Digest = typeof digests.$inferSelect
export type NewDigest = typeof digests.$inferInsert

export const reminders = sqliteTable('reminders', {
  id: text('id').primaryKey(),
  noteId: text('note_id').notNull().references(() => notes.id, { onDelete: 'cascade' }),
  eventId: text('event_id'),                                    // Google Calendar event ID (null while pending undo)
  eventTitle: text('event_title').notNull(),
  timestampUtc: text('timestamp_utc').notNull(),                // ISO 8601 UTC
  originalTz: text('original_tz').notNull(),                    // IANA zone: "America/Los_Angeles"
  originalText: text('original_text').notNull(),                // "next Tuesday at 3pm"
  confidence: integer('confidence', { mode: 'number' }).notNull(), // REAL affinity — SQLite allows REAL in INTEGER column
  calendarSyncStatus: text('calendar_sync_status').notNull().default('pending'), // pending|synced|failed|cancelled
  calendarLink: text('calendar_link'),
  createdAt: text('created_at').notNull(),
  lastError: text('last_error'),
})

export type Reminder = typeof reminders.$inferSelect
export type NewReminder = typeof reminders.$inferInsert
