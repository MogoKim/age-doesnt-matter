'use client'

import Link from 'next/link'
import { useState } from 'react'
import { formatTimeAgo } from '@/components/features/community/utils'
import type { NotificationItem } from '@/types/api'

const NOTIFICATION_ICON: Record<string, string> = {
  COMMENT: '💬',
  LIKE: '❤️',
  GRADE_UP: '🎉',
  SYSTEM: '📢',
  CONTENT_HIDDEN: '⚠️',
}

/** 헤더 종 badge 즉시 갱신용 custom event. detail은 count(절대값) 또는 delta(증감) 중 하나. */
function dispatchUnreadChange(detail: { count?: number; delta?: number }) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('notifications:unread-count-change', { detail }))
}

interface NotificationListProps {
  notifications: NotificationItem[]
  /** 전체 unread 수(화면 로드분 20개 초과 대비). 모두읽음 실패 rollback 시 badge 정확 복구용. */
  initialUnreadCount: number
}

export default function NotificationList({ notifications, initialUnreadCount }: NotificationListProps) {
  // isRead를 로컬에서 관리(optimistic). 서버 재조회 없이 클릭/모두읽음 즉시 반영.
  const [items, setItems] = useState<NotificationItem[]>(notifications)
  const [allReadFailed, setAllReadFailed] = useState(false)

  const hasUnread = items.some((n) => !n.isRead)

  // 알림 행 탭: 이동은 Link가 즉시 처리(읽음 API 응답 안 기다림). unread면 로컬 read + badge -1, 백그라운드 클릭 기록.
  function handleRowClick(notification: NotificationItem) {
    if (!notification.isRead) {
      setItems((prev) => prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)))
      dispatchUnreadChange({ delta: -1 })
    }
    // 백그라운드 클릭 기록 — fire-and-forget(이동을 막지 않음).
    // keepalive: Link 즉시 이동으로 페이지 전환 중에도 요청이 취소되지 않고 보존되게 한다.
    void fetch(`/api/notifications/${notification.id}/click`, {
      method: 'POST',
      keepalive: true,
    }).catch(() => {})
  }

  // 모두 읽음: 즉시 optimistic(모든 dot 제거 + 버튼 숨김 + badge 0). 실패 시 rollback.
  async function handleMarkAll() {
    const unreadCount = items.filter((n) => !n.isRead).length
    if (unreadCount === 0) return

    const prev = items
    setItems((cur) => cur.map((n) => ({ ...n, isRead: true })))
    setAllReadFailed(false)
    dispatchUnreadChange({ count: 0 })

    try {
      const res = await fetch('/api/notifications/read-all', { method: 'POST' })
      if (!res.ok) throw new Error('read-all failed')
    } catch {
      // rollback — 기존 unread 상태 복구 + 버튼 다시 활성.
      // badge는 화면 로드분(unreadCount)이 아니라 전체 unread(initialUnreadCount)로 정확히 복구.
      setItems(prev)
      setAllReadFailed(true)
      dispatchUnreadChange({ count: initialUnreadCount })
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-foreground">🔔 알림</h1>
        {hasUnread && (
          <button
            type="button"
            onClick={handleMarkAll}
            className="text-[17px] text-primary-text font-medium min-h-[52px] px-3 disabled:opacity-50"
          >
            모두 읽음
          </button>
        )}
      </div>

      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((notification) => (
            <Link
              key={notification.id}
              href={notification.linkUrl || '/my/notifications'}
              prefetch={false}
              onClick={() => handleRowClick(notification)}
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
                  <p className="text-body text-foreground m-0 leading-relaxed">
                    {notification.message}
                  </p>
                  <p className="text-[17px] text-muted-foreground m-0 mt-1">
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
        <div className="flex flex-col items-center justify-center p-8 text-center bg-card rounded-2xl border-2 border-dashed border-border">
          <p className="text-body text-muted-foreground leading-relaxed">
            아직 알림이 없어요.<br />
            글에 댓글이 달리거나 공감을 받으면 알림이 와요.
          </p>
        </div>
      )}

      {allReadFailed && (
        <p className="sr-only" role="alert">모두 읽음 처리에 실패했어요. 다시 시도해 주세요.</p>
      )}
    </>
  )
}
