import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { castVote, getVoteIdentity, getVoteStatusById } from '@/lib/votes'

export const dynamic = 'force-dynamic'

// 특정 투표 현황 (지난 투표 게시글에서 결과 열람용)
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    const [session, identity] = await Promise.all([auth(), getVoteIdentity()])
    const payload = await getVoteStatusById(id, session?.user?.id ?? null, identity)
    return NextResponse.json({ vote: payload }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[votes/id] 조회 실패:', e)
    return NextResponse.json({ vote: null }, { status: 200 })
  }
}

// 투표하기 / 선택 변경 (OPEN 상태에서만) — 회원=세션, 비회원=쿠키+IP 해시
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  let choice: unknown
  try {
    const body = await req.json()
    choice = body?.choice
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 })
  }
  if (choice !== 'A' && choice !== 'B') {
    return NextResponse.json({ error: '선택지가 올바르지 않습니다' }, { status: 400 })
  }

  try {
    const [session, identity] = await Promise.all([auth(), getVoteIdentity()])
    const result = await castVote(id, choice, session?.user?.id ?? null, identity)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 })
    }
    return NextResponse.json({ vote: result.payload }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[votes/cast] 실패:', e)
    return NextResponse.json({ error: '잠시 후 다시 시도해 주세요' }, { status: 500 })
  }
}
