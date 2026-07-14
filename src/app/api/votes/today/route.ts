import { NextResponse } from 'next/server'
import { getTodayPublic } from '@/lib/votes'

/**
 * 오늘의 투표 **public** 현황 (팝업/HERO 입구용, 사용자 무관).
 * myChoice 없음 → CDN 캐시 가능. 내 선택은 /api/votes/today/mine(no-store).
 *
 * 20:00(마감) 경계 안전 — 캐시된 응답이 20:00을 절대 넘기지 않게:
 *  · 마감 60초 이내(또는 이미 마감): no-store (경계에서 stale OPEN 표시 원천 차단)
 *  · 그 밖: s-maxage=min(15, 마감까지초-60) + must-revalidate (stale-while-revalidate 미사용)
 * → 어떤 캐시 응답도 (20:00 - 60s)를 넘겨 재사용되지 않는다. castVote 서버 재검증은 그대로 유지.
 */
// route 파일에서는 GET/POST 등 예약 export만 허용되므로 비-export 내부 함수로 둔다
function todayCacheControl(secsToClose: number): string {
  if (secsToClose <= 60) return 'no-store'
  return `public, s-maxage=${Math.min(15, secsToClose - 60)}, must-revalidate`
}

export async function GET() {
  try {
    const result = await getTodayPublic()
    if (!result) {
      return NextResponse.json({ vote: null }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
    }
    const { vote, closeAtMs } = result
    const secsToClose = Math.floor((closeAtMs - Date.now()) / 1000)
    return NextResponse.json(
      { vote },
      { headers: { 'Cache-Control': todayCacheControl(secsToClose) } },
    )
  } catch (e) {
    console.error('[votes/today] 조회 실패:', e)
    return NextResponse.json({ vote: null }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  }
}
