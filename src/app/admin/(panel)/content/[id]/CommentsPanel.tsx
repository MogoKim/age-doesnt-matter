'use client'

import { useState, useTransition } from 'react'
import { adminUpdateComment, adminDeleteComment } from '@/lib/actions/admin'

type CommentItem = {
  id: string
  content: string
  status: string
  createdAt: Date
  parentId: string | null
  author: { nickname: string } | null
  guestNickname: string | null
}

export default function CommentsPanel({ comments: initComments }: { comments: CommentItem[] }) {
  const [comments, setComments] = useState(initComments)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [isPending, startTransition] = useTransition()

  function displayName(c: CommentItem) {
    return c.author?.nickname ?? c.guestNickname ?? '비회원'
  }

  function handleDelete(id: string) {
    if (!confirm('댓글을 삭제할까요?')) return
    startTransition(async () => {
      await adminDeleteComment(id)
      setComments((prev) => prev.filter((c) => c.id !== id))
    })
  }

  function handleEditSave(id: string) {
    if (!editContent.trim()) return
    startTransition(async () => {
      await adminUpdateComment(id, editContent)
      setComments((prev) =>
        prev.map((c) => (c.id === id ? { ...c, content: editContent } : c))
      )
      setEditingId(null)
    })
  }

  return (
    <div className="space-y-3">
      <h2 className="font-semibold text-zinc-800">댓글 {comments.length}개</h2>

      {comments.length === 0 && (
        <p className="rounded-xl border border-zinc-100 px-4 py-6 text-center text-sm text-zinc-400">
          댓글이 없습니다.
        </p>
      )}

      {comments.map((c) => (
        <div
          key={c.id}
          className={`rounded-xl border border-zinc-200 bg-white p-4 ${c.parentId ? 'ml-6' : ''}`}
        >
          <div className="mb-2 flex items-center justify-between text-sm text-zinc-500">
            <span>
              {c.parentId ? '└ ' : ''}
              <span className="font-medium text-zinc-700">{displayName(c)}</span>
              {' · '}
              {new Date(c.createdAt).toLocaleString('ko-KR')}
            </span>
            <span className="flex gap-2">
              <button
                onClick={() => {
                  setEditingId(c.id)
                  setEditContent(c.content)
                }}
                disabled={isPending}
                className="text-zinc-400 hover:text-zinc-700 disabled:opacity-50"
              >
                수정
              </button>
              <button
                onClick={() => handleDelete(c.id)}
                disabled={isPending}
                className="text-red-400 hover:text-red-600 disabled:opacity-50"
              >
                삭제
              </button>
            </span>
          </div>

          {editingId === c.id ? (
            <div className="space-y-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-zinc-300 px-2 py-1 text-sm outline-none focus:border-zinc-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleEditSave(c.id)}
                  disabled={isPending}
                  className="rounded-lg bg-[#FF6F61] px-3 py-1 text-sm text-white hover:bg-[#E85D50] disabled:opacity-50"
                >
                  저장
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="text-sm text-zinc-500 hover:text-zinc-700"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-800">{c.content}</p>
          )}
        </div>
      ))}
    </div>
  )
}
