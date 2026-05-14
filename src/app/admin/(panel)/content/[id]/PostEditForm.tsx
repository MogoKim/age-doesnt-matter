'use client'

import { useState, useTransition } from 'react'
import { adminUpdatePostContent } from '@/lib/actions/admin'

export default function PostEditForm({
  postId,
  title: initTitle,
  content: initContent,
}: {
  postId: string
  title: string
  content: string
}) {
  const [title, setTitle] = useState(initTitle)
  const [content, setContent] = useState(initContent)
  const [msg, setMsg] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    if (!title.trim()) {
      setMsg('제목은 비워둘 수 없습니다')
      return
    }
    setMsg('')
    startTransition(async () => {
      try {
        await adminUpdatePostContent(postId, { title, content })
        setMsg('저장됐어요')
      } catch {
        setMsg('저장 실패')
      }
    })
  }

  return (
    <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6">
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">제목</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-base outline-none focus:border-zinc-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">본문 (HTML 원문)</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={20}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm outline-none focus:border-zinc-500"
        />
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="rounded-lg bg-[#FF6F61] px-5 py-2 text-white hover:bg-[#E85D50] disabled:opacity-50"
        >
          {isPending ? '저장 중...' : '저장하기'}
        </button>
        {msg && (
          <span className={`text-sm ${msg === '저장됐어요' ? 'text-green-600' : 'text-red-500'}`}>
            {msg}
          </span>
        )}
      </div>
    </div>
  )
}
