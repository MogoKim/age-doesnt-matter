import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { composeBestHot, composeBestFame } from '@/lib/queries/posts/posts.best-compose'
import { handleApiError, parsePaginationParams } from '@/lib/api-utils'
import { checkApiRateLimit } from '@/lib/api-rate-limit'

// cold MISS 완화: 검색(q) 없는 기본 목록·더보기 응답을 origin 반복 호출 없이 캐시.
// admin 큐레이션 변경 시 revalidateTag('best-hot'|'best-fame')로 무효화(admin.home-curation.ts).
// 응답 shape은 composeBest* 반환 그대로 — 변경 없음.
const cachedBestHot = unstable_cache(
  async (skip: number, limit: number) => composeBestHot({ skip, limit }),
  ['api-best-hot'],
  { revalidate: 60, tags: ['best-hot', 'home-curation'] },
)
const cachedBestFame = unstable_cache(
  async (skip: number, limit: number) => composeBestFame({ skip, limit }),
  ['api-best-fame'],
  { revalidate: 60, tags: ['best-fame', 'home-curation'] },
)

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
      // 검색은 키 폭증·큐레이션 미적용이라 캐시 제외(직접 호출), 기본/더보기만 캐시
      const result = q ? await composeBestFame({ skip, limit, q, sf }) : await cachedBestFame(skip, limit)
      return NextResponse.json(result, {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
      })
    }

    // type=hot: 영구 누적 인기글 (hotPromotedAt IS NOT NULL) + 어드민 큐레이션, offset pagination
    const result = q ? await composeBestHot({ skip, limit, q, sf }) : await cachedBestHot(skip, limit)
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
