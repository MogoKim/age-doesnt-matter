import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { checkApiRateLimit } from '@/lib/api-rate-limit'

interface EventPayload {
  eventName: string
  path?: string
  referrer?: string
  properties?: Record<string, unknown>
}

const BOT_UA_PATTERNS = [
  /googlebot/i, /bingbot/i, /yandex/i, /baidu/i,
  /facebookexternalhit/i, /twitterbot/i,
  /node-fetch/i, /python-requests/i, /axios/i,
  /HeadlessChrome/i, /Playwright/i,
  /curl/i, /wget/i,
]

function detectBot(userAgent: string | null, headers: Headers): { isBot: boolean; botType: string | null } {
  const xBotType = headers.get('x-bot-type')
  if (xBotType) return { isBot: true, botType: xBotType }
  if (!userAgent) return { isBot: false, botType: null }
  const isKnownBot = BOT_UA_PATTERNS.some(p => p.test(userAgent))
  if (isKnownBot) return { isBot: true, botType: 'external-bot' }
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
  const { isBot, botType } = detectBot(userAgent, request.headers)

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
