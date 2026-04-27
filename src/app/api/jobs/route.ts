import { NextRequest, NextResponse } from 'next/server'
import { getJobList } from '@/lib/queries/posts'
import { handleApiError, parsePaginationParams } from '@/lib/api-utils'
import { checkApiRateLimit } from '@/lib/api-rate-limit'

export async function GET(request: NextRequest) {
  const rateLimited = await checkApiRateLimit(request, 'jobs', { max: 60 })
  if (rateLimited) return rateLimited

  try {
    const { searchParams } = request.nextUrl
    const region = searchParams.get('region') ?? undefined
    const tagsParam = searchParams.get('tags')
    const tags = tagsParam ? tagsParam.split(',') : undefined
    const { cursor, limit } = parsePaginationParams(searchParams)

    const result = await getJobList({ region, tags, cursor, limit })
    return NextResponse.json(result)
  } catch (error) {
    return handleApiError(error)
  }
}
