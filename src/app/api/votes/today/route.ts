import { NextResponse } from 'next/server'
import { getTodayPublic } from '@/lib/votes'

/**
 * 오늘의 투표 **public** 현황 (팝업/HERO 입구용, 사용자 무관).
 * myChoice 없음 → CDN s-maxage 캐시 가능. 내 선택은 /api/votes/today/mine(no-store).
 * 캐시 만료를 20:00(마감)에 맞춤: s-maxage = min(15, 마감까지 초), 마감 후 0 → CLOSED 즉시 반영.
 * 실제 투표 차단은 castVote 서버 재검증(effectiveVoteStatus)이 담당하므로 표시 캐시와 무관하게 안전.
 */
export async function GET() {
  try {
    const result = await getTodayPublic()
    if (!result) {
      return NextResponse.json({ vote: null }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
    }
    const { vote, closeAtMs } = result
    const secsToClose = Math.floor((closeAtMs - Date.now()) / 1000)
    const maxAge = Math.max(0, Math.min(15, secsToClose))
    return NextResponse.json(
      { vote },
      { headers: { 'Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=30` } },
    )
  } catch (e) {
    console.error('[votes/today] 조회 실패:', e)
    return NextResponse.json({ vote: null }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  }
}
