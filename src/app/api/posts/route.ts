import { NextRequest, NextResponse } from 'next/server'
import { getPostsByBoard } from '@/lib/queries/posts'
import { handleApiError, parsePaginationParams } from '@/lib/api-utils'
import { checkApiRateLimit } from '@/lib/api-rate-limit'
import type { BoardType } from '@/generated/prisma/client'

const VALID_BOARD_TYPES: BoardType[] = ['JOB', 'STORY', 'HUMOR', 'MAGAZINE', 'WEEKLY', 'LIFE2']

export async function GET(request: NextRequest) {
  const rateLimited = await checkApiRateLimit(request, 'posts', { max: 60 })
  if (rateLimited) return rateLimited

  try {
    const { searchParams } = request.nextUrl
    const boardType = searchParams.get('boardType') as BoardType | null
    const { cursor, limit } = parsePaginationParams(searchParams, { defaultLimit: 20 })
    const category = searchParams.get('category') ?? undefined
    const q = searchParams.get('q') ?? undefined
    const rawSf = searchParams.get('sf')
    const sf = rawSf === 'title' || rawSf === 'content' ? rawSf : 'both'

    if (!boardType || !VALID_BOARD_TYPES.includes(boardType)) {
      return NextResponse.json({ error: 'Invalid boardType' }, { status: 400 })
    }

    const result = await getPostsByBoard(boardType, { category, cursor, limit, q, sf })
    return NextResponse.json(result)
  } catch (error) {
    return handleApiError(error)
  }
}
