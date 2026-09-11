import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { checkApiRateLimit } from '@/lib/api-rate-limit'
import { BOT_UA_PATTERN } from '@/lib/bot-patterns'
import { resolveEventSessionId } from '@/lib/anon-cid'
import { isRateLimitExemptEvent } from '@/lib/telemetry/event-rate-limit'

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

  // 전환·측정 필수 이벤트는 rate limit 면제 — page_view 와 버킷(event:ip) 공유로 인한 429 유실 방지.
  // 🔴 목록과 면제 사유는 `@/lib/telemetry/event-rate-limit` 단일 출처에 둔다.
  //    라우트와 어드민 판정(admin.member-recovery.ts)이 같은 목록을 봐야
  //    "면제됐다고 표시되는데 실제로는 안 된" 상태가 생기지 않는다.
  if (!isRateLimitExemptEvent(body.eventName)) {
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
