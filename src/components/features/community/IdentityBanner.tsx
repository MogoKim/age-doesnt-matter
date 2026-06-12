'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useSession } from 'next-auth/react'
import { trackEvent } from '@/lib/track'

interface Props {
  boardSlug: string
}

/** 정체성 배너 (네이버 유입자 락인 ①) — 비회원에게만, 제목 밑.
 *  "여기가 어떤 곳"인지 안내(클릭 이동·닫기 없음). force-static이라 클라에서 비회원 판단(PostCTA 패턴).
 *  로고는 실제 logo.png에서 심볼(겹친 원)만 crop(h-7 컨테이너 + 상단 노출, 텍스트 영역은 overflow로 가림). */
export default function IdentityBanner({ boardSlug }: Props) {
  const { status } = useSession()
  const authKnown = status !== 'loading'
  const isLoggedIn = status === 'authenticated'

  const viewedRef = useRef(false)
  const [shown, setShown] = useState(false) // fade-in (CLS 체감 완충)

  const visible = authKnown && !isLoggedIn

  // 노출 이벤트 1회 + fade-in 트리거
  useEffect(() => {
    if (!visible) return
    setShown(true)
    if (viewedRef.current) return
    viewedRef.current = true
    trackEvent('identity_banner_view', { boardSlug })
  }, [visible, boardSlug])

  if (!visible) return null

  return (
    <div className={`mb-6 transition-opacity duration-300 ${shown ? 'opacity-100' : 'opacity-0'}`}>
      <div className="flex items-center gap-2.5 rounded-2xl border border-primary/20 bg-gradient-to-b from-primary/[0.05] to-card px-4 py-3">
        {/* 실제 로고 심볼만 — 원 부분(상단)만 노출, 텍스트는 overflow로 가림 */}
        <div className="h-7 w-[75px] shrink-0 overflow-hidden" aria-hidden="true">
          <Image src="/images/logo.png" width={75} height={41} alt="" className="block" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[16px] font-bold text-foreground leading-snug whitespace-nowrap">
            우리 또래 여성들의 이야기 공간
          </span>
          <span className="text-[13px] text-muted-foreground leading-snug mt-0.5 whitespace-nowrap">
            40·50·60대 여성들의 진짜 이야기
          </span>
        </div>
      </div>
    </div>
  )
}
