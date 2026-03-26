/**
 * Google Tag Manager dataLayer 유틸리티
 *
 * GTM → GA4로 전달되는 커스텀 이벤트를 코드에서 push.
 * GTM_ID가 없어도 안전하게 동작 (no-op).
 *
 * GA4 보고서에서 볼 수 있는 이벤트:
 * - page_view          : 페이지 조회 (자동 + enhanced)
 * - sign_up            : 회원가입 완료
 * - login              : 로그인
 * - post_create        : 글 작성
 * - comment_create     : 댓글 작성
 * - like               : 좋아요
 * - share              : 공유 (카카오 등)
 * - job_view           : 일자리 상세 조회
 * - magazine_view      : 매거진 상세 조회
 * - ad_click           : 광고 클릭
 * - cps_click          : 쿠팡 CPS 상품 클릭
 * - search             : 검색
 * - board_view         : 게시판 조회
 */

// ── dataLayer 타입 ──

interface DataLayerEvent {
  event: string
  [key: string]: unknown
}

declare global {
  interface Window {
    dataLayer?: DataLayerEvent[]
  }
}

// ── Core push ──

export function pushToDataLayer(data: DataLayerEvent): void {
  if (typeof window === 'undefined') return
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push(data)
}

// ── 이벤트 헬퍼 ──

/** 페이지 뷰 (SPA 네비게이션 시) */
export function gtmPageView(path: string, title?: string): void {
  pushToDataLayer({
    event: 'page_view',
    page_path: path,
    page_title: title ?? document.title,
  })
}

/** 회원가입 */
export function gtmSignUp(method: string = 'kakao'): void {
  pushToDataLayer({
    event: 'sign_up',
    method,
  })
}

/** 로그인 */
export function gtmLogin(method: string = 'kakao'): void {
  pushToDataLayer({
    event: 'login',
    method,
  })
}

/** 글 작성 */
export function gtmPostCreate(boardType: string, category?: string): void {
  pushToDataLayer({
    event: 'post_create',
    board_type: boardType,
    category: category ?? '',
  })
}

/** 댓글 작성 */
export function gtmCommentCreate(boardType: string): void {
  pushToDataLayer({
    event: 'comment_create',
    board_type: boardType,
  })
}

/** 좋아요 */
export function gtmLike(contentType: string, contentId: string): void {
  pushToDataLayer({
    event: 'like',
    content_type: contentType,
    content_id: contentId,
  })
}

/** 공유 (카카오톡, 링크 복사 등) */
export function gtmShare(method: string, contentType: string, contentId: string): void {
  pushToDataLayer({
    event: 'share',
    method,
    content_type: contentType,
    content_id: contentId,
  })
}

/** 일자리 상세 조회 */
export function gtmJobView(jobId: string, jobTitle: string): void {
  pushToDataLayer({
    event: 'job_view',
    job_id: jobId,
    job_title: jobTitle,
  })
}

/** 매거진 상세 조회 */
export function gtmMagazineView(articleId: string, articleTitle: string, category: string): void {
  pushToDataLayer({
    event: 'magazine_view',
    article_id: articleId,
    article_title: articleTitle,
    category,
  })
}

/** 광고 클릭 */
export function gtmAdClick(adSlot: string, adType: string): void {
  pushToDataLayer({
    event: 'ad_click',
    ad_slot: adSlot,
    ad_type: adType,
  })
}

/** 쿠팡 CPS 상품 클릭 */
export function gtmCpsClick(productName: string, category: string): void {
  pushToDataLayer({
    event: 'cps_click',
    product_name: productName,
    category,
  })
}

/** 검색 */
export function gtmSearch(searchTerm: string, resultsCount?: number): void {
  pushToDataLayer({
    event: 'search',
    search_term: searchTerm,
    results_count: resultsCount ?? 0,
  })
}

/** 게시판 조회 */
export function gtmBoardView(boardType: string): void {
  pushToDataLayer({
    event: 'board_view',
    board_type: boardType,
  })
}

/** 사용자 속성 설정 (로그인 후) */
export function gtmSetUserProperties(props: {
  user_id?: string
  user_type?: 'member' | 'guest'
  registration_method?: string
}): void {
  pushToDataLayer({
    event: 'user_properties',
    ...props,
  })
}
