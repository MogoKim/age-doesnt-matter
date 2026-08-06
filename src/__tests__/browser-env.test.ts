import { describe, it, expect } from 'vitest'
import {
  detectInAppBrowser,
  isAndroidExternalBrowser,
  isAndroidExternalBrowserEnv,
  isAndroidWebView,
  isIosUa,
  sanitizeUtmToken,
} from '@/lib/browser-env'

/**
 * "Android 외부 브라우저" 세그먼트 판정 테스트.
 *
 * 이 판정은 앞으로 가입-first vs 앱설치-first 실험의 **분모**가 된다.
 * 오판하면 실험 데이터 전체가 오염되므로 대표 UA를 고정해 회귀를 막는다.
 *
 * 특히 **네이버 웨일 브라우저(포함)** 와 **네이버 앱 인앱브라우저(제외)** 를 절대 섞지 않는다.
 */

// ── 포함되어야 하는 UA (Android 외부 브라우저) ──
const UA_ANDROID_WHALE =
  'Mozilla/5.0 (Linux; Android 13; SM-S908N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Whale/1.0.0.0 Crosswalk/24.116.0.0 Mobile Safari/537.36'
const UA_ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; SM-S921U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.7632.6 Mobile Safari/537.36'
const UA_SAMSUNG_INTERNET =
  'Mozilla/5.0 (Linux; Android 13; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36'
const UA_FIREFOX_ANDROID = 'Mozilla/5.0 (Android 13; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0'

// ── 제외되어야 하는 UA ──
const UA_KAKAO_ANDROID =
  'Mozilla/5.0 (Linux; Android 13; SM-S918N Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 KAKAOTALK 10.4.3'
const UA_KAKAO_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.4.3'
const UA_NAVER_APP_ANDROID =
  'Mozilla/5.0 (Linux; Android 13; SM-S918N Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 NAVER(inapp; search; 1000; 12.4.5)'
const UA_NAVER_APP_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 2000; 12.4.5; 15PRO)'
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
const UA_CAPACITOR_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; SM-S921N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36'
/** TWA는 UA가 일반 안드로이드 크롬과 동일하다 — UA로는 구분 불가(런타임 플래그로만 제외) */
const UA_TWA_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36'

describe('isAndroidExternalBrowser — 포함(PASS)', () => {
  it.each([
    ['Android Whale Browser', UA_ANDROID_WHALE],
    ['Android Chrome', UA_ANDROID_CHROME],
    ['Samsung Internet', UA_SAMSUNG_INTERNET],
    ['Firefox for Android', UA_FIREFOX_ANDROID],
  ])('%s → Android 외부 브라우저', (_label, ua) => {
    expect(isAndroidExternalBrowser(ua)).toBe(true)
  })

  it('Whale은 이름 하드코딩 없이 "Android + 비인앱" 조건으로 포함된다', () => {
    // 판정 로직이 'Whale' 문자열에 의존하지 않는지 — Whale 토큰을 지워도 여전히 PASS여야 한다
    const withoutWhaleToken = UA_ANDROID_WHALE.replace(/ Whale\/[\d.]+/, '')
    expect(isAndroidExternalBrowser(withoutWhaleToken)).toBe(true)
  })
})

describe('isAndroidExternalBrowser — 제외(FAIL)', () => {
  it.each([
    ['Kakao Android in-app', UA_KAKAO_ANDROID],
    ['Kakao iOS in-app', UA_KAKAO_IOS],
    ['Naver app in-app (Android)', UA_NAVER_APP_ANDROID],
    ['Naver app in-app (iOS)', UA_NAVER_APP_IOS],
    ['Instagram in-app', UA_INSTAGRAM_ANDROID],
    ['Facebook in-app', UA_FACEBOOK_ANDROID],
    ['Google app in-app (GSA)', UA_GOOGLE_APP_ANDROID],
    ['iPhone Safari', UA_IPHONE_SAFARI],
    ['iPad Safari', UA_IPAD_SAFARI],
    ['Desktop Chrome', UA_DESKTOP_CHROME],
    ['Desktop Whale', UA_DESKTOP_WHALE],
    ['Capacitor Android WebView', UA_CAPACITOR_ANDROID],
    ['빈 UA', ''],
  ])('%s → 제외', (_label, ua) => {
    expect(isAndroidExternalBrowser(ua)).toBe(false)
  })
})

describe('네이버 웨일 브라우저 ≠ 네이버 앱 인앱브라우저', () => {
  it('웨일은 in-app으로 분류되지 않는다', () => {
    expect(detectInAppBrowser(UA_ANDROID_WHALE)).toBeNull()
  })

  it('네이버 앱 인앱은 naver로 분류된다', () => {
    expect(detectInAppBrowser(UA_NAVER_APP_ANDROID)).toBe('naver')
    expect(detectInAppBrowser(UA_NAVER_APP_IOS)).toBe('naver')
  })

  it('둘을 가르는 신호는 NAVER(inapp 이지, "naver"라는 단어가 아니다', () => {
    // 웨일 UA에 naver.com 같은 문자열이 섞여도 인앱으로 오인하면 안 된다
    const whaleWithNaverWord = `${UA_ANDROID_WHALE} naver`
    expect(detectInAppBrowser(whaleWithNaverWord)).toBeNull()
    expect(isAndroidExternalBrowser(whaleWithNaverWord)).toBe(true)
  })

  it('인앱 신호가 있으면 Whale 토큰이 있어도 제외된다 (인앱 우선)', () => {
    const naverInappWithWhaleToken = `${UA_NAVER_APP_ANDROID} Whale/1.0.0.0`
    expect(detectInAppBrowser(naverInappWithWhaleToken)).toBe('naver')
    expect(isAndroidExternalBrowser(naverInappWithWhaleToken)).toBe(false)
  })
})

describe('isAndroidExternalBrowserEnv — 앱 컨테이너 제외', () => {
  const base = { isTWA: false, isCapacitor: false, isStandalone: false }

  it('TWA는 UA가 크롬과 같아도 제외된다', () => {
    expect(isAndroidExternalBrowser(UA_TWA_ANDROID)).toBe(true) // UA만으로는 구분 불가
    expect(isAndroidExternalBrowserEnv({ ...base, userAgent: UA_TWA_ANDROID, isTWA: true })).toBe(false)
  })

  it('Capacitor / standalone PWA도 제외된다', () => {
    expect(isAndroidExternalBrowserEnv({ ...base, userAgent: UA_ANDROID_CHROME, isCapacitor: true })).toBe(false)
    expect(isAndroidExternalBrowserEnv({ ...base, userAgent: UA_ANDROID_CHROME, isStandalone: true })).toBe(false)
  })

  it('앱 컨테이너가 아니면 Whale·Chrome·Samsung 모두 포함된다', () => {
    for (const ua of [UA_ANDROID_WHALE, UA_ANDROID_CHROME, UA_SAMSUNG_INTERNET]) {
      expect(isAndroidExternalBrowserEnv({ ...base, userAgent: ua })).toBe(true)
    }
  })
})

describe('보조 판정', () => {
  it('isAndroidWebView는 "; wv" 토큰만 잡는다', () => {
    expect(isAndroidWebView(UA_CAPACITOR_ANDROID)).toBe(true)
    expect(isAndroidWebView(UA_ANDROID_CHROME)).toBe(false)
    expect(isAndroidWebView(UA_ANDROID_WHALE)).toBe(false)
  })

  it('isIosUa는 iPhone/iPad/iPod을 잡는다', () => {
    expect(isIosUa(UA_IPHONE_SAFARI)).toBe(true)
    expect(isIosUa(UA_IPAD_SAFARI)).toBe(true)
    expect(isIosUa(UA_ANDROID_CHROME)).toBe(false)
  })

  it('데스크탑은 창 너비와 무관하게 제외된다 (UA에 Android가 없음)', () => {
    // 기존 detectEnv()는 innerWidth >= 1024로만 desktop을 걸러서, 창을 줄인 데스크탑이
    // android-chrome으로 새는 구멍이 있었다. UA 양성 판정으로 그 구멍을 막는다.
    expect(isAndroidExternalBrowser(UA_DESKTOP_CHROME)).toBe(false)
    expect(isAndroidExternalBrowser(UA_DESKTOP_WHALE)).toBe(false)
  })
})

describe('sanitizeUtmToken', () => {
  it('안전 문자만 남긴다', () => {
    expect(sanitizeUtmToken('post_cta')).toBe('post_cta')
    expect(sanitizeUtmToken('home_faq_android')).toBe('home_faq_android')
    expect(sanitizeUtmToken('Post CTA!')).toBe('post_cta')
    expect(sanitizeUtmToken('a&b=c')).toBe('a_b_c')
  })

  it('referrer를 깨뜨릴 수 있는 문자를 제거한다', () => {
    const dirty = sanitizeUtmToken('x&utm_medium=hack')
    expect(dirty).not.toContain('&')
    expect(dirty).not.toContain('=')
  })

  it('전부 제거되면 빈 문자열 (호출부가 기본값으로 대체)', () => {
    expect(sanitizeUtmToken('!!!')).toBe('')
  })
})
