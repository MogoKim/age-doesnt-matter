import { NextRequest, NextResponse } from 'next/server'
import { getMagazineList } from '@/lib/queries/posts'
import { handleApiError, parsePaginationParams } from '@/lib/api-utils'
import { checkApiRateLimit } from '@/lib/api-rate-limit'

export async function GET(request: NextRequest) {
  const rateLimited = await checkApiRateLimit(request, 'magazine', { max: 60 })
  if (rateLimited) return rateLimited

  try {
    const { searchParams } = request.nextUrl
    const category = searchParams.get('category') ?? undefined
    const { cursor, limit } = parsePaginationParams(searchParams)

    const result = await getMagazineList({ category, cursor, limit })
    return NextResponse.json(result)
  } catch (error) {
    return handleApiError(error)
  }
}
