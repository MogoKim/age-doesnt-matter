import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * 모두 읽음 (private) — 본인의 unread 알림만 isRead=true.
 * optimistic UI를 위해 revalidatePath를 호출하지 않는다(클라이언트가 즉시 반영, 실패 시 rollback).
 */
export async function POST(_req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  await prisma.notification.updateMany({
    where: { userId: session.user.id, isRead: false },
    data: { isRead: true },
  })

  return new NextResponse(null, { status: 204 })
}
