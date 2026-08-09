import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  INAPP_REDIRECT_EVENTS,
  arrivalRedirectMethod,
  buildInappRedirectProps,
  inappChannelFromEnv,
  osFromUa,
  redirectTargetOf,
  uaClassFromUa,
} from '@/lib/inapp-redirect'

/**
 * 인앱 → 외부 브라우저 유도 계측 테스트.
 *
 * 이 퍼널은 지금까지 GTM에만 있었고 EventLog에는 0종이었다(2026-08-08 실측).
 * 세 이벤트(attempted / opened / failed)가 **같은 축으로 조인**되지 않으면
 * "몇 명이 시도했고 몇 명이 실제로 넘어갔는가"를 셀 수 없으므로 키를 고정한다.
 */

const UA = {
  naverAndroid:
    'Mozilla/5.0 (Linux; Android 13; SM-S918N Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.144 Mobile Safari/537.36 NAVER(inapp; search; 1000; 12.9.2)',
  naverIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21B74 NAVER(inapp; search; 2000; 12.9.2; 11)',
  kakaoAndroid:
    'Mozilla/5.0 (Linux; Android 13; SM-S918N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 KAKAOTALK 10.4.5',
  kakaoIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.4.5',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 13; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36',
  whale:
    'Mozilla/5.0 (Linux; Android 13; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Whale/3.24.223.18 Mobile Safari/537.36',
  samsung:
    'Mozilla/5.0 (Linux; Android 13; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
  iosSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
}

describe('이벤트명 — /api/events rate-limit 면제 목록과 반드시 일치해야 한다', () => {
  it('세 이벤트가 고정돼 있다', () => {
    expect(INAPP_REDIRECT_EVENTS.attempted).toBe('inapp_redirect_attempted')
    expect(INAPP_REDIRECT_EVENTS.opened).toBe('inapp_redirect_opened')
    expect(INAPP_REDIRECT_EVENTS.failed).toBe('inapp_redirect_failed')
  })

  it('이름이 바뀌면 rate-limit 면제가 깨져 429로 조용히 유실된다 — 회귀 고정', () => {
    expect(Object.values(INAPP_REDIRECT_EVENTS)).toEqual([
      'inapp_redirect_attempted',
      'inapp_redirect_opened',
      'inapp_redirect_failed',
    ])
  })

  // 실패 모드가 조용하다: rate-limit(event:ip, max 30)에 걸리면 200을 받고도 EventLog에 안 남는다.
  // attempted만 유실되고 opened만 남으면 퍼널이 거꾸로 보인다 → 여기서 잡는다.
  it('세 이벤트가 /api/events rate-limit 면제 목록에 실제로 등록돼 있다', () => {
    const route = readFileSync(resolve(__dirname, '../app/api/events/route.ts'), 'utf-8')
    const line = route.split('\n').find((l) => l.includes('const CONVERSION_EVENTS')) ?? ''
    expect(line).not.toBe('')
    for (const name of Object.values(INAPP_REDIRECT_EVENTS)) {
      expect(line).toContain(`'${name}'`)
    }
  })

  it('기존 면제 대상이 하나도 빠지지 않았다 — 병행 계측 보존', () => {
    const route = readFileSync(resolve(__dirname, '../app/api/events/route.ts'), 'utf-8')
    const line = route.split('\n').find((l) => l.includes('const CONVERSION_EVENTS')) ?? ''
    for (const legacy of [
      'signup_banner_eligible', 'signup_banner_shown', 'signup_banner_clicked', 'signup_banner_dismissed',
      'android_conversion_prompt_exposed', 'android_conversion_prompt_clicked', 'android_conversion_prompt_dismissed',
      'related_recommend_view', 'sign_up', 'signup_step',
    ]) {
      expect(line).toContain(`'${legacy}'`)
    }
  })
})

describe('기존 GTM 계측이 사라지지 않았다 (두 파이프 병행)', () => {
  const banner = readFileSync(
    resolve(__dirname, '../components/common/SignupPromptBanner.tsx'),
    'utf-8',
  )

  it('gtmInappRedirectAttempted 호출이 그대로 남아 있다', () => {
    expect(banner).toContain('gtmInappRedirectAttempted')
    // 세 분기(kakao-android / kakao-ios / naver·google) 각각에서 호출된다
    expect(banner.match(/gtmInappRedirectAttempted\(/g)?.length).toBe(3)
  })

  it('gtmInappRedirectSuccess 호출이 그대로 남아 있다', () => {
    expect(banner).toContain('gtmInappRedirectSuccess(signupUtmSource')
  })

  it('EventLog 계측이 GTM과 같은 지점에 추가됐다', () => {
    expect(banner).toContain('INAPP_REDIRECT_EVENTS.attempted')
    expect(banner).toContain('INAPP_REDIRECT_EVENTS.opened')
    expect(banner).toContain('INAPP_REDIRECT_EVENTS.failed')
  })

  // 보정 이력: opened의 method를 'intent'로 고정하면 kakao-ios(clipboard 경유)가 틀리게 기록된다.
  it('opened의 method를 상수로 고정하지 않는다 — 채널로 역추론해야 한다', () => {
    expect(banner).toContain('arrivalRedirectMethod(arrivedFrom)')
    // opened 호출 블록 안에 `method: 'intent'` 같은 하드코딩이 남아 있으면 실패
    const openedBlock = banner.slice(
      banner.indexOf('INAPP_REDIRECT_EVENTS.opened'),
      banner.indexOf('SESSION_AUTO_TRIGGERED'),
    )
    expect(openedBlock).not.toMatch(/method:\s*'(intent|clipboard|none)'/)
  })

  it('일반 외부 브라우저 경로(kakao_oauth)는 건드리지 않았다 — 회귀 0', () => {
    expect(banner).toContain("trackEvent('signup_banner_clicked', { cta_type: 'kakao_oauth', env: currentEnv })")
    expect(banner).toContain('startKakaoLogin(pathname)')
  })

  it('인앱 CTA 문구를 바꾸지 않았다', () => {
    expect(banner).toContain("'카카오 밖에서 가입하기'")
    expect(banner).toContain("'브라우저에서 가입하기'")
  })

  // 2026-08-09 갱신: PR-N2 시점에는 "고치지 않았다"를 고정했으나,
  // 후속 PR에서 no-op를 제거했다. 이제는 "고쳐진 상태"를 고정한다.
  // (상세 회귀 고정은 inapp-banner-dismiss.test.ts)
  it('iOS 네이버 인앱은 더 이상 no-op가 아니다 — 클립보드+안내로 전환', () => {
    const tail = banner.slice(banner.indexOf('naver-inapp, google-inapp'))
    expect(tail).toContain('handleIosInapp()')
    expect(tail).not.toContain('setVisible(false)')
  })
})

describe('osFromUa — Android/iOS를 갈라야 유도 수단 차이를 볼 수 있다', () => {
  it('Android 인앱', () => {
    expect(osFromUa(UA.naverAndroid)).toBe('android')
    expect(osFromUa(UA.kakaoAndroid)).toBe('android')
  })
  it('iOS 인앱', () => {
    expect(osFromUa(UA.naverIos)).toBe('ios')
    expect(osFromUa(UA.kakaoIos)).toBe('ios')
  })
  it('그 외', () => {
    expect(osFromUa('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('other')
    expect(osFromUa('')).toBe('other')
  })
})

describe('inappChannelFromEnv — OS를 뗀 순수 채널명', () => {
  it('detectEnv 값에서 채널을 뽑는다', () => {
    expect(inappChannelFromEnv('naver-inapp')).toBe('naver')
    expect(inappChannelFromEnv('kakao-android')).toBe('kakao')
    expect(inappChannelFromEnv('kakao-ios')).toBe('kakao')
    expect(inappChannelFromEnv('google-inapp')).toBe('google')
    expect(inappChannelFromEnv('instagram-inapp')).toBe('meta')
  })

  it('카카오는 OS가 붙고 네이버는 안 붙는 비대칭이 있어도 채널은 하나로 모인다', () => {
    expect(inappChannelFromEnv('kakao-android')).toBe(inappChannelFromEnv('kakao-ios'))
  })

  it('env를 모르면 UA로 보완한다', () => {
    expect(inappChannelFromEnv('unknown-env', UA.naverAndroid)).toBe('naver')
    expect(inappChannelFromEnv('unknown-env', UA.androidChrome)).toBe('unknown')
  })
})

describe('uaClassFromUa — 조사 스크립트/어드민과 같은 분류 기준 고정', () => {
  it('네이버 인앱은 OS까지 구분한다', () => {
    expect(uaClassFromUa(UA.naverAndroid)).toBe('naver-inapp-android')
    expect(uaClassFromUa(UA.naverIos)).toBe('naver-inapp-ios')
  })

  it('외부 브라우저 3종을 각각 구분한다 (실험 세그먼트와 대조용)', () => {
    expect(uaClassFromUa(UA.androidChrome)).toBe('android-chrome')
    expect(uaClassFromUa(UA.whale)).toBe('android-whale')
    expect(uaClassFromUa(UA.samsung)).toBe('android-samsung')
  })

  it('웨일 브라우저는 네이버 앱 인앱과 절대 같이 묶이지 않는다', () => {
    expect(uaClassFromUa(UA.whale)).not.toContain('naver-inapp')
    expect(inappChannelFromEnv('android-chrome', UA.whale)).toBe('unknown')
  })

  it('iOS Safari', () => {
    expect(uaClassFromUa(UA.iosSafari)).toBe('ios-safari')
  })
})

describe('buildInappRedirectProps — 세 이벤트가 같은 축으로 조인된다', () => {
  const base = {
    surface: 'signup_prompt_banner' as const,
    source: 'naver-inapp',
    browserEnv: 'naver-inapp',
    userAgent: UA.naverAndroid,
    path: '/community/stories/abc',
    target: '/community/stories/abc?signup=1&utm_source=naver-inapp&utm_medium=signup_banner',
    ctaType: 'external_browser',
  }

  it('필수 키를 전부 담는다', () => {
    const p = buildInappRedirectProps({ ...base, method: 'intent' })
    expect(p).toMatchObject({
      surface: 'signup_prompt_banner',
      source: 'naver-inapp',
      channel: 'naver',
      os: 'android',
      ua_class: 'naver-inapp-android',
      browser_env: 'naver-inapp',
      path: '/community/stories/abc',
      cta_type: 'external_browser',
      redirect_method: 'intent',
    })
    expect(p.target).toContain('signup=1')
  })

  it('anon_cid를 직접 넣지 않는다 — trackEvent 중앙 로직이 붙인다(F19)', () => {
    const p = buildInappRedirectProps({ ...base, method: 'intent' })
    expect(p.anon_cid).toBeUndefined()
  })

  it('utm은 있을 때만 싣는다', () => {
    const withUtm = buildInappRedirectProps({ ...base, method: 'intent', utmSource: 'naver-inapp', utmMedium: 'signup_banner' })
    expect(withUtm.utm_source).toBe('naver-inapp')
    expect(withUtm.utm_medium).toBe('signup_banner')
    const without = buildInappRedirectProps({ ...base, method: 'intent' })
    expect('utm_source' in without).toBe(false)
  })

  it('실패 사유는 failed일 때만 붙는다', () => {
    const ok = buildInappRedirectProps({ ...base, method: 'intent' })
    expect('fail_reason' in ok).toBe(false)
    const failed = buildInappRedirectProps({ ...base, method: 'none', reason: 'no_handler_for_os' })
    expect(failed.fail_reason).toBe('no_handler_for_os')
    expect(failed.redirect_method).toBe('none')
  })

  it('attempted와 opened가 같은 키 집합을 가진다 — 퍼널 조인 가능', () => {
    const attempted = buildInappRedirectProps({ ...base, method: 'intent', utmSource: 'naver-inapp' })
    const opened = buildInappRedirectProps({
      ...base,
      browserEnv: 'android-chrome', // 도착한 곳은 외부 브라우저
      userAgent: UA.androidChrome,
      method: 'intent',
      utmSource: 'naver-inapp',
    })
    expect(Object.keys(attempted).sort()).toEqual(Object.keys(opened).sort())
    // 조인 축: 떠나온 환경(source)이 같아야 이어붙일 수 있다
    expect(opened.source).toBe(attempted.source)
    // 도착 환경은 달라야 정상(인앱 → 외부 브라우저)
    expect(opened.browser_env).not.toBe(attempted.browser_env)
    expect(opened.ua_class).toBe('android-chrome')
  })

  it('iOS 네이버 인앱 막다른 길이 failed로 구분된다 (현행 동작은 그대로, 기록만)', () => {
    const p = buildInappRedirectProps({
      ...base,
      source: 'naver-inapp',
      userAgent: UA.naverIos,
      method: 'none',
      reason: 'no_handler_for_os',
    })
    expect(p.os).toBe('ios')
    expect(p.ua_class).toBe('naver-inapp-ios')
    expect(p.channel).toBe('naver')
    expect(p.redirect_method).toBe('none')
    expect(p.fail_reason).toBe('no_handler_for_os')
  })

  it('PWA 인앱 가이드 노출면도 같은 스키마를 쓴다', () => {
    const p = buildInappRedirectProps({
      ...base,
      surface: 'pwa_inapp_guide',
      method: 'clipboard',
      utmSource: 'naver_inapp',
      utmMedium: 'pwa_banner',
    })
    expect(p.surface).toBe('pwa_inapp_guide')
    expect(p.redirect_method).toBe('clipboard')
    // ⚠️ 기존 불일치: 이 경로의 utm_source는 언더스코어다. 이번 PR은 값을 고치지 않고 그대로 기록한다.
    expect(p.utm_source).toBe('naver_inapp')
  })
})

describe('arrivalRedirectMethod — 도착(opened)의 수단을 떠나온 채널로 역추론', () => {
  // 도착 페이지는 "어떤 수단으로 왔는지"를 직접 알 수 없다. utm_source로 되짚는 수밖에 없고,
  // 이 매핑이 attempted 분기와 어긋나면 attempted(clipboard) ↔ opened(intent)로 갈려 퍼널이 깨진다.
  it('kakao-ios는 clipboard — intent가 불가능한 환경이라 intent로 기록하면 틀린다', () => {
    expect(arrivalRedirectMethod('kakao-ios')).toBe('clipboard')
  })

  it('kakao-android는 intent', () => {
    expect(arrivalRedirectMethod('kakao-android')).toBe('intent')
  })

  it('naver-inapp / google-inapp은 intent — 실제로 도착하는 경로가 Android intent뿐이다', () => {
    // iOS 네이버·구글은 이동 수단이 없어 failed로 끝나므로 opened 자체가 발생하지 않는다
    expect(arrivalRedirectMethod('naver-inapp')).toBe('intent')
    expect(arrivalRedirectMethod('google-inapp')).toBe('intent')
  })

  it('미상은 기존 동작(intent)과 호환 — 값이 갑자기 바뀌면 과거 시계열과 끊긴다', () => {
    expect(arrivalRedirectMethod('unknown')).toBe('intent')
    expect(arrivalRedirectMethod('')).toBe('intent')
    expect(arrivalRedirectMethod('naver_inapp')).toBe('intent') // 언더스코어(PWA 가이드 경로)도 동일
  })

  it('attempted 분기와 1:1로 맞는다 — 채널별 대조', () => {
    // SignupPromptBanner.handleCTAClick가 실제로 쓰는 수단
    const attemptedMethod: Record<string, string> = {
      'kakao-android': 'intent',
      'kakao-ios': 'clipboard',
      'naver-inapp': 'intent', // Android 도착 케이스 기준
      'google-inapp': 'intent',
    }
    for (const [source, method] of Object.entries(attemptedMethod)) {
      expect(arrivalRedirectMethod(source)).toBe(method)
    }
  })
})

describe('opened payload — 채널별 redirect_method가 정확히 실린다', () => {
  const openedProps = (source: string, arrivingUa: string) =>
    buildInappRedirectProps({
      surface: 'signup_prompt_banner',
      source,
      browserEnv: source === 'kakao-ios' ? 'ios-safari' : 'android-chrome',
      userAgent: arrivingUa,
      path: '/community/stories',
      target: '/community/stories?signup=1',
      method: arrivalRedirectMethod(source),
      ctaType: 'external_browser',
      utmSource: source,
      utmMedium: 'signup_banner',
    })

  it('kakao-ios에서 Safari로 도착하면 clipboard로 기록된다', () => {
    const p = openedProps('kakao-ios', UA.iosSafari)
    expect(p.redirect_method).toBe('clipboard')
    expect(p.channel).toBe('kakao')
    expect(p.browser_env).toBe('ios-safari')
    expect(p.ua_class).toBe('ios-safari')
  })

  it('naver-inapp에서 Chrome으로 도착하면 intent로 기록된다', () => {
    const p = openedProps('naver-inapp', UA.androidChrome)
    expect(p.redirect_method).toBe('intent')
    expect(p.channel).toBe('naver')
    expect(p.ua_class).toBe('android-chrome')
  })

  it('kakao-android에서 Chrome으로 도착하면 intent로 기록된다', () => {
    const p = openedProps('kakao-android', UA.androidChrome)
    expect(p.redirect_method).toBe('intent')
    expect(p.channel).toBe('kakao')
  })

  it('attempted와 opened의 method가 같은 채널에서 일치한다 — 퍼널 조인 검증', () => {
    // kakao-ios: attempted(clipboard) ↔ opened(clipboard)
    const attempted = buildInappRedirectProps({
      surface: 'signup_prompt_banner', source: 'kakao-ios', browserEnv: 'kakao-ios',
      userAgent: UA.kakaoIos, path: '/community/stories', target: '/community/stories?signup=1',
      method: 'clipboard', ctaType: 'external_browser', utmSource: 'kakao-ios',
    })
    const opened = openedProps('kakao-ios', UA.iosSafari)
    expect(opened.redirect_method).toBe(attempted.redirect_method)
    expect(opened.source).toBe(attempted.source)
    expect(opened.channel).toBe(attempted.channel)
  })

  it('보정 후에도 attempted와 opened가 같은 키 집합을 유지한다', () => {
    const attempted = buildInappRedirectProps({
      surface: 'signup_prompt_banner', source: 'kakao-ios', browserEnv: 'kakao-ios',
      userAgent: UA.kakaoIos, path: '/p', target: '/p?signup=1',
      method: 'clipboard', ctaType: 'external_browser', utmSource: 'kakao-ios', utmMedium: 'signup_banner',
    })
    const opened = openedProps('kakao-ios', UA.iosSafari)
    expect(Object.keys(attempted).sort()).toEqual(Object.keys(opened).sort())
  })
})

describe('redirectTargetOf — 호스트·해시를 빼고 경로+쿼리만 기록', () => {
  it('pathname과 search만 남긴다', () => {
    const u = new URL('https://age-doesnt-matter.com/community/stories/abc?signup=1&utm_source=naver-inapp#top')
    expect(redirectTargetOf(u)).toBe('/community/stories/abc?signup=1&utm_source=naver-inapp')
  })

  it('쿼리가 없으면 경로만', () => {
    expect(redirectTargetOf(new URL('https://age-doesnt-matter.com/'))).toBe('/')
  })
})
