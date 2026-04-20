import ForceGraph2D from 'react-force-graph-2d'
import { useRef, useEffect, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'

interface GraphNode {
  id: string
  name: string
  color: string
  tag: string
}

interface GraphLink {
  source: string
  target: string
  sharedCount: number
}

interface WikiGraphProps {
  nodes: GraphNode[]
  links: GraphLink[]
  tagColors: Record<string, string>
  onNodeClick: (filename: string) => void
  onNodeDelete: (filename: string) => void
  onSetTagColor: (tag: string, color: string) => void
}

export function WikiGraph({ nodes, links, tagColors, onNodeClick, onNodeDelete, onSetTagColor }: WikiGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<any>(null)
  const [dims, setDims] = useState({ width: 600, height: 400 })
  const [ctxMenu, setCtxMenu] = useState<{ filename: string; tag: string; x: number; y: number } | null>(null)
  const [colorPickerTarget, setColorPickerTarget] = useState<{ tag: string; x: number; y: number } | null>(null)

  // Build a color lookup: nodeId -> color, derived from nodes (which already embed tagColors).
  // This is a plain object, not state — updated every render, read at canvas draw time.
  const colorMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const n of nodes) m[n.id] = n.color
    return m
  }, [nodes])

  // Keep a stable ref so nodeCanvasObject closure always reads the latest map
  const colorMapRef = useRef(colorMap)
  colorMapRef.current = colorMap

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setDims({ width: Math.floor(width), height: Math.floor(height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Set link distance inversely proportional to shared tag count — more shared = closer
  useEffect(() => {
    const g = graphRef.current
    if (!g) return
    const linkForce = g.d3Force('link')
    if (linkForce) linkForce.distance((link: any) => 120 / Math.max(1, link.sharedCount ?? 1))
  }, [nodes, links])

  // Dismiss context menu on outside mousedown
  useEffect(() => {
    if (!ctxMenu) return
    function handleMouseDown(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('[data-graph-ctx-menu]')) setCtxMenu(null)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [ctxMenu])

  return (
    <div ref={containerRef} className="w-full h-full bg-gray-900">
      <ForceGraph2D
        ref={graphRef}
        graphData={{ nodes, links }}
        width={dims.width}
        height={dims.height}
        nodeLabel="name"
        nodeCanvasObject={(node, ctx, globalScale) => {
          const n = node as GraphNode & { x: number; y: number }
          const color = colorMapRef.current[n.id] ?? '#6b7280'
          const r = 5 / Math.max(1, globalScale * 0.5)
          ctx.beginPath()
          ctx.arc(n.x, n.y, r, 0, 2 * Math.PI)
          ctx.fillStyle = color
          ctx.fill()
        }}
        nodeCanvasObjectMode={() => 'replace'}
        onNodeClick={(node) => onNodeClick((node as GraphNode).id + '.md')}
        onNodeRightClick={(node, event) => {
          const n = node as GraphNode
          setCtxMenu({ filename: n.id + '.md', tag: n.tag, x: event.clientX, y: event.clientY })
        }}
        linkColor={(link: any) => {
          const opacity = Math.min(0.9, 0.25 + (link.sharedCount ?? 1) * 0.2)
          return `rgba(99,102,241,${opacity})`
        }}
        linkWidth={(link: any) => Math.min(3, (link.sharedCount ?? 1) * 0.8)}
        d3AlphaDecay={0.03}
        d3VelocityDecay={0.3}
        backgroundColor="#111827"
        nodeRelSize={5}
      />

      {ctxMenu && createPortal(
        <div
          data-graph-ctx-menu
          style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 9999 }}
          className="bg-gray-800 border border-gray-600 rounded shadow-xl overflow-hidden"
        >
          <button
            className="block w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 cursor-pointer"
            onClick={() => {
              const { tag, x, y } = ctxMenu!
              setCtxMenu(null)
              setColorPickerTarget({ tag, x, y })
            }}
          >
            Change tag color
          </button>
          <button
            className="block w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-gray-700 cursor-pointer"
            onClick={() => {
              const { filename } = ctxMenu!
              setCtxMenu(null)
              onNodeDelete(filename)
            }}
          >
            Delete entry
          </button>
        </div>,
        document.body
      )}

      {colorPickerTarget && createPortal(
        <div
          style={{ position: 'fixed', left: colorPickerTarget.x, top: colorPickerTarget.y, zIndex: 9999 }}
          className="bg-gray-800 border border-gray-600 rounded p-2 shadow-xl flex items-center gap-2"
          onMouseLeave={() => setColorPickerTarget(null)}
        >
          <input
            type="color"
            value={tagColors[colorPickerTarget.tag] ?? '#6366f1'}
            onChange={(e) => onSetTagColor(colorPickerTarget.tag, e.target.value)}
            className="w-8 h-8 cursor-pointer rounded border-0 bg-transparent"
          />
          <span className="text-xs text-gray-300">{colorPickerTarget.tag}</span>
        </div>,
        document.body
      )}
    </div>
  )
}
