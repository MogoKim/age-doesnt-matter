/**
 * 목록 페이지의 쿼리 해석 — **서버와 클라이언트가 같은 규칙**을 쓰게 만든다.
 *
 * 서버(page.tsx)는 이 함수로 요청된 페이지를 알아내 그 데이터를 렌더하고,
 * 클라이언트 목록 컴포넌트는 같은 규칙으로 정규화한 문자열을 비교해
 * **서버가 이미 그린 것과 같으면 다시 가져오지 않는다.**
 *
 * 두 곳의 규칙이 갈리면 서버 HTML 과 hydration 결과가 달라지거나(React #418),
 * 첫 화면에서 불필요한 재조회가 한 번 더 일어난다.
 */
/**
 * 검색 대상 축 — 제목만 / 내용만 / 둘 다.
 *
 * 🔴 **여기가 정본이다.** 예전에는 이 타입이 `queries/posts/posts.base.ts` 에 있고
 *    파서는 7곳에 각자 복사돼 있었다(API 3 · 목록 클라이언트 3 · 검색바 1).
 *    `posts.base.ts` 는 `prisma` 와 `next/cache` 를 import 한다 — 클라이언트 컴포넌트가
 *    거기서 값을 하나라도 가져오면 **브라우저 번들에 Prisma 와 서버 캐시가 딸려온다.**
 *    타입 전용 import 라 지금까지는 지워졌지만, 한 번만 실수하면 새는 구조였다.
 *    이 모듈은 **import 가 하나도 없어** 서버·브라우저 어디서 불러도 안전하다.
 *    `ci`/계약 테스트가 이 모듈의 무의존성을 고정한다.
 */
export type SearchField = 'both' | 'title' | 'content'

/**
 * `?sf=` 값을 검색 축으로 해석한다. 모르는 값은 `both`.
 *
 * 입력이 `'both'` 든 `null` 이든 오타든 결과가 같다 — 기존 7개 복사본의 동작 그대로다.
 */
export function parseSearchField(raw: string | null | undefined): SearchField {
  if (raw === 'title' || raw === 'content') return raw
  return 'both'
}

export type ListSort = 'latest' | 'likes'

export interface ListQuery {
  /** 1 이상. 잘못된 값은 1 로 본다. */
  page: number
  sort: ListSort
  /** 정규화된 쿼리 문자열 — 서버가 그린 상태를 클라이언트에 알려줄 때 쓴다. */
  query: string
}

type RawParams = Record<string, string | string[] | undefined> | URLSearchParams

function pick(params: RawParams, key: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined
  const v = params[key]
  return Array.isArray(v) ? v[0] : v
}

/**
 * 서버가 책임지는 축은 **page 와 sort 뿐**이다.
 *
 * `category`·`q` 는 클라이언트에 남긴다 — 검색어는 값이 무한해 캐시 항목이 발산하고,
 * 검색 결과 페이지는 애초에 수집 대상이 아니다. 반면 페이지네이션 링크는
 * 목록에서 실제로 걸리는 내부 링크라 서버가 그려야 한다.
 */
export function parseListQuery(params: RawParams): ListQuery {
  const rawPage = pick(params, 'page')
  const parsed = Number.parseInt(rawPage ?? '1', 10)
  const page = Number.isFinite(parsed) && parsed > 0 ? parsed : 1
  const sort: ListSort = pick(params, 'sort') === 'likes' ? 'likes' : 'latest'

  const normalized = new URLSearchParams()
  if (sort === 'likes') normalized.set('sort', sort)
  if (page > 1) normalized.set('page', String(page))

  return { page, sort, query: normalized.toString() }
}

/**
 * 클라이언트가 현재 URL 쿼리를 서버 렌더분과 비교할 수 있게 정규화한다.
 * 서버가 다루지 않는 축(`category`·`q`·`sf`)이 하나라도 있으면 **서버 렌더와 다르다**고 본다.
 */
export function normalizeClientQuery(search: string): string {
  const params = new URLSearchParams(search)
  const serverOwned = parseListQuery(params).query
  const hasClientOnly = ['category', 'q', 'sf', 'region', 'tags'].some((k) => {
    const v = params.get(k)
    return v != null && v !== '' && v !== '전체'
  })
  return hasClientOnly ? `client:${params.toString()}` : serverOwned
}

/**
 * 목록 한 페이지의 글 수. **경계 판정의 단일 소스**다.
 *
 * 쿼리(`getCachedBoardPage*`)와 404 경계(`isPageOutOfRange`)가 서로 다른 값을 쓰면
 * "마지막 페이지인데 404" 또는 "빈 페이지인데 200"이 생긴다.
 */
export const LIST_PAGE_SIZE = 12

/**
 * 요청된 페이지가 **존재하지 않는 범위**인지 — true 면 호출부가 `notFound()` 를 던진다.
 *
 * 왜 필요한가: `?page=12` 처럼 마지막 페이지를 넘긴 요청이 **200 + 글 0건**을 돌려줬다
 * (2026-09-16 실측: `/community/stories?page=12` → 200, 글 링크 0). 수집기에게는
 * 무한히 이어지는 빈 페이지로 보여 soft-404 를 양산한다.
 *
 * 🔴 **글이 하나도 없는 게시판의 1페이지는 404 가 아니다.** 게시판 자체는 존재하고
 *    "아직 글이 없습니다"는 정상 응답이다. 그래서 하한을 1 페이지로 둔다.
 */
export function isPageOutOfRange(page: number, total: number, pageSize: number = LIST_PAGE_SIZE): boolean {
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  return page > lastPage
}
