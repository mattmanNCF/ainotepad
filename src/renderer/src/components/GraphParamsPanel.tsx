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

const PARAM_KEYS = ['linkForce', 'centerForce', 'repelForce', 'edgeThickness', 'nodeSize'] as const

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
        className="flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-gray-300 hover:text-white rounded"
        aria-expanded={!collapsed}
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

          {PARAM_KEYS.map(key => {
            const range = SLIDER_RANGES[key]
            const label = PARAM_LABELS[key]
            const inputId = `gpanel-${key}`

            return (
              <div key={key} className="flex items-center gap-2">
                {/* Label */}
                <label
                  htmlFor={inputId}
                  className="text-xs text-gray-400 flex-shrink-0"
                  style={{ width: 96 }}
                >
                  {label}
                </label>

                {/* Radix Slider — pointer events drive onDragStart / onDragEnd */}
                <div
                  className="flex-1"
                  onPointerDown={onDragStart}
                  onPointerUp={onDragEnd}
                  onPointerCancel={onDragEnd}
                >
                  <Slider.Root
                    className="gpanel-slider-root"
                    min={range.min}
                    max={range.max}
                    step={range.step}
                    value={[params[key]]}
                    onValueChange={([v]) => handleSliderChange(key, v)}
                    aria-label={label}
                  >
                    <Slider.Track className="gpanel-slider-track">
                      <Slider.Range className="gpanel-slider-range" />
                    </Slider.Track>
                    <Slider.Thumb className="gpanel-slider-thumb" />
                  </Slider.Root>
                </div>

                {/* Paired numeric input */}
                <input
                  id={inputId}
                  type="number"
                  min={range.min}
                  max={range.max}
                  step={range.step}
                  value={params[key]}
                  onChange={e => handleNumberInput(key, e.target.value)}
                  className="text-xs text-gray-300 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-right"
                  style={{ width: 56 }}
                />
              </div>
            )
          })}

        </div>
      )}
    </div>
  )
}
