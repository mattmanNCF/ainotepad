import { useEffect, useState } from 'react'
import { CaptureBuffer } from './CaptureBuffer'
import { NoteCard } from './NoteCard'

interface NoteRecord {
  id: string
  rawText: string
  submittedAt: string
  aiState: 'pending' | 'complete' | 'failed'
  aiAnnotation: string | null
}

export function NotesTab() {
  const [notes, setNotes] = useState<NoteRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api.notes.getAll().then((loaded) => {
      setNotes(loaded)
      setLoading(false)
    })
  }, [])

  async function handleSubmit(rawText: string) {
    // Optimistic prepend
    const optimistic: NoteRecord = {
      id: `optimistic-${Date.now()}`,
      rawText,
      submittedAt: new Date().toISOString(),
      aiState: 'pending',
      aiAnnotation: null,
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
      <CaptureBuffer onSubmit={handleSubmit} />
      <div className="flex-1 overflow-y-auto py-2">
        {loading && (
          <p className="text-center text-gray-600 text-sm mt-8">Loading notes…</p>
        )}
        {!loading && notes.length === 0 && (
          <p className="text-center text-gray-600 text-sm mt-8">
            No notes yet. Start typing above.
          </p>
        )}
        {notes.map((note) => (
          <NoteCard key={note.id} note={note} />
        ))}
      </div>
    </div>
  )
}
