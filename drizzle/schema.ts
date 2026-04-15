import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  rawText: text('raw_text').notNull(),
  submittedAt: text('submitted_at').notNull(),
  aiState: text('ai_state').notNull().default('pending'),
  aiAnnotation: text('ai_annotation'),
  organizedText: text('organized_text'),
  tags: text('tags').notNull().default('[]'),
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
