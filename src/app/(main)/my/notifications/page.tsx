import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getMyNotifications } from '@/lib/queries/my'
import { formatTimeAgo } from '@/components/features/community/utils'
import MarkAllReadButton from '@/components/features/my/MarkAllReadButton'

export const metadata = { title: '알림' }

const NOTIFICATION_ICON: Record<string, string> = {
  COMMENT: '💬',
  LIKE: '❤️',
  GRADE_UP: '🎉',
  SYSTEM: '📢',
  CONTENT_HIDDEN: '⚠️',
}

export default async function MyNotificationsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { notifications } = await getMyNotifications(session.user.id)
  const hasUnread = notifications.some((n) => !n.isRead)

  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 md:px-6 md:py-8">
      <Link
        href="/my"
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground no-underline min-h-[52px] mb-4 px-2 py-1 rounded-lg transition-all hover:text-primary hover:bg-primary/5"
      >
        ← 마이페이지
      </Link>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-foreground">🔔 알림</h1>
        {hasUnread && <MarkAllReadButton />}
      </div>

      {notifications.length > 0 ? (
        <div className="space-y-2">
          {notifications.map((notification) => (
            <Link
              key={notification.id}
              href={notification.linkUrl}
              className={`block p-4 rounded-xl border no-underline transition-colors hover:border-primary/30 ${
                notification.isRead
                  ? 'bg-card border-border'
                  : 'bg-primary/5 border-primary/20'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-lg shrink-0 mt-0.5">
                  {NOTIFICATION_ICON[notification.type] ?? '🔔'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-base text-foreground m-0 leading-relaxed">
                    {notification.message}
                  </p>
                  <p className="text-[13px] text-muted-foreground m-0 mt-1">
                    {formatTimeAgo(notification.createdAt)}
                  </p>
                </div>
                {!notification.isRead && (
                  <span className="w-2.5 h-2.5 rounded-full bg-primary shrink-0 mt-2" />
                )}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-card rounded-2xl border-2 border-dashed border-border">
          <p className="text-base text-muted-foreground leading-relaxed">
            아직 알림이 없어요.
          </p>
        </div>
      )}
    </div>
  )
}
