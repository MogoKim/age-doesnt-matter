'use client'

import { useState, useTransition, useEffect } from 'react'
import { getMyBlockedUsers, toggleUserBlock } from '@/lib/actions/blocks'

interface BlockedUser {
  id: string
  nickname: string
  blockedAt: string
}

export default function BlockedUserList() {
  const [users, setUsers] = useState<BlockedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    getMyBlockedUsers().then((result) => {
      if (result.users) setUsers(result.users)
      setLoading(false)
    })
  }, [])

  function handleUnblock(userId: string) {
    if (isPending) return
    startTransition(async () => {
      const result = await toggleUserBlock(userId)
      if (!result.error && result.blocked === false) {
        setUsers((prev) => prev.filter((u) => u.id !== userId))
      }
    })
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">불러오는 중...</p>
  }

  if (users.length === 0) {
    return <p className="text-sm text-muted-foreground">차단한 사용자가 없습니다.</p>
  }

  return (
    <div className="space-y-3">
      {users.map((user) => (
        <div key={user.id} className="flex items-center justify-between p-3 bg-background rounded-xl">
          <span className="text-sm font-medium text-foreground">{user.nickname}</span>
          <button
            onClick={() => handleUnblock(user.id)}
            disabled={isPending}
            className="min-h-[52px] px-4 py-2 text-[15px] font-bold text-destructive border border-destructive/30 rounded-lg bg-destructive/5 transition-all hover:bg-destructive/10 disabled:opacity-50"
          >
            차단 해제
          </button>
        </div>
      ))}
    </div>
  )
}
