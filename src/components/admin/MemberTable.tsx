'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { adminUpdateUserStatus, adminUpdateUserGrade } from '@/lib/actions/admin'
import type { Grade, UserStatus } from '@/generated/prisma/client'
import UserContentDrawer from './UserContentDrawer'
import type { DrawerTarget } from './UserContentDrawer'

const GRADE_LABELS: Record<string, { label: string; icon: string }> = {
  SPROUT: { label: '새싹', icon: '🌱' },
  REGULAR: { label: '단골', icon: '🌿' },
  WARM_NEIGHBOR: { label: '따뜻한이웃', icon: '☀️' },
  HONORARY: { label: '명예우나어인', icon: '🏅' },
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
  isOnboarded: boolean
  postCount: number
  commentCount: number
  receivedLikes: number
  lastLoginAt: Date
  createdAt: Date
  birthYear: number | null
  gender: string | null
  providerId: string
}

function getUserType(email: string | null, providerId: string): 'kakao' | 'bot' | 'seed' {
  if (email?.endsWith('@unao.bot') || providerId.startsWith('bot-')) return 'bot'
  if (providerId.startsWith('seed_')) return 'seed'
  return 'kakao'
}

function getBirthDecade(birthYear: number | null): string {
  if (!birthYear) return '-'
  const decade = Math.floor(birthYear / 10) * 10
  return `${decade % 100}년대생`
}

// 정렬 가능한 컬럼 ↔ 헤더 라벨
type SortField = 'postCount' | 'commentCount' | 'receivedLikes' | 'lastLoginAt' | 'createdAt'

interface MemberTableProps {
  users: User[]
  hasMore: boolean
  page: number
  sort: string
  order: string
  filters: {
    status?: string
    search?: string
    bot?: string
  }
}

export default function MemberTable({ users, hasMore, page, sort, order, filters }: MemberTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [searchInput, setSearchInput] = useState(filters.search || '')
  const [actionUserId, setActionUserId] = useState<string | null>(null)
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null)

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    params.delete('page') // 필터 변경 시 첫 페이지로
    router.push(`/admin/members?${params.toString()}`)
  }

  // 컬럼 헤더 클릭 정렬: 같은 컬럼 재클릭 → asc↔desc 토글, 다른 컬럼 → desc부터
  function toggleSort(field: SortField) {
    const nextOrder = sort === field && order === 'desc' ? 'asc' : 'desc'
    const params = new URLSearchParams(searchParams.toString())
    params.set('sort', field)
    params.set('order', nextOrder)
    params.delete('page') // 정렬 변경 시 첫 페이지로
    router.push(`/admin/members?${params.toString()}`)
  }

  // 페이지 이동(offset)
  function goToPage(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString())
    if (nextPage <= 1) params.delete('page')
    else params.set('page', String(nextPage))
    router.push(`/admin/members?${params.toString()}`)
  }

  // 정렬 아이콘: 활성 컬럼이면 ↑/↓, 아니면 흐린 ↕
  function sortIcon(field: SortField) {
    if (sort !== field) return <span className="text-zinc-300">↕</span>
    return <span className="text-zinc-900">{order === 'asc' ? '↑' : '↓'}</span>
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
          className="h-10 rounded-lg border border-zinc-300 px-3 text-sm text-zinc-700"
        >
          <option value="">전체 상태</option>
          <option value="ACTIVE">정상</option>
          <option value="SUSPENDED">정지</option>
          <option value="BANNED">차단</option>
          <option value="WITHDRAWN">탈퇴</option>
        </select>

        {/* 봇 계정 필터 */}
        <div className="flex gap-1">
          {[
            { value: 'all', label: '전체' },
            { value: 'hide', label: '실사용자만' },
            { value: 'only', label: '봇만' },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => updateFilter('bot', opt.value)}
              className={`h-10 rounded-lg px-3 text-sm font-medium transition-colors ${
                (filters.bot ?? 'hide') === opt.value
                  ? 'bg-zinc-900 text-white'
                  : 'border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="닉네임/이메일 검색"
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
              <th className="px-4 py-3 text-left font-medium text-zinc-600">닉네임</th>
              <th className="px-3 py-3 text-left font-medium text-zinc-600">유형 / 프로필</th>
              <th className="px-3 py-3 text-center font-medium text-zinc-600">등급</th>
              <th className="px-3 py-3 text-center font-medium text-zinc-600">상태</th>
              <th className="px-3 py-3 text-center font-medium text-zinc-600">온보딩</th>
              <th className="px-3 py-3 text-center font-medium text-zinc-600">
                <button onClick={() => toggleSort('postCount')} className="inline-flex items-center gap-1 hover:text-zinc-900">
                  글 {sortIcon('postCount')}
                </button>
              </th>
              <th className="px-3 py-3 text-center font-medium text-zinc-600">
                <button onClick={() => toggleSort('commentCount')} className="inline-flex items-center gap-1 hover:text-zinc-900">
                  댓글 {sortIcon('commentCount')}
                </button>
              </th>
              <th className="px-3 py-3 text-center font-medium text-zinc-600">
                <button onClick={() => toggleSort('receivedLikes')} className="inline-flex items-center gap-1 hover:text-zinc-900">
                  받은❤️ {sortIcon('receivedLikes')}
                </button>
              </th>
              <th className="px-3 py-3 text-left font-medium text-zinc-600">
                <button onClick={() => toggleSort('lastLoginAt')} className="inline-flex items-center gap-1 hover:text-zinc-900">
                  마지막 접속 {sortIcon('lastLoginAt')}
                </button>
              </th>
              <th className="px-3 py-3 text-left font-medium text-zinc-600">
                <button onClick={() => toggleSort('createdAt')} className="inline-flex items-center gap-1 hover:text-zinc-900">
                  가입일 {sortIcon('createdAt')}
                </button>
              </th>
              <th className="px-3 py-3 text-center font-medium text-zinc-600">액션</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const status = STATUS_LABELS[user.status] || STATUS_LABELS.ACTIVE
              return (
                <tr key={user.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-zinc-900">{user.nickname}</span>
                      {getUserType(user.email, user.providerId) === 'kakao' && (
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-yellow-50 text-yellow-700 border border-yellow-200">카카오</span>
                      )}
                      {getUserType(user.email, user.providerId) === 'bot' && (
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-zinc-100 text-zinc-500 border border-zinc-200">봇</span>
                      )}
                      {getUserType(user.email, user.providerId) === 'seed' && (
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-500 border border-blue-200">시드</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-zinc-500 text-xs">
                    {getUserType(user.email, user.providerId) === 'bot'
                      ? <span className="text-zinc-400">{user.email}</span>
                      : getUserType(user.email, user.providerId) === 'seed'
                      ? <span className="text-blue-400">테스트 계정</span>
                      : <span>{[user.gender === 'M' ? '남' : user.gender === 'F' ? '여' : null, getBirthDecade(user.birthYear)].filter(Boolean).join(' · ') || '-'}</span>
                    }
                  </td>
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
                  <td className="px-3 py-3 text-center">
                    {user.isOnboarded ? (
                      <span className="text-green-600 font-bold">✅</span>
                    ) : (
                      <span className="text-zinc-400">❌</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {user.postCount > 0 ? (
                      <button
                        onClick={() => setDrawer({ userId: user.id, nickname: user.nickname, mode: 'posts', totalCount: user.postCount })}
                        className="font-medium text-zinc-700 underline-offset-2 hover:underline"
                      >
                        {user.postCount}
                      </button>
                    ) : (
                      <span className="text-zinc-400">0</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {user.commentCount > 0 ? (
                      <button
                        onClick={() => setDrawer({ userId: user.id, nickname: user.nickname, mode: 'comments', totalCount: user.commentCount })}
                        className="font-medium text-zinc-700 underline-offset-2 hover:underline"
                      >
                        {user.commentCount}
                      </button>
                    ) : (
                      <span className="text-zinc-400">0</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center text-zinc-600">{user.receivedLikes}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-zinc-500">
                    <div>{new Date(user.lastLoginAt).toLocaleDateString('ko-KR')}</div>
                    <div className="text-xs text-zinc-400">
                      {new Date(user.lastLoginAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-zinc-500">
                    <div>{new Date(user.createdAt).toLocaleDateString('ko-KR')}</div>
                    <div className="text-xs text-zinc-400">
                      {new Date(user.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="relative flex items-center justify-center">
                      <button
                        onClick={() => setActionUserId(actionUserId === user.id ? null : user.id)}
                        className="rounded px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 min-h-[44px]"
                      >
                        제재 ▾
                      </button>
                      {actionUserId === user.id && (
                        <div className="absolute right-0 top-full z-10 mt-1 w-36 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
                          {user.status !== 'ACTIVE' && (
                            <button
                              onClick={() => handleStatusChange(user.id, 'ACTIVE')}
                              disabled={isPending}
                              className="w-full px-3 py-3 text-left text-xs text-green-600 hover:bg-green-50 disabled:opacity-50"
                            >
                              ✅ 해제
                            </button>
                          )}
                          <button
                            onClick={() => handleStatusChange(user.id, 'SUSPENDED', 7)}
                            disabled={isPending}
                            className="w-full px-3 py-3 text-left text-xs text-yellow-600 hover:bg-yellow-50 disabled:opacity-50"
                          >
                            ⚠️ 7일 정지
                          </button>
                          <button
                            onClick={() => handleStatusChange(user.id, 'SUSPENDED', 30)}
                            disabled={isPending}
                            className="w-full px-3 py-3 text-left text-xs text-orange-600 hover:bg-orange-50 disabled:opacity-50"
                          >
                            🟠 30일 정지
                          </button>
                          <button
                            onClick={() => handleStatusChange(user.id, 'BANNED')}
                            disabled={isPending}
                            className="w-full px-3 py-3 text-left text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
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
                <td colSpan={11} className="px-4 py-12 text-center text-sm text-zinc-500">
                  회원이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(page > 1 || hasMore) && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            className="rounded-lg border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← 이전
          </button>
          <span className="text-sm font-medium text-zinc-500">{page}페이지</span>
          <button
            onClick={() => goToPage(page + 1)}
            disabled={!hasMore}
            className="rounded-lg border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            다음 →
          </button>
        </div>
      )}

      <UserContentDrawer target={drawer} onClose={() => setDrawer(null)} />
    </>
  )
}
