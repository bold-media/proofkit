import { cookies } from 'next/headers'

import { getClientBySession, type Client } from './data'

export const CLIENT_COOKIE = 'pk_client'

// The client account for the current request, if logged in (separate from the
// owner session, so both can coexist).
export async function currentClient(): Promise<Client | null> {
  const c = await cookies()
  const token = c.get(CLIENT_COOKIE)?.value
  if (!token) return null
  return getClientBySession(token) || null
}
