import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CaptureBuffer } from './CaptureBuffer'
import { NoteCard } from './NoteCard'

interface NoteRecord {
  id: string
  rawText: string
  submittedAt: string
  aiState: 'pending' | 'complete' | 'failed'
  aiAnnotation: string | null
  organizedText: string | null
  aiInsights: string | null
  tags: string[]
}

export function NotesTab() {
  const [notes, setNotes] = useState<NoteRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [tagColors, setTagColors] = useState<Record<string, string>>({})
  const gridRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map())
  const [similarPairs, setSimilarPairs] = useState<Array<{ a: string; b: string }>>([])
  const [edgeLines, setEdgeLines] = useState<Array<{ key: string; x1: number; y1: number; x2: number; y2: number }>>([])
  const [deleteConfirm, setDeleteConfirm] = useState<{ noteId: string } | null>(null)
  const [dontAskAgain, setDontAskAgain] = useState(false)

  // Load tag colors once and refresh when KB updates — shared across all cards (no per-card race)
  useEffect(() => {
    window.api.kb.getTagColors().then(setTagColors)
    const cleanup = window.api.kb.onUpdated(() => {
      window.api.kb.getTagColors().then(setTagColors)
    })
    return cleanup
  }, [])

  useEffect(() => {
    window.api.notes.getAll()
      .then((loaded) => {
        setNotes(loaded.map(n => {
          let tags: string[] = []
          try { tags = JSON.parse((n as any).tags ?? '[]') } catch { /* leave empty */ }
          return { ...n, tags }
        }))
        setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load notes:', err)
        setLoading(false)
      })
  }, [])

  // Subscribe to real-time AI result pushes from main process
  useEffect(() => {
    if (!window.api.onAiUpdate) return
    const unsub = window.api.onAiUpdate(({ noteId, aiState, aiAnnotation, organizedText, tags, insights }) => {
      setNotes((prev) =>
        prev.map((n) =>
          n.id === noteId
            ? {
                ...n,
                aiState: aiState as NoteRecord['aiState'],
                aiAnnotation,
                organizedText: organizedText ?? null,
                tags: tags ?? n.tags,
                aiInsights: insights ?? n.aiInsights,
              }
            : n
        )
      )
    })
    return unsub
  }, [])

  useEffect(() => {
    if (notes.length < 2) {
      setSimilarPairs([])
      return
    }
    window.api.notes.getSimilarPairs().then(setSimilarPairs).catch(() => setSimilarPairs([]))
  }, [notes.length])

  useLayoutEffect(() => {
    const container = gridRef.current
    if (!container || similarPairs.length === 0) {
      setEdgeLines([])
      return
    }
    const containerRect = container.getBoundingClientRect()
    const lines: Array<{ key: string; x1: number; y1: number; x2: number; y2: number }> = []
    for (const { a, b } of similarPairs) {
      const elA = cardRefs.current.get(a)
      const elB = cardRefs.current.get(b)
      if (!elA || !elB) continue
      const ra = elA.getBoundingClientRect()
      const rb = elB.getBoundingClientRect()
      lines.push({
        key: `${a}|${b}`,
        x1: ra.left + ra.width / 2 - containerRect.left,
        y1: ra.top + ra.height / 2 - containerRect.top,
        x2: rb.left + rb.width / 2 - containerRect.left,
        y2: rb.top + rb.height / 2 - containerRect.top,
      })
    }
    setEdgeLines(lines)
  }, [similarPairs, notes])

  const handleDelete = useCallback(async (id: string) => {
    const needsConfirm = await window.api.calendar.needsDeleteConfirm(id)
    if (needsConfirm) {
      setDeleteConfirm({ noteId: id })
      setDontAskAgain(false)
    } else {
      await window.api.notes.delete(id)
      setNotes(prev => prev.filter(n => n.id !== id))
    }
  }, [])

  const confirmDelete = useCallback(async () => {
    if (!deleteConfirm) return
    if (dontAskAgain) await window.api.calendar.setDontAskDeleteCalEvent(true)
    await window.api.notes.delete(deleteConfirm.noteId)
    setNotes(prev => prev.filter(n => n.id !== deleteConfirm.noteId))
    setDeleteConfirm(null)
    setDontAskAgain(false)
  }, [deleteConfirm, dontAskAgain])

  const handleHide = useCallback((id: string) => {
    window.api.notes.hide(id)
    setNotes(prev => prev.filter(n => n.id !== id))
  }, [])

  const handleReprocess = useCallback((id: string) => {
    window.api.notes.reprocess(id)
    setNotes(prev => prev.map(n => n.id === id ? { ...n, aiState: 'pending' as const, aiAnnotation: null, organizedText: null, aiInsights: null } : n))
  }, [])

  async function handleSubmit(rawText: string) {
    // Optimistic prepend
    const optimistic: NoteRecord = {
      id: `optimistic-${Date.now()}`,
      rawText,
      submittedAt: new Date().toISOString(),
      aiState: 'pending',
      aiAnnotation: null,
      organizedText: null,
      aiInsights: null,
      tags: [],
    }
    setNotes((prev) => [optimistic, ...prev])

    // Persist via IPC and replace optimistic entry with real record
    try {
      const saved = await window.api.notes.create(rawText)
      setNotes((prev) => prev.map((n) => (n.id === optimistic.id ? { ...saved, tags: [], aiInsights: null } : n)))
    } catch (err) {
      console.error('Failed to save note:', err)
      // Leave optimistic entry; in v1 we don't show error UI
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-3">
        <div ref={gridRef} className="relative">
          {similarPairs.length > 0 && (
            <svg
              className="absolute inset-0 pointer-events-none"
              style={{ zIndex: 10, width: '100%', height: '100%' }}
            >
              {edgeLines.map(({ key, x1, y1, x2, y2 }) => (
                <line
                  key={key}
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke="#6366f1"
                  strokeOpacity={0.35}
                  strokeWidth={1.5}
                />
              ))}
            </svg>
          )}
          {loading && (
            <p className="text-center text-gray-600 text-sm mt-8">Loading notes…</p>
          )}
          {!loading && notes.length === 0 && (
            <p className="text-center text-gray-600 text-sm mt-8">
              No notes yet. Start typing below.
            </p>
          )}
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                tagColors={tagColors}
                onDelete={handleDelete}
                onHide={handleHide}
                onReprocess={handleReprocess}
                onRef={(el) => {
                  if (el) cardRefs.current.set(note.id, el)
                  else cardRefs.current.delete(note.id)
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <CaptureBuffer onSubmit={handleSubmit} />

      {/* Delete-with-calendar-event confirm dialog */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteConfirm(null) }}
        >
          <div className="bg-[#1a1a14] border border-white/10 rounded-md p-5 w-80 shadow-xl">
            <h3 className="text-sm font-semibold text-gray-200 mb-2">Delete note and calendar event?</h3>
            <p className="text-xs text-gray-400 mb-4">
              This note has a linked Google Calendar event. Deleting the note will also delete the event.
            </p>
            <label className="flex items-center gap-2 text-xs text-gray-500 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={dontAskAgain}
                onChange={(e) => setDontAskAgain(e.target.checked)}
                className="accent-blue-400"
              />
              <span>Don&apos;t ask again</span>
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-1.5 rounded text-xs bg-white/5 hover:bg-white/10 text-gray-400 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 py-1.5 rounded text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 transition-colors"
              >
                Delete both
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
