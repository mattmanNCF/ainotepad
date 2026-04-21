import { Conf } from 'electron-conf/main'
import type { GraphParams } from '../renderer/src/types/graphParams'
import { DEFAULT_GRAPH_PARAMS } from '../renderer/src/types/graphParams'

// Separate Conf instance — parallels tagColors.ts (see STATE.md line 119).
// Name 'graphParams' writes to userData/graphParams.json (not settings.json).
const conf = new Conf<{ graphParams: GraphParams }>({ name: 'graphParams' })

export function getGraphParams(): GraphParams {
  const stored = conf.get('graphParams', DEFAULT_GRAPH_PARAMS) as GraphParams
  // Defensive merge: if stored is missing any field (e.g., future field added),
  // fill from defaults so renderer always receives a complete object.
  return { ...DEFAULT_GRAPH_PARAMS, ...stored }
}

export function setGraphParams(params: GraphParams): void {
  conf.set('graphParams', params)
}
