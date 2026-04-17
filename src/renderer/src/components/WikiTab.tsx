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

// Build graph edges from note tag co-occurrence:
// if a note is tagged [topicA, topicB], that creates an implicit edge topicA<->topicB.
// Only emit edges where both topics have a corresponding wiki page (node).
function buildCooccurrenceLinks(
  allNoteTags: string[][],
  nodeIds: Set<string>
): Array<{ source: string; target: string }> {
  const counts = new Map<string, number>()
  for (const tags of allNoteTags) {
    const topics = tags.filter(t => nodeIds.has(t))
    for (let i = 0; i < topics.length; i++) {
      for (let j = i + 1; j < topics.length; j++) {
        const key = [topics[i], topics[j]].sort().join('\0')
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
  }
  return Array.from(counts.keys()).map(key => {
    const [source, target] = key.split('\0')
    return { source, target }
  })
}

export function WikiTab() {
  const [files, setFiles] = useState<KbFileEntry[]>([])
  const [tagColors, setTagColors] = useState<Record<string, string>>({})
  const [history, setHistory] = useState<string[]>([])
  const [cursor, setCursor] = useState<number>(-1)
  const [activeContent, setActiveContent] = useState<string | null>(null)
  const [showGraph, setShowGraph] = useState(false)
  const [allNoteTags, setAllNoteTags] = useState<string[][]>([])

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

  // Load all note tags for co-occurrence graph; refresh when new notes are processed.
  useEffect(() => {
    function loadAllTags() {
      window.api.notes.allTags().then(setAllNoteTags)
    }
    loadAllTags()
    const unsub = window.api.onAiUpdate(() => loadAllTags())
    return unsub
  }, [])

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

  // Derive graph data from files state
  const existingFilenames = files.map(f => f.filename)

  const graphNodes = files.map(f => ({
    id: f.filename.replace(/\.md$/, ''),
    name: f.title,
    color: tagColors[f.tags[0] ?? ''] ?? '#6b7280',
  }))

  // Derive semantic graph edges from note tag co-occurrence.
  // Two wiki topics are connected when the same note is tagged with both.
  const graphLinks = useMemo(() => {
    const nodeIds = new Set(graphNodes.map(n => n.id))
    return buildCooccurrenceLinks(allNoteTags, nodeIds)
  }, [graphNodes, allNoteTags])

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
      />
    </div>
  )
}
