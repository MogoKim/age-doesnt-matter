'use client'

import { useEffect, useRef, useState } from 'react'
import type { PostSummary } from '@/types/api'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
import { getExperimentVariant } from '@/lib/experiments/assign'
import { trackEvent } from '@/lib/track'
import TrackedPostLink from './TrackedPostLink'

interface Props {
  /** 현재 글 ID (노출 properties용) */
  postId: string
  boardSlug: string
  /** 서버에서 조회한 관련글 상위 3개 (related.slice(0,3)). 하단 목록과 별개로 전달. */
  posts: PostSummary[]
}

const EXPERIMENT_ID = 'exp1_related_flow'

/**
 * 실험 exp1_related_flow — 글 상세 본문 직후(광고① 다음, 댓글 전) "다음에 읽기 좋은 이야기" 카드.
 *
 * - 클라이언트 전용: 글 상세가 force-static 이라 서버는 A/B 를 못 가름 → 브라우저에서 getExperimentVariant 평가.
 * - 노출(분모): A·B 모두 exp1_exposure 1회 기록. variant==='' (시작 전/미배정)는 노출도 기록 안 함.
 * - 렌더: variant==='B' && posts.length>0 일 때만 카드. 그 외(판정 전·시작 전·A·관련글 0)는 null = 현행과 동일.
 * - 카드 클릭은 TrackedPostLink(position='inline') 재사용 → related_post_click 보조지표 자동 발생.
 */
export default function NextPostsInline({ postId, boardSlug, posts }: Props) {
  const [variant, setVariant] = useState<string | null>(null) // null = 판정 전(CLS 방지)
  const firedRef = useRef(false)

  useEffect(() => {
    const v = getExperimentVariant(EXPERIMENT_ID) // '' = 시작 전/미배정
    setVariant(v)
    if (!v || firedRef.current) return
    firedRef.current = true
    const relatedCount = posts.length
    // A·B 모두 1회 노출 기록(분모). relatedCount 0 이면 rendered=false 로 세그먼트 구분 가능하게 properties 남김.
    trackEvent('exp1_exposure', {
      related_flow: v,
      postId,
      boardSlug,
      relatedCount,
      rendered: v === 'B' && relatedCount > 0,
    })
  }, [postId, boardSlug, posts])

  // 판정 전(null) · 시작 전('') · A · 관련글 0 → 렌더 없음(현행과 동일)
  if (variant !== 'B' || posts.length === 0) return null

  return (
    <section className="my-8 rounded-2xl border border-primary/20 bg-primary/5 p-5">
      <h2 className="text-body font-bold text-primary-text m-0 mb-2">
        📖 다음에 읽기 좋은 이야기
      </h2>
      <ol className="list-none m-0 p-0">
        {posts.map((post, idx) => (
          <li key={post.id} className="border-t border-primary/10 first:border-t-0">
            <TrackedPostLink
              href={`/community/${BOARD_TYPE_TO_SLUG[post.boardType]}/${post.slug ?? post.id}`}
              postId={post.id}
              position="inline"
              boardSlug={boardSlug}
              className="flex items-center gap-2.5 py-3 no-underline text-inherit min-h-[52px] hover:bg-primary/5 transition-colors -mx-2 px-2 rounded-lg"
            >
              <span className="text-body font-bold text-primary shrink-0">{idx + 1}</span>
              <span className="text-body font-medium text-foreground line-clamp-2 leading-[1.5]">
                {post.title}
              </span>
            </TrackedPostLink>
          </li>
        ))}
      </ol>
    </section>
  )
}
