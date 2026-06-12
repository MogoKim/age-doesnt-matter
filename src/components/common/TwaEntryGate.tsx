'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import { useAppEnvironment } from '@/hooks/useAppEnvironment'
import { getExperimentVariant } from '@/lib/experiments/assign'
import { startKakaoLogin } from '@/lib/kakao-start'
import { trackEvent } from '@/lib/track'
import GateOnboardingSlides from './GateOnboardingSlides'

// TWA 첫 진입 가입 게이트 (실험 twa01_entry_gate)
//  - 대상: TWA(앱) + 비로그인 (전원). 가입의 대부분이 앱에서 일어나므로 신규 한정 제거(모수 확보).
//  - A: 게이트 없음(현행) / B: 글 N개 후 soft 시트 / C: 첫 화면 hard 전체
//  - 탈출(둘러보기) 시 해당 세션 동안 다시 안 뜸. 기존 사용자 충격은 C 탈출구·B soft로 완화. auth 로직 무변경(트리거만).

const ESCAPE_KEY = 'twa_gate_escaped'
const VIEW_LOGGED_KEY = 'twa_gate_view_logged'
const ASSIGN_LOGGED_KEY = 'twa_gate_assign_logged' // ITT 배정 이벤트 세션당 1회 가드
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
    // 긴급 OFF 스위치: Vercel에 NEXT_PUBLIC_TWA_GATE_ENABLED='false' 설정 시 게이트 비활성(기본 ON)
    if (process.env.NEXT_PUBLIC_TWA_GATE_ENABLED === 'false') return
    if (status !== 'unauthenticated' || !isTWA) return
    if (sessionStorage.getItem(ESCAPE_KEY)) return
    const v = getExperimentVariant('twa01_entry_gate')
    // 가입 시 sign_up에 그룹을 실어 보내기 위해 저장(TWA 신규 대상만 → 웹 오염 방지)
    try {
      localStorage.setItem('twa_gate_assigned', v)
    } catch {
      /* ignore */
    }
    // ITT 분모: 배정 시점 1회 기록(A 포함 전원, 노출 전). 노출은 그룹별 조건이 달라 불공정 →
    //   "보여주려 한 대상(배정)" 기준으로 D1/D3/D7·가입을 공정 비교하기 위한 최앞단 모수.
    //   세션당 1회만(중복 분모 방지). sessionId(_anon_sid)가 배정→가입→재방문을 잇는다.
    try {
      if (!sessionStorage.getItem(ASSIGN_LOGGED_KEY)) {
        sessionStorage.setItem(ASSIGN_LOGGED_KEY, '1')
        trackEvent('twa_gate_assigned', { twa_gate_variant: v })
      }
    } catch {
      /* sessionStorage 불가 환경 무시 */
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
        /* C(hard) — 머니워크식 슬라이드 온보딩 (가입 가치 3장, 메인카피는 이미지 내장) */
        <GateOnboardingSlides onSignup={onSignup} onEscape={onEscape} starting={starting} />
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
