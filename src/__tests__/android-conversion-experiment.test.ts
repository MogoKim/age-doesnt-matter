import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  ANDROID_CONVERSION_CONTENT,
  ANDROID_CONVERSION_EVENTS,
  ANDROID_CONVERSION_EXPERIMENT_ID,
  ANDROID_CONVERSION_SURFACE,
  APP_CARD_PLAY_MEDIUM,
  isAndroidConversionSegment,
  isAndroidConversionVariant,
} from '@/lib/experiments/android-conversion'
import { buildPlayStoreUrl } from '@/lib/app-links'
import { getExperiment } from '@/lib/experiments/registry'

/**
 * Android 외부 브라우저 비회원 전환 실험(android_conversion_a2_b2).
 *
 * 이 판정이 **실험의 분모**다. 오판하면 주말 데이터가 통째로 무의미해지므로
 * 대표 UA와 앱 컨테이너 조합을 고정해 회귀를 막는다.
 * 특히 **Whale 브라우저는 포함**, **네이버 앱 인앱브라우저는 제외**다.
 */

const UA_ANDROID_WHALE =
  'Mozilla/5.0 (Linux; Android 13; SM-S908N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Whale/1.0.0.0 Crosswalk/24.116.0.0 Mobile Safari/537.36'
const UA_ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; SM-S921U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.7632.6 Mobile Safari/537.36'
const UA_SAMSUNG_INTERNET =
  'Mozilla/5.0 (Linux; Android 13; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36'
const UA_FIREFOX_ANDROID = 'Mozilla/5.0 (Android 13; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0'

const UA_NAVER_APP_ANDROID =
  'Mozilla/5.0 (Linux; Android 13; SM-S918N Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 NAVER(inapp; search; 1000; 12.4.5)'
const UA_KAKAO_ANDROID =
  'Mozilla/5.0 (Linux; Android 13; SM-S918N Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 KAKAOTALK 10.4.3'
const UA_INSTAGRAM_ANDROID =
  'Mozilla/5.0 (Linux; Android 13; SM-S918N Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 Instagram 300.0.0.29.110 Android'
const UA_FACEBOOK_ANDROID =
  'Mozilla/5.0 (Linux; Android 13; SM-S918N Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 [FBAN/FB4A;FBAV/440.0.0.29.116;]'
const UA_GOOGLE_APP_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 GSA/15.12.30.28.arm64'
const UA_IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const UA_IPAD_SAFARI =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const UA_DESKTOP_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const UA_DESKTOP_WHALE =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Whale/3.25.232.19 Safari/537.36'

const guest = { isLoggedIn: false, isTWA: false, isCapacitor: false, isStandalone: false }

describe('실험 대상 세그먼트 — 포함', () => {
  it.each([
    ['Android Whale Browser', UA_ANDROID_WHALE],
    ['Android Chrome', UA_ANDROID_CHROME],
    ['Samsung Internet', UA_SAMSUNG_INTERNET],
    ['Firefox for Android', UA_FIREFOX_ANDROID],
  ])('비회원 %s → 실험 적용', (_label, userAgent) => {
    expect(isAndroidConversionSegment({ ...guest, userAgent })).toBe(true)
  })
})

describe('실험 대상 세그먼트 — 제외', () => {
  it.each([
    ['Naver 앱 인앱브라우저', UA_NAVER_APP_ANDROID],
    ['Kakao 인앱브라우저', UA_KAKAO_ANDROID],
    ['Instagram 인앱브라우저', UA_INSTAGRAM_ANDROID],
    ['Facebook 인앱브라우저', UA_FACEBOOK_ANDROID],
    ['Google 앱 인앱브라우저', UA_GOOGLE_APP_ANDROID],
    ['iPhone Safari', UA_IPHONE_SAFARI],
    ['iPad Safari', UA_IPAD_SAFARI],
    ['Desktop Chrome', UA_DESKTOP_CHROME],
    ['Desktop Whale', UA_DESKTOP_WHALE],
  ])('비회원이어도 %s → 실험 제외', (_label, userAgent) => {
    expect(isAndroidConversionSegment({ ...guest, userAgent })).toBe(false)
  })

  it('회원은 Android 외부 브라우저여도 제외 (회원 앱 유도는 PostCTA 담당)', () => {
    for (const userAgent of [UA_ANDROID_WHALE, UA_ANDROID_CHROME, UA_SAMSUNG_INTERNET]) {
      expect(isAndroidConversionSegment({ ...guest, userAgent, isLoggedIn: true })).toBe(false)
    }
  })

  it('TWA · Capacitor · standalone PWA는 제외', () => {
    const ua = UA_ANDROID_CHROME
    expect(isAndroidConversionSegment({ ...guest, userAgent: ua, isTWA: true })).toBe(false)
    expect(isAndroidConversionSegment({ ...guest, userAgent: ua, isCapacitor: true })).toBe(false)
    expect(isAndroidConversionSegment({ ...guest, userAgent: ua, isStandalone: true })).toBe(false)
  })
})

describe('Whale ≠ 네이버 앱 인앱브라우저 (분모 오염 방지)', () => {
  it('Whale은 포함, 네이버 앱 인앱은 제외 — 같은 회차에서 동시에 확인', () => {
    expect(isAndroidConversionSegment({ ...guest, userAgent: UA_ANDROID_WHALE })).toBe(true)
    expect(isAndroidConversionSegment({ ...guest, userAgent: UA_NAVER_APP_ANDROID })).toBe(false)
  })

  it('인앱 신호가 있으면 Whale 토큰이 있어도 제외된다', () => {
    const naverInappWithWhale = `${UA_NAVER_APP_ANDROID} Whale/1.0.0.0`
    expect(isAndroidConversionSegment({ ...guest, userAgent: naverInappWithWhale })).toBe(false)
  })
})

describe('실험 정의 (registry)', () => {
  const exp = getExperiment(ANDROID_CONVERSION_EXPERIMENT_ID)

  it('등록되어 있다', () => {
    expect(exp).toBeDefined()
  })

  it('variant는 signup_warm / app_card 두 개이고 50:50이다', () => {
    const keys = exp!.variants.map((v) => v.key)
    expect(keys).toEqual(['signup_warm', 'app_card'])
    expect(exp!.variants.every((v) => v.weight === 50)).toBe(true)
  })

  it('노출 이벤트가 실험 계열 이벤트명과 일치한다', () => {
    expect(exp!.exposureEvent).toBe(ANDROID_CONVERSION_EVENTS.exposed)
    expect(exp!.variantProperty).toBe('variant')
  })

  it('variant 타입가드가 정확하다', () => {
    expect(isAndroidConversionVariant('signup_warm')).toBe(true)
    expect(isAndroidConversionVariant('app_card')).toBe(true)
    expect(isAndroidConversionVariant('')).toBe(false)
    expect(isAndroidConversionVariant('A')).toBe(false)
  })
})

describe('시안 문구 고정 (임의 변경 방지)', () => {
  it('signup_warm — A2 최종안 그대로', () => {
    const c = ANDROID_CONVERSION_CONTENT.signup_warm
    expect(c.emoji).toBe('🌿')
    expect(c.headline).toBe('같이 이야기해도 괜찮아요')
    expect(c.sub).toBe('우리 또래끼리 편하게 나눠요')
    expect(c.cta).toBe('💛 카카오로 1초 가입')
    expect(c.ctaType).toBe('signup')
  })

  it('app_card — B2 최종안 그대로', () => {
    const c = ANDROID_CONVERSION_CONTENT.app_card
    expect(c.headline).toBe('앱으로 보면 더 편해요')
    expect(c.sub).toBe('한 번 받아두면 다음엔 바로 들어올 수 있어요')
    expect(c.cta).toBe('앱으로 보기')
    expect(c.ctaType).toBe('app_install')
  })

  it('app_card 문구에 광고성 표현(설치·무료·지금·다운로드)이 없다', () => {
    const c = ANDROID_CONVERSION_CONTENT.app_card
    const all = [c.headline, c.sub, c.cta, c.appName, c.appNote].join(' ')
    for (const banned of ['설치', '무료', '지금', '다운로드']) {
      expect(all).not.toContain(banned)
    }
  })

  it('두 variant 어디에도 금지 호칭이 없다', () => {
    const all = JSON.stringify(ANDROID_CONVERSION_CONTENT)
    for (const banned of ['시니어', '어르신', '노인', '실버']) {
      expect(all).not.toContain(banned)
    }
  })
})

describe('app_card 클릭 → Play스토어 referrer', () => {
  const url = buildPlayStoreUrl(ANDROID_CONVERSION_SURFACE, { medium: APP_CARD_PLAY_MEDIUM })
  const referrer = new URLSearchParams(new URL(url).searchParams.get('referrer') as string)

  it('패키지 id가 유지된다', () => {
    expect(new URL(url).searchParams.get('id')).toBe('com.agenotmatter.app')
  })

  it('referrer에 실험+variant 식별자가 남는다 (utm_medium)', () => {
    expect(referrer.get('utm_medium')).toBe('android_conversion_app_card')
  })

  it('referrer에 노출면(source)이 남는다 (utm_content)', () => {
    expect(referrer.get('utm_content')).toBe('signup_prompt_banner')
  })

  it('PR #303의 medium 분리 정책을 되돌리지 않는다 — footer 고정이 아니다', () => {
    expect(referrer.get('utm_medium')).not.toBe('footer')
    expect(referrer.get('utm_campaign')).toBe('app_install')
    expect(referrer.get('utm_source')).toBe('website')
  })

  it('진입점별 referrer가 서로 구분된다', () => {
    const postCta = buildPlayStoreUrl('post_cta')
    expect(postCta).not.toBe(url)
  })
})

describe('이벤트 계약', () => {
  it('신규 이벤트 3종이 지정된 이름 그대로다', () => {
    expect(ANDROID_CONVERSION_EVENTS.exposed).toBe('android_conversion_prompt_exposed')
    expect(ANDROID_CONVERSION_EVENTS.clicked).toBe('android_conversion_prompt_clicked')
    expect(ANDROID_CONVERSION_EVENTS.dismissed).toBe('android_conversion_prompt_dismissed')
  })

  it('surface 값이 고정돼 있다', () => {
    expect(ANDROID_CONVERSION_SURFACE).toBe('signup_prompt_banner')
  })

  // 실패 모드가 조용하다: rate-limit(event:ip, max 30)에 걸리면 200을 받고도 EventLog에 안 남아
  // 분모만 깎인다. 이름을 바꾸거나 면제 목록에서 빠지면 여기서 잡는다.
  it('세 이벤트가 /api/events rate-limit 면제 목록에 있다', () => {
    const route = readFileSync(
      resolve(__dirname, '../app/api/events/route.ts'),
      'utf-8',
    )
    const line = route.split('\n').find((l) => l.includes('const CONVERSION_EVENTS')) ?? ''
    for (const name of Object.values(ANDROID_CONVERSION_EVENTS)) {
      expect(line).toContain(`'${name}'`)
    }
    // 기존 배너 계열도 함께 유지되는지 (병행 계측이 깨지지 않게)
    for (const legacy of ['signup_banner_eligible', 'signup_banner_shown', 'signup_banner_clicked', 'signup_banner_dismissed']) {
      expect(line).toContain(`'${legacy}'`)
    }
  })
})
