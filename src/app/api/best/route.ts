import { NextRequest, NextResponse } from 'next/server'
import { composeBestHot, composeBestFame } from '@/lib/queries/posts/posts.best-compose'
import { handleApiError, parsePaginationParams } from '@/lib/api-utils'
import { checkApiRateLimit } from '@/lib/api-rate-limit'

export async function GET(request: NextRequest) {
  const rateLimited = await checkApiRateLimit(request, 'best', { max: 60 })
  if (rateLimited) return rateLimited

  try {
    const { searchParams } = request.nextUrl
    const type = searchParams.get('type') ?? 'hot' // hot | fame
    const { limit } = parsePaginationParams(searchParams)
    const skip = parseInt(searchParams.get('skip') ?? '0', 10) || 0
    const q = searchParams.get('q')?.trim() || undefined
    const sfParam = searchParams.get('sf')
    const sf = sfParam === 'both' || sfParam === 'content' ? sfParam : 'title'

    if (type === 'fame') {
      const result = await composeBestFame({ skip, limit, q, sf })
      return NextResponse.json(result, {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
      })
    }

    // type=hot: 영구 누적 인기글 (hotPromotedAt IS NOT NULL) + 어드민 큐레이션, offset pagination
    const result = await composeBestHot({ skip, limit, q, sf })
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
