'use client'

import { useState, useTransition, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createPost } from '@/lib/actions/posts'
import { useToast } from '@/components/common/Toast'
import type { ImagePreview } from './TipTapEditor'

// TipTap은 SSR 불가 → dynamic import
const TipTapEditor = dynamic(() => import('./TipTapEditor'), { ssr: false })

interface BoardOption {
  slug: string
  displayName: string
  categories: string[]
}

const DRAFT_KEY = 'unae_post_draft'
const AUTOSAVE_INTERVAL = 30_000 // 30초

interface PostWriteFormProps {
  defaultBoard?: string
  boards: BoardOption[]
  userGrade?: string
}

export default function PostWriteForm({ defaultBoard, boards, userGrade = 'SPROUT' }: PostWriteFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [selectedBoard, setSelectedBoard] = useState(defaultBoard || boards[0]?.slug || 'stories')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [images, setImages] = useState<ImagePreview[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [draftLoaded, setDraftLoaded] = useState(false)

  const board = boards.find((b) => b.slug === selectedBoard)
  const categories = board?.categories.filter((c) => c !== '전체') || []

  const isTitleValid = title.length >= 2 && title.length <= 40
  // HTML 태그 제거 후 텍스트 길이 검사
  const plainTextLength = content.replace(/<[^>]*>/g, '').trim().length
  const isContentValid = plainTextLength >= 10
  const canSubmit = isTitleValid && isContentValid && selectedBoard

  // 임시저장 복원
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY)
      if (saved) {
        const draft = JSON.parse(saved) as { board?: string; category?: string; title?: string; content?: string }
        if (draft.title || draft.content) {
          setSelectedBoard(draft.board || selectedBoard)
          setSelectedCategory(draft.category || '')
          setTitle(draft.title || '')
          setContent(draft.content || '')
          toast('임시저장된 글을 불러왔어요', 'info')
        }
      }
    } catch { /* ignore */ }
    setDraftLoaded(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 자동 임시저장 (30초마다)
  const saveDraft = useCallback(() => {
    if (!title && !content) return
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        board: selectedBoard,
        category: selectedCategory,
        title,
        content,
      }))
    } catch { /* ignore */ }
  }, [selectedBoard, selectedCategory, title, content])

  useEffect(() => {
    if (!draftLoaded) return
    const timer = setInterval(saveDraft, AUTOSAVE_INTERVAL)
    return () => clearInterval(timer)
  }, [saveDraft, draftLoaded])

  // 페이지 이탈 시에도 임시저장
  useEffect(() => {
    if (!draftLoaded) return
    const handleBeforeUnload = () => saveDraft()
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [saveDraft, draftLoaded])

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
  }

  function handleBoardChange(slug: string) {
    setSelectedBoard(slug)
    setSelectedCategory('')
  }

  function handleCancel() {
    if (title || content) {
      if (!confirm('작성 중인 내용이 사라져요. 나가시겠어요?')) return
      clearDraft()
    }
    router.back()
  }

  function handleSubmit() {
    if (!canSubmit || isPending) return
    setError('')

    startTransition(async () => {
      // 이미지가 있으면 먼저 업로드
      let imageUrls: string[] = []
      if (images.length > 0) {
        const uploadData = new FormData()
        images.forEach((img) => uploadData.append('files', img.file))

        const uploadRes = await fetch('/api/uploads', {
          method: 'POST',
          body: uploadData,
        })
        if (!uploadRes.ok) {
          const err = await uploadRes.json()
          setError(err.error || '이미지 업로드에 실패했어요')
          return
        }
        const uploadResult = await uploadRes.json()
        imageUrls = uploadResult.images.map((img: { url: string }) => img.url)
      }

      // 게시글 생성
      const formData = new FormData()
      formData.set('boardSlug', selectedBoard)
      if (selectedCategory) formData.set('category', selectedCategory)
      formData.set('title', title)
      formData.set('content', content)
      imageUrls.forEach((url) => formData.append('imageUrls', url))

      const result = await createPost(formData)
      if (result?.error) {
        setError(result.error)
      } else {
        clearDraft()
      }
    })
  }

  // 미리보기 모달
  if (showPreview) {
    return (
      <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={() => setShowPreview(false)} />
        <div className="relative w-full max-w-[720px] bg-card rounded-t-2xl md:rounded-2xl p-6 shadow-xl max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-foreground">미리보기</h2>
            <button
              onClick={() => setShowPreview(false)}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-xl"
            >
              ✕
            </button>
          </div>

          {selectedCategory && (
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary text-[13px] font-bold w-fit mb-2">
              {selectedCategory}
            </span>
          )}
          <h3 className="text-xl font-bold text-foreground mb-4 leading-[1.4]">
            {title || '(제목 없음)'}
          </h3>
          <div
            className="prose prose-lg max-w-none text-base text-foreground leading-[1.85] mb-4 [word-break:keep-all] [&_img]:rounded-xl [&_img]:max-w-full [&_hr]:border-border [&_iframe]:w-full [&_iframe]:aspect-video [&_iframe]:rounded-xl"
            dangerouslySetInnerHTML={{ __html: content || '<p>(본문 없음)</p>' }}
          />

          {images.length > 0 && (
            <div className="flex gap-3 flex-wrap mb-4">
              {images.map((img, idx) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={idx}
                  src={img.url}
                  alt={`첨부 ${idx + 1}`}
                  className="w-24 h-24 object-cover rounded-xl border border-border"
                />
              ))}
            </div>
          )}

          <button
            onClick={() => setShowPreview(false)}
            className="w-full min-h-[52px] bg-primary text-white rounded-xl text-base font-bold transition-opacity hover:opacity-90"
          >
            돌아가기
          </button>
        </div>
      </div>
    )
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

      {/* 본문 입력 (TipTap 에디터) */}
      <div className="mb-6">
        <label className="flex items-center gap-1 text-xs font-bold text-foreground mb-2">
          본문 <span className="text-primary font-bold">*</span>
        </label>
        <TipTapEditor
          content={content}
          onChange={setContent}
          userGrade={userGrade}
          onImagesChange={setImages}
        />
        <div className={cn(
          'text-right text-[13px] font-medium text-muted-foreground mt-1',
          plainTextLength > 0 && plainTextLength < 10 && 'text-destructive font-bold'
        )}>
          {plainTextLength}자
        </div>
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
            className="min-h-[52px] lg:min-h-[48px] px-6 py-3.5 border-2 border-border rounded-xl bg-card text-foreground text-sm font-bold cursor-pointer transition-all hover:border-primary hover:text-primary"
            onClick={() => setShowPreview(true)}
            disabled={!title && !content}
          >
            미리보기
          </button>
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
