import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'

const BOARD_PATHS: Record<string, string> = {
  STORY: '/community/stories',
  HUMOR: '/community/humor',
  LIFE2: '/community/life2',
  MAGAZINE: '/magazine',
  JOB: '/jobs',
  WEEKLY: '/community/weekly',
}

// DELETED/HIDDEN 글 전체 캐시 강제 무효화
export async function POST(req: Request) {
  const secret = req.headers.get('x-admin-secret')
  if (secret !== process.env.AUTH_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const posts = await prisma.post.findMany({
    where: { status: { in: ['DELETED', 'HIDDEN'] } },
    select: { id: true, boardType: true, status: true },
  })

  const invalidated: string[] = []
  for (const post of posts) {
    const bp = BOARD_PATHS[post.boardType]
    if (bp) {
      revalidatePath(`${bp}/${post.id}`)
      invalidated.push(`${bp}/${post.id}`)
    }
  }

  revalidatePath('/')
  revalidatePath('/best')
  revalidatePath('/search')

  return NextResponse.json({
    total: posts.length,
    invalidated: invalidated.length,
    paths: invalidated,
  })
}
