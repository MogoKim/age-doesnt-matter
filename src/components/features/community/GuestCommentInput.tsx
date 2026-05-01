'use client'

import { useState, useRef, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import KakaoSignupButton from '@/components/features/auth/KakaoSignupButton'
import { useToast } from '@/components/common/Toast'
import { createGuestComment } from '@/lib/actions/guest-comments'

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
}

export default function GuestCommentInput({
  postId,
  parentId,
  placeholder = '댓글을 남겨주세요... (최대 500자)',
  onCancel,
  onSuccess,
}: GuestCommentInputProps) {
  const { toast } = useToast()
  const pathname = usePathname()
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [content, setContent] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const turnstileRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  // auto-execute: 위젯 렌더 즉시 챌린지 수행 → 토큰 미리 저장
  const tokenRef = useRef<string>('')

  useEffect(() => {
    if (!document.getElementById('cf-turnstile-script')) {
      const script = document.createElement('script')
      script.id = 'cf-turnstile-script'
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }

    const tryRender = () => {
      if (!window.turnstile || !turnstileRef.current || widgetIdRef.current) return
      const siteKey = process.env.NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY ?? '1x00000000000000000000AA'
      widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
        sitekey: siteKey,
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

    const interval = setInterval(tryRender, 300)
    return () => {
      clearInterval(interval)
      if (window.turnstile && widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
      tokenRef.current = ''
    }
  }, [])

  // compact 모드: 사용자 클릭 시간 포함 최대 15초 대기
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
    if (!nickname.trim()) { toast('닉네임을 입력해 주세요', 'error'); return }
    if (password.length < 4) { toast('비밀번호는 4~8자리로 입력해 주세요', 'error'); return }

    setIsLoading(true)
    try {
      const token = await waitForToken()
      if (!token) {
        toast('보안 확인 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.', 'error')
        return
      }

      const result = await createGuestComment({
        postId,
        parentId,
        content: content.trim(),
        guestNickname: nickname.trim(),
        guestPassword: password,
        turnstileToken: token,
      })

      if (result.error) {
        toast(result.error, 'error')
        // 토큰 소진 → 위젯 초기화로 새 토큰 발급
        tokenRef.current = ''
        if (window.turnstile && widgetIdRef.current) {
          window.turnstile.reset(widgetIdRef.current)
        }
        return
      }

      toast('댓글이 등록됐어요!')
      setContent('')
      setNickname('')
      setPassword('')
      // 사용 후 초기화 → 위젯이 새 토큰 자동 발급
      tokenRef.current = ''
      if (window.turnstile && widgetIdRef.current) {
        window.turnstile.reset(widgetIdRef.current)
      }
      onSuccess?.()
    } finally {
      setIsLoading(false)
    }
  }

  const canSubmit = content.trim().length > 0 && nickname.trim().length > 0 && password.length >= 4

  return (
    <div className="bg-card border border-border rounded-2xl p-4 mt-4">
      <p className="text-caption font-bold text-foreground mb-3">💬 비회원으로 댓글 달기</p>

      <div className="flex gap-3 mb-3">
        <div className="flex-1">
          <input
            type="text"
            placeholder="닉네임 (최대 10자)"
            value={nickname}
            onChange={(e) => setNickname(e.target.value.slice(0, 10))}
            maxLength={10}
            className="w-full px-3 py-2 min-h-[52px] border border-border rounded-xl text-body text-foreground bg-background outline-none focus:border-primary transition-colors"
          />
          <p className="text-caption text-muted-foreground mt-1 ml-1">※ 회원 닉네임은 사용 불가</p>
        </div>
        <div className="flex-1">
          <input
            type="password"
            placeholder="비밀번호 (4~8자)"
            value={password}
            onChange={(e) => setPassword(e.target.value.slice(0, 8))}
            maxLength={8}
            className="w-full px-3 py-2 min-h-[52px] border border-border rounded-xl text-body text-foreground bg-background outline-none focus:border-primary transition-colors"
          />
          <p className="text-caption text-muted-foreground mt-1 ml-1">※ 수정·삭제 시 필요</p>
        </div>
      </div>

      <textarea
        placeholder={placeholder}
        value={content}
        onChange={(e) => setContent(e.target.value.slice(0, 500))}
        maxLength={500}
        rows={3}
        className="w-full px-3 py-2 border border-border rounded-xl text-body text-foreground bg-background resize-none outline-none focus:border-primary transition-colors mb-1"
      />
      <p className="text-caption text-muted-foreground text-right mb-3">{content.length}/500</p>

      {/* Turnstile compact 위젯 — 자동 검증 또는 체크박스 표시 */}
      <div className="mb-2">
        <div ref={turnstileRef} />
      </div>

      <div className="flex items-center gap-2">
        <KakaoSignupButton
          callbackUrl={pathname}
          gtmFrom="guest_comment_kakao"
          className="flex-1 flex items-center justify-center min-h-[52px] px-4 bg-[#FEE500] text-[#191919] rounded-xl text-caption font-bold hover:bg-[#FDD800] transition-colors"
        >
          💛 카카오로 시작하기
        </KakaoSignupButton>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isLoading || !canSubmit}
          className="flex-1 flex items-center justify-center min-h-[52px] px-4 bg-primary text-white rounded-xl text-caption font-bold hover:bg-[#E85D50] disabled:bg-border disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? '등록 중...' : '비회원으로 작성'}
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
