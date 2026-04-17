import { getSqlite } from './db'
import { getWorkerPort } from './aiOrchestrator'
import { getBraveKey } from './ipc'

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
 * Force dispatch a digest-task to the AI worker regardless of time elapsed.
 * Used by the "Generate Now" button in PatternsTab.
 */
export function forceScheduleDigest(): void {
  const periodStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const wordCloud = buildWordCloudData(periodStart)
  const stats = buildStats(periodStart, wordCloud)
  const braveKey = getBraveKey()
  const workerPort = getWorkerPort()
  if (!workerPort) {
    console.warn('[digestScheduler] Worker not ready — skipping forced digest dispatch')
    return
  }
  workerPort.postMessage({
    type: 'digest-task',
    period: 'daily',
    periodStart,
    wordCloudData: JSON.stringify(wordCloud),
    stats: JSON.stringify(stats),
    braveKey: braveKey ?? '',
  })
  console.log('[digestScheduler] forced digest-task dispatched')
}

/**
 * Check if a new digest is due (>= 20 hours since last) and dispatch a digest-task
 * to the AI worker if so. Called once on app launch after startAiWorker().
 */
export function checkAndScheduleDigest(): void {
  console.log('[digestScheduler] checkAndScheduleDigest called')

  // Query the most recent digest for the 'daily' period
  const lastDigest = getSqlite()
    .prepare(
      `SELECT generated_at FROM digests WHERE period='daily' ORDER BY generated_at DESC LIMIT 1`
    )
    .get() as { generated_at: string } | undefined

  const lastTime = lastDigest ? new Date(lastDigest.generated_at).getTime() : 0
  const hoursElapsed = (Date.now() - lastTime) / (1000 * 60 * 60)

  if (hoursElapsed < 20) {
    console.log(`[digestScheduler] Digest current (${hoursElapsed.toFixed(1)}h elapsed) — skipping`)
    return
  }

  console.log(`[digestScheduler] Digest due (${hoursElapsed.toFixed(1)}h elapsed) — dispatching digest-task`)

  // Period: last 24 hours
  const periodStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const wordCloud = buildWordCloudData(periodStart)
  const stats = buildStats(periodStart, wordCloud)
  const braveKey = getBraveKey()

  const workerPort = getWorkerPort()
  if (!workerPort) {
    console.warn('[digestScheduler] Worker not ready — skipping digest dispatch')
    return
  }

  workerPort.postMessage({
    type: 'digest-task',
    period: 'daily',
    periodStart,
    wordCloudData: JSON.stringify(wordCloud),
    stats: JSON.stringify(stats),
    braveKey: braveKey ?? '',
  })

  console.log('[digestScheduler] digest-task dispatched to worker')
}
