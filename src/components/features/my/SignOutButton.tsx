'use client'

import { signOut } from 'next-auth/react'

export default function SignOutButton() {
  function handleSignOut() {
    if (!confirm('로그아웃 하시겠어요?')) return
    signOut({ callbackUrl: '/' })
  }

  return (
    <button
      className="flex items-center gap-3 w-full min-h-[56px] px-6 py-4 text-sm font-medium text-muted-foreground bg-transparent border-none cursor-pointer transition-colors hover:bg-primary/5 hover:text-foreground text-left"
      onClick={handleSignOut}
    >
      <span className="text-lg">🚪</span>
      <span className="flex-1">로그아웃</span>
    </button>
  )
}
