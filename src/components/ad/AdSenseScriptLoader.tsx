'use client'

import { useEffect } from 'react'
import { ADSENSE } from './ad-slots'

const ADSENSE_SCRIPT_ID = 'unao-adsbygoogle-script'
export const ADSENSE_READY_EVENT = 'unao:adsense-ready'

const INTERACTION_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const
const IDLE_AFTER_LOAD_MS = 4000
const BACKSTOP_MS = 8000

/**
 * 입력 요소 선택자 — 댓글·검색·닉네임/비밀번호처럼 고객이 글자를 치는 지점.
 * GtagLoader와 동일한 목록을 쓴다(두 로더의 트리거 정책 일치).
 * button은 넣지 않는다 — 로그인·가입 CTA·글쓰기 FAB·공감·정렬처럼 글자를 치는 게 아니라
 * 탐색/전환 액션이라, 제외하면 광고·분석 로딩이 불필요하게 늦어진다.
 */
const EDITABLE_SELECTOR = [
  'textarea',
  'input',
  'select',
  '[contenteditable]',
  '[contenteditable="true"]',
  '[role="textbox"]',
  '[aria-multiline="true"]',
].join(',')

/**
 * 입력 이벤트는 고객이 글자를 치는 순간이므로 첫 광고 로딩 트리거에서 제외한다.
 * 로딩을 막는 게 아니라 미루는 것 — idle/backstop이 노출을 보장한다.
 */
function isFromEditable(event: Event): boolean {
  const target = event.target
  if (!(target instanceof Element)) return false
  return target.closest(EDITABLE_SELECTOR) !== null
}

type AdSenseWindow = Window & {
  adsbygoogle?: Record<string, unknown>[]
  __unaoAdsenseLoaded?: boolean
  __unaoAdsenseStarted?: boolean
}

/**
 * AdSense 스크립트 지연 로더 (perf 1차, 2026-07-12).
 *
 * 이전: 마운트 useEffect에서 즉시 adsbygoogle.js 주입 → 157KB + 연쇄(doubleclick·
 *   fundingchoices 220KB 등)가 첫 로드 크리티컬 윈도에서 메인스레드/네트워크 점유.
 *   실측(홈 모바일 cold, 4G+CPU4x): 광고 계열 차단 시 TBT 249→39ms, 3rd-party 2.0MB→61KB.
 * 변경: GtagLoader와 동일한 3개 트리거(첫 상호작용 / requestIdleCallback / 4초 백스톱) 중
 *   먼저 오는 시점에 1회 로드. **제거가 아니라 지연** — 슬롯 컴포넌트는 기존처럼
 *   ADSENSE_READY_EVENT / __unaoAdsenseLoaded 로 준비 시점을 감지하므로 무변경 호환.
 */
function loadAdSenseOnce(): void {
  const win = window as AdSenseWindow
  if (win.__unaoAdsenseStarted) return
  win.__unaoAdsenseStarted = true

  const src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE.CLIENT_ID}`
  win.adsbygoogle = win.adsbygoogle || []

  const notifyReady = () => {
    win.__unaoAdsenseLoaded = true
    window.dispatchEvent(new Event(ADSENSE_READY_EVENT))
  }

  if (win.__unaoAdsenseLoaded) {
    notifyReady()
    return
  }

  const existingScript = (
    document.getElementById(ADSENSE_SCRIPT_ID) ??
    document.querySelector(`script[src="${src}"]`)
  ) as HTMLScriptElement | null

  if (existingScript) {
    existingScript.addEventListener('load', notifyReady, { once: true })
    return
  }

  const script = document.createElement('script')
  script.id = ADSENSE_SCRIPT_ID
  script.async = true
  script.src = src
  script.crossOrigin = 'anonymous'
  script.addEventListener('load', notifyReady, { once: true })
  // 실패 시 재시도 가능하도록 시작 플래그 리셋 (GtagLoader와 동일 패턴)
  script.addEventListener('error', () => {
    win.__unaoAdsenseStarted = false
    script.remove()
  }, { once: true })
  document.head.appendChild(script)
}

export default function AdSenseScriptLoader() {
  useEffect(() => {
    // Capacitor 네이티브 앱(iOS/Android shell)에서만 AdSense 스크립트를 차단한다.
    //   → 앱 내 WebView AdSense 게재는 정책 위반 위험(계정 보호). 웹/TWA(Chrome)는 정상 로드.
    //   판정 기준: window.Capacitor 존재 여부가 아니라 isNativePlatform()===true.
    //   (일부 웹 환경에서 window.Capacitor가 주입될 수 있으나 isNativePlatform()=false → 웹에선 로드돼야 함)
    const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    if (cap?.isNativePlatform?.() === true) return

    // 트리거 ①: 첫 사용자 상호작용 (읽기·탐색 행위)
    // 입력 요소에서 시작된 이벤트는 건너뛴다 — once 대신 직접 해제하므로, 입력 탭을
    // 흘려보낸 뒤에도 리스너가 살아 있어 이후 읽기·탐색 상호작용에서 기존처럼 즉시 로드된다.
    const onInteract = (event: Event) => {
      if (isFromEditable(event)) return
      INTERACTION_EVENTS.forEach((e) => window.removeEventListener(e, onInteract))
      loadAdSenseOnce()
    }
    INTERACTION_EVENTS.forEach((e) =>
      window.addEventListener(e, onInteract, { passive: true }),
    )

    // 트리거 ②: load 이후 idle (첫 화면 렌더와 경쟁하지 않게 후행)
    let idleId: number | undefined
    let fallbackIdleTimerId: ReturnType<typeof setTimeout> | undefined
    const scheduleIdle = () => {
      if ('requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(() => loadAdSenseOnce(), { timeout: 3000 })
      } else {
        fallbackIdleTimerId = setTimeout(loadAdSenseOnce, 3000)
      }
    }
    const scheduleAfterLoad = () => {
      fallbackIdleTimerId = setTimeout(scheduleIdle, IDLE_AFTER_LOAD_MS)
    }
    if (document.readyState === 'complete') {
      scheduleAfterLoad()
    } else {
      window.addEventListener('load', scheduleAfterLoad, { once: true })
    }

    // 트리거 ③: 백스톱 타이머 (무상호작용·무idle 세션에도 광고 노출 보장 — 제거 아님)
    const timerId = window.setTimeout(loadAdSenseOnce, BACKSTOP_MS)

    return () => {
      INTERACTION_EVENTS.forEach((e) => window.removeEventListener(e, onInteract))
      window.removeEventListener('load', scheduleAfterLoad)
      if (idleId !== undefined && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId)
      }
      if (fallbackIdleTimerId !== undefined) clearTimeout(fallbackIdleTimerId)
      window.clearTimeout(timerId)
    }
  }, [])

  return null
}
