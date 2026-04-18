import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface KbFileEntry {
  filename: string
  title: string
  tags: string[]
}

interface WikiSidebarProps {
  files: KbFileEntry[]
  tagColors: Record<string, string>
  activeFile: string | null
  onFileClick: (filename: string) => void
  onSetTagColor: (tag: string, color: string) => void
  onDeleteFile: (filename: string) => void
}

const PICKER_W = 160
const PICKER_H = 48

export function WikiSidebar({
  files,
  tagColors,
  activeFile,
  onFileClick,
  onSetTagColor,
  onDeleteFile,
}: WikiSidebarProps) {
  const [colorPicker, setColorPicker] = useState<{ tag: string; x: number; y: number } | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ filename: string; tag: string; x: number; y: number } | null>(null)

  const groups: Record<string, KbFileEntry[]> = {}
  for (const file of files) {
    if (file.filename.startsWith('_')) continue
    const tag = file.tags[0] ?? 'Untagged'
    if (!groups[tag]) groups[tag] = []
    groups[tag].push(file)
  }

  const sortedTags = Object.keys(groups).sort()

  function openPicker(tag: string, e: React.MouseEvent) {
    e.preventDefault()
    const x = Math.min(e.clientX, window.innerWidth - PICKER_W - 8)
    const y = Math.min(e.clientY, window.innerHeight - PICKER_H - 8)
    setColorPicker({ tag, x, y })
  }

  function openCtxMenu(filename: string, tag: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({ filename, tag, x: e.clientX, y: e.clientY })
  }

  // Dismiss context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest('[data-ctx-menu]')) {
        setCtxMenu(null)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [ctxMenu])

  return (
    <div className="w-56 flex-shrink-0 border-r border-gray-700 overflow-y-auto bg-gray-900 relative">
      <div className="p-2 text-xs text-gray-500 uppercase tracking-wider font-semibold border-b border-gray-700">
        Knowledge Base
      </div>

      {sortedTags.map(tag => {
        const color = tagColors[tag] ?? '#6b7280'
        return (
          <div key={tag} className="mb-1">
            {/* Tag header — right-click to change color */}
            <div
              className="flex items-center gap-2 px-3 py-1.5 cursor-pointer select-none hover:bg-gray-800"
              title="Right-click to change color"
              onContextMenu={(e) => openPicker(tag, e)}
            >
              <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide truncate">{tag}</span>
            </div>

            {/* Files — left-click navigates, right-click shows context menu */}
            {groups[tag].map(file => (
              <button
                key={file.filename}
                onClick={() => onFileClick(file.filename)}
                onContextMenu={(e) => openCtxMenu(file.filename, tag, e)}
                className={`w-full text-left px-4 py-1 text-xs truncate transition-colors ${
                  activeFile === file.filename
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
                style={activeFile === file.filename ? { borderLeft: `3px solid ${color}` } : { borderLeft: '3px solid transparent' }}
              >
                {file.title}
              </button>
            ))}
          </div>
        )
      })}

      {files.filter(f => !f.filename.startsWith('_')).length === 0 && (
        <p className="p-4 text-xs text-gray-600">
          No concept files yet. Submit a note to start building your wiki.
        </p>
      )}

      {colorPicker && createPortal(
        <div
          style={{ position: 'fixed', left: colorPicker.x, top: colorPicker.y, zIndex: 9999 }}
          className="bg-gray-800 border border-gray-600 rounded p-2 shadow-xl flex items-center gap-2"
        >
          <input
            type="color"
            value={tagColors[colorPicker.tag] ?? '#6366f1'}
            onChange={(e) => onSetTagColor(colorPicker.tag, e.target.value)}
            className="w-8 h-8 cursor-pointer rounded border-0 bg-transparent"
          />
          <span className="text-xs text-gray-300">{colorPicker.tag}</span>
          <button
            onClick={() => setColorPicker(null)}
            className="text-xs text-gray-500 hover:text-gray-300 ml-1"
          >
            x
          </button>
        </div>,
        document.body
      )}

      {ctxMenu && createPortal(
        <div
          data-ctx-menu
          style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 9999 }}
          className="bg-gray-800 border border-gray-600 rounded shadow-xl overflow-hidden"
        >
          <button
            className="block w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 cursor-pointer"
            onClick={(e) => {
              const tag = ctxMenu.tag
              const x = ctxMenu.x
              const y = ctxMenu.y
              setCtxMenu(null)
              openPicker(tag, { ...e, clientX: x, clientY: y, preventDefault: () => {} } as React.MouseEvent)
            }}
          >
            Change tag color
          </button>
          <button
            className="block w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 cursor-pointer"
            onClick={() => {
              const filename = ctxMenu.filename
              setCtxMenu(null)
              onDeleteFile(filename)
            }}
          >
            Delete entry
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}
