'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { trackEvent } from '@/lib/track'
import { getRelatedAbArm } from '@/lib/recommend/ab'
import { REC_ALGO_VERSION, REC_ALGO_VERSION_V2 } from '@/lib/recommend/related'

interface Props {
  href: string
  postId: string
  position: 'inline' | 'bottom'
  boardSlug: string
  className?: string
  children: ReactNode
  // v2 추천(inline) 전용 — bottom 은 미전달 시 undefined 로 기존 동작 유지(optional)
  algoVersion?: string
  rank?: number
  reason?: string
  sourcePostId?: string
}

/** 관련글 클릭 추적용 래퍼 — 서버 컴포넌트(InlineRelatedPosts/PostListBottom) 안에서 사용 */
export default function TrackedPostLink({
  href, postId, position, boardSlug, className, children,
  algoVersion, rank, reason, sourcePostId,
}: Props) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        // algoVersion 미전달(bottom) 시 동일 A/B arm(localStorage 고정)으로 fallback 산출 —
        // inline view와 같은 버전이 태깅됨. inline은 prop이 있으므로 ?? 로 기존값 우선(무변경).
        // A/B 배정·추천 알고리즘·bucket 무변경, 측정 payload만 보강.
        const resolvedAlgoVersion =
          algoVersion ?? (getRelatedAbArm() === 'v2' ? REC_ALGO_VERSION_V2 : REC_ALGO_VERSION)
        trackEvent('related_post_click', {
          position,
          postId, // 기존 호환 유지(=클릭된 글)
          boardSlug,
          // v2 추가 properties — undefined 는 JSON 직렬화에서 제외되어 bottom 동작 무영향
          ...(resolvedAlgoVersion !== undefined ? { algoVersion: resolvedAlgoVersion } : {}),
          ...(rank !== undefined ? { rank } : {}),
          ...(reason !== undefined ? { reason } : {}),
          ...(sourcePostId !== undefined ? { sourcePostId, targetPostId: postId } : {}),
        })
      }}
    >
      {children}
    </Link>
  )
}
