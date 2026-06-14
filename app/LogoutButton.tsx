'use client'

import { useRouter } from 'next/navigation'

export default function LogoutButton() {
  const router = useRouter()
  async function logout() {
    await fetch('/api/owner/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }
  return (
    <button className="btn ghost" onClick={logout} style={{ padding: '6px 12px' }}>
      Log out
    </button>
  )
}
