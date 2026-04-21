// Shared between main and renderer. Keep literal shape — Plans 02/03/04 import from here.
export interface GraphParams {
  linkForce: number      // multiplier over baseline link distance/strength
  centerForce: number    // multiplier over d3 center force strength
  repelForce: number     // multiplier over d3 charge (negative) strength
  edgeThickness: number  // multiplier over per-link stroke width
  nodeSize: number       // multiplier over nodeRelSize + canvas radius
}

export const DEFAULT_GRAPH_PARAMS: GraphParams = {
  linkForce: 1.0,
  centerForce: 1.0,
  repelForce: 1.0,
  edgeThickness: 1.0,
  nodeSize: 1.0,
}

// Slider ranges (min, max, step) — UI uses these, persistence does not enforce them.
// Adaptive baselines live in WikiGraph.tsx and scale with node count; these are multipliers.
export const SLIDER_RANGES: Record<keyof GraphParams, { min: number; max: number; step: number }> = {
  linkForce:     { min: 0.1, max: 3.0, step: 0.05 },
  centerForce:   { min: 0.0, max: 3.0, step: 0.05 },
  repelForce:    { min: 0.1, max: 3.0, step: 0.05 },
  edgeThickness: { min: 0.2, max: 3.0, step: 0.05 },
  nodeSize:      { min: 0.2, max: 3.0, step: 0.05 },
}

// Human-readable labels for slider UI (Plan 02 consumes these).
export const PARAM_LABELS: Record<keyof GraphParams, string> = {
  linkForce:     'Link force',
  centerForce:   'Center force',
  repelForce:    'Repel force',
  edgeThickness: 'Edge thickness',
  nodeSize:      'Node size',
}
