import { OAuth2Client } from 'google-auth-library'
import { drive, drive_v3 } from '@googleapis/drive'
import { getRefreshToken, storeRefreshToken } from '../calendar/tokenStore'
import { startOAuthFlow, CALENDAR_SCOPE, DRIVE_APPDATA_SCOPE } from '../calendar/oauthFlow'

/**
 * Builds an authorized @googleapis/drive v3 client using the SAME refresh token
 * store as Phase 11's calendar client. This works because the Phase 12 incremental
 * consent flow (connectDrive below) adds drive.appdata to the existing Calendar grant.
 *
 * Throws if no refresh token is stored. Caller must check isConnected() first or
 * trigger connectDrive() which runs the combined-scope OAuth.
 */
export function buildDriveClient(): drive_v3.Drive {
  const refreshToken = getRefreshToken()
  if (!refreshToken) {
    throw new Error('No Google refresh token — user must connect first (Settings > Integrations)')
  }
  const auth = new OAuth2Client({
    clientId: __GOOGLE_CLIENT_ID__,
    clientSecret: __GOOGLE_CLIENT_SECRET__,
  })
  auth.setCredentials({ refresh_token: refreshToken })
  return drive({ version: 'v3', auth })
}

/**
 * Trigger the combined-scope OAuth flow. If the user previously connected to
 * Calendar only, this prompt adds drive.appdata to the existing grant via
 * include_granted_scopes:true. After success, the stored refresh token covers
 * BOTH scopes — no separate Drive-only token exists.
 */
export async function connectDrive(): Promise<{ ok: boolean; error?: string }> {
  try {
    const tokens = await startOAuthFlow([CALENDAR_SCOPE, DRIVE_APPDATA_SCOPE])
    if (tokens.refresh_token) storeRefreshToken(tokens.refresh_token)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
