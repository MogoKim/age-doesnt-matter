/**
 * 설치 안내(PWA) **정책 계층** — 언제 보여줄지, 무엇을 기억할지.
 *
 * ── 왜 화면에서 떼어냈나 ────────────────────────────────────
 *  `AddToHomeScreen.tsx` 는 768줄이었고, 그 안에서 세 가지가 섞여 있었다 —
 *  브라우저 환경 판별, 저장소에 남기는 노출/거절 이력, 그리고 화면.
 *  정책이 화면 안에 있으면 **"왜 또 떴지"를 확인하려면 컴포넌트를 렌더해야 한다.**
 *  여기 있는 것은 순수 함수와 저장소 접근뿐이라 혼자 검증된다.
 *
 * 🔴 브라우저 전용이다 — `window` 가 없으면 각 함수가 안전한 기본값을 돌려준다.
 *    서버 렌더 중에 불려도 터지지 않아야 한다.
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type Trigger = 'first_15s' | 'signup' | 'engagement' | 'weekly'

export type Env =
  | 'android-chrome'   // beforeinstallprompt 가능
  | 'ios-safari'       // 수동 3단계 안내
  | 'kakao-android'    // 카카오 Android 인앱 → Chrome 유도 배너
  | 'kakao-ios'        // 카카오 iOS 인앱 → Safari 유도 배너
  | 'naver-inapp'      // 설치 불가 → 팝업/버튼 숨김
  | 'google-inapp'     // Google 앱(GSA/) 인앱 → 설치 불가, 외부브라우저 유도
  | 'crios'            // iOS Chrome — 설치 불가
  | 'instagram-inapp'  // 설치 불가
  | 'desktop'          // 모바일 전용
  | 'other'            // Samsung Internet 등 (beforeinstallprompt 대기)

export const BLOCKED_ENVS: Env[] = ['kakao-android', 'kakao-ios', 'naver-inapp', 'google-inapp', 'instagram-inapp', 'crios', 'desktop']
export const ANDROID_ENVS: Env[] = ['android-chrome', 'other']  // Chrome + Samsung Internet

// 설치유도 전용 환경 분류. TWA/standalone·sticky는 의도적으로 미구분(상위 useAppEnvironment.isTWA·getInstalled 가드로 보호).
//   분석/이벤트 기록용 채널값은 gtm.ts getBrowserEnv() 사용(twa-android + _twa_confirmed sticky 포함). 두 함수는 역할이 달라 통합하지 않음.
export function detectEnv(): Env {
  if (typeof window === 'undefined') return 'other'
  const ua = navigator.userAgent
  if (window.innerWidth >= 1024) return 'desktop'
  if (/KAKAOTALK/i.test(ua)) return /android/i.test(ua) ? 'kakao-android' : 'kakao-ios'
  if (/NAVER\(inapp|NaverSearchApp/i.test(ua)) return 'naver-inapp'
  if (/Instagram|FBAN|FBAV/i.test(ua)) return 'instagram-inapp'
  if (/\bGSA\//i.test(ua)) return 'google-inapp'  // Google Search App 인앱브라우저
  if (/CriOS/i.test(ua)) return 'crios'
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios-safari'
  return 'android-chrome'
}

export const KEY_SHOWN         = 'pwa_shown_triggers'       // JSON Trigger[]
export const KEY_COUNT         = 'pwa_declined_count'        // number (최대 3회 — weekly 이후 정지)
export const KEY_INSTALLED     = 'pwa_installed'             // '1'
export const KEY_LAST_PROMPTED = 'pwa_last_prompted_at'      // ISO timestamp
export const KEY_SESSION_COUNT = 'pwa_session_count'         // number (세션 횟수)
export const KEY_SHOWN_COUNT   = 'pwa_shown_count'           // number (총 노출 횟수)

export const KEY_KAKAO_GUIDE_AT       = 'pwa_kakao_guide_at'       // 3일 쿨다운 timestamp
export const KEY_NAVER_GUIDE_AT       = 'pwa_naver_guide_at'       // 3일 쿨다운 timestamp
export const KEY_INSTAGRAM_GUIDE_AT   = 'pwa_instagram_guide_at'   // 3일 쿨다운 timestamp
export const KAKAO_GUIDE_COOLDOWN_MS  = 3 * 24 * 60 * 60 * 1000

// Phase 3: 가입 완료 후 페이지 탐색 카운터
export const KEY_PAGE_VIEWS_AFTER_SIGNUP  = 'pwa_page_views_after_signup'
export const PAGE_VIEW_TRIGGER_THRESHOLD  = 3

// sessionStorage (탭 닫으면 리셋)
export const SESSION_VISITED       = 'pwa_visited_this_session'        // 세션 카운트 중복 방지
export const SESSION_SHOWN         = 'pwa_shown_this_session'          // 세션 내 팝업 1회 노출 제한
export const SESSION_BANNER_SHOWN  = 'pwa_banner_shown_this_session'   // 세션 내 배너 1회 노출 제한

// 타이머 미동작 페이지 (가입 플로우 방해 방지)
export const EXCLUDED_PATHS = ['/login', '/signup', '/onboarding']

export const WEEKLY_MS    = 7 * 24 * 60 * 60 * 1000
export const MAX_DECLINES = 3
export const TIMER_MS     = 13_000

export interface PwaStatus {
  installed: boolean
  popupShownCount: number
  bannerDismissCount: number
  bannerLastDismissAt: string | null
  bannerHiddenUntil: string | null
}

export function getInstalled(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    localStorage.getItem(KEY_INSTALLED) === '1'
  )
}

export function getShown(): Trigger[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(KEY_SHOWN) ?? '[]') } catch { return [] }
}

export function getShownCount(): number {
  if (typeof window === 'undefined') return 0
  return parseInt(localStorage.getItem(KEY_SHOWN_COUNT) ?? '0')
}

export function getDeclineCount(): number {
  if (typeof window === 'undefined') return 0
  return parseInt(localStorage.getItem(KEY_COUNT) ?? '0')
}

export function markShown(t: Trigger) {
  if (typeof window === 'undefined') return
  const s = getShown()
  if (!s.includes(t)) {
    localStorage.setItem(KEY_SHOWN, JSON.stringify([...s, t]))
    localStorage.setItem(KEY_SHOWN_COUNT, String(getShownCount() + 1))
  }
}

export function incrementSessionCount(): number {
  if (typeof window === 'undefined') return 0
  if (sessionStorage.getItem(SESSION_VISITED)) {
    return parseInt(localStorage.getItem(KEY_SESSION_COUNT) ?? '0')
  }
  sessionStorage.setItem(SESSION_VISITED, '1')
  const count = parseInt(localStorage.getItem(KEY_SESSION_COUNT) ?? '0') + 1
  localStorage.setItem(KEY_SESSION_COUNT, String(count))
  return count
}

export function canShow(t: Trigger, dbShownCount?: number): boolean {
  if (typeof window === 'undefined') return false
  if (getInstalled()) return false
  if (sessionStorage.getItem(SESSION_SHOWN)) return false  // 세션 내 1회 제한
  if (sessionStorage.getItem('signup_prompt_shown_this_session')) return false  // 가입 유도 배너 노출 시 충돌 방지

  const shown = getShown()
  // 로그인 유저: DB 카운트와 localStorage 중 큰 값 사용 (localStorage 삭제 우회 방지)
  const shownCount = Math.max(getShownCount(), dbShownCount ?? 0)

  // 1번: 최초 방문, 아직 한 번도 안 뜬 경우에만
  if (t === 'first_15s')
    return shownCount === 0 && !shown.includes('first_15s')

  // 2번: 회원가입 완료 직후 — 1번 실패(미설치) 시 발동 가능. 1번 성공 시 getInstalled()=true → 자동 차단
  if (t === 'signup')
    return shownCount < 2 && !shown.includes('signup')

  // 3번: 첫 글/댓글 완료 — 1·2번 모두 실패(미설치) 상태여야 조건 충족 가능
  if (t === 'engagement')
    return shownCount < 3 && !shown.includes('engagement')

  // 4번: 1·2·3번 모두 실패 후 7일 경과 시 반복 (설치됐으면 getInstalled()로 차단)
  if (t === 'weekly') {
    if (getDeclineCount() >= MAX_DECLINES) return false
    if (shownCount < 2) return false
    const last = localStorage.getItem(KEY_LAST_PROMPTED)
    if (!last) return true
    return Date.now() - new Date(last).getTime() >= WEEKLY_MS
  }
  return false
}

// 팝업 노출 시 DB에 기록 (fire-and-forget)
export function postPopupShown() {
  fetch('/api/user/pwa-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'popup_shown' }),
  }).catch(() => {})
}
