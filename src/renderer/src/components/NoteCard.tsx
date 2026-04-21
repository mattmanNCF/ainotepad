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
  tags: string[]
}

interface NoteCardProps {
  note: NoteRecord
  tagColors: Record<string, string>
  onDelete: (id: string) => void
  onHide: (id: string) => void
  onReprocess: (id: string) => void
  onRef?: (el: HTMLElement | null) => void
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

const MENU_W = 130
const MENU_H = 96

interface ReminderRow {
  id: string
  eventTitle: string
  timestampUtc: string
  calendarSyncStatus: 'pending' | 'synced' | 'failed' | 'cancelled'
  calendarLink: string | null
}

export function NoteCard({ note, tagColors, onDelete, onHide, onReprocess, onRef }: NoteCardProps) {
  const [tags, setTags] = useState<string[]>(note.tags)
  const [reminder, setReminder] = useState<ReminderRow | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [cardRect, setCardRect] = useState<DOMRect | null>(null)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    onRef?.(cardRef.current)
    return () => { onRef?.(null) }
  }, [onRef])

  const primaryTagColor = tags.length > 0 && tagColors[tags[0]]
    ? tagColors[tags[0]]
    : '#6b7280'

  const handleMouseEnter = useCallback(() => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current)
    const rect = cardRef.current?.getBoundingClientRect()
    if (rect) setCardRect(rect)
    setExpanded(true)
  }, [])

  const handleMouseLeave = useCallback(() => {
    leaveTimer.current = setTimeout(() => setExpanded(false), 120)
  }, [])

  useEffect(() => {
    const unsubs: Array<() => void> = []

    // Initial reminder load
    window.api.reminders.getForNote(note.id).then((r) => {
      if (r) setReminder({
        id: r.id,
        eventTitle: r.eventTitle,
        timestampUtc: r.timestampUtc,
        calendarSyncStatus: r.calendarSyncStatus,
        calendarLink: r.calendarLink,
      })
    })

    // Tags push
    if (window.api.onAiUpdate) {
      unsubs.push(window.api.onAiUpdate((data) => {
        if (data.noteId === note.id && data.tags) setTags(data.tags)
      }))
    }

    // Reminder lifecycle — refresh reminder state when any push matches this note
    const refreshReminder = () => {
      window.api.reminders.getForNote(note.id).then((r) => {
        setReminder(r ? {
          id: r.id,
          eventTitle: r.eventTitle,
          timestampUtc: r.timestampUtc,
          calendarSyncStatus: r.calendarSyncStatus,
          calendarLink: r.calendarLink,
        } : null)
      })
    }

    unsubs.push(window.api.calendar.onEventPending((data) => {
      if (data.noteId === note.id) refreshReminder()
    }))
    unsubs.push(window.api.calendar.onEventSynced((data) => {
      if (data.noteId === note.id) refreshReminder()
    }))
    unsubs.push(window.api.calendar.onEventCancelled((data) => {
      if (data.noteId === note.id) refreshReminder()
    }))
    unsubs.push(window.api.calendar.onEventFailed((data) => {
      if (data.noteId === note.id) refreshReminder()
    }))

    return () => { for (const u of unsubs) u() }
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

  useEffect(() => () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current)
  }, [])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    // Clamp to viewport so menu never goes off-screen
    const x = Math.min(e.clientX, window.innerWidth - MENU_W - 8)
    const y = Math.min(e.clientY, window.innerHeight - MENU_H - 8)
    setMenu({ x, y })
  }, [])

  return (
    <div
      ref={cardRef}
      className="note-card-enter relative overflow-hidden rounded-sm bg-[#1a1a14] hover:bg-[#1f1f18] transition-colors shadow-md cursor-default"
      style={{ borderLeft: `4px solid ${primaryTagColor}`, height: '120px' }}
      onContextMenu={handleContextMenu}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Truncated text with fade gradient */}
      <div className="relative p-2 pb-0">
        <p className="text-xs text-gray-200 leading-snug line-clamp-3 break-words">{note.rawText}</p>
        <div className="absolute bottom-0 left-0 right-0 h-3 bg-gradient-to-t from-[#1a1a14] to-transparent pointer-events-none" />
      </div>

      {/* Tag pills — pinned to bottom of card */}
      {tags.length > 0 && (
        <div className="absolute bottom-5 left-2 right-2 flex flex-wrap gap-0.5 overflow-hidden" style={{ maxHeight: '14px' }}>
          {tags.map(tag => (
            <span
              key={tag}
              title={tag}
              className="text-[8px] leading-none px-1 py-0.5 rounded-sm flex-shrink-0 whitespace-nowrap"
              style={{
                backgroundColor: (tagColors[tag] ?? '#6b7280') + '28',
                color: tagColors[tag] ?? '#9ca3af',
                border: `1px solid ${(tagColors[tag] ?? '#6b7280')}55`,
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Timestamp + reminder chip + AI state indicator — bottom of card */}
      <div className="absolute bottom-1 left-2 right-2 flex justify-between items-center gap-2">
        <span className="text-[9px] text-gray-600">{formatTime(note.submittedAt)}</span>
        <div className="flex items-center gap-1.5">
          {reminder?.calendarSyncStatus === 'pending' && (
            <span className="text-[10px] text-amber-400/70" title={`Pending: ${reminder.eventTitle}`}>⏳ cal</span>
          )}
          {reminder?.calendarSyncStatus === 'synced' && reminder.calendarLink && (
            <button
              onClick={(e) => { e.stopPropagation(); window.api.calendar.openLink(reminder.calendarLink!) }}
              className="text-[9px] text-blue-400/70 hover:text-blue-300"
              title={reminder.eventTitle}
            >
              ▸ Cal
            </button>
          )}
          {reminder?.calendarSyncStatus === 'failed' && (
            <span className="text-[10px] text-red-400/70" title={`Calendar failed: ${reminder.eventTitle}`}>⚠ cal</span>
          )}
          {note.aiState === 'pending' && (
            <span className="text-[10px] text-amber-400/80" title="Processing…">⏳</span>
          )}
          {note.aiState === 'failed' && (
            <span className="text-[10px] text-red-400/80" title="Processing failed">✗</span>
          )}
        </div>
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

      {/* Hover-expand overlay portal */}
      {expanded && cardRect && createPortal(
        <div
          onMouseEnter={() => { if (leaveTimer.current) clearTimeout(leaveTimer.current) }}
          onMouseLeave={handleMouseLeave}
          style={{
            position: 'fixed',
            left: cardRect.left + 300 + 8 > window.innerWidth
              ? Math.max(0, cardRect.right - 300)
              : cardRect.left,
            top: cardRect.top,
            width: 300,
            maxHeight: 300,
            zIndex: 9998,
            overflowY: 'auto',
            borderLeft: `4px solid ${primaryTagColor}`,
          }}
          className="rounded-sm bg-[#1f1f18] border border-white/10 shadow-2xl"
        >
          {/* User text — full, not truncated */}
          <div className="p-3 pb-2">
            <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed break-words">{note.rawText}</p>
          </div>

          {/* User/AI divider — only shown when AI content is present */}
          {(note.aiAnnotation || note.aiInsights) && (
            <div className="flex items-center gap-2 px-3 py-1">
              <div className="flex-1 border-t border-white/10" />
              <span className="text-[10px] text-gray-500">AI</span>
              <div className="flex-1 border-t border-white/10" />
            </div>
          )}

          {/* AI annotation */}
          {note.aiAnnotation && (
            <div className="px-3 pb-2">
              <p className="text-xs text-blue-400/70 leading-relaxed">{note.aiAnnotation}</p>
            </div>
          )}

          {/* AI insights — appended below annotation */}
          {note.aiInsights && (
            <div className="px-3 pb-3">
              <p className="text-xs text-gray-400 leading-relaxed">{note.aiInsights}</p>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
