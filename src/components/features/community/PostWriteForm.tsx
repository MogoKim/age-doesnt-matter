'use client'

import { useState, useTransition, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createPost, updatePost } from '@/lib/actions/posts'
import { deleteDraft as deleteDraftAction } from '@/lib/actions/drafts'
import { useToast } from '@/components/common/Toast'
import { gtmPostCreate, sendGtmEvent } from '@/lib/gtm'
import { trackEvent } from '@/lib/track'
import { setPushToastTrigger } from '@/components/common/PushPermissionToast'
import BottomSheet from '@/components/ui/BottomSheet'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { ChevronDown } from 'lucide-react'
import { useAppSession } from '@/components/common/AppSessionProvider'
import { readDraft, saveDraft, removeDraft, findLatestDraft, type WriteDraft } from '@/lib/write-draft'
import WriteLoginPrompt from './WriteLoginPrompt'

function TipTapEditorFallback() {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden" aria-hidden="true">
      <div className="min-h-[280px] p-4">
        <div className="h-5 w-44 rounded-full bg-muted mb-4" />
        <div className="space-y-3">
          <div className="h-4 w-full rounded-full bg-muted/80" />
          <div className="h-4 w-11/12 rounded-full bg-muted/80" />
          <div className="h-4 w-3/4 rounded-full bg-muted/80" />
        </div>
      </div>
      <div className="h-[56px] border-t border-border bg-background flex items-center gap-3 px-4">
        <div className="h-9 w-9 rounded-full bg-muted" />
        <div className="h-9 w-9 rounded-full bg-muted" />
        <div className="h-9 w-9 rounded-full bg-muted" />
      </div>
    </div>
  )
}

// TipTap은 SSR 불가 → dynamic import
const TipTapEditor = dynamic(() => import('./TipTapEditor'), {
  ssr: false,
  loading: () => <TipTapEditorFallback />,
})

interface BoardOption {
  slug: string
  displayName: string
  categories: string[]
}

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
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const userEditedRef = useRef(false)

  // 비회원도 폼을 열고 글을 쓸 수 있다. 로그인은 등록을 누를 때 요청한다.
  const { status } = useAppSession()
  const isLoggedIn = status === 'authenticated'
  const [showLoginPrompt, setShowLoginPrompt] = useState(false)
  // 로그인 왕복에서 ?board=…가 떨어져 나갔을 때 쓰는 안전망 — 다른 게시판의 임시저장
  const [otherBoardDraft, setOtherBoardDraft] = useState<WriteDraft | null>(null)

  const board = boards.find((b) => b.slug === selectedBoard)
  const categories = board?.categories.filter((c) => c !== '전체') || []

  const isTitleValid = title.length >= 2 && title.length <= 40
  // HTML 태그 제거 후 텍스트 길이 검사 (이미지/동영상만 있어도 유효)
  const plainTextLength = content.replace(/<[^>]*>/g, '').trim().length
  const hasMedia = /<(img|video)[^>]+src=/.test(content)
  const isContentValid = plainTextLength >= 10 || hasMedia
  const canSubmit = isTitleValid && isContentValid && selectedBoard && boards.length > 0

  // 이 화면에서 localStorage 임시저장을 이미 복원했는지 — 서버 목록을 띄울지 판단에 쓴다
  const restoredLocalRef = useRef(false)

  // localStorage 임시저장 복원 (수정 모드에서는 스킵)
  useEffect(() => {
    if (isEditMode) {
      setDraftLoaded(true)
      return
    }

    // 지금 게시판의 임시저장을 먼저 본다
    const local = readDraft(selectedBoard)
    if (local) {
      restoredLocalRef.current = true
      setSelectedCategory(local.category)
      setTitle(local.title)
      setContent(local.content)
      toast('쓰던 글을 불러왔어요', 'info')
    } else {
      // 없으면 다른 게시판에 작성하던 글이 있는지 본다.
      // 로그인 왕복에서 ?board=…가 떨어져 나가면 폼이 엉뚱한 게시판으로 열리는데,
      // 그때 방금 쓴 글을 못 찾고 빈 화면이 되는 걸 막는 안전망이다.
      // 찾기만 하고 적용하지 않는다 — 게시판을 말없이 바꾸면 엉뚱한 곳에 글이 올라간다.
      const other = findLatestDraft(boards.map((b) => b.slug).filter((s) => s !== selectedBoard))
      if (other) setOtherBoardDraft(other)
    }
    setDraftLoaded(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 서버 임시저장 목록 — 로그인 확인이 끝난 뒤에 가져온다.
  // 세션 상태는 마운트 직후 'loading'이라, 위 복원 effect에 같이 두면 회원인데도 건너뛴다.
  useEffect(() => {
    if (isEditMode || !draftLoaded) return
    if (!isLoggedIn) return          // 비회원은 401만 받는다
    if (restoredLocalRef.current) return  // 이미 이어서 쓰는 중이면 목록으로 방해하지 않는다
    let cancelled = false
    fetch('/api/drafts')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { drafts?: ServerDraft[] } | null) => {
        if (cancelled || userEditedRef.current) return
        const nextDrafts = data?.drafts ?? []
        if (nextDrafts.length === 0) return
        setDrafts(nextDrafts)
        setShowDraftList(true)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [isEditMode, draftLoaded, isLoggedIn])

  // iOS Safari 개인정보 보호 모드: QuotaExceededError 시 반복 토스트 방지
  const draftSaveFailedRef = useRef(false)

  // 자동 임시저장 — localStorage (30초마다)
  const saveLocalDraft = useCallback((): boolean => {
    if (!title && !content) return false
    const ok = saveDraft(
      { board: selectedBoard, category: selectedCategory, title, content },
      Date.now(),
    )
    if (!ok && !draftSaveFailedRef.current) {
      draftSaveFailedRef.current = true
      toast('임시저장에 실패했어요 — 브라우저 저장공간이 가득 찼을 수 있어요', 'error')
    }
    return ok
  }, [selectedBoard, selectedCategory, title, content, toast])

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

  // ── 상단바를 키보드 위에 붙들어 둔다 ──
  // position:fixed의 기준은 layout viewport다. 모바일 브라우저는 키보드가 올라올 때
  // layout viewport는 그대로 두고 visual viewport만 줄인 뒤 아래로 밀어서(offsetTop)
  // 커서를 보여준다. 그래서 fixed top-0 헤더는 화면 위로 밀려 나가 안 보이게 된다.
  // 밀린 만큼(offsetTop) 헤더를 아래로 내려주면 항상 화면 맨 위에 남는다.
  //
  // viewport meta의 interactiveWidget으로도 해결되지만 그건 전역 설정이라
  // 하단 CTA·툴바까지 같이 키보드 위로 올라온다 — 이번 PR 범위 밖이라 쓰지 않는다.
  //
  // ref는 콜백 ref다. 임시저장 목록 분기에서 헤더가 다시 마운트돼도 그 자리에서
  // 마지막 offset을 바로 다시 입힌다(=툴바가 겪은 "effect가 ref보다 먼저 돌아 죽는" 문제 회피).
  const headerElRef = useRef<HTMLDivElement | null>(null)
  const headerOffsetRef = useRef(0)
  const applyHeaderOffset = useCallback((el: HTMLDivElement | null) => {
    if (el) el.style.transform = `translateY(${headerOffsetRef.current}px)`
  }, [])
  const setHeaderEl = useCallback((el: HTMLDivElement | null) => {
    headerElRef.current = el
    applyHeaderOffset(el)
  }, [applyHeaderOffset])

  useEffect(() => {
    const vv = window.visualViewport
    // visualViewport가 없는 브라우저는 손대지 않는다 — 지금까지의 fixed top-0 그대로 동작
    if (!vv) return
    const update = () => {
      const next = Math.max(0, Math.round(vv.offsetTop))
      if (next === headerOffsetRef.current) return
      headerOffsetRef.current = next
      applyHeaderOffset(headerElRef.current)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [applyHeaderOffset])

  // 글쓰기 퍼널 추적 — 진입 이벤트 (편집 모드 제외).
  // 세션 확정('loading'이 끝난 뒤) 후 한 번만 보낸다. 비회원도 폼에 들어올 수 있게 되면서
  // 이 이벤트에 두 집단이 섞이는데, 마운트 즉시 보내면 회원까지 전부 비회원으로 찍힌다.
  const funnelSentRef = useRef(false)
  useEffect(() => {
    if (isEditMode || funnelSentRef.current) return
    if (status === 'loading') return
    funnelSentRef.current = true
    sendGtmEvent('post_create_started', {
      board_type: selectedBoard,
      has_draft: !!(title || content),
      is_member: isLoggedIn,
    })
    trackEvent('post_create_started', { board_type: selectedBoard })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, isEditMode])

  function clearDraft() {
    removeDraft(selectedBoard)
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
    } else {
      toast('삭제에 실패했어요. 잠시 후 다시 시도해 주세요', 'error')
    }
  }


  function proceedCancel() {
    if (title || content) {
      sendGtmEvent('post_write_abandoned', {
        board_type: selectedBoard,
        category: selectedCategory,
        has_title: !!title,
        content_length: content.replace(/<[^>]*>/g, '').trim().length,
      })
      clearDraft()
    }
    // router.back() 제거 — 구글/카카오 직접 진입 유저가 외부로 이탈하는 버그 방지
    if (isEditMode && editData) {
      router.push(`/community/${editData.boardSlug}/${editData.postId}`)
    } else if (selectedBoard) {
      router.push(`/community/${selectedBoard}`)
    } else {
      router.push('/community')
    }
  }

  function handleCancel() {
    if (title || content) {
      setShowCancelDialog(true)
      return
    }
    proceedCancel()
  }

  function handleSubmit() {
    if (isPending) return
    if (!canSubmit) {
      if (!isTitleValid) {
        toast(title.length === 0 ? '제목을 입력해 주세요' : '제목은 2~40자로 입력해 주세요', 'error')
      } else if (!isContentValid) {
        toast('내용을 10자 이상 입력해 주세요.', 'error')
      } else {
        toast('게시판을 선택해 주세요', 'error')
      }
      return
    }
    setError('')

    // 비회원: 여기서 멈춘다. 글을 먼저 저장해 두고 로그인을 요청한다.
    // 저장(createPost)은 호출하지 않는다 — 서버에서도 세션 없이는 거부되고,
    // 로그인 후 사용자가 내용을 확인하고 직접 등록을 눌러야 한다(자동 등록 안 함).
    if (!isEditMode && !isLoggedIn) {
      const saved = saveLocalDraft()
      if (!saved) {
        // 저장공간이 막힌 브라우저(사파리 시크릿 등) — 지금 로그인하러 나가면 글이 사라진다
        toast('이 브라우저에서는 임시저장이 안 돼요. 글을 복사해 두신 뒤 로그인해 주세요', 'error')
      }
      setShowLoginPrompt(true)
      return
    }

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
          trackEvent('post_create', { board_type: selectedBoard, category: selectedCategory })
          window.dispatchEvent(new CustomEvent('pwa-prompt', { detail: 'engagement' }))
          // 글 작성 직후 푸시 구독 유도 (작성자=답글 알림 가치 최고). 글상세 이동 후에도 이벤트 재평가로 노출
          setPushToastTrigger('post')
        }
        clearDraft()
        if (result?.postUrl) router.push(result.postUrl)
      }
    })
  }

  // ── 글쓰기 전용 고정 헤더 (GNB 대체) ──
  const writeHeader = (
    <div
      ref={setHeaderEl}
      className="fixed top-0 left-0 right-0 z-40 bg-card border-b border-border h-[52px] flex items-center justify-between px-4 will-change-transform"
    >
      <button
        type="button"
        onClick={handleCancel}
        className="min-w-[52px] h-[52px] flex items-center justify-start text-body text-muted-foreground"
      >
        취소
      </button>
      <span className="text-body font-bold text-foreground">
        {isEditMode ? '수정하기' : (board?.displayName ? `${board.displayName} 글쓰기` : '글쓰기')}
      </span>
      {/* 등록 상태를 색이 아니라 '채워진 알약 vs 회색 알약'으로 구분한다.
          모양이 고정이라 어디를 눌러야 하는지 항상 같은 자리에서 보인다.
          바깥 button이 터치 영역 52px을 담당하고, 안쪽 span이 보이는 알약이다. */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit || isPending}
        className="min-w-[52px] h-[52px] flex items-center justify-end"
      >
        <span
          className={cn(
            'inline-flex items-center justify-center h-[40px] px-4 rounded-full text-base font-bold transition-colors',
            canSubmit && !isPending
              ? 'bg-primary text-white'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {isPending ? (isEditMode ? '수정중' : '등록중') : (isEditMode ? '수정' : '등록')}
        </span>
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
                <span className="text-xs font-bold text-foreground line-clamp-1">
                  {d.title || '(제목 없음)'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(d.updatedAt).toLocaleDateString('ko-KR')}
                </span>
              </button>
              <button
                className="shrink-0 text-xs text-muted-foreground min-h-[52px] min-w-[44px] flex items-center justify-center hover:text-destructive transition-colors cursor-pointer"
                onClick={() => handleDeleteDraft(d.id)}
              >
                삭제
              </button>
            </div>
          ))}
        </div>
        <button
          className="w-full min-h-[52px] border-2 border-border rounded-xl text-body font-bold text-muted-foreground cursor-pointer hover:border-foreground hover:text-foreground transition-colors"
          onClick={() => setShowDraftList(false)}
        >
          새로 작성하기
        </button>
      </div>
      <ConfirmDialog
        open={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onConfirm={() => { setShowCancelDialog(false); proceedCancel() }}
        title="글쓰기를 그만할까요?"
        message="지금 나가면 작성 중인 내용이 사라져요."
        confirmLabel="나가기"
        cancelLabel="계속 쓰기"
        variant="destructive"
      />
      </>
    )
  }

  return (
    <>
      {/* ── 글쓰기 전용 헤더 ── */}
      {writeHeader}

      {error && (
        <div className="mb-4 p-4 rounded-xl bg-destructive/10 text-destructive text-xs font-medium">
          {error}
        </div>
      )}

      {/* 다른 게시판에 작성하던 글 안내 — 로그인 왕복에서 ?board=…가 떨어졌을 때의 안전망.
          누르기 전에는 아무것도 바꾸지 않는다(게시판이 말없이 바뀌면 엉뚱한 곳에 올라간다).
          카드가 아니라 낮은 안내 바 한 줄. 테두리·그림자 없이 bg-primary/5 한 겹만.
          글씨가 커져 한 줄에 안 들어가면 버튼이 아래로 접힌다(잘리지 않게 flex-wrap). */}
      {otherBoardDraft && !title && !content && (
        <div className="mb-4 flex flex-wrap items-center gap-x-1 gap-y-0.5 rounded-xl bg-primary/5 py-0.5 pl-3 pr-1">
          <p className="flex-1 whitespace-nowrap text-caption text-foreground">쓰던 글이 있어요</p>
          <button
            type="button"
            className="min-h-[52px] shrink-0 rounded-xl px-2 text-caption font-bold text-primary-text"
            onClick={() => {
              setSelectedBoard(otherBoardDraft.board)
              setSelectedCategory(otherBoardDraft.category)
              setTitle(otherBoardDraft.title)
              setContent(otherBoardDraft.content)
              setOtherBoardDraft(null)
              toast('쓰던 글을 불러왔어요', 'info')
            }}
          >
            이어서 쓰기
          </button>
          <button
            type="button"
            aria-label="안내 닫기"
            className="min-h-[52px] min-w-[52px] shrink-0 text-caption text-muted-foreground"
            onClick={() => setOtherBoardDraft(null)}
          >
            ✕
          </button>
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
              'text-xs font-medium',
              selectedCategory ? 'text-foreground' : 'text-muted-foreground'
            )}>
              {selectedCategory || '주제 고르기 (선택)'}
            </span>
            <ChevronDown className={cn(
              'w-5 h-5 shrink-0 transition-colors',
              selectedCategory ? 'text-primary-text' : 'text-muted-foreground'
            )} />
          </button>
          <BottomSheet
            open={categorySheetOpen}
            onClose={() => setCategorySheetOpen(false)}
            title="주제 고르기"
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
                      ? 'bg-primary/10 text-primary-text font-bold'
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
          onChange={(e) => {
            userEditedRef.current = true
            setTitle(e.target.value)
          }}
          maxLength={40}
        />
        {/* 글자 수는 필요할 때만 보여준다 — 한 글자도 안 썼는데 0/40이 떠 있으면
            숙제처럼 보인다. 40자에 가까워졌을 때(30자~)와 너무 짧을 때만 띄운다. */}
        {(title.length >= 30 || (title.length > 0 && title.length < 2)) && (
          <div className={cn(
            'text-right text-xs font-medium text-muted-foreground mt-1',
            title.length > 0 && title.length < 2 && 'text-destructive font-bold'
          )}>
            {title.length}/40
          </div>
        )}
      </div>

      {/* 본문 입력 (TipTap 에디터) */}
      {/* 키보드 없을 때: 툴바(56px) + CTA(56px) + 여유 = pb-[124px] */}
      {/* 키보드 있을 때: 툴바(56px) + 여유 = pb-[68px] */}
      <div className={cn('mb-6', isKeyboardOpen ? 'pb-[68px]' : 'pb-[124px]')}>
        <TipTapEditor
          content={content}
          onChange={(value) => {
            userEditedRef.current = true
            setContent(value)
          }}
          placeholder="내용을 10자 이상 입력해 주세요."
          bottomBarHeight={isKeyboardOpen ? 0 : 56}
        />
        {/* '0자'를 항상 띄우는 대신, 아직 모자랄 때만 무엇이 필요한지 말로 알려준다.
            사진·동영상만 올려도 등록되는 규칙(isContentValid)을 그대로 따른다. */}
        {plainTextLength > 0 && !isContentValid && (
          <p className="mt-2 text-xs font-bold text-primary-text">
            내용을 10자 이상 입력해 주세요.
          </p>
        )}
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

      <ConfirmDialog
        open={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onConfirm={() => { setShowCancelDialog(false); proceedCancel() }}
        title="글쓰기를 그만할까요?"
        message="지금 나가면 작성 중인 내용이 사라져요."
        confirmLabel="나가기"
        cancelLabel="계속 쓰기"
        variant="destructive"
      />

      {/* 비회원이 등록을 눌렀을 때 — 글은 이미 저장됐고, 로그인 후 같은 게시판으로 돌아온다 */}
      {showLoginPrompt && (
        <WriteLoginPrompt
          callbackUrl={`/community/write?board=${encodeURIComponent(selectedBoard)}`}
          onClose={() => setShowLoginPrompt(false)}
        />
      )}
    </>
  )
}
