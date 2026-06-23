import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * 알림 클릭 기록 (private) — 최초 클릭만 clickedAt 기록 + 읽음 처리.
 * 클릭 경로에서 server action을 제거하고 이 API로 대체(revalidatePath 호출 안 함 → 이동 체감 보존).
 * 본인(userId) 알림만 갱신.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  await prisma.notification.updateMany({
    where: { id: params.id, userId: session.user.id, clickedAt: null },
    data: { isRead: true, clickedAt: new Date() },
  })

  return new NextResponse(null, { status: 204 })
}
