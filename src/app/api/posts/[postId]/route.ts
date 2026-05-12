import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getPostDetail } from '@/lib/queries/posts'
import { handleApiError } from '@/lib/api-utils'
import { checkApiRateLimit } from '@/lib/api-rate-limit'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  try {
    const rl = await checkApiRateLimit(request, 'post-detail', { max: 100, windowMs: 60_000 })
    if (rl) return rl
    const { postId } = await params
    const [session, post] = await Promise.all([auth(), getPostDetail(postId)])

    if (!post) {
      return NextResponse.json({ error: '게시글을 찾을 수 없습니다' }, { status: 404 })
    }

    const userId = session?.user?.id
    const [isLiked, isScrapped] = userId
      ? await Promise.all([
          prisma.like.findUnique({ where: { userId_postId: { userId, postId: post.id } }, select: { id: true } }).then(r => !!r),
          prisma.scrap.findUnique({ where: { userId_postId: { userId, postId: post.id } }, select: { id: true } }).then(r => !!r),
        ])
      : [false, false]

    return NextResponse.json(
      { ...post, isLiked, isScrapped },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (error) {
    return handleApiError(error)
  }
}
