import { useEffect, useState } from 'react'
import { CaptureBuffer } from './CaptureBuffer'
import { NoteCard } from './NoteCard'

interface NoteRecord {
  id: string
  rawText: string
  submittedAt: string
  aiState: 'pending' | 'complete' | 'failed'
  aiAnnotation: string | null
  organizedText: string | null
}

export function NotesTab() {
  const [notes, setNotes] = useState<NoteRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api.notes.getAll()
      .then((loaded) => {
        setNotes(loaded)
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
    const unsub = window.api.onAiUpdate(({ noteId, aiState, aiAnnotation, organizedText }) => {
      setNotes((prev) =>
        prev.map((n) =>
          n.id === noteId
            ? {
                ...n,
                aiState: aiState as NoteRecord['aiState'],
                aiAnnotation,
                organizedText: organizedText ?? null,
              }
            : n
        )
      )
    })
    return unsub
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
    }
    setNotes((prev) => [optimistic, ...prev])

    // Persist via IPC and replace optimistic entry with real record
    try {
      const saved = await window.api.notes.create(rawText)
      setNotes((prev) => prev.map((n) => (n.id === optimistic.id ? saved : n)))
    } catch (err) {
      console.error('Failed to save note:', err)
      // Leave optimistic entry; in v1 we don't show error UI
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-3">
        {loading && (
          <p className="text-center text-gray-600 text-sm mt-8">Loading notes…</p>
        )}
        {!loading && notes.length === 0 && (
          <p className="text-center text-gray-600 text-sm mt-8">
            No notes yet. Start typing below.
          </p>
        )}
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onDelete={(id) => {
                window.api.notes.delete(id)
                setNotes((prev) => prev.filter((n) => n.id !== id))
              }}
              onHide={(id) => {
                window.api.notes.hide(id)
                setNotes((prev) => prev.filter((n) => n.id !== id))
              }}
              onReprocess={(id) => {
                window.api.notes.reprocess(id)
                setNotes((prev) =>
                  prev.map((n) =>
                    n.id === id
                      ? { ...n, aiState: 'pending' as const, aiAnnotation: null, organizedText: null }
                      : n
                  )
                )
              }}
            />
          ))}
        </div>
      </div>
      <CaptureBuffer onSubmit={handleSubmit} />
    </div>
  )
}
