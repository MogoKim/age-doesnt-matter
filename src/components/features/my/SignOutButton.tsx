'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

export default function SignOutButton() {
  const [showConfirm, setShowConfirm] = useState(false)

  return (
    <>
      <button
        className="flex items-center gap-3 w-full min-h-[56px] px-6 py-4 text-body font-medium text-muted-foreground bg-transparent border-none cursor-pointer transition-colors hover:bg-primary/5 hover:text-foreground text-left"
        onClick={() => setShowConfirm(true)}
      >
        <span className="text-lg">🚪</span>
        <span className="flex-1">로그아웃</span>
      </button>
      <ConfirmDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={() => signOut({ callbackUrl: '/' })}
        title="로그아웃할까요?"
        message="다시 이용하려면 카카오로 로그인해야 합니다."
        cancelLabel="머무르기"
        confirmLabel="로그아웃"
      />
    </>
  )
}
