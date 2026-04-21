import * as chrono from 'chrono-node'
import { DateTime } from 'luxon'

export interface ReminderTriple {
  timestamp_utc: string    // ISO 8601 UTC (e.g., "2026-06-15T05:00:00.000Z")
  original_tz: string      // IANA zone (e.g., "America/Los_Angeles")
  original_text: string    // Exact source text (e.g., "tomorrow at 3pm")
}

/**
 * Converts a natural-language date string + user's IANA timezone into an
 * authoritative {timestamp_utc, original_tz, original_text} triple.
 *
 * Why two libraries:
 *   - chrono-node handles the natural-language parsing ("tomorrow", "next Tuesday at 3pm")
 *     but does NOT understand IANA zone identifiers and mis-handles unusual offsets
 *     like Pacific/Chatham (+12:45). See RESEARCH Pitfall 3.
 *   - luxon has full IANA database access and correct DST math — we use it to
 *     (a) anchor chrono's reference date in the user's zone and (b) construct the
 *     final UTC instant from the parsed wall-clock components in the correct zone.
 *
 * Key correction vs. naive approach: chrono.parseDate() interprets absolute date/time
 * strings in the HOST system's local timezone, not in userIanaZone. Instead, we use
 * chrono.parse() to extract the date/time components, then construct a Luxon DateTime
 * in the user's zone explicitly. This is the only reliable way to handle unusual
 * offsets like Pacific/Chatham (+12:45) and non-system timezones (e.g., Asia/Kolkata
 * when the host is in UTC).
 *
 * @param dateText The raw date text from the AI's reminder.date_text field
 * @param userIanaZone IANA zone string, e.g. from Intl.DateTimeFormat().resolvedOptions().timeZone
 * @param referenceDate Optional; defaults to now. Test harness passes a fixed Date for determinism.
 */
export function parseReminderDate(
  dateText: string,
  userIanaZone: string,
  referenceDate: Date = new Date(),
): ReminderTriple | null {
  if (!dateText || !userIanaZone) return null

  // Validate the zone first via luxon — catches bad zone strings early.
  // DateTime.fromJSDate(referenceDate).setZone() does NOT move the instant,
  // it only changes the display zone. isValid will be false for unknown zones.
  const anchor = DateTime.fromJSDate(referenceDate).setZone(userIanaZone)
  if (!anchor.isValid) return null

  // Use chrono.parse() (not parseDate) to get structured ParsedResult objects.
  // We pass anchor.toJSDate() as the reference date so relative expressions like
  // "tomorrow" are anchored in the user's local wall clock (chrono uses the Date's
  // UTC epoch as the reference; since setZone doesn't move the epoch, anchor.toJSDate()
  // returns the same UTC instant as referenceDate — that's correct because we handle
  // the zone offset ourselves when constructing the Luxon DateTime below).
  const results = chrono.parse(dateText, anchor.toJSDate())
  if (!results || results.length === 0) return null

  const c = results[0].start

  // Extract wall-clock components from chrono's parse result.
  // chrono populates components for both certain and implied values.
  // If a component is missing (get() returns null/undefined), we fall back
  // to the reference date's wall clock in the user's zone.
  const year   = c.get('year')   ?? anchor.year
  const month  = c.get('month')  ?? anchor.month
  const day    = c.get('day')    ?? anchor.day
  const hour   = c.get('hour')   ?? 0
  const minute = c.get('minute') ?? 0
  const second = c.get('second') ?? 0

  // Construct the wall-clock datetime in the user's IANA zone. Luxon handles
  // the full IANA database including Pacific/Chatham (+12:45/+13:45) and DST
  // transitions correctly.
  const dt = DateTime.fromObject({ year, month, day, hour, minute, second }, { zone: userIanaZone })
  if (!dt.isValid) return null

  return {
    timestamp_utc: dt.toUTC().toISO()!,
    original_tz: userIanaZone,
    original_text: dateText,
  }
}

/**
 * Returns the system IANA zone. Used by reminderService to populate original_tz
 * when the user hasn't set a manual override. Available in Node main process.
 */
export function systemIanaZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}
