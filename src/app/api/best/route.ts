import { NextRequest, NextResponse } from 'next/server'
import { getHotPosts, getHallOfFamePosts } from '@/lib/queries/posts'
import { handleApiError, parsePaginationParams } from '@/lib/api-utils'
import { checkApiRateLimit } from '@/lib/api-rate-limit'

export async function GET(request: NextRequest) {
  const rateLimited = await checkApiRateLimit(request, 'best', { max: 60 })
  if (rateLimited) return rateLimited

  try {
    const { searchParams } = request.nextUrl
    const type = searchParams.get('type') ?? 'hot' // hot | fame
    const rawSort = searchParams.get('sort') ?? 'recent'
    const sort: 'recent' | 'likes' = rawSort === 'likes' ? 'likes' : 'recent'
    const { cursor, limit } = parsePaginationParams(searchParams)

    if (type === 'fame') {
      const result = await getHallOfFamePosts({ cursor, limit })
      return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    })
    }

    const result = await getHotPosts({ sort, cursor, limit })
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
