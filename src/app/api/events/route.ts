import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { checkApiRateLimit } from '@/lib/api-rate-limit'
import { BOT_UA_PATTERN } from '@/lib/bot-patterns'

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
  const CONVERSION_EVENTS = ['post_cta_clicked', 'sign_up', 'signup_step', 'identity_banner_view', 'related_post_click', 'exp1_exposure']
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
  const existingSid = request.cookies.get('_anon_sid')?.value ?? null
  const sessionId = isBot ? null : (existingSid ?? crypto.randomUUID())

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
