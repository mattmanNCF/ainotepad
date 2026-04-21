// Synthetic graph for performance verification. Deterministic output for given nodeCount.
// Not imported in production paths — only wired in WikiGraph via a dev-only URL param guard.

export interface PerfNode {
  id: string
  name: string
  color: string
  tag: string
}

export interface PerfLink {
  source: string
  target: string
  sharedCount: number
}

export interface PerfFixture {
  nodes: PerfNode[]
  links: PerfLink[]
}

const COLOR_POOL = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#a855f7',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6',
]

// Deterministic fixture: nodeCount nodes clustered into ~10 tag groups, ~3-avg edge degree.
export function makePerfFixture(nodeCount: number): PerfFixture {
  const nodes: PerfNode[] = []
  const tagCount = Math.min(10, Math.max(3, Math.floor(nodeCount / 50)))
  for (let i = 0; i < nodeCount; i++) {
    const tagIdx = i % tagCount
    nodes.push({
      id: `perf-${i}`,
      name: `Perf node ${i}`,
      color: COLOR_POOL[tagIdx % COLOR_POOL.length],
      tag: `tag${tagIdx}`,
    })
  }
  // Edges: each node connects to its next 2 siblings in the same tag group.
  // Yields ~2 * nodeCount edges — heavy enough to stress d3 force sim at 500 nodes.
  const links: PerfLink[] = []
  const byTag = new Map<string, PerfNode[]>()
  for (const n of nodes) {
    if (!byTag.has(n.tag)) byTag.set(n.tag, [])
    byTag.get(n.tag)!.push(n)
  }
  for (const group of byTag.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = 1; j <= 2; j++) {
        const nxt = group[(i + j) % group.length]
        if (nxt.id !== group[i].id) {
          links.push({ source: group[i].id, target: nxt.id, sharedCount: 1 })
        }
      }
    }
  }
  return { nodes, links }
}
