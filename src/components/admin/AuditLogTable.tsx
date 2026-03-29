'use client'

import { Fragment, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const ACTION_LABELS: Record<string, string> = {
  POST_STATUS: '게시글 상태 변경',
  POST_PIN: '게시글 핀 토글',
  POST_BULK: '게시글 일괄 처리',
  USER_STATUS: '회원 상태 변경',
  USER_GRADE: '회원 등급 변경',
  REPORT_PROCESS: '신고 처리',
  BANNER_CREATE: '배너 생성',
  BANNER_UPDATE: '배너 수정',
  BANNER_DELETE: '배너 삭제',
  AD_CREATE: '광고 생성',
  AD_UPDATE: '광고 수정',
  AD_DELETE: '광고 삭제',
  BOARD_CONFIG: '게시판 설정 변경',
  BANNED_WORD_CREATE: '금지어 추가',
  BANNED_WORD_DELETE: '금지어 삭제',
  BANNED_WORD_TOGGLE: '금지어 토글',
}

interface AuditLog {
  id: string
  action: string
  targetId: string
  before: unknown
  after: unknown
  createdAt: Date
  admin: { nickname: string; email: string }
}

interface AuditLogTableProps {
  logs: AuditLog[]
  hasMore: boolean
  filters: {
    action?: string
    search?: string
  }
}

export default function AuditLogTable({ logs, hasMore, filters }: AuditLogTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchInput, setSearchInput] = useState(filters.search || '')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    params.delete('cursor')
    startTransition(() => {
      router.push(`/admin/audit-log?${params.toString()}`)
    })
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    updateFilter('search', searchInput)
  }

  return (
    <>
      {/* 필터 바 */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filters.action || ''}
          onChange={(e) => updateFilter('action', e.target.value)}
          className="h-10 rounded-lg border border-zinc-300 px-3 text-sm text-zinc-700"
        >
          <option value="">전체 액션</option>
          {Object.entries(ACTION_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>

        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="대상 ID / 액션 검색"
            className="h-10 w-48 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
          />
          <button
            type="submit"
            className="h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800"
          >
            검색
          </button>
        </form>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50">
              <th className="px-4 py-3 text-left font-medium text-zinc-600">시간</th>
              <th className="px-3 py-3 text-left font-medium text-zinc-600">관리자</th>
              <th className="px-3 py-3 text-left font-medium text-zinc-600">액션</th>
              <th className="px-3 py-3 text-left font-medium text-zinc-600">대상 ID</th>
              <th className="px-3 py-3 text-center font-medium text-zinc-600">상세</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <Fragment key={log.id}>
                <tr className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-500">
                    {new Date(log.createdAt).toLocaleString('ko-KR')}
                  </td>
                  <td className="px-3 py-3 font-medium text-zinc-900">
                    {log.admin.nickname}
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                      {ACTION_LABELS[log.action] || log.action}
                    </span>
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-3 text-zinc-500 font-mono text-xs">
                    {log.targetId || '-'}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {(log.before != null || log.after != null) && (
                      <button
                        type="button"
                        onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                        className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
                      >
                        {expandedId === log.id ? '접기' : '보기'}
                      </button>
                    )}
                  </td>
                </tr>
                {expandedId === log.id && (
                  <tr className="border-b border-zinc-100">
                    <td colSpan={5} className="px-4 py-3">
                      <div className="grid gap-4 sm:grid-cols-2">
                        {log.before != null && (
                          <div>
                            <p className="mb-1 text-xs font-medium text-zinc-500">변경 전</p>
                            <pre className="max-h-40 overflow-auto rounded-lg bg-red-50 p-3 text-xs text-red-800">
                              {JSON.stringify(log.before, null, 2)}
                            </pre>
                          </div>
                        )}
                        {log.after != null && (
                          <div>
                            <p className="mb-1 text-xs font-medium text-zinc-500">변경 후</p>
                            <pre className="max-h-40 overflow-auto rounded-lg bg-green-50 p-3 text-xs text-green-800">
                              {JSON.stringify(log.after, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-zinc-500">
                  감사 로그가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 더보기 */}
      {hasMore && (
        <div className="text-center">
          <button
            onClick={() => {
              const lastLog = logs[logs.length - 1]
              if (!lastLog) return
              const params = new URLSearchParams(searchParams.toString())
              params.set('cursor', lastLog.id)
              router.push(`/admin/audit-log?${params.toString()}`)
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
