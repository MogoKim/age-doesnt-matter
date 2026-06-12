import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { checkApiRateLimit } from '@/lib/api-rate-limit'
import { prisma } from '@/lib/prisma'
import { MARKETING_AGREEMENT_VERSION } from '@/lib/agreements'

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

  // 푸시 토스트 "받을게요"(소식·혜택 명시) = 마케팅 수신 동의 → 동의 기록(법적 증빙).
  // 구독 저장 성공 후에만 기록(원자적 — 구독 실패 시 동의=true 불일치 방지). 비크리티컬: 실패해도 구독은 유지.
  // version은 온보딩과 동일 상수 → 같은 사용자 MARKETING row 중복 누적 방지.
  try {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: session.user.id },
        data: { marketingOptIn: true },
      }),
      prisma.agreement.upsert({
        where: { userId_type_version: { userId: session.user.id, type: 'MARKETING', version: MARKETING_AGREEMENT_VERSION } },
        create: { userId: session.user.id, type: 'MARKETING', version: MARKETING_AGREEMENT_VERSION },
        update: { agreedAt: new Date() },
      }),
    ])
  } catch {
    /* 동의 기록 실패는 구독을 막지 않음 */
  }

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
