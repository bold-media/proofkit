import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { getPage, listApprovals, listComments, listVersions, toClientPage } from '@/lib/data'
import { isOwner } from '@/lib/owner'
import Editor from './Editor'

export const dynamic = 'force-dynamic'

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) redirect('/login')
  const { id } = await params
  const page = getPage(id)
  if (!page) notFound()
  const comments = listComments(id)
  const approvals = listApprovals(id)
  const versions = listVersions(id)

  return (
    <div className="wrap">
      <div className="topbar">
        <Link href="/" className="brand">
          <span className="brand-dot" />
          Proofkit
        </Link>
      </div>
      <Editor
        page={toClientPage(page)}
        initialComments={comments}
        approvals={approvals}
        versions={versions}
        currentVersion={page.current_version}
      />
    </div>
  )
}
