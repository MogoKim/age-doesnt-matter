import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getDraftSummariesByUserId } from '@/lib/queries/drafts'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const drafts = await getDraftSummariesByUserId(session.user.id)

  return NextResponse.json(
    {
      drafts: drafts.map((draft) => ({
        id: draft.id,
        boardSlug: draft.boardSlug,
        category: draft.category,
        title: draft.title,
        updatedAt: draft.updatedAt.toISOString(),
      })),
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
