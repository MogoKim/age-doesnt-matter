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
