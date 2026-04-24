import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { checkApiRateLimit } from '@/lib/api-rate-limit'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const rateLimited = await checkApiRateLimit(req, 'push-subscribe', { max: 10 })
  if (rateLimited) return rateLimited

  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const body = await req.json() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  const { endpoint, keys } = body
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: '잘못된 구독 정보' }, { status: 400 })
  }

  // endpoint 기준 upsert (중복 저장 방지)
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: session.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    update: { userId: session.user.id, p256dh: keys.p256dh, auth: keys.auth },
  })

  return new NextResponse(null, { status: 204 })
}

export async function DELETE(req: NextRequest) {
  const rateLimited = await checkApiRateLimit(req, 'push-unsubscribe', { max: 10 })
  if (rateLimited) return rateLimited

  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const body = await req.json() as { endpoint?: string }
  if (!body.endpoint) {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }

  await prisma.pushSubscription.deleteMany({
    where: { endpoint: body.endpoint, userId: session.user.id },
  })

  return new NextResponse(null, { status: 204 })
}
