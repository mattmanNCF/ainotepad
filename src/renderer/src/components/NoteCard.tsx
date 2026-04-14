interface NoteRecord {
  id: string
  rawText: string
  submittedAt: string
  aiState: 'pending' | 'complete' | 'failed'
  aiAnnotation: string | null
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

const aiStateBadge: Record<NoteRecord['aiState'], { label: string; className: string }> = {
  pending: { label: '⏳ processing', className: 'text-yellow-500/70' },
  complete: { label: '✓ organized', className: 'text-green-500/70' },
  failed: { label: '✗ failed', className: 'text-red-500/70' },
}

export function NoteCard({ note }: NoteCardProps) {
  const badge = aiStateBadge[note.aiState]

  return (
    <div className="note-card-enter mx-4 my-1 p-3 rounded-lg bg-white/5 border border-white/8 hover:bg-white/8 transition-colors">
      <p className="text-sm text-gray-100 whitespace-pre-wrap leading-relaxed">{note.rawText}</p>
      <div className="flex items-center gap-3 mt-2">
        <span className="text-xs text-gray-600">{formatTime(note.submittedAt)}</span>
        <span className={`text-xs ${badge.className}`}>{badge.label}</span>
      </div>
      {note.aiAnnotation && (
        <p className="mt-2 text-xs text-blue-400/80 border-t border-white/5 pt-2">{note.aiAnnotation}</p>
      )}
    </div>
  )
}
