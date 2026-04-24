import { useEffect, useState } from 'react'

const BANNER_TTL_MS = 6_000  // 6 seconds

/**
 * Transient top-of-app banner. Listens for drive:pending-drained events emitted
 * by src/main/index.ts on app wake (after drainOnLaunch returns > 0 notes).
 * Displays "Pulled N notes from mobile" then fades itself out.
 * MOB-UX-02 — desktop wake grace banner.
 */
export function WakeBanner() {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = window.api.drive.onPendingDrained((n: number) => {
      if (n > 0) {
        setCount(n)
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => setCount(null), BANNER_TTL_MS)
      }
    })
    return () => {
      if (timer) clearTimeout(timer)
      unsubscribe()
    }
  }, [])

  if (count === null) return null

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={() => setCount(null)}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9996,
        background: '#065f46',
        color: '#d1fae5',
        padding: '10px 16px',
        fontSize: 14,
        textAlign: 'center',
        cursor: 'pointer',
        borderBottom: '1px solid #047857',
      }}
    >
      Pulled {count} note{count === 1 ? '' : 's'} from mobile — click to dismiss
    </div>
  )
}
