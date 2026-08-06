/**
 * 상세 상단 띠배너(DETAIL_HEADER)가 노출되는 경로 — 단일 진실의 원천.
 *
 * 목록 띠배너(LIST_HEADER, @/lib/ad-routes)와 헷갈리지 말 것.
 *   목록 띠  3:1 · 고정 경로 7개(/best, /community/stories …)
 *   상세 띠  5:1 · 동적 경로(글 하나하나) — 그래서 배열이 아니라 판별 함수다
 *
 * 글쓰기·수정·목록·시리즈·지역 페이지에는 뜨면 안 된다.
 * 새 상세 라우트가 생기면 여기 한 곳만 고친다.
 */
import { COMMUNITY_SITEMAP_SLUGS } from '@/lib/board-registry'

/** /community/{slug}/{postId} 에서 slug로 인정하는 값 — 보드 레지스트리와 같은 소스 */
const COMMUNITY_SLUGS: readonly string[] = COMMUNITY_SITEMAP_SLUGS

/**
 * 상세 글 화면인가?
 *
 * 통과: /community/stories/abc123 · /magazine/some-slug · /jobs/abc123
 * 제외: 목록(/community/stories) · 글쓰기(/community/write) ·
 *       수정(/community/stories/abc/edit) · 시리즈(/magazine/series/1) ·
 *       지역(/jobs/region/seoul)
 */
export function isDetailRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  // 쿼리·해시는 usePathname이 주지 않지만, 서버/테스트에서 통째로 넘어와도 안전하게 자른다
  const path = pathname.split(/[?#]/)[0]
  const seg = path.split('/').filter(Boolean)

  // /community/{slug}/{postId} — 정확히 3조각이어야 한다(edit은 4조각이라 자동 제외)
  if (seg[0] === 'community') {
    return seg.length === 3 && COMMUNITY_SLUGS.includes(seg[1])
  }

  // /magazine/{id} — series 같은 하위 라우트는 뺀다
  if (seg[0] === 'magazine') {
    return seg.length === 2 && seg[1] !== 'series'
  }

  // /jobs/{id} — region 하위 라우트는 뺀다
  if (seg[0] === 'jobs') {
    return seg.length === 2 && seg[1] !== 'region'
  }

  return false
}

/** 안내 문구용 — 어디에 뜨는지 사람 말로 */
export const DETAIL_HEADER_SCOPE_LABEL =
  '커뮤니티 글 상세(사는이야기·갱년기톡·2막준비·웃음방) · 매거진 상세 · 내일찾기 상세'
