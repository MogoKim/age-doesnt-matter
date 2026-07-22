import { NextResponse } from 'next/server'
import { getExposedFeedback, getExposedSurvey, type EventChannel } from '@/lib/events/exposure'

// force-dynamic — 노출 window(startAt/endAt) 경계를 읽기 시점에 판정. CDN은 짧게만 캐시.
export const dynamic = 'force-dynamic'

/**
 * 지정 채널에 지금 노출할 **비-VOTE 이벤트**(FEEDBACK 또는 SURVEY) — 팝업/HERO 입구용.
 *  - `?channel=bottomPopup|hero`
 *  - `{ feedback: {…}|null, survey: {…}|null }` (getExposedEvent 채널당 1개라 둘 중 최대 1개만 non-null).
 *  - VOTE 노출 중이면 둘 다 null(VOTE 우선·배타).  ⚠️ feedback 키 유지 → 기존 FeedbackPopup 무변경.
 */
export async function GET(req: Request) {
  try {
    const raw = new URL(req.url).searchParams.get('channel')
    const channel: EventChannel | null = raw === 'bottomPopup' || raw === 'hero' ? raw : null
    if (!channel) {
      return NextResponse.json({ feedback: null, survey: null }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
    }
    const [feedback, survey] = await Promise.all([getExposedFeedback(channel), getExposedSurvey(channel)])
    // 노출 중이면 짧게(15s) 캐시 허용, 없으면 no-store(다음 window 진입 즉시 반영)
    const cache = feedback || survey ? 'public, s-maxage=15, must-revalidate' : 'no-store'
    return NextResponse.json({ feedback, survey }, { status: 200, headers: { 'Cache-Control': cache } })
  } catch (e) {
    console.error('[events/exposed] 조회 실패:', e)
    return NextResponse.json({ feedback: null, survey: null }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  }
}
