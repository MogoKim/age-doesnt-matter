'use client'

import { useState, useTransition, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createPost, updatePost } from '@/lib/actions/posts'
import { deleteDraft as deleteDraftAction } from '@/lib/actions/drafts'
import { useToast } from '@/components/common/Toast'
import { gtmPostCreate } from '@/lib/gtm'

// TipTap은 SSR 불가 → dynamic import
const TipTapEditor = dynamic(() => import('./TipTapEditor'), { ssr: false })

interface BoardOption {
  slug: string
  displayName: string
  categories: string[]
}

const AUTOSAVE_INTERVAL = 30_000 // 30초

function getDraftKey(boardSlug: string) {
  return `unae_post_draft_${boardSlug}`
}

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
  editData?: EditData
  serverDrafts?: ServerDraft[]
}

export default function PostWriteForm({ defaultBoard, boards, editData, serverDrafts = [] }: PostWriteFormProps) {
  const isEditMode = !!editData
  const router = useRouter()
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [selectedBoard, setSelectedBoard] = useState(() => {
    if (editData?.boardSlug) return editData.boardSlug
    if (defaultBoard && boards.some((b) => b.slug === defaultBoard)) return defaultBoard
    return boards[0]?.slug ?? ''
  })
  const [selectedCategory, setSelectedCategory] = useState(editData?.category || '')
  const [title, setTitle] = useState(editData?.title || '')
  const [content, setContent] = useState(editData?.content || '')
  const [showDraftList, setShowDraftList] = useState(false)
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<ServerDraft[]>(serverDrafts)

  const board = boards.find((b) => b.slug === selectedBoard)
  const categories = board?.categories.filter((c) => c !== '전체') || []

  const isTitleValid = title.length >= 2 && title.length <= 40
  // HTML 태그 제거 후 텍스트 길이 검사 (이미지/동영상만 있어도 유효)
  const plainTextLength = content.replace(/<[^>]*>/g, '').trim().length
  const hasMedia = /<(img|video)[^>]+src=/.test(content)
  const isContentValid = plainTextLength >= 10 || hasMedia
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
    // 서버 임시저장이 없으면 localStorage에서 복원 (게시판별 키)
    try {
      const saved = localStorage.getItem(getDraftKey(selectedBoard))
      if (saved) {
        const draft = JSON.parse(saved) as { board?: string; category?: string; title?: string; content?: string }
        if (draft.title || draft.content) {
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
      localStorage.setItem(getDraftKey(selectedBoard), JSON.stringify({
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

  // 모바일 앱 전환 시에도 임시저장
  useEffect(() => {
    if (!draftLoaded || isEditMode) return
    const handler = () => {
      if (document.visibilityState === 'hidden') saveLocalDraft()
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [saveLocalDraft, draftLoaded, isEditMode])

  function clearDraft() {
    try { localStorage.removeItem(getDraftKey(selectedBoard)) } catch { /* ignore */ }
    // 서버 임시저장도 삭제
    if (currentDraftId) {
      deleteDraftAction(currentDraftId).catch(() => {})
      setCurrentDraftId(null)
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
        setCurrentDraftId(draft.id)
        setShowDraftList(false)
        toast('임시저장된 글을 불러왔어요', 'info')
      } else {
        toast('임시저장 불러오기에 실패했어요', 'error')
      }
    } catch {
      toast('임시저장 불러오기에 실패했어요', 'error')
    }
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
    // 전환한 게시판의 임시저장 자동 로드
    try {
      const saved = localStorage.getItem(getDraftKey(slug))
      if (saved) {
        const draft = JSON.parse(saved) as { category?: string; title?: string; content?: string }
        if (draft.title || draft.content) {
          setSelectedCategory(draft.category || '')
          setTitle(draft.title || '')
          setContent(draft.content || '')
          toast('임시저장된 글을 불러왔어요', 'info')
        } else {
          setTitle('')
          setContent('')
        }
      } else {
        setTitle('')
        setContent('')
      }
    } catch {
      // 파싱 실패 → 손상된 draft 삭제하고 초기화
      try { localStorage.removeItem(getDraftKey(slug)) } catch { /* ignore */ }
      setTitle('')
      setContent('')
    }
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
      const formData = new FormData()
      formData.set('boardSlug', selectedBoard)
      if (selectedCategory) formData.set('category', selectedCategory)
      formData.set('title', title)
      formData.set('content', content)

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

  return (
    <>
      {/* ── 상단 헤더 (타이틀) ── */}
      <div className="sticky top-[120px] lg:top-[64px] z-30 bg-card border-b border-border flex items-center justify-center px-1 h-[52px] -mx-4 mb-4 md:-mx-6">
        <span className="text-body font-bold text-foreground">
          {isEditMode ? '수정하기' : '글쓰기'}
        </span>
      </div>

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
      <div className="mb-6 pb-[80px]">
        <label className="flex items-center gap-1 text-caption font-bold text-foreground mb-2">
          본문 <span className="text-primary font-bold">*</span>
        </label>
        <TipTapEditor
          content={content}
          onChange={setContent}
        />
        <div className={cn(
          'text-right text-caption font-medium text-muted-foreground mt-1',
          plainTextLength > 0 && plainTextLength < 10 && 'text-destructive font-bold'
        )}>
          {plainTextLength}자
        </div>
      </div>

      {/* 하단 CTA 버튼 (fixed) */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border px-4 pt-3"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      >
        <div className="flex gap-3 max-w-[720px] mx-auto">
          <button
            type="button"
            onClick={handleCancel}
            className="flex-1 min-h-[52px] rounded-xl border-2 border-border text-body font-bold text-muted-foreground hover:bg-muted transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || isPending}
            className="flex-1 min-h-[52px] rounded-xl bg-primary text-white text-body font-bold transition-colors hover:bg-[#E85D50] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? (isEditMode ? '수정중...' : '등록중...') : (isEditMode ? '수정' : '등록')}
          </button>
        </div>
      </div>
    </>
  )
}
