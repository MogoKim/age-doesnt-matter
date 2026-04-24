'use client'

import { useState, useTransition, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createPost, updatePost } from '@/lib/actions/posts'
import { deleteDraft as deleteDraftAction } from '@/lib/actions/drafts'
import { useToast } from '@/components/common/Toast'
import { gtmPostCreate } from '@/lib/gtm'
import BottomSheet from '@/components/ui/BottomSheet'
import { ChevronDown } from 'lucide-react'

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
  // 모바일 키보드 열림 감지 (visualViewport resize) — 하단 CTA 바 표시/숨김 제어
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false)
  const [categorySheetOpen, setCategorySheetOpen] = useState(false)

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

  // 모바일 키보드 열림/닫힘 감지 — visualViewport resize 이벤트
  // interactiveWidget=overlays-content 설정 시 window.innerHeight 고정 → 공식 정확
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const handler = () => {
      const kbH = Math.max(0, window.innerHeight - vv.height - (vv.offsetTop ?? 0))
      setIsKeyboardOpen(kbH > 30)
    }
    vv.addEventListener('resize', handler)
    return () => vv.removeEventListener('resize', handler)
  }, [])

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


  function handleCancel() {
    if (title || content) {
      if (!confirm('작성 중인 내용이 사라져요. 나가시겠어요?')) return
      clearDraft()
    }
    router.back()
  }

  function handleSubmit() {
    if (isPending) return
    if (!canSubmit) {
      if (!isTitleValid) {
        toast(title.length === 0 ? '제목을 입력해 주세요' : '제목은 2~40자로 입력해 주세요', 'error')
      } else if (!isContentValid) {
        toast('본문은 10자 이상 입력해 주세요', 'error')
      } else {
        toast('게시판을 선택해 주세요', 'error')
      }
      return
    }
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
        toast(result.error, 'error')
      } else {
        if (!isEditMode) {
          gtmPostCreate(selectedBoard, selectedCategory)
          window.dispatchEvent(new CustomEvent('pwa-prompt', { detail: 'engagement' }))
        }
        clearDraft()
        if (result?.postUrl) router.push(result.postUrl)
      }
    })
  }

  // ── 글쓰기 전용 고정 헤더 (GNB 대체) ──
  const writeHeader = (
    <div className="fixed top-0 left-0 right-0 z-40 bg-card border-b border-border h-[52px] flex items-center justify-between px-4">
      <button
        type="button"
        onClick={handleCancel}
        className="min-w-[44px] h-[52px] flex items-center justify-start text-body text-muted-foreground"
      >
        취소
      </button>
      <span className="text-body font-bold text-foreground">
        {isEditMode ? '수정하기' : (board?.displayName ? `${board.displayName} 글쓰기` : '글쓰기')}
      </span>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit || isPending}
        className={cn(
          'min-w-[44px] h-[52px] flex items-center justify-end text-body font-bold transition-colors',
          canSubmit && !isPending ? 'text-primary' : 'text-muted-foreground opacity-50'
        )}
      >
        {isPending ? (isEditMode ? '수정중' : '등록중') : (isEditMode ? '수정' : '등록')}
      </button>
    </div>
  )

  // 임시저장 목록 모달
  if (showDraftList && drafts.length > 0) {
    return (
      <>
        {writeHeader}
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
      </>
    )
  }

  return (
    <>
      {/* ── 글쓰기 전용 헤더 ── */}
      {writeHeader}

      {error && (
        <div className="mb-4 p-4 rounded-xl bg-destructive/10 text-destructive text-sm font-medium">
          {error}
        </div>
      )}


      {/* 카테고리 선택 — BottomSheet 셀렉터 */}
      {categories.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setCategorySheetOpen(true)}
            className="w-full min-h-[56px] flex items-center justify-between px-0 py-4 border-b-2 border-border mb-2"
          >
            <span className={cn(
              'text-[17px] font-medium',
              selectedCategory ? 'text-foreground' : 'text-muted-foreground'
            )}>
              {selectedCategory || '카테고리를 선택해주세요'}
            </span>
            <ChevronDown className={cn(
              'w-5 h-5 shrink-0 transition-colors',
              selectedCategory ? 'text-primary' : 'text-muted-foreground'
            )} />
          </button>
          <BottomSheet
            open={categorySheetOpen}
            onClose={() => setCategorySheetOpen(false)}
            title="카테고리"
          >
            <div className="space-y-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => { setSelectedCategory(cat); setCategorySheetOpen(false) }}
                  className={cn(
                    'w-full min-h-[52px] flex items-center px-4 rounded-xl text-body transition-colors',
                    selectedCategory === cat
                      ? 'bg-primary/10 text-primary font-bold'
                      : 'text-foreground hover:bg-muted'
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </BottomSheet>
        </>
      )}

      {/* 제목 입력 */}
      <div className="mb-4">
        <input
          type="text"
          className="w-full min-h-[60px] px-0 py-4 border-0 border-b-2 border-border text-[22px] font-bold text-foreground bg-transparent outline-none transition-colors focus:border-primary placeholder:text-muted-foreground placeholder:font-normal placeholder:text-[22px]"
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
      {/* 키보드 없을 때: 툴바(48px) + CTA(56px) + 여유 = pb-[116px] */}
      {/* 키보드 있을 때: 툴바(48px) + 여유 = pb-[60px] */}
      <div className={cn('mb-6', isKeyboardOpen ? 'pb-[60px]' : 'pb-[116px]')}>
        <TipTapEditor
          content={content}
          onChange={setContent}
          placeholder="내용을 입력해 주세요"
          bottomBarHeight={isKeyboardOpen ? 0 : 56}
        />
        <div className={cn(
          'text-right text-caption font-medium text-muted-foreground mt-1',
          plainTextLength > 0 && plainTextLength < 10 && 'text-destructive font-bold'
        )}>
          {plainTextLength}자
        </div>
      </div>

      {/* ── 하단 CTA 바 (키보드 없을 때만 표시) ── */}
      {/* 키보드 올라오면 자동 숨김 → 상단 헤더 [등록] 버튼만 사용 */}
      {!isKeyboardOpen && (
        <div
          className="fixed bottom-0 left-0 right-0 z-[39] bg-card border-t border-border"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || isPending}
            className={cn(
              'w-full h-[56px] text-body font-bold transition-colors',
              canSubmit && !isPending
                ? 'bg-primary text-white'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {isPending
              ? (isEditMode ? '수정 중...' : '등록 중...')
              : (isEditMode ? '수정하기' : '등록하기')}
          </button>
        </div>
      )}

    </>
  )
}
