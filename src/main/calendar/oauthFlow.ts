import { createServer, IncomingMessage, ServerResponse, Server } from 'http'
import { AddressInfo } from 'net'
import { shell } from 'electron'
import { OAuth2Client, CodeChallengeMethod } from 'google-auth-library'

const AUTH_TIMEOUT_MS = 5 * 60 * 1000 // 5-minute user timeout
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'

export interface OAuthTokens {
  access_token: string
  refresh_token: string
  expiry_date: number | null
}

/**
 * Runs the full OAuth2 loopback+PKCE flow:
 *   1. Spin up an ephemeral HTTP server on 127.0.0.1:<random>
 *   2. Open the Google consent URL in the user's default browser
 *   3. Await the redirect with ?code=...
 *   4. Exchange the code (+ code_verifier) for tokens
 *   5. Shut down the loopback server
 *
 * MUST use 127.0.0.1 (not the unresolved hostname) per CAL-SEC-03 and RESEARCH Pitfall 2.
 * Requires __GOOGLE_CLIENT_ID__ and __GOOGLE_CLIENT_SECRET__ to be non-empty
 * (Plan 11-01 injects these via electron-vite define from .env.local).
 */
export async function startOAuthFlow(): Promise<OAuthTokens> {
  if (!__GOOGLE_CLIENT_ID__ || !__GOOGLE_CLIENT_SECRET__) {
    throw new Error(
      'Google OAuth credentials not injected at build time. ' +
      'Populate .env.local with GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then rebuild.'
    )
  }

  return new Promise<OAuthTokens>((resolve, reject) => {
    const server: Server = createServer()
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try { server.close() } catch { /* ignore */ }
      reject(new Error('OAuth timeout — user did not complete consent within 5 minutes'))
    }, AUTH_TIMEOUT_MS)

    server.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })

    // Bind 127.0.0.1 explicitly — IPv6 resolution differs on Windows (RESEARCH Pitfall 2).
    // Port 0 = OS picks a free ephemeral port (CAL-SEC-03 non-deterministic port requirement).
    server.listen(0, '127.0.0.1', async () => {
      try {
        const addr = server.address() as AddressInfo
        const port = addr.port
        const redirectUri = `http://127.0.0.1:${port}`

        const oAuth2Client = new OAuth2Client({
          clientId: __GOOGLE_CLIENT_ID__,
          clientSecret: __GOOGLE_CLIENT_SECRET__,
          redirectUri,
        })
        const { codeVerifier, codeChallenge } = await oAuth2Client.generateCodeVerifierAsync()

        const authUrl = oAuth2Client.generateAuthUrl({
          access_type: 'offline',
          scope: [CALENDAR_SCOPE],
          code_challenge: codeChallenge,
          code_challenge_method: CodeChallengeMethod.S256,
          prompt: 'consent', // force refresh_token on every grant (avoids "no refresh_token on second connect")
        })

        server.on('request', async (req: IncomingMessage, res: ServerResponse) => {
          try {
            const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
            const code = url.searchParams.get('code')
            const errParam = url.searchParams.get('error')

            if (errParam) {
              res.statusCode = 400
              res.end(`<html><body>OAuth error: ${errParam}. You can close this tab.</body></html>`)
              if (!settled) {
                settled = true
                clearTimeout(timer)
                try { server.close() } catch { /* ignore */ }
                reject(new Error(`OAuth declined: ${errParam}`))
              }
              return
            }

            if (!code) {
              res.statusCode = 400
              res.end('Missing code')
              return
            }

            res.statusCode = 200
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.end(
              '<html><body style="font-family:sans-serif;padding:2rem;">' +
              '<h2>Notal — Calendar connected</h2>' +
              '<p>You can close this tab and return to Notal.</p>' +
              '</body></html>'
            )

            // Exchange code + verifier for tokens
            const { tokens } = await oAuth2Client.getToken({ code, codeVerifier })

            try { server.close() } catch { /* ignore */ }
            if (settled) return
            settled = true
            clearTimeout(timer)

            if (!tokens.refresh_token) {
              reject(new Error('Google did not return a refresh_token — try disconnecting at myaccount.google.com/permissions and reconnecting'))
              return
            }
            resolve({
              access_token: tokens.access_token ?? '',
              refresh_token: tokens.refresh_token,
              expiry_date: tokens.expiry_date ?? null,
            })
          } catch (err) {
            if (!settled) {
              settled = true
              clearTimeout(timer)
              try { server.close() } catch { /* ignore */ }
              reject(err instanceof Error ? err : new Error(String(err)))
            }
          }
        })

        // Open the system browser on the auth URL — renderer stays sandboxed.
        await shell.openExternal(authUrl)
      } catch (err) {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          try { server.close() } catch { /* ignore */ }
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      }
    })
  })
}

/**
 * Revokes the user's grant via Google's revocation endpoint. Per CAL-UX-02
 * `disconnect+revoke works end-to-end` ship criterion.
 */
export async function revokeToken(token: string): Promise<void> {
  if (!token) return
  const body = `token=${encodeURIComponent(token)}`
  const res = await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  // Google returns 200 on success, 400 if token already expired/invalid — both are fine for disconnect
  if (!res.ok && res.status !== 400) {
    throw new Error(`Token revocation failed: HTTP ${res.status}`)
  }
}
