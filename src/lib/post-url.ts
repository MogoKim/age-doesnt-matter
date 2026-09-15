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

/**
 * 경로 segment 하나를 **항상 ASCII 인 하나의 segment** 로 만든다.
 *
 * 🔴 **decode → encode 정규화**다. "`%XX` 가 보이면 그냥 둔다" 는 방식은 실측에서 깨졌다
 *    (2026-09-15 Codex 리뷰): `한글-%20-test` 처럼 **부분만** 인코딩된 입력이 들어오면
 *    raw 한글을 그대로 달고 나갔다. 정규화하면 어떤 입력이 와도 결과가 ASCII 다.
 *
 * 🔴 **멱등이다.** `encode(decode(encode(x))) === encode(x)` 이므로
 *    이미 인코딩된 값을 다시 넣어도 `%25` 로 부풀지 않는다.
 *
 * 🔴 **`/` 도 인코딩한다** — segment 함수이기 때문이다. 그냥 두면 segment 하나가
 *    경로 segment 두 개로 쪼개져 **라우팅이 바뀐다**. 경로 구분자를 보존하는 건
 *    `encodePathname` 의 일이다(거기서 `/` 로 쪼갠 뒤 이 함수를 부른다).
 *
 * malformed percent(`50%-할인` 처럼 `%` 가 홀로 있는 경우)는 decode 가 실패한다.
 * 그때는 입력을 **날것으로 보고** 인코딩한다 — `%` 는 `%25` 가 되는 게 맞다.
 * 이건 이중 인코딩이 아니라 **리터럴 `%` 의 정상 표기**다.
 */
export function encodePathSegment(segment: string): string {
  if (segment === '') return ''

  let decoded: string
  try {
    decoded = decodeURIComponent(segment)
  } catch {
    // 유효한 percent-encoding 이 아니다 → 전부 날것으로 본다
    return encodeURIComponent(segment)
  }
  return encodeURIComponent(decoded)
}

/**
 * 경로 전체 — segment 별로 인코딩하고 **`/` 구조는 그대로 둔다.**
 * 경로 구분자 보존은 여기 책임이다.
 */
export function encodePathname(pathname: string): string {
  return pathname
    .split('/')
    .map((seg) => encodePathSegment(seg))
    .join('/')
}

/** 생활 가이드 경로. slug 가 한글이라 sitemap·목록·상세·허브가 같은 표기를 써야 한다. */
export function buildGuidePath(slug: string): string {
  return `/guide/${encodePathSegment(slug)}`
}

/** 매거진 시리즈 허브 경로. `seriesId` 가 한글인 시리즈가 있다. */
export function buildSeriesPath(seriesId: string): string {
  return `/magazine/series/${encodePathSegment(seriesId)}`
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
