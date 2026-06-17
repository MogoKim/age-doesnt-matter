/**
 * 첫 참여 온보딩 — '가입인사' 카테고리 공통 상수 + 쓰기 가드 (Phase 1)
 *
 * 가입인사 글 = Post(boardType=STORY, category='가입인사', source=USER, 회원 작성)
 *  - SEO·홈·베스트·검색·사이트맵에서 제외 (일반 글/인기글 오염 방지)
 *  - 봇/API/SHEET/큐레이터(source !== USER) 생성 차단, 회원 createPost 경로만 허용
 *
 * 설계서: docs/analysis/first-participation-infra-design-2026-06-17.html
 */
import type { PostSource } from '@/generated/prisma/client'
import { ForbiddenError } from '@/lib/errors'

/** '사는 이야기'(STORY) 서브카테고리. 게시판 신설 없이 BoardConfig.categories 에 추가. */
export const GREETING_CATEGORY = '가입인사'

/**
 * 목록/인기/검색/사이트맵 쿼리에서 가입인사 글 제외용 where 조각.
 *
 * ⚠️ category 가 null 인 일반 글은 보존해야 하므로 `{ not }` 단독으로 쓰면 안 된다
 *    (Prisma/Postgres 3-value logic 상 NOT 비교는 NULL 행을 제외시킴).
 *    → `OR: [category != 가입인사, category is null]` 로 명시.
 *
 * 사용법:
 *  - 최상위 where 에 다른 OR 가 없으면 그대로 spread: `where: { ...base, ...EXCLUDE_GREETING }`
 *  - 이미 OR(검색 title/content 등)이 있으면 충돌하므로 AND 로 결합:
 *    `where: { AND: [base, EXCLUDE_GREETING] }`
 */
export const EXCLUDE_GREETING = {
  OR: [{ category: { not: GREETING_CATEGORY } }, { category: null }],
}

/**
 * 가입인사 글은 회원 createPost(source=USER) 경로로만 생성 가능.
 * 봇/API/SHEET/큐레이터 등 source !== USER 가 category='가입인사' 글을 만들려 하면 차단한다.
 *
 * 호출 위치: agents/cmo/*, agents/community/sheet-scraper, src/app/api/bot/posts 등
 *           prisma.post.create 직전.
 */
export function assertGreetingByMember(
  category: string | null | undefined,
  source: PostSource,
): void {
  if (category === GREETING_CATEGORY && source !== 'USER') {
    throw new ForbiddenError(
      `'${GREETING_CATEGORY}' 글은 회원만 작성할 수 있습니다 (source=${source})`,
    )
  }
}
