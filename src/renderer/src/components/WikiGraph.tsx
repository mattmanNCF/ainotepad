import ForceGraph2D from 'react-force-graph-2d'
import { useRef, useEffect, useState, useMemo } from 'react'

interface GraphNode {
  id: string
  name: string
  color: string
}

interface GraphLink {
  source: string
  target: string
}

interface WikiGraphProps {
  nodes: GraphNode[]
  links: GraphLink[]
  tagColors: Record<string, string>
  onNodeClick: (filename: string) => void
}

export function WikiGraph({ nodes, links, onNodeClick }: WikiGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<any>(null)
  const [dims, setDims] = useState({ width: 600, height: 400 })

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
        linkColor={() => '#4b5563'}
        backgroundColor="#111827"
        nodeRelSize={5}
      />
    </div>
  )
}
