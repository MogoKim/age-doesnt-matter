/**
 * 참여 이벤트 MVP 1A — 이벤트 연동 게시글 격리 상수 + 가드
 *
 * 투표형 이벤트의 연동 게시글 = Post(boardType=STORY, source=ADMIN, category='이벤트')
 *  - 공식 상세는 /events/[id] 에서만 노출. 사는이야기 목록/홈/트렌딩/검색/사이트맵에서 제외.
 *  - 커뮤니티 상세 직접 URL 접근 시 /events/[id] 로 redirect (event-post 감지).
 *
 * ⚠️ EXCLUDE_GREETING(가입인사) 패턴을 그대로 미러링. schema 변경 없음(Post.category 재사용).
 * 설계서: docs/analysis/participation-events-formalization-design-v2-2026-07-14.md
 */
import type { PostSource } from '@/generated/prisma/client'
import { ForbiddenError } from '@/lib/errors'

/** 이벤트 연동 게시글 내부 예약 카테고리 (사용자 카테고리 목록엔 절대 노출 안 함) */
export const EVENT_CATEGORY = '이벤트'

/**
 * 목록/인기/검색/사이트맵 쿼리에서 이벤트 연동글 제외용 where 조각.
 * EXCLUDE_GREETING과 동일하게 category null 일반 글은 보존(3-value logic 대응).
 *
 * 사용법(EXCLUDE_GREETING와 동일):
 *  - 이미 EXCLUDE_GREETING을 AND로 쓰는 곳: `AND: [EXCLUDE_GREETING, EXCLUDE_EVENT]`
 *  - 스프레드로 쓰던 곳: `AND: [EXCLUDE_GREETING, EXCLUDE_EVENT]` 로 전환
 */
export const EXCLUDE_EVENT = {
  OR: [{ category: { not: EVENT_CATEGORY } }, { category: null }],
}

/**
 * 이벤트 연동글(category='이벤트')은 어드민(source=ADMIN) 자동 생성 경로로만 만든다.
 * 회원 글쓰기(source=USER)나 봇/시트가 category='이벤트'를 쓰려 하면 차단 → 사용자 카테고리 오염 방지.
 * 호출 위치: 회원 createPost, agents/*, api/bot/posts 등 prisma.post.create 직전(적용 시).
 */
export function assertEventByAdmin(
  category: string | null | undefined,
  source: PostSource,
): void {
  if (category === EVENT_CATEGORY && source !== 'ADMIN') {
    throw new ForbiddenError(
      `'${EVENT_CATEGORY}' 카테고리는 공식 이벤트 전용입니다 (source=${source})`,
    )
  }
}
