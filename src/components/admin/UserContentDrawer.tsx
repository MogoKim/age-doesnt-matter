'use client'

import { useState, useEffect, useCallback } from 'react'
import { adminGetUserPosts, adminGetUserComments } from '@/lib/actions/admin/admin.members'
import type { UserPostItem, UserCommentItem } from '@/lib/actions/admin/admin.members'
import { BOARD_URL_PREFIX } from '@/lib/board-registry'

// BoardType → 경로 (SSoT: board-registry — 구 로컬 중복 정의 제거. 라벨은 어드민 고유라 아래 유지)
const BOARD_PATHS: Record<string, string> = BOARD_URL_PREFIX

const BOARD_LABELS: Record<string, string> = {
  STORY: '뜨는이야기',
  HUMOR: '웃음방',
  LIFE2: '사는이야기',
  MAGAZINE: '매거진',
  JOB: '일자리',
  WEEKLY: '주간',
}

const POST_STATUS: Record<string, { label: string; className: string }> = {
  PUBLISHED: { label: '게시', className: 'text-green-600' },
  HIDDEN: { label: '숨김', className: 'text-zinc-400' },
  DELETED: { label: '삭제', className: 'text-red-500' },
}

const COMMENT_STATUS: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: '게시', className: 'text-green-600' },
  HIDDEN: { label: '숨김', className: 'text-zinc-400' },
  DELETED: { label: '삭제', className: 'text-red-500' },
}

function getPostUrl(boardType: string, slug: string | null, id: string): string {
  const base = BOARD_PATHS[boardType] ?? '/community'
  return `${base}/${slug ?? id}`
}

function fmt(d: Date): string {
  return new Date(d).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

export type DrawerTarget = {
  userId: string
  nickname: string
  mode: 'posts' | 'comments'
  totalCount: number
}

interface Props {
  target: DrawerTarget | null
  onClose: () => void
}

export default function UserContentDrawer({ target, onClose }: Props) {
  const [posts, setPosts] = useState<UserPostItem[]>([])
  const [comments, setComments] = useState<UserCommentItem[]>([])
  const [cursor, setCursor] = useState<string | undefined>()
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (userId: string, mode: 'posts' | 'comments', nextCursor?: string) => {
      setLoading(true)
      setError(null)
      try {
        if (mode === 'posts') {
          const res = await adminGetUserPosts(userId, nextCursor)
          if (!nextCursor) setPosts(res.posts)
          else setPosts((prev) => [...prev, ...res.posts])
          setHasMore(res.hasMore)
          const last = res.posts[res.posts.length - 1]
          if (last) setCursor(last.id)
        } else {
          const res = await adminGetUserComments(userId, nextCursor)
          if (!nextCursor) setComments(res.comments)
          else setComments((prev) => [...prev, ...res.comments])
          setHasMore(res.hasMore)
          const last = res.comments[res.comments.length - 1]
          if (last) setCursor(last.id)
        }
      } catch {
        setError('데이터를 불러오지 못했습니다.')
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    if (!target) return
    setPosts([])
    setComments([])
    setCursor(undefined)
    setHasMore(false)
    setError(null)
    void load(target.userId, target.mode)
  }, [target, load])

  if (!target) return null

  const items = target.mode === 'posts' ? posts : comments

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col bg-white shadow-xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div>
            <p className="text-xs text-zinc-400">{target.nickname}</p>
            <h2 className="text-sm font-semibold text-zinc-900">
              {target.mode === 'posts' ? '작성한 글' : '작성한 댓글'}
              <span className="ml-1.5 text-xs font-normal text-zinc-400">
                ({target.totalCount})
              </span>
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            ✕
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto">
          {error && (
            <p className="px-4 py-8 text-center text-sm text-red-500">{error}</p>
          )}

          {!error && items.length === 0 && !loading && (
            <p className="px-4 py-8 text-center text-sm text-zinc-400">
              {target.mode === 'posts' ? '작성한 글이 없습니다.' : '작성한 댓글이 없습니다.'}
            </p>
          )}

          {!error && target.mode === 'posts' && (
            <ul className="divide-y divide-zinc-100">
              {posts.map((post) => {
                const s = POST_STATUS[post.status] ?? POST_STATUS.HIDDEN
                const url = getPostUrl(post.boardType, post.slug, post.id)
                return (
                  <li key={post.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-900">{post.title}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-zinc-400">
                          <span>{BOARD_LABELS[post.boardType] ?? post.boardType}</span>
                          <span>·</span>
                          <span>{fmt(post.createdAt)}</span>
                          <span>·</span>
                          <span>♥{post.likeCount}</span>
                          <span>·</span>
                          <span>댓{post.commentCount}</span>
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`text-xs ${s.className}`}>{s.label}</span>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100"
                        >
                          보기↗
                        </a>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {!error && target.mode === 'comments' && (
            <ul className="divide-y divide-zinc-100">
              {comments.map((comment) => {
                const s = COMMENT_STATUS[comment.status] ?? COMMENT_STATUS.HIDDEN
                const url = getPostUrl(comment.post.boardType, comment.post.slug, comment.post.id)
                const preview =
                  comment.content.length > 80
                    ? comment.content.slice(0, 80) + '…'
                    : comment.content
                return (
                  <li key={comment.id} className="px-4 py-3">
                    <p className="text-sm leading-snug text-zinc-800">{preview}</p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-xs text-zinc-400">
                        {comment.parentId ? '↳ 대댓글 · ' : ''}
                        {comment.post.title} · {fmt(comment.createdAt)}
                      </p>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`text-xs ${s.className}`}>{s.label}</span>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100"
                        >
                          원글↗
                        </a>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {loading && (
            <p className="px-4 py-4 text-center text-xs text-zinc-400">불러오는 중…</p>
          )}

          {hasMore && !loading && (
            <div className="px-4 py-3 text-center">
              <button
                onClick={() => void load(target.userId, target.mode, cursor)}
                className="rounded-lg border border-zinc-300 px-4 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
              >
                더 보기
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
