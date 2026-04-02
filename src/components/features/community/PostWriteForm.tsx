'use client'

import { useState, useTransition, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createPost, updatePost } from '@/lib/actions/posts'
import { saveDraft as saveDraftAction, deleteDraft as deleteDraftAction } from '@/lib/actions/drafts'
import { useToast } from '@/components/common/Toast'
import { gtmPostCreate } from '@/lib/gtm'
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

interface EditData {
  postId: string
  boardSlug: string
  category: string
  title: string
  content: string
}

interface ServerDraft {
  id: string
  boardSlug: string
  category: string | null
  title: string
  updatedAt: string
}

interface PostWriteFormProps {
  defaultBoard?: string
  boards: BoardOption[]
  userGrade?: string
  editData?: EditData
  serverDrafts?: ServerDraft[]
}

export default function PostWriteForm({ defaultBoard, boards, userGrade = 'SPROUT', editData, serverDrafts = [] }: PostWriteFormProps) {
  const isEditMode = !!editData
  const router = useRouter()
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [isSavingDraft, setSavingDraft] = useState(false)
  const [error, setError] = useState('')
  const [selectedBoard, setSelectedBoard] = useState(editData?.boardSlug || defaultBoard || boards[0]?.slug || 'stories')
  const [selectedCategory, setSelectedCategory] = useState(editData?.category || '')
  const [title, setTitle] = useState(editData?.title || '')
  const [content, setContent] = useState(editData?.content || '')
  const [images, setImages] = useState<ImagePreview[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [showDraftList, setShowDraftList] = useState(false)
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<ServerDraft[]>(serverDrafts)

  const lastSavedRef = useRef('')

  const board = boards.find((b) => b.slug === selectedBoard)
  const categories = board?.categories.filter((c) => c !== '전체') || []

  const isTitleValid = title.length >= 2 && title.length <= 40
  // HTML 태그 제거 후 텍스트 길이 검사
  const plainTextLength = content.replace(/<[^>]*>/g, '').trim().length
  const isContentValid = plainTextLength >= 10
  const canSubmit = isTitleValid && isContentValid && selectedBoard && boards.length > 0

  // localStorage 임시저장 복원 (수정 모드에서는 스킵)
  useEffect(() => {
    if (isEditMode) {
      setDraftLoaded(true)
      return
    }
    // 서버 임시저장이 있으면 목록 표시
    if (serverDrafts.length > 0) {
      setShowDraftList(true)
      setDraftLoaded(true)
      return
    }
    // 서버 임시저장이 없으면 localStorage에서 복원
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

  // 자동 임시저장 — localStorage (30초마다)
  const saveLocalDraft = useCallback(() => {
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
    if (!draftLoaded || isEditMode) return
    const timer = setInterval(saveLocalDraft, AUTOSAVE_INTERVAL)
    return () => clearInterval(timer)
  }, [saveLocalDraft, draftLoaded, isEditMode])

  // 페이지 이탈 시에도 임시저장
  useEffect(() => {
    if (!draftLoaded || isEditMode) return
    const handleBeforeUnload = () => saveLocalDraft()
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [saveLocalDraft, draftLoaded, isEditMode])

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
    // 서버 임시저장도 삭제
    if (currentDraftId) {
      deleteDraftAction(currentDraftId).catch(() => {})
      setCurrentDraftId(null)
    }
  }

  // 서버 임시저장 (수동)
  async function handleSaveDraft() {
    if (!title && !content) {
      toast('제목이나 본문을 입력해주세요', 'error')
      return
    }
    const snapshot = `${selectedBoard}|${selectedCategory}|${title}|${content}`
    if (snapshot === lastSavedRef.current) {
      toast('이미 저장되었어요', 'info')
      return
    }

    setSavingDraft(true)
    try {
      const formData = new FormData()
      formData.set('boardSlug', selectedBoard)
      if (selectedCategory) formData.set('category', selectedCategory)
      formData.set('title', title)
      formData.set('content', content)

      const result = await saveDraftAction(currentDraftId, formData)
      if (result.error) {
        toast(result.error, 'error')
      } else {
        setCurrentDraftId(result.draftId ?? null)
        lastSavedRef.current = snapshot
        toast('임시저장 완료', 'success')
      }
    } catch {
      toast('임시저장에 실패했어요', 'error')
    } finally {
      setSavingDraft(false)
    }
  }

  // 서버 임시저장 불러오기
  async function loadDraft(draft: ServerDraft) {
    setSelectedBoard(draft.boardSlug)
    setSelectedCategory(draft.category || '')
    setTitle(draft.title)
    // content는 서버에서 전체를 가져와야 함 — API 호출
    try {
      const res = await fetch(`/api/drafts/${draft.id}`)
      if (res.ok) {
        const data = await res.json()
        setContent(data.content ?? '')
      }
    } catch { /* ignore */ }
    setCurrentDraftId(draft.id)
    setShowDraftList(false)
    toast('임시저장된 글을 불러왔어요', 'info')
  }

  // 서버 임시저장 삭제
  async function handleDeleteDraft(draftId: string) {
    const result = await deleteDraftAction(draftId)
    if (!result.error) {
      setDrafts((prev) => prev.filter((d) => d.id !== draftId))
      if (currentDraftId === draftId) setCurrentDraftId(null)
      toast('삭제했어요', 'success')
    }
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

      // 게시글 생성 또는 수정
      const formData = new FormData()
      formData.set('boardSlug', selectedBoard)
      if (selectedCategory) formData.set('category', selectedCategory)
      formData.set('title', title)
      formData.set('content', content)
      imageUrls.forEach((url) => formData.append('imageUrls', url))

      const result = isEditMode
        ? await updatePost(editData.postId, formData)
        : await createPost(formData)
      if (result?.error) {
        setError(result.error)
      } else {
        if (!isEditMode) gtmPostCreate(selectedBoard, selectedCategory)
        clearDraft()
        if (result?.postUrl) router.push(result.postUrl)
      }
    })
  }

  // 임시저장 목록 모달
  if (showDraftList && drafts.length > 0) {
    return (
      <div className="mb-6 p-5 bg-card border-2 border-primary/20 rounded-2xl">
        <h3 className="text-body font-bold text-foreground mb-3">임시저장된 글이 있어요</h3>
        <div className="space-y-2 mb-4">
          {drafts.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 p-3 bg-background rounded-xl">
              <button
                className="flex-1 text-left cursor-pointer min-h-[52px] flex flex-col justify-center"
                onClick={() => loadDraft(d)}
              >
                <span className="text-sm font-bold text-foreground line-clamp-1">
                  {d.title || '(제목 없음)'}
                </span>
                <span className="text-caption text-muted-foreground">
                  {new Date(d.updatedAt).toLocaleDateString('ko-KR')}
                </span>
              </button>
              <button
                className="shrink-0 text-caption text-muted-foreground min-h-[52px] min-w-[44px] flex items-center justify-center hover:text-destructive transition-colors cursor-pointer"
                onClick={() => handleDeleteDraft(d.id)}
              >
                삭제
              </button>
            </div>
          ))}
        </div>
        <button
          className="w-full min-h-[52px] border-2 border-border rounded-xl text-sm font-bold text-muted-foreground cursor-pointer hover:border-foreground hover:text-foreground transition-all"
          onClick={() => setShowDraftList(false)}
        >
          새로 작성하기
        </button>
      </div>
    )
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
              className="min-h-[52px] min-w-[52px] lg:min-h-[44px] lg:min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-xl"
            >
              ✕
            </button>
          </div>

          {selectedCategory && (
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary text-caption font-bold w-fit mb-2">
              {selectedCategory}
            </span>
          )}
          <h3 className="text-xl font-bold text-foreground mb-4 leading-[1.4]">
            {title || '(제목 없음)'}
          </h3>
          <div
            className="prose prose-lg max-w-none text-body text-foreground leading-[1.85] mb-4 [word-break:keep-all] [&_img]:rounded-xl [&_img]:max-w-full [&_hr]:border-border [&_iframe]:w-full [&_iframe]:aspect-video [&_iframe]:rounded-xl"
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
            className="w-full min-h-[52px] bg-primary text-white rounded-xl text-body font-bold transition-opacity hover:opacity-90"
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

      {/* 게시판 선택 — defaultBoard가 없을 때만 표시 (FAB에서 진입 시 자동 선택됨) */}
      {!defaultBoard && !isEditMode && (
        <div className="flex gap-2 mb-6">
          {boards.map((b) => {
            const slug = b.slug
            return (
              <button
                key={slug}
                className={cn(
                  'flex-1 min-h-[52px] px-4 py-3.5 border-2 rounded-2xl text-caption font-medium cursor-pointer transition-all text-center shadow-sm',
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
      )}

      {/* 카테고리 선택 */}
      {categories.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-6">
          {categories.map((cat) => (
            <button
              key={cat}
              className={cn(
                'shrink-0 px-5 py-2.5 rounded-full border-2 text-caption font-medium cursor-pointer transition-all min-h-[52px] flex items-center whitespace-nowrap shadow-sm',
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
        <label className="flex items-center gap-1 text-caption font-bold text-foreground mb-2">
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
          'text-right text-caption font-medium text-muted-foreground mt-1',
          (title.length > 40 || (title.length > 0 && title.length < 2)) && 'text-destructive font-bold'
        )}>
          {title.length}/40
        </div>
      </div>

      {/* 본문 입력 (TipTap 에디터) */}
      <div className="mb-6">
        <label className="flex items-center gap-1 text-caption font-bold text-foreground mb-2">
          본문 <span className="text-primary font-bold">*</span>
        </label>
        <TipTapEditor
          content={content}
          onChange={setContent}
          onImagesChange={setImages}
        />
        <div className={cn(
          'text-right text-caption font-medium text-muted-foreground mt-1',
          plainTextLength > 0 && plainTextLength < 10 && 'text-destructive font-bold'
        )}>
          {plainTextLength}자
        </div>
      </div>

      {/* 하단 액션바 */}
      <div className="py-6 border-t border-border mt-8 space-y-3">
        {/* 등록 버튼 — 항상 전체 너비 */}
        <button
          className="w-full min-h-[52px] lg:min-h-[48px] py-3.5 border-none rounded-xl bg-primary text-white text-body font-bold cursor-pointer transition-all shadow-[0_2px_8px_rgba(255,111,97,0.3)] hover:bg-[#E85D50] hover:shadow-[0_4px_12px_rgba(255,111,97,0.4)] hover:-translate-y-px disabled:bg-border disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0"
          disabled={!canSubmit || isPending}
          onClick={handleSubmit}
        >
          {isPending ? (isEditMode ? '수정 중...' : '등록 중...') : (isEditMode ? '수정하기' : '등록하기')}
        </button>

        {/* 보조 버튼들 */}
        <div className="flex gap-2">
          <button
            className="flex-1 min-h-[52px] lg:min-h-[48px] py-3.5 border-2 border-border rounded-xl bg-card text-muted-foreground text-caption font-bold cursor-pointer transition-all hover:border-muted-foreground hover:text-foreground"
            onClick={handleCancel}
          >
            취소
          </button>
          {!isEditMode && (
            <button
              className="flex-1 min-h-[52px] lg:min-h-[48px] py-3.5 border-2 border-border rounded-xl bg-card text-foreground text-caption font-bold cursor-pointer transition-all hover:border-primary hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleSaveDraft}
              disabled={isSavingDraft || (!title && !content)}
            >
              {isSavingDraft ? '저장 중...' : '임시저장'}
            </button>
          )}
          <button
            className="flex-1 min-h-[52px] lg:min-h-[48px] py-3.5 border-2 border-border rounded-xl bg-card text-foreground text-caption font-bold cursor-pointer transition-all hover:border-primary hover:text-primary"
            onClick={() => setShowPreview(true)}
            disabled={!title && !content}
          >
            미리보기
          </button>
        </div>
      </div>
    </>
  )
}
