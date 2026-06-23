'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { trackEvent } from '@/lib/track'

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
      onClick={() =>
        trackEvent('related_post_click', {
          position,
          postId, // 기존 호환 유지(=클릭된 글)
          boardSlug,
          // v2 추가 properties — undefined 는 JSON 직렬화에서 제외되어 bottom 동작 무영향
          ...(algoVersion !== undefined ? { algoVersion } : {}),
          ...(rank !== undefined ? { rank } : {}),
          ...(reason !== undefined ? { reason } : {}),
          ...(sourcePostId !== undefined ? { sourcePostId, targetPostId: postId } : {}),
        })
      }
    >
      {children}
    </Link>
  )
}
