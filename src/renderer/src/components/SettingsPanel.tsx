import { useEffect, useState } from 'react'

interface SettingsPanelProps {
  onClose: () => void
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [provider, setProvider] = useState<'claude' | 'openai'>('claude')
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.settings.get().then(({ provider: p, hasKey: h }) => {
      setProvider(p as 'claude' | 'openai')
      setHasKey(h)
    })
  }, [])

  async function handleSave() {
    if (!apiKey.trim()) return
    setSaving(true)
    await window.api.settings.save(apiKey.trim(), provider)
    setSaving(false)
    setSaved(true)
    setHasKey(true)
    setApiKey('')
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-[#1a1a14] border border-white/10 rounded-md p-6 w-80 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-gray-200">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg leading-none"
            aria-label="Close settings"
          >
            ×
          </button>
        </div>

        {/* Provider selector */}
        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">AI Provider</p>
          <div className="flex gap-3">
            {(['claude', 'openai'] as const).map((p) => (
              <label key={p} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="provider"
                  value={p}
                  checked={provider === p}
                  onChange={() => setProvider(p)}
                  className="accent-blue-400"
                />
                <span className="text-sm text-gray-300 capitalize">{p === 'claude' ? 'Claude' : 'OpenAI'}</span>
              </label>
            ))}
          </div>
        </div>

        {/* API Key input */}
        <div className="mb-5">
          <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">
            API Key {hasKey && <span className="text-emerald-400 normal-case">(configured)</span>}
          </p>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
            placeholder={hasKey ? 'Enter new key to replace' : 'sk-ant-... or sk-...'}
            className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-400/50"
          />
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving || !apiKey.trim()}
          className="w-full py-2 rounded text-sm font-medium transition-colors bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving\u2026' : saved ? 'Saved!' : 'Save'}
        </button>
      </div>
    </div>
  )
}
