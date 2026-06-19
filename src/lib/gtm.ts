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
 * - post_view          : 커뮤니티 게시글 상세 조회
 */

import { isAppNative } from '@/lib/analytics/app-analytics'

// ── 타입 ──

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[]
    gtag?: (...args: unknown[]) => void
    /** GtagLoader가 등록 — 전환 이벤트 직전 gtag 로드를 능동 시작 */
    __unaoEnsureGtag?: () => void
  }
}

// gtag 지연 로드: GA4_ID 없으면(CI/local/preview) 대기 없이 즉시 resolve
const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID

// ── 이벤트 큐 (레이스 컨디션 방지) ──
// gtag.js는 strategy="afterInteractive"로 비동기 로드됨.
// 컴포넌트 마운트 시점에 window.gtag가 undefined이면 이벤트가 조용히 드랍되는 문제를 방지.
// gtag 로드 완료 전 발사된 이벤트를 큐에 보관 → markGtagReady() 호출 시 일괄 플러시.

type QueuedEvent = { name: string; params?: Record<string, unknown> }
const _eventQueue: QueuedEvent[] = []
let _gtagReady = false
const MAX_QUEUE_SIZE = 100

/**
 * gtag-init 스크립트 onLoad 시 호출.
 * 큐에 쌓인 이벤트를 순서대로 GA4에 전송.
 */
export function markGtagReady(): void {
  _gtagReady = true
  while (_eventQueue.length > 0) {
    const item = _eventQueue.shift()!
    window.gtag?.('event', item.name, item.params)
  }
}

/**
 * _gtagReady가 true가 될 때까지 대기 (markGtagReady() 호출 시).
 * window.gtag 존재 체크는 부족 — GTM stub이 미리 생성되기 때문.
 * 핵심: _gtagReady=true + 큐 플러시 완료를 보장해야 sign_up 전송 가능.
 */
export async function waitForGtagReady(timeoutMs = 2000): Promise<void> {
  if (typeof window === 'undefined') return
  // 앱(Capacitor): gtag 미로드(GtagLoader가 앱에서 차단) → 대기 불필요, 즉시 통과.
  if (isAppNative()) return
  // GA4_ID 없으면 gtag가 영영 로드되지 않음 → 전환 직전 불필요한 2초 대기 금지
  if (!GA4_ID) return
  // 전환 이벤트(sign_up/login) 직전 gtag 로드를 능동 시작 (트리거를 기다리지 않음).
  // OnboardingForm: gtmSignUp() → waitForGtagReady() 순서이므로, 여기서 로드를 시작해야
  // sign_up이 큐에만 남고 navigation 되는 유실을 막는다.
  window.__unaoEnsureGtag?.()
  if (_gtagReady) return
  return new Promise((resolve) => {
    const t0 = Date.now()
    const check = () => {
      if (_gtagReady || Date.now() - t0 > timeoutMs) resolve()
      else setTimeout(check, 50)
    }
    check()
  })
}

// ── Core ──

/** gtag()로 GA4에 직접 이벤트 전송. gtag 미로드 시 큐에 보관. */
function sendEvent(eventName: string, params?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  // 앱(Capacitor): gtag(web stream) 전송·큐적재 전면 금지. 핵심 이벤트는 native Firebase Analytics로만.
  //   모든 gtm 헬퍼(sendGtmEvent/gtmLogin/gtmSignUp/gtmPageView 등)가 이 함수를 경유 → 단일 차단점.
  if (isAppNative()) return
  if (navigator.webdriver) return
  if (_gtagReady && window.gtag) {
    window.gtag('event', eventName, params)
  } else {
    if (_eventQueue.length < MAX_QUEUE_SIZE) {
      _eventQueue.push({ name: eventName, params })
    }
  }
}

/**
 * 외부 컴포넌트에서 직접 이벤트를 전송할 때 사용 (GTMEventOnMount 등).
 * sendEvent 내부 큐를 통해 gtag 레이스 컨디션 자동 처리.
 */
export function sendGtmEvent(eventName: string, params?: Record<string, unknown>): void {
  sendEvent(eventName, params)
}

/** GTM dataLayer push (GTM 태그 전용 이벤트에만 사용) */
export function pushToDataLayer(data: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push(data)
}

// ── UTM 보존 (광고 소재 → 유저 저니 추적 핵심) ──
// 광고 클릭 → 랜딩 시 utm_* 파라미터를 sessionStorage에 저장.
// 이후 sign_up 등 전환 이벤트에 자동 포함 → GA4에서 소재별 코호트 분석 가능.

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const
// gclid: Google Ads 자동 태깅 파라미터 — sign_up 등 전환 이벤트에 포함 시 Google Ads ROI 측정 가능
// fbclid: Meta Ads 클릭 ID
const EXTENDED_CAPTURE_KEYS = [...UTM_KEYS, 'gclid', 'fbclid'] as const

export type UtmParams = Partial<Record<typeof EXTENDED_CAPTURE_KEYS[number], string>>

const UTM_STORAGE_KEY = 'unao_utm'

/**
 * URL의 utm_* / gclid / fbclid 파라미터를 sessionStorage에 저장.
 * 이미 저장된 UTM이 있으면 덮어쓰지 않음 (첫 랜딩 소재 보존).
 * PageViewTracker 최초 마운트 시 1회 호출.
 */
export function captureUtm(): void {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  const utm: UtmParams = {}
  for (const key of EXTENDED_CAPTURE_KEYS) {
    const val = params.get(key)
    if (val) utm[key] = val
  }
  // TWA 첫 실행: URL에 UTM 없고 세션 저장도 없으면 google-play 자동 태깅
  if (Object.keys(utm).length === 0 && !sessionStorage.getItem(UTM_STORAGE_KEY)) {
    const _ua = navigator.userAgent
    const isTWA = document.referrer.startsWith('android-app://') ||
      (matchMedia('(display-mode: standalone)').matches && /Android/i.test(_ua) && !_ua.includes('wv'))
    if (isTWA) {
      utm.utm_source = 'google-play'
      utm.utm_medium = 'organic'
    }
  }
  if (Object.keys(utm).length === 0) return
  // 이미 이 세션에서 UTM 저장된 경우 첫 소재 우선 (덮어쓰지 않음)
  if (!sessionStorage.getItem(UTM_STORAGE_KEY)) {
    sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(utm))
  }
}

/**
 * 저장된 UTM 파라미터 반환. 없으면 빈 객체.
 * sign_up, login 등 전환 이벤트에 스프레드해서 사용.
 */
export function getStoredUtm(): UtmParams {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(sessionStorage.getItem(UTM_STORAGE_KEY) ?? '{}') as UtmParams
  } catch {
    return {}
  }
}

// ── 브라우저 환경 식별 ──

/**
 * 현재 브라우저 환경을 문자열로 반환 — **분석/이벤트 기록용**(EventLog.browser_env).
 * UA 분기는 AddToHomeScreen의 detectEnv()와 겹치나 역할이 다르다(순환 의존 방지 위해 인라인 유지):
 *   - getBrowserEnv(여기): 분석용. twa-android 분기 + sticky(_twa_confirmed) 반영 → 채널 통계 정확도.
 *   - detectEnv(AddToHomeScreen): 설치유도용. TWA/standalone 미구분(상위 useAppEnvironment.isTWA 가드로 보호).
 * → 두 함수를 통합하지 않는다(역할·반환셋 다름). 공통 UA 분기만 우연히 닮음.
 */
export function getBrowserEnv(): string {
  if (typeof window === 'undefined') return 'server'
  const ua = navigator.userAgent
  if (window.innerWidth >= 1024) return 'desktop'
  if (/KAKAOTALK/i.test(ua)) return /android/i.test(ua) ? 'kakao-android' : 'kakao-ios'
  if (/NAVER\(inapp|NaverSearchApp/i.test(ua)) return 'naver-inapp'
  if (/Instagram|FBAN|FBAV/i.test(ua)) return 'instagram-inapp'
  if (/\bGSA\//i.test(ua)) return 'google-inapp'
  if (/CriOS/i.test(ua)) return 'crios'
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios-safari'
  // TWA: android-app:// referrer = Play Store 설치 앱에서 실행 중
  //   + sticky(_twa_confirmed): OAuth 복귀 등으로 referrer 소실돼도 TWA 유지 (C1 — useAppEnvironment.isTWA와 동일 신호 공유).
  //   sign_up/page_view가 android-chrome으로 오기록돼 baseline·재방문 집계에서 TWA 누락되던 것 방지.
  if (document.referrer.startsWith('android-app://')) return 'twa-android'
  try { if (localStorage.getItem('_twa_confirmed') === '1') return 'twa-android' } catch { /* localStorage 불가 환경 무시 */ }
  return 'android-chrome'
}

// ── 이벤트 헬퍼 ──

/** 페이지 뷰 (SPA 네비게이션 시) */
export function gtmPageView(path: string, title?: string): void {
  sendEvent('page_view', {
    page_path: path,
    page_title: title ?? (typeof document !== 'undefined' ? document.title : ''),
  })
}

/** 회원가입 완료 — UTM 포함 (광고 소재 → 가입 전환 추적) */
export function gtmSignUp(method: string = 'kakao'): void {
  sendEvent('sign_up', { method, ...getStoredUtm() })
}

/** 배너 조건 충족 (정독 85% 또는 60초 백스톱) — 노출 분석의 분모 */
export function gtmSignupBannerEligible(pagePath: string): void {
  sendEvent('signup_banner_eligible', { page_path: pagePath, browser_env: getBrowserEnv() })
}

/** 배너 실제 노출 (차단 조건 통과 후 화면에 표시된 경우만) */
export function gtmSignupBannerShown(pagePath: string, showCount: number): void {
  sendEvent('signup_banner_shown', { page_path: pagePath, show_count: showCount, browser_env: getBrowserEnv() })
}

/** 배너 CTA 클릭 */
export function gtmSignupBannerClicked(pagePath: string, ctaType: 'kakao_oauth' | 'external_browser' = 'kakao_oauth'): void {
  sendEvent('signup_banner_clicked', { page_path: pagePath, cta_type: ctaType, browser_env: getBrowserEnv() })
}

/** 배너 닫기 */
export function gtmSignupBannerDismissed(pagePath: string, showCount: number): void {
  sendEvent('signup_banner_dismissed', { page_path: pagePath, show_count: showCount, browser_env: getBrowserEnv() })
}

/** 최상단 띠 배너에서 카카오 공유(친구 초대) 클릭 — audience: member(회원)/guest(비회원) */
export function gtmReferralShare(audience: 'member' | 'guest'): void {
  sendEvent('referral_share', { audience, channel: 'kakao', browser_env: getBrowserEnv() })
}

/** 인앱 → 외부브라우저 리다이렉트 시도 (SignupPromptBanner CTA 클릭 시) */
export function gtmInappRedirectAttempted(browserEnv: string, method: 'intent' | 'clipboard'): void {
  sendEvent('inapp_redirect_attempted', { browser_env: browserEnv, redirect_method: method })
}

/** 외부브라우저 도착 확인 (?signup=1 파라미터 감지 시, Phase 2) */
export function gtmInappRedirectSuccess(fromEnv: string): void {
  sendEvent('inapp_redirect_success', { from_env: fromEnv, to_env: getBrowserEnv() })
}

/** 로그인 (재방문) — UTM 포함 */
export function gtmLogin(method: string = 'kakao'): void {
  sendEvent('login', { method, ...getStoredUtm() })
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

/** 광고 클릭 */
export function gtmAdClick(adSlot: string, adType: string): void {
  sendEvent('ad_click', {
    ad_slot: adSlot,
    ad_type: adType,
  })
}

/** Play스토어 앱 다운로드 클릭 (안드로이드 설치 유도) */
export function gtmPlayStoreClick(source: string): void {
  sendEvent('play_store_click', {
    source,
  })
}

/**
 * 외부 채널(SNS 등) 나가는 링크 클릭 추적.
 * SNS는 우리→외부라 utm을 붙여도 상대가 안 읽으므로, 클릭만 GA4로 수집(어느 채널·어디서).
 * @param network threads | instagram | facebook | naver_blog
 * @param location 클릭 위치 (footer 등)
 */
export function gtmOutboundClick(network: string, location: string): void {
  sendEvent('outbound_click', { network, location })
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

/** PWA 팝업 노출 */
export function gtmPwaPopupShown(trigger: string, platform: string): void {
  sendEvent('pwa_popup_shown', { trigger, platform })
}

/** PWA 설치 결과 (accepted/dismissed) */
export function gtmPwaInstall(trigger: string, platform: string, outcome: 'accepted' | 'dismissed'): void {
  sendEvent('pwa_install', { trigger, platform, outcome })
}

/** 홈 카드/더보기 클릭 추적 */
export function gtmHomeCardClick(
  section: 'trending' | 'community' | 'magazine' | 'jobs' | 'life2' | 'stories-hot' | 'humor-hot',
  position: number,
  contentId: string,
  action: 'card' | 'more' = 'card',
): void {
  sendEvent('home_card_click', { section, position, content_id: contentId, action })
}

/** PWA 하단 배너 액션 */
export function gtmPwaBannerAction(action: 'shown' | 'install' | 'dismissed'): void {
  sendEvent('pwa_banner', { action })
}

/** 사용자 속성 설정 (로그인 후) — async: gtag 레이스컨디션 방지 */
export async function gtmSetUserProperties(props: {
  user_id?: string
  user_type?: 'member' | 'guest'
  registration_method?: string
}): Promise<void> {
  if (typeof window === 'undefined') return
  await waitForGtagReady(2000)
  if (!window.gtag) return
  const { user_id, ...userProps } = props
  // user_id는 GA4 User Explorer 연동을 위해 user_properties와 별도 설정
  if (user_id) {
    window.gtag('set', { user_id })
  }
  window.gtag('set', 'user_properties', userProps)
}
