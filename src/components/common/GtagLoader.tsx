'use client'

import { useEffect } from 'react'
import { markGtagReady } from '@/lib/gtm'

const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID
const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? 'AW-18086681147'
const GTAG_SCRIPT_ID = 'unao-gtag-js'
const INTERACTION_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const
const BACKSTOP_MS = 4000

declare global {
  interface Window {
    __unaoGtagStarted?: boolean
    __unaoGtagLoaded?: boolean
    /** gtm.ts(waitForGtagReady)가 전환 이벤트 직전 gtag 로드를 능동 시작시키는 hook */
    __unaoEnsureGtag?: () => void
  }
}

/**
 * gtag(GA4 + Google Ads) 지연 로더.
 *
 * 이전: gtag-init(afterInteractive 인라인) + gtag/js(afterInteractive) → hydration 직후
 *   GA4 66KB + Ads 55KB가 전 페이지 초기 메인스레드/네트워크 점유.
 * 변경: 3개 트리거(첫 상호작용 / requestIdleCallback / 4초 백스톱) 중 먼저 오는 시점에 1회 로드.
 *   gtag-init 로직(dataLayer→stub→js→config)을 여기서 실행 후 외부 gtag/js 삽입.
 * 이벤트 유실 방어: gtm.ts의 _eventQueue가 로드 전 이벤트 보존 → onload markGtagReady()로 플러시.
 *   전환(sign_up 등)은 waitForGtagReady()가 window.__unaoEnsureGtag로 로드를 능동 시작.
 */
function loadGtagOnce(): void {
  if (!GA4_ID) return
  if (window.__unaoGtagStarted) return
  window.__unaoGtagStarted = true

  // ── gtag 초기화 순서 (엄격) ──
  // 1) dataLayer  2) gtag stub  3) js  4) GA4 config  5) Ads config
  window.dataLayer = window.dataLayer || []
  // gtag.js가 인식하도록 arguments 객체를 그대로 push (화살표/spread 금지)
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments as unknown as Record<string, unknown>)
  }
  window.gtag('js', new Date())
  window.gtag('config', GA4_ID, { send_page_view: false })
  window.gtag('config', GOOGLE_ADS_ID)

  // 6) external gtag/js 삽입
  const script = document.createElement('script')
  script.id = GTAG_SCRIPT_ID
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`
  // 7) onload → markGtagReady (큐 플러시)
  script.addEventListener('load', () => {
    window.__unaoGtagLoaded = true
    markGtagReady()
  }, { once: true })
  // 실패 시: ready 처리 금지, 플래그 리셋, script 제거, 큐 유지 → 재시도 가능
  script.addEventListener('error', () => {
    window.__unaoGtagStarted = false
    window.__unaoGtagLoaded = false
    script.remove()
  }, { once: true })
  document.head.appendChild(script)
}

export default function GtagLoader() {
  useEffect(() => {
    if (!GA4_ID) return

    // 전환 이벤트(sign_up/login)가 트리거를 기다리지 않고 로드를 시작할 수 있도록 hook 등록
    window.__unaoEnsureGtag = loadGtagOnce

    // 트리거 ①: 첫 사용자 상호작용
    const onInteract = () => loadGtagOnce()
    INTERACTION_EVENTS.forEach((e) =>
      window.addEventListener(e, onInteract, { once: true, passive: true }),
    )

    // 트리거 ②: idle
    let idleId: number | undefined
    if ('requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(() => loadGtagOnce())
    }

    // 트리거 ③: 백스톱 타이머 (무상호작용·무idle 세션 보장)
    const timerId = window.setTimeout(loadGtagOnce, BACKSTOP_MS)

    return () => {
      INTERACTION_EVENTS.forEach((e) => window.removeEventListener(e, onInteract))
      if (idleId !== undefined && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId)
      }
      window.clearTimeout(timerId)
    }
  }, [])

  return null
}
