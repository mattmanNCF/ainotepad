import { useEffect, useState, useCallback } from 'react'
import { initGisClient, requestAuth, hasFreshToken, getAccessToken, onAuthChange, clearToken } from './auth/gisClient'
import { enqueue, getAll, drainQueue, QueuedNote } from './queue/noteQueue'
import { uploadNoteToDrive } from './drive/driveUpload'

export function App() {
  const [text, setText] = useState('')
  const [notes, setNotes] = useState<QueuedNote[]>([])
  const [connected, setConnected] = useState(false)
  const [gisReady, setGisReady] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [busy, setBusy] = useState(false)

  // Wait for GIS script to load, then init client.
  useEffect(() => {
    const check = () => {
      if (window.google?.accounts?.oauth2) {
        try { initGisClient(); setGisReady(true) } catch (e) { console.error(e) }
      } else {
        setTimeout(check, 200)
      }
    }
    check()
  }, [])

  // Track auth state.
  useEffect(() => {
    const un = onAuthChange(token => setConnected(!!token))
    return () => un()
  }, [])

  // Online/offline.
  useEffect(() => {
    const onOn = () => setOnline(true)
    const onOff = () => setOnline(false)
    window.addEventListener('online', onOn)
    window.addEventListener('offline', onOff)
    return () => {
      window.removeEventListener('online', onOn)
      window.removeEventListener('offline', onOff)
    }
  }, [])

  // Refresh the displayed queue on mount + every 5s.
  const refresh = useCallback(async () => setNotes(await getAll()), [])
  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [refresh])

  // Drain automatically when online + connected + there are pending notes.
  useEffect(() => {
    if (!online || !connected || busy) return
    const anyPending = notes.some(n => n.status === 'local' || n.status === 'failed')
    if (!anyPending) return
    ;(async () => {
      setBusy(true)
      try {
        await drainQueue(uploadNoteToDrive, () => getAccessToken())
        await refresh()
      } finally {
        setBusy(false)
      }
    })()
  }, [online, connected, notes, busy, refresh])

  const handleConnect = () => {
    // MUST be direct user gesture — iOS Safari popup policy.
    requestAuth(hasFreshToken() ? '' : 'consent')
  }

  const handleDisconnect = () => {
    clearToken()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return
    await enqueue(trimmed)
    setText('')
    await refresh()
  }

  return (
    <main style={{ padding: '24px 0' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Notal Capture</h1>
        {connected
          ? <button onClick={handleDisconnect}>Disconnect</button>
          : <button onClick={handleConnect} disabled={!gisReady}>Connect Google</button>
        }
      </header>

      {!gisReady && <p style={{ fontSize: 13, color: '#aaa' }}>Loading Google sign-in…</p>}
      {!online && <p style={{ fontSize: 13, color: '#ffa' }}>Offline — notes queue locally</p>}

      <form onSubmit={handleSubmit}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Type a note…"
          maxLength={16384}
          autoFocus
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 12, color: '#888' }}>{text.length} / 16384</span>
          <button type="submit" disabled={!text.trim()}>Save</button>
        </div>
      </form>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: '8px 0', color: '#aaa' }}>
          Recent ({notes.length})
        </h2>
        {notes.length === 0 && <p style={{ fontSize: 13, color: '#888' }}>No notes yet.</p>}
        {notes.map(n => (
          <div key={n.id} className="note-row">
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {n.text}
            </span>
            <span className={`badge ${n.status}`}>{n.status}</span>
          </div>
        ))}
      </section>
    </main>
  )
}
