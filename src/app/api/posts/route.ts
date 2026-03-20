import { NextRequest, NextResponse } from 'next/server'
import { getPostsByBoard } from '@/lib/queries/posts'
import type { BoardType } from '@/generated/prisma/client'

const VALID_BOARD_TYPES: BoardType[] = ['JOB', 'STORY', 'HUMOR', 'MAGAZINE', 'WEEKLY']

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const boardType = searchParams.get('boardType') as BoardType | null
  const cursor = searchParams.get('cursor') ?? undefined
  const category = searchParams.get('category') ?? undefined
  const limitParam = searchParams.get('limit')
  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 50) : 20

  if (!boardType || !VALID_BOARD_TYPES.includes(boardType)) {
    return NextResponse.json({ error: 'Invalid boardType' }, { status: 400 })
  }

  const result = await getPostsByBoard(boardType, { category, cursor, limit })
  return NextResponse.json(result)
}
