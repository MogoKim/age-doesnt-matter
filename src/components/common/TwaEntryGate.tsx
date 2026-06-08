'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import { useAppEnvironment } from '@/hooks/useAppEnvironment'
import { getExperimentVariant, getDeviceFirstSeen } from '@/lib/experiments/assign'
import { startKakaoLogin } from '@/lib/kakao-start'
import { trackEvent } from '@/lib/track'

// TWA 첫 진입 가입 게이트 (실험 twa01_entry_gate)
//  - 대상: TWA(앱) + 비로그인 + 신규(_uid_at >= 실험시작일)
//  - A: 게이트 없음(현행) / B: 글 N개 후 soft 시트 / C: 첫 화면 hard 전체
//  - 탈출(둘러보기) 시 해당 세션 동안 다시 안 뜸. auth 로직 무변경(트리거만).

const EXPERIMENT_START_MS = Date.parse('2026-06-08T00:00:00+09:00') // 실험 시작일(이후 첫 방문만 게이트)
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

  // 그룹 결정 (TWA + 비로그인 + 신규 + 미탈출)
  useEffect(() => {
    if (status !== 'unauthenticated' || !isTWA) return
    const firstSeen = getDeviceFirstSeen()
    if (firstSeen === null || firstSeen < EXPERIMENT_START_MS) return // 신규만(기존 사용자 제외)
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
      <div
        className={
          isHard
            ? 'flex min-h-[100dvh] w-full flex-col items-center justify-center gap-6 bg-white px-6 text-center sm:min-h-0 sm:max-w-md sm:rounded-2xl sm:py-12'
            : 'w-full rounded-t-2xl bg-white px-6 pb-8 pt-6 text-center sm:max-w-md sm:rounded-2xl'
        }
      >
        <div>
          <p className="text-2xl">💛</p>
          <h2 className="mt-2 text-xl font-bold text-zinc-900">우리 또래 이야기, 같이 나눠요</h2>
          <p className="mt-2 whitespace-pre-line text-[17px] leading-relaxed text-zinc-600">
            {isHard ? '50·60대 이웃들과 매일 새 이야기.\n카카오로 1초만에 시작하세요.' : '더 보시려면 카카오로 시작하세요.\n내 글 저장·알림도 받을 수 있어요.'}
          </p>
        </div>

        <button
          onClick={onSignup}
          disabled={starting}
          className="min-h-[52px] w-full rounded-xl bg-[#FEE500] px-4 text-[17px] font-bold text-[#3C1E1E] disabled:opacity-60"
        >
          {starting ? '잠시만요…' : '카카오로 시작하기'}
        </button>

        <button onClick={onEscape} className="min-h-[44px] text-[15px] text-zinc-400 underline">
          먼저 둘러볼게요
        </button>
      </div>
    </div>
  )
}
