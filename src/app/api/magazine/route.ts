import { NextRequest, NextResponse } from 'next/server'
import { getMagazineList } from '@/lib/queries/posts'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const category = searchParams.get('category') ?? undefined
  const cursor = searchParams.get('cursor') ?? undefined
  const limitParam = searchParams.get('limit')
  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 50) : 10

  const result = await getMagazineList({ category, cursor, limit })
  return NextResponse.json(result)
}
