import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getAdminSession } from '@/lib/admin-auth'
// BoardType → 경로 (SSoT: board-registry — 구 로컬 중복 정의 제거)
import { BOARD_URL_PREFIX as BOARD_PATHS } from '@/lib/board-registry'

// DELETED/HIDDEN 글 전체 캐시 강제 무효화
export async function POST() {
  const session = await getAdminSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const posts = await prisma.post.findMany({
    where: { status: { in: ['DELETED', 'HIDDEN'] } },
    select: { id: true, boardType: true, slug: true, status: true },
  })

  const invalidated: string[] = []
  const boardPaths = new Set<string>()
  for (const post of posts) {
    const bp = BOARD_PATHS[post.boardType]
    if (bp) {
      boardPaths.add(bp)
      revalidatePath(`${bp}/${post.id}`)
      invalidated.push(`${bp}/${post.id}`)
      if (post.slug && post.slug !== post.id) {
        revalidatePath(`${bp}/${post.slug}`)
        invalidated.push(`${bp}/${post.slug}`)
      }
    }
  }

  for (const bp of boardPaths) {
    revalidatePath(bp)
    invalidated.push(bp)
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
