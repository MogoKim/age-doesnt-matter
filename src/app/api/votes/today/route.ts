import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getTodayVoteStatus, getVoteIdentity } from '@/lib/votes'

// 오늘의 투표 현황 — 실시간 % 공개용. 캐시 금지 (ISR 페이지 위에서 클라 fetch로 사용)
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const [session, identity] = await Promise.all([auth(), getVoteIdentity()])
    const payload = await getTodayVoteStatus(session?.user?.id ?? null, identity)
    return NextResponse.json(
      { vote: payload },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    console.error('[votes/today] 조회 실패:', e)
    return NextResponse.json({ vote: null }, { status: 200 })
  }
}
