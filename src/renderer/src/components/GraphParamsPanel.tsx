import * as Slider from '@radix-ui/react-slider'
import { useState } from 'react'
import type { GraphParams } from '../types/graphParams'
import { SLIDER_RANGES, PARAM_LABELS, PRESETS, PRESET_ORDER, DEFAULT_GRAPH_PARAMS } from '../types/graphParams'

interface GraphParamsPanelProps {
  params: GraphParams
  onParamsChange: (next: GraphParams) => void   // live — called on every throttled onValueChange
  onDragStart: () => void                       // parent calls alphaTarget(0.1) + gentle reheat
  onDragEnd: () => void                         // parent calls alphaTarget(0)
  // Plan 10-03
  onPresetClick: (next: GraphParams) => void    // fires with the full resolved preset params
  onReset: () => void                           // fires with no args; parent resets to DEFAULT_GRAPH_PARAMS
}

// DEFAULT_GRAPH_PARAMS imported above for Plan 10-04 tooltip/aria-description; not used directly here yet.
void DEFAULT_GRAPH_PARAMS

export function GraphParamsPanel({ params, onParamsChange, onDragStart, onDragEnd, onPresetClick, onReset }: GraphParamsPanelProps) {
  const [collapsed, setCollapsed] = useState(false)

  function handleSliderChange(key: keyof GraphParams, value: number) {
    onParamsChange({ ...params, [key]: value })
  }

  function handleNumberInput(key: keyof GraphParams, raw: string) {
    const range = SLIDER_RANGES[key]
    const parsed = parseFloat(raw)
    if (isNaN(parsed)) return
    const clamped = Math.min(range.max, Math.max(range.min, parsed))
    onParamsChange({ ...params, [key]: clamped })
  }

  return (
    <div
      data-graph-params-panel=""
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 40,
        width: collapsed ? 'auto' : 264,
        background: 'rgba(31,41,55,0.92)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        borderRadius: 8,
        border: '1px solid rgb(75,85,99)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      }}
    >
      {/* Header / toggle */}
      <button
        onClick={() => setCollapsed(v => !v)}
        style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'none', border: 'none' }}
        className="flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-gray-300 hover:text-white rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
        aria-expanded={!collapsed}
        aria-label="Toggle graph parameters panel"
      >
        <span>Graph params</span>
        <span style={{ fontSize: 10, opacity: 0.7 }}>{collapsed ? '▾' : '▴'}</span>
      </button>

      {/* Sliders panel — hidden when collapsed */}
      {!collapsed && (
        <div className="px-3 pb-3 flex flex-col gap-3">
          {/* Preset + Reset button row — Plan 10-03 */}
          <div className="flex items-center gap-1 mb-2 pb-2 border-b border-gray-700">
            {PRESET_ORDER.map(key => (
              <button
                key={key}
                type="button"
                onClick={() => onPresetClick(PRESETS[key].params)}
                className="text-[10px] px-2 py-0.5 rounded bg-gray-700 text-gray-200 hover:bg-gray-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
              >
                {PRESETS[key].label}
              </button>
            ))}
            <div className="flex-1" />
            <button
              type="button"
              onClick={onReset}
              aria-label="Reset graph parameters to defaults"
              className="text-[10px] px-2 py-0.5 rounded bg-indigo-700 text-white hover:bg-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              Reset
            </button>
          </div>

          {/* Row: Link force */}
          <div className="flex items-center gap-2">
            <label htmlFor="gp-linkForce" className="text-xs text-gray-400 flex-shrink-0" style={{ width: 96 }}>
              {PARAM_LABELS.linkForce}
            </label>
            <div className="flex-1" onPointerDown={onDragStart} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}>
              <Slider.Root
                className="gpanel-slider-root"
                min={SLIDER_RANGES.linkForce.min}
                max={SLIDER_RANGES.linkForce.max}
                step={SLIDER_RANGES.linkForce.step}
                value={[params.linkForce]}
                onValueChange={([v]) => handleSliderChange('linkForce', v)}
                aria-label={PARAM_LABELS.linkForce}
              >
                <Slider.Track className="gpanel-slider-track"><Slider.Range className="gpanel-slider-range" /></Slider.Track>
                <Slider.Thumb className="gpanel-slider-thumb" />
              </Slider.Root>
            </div>
            <input
              id="gp-linkForce"
              type="number"
              min={SLIDER_RANGES.linkForce.min}
              max={SLIDER_RANGES.linkForce.max}
              step={SLIDER_RANGES.linkForce.step}
              value={params.linkForce}
              onChange={e => handleNumberInput('linkForce', e.target.value)}
              className="text-xs text-gray-300 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-right focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
              style={{ width: 56 }}
            />
          </div>

          {/* Row: Center force */}
          <div className="flex items-center gap-2">
            <label htmlFor="gp-centerForce" className="text-xs text-gray-400 flex-shrink-0" style={{ width: 96 }}>
              {PARAM_LABELS.centerForce}
            </label>
            <div className="flex-1" onPointerDown={onDragStart} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}>
              <Slider.Root
                className="gpanel-slider-root"
                min={SLIDER_RANGES.centerForce.min}
                max={SLIDER_RANGES.centerForce.max}
                step={SLIDER_RANGES.centerForce.step}
                value={[params.centerForce]}
                onValueChange={([v]) => handleSliderChange('centerForce', v)}
                aria-label={PARAM_LABELS.centerForce}
              >
                <Slider.Track className="gpanel-slider-track"><Slider.Range className="gpanel-slider-range" /></Slider.Track>
                <Slider.Thumb className="gpanel-slider-thumb" />
              </Slider.Root>
            </div>
            <input
              id="gp-centerForce"
              type="number"
              min={SLIDER_RANGES.centerForce.min}
              max={SLIDER_RANGES.centerForce.max}
              step={SLIDER_RANGES.centerForce.step}
              value={params.centerForce}
              onChange={e => handleNumberInput('centerForce', e.target.value)}
              className="text-xs text-gray-300 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-right focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
              style={{ width: 56 }}
            />
          </div>

          {/* Row: Repel force */}
          <div className="flex items-center gap-2">
            <label htmlFor="gp-repelForce" className="text-xs text-gray-400 flex-shrink-0" style={{ width: 96 }}>
              {PARAM_LABELS.repelForce}
            </label>
            <div className="flex-1" onPointerDown={onDragStart} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}>
              <Slider.Root
                className="gpanel-slider-root"
                min={SLIDER_RANGES.repelForce.min}
                max={SLIDER_RANGES.repelForce.max}
                step={SLIDER_RANGES.repelForce.step}
                value={[params.repelForce]}
                onValueChange={([v]) => handleSliderChange('repelForce', v)}
                aria-label={PARAM_LABELS.repelForce}
              >
                <Slider.Track className="gpanel-slider-track"><Slider.Range className="gpanel-slider-range" /></Slider.Track>
                <Slider.Thumb className="gpanel-slider-thumb" />
              </Slider.Root>
            </div>
            <input
              id="gp-repelForce"
              type="number"
              min={SLIDER_RANGES.repelForce.min}
              max={SLIDER_RANGES.repelForce.max}
              step={SLIDER_RANGES.repelForce.step}
              value={params.repelForce}
              onChange={e => handleNumberInput('repelForce', e.target.value)}
              className="text-xs text-gray-300 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-right focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
              style={{ width: 56 }}
            />
          </div>

          {/* Row: Edge thickness */}
          <div className="flex items-center gap-2">
            <label htmlFor="gp-edgeThickness" className="text-xs text-gray-400 flex-shrink-0" style={{ width: 96 }}>
              {PARAM_LABELS.edgeThickness}
            </label>
            <div className="flex-1" onPointerDown={onDragStart} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}>
              <Slider.Root
                className="gpanel-slider-root"
                min={SLIDER_RANGES.edgeThickness.min}
                max={SLIDER_RANGES.edgeThickness.max}
                step={SLIDER_RANGES.edgeThickness.step}
                value={[params.edgeThickness]}
                onValueChange={([v]) => handleSliderChange('edgeThickness', v)}
                aria-label={PARAM_LABELS.edgeThickness}
              >
                <Slider.Track className="gpanel-slider-track"><Slider.Range className="gpanel-slider-range" /></Slider.Track>
                <Slider.Thumb className="gpanel-slider-thumb" />
              </Slider.Root>
            </div>
            <input
              id="gp-edgeThickness"
              type="number"
              min={SLIDER_RANGES.edgeThickness.min}
              max={SLIDER_RANGES.edgeThickness.max}
              step={SLIDER_RANGES.edgeThickness.step}
              value={params.edgeThickness}
              onChange={e => handleNumberInput('edgeThickness', e.target.value)}
              className="text-xs text-gray-300 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-right focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
              style={{ width: 56 }}
            />
          </div>

          {/* Row: Node size */}
          <div className="flex items-center gap-2">
            <label htmlFor="gp-nodeSize" className="text-xs text-gray-400 flex-shrink-0" style={{ width: 96 }}>
              {PARAM_LABELS.nodeSize}
            </label>
            <div className="flex-1" onPointerDown={onDragStart} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}>
              <Slider.Root
                className="gpanel-slider-root"
                min={SLIDER_RANGES.nodeSize.min}
                max={SLIDER_RANGES.nodeSize.max}
                step={SLIDER_RANGES.nodeSize.step}
                value={[params.nodeSize]}
                onValueChange={([v]) => handleSliderChange('nodeSize', v)}
                aria-label={PARAM_LABELS.nodeSize}
              >
                <Slider.Track className="gpanel-slider-track"><Slider.Range className="gpanel-slider-range" /></Slider.Track>
                <Slider.Thumb className="gpanel-slider-thumb" />
              </Slider.Root>
            </div>
            <input
              id="gp-nodeSize"
              type="number"
              min={SLIDER_RANGES.nodeSize.min}
              max={SLIDER_RANGES.nodeSize.max}
              step={SLIDER_RANGES.nodeSize.step}
              value={params.nodeSize}
              onChange={e => handleNumberInput('nodeSize', e.target.value)}
              className="text-xs text-gray-300 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-right focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
              style={{ width: 56 }}
            />
          </div>

        </div>
      )}
    </div>
  )
}
