'use client'

import { useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { adminProcessReport } from '@/lib/actions/admin'
import type { ReportAction } from '@/generated/prisma/client'

const REASON_LABELS: Record<string, string> = {
  PROFANITY: '욕설',
  POLITICS: '정치',
  HATE: '혐오',
  SPAM: '스팸',
  ADULT: '성인',
  OTHER: '기타',
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PENDING: { label: '대기', className: 'bg-yellow-50 text-yellow-700' },
  REVIEWED: { label: '검토', className: 'bg-blue-50 text-blue-700' },
  RESOLVED: { label: '처리완료', className: 'bg-green-50 text-green-700' },
}

const ACTION_LABELS: Record<string, string> = {
  DELETED: '삭제',
  HIDDEN: '숨김',
  WARNING: '경고',
  SUSPENDED: '정지',
  BANNED: '차단',
  DISMISSED: '기각',
}

interface Report {
  id: string
  reason: string
  description: string | null
  status: string
  action: string | null
  createdAt: Date
  processedAt: Date | null
  reporter: { id: string; nickname: string } | null
  post: { id: string; title: string; boardType: string } | null
  comment: { id: string; content: string } | null
  processor: { nickname: string } | null
}

interface ReportTableProps {
  reports: Report[]
  hasMore: boolean
  currentStatus?: string
}

export default function ReportTable({ reports, hasMore, currentStatus }: ReportTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    params.delete('cursor')
    router.push(`/admin/reports?${params.toString()}`)
  }

  function handleAction(reportId: string, action: ReportAction) {
    const labels: Record<string, string> = {
      DELETED: '삭제',
      HIDDEN: '숨김',
      DISMISSED: '기각',
      WARNING: '경고',
    }
    if (!confirm(`"${labels[action] || action}" 처리하시겠습니까?`)) return

    startTransition(() => adminProcessReport(reportId, action))
  }

  return (
    <>
      {/* 상태 탭 */}
      <div className="flex gap-2">
        {[
          { value: '', label: '대기중' },
          { value: 'REVIEWED', label: '검토중' },
          { value: 'RESOLVED', label: '처리완료' },
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => updateFilter('status', tab.value)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              (currentStatus || '') === tab.value
                ? 'bg-zinc-900 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50">
              <th className="px-4 py-3 text-left font-medium text-zinc-600">사유</th>
              <th className="px-3 py-3 text-left font-medium text-zinc-600">대상</th>
              <th className="px-3 py-3 text-left font-medium text-zinc-600">신고자</th>
              <th className="px-3 py-3 text-left font-medium text-zinc-600">설명</th>
              <th className="px-3 py-3 text-center font-medium text-zinc-600">상태</th>
              <th className="px-3 py-3 text-left font-medium text-zinc-600">신고일</th>
              <th className="px-3 py-3 text-center font-medium text-zinc-600">처리</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => {
              const status = STATUS_LABELS[report.status] || STATUS_LABELS.PENDING
              return (
                <tr key={report.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                      {REASON_LABELS[report.reason] || report.reason}
                    </span>
                  </td>
                  <td className="max-w-xs truncate px-3 py-3 text-zinc-900">
                    {report.post ? (
                      <span>📝 {report.post.title}</span>
                    ) : report.comment ? (
                      <span>💬 {report.comment.content.slice(0, 50)}</span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-3 py-3 text-zinc-600">{report.reporter?.nickname ?? '비회원'}</td>
                  <td className="max-w-xs truncate px-3 py-3 text-zinc-500">
                    {report.description || '-'}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${status.className}`}>
                      {report.action ? ACTION_LABELS[report.action] || report.action : status.label}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-zinc-500">
                    {new Date(report.createdAt).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-3 py-3">
                    {report.status === 'PENDING' || report.status === 'REVIEWED' ? (
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleAction(report.id, 'HIDDEN')}
                          disabled={isPending}
                          className="rounded px-3 py-2 text-sm font-medium text-yellow-600 hover:bg-yellow-50 disabled:opacity-50"
                        >
                          숨김
                        </button>
                        <button
                          onClick={() => handleAction(report.id, 'DELETED')}
                          disabled={isPending}
                          className="rounded px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          삭제
                        </button>
                        <button
                          onClick={() => handleAction(report.id, 'DISMISSED')}
                          disabled={isPending}
                          className="rounded px-3 py-2 text-sm font-medium text-zinc-500 hover:bg-zinc-100 disabled:opacity-50"
                        >
                          기각
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-400">
                        {report.processor?.nickname || '-'}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
            {reports.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-zinc-500">
                  {currentStatus === 'RESOLVED' ? '처리된 신고가 없습니다.' : '대기 중인 신고가 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="text-center">
          <button
            onClick={() => {
              const lastReport = reports[reports.length - 1]
              if (!lastReport) return
              const params = new URLSearchParams(searchParams.toString())
              params.set('cursor', lastReport.createdAt.toISOString())
              router.push(`/admin/reports?${params.toString()}`)
            }}
            className="rounded-lg border border-zinc-300 px-6 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            더보기
          </button>
        </div>
      )}
    </>
  )
}
