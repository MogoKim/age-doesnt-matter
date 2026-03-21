'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { adminUpdateUserStatus, adminUpdateUserGrade } from '@/lib/actions/admin'
import type { Grade, UserStatus } from '@/generated/prisma/client'

const GRADE_LABELS: Record<string, { label: string; icon: string }> = {
  SPROUT: { label: '새싹', icon: '🌱' },
  REGULAR: { label: '단골', icon: '🌿' },
  VETERAN: { label: '터줏대감', icon: '💎' },
  WARM_NEIGHBOR: { label: '따뜻한이웃', icon: '☀️' },
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: '정상', className: 'bg-green-50 text-green-700' },
  SUSPENDED: { label: '정지', className: 'bg-yellow-50 text-yellow-700' },
  BANNED: { label: '차단', className: 'bg-red-50 text-red-700' },
  WITHDRAWN: { label: '탈퇴', className: 'bg-zinc-100 text-zinc-500' },
}

interface User {
  id: string
  nickname: string
  email: string | null
  grade: string
  status: string
  postCount: number
  commentCount: number
  receivedLikes: number
  lastLoginAt: Date
  createdAt: Date
}

interface MemberTableProps {
  users: User[]
  hasMore: boolean
  filters: {
    status?: string
    search?: string
  }
}

export default function MemberTable({ users, hasMore, filters }: MemberTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [searchInput, setSearchInput] = useState(filters.search || '')
  const [actionUserId, setActionUserId] = useState<string | null>(null)

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    params.delete('cursor')
    router.push(`/admin/members?${params.toString()}`)
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    updateFilter('search', searchInput)
  }

  function handleStatusChange(userId: string, status: UserStatus, suspendDays?: number) {
    const messages: Record<string, string> = {
      SUSPENDED: `${suspendDays}일 정지 처리하시겠습니까?`,
      BANNED: '영구 차단하시겠습니까? 이 작업은 되돌리기 어렵습니다.',
      ACTIVE: '정지/차단을 해제하시겠습니까?',
    }
    if (!confirm(messages[status] || '상태를 변경하시겠습니까?')) return

    startTransition(async () => {
      await adminUpdateUserStatus(userId, status, suspendDays)
      setActionUserId(null)
    })
  }

  function handleGradeChange(userId: string, grade: Grade) {
    startTransition(() => adminUpdateUserGrade(userId, grade))
  }

  return (
    <>
      {/* 필터 바 */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filters.status || ''}
          onChange={(e) => updateFilter('status', e.target.value)}
          className="h-9 rounded-lg border border-zinc-300 px-3 text-sm text-zinc-700"
        >
          <option value="">전체 상태</option>
          <option value="ACTIVE">정상</option>
          <option value="SUSPENDED">정지</option>
          <option value="BANNED">차단</option>
          <option value="WITHDRAWN">탈퇴</option>
        </select>

        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="닉네임/이메일 검색"
            className="h-9 w-48 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-500"
          />
          <button
            type="submit"
            className="h-9 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800"
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
              <th className="px-4 py-3 text-left font-medium text-zinc-600">닉네임</th>
              <th className="px-3 py-3 text-left font-medium text-zinc-600">이메일</th>
              <th className="px-3 py-3 text-center font-medium text-zinc-600">등급</th>
              <th className="px-3 py-3 text-center font-medium text-zinc-600">상태</th>
              <th className="px-3 py-3 text-center font-medium text-zinc-600">글</th>
              <th className="px-3 py-3 text-center font-medium text-zinc-600">댓글</th>
              <th className="px-3 py-3 text-center font-medium text-zinc-600">받은❤️</th>
              <th className="px-3 py-3 text-left font-medium text-zinc-600">마지막 접속</th>
              <th className="px-3 py-3 text-left font-medium text-zinc-600">가입일</th>
              <th className="px-3 py-3 text-center font-medium text-zinc-600">액션</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const status = STATUS_LABELS[user.status] || STATUS_LABELS.ACTIVE
              return (
                <tr key={user.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-3 font-medium text-zinc-900">{user.nickname}</td>
                  <td className="px-3 py-3 text-zinc-500">{user.email || '-'}</td>
                  <td className="px-3 py-3 text-center">
                    <select
                      value={user.grade}
                      onChange={(e) => handleGradeChange(user.id, e.target.value as Grade)}
                      disabled={isPending}
                      className="rounded border border-zinc-200 px-1.5 py-0.5 text-xs"
                    >
                      {Object.entries(GRADE_LABELS).map(([key, { label, icon }]) => (
                        <option key={key} value={key}>{icon} {label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${status.className}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center text-zinc-600">{user.postCount}</td>
                  <td className="px-3 py-3 text-center text-zinc-600">{user.commentCount}</td>
                  <td className="px-3 py-3 text-center text-zinc-600">{user.receivedLikes}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-zinc-500">
                    {new Date(user.lastLoginAt).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-zinc-500">
                    {new Date(user.createdAt).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-3 py-3">
                    <div className="relative flex items-center justify-center">
                      <button
                        onClick={() => setActionUserId(actionUserId === user.id ? null : user.id)}
                        className="rounded px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
                      >
                        제재 ▾
                      </button>
                      {actionUserId === user.id && (
                        <div className="absolute right-0 top-full z-10 mt-1 w-36 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
                          {user.status !== 'ACTIVE' && (
                            <button
                              onClick={() => handleStatusChange(user.id, 'ACTIVE')}
                              disabled={isPending}
                              className="w-full px-3 py-2 text-left text-xs text-green-600 hover:bg-green-50 disabled:opacity-50"
                            >
                              ✅ 해제
                            </button>
                          )}
                          <button
                            onClick={() => handleStatusChange(user.id, 'SUSPENDED', 7)}
                            disabled={isPending}
                            className="w-full px-3 py-2 text-left text-xs text-yellow-600 hover:bg-yellow-50 disabled:opacity-50"
                          >
                            ⚠️ 7일 정지
                          </button>
                          <button
                            onClick={() => handleStatusChange(user.id, 'SUSPENDED', 30)}
                            disabled={isPending}
                            className="w-full px-3 py-2 text-left text-xs text-orange-600 hover:bg-orange-50 disabled:opacity-50"
                          >
                            🟠 30일 정지
                          </button>
                          <button
                            onClick={() => handleStatusChange(user.id, 'BANNED')}
                            disabled={isPending}
                            className="w-full px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            🔴 영구 차단
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {users.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-sm text-zinc-500">
                  회원이 없습니다.
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
              const lastUser = users[users.length - 1]
              if (!lastUser) return
              const params = new URLSearchParams(searchParams.toString())
              params.set('cursor', lastUser.createdAt.toISOString())
              router.push(`/admin/members?${params.toString()}`)
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
