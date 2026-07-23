'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import KakaoSignupButton from '@/components/features/auth/KakaoSignupButton'
import AutoResizeTextarea from '@/components/common/AutoResizeTextarea'
import { useToast } from '@/components/common/Toast'
import { createGuestComment } from '@/lib/actions/guest-comments'
import { trackEvent } from '@/lib/track'

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
  const [showSignupPrompt, setShowSignupPrompt] = useState(false)
  const turnstileRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const tokenRef = useRef<string>('')

  const isTopLevel = !parentId
  const showExtraFields = content.trim().length > 0

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
    if (!nickname.trim()) { toast('댓글 남길 이름을 입력해 주세요', 'error'); return }
    if (password.length < 4) { toast('수정·삭제용 번호를 4자리로 입력해 주세요', 'error'); return }

    setIsLoading(true)
    // 성공 시 입력값이 초기화되므로 제출 시점 값을 캡처
    const submittedContent = content.trim()
    const submittedNickname = nickname.trim()
    const submittedPassword = password
    try {
      const token = await waitForToken()
      if (!token) {
        toast('보안 확인 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.', 'error')
        return
      }

      // useTransition으로 감싸야 useOptimistic 추가가 server action 완료까지 유지됨
      startTransition(async () => {
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
      })
    } finally {
      setIsLoading(false)
    }
  }

  const canSubmit = content.trim().length > 0 && nickname.trim().length > 0 && password.length === 4

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
    <div className="bg-card border border-border rounded-2xl p-4 mt-4">
      <p className="text-body font-bold text-foreground mb-3">
        {isGreeting ? '새 이웃을 환영해주세요' : isFeedback ? '의견을 남겨주세요' : '댓글을 남겨보세요'}
      </p>

      <AutoResizeTextarea
        placeholder={resolvedPlaceholder}
        value={content}
        onChange={(e) => setContent(e.target.value.slice(0, 500))}
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

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isLoading || isPending || !canSubmit}
          className="flex-1 flex items-center justify-center min-h-[52px] px-4 bg-primary text-white rounded-xl text-caption font-bold hover:bg-primary/90 disabled:bg-border disabled:cursor-not-allowed transition-colors"
        >
          {isLoading || isPending ? '등록 중...' : isFeedback ? '의견 남기기' : '댓글 남기기'}
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
