/**
 * 글 URL 생성 — **단일 소스**.
 *
 * ── 🔴 왜 만들었나 ──────────────────────────────────────────
 *  slug 가 한글이라 sitemap 과 SSR 링크에 **raw non-ASCII** 가 그대로 들어갔다.
 *  브라우저는 알아서 인코딩해 주지만 **네이버 크롤러(Yeti)는 그 URL 을 못 가져온다.**
 *  같은 글이라도 percent-encoded URL 로는 200, raw 한글 URL 로는 접근 실패였다
 *  (2026-09-15 실측 · sitemap 229개 중 **138개가 raw non-ASCII**).
 *
 *  `canonical`·`og:url` 은 이미 인코딩돼 있었다 — **sitemap 과 내부 링크만** 규칙이 달랐다.
 *  그래서 URL 을 만드는 곳을 여기 하나로 모은다.
 *
 * ── 규칙 ────────────────────────────────────────────────────
 *  · 경로 segment 만 **정확히 한 번** 인코딩한다
 *  · `/` 를 인코딩하지 않는다 — 경로 구조가 깨진다
 *  · 이미 인코딩된 `%` 를 `%25` 로 **이중 인코딩하지 않는다**
 *  · `decodeURI` 하면 원래 URL 과 같다 — **가리키는 대상은 그대로**다
 */
import { BOARD_TYPE_TO_SLUG_MAP, type BoardTypeId } from '@/lib/board-registry'

export const SITE_ORIGIN = 'https://age-doesnt-matter.com'

/** 이미 percent-encoded 인가 — `%XX` 형태가 하나라도 있으면 인코딩된 것으로 본다. */
const ALREADY_ENCODED = /%[0-9A-Fa-f]{2}/

/**
 * 경로 segment 하나를 인코딩한다.
 *
 * 🔴 **멱등이다.** 이미 인코딩된 값을 다시 넣어도 `%25` 로 부풀지 않는다 —
 *    링크가 여러 단계를 거치며 인코딩이 겹치는 사고를 막는다.
 *
 * `/` 는 건드리지 않는다. segment 에 slash 가 들어오는 건 애초에 잘못된 입력이지만,
 * 그렇다고 `%2F` 로 바꿔 경로를 깨뜨리는 것보다는 그대로 두는 편이 안전하다.
 */
export function encodePathSegment(segment: string): string {
  if (segment === '') return ''
  if (ALREADY_ENCODED.test(segment)) return segment
  return segment
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
}

/** 경로 전체 — segment 별로 인코딩하고 `/` 구조는 그대로 둔다. */
export function encodePathname(pathname: string): string {
  return pathname
    .split('/')
    .map((seg) => encodePathSegment(seg))
    .join('/')
}

export interface PostUrlInput {
  id: string
  boardType: BoardTypeId | string
  slug?: string | null
}

/**
 * 글의 **경로**(origin 없음). 보드별 규칙 + 인코딩을 한 번에 적용한다.
 *
 * JOB 은 id 를, 그 외는 slug 우선(없으면 id)을 쓴다 — 기존 라우팅과 같다.
 */
export function buildPostPath(post: PostUrlInput): string {
  const key = post.boardType === 'JOB' ? post.id : (post.slug || post.id)
  const seg = encodePathSegment(key)

  if (post.boardType === 'JOB') return `/jobs/${seg}`
  if (post.boardType === 'MAGAZINE') return `/magazine/${seg}`

  // `?? 'stories'` 는 기존 호출부(SearchResults·my/posts·my/scraps·BestContent)가 쓰던 fallback 이다.
  // 여기로 옮겨 **같은 방어**를 한 곳에서 한다 — 링크가 `/community/undefined/...` 로 깨지지 않는다.
  const boardSlug = BOARD_TYPE_TO_SLUG_MAP[post.boardType as BoardTypeId] ?? 'stories'
  return `/community/${boardSlug}/${seg}`
}

/** 글의 **절대 URL**. sitemap·canonical·og:url 이 같은 값을 쓰게 한다. */
export function buildPostUrl(post: PostUrlInput): string {
  return `${SITE_ORIGIN}${buildPostPath(post)}`
}
