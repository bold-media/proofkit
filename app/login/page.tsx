import { redirect } from 'next/navigation'

import { ownerConfigured } from '@/lib/data'
import { isOwner } from '@/lib/owner'
import LoginForm from './LoginForm'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  if (await isOwner()) redirect('/')
  const configured = ownerConfigured()

  return (
    <div className="wrap" style={{ maxWidth: 400 }}>
      <div className="topbar">
        <div className="brand">
          <span className="brand-dot" />
          Proofkit
        </div>
      </div>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>{configured ? 'Log in' : 'Set your password'}</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          {configured
            ? 'Enter your password to manage your projects.'
            : 'Create a password to protect your dashboard. Only you will be able to see your projects.'}
        </p>
        <LoginForm configured={configured} />
      </div>
    </div>
  )
}
