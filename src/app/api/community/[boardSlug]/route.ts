import { NextRequest, NextResponse } from 'next/server'
import { getBoardConfig } from '@/lib/queries/boards'
import { getCachedBoardPage, getPostsByBoardPage } from '@/lib/queries/posts'
import type { SearchField } from '@/lib/queries/posts/posts.base'

const LIMIT_MAX = 24

function parseSearchField(raw: string | null): SearchField {
  if (raw === 'title' || raw === 'content') return raw
  return 'both'
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ boardSlug: string }> },
) {
  const { boardSlug } = await params
  const board = await getBoardConfig(boardSlug)
  if (!board) {
    return NextResponse.json({ error: '게시판을 찾을 수 없어요' }, { status: 404 })
  }

  const searchParams = request.nextUrl.searchParams
  const category = searchParams.get('category') || undefined
  const sort = searchParams.get('sort') === 'likes' ? 'likes' : 'latest'
  const q = searchParams.get('q')?.trim() || undefined
  const sf = parseSearchField(searchParams.get('sf'))
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const limit = Math.min(
    LIMIT_MAX,
    Math.max(1, Number.parseInt(searchParams.get('limit') ?? '12', 10) || 12),
  )
  const skip = (page - 1) * limit

  const result = !q && page === 1
    ? await getCachedBoardPage(board.boardType, category ?? 'all', sort)
    : await getPostsByBoardPage(board.boardType, { category, sort, skip, limit, q, sf })

  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
    },
  })
}
