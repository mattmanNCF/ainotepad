import { OAuth2Client } from 'google-auth-library'
import { calendar, calendar_v3 } from '@googleapis/calendar'
import { getRefreshToken } from './tokenStore'

/**
 * Builds an authorized @googleapis/calendar v3 client using the stored
 * refresh token. The OAuth2Client auto-refreshes access tokens on 401.
 * Throws if no refresh token is stored — caller should check isConnected() first.
 */
export function buildCalendarClient(): calendar_v3.Calendar {
  const refreshToken = getRefreshToken()
  if (!refreshToken) {
    throw new Error('No Google refresh token stored — user must connect in Settings > Integrations first')
  }
  const auth = new OAuth2Client({
    clientId: __GOOGLE_CLIENT_ID__,
    clientSecret: __GOOGLE_CLIENT_SECRET__,
  })
  auth.setCredentials({ refresh_token: refreshToken })
  return calendar({ version: 'v3', auth })
}
