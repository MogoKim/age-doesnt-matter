import { NextRequest, NextResponse } from 'next/server'
import { getCachedJobsPage, getJobListPage } from '@/lib/queries/posts'
import { handleApiError } from '@/lib/api-utils'
import { checkApiRateLimit } from '@/lib/api-rate-limit'
import type { SearchField } from '@/lib/queries/posts/posts.base'

function parseSearchField(raw: string | null): SearchField {
  if (raw === 'title' || raw === 'content') return raw
  return 'both'
}

export async function GET(request: NextRequest) {
  const rateLimited = await checkApiRateLimit(request, 'jobs', { max: 60 })
  if (rateLimited) return rateLimited

  try {
    const { searchParams } = request.nextUrl
    const region = searchParams.get('region') ?? undefined
    const tagsParam = searchParams.get('tags')
    const tags = tagsParam ? tagsParam.split(',') : undefined
    const q = searchParams.get('q')?.trim() || undefined
    const sf = parseSearchField(searchParams.get('sf'))
    const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1)
    const limit = Math.min(24, Math.max(1, Number.parseInt(searchParams.get('limit') ?? '12', 10) || 12))
    const skip = (page - 1) * limit

    const result = !q && !region && (!tags || tags.length === 0) && page === 1
      ? await getCachedJobsPage()
      : await getJobListPage({ region, tags, skip, limit, q, sf })
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
