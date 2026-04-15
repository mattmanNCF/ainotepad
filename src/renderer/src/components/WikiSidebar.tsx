import { useState } from 'react'

interface KbFileEntry {
  filename: string   // e.g. "quantum-entanglement.md"
  title: string      // e.g. "Quantum Entanglement"
  tags: string[]     // ["physics", "TOT"]
}

interface WikiSidebarProps {
  files: KbFileEntry[]
  tagColors: Record<string, string>
  activeFile: string | null
  onFileClick: (filename: string) => void
  onSetTagColor: (tag: string, color: string) => void
}

export function WikiSidebar({
  files,
  tagColors,
  activeFile,
  onFileClick,
  onSetTagColor,
}: WikiSidebarProps) {
  const [colorPicker, setColorPicker] = useState<{ tag: string; x: number; y: number } | null>(null)

  // Group files by first tag; files with no tags go under "Untagged"
  const groups: Record<string, KbFileEntry[]> = {}
  for (const file of files) {
    if (file.filename.startsWith('_')) continue  // exclude _context.md from sidebar
    const tag = file.tags[0] ?? 'Untagged'
    if (!groups[tag]) groups[tag] = []
    groups[tag].push(file)
  }

  const sortedTags = Object.keys(groups).sort()

  return (
    <div className="w-56 flex-shrink-0 border-r border-gray-700 overflow-y-auto bg-gray-900 relative">
      <div className="p-2 text-xs text-gray-500 uppercase tracking-wider font-semibold border-b border-gray-700">
        Knowledge Base
      </div>

      {sortedTags.map(tag => {
        const color = tagColors[tag] ?? '#6b7280'
        return (
          <div key={tag} className="mb-1">
            {/* Tag section header — right-click to change color */}
            <div
              className="flex items-center gap-2 px-3 py-1.5 cursor-pointer select-none hover:bg-gray-800"
              onContextMenu={(e) => {
                e.preventDefault()
                setColorPicker({ tag, x: e.clientX, y: e.clientY })
              }}
            >
              <div
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide truncate">
                {tag}
              </span>
            </div>

            {/* Files under this tag */}
            {groups[tag].map(file => (
              <button
                key={file.filename}
                onClick={() => onFileClick(file.filename)}
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

      {/* Native color picker popover */}
      {colorPicker && (
        <div
          style={{ position: 'fixed', left: colorPicker.x, top: colorPicker.y, zIndex: 50 }}
          className="bg-gray-800 border border-gray-600 rounded p-2 shadow-xl flex items-center gap-2"
        >
          <input
            type="color"
            defaultValue={tagColors[colorPicker.tag] ?? '#6366f1'}
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
        </div>
      )}
    </div>
  )
}
