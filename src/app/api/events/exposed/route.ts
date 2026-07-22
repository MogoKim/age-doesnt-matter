import { NextResponse } from 'next/server'
import { getExposedFeedback, type EventChannel } from '@/lib/events/exposure'

// force-dynamic — 노출 window(startAt/endAt) 경계를 읽기 시점에 판정. CDN은 짧게만 캐시.
export const dynamic = 'force-dynamic'

/**
 * 지정 채널에 지금 노출할 **FEEDBACK(의견수렴형) 이벤트** (Phase 3b — 팝업/HERO 입구용).
 *  - `?channel=bottomPopup|hero`
 *  - 노출 대상이 FEEDBACK이면 `{ feedback: { eventId, title, description } }`, 아니면(VOTE·없음) `{ feedback: null }`.
 *  - VOTE와 배타: getExposedEvent가 채널당 1개만 반환 → VOTE 노출 중이면 여기선 null.
 */
export async function GET(req: Request) {
  try {
    const raw = new URL(req.url).searchParams.get('channel')
    const channel: EventChannel | null = raw === 'bottomPopup' || raw === 'hero' ? raw : null
    if (!channel) {
      return NextResponse.json({ feedback: null }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
    }
    const feedback = await getExposedFeedback(channel)
    // 노출 중이면 짧게(15s) 캐시 허용, 없으면 no-store(다음 window 진입 즉시 반영)
    const cache = feedback ? 'public, s-maxage=15, must-revalidate' : 'no-store'
    return NextResponse.json({ feedback }, { status: 200, headers: { 'Cache-Control': cache } })
  } catch (e) {
    console.error('[events/exposed] 조회 실패:', e)
    return NextResponse.json({ feedback: null }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  }
}
