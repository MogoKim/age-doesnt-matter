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
  const CONVERSION_EVENTS = ['post_cta_clicked', 'sign_up', 'signup_step']
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
