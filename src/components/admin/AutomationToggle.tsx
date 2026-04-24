'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adminSetAutomationStatus } from '@/lib/actions/admin'

interface Props {
  isActive: boolean
}

export default function AutomationToggle({ isActive }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleToggle() {
    const next = !isActive
    const confirmed = window.confirm(
      next
        ? '자동화를 재개하시겠습니까? 에이전트가 다시 실행됩니다.'
        : '자동화를 일시 중지하시겠습니까? 모든 에이전트 실행이 중단됩니다.'
    )
    if (!confirmed) return

    startTransition(async () => {
      await adminSetAutomationStatus(next)
      router.refresh()
    })
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
        isActive
          ? 'border border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
          : 'bg-green-500 text-white hover:bg-green-600'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-red-500'}`} />
      {isPending ? '처리 중...' : isActive ? '자동화 정지' : '자동화 재개'}
    </button>
  )
}
