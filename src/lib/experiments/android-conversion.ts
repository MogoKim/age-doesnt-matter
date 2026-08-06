import { isAndroidExternalBrowserEnv } from '@/lib/browser-env'

/**
 * Android 외부 브라우저 비회원 전환 실험 — 세그먼트 판정 + 시안 상수 (순수 모듈).
 *
 * ## 이 실험이 답하려는 것
 * 글을 읽고 "나만 이런 게 아니구나"를 느낀 **Android 외부 브라우저 비회원**에게,
 * 첫 전환 제안으로 **가입**이 나은지 **앱**이 나은지.
 *
 * ⚠️ 순수한 "가입 버튼 vs 앱 버튼" 비교가 아니다. `signup_warm`과 `app_card`는
 *    **문구와 레이아웃이 함께** 다르다. 따라서 승패는 "축(가입/앱)"의 승패로 읽되,
 *    "버튼 하나만 바꿨을 때의 효과"로 일반화하면 안 된다. (F16 문서에도 명시)
 *
 * ## 승패 기준
 * 설치 수·클릭 수가 아니다. **1순위 = D7 재방문 + 글/댓글/공감 1회 이상 고유 사용자**
 * (North Star: 주간 재방문 참여 유저 수). 2026-08-11 아침 판단은 **조기 판정**이며
 * 최종 D7 판정은 별도다.
 */

export const ANDROID_CONVERSION_EXPERIMENT_ID = 'android_conversion_a2_b2'

export type AndroidConversionVariant = 'signup_warm' | 'app_card'

/** 이 실험이 발화하는 EventLog 이벤트 (기존 signup_banner_* 와 **병행**) */
export const ANDROID_CONVERSION_EVENTS = {
  exposed: 'android_conversion_prompt_exposed',
  clicked: 'android_conversion_prompt_clicked',
  dismissed: 'android_conversion_prompt_dismissed',
} as const

/** 이 실험이 붙는 노출면 — properties.surface */
export const ANDROID_CONVERSION_SURFACE = 'signup_prompt_banner'

/** app_card 클릭 시 Play스토어 referrer의 utm_medium — 실험+variant 식별자 */
export const APP_CARD_PLAY_MEDIUM = 'android_conversion_app_card'

export interface AndroidConversionSegmentInput {
  userAgent: string
  /** 로그인 회원은 제외 — 회원 앱 유도는 글 상세 PostCTA가 이미 담당한다 */
  isLoggedIn: boolean
  isTWA: boolean
  isCapacitor: boolean
  isStandalone: boolean
}

/**
 * 실험 대상 세그먼트인가 — **비회원 + Android 외부 브라우저**.
 *
 * 포함: Chrome · **Whale(네이버 웨일 브라우저)** · Samsung Internet · Firefox 등 안드로이드 일반 브라우저
 * 제외: 회원 / 카카오·**네이버 앱**·Instagram/Facebook·Google 앱 인앱브라우저 /
 *       안드로이드 WebView / iPhone·iPad / desktop / TWA · Capacitor · standalone PWA
 *
 * ⚠️ 웨일 브라우저(포함) ≠ 네이버 앱 인앱브라우저(제외). 판정 정본은 `@/lib/browser-env`.
 */
export function isAndroidConversionSegment(input: AndroidConversionSegmentInput): boolean {
  if (input.isLoggedIn) return false
  return isAndroidExternalBrowserEnv({
    userAgent: input.userAgent,
    isTWA: input.isTWA,
    isCapacitor: input.isCapacitor,
    isStandalone: input.isStandalone,
  })
}

/** variant별 시트 문구 — `scratchpad/final-a2-b2.html` 최종안. 임의 변경 금지. */
export const ANDROID_CONVERSION_CONTENT = {
  signup_warm: {
    emoji: '🌿',
    headline: '같이 이야기해도 괜찮아요',
    sub: '우리 또래끼리 편하게 나눠요',
    cta: '💛 카카오로 1초 가입',
    ctaType: 'signup',
  },
  app_card: {
    emoji: null,
    headline: '앱으로 보면 더 편해요',
    sub: '한 번 받아두면 다음엔 바로 들어올 수 있어요',
    cta: '앱으로 보기',
    ctaType: 'app_install',
    /** 앱 카드 — "설치"가 아니라 "다음에 바로 들어오기"를 말한다 */
    appName: '우리 나이가 어때서',
    appNote: '홈 화면에서 바로 열기 · 다시 찾기 쉬움',
  },
} as const

export function isAndroidConversionVariant(v: string): v is AndroidConversionVariant {
  return v === 'signup_warm' || v === 'app_card'
}
