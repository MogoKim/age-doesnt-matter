'use client'

import { useState, useTransition } from 'react'
import { adminUpdatePostContent } from '@/lib/actions/admin'

export default function PostEditForm({
  postId,
  title: initTitle,
  content: initContent,
  seoTitle: initSeoTitle,
  seoDescription: initSeoDescription,
}: {
  postId: string
  title: string
  content: string
  seoTitle?: string | null
  seoDescription?: string | null
}) {
  const [title, setTitle] = useState(initTitle)
  const [content, setContent] = useState(initContent)
  const [seoTitle, setSeoTitle] = useState(initSeoTitle ?? '')
  const [seoDescription, setSeoDescription] = useState(initSeoDescription ?? '')
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
        await adminUpdatePostContent(postId, { title, content, seoTitle, seoDescription })
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
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">
          SEO 제목 (seoTitle) <span className="font-normal text-zinc-400">— 비우면 본문 제목 사용. 검색 노출용, 30~40자 권장</span>
        </label>
        <input
          value={seoTitle}
          onChange={(e) => setSeoTitle(e.target.value)}
          maxLength={60}
          placeholder="예: 종합감기약 3개 비교 후기 — 성분·가격 따져봤어요"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-base outline-none focus:border-zinc-500"
        />
        <p className="mt-1 text-xs text-zinc-400">{seoTitle.length}/60</p>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">
          SEO 설명 (seoDescription) <span className="font-normal text-zinc-400">— 비우면 구글이 본문에서 자동 생성. 70~100자 권장</span>
        </label>
        <textarea
          value={seoDescription}
          onChange={(e) => setSeoDescription(e.target.value)}
          rows={3}
          maxLength={160}
          placeholder="검색 결과에 보일 설명 문장. 과장·의료/금융 단정 표현은 피하세요."
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
        />
        <p className="mt-1 text-xs text-zinc-400">{seoDescription.length}/160</p>
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
