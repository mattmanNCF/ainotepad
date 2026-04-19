import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { WikiSidebar } from './WikiSidebar'
import { WikiPane } from './WikiPane'

interface KbFileEntry {
  filename: string
  title: string
  tags: string[]
}

function filenameToTitle(filename: string): string {
  return filename
    .replace(/\.md$/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

// Deterministic HSL color from a tag string — guarantees distinct hues without a fixed palette.
// Used as fallback when a tag has no manually assigned color.
function tagToAutoColor(tag: string): string {
  let hash = 0
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) & 0xffffffff
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 65%, 58%)`
}

// Build edges between wiki pages that share frontmatter tags.
// sharedCount = number of tags in common — used to weight link strength.
function buildSharedTagLinks(
  files: KbFileEntry[]
): Array<{ source: string; target: string; sharedCount: number }> {
  // Map from lowercase tag -> list of node IDs that have it
  const tagToNodes = new Map<string, string[]>()
  for (const f of files) {
    const nodeId = f.filename.replace(/\.md$/, '')
    for (const tag of f.tags) {
      const key = tag.toLowerCase()
      if (!tagToNodes.has(key)) tagToNodes.set(key, [])
      tagToNodes.get(key)!.push(nodeId)
    }
  }
  // Accumulate shared-tag count per pair, then emit edges
  const pairCounts = new Map<string, number>()
  for (const nodes of tagToNodes.values()) {
    if (nodes.length < 2) continue
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const key = [nodes[i], nodes[j]].sort().join('\0')
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1)
      }
    }
  }
  return Array.from(pairCounts.entries()).map(([key, sharedCount]) => {
    const [source, target] = key.split('\0')
    return { source, target, sharedCount }
  })
}

export function WikiTab() {
  const [files, setFiles] = useState<KbFileEntry[]>([])
  const [tagColors, setTagColors] = useState<Record<string, string>>({})
  const [history, setHistory] = useState<string[]>([])
  const [cursor, setCursor] = useState<number>(-1)
  const [activeContent, setActiveContent] = useState<string | null>(null)
  const [showGraph, setShowGraph] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // useRef for content cache — mutations do NOT trigger re-renders.
  // If this were useState, the cache update would invalidate useCallback deps,
  // recreate loadFilesWithTags, and re-fire the useEffect -> infinite loop.
  const contentCacheRef = useRef<Record<string, string>>({})

  const currentFile = history[cursor] ?? null
  const canBack = cursor > 0
  const canForward = cursor < history.length - 1

  const getFileEntry = useCallback((filename: string, content: string): KbFileEntry => {
    const tagsMatch = content.match(/^tags:\s*\[(.+?)\]/m)
    const tags = tagsMatch
      ? tagsMatch[1].split(',').map(t => t.trim().replace(/['"]/g, ''))
      : []
    return { filename, title: filenameToTitle(filename), tags }
  }, [])

  // Load all files with their tags for the sidebar (reads cached content where available).
  // Does NOT include contentCacheRef in deps — ref mutations are transparent to React.
  const loadFilesWithTags = useCallback(async () => {
    const filenames = await window.api.kb.listFiles()
    const colors = await window.api.kb.getTagColors()
    setTagColors(colors)

    const entries = await Promise.all(
      filenames
        .filter(f => !f.startsWith('_'))
        .map(async f => {
          const cached = contentCacheRef.current[f]
          if (cached) return getFileEntry(f, cached)
          const content = await window.api.kb.readFile(f)
          if (content) {
            contentCacheRef.current[f] = content  // mutate ref — no re-render
            return getFileEntry(f, content)
          }
          return { filename: f, title: filenameToTitle(f), tags: [] }
        })
    )
    setFiles(entries)
  }, [getFileEntry])
  // Note: contentCacheRef intentionally omitted from deps — ref.current reads are always fresh

  useEffect(() => {
    loadFilesWithTags()
    const cleanup = window.api.kb.onUpdated(() => loadFilesWithTags())
    return cleanup
  }, [loadFilesWithTags])

  const navigate = useCallback(async (filename: string) => {
    let content = contentCacheRef.current[filename]
    if (!content) {
      const fetched = await window.api.kb.readFile(filename)
      if (fetched === null) return
      contentCacheRef.current[filename] = fetched  // mutate ref
      content = fetched
    }
    setActiveContent(content)
    setHistory(prev => {
      const newHistory = [...prev.slice(0, cursor + 1), filename]
      setCursor(newHistory.length - 1)
      return newHistory
    })
    setShowGraph(false)  // switch to Markdown view on navigation
  }, [cursor])

  const goBack = useCallback(() => {
    if (!canBack) return
    const newCursor = cursor - 1
    setCursor(newCursor)
    const filename = history[newCursor]
    setActiveContent(contentCacheRef.current[filename] ?? null)
  }, [canBack, cursor, history])

  const goForward = useCallback(() => {
    if (!canForward) return
    const newCursor = cursor + 1
    setCursor(newCursor)
    const filename = history[newCursor]
    setActiveContent(contentCacheRef.current[filename] ?? null)
  }, [canForward, cursor, history])

  const handleSetTagColor = useCallback(async (tag: string, color: string) => {
    await window.api.kb.setTagColor(tag, color)
    setTagColors(prev => ({ ...prev, [tag]: color }))
  }, [])

  const handleDeleteFile = useCallback((filename: string) => {
    setDeleteTarget(filename)
  }, [])

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    const target = deleteTarget
    setDeleteTarget(null)
    // Remove from cache
    delete contentCacheRef.current[target]
    // If this was the active file, clear navigation state
    if (currentFile === target) {
      setHistory([])
      setCursor(-1)
      setActiveContent(null)
    }
    await window.api.kb.deleteFile(target)
    // sidebar refreshes via kb:updated event
  }, [deleteTarget, currentFile])

  const cancelDelete = useCallback(() => setDeleteTarget(null), [])

  // Derive graph data from files state
  const existingFilenames = files.map(f => f.filename)

  const graphNodes = useMemo(() => files.map(f => {
    const primaryTag = f.tags[0] ?? ''
    return {
      id: f.filename.replace(/\.md$/, ''),
      name: f.title,
      color: tagColors[primaryTag] ?? tagToAutoColor(primaryTag || f.filename),
      tag: primaryTag,
    }
  }), [files, tagColors])

  const graphLinks = useMemo(() => buildSharedTagLinks(files), [files])

  // Stable key that changes only when tag colors change — forces WikiGraph remount
  const colorKey = useMemo(
    () => Object.entries(tagColors).sort().map(([k, v]) => `${k}:${v}`).join(','),
    [tagColors]
  )

  return (
    <div className="flex h-full bg-gray-900">
      <WikiSidebar
        files={files}
        tagColors={tagColors}
        activeFile={currentFile}
        onFileClick={navigate}
        onSetTagColor={handleSetTagColor}
        onDeleteFile={handleDeleteFile}
      />
      <WikiPane
        content={activeContent}
        existingFiles={existingFilenames}
        graphNodes={graphNodes}
        graphLinks={graphLinks}
        tagColors={tagColors}
        colorKey={colorKey}
        canBack={canBack}
        canForward={canForward}
        showGraph={showGraph}
        onNavigate={navigate}
        onBack={goBack}
        onForward={goForward}
        onToggleGraph={() => setShowGraph(v => !v)}
        onNodeDelete={handleDeleteFile}
        onSetTagColor={handleSetTagColor}
      />

      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 shadow-2xl max-w-sm w-full mx-4">
            <p className="text-sm text-gray-200 mb-1">Delete wiki entry?</p>
            <p className="text-xs text-gray-400 mb-4">
              This will also delete all notes that contributed to this entry.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={cancelDelete} className="px-3 py-1.5 text-xs text-gray-300 hover:text-white border border-gray-600 rounded hover:bg-gray-700">Cancel</button>
              <button onClick={confirmDelete} className="px-3 py-1.5 text-xs text-white bg-red-700 hover:bg-red-600 rounded">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
