import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { getPage, listComments, toClientPage } from '@/lib/data'
import { isOwner } from '@/lib/owner'
import Editor from './Editor'

export const dynamic = 'force-dynamic'

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) redirect('/login')
  const { id } = await params
  const page = getPage(id)
  if (!page) notFound()
  const comments = listComments(id)

  return (
    <div className="wrap">
      <div className="topbar">
        <Link href="/" className="brand">
          <span className="brand-dot" />
          Proofkit
        </Link>
      </div>
      <Editor page={toClientPage(page)} initialComments={comments} />
    </div>
  )
}
