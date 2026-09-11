import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * R8 후속 계측 v2 — **계측 계약** 회귀 테스트.
 *
 * 이 파일이 지키는 것은 "이벤트가 나간다"가 아니라 **무엇을 봤고 무엇을 눌렀는지 같은 기준으로 이어진다**이다.
 * 배너 노출 135명 · 클릭 0건이었을 때 판정이 불가능했던 이유는 노출 이벤트에 CTA 종류가 없어서였다.
 *
 * 1. CTA 판정은 **하나의 순수 함수**다 — 노출과 클릭이 서로 다른 규칙을 쓰면 분모·분자가 어긋난다
 * 2. 노출·클릭에 `cta_type` + `measurement_version` 이 **같이** 실린다
 * 3. 사이트 전체 카카오 클릭은 배너 클릭과 **다른 지표**다 — 귀속하지 않는다
 * 4. `kakao_button_click.from` 은 allowlist 로만 정규화된다
 * 5. 전환 이벤트만 rate limit 면제를 받는다
 */

const SRC = path.resolve(__dirname, '..')
const read = (rel: string) => readFileSync(path.join(SRC, rel), 'utf8')

// ──────────────────────────────────────────────
// 1. CTA resolver — 4개 환경
// ──────────────────────────────────────────────
describe('resolveSignupBannerCta — 배너에 실제로 표시된 CTA 종류', () => {
  it('app_card variant 는 앱 설치 CTA 다', async () => {
    const { resolveSignupBannerCta } = await import('@/lib/telemetry/signup-banner-cta')
    expect(resolveSignupBannerCta({ variant: 'app_card', isIOS: false, env: 'android-chrome' })).toBe('app_install')
  })

  it('iOS 는 인앱이든 아니든 카카오 OAuth 직행이다', async () => {
    const { resolveSignupBannerCta } = await import('@/lib/telemetry/signup-banner-cta')
    expect(resolveSignupBannerCta({ variant: '', isIOS: true, env: 'ios-safari' })).toBe('kakao_oauth')
    // 🔴 kakao-ios 는 인앱이지만 iOS 정책상 외부 브라우저 유도를 쓰지 않는다(가입 관문이 끊긴다)
    expect(resolveSignupBannerCta({ variant: '', isIOS: true, env: 'kakao-ios' })).toBe('kakao_oauth')
    expect(resolveSignupBannerCta({ variant: '', isIOS: true, env: 'google-inapp' })).toBe('kakao_oauth')
  })

  it('non-iOS 인앱 브라우저는 외부 브라우저 유도 CTA 다', async () => {
    const { resolveSignupBannerCta } = await import('@/lib/telemetry/signup-banner-cta')
    for (const env of ['kakao-android', 'naver-inapp', 'google-inapp']) {
      expect(resolveSignupBannerCta({ variant: '', isIOS: false, env })).toBe('external_browser')
    }
  })

  it('그 외(외부 브라우저·데스크탑)는 카카오 OAuth 다', async () => {
    const { resolveSignupBannerCta } = await import('@/lib/telemetry/signup-banner-cta')
    for (const env of ['android-chrome', 'desktop', 'crios', 'twa-android']) {
      expect(resolveSignupBannerCta({ variant: '', isIOS: false, env })).toBe('kakao_oauth')
    }
    // signup_warm variant 는 문구만 다르다 — CTA 종류는 기존과 같다
    expect(resolveSignupBannerCta({ variant: 'signup_warm', isIOS: false, env: 'android-chrome' })).toBe('kakao_oauth')
  })

  it('기존 배너 분기(app_card → iOS → 인앱 → 그 외)와 전 조합에서 일치한다 — UX 무변경 증명', async () => {
    const { resolveSignupBannerCta } = await import('@/lib/telemetry/signup-banner-cta')
    // 배포 전 SignupPromptBanner 가 실제로 쓰던 분기를 그대로 옮겨 적은 것
    const legacy = (variant: string, isIOS: boolean, env: string) => {
      if (variant === 'app_card') return 'app_install'
      if (isIOS) return 'kakao_oauth'
      if (['kakao-android', 'kakao-ios', 'naver-inapp', 'google-inapp'].includes(env)) return 'external_browser'
      return 'kakao_oauth'
    }
    const envs = ['android-chrome', 'desktop', 'crios', 'ios-safari', 'kakao-android', 'kakao-ios', 'naver-inapp', 'google-inapp', 'instagram-inapp', 'twa-android']
    const variants = ['', 'signup_warm', 'app_card'] as const
    for (const v of variants) {
      for (const env of envs) {
        for (const isIOS of [true, false]) {
          expect(resolveSignupBannerCta({ variant: v, isIOS, env })).toBe(legacy(v, isIOS, env))
        }
      }
    }
  })
})

// ──────────────────────────────────────────────
// 2. 노출·클릭 payload 가 같은 계약을 쓴다
// ──────────────────────────────────────────────
describe('배너 노출·클릭 payload 계약', () => {
  it('buildSignupBannerTelemetry 는 cta_type 과 measurement_version 을 항상 싣는다', async () => {
    const m = await import('@/lib/telemetry/signup-banner-cta')
    const props = m.buildSignupBannerTelemetry({
      ctaType: 'kakao_oauth', env: 'android-chrome', browserEnv: 'android-chrome', variant: '',
    })
    expect(props.cta_type).toBe('kakao_oauth')
    expect(props.measurement_version).toBe(m.SIGNUP_BANNER_MEASUREMENT_VERSION)
    expect(m.SIGNUP_BANNER_MEASUREMENT_VERSION).toBe('r8-v2')
    expect(props.surface).toBe('signup_prompt_banner')
    expect(props.browser_env).toBe('android-chrome')
  })

  it('payload 에 UA 전체 문자열·개인정보·원문을 넣지 않는다', async () => {
    const m = await import('@/lib/telemetry/signup-banner-cta')
    const props = m.buildSignupBannerTelemetry({
      ctaType: 'external_browser', env: 'kakao-android', browserEnv: 'kakao-android', variant: 'signup_warm',
    })
    const keys = Object.keys(props)
    for (const banned of ['user_agent', 'ua', 'userAgent', 'nickname', 'email', 'name', 'text', 'content', 'title', 'ip']) {
      expect(keys).not.toContain(banned)
    }
    // 값에도 UA 조각이 섞이면 안 된다
    for (const v of Object.values(props)) {
      if (typeof v === 'string') expect(v).not.toMatch(/Mozilla|AppleWebKit|KAKAOTALK\//)
    }
  })

  it('SignupPromptBanner 의 shown·clicked 가 **같은 빌더**로 payload 를 만든다', () => {
    const src = read('components/common/SignupPromptBanner.tsx')
    // 노출
    expect(src).toMatch(/trackEvent\('signup_banner_shown',[\s\S]{0,200}?bannerTelemetryProps\(/)
    // 클릭 — 3개 CTA 경로 전부
    const clicked = src.match(/trackEvent\('signup_banner_clicked',[^\n]*\n?[^\n]*/g) ?? []
    expect(clicked.length).toBeGreaterThanOrEqual(3)
    for (const call of clicked) expect(call).toContain('bannerTelemetryProps(')
    // 하드코딩된 cta_type 리터럴이 남아 있으면 노출과 어긋날 수 있다
    expect(src).not.toMatch(/trackEvent\('signup_banner_clicked', \{ cta_type: '/)
  })

  it('노출 시점 CTA 판정은 **ref** 로 읽는다 — state 클로저는 마운트 첫 렌더 값에 고정된다', () => {
    const src = read('components/common/SignupPromptBanner.tsx')
    // tryFire 는 [pathname, isLoggedIn, status, isTWA, isCapacitor] effect 안에 있어
    // currentEnv/isIOS state 변경으로 재생성되지 않는다 → ref 가 아니면 항상 초기값을 읽는다.
    expect(src).toContain('envRef')
    expect(src).toContain('isIOSRef')
    expect(src).toMatch(/trackEvent\('signup_banner_shown',[\s\S]{0,220}?envRef\.current/)
    expect(src).toMatch(/trackEvent\('signup_banner_shown',[\s\S]{0,220}?isIOSRef\.current/)
  })
})

// ──────────────────────────────────────────────
// 3. 사이트 전체 카카오 클릭 ≠ 배너 클릭
// ──────────────────────────────────────────────
describe('kakao_button_click 과 배너 클릭의 분리', () => {
  it('배너는 kakao_button_click 을 보내지 않는다 — 보내면 배너 전환에 사이트 전체 클릭이 섞인다', () => {
    const src = read('components/common/SignupPromptBanner.tsx')
    expect(src).not.toContain('kakao_button_click')
  })

  it('kakao_button_click 호출부는 전부 공용 버전 payload 빌더를 거친다', () => {
    for (const rel of ['components/features/auth/KakaoSignupButton.tsx', 'components/features/login/LoginForm.tsx']) {
      const src = read(rel)
      expect(src).toContain('buildKakaoClickTelemetry')
      // 호출부가 payload 를 직접 조립하면 measurement_version·from 정규화가 갈라진다
      expect(src).not.toMatch(/trackEvent\('kakao_button_click', \{ from: /)
      expect(src).not.toMatch(/sendGtmEvent\('kakao_button_click', \{ from: /)
      expect(src).not.toContain("measurement_version:")
    }
  })

  it('소스 전체에서 kakao_button_click 을 내는 파일은 이 둘뿐이다', () => {
    // 새 호출부가 생기면 allowlist 를 갱신하도록 강제한다
    const emitters = ['components/features/auth/KakaoSignupButton.tsx', 'components/features/login/LoginForm.tsx']
    for (const rel of emitters) expect(read(rel)).toContain('kakao_button_click')
  })
})

// ──────────────────────────────────────────────
// 4. from allowlist
// ──────────────────────────────────────────────
describe('normalizeKakaoClickSource — typed allowlist', () => {
  it('allowlist 에 있는 값은 그대로 통과한다', async () => {
    const { normalizeKakaoClickSource, KAKAO_CLICK_SOURCES } = await import('@/lib/telemetry/kakao-click-source')
    for (const s of KAKAO_CLICK_SOURCES) expect(normalizeKakaoClickSource(s)).toBe(s)
  })

  it('모르는 값·빈 값은 unknown 으로 접힌다 — 임의 문자열이 지표 축을 늘리지 않는다', async () => {
    const { normalizeKakaoClickSource } = await import('@/lib/telemetry/kakao-click-source')
    expect(normalizeKakaoClickSource('made_up_surface')).toBe('unknown')
    expect(normalizeKakaoClickSource(undefined)).toBe('unknown')
    expect(normalizeKakaoClickSource('')).toBe('unknown')
    expect(normalizeKakaoClickSource(null)).toBe('unknown')
  })

  it('배너 관련 값은 allowlist 에 없다 — 배너 클릭은 signup_banner_clicked 로만 센다', async () => {
    const { KAKAO_CLICK_SOURCES } = await import('@/lib/telemetry/kakao-click-source')
    for (const s of KAKAO_CLICK_SOURCES) expect(s).not.toContain('signup_banner')
    expect(KAKAO_CLICK_SOURCES).not.toContain('signup_prompt_banner')
  })

  it('실제 호출부가 넘기는 gtmFrom 값이 전부 allowlist 안에 있다', async () => {
    const { KAKAO_CLICK_SOURCES } = await import('@/lib/telemetry/kakao-click-source')
    const files = [
      'app/(main)/about/page.tsx',
      'components/features/home/SignupCard.tsx',
      'components/features/landing/LandingClient.tsx',
      'components/features/auth/LoginPromptModal.tsx',
      'components/features/community/GuestCommentInput.tsx',
      'components/features/community/WriteLoginPrompt.tsx',
      'components/features/login/LoginForm.tsx',
    ]
    const found = new Set<string>()
    for (const rel of files) {
      for (const m of read(rel).matchAll(/gtmFrom=["']([a-z0-9_]+)["']/g)) found.add(m[1])
      for (const m of read(rel).matchAll(/from: '([a-z0-9_]+)'/g)) found.add(m[1])
    }
    expect(found.size).toBeGreaterThanOrEqual(9)
    for (const v of found) expect(KAKAO_CLICK_SOURCES).toContain(v)
  })
})

// ──────────────────────────────────────────────
// 5. rate limit 면제 — 전환 이벤트만
// ──────────────────────────────────────────────
describe('isRateLimitExemptEvent', () => {
  it('kakao_button_click 이 면제된다 — page_view 와 같은 버킷(event:ip, max 30)에서 429 로 유실돼 왔다', async () => {
    const { isRateLimitExemptEvent } = await import('@/lib/telemetry/event-rate-limit')
    expect(isRateLimitExemptEvent('kakao_button_click')).toBe(true)
  })

  it('일반 반복 이벤트의 rate limit 은 그대로 유지된다', async () => {
    const { isRateLimitExemptEvent } = await import('@/lib/telemetry/event-rate-limit')
    for (const e of ['page_view', 'scroll_depth', 'login', 'post_view', 'made_up_event']) {
      expect(isRateLimitExemptEvent(e)).toBe(false)
    }
  })

  it('기존 면제 목록은 하나도 빠지지 않는다 — 빠지면 기존 퍼널이 조용히 깨진다', async () => {
    const { isRateLimitExemptEvent } = await import('@/lib/telemetry/event-rate-limit')
    const existing = ['post_cta_clicked', 'sign_up', 'signup_step', 'identity_banner_view', 'related_post_click',
      'exp1_exposure', 'signup_banner_eligible', 'signup_banner_shown', 'signup_banner_clicked',
      'signup_banner_dismissed', 'related_recommend_view', 'top_promo_shown', 'top_promo_clicked',
      'top_promo_dismissed', 'android_conversion_prompt_exposed', 'android_conversion_prompt_clicked',
      'android_conversion_prompt_dismissed', 'inapp_redirect_attempted', 'inapp_redirect_opened',
      'inapp_redirect_failed', 'comment_input_view', 'comment_input_focus', 'comment_text_started',
      'comment_identity_started', 'comment_submit_attempted', 'comment_submit_failed',
      'comment_signup_prompt_shown', 'comment_create']
    for (const e of existing) expect(isRateLimitExemptEvent(e)).toBe(true)
  })

  it('api/events 라우트가 이 모듈을 쓴다 — 목록이 두 곳에 갈라지면 안 된다', () => {
    const src = read('app/api/events/route.ts')
    expect(src).toContain('isRateLimitExemptEvent')
    expect(src).not.toContain('const CONVERSION_EVENTS =')
  })

  it('면제 사유가 문서화돼 있고, 단절 기준이 **이벤트 버전**이다', async () => {
    const m = await import('@/lib/telemetry/event-rate-limit')
    expect(m.KAKAO_CLICK_EXEMPTION).toBeTruthy()
    expect(m.KAKAO_CLICK_EXEMPTION.reason).toMatch(/429|rate limit|버킷/)
    expect(m.KAKAO_CLICK_EXEMPTION.separatedBy).toBe('measurement_version=r8-v2')
  })
})

// ──────────────────────────────────────────────
// 6. 배포 시각 상수 후속 작업이 없다 — 경계는 이벤트 버전이다
// ──────────────────────────────────────────────
describe('계측 경계는 달력 시각이 아니라 이벤트 버전이다', () => {
  it('배포 후 코드에 되기록해야 하는 상수가 없다', async () => {
    const banner = await import('@/lib/telemetry/signup-banner-cta')
    const rl = await import('@/lib/telemetry/event-rate-limit')
    // 🔴 이런 상수가 있으면 계측 배포 뒤 또 한 번의 PR·재배포가 필요해진다
    expect(banner).not.toHaveProperty('R8_V2_DEPLOYED_AT')
    expect(rl.KAKAO_CLICK_EXEMPTION).not.toHaveProperty('effectiveFrom')
    expect(read('lib/telemetry/signup-banner-cta.ts')).not.toContain('DEPLOYED_AT')
    expect(read('lib/telemetry/event-rate-limit.ts')).not.toContain('effectiveFrom')
    expect(read('lib/queries/admin/admin.member-recovery.ts')).not.toContain('recordedDeployedAt')
  })

  it('버전 상수는 한 곳에서만 정의된다 — 배너와 카카오 클릭이 같은 값을 쓴다', async () => {
    const { MEASUREMENT_VERSION } = await import('@/lib/telemetry/measurement-version')
    const { SIGNUP_BANNER_MEASUREMENT_VERSION } = await import('@/lib/telemetry/signup-banner-cta')
    const { buildKakaoClickTelemetry } = await import('@/lib/telemetry/kakao-click-source')
    expect(MEASUREMENT_VERSION).toBe('r8-v2')
    expect(SIGNUP_BANNER_MEASUREMENT_VERSION).toBe(MEASUREMENT_VERSION)
    expect(buildKakaoClickTelemetry({ from: 'login_page', browserEnv: 'desktop' }).measurement_version)
      .toBe(MEASUREMENT_VERSION)
  })
})

// ──────────────────────────────────────────────
// 7. buildKakaoClickTelemetry — 버전 + allowlist 를 한 번에
// ──────────────────────────────────────────────
describe('buildKakaoClickTelemetry', () => {
  it('from allowlist 정규화와 measurement_version 을 함께 싣는다', async () => {
    const { buildKakaoClickTelemetry } = await import('@/lib/telemetry/kakao-click-source')
    expect(buildKakaoClickTelemetry({ from: 'guest_comment_success', browserEnv: 'kakao-android' }))
      .toEqual({ from: 'guest_comment_success', measurement_version: 'r8-v2', browser_env: 'kakao-android' })
    // 목록 밖 값은 여전히 unknown 으로 접힌다(기존 allowlist 유지)
    expect(buildKakaoClickTelemetry({ from: 'made_up', browserEnv: 'desktop' }).from).toBe('unknown')
    expect(buildKakaoClickTelemetry({ from: undefined, browserEnv: 'desktop' }).from).toBe('unknown')
  })

  it('payload 에 UA 전체 문자열·개인정보를 넣지 않는다', async () => {
    const { buildKakaoClickTelemetry } = await import('@/lib/telemetry/kakao-click-source')
    const keys = Object.keys(buildKakaoClickTelemetry({ from: 'login_page', browserEnv: 'desktop' }))
    expect(keys.sort()).toEqual(['browser_env', 'from', 'measurement_version'])
  })

  it('배너 표면은 여전히 allowlist 에 없다 — 배너 클릭으로 귀속되지 않는다', async () => {
    const { KAKAO_CLICK_SOURCES } = await import('@/lib/telemetry/kakao-click-source')
    for (const s of KAKAO_CLICK_SOURCES) expect(s).not.toContain('banner')
  })
})
