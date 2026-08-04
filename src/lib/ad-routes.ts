/**
 * 목록 상단 띠 광고(LIST_HEADER)가 노출되는 페이지 — 단일 진실의 원천.
 *
 * 배경: 같은 목록을 두 곳이 각자 들고 있다가 어긋났다.
 *   - 렌더(ListBannerClient)는 7개 경로를 알고 있었는데
 *   - 어드민 선택 칩(AdBannerTable)에는 갱년기톡이 빠져 6개였다
 * 그래서 운영자가 노출 페이지를 직접 고르면 **갱년기톡만 영영 선택할 수 없었다**
 * (전체 공통으로 두면 노출은 되므로 조용히 어긋난 채로 남았다).
 *
 * 커뮤니티 보드가 늘면 여기만 고치면 렌더·어드민·안내 문구가 함께 따라온다.
 * 개수를 문장에 박아 쓰지 말고 LIST_HEADER_ROUTE_COUNT를 쓸 것.
 */

export interface ListHeaderRoute {
  /** 정확 매칭할 경로 (상세·글쓰기 등은 제외) */
  value: string
  /** 어드민 선택 칩·안내 문구에 쓰는 표시명 */
  label: string
}

export const LIST_HEADER_ROUTES: readonly ListHeaderRoute[] = [
  { value: '/best', label: '베스트' },
  { value: '/community/stories', label: '사는이야기' },
  { value: '/community/menopause', label: '갱년기톡' },
  { value: '/community/life2', label: '2막준비' },
  { value: '/community/humor', label: '웃음방' },
  { value: '/magazine', label: '매거진' },
  { value: '/jobs', label: '내일찾기' },
] as const

/** 렌더 쪽 경로 매칭용 */
export const LIST_HEADER_PATHS: readonly string[] = LIST_HEADER_ROUTES.map((r) => r.value)

/** 안내 문구에 쓰는 개수 — "7개 목록 페이지" 같은 문장을 손으로 세지 않는다 */
export const LIST_HEADER_ROUTE_COUNT = LIST_HEADER_ROUTES.length

/** 안내 문구용 표시명 나열 — "베스트·사는이야기·갱년기톡·…" */
export const LIST_HEADER_LABELS = LIST_HEADER_ROUTES.map((r) => r.label).join('·')
