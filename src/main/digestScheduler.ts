import { getSqlite } from './db'
import { getWorkerPort } from './aiOrchestrator'

/**
 * Build word cloud data from notes submitted since the given ISO date string.
 * Parses each note's tags JSON array, counts tag frequencies, and returns
 * the top 50 tags sorted by frequency descending.
 */
export function buildWordCloudData(since: string): Array<{ text: string; value: number }> {
  const rows = getSqlite()
    .prepare(
      `SELECT tags FROM notes WHERE hidden=0 AND ai_state='complete' AND submitted_at >= ?`
    )
    .all(since) as Array<{ tags: string }>

  const freq: Record<string, number> = {}
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.tags) as string[]
      for (const tag of parsed) {
        if (tag && typeof tag === 'string') {
          freq[tag] = (freq[tag] ?? 0) + 1
        }
      }
    } catch {
      // Malformed tags JSON — skip row
    }
  }

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([text, value]) => ({ text, value }))
}

/**
 * Build summary stats for notes in the given period.
 */
export function buildStats(
  since: string,
  wordCloud: Array<{ text: string; value: number }>
): { noteCount: number; topTags: string[]; mostActiveDay: string } {
  const countRow = getSqlite()
    .prepare(
      `SELECT count(*) as n FROM notes WHERE hidden=0 AND ai_state='complete' AND submitted_at >= ?`
    )
    .get(since) as { n: number }

  const dayRow = getSqlite()
    .prepare(
      `SELECT substr(submitted_at, 1, 10) as day, count(*) as n
       FROM notes
       WHERE hidden=0 AND ai_state='complete' AND submitted_at >= ?
       GROUP BY day
       ORDER BY n DESC
       LIMIT 1`
    )
    .get(since) as { day: string; n: number } | undefined

  return {
    noteCount: countRow.n,
    topTags: wordCloud.slice(0, 3).map((w) => w.text),
    mostActiveDay: dayRow?.day ?? '',
  }
}

/**
 * Dispatch a digest-task for a given period if it's due.
 * Daily: >= 20h since last. Weekly: >= 6 days since last.
 */
function maybeDispatchDigest(
  period: 'daily' | 'weekly',
  windowHours: number,
  thresholdHours: number,
  workerPort: Electron.MessagePortMain
): void {
  const lastDigest = getSqlite()
    .prepare(`SELECT generated_at, word_cloud_data FROM digests WHERE period=? ORDER BY generated_at DESC LIMIT 1`)
    .get(period) as { generated_at: string; word_cloud_data: string } | undefined

  const lastTime = lastDigest ? new Date(lastDigest.generated_at).getTime() : 0
  const hoursElapsed = (Date.now() - lastTime) / (1000 * 60 * 60)

  const periodStart = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString()
  const wordCloud = buildWordCloudData(periodStart)
  const stats = buildStats(periodStart, wordCloud)

  // Bypass threshold if last digest was empty but now has data (e.g. first note processed after startup digest)
  const lastWasEmpty = !lastDigest || lastDigest.word_cloud_data === '[]'
  const nowHasData = wordCloud.length > 0
  if (hoursElapsed < thresholdHours && !(lastWasEmpty && nowHasData)) {
    console.log(`[digestScheduler] ${period} digest current (${hoursElapsed.toFixed(1)}h elapsed) — skipping`)
    return
  }

  workerPort.postMessage({
    type: 'digest-task',
    period,
    periodStart,
    wordCloudData: JSON.stringify(wordCloud),
    stats: JSON.stringify(stats),
    braveKey: '',
  })
  console.log(`[digestScheduler] ${period} digest-task dispatched`)
}

/**
 * Force a digest generation immediately, regardless of time elapsed since last.
 * Used by the "Generate Now" button in the Patterns tab.
 */
export function forceScheduleDigest(period: 'daily' | 'weekly' = 'daily'): void {
  const workerPort = getWorkerPort()
  if (!workerPort) {
    console.warn('[digestScheduler] Worker not ready — skipping forced digest dispatch')
    return
  }
  const windowHours = period === 'weekly' ? 168 : 24
  const periodStart = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString()
  const wordCloud = buildWordCloudData(periodStart)
  const stats = buildStats(periodStart, wordCloud)
  workerPort.postMessage({
    type: 'digest-task',
    period,
    periodStart,
    wordCloudData: JSON.stringify(wordCloud),
    stats: JSON.stringify(stats),
    braveKey: '',
  })
  console.log(`[digestScheduler] forced ${period} digest-task dispatched`)
}

/**
 * Check if digests are due and dispatch them. Called once on app launch.
 * Generates daily (last 24h) and weekly (last 7 days) digests independently.
 * Both are available from day 1 — weekly just covers a wider window.
 */
export function checkAndScheduleDigest(): void {
  console.log('[digestScheduler] checkAndScheduleDigest called')

  const workerPort = getWorkerPort()
  if (!workerPort) {
    console.warn('[digestScheduler] Worker not ready — skipping digest dispatch')
    return
  }

  maybeDispatchDigest('daily', 24, 20, workerPort)
  maybeDispatchDigest('weekly', 168, 20, workerPort) // 7-day window, refresh once per day
}
