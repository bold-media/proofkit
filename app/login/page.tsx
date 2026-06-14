import { redirect } from 'next/navigation'

import { ownerConfigured } from '@/lib/data'
import { isOwner } from '@/lib/owner'
import LoginForm from './LoginForm'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  if (await isOwner()) redirect('/')
  const configured = ownerConfigured()

  return (
    <div className="auth-screen">
      <div className="auth-box">
        <div className="auth-brand">
          <span className="auth-mark" aria-hidden>
            <span className="auth-pin" />
          </span>
          Proofkit
        </div>
        <p className="auth-tagline">Share designs, collect pinned client feedback.</p>

        <div className="auth-card">
          <h1 style={{ marginTop: 0 }}>{configured ? 'Welcome back' : 'Set your password'}</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            {configured
              ? 'Enter your password to manage your projects.'
              : 'Create a password to protect your dashboard. Only you will be able to see your projects.'}
          </p>
          <LoginForm configured={configured} />
        </div>

        <p className="auth-foot">Clients never need an account — they just open the link you share.</p>
      </div>
    </div>
  )
}
