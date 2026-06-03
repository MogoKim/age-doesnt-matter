import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-utils'
import { checkApiRateLimit } from '@/lib/api-rate-limit'

export async function GET(request: NextRequest) {
  const rateLimited = await checkApiRateLimit(request, 'post-state', { max: 120 })
  if (rateLimited) return rateLimited

  try {
    const postId = request.nextUrl.searchParams.get('postId')
    if (!postId) {
      return NextResponse.json({ error: 'postId가 필요합니다' }, { status: 400 })
    }

    const session = await auth()
    const userId = session?.user?.id
    if (!userId) {
      return NextResponse.json(
        { isLoggedIn: false, isLiked: false, isScrapped: false },
        { headers: { 'Cache-Control': 'private, no-store' } },
      )
    }

    const [like, scrap] = await Promise.all([
      prisma.like.findUnique({
        where: { userId_postId: { userId, postId } },
        select: { id: true },
      }),
      prisma.scrap.findUnique({
        where: { userId_postId: { userId, postId } },
        select: { id: true },
      }),
    ])

    return NextResponse.json(
      { isLoggedIn: true, isLiked: !!like, isScrapped: !!scrap },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (error) {
    return handleApiError(error)
  }
}
