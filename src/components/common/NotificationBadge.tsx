'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const POLL_INTERVAL = 60_000 // 1분마다 폴링

export default function NotificationBadge() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    async function fetchCount() {
      try {
        const res = await fetch('/api/notifications/unread-count')
        if (res.ok) {
          const data = await res.json()
          setCount(data.count ?? 0)
        }
      } catch {
        // 네트워크 에러 무시
      }
    }

    fetchCount()
    const timer = setInterval(fetchCount, POLL_INTERVAL)
    return () => clearInterval(timer)
  }, [])

  return (
    <Link
      href="/my/notifications"
      className="relative flex items-center justify-center w-[52px] h-[52px] rounded-lg text-[22px] text-foreground [-webkit-tap-highlight-color:transparent] hover:bg-background"
      aria-label={count > 0 ? `알림 ${count}개` : '알림'}
    >
      🔔
      {count > 0 && (
        <span className="absolute top-2 right-2 min-w-[20px] h-[20px] bg-primary text-white text-[13px] font-bold rounded-full flex items-center justify-center px-1">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}
