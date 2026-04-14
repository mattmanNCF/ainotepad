import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  rawText: text('raw_text').notNull(),
  submittedAt: text('submitted_at').notNull(),
  aiState: text('ai_state').notNull().default('pending'),
  aiAnnotation: text('ai_annotation'),
})

export type Note = typeof notes.$inferSelect
export type NewNote = typeof notes.$inferInsert
