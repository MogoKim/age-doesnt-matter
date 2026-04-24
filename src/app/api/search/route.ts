import { NextRequest, NextResponse } from 'next/server'
import { searchAll, type SearchTab } from '@/lib/queries/search'
import { rateLimit } from '@/lib/rate-limit'

const VALID_TABS: SearchTab[] = ['all', 'jobs', 'posts', 'magazine']

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const query = searchParams.get('q')?.trim()
  const tab = (searchParams.get('tab') ?? 'all') as SearchTab

  // Rate limit: IP 기반 30회/분
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const rl = rateLimit(`search:${ip}`, { max: 30, windowMs: 60_000 })
  if (!rl.success) {
    return NextResponse.json({ error: '검색 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.' }, { status: 429 })
  }

  if (!query || query.length < 2) {
    return NextResponse.json({ error: '검색어를 2자 이상 입력해 주세요' }, { status: 400 })
  }

  if (!VALID_TABS.includes(tab)) {
    return NextResponse.json({ error: '올바르지 않은 탭입니다' }, { status: 400 })
  }

  const result = await searchAll(query, { tab })
  return NextResponse.json(result)
}
