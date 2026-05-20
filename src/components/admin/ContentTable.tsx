'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { adminUpdatePostStatus, adminTogglePin, adminBulkAction, adminSetPostPromotionLevel, adminToggleFeatured, adminSetPostLikeCount } from '@/lib/actions/admin'
import type { PromotionLevel } from '@/generated/prisma/client'
import { BOARD_DISPLAY_NAMES } from '@/lib/board-constants'

// 어드민은 WEEKLY를 "숨김"으로 표시 (운영자가 인지해야 함)
const BOARD_LABELS = { ...BOARD_DISPLAY_NAMES, WEEKLY: '수다방(숨김)' } as Record<string, string>

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  PUBLISHED: { label: '게시', className: 'bg-green-50 text-green-700' },
  HIDDEN: { label: '숨김', className: 'bg-yellow-50 text-yellow-700' },
  DELETED: { label: '삭제', className: 'bg-red-50 text-red-700' },
  DRAFT: { label: '임시', className: 'bg-zinc-100 text-zinc-600' },
}

const SOURCE_BADGE: Record<string, string> = {
  USER: '',
  BOT: '🤖',
  ADMIN: '👑',
  SHEET: '📋',
}

const PROMOTION_BADGE: Record<string, string> = {
  HOT: '🔥',
  HALL_OF_FAME: '👑',
  NORMAL: '',
}

interface Post {
  id: string
  boardType: string
  title: string
  status: string
  source: string
  promotionLevel: string
  isPinned: boolean
  isFeatured: boolean
  viewCount: number
  likeCount: number
  commentCount: number
  reportCount: number
  createdAt: Date
  author: { id: string; nickname: string }
}

interface ContentTableProps {
  posts: Post[]
  hasMore: boolean
  filters: {
    board?: string
    status?: string
    source?: string
    botType?: string
    search?: string
    sort?: string
  }
}

export default function ContentTable({ posts, hasMore, filters }: ContentTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [searchInput, setSearchInput] = useState(filters.search || '')

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    params.delete('cursor')
    router.push(`/admin/content?${params.toString()}`)
  }

  function updateBotType(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('source')
    params.delete('botType')
    if (value) params.set('botType', value)
    params.delete('cursor')
    router.push(`/admin/content?${params.toString()}`)
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    updateFilter('search', searchInput)
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === posts.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(posts.map((p) => p.id)))
    }
  }

  function handleBulkAction(action: 'HIDDEN' | 'DELETED') {
    if (selected.size === 0) return
    if (!confirm(`선택한 ${selected.size}개 글을 ${action === 'HIDDEN' ? '숨김' : '삭제'} 처리하시겠습니까?`)) return
    startTransition(async () => {
      await adminBulkAction(Array.from(selected), action)
      setSelected(new Set())
    })
  }

  return (
    <>
      {/* 필터 바 */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filters.board || ''}
          onChange={(e) => updateFilter('board', e.target.value)}
          className="h-10 rounded-lg border border-zinc-300 px-3 text-sm text-zinc-700"
        >
          <option value="">전체 게시판</option>
          {Object.entries(BOARD_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>

        <select
          value={filters.status || ''}
          onChange={(e) => updateFilter('status', e.target.value)}
          className="h-10 rounded-lg border border-zinc-300 px-3 text-sm text-zinc-700"
        >
          <option value="">전체 상태</option>
          <option value="PUBLISHED">게시</option>
          <option value="HIDDEN">숨김</option>
          <option value="DELETED">삭제</option>
        </select>

        <select
          value={filters.botType || ''}
          onChange={(e) => updateBotType(e.target.value)}
          className="h-10 rounded-lg border border-zinc-300 px-3 text-sm text-zinc-700"
        >
          <option value="">전체 소스</option>
          <option value="user">실고객</option>
          <option value="seed">시드봇</option>
          <option value="curate">큐레이션봇</option>
          <option value="sheet">스크래퍼봇</option>
          <option value="admin">NNN</option>
        </select>

        <select
          value={filters.sort || ''}
          onChange={(e) => updateFilter('sort', e.target.value)}
          className="h-10 rounded-lg border border-zinc-300 px-3 text-sm text-zinc-700"
        >
          <option value="">최신순</option>
          <option value="likes">공감순</option>
          <option value="comments">댓글순</option>
          <option value="views">조회순</option>
        </select>

        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="제목/본문/작성자 검색"
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

      {/* 일괄 액션 */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-zinc-100 px-4 py-2">
          <span className="text-sm font-medium text-zinc-700">{selected.size}개 선택</span>
          <button
            onClick={() => handleBulkAction('HIDDEN')}
            disabled={isPending}
            className="rounded-md bg-yellow-500 px-3 py-2 text-sm font-medium text-white hover:bg-yellow-600 disabled:opacity-50"
          >
            일괄 숨김
          </button>
          <button
            onClick={() => handleBulkAction('DELETED')}
            disabled={isPending}
            className="rounded-md bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
          >
            일괄 삭제
          </button>
        </div>
      )}

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={posts.length > 0 && selected.size === posts.length}
                  onChange={toggleAll}
                  className="size-4 rounded border-zinc-300"
                />
              </th>
              <th className="px-3 py-3 text-left font-medium text-zinc-600">게시판</th>
              <th className="px-3 py-3 text-left font-medium text-zinc-600">제목</th>
              <th className="px-3 py-3 text-left font-medium text-zinc-600">작성자</th>
              <th className="px-3 py-3 text-center font-medium text-zinc-600">상태</th>
              <th className="px-3 py-3 text-center font-medium text-zinc-600">❤️</th>
              <th className="px-3 py-3 text-center font-medium text-zinc-600">💬</th>
              <th className="px-3 py-3 text-center font-medium text-zinc-600">👁️</th>
              <th className="px-3 py-3 text-center font-medium text-zinc-600">🚨</th>
              <th className="px-3 py-3 text-left font-medium text-zinc-600">등록일</th>
              <th className="px-3 py-3 text-center font-medium text-zinc-600">액션</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => {
              const statusBadge = STATUS_BADGE[post.status] || STATUS_BADGE.DRAFT
              return (
                <tr
                  key={post.id}
                  className={cn(
                    'border-b border-zinc-100 transition-colors hover:bg-zinc-50',
                    selected.has(post.id) && 'bg-blue-50',
                    post.source === 'BOT' && !selected.has(post.id) && 'bg-slate-50'
                  )}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(post.id)}
                      onChange={() => toggleSelect(post.id)}
                      className="size-4 rounded border-zinc-300"
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                      {BOARD_LABELS[post.boardType] || post.boardType}
                    </span>
                  </td>
                  <td className="max-w-xs truncate px-3 py-3 font-medium text-zinc-900">
                    {post.isPinned && <span className="mr-1">📌</span>}
                    {post.isFeatured && <span className="mr-1">⭐</span>}
                    {PROMOTION_BADGE[post.promotionLevel]}
                    {SOURCE_BADGE[post.source]}
                    <Link
                      href={`/admin/content/${post.id}`}
                      className="hover:text-[#FF6F61] hover:underline"
                    >
                      {post.title}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-zinc-600">
                    <Link
                      href={`/admin/members?search=${encodeURIComponent(post.author.nickname)}`}
                      className="hover:text-[#FF6F61] hover:underline"
                    >
                      {post.author.nickname}
                    </Link>
                    {post.source !== 'USER' && (
                      <span className="ml-1 rounded bg-zinc-200 px-1 py-0.5 text-[10px] font-medium text-zinc-500">
                        {post.source === 'BOT' ? '봇' : post.source === 'ADMIN' ? '관리자' : '스크래퍼'}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span
                      className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${statusBadge.className}`}
                    >
                      {statusBadge.label}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <LikeCountCell postId={post.id} initialCount={post.likeCount} />
                  </td>
                  <td className="px-3 py-3 text-center text-zinc-600">{post.commentCount}</td>
                  <td className="px-3 py-3 text-center text-zinc-600">{post.viewCount}</td>
                  <td className="px-3 py-3 text-center">
                    <span className={post.reportCount > 0 ? 'font-semibold text-red-600' : 'text-zinc-400'}>
                      {post.reportCount}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-zinc-500">
                    <div>{new Date(post.createdAt).toLocaleDateString('ko-KR')}</div>
                    <div className="text-xs text-zinc-400">
                      {new Date(post.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <ActionButton
                        label={post.isPinned ? '📌해제' : '📌핀'}
                        onClick={() =>
                          startTransition(() => adminTogglePin(post.id, !post.isPinned))
                        }
                        disabled={isPending}
                      />
                      <ActionButton
                        label={post.isFeatured ? '⭐해제' : '⭐집중'}
                        onClick={() =>
                          startTransition(() => adminToggleFeatured(post.id, !post.isFeatured))
                        }
                        disabled={isPending}
                        variant={post.isFeatured ? 'warning' : 'default'}
                      />
                      {post.status === 'PUBLISHED' ? (
                        <>
                          <ActionButton
                            label="숨김"
                            onClick={() =>
                              startTransition(() =>
                                adminUpdatePostStatus(post.id, 'HIDDEN')
                              )
                            }
                            disabled={isPending}
                            variant="warning"
                          />
                          <ActionButton
                            label="삭제"
                            onClick={() => {
                              if (!confirm('이 글을 삭제하시겠습니까?')) return
                              startTransition(() =>
                                adminUpdatePostStatus(post.id, 'DELETED')
                              )
                            }}
                            disabled={isPending}
                            variant="danger"
                          />
                        </>
                      ) : post.status === 'HIDDEN' ? (
                        <>
                          <ActionButton
                            label="복원"
                            onClick={() =>
                              startTransition(() =>
                                adminUpdatePostStatus(post.id, 'PUBLISHED')
                              )
                            }
                            disabled={isPending}
                            variant="success"
                          />
                          <ActionButton
                            label="삭제"
                            onClick={() => {
                              if (!confirm('이 글을 삭제하시겠습니까?')) return
                              startTransition(() =>
                                adminUpdatePostStatus(post.id, 'DELETED')
                              )
                            }}
                            disabled={isPending}
                            variant="danger"
                          />
                        </>
                      ) : post.status === 'DELETED' ? (
                        <ActionButton
                          label="복원"
                          onClick={() =>
                            startTransition(() =>
                              adminUpdatePostStatus(post.id, 'PUBLISHED')
                            )
                          }
                          disabled={isPending}
                          variant="success"
                        />
                      ) : null}
                      <PromotionButton
                        postId={post.id}
                        current={post.promotionLevel as PromotionLevel}
                        isPending={isPending}
                        startTransition={startTransition}
                      />
                    </div>
                  </td>
                </tr>
              )
            })}
            {posts.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center text-sm text-zinc-500">
                  콘텐츠가 없습니다.
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
              const lastPost = posts[posts.length - 1]
              if (!lastPost) return
              const params = new URLSearchParams(searchParams.toString())
              params.set('cursor', lastPost.createdAt.toISOString())
              router.push(`/admin/content?${params.toString()}`)
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

function ActionButton({
  label,
  onClick,
  disabled,
  variant = 'default',
}: {
  label: string
  onClick: () => void
  disabled: boolean
  variant?: 'default' | 'warning' | 'success' | 'danger'
}) {
  const variants = {
    default: 'text-zinc-600 hover:bg-zinc-100',
    warning: 'text-yellow-600 hover:bg-yellow-50',
    success: 'text-green-600 hover:bg-green-50',
    danger: 'text-red-600 hover:bg-red-50',
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 min-h-[44px] ${variants[variant]}`}
    >
      {label}
    </button>
  )
}

function LikeCountCell({ postId, initialCount }: { postId: string; initialCount: number }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(initialCount))
  const [isPending, startTransition] = useTransition()

  function commit() {
    const n = parseInt(value, 10)
    if (!Number.isInteger(n) || n < 0 || n === initialCount) {
      setValue(String(initialCount))
      setEditing(false)
      return
    }
    startTransition(async () => {
      await adminSetPostLikeCount(postId, n)
      setEditing(false)
    })
  }

  if (editing) {
    return (
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setValue(String(initialCount)); setEditing(false) }
        }}
        disabled={isPending}
        autoFocus
        className="w-16 rounded border border-zinc-300 px-1 py-0.5 text-center text-sm focus:outline-none focus:ring-1 focus:ring-[#FF6F61]"
      />
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      title="클릭하여 편집"
      className="rounded px-2 py-0.5 text-zinc-600 hover:bg-zinc-100 hover:text-[#FF6F61]"
    >
      {initialCount}
    </button>
  )
}

function PromotionButton({
  postId,
  current,
  isPending,
  startTransition,
}: {
  postId: string
  current: PromotionLevel
  isPending: boolean
  startTransition: (fn: () => void) => void
}) {
  const [open, setOpen] = useState(false)

  const options: { level: PromotionLevel; label: string }[] = [
    { level: 'HOT', label: '🔥 HOT' },
    { level: 'HALL_OF_FAME', label: '👑 명예의전당' },
    { level: 'NORMAL', label: '⬜ 일반' },
  ]

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={isPending}
        className="min-h-[44px] rounded-md px-3 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 disabled:opacity-50"
      >
        등급▾
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-40 rounded-xl border border-zinc-200 bg-white shadow-lg">
          {options.map((opt) => (
            <button
              key={opt.level}
              onClick={() => {
                setOpen(false)
                startTransition(() => adminSetPostPromotionLevel(postId, opt.level))
              }}
              className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors hover:bg-zinc-50 ${
                current === opt.level ? 'font-bold text-[#FF6F61]' : 'text-zinc-700'
              }`}
            >
              {opt.label}
              {current === opt.level && <span className="ml-auto text-xs">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
