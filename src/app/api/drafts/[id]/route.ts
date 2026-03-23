import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const { id } = await params

  const draft = await prisma.draftPost.findUnique({
    where: { id },
    select: {
      id: true,
      boardSlug: true,
      category: true,
      title: true,
      content: true,
      authorId: true,
      updatedAt: true,
    },
  })

  if (!draft || draft.authorId !== session.user.id) {
    return NextResponse.json({ error: '임시저장을 찾을 수 없습니다' }, { status: 404 })
  }

  return NextResponse.json({
    id: draft.id,
    boardSlug: draft.boardSlug,
    category: draft.category,
    title: draft.title,
    content: draft.content,
    updatedAt: draft.updatedAt,
  })
}
