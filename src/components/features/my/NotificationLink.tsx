'use client'

import Link from 'next/link'
import { useTransition, type ReactNode } from 'react'
import { markNotificationRead } from '@/lib/actions/notifications'

interface NotificationLinkProps {
  notificationId: string
  href: string
  isRead: boolean
  children: ReactNode
}

export default function NotificationLink({ notificationId, href, isRead, children }: NotificationLinkProps) {
  const [, startTransition] = useTransition()

  function handleClick() {
    if (!isRead) {
      startTransition(async () => {
        await markNotificationRead(notificationId)
      })
    }
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
