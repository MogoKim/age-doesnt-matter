import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getCommentsByPostId } from '@/lib/queries/comments'
import { handleApiError } from '@/lib/api-utils'
import { checkApiRateLimit } from '@/lib/api-rate-limit'

export async function GET(request: NextRequest) {
  const rateLimited = await checkApiRateLimit(request, 'comments', { max: 60 })
  if (rateLimited) return rateLimited

  try {
    const { searchParams } = request.nextUrl
    const postId = searchParams.get('postId')
    const sort = (searchParams.get('sort') ?? 'latest') as 'latest' | 'oldest'

    if (!postId) {
      return NextResponse.json({ error: 'postId가 필요합니다' }, { status: 400 })
    }

    const session = await auth()
    const comments = await getCommentsByPostId(postId, session?.user?.id, sort)

    return NextResponse.json({ comments })
  } catch (error) {
    return handleApiError(error)
  }
}
