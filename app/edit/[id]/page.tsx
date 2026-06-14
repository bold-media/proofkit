import Link from 'next/link'
import { notFound } from 'next/navigation'

import { getPage, listComments } from '@/lib/data'
import Editor from './Editor'

export const dynamic = 'force-dynamic'

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
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
      <Editor page={page} initialComments={comments} />
    </div>
  )
}
