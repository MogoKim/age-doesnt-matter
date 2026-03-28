/**
 * GA4 이벤트 트래킹 유틸리티
 *
 * GTM + gtag() 하이브리드 방식:
 * - GTM이 있으면 GTM이 GA4 pageview 처리
 * - 커스텀 이벤트는 gtag()로 직접 GA4에 전송 (GTM 태그 불필요)
 *
 * GA4 보고서에서 볼 수 있는 이벤트:
 * - page_view          : 페이지 조회 (GTM 자동 처리)
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

// ── 타입 ──

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[]
    gtag?: (...args: unknown[]) => void
  }
}

// ── Core ──

/** gtag()로 GA4에 직접 이벤트 전송 */
function sendEvent(eventName: string, params?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  if (window.gtag) {
    window.gtag('event', eventName, params)
  }
}

/** GTM dataLayer push (GTM 태그 전용 이벤트에만 사용) */
export function pushToDataLayer(data: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push(data)
}

// ── 이벤트 헬퍼 ──

/** 페이지 뷰 (SPA 네비게이션 시) */
export function gtmPageView(path: string, title?: string): void {
  sendEvent('page_view', {
    page_path: path,
    page_title: title ?? (typeof document !== 'undefined' ? document.title : ''),
  })
}

/** 회원가입 */
export function gtmSignUp(method: string = 'kakao'): void {
  sendEvent('sign_up', { method })
}

/** 로그인 */
export function gtmLogin(method: string = 'kakao'): void {
  sendEvent('login', { method })
}

/** 글 작성 */
export function gtmPostCreate(boardType: string, category?: string): void {
  sendEvent('post_create', {
    board_type: boardType,
    category: category ?? '',
  })
}

/** 댓글 작성 */
export function gtmCommentCreate(boardType: string): void {
  sendEvent('comment_create', { board_type: boardType })
}

/** 좋아요 */
export function gtmLike(contentType: string, contentId: string): void {
  sendEvent('like', {
    content_type: contentType,
    content_id: contentId,
  })
}

/** 공유 (카카오톡, 링크 복사 등) */
export function gtmShare(method: string, contentType: string, contentId: string): void {
  sendEvent('share', {
    method,
    content_type: contentType,
    content_id: contentId,
  })
}

/** 일자리 상세 조회 */
export function gtmJobView(jobId: string, jobTitle: string): void {
  sendEvent('job_view', {
    job_id: jobId,
    job_title: jobTitle,
  })
}

/** 매거진 상세 조회 */
export function gtmMagazineView(articleId: string, articleTitle: string, category: string): void {
  sendEvent('magazine_view', {
    article_id: articleId,
    article_title: articleTitle,
    category,
  })
}

/** 광고 클릭 */
export function gtmAdClick(adSlot: string, adType: string): void {
  sendEvent('ad_click', {
    ad_slot: adSlot,
    ad_type: adType,
  })
}

/** 쿠팡 CPS 상품 클릭 */
export function gtmCpsClick(productName: string, category: string): void {
  sendEvent('cps_click', {
    product_name: productName,
    category,
  })
}

/** 검색 */
export function gtmSearch(searchTerm: string, resultsCount?: number): void {
  sendEvent('search', {
    search_term: searchTerm,
    results_count: resultsCount ?? 0,
  })
}

/** 게시판 조회 */
export function gtmBoardView(boardType: string): void {
  sendEvent('board_view', { board_type: boardType })
}

/** 사용자 속성 설정 (로그인 후) */
export function gtmSetUserProperties(props: {
  user_id?: string
  user_type?: 'member' | 'guest'
  registration_method?: string
}): void {
  if (typeof window === 'undefined' || !window.gtag) return
  window.gtag('set', 'user_properties', props)
}
