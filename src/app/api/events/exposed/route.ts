import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getExposedFeedback, getExposedSurvey, type EventChannel } from '@/lib/events/exposure'

// force-dynamic — 노출 window(startAt/endAt) 경계 + 로그인 여부(audience)를 읽기 시점에 판정.
export const dynamic = 'force-dynamic'

/**
 * 지정 채널에 지금 노출할 **비-VOTE 이벤트**(FEEDBACK 또는 SURVEY) — 팝업/HERO 입구용.
 *  - `?channel=bottomPopup|hero`
 *  - `{ feedback: {…}|null, survey: {…}|null }` (getExposedEvent 채널당 1개라 둘 중 최대 1개만 non-null).
 *  - VOTE 노출 중이면 둘 다 null(VOTE 우선·배타).  ⚠️ feedback 키 유지 → 기존 FeedbackPopup 무변경.
 *  - **SURVEY는 로그인 여부(viewer)로 audience 분리**: 비회원=GUEST/ALL, 회원=MEMBER/ALL 설문만.
 *    → 세션별 응답이 달라 **CDN 캐시 금지(no-store)**. 회원 응답이 비회원에게 새는 것 차단.
 */
export async function GET(req: Request) {
  try {
    const raw = new URL(req.url).searchParams.get('channel')
    const channel: EventChannel | null = raw === 'bottomPopup' || raw === 'hero' ? raw : null
    if (!channel) {
      return NextResponse.json({ feedback: null, survey: null }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
    }
    const viewer = (await auth())?.user?.id ? 'member' : 'guest'
    const [feedback, survey] = await Promise.all([getExposedFeedback(channel), getExposedSurvey(channel, viewer)])
    // audience(로그인 여부)로 응답이 갈리므로 CDN 캐시 금지 — 회원/비회원 섞임 방지
    return NextResponse.json({ feedback, survey }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[events/exposed] 조회 실패:', e)
    return NextResponse.json({ feedback: null, survey: null }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  }
}
