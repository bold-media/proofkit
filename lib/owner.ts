import { cookies } from 'next/headers'

import { ownerSession } from './data'

export const OWNER_COOKIE = 'pk_owner'

// True when the current request carries a valid owner session cookie.
export async function isOwner(): Promise<boolean> {
  const sess = ownerSession()
  if (!sess) return false
  const c = await cookies()
  return c.get(OWNER_COOKIE)?.value === sess
}
