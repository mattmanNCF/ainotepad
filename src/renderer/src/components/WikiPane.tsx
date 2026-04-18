import { WikiMarkdown } from './WikiMarkdown'
import { WikiGraph } from './WikiGraph'

interface GraphNode {
  id: string
  name: string
  color: string
}

interface GraphLink {
  source: string
  target: string
}

interface WikiPaneProps {
  content: string | null
  insights?: string | null
  existingFiles: string[]
  graphNodes: GraphNode[]
  graphLinks: GraphLink[]
  tagColors: Record<string, string>
  colorKey: string
  canBack: boolean
  canForward: boolean
  showGraph: boolean
  onNavigate: (filename: string) => void
  onBack: () => void
  onForward: () => void
  onToggleGraph: () => void
  onNodeRightClick?: (filename: string) => void
}

export function WikiPane({
  content,
  insights,
  existingFiles,
  graphNodes,
  graphLinks,
  tagColors,
  colorKey,
  canBack,
  canForward,
  showGraph,
  onNavigate,
  onBack,
  onForward,
  onToggleGraph,
  onNodeRightClick,
}: WikiPaneProps) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-900">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-700 bg-gray-900 flex-shrink-0">
        <button
          onClick={onBack}
          disabled={!canBack}
          className="text-xs px-2 py-1 rounded text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
          title="Back"
        >
          &larr;
        </button>
        <button
          onClick={onForward}
          disabled={!canForward}
          className="text-xs px-2 py-1 rounded text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
          title="Forward"
        >
          &rarr;
        </button>
        <div className="flex-1" />
        <button
          onClick={onToggleGraph}
          className={`text-xs px-2 py-1 rounded transition-colors ${
            showGraph
              ? 'bg-indigo-600 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-700'
          }`}
          title="Toggle graph view"
        >
          Graph
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {showGraph ? (
          <WikiGraph key={colorKey} nodes={graphNodes} links={graphLinks} tagColors={tagColors} onNodeClick={onNavigate} onNodeRightClick={onNodeRightClick} />
        ) : content !== null ? (
          <WikiMarkdown content={content} existingFiles={existingFiles} onNavigate={onNavigate} insights={insights} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-gray-600">Select a concept file to read it.</p>
          </div>
        )}
      </div>
    </div>
  )
}
