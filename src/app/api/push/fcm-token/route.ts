import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { checkApiRateLimit } from '@/lib/api-rate-limit'
import { prisma } from '@/lib/prisma'

/**
 * 앱(Capacitor) FCM 디바이스 토큰 등록/삭제.
 * 웹푸시(/api/push/subscribe)와 별개 — 앱 WebView는 웹푸시 미지원이라 FCM token으로 수신.
 *
 * POST   : token 등록(upsert) — 같은 token이면 userId/갱신, 신규면 생성.
 * DELETE : token 삭제(로그아웃/알림 끄기) — 본인 토큰만.
 *
 * 마케팅 동의는 기록하지 않는다(웹푸시 토스트와 달리, FCM 등록은 OS 권한 허용 = 서비스 알림 수신 의사).
 * 광고성 발송은 발송 시점에 user.marketingOptIn으로 별도 게이트(웹푸시 service.ts와 동일 정책).
 */
export async function POST(req: NextRequest) {
  const rateLimited = await checkApiRateLimit(req, 'fcm-token', { max: 10 })
  if (rateLimited) return rateLimited

  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const body = await req.json() as { token?: string; platform?: string }
  const token = body.token?.trim()
  const platform = body.platform === 'ios' ? 'ios' : 'android'
  if (!token) {
    return NextResponse.json({ error: '잘못된 토큰' }, { status: 400 })
  }

  // token 기준 upsert (디바이스 재설치/토큰 회전 시 userId 갱신 — 중복 row 방지)
  await prisma.fcmToken.upsert({
    where: { token },
    create: { userId: session.user.id, token, platform },
    update: { userId: session.user.id, platform },
  })

  return new NextResponse(null, { status: 204 })
}

export async function DELETE(req: NextRequest) {
  const rateLimited = await checkApiRateLimit(req, 'fcm-token-delete', { max: 10 })
  if (rateLimited) return rateLimited

  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const body = await req.json() as { token?: string }
  if (!body.token) {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }

  await prisma.fcmToken.deleteMany({
    where: { token: body.token, userId: session.user.id },
  })

  return new NextResponse(null, { status: 204 })
}
