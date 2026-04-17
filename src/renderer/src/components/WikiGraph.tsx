import ForceGraph2D from 'react-force-graph-2d'
import { useRef, useEffect, useState } from 'react'

interface GraphNode {
  id: string    // filename without .md
  name: string  // display title
  color: string // tag color
}

interface GraphLink {
  source: string
  target: string
}

interface WikiGraphProps {
  nodes: GraphNode[]
  links: GraphLink[]
  tagColors?: Record<string, string>  // accepted but unused — node.color already encodes color
  onNodeClick: (filename: string) => void  // called with filename.md
}

export function WikiGraph({ nodes, links, onNodeClick }: WikiGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ width: 600, height: 400 })

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
        graphData={{ nodes, links }}
        width={dims.width}
        height={dims.height}
        nodeLabel="name"
        nodeColor={(node) => (node as GraphNode).color}
        onNodeClick={(node) => onNodeClick((node as GraphNode).id + '.md')}
        linkColor={() => '#4b5563'}
        backgroundColor="#111827"
        nodeRelSize={5}
      />
    </div>
  )
}
