import { randomUUID } from 'crypto'
import type { BrowserWindow } from 'electron'
import { eq, desc } from 'drizzle-orm'
import { DateTime } from 'luxon'
import { getDb } from '../db'
import { reminders } from '../../../drizzle/schema'
import type { Reminder, NewReminder } from '../../../drizzle/schema'
import { isConnected as isCalendarConnected, getConfirmBeforeCreate, markSyncSuccess } from './tokenStore'
import { buildCalendarClient } from './googleClient'
import { parseReminderDate, systemIanaZone } from './reminderParser'

// --- Constants (tune here only) ---------------------------------------
export const CONFIDENCE_GATE = 0.85                  // CAL-COST-01
export const UNDO_WINDOW_MS = 10_000                 // CAL-UX-01
export const CONFIRM_WINDOW_MS = 5_000               // CAL-UX-01 opt-in confirm mode
export const DEFAULT_EVENT_DURATION_HOURS = 1

interface AiReminderPayload {
  text: string
  date_text: string
  confidence: number
}

interface PendingTimer {
  reminderId: string
  timeout: NodeJS.Timeout
  mode: 'auto' | 'confirm'
}

// --- Module-scope wiring ---------------------------------------------
let mainWindow: BrowserWindow | null = null
const pendingTimers = new Map<string, PendingTimer>() // key: reminderId

/**
 * Called from aiOrchestrator.startAiWorker() AFTER mainWin is known.
 * Alternative: have aiOrchestrator.ts export getMainWindow() and import that.
 * We chose a setter to keep reminderService decoupled from aiOrchestrator
 * (circular import risk — aiOrchestrator already dynamic-imports this module).
 */
export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win
}

function send(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  }
}

// --- Public entry point: called by aiOrchestrator --------------------

/**
 * Consumes the AI worker's reminder payload and decides whether to schedule
 * a Google Calendar event creation. Called from aiOrchestrator's 'result'
 * handler via guarded dynamic import (Plan 11-03 Task 3).
 *
 * Gates (must ALL pass, else returns without side effects):
 *   - reminder.confidence >= CONFIDENCE_GATE (CAL-COST-01)
 *   - isCalendarConnected() (no token = no write)
 *   - parseReminderDate(...) returns a non-null triple
 */
export async function handleNoteReminder(
  noteId: string,
  reminder: AiReminderPayload,
): Promise<void> {
  if (!reminder || typeof reminder.confidence !== 'number') return
  if (reminder.confidence < CONFIDENCE_GATE) return
  if (!isCalendarConnected()) return

  const tz = systemIanaZone()
  const triple = parseReminderDate(reminder.date_text, tz)
  if (!triple) return

  // Insert reminders row with status='pending' BEFORE scheduling the timer.
  // If app crashes between insert and timer fire, a reprocess-on-startup pass
  // (not in this plan — left for a future gap closure) can re-arm.
  const reminderId = randomUUID()
  const now = new Date().toISOString()
  const row: NewReminder = {
    id: reminderId,
    noteId,
    eventId: null,
    eventTitle: reminder.text,
    timestampUtc: triple.timestamp_utc,
    originalTz: triple.original_tz,
    originalText: triple.original_text,
    confidence: reminder.confidence,
    calendarSyncStatus: 'pending',
    calendarLink: null,
    createdAt: now,
    lastError: null,
  }
  getDb().insert(reminders).values(row).run()

  const confirmMode = getConfirmBeforeCreate()
  const waitMs = confirmMode ? CONFIRM_WINDOW_MS : UNDO_WINDOW_MS

  // Push a 'pending' event to the renderer so Plan 11-06's toast appears immediately.
  send('calendar:eventPending', {
    noteId,
    reminderId,
    eventTitle: reminder.text,
    timestampUtc: triple.timestamp_utc,
    originalTz: triple.original_tz,
    mode: confirmMode ? 'confirm' : 'auto',
    undoDeadlineMs: Date.now() + waitMs,
  })

  if (confirmMode) {
    // OPT-IN MODE (CAL-UX-01 path b): do NOT auto-commit. Wait for the renderer
    // to call calendar:confirmCreate within 5s. If it doesn't, cancel.
    const timeout = setTimeout(() => {
      pendingTimers.delete(reminderId)
      markCancelled(reminderId, 'User did not confirm within 5s')
    }, CONFIRM_WINDOW_MS)
    pendingTimers.set(reminderId, { reminderId, timeout, mode: 'confirm' })
    return
  }

  // AUTO MODE (CAL-UX-01 path a): silent+undo. Commit after 10s unless undone.
  const timeout = setTimeout(() => {
    pendingTimers.delete(reminderId)
    commitPendingCreate(reminderId).catch((err) => {
      console.error('[reminderService] auto-commit failed:', err)
    })
  }, UNDO_WINDOW_MS)
  pendingTimers.set(reminderId, { reminderId, timeout, mode: 'auto' })
}

/**
 * Cancels a pending reminder BEFORE the 10s window expires.
 * Called by ipcMain.handle('calendar:undoCreate').
 */
export async function cancelPendingCreate(reminderId: string): Promise<void> {
  const pending = pendingTimers.get(reminderId)
  if (pending) {
    clearTimeout(pending.timeout)
    pendingTimers.delete(reminderId)
  }
  markCancelled(reminderId, 'User pressed undo')
}

/**
 * Commits a confirm-mode reminder when user clicks within the 5s window.
 * Called by ipcMain.handle('calendar:confirmCreate').
 */
export async function confirmPendingCreate(reminderId: string): Promise<void> {
  const pending = pendingTimers.get(reminderId)
  if (!pending) return // already expired or already committed
  clearTimeout(pending.timeout)
  pendingTimers.delete(reminderId)
  await commitPendingCreate(reminderId)
}

/**
 * Fires the actual events.insert to Google Calendar. Called either:
 *   - automatically after the 10s undo window (auto mode)
 *   - synchronously from calendar:confirmCreate IPC (confirm mode)
 */
async function commitPendingCreate(reminderId: string): Promise<void> {
  const row = getDb()
    .select()
    .from(reminders)
    .where(eq(reminders.id, reminderId))
    .get() as Reminder | undefined

  if (!row) return
  if (row.calendarSyncStatus !== 'pending') return // already resolved

  // Double-check connection in case user disconnected during the window
  if (!isCalendarConnected()) {
    markFailed(reminderId, 'Calendar disconnected before commit')
    return
  }

  try {
    const calendar = buildCalendarClient()
    const endIso = DateTime.fromISO(row.timestampUtc, { zone: 'utc' })
      .plus({ hours: DEFAULT_EVENT_DURATION_HOURS })
      .toUTC()
      .toISO()
    if (!endIso) throw new Error('Failed to compute event end time via luxon')

    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: row.eventTitle,
        start: { dateTime: row.timestampUtc, timeZone: row.originalTz },
        end: { dateTime: endIso, timeZone: row.originalTz },
        extendedProperties: {
          private: { notal_note_id: row.noteId },   // <-- Plan 11-05 reconciliation key
        },
      },
    })

    const eventId = res.data.id ?? null
    const htmlLink = res.data.htmlLink ?? null
    if (!eventId) throw new Error('Google returned no event id')

    getDb()
      .update(reminders)
      .set({
        calendarSyncStatus: 'synced',
        eventId,
        calendarLink: htmlLink,
        lastError: null,
      })
      .where(eq(reminders.id, reminderId))
      .run()

    markSyncSuccess()

    send('calendar:eventSynced', {
      noteId: row.noteId,
      reminderId,
      eventId,
      eventTitle: row.eventTitle,
      timestampUtc: row.timestampUtc,
      calendarLink: htmlLink,
    })
  } catch (err) {
    const msg = String((err as Error)?.message ?? err)
    markFailed(reminderId, msg)
  }
}

function markCancelled(reminderId: string, reason: string): void {
  getDb()
    .update(reminders)
    .set({ calendarSyncStatus: 'cancelled', lastError: reason })
    .where(eq(reminders.id, reminderId))
    .run()

  const row = getDb().select().from(reminders).where(eq(reminders.id, reminderId)).get() as Reminder | undefined
  if (!row) return
  send('calendar:eventCancelled', { noteId: row.noteId, reminderId, reason })
}

function markFailed(reminderId: string, error: string): void {
  getDb()
    .update(reminders)
    .set({ calendarSyncStatus: 'failed', lastError: error })
    .where(eq(reminders.id, reminderId))
    .run()

  const row = getDb().select().from(reminders).where(eq(reminders.id, reminderId)).get() as Reminder | undefined
  if (!row) return
  console.error('[reminderService] failed:', reminderId, error)
  send('calendar:eventFailed', { noteId: row.noteId, reminderId, error })
}

// --- Query helpers (consumed by Plan 11-06 chip + Plan 11-05 cascade) ---

/**
 * Returns the most recent reminder (if any) for a note. Plan 11-06's NoteCard
 * uses this to decide whether to render a chip, and which status to show.
 *
 * Uses drizzle select (not raw SQL) so column names are returned in camelCase,
 * matching the Reminder type. Raw SELECT * would return snake_case column names
 * that silently break calendarSyncStatus, noteId, etc. on the renderer side.
 */
export function getLatestReminderForNote(noteId: string): Reminder | null {
  const row = getDb()
    .select()
    .from(reminders)
    .where(eq(reminders.noteId, noteId))
    .orderBy(desc(reminders.createdAt))
    .limit(1)
    .get() as Reminder | undefined
  return row ?? null
}

/**
 * Cancels every outstanding in-memory timer. Called on app quit (before-quit)
 * so we don't leave orphaned setTimeouts dangling. Does NOT touch reminders
 * table — pending rows survive; a future "drain on startup" pass (not in this
 * plan) can re-arm or auto-cancel them.
 */
export function cancelAllTimersForShutdown(): void {
  for (const p of pendingTimers.values()) clearTimeout(p.timeout)
  pendingTimers.clear()
}
