import { useState, useEffect, useRef } from 'react'
import WordCloud from 'react-d3-cloud'

interface WordDatum { text: string; value: number }
interface DigestStats { noteCount: number; topTags: string[]; mostActiveDay: string }
interface DigestData {
  narrative: string
  stats: DigestStats
  words: WordDatum[]
  generatedAt: string
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-black/20 rounded-md px-3 py-2 flex-1 min-w-0">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-xs text-gray-200 truncate">{value}</p>
    </div>
  )
}

export function PatternsTab() {
  const [period, setPeriod] = useState<'daily' | 'weekly'>('daily')
  const periodRef = useRef<'daily' | 'weekly'>('daily')
  const [digest, setDigest] = useState<DigestData | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [digestError, setDigestError] = useState<string | null>(null)

  // Keep ref in sync with state so onUpdated closure always sees current period
  useEffect(() => { periodRef.current = period }, [period])

  async function loadDigest(p: 'daily' | 'weekly') {
    setLoading(true)
    try {
      const result = await window.api.digest.getLatest(p)
      if (result) {
        setDigest({
          narrative: result.narrative,
          stats: JSON.parse(result.stats) as DigestStats,
          words: JSON.parse(result.word_cloud_data) as WordDatum[],
          generatedAt: result.generated_at,
        })
      } else {
        setDigest(null)
      }
    } catch {
      setDigest(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDigest('daily')
    // PAT-02: pre-load weekly or trigger generation if no weekly digest exists yet
    window.api.digest.getLatest('weekly').then((result) => {
      if (!result) {
        // No weekly digest — trigger background generation silently
        setGenerating(true)
        window.api.digest.generate('weekly').catch(() => setGenerating(false))
      }
    }).catch(() => { /* ignore — digest IPC not critical path */ })
    const unsubUpdated = window.api.digest.onUpdated((data) => {
      if (data.period === periodRef.current) {
        loadDigest(periodRef.current)
        setGenerating(false)
        setDigestError(null)
      }
    })
    const unsubError = window.api.digest.onError((data) => {
      if (data.period === periodRef.current) {
        setGenerating(false)
        setDigestError(data.error)
      }
    })
    return () => { unsubUpdated(); unsubError() }
  }, [])

  useEffect(() => {
    loadDigest(period)
  }, [period])

  return (
    <div className="flex flex-col h-full p-4 gap-4 overflow-y-auto">
      {/* Period toggle + regenerate */}
      <div className="flex gap-2 items-center shrink-0">
        {(['daily', 'weekly'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              period === p ? 'bg-blue-500/30 text-blue-300' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
        <button
          onClick={async () => {
            setGenerating(true)
            setDigestError(null)
            await window.api.digest.generate(period)
            // Result arrives via onUpdated/onError listeners — they clear generating state.
            // 30s safety fallback in case worker fails without sending digest-error.
            setTimeout(() => setGenerating(false), 30000)
          }}
          disabled={generating}
          className="ml-auto px-3 py-1 text-xs rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {generating ? '…' : '↻'}
        </button>
      </div>

      {loading && <p className="text-gray-500 text-sm">Loading...</p>}

      {digestError && (
        <p className="text-xs text-red-400/80 bg-red-900/20 rounded px-2 py-1">{digestError}</p>
      )}

      {!loading && !digest && !generating && (
        <p className="text-gray-500 text-sm text-center mt-4">
          No digest yet — click ↻ to generate.
        </p>
      )}

      {generating && (
        <p className="text-gray-500 text-sm text-center mt-4">Generating…</p>
      )}

      {!loading && digest && (
        <>
          {/* Word cloud */}
          <div className="bg-black/20 rounded-md overflow-hidden shrink-0">
            <WordCloud
              data={digest.words}
              width={500}
              height={140}
              font="sans-serif"
              fontSize={(w) => Math.log2(w.value + 1) * 10 + 10}
              rotate={0}
              padding={4}
              fill={(_w, i) => ['#6366f1', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'][i % 5]}
            />
          </div>

          {/* AI Narrative */}
          <div className="bg-black/20 rounded-md p-3 shrink-0">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">AI Summary</p>
            <p className="text-sm text-gray-200 leading-relaxed">{digest.narrative}</p>
          </div>

          {/* Stats */}
          <div className="flex gap-3 shrink-0">
            <StatPill label="Notes" value={String(digest.stats.noteCount)} />
            <StatPill label="Top Topics" value={digest.stats.topTags.slice(0, 3).join(', ') || '—'} />
            <StatPill label="Most Active" value={digest.stats.mostActiveDay || '—'} />
          </div>
        </>
      )}
    </div>
  )
}
