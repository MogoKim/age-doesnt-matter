/**
 * 게시판 중앙 레지스트리 (PR-0: 동작 불변 리팩토링)
 *
 * 배경: 보드 slug/URL 매핑이 21개 파일에 흩어져 있어(BOARD_SLUG_MAP, BOARD_URL_PREFIX ×2,
 * BOARD_PATHS ×5, sitemap/prewarm 로컬맵 등) 새 보드 추가 시 누락 → 오링크·sitemap 오류가
 * 조용히 발생하는 구조였다. 이 파일이 보드 slug/URL 정보의 단일 소스(SSoT)다.
 *
 * 새 보드 추가 시: 이 배열에 1항목 추가하면 파생 맵(BOARD_SLUG_TO_TYPE, BOARD_TYPE_TO_SLUG_MAP,
 * BOARD_URL_PREFIX, sitemap/prewarm 목록)이 자동 반영된다.
 * ※ 다음 단계 제품 결정: 새 보드 MENOPAUSE의 사용자 표시명은 "갱년기 톡" (이번 PR에는 미추가).
 * ※ 표시명(displayName)·카테고리는 여기 두지 않는다 — DB BoardConfig(seed.ts)와
 *   src/lib/board-constants.ts(BOARD_DISPLAY_NAMES)가 담당(기존 구조 유지).
 * ※ agents/ 쪽은 src/ 런타임 import 금지 규칙 때문에 이 파일을 import할 수 없다
 *   (예: agents/cmo/social-poster.ts는 로컬 맵 유지 — 값 변경 시 수동 동기화 필요).
 */

export type BoardTypeId = 'JOB' | 'STORY' | 'HUMOR' | 'MAGAZINE' | 'WEEKLY' | 'LIFE2'

export interface BoardRegistryEntry {
  /** Prisma BoardType enum 값 */
  type: BoardTypeId
  /** URL slug — 커뮤니티는 /community/[slug], MAGAZINE·JOB은 /[slug] 최상위 라우트 */
  slug: string
  /** 서비스 URL 접두사 (알림·홈·어드민 링크 생성 + revalidatePath 대상) */
  urlPrefix: string
  /** /community/[boardSlug] 라우트를 쓰는 커뮤니티 게시판 여부 */
  isCommunity: boolean
  /**
   * 목록 페이지가 실제 라우팅되는 활성 게시판 여부.
   * WEEKLY=false: 숨김 게시판(라우트 없음, LIFE2로 대체) — sitemap/prewarm 포함 시 404.
   */
  hasListRoute: boolean
}

export const BOARD_REGISTRY = [
  { type: 'STORY', slug: 'stories', urlPrefix: '/community/stories', isCommunity: true, hasListRoute: true },
  { type: 'HUMOR', slug: 'humor', urlPrefix: '/community/humor', isCommunity: true, hasListRoute: true },
  { type: 'LIFE2', slug: 'life2', urlPrefix: '/community/life2', isCommunity: true, hasListRoute: true },
  { type: 'MAGAZINE', slug: 'magazine', urlPrefix: '/magazine', isCommunity: false, hasListRoute: true },
  { type: 'JOB', slug: 'jobs', urlPrefix: '/jobs', isCommunity: false, hasListRoute: true },
  { type: 'WEEKLY', slug: 'weekly', urlPrefix: '/community/weekly', isCommunity: true, hasListRoute: false },
] as const satisfies readonly BoardRegistryEntry[]

type RegistryEntry = (typeof BOARD_REGISTRY)[number]

/** slug → BoardType (구 BOARD_SLUG_MAP과 동일 내용) */
export const BOARD_SLUG_TO_TYPE = Object.fromEntries(
  BOARD_REGISTRY.map((b) => [b.slug, b.type]),
) as { [E in RegistryEntry as E['slug']]: E['type'] }

/**
 * BoardType → slug (구 BOARD_TYPE_TO_SLUG와 동일 내용).
 * 매핑 타입으로 잠가 registry에서 enum 값이 빠지면 Record<BoardTypeId,…> 대입부에서 컴파일 에러.
 */
export const BOARD_TYPE_TO_SLUG_MAP = Object.fromEntries(
  BOARD_REGISTRY.map((b) => [b.type, b.slug]),
) as { [E in RegistryEntry as E['type']]: E['slug'] }

/**
 * BoardType → 서비스 URL 접두사.
 * 구 BOARD_URL_PREFIX(notifications/link.ts·queries/home.ts)와
 * 구 BOARD_PATHS(admin 4곳·revalidate-deleted)가 전부 이 동일 맵이었다 → 통합.
 */
export const BOARD_URL_PREFIX = Object.fromEntries(
  BOARD_REGISTRY.map((b) => [b.type, b.urlPrefix]),
) as { [E in RegistryEntry as E['type']]: E['urlPrefix'] }

/** 활성 커뮤니티 게시판(목록 라우트 존재) — sitemap 목록·prewarm 대상 */
const ACTIVE_COMMUNITY = BOARD_REGISTRY.filter((b) => b.isCommunity && b.hasListRoute)

/** sitemap 커뮤니티 목록 URL용 slug (구 sitemap BOARD_SLUGS와 동일: stories/humor/life2) */
export const COMMUNITY_SITEMAP_SLUGS: string[] = ACTIVE_COMMUNITY.map((b) => b.slug)

/** 활성 커뮤니티 BoardType 목록 (prewarm 쿼리 대상과 동일: STORY/HUMOR/LIFE2) */
export const ACTIVE_COMMUNITY_BOARD_TYPES: BoardTypeId[] = ACTIVE_COMMUNITY.map((b) => b.type)

/** 활성 커뮤니티 BoardType → slug (구 prewarm COMMUNITY_BOARD_SLUG와 동일) */
export const ACTIVE_COMMUNITY_BOARD_SLUG = Object.fromEntries(
  ACTIVE_COMMUNITY.map((b) => [b.type, b.slug]),
) as Record<'STORY' | 'HUMOR' | 'LIFE2', string>

/** 활성 커뮤니티 목록 경로 (prewarm LIST_PATHS의 커뮤니티 부분과 동일) */
export const ACTIVE_COMMUNITY_LIST_PATHS: string[] = ACTIVE_COMMUNITY.map((b) => b.urlPrefix)
