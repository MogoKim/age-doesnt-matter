import { NextRequest, NextResponse } from 'next/server'
import { getJobList } from '@/lib/queries/posts'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const region = searchParams.get('region') ?? undefined
  const tagsParam = searchParams.get('tags')
  const tags = tagsParam ? tagsParam.split(',') : undefined
  const cursor = searchParams.get('cursor') ?? undefined
  const limitParam = searchParams.get('limit')
  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 50) : 10

  const result = await getJobList({ region, tags, cursor, limit })
  return NextResponse.json(result)
}
