'use client'

import { useEffect, useRef, useState } from 'react'
import type { PostSummary, BoardType } from '@/types/api'
import { BOARD_TYPE_TO_SLUG } from '@/types/api'
import { trackEvent } from '@/lib/track'
import {
  scoreRelatedV2,
  REC_ALGO_VERSION_V2,
  REASON_LABEL,
  type ScoredPost,
} from '@/lib/recommend/related'
// related_algo_v2 A/B 종료(2026-07-08, B winner 채택) → getRelatedAbArm / scoreRelated(v1) 직접 사용 경로 제거.
// v1(scoreRelated·REC_ALGO_VERSION)·ab.ts는 rollback 용도로 related.ts/ab.ts에 export 보존.
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
  /** 현재 글 보드 — v2 크로스보드 판별용 */
  currentBoardType: BoardType
  /** 서버에서 조회한 후보 pool(getRelatedCommunityPosts, 같은 보드 최대 24). 클라에서 본 글 제외 + 점수화. */
  posts: PostSummary[]
  /** 크로스보드 후보(getCrossBoardCandidates). rec_v2 전면 적용 후 상시 사용. */
  crossBoardPosts?: PostSummary[]
}

/**
 * 관련글 추천 — 글 상세 본문 직후(광고① 다음, 댓글 전) "다음에 읽기 좋은 이야기".
 * (exp1_related_flow A/B 종료 → 상시 노출. related_algo_v2 A/B도 종료 → B(rec_v2) winner 전면 적용)
 *
 * - 클라이언트 전용: 글 상세 force-static 이라 서버는 세션(본 글)을 모름 → 브라우저에서 viewed 제외 + 점수화.
 * - 점수화: 전 사용자 scoreRelatedV2(키워드 가중↑·크로스보드) 고정. 이벤트 algo_version = REC_ALGO_VERSION_V2.
 *   (v1=scoreRelated·getRelatedAbArm은 related.ts/ab.ts에 rollback 용도로 export 보존, 사용처는 제거됨)
 * - 제외: 현재 글 / 이번 세션에서 본 글 / 가입인사. 0개면 미노출(현행과 동일).
 * - 카드 클릭은 TrackedPostLink(position='inline') → related_post_click(reason·rank·algoVersion 동봉).
 */
export default function NextPostsInline({
  postId, boardSlug, currentCategory, currentTitle, currentPreview, currentBoardType, posts, crossBoardPosts,
}: Props) {
  const [scored, setScored] = useState<ScoredPost[] | null>(null) // null = 계산 전(CLS 방지: 미렌더)
  const [algoVer, setAlgoVer] = useState<string>(REC_ALGO_VERSION_V2)
  const firedRef = useRef(false)

  useEffect(() => {
    const viewed = getViewedIds()
    const current = { id: postId, category: currentCategory, title: currentTitle, preview: currentPreview }
    // related_algo_v2 A/B 종료(B winner 채택) → 전 사용자 v2(scoreRelatedV2, 키워드 가중↑·크로스보드) 고정.
    const result = scoreRelatedV2(
      { ...current, boardType: currentBoardType },
      [...posts, ...(crossBoardPosts ?? [])],
      { excludeIds: viewed, now: Date.now(), take: 3 },
    )
    const version = REC_ALGO_VERSION_V2
    setScored(result)
    setAlgoVer(version)
    pushViewed(postId) // 현재 글을 세션 기록 → 다음 글 추천에서 제외

    if (result.length > 0 && !firedRef.current) {
      firedRef.current = true
      trackEvent('related_recommend_view', {
        algo_version: version,
        count: result.length,
        reasons: result.map((s) => s.reason),
      })
    }
  }, [postId, boardSlug, currentCategory, currentTitle, currentPreview, currentBoardType, posts, crossBoardPosts])

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
              algoVersion={algoVer}
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
