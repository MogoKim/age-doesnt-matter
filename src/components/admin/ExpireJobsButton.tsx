'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adminBulkDeleteExpiredJobs } from '@/lib/actions/admin'

export default function ExpireJobsButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    if (!window.confirm('만료된 일자리 공고를 모두 숨김 처리하시겠습니까?')) return
    startTransition(async () => {
      const result = await adminBulkDeleteExpiredJobs()
      alert(`${result.deleted}건 처리 완료`)
      router.refresh()
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="rounded-lg bg-yellow-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-yellow-600 disabled:opacity-50"
    >
      {isPending ? '처리 중...' : '만료 공고 일괄 처리'}
    </button>
  )
}
