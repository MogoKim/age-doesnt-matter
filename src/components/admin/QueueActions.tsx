'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adminApproveQueueItem, adminRejectQueueItem } from '@/lib/actions/admin'
import type { AdminQueueStatus } from '@/generated/prisma/client'

interface Props {
  itemId: string
  status: AdminQueueStatus
  payload: Record<string, unknown> | null
  title: string
  description: string
}

export default function QueueActions({ itemId, status, payload, title, description }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showDetail, setShowDetail] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [reason, setReason] = useState('')

  function handleApprove() {
    startTransition(async () => {
      await adminApproveQueueItem(itemId)
      router.refresh()
    })
  }

  function handleReject() {
    startTransition(async () => {
      await adminRejectQueueItem(itemId, reason || undefined)
      setShowReject(false)
      router.refresh()
    })
  }

  return (
    <>
      <div className="flex shrink-0 flex-col gap-2">
        <button
          onClick={() => setShowDetail(true)}
          className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-50"
        >
          상세 보기
        </button>
        {status === 'PENDING' && (
          <>
            <button
              onClick={handleApprove}
              disabled={isPending}
              className="rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-600 disabled:opacity-50"
            >
              ✅ 승인
            </button>
            <button
              onClick={() => setShowReject(true)}
              disabled={isPending}
              className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
            >
              ❌ 거절
            </button>
          </>
        )}
      </div>

      {/* 상세 팝업 */}
      {showDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6">
            <div className="mb-4 flex items-start justify-between">
              <h2 className="text-lg font-bold text-zinc-900">{title}</h2>
              <button
                onClick={() => setShowDetail(false)}
                className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              >
                ✕
              </button>
            </div>
            <p className="mb-4 text-sm text-zinc-700">{description}</p>
            {payload && Object.keys(payload).length > 0 && (
              <div>
                <div className="mb-2 text-xs font-medium text-zinc-500">페이로드 데이터</div>
                <pre className="overflow-auto rounded-lg bg-zinc-50 p-4 text-xs text-zinc-700">
                  {JSON.stringify(payload, null, 2)}
                </pre>
              </div>
            )}
            <div className="mt-4 flex justify-end gap-3">
              {status === 'PENDING' && (
                <>
                  <button
                    onClick={() => { setShowDetail(false); setShowReject(true) }}
                    className="rounded-lg bg-red-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-600"
                  >
                    ❌ 거절
                  </button>
                  <button
                    onClick={() => { setShowDetail(false); handleApprove() }}
                    disabled={isPending}
                    className="rounded-lg bg-green-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50"
                  >
                    ✅ 승인
                  </button>
                </>
              )}
              <button
                onClick={() => setShowDetail(false)}
                className="rounded-lg border border-zinc-200 px-5 py-2.5 text-sm text-zinc-600 hover:bg-zinc-50"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 거절 모달 */}
      {showReject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <h2 className="mb-4 text-base font-bold text-zinc-900">거절 사유 입력</h2>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="사유를 입력하세요 (선택사항)"
              rows={4}
              className="w-full rounded-lg border border-zinc-200 p-3 text-sm focus:border-[#FF6F61] focus:outline-none"
            />
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setShowReject(false)}
                className="rounded-lg border border-zinc-200 px-5 py-2.5 text-sm text-zinc-600 hover:bg-zinc-50"
              >
                취소
              </button>
              <button
                onClick={handleReject}
                disabled={isPending}
                className="rounded-lg bg-red-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
              >
                거절 확정
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
