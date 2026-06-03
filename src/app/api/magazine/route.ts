import { NextRequest, NextResponse } from 'next/server'
import { getCachedMagazinePage, getMagazineListPage } from '@/lib/queries/posts'
import { handleApiError } from '@/lib/api-utils'
import { checkApiRateLimit } from '@/lib/api-rate-limit'
import type { SearchField } from '@/lib/queries/posts/posts.base'

function parseSearchField(raw: string | null): SearchField {
  if (raw === 'title' || raw === 'content') return raw
  return 'both'
}

export async function GET(request: NextRequest) {
  const rateLimited = await checkApiRateLimit(request, 'magazine', { max: 60 })
  if (rateLimited) return rateLimited

  try {
    const { searchParams } = request.nextUrl
    const category = searchParams.get('category') ?? undefined
    const q = searchParams.get('q')?.trim() || undefined
    const sf = parseSearchField(searchParams.get('sf'))
    const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1)
    const limit = Math.min(24, Math.max(1, Number.parseInt(searchParams.get('limit') ?? '12', 10) || 12))
    const skip = (page - 1) * limit

    const result = !q && !category && page === 1
      ? await getCachedMagazinePage()
      : await getMagazineListPage({ category, skip, limit, q, sf })
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
