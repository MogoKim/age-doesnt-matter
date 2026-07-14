import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getTodayMyChoice, getVoteIdentity } from '@/lib/votes'

/**
 * 오늘 투표의 **내 선택**만 — 사용자별(쿠키/회원). 절대 캐시 금지.
 * 팝업이 public(캐시)과 병렬로 받아 노출 여부(myChoice null) 판정.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const [session, identity] = await Promise.all([auth(), getVoteIdentity()])
    const myChoice = await getTodayMyChoice(session?.user?.id ?? null, identity)
    return NextResponse.json({ myChoice }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[votes/today/mine] 조회 실패:', e)
    return NextResponse.json({ myChoice: null }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  }
}
