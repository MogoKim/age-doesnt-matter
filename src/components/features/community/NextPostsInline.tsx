'use client'

import { useEffect, useRef, useState } from 'react'
import type { PostSummary } from '@/types/api'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
import { trackEvent } from '@/lib/track'
import {
  scoreRelated,
  REC_ALGO_VERSION,
  REASON_LABEL,
  type ScoredPost,
} from '@/lib/recommend/related'
import { getViewedIds, pushViewed } from '@/lib/recommend/viewed'
import TrackedPostLink from './TrackedPostLink'

interface Props {
  /** 현재 글 ID (제외·노출 properties용) */
  postId: string
  boardSlug: string
  /** 현재 글 맥락 — 같은 주제/키워드 점수용 */
  currentCategory: string | null
  currentTitle: string
  currentPreview: string
  /** 서버에서 조회한 후보 pool(getRelatedCommunityPosts, 최대 24). 클라에서 본 글 제외 + 점수화. */
  posts: PostSummary[]
}

/**
 * 관련글 추천 v2 — 글 상세 본문 직후(광고① 다음, 댓글 전) "다음에 읽기 좋은 이야기".
 * (exp1_related_flow A/B 종료 → B 방향 채택: 항상 노출)
 *
 * - 클라이언트 전용: 글 상세 force-static 이라 서버는 세션(본 글)을 모름 → 브라우저에서 viewed 제외 + scoreRelated.
 * - 제외: 현재 글 / 이번 세션에서 본 글 / 가입인사. 0개면 미노출(현행과 동일).
 * - 점수: 맥락(같은 주제·키워드) × 흥미도(댓글·공감·조회·트렌딩·최신). 상위 3개 + reason 라벨.
 * - 카드 클릭은 TrackedPostLink(position='inline') → related_post_click(reason·rank·algoVersion 동봉).
 */
export default function NextPostsInline({
  postId, boardSlug, currentCategory, currentTitle, currentPreview, posts,
}: Props) {
  const [scored, setScored] = useState<ScoredPost[] | null>(null) // null = 계산 전(CLS 방지: 미렌더)
  const firedRef = useRef(false)

  useEffect(() => {
    const viewed = getViewedIds()
    const result = scoreRelated(
      { id: postId, category: currentCategory, title: currentTitle, preview: currentPreview },
      posts,
      { excludeIds: viewed, now: Date.now(), take: 3 },
    )
    setScored(result)
    pushViewed(postId) // 현재 글을 세션 기록 → 다음 글 추천에서 제외

    if (result.length > 0 && !firedRef.current) {
      firedRef.current = true
      trackEvent('related_recommend_view', {
        algo_version: REC_ALGO_VERSION,
        count: result.length,
        reasons: result.map((s) => s.reason),
      })
    }
  }, [postId, boardSlug, currentCategory, currentTitle, currentPreview, posts])

  // 계산 전(null) · 추천 0개 → 렌더 없음(현행과 동일)
  if (!scored || scored.length === 0) return null

  return (
    <section className="my-8 rounded-2xl border border-primary/20 bg-primary/5 p-5" aria-label="다음에 읽기 좋은 이야기">
      <h2 className="text-body font-bold text-primary-text m-0 mb-2">
        📖 다음에 읽기 좋은 이야기
      </h2>
      <ol className="list-none m-0 p-0">
        {scored.map(({ post, reason, rank }, idx) => (
          <li key={post.id} className="border-t border-primary/10 first:border-t-0">
            <TrackedPostLink
              href={`/community/${BOARD_TYPE_TO_SLUG[post.boardType]}/${post.slug ?? post.id}`}
              postId={post.id}
              position="inline"
              boardSlug={boardSlug}
              algoVersion={REC_ALGO_VERSION}
              rank={rank}
              reason={reason}
              sourcePostId={postId}
              className="flex items-center gap-2.5 py-3 no-underline text-inherit min-h-[52px] hover:bg-primary/5 transition-colors -mx-2 px-2 rounded-lg"
            >
              <span className="text-body font-bold text-primary shrink-0">{idx + 1}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-body font-medium text-foreground line-clamp-2 leading-[1.5]">
                  {post.title}
                </span>
                <span className="mt-0.5 inline-block text-caption font-bold text-primary-text">
                  {REASON_LABEL[reason]}
                </span>
              </span>
            </TrackedPostLink>
          </li>
        ))}
      </ol>
    </section>
  )
}
