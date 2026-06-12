'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { trackEvent } from '@/lib/track'

const SESSION_KEY = 'identity_banner_dismissed'

interface Props {
  boardSlug: string
}

/** 정체성 배너 (네이버 유입자 락인 ①) — 비회원에게만, 제목 밑.
 *  "여기가 어떤 곳"인지 안내. force-static이라 클라에서 비회원 판단(PostCTA 패턴). */
export default function IdentityBanner({ boardSlug }: Props) {
  const { status } = useSession()
  const authKnown = status !== 'loading'
  const isLoggedIn = status === 'authenticated'

  const viewedRef = useRef(false)
  const [dismissed, setDismissed] = useState(false)
  const [shown, setShown] = useState(false) // fade-in (CLS 체감 완충)

  // 세션당 1회 닫기 영속 확인
  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === '1') setDismissed(true)
  }, [])

  const visible = authKnown && !isLoggedIn && !dismissed

  // 노출 이벤트 1회 + fade-in 트리거
  useEffect(() => {
    if (!visible) return
    setShown(true)
    if (viewedRef.current) return
    viewedRef.current = true
    trackEvent('identity_banner_view', { boardSlug })
  }, [visible, boardSlug])

  if (!visible) return null

  function handleDismiss() {
    sessionStorage.setItem(SESSION_KEY, '1')
    setDismissed(true)
    trackEvent('identity_banner_dismiss', { boardSlug })
  }

  return (
    <div className={`relative mb-6 transition-opacity duration-300 ${shown ? 'opacity-100' : 'opacity-0'}`}>
      <Link
        href="/"
        onClick={() => trackEvent('identity_banner_click', { boardSlug })}
        className="flex items-center gap-3 rounded-2xl border border-primary/25 bg-gradient-to-b from-primary/[0.07] to-card p-4 no-underline text-inherit min-h-[52px]"
      >
        <span className="flex shrink-0" aria-hidden="true">
          <i className="block w-[18px] h-[18px] rounded-full" style={{ background: '#ffb3a8' }} />
          <i className="block w-[18px] h-[18px] rounded-full -ml-[7px]" style={{ background: '#ff8978' }} />
          <i className="block w-[18px] h-[18px] rounded-full -ml-[7px]" style={{ background: '#ffd0c8' }} />
        </span>
        <span className="flex flex-col min-w-0">
          <span className="text-body font-bold text-foreground leading-snug">
            비슷한 고민 나누는 40·50·60대 여성 공간
          </span>
          <span className="text-caption text-muted-foreground mt-0.5 leading-snug">
            우리 나이가 어때서 — 또래끼리 편하게 수다 떨어요
          </span>
        </span>
      </Link>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="배너 닫기"
        className="absolute top-2 right-2 w-9 h-9 flex items-center justify-center text-muted-foreground/60 hover:text-muted-foreground text-lg"
      >
        ✕
      </button>
    </div>
  )
}
