'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createPost } from '@/lib/actions/posts'

interface BoardOption {
  slug: string
  displayName: string
  categories: string[]
}

interface PostWriteFormProps {
  defaultBoard?: string
  boards: BoardOption[]
}

export default function PostWriteForm({ defaultBoard, boards }: PostWriteFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [selectedBoard, setSelectedBoard] = useState(defaultBoard || boards[0]?.slug || 'stories')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  const board = boards.find((b) => b.slug === selectedBoard)
  const categories = board?.categories.filter((c) => c !== '전체') || []

  const isTitleValid = title.length >= 2 && title.length <= 40
  const isContentValid = content.length >= 10
  const canSubmit = isTitleValid && isContentValid && selectedBoard

  function handleBoardChange(slug: string) {
    setSelectedBoard(slug)
    setSelectedCategory('')
  }

  function handleCancel() {
    if (title || content) {
      if (!confirm('작성 중인 내용이 사라져요. 나가시겠어요?')) return
    }
    router.back()
  }

  function handleSubmit() {
    if (!canSubmit || isPending) return
    setError('')

    const formData = new FormData()
    formData.set('boardSlug', selectedBoard)
    if (selectedCategory) formData.set('category', selectedCategory)
    formData.set('title', title)
    formData.set('content', content)

    startTransition(async () => {
      const result = await createPost(formData)
      if (result?.error) {
        setError(result.error)
      }
      // redirect는 Server Action 내부에서 처리
    })
  }

  return (
    <>
      {error && (
        <div className="mb-4 p-4 rounded-xl bg-destructive/10 text-destructive text-sm font-medium">
          {error}
        </div>
      )}

      {/* 게시판 선택 */}
      <div className="flex gap-2 mb-6">
        {boards.map((b) => {
          const slug = b.slug
          return (
            <button
              key={slug}
              className={cn(
                'flex-1 min-h-[52px] px-4 py-3.5 border-2 rounded-2xl text-xs font-medium cursor-pointer transition-all text-center shadow-sm',
                selectedBoard === slug
                  ? 'border-primary bg-primary/5 text-primary font-bold shadow-[0_0_0_3px_rgba(255,111,97,0.1)]'
                  : 'border-border bg-card text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5'
              )}
              onClick={() => handleBoardChange(slug)}
            >
              {b.displayName}
            </button>
          )
        })}
      </div>

      {/* 카테고리 선택 */}
      {categories.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-6">
          {categories.map((cat) => (
            <button
              key={cat}
              className={cn(
                'shrink-0 px-5 py-2.5 rounded-full border-2 text-xs font-medium cursor-pointer transition-all min-h-[52px] flex items-center whitespace-nowrap shadow-sm',
                selectedCategory === cat
                  ? 'bg-primary text-white border-primary font-bold shadow-[0_2px_8px_rgba(255,111,97,0.3)]'
                  : 'bg-card text-muted-foreground border-border hover:border-primary hover:text-primary hover:bg-primary/5'
              )}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* 제목 입력 */}
      <div className="mb-6">
        <label className="flex items-center gap-1 text-xs font-bold text-foreground mb-2">
          제목 <span className="text-primary font-bold">*</span>
        </label>
        <input
          type="text"
          className="w-full min-h-[52px] px-4 py-3.5 border-2 border-border rounded-xl text-lg font-bold text-foreground bg-card outline-none transition-all focus:border-primary focus:shadow-[0_0_0_3px_rgba(255,111,97,0.1)] placeholder:text-muted-foreground placeholder:font-normal"
          placeholder="제목을 입력해 주세요"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={40}
        />
        <div className={cn(
          'text-right text-[13px] font-medium text-muted-foreground mt-1',
          (title.length > 40 || (title.length > 0 && title.length < 2)) && 'text-destructive font-bold'
        )}>
          {title.length}/40
        </div>
      </div>

      {/* 본문 입력 */}
      <div className="mb-6">
        <label className="flex items-center gap-1 text-xs font-bold text-foreground mb-2">
          본문 <span className="text-primary font-bold">*</span>
        </label>
        <textarea
          className="w-full min-h-[300px] p-4 border-2 border-border rounded-xl text-sm text-foreground bg-card leading-[1.85] resize-y outline-none transition-all focus:border-primary focus:shadow-[0_0_0_3px_rgba(255,111,97,0.1)] placeholder:text-muted-foreground"
          placeholder="내용을 입력해 주세요 (10자 이상)"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className={cn(
          'text-right text-[13px] font-medium text-muted-foreground mt-1',
          content.length > 0 && content.length < 10 && 'text-destructive font-bold'
        )}>
          {content.length}자
        </div>
      </div>

      {/* 이미지 첨부 */}
      <div className="mb-6">
        <button className="flex items-center gap-2 min-h-[52px] p-4 border-2 border-dashed border-border rounded-2xl bg-background text-muted-foreground text-xs font-medium w-full justify-center opacity-50 cursor-not-allowed" disabled>
          📷 이미지 첨부 (단골 등급부터 가능해요)
        </button>
        <p className="text-xs text-muted-foreground mt-1 text-center">최대 5장, 각 5MB 이하</p>
      </div>

      {/* 하단 액션바 */}
      <div className="flex items-center justify-between py-6 border-t border-border mt-8 gap-2">
        <button
          className="min-h-[52px] lg:min-h-[48px] px-8 py-3.5 border-2 border-border rounded-xl bg-card text-muted-foreground text-xs font-bold cursor-pointer transition-all hover:border-muted-foreground hover:text-foreground"
          onClick={handleCancel}
        >
          취소
        </button>
        <div className="flex gap-2">
          <button
            className="min-h-[52px] lg:min-h-[48px] px-12 py-3.5 border-none rounded-xl bg-primary text-white text-sm font-bold cursor-pointer transition-all shadow-[0_2px_8px_rgba(255,111,97,0.3)] hover:bg-[#E85D50] hover:shadow-[0_4px_12px_rgba(255,111,97,0.4)] hover:-translate-y-px disabled:bg-border disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0"
            disabled={!canSubmit || isPending}
            onClick={handleSubmit}
          >
            {isPending ? '등록 중...' : '등록하기'}
          </button>
        </div>
      </div>
    </>
  )
}
