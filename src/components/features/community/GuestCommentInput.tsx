'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import KakaoSignupButton from '@/components/features/auth/KakaoSignupButton'
import AutoResizeTextarea from '@/components/common/AutoResizeTextarea'
import { useToast } from '@/components/common/Toast'
import { createGuestComment } from '@/lib/actions/guest-comments'
import { trackEvent } from '@/lib/track'
import { useCommentFunnel } from '@/hooks/useCommentFunnel'

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
  }
}

interface GuestCommentInputProps {
  postId: string
  parentId?: string
  placeholder?: string
  onCancel?: () => void
  onSuccess?: () => void
  /** top-level 댓글 성공 시 즉시 목록에 반영하기 위한 optimistic 추가 콜백 */
  onOptimisticAdd?: (data: { content: string; guestNickname: string }) => void
  /** 가입인사 글이면 환영 톤 문구로(Phase 4, 문구 특화 전용). 기능/허용범위 무변경 */
  isGreeting?: boolean
  /** 의견수렴형(FEEDBACK) 이벤트면 '댓글'→'의견' 문구로(Phase 3a). 기능/허용범위 무변경 */
  isFeedback?: boolean
  /**
   * [B안] 하단 작성 패널로 전환된 상태에서는 패널 헤더가 제목을 맡는다.
   * 자체 제목을 모바일에서만 접어 같은 말이 두 번 나오지 않게 한다. 문구·기능은 그대로다.
   */
  hideHeading?: boolean
  /**
   * [C2-B] 하단 작성 패널이 열린 동안만 등록 버튼 줄을 패널 하단에 고정한다.
   *
   * 왜 필요한가: 비회원 입력은 본문 아래로 이름·번호·Turnstile이 순차로 열려 내용 높이가
   * 패널 상한(55dvh)을 넘는다. 실측(390x844) 내용 579px vs 표시 463px — 넘침 116px이라
   * **등록 버튼이 활성화된 순간에 화면 밖(패널 하단 +38px)에 있었다.** 390x667에서는 넘침이
   * 213px로 커져 번호 칸까지 사라졌다. 화면 최하단이 번호 도움말 문장으로 끝나 사용자에게는
   * 양식이 끝난 것처럼 보이고, 내부 스크롤 단서(그림자·페이드)도 없다.
   *
   * ⚠️ 반드시 패널이 열린 동안(composing)만 켠다. 인라인 상태에는 스크롤 조상이 없어(실측 확인)
   *    sticky가 **뷰포트** 기준으로 붙는다 → 글을 읽는 내내 버튼이 하단에 떠 Dock(z-96)과
   *    하단을 다투고, PR #333/#339에서 되돌린 광고 겹침이 재발한다.
   * ⚠️ 패널 높이(55dvh)·Dock 높이·z-index 정책은 건드리지 않는다. 스크롤 기준이 패널
   *    스크롤포트라 패널 **밖** 좌표는 하나도 바뀌지 않는다(헤더의 sticky top-0과 대칭).
   */
  stickySubmit?: boolean
}

export default function GuestCommentInput({
  postId,
  parentId,
  placeholder,
  onCancel,
  onSuccess,
  onOptimisticAdd,
  isGreeting,
  isFeedback,
  hideHeading,
  stickySubmit,
}: GuestCommentInputProps) {
  const resolvedPlaceholder = placeholder ?? (isFeedback ? '의견을 남겨주세요... (최대 500자)' : '댓글을 남겨주세요... (최대 500자)')
  const { toast } = useToast()
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [content, setContent] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSignupPrompt, setShowSignupPrompt] = useState(false)
  const turnstileRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const tokenRef = useRef<string>('')

  const isTopLevel = !parentId
  const showExtraFields = content.trim().length > 0

  // [PR-C3] 성공 이전 단계 계측. 화면·문구·노출 타이밍·제출 로직은 건드리지 않는다.
  const funnel = useCommentFunnel({ postId, parentId, userState: 'guest' })

  // 등록 후 가입 유도 카드가 실제로 뜬 순간 (1회).
  // 클릭은 새로 만들지 않는다 — KakaoSignupButton이 이미
  // `kakao_button_click { from: 'guest_comment_success' }` 를 보내고 있어 그것이 이 카드의 클릭 이벤트다.
  useEffect(() => {
    if (showSignupPrompt) funnel.onSignupPromptShown()
  }, [showSignupPrompt, funnel])

  // script preload — 마운트 시 inject, 네트워크 지연 흡수
  useEffect(() => {
    if (!document.getElementById('cf-turnstile-script')) {
      const script = document.createElement('script')
      script.id = 'cf-turnstile-script'
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }
    return () => {
      if (window.turnstile && widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
      tokenRef.current = ''
    }
  }, [])

  // widget lifecycle — showExtraFields가 열릴 때만 render, 닫힐 때 remove
  useEffect(() => {
    if (!showExtraFields) {
      if (window.turnstile && widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
      tokenRef.current = ''
      return
    }

    const tryRender = () => {
      if (!window.turnstile || !turnstileRef.current || widgetIdRef.current) return
      const siteKey = process.env.NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY
      if (!siteKey) return
      widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
        sitekey: siteKey,
        appearance: 'interaction-only',
        execution: 'render',
        size: 'compact',
        language: 'auto',
        callback: (token: string) => { tokenRef.current = token },
        'error-callback': () => { tokenRef.current = '' },
        'expired-callback': () => {
          tokenRef.current = ''
          if (window.turnstile && widgetIdRef.current) {
            window.turnstile.reset(widgetIdRef.current)
          }
        },
      })
    }

    tryRender()
    const interval = setInterval(tryRender, 300)
    return () => clearInterval(interval)
  }, [showExtraFields])

  // compact 모드: 최대 15초 대기 (interaction-only에서 체크박스 필요 시 대기)
  async function waitForToken(maxMs = 15000): Promise<string> {
    const start = Date.now()
    while (Date.now() - start < maxMs) {
      if (tokenRef.current) return tokenRef.current
      await new Promise(r => setTimeout(r, 200))
    }
    return ''
  }

  async function handleSubmit() {
    if (!content.trim()) return
    // 가드 통과 후에 보낸다 — 비활성 버튼 클릭이 시도로 잡히면 성공률 분모가 부풀려진다.
    funnel.onSubmitAttempted()
    if (!nickname.trim()) { toast('댓글 남길 이름을 입력해 주세요', 'error'); return }
    if (password.length < 4) { toast('수정·삭제용 번호를 4자리로 입력해 주세요', 'error'); return }

    setIsLoading(true)
    setIsSubmitting(false)
    // 성공 시 입력값이 초기화되므로 제출 시점 값을 캡처
    const submittedContent = content.trim()
    const submittedNickname = nickname.trim()
    const submittedPassword = password
    try {
      const token = await waitForToken()
      if (!token) {
        funnel.onSubmitFailed('turnstile_unavailable')
        toast('보안 확인 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.', 'error')
        return
      }

      setIsSubmitting(true)
      // useTransition으로 감싸야 useOptimistic 추가가 server action 완료까지 유지됨
      startTransition(() => {
        void (async () => {
          try {
            // top-level: server 응답 전에 즉시 목록 최상단에 optimistic 추가
            // (에러 시 transition 종료와 함께 자동 롤백됨)
            if (isTopLevel) {
              onOptimisticAdd?.({ content: submittedContent, guestNickname: submittedNickname })
            }

            const result = await createGuestComment({
              postId,
              parentId,
              content: submittedContent,
              guestNickname: submittedNickname,
              guestPassword: submittedPassword,
              turnstileToken: token,
            })

            if (result.error) {
              // 사유 코드만 — 서버 원문 메시지는 문구 변경 시 집계가 깨지고 입력값이 섞일 수 있다.
              funnel.onSubmitFailed('server_rejected')
              toast(result.error, 'error')
              tokenRef.current = ''
              if (window.turnstile && widgetIdRef.current) {
                window.turnstile.reset(widgetIdRef.current)
              }
              return
            }

            // 성공 — content 초기화 → showExtraFields=false → widget cleanup은 effect가 처리
            trackEvent('comment_create', {
              content_type: 'post',
              content_id: postId,
              comment_type: parentId ? 'guest_reply' : 'guest_comment',
            })

            setContent('')
            setNickname('')
            setPassword('')
            onSuccess?.()

            if (isTopLevel) {
              sessionStorage.setItem('signup_prompt_shown_this_session', '1')
              setShowSignupPrompt(true)
            } else {
              toast('댓글이 등록됐어요!')
              // 답글은 optimistic 미적용 → 최신 댓글 트리를 가져와 즉시 반영
              router.refresh()
            }
          } catch (error) {
            funnel.onSubmitFailed('unexpected')
            console.error('[GuestCommentInput] submit failed', error)
            toast('댓글 등록 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.', 'error')
            tokenRef.current = ''
            if (window.turnstile && widgetIdRef.current) {
              window.turnstile.reset(widgetIdRef.current)
            }
          } finally {
            setIsSubmitting(false)
          }
        })()
      })
    } finally {
      setIsLoading(false)
    }
  }

  const canSubmit = content.trim().length > 0 && nickname.trim().length > 0 && password.length === 4
  const submitDisabled = isLoading || isSubmitting || isPending || !canSubmit
  const submitLabel = isLoading
    ? '보안 확인 중...'
    : isSubmitting || isPending
      ? '등록 중...'
      : isFeedback
        ? '의견 남기기'
        : '댓글 남기기'

  // 댓글 등록 성공 후 가입 유도 카드 (top-level 전용)
  if (showSignupPrompt) {
    return (
      <div className="bg-card border border-border rounded-2xl p-4 mt-4">
        <p className="text-body font-bold text-foreground mb-1">
          {isGreeting ? '환영해주셔서 감사해요' : isFeedback ? '의견 고맙습니다 · 소중히 반영할게요' : '댓글이 등록됐어요'}
        </p>
        <p className="text-caption text-muted-foreground mb-4">
          {isGreeting
            ? '가입하면 이웃들과 더 가까워져요'
            : isFeedback
              ? '가입하면 다음부터 이름·번호 없이 바로 의견을 남길 수 있어요'
              : '다음부터는 닉네임·번호 없이 바로 댓글을 남길 수 있어요'}
        </p>
        <KakaoSignupButton
          callbackUrl={pathname}
          gtmFrom="guest_comment_success"
          className="flex items-center justify-center w-full min-h-[52px] rounded-xl text-caption font-bold mb-2 transition-all hover:brightness-95"
          style={{ background: '#FEE500', color: '#191919' }}
        >
          카카오로 1초 만에 시작하기
        </KakaoSignupButton>
        <button
          type="button"
          onClick={() => setShowSignupPrompt(false)}
          className="w-full min-h-[52px] rounded-xl text-caption text-muted-foreground hover:text-foreground transition-colors"
        >
          나중에 할게요
        </button>
      </div>
    )
  }

  return (
    <div ref={funnel.viewRef} className="bg-card border border-border rounded-2xl p-4 mt-4">
      {/* hideHeading은 모바일에서만 접는다 — 하단 패널 헤더가 md:hidden이라 데스크탑에는 제목이 남아야 한다. */}
      <p className={`text-body font-bold text-foreground mb-3${hideHeading ? ' max-md:hidden' : ''}`}>
        {isGreeting ? '새 이웃을 환영해주세요' : isFeedback ? '의견을 남겨주세요' : '댓글을 남겨보세요'}
      </p>

      <AutoResizeTextarea
        placeholder={resolvedPlaceholder}
        value={content}
        onFocus={funnel.onInputFocus}
        onChange={(e) => {
          // 첫 글자에서만 1회 — 지웠다 다시 써도 재발화하지 않는다(훅이 보장).
          if (e.target.value.trim()) funnel.onTextStarted()
          setContent(e.target.value.slice(0, 500))
        }}
        maxLength={500}
        rows={3}
        maxHeight={200}
        className="w-full px-3 py-2 border border-border rounded-xl text-body text-foreground bg-background outline-none focus:border-primary transition-colors mb-1"
      />
      <p className="text-caption text-muted-foreground text-right mb-3">{content.length}/500</p>

      {showExtraFields && (
        <div className="mb-3 space-y-3">
          <div>
            <label className="block text-caption text-muted-foreground mb-1">댓글 남길 이름</label>
            <input
              type="text"
              placeholder="예: 또래친구"
              value={nickname}
              // 신원 단계 "진입" = 이름·번호 칸을 실제로 눌렀을 때.
              // showExtraFields가 켜지는 시점은 첫 글자와 같아 comment_text_started와 구분되지 않는다.
              onFocus={funnel.onIdentityStarted}
              onChange={(e) => setNickname(e.target.value.slice(0, 10))}
              maxLength={10}
              className="w-full px-3 py-2 min-h-[52px] border border-border rounded-xl text-body text-foreground bg-background outline-none focus:border-primary transition-colors"
            />
          </div>
          <div>
            <label className="block text-caption text-muted-foreground mb-1">수정·삭제용 번호</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="숫자 4자리"
              value={password}
              onFocus={funnel.onIdentityStarted}
              onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 4))}
              maxLength={4}
              className="w-full px-3 py-2 min-h-[52px] border border-border rounded-xl text-body text-foreground bg-background outline-none focus:border-primary transition-colors"
            />
            <p className="text-caption text-muted-foreground mt-1 ml-1">댓글 수정·삭제할 때만 써요</p>
          </div>
          {/* Turnstile — appearance:interaction-only, 인증 필요 시에만 보임 */}
          <div ref={turnstileRef} />
        </div>
      )}

      {/*
        [C2-B] stickySubmit이면 이 줄만 패널 스크롤포트 하단에 붙는다.
        bg-card: 뒤로 지나가는 입력칸이 비쳐 보이지 않게. pt-2: 위 요소와 붙지 않게.
        새 wrapper를 만들지 않는다 — 조건부로 부모 element가 생기면 형제인 Turnstile div가
        unmount되어 토큰이 소실되고 제출이 15초 뒤 조용히 실패한다. className만 바꾼다.
      */}
      <div className={`flex items-center gap-2${stickySubmit ? ' max-md:sticky max-md:bottom-0 max-md:z-10 max-md:bg-card max-md:pt-2' : ''}`}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitDisabled}
          className="flex-1 flex items-center justify-center min-h-[52px] px-4 bg-primary text-white rounded-xl text-caption font-bold hover:bg-primary/90 disabled:bg-border disabled:cursor-not-allowed transition-colors"
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center justify-center min-h-[52px] min-w-[52px] px-3 rounded-xl text-caption text-muted-foreground hover:text-foreground transition-colors"
          >
            취소
          </button>
        )}
      </div>
    </div>
  )
}
