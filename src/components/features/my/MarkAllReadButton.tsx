'use client'

import { useTransition } from 'react'
import { markAllNotificationsRead } from '@/lib/actions/notifications'

export default function MarkAllReadButton() {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      await markAllNotificationsRead()
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="text-sm text-primary font-medium min-h-[52px] px-3 disabled:opacity-50"
    >
      {isPending ? '처리 중...' : '모두 읽음'}
    </button>
  )
}
