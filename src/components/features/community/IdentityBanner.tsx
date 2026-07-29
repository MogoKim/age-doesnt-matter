'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useAppSession } from '@/components/common/AppSessionProvider'
import { trackEvent } from '@/lib/track'

interface Props {
  boardSlug: string
  /** 호스트 wrapper의 좌우 padding을 탈출하기 위한 음수 마진 + 같은 값의 padding.
   *  커뮤니티(px-4)와 매거진(px-3)이 wrapper padding이 달라 호출부가 값을 넘긴다.
   *  디자인(띠 모양·색·높이)은 이 컴포넌트 하나로 통일되며 variant는 두지 않는다. */
  className?: string
}

/** 정체성 배너 (네이버 유입자 락인 ①) — 비회원에게만, 제목 밑.
 *  "여기가 어떤 곳"인지 안내(클릭 이동·닫기 없음). force-static이라 클라에서 비회원 판단(PostCTA 패턴).
 *  로고는 실제 logo.png에서 심볼(겹친 원)만 crop(h-7 컨테이너 + 상단 노출, 텍스트 영역은 overflow로 가림). */
export default function IdentityBanner({ boardSlug, className = '' }: Props) {
  const { status } = useAppSession()
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
    // 풀블리드 얇은 띠 — 라운드/그림자/카드 테두리 없이 하단 border 1줄만.
    // 제목보다 시선을 덜 가져가도록 한 줄·caption 크기·아주 옅은 warm 배경으로 낮춘다.
    // truncate: 가+ XLARGE에서도 줄바꿈 없이 말줄임으로 처리(375px 안전).
    // cn() 미사용(템플릿 문자열) — twMerge가 text-caption을 글자색으로 오인해 지우는 함정 회피.
    <div
      className={`mb-6 border-b border-primary/15 bg-primary/[0.04] py-2 transition-opacity duration-300 ${shown ? 'opacity-100' : 'opacity-0'} ${className}`}
    >
      <div className="flex items-center gap-2">
        {/* 실제 로고 심볼만 — 원 부분(상단)만 노출, 텍스트는 overflow로 가림 */}
        <div className="h-[19px] w-[52px] shrink-0 overflow-hidden" aria-hidden="true">
          <Image src="/images/logo.png" width={52} height={28} alt="" className="block" />
        </div>
        {/* 폰트: text-caption = CSS 변수 기반 → '가+' 3단계에 반응(고정 px 금지) */}
        <span className="text-caption text-muted-foreground leading-snug truncate">
          우리 또래 여성들의 이야기 공간
        </span>
      </div>
    </div>
  )
}
