import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getMyNotifications, getUnreadNotificationCount } from '@/lib/queries/my'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const [{ notifications, hasMore }, unreadCount] = await Promise.all([
    getMyNotifications(session.user.id),
    getUnreadNotificationCount(session.user.id),
  ])

  return NextResponse.json({ notifications, hasMore, unreadCount })
}
