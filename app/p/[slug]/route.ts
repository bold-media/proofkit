import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Old links used /p/<slug>; the hosted pages now live at /project/<slug>.
// Redirect so nothing previously shared breaks.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return NextResponse.redirect(new URL(`/project/${slug}`, req.url))
}
