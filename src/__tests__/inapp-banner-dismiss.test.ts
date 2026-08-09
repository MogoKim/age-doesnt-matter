import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { INAPP_REDIRECT_EVENTS, buildInappRedirectProps } from '@/lib/inapp-redirect'

/**
 * 인앱 배너 — 오버레이 탭 닫기 제거 + iOS no-op 제거.
 *
 * ## 왜 이 테스트가 필요한가
 * 인앱에서 배너 밖 탭이 곧 dismiss였다. 글을 계속 읽으려고 화면을 한 번 누른 것이
 * 그대로 "닫기"로 기록됐다(실측 2026-08-09: shown→dismissed 중앙값 2.4초, 3초 이내 63.2%,
 * 인앱 닫힘률 77.6% vs 데스크탑 35.2%). 클릭이 발생할 기회 자체가 사라지고 있었다.
 *
 * 되돌아가기 쉬운 변경이라 **소스 수준에서 고정**한다. 특히 아래 두 가지가 깨지면
 * 조용히 원상복구되고 아무도 모른다.
 *  1) 인앱에서 오버레이 onClick이 다시 붙는 것
 *  2) iOS 인앱 CTA가 다시 setVisible(false)로 끝나는 것(=no-op 복귀)
 */

const banner = readFileSync(
  resolve(__dirname, '../components/common/SignupPromptBanner.tsx'),
  'utf-8',
)

/** 일반 배너 렌더 블록(app_card variant·auto-trigger 블록을 제외한 마지막 return) */
const mainReturnBlock = banner.slice(banner.lastIndexOf('  return (\n    <>'))

describe('A. 오버레이 탭 닫기 — 인앱에서만 제거', () => {
  it('일반 배너 오버레이는 inapp일 때 onClick을 붙이지 않는다', () => {
    expect(mainReturnBlock).toContain('onClick={inapp ? undefined : handleDismiss}')
  })

  it('오버레이에 무조건 handleDismiss를 붙이는 코드가 남아 있지 않다', () => {
    // 일반 배너 블록에 `onClick={handleDismiss}`가 그대로 있으면 회귀
    const overlayIdx = mainReturnBlock.indexOf('fixed inset-0 z-[149]')
    const overlayChunk = mainReturnBlock.slice(overlayIdx, overlayIdx + 300)
    expect(overlayChunk).not.toMatch(/onClick=\{handleDismiss\}/)
  })

  it('✕ 닫기 버튼은 그대로 handleDismiss를 호출한다 (닫는 길은 유지)', () => {
    expect(mainReturnBlock).toContain('onClick={handleDismiss}')
    expect(mainReturnBlock).toContain('aria-label="닫기"')
    // 터치 타겟 44×44 유지
    expect(mainReturnBlock).toContain('w-11 h-11')
  })

  it('딤 오버레이 자체는 유지한다 — 시각 변경 없음', () => {
    expect(mainReturnBlock).toContain('fixed inset-0 z-[149] bg-black/50')
  })

  it('인앱에서는 body 스크롤을 잠그지 않는다 — 읽기를 계속할 수 있어야 한다', () => {
    // 배너가 뜨면 스크롤이 잠기고 오버레이 탭은 닫기였다 → "치우는 것 말고 선택지가 없음"
    const idx = banner.indexOf('Body scroll lock')
    const chunk = banner.slice(idx, idx + 700)
    expect(chunk).toContain('if (isInappEnv(currentEnv)) return')
    // 잠금 자체는 비인앱용으로 남아 있다
    expect(chunk).toContain("document.body.style.overflow = 'hidden'")
    // cleanup으로 되돌리는 것도 유지
    expect(chunk).toContain("document.body.style.overflow = ''")
  })

  it('터치 이벤트를 가로채는 코드를 넣지 않았다', () => {
    expect(banner).not.toContain('preventDefault()')
    expect(banner).not.toContain('touch-none')
    expect(banner).not.toContain('overscroll-none')
  })
})

describe('A. 실험 UI·비인앱은 건드리지 않았다 (회귀 0)', () => {
  it('app_card variant(Android 외부 브라우저 실험) 오버레이는 기존 그대로', () => {
    const appCardIdx = banner.indexOf("if (variant === 'app_card')")
    expect(appCardIdx).toBeGreaterThan(-1)
    const appCardBlock = banner.slice(appCardIdx, banner.indexOf('  return (\n    <>', appCardIdx))
    // 실험 배너는 여전히 오버레이 탭으로 닫힌다
    expect(appCardBlock).toContain('onClick={handleDismiss}')
    expect(appCardBlock).toContain('data-testid="android-conversion-app-card"')
    expect(appCardBlock).toContain('data-testid="android-conversion-app-cta"')
  })

  it('외부 브라우저 도착(auto-trigger) 배너도 기존 그대로', () => {
    expect(banner).toContain('onClick={handleAutoTriggerDismiss}')
  })

  it('실험 상수·세그먼트 판정을 건드리지 않았다', () => {
    expect(banner).toContain('ANDROID_CONVERSION_EXPERIMENT_ID')
    expect(banner).toContain('isAndroidConversionSegment')
    expect(banner).toContain('ANDROID_CONVERSION_EVENTS.exposed')
  })

  it('비인앱 CTA 경로(kakao_oauth)는 무변경', () => {
    expect(banner).toContain("trackEvent('signup_banner_clicked', { cta_type: 'kakao_oauth', env: currentEnv })")
    expect(banner).toContain('startKakaoLogin(pathname)')
  })
})

describe('N1. iOS 인앱 CTA no-op 제거', () => {
  it('iOS 인앱 공통 핸들러가 존재한다', () => {
    expect(banner).toContain('const handleIosInapp = ()')
  })

  it('kakao-ios와 naver/google-iOS가 같은 핸들러를 쓴다 — 정책 분기 방지', () => {
    expect(banner.match(/handleIosInapp\(\)/g)?.length).toBe(2)
  })

  it('iOS 경로가 배너를 닫지 않고 안내로 전환한다 (no-op 복귀 방지)', () => {
    const idx = banner.indexOf('const handleIosInapp')
    const chunk = banner.slice(idx, idx + 900)
    expect(chunk).toContain('setIosGuide(true)')
    expect(chunk).not.toContain('setVisible(false)')
  })

  it('안내 문구는 AddToHomeScreen이 쓰던 표현을 따른다 (신규 문구 창작 아님)', () => {
    expect(banner).toContain('주소가 복사됐어요')
    expect(banner).toContain('Safari 주소창에 붙여넣')
  })

  it('안내 상태에서도 ✕로 닫을 수 있다', () => {
    expect(mainReturnBlock).toContain('aria-label="닫기"')
  })

  it('기존 배너 문구·CTA 라벨은 그대로 남아 있다', () => {
    expect(banner).toContain("'카카오 밖에서 가입하기'")
    expect(banner).toContain("'브라우저에서 가입하기'")
    expect(banner).toContain('나만 이런 게 아니었네?')
    // 버튼 색·크기 무변경
    expect(mainReturnBlock).toContain('bg-[#FEE500]')
    expect(mainReturnBlock).toContain('min-h-[52px]')
  })
})

describe('PR-N2 계측 유지', () => {
  it('GTM 호출이 그대로 남아 있다', () => {
    expect(banner.match(/gtmInappRedirectAttempted\(/g)?.length).toBe(3)
    expect(banner).toContain('gtmInappRedirectSuccess(signupUtmSource')
  })

  it('EventLog 3종이 모두 쓰인다', () => {
    expect(banner).toContain('INAPP_REDIRECT_EVENTS.attempted')
    expect(banner).toContain('INAPP_REDIRECT_EVENTS.opened')
    expect(banner).toContain('INAPP_REDIRECT_EVENTS.failed')
  })

  it('iOS는 clipboard로 attempted를 남긴다 (method가 none으로 퇴행하지 않는다)', () => {
    const idx = banner.indexOf('const handleIosInapp')
    const chunk = banner.slice(idx, idx + 900)
    expect(chunk).toContain("redirectProps('clipboard')")
    expect(chunk).toContain('INAPP_REDIRECT_EVENTS.attempted')
  })

  it('failed는 클립보드를 못 썼을 때만 남긴다 — 안내가 떴으면 실패가 아니다', () => {
    const idx = banner.indexOf('const handleIosInapp')
    const chunk = banner.slice(idx, idx + 900)
    expect(chunk).toContain("'clipboard_unavailable'")
    expect(chunk).not.toContain("'no_handler_for_os'")
  })

  it('opened의 method 역추론(보정)이 유지된다', () => {
    expect(banner).toContain('arrivalRedirectMethod(arrivedFrom)')
  })

  it('properties 스키마는 그대로다', () => {
    const p = buildInappRedirectProps({
      surface: 'signup_prompt_banner', source: 'naver-inapp', browserEnv: 'naver-inapp',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) NAVER(inapp; search; 2000; 12.9.2; 11)',
      path: '/community/stories', target: '/community/stories?signup=1',
      method: 'clipboard', ctaType: 'external_browser', reason: 'clipboard_unavailable',
    })
    expect(p).toMatchObject({
      surface: 'signup_prompt_banner', source: 'naver-inapp', channel: 'naver',
      os: 'ios', ua_class: 'naver-inapp-ios', redirect_method: 'clipboard',
      fail_reason: 'clipboard_unavailable',
    })
    expect(p.anon_cid).toBeUndefined() // trackEvent 중앙 로직이 붙인다(F19)
  })

  it('이벤트명은 rate-limit 면제 목록과 계속 일치한다', () => {
    const route = readFileSync(resolve(__dirname, '../app/api/events/route.ts'), 'utf-8')
    const line = route.split('\n').find(l => l.includes('const CONVERSION_EVENTS')) ?? ''
    for (const name of Object.values(INAPP_REDIRECT_EVENTS)) expect(line).toContain(`'${name}'`)
  })
})

describe('F19·노출 정책 무변경', () => {
  it('F19 anon_cid 로직을 건드리지 않았다', () => {
    expect(banner).not.toContain('anon-cid')
    expect(banner).not.toContain('getOrCreateAnonCid')
  })

  it('노출 정책 상수가 그대로다 (트리거·횟수는 이번 범위가 아니다)', () => {
    expect(banner).toContain('const MAX_SHOWS = 4')
    expect(banner).toContain('const READ_COMPLETE_SCROLL = 0.85')
    expect(banner).toContain('const BACKSTOP_MS = 60_000')
  })

  it('signup_banner_dismissed는 handleDismiss에서만 발화한다', () => {
    const idx = banner.indexOf('const handleDismiss')
    const chunk = banner.slice(idx, idx + 600)
    expect(chunk).toContain("trackEvent('signup_banner_dismissed'")
    // 다른 곳에서 dismissed를 쏘지 않는다
    expect(banner.match(/trackEvent\('signup_banner_dismissed'/g)?.length).toBe(1)
  })
})
