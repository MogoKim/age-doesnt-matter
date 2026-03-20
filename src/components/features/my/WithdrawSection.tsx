'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { withdrawAccount } from '@/lib/actions/account'
import { useToast } from '@/components/common/Toast'

export default function WithdrawSection() {
  const router = useRouter()
  const { toast } = useToast()
  const [showConfirm, setShowConfirm] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleWithdraw = () => {
    startTransition(async () => {
      const result = await withdrawAccount()
      if (result.success) {
        router.push('/')
      } else {
        toast(result.error || '오류가 발생했습니다.', 'error')
        setShowConfirm(false)
      }
    })
  }

  if (!showConfirm) {
    return (
      <button
        className="text-sm text-muted-foreground underline cursor-pointer hover:text-destructive transition-colors min-h-[52px] px-2"
        onClick={() => setShowConfirm(true)}
      >
        회원 탈퇴
      </button>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-destructive/5 rounded-xl p-4 border border-destructive/20">
        <p className="text-base font-bold text-destructive mb-2">정말 탈퇴하시겠어요?</p>
        <ul className="text-sm text-foreground space-y-1 leading-[1.8]">
          <li>탈퇴하면 작성한 글과 댓글이 더 이상 표시되지 않습니다.</li>
          <li>탈퇴 후 30일 이내에 같은 카카오 계정으로 로그인하면 계정이 복구됩니다.</li>
          <li>30일이 지나면 모든 데이터가 완전히 삭제됩니다.</li>
        </ul>
      </div>
      <div className="flex gap-3">
        <button
          className="flex-1 px-4 py-3 rounded-xl border border-border bg-card text-foreground font-bold text-sm min-h-[52px] cursor-pointer hover:bg-accent transition-colors"
          onClick={() => setShowConfirm(false)}
          disabled={isPending}
        >
          취소
        </button>
        <button
          className="flex-1 px-4 py-3 rounded-xl bg-destructive text-white font-bold text-sm min-h-[52px] cursor-pointer hover:bg-destructive/90 transition-colors disabled:opacity-50"
          onClick={handleWithdraw}
          disabled={isPending}
        >
          {isPending ? '처리 중...' : '탈퇴하기'}
        </button>
      </div>
    </div>
  )
}
