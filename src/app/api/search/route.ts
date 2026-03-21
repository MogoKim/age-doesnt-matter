import { NextRequest, NextResponse } from 'next/server'
import { searchAll, type SearchTab } from '@/lib/queries/search'

const VALID_TABS: SearchTab[] = ['all', 'jobs', 'posts', 'magazine']

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const query = searchParams.get('q')?.trim()
  const tab = (searchParams.get('tab') ?? 'all') as SearchTab

  if (!query || query.length < 2) {
    return NextResponse.json({ error: '검색어를 2자 이상 입력해 주세요' }, { status: 400 })
  }

  if (!VALID_TABS.includes(tab)) {
    return NextResponse.json({ error: '올바르지 않은 탭입니다' }, { status: 400 })
  }

  const result = await searchAll(query, { tab })
  return NextResponse.json(result)
}
