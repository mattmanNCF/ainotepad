import { useState, useEffect } from 'react'

interface NoteRecord {
  id: string
  rawText: string
  submittedAt: string
  aiState: 'pending' | 'complete' | 'failed'
  aiAnnotation: string | null
  organizedText: string | null
}

interface NoteCardProps {
  note: NoteRecord
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

const aiStateStyle: Record<NoteRecord['aiState'], { border: string; badge: string; badgeClass: string }> = {
  pending:  { border: '#f59e0b', badge: '⏳',  badgeClass: 'text-amber-400/80' },
  complete: { border: '#10b981', badge: '✓',   badgeClass: 'text-emerald-400/80' },
  failed:   { border: '#ef4444', badge: '✗',   badgeClass: 'text-red-400/80' },
}

export function NoteCard({ note }: NoteCardProps) {
  const style = aiStateStyle[note.aiState]
  const [tags, setTags] = useState<string[]>([])
  const [tagColors, setTagColors] = useState<Record<string, string>>({})

  // Fetch tag colors on mount and refresh when tag colors change
  useEffect(() => {
    window.api.kb.getTagColors().then(setTagColors)
    const cleanup = window.api.kb.onUpdated(() => {
      window.api.kb.getTagColors().then(setTagColors)
    })
    return cleanup
  }, [])

  // Capture tags from AI update events for this specific note
  useEffect(() => {
    if (!window.api.onAiUpdate) return
    const unsub = window.api.onAiUpdate((data) => {
      if (data.noteId === note.id && data.tags) {
        setTags(data.tags)
      }
    })
    return unsub
  }, [note.id])

  return (
    <div
      className="note-card-enter flex flex-col rounded-sm bg-[#1a1a14] hover:bg-[#1f1f18] transition-colors shadow-md"
      style={{ borderLeft: `4px solid ${style.border}`, minHeight: '120px' }}
    >
      <div className="flex-1 p-3">
        <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed break-words">{note.rawText}</p>
        {note.aiAnnotation && (
          <p className="mt-2 text-xs text-blue-400/70 border-t border-white/5 pt-2 leading-relaxed">{note.aiAnnotation}</p>
        )}
        {tags.length > 0 && (
          <div className="flex items-center gap-1 mt-1">
            {tags.map(tag => (
              <span
                key={tag}
                title={tag}
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: tagColors[tag] ?? '#6b7280' }}
              />
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-3 pb-2 pt-1 border-t border-white/5">
        <span className="text-xs text-gray-600">{formatTime(note.submittedAt)}</span>
        <span className={`text-xs ${style.badgeClass}`}>{style.badge}</span>
      </div>
    </div>
  )
}
