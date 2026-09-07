import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
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

  // Data Cache 태그 무효화 — revalidatePath 만으로는 unstable_cache 엔트리가 남는다.
  // 특히 sitemap-posts(revalidate 3600)를 지우지 않으면 SQL/스크립트로 숨긴 글이
  // sitemap 에 계속 남는다(2026-09-06 attack-A 실측: 9시간 넘게 잔존, 수동 퍼지 필요했음).
  const tags = [
    'sitemap-posts',
    'post-detail',
    'post-meta',
    'community-board-page',
    'home-trending',
    'home-stories',
    'home-humor',
    // 일자리 면 — SQL 로 JOB 글을 숨겨도 목록·홈 섹션이 그대로 남던 누락분(2026-09-06)
    'jobs-list',
    'home-jobs',
    // 일자리 상세 — SQL 로 숨긴 공고가 최대 5분 stale 200 으로 남던 누락분(2026-09-07)
    'job-detail',
  ]
  for (const tag of tags) revalidateTag(tag)

  return NextResponse.json({
    total: posts.length,
    invalidated: invalidated.length,
    tags,
    paths: invalidated,
  })
}
