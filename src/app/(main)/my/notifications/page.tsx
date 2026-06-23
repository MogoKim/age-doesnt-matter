import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getMyNotifications, getUnreadNotificationCount } from '@/lib/queries/my'
import NotificationList from '@/components/features/my/NotificationList'

export const metadata = { title: '알림' }

export default async function MyNotificationsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  // 초기 목록(기본 20개)과 함께 전체 unread count를 병렬 조회.
  // rollback 시 badge를 화면 로드분이 아닌 전체 unread 기준으로 정확히 복구하기 위함.
  const [{ notifications }, initialUnreadCount] = await Promise.all([
    getMyNotifications(session.user.id).catch(() => ({ notifications: [] })),
    getUnreadNotificationCount(session.user.id).catch(() => 0),
  ])

  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 md:px-6 md:py-8">
      <Link
        href="/my"
        className="inline-flex items-center gap-1 text-[17px] font-medium text-muted-foreground no-underline min-h-[52px] mb-4 px-2 py-1 rounded-lg transition-colors hover:text-primary-text hover:bg-primary/5"
      >
        ← 마이페이지
      </Link>

      <NotificationList notifications={notifications} initialUnreadCount={initialUnreadCount} />
    </div>
  )
}
