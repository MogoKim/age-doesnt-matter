'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

const POLL_INTERVAL = 30_000 // 30초마다 폴링

export default function NotificationBadge() {
  const [count, setCount] = useState(0)

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/unread-count')
      if (res.ok) {
        const data = await res.json()
        setCount(data.count ?? 0)
      }
    } catch {
      // 네트워크 에러 무시
    }
  }, [])

  useEffect(() => {
    fetchCount()
    const timer = setInterval(fetchCount, POLL_INTERVAL)

    // 탭 비활성 시 polling 중지, 활성화 시 즉시 fetch + 재시작
    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        fetchCount()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [fetchCount])

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
