declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string
            scope: string
            callback: (response: { access_token?: string; error?: string; expires_in?: number }) => void
          }): TokenClient
        }
      }
    }
  }
}

interface TokenClient {
  requestAccessToken(opts?: { prompt?: '' | 'consent' | 'select_account' }): void
}

const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as string

let _tokenClient: TokenClient | null = null
let _accessToken: string | null = null
let _tokenIssuedAt = 0
const TOKEN_TTL_MS = 55 * 60 * 1000  // 55 min — refresh before 60min expiry

type AuthListener = (token: string | null) => void
const _listeners = new Set<AuthListener>()

export function onAuthChange(listener: AuthListener): () => void {
  _listeners.add(listener)
  return () => _listeners.delete(listener)
}

function setToken(token: string | null) {
  _accessToken = token
  if (token) _tokenIssuedAt = Date.now()
  for (const l of _listeners) l(token)
}

export function initGisClient(): void {
  if (_tokenClient) return
  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google Identity Services not loaded yet — wait for gsi/client script')
  }
  if (!WEB_CLIENT_ID) {
    throw new Error('VITE_GOOGLE_WEB_CLIENT_ID not set at build time')
  }
  _tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: WEB_CLIENT_ID,
    scope: DRIVE_APPDATA_SCOPE,
    callback: (response) => {
      if (response.access_token) setToken(response.access_token)
      else setToken(null)
    },
  })
}

export function hasFreshToken(): boolean {
  return !!_accessToken && (Date.now() - _tokenIssuedAt) < TOKEN_TTL_MS
}

export function getAccessToken(): string | null {
  return hasFreshToken() ? _accessToken : null
}

/** Must be called from a direct user-gesture click handler (iOS Safari popup policy). */
export function requestAuth(prompt: '' | 'consent' = ''): void {
  if (!_tokenClient) initGisClient()
  _tokenClient!.requestAccessToken({ prompt })
}

export function clearToken(): void { setToken(null) }
