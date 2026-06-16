'use client'

import Link from 'next/link'
import { useTransition, type ReactNode } from 'react'
import { recordNotificationClick } from '@/lib/actions/notifications'

interface NotificationLinkProps {
  notificationId: string
  href: string
  isRead: boolean
  children: ReactNode
}

export default function NotificationLink({ notificationId, href, isRead, children }: NotificationLinkProps) {
  const [, startTransition] = useTransition()

  function handleClick() {
    // 항상 클릭 기록(읽음 여부 무관) — 최초 클릭 시각·읽음 처리
    startTransition(async () => {
      await recordNotificationClick(notificationId)
    })
  }

  return (
    <Link
      href={href}
      onClick={handleClick}
      className={`block p-4 rounded-xl border no-underline transition-colors hover:border-primary/30 ${
        isRead
          ? 'bg-card border-border'
          : 'bg-primary/5 border-primary/20'
      }`}
    >
      {children}
    </Link>
  )
}
