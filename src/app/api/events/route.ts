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
  const rl = await checkApiRateLimit(request, 'event', { max: 30 })
  if (rl) return rl

  const ip =
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ||
    null

  const body = (await request.json()) as EventPayload

  if (!body.eventName || body.eventName.length > 100) {
    return NextResponse.json({ error: 'Invalid eventName' }, { status: 400 })
  }

  const session = await auth()
  const sessionId = request.cookies.get('_anon_sid')?.value ?? null
  const userAgent = request.headers.get('user-agent')?.slice(0, 500) ?? null
  const { isBot, botType } = detectBot(userAgent, request.headers, ip)

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

  return NextResponse.json({ ok: true })
}
