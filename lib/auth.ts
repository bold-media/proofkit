// Single-user password auth. Set PROOFKIT_PASSWORD in the environment to enable;
// if it's unset, the app stays open (so you can't lock yourself out before configuring).
export const AUTH_COOKIE = 'pk_auth'

// The cookie holds a hash of the password (not the password itself).
export async function authToken(password: string): Promise<string> {
  const data = new TextEncoder().encode('proofkit:' + password)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
