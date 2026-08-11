import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { checkApiRateLimit } from '@/lib/api-rate-limit'
import { BOT_UA_PATTERN } from '@/lib/bot-patterns'
import { resolveEventSessionId } from '@/lib/anon-cid'

interface EventPayload {
  eventName: string
  path?: string
  referrer?: string
  properties?: Record<string, unknown>
}

// AWS ap-northeast-2 대역 + 구버전 CriOS(≤125) 조합 → AWS 크롤링 봇 (실사용자 UA 아님)
const AWS_KR_PREFIXES = ['15.165.', '15.164.', '3.35.', '3.36.', '3.39.', '13.124.', '13.125.', '54.180.']
const OLD_CRIOS = /CriOS\/(1[0-1]\d|12[0-5])\./  // CriOS/125 이하

function detectBot(userAgent: string | null, headers: Headers, ip: string | null): { isBot: boolean; botType: string | null } {
  const xBotType = headers.get('x-bot-type')
  if (xBotType) return { isBot: true, botType: xBotType }
  if (!userAgent) return { isBot: true, botType: 'no-ua' }
  if (ip && AWS_KR_PREFIXES.some(p => ip.startsWith(p)) && OLD_CRIOS.test(userAgent)) {
    return { isBot: true, botType: 'aws-crawl-bot' }
  }
  if (BOT_UA_PATTERN.test(userAgent)) return { isBot: true, botType: 'external-bot' }
  return { isBot: false, botType: null }
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as EventPayload

  if (!body.eventName || body.eventName.length > 100) {
    return NextResponse.json({ error: 'Invalid eventName' }, { status: 400 })
  }

  // 전환 이벤트(가입 funnel)는 rate limit 면제 — page_view 등과 버킷(event:ip) 공유로 인한 429 유실 방지
  // 전환 + 측정 필수 이벤트는 rate limit 면제 — page_view와 버킷(event:ip) 공유로 인한 429 유실 방지
  // (identity_banner_view·related_post_click: 락인 효과 측정용, 비회원 글뷰마다 발생 → 면제 필요)
  // (exp1_exposure: A/B 실험 노출=분모. 글뷰마다 발생, 429 유실 시 3화면/D1 비율 왜곡 → 면제 필수)
  // (signup_banner_*: 가입 배너 퍼널. 세션당 소수 발생이나 page_view와 버킷 공유 시 429 유실 → EventLog 단독 퍼널 보존 위해 면제)
  // (related_recommend_view: 추천 v2 노출=분모. 글뷰마다 발생, 유실 시 추천 효과 측정 왜곡 → 면제 필수)
  // (top_promo_*: 최상단 띠배너 퍼널. 랜딩마다 shown 발생 → page_view 버킷 공유 시 429 유실 방지. signup_banner_* 와 별개 계열)
  // (android_conversion_prompt_*: Android 외부 브라우저 비회원 A/B 실험의 노출=분모·클릭·닫기.
  //  signup_banner_* 와 같은 시점에 발생하므로 같이 면제하지 않으면 429로 조용히 유실돼 실험 분모가 오염된다)
  // (inapp_redirect_*: 인앱→외부브라우저 유도 퍼널. signup_banner_clicked와 같은 클릭에서 함께 발생하므로
  //  같이 면제하지 않으면 page_view 버킷 공유로 429 유실 → attempted만 빠지고 opened만 남는 식으로 퍼널이 깨진다)
  // (comment_*: 댓글 작성 퍼널 [PR-C3]. 두 가지 이유로 면제한다.
  //  ① comment_input_view는 **글 상세를 볼 때마다** 발생해 page_view와 1:1로 늘어난다 →
  //     면제하지 않으면 event:ip 버킷 소진이 빨라져, 지금까지 유실 0이던 comment_create까지 새로 깨진다.
  //     (30일 실측: comment_create 112건 = DB 사람 댓글 112건. 이 무손실 상태를 이번 PR이 깨뜨리면 안 된다.)
  //  ② 퍼널은 일부만 면제하면 단계 간 비율이 왜곡된다 — inapp_redirect_* 와 같은 이유다.
  //     그래서 성공 이벤트인 comment_create까지 같은 계열로 묶어 함께 면제한다.
  //  ⚠️ 무분별한 면제가 아님: view는 컴포넌트당 1회, focus·첫타이핑·신원단계도 각 1회로 클라에서 제한한다.
  //     제출 시도·실패만 매번 보낸다(재시도 횟수 자체가 신호).
  //  ⚠️ 알려진 공백: 가입 카드 클릭은 기존 kakao_button_click{from:'guest_comment_success'}가 담당하는데
  //     이 이벤트는 댓글 전용이 아니라 전 서비스 공용이라 이번 PR 범위에서 면제하지 않았다.)
  const CONVERSION_EVENTS = ['post_cta_clicked', 'sign_up', 'signup_step', 'identity_banner_view', 'related_post_click', 'exp1_exposure', 'signup_banner_eligible', 'signup_banner_shown', 'signup_banner_clicked', 'signup_banner_dismissed', 'related_recommend_view', 'top_promo_shown', 'top_promo_clicked', 'top_promo_dismissed', 'android_conversion_prompt_exposed', 'android_conversion_prompt_clicked', 'android_conversion_prompt_dismissed', 'inapp_redirect_attempted', 'inapp_redirect_opened', 'inapp_redirect_failed', 'comment_input_view', 'comment_input_focus', 'comment_text_started', 'comment_identity_started', 'comment_submit_attempted', 'comment_submit_failed', 'comment_signup_prompt_shown', 'comment_create']
  if (!CONVERSION_EVENTS.includes(body.eventName)) {
    const rl = await checkApiRateLimit(request, 'event', { max: 30 })
    if (rl) return rl
  }

  const ip =
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ||
    null

  const session = await auth()
  const userAgent = request.headers.get('user-agent')?.slice(0, 500) ?? null
  const { isBot, botType } = detectBot(userAgent, request.headers, ip)

  // 봇이 아닐 때만 anon session 발급 — 기존 middleware 정책과 동일
  // HTML 응답에서 Set-Cookie를 제거했으므로, 최초 이벤트 발생 시 여기서 sessionId를 생성
  //
  // [F19] 식별자 우선순위: 클라 anon_cid → 기존 `_anon_sid` 쿠키 → 신규 UUID.
  //   첫 방문에서 5개 이벤트가 쿠키 왕복 전에 동시 출발해도 anon_cid가 같으므로 하나로 묶인다.
  //   anon_cid를 sessionId에 그대로 넣는 이유: 아래 Set-Cookie로 `_anon_sid`까지 같은 값으로 수렴시켜
  //   **localStorage와 쿠키가 한 값을 갖게** 하기 위해서다. 둘 중 하나가 지워져도 식별자가 바뀌지 않는다.
  //   (역순으로 쿠키를 우선하면 두 저장소가 서로 다른 값을 유지해, 쿠키 만료 시점에 식별자가 튄다.)
  //   기준: docs/features/F19-anonymous-session-measurement.md §7
  //   클라가 보낸 anon_cid는 그대로 DB 식별자가 되므로 형식 검증을 통과한 값만 채택한다(이상하면 무시하고 fallback).
  const existingSid = request.cookies.get('_anon_sid')?.value ?? null
  const sessionId = resolveEventSessionId({
    isBot,
    properties: body.properties,
    existingSid,
    createFallbackId: () => crypto.randomUUID(),
  })

  await prisma.eventLog.create({
    data: {
      eventName: body.eventName,
      userId: session?.user?.id ?? null,
      sessionId,
      path: body.path?.slice(0, 500) ?? null,
      referrer: body.referrer?.slice(0, 500) ?? null,
      userAgent,
      ip,
      isBot,
      botType,
      properties: body.properties ? JSON.parse(JSON.stringify(body.properties)) : undefined,
    },
  })

  // login 이벤트 → 가입 채널(signupSource) 1회 기록 (비어있을 때만). auth 플로우 무변경.
  if (body.eventName === 'login' && session?.user?.id) {
    const env = typeof body.properties?.browser_env === 'string' ? body.properties.browser_env : ''
    const ref = body.referrer ?? ''
    const source = env === 'twa-android' || ref.startsWith('android-app://') ? 'TWA' : 'WEB'
    await prisma.user.updateMany({
      where: { id: session.user.id, signupSource: null },
      data: { signupSource: source },
    })
    // 마지막 접속 갱신 — login 이벤트는 새 방문 세션당 1회(PageViewTracker sessionStorage 가드).
    // auth.ts jwt 콜백의 30분 throttle로 세션 유지 재방문이 lastLoginAt에 누락되던 것을 여기서 보완.
    // 비크리티컬 — 실패해도 이벤트 기록을 막지 않는다.
    await prisma.user
      .update({ where: { id: session.user.id }, data: { lastLoginAt: new Date() } })
      .catch(() => {})
  }

  const response = NextResponse.json({ ok: true })
  if (!isBot && sessionId) {
    response.cookies.set('_anon_sid', sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
      secure: process.env.NODE_ENV === 'production',
    })
  }
  return response
}
