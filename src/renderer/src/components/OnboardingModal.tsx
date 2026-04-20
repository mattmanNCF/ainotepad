import { useState } from 'react'

interface OnboardingModalProps {
  onDismiss: () => void
}

const API_PROVIDERS = [
  { id: 'claude',      label: 'Claude',       placeholder: 'sk-ant-...' },
  { id: 'openai',      label: 'OpenAI',        placeholder: 'sk-...' },
  { id: 'gemini',      label: 'Gemini',        placeholder: 'AIza...' },
  { id: 'groq',        label: 'Groq',          placeholder: 'gsk_...' },
  { id: 'huggingface', label: 'Hugging Face',  placeholder: 'hf_...' },
] as const

type ProviderId = typeof API_PROVIDERS[number]['id'] | 'ollama'

export function OnboardingModal({ onDismiss }: OnboardingModalProps) {
  const [step, setStep] = useState<'welcome' | 'provider'>('welcome')

  async function handleSkip() {
    await window.api.onboarding.complete()
    onDismiss()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) handleSkip() }}
    >
      <div className="bg-[#1a1a14] border border-white/10 rounded-md p-5 w-[340px] shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-gray-200">
            {step === 'welcome' ? 'Welcome to Notal' : 'Set up AI provider'}
          </h2>
          <button
            onClick={handleSkip}
            className="text-gray-500 hover:text-gray-300 text-lg leading-none"
            title="Skip setup"
          >
            ×
          </button>
        </div>

        {step === 'welcome' && (
          <WelcomeStep
            onNext={() => setStep('provider')}
            onSkip={handleSkip}
          />
        )}
        {step === 'provider' && (
          <ProviderStep
            onComplete={handleSkip}
            onSkip={handleSkip}
          />
        )}
      </div>
    </div>
  )
}

function WelcomeStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <div>
      <p className="text-sm text-gray-400 leading-relaxed mb-4">
        Write a note. AI organizes it. Your wiki grows automatically.
      </p>
      <p className="text-xs text-gray-500 leading-relaxed mb-6">
        No prompts, no chatting. Notes are processed silently in the background — tagged, annotated, and woven into a personal knowledge base.
      </p>
      <p className="text-xs text-gray-500 mb-6">
        You&apos;ll need an AI provider (Ollama for free local AI, or an API key for Claude/OpenAI).
      </p>
      <div className="flex gap-2">
        <button
          onClick={onNext}
          className="flex-1 py-2 rounded text-sm font-medium bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 transition-colors"
        >
          Set up provider →
        </button>
        <button
          onClick={onSkip}
          className="px-3 py-2 rounded text-sm text-gray-500 hover:text-gray-400 transition-colors"
        >
          Skip
        </button>
      </div>
    </div>
  )
}

function ProviderStep({ onComplete, onSkip }: { onComplete: () => void; onSkip: () => void }) {
  const [provider, setProvider] = useState<ProviderId>('ollama')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const isApiProvider = API_PROVIDERS.some(p => p.id === provider)
  const currentApiProvider = API_PROVIDERS.find(p => p.id === provider)
  const canSave = !isApiProvider || !!apiKey.trim()

  async function handleSave() {
    setSaving(true)
    await window.api.settings.save(apiKey.trim(), provider)
    await window.api.onboarding.complete()
    setSaving(false)
    setSaved(true)
    setTimeout(() => onComplete(), 800)
  }

  return (
    <div>
      {/* Ollama — primary local option, shown first */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Local (free)</p>
          <span className="text-xs text-emerald-400/70">recommended</span>
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio" name="ob-provider" value="ollama"
            checked={provider === 'ollama'}
            onChange={() => { setProvider('ollama'); setApiKey('') }}
            className="accent-indigo-400"
          />
          <span className="text-sm text-gray-300">
            Ollama <span className="text-xs text-gray-500 ml-1">— run models locally, no API key needed</span>
          </span>
        </label>
      </div>

      <div className="border-t border-white/10 my-3" />

      {/* API providers */}
      <div className="mb-4">
        <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">API providers</p>
        <div className="flex flex-wrap gap-2">
          {API_PROVIDERS.map(p => (
            <label key={p.id} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio" name="ob-provider" value={p.id}
                checked={provider === p.id}
                onChange={() => { setProvider(p.id); setApiKey('') }}
                className="accent-blue-400"
              />
              <span className="text-sm text-gray-300">{p.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* API key input — only shown for API providers */}
      {isApiProvider && (
        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-1.5 uppercase tracking-wider">
            {currentApiProvider?.label} API Key
          </p>
          <input
            type="password" value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && canSave) handleSave() }}
            placeholder={currentApiProvider?.placeholder ?? ''}
            className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-400/50"
          />
        </div>
      )}

      {provider === 'ollama' && (
        <p className="text-xs text-gray-500 mb-4 leading-relaxed">
          Make sure Ollama is running. Open Settings after launch to select your model.
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving || !canSave}
          className="flex-1 py-2 rounded text-sm font-medium transition-colors bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving\u2026' : saved ? 'Done!' : 'Save & launch'}
        </button>
        <button
          onClick={onSkip}
          className="px-3 py-2 rounded text-sm text-gray-500 hover:text-gray-400 transition-colors"
        >
          Skip
        </button>
      </div>
    </div>
  )
}
