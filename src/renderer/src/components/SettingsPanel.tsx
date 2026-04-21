import { useEffect, useState, useCallback } from 'react'
import { GoogleCalendarSection } from './GoogleCalendarSection'

interface SettingsPanelProps {
  onClose: () => void
}

const API_PROVIDERS = [
  { id: 'claude',      label: 'Claude',       placeholder: 'sk-ant-...' },
  { id: 'openai',      label: 'OpenAI',        placeholder: 'sk-...' },
  { id: 'gemini',      label: 'Gemini',        placeholder: 'AIza...' },
  { id: 'groq',        label: 'Groq',          placeholder: 'gsk_...' },
  { id: 'huggingface', label: 'Hugging Face',  placeholder: 'hf_...' },
] as const

type ProviderId = typeof API_PROVIDERS[number]['id'] | 'ollama' | 'llamacpp'

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [provider, setProvider] = useState<ProviderId>('ollama')
  const [apiKey, setApiKey] = useState('')
  const [ollamaModel, setOllamaModel] = useState('gemma4:e4b')
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [ollamaOnline, setOllamaOnline] = useState<boolean | null>(null)
  const [llamaCppPath, setLlamaCppPath] = useState('')
  const [keyStatus, setKeyStatus] = useState<Record<string, boolean>>({})
  const [modelTier, setModelTier] = useState('')
  const [modelStatus, setModelStatus] = useState<{ tier: string; modelPath: string | null; ready: boolean } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadPercent, setDownloadPercent] = useState(0)
  const [downloadError, setDownloadError] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [agentMd, setAgentMd] = useState('')
  const [userMd, setUserMd] = useState('')
  const [memoryMd, setMemoryMd] = useState('')
  const [agentSaving, setAgentSaving] = useState(false)
  const [agentSaved, setAgentSaved] = useState(false)
  const [runningImprovement, setRunningImprovement] = useState(false)
  const [showAgent, setShowAgent] = useState(false)

  useEffect(() => {
    window.api.settings.get().then(s => {
      setProvider((s.provider as ProviderId) ?? 'ollama')
      setOllamaModel(s.ollamaModel ?? 'gemma4:e4b')
      setLlamaCppPath(s.llamaCppPath ?? '')
      setModelTier(s.modelTier ?? '')
      setKeyStatus(s.keyStatus ?? {})
      if (s.provider === 'llamacpp') setShowAdvanced(true)
    })
    window.api.localModel.getStatus().then(setModelStatus)
    // Fetch available Ollama models
    window.api.settings.listOllamaModels().then(models => {
      setOllamaOnline(models.length > 0)
      if (models.length > 0) setOllamaModels(models)
    })
    if (window.api.agent) {
      window.api.agent.readHarness().then(({ agentMd: a, userMd: u, memoryMd: mm }) => {
        setAgentMd(a)
        setUserMd(u)
        setMemoryMd(mm)
      })
    }
  }, [])

  useEffect(() => {
    if (provider !== 'llamacpp') return
    const unsub = window.api.localModel.onProgress((data) => {
      if (data.error) { setDownloadError(data.error); setDownloading(false); return }
      setDownloadPercent(data.percent)
      if (data.done) { setDownloading(false); window.api.localModel.getStatus().then(setModelStatus) }
    })
    return unsub
  }, [provider])

  async function handleSave() {
    setSaving(true)
    await window.api.settings.save(apiKey.trim(), provider, ollamaModel, llamaCppPath.trim() || undefined)
    setSaving(false)
    setSaved(true)
    setApiKey('')
    if (apiKey.trim()) setKeyStatus(prev => ({ ...prev, [provider]: true }))
    setTimeout(() => setSaved(false), 2000)
  }

  const handleSaveAgent = useCallback(async () => {
    if (!window.api.agent) return
    setAgentSaving(true)
    await window.api.agent.writeHarness({ agentMd, userMd, memoryMd })
    setAgentSaving(false)
    setAgentSaved(true)
    setTimeout(() => setAgentSaved(false), 2000)
  }, [agentMd, userMd, memoryMd])

  const isApiProvider = API_PROVIDERS.some(p => p.id === provider)
  const currentApiProvider = API_PROVIDERS.find(p => p.id === provider)
  const hasCurrentKey = keyStatus[provider] ?? false
  const canSave = !isApiProvider || !!apiKey.trim() || hasCurrentKey

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-[#1a1a14] border border-white/10 rounded-md p-5 w-[340px] shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-gray-200">Settings</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">×</button>
        </div>

        {/* Ollama — primary local provider */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Local (Ollama)</p>
            {ollamaOnline === true && <span className="text-xs text-emerald-400">● running</span>}
            {ollamaOnline === false && <span className="text-xs text-red-400/70">● offline</span>}
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer mb-3">
            <input
              type="radio" name="provider" value="ollama"
              checked={provider === 'ollama'}
              onChange={() => setProvider('ollama')}
              className="accent-indigo-400"
            />
            <span className="text-sm text-gray-300">Use Ollama</span>
          </label>
          {provider === 'ollama' && (
            <div>
              {ollamaOnline && ollamaModels.length > 0 ? (
                <select
                  value={ollamaModel}
                  onChange={e => setOllamaModel(e.target.value)}
                  className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-400/50"
                >
                  {ollamaModels.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text" value={ollamaModel}
                  onChange={e => setOllamaModel(e.target.value)}
                  placeholder="gemma4:e4b"
                  className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-400/50"
                />
              )}
              {ollamaOnline === false && (
                <p className="text-xs text-amber-400/70 mt-1">Start Ollama to enable model selection</p>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-white/10 my-4" />

        {/* API Providers */}
        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">API Providers</p>
          <div className="flex flex-wrap gap-2">
            {API_PROVIDERS.map(p => (
              <label key={p.id} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio" name="provider" value={p.id}
                  checked={provider === p.id}
                  onChange={() => { setProvider(p.id); setApiKey('') }}
                  className="accent-blue-400"
                />
                <span className="text-sm text-gray-300">
                  {p.label}
                  {keyStatus[p.id] && <span className="ml-1 text-emerald-500 text-xs">✓</span>}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* API key input */}
        {isApiProvider && (
          <div className="mb-4">
            <p className="text-xs text-gray-500 mb-1.5 uppercase tracking-wider">
              {currentApiProvider?.label} API Key
              {hasCurrentKey && <span className="ml-1 text-emerald-400 normal-case">(configured)</span>}
            </p>
            <input
              type="password" value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
              placeholder={hasCurrentKey ? 'Enter new key to replace' : (currentApiProvider?.placeholder ?? '')}
              className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-400/50"
            />
          </div>
        )}

        <div className="border-t border-white/10 my-4" />

        {/* Advanced: llama.cpp */}
        <div className="mb-4">
          <button
            onClick={() => setShowAdvanced(v => !v)}
            className="text-xs text-gray-600 hover:text-gray-400 flex items-center gap-1 transition-colors"
          >
            <span>{showAdvanced ? '▾' : '▸'}</span>
            <span>Advanced (llama.cpp — experimental)</span>
          </button>
          {showAdvanced && (
            <div className="mt-3 pl-3 border-l border-white/5">
              <label className="flex items-center gap-1.5 cursor-pointer mb-3">
                <input
                  type="radio" name="provider" value="llamacpp"
                  checked={provider === 'llamacpp'}
                  onChange={() => setProvider('llamacpp')}
                  className="accent-gray-400"
                />
                <span className="text-sm text-gray-400">Use llama.cpp (local binary)</span>
              </label>
              {provider === 'llamacpp' && (
                <div className="mb-2">
                  <p className="text-xs text-gray-500 mb-1.5 uppercase tracking-wider">GGUF Model Path</p>
                  <input
                    type="text" value={llamaCppPath}
                    onChange={e => setLlamaCppPath(e.target.value)}
                    placeholder="C:\path\to\model.gguf"
                    className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-400/50"
                  />
                  {modelStatus?.ready && !llamaCppPath && modelStatus.modelPath && (
                    <button
                      onClick={() => setLlamaCppPath(modelStatus.modelPath!)}
                      className="mt-1 text-left w-full text-xs text-emerald-400 hover:text-emerald-300 truncate"
                      title={`Click to use: ${modelStatus.modelPath}`}
                    >
                      ✓ Found: {modelStatus.modelPath.split('\\').pop() ?? modelStatus.modelPath} (click to use)
                    </button>
                  )}
                  {!modelStatus?.ready && !llamaCppPath && (
                    <div className="mt-2">
                      {downloading ? (
                        <div>
                          <div className="flex justify-between mb-1">
                            <p className="text-xs text-blue-300">Downloading Gemma 4...</p>
                            <p className="text-xs text-gray-400">{downloadPercent}%</p>
                          </div>
                          <div className="w-full bg-black/30 rounded-full h-1.5">
                            <div className="bg-blue-400 h-1.5 rounded-full transition-all" style={{ width: `${downloadPercent}%` }} />
                          </div>
                        </div>
                      ) : (
                        <>
                          {downloadError && <p className="text-xs text-red-400 mb-1">{downloadError}</p>}
                          <p className="text-xs text-gray-500 mb-1.5">No model at path — or download Gemma 4 ({modelTier || 'large'} tier, ~5 GB):</p>
                          <button
                            onClick={() => { setDownloading(true); setDownloadPercent(0); setDownloadError(''); window.api.localModel.download(modelTier || undefined) }}
                            className="w-full py-1.5 rounded text-xs font-medium bg-gray-500/20 text-gray-300 hover:bg-gray-500/30 transition-colors"
                          >
                            Download Gemma 4
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !canSave}
          className="w-full py-2 rounded text-sm font-medium transition-colors bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : saved ? 'Saved!' : 'Save'}
        </button>

        {/* Agent harness section */}
        {window.api.agent && (
          <div className="mt-5 border-t border-white/10 pt-4">
            <button
              onClick={() => setShowAgent(v => !v)}
              className="flex items-center justify-between w-full text-xs text-gray-400 hover:text-gray-200 uppercase tracking-wider mb-2"
            >
              <span>Agent Context</span>
              <span>{showAgent ? '▲' : '▼'}</span>
            </button>
            {showAgent && (
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-xs text-gray-600 mb-1">AGENT.md</p>
                  <textarea
                    value={agentMd}
                    onChange={(e) => setAgentMd(e.target.value)}
                    rows={6}
                    className="w-full bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs text-gray-300 font-mono focus:outline-none focus:border-blue-400/50 resize-y"
                  />
                </div>
                <div>
                  <p className="text-xs text-gray-600 mb-1">USER.md</p>
                  <textarea
                    value={userMd}
                    onChange={(e) => setUserMd(e.target.value)}
                    rows={6}
                    className="w-full bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs text-gray-300 font-mono focus:outline-none focus:border-blue-400/50 resize-y"
                  />
                </div>
                <div>
                  <p className="text-xs text-gray-600 mb-1">MEMORY.md</p>
                  <textarea
                    value={memoryMd}
                    onChange={(e) => setMemoryMd(e.target.value)}
                    rows={6}
                    className="w-full bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs text-gray-300 font-mono focus:outline-none focus:border-blue-400/50 resize-y"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveAgent}
                    disabled={agentSaving}
                    className="flex-1 py-1.5 rounded text-xs font-medium bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {agentSaving ? 'Saving...' : agentSaved ? 'Saved!' : 'Save Agent Files'}
                  </button>
                  <button
                    onClick={async () => {
                      setRunningImprovement(true)
                      await window.api.agent.runDailyImprovement()
                      setTimeout(async () => {
                        const updated = await window.api.agent.readHarness()
                        setAgentMd(updated.agentMd)
                        setUserMd(updated.userMd)
                        setMemoryMd(updated.memoryMd)
                        setRunningImprovement(false)
                      }, 10_000)
                    }}
                    disabled={runningImprovement}
                    className="flex-1 py-1.5 rounded text-xs font-medium bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {runningImprovement ? 'Running...' : 'Run Improvement'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Agent API — MCP connection info. Static: URL is always http://127.0.0.1:7723/mcp */}
        <div className="mt-5 border-t border-white/10 pt-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Agent API (MCP)</p>
          <p className="text-xs text-gray-500 mb-2">
            Add to Claude Code config (<code className="font-mono text-gray-400">claude mcp add</code>) or Atlas:
          </p>
          <div className="flex items-center gap-2 mb-2">
            <code className="flex-1 text-xs bg-black/30 border border-white/10 px-2 py-1.5 rounded text-gray-200 font-mono truncate">
              http://127.0.0.1:7723/mcp
            </code>
            <button
              onClick={() => navigator.clipboard.writeText('http://127.0.0.1:7723/mcp')}
              className="shrink-0 text-xs px-2 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-gray-400 hover:text-gray-200 transition-colors"
            >
              Copy
            </button>
          </div>
          <pre className="text-xs text-gray-600 bg-black/20 border border-white/5 rounded p-2 overflow-x-auto leading-relaxed">
{`{
  "mcpServers": {
    "notal": {
      "type": "http",
      "url": "http://127.0.0.1:7723/mcp"
    }
  }
}`}
          </pre>
        </div>

        {/* Integrations — Google Calendar */}
        <div className="mt-5 border-t border-white/10 pt-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Integrations</p>
          <GoogleCalendarSection />
        </div>
      </div>
    </div>
  )
}
