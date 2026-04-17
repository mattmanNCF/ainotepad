import { useState, useEffect } from 'react'
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
  const [digest, setDigest] = useState<DigestData | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)

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
    const unsub = window.api.digest.onUpdated((data) => {
      if (data.period === period) {
        loadDigest(period)
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    loadDigest(period)
  }, [period])

  return (
    <div className="flex flex-col h-full p-4 gap-4 overflow-y-auto">
      {/* Period toggle */}
      <div className="flex gap-2 shrink-0">
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
      </div>

      {loading && <p className="text-gray-500 text-sm">Loading...</p>}

      {!loading && !digest && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-gray-500 text-sm text-center max-w-xs">
            Patterns will appear here after AI processes your notes.
          </p>
          <button
            onClick={async () => {
              setGenerating(true)
              await window.api.digest.generate(period)
              setTimeout(() => {
                loadDigest(period)
                setGenerating(false)
              }, 3000)
            }}
            disabled={generating}
            className="px-4 py-2 text-xs rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? 'Generating...' : 'Generate Now'}
          </button>
        </div>
      )}

      {!loading && digest && (
        <>
          {/* Word cloud */}
          <div className="bg-black/20 rounded-md overflow-hidden shrink-0">
            <WordCloud
              data={digest.words}
              width={500}
              height={220}
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
