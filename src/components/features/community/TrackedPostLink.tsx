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
}

/** 관련글 클릭 추적용 래퍼 — 서버 컴포넌트(InlineRelatedPosts/PostListBottom) 안에서 사용 */
export default function TrackedPostLink({ href, postId, position, boardSlug, className, children }: Props) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => trackEvent('related_post_click', { position, postId, boardSlug })}
    >
      {children}
    </Link>
  )
}
