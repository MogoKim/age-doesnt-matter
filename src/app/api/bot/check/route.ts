import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateBot } from '@/lib/bot-auth'

/** GET /api/bot/check — 중복 체크 (title + company) */
export async function GET(req: NextRequest) {
  const auth = authenticateBot(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const title = searchParams.get('title')
  const company = searchParams.get('company')

  if (!title) {
    return NextResponse.json({ error: 'title 필수' }, { status: 400 })
  }

  // 일자리: title + company 조합으로 중복 체크
  if (company) {
    const existing = await prisma.post.findFirst({
      where: {
        title,
        boardType: 'JOB',
        status: { in: ['PUBLISHED', 'HIDDEN'] },
        jobDetail: { company },
      },
      select: { id: true },
    })
    return NextResponse.json({ exists: !!existing, postId: existing?.id ?? null })
  }

  // 일반 글: title로만 체크
  const existing = await prisma.post.findFirst({
    where: {
      title,
      status: { in: ['PUBLISHED', 'HIDDEN'] },
    },
    select: { id: true },
  })

  return NextResponse.json({ exists: !!existing, postId: existing?.id ?? null })
}
