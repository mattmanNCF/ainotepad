import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'

interface NoteRecord {
  id: string
  rawText: string
  submittedAt: string
  aiState: 'pending' | 'complete' | 'failed'
  aiAnnotation: string | null
  organizedText: string | null
  aiInsights: string | null
}

interface NoteCardProps {
  note: NoteRecord
  onDelete: (id: string) => void
  onHide: (id: string) => void
  onReprocess: (id: string) => void
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

const MENU_W = 130
const MENU_H = 96

export function NoteCard({ note, onDelete, onHide, onReprocess }: NoteCardProps) {
  const style = aiStateStyle[note.aiState]
  const [tags, setTags] = useState<string[]>([])
  const [tagColors, setTagColors] = useState<Record<string, string>>({})
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.api.kb.getTagColors().then(setTagColors)
    const cleanup = window.api.kb.onUpdated(() => {
      window.api.kb.getTagColors().then(setTagColors)
    })
    return cleanup
  }, [])

  useEffect(() => {
    if (!window.api.onAiUpdate) return
    const unsub = window.api.onAiUpdate((data) => {
      if (data.noteId === note.id) {
        if (data.tags) setTags(data.tags)
      }
    })
    return unsub
  }, [note.id])

  useEffect(() => {
    if (!menu) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menu])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    // Clamp to viewport so menu never goes off-screen
    const x = Math.min(e.clientX, window.innerWidth - MENU_W - 8)
    const y = Math.min(e.clientY, window.innerHeight - MENU_H - 8)
    setMenu({ x, y })
  }, [])

  return (
    <div
      className="note-card-enter flex flex-col rounded-sm bg-[#1a1a14] hover:bg-[#1f1f18] transition-colors shadow-md"
      style={{ borderLeft: `4px solid ${style.border}`, minHeight: '120px' }}
      onContextMenu={handleContextMenu}
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

      {/* Portal: renders directly on document.body — escapes all stacking contexts */}
      {menu && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 9999 }}
          className="bg-[#1a1a14] border border-white/10 rounded shadow-xl py-1 min-w-[120px]"
        >
          <button
            onClick={() => { onReprocess(note.id); setMenu(null) }}
            className="w-full text-left px-3 py-1.5 text-xs text-blue-400 hover:bg-white/5 hover:text-blue-300"
          >
            Reprocess
          </button>
          <button
            onClick={() => { onHide(note.id); setMenu(null) }}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-white/5 hover:text-white"
          >
            Hide
          </button>
          <button
            onClick={() => { onDelete(note.id); setMenu(null) }}
            className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-white/5 hover:text-red-300"
          >
            Delete
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}
