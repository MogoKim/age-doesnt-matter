/**
 * 카카오톡 공유하기 유틸리티 (클라이언트 전용)
 * Kakao SDK는 공유 버튼이 있는 컴포넌트가 마운트 시 preloadKakaoSdk()로 미리 로드/초기화합니다.
 * (전역 layout 마운트 없음 — 공유 화면에서만 온디맨드 로드)
 * 클릭 시점에 isInitialized() 확인 후 sendDefault()를 동기적으로 즉시 호출합니다.
 * await 대기 후 sendDefault()를 호출하면 iOS Safari에서 user gesture가 소실됩니다.
 */

import { logKakaoShareDebug, getKakaoRuntimeSnapshot } from '@/lib/kakao-share-debug'

declare global {
  interface Window {
    Kakao?: {
      init: (key: string) => void
      isInitialized: () => boolean
      Share: {
        sendDefault: (options: KakaoShareOptions) => void
      }
    }
    __KAKAO_SHARE_DIAG__?: {
      scriptMountedAt?: string
      scriptReadyAt?: string
      scriptLoadAt?: string
      scriptErrorAt?: string
      keyPresent?: boolean
      keyLength?: number
      hasKakaoAfterLoad?: boolean
      initializedBeforeInit?: boolean | null
      initializedAfterInit?: boolean | null
      hasShareAfterInit?: boolean
      initErrorName?: string
      initErrorMessage?: string
      lastWaitTimeoutAt?: string
    }
  }
}

interface KakaoShareOptions {
  objectType: 'feed'
  content: {
    title: string
    description: string
    imageUrl: string
    link: {
      mobileWebUrl: string
      webUrl: string
    }
  }
  buttons?: Array<{
    title: string
    link: {
      mobileWebUrl: string
      webUrl: string
    }
  }>
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'

/** SDK 미준비/로드 실패 시 링크 복사로 대체됐음을 알리는 에러 */
export class KakaoUnavailableError extends Error {
  readonly copiedUrl: string
  readonly reason: 'notReadyAtClick' | 'sendDefaultThrow' | 'unknown'
  constructor(url: string, reason: 'notReadyAtClick' | 'sendDefaultThrow' | 'unknown' = 'unknown') {
    super('KAKAO_UNAVAILABLE')
    this.copiedUrl = url
    this.reason = reason
  }
}

async function copyToClipboard(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url)
    return true
  } catch {
    return false
  }
}

interface SharePostParams {
  title: string
  description: string
  imageUrl?: string
  url: string
}

export async function shareToKakao(params: SharePostParams): Promise<void> {
  const fullUrl = params.url.startsWith('http') ? params.url : `${APP_URL}${params.url}`
  const startTs = Date.now()

  if (typeof window === 'undefined') {
    throw new KakaoUnavailableError(fullUrl, 'unknown')
  }

  // 동기 SDK 상태 확인 — sendDefault() 전 어떤 await도 없어야 함 (iOS user gesture 보존)
  const kakao = window.Kakao
  const hasKakao = Boolean(kakao)
  let initialized = false
  try {
    initialized = Boolean(kakao?.isInitialized?.())
  } catch {
    initialized = false
  }
  const hasSendDefault = typeof kakao?.Share?.sendDefault === 'function'
  const ready = hasKakao && initialized && hasSendDefault

  if (!ready) {
    // SDK 미준비 상태에서는 기다리지 않고 즉시 fallback
    // (await 이후 sendDefault 호출 시 iOS에서 user gesture 소실)
    const sdkEl = document.getElementById('kakao-js-sdk') as HTMLScriptElement | null
    logKakaoShareDebug('SDK_NOT_READY_AT_CLICK', {
      hasKakao,
      initialized,
      hasSendDefault,
      diag: window.__KAKAO_SHARE_DIAG__ ?? null,
      scriptEl: sdkEl
        ? {
            id: sdkEl.id,
            src: sdkEl.src,
            integrity: sdkEl.getAttribute('integrity') ?? null,
            crossOrigin: sdkEl.getAttribute('crossorigin') ?? null,
          }
        : null,
      readyState: document.readyState,
      href: window.location.href,
      elapsed: Date.now() - startTs,
    })
    console.error('[kakao-share] SDK_NOT_READY_AT_CLICK', { hasKakao, initialized, hasSendDefault })
    logKakaoShareDebug('FALLBACK_COPY_START', { reason: 'notReadyAtClick', fullUrl })
    const copied = await copyToClipboard(fullUrl)
    logKakaoShareDebug(copied ? 'FALLBACK_COPY_OK' : 'FALLBACK_COPY_FAILED', { reason: 'notReadyAtClick', fullUrl })
    throw new KakaoUnavailableError(fullUrl, 'notReadyAtClick')
  }

  // SDK 준비 완료 — sendDefault()를 동기적으로 즉시 호출 (이 아래에 await 없음)
  const elapsedBeforeSend = Date.now() - startTs
  const snapshot = getKakaoRuntimeSnapshot()
  // sendDefault() 호출 직전에 localStorage 기록 — 페이지 이탈 시에도 보존됨
  logKakaoShareDebug('SEND_DEFAULT_START', {
    snapshot,
    href: window.location.href,
    fullUrl,
    readyState: document.readyState,
    visibilityState: document.visibilityState,
    elapsed: elapsedBeforeSend,
  })
  console.info('[kakao-share] SEND_DEFAULT_START', {
    initialized: true,
    host: window.location.host,
    path: window.location.pathname,
  })

  try {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    kakao!.Share.sendDefault({
      objectType: 'feed',
      content: {
        title: params.title,
        description: params.description,
        imageUrl: params.imageUrl || `${APP_URL}/og-image.png`,
        link: {
          mobileWebUrl: fullUrl,
          webUrl: fullUrl,
        },
      },
      buttons: [
        {
          title: '자세히 보기',
          link: {
            mobileWebUrl: fullUrl,
            webUrl: fullUrl,
          },
        },
      ],
    })
    logKakaoShareDebug('SEND_DEFAULT_RETURNED', { elapsed: Date.now() - startTs })
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    const throwPayload = {
      name: err.name,
      message: err.message,
      stack: err.stack ?? null,
      elapsed: Date.now() - startTs,
    }
    logKakaoShareDebug('SEND_DEFAULT_THROW', throwPayload)
    console.error('[kakao-share] SEND_DEFAULT_FAILED', throwPayload)
    logKakaoShareDebug('FALLBACK_COPY_START', { reason: 'sendDefaultThrow', fullUrl })
    const copied = await copyToClipboard(fullUrl)
    logKakaoShareDebug(copied ? 'FALLBACK_COPY_OK' : 'FALLBACK_COPY_FAILED', { reason: 'sendDefaultThrow', fullUrl })
    throw new KakaoUnavailableError(fullUrl, 'sendDefaultThrow')
  }
}

export async function copyShareLink(url: string): Promise<boolean> {
  try {
    const fullUrl = `${APP_URL}${url}`
    await navigator.clipboard.writeText(fullUrl)
    return true
  } catch {
    return false
  }
}

// ── 카카오 SDK 온디맨드 프리로드 ──────────────────────────────────────────
// 전역 layout 마운트(KakaoSdkScript) 대신, 공유 버튼이 있는 컴포넌트가 마운트 시
// preloadKakaoSdk()를 호출해 미리 로드/초기화한다. 클릭 시점에는 shareToKakao()가
// 동기 isInitialized() 확인 후 즉시 sendDefault()를 호출하므로 iOS user gesture가
// 보존된다(클릭 후 await 로드 금지). 미준비 시 기존 링크 복사 fallback 동작.

const KAKAO_SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js'
let kakaoSdkLoadStarted = false

function initKakaoIfNeeded(): void {
  const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY
  if (!key) return
  const kakao = window.Kakao
  if (!kakao) return
  try {
    if (!kakao.isInitialized()) kakao.init(key)
  } catch {
    // init 실패는 무시 — 클릭 시 미준비로 판단되어 링크 복사 fallback
  }
}

/** 공유 버튼이 있는 컴포넌트가 마운트 시 호출 — 클릭 전에 SDK를 미리 로드/초기화 */
export function preloadKakaoSdk(): void {
  if (typeof window === 'undefined') return
  try {
    if (window.Kakao?.isInitialized?.()) return
  } catch {
    /* ignore */
  }
  if (kakaoSdkLoadStarted) return
  // 이미 스크립트 태그가 있으면(중복 방지) 초기화만 시도
  if (document.getElementById('kakao-js-sdk')) {
    initKakaoIfNeeded()
    return
  }
  kakaoSdkLoadStarted = true
  const script = document.createElement('script')
  script.id = 'kakao-js-sdk'
  script.src = KAKAO_SDK_URL
  script.async = true
  script.crossOrigin = 'anonymous'
  script.onload = initKakaoIfNeeded
  script.onerror = () => {
    // 로드 실패 시 재시도 가능하도록 플래그 리셋 + 실패한 태그 제거.
    // (클릭 시 shareToKakao는 미준비로 판단 → 링크 복사 fallback)
    kakaoSdkLoadStarted = false
    script.remove()
  }
  document.head.appendChild(script)
}

/**
 * 게시글 카카오 공유 유입 추적용 URL 생성 — utm 부착.
 * - pathname: window.location.pathname(쿼리 없는 경로, 브라우저가 이미 인코딩)
 * - URLSearchParams로 안전 구성. 상세 페이지는 canonical이 깨끗한 URL을 가리키므로 SEO 중복 없음.
 * - 반환은 상대경로(+쿼리). shareToKakao가 APP_URL을 붙임.
 */
export function buildPostShareUrl(pathname: string, postId: string): string {
  const params = new URLSearchParams({
    utm_source: 'post_share',
    utm_medium: 'kakao_share',
    utm_content: postId,
  })
  return `${pathname}?${params.toString()}`
}
