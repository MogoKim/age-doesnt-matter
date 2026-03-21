import { NextRequest, NextResponse } from 'next/server'
import { getHotPosts, getHallOfFamePosts } from '@/lib/queries/posts'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const type = searchParams.get('type') ?? 'hot' // hot | fame
  const sort = (searchParams.get('sort') ?? 'recent') as 'recent' | 'likes'
  const cursor = searchParams.get('cursor') ?? undefined
  const limitParam = searchParams.get('limit')
  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 50) : 10

  if (type === 'fame') {
    const result = await getHallOfFamePosts({ cursor, limit })
    return NextResponse.json(result)
  }

  const result = await getHotPosts({ sort, cursor, limit })
  return NextResponse.json(result)
}
