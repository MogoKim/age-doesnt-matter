'use client'

import { useEffect, useState, useMemo, useOptimistic, useCallback, useRef } from 'react'
import { useAppSession } from '@/components/common/AppSessionProvider'
import type { CommentItem as CommentItemType } from '@/types/api'
import type { Grade } from '@/generated/prisma/client'

const GRADE_EMOJI: Record<string, string> = {
  SPROUT: '🌱', REGULAR: '🌿', WARM_NEIGHBOR: '☀️', HONORARY: '🏅',
}

/**
 * [B안] 하단 작성 패널이 열렸을 때의 placeholder.
 * 인라인 상태의 '댓글을 남겨주세요...'를 그대로 두면 패널 제목('댓글 쓰는 중')과 같은 말이 두 번 나온다.
 * 제목이 무엇을 하는 중인지 말하므로, placeholder는 **무엇을 쓸지**만 안내한다.
 */
const COMPOSE_PLACEHOLDER = '생각을 자유롭게 적어주세요'
import CommentItemComponent from './CommentItem'
import CommentInput from './CommentInput'
import GuestCommentInput from './GuestCommentInput'
import CommentDock from './CommentDock'
import { campLabel, campPhrase } from '@/components/features/vote/option-label'

interface CommentSectionProps {
  postId: string
  comments: CommentItemType[]
  isLoggedIn?: boolean
  currentUser?: { id: string; nickname: string; grade: Grade; profileImage: string | null }
  /** 가입인사 글이면 비회원 댓글 문구를 환영 톤으로(Phase 4, 문구 특화 전용) */
  isGreeting?: boolean
  /** 의견수렴형(FEEDBACK) 이벤트면 '댓글'→'의견' 문구로 표기(Phase 3a, 기능/로직 무변경) */
  variant?: 'default' | 'feedback'
  /** 마감(endAt 이후) 등 입력창을 숨기고 목록만 읽기 전용으로 */
  readOnly?: boolean
}

function sortComments(comments: CommentItemType[], sort: 'oldest' | 'likes'): CommentItemType[] {
  const sorted = [...comments]
  if (sort === 'likes') {
    sorted.sort((a, b) => b.likeCount - a.likeCount)
  }
  return sorted
}

/** 오늘의 투표 진영 배지 — /api/votes/badges 응답 */
interface VoteBadges {
  optionA: string
  optionB: string
  byUserId: Record<string, 'A' | 'B'>
}

export default function CommentSection({ postId, comments, isLoggedIn, currentUser, isGreeting, variant = 'default', readOnly = false }: CommentSectionProps) {
  const isFeedback = variant === 'feedback'
  const L = isFeedback
    ? { unit: '의견', popular: '많이 공감한 의견', emptyTitle: '아직 의견이 없어요', emptyBody: '첫 의견을 남겨주세요!' }
    : { unit: '댓글', popular: '인기 댓글', emptyTitle: '아직 댓글이 없어요', emptyBody: '따뜻한 한마디를 남겨보세요!' }
  // [B안] 하단 작성 패널 헤더. 기존 '댓글→의견' 문구 정책을 그대로 따른다.
  const composeHeading = isGreeting ? '환영 인사 쓰는 중' : isFeedback ? '의견 쓰는 중' : '댓글 쓰는 중'
  const { user, status } = useAppSession()
  const authKnown = typeof isLoggedIn === 'boolean' || status !== 'loading'
  const resolvedIsLoggedIn = isLoggedIn ?? status === 'authenticated'
  const resolvedCurrentUser = currentUser ?? (status === 'authenticated' ? user ?? undefined : undefined)
  const [personalizedComments, setPersonalizedComments] = useState(comments)
  const [sort, setSort] = useState<'oldest' | 'likes'>('oldest')
  const [voteBadges, setVoteBadges] = useState<VoteBadges | null>(null)
  // [PR-C1] 하단 진입점이 스크롤·포커스로 데려갈 대상
  const inputAreaRef = useRef<HTMLDivElement>(null)
  // [2026-08-11] Dock 노출 시점의 기준 — 댓글 섹션 시작.
  //   입력창은 목록 아래라 댓글이 많으면 Dock이 늦게 떴다.
  const sectionRef = useRef<HTMLElement>(null)

  // [PR-C1-B] 하단 직접 입력 — 입력 영역을 **그 자리에서** 하단 고정으로 전환한다.
  //   입력창을 하나 더 만들지 않는 이유: 비회원 입력은 Turnstile 위젯 생명주기를 갖는다.
  //   인스턴스가 둘이면 위젯도 둘이 되어 토큰이 어긋나고, 제출이 15초 대기 후 조용히 실패한다.
  //   같은 인스턴스의 className만 바꾸므로 리마운트가 없고 입력 중 내용·닉네임·번호가 보존된다.
  const [composing, setComposing] = useState(false)
  //   fixed로 빠지면 흐름에서 빠져 아래 콘텐츠가 위로 밀린다 → 원래 높이를 자리로 남겨 레이아웃 흔들림을 막는다.
  const [placeholderHeight, setPlaceholderHeight] = useState<number>()

  const openCompose = useCallback(() => {
    setPlaceholderHeight(inputAreaRef.current?.getBoundingClientRect().height)
    setComposing(true)
  }, [])

  const closeCompose = useCallback(() => {
    setComposing(false)
    setConfirmingClose(false)
    setPlaceholderHeight(undefined)
  }, [])

  // [닫기 확인 · H2] 쓰던 내용이 있는데 그냥 닫으면, 실제로는 보존되는데도 사용자는 잃었다고 느낀다.
  //   그래서 내용이 있을 때만 한 번 묻는다. 빈 입력에까지 물으면 그냥 성가신 앱이 된다.
  const [confirmingClose, setConfirmingClose] = useState(false)
  //   "계속 쓰기"로 돌아왔을 때 커서를 원래 자리에 돌려놓기 위해 저장해 둔다.
  //   focus()만 하면 커서가 글 끝으로 튀어, 문장 중간을 고치던 사람은 위치를 잃는다.
  const caretRef = useRef<{ start: number; end: number } | null>(null)

  const requestClose = useCallback(() => {
    const field = inputAreaRef.current?.querySelector('textarea')
    if (field?.value.trim()) {
      caretRef.current = { start: field.selectionStart ?? 0, end: field.selectionEnd ?? 0 }
      setConfirmingClose(true)
      return
    }
    closeCompose()
  }, [closeCompose])

  const keepWriting = useCallback(() => {
    setConfirmingClose(false)
  }, [])

  // 열린 뒤 포커스한다. 전환 렌더가 끝난 다음이어야 커서가 잡힌다.
  useEffect(() => {
    if (!composing) return
    const id = window.setTimeout(() => {
      inputAreaRef.current?.querySelector('textarea')?.focus({ preventScroll: true })
    }, 60)
    return () => window.clearTimeout(id)
  }, [composing])

  // 확인 시트를 닫고 돌아오면 포커스와 **커서 위치**까지 되돌린다.
  useEffect(() => {
    if (!composing || confirmingClose) return
    const caret = caretRef.current
    if (!caret) return
    caretRef.current = null
    const id = window.setTimeout(() => {
      const field = inputAreaRef.current?.querySelector('textarea')
      if (!field) return
      field.focus({ preventScroll: true })
      try { field.setSelectionRange(caret.start, caret.end) } catch { /* 일부 입력 타입은 지원 안 함 */ }
    }, 60)
    return () => window.clearTimeout(id)
  }, [composing, confirmingClose])

  // 진영 배지 — 이 글에 연동된 투표가 있을 때만 값이 옴 (1회 fetch)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/votes/badges?postId=${encodeURIComponent(postId)}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as { badges: VoteBadges | null }
        if (!cancelled && data.badges) setVoteBadges(data.badges)
      } catch {
        // 배지는 부가 기능 — 실패해도 댓글 렌더 유지
      }
    })()
    return () => { cancelled = true }
  }, [postId])


  useEffect(() => {
    setPersonalizedComments(comments)
  }, [comments])

  useEffect(() => {
    if (!resolvedIsLoggedIn) return
    let cancelled = false

    async function loadPersonalizedComments() {
      try {
        const res = await fetch(`/api/comments?postId=${encodeURIComponent(postId)}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        })
        if (!res.ok) return
        const data = await res.json() as { comments: CommentItemType[] }
        if (!cancelled) setPersonalizedComments(data.comments)
      } catch {
        // 공개 댓글을 그대로 유지한다.
      }
    }

    void loadPersonalizedComments()
    return () => { cancelled = true }
  }, [postId, resolvedIsLoggedIn])

  // [댓글 앵커 2026-08-06] 알림/공유 링크의 #comment-{id}로 들어왔을 때 그 댓글까지 스크롤한다.
  //   댓글은 클라이언트에서 로드되므로(위 no-store fetch) 브라우저 기본 hash 스크롤은
  //   요소가 없는 시점에 일어나 실패한다. 목록이 실제로 그려진 뒤 한 번 더 맞춰준다.
  //   없는 id(삭제된 댓글 등)면 아무 것도 하지 않는다 — 글 상단 그대로가 안전 fallback.
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (!id.startsWith('comment-')) return
    // 두 번 시도: 첫 렌더 직후 + 개인화 댓글 반영 후(최대 1초). 찾으면 즉시 종료.
    let done = false
    const tryScroll = () => {
      if (done) return
      const el = document.getElementById(id)
      if (!el) return
      done = true
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
    tryScroll()
    const t1 = setTimeout(tryScroll, 300)
    const t2 = setTimeout(tryScroll, 1000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [personalizedComments])

  const [optimisticComments, addOptimisticComment] = useOptimistic(
    personalizedComments,
    (state: CommentItemType[], newComment: CommentItemType) => [...state, newComment],
  )

  const handleOptimisticAdd = useCallback((content: string) => {
    if (!resolvedCurrentUser) return
    const gradeEmoji = GRADE_EMOJI[resolvedCurrentUser.grade] ?? '🌱'
    addOptimisticComment({
      id: `temp-${Date.now()}`,
      content,
      author: {
        id: resolvedCurrentUser.id,
        nickname: resolvedCurrentUser.nickname,
        grade: resolvedCurrentUser.grade,
        gradeEmoji,
        profileImage: resolvedCurrentUser.profileImage,
      },
      likeCount: 0, isLiked: false, isDeleted: false, isOwn: true, canEdit: true,
      createdAt: new Date().toISOString(),
      replies: [],
    })
  }, [resolvedCurrentUser, addOptimisticComment])

  const handleGuestOptimisticAdd = useCallback((data: { content: string; guestNickname: string }) => {
    addOptimisticComment({
      id: `temp-guest-${Date.now()}`,
      content: data.content,
      author: null,
      guestNickname: data.guestNickname,
      isGuest: true,
      likeCount: 0, isLiked: false, isDeleted: false, isOwn: false, canEdit: false,
      createdAt: new Date().toISOString(),
      replies: [],
    })
  }, [addOptimisticComment])

  const totalCount = optimisticComments.reduce(
    (sum, c) => sum + 1 + c.replies.length,
    0,
  )

  const bestComments = useMemo(() =>
    personalizedComments
      .filter(c => c.likeCount >= 1)
      .sort((a, b) => b.likeCount - a.likeCount)
      .slice(0, 3),
  [personalizedComments])

  const sorted = useMemo(() => sortComments(optimisticComments, sort), [optimisticComments, sort])

  // 투표형 진영 카운트 — 댓글 작성자(회원+봇) 중 진영 유니크 카운트. 게스트(userId 없음)는 제외.
  const camp = useMemo(() => {
    if (!voteBadges) return null
    const seen = new Set<string>()
    let a = 0
    let b = 0
    const walk = (list: CommentItemType[]) => {
      for (const c of list) {
        const uid = c.author?.id
        if (uid && !seen.has(uid)) {
          const ch = voteBadges.byUserId[uid]
          if (ch === 'A') { seen.add(uid); a++ } else if (ch === 'B') { seen.add(uid); b++ }
        }
        if (c.replies?.length) walk(c.replies)
      }
    }
    walk(optimisticComments)
    return a + b > 0 ? { a, b } : null
  }, [voteBadges, optimisticComments])

  // 입력창 위 진영 문구 — 회원이 투표했으면 내 진영 기준, 아니면 투표 유도
  const myChoice = voteBadges && resolvedCurrentUser ? voteBadges.byUserId[resolvedCurrentUser.id] : undefined
  const myCampPhrase =
    myChoice === 'A'
      ? campPhrase(voteBadges!.optionA, '한마디 남겨보세요')
      : myChoice === 'B'
        ? campPhrase(voteBadges!.optionB, '한마디 남겨보세요')
        : null

  return (
    <section ref={sectionRef} className="mb-12">
      {bestComments.length > 0 && (
        <div className="mb-6 p-4 bg-primary/5 rounded-2xl border border-primary/10">
          <p className="text-caption font-bold text-primary-strong mb-2">{L.popular}</p>
          {bestComments.map((comment) => (
            <CommentItemComponent
              key={`best-${comment.id}`}
              comment={comment}
              postId={postId}
              isLoggedIn={resolvedIsLoggedIn}
              isBest
              campBadges={voteBadges}
            />
          ))}
        </div>
      )}
      <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-foreground">
        {camp && voteBadges ? (
          <h3 className="text-lg font-bold text-foreground m-0">
            <span className="text-caption font-normal text-muted-foreground">댓글 진영 · </span>
            <span className="text-primary-text">{campLabel(voteBadges.optionA)} {camp.a}</span>
            <span className="text-muted-foreground font-normal"> · </span>
            <span className="text-slate-600">{campLabel(voteBadges.optionB)} {camp.b}</span>
          </h3>
        ) : (
          <h3 className="text-lg font-bold text-foreground m-0">
            {isFeedback ? '🗣' : '💬'} {L.unit} <span className="text-primary-text font-bold">{totalCount}</span>
          </h3>
        )}
        <div className="flex gap-1">
          <button
            className={`px-4 py-2 rounded-full text-caption font-bold cursor-pointer min-h-[52px] transition-colors ${
              sort === 'oldest'
                ? 'bg-primary/5 border border-primary text-primary-text'
                : 'bg-none border border-transparent text-foreground hover:bg-background'
            }`}
            onClick={() => setSort('oldest')}
          >
            등록순
          </button>
          <button
            className={`px-4 py-2 rounded-full text-caption font-bold cursor-pointer min-h-[52px] transition-colors ${
              sort === 'likes'
                ? 'bg-primary/5 border border-primary text-primary-text'
                : 'bg-none border border-transparent text-foreground hover:bg-background'
            }`}
            onClick={() => setSort('likes')}
          >
            공감순
          </button>
        </div>
      </div>

      {sorted.length > 0 ? (
        <div>
          {sorted.map((comment) => (
            <CommentItemComponent key={comment.id} comment={comment} postId={postId} isLoggedIn={resolvedIsLoggedIn} campBadges={voteBadges} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-8 gap-4 text-center bg-card rounded-2xl border-2 border-dashed border-border mt-6">
          <div className="text-[48px]">{isFeedback ? '🗣' : '💬'}</div>
          <p className="text-body text-muted-foreground leading-[1.8]">
            {L.emptyTitle}.<br />
            {L.emptyBody}
          </p>
        </div>
      )}

      {/* 투표 위젯 "한마디 남기기" CTA 스크롤 목적지 */}
      <div id="vote-comment-anchor" aria-hidden="true" />

      {/* 투표형 글: 입력창 위 진영 문구 */}
      {voteBadges && (
        <p className="mb-2 text-caption font-bold text-primary-text">
          {myCampPhrase ?? '먼저 투표하고 참여해보세요'}
        </p>
      )}

      {readOnly ? (
        <p className="mt-2 rounded-2xl bg-muted/60 px-4 py-4 text-center text-caption text-muted-foreground">
          {isFeedback ? '의견 받기가 마감됐어요. 남겨주신 의견은 소중히 반영할게요.' : '댓글이 마감됐어요.'}
        </p>
      ) : !authKnown ? (
        <div className="h-24 bg-muted rounded-2xl animate-pulse" aria-hidden="true" />
      ) : (
        // [PR-C1] 입력 영역을 감싸 하단 진입점(CommentDock)이 여기로 데려올 수 있게 한다.
        // [PR-C1-B] 바깥 div는 **자리만 지킨다** — 안쪽이 fixed로 빠져도 아래 콘텐츠가 밀리지 않게.
        <div style={placeholderHeight !== undefined ? { minHeight: placeholderHeight } : undefined}>
          <div
            ref={inputAreaRef}
            className={
              composing
                ? // 모바일에서만 하단 고정. 데스크탑은 원래대로 둔다(Dock 자체가 md:hidden이라 열릴 일도 없다).
                  // 55dvh 상한 + 내부 스크롤 — 전면 시트가 아니라 뒤 본문이 계속 보이는 부분 전환이다.
                  // z-[96]은 Dock과 같은 층: 가입 배너(150)보다 아래이되, 열려 있는 동안 배너는 미뤄진다.
                  'max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-[96] max-md:max-h-[55dvh] max-md:overflow-y-auto max-md:overscroll-contain max-md:border-t max-md:border-border max-md:bg-card max-md:px-3 max-md:pb-[max(8px,env(safe-area-inset-bottom))] max-md:pt-1 max-md:shadow-[0_-4px_16px_rgba(0,0,0,0.12)]'
                : undefined
            }
          >
            {composing && (
              // 닫기는 ✕ 버튼만이다. 바깥 탭으로 닫으면 쓰던 글이 실수로 사라진다.
              // [B안] 왼쪽에 상태 제목을 둔다 — 패널이 열렸다는 것과 지금이 '쓰는 중'이라는 것을 알린다.
              //   입력 컴포넌트(회원/비회원)가 각자 갖던 제목 대신 여기 하나로 모아 중복을 없앤다.
              <div className="sticky top-0 z-10 -mx-3 mb-1 flex items-center justify-between bg-card px-3 pt-1 md:hidden">
                <span data-testid="comment-compose-heading" className="text-body font-bold text-foreground">
                  {composeHeading}
                </span>
                <button
                  type="button"
                  onClick={requestClose}
                  aria-label="댓글 입력 닫기"
                  data-testid="comment-compose-close"
                  className="flex min-h-[52px] min-w-[52px] items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-muted"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
            {resolvedIsLoggedIn ? (
              <CommentInput
                postId={postId}
                onOptimisticAdd={resolvedCurrentUser ? handleOptimisticAdd : undefined}
                placeholder={composing ? COMPOSE_PLACEHOLDER : undefined}
              />
            ) : (
              <GuestCommentInput
                postId={postId}
                onOptimisticAdd={handleGuestOptimisticAdd}
                isGreeting={isGreeting}
                isFeedback={isFeedback}
                placeholder={composing ? COMPOSE_PLACEHOLDER : undefined}
                hideHeading={composing}
              />
            )}
          </div>

          {/*
            [닫기 확인 · H2] 쓰던 내용이 있을 때만 뜬다.
            입력 패널(z-96) 바로 위 두 층만 쓴다 — 가입 배너(150)·팝업(200)보다 한참 아래라
            기존 레이어 정책을 흔들지 않는다. 화면을 덮지 않도록 dim은 10%다.
          */}
          {composing && confirmingClose && (
            <div className="md:hidden">
              <div
                className="fixed inset-0 z-[97] bg-black/10"
                aria-hidden="true"
                onClick={keepWriting}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="comment-close-confirm-title"
                data-testid="comment-close-confirm"
                className="fixed inset-x-2 bottom-2 z-[98] rounded-2xl border border-border bg-card p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-6px_22px_rgba(0,0,0,0.14)]"
              >
                <p id="comment-close-confirm-title" className="text-body font-bold text-foreground">
                  댓글 작성을 멈출까요?
                </p>
                <p className="mt-1 text-caption text-muted-foreground">쓰던 내용은 그대로 있어요</p>
                <div className="mt-4 flex gap-2">
                  {/* 왼쪽은 약한 톤 — 가능하되 눈에 덜 띈다 */}
                  <button
                    type="button"
                    onClick={closeCompose}
                    data-testid="comment-close-confirm-close"
                    className="min-h-[52px] flex-1 rounded-xl border border-border bg-card text-caption font-bold text-muted-foreground transition-colors active:bg-muted"
                  >
                    닫기
                  </button>
                  {/* 오른쪽이 기본값 — 안전한 쪽에 강조를 준다 */}
                  <button
                    type="button"
                    onClick={keepWriting}
                    data-testid="comment-close-confirm-keep"
                    className="min-h-[52px] flex-1 rounded-xl bg-primary text-caption font-bold text-white transition-colors hover:bg-primary/90"
                  >
                    계속 쓰기
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/*
        하단 댓글 진입점 — 모바일 전용. 입력창이 화면 밖일 때만 뜬다.
        readOnly(마감)·인증 확인 전에는 띄우지 않는다: 눌러도 갈 곳이 없기 때문이다.
        입력이 열려 있는 동안에는 Dock을 숨긴다 — 하단에 두 개가 겹치면 안 된다.
      */}
      {!readOnly && authKnown && (
        <CommentDock targetRef={inputAreaRef} sectionRef={sectionRef} isFeedback={isFeedback} composing={composing} onOpen={openCompose} />
      )}
    </section>
  )
}
