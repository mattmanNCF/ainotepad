import { useEffect, useState, useCallback } from 'react'

interface DriveStatus {
  connected: boolean
  lastPollAt: string
  lastPollError: string
  lastAuthError: string
}

interface QuotaStatus {
  sizeBytes: number
  fileCount: number
  state: 'ok' | 'warn' | 'hard-stop'
  error?: string
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

function formatRelative(iso: string): string {
  if (!iso) return 'never'
  const d = new Date(iso)
  const secs = (Date.now() - d.getTime()) / 1000
  if (secs < 60) return `${Math.floor(secs)}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

export function DriveMobileSection() {
  const [status, setStatus] = useState<DriveStatus | null>(null)
  const [quota, setQuota] = useState<QuotaStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [inlineError, setInlineError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const s = await window.api.drive.getStatus()
      setStatus(s)
      if (s.connected) {
        const q = await window.api.drive.checkQuota()
        setQuota(q)
      } else {
        setQuota(null)
      }
    } catch (err) {
      console.error('[DriveMobileSection] refresh failed', err)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 30_000)
    return () => clearInterval(id)
  }, [refresh])

  const handleConnect = async () => {
    setBusy(true)
    setInlineError('')
    try {
      const res = await window.api.drive.connect()
      if (!res.ok) setInlineError(res.error ?? 'Unknown error')
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  // Health dot rules:
  //  red   — not connected OR lastAuthError set (401)
  //  yellow — connected but lastPollAt older than 3 minutes (polling stalled)
  //  green  — connected, lastPollAt within 3 minutes, no errors
  let health: 'red' | 'yellow' | 'green' = 'red'
  if (status?.connected && !status.lastAuthError) {
    if (!status.lastPollAt) health = 'yellow'
    else {
      const age = Date.now() - new Date(status.lastPollAt).getTime()
      health = age < 3 * 60_000 ? 'green' : 'yellow'
    }
  }

  const dotColor = health === 'green' ? '#10b981' : health === 'yellow' ? '#f59e0b' : '#ef4444'

  return (
    <div className="border-t border-neutral-700 pt-4 mt-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs uppercase tracking-wider text-neutral-400">Mobile Sync (Google Drive)</h3>
        <div className="flex items-center gap-2 text-xs">
          <span
            aria-label={`health: ${health}`}
            style={{ width: 8, height: 8, borderRadius: 4, background: dotColor, display: 'inline-block' }}
          />
          <span className="text-neutral-400">
            {status?.connected ? `last poll ${formatRelative(status.lastPollAt)}` : 'not connected'}
          </span>
        </div>
      </div>

      {status?.lastAuthError && (
        <div className="text-xs text-red-400 mb-2">
          Google has revoked access. Reconnect to resume mobile sync.
        </div>
      )}

      {status?.lastPollError && !status.lastAuthError && (
        <div className="text-xs text-amber-400 mb-2">
          Last poll error: {status.lastPollError}
        </div>
      )}

      {!status?.connected ? (
        <button
          onClick={handleConnect}
          disabled={busy}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded"
        >
          {busy ? 'Connecting…' : 'Connect Google Drive'}
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={handleConnect}
            disabled={busy}
            className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 text-white text-xs rounded"
          >
            Reconnect
          </button>
        </div>
      )}

      {inlineError && <div className="text-xs text-red-400 mt-2">{inlineError}</div>}

      {quota && (
        <div className="mt-3 text-xs">
          <div className="flex justify-between text-neutral-400 mb-1">
            <span>appDataFolder</span>
            <span>{formatBytes(quota.sizeBytes)} / 100 MB ({quota.fileCount} file{quota.fileCount === 1 ? '' : 's'})</span>
          </div>
          <div className="w-full h-1.5 bg-neutral-800 rounded overflow-hidden">
            <div
              style={{
                width: `${Math.min(100, (quota.sizeBytes / (100 * 1024 * 1024)) * 100)}%`,
                height: '100%',
                background: quota.state === 'hard-stop' ? '#ef4444' : quota.state === 'warn' ? '#f59e0b' : '#10b981',
              }}
            />
          </div>
          {quota.state === 'warn' && (
            <div className="text-amber-400 mt-1">Warning: folder &gt;10 MB — ingestion may be stuck</div>
          )}
          {quota.state === 'hard-stop' && (
            <div className="text-red-400 mt-1">Folder &gt;100 MB — ingestion halted. Check Drive for stuck files.</div>
          )}
        </div>
      )}

      <div className="text-xs text-neutral-500 mt-3">
        Mobile PWA URL: <code className="text-neutral-300">https://mattmanNCF.github.io/notal-mobile/</code>
      </div>
    </div>
  )
}
