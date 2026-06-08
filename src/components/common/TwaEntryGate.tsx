'use client'

import Image from 'next/image'
import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import { useAppEnvironment } from '@/hooks/useAppEnvironment'
import { getExperimentVariant } from '@/lib/experiments/assign'
import { startKakaoLogin } from '@/lib/kakao-start'
import { trackEvent } from '@/lib/track'

// TWA 첫 진입 가입 게이트 (실험 twa01_entry_gate)
//  - 대상: TWA(앱) + 비로그인 (전원). 가입의 대부분이 앱에서 일어나므로 신규 한정 제거(모수 확보).
//  - A: 게이트 없음(현행) / B: 글 N개 후 soft 시트 / C: 첫 화면 hard 전체
//  - 탈출(둘러보기) 시 해당 세션 동안 다시 안 뜸. 기존 사용자 충격은 C 탈출구·B soft로 완화. auth 로직 무변경(트리거만).

const ESCAPE_KEY = 'twa_gate_escaped'
const VIEW_LOGGED_KEY = 'twa_gate_view_logged'
const POST_COUNT_KEY = 'twa_session_post_views' // PostViewBeacon이 증가시킴
const B_THRESHOLD = 3

export default function TwaEntryGate() {
  const { status } = useSession()
  const { isTWA } = useAppEnvironment()
  const pathname = usePathname()
  const [variant, setVariant] = useState<string | null>(null)
  const [show, setShow] = useState(false)
  const [starting, setStarting] = useState(false)

  // 그룹 결정 (TWA + 비로그인 + 미탈출). 전원 대상(신규 한정 제거 — 가입 대부분이 앱)
  useEffect(() => {
    if (status !== 'unauthenticated' || !isTWA) return
    if (sessionStorage.getItem(ESCAPE_KEY)) return
    const v = getExperimentVariant('twa01_entry_gate')
    // 가입 시 sign_up에 그룹을 실어 보내기 위해 저장(TWA 신규 대상만 → 웹 오염 방지)
    try {
      localStorage.setItem('twa_gate_assigned', v)
    } catch {
      /* ignore */
    }
    setVariant(v)
  }, [status, isTWA])

  // 표시 조건: C=즉시 / B=세션 내 글 N개 열람 후
  useEffect(() => {
    if (!variant || variant === 'A') return
    if (variant === 'C') {
      setShow(true)
    } else if (variant === 'B') {
      const c = Number(sessionStorage.getItem(POST_COUNT_KEY) ?? '0')
      if (c >= B_THRESHOLD) setShow(true)
    }
  }, [variant, pathname])

  // 노출 이벤트 1회
  useEffect(() => {
    if (!show || !variant) return
    if (sessionStorage.getItem(VIEW_LOGGED_KEY)) return
    sessionStorage.setItem(VIEW_LOGGED_KEY, '1')
    trackEvent('twa_gate_view', { twa_gate_variant: variant })
  }, [show, variant])

  // body scroll lock
  useEffect(() => {
    if (!show) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [show])

  const onSignup = useCallback(() => {
    setStarting(true)
    trackEvent('twa_gate_click', { twa_gate_variant: variant })
    startKakaoLogin(pathname)
  }, [variant, pathname])

  const onEscape = useCallback(() => {
    sessionStorage.setItem(ESCAPE_KEY, '1')
    trackEvent('twa_gate_escape', { twa_gate_variant: variant })
    setShow(false)
  }, [variant])

  if (!show) return null

  const isHard = variant === 'C'

  return (
    <div className="fixed inset-0 z-[200] flex flex-col justify-end bg-black/50 sm:items-center sm:justify-center">
      {isHard ? (
        /* C(hard) — 정식 로그인 화면 디자인 재사용(로고+브랜드+카카오 버튼) + 탈출구 */
        <div className="relative flex min-h-[100dvh] w-full flex-col overflow-hidden bg-background sm:min-h-0 sm:max-w-md sm:rounded-2xl">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0"
            style={{ background: 'linear-gradient(0deg, rgba(255,111,97,0.06) 0%, #fff 38%)' }}
          />
          <div className="relative z-10 flex flex-1 flex-col">
            <div className="my-auto flex flex-col items-center gap-[22px] px-8 py-8">
              <Image src="/logo.png" width={120} height={120} alt="우나어 로고" className="object-contain" priority />
              <p className="text-center text-[30px] font-bold leading-[1.4]">
                <span className="text-foreground">신중년 여성을 위한</span>
                <br />
                <span className="text-[#FF6F61]">고민 상담소</span>
              </p>
              <p className="text-center text-[18px] text-muted-foreground">지금 가입하고 나의 고민을 나눠보세요</p>
            </div>
            <div className="mt-auto px-6 pb-[68px] md:pb-[60px]">
              <button
                type="button"
                onClick={onSignup}
                disabled={starting}
                aria-busy={starting}
                className="flex h-[54px] w-full items-center justify-center gap-2 rounded-xl font-bold transition-all hover:brightness-95"
                style={{ background: '#FEE500', color: '#191919', boxShadow: '0 2px 8px rgba(254,229,0,0.35)' }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M10 2C5.582 2 2 4.925 2 8.5c0 2.26 1.37 4.25 3.46 5.43l-.9 3.3a.25.25 0 0 0 .38.27L8.8 15.5c.39.05.79.08 1.2.08 4.418 0 8-2.925 8-6.5S14.418 2 10 2Z" fill="currentColor" />
                </svg>
                {starting ? '카카오로 이동 중...' : '카카오로 3초 만에 시작하기'}
              </button>
              <button onClick={onEscape} className="mt-3 min-h-[44px] w-full text-[15px] text-muted-foreground underline">
                먼저 둘러볼게요
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* B(soft) — 하단 시트(로그인 카카오 버튼 톤 통일) */
        <div className="w-full rounded-t-2xl bg-background px-6 pb-8 pt-7 text-center sm:max-w-md sm:rounded-2xl">
          <p className="text-2xl">💛</p>
          <h2 className="mt-2 text-xl font-bold text-foreground">조금 더 보시겠어요?</h2>
          <p className="mt-2 whitespace-pre-line text-[17px] leading-relaxed text-muted-foreground">
            {'카카오로 가입하면 이어서 볼 수 있어요.\n내 글 저장·알림도 받아요.'}
          </p>
          <button
            type="button"
            onClick={onSignup}
            disabled={starting}
            aria-busy={starting}
            className="mt-5 flex h-[54px] w-full items-center justify-center gap-2 rounded-xl font-bold transition-all hover:brightness-95"
            style={{ background: '#FEE500', color: '#191919', boxShadow: '0 2px 8px rgba(254,229,0,0.35)' }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M10 2C5.582 2 2 4.925 2 8.5c0 2.26 1.37 4.25 3.46 5.43l-.9 3.3a.25.25 0 0 0 .38.27L8.8 15.5c.39.05.79.08 1.2.08 4.418 0 8-2.925 8-6.5S14.418 2 10 2Z" fill="currentColor" />
            </svg>
            {starting ? '카카오로 이동 중...' : '카카오로 3초 만에 시작하기'}
          </button>
          <button onClick={onEscape} className="mt-3 min-h-[44px] text-[15px] text-muted-foreground underline">
            먼저 둘러볼게요
          </button>
        </div>
      )}
    </div>
  )
}
