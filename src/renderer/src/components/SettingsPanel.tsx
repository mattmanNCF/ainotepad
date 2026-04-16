import { useEffect, useState } from 'react'

interface SettingsPanelProps {
  onClose: () => void
}

type Provider = 'claude' | 'openai' | 'ollama' | 'local'

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [provider, setProvider] = useState<Provider>('ollama')
  const [apiKey, setApiKey] = useState('')
  const [ollamaModel, setOllamaModel] = useState('qwen2.5-coder:14b')
  const [hasKey, setHasKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [braveKey, setBraveKey] = useState('')
  const [hasBraveKey, setHasBraveKey] = useState(false)
  const [modelTier, setModelTier] = useState('')
  const [modelStatus, setModelStatus] = useState<{ tier: string; modelPath: string | null; ready: boolean } | null>(null)

  useEffect(() => {
    window.api.settings.get().then(({ provider: p, hasKey: h, ollamaModel: m, hasBraveKey: bk, modelTier: mt }) => {
      setProvider((p as Provider) ?? 'ollama')
      setHasKey(h)
      if (m) setOllamaModel(m)
      setHasBraveKey(bk)
      setModelTier(mt ?? '')
    })
    window.api.localModel.getStatus().then(setModelStatus)
  }, [])

  async function handleSave() {
    if (provider !== 'ollama' && provider !== 'local' && !apiKey.trim()) return
    setSaving(true)
    await window.api.settings.save(apiKey.trim(), provider, ollamaModel, braveKey.trim() || undefined)
    setSaving(false)
    setSaved(true)
    setHasKey(true)
    setApiKey('')
    if (braveKey.trim()) setHasBraveKey(true)
    setBraveKey('')
    setTimeout(() => setSaved(false), 2000)
  }

  const needsApiKey = provider !== 'ollama' && provider !== 'local'
  const canSave = (provider === 'ollama' || provider === 'local') ? true : !!apiKey.trim()

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
          <div className="flex gap-3 flex-wrap">
            {(['ollama', 'claude', 'openai'] as const).map((p) => (
              <label key={p} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="provider"
                  value={p}
                  checked={provider === p}
                  onChange={() => setProvider(p)}
                  className="accent-blue-400"
                />
                <span className="text-sm text-gray-300 capitalize">
                  {p === 'claude' ? 'Claude' : p === 'openai' ? 'OpenAI' : 'Ollama'}
                </span>
              </label>
            ))}
            <label key="local" className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="provider"
                value="local"
                checked={provider === 'local'}
                onChange={() => setProvider('local')}
                className="accent-blue-400"
              />
              <span className="text-sm text-gray-300">Local (Gemma 4)</span>
            </label>
          </div>
        </div>

        {/* Ollama model name */}
        {provider === 'ollama' && (
          <div className="mb-4">
            <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Model</p>
            <input
              type="text"
              value={ollamaModel}
              onChange={(e) => setOllamaModel(e.target.value)}
              placeholder="qwen2.5-coder:14b"
              className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-400/50"
            />
            <p className="text-xs text-gray-600 mt-1">Ollama must be running at localhost:11434</p>
          </div>
        )}

        {/* Local model info — shown when local provider selected */}
        {provider === 'local' && (
          <div className="mb-4">
            <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Local Model</p>
            {modelTier && (
              <p className="text-xs text-blue-300 mb-1">
                Recommended: <span className="font-medium">{modelTier}</span> tier based on your RAM
              </p>
            )}
            {modelStatus ? (
              modelStatus.ready ? (
                <p className="text-xs text-emerald-400">Model found: {modelStatus.modelPath}</p>
              ) : (
                <p className="text-xs text-gray-500">Model will be downloaded on first use (~5 GB)</p>
              )
            ) : (
              <p className="text-xs text-gray-600">Checking model status...</p>
            )}
          </div>
        )}

        {/* API Key input — only for cloud providers */}
        {needsApiKey && (
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
        )}

        {/* Brave Search API Key — optional, shown for all providers */}
        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-1 uppercase tracking-wider">
            Brave Search API Key <span className="normal-case text-gray-600">(optional — enables web insights)</span>
          </p>
          {hasBraveKey && <p className="text-xs text-emerald-400 mb-1">Configured</p>}
          <input
            type="password"
            value={braveKey}
            onChange={(e) => setBraveKey(e.target.value)}
            placeholder={hasBraveKey ? 'Enter new key to replace' : 'BSA-...'}
            className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-400/50"
          />
          <p className="text-xs text-gray-600 mt-1">
            Get a key at brave.com/search/api — credit-based, optional
          </p>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving || !canSave}
          className="w-full py-2 rounded text-sm font-medium transition-colors bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving\u2026' : saved ? 'Saved!' : 'Save'}
        </button>
      </div>
    </div>
  )
}
